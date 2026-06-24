-- ============================================================
-- 87TCS — Airbnb Calendar Module
-- DB: m1087  Schema: public
-- ============================================================

-- ------------------------------------------------------------
-- 1. rooms — danh sách 12 phòng, mapping Airbnb ↔ internal
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
    id              SERIAL PRIMARY KEY,
    room_code       VARCHAR(10)  UNIQUE,             -- "P.201" .. "P.702" — điền sau khi map
    floor           SMALLINT,                        -- 2..7 — điền sau khi map
    position        CHAR(2),                         -- '01' hoặc '02' — điền sau khi map

    -- Airbnb
    airbnb_listing_id   VARCHAR(30) UNIQUE,          -- "1702294736545394440"
    airbnb_url          TEXT,                        -- full URL để scraper dùng

    -- Metadata
    is_active       BOOLEAN      DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),

    CONSTRAINT chk_floor    CHECK (floor IS NULL OR floor BETWEEN 2 AND 7),
    CONSTRAINT chk_position CHECK (position IS NULL OR position IN ('01','02'))
);

-- Seed 12 phòng (airbnb_listing_id và url điền sau qua config)
INSERT INTO rooms (room_code, floor, position) VALUES
    ('P.201', 2, '01'), ('P.202', 2, '02'),
    ('P.301', 3, '01'), ('P.302', 3, '02'),
    ('P.401', 4, '01'), ('P.402', 4, '02'),
    ('P.501', 5, '01'), ('P.502', 5, '02'),
    ('P.601', 6, '01'), ('P.602', 6, '02'),
    ('P.701', 7, '01'), ('P.702', 7, '02')
ON CONFLICT (room_code) DO NOTHING;


-- ------------------------------------------------------------
-- 2. airbnb_calendar — lịch bận/rỗi từng ngày từng phòng
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS airbnb_calendar (
    id              BIGSERIAL    PRIMARY KEY,
    room_id         INT          NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    calendar_date   DATE         NOT NULL,

    -- Trạng thái
    -- TRUE  = available (rỗi, có thể đặt)
    -- FALSE = blocked   (bận, đã có booking hoặc chủ block)
    is_available    BOOLEAN      NOT NULL,

    -- Metadata scraping
    scraped_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),  -- lần scrape ghi record này
    scrape_run_id   BIGINT,                               -- FK → scrape_runs.id

    CONSTRAINT uq_room_date UNIQUE (room_id, calendar_date)
);

CREATE INDEX idx_cal_date      ON airbnb_calendar (calendar_date);
CREATE INDEX idx_cal_room_date ON airbnb_calendar (room_id, calendar_date DESC);
CREATE INDEX idx_cal_available ON airbnb_calendar (calendar_date, is_available)
    WHERE is_available = TRUE;


-- ------------------------------------------------------------
-- 3. scrape_runs — lịch sử mỗi lần cronjob chạy
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrape_runs (
    id              BIGSERIAL    PRIMARY KEY,
    room_id         INT          NOT NULL REFERENCES rooms(id),
    triggered_by    VARCHAR(20)  NOT NULL DEFAULT 'cron',
                                          -- 'cron' | 'manual' | 'forced'
    started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,

    -- Kết quả
    status          VARCHAR(10)  NOT NULL DEFAULT 'running',
                                          -- 'running'|'success'|'failed'|'skipped'
    skip_reason     VARCHAR(50),          -- 'room_busy_today_and_tomorrow'
    days_fetched    INT,                  -- số ngày lấy được
    days_updated    INT,                  -- số ngày có thay đổi so với lần trước
    error_message   TEXT,

    -- Check ngày hiện tại / ngày mai trước khi quyết định chạy
    today_available     BOOLEAN,          -- snapshot lúc job check
    tomorrow_available  BOOLEAN
);

CREATE INDEX idx_sr_room       ON scrape_runs (room_id, started_at DESC);
CREATE INDEX idx_sr_status     ON scrape_runs (status);
CREATE INDEX idx_sr_started    ON scrape_runs (started_at DESC);


-- ------------------------------------------------------------
-- 4. View tiện ích — tình trạng phòng hiện tại + tuần tới
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_room_availability AS
SELECT
    r.room_code,
    r.airbnb_listing_id,
    r.floor,

    -- Hôm nay
    bool_or(c.is_available)
        FILTER (WHERE c.calendar_date = CURRENT_DATE)       AS today_available,

    -- Ngày mai
    bool_or(c.is_available)
        FILTER (WHERE c.calendar_date = CURRENT_DATE + 1)   AS tomorrow_available,

    -- 7 ngày tới: đếm ngày rỗi
    COUNT(CASE WHEN c.calendar_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
               AND c.is_available = TRUE THEN 1 END) AS free_days_next_7,

    -- 30 ngày tới: đếm ngày rỗi
    COUNT(CASE WHEN c.calendar_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 29
               AND c.is_available = TRUE THEN 1 END) AS free_days_next_30,

    -- Lần scrape gần nhất
    MAX(c.scraped_at)                          AS last_scraped_at

FROM rooms r
LEFT JOIN airbnb_calendar c ON c.room_id = r.id
    AND c.calendar_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 30
WHERE r.is_active = TRUE
GROUP BY r.id, r.room_code, r.airbnb_listing_id, r.floor
ORDER BY r.floor, r.position;


-- ------------------------------------------------------------
-- 5. View: should_scrape_today — job dùng để quyết định chạy
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_should_scrape AS
SELECT
    r.id          AS room_id,
    r.room_code,
    r.airbnb_listing_id,
    r.airbnb_url,

    -- Dữ liệu hôm nay và ngày mai trong DB
    t.is_available  AS today_available,
    tm.is_available AS tomorrow_available,

    -- Logic: chạy nếu hôm nay HOẶC ngày mai còn rỗi
    -- Nếu cả hai đều FALSE (bận) → skip
    COALESCE(t.is_available, TRUE) OR
    COALESCE(tm.is_available, TRUE)  AS should_run,

    -- Lý do skip (để ghi vào scrape_runs)
    CASE
        WHEN NOT COALESCE(t.is_available, TRUE)
         AND NOT COALESCE(tm.is_available, TRUE)
        THEN 'room_busy_today_and_tomorrow'
        ELSE NULL
    END AS skip_reason

FROM rooms r
LEFT JOIN airbnb_calendar t  ON t.room_id  = r.id AND t.calendar_date = CURRENT_DATE
LEFT JOIN airbnb_calendar tm ON tm.room_id = r.id AND tm.calendar_date = CURRENT_DATE + 1
WHERE r.is_active = TRUE
  AND r.airbnb_listing_id IS NOT NULL
ORDER BY r.floor, r.position;
