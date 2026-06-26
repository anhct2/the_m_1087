"""config.py — Worker Enroll (chạy trên f87)"""
import os
from dataclasses import dataclass
from typing import Dict, List

# ── DB trên VPS HK ───────────────────────────────────────────
DB_HOST = os.environ.get("POSTGRES_HOST", "")
DB_PORT = int(os.environ.get("POSTGRES_PORT", "5555"))
DB_NAME = os.environ.get("POSTGRES_DB",   "m1087")
DB_USER = os.environ.get("POSTGRES_USER", "m1087")
DB_PASS = os.environ.get("POSTGRES_PASS", "")

def db_dsn():
    return f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} user={DB_USER} password={DB_PASS}"

# ── Frigate — local f87 ──────────────────────────────────────
FRIGATE_URL  = os.environ.get("FRIGATE_URL",  "http://10.8.0.187:5000")
FRIGATE_USER = os.environ.get("FRIGATE_USER", "admin")
FRIGATE_PASS = os.environ.get("FRIGATE_PASS", "")

WORKER_ID = os.environ.get("WORKER_ID", "worker-enroll-f87")

# ── Camera order ────────────────────────────────────────────
# Incoming: N1 nhìn thẳng mặt → S1 → S2 lên cầu thang
# Outgoing: S2 (cầu thang xuống) → S1 → N1 (ra cổng ngoài)
CAMERA_ORDER:          List[str] = ["N1", "S1", "S2"]
OUTGOING_CAMERA_ORDER: List[str] = ["S2", "S1", "N1"]

@dataclass(frozen=True)
class CamCfg:
    order: int
    face_weight:  float
    color_weight: float
    min_score:    float   # bỏ qua clip dưới ngưỡng này

CAM: Dict[str, CamCfg] = {
    "N1": CamCfg(order=1, face_weight=0.70, color_weight=0.25, min_score=0.50),
    "S1": CamCfg(order=2, face_weight=0.50, color_weight=0.40, min_score=0.45),
    "S2": CamCfg(order=3, face_weight=0.45, color_weight=0.50, min_score=0.45),
}

# ── Confidence thresholds ────────────────────────────────────
CONF_STOP   = 0.90   # đủ tốt → dừng, không duyệt camera tiếp
CONF_HIGH   = 0.70
CONF_MEDIUM = 0.45
CONF_LOW    = 0.25

FACE_CONFIDENT    = 0.45   # det_score >= này: dùng embedding
FACE_POSSIBLE     = 0.30   # det_score >= này: lưu, flag thấp
MERGE_FACE_SIM    = 0.40   # cosine sim >= này: same person → merge (incoming)
RECOGNIZE_SIM_MIN = 0.55   # cosine sim >= này: accept match (outgoing recognition)

SNAP_OK_THRESHOLD = 0.65   # snapshot đủ tốt → skip video

# ── Processing ───────────────────────────────────────────────
MAX_FRAMES       = 30
SAMPLE_FPS       = 1.0
EARLY_EXIT_SCORE = 0.85

# ── Worker ───────────────────────────────────────────────────
POLL_INTERVAL_S       = int(os.environ.get("POLL_INTERVAL_S",       "30"))
# Đợi 90s sau gate event để Frigate finalize clip
# Thực tế: N1 21:39:14 → S2 21:39:52 = 38s, thêm 50s buffer
JOB_DELAY_S           = int(os.environ.get("JOB_DELAY_S",           "90"))
# Outgoing cần nhiều thời gian hơn: clip S2→N1 ~40s + finalize buffer
OUTGOING_JOB_DELAY_S  = int(os.environ.get("OUTGOING_JOB_DELAY_S",  "150"))
MAX_CONCURRENT        = int(os.environ.get("MAX_CONCURRENT",         "2"))
STUCK_TIMEOUT_M  = 30

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
LOG_FILE  = os.environ.get("LOG_FILE",  "/app/logs/worker_enroll.log")
