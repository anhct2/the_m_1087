-- ============================================================
-- Migration: enroll <-> gate log sync + manual assignment log
-- Date      : 2026-07-01
-- Author    : Claude (enroll revamp task)
--
-- NOTE: this file is NOT applied automatically. Review and run it
-- by hand (psql -f ...) against the target DB, then re-run
-- dump_schema.py to refresh shared/db/schema.sql.
--
-- Everything below is additive (CREATE ... IF NOT EXISTS / CREATE OR
-- REPLACE VIEW) and safe to run multiple times.
-- ============================================================


-- 1) Audit log for manual room/person assignment.
--    Written by /api/enroll/gate-sessions/{door_id}/assign (used from
--    both the Enroll session detail screen and the new "Gán phòng"
--    button on Gate Log incoming sessions).
CREATE TABLE IF NOT EXISTS enroll.manual_assignments (
    id                 BIGSERIAL PRIMARY KEY,
    door_id            TEXT NOT NULL,
    direction          TEXT NOT NULL,
    enroll_session_id  UUID REFERENCES enroll.enroll_sessions(id) ON DELETE SET NULL,
    person_id          UUID NOT NULL REFERENCES enroll.person_profiles(id) ON DELETE CASCADE,
    room_label         TEXT,
    source             TEXT NOT NULL DEFAULT 'enroll',   -- 'enroll' | 'gate_log'
    assigned_by        TEXT,
    assigned_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manual_assignments_door   ON enroll.manual_assignments (door_id, direction);
CREATE INDEX IF NOT EXISTS idx_manual_assignments_person ON enroll.manual_assignments (person_id, assigned_at DESC);


-- 2) enroll.duplicate_dismissals — referenced by services/api/app/routers/enroll.py
--    (list_duplicates / dismiss_duplicate) but missing from the last schema dump.
--    If it already exists in prod with the same shape this is a no-op.
CREATE TABLE IF NOT EXISTS enroll.duplicate_dismissals (
    profile_id_a UUID NOT NULL,
    profile_id_b UUID NOT NULL,
    dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id_a, profile_id_b)
);


-- 3) Fix enroll.v_sessions: it was joining the legacy `gate_sessions` (v1)
--    view instead of `gate_sessions_v2`. v1 groups a door session as a
--    single door_state event matched to one unlock event in a fixed
--    +-5..15s window; v2 groups consecutive door_state events (<=10s gap)
--    into ONE session before matching. Because gate_session_clips /
--    gate_sessions_v2 is what worker-mapper and Gate Log both use, joining
--    against v1 here could show a different user_name/method than what
--    Gate Log shows for the same door_id.
--
--    IMPORTANT: Postgres' CREATE OR REPLACE VIEW forbids renaming/reordering
--    existing output columns (only appending new ones at the END is
--    allowed) — hence door_id/unlock_id are appended last here rather than
--    placed next to job_id, to keep the existing column order/names intact
--    for any other code still selecting from this view positionally.
CREATE OR REPLACE VIEW enroll.v_sessions AS
SELECT es.id,
       es.job_id,
       es.room_label,
       es.event_time_vn,
       es.status,
       es.direction,
       es.person_count,
       es.persons_enrolled,
       es.recognized_person_id,
       es.recognition_sim,
       es.overall_quality,
       es.best_face_score,
       es.stopped_at_cam,
       es.used_video,
       es.total_ms,
       es.error_msg,
       es.warnings,
       es.created_at,
       gs.user_name,
       gs.method,
       pp.display_name AS recognized_name,
       pp.known_room   AS recognized_room,
       pp.gender       AS recognized_gender,
       pp.face_source_cam AS recognized_face_cam,
       ( SELECT ccr2.frigate_event_id
           FROM enroll.person_session_map psm2
           JOIN enroll.camera_clip_results ccr2 ON ccr2.enroll_session_id = psm2.enroll_session_id
          WHERE psm2.person_id = pp.id AND ccr2.frigate_event_id IS NOT NULL
          ORDER BY ccr2.stopped_here DESC, ccr2.confidence DESC NULLS LAST
         LIMIT 1) AS recognized_face_event_id,
       es.door_id,
       es.unlock_id
FROM enroll.enroll_sessions es
LEFT JOIN gate_sessions_v2 gs ON gs.door_id::text = es.door_id AND gs.direction = es.direction
LEFT JOIN enroll.person_profiles pp ON pp.id = es.recognized_person_id;


-- 4) New view: unified Gate Log <-> Enroll session mapping.
--    Anchored on gate_session_clips (is_best_match = TRUE), which is the
--    EXACT same base row set that GateLog's GET /api/sessions counts and
--    lists (session_id = gate_sessions_v2.door_id). Enroll's new
--    "Sessions" screen (GET /api/enroll/gate-sessions) queries this view,
--    so with identical filters (direction/room/user_name) it returns the
--    exact same total as Gate Log — a guaranteed 1:1 mapping, not a
--    best-effort approximation. Rows with no enroll_sessions/job_queue
--    entry yet show effective_status='not_queued' and can still be
--    manually assigned (creates enroll_sessions on demand).
CREATE OR REPLACE VIEW enroll.v_gate_sessions AS
SELECT
    b.session_id::text                 AS door_id,
    b.unlock_id::text                  AS gate_unlock_id,
    b.event_time_vn,
    b.direction,
    b.label                            AS room_label,
    b.user_name                        AS gate_user_name,
    b.method                           AS gate_method,
    b.frigate_event_id                 AS snap_event_id,
    b.match_score,
    es.id                              AS enroll_session_id,
    es.job_id,
    es.unlock_id                       AS enroll_unlock_id,
    es.status                          AS enroll_status,
    es.person_count,
    es.persons_enrolled,
    es.recognized_person_id,
    es.recognition_sim,
    es.overall_quality,
    es.best_face_score,
    es.stopped_at_cam,
    es.used_video,
    es.total_ms,
    es.error_msg,
    es.warnings,
    es.created_at                      AS enroll_created_at,
    pp.display_name                    AS recognized_name,
    pp.known_room                      AS recognized_room,
    pp.gender                          AS recognized_gender,
    jq.id                              AS pending_job_id,
    jq.status                          AS job_status,
    CASE
        WHEN es.id IS NOT NULL THEN es.status
        WHEN jq.id IS NOT NULL THEN 'queued'
        ELSE 'not_queued'
    END AS effective_status
FROM gate_session_clips b
LEFT JOIN enroll.enroll_sessions es
       ON es.door_id = b.session_id::text AND es.direction = b.direction
LEFT JOIN enroll.person_profiles pp ON pp.id = es.recognized_person_id
LEFT JOIN enroll.job_queue jq
       ON jq.door_id = b.session_id::text AND jq.direction = b.direction AND es.id IS NULL
WHERE b.is_best_match = TRUE;


-- 5) OPTIONAL / recommended, not required by the API code above (which
--    does a check-then-insert instead of relying on ON CONFLICT so it
--    works whether or not this exists): dedup guard for enroll_sessions.
--    Add only if you've confirmed there are no existing duplicate
--    (door_id, direction) rows — check first with:
--      SELECT door_id, direction, COUNT(*) FROM enroll.enroll_sessions
--      GROUP BY 1,2 HAVING COUNT(*) > 1;
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_enroll_sessions_door_direction
--     ON enroll.enroll_sessions (door_id, direction);
