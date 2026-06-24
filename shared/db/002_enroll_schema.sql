-- ============================================================
-- Migration: enroll schema
-- File: shared/db/002_enroll_schema.sql
-- Chạy 1 lần trên VPS HK: psql -d m1087 -f 002_enroll_schema.sql
-- Chỉ READ từ: gate_sessions (view), gate_session_clips
-- WRITE vào: enroll.* namespace riêng
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA  IF NOT EXISTS enroll;

-- ============================================================
-- 1. JOB QUEUE
-- Worker trên f87 poll bảng này
-- UNIQUE(door_id, unlock_id) → idempotent enqueue
-- ============================================================
CREATE TABLE IF NOT EXISTS enroll.job_queue (
    id              BIGSERIAL    PRIMARY KEY,
    door_id         TEXT         NOT NULL,
    unlock_id       TEXT         NOT NULL,
    event_time_vn   TIMESTAMPTZ  NOT NULL,
    room_label      TEXT         NOT NULL,

    status          TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','done','failed','skipped')),
    priority        SMALLINT     NOT NULL DEFAULT 5,
    attempt_count   SMALLINT     NOT NULL DEFAULT 0,
    max_attempts    SMALLINT     NOT NULL DEFAULT 3,
    last_error      TEXT,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    scheduled_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    locked_by       TEXT,
    locked_at       TIMESTAMPTZ,
    enroll_session_id UUID,

    CONSTRAINT uq_jq_gate UNIQUE (door_id, unlock_id)
);
CREATE INDEX IF NOT EXISTS idx_jq_poll
    ON enroll.job_queue (status, scheduled_at)
    WHERE status IN ('pending','failed');

