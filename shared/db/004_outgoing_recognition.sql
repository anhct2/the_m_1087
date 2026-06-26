-- ============================================================
-- Migration 004: Outgoing Recognition Support
-- Cho phép worker nhận diện người RA cổng và đóng room_stay
-- Run: psql -d m1087 -f 004_outgoing_recognition.sql
-- ============================================================

-- 1. Thêm direction vào job_queue
ALTER TABLE enroll.job_queue
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'incoming'
        CHECK (direction IN ('incoming', 'outgoing'));

-- 2. Cập nhật unique constraint để cho phép cùng unlock_id có 2 job (in + out)
ALTER TABLE enroll.job_queue DROP CONSTRAINT IF EXISTS uq_jq_gate;
ALTER TABLE enroll.job_queue ADD CONSTRAINT uq_jq_gate UNIQUE (door_id, unlock_id, direction);

-- 3. Thêm direction vào enroll_sessions
ALTER TABLE enroll.enroll_sessions
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'incoming'
        CHECK (direction IN ('incoming', 'outgoing'));

-- 4. Thêm cột kết quả nhận diện cho outgoing
ALTER TABLE enroll.enroll_sessions
    ADD COLUMN IF NOT EXISTS recognized_person_id UUID REFERENCES enroll.person_profiles(id);
ALTER TABLE enroll.enroll_sessions
    ADD COLUMN IF NOT EXISTS recognition_sim FLOAT;

-- 5. Cập nhật unique constraint enroll_sessions
ALTER TABLE enroll.enroll_sessions DROP CONSTRAINT IF EXISTS uq_es_gate;
ALTER TABLE enroll.enroll_sessions ADD CONSTRAINT uq_es_gate UNIQUE (door_id, unlock_id, direction);

-- 6. Rebuild v_sessions view với các cột mới
DROP VIEW IF EXISTS enroll.v_sessions CASCADE;
CREATE VIEW enroll.v_sessions AS
SELECT
    es.id, es.job_id, es.room_label, es.event_time_vn,
    es.status, es.direction,
    es.person_count, es.persons_enrolled,
    es.recognized_person_id, es.recognition_sim,
    es.overall_quality, es.best_face_score,
    es.stopped_at_cam, es.used_video,
    es.total_ms, es.error_msg, es.warnings, es.created_at,
    gs.user_name, gs.method,
    pp.display_name     AS recognized_name,
    pp.known_room       AS recognized_room,
    pp.gender           AS recognized_gender,
    pp.face_source_cam  AS recognized_face_cam,
    (SELECT ccr2.frigate_event_id
     FROM enroll.person_session_map psm2
     JOIN enroll.camera_clip_results ccr2 ON ccr2.enroll_session_id = psm2.enroll_session_id
     WHERE psm2.person_id = pp.id
       AND ccr2.frigate_event_id IS NOT NULL
     ORDER BY ccr2.stopped_here DESC, ccr2.confidence DESC NULLS LAST
     LIMIT 1) AS recognized_face_event_id
FROM enroll.enroll_sessions es
LEFT JOIN gate_sessions gs
    ON gs.door_id::text = es.door_id AND gs.unlock_id::text = es.unlock_id
LEFT JOIN enroll.person_profiles pp
    ON pp.id = es.recognized_person_id;

-- 7. Function đóng room_stay khi người ra cổng
CREATE OR REPLACE FUNCTION enroll.close_room_stay(
    p_person_id      UUID,
    p_exit_ts        TIMESTAMPTZ,
    p_exit_door_id   TEXT    DEFAULT NULL,
    p_exit_unlock_id TEXT    DEFAULT NULL,
    p_exit_conf      TEXT    DEFAULT 'camera_chain'
)
RETURNS INT LANGUAGE sql AS $$
    WITH r AS (
        UPDATE enroll.room_stays SET
            exit_ts          = p_exit_ts,
            exit_door_id     = p_exit_door_id,
            exit_unlock_id   = p_exit_unlock_id,
            exit_confidence  = p_exit_conf
        WHERE person_id = p_person_id
          AND exit_ts IS NULL
        RETURNING id
    ) SELECT COUNT(*)::INT FROM r;
$$;

GRANT EXECUTE ON FUNCTION enroll.close_room_stay TO m1087;

-- 8. Cập nhật release_stuck để xử lý cả outgoing sessions
CREATE OR REPLACE FUNCTION enroll.release_stuck(p_timeout_min INT DEFAULT 30)
RETURNS INT LANGUAGE sql AS $$
    WITH r AS (
        UPDATE enroll.job_queue SET
            status       = 'pending',
            locked_by    = NULL,
            locked_at    = NULL,
            started_at   = NULL,
            scheduled_at = now() + interval '5 minutes'
        WHERE status    = 'running'
        AND   locked_at < now() - (p_timeout_min * interval '1 minute')
        RETURNING id
    ) SELECT COUNT(*)::INT FROM r;
$$;

SELECT 'Migration 004 OK — ' || NOW()::text AS status;
