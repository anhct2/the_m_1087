-- ============================================================
-- Seed Airbnb listing_id + url cho 12 phòng
-- Chạy sau khi áp dụng schema.sql (và migration_v2 nếu DB cũ)
--
-- Trạng thái mapping:
--   notes IS NULL       → đã xác nhận chắc chắn
--   notes = 'unverified'→ nghi ngờ đúng nhưng cần check lại
-- ============================================================

-- ----------------------------------------------------------
-- Confirmed (chắc chắn đúng)
-- ----------------------------------------------------------
UPDATE rooms SET
    airbnb_listing_id = '1702263219805711838',
    airbnb_url        = 'https://www.airbnb.com/rooms/1702263219805711838',
    updated_at        = NOW()
WHERE room_code = 'P.702';

UPDATE rooms SET
    airbnb_listing_id = '1702294736545394440',
    airbnb_url        = 'https://www.airbnb.com/rooms/1702294736545394440',
    updated_at        = NOW()
WHERE room_code = 'P.402';

UPDATE rooms SET
    airbnb_listing_id = '1702323883909052235',
    airbnb_url        = 'https://www.airbnb.com/rooms/1702323883909052235',
    updated_at        = NOW()
WHERE room_code = 'P.202';

UPDATE rooms SET
    airbnb_listing_id = '1707000333358386811',
    airbnb_url        = 'https://www.airbnb.com/rooms/1707000333358386811',
    updated_at        = NOW()
WHERE room_code = 'P.302';

-- ----------------------------------------------------------
-- Unverified — cần check lại mapping phòng (dấu ? trong nguồn)
-- ----------------------------------------------------------
UPDATE rooms SET
    airbnb_listing_id = '1702303392299119237',
    airbnb_url        = 'https://www.airbnb.com/rooms/1702303392299119237',
    notes             = 'unverified',
    updated_at        = NOW()
WHERE room_code = 'P.502';

UPDATE rooms SET
    airbnb_listing_id = '1707004975290176129',
    airbnb_url        = 'https://www.airbnb.com/rooms/1707004975290176129',
    notes             = 'unverified',
    updated_at        = NOW()
WHERE room_code = 'P.602';

UPDATE rooms SET
    airbnb_listing_id = '1707009278383617269',
    airbnb_url        = 'https://www.airbnb.com/rooms/1707009278383617269',
    notes             = 'unverified',
    updated_at        = NOW()
WHERE room_code = 'P.701';

UPDATE rooms SET
    airbnb_listing_id = '1707013841365709965',
    airbnb_url        = 'https://www.airbnb.com/rooms/1707013841365709965',
    notes             = 'unverified',
    updated_at        = NOW()
WHERE room_code = 'P.601';

UPDATE rooms SET
    airbnb_listing_id = '1707016424127616355',
    airbnb_url        = 'https://www.airbnb.com/rooms/1707016424127616355',
    notes             = 'unverified',
    updated_at        = NOW()
WHERE room_code = 'P.501';

UPDATE rooms SET
    airbnb_listing_id = '1707018895471871830',
    airbnb_url        = 'https://www.airbnb.com/rooms/1707018895471871830',
    notes             = 'unverified',
    updated_at        = NOW()
WHERE room_code = 'P.401';

UPDATE rooms SET
    airbnb_listing_id = '1702261856377017947',
    airbnb_url        = 'https://www.airbnb.com/rooms/1702261856377017947',
    notes             = 'unverified',
    updated_at        = NOW()
WHERE room_code = 'P.301';

UPDATE rooms SET
    airbnb_listing_id = '1707023239622955861',
    airbnb_url        = 'https://www.airbnb.com/rooms/1707023239622955861',
    notes             = 'unverified',
    updated_at        = NOW()
WHERE room_code = 'P.201';

-- Kiểm tra kết quả
SELECT room_code, airbnb_listing_id, notes,
       CASE WHEN notes IS NULL THEN 'confirmed' ELSE 'unverified' END AS status
FROM rooms
ORDER BY floor, position;
