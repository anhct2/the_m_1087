# Logic xử lý — Gate Log & Enroll

> Tài liệu tổng hợp toàn bộ luồng dữ liệu và logic của 2 mảng **Gate Log** và
> **Enroll** (bao gồm cả worker `worker-enroll` trên f87 và API trên VPS).
> Mục tiêu: để rà soát xem chỗ nào xử lý chưa đúng. Phần cuối
> ([§8](#8-những-điểm-dễ-sai--cần-rà-soát)) liệt kê các điểm nghi ngờ.

---

## 1. Các thành phần

| Thành phần | Nơi chạy | Vai trò |
|---|---|---|
| **Dahua worker** | VPS | Đọc sự kiện cổng (mở khóa / mở cửa) → ghi `public.gate_events` |
| **worker-mapper** | VPS | Ghép mỗi "phiên cổng" với clip Frigate → ghi `public.gate_session_clips` |
| **worker-enroll** | f87 (GPU) | Poll `enroll.job_queue`, tải clip, trích khuôn mặt/ngoại hình → tạo `enroll.enroll_sessions`, `enroll.person_profiles`, `enroll.room_stays` |
| **API (FastAPI)** | VPS | Chỉ đọc `enroll.*` + `gate_session_clips` cho UI; ngoại lệ: backfill/gán tay thì có ghi |
| **Frontend (React)** | VPS | Màn Gate Log + Enroll (Phiên / Cần xử lý / Trùng lặp / Hồ sơ / Lưu trú / Tác vụ) |

---

## 2. Đường đi của dữ liệu (pipeline)

```
gate_events                (1 dòng / 1 event mở khoá hoặc mở cửa)
   │  worker-mapper gom door_state 'open' cách nhau ≤10s thành 1 "phiên"
   │  rồi ghép với unlock event gần nhất
   ▼
gate_sessions_v2 (VIEW)    (1 dòng / 1 phiên cổng; door_id = id door_state nhỏ nhất)
   │  worker-mapper query Frigate lấy clip N1/S1/S2 quanh thời điểm phiên,
   │  chấm điểm, resolve xung đột, chọn 1 clip is_best_match/phiên
   ▼
gate_session_clips         (nhiều dòng / phiên: mỗi camera-clip 1 dòng;
   │                        session_id = gate_sessions_v2.door_id)
   │
   ├─────────► GATE LOG đọc trực tiếp từ đây (is_best_match = TRUE)
   │
   │  worker-enroll.poll_new_gate_events() đẩy job vào hàng đợi
   ▼
enroll.job_queue           (1 job / phiên-chiều)
   │  worker-enroll.claim_job() → run_job (incoming) / run_outgoing_job (outgoing)
   ▼
enroll.enroll_sessions     (1 phiên enroll)
   ├── enroll.camera_clip_results   (kết quả trích xuất từng camera)
   ├── enroll.person_profiles       (hồ sơ người — có vector khuôn mặt)
   ├── enroll.person_session_map    (n-n giữa người ↔ phiên)
   └── enroll.room_stays            (lượt lưu trú: entry_ts … exit_ts)
```

### Khoá nối (rất quan trọng — nguồn gốc nhiều nhầm lẫn)

| Chiều | `door_id` | `unlock_id` |
|---|---|---|
| **incoming** | `gate_sessions_v2.door_id` (id door_state nhỏ nhất của phiên) | id của **unlock event** (số) |
| **outgoing** | `gate_session_clips.session_id` (= door_id) | **chuỗi "phút VN"** dạng `'YYYY-MM-DD HH24:MI:SS'` (vì clip outgoing có `unlock_id = NULL`) |

→ `enroll_sessions.unlock_id` mang **ý nghĩa khác nhau** giữa 2 chiều: incoming là số, outgoing là chuỗi phút. Xem [§8](#8-những-điểm-dễ-sai--cần-rà-soát).

---

## 3. Điều kiện đưa 1 phiên vào enroll

`worker-enroll.poll_new_gate_events()` (poll 15 phút gần nhất), và API `/backfill` (poll N ngày):

- **incoming**: `gate_sessions_v2` với `method = 'password'` **và** `label LIKE 'P.%'` **và** `direction = 'incoming'`, chưa có job.
  → Chỉ mở cửa bằng **mật khẩu** mới được enroll (mở bằng vân tay/thẻ/remote **không** enroll).
- **outgoing**: mọi `gate_session_clips` có `direction = 'outgoing'` trong khoảng thời gian, gom theo `(session_id, phút)`; room_label lấy từ clip cùng phút có `label LIKE 'P.%'` (nếu có), nếu không thì `''`.

---

## 4. Logic worker-enroll

### 4.1 Incoming — `run_job()`
1. `create_session(...)` → tạo `enroll_sessions` (status `processing`).
2. `get_gate_clips(door_id, unlock_id)` (lọc theo `unlock_id::bigint`, `direction='incoming'`).
3. Duyệt camera theo thứ tự `N1 → S1 → S2`; mỗi camera thử **snapshot trước, video sau**; nếu `confidence ≥ CONF_STOP` thì **dừng** (không xét camera sau).
4. Gom người qua các camera (`_merge_into`, ghép theo vị trí ngang `avg_x_norm`).
5. `_upsert_persons()`:
   - Nếu face đủ chất lượng → `find_similar_profile(room_label, MERGE_FACE_SIM)`: **chỉ tìm trong cùng phòng** để merge.
   - `upsert_profile()`: hồ sơ mới → **tạo `room_stays` mở** (`entry_confidence='gate_code'`); hồ sơ cũ → cập nhật vector trung bình có trọng số.
6. Trạng thái phiên theo `best_conf`: `enrolled` (≥ CONF_MEDIUM) / `low_quality` (≥ CONF_LOW) / `no_detection`.

> ⚠️ **incoming KHÔNG set `recognized_person_id`.** Nó tạo/merge hồ sơ và mở room_stay, nhưng cột `recognized_person_id` của phiên để trống. Việc "gắn người" cho phiên incoming nằm ở `person_session_map`, không phải `recognized_person_id`. → Đây là lý do màn Phiên incoming hay hiện "2/2 người" thay vì tên.

### 4.2 Outgoing — `run_outgoing_job()`
1. `get_active_room_stays(event_time)` → danh sách người **đang ở** tại thời điểm ra. **Nếu rỗng → skip** (`no active stays`).
2. Trích khuôn mặt tương tự incoming (thứ tự camera `S2 → S1 → N1`).
3. Nhận diện: `find_best_profile_match(embedding, RECOGNIZE_SIM_MIN, active_pids)` — **chỉ so khớp trong tập người đang ở**.
   - Khớp face → biết người + phòng.
   - Fallback: nếu **chỉ có đúng 1 người đang ở** → suy luận chính họ đi ra (`room_stay_only`).
   - Nhiều người đang ở mà không khớp face → **ambiguous, không gán**.
4. Nếu xác định được người → `close_room_stay()` (đóng lượt lưu trú) + set `recognized_person_id`, status `enrolled`.

> ⚠️ **Outgoing phụ thuộc hoàn toàn vào room_stays đang mở.** Nếu phiên incoming tương ứng không enroll thành công (không mở stay), thì outgoing **không thể** nhận diện → skip. Đây là ràng buộc hệ thống then chốt.

---

## 5. Các VIEW mà API/UI dựa vào

- **`gate_sessions_v2`** — nguồn "phiên cổng" chuẩn (gom door_state ≤10s). Mapper, poll, Gate Log đều dùng cái này.
- **`gate_sessions`** (v1, cũ) — gom kiểu khác (1 door_state ↔ 1 unlock trong cửa sổ cố định). **Không nên dùng nữa** (migration đã sửa `v_sessions` để bỏ join v1).
- **`enroll.v_sessions`** — join `enroll_sessions` với `gate_sessions_v2` để lấy `user_name/method`.
- **`enroll.v_gate_sessions`** ⭐ — view mới, "xương sống" của màn Phiên:
  ```
  FROM gate_session_clips b            -- is_best_match = TRUE
  LEFT JOIN enroll.enroll_sessions es  ON es.door_id = b.session_id::text AND es.direction = b.direction
  LEFT JOIN enroll.person_profiles pp  ON pp.id = es.recognized_person_id
  LEFT JOIN enroll.job_queue jq        ON jq.door_id=b.session_id::text AND jq.direction=b.direction AND es.id IS NULL
  ```
  - `room_label` = `b.label` (nhãn phòng của **gate clip**, KHÔNG phải `enroll_sessions.room_label`).
  - `effective_status`: có enroll_session → `es.status`; chưa có nhưng có job → `queued`; không có gì → `not_queued`.
  - **Mục tiêu 1-1 với Gate Log**: vì cùng bắt nguồn `gate_session_clips WHERE is_best_match=TRUE`, đếm cùng bộ lọc thì tổng khớp Gate Log.

---

## 6. Bản đồ Endpoint (API)

| Endpoint | Màn dùng | Ghi chú |
|---|---|---|
| `GET /api/sessions` | Gate Log (danh sách) | `gate_session_clips` (is_best_match), lọc since/until/direction/user_name/room |
| `GET /api/sessions/{id}` | Gate Log (deep-link) | 1 phiên theo `session_id` |
| `GET /api/sessions/{id}/clips` | Gate Log (chi tiết) | tất cả clip của phiên, có `clip_url` |
| `GET /api/enroll/gate-sessions` | Enroll · Phiên | từ `v_gate_sessions`, lọc direction/room/user_name/**date_from/date_to** |
| `GET /api/enroll/gate-sessions/{door}` | Phiên (chi tiết) | + `camera_clips`, `persons`, `manual_assignments`, `enroll_room_label` |
| `POST …/gate-sessions/{door}/assign` | gán người (day-scoped) | qua `_apply_manual_assignment` |
| `POST …/gate-sessions/{door}/assign-room` | gán **chỉ phòng** (outgoing) | tag `label` + re-queue |
| `GET /api/enroll/room-day-profiles` | picker gán outgoing | người đã enroll **incoming** của phòng đó **trong ngày** |
| `GET /api/enroll/profiles` | Hồ sơ | lọc room (nhiều) + date_from/date_to |
| `GET /api/enroll/profiles/{id}` | Hồ sơ (chi tiết) | sessions + clips-by-day + stays + manual_assignments |
| `GET /api/enroll/occupancy` | Lưu trú (theo hồ sơ) | không ngày = đang mở; có ngày = giao khoảng |
| `GET /api/enroll/review` | Cần xử lý | phiên `failed` hoặc `enrolled` mà `recognized_person_id IS NULL` |
| `GET /api/enroll/duplicates` | Trùng lặp | cặp hồ sơ cosine ≥ threshold |
| `GET /api/enroll/jobs` | Tác vụ | job_queue 7 ngày |
| `POST …/jobs/{id}/retry`, `…/sessions/{id}/retry`, `…/backfill`, `…/release-stuck` | các nút thao tác | |

---

## 7. Logic từng màn hình (Frontend)

### 7.1 Gate Log
- Danh sách trái = `gate_session_clips (is_best_match)`; chi tiết phải = 3 camera N1/S1/S2 (subquery lấy `frigate_event_id` mỗi camera của cùng `event_time_vn+direction`).
- Lọc **tức thì** (direction / phòng checkbox / khoảng ngày), không có nút Lọc.
- URL `?focus=<session_id>` ↔ phiên đang chọn (map 1-1 với Enroll). `?room=` từ Dashboard.
- Bấm ảnh → Lightbox; bấm play → phát clip trực tiếp `clip_url` (fallback proxy).
- Nút **Gán phòng thủ công chỉ hiện ở chiều Ra** → `OutgoingAssignModal`.

### 7.2 Enroll · Phiên nhận diện
- Header tổng quan (chỉ ở màn này): metric 24h + hàng đợi + nút Nạp lại/Giải phóng/Làm mới.
- Bảng từ `v_gate_sessions`, lọc giống Gate Log (+ ngày). Bấm dòng → drawer chi tiết; bấm ảnh → Lightbox; icon cổng → nhảy Gate Log.
- Cột "Người / Nhận diện": có `recognized_person_id` → tên; nhiều người → `x/y người`.

### 7.3 Cần xử lý / Trùng lặp / Hồ sơ / Lưu trú / Tác vụ
- **Cần xử lý**: phiên lỗi hoặc enrolled-không-hồ-sơ; mở drawer để gán.
- **Trùng lặp**: cụm cosine ≥ 0.82; bấm thành viên → hồ sơ; "Xem/Gộp" → merge.
- **Hồ sơ**: lưới thẻ, lọc phòng+ngày; chi tiết có ảnh/clip theo ngày, lịch sử phiên (chiều Vào/Ra) map Gate Log + phiên, room_stays, lịch sử gán tay.
- **Lưu trú**: 2 chế độ — *Theo hồ sơ* (ai đang/đã ở) và *Theo Gate Log* (nhật ký ra vào theo phòng).
- **Tác vụ**: mặc định lọc `đang chạy / lỗi`; có Chạy lại / Huỷ.

### 7.4 Gán phòng thủ công (mục đích: **thống kê + dữ liệu huấn luyện**, không cần nhận diện chuẩn)
Cả 2 nhánh đều **ghi `gate_session_clips.label = phòng`** (`_tag_gate_room`) để hiện ngay ở Gate Log + màn Phiên:
- **Chỉ phòng** (`assign-room`): cập nhật `enroll_sessions.room_label`, re-queue job (lấy data huấn luyện), log `manual_assignments` (person_id NULL).
- **Chọn người** (`assign` + profile day-scoped): `_apply_manual_assignment` set `recognized_person_id`, mở/đóng `room_stays`, log.

---

## 8. Những điểm dễ sai / cần rà soát

> Đây là các chỗ mình thấy logic **có thể chưa nhất quán** — cần bạn xác nhận theo nghiệp vụ thực tế.

1. **`recognized_person_id` chỉ được set ở outgoing, không ở incoming.**
   Phiên incoming enroll xong vẫn để `recognized_person_id = NULL` (người nằm ở `person_session_map`). Hệ quả:
   - Màn Phiên incoming hiển thị "Chưa nhận diện / x/y người" dù thực ra đã tạo hồ sơ.
   - `/review` coi mọi phiên `enrolled` mà `recognized_person_id IS NULL` là "cần xử lý" → **incoming enrolled bị lọt vào Cần xử lý** dù không có lỗi gì. → nên đổi tiêu chí review (dựa vào `person_session_map`) hoặc set `recognized_person_id` cho incoming khi chỉ có 1 người.

2. **`unlock_id` khác kiểu giữa 2 chiều** (số vs chuỗi phút). Mọi chỗ so khớp phải nhớ điều này; dễ sai khi viết query mới.

3. **`v_gate_sessions` join `enroll_sessions` chỉ theo `(door_id, direction)`, bỏ qua `unlock_id`.**
   Nếu 1 `session_id` outgoing có **nhiều phút ra khác nhau** (nhiều người ra trong cùng phiên cổng), poll tạo **nhiều `enroll_sessions`** cùng `door_id`+`direction` → view **fan-out / nhân dòng**, và phá vỡ "1-1 với Gate Log". Cần kiểm tra dữ liệu thực có case này không; nếu có, view phải join thêm khoá phút.

4. **Nhãn phòng: 2 nguồn khác nhau.** `v_gate_sessions.room_label = gate clip label`, còn worker dùng `enroll_sessions.room_label`. Sau khi gán tay mình đồng bộ bằng cách ghi `gate_session_clips.label`, nhưng nếu mapper chạy lại chèn clip mới cho phiên đó thì clip mới mang label gate gốc (mapper không ghi đè label cũ, nhưng dòng mới thì mang nhãn gốc). → cần xác nhận mapper có chèn thêm dòng cho phiên đã tồn tại không.

5. **Outgoing phụ thuộc room_stays** ([§4.2](#42-outgoing--run_outgoing_job)). Nếu incoming trượt enroll (low_quality/no_detection → có mở stay không? — hiện `upsert_profile` chỉ mở stay khi tạo hồ sơ mới, mà hồ sơ mới chỉ tạo khi có người được gom), thì outgoing tương ứng sẽ "no active stays". → Tỷ lệ outgoing nhận diện được sẽ thấp một cách hệ thống.

6. **Trạng thái sau gán tay không nhất quán:**
   - `assign-room` (chỉ phòng) → `status='processing'` + re-queue (sẽ do worker cập nhật lại).
   - `assign` (chọn người) → `status='enrolled'` ngay.
   Nếu worker offline, phiên gán-chỉ-phòng kẹt ở `processing`. (Phòng vẫn hiển thị vì đã tag label.)

7. **Chỉ mở cửa bằng `password` mới enroll incoming.** Khách mở bằng vân tay/thẻ sẽ không có phiên enroll incoming → không có room_stay → outgoing của họ cũng không match. Cần xác nhận đúng nghiệp vụ.

8. **`is_best_match` có thể "nhảy" giữa các phiên.** Mapper resolve xung đột toàn cục: 1 `frigate_event_id` chỉ là best của 1 phiên. Lần chạy sau có thể đổi best_match sang phiên khác (trừ khi `manual_best_match`), làm ảnh/clip hiển thị ở Gate Log thay đổi.

9. **`v_gate_sessions` LEFT JOIN `job_queue` với điều kiện `es.id IS NULL`** để tránh nhân dòng, nhưng nếu 1 (door_id, direction) có nhiều job (đã từng fail rồi tạo lại) thì vẫn có thể nhân. Cần đảm bảo `job_queue` unique theo `(door_id, unlock_id, direction)` (đang có) là đủ.

---

## 9. Tóm tắt 1 câu

> Gate Log = sự thật thô từ camera (`gate_session_clips`); Enroll = lớp diễn giải
> (ai, phòng nào) chồng lên trên, nối bằng `door_id + direction`. Phần lớn "cảm
> giác sai" đến từ (a) incoming không set `recognized_person_id`, (b) khoá
> `unlock_id` hai kiểu, và (c) view Phiên join thiếu khoá phút cho outgoing.
