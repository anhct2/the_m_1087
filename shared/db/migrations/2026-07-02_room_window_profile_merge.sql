-- ============================================================
-- Migration: room window (cửa sổ phòng) + auto profile merge
-- Date      : 2026-07-02
-- Author    : Claude (enroll job review task)
--
-- NOTE: this file is NOT applied automatically. Review and run it
-- by hand (psql -f ...) against the target DB, then re-run
-- dump_schema.py to refresh shared/db/schema.sql.
--
-- Code that DEPENDS on this migration (deploy after applying):
--   * services/api/app/routers/enroll.py
--       - GET  /api/enroll/stays/by-gate        (enroll.v_room_day_gate)
--       - GET  /api/enroll/stays/by-profile     (enroll.v_room_day_profiles)
--       - POST /api/enroll/merge-room-profiles  (enroll.merge_room_profiles)
--       - POST /api/enroll/profiles/merge       (enroll.merge_profile_pair)
--       - GET  /api/enroll/room-day-profiles    (enroll.room_window_date)
--   * services/worker-enroll (find_similar_profile + merge job định kỳ)
--
-- Everything below is additive (CREATE ... IF NOT EXISTS / CREATE OR
-- REPLACE) and safe to run multiple times.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) Cửa sổ phòng (room window)
--
-- Quy tắc đặt phòng: một "ngày phòng" D chạy từ 12h01 trưa ngày D
-- đến 11h59 trưa ngày D+1 (giờ VN). Mọi phép map người ↔ phòng theo
-- ngày đều dùng cửa sổ này thay vì ngày lịch: một lượt RA lúc 09:00
-- sáng ngày D+1 vẫn thuộc cửa sổ phòng của ngày D (khách vào chiều
-- hôm trước).
--
-- room_window_date(ts) trả về ngày D của cửa sổ chứa ts:
--   [D 12:00 VN, D+1 12:00 VN) → D
-- (AT TIME ZONE với zone hằng số là immutable → dùng được trong index
--  biểu thức nếu sau này cần.)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enroll.room_window_date(p_ts timestamptz)
RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
    SELECT ((p_ts AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '12 hours')::date;
$$;


-- ────────────────────────────────────────────────────────────
-- 2) Audit log cho mọi lần gộp profile (tay lẫn tự động)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enroll.profile_merge_log (
    id          BIGSERIAL PRIMARY KEY,
    primary_id  UUID NOT NULL,
    merged_id   UUID NOT NULL,
    room_label  TEXT,
    similarity  DOUBLE PRECISION,
    reason      TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'auto_room_window'
    merged_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pml_primary ON enroll.profile_merge_log (primary_id, merged_at DESC);


-- ────────────────────────────────────────────────────────────
-- 3) Gộp MỘT cặp profile — logic chuẩn dùng chung.
--
-- Trước đây logic này nằm trong POST /api/enroll/profiles/merge
-- (Python). Đưa xuống DB để job tự động (worker) và API dùng chung
-- một đường code, tránh lệch nhau:
--   - chuyển person_session_map, room_stays, enroll_sessions
--     .recognized_person_id, manual_assignments sang primary
--   - deactivate profile bị gộp, cập nhật enroll_count / first / last
--   - ghi audit vào profile_merge_log
-- Trả về true nếu thực sự gộp (cả hai đang active, khác nhau).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enroll.merge_profile_pair(
    p_primary uuid,
    p_dup     uuid,
    p_sim     double precision DEFAULT NULL,
    p_reason  text DEFAULT 'manual'
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    v_room text;
BEGIN
    IF p_primary IS NULL OR p_dup IS NULL OR p_primary = p_dup THEN
        RETURN false;
    END IF;
    PERFORM 1 FROM enroll.person_profiles WHERE id = p_primary AND is_active;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT known_room INTO v_room
    FROM enroll.person_profiles WHERE id = p_dup AND is_active;
    IF NOT FOUND THEN RETURN false; END IF;

    INSERT INTO enroll.person_session_map (person_id, enroll_session_id, is_new, merge_sim)
    SELECT p_primary, enroll_session_id, is_new, merge_sim
    FROM enroll.person_session_map
    WHERE person_id = p_dup
    ON CONFLICT (person_id, enroll_session_id) DO NOTHING;
    DELETE FROM enroll.person_session_map WHERE person_id = p_dup;

    UPDATE enroll.room_stays         SET person_id = p_primary WHERE person_id = p_dup;
    UPDATE enroll.enroll_sessions    SET recognized_person_id = p_primary
                                     WHERE recognized_person_id = p_dup;
    UPDATE enroll.manual_assignments SET person_id = p_primary WHERE person_id = p_dup;

    UPDATE enroll.person_profiles SET is_active = false, updated_at = now()
    WHERE id = p_dup;

    UPDATE enroll.person_profiles pp SET
        enroll_count  = (SELECT COUNT(*) FROM enroll.person_session_map
                         WHERE person_id = p_primary),
        first_seen_ts = LEAST(pp.first_seen_ts, d.first_seen_ts),
        last_seen_ts  = GREATEST(pp.last_seen_ts, d.last_seen_ts),
        updated_at    = now()
    FROM enroll.person_profiles d
    WHERE pp.id = p_primary AND d.id = p_dup;

    INSERT INTO enroll.profile_merge_log (primary_id, merged_id, room_label, similarity, reason)
    VALUES (p_primary, p_dup, v_room, p_sim, p_reason);

    RETURN true;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 4) JOB gộp profile theo PHÒNG + CỤM CỬA SỔ THỜI GIAN.
