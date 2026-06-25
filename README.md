# 87 TCS — Smart Building Monitor

Hệ thống giám sát ra vào thông minh: Gate Log · Camera · Dashboard · Face Recognition.

## Cấu trúc

```
87tcs/
├── docker-compose.yml          Orchestrate tất cả services
├── .env.example                Config template (copy → .env)
│
├── services/
│   ├── api/                    FastAPI backend (REST API + serve React SPA)
│   │   ├── app/
│   │   │   ├── main.py         App factory, router registration
│   │   │   ├── core/
│   │   │   │   ├── config.py   Pydantic settings (đọc từ .env)
│   │   │   │   ├── db.py       PostgreSQL connection
│   │   │   │   └── auth.py     Token auth (upgrade → JWT sẵn sàng)
│   │   │   ├── routers/
│   │   │   │   ├── auth.py     POST /api/auth/login|logout|me
│   │   │   │   ├── stats.py    GET  /api/stats, /api/stats/trend
│   │   │   │   ├── sessions.py GET  /api/sessions, /api/sessions/{id}/clips
│   │   │   │   └── users.py    GET  /api/users
│   │   │   └── models/         Pydantic schemas (thêm khi cần)
│   │   ├── static/             React build output (auto-generated)
│   │   └── Dockerfile
│   │
│   ├── worker-mapper/          Cron: quét Gate Log ↔ Frigate video
│   │   ├── main.py             Daemon loop (MAPPER_INTERVAL_SEC)
│   │   ├── mapper.py           Core mapping logic (importable)
│   │   └── Dockerfile
│   │
│   └── worker-face/            Face recognition pipeline (scaffold)
│       ├── main.py             Disabled by default (FACE_ENABLED=false)
│       └── Dockerfile
│
├── frontend/                   React + Vite
│   ├── src/
│   │   ├── api/client.js       Axios + auth interceptors
│   │   ├── context/            AuthContext
│   │   ├── components/         AppShell, UI primitives
│   │   ├── pages/
│   │   │   ├── Login.jsx       Màn login
│   │   │   ├── Dashboard.jsx   Stats + charts (Recharts)
│   │   │   └── GateLog.jsx     Feed + detail dual-cam
│   │   └── styles/tokens.css   Design tokens (IBM Plex, oklch)
│   └── vite.config.js          Build → ../services/api/static
│
├── infra/
│   └── nginx/
│       └── nginx.conf          Reverse proxy (profile: prod)
│
├── shared/
│   └── db/
│       └── schema.sql          PostgreSQL schema + migrations
│
└── docs/
    └── face-recognition.md     Hướng dẫn bật face recognition
```

## Quickstart

### 1. Config
```bash
cp .env.example .env
# Sửa: POSTGRES_*, FRIGATE_URL, AUTH_USERNAME, AUTH_PASSWORD
```

### 2. Build frontend
```bash
cd frontend && npm install && npm run build
# Output → services/api/static/
```

### 3. Run
```bash
# Dev (hot-reload)
docker compose up api worker-mapper

# Prod (với nginx)
docker compose --profile prod up -d
```

### 4. DB schema
```bash
psql -h $POSTGRES_HOST -p 5555 -U m1087 -d m1087 -f shared/db/schema.sql
```

Mở `http://localhost:8088` → login → dashboard.

---

## API Docs
Swagger UI: `http://localhost:8088/api/docs`

## Mở rộng

### Thêm màn hình mobile
Frontend đã có `src/api/client.js` dùng axios + token Bearer → React Native có thể dùng lại logic tương tự, chỉ cần thay UI layer.

### Bật face recognition
```bash
# 1. Cài CompreFace (xem docs/face-recognition.md)
# 2. Set trong .env:
FACE_ENABLED=true
COMPREFACE_URL=http://compreface:8000
COMPREFACE_KEY=your-key

# 3. Implement services/worker-face/recognizer.py
# 4. Chạy:
docker compose --profile face up
```

### Thêm thiết bị / job mới
```
services/
  worker-<tên>/
    main.py        # daemon loop
    <logic>.py     # core logic
    Dockerfile
    requirements.txt
```
Thêm vào `docker-compose.yml` tương tự `worker-mapper`.

### Upgrade Auth → JWT
Trong `services/api/app/core/auth.py` có comment hướng dẫn step-by-step. Chỉ cần:
1. Thêm `JWT_SECRET` vào `.env`
2. Sửa `create_token()` và `verify_token()` trong `auth.py`
3. Không cần đổi gì ở routers.




# Dump nhanh (timestamp tự động)
python3 dump_schema.py

# Chỉ định output
python3 dump_schema.py --out shared/db/before_migration.sql

# DB khác
python3 dump_schema.py --host other-host --db other_db --user other_user