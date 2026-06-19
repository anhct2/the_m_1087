-- ============================================================
-- Fix is_best_match conflict trong data hiện tại
-- Chạy 1 lần sau khi deploy mapper mới
-- ============================================================

-- Bước 1: Reset tất cả is_best_match về FALSE
UPDATE gate_session_clips SET is_best_match = FALSE;

-- Bước 2: Set is_best_match = TRUE cho row tốt nhất của mỗi session
-- Logic: với mỗi (session_id, event_time_vn, direction),
--   chọn row có match_score thấp nhất (= tốt nhất)
--   ưu tiên: camera theo direction (incoming=N1 first, outgoing=S1 first)
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY session_id, event_time_vn, direction
            ORDER BY
                match_score ASC,
                -- Camera priority: incoming→N1 first, outgoing→S1 first
                CASE
                    WHEN direction = 'incoming' AND camera = 'N1' THEN 0
                    WHEN direction = 'incoming' AND camera = 'S1' THEN 1
                    WHEN direction = 'outgoing' AND camera = 'S1' THEN 0
                    WHEN direction = 'outgoing' AND camera = 'N1' THEN 1
                    ELSE 2
                END ASC
        ) AS rn
    FROM gate_session_clips
    -- Chỉ set best_match cho các event không bị "stolen" bởi session khác có delta nhỏ hơn
    WHERE id IN (
        -- Với mỗi (frigate_event_id, camera), lấy session có delta nhỏ nhất
        SELECT DISTINCT ON (frigate_event_id, camera)
            id
        FROM gate_session_clips
        ORDER BY frigate_event_id, camera, delta_seconds ASC
    )
)
UPDATE gate_session_clips
SET is_best_match = TRUE
WHERE id IN (SELECT id FROM ranked WHERE rn = 1);

-- Kiểm tra kết quả
SELECT
    direction,
    COUNT(*) FILTER (WHERE is_best_match = TRUE)  AS best_match_count,
    COUNT(*) FILTER (WHERE is_best_match = FALSE) AS candidates_count,
    COUNT(*) AS total
FROM gate_session_clips
GROUP BY direction;

SELECT 'Fix done — ' || NOW()::text AS status;