--
-- Mục đích: một người ở một phòng nhiều ngày sẽ bị enroll thành
-- nhiều profile (mỗi lượt vào một lần). Job này gộp chúng lại:
--
--   * Chỉ so các profile CÙNG PHÒNG (theo room_label của các phiên
--     enroll — kể cả phiên được gán tay, vì gán tay cũng ghi vào
--     person_session_map / recognized_person_id).
--   * "Cụm thời gian" = khoảng cửa sổ phòng [w_min..w_max] mà profile
--     xuất hiện. Hai profile được coi là cùng cụm khi khoảng của chúng
--     GIAO nhau hoặc kề nhau (gap ≤ 1 cửa sổ) → khách ở dài ngày.
--     Cùng cụm chỉ cần similarity ≥ p_sim_same.
--   * Khác cụm (gap > 1 cửa sổ) → phòng có thể ĐÃ ĐỔI KHÁCH — chỉ gộp
--     khi similarity RẤT cao (p_sim_cross), tránh gộp nhầm hai khách
--     khác nhau của cùng một phòng ở hai tuần khác nhau.
--   * Tôn trọng duplicate_dismissals (cặp đã được đánh dấu
--     "không phải trùng" sẽ không bao giờ tự gộp).
--   * Primary = profile có enroll_count cao hơn (tie: face_quality).
--
-- Chạy bởi: worker-enroll định kỳ, POST /api/enroll/merge-room-profiles,
-- và ngay sau khi gán tay (giới hạn p_room = phòng vừa gán).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enroll.merge_room_profiles(
    p_days      integer          DEFAULT 7,
    p_sim_same  double precision DEFAULT 0.55,
    p_sim_cross double precision DEFAULT 0.78,
    p_room      text             DEFAULT NULL
) RETURNS TABLE (
    primary_id uuid,
    merged_id  uuid,
    room_label text,
    similarity double precision,
    window_gap integer
)
LANGUAGE plpgsql
AS $$
DECLARE
    r         record;
    v_primary uuid;
    v_dup     uuid;
    v_done    uuid[] := '{}';
