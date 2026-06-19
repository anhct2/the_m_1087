-- ============================================================
--  87 TCS — Database Schema
--  DROP & RECREATE toàn bộ
--  Run: psql -h HOST -p 5555 -U m1087 -d m1087 -f schema.sql
-- ============================================================

-- Drop views trước (phụ thuộc vào tables)
DROP VIEW IF EXISTS v_gate_clips_all  CASCADE;
DROP VIEW IF EXISTS v_gate_clips_best CASCADE;

-- Drop tables
DROP TABLE IF EXISTS gate_session_clips CASCADE;
DROP TABLE IF EXISTS mapping_runs       CASCADE;
DROP TABLE IF EXISTS devices            CASCADE;

-- Drop function
DROP FUNCTION IF EXISTS trg_set_updated_at CASCADE;

-- ============================================================
-- Function: auto-update updated_at
-- ============================================================
CREATE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ============================================================
-- devices: config NVR/camera
-- ============================================================
CREATE TABLE devices (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    type         TEXT NOT NULL DEFAULT 'frigate',
    internal_url TEXT,
    public_url   TEXT,
    username     TEXT,
    password     TEXT,
    extra        JSONB DEFAULT '{}',
    enabled      BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_devices
    BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

INSERT INTO devices (name, type, public_url, username, password)
VALUES ('frigate-87tcs', 'frigate', 'https://f87.m2s.io.vn', 'anhct', 'YOUR_FRIGATE_PASSWORD')
ON CONFLICT (name) DO UPDATE SET
    public_url = EXCLUDED.public_url,
    username   = EXCLUDED.username,
    password   = EXCLUDED.password;

-- ============================================================
-- gate_session_clips: kết quả mapping gate ↔ Frigate
-- ============================================================
CREATE TABLE gate_session_clips (
    id                  SERIAL PRIMARY KEY,

    -- Gate session
    session_id          BIGINT,
    unlock_id           BIGINT,
    event_time_vn       TIMESTAMPTZ NOT NULL,
    direction           TEXT NOT NULL CHECK (direction IN ('incoming','outgoing')),
    user_name           TEXT,
    label               TEXT,
    method              TEXT,
    raw_hex             TEXT,

    -- Frigate event
    frigate_event_id    TEXT NOT NULL,
    camera              TEXT NOT NULL,
    frigate_label       TEXT,
    frigate_score       NUMERIC(5,4),
    event_start_time    TIMESTAMPTZ,
    event_end_time      TIMESTAMPTZ,
    delta_seconds       NUMERIC(8,3),

    -- Media links (public URL → frontend stream trực tiếp)
    snapshot_url        TEXT,
    clip_url            TEXT,
    clip_finalized      BOOLEAN DEFAULT FALSE,
    codec               TEXT,

    -- Face recognition (worker-face, bật sau)
    face_label          TEXT,
    face_confidence     NUMERIC(5,4),
    face_processed_at   TIMESTAMPTZ,

    -- Ranking
    match_score         NUMERIC(8,4),
    is_best_match       BOOLEAN DEFAULT FALSE,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_session_event UNIQUE (event_time_vn, direction, frigate_event_id)
);

CREATE INDEX idx_gsc_event_time ON gate_session_clips (event_time_vn DESC);
CREATE INDEX idx_gsc_session_id ON gate_session_clips (session_id);
CREATE INDEX idx_gsc_direction  ON gate_session_clips (direction);
CREATE INDEX idx_gsc_best       ON gate_session_clips (is_best_match) WHERE is_best_match = TRUE;
CREATE INDEX idx_gsc_finalized  ON gate_session_clips (clip_finalized);
CREATE INDEX idx_gsc_face       ON gate_session_clips (face_label) WHERE face_label IS NOT NULL;

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON gate_session_clips
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- mapping_runs: audit log
-- ============================================================
CREATE TABLE mapping_runs (
    id               SERIAL PRIMARY KEY,
    ran_at           TIMESTAMPTZ DEFAULT NOW(),
    sessions_scanned INTEGER,
    events_queried   INTEGER,
    matches_found    INTEGER,
    skipped_active   INTEGER,
    time_window_sec  INTEGER,
    notes            TEXT
);

-- ============================================================
-- Views
-- ============================================================
CREATE VIEW v_gate_clips_best AS
SELECT
    session_id, unlock_id,
    event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh' AS event_time_local,
    direction, user_name, label, method,
    camera, frigate_event_id, frigate_label, frigate_score,
    delta_seconds, event_start_time, event_end_time,
    clip_finalized, codec,
    face_label, face_confidence,
    snapshot_url, clip_url, match_score
FROM gate_session_clips
WHERE is_best_match = TRUE
ORDER BY event_time_vn DESC;

CREATE VIEW v_gate_clips_all AS
SELECT
    session_id, unlock_id,
    event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh' AS event_time_local,
    direction, user_name, label, camera,
    frigate_event_id, frigate_label, frigate_score,
    delta_seconds, clip_finalized, codec,
    face_label, face_confidence,
    snapshot_url, clip_url, match_score, is_best_match
FROM gate_session_clips
ORDER BY event_time_vn DESC, match_score ASC;

SELECT 'Schema OK — ' || NOW()::text AS status;
