-- Migration: worker heartbeat tracking
-- Chạy 1 lần trên VPS HK: psql -d m1087 -f 003_worker_heartbeat.sql

CREATE TABLE IF NOT EXISTS enroll.worker_heartbeat (
    worker_id       TEXT         PRIMARY KEY,
    last_beat       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status          TEXT         NOT NULL DEFAULT 'idle'
                    CHECK (status IN ('idle','running')),
    active_jobs     SMALLINT     NOT NULL DEFAULT 0,
    max_concurrent  SMALLINT     NOT NULL DEFAULT 2,
    poll_interval_s SMALLINT     NOT NULL DEFAULT 30,
    hostname        TEXT,
    started_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

GRANT ALL ON enroll.worker_heartbeat TO m1087;