BEGIN
    FOR r IN
        WITH links AS (
            -- người ↔ phiên: qua person_session_map (incoming/gán tay)
            -- và recognized_person_id (outgoing nhận diện tự động)
            SELECT psm.person_id, psm.enroll_session_id
            FROM enroll.person_session_map psm
            UNION
            SELECT es.recognized_person_id, es.id
            FROM enroll.enroll_sessions es
            WHERE es.recognized_person_id IS NOT NULL
        ), spans AS (
            SELECT l.person_id,
                   es.room_label AS room,
                   MIN(enroll.room_window_date(es.event_time_vn)) AS w_min,
                   MAX(enroll.room_window_date(es.event_time_vn)) AS w_max
            FROM links l
            JOIN enroll.enroll_sessions es ON es.id = l.enroll_session_id
            WHERE es.room_label LIKE 'P.%'
              AND es.event_time_vn >= now() - (p_days || ' days')::interval
              AND (p_room IS NULL OR es.room_label = p_room)
            GROUP BY l.person_id, es.room_label
        ), pairs AS (
            SELECT a.person_id AS id_a,
                   b.person_id AS id_b,
                   a.room,
                   (1 - (pa.face_embedding <=> pb.face_embedding))::double precision AS sim,
                   GREATEST(0, GREATEST(a.w_min, b.w_min) - LEAST(a.w_max, b.w_max))::integer AS gap
            FROM spans a
            JOIN spans b
              ON b.room = a.room AND b.person_id > a.person_id
            JOIN enroll.person_profiles pa
              ON pa.id = a.person_id AND pa.is_active AND pa.face_embedding IS NOT NULL
            JOIN enroll.person_profiles pb
              ON pb.id = b.person_id AND pb.is_active AND pb.face_embedding IS NOT NULL
            WHERE NOT EXISTS (
                SELECT 1 FROM enroll.duplicate_dismissals dd
                WHERE dd.profile_id_a = LEAST(a.person_id, b.person_id)
                  AND dd.profile_id_b = GREATEST(a.person_id, b.person_id)
            )
        )
        SELECT p.id_a, p.id_b, p.room, p.sim, p.gap
        FROM pairs p
        WHERE (p.gap <= 1 AND p.sim >= p_sim_same)   -- cùng cụm: khách ở dài ngày
           OR (p.gap >  1 AND p.sim >= p_sim_cross)  -- khác cụm: phòng có thể đã đổi khách
        ORDER BY p.sim DESC
    LOOP
        CONTINUE WHEN r.id_a = ANY(v_done) OR r.id_b = ANY(v_done);

        SELECT CASE WHEN (pa.enroll_count, COALESCE(pa.face_quality, 0))
                      >= (pb.enroll_count, COALESCE(pb.face_quality, 0))
                    THEN pa.id ELSE pb.id END
        INTO v_primary
        FROM enroll.person_profiles pa, enroll.person_profiles pb
        WHERE pa.id = r.id_a AND pb.id = r.id_b;

        v_dup := CASE WHEN v_primary = r.id_a THEN r.id_b ELSE r.id_a END;

        IF enroll.merge_profile_pair(v_primary, v_dup, r.sim, 'auto_room_window') THEN
            v_done     := v_done || v_dup;
            primary_id := v_primary;
            merged_id  := v_dup;
            room_label := r.room;
            similarity := r.sim;
            window_gap := r.gap;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 5) Màn hình LƯU TRÚ theo GATE LOG: ngày (cửa sổ phòng) → phòng
--    → từng gate log → profile. Bám 1-1 vào v_gate_sessions (chính
--    là tập dữ liệu của Gate Log) nên tổng số lượt luôn khớp.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW enroll.v_room_day_gate AS
SELECT
    enroll.room_window_date(v.event_time_vn) AS window_date,
    v.room_label,
    v.door_id,
    v.direction,
    v.event_time_vn,
    v.gate_user_name,
    v.gate_method,
    v.snap_event_id,
    v.effective_status,
    v.person_count,
    v.persons_enrolled,
    v.enroll_session_id,
    v.recognized_person_id,
    v.recognition_sim,
    v.recognized_name,
    v.recognized_gender
FROM enroll.v_gate_sessions v;


-- ────────────────────────────────────────────────────────────
-- 6) Màn hình LƯU TRÚ theo PROFILE: ngày (cửa sổ phòng) → phòng
--    → profile (kèm số lượt vào/ra trong cửa sổ đó). Đây cũng là
--    nguồn để đếm "phòng đó có mấy người" theo từng ngày phòng.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW enroll.v_room_day_profiles AS
WITH links AS (
    SELECT psm.person_id, psm.enroll_session_id
    FROM enroll.person_session_map psm
    UNION
    SELECT es.recognized_person_id, es.id
    FROM enroll.enroll_sessions es
    WHERE es.recognized_person_id IS NOT NULL
)
SELECT
    enroll.room_window_date(es.event_time_vn) AS window_date,
    es.room_label,
    pp.id AS person_id,
    pp.display_name,
    pp.gender,
    pp.age_estimate,
    pp.confidence_lvl,
    pp.face_quality,
    COUNT(*) FILTER (WHERE es.direction = 'incoming') AS incoming_count,
    COUNT(*) FILTER (WHERE es.direction = 'outgoing') AS outgoing_count,
    MIN(es.event_time_vn) AS first_seen_ts,
    MAX(es.event_time_vn) AS last_seen_ts,
    (SELECT ccr.frigate_event_id
     FROM enroll.person_session_map psm2
     JOIN enroll.camera_clip_results ccr
       ON ccr.enroll_session_id = psm2.enroll_session_id
     WHERE psm2.person_id = pp.id AND ccr.frigate_event_id IS NOT NULL
     ORDER BY ccr.stopped_here DESC, ccr.confidence DESC NULLS LAST
     LIMIT 1) AS face_event_id
FROM links l
JOIN enroll.enroll_sessions es ON es.id = l.enroll_session_id
JOIN enroll.person_profiles pp ON pp.id = l.person_id AND pp.is_active
WHERE es.room_label LIKE 'P.%'
GROUP BY 1, es.room_label, pp.id, pp.display_name, pp.gender,
         pp.age_estimate, pp.confidence_lvl, pp.face_quality;
