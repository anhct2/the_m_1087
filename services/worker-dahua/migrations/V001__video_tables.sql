-- =============================================================
-- worker-dahua: tạo các bảng tracking download video
-- =============================================================

CREATE TYPE video_status AS ENUM (
    'pending', 'downloading', 'converting', 'completed', 'failed'
);

CREATE TYPE request_status AS ENUM (
    'pending', 'processing', 'completed', 'partial_failed', 'failed'
);

-- ─── video_extraction_requests ───────────────────────────────────────
-- Một request = một sự kiện gate_session cần download video
-- Luôn có đúng 3 video_clips con (N1, S1, S2)

CREATE TABLE video_extraction_requests (
    request_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT        NOT NULL,       -- ref gate_sessions.session_id
    event_time_vn   TIMESTAMPTZ NOT NULL,       -- từ gate_sessions.event_time_vn
    direction       VARCHAR(10) NOT NULL CHECK (direction IN ('incoming','outgoing')),
    scheduled_after TIMESTAMPTZ NOT NULL,       -- = event_time_vn + 30s
    overall_status  request_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (session_id)
);

COMMENT ON TABLE video_extraction_requests IS
    'Một hàng per gate_session. Tổng hợp trạng thái 3 clips con.';
COMMENT ON COLUMN video_extraction_requests.scheduled_after IS
    'T + 30s — thời điểm muộn nhất mà tất cả clips đã ghi xong.';


-- ─── video_clips ─────────────────────────────────────────────────────
-- Một hàng per (request × camera). Luôn 3 hàng / request.

CREATE TABLE video_clips (
    clip_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID        NOT NULL
        REFERENCES video_extraction_requests(request_id) ON DELETE CASCADE,
    camera_id       VARCHAR(3)  NOT NULL CHECK (camera_id IN ('N1','S1','S2')),

    -- Thời điểm cắt (tính theo ma trận offset)
    clip_start      TIMESTAMPTZ NOT NULL,
    clip_end        TIMESTAMPTZ NOT NULL,

    -- Trạng thái xử lý
    status          video_status NOT NULL DEFAULT 'pending',
    retry_count     SMALLINT    NOT NULL DEFAULT 0,
    retry_after     TIMESTAMPTZ,            -- NULL = có thể xử lý ngay; set khi retry

    -- Kết quả
    dav_temp_path   TEXT,                   -- /tmp/dav/{clip_id}.dav (xóa sau convert)
    mp4_path        TEXT,                   -- /data/videos/YYYYMMDD/reqid/CAM_HHMMSS.mp4
    file_size_bytes BIGINT,
    error_message   TEXT,

    -- Metadata
    worker_id       TEXT,                   -- thread name xử lý
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (request_id, camera_id)
);

COMMENT ON TABLE video_clips IS
    'Một hàng per camera per session. status=pending + clip_end<=NOW() → sẵn sàng download.';
COMMENT ON COLUMN video_clips.retry_after IS
    'Scheduler bỏ qua clip này cho đến khi retry_after <= NOW().';


-- ─── video_worker_logs ───────────────────────────────────────────────
-- Log từng bước xử lý — hữu ích debug SDK issues

CREATE TABLE video_worker_logs (
    log_id      BIGSERIAL   PRIMARY KEY,
    clip_id     UUID        REFERENCES video_clips(clip_id) ON DELETE CASCADE,
    event_type  VARCHAR(30) NOT NULL,   -- download_start|download_ok|convert_ok|...
    message     TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── Indexes ─────────────────────────────────────────────────────────

-- Poller: tìm session chưa có request (join với gate_sessions)
CREATE INDEX idx_ver_session ON video_extraction_requests (session_id);

-- Scheduler: lấy clips sẵn sàng download
CREATE INDEX idx_vc_dispatch ON video_clips (status, clip_end, retry_after)
    WHERE status = 'pending';

-- Request summary: cập nhật overall_status
CREATE INDEX idx_vc_request ON video_clips (request_id, status);

-- Log lookup
CREATE INDEX idx_wl_clip ON video_worker_logs (clip_id, created_at DESC);

-- ─── Trigger tự cập nhật updated_at ─────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ver_updated_at
    BEFORE UPDATE ON video_extraction_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_vc_updated_at
    BEFORE UPDATE ON video_clips
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
