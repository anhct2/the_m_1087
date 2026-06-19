# ============================================================
#  Stage 1: Build React frontend
#  build context = repo root (docker-compose.yml: context: .)
# ============================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /frontend

# Copy lock file trước để tận dụng Docker layer cache
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ============================================================
#  Stage 2: FastAPI backend + React static files
# ============================================================
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY services/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/api/ .

# Nhúng React build vào static/ → FastAPI serve luôn
COPY --from=frontend-builder /frontend/dist ./static/

EXPOSE 8088
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8088"]
