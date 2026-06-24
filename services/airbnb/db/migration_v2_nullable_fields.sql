-- ============================================================
-- Migration v2: Bỏ NOT NULL cho room_code, floor, position
-- Cho phép import Airbnb listing trước khi map phòng vật lý
-- ============================================================

ALTER TABLE rooms
    ALTER COLUMN room_code DROP NOT NULL,
    ALTER COLUMN floor     DROP NOT NULL,
    ALTER COLUMN position  DROP NOT NULL;

ALTER TABLE rooms
    DROP CONSTRAINT IF EXISTS chk_floor,
    DROP CONSTRAINT IF EXISTS chk_position;

ALTER TABLE rooms
    ADD CONSTRAINT chk_floor    CHECK (floor IS NULL OR floor BETWEEN 2 AND 7),
    ADD CONSTRAINT chk_position CHECK (position IS NULL OR position IN ('01','02'));
