# Face Recognition — Setup Guide

## Chuẩn bị

Worker-face sử dụng **CompreFace** (self-hosted, open source) làm backend nhận diện.
Chạy trên cùng máy Frigate (frigate87) hoặc máy riêng.

## Thêm CompreFace vào docker-compose.yml

```yaml
  compreface-postgres:
    image: exadel/compreface-postgres:latest
    container_name: tcs-compreface-db
    environment:
      POSTGRES_USER: compreface
      POSTGRES_PASSWORD: compreface
      POSTGRES_DB: compreface
    volumes:
      - compreface-db:/var/lib/postgresql/data
    networks: [tcs]
    profiles: [face]

  compreface:
    image: exadel/compreface:latest
    container_name: tcs-compreface
    ports:
      - "8001:8000"
    environment:
      POSTGRES_USER: compreface
      POSTGRES_PASSWORD: compreface
      POSTGRES_URL: jdbc:postgresql://compreface-postgres:5432/compreface
    depends_on: [compreface-postgres]
    networks: [tcs]
    profiles: [face]

volumes:
  compreface-db:
```

## Implement worker-face/recognizer.py

```python
import requests

def recognize_snapshot(snapshot_url: str, api_key: str, compreface_url: str) -> dict:
    """
    Download snapshot từ Frigate, gửi đến CompreFace để nhận diện.
    Returns: {"subject": "Tran Mai", "similarity": 0.97} hoặc None
    """
    img = requests.get(snapshot_url, timeout=10).content
    r = requests.post(
        f"{compreface_url}/api/v1/recognition/recognize",
        headers={"x-api-key": api_key},
        files={"file": ("snap.jpg", img, "image/jpeg")},
        data={"limit": 1, "det_prob_threshold": 0.8, "face_plugins": ""},
        timeout=15,
    )
    result = r.json()
    results = result.get("result", [])
    if not results or not results[0].get("subjects"):
        return None
    best = results[0]["subjects"][0]
    return {"subject": best["subject"], "similarity": best["similarity"]}
```

## Schema đã chuẩn bị sẵn

Bảng `gate_session_clips` đã có các cột:
- `face_label TEXT`
- `face_confidence NUMERIC(5,4)`
- `face_processed_at TIMESTAMPTZ`

Worker chỉ cần UPDATE những cột này sau khi nhận diện xong.