-- ============================================================
-- 2. PERSON PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS enroll.person_profiles (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name     TEXT,
    known_room       TEXT,
    confidence_lvl   TEXT        NOT NULL DEFAULT 'unknown'
                     CHECK (confidence_lvl IN (
                         'gate_code','camera_chain','appearance_only','unknown'
                     )),

    -- Face: InsightFace buffalo_l ArcFace R100, 512-dim L2-normalized
    face_embedding   vector(512),
    face_quality     FLOAT,
    face_source_cam  TEXT,
    face_frame_count INT          NOT NULL DEFAULT 0,
    age_estimate     SMALLINT,
    gender           TEXT         CHECK (gender IN ('male','female')),

    -- Appearance: HSV histogram upper/lower body (24+24 dim)
    color_upper      vector(24),
    color_lower      vector(24),
    body_ratio       FLOAT,
    appearance_notes TEXT,

    enroll_count     INT          NOT NULL DEFAULT 1,
    first_seen_ts    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_ts     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    is_active        BOOLEAN      NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_pp_face_ivf
    ON enroll.person_profiles USING ivfflat (face_embedding vector_cosine_ops)
    WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_pp_room
    ON enroll.person_profiles (known_room, last_seen_ts DESC)
    WHERE known_room IS NOT NULL AND is_active;

-- ============================================================
-- 3. ENROLL SESSIONS — audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS enroll.enroll_sessions (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id           BIGINT      REFERENCES enroll.job_queue(id),
    door_id          TEXT        NOT NULL,
    unlock_id        TEXT        NOT NULL,
    event_time_vn    TIMESTAMPTZ NOT NULL,
    room_label       TEXT        NOT NULL,

    status           TEXT        NOT NULL DEFAULT 'processing'
                     CHECK (status IN (
                         'processing','enrolled','low_quality','no_detection','failed'
                     )),
    person_count     SMALLINT    NOT NULL DEFAULT 0,
    persons_enrolled SMALLINT    NOT NULL DEFAULT 0,

    overall_quality  FLOAT,
    best_face_score  FLOAT,
    stopped_at_cam   TEXT,
    used_video       BOOLEAN     NOT NULL DEFAULT false,

    fetch_ms         INT,
    extract_ms       INT,
    total_ms         INT,
    error_msg        TEXT,
    warnings         TEXT[],
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at      TIMESTAMPTZ,

    CONSTRAINT uq_es_gate UNIQUE (door_id, unlock_id)
);
CREATE INDEX IF NOT EXISTS idx_es_room_time
    ON enroll.enroll_sessions (room_label, event_time_vn DESC);
CREATE INDEX IF NOT EXISTS idx_es_status
    ON enroll.enroll_sessions (status, created_at DESC);

-- ============================================================
-- 4. CAMERA CLIP RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS enroll.camera_clip_results (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    enroll_session_id UUID       NOT NULL REFERENCES enroll.enroll_sessions(id),
    camera_id        TEXT        NOT NULL,
    camera_order     SMALLINT    NOT NULL,
    frigate_event_id TEXT,
    gsc_id           INT,
    source_type      TEXT        NOT NULL CHECK (source_type IN ('snapshot','video')),
    frames_processed INT         NOT NULL DEFAULT 0,
    persons_detected SMALLINT    NOT NULL DEFAULT 0,
    confidence       FLOAT,
    face_score       FLOAT,
    color_score      FLOAT,
    stopped_here     BOOLEAN     NOT NULL DEFAULT false,
    has_multi_person BOOLEAN     NOT NULL DEFAULT false,
    has_occlusion    BOOLEAN     NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ccr_session
    ON enroll.camera_clip_results (enroll_session_id, camera_order);

-- ============================================================
-- 5. PERSON ↔ SESSION MAP
-- ============================================================
CREATE TABLE IF NOT EXISTS enroll.person_session_map (
    person_id        UUID        NOT NULL REFERENCES enroll.person_profiles(id),
    enroll_session_id UUID       NOT NULL REFERENCES enroll.enroll_sessions(id),
    is_new           BOOLEAN     NOT NULL DEFAULT false,
    merge_sim        FLOAT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (person_id, enroll_session_id)
);

-- ============================================================
-- 6. ROOM STAYS
-- ============================================================
CREATE TABLE IF NOT EXISTS enroll.room_stays (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_id        UUID        NOT NULL REFERENCES enroll.person_profiles(id),
    room_id          TEXT        NOT NULL,
    entry_door_id    TEXT,
    entry_unlock_id  TEXT,
    entry_ts         TIMESTAMPTZ,
    entry_confidence TEXT,
    exit_door_id     TEXT,
    exit_unlock_id   TEXT,
    exit_ts          TIMESTAMPTZ,
    exit_confidence  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rs_open
    ON enroll.room_stays (room_id, entry_ts DESC)
    WHERE exit_ts IS NULL;

-- ============================================================
-- 7. ATOMIC JOB CLAIM — FOR UPDATE SKIP LOCKED
-- ============================================================
CREATE OR REPLACE FUNCTION enroll.claim_job(p_worker TEXT)
RETURNS SETOF enroll.job_queue LANGUAGE sql AS $$
    UPDATE enroll.job_queue SET
        status        = 'running',
        locked_by     = p_worker,
        locked_at     = now(),
        started_at    = now(),
        attempt_count = attempt_count + 1
    WHERE id = (
        SELECT id FROM enroll.job_queue
        WHERE  status       = 'pending'
        AND    scheduled_at <= now()
        AND    attempt_count < max_attempts
        ORDER BY priority ASC, scheduled_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
$$;

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

-- ============================================================
-- 8. VIEWS cho API backend (VPS)
-- ============================================================

-- Drop trước để tránh "cannot drop columns from view"
DROP VIEW IF EXISTS enroll.v_sessions    CASCADE;
DROP VIEW IF EXISTS enroll.v_occupancy   CASCADE;
DROP VIEW IF EXISTS enroll.v_queue_stats CASCADE;
DROP VIEW IF EXISTS gate_sessions         CASCADE;

-- gate_sessions: view dedup từ gate_session_clips
-- door_id/unlock_id cast sang TEXT để khớp enroll tables
CREATE VIEW gate_sessions AS
SELECT DISTINCT ON (session_id, unlock_id)
    session_id::text  AS door_id,
    unlock_id::text   AS unlock_id,
    event_time_vn,
    label,
    method,
    direction,
    user_name
FROM gate_session_clips
ORDER BY session_id, unlock_id, event_time_vn DESC;

CREATE VIEW enroll.v_sessions AS
SELECT
    es.id, es.job_id, es.room_label, es.event_time_vn,
    es.status, es.person_count, es.persons_enrolled,
    es.overall_quality, es.best_face_score,
    es.stopped_at_cam, es.used_video,
    es.total_ms, es.error_msg, es.warnings, es.created_at,
    gs.direction, gs.user_name, gs.method
FROM enroll.enroll_sessions es
LEFT JOIN gate_sessions gs
    ON gs.door_id = es.door_id AND gs.unlock_id = es.unlock_id;

CREATE VIEW enroll.v_occupancy AS
SELECT
    rs.room_id, rs.person_id,
    pp.display_name, pp.known_room,
    pp.confidence_lvl, pp.face_quality,
    pp.gender, pp.age_estimate, pp.appearance_notes,
    rs.entry_ts, rs.entry_confidence,
    EXTRACT(EPOCH FROM (now() - rs.entry_ts))/3600 AS hours_in_room
FROM enroll.room_stays rs
JOIN enroll.person_profiles pp ON pp.id = rs.person_id
WHERE rs.exit_ts IS NULL
ORDER BY rs.entry_ts DESC;

CREATE VIEW enroll.v_queue_stats AS
SELECT
    status,
    COUNT(*)::INT                                AS cnt,
    MIN(scheduled_at)                            AS oldest_scheduled,
    AVG(EXTRACT(EPOCH FROM (finished_at - started_at)))
        FILTER (WHERE finished_at IS NOT NULL)   AS avg_duration_s
FROM enroll.job_queue
WHERE created_at >= now() - interval '7 days'
GROUP BY status;

-- ============================================================
-- 9. GRANT quyền cho app user (m1087)
-- ============================================================
GRANT USAGE   ON SCHEMA enroll TO m1087;
GRANT ALL     ON ALL TABLES    IN SCHEMA enroll TO m1087;
GRANT ALL     ON ALL SEQUENCES IN SCHEMA enroll TO m1087;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA enroll TO m1087;

ALTER DEFAULT PRIVILEGES IN SCHEMA enroll
    GRANT ALL ON TABLES    TO m1087;
ALTER DEFAULT PRIVILEGES IN SCHEMA enroll
    GRANT ALL ON SEQUENCES TO m1087;
