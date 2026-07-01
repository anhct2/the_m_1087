"""
mapper.py — Core gate_sessions ↔ Frigate events mapping.

Cải tiến:
- Mỗi frigate_event_id chỉ được là best_match của 1 session duy nhất
  (session nào có delta nhỏ nhất giành quyền)
- Window mặc định giữ 120s nhưng scoring phạt nặng hơn khi delta lớn
- Sau khi map xong toàn bộ batch, resolve conflict trước khi upsert
"""

import logging
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta, timezone
from collections import defaultdict

from frigate_client import FrigateClient

log   = logging.getLogger(__name__)
VN_TZ = timezone(timedelta(hours=7))

CAMERAS = {"incoming": ["N1", "S1", "S2"], "outgoing": ["S2", "S1", "N1"]}

SCORE_W_TIME = 0.1
SCORE_W_CONF = 10.0

# Asymmetric time window (off_before, off_after) relative to gate event_time_vn.
# off_before âm = lùi lại trước sự kiện, off_after dương = mở về phía sau.
WINDOWS: dict[tuple[str, str], tuple[int, int]] = {
    ("incoming", "N1"): (-30, 20),
    ("incoming", "S1"): (-10, 35),
    ("incoming", "S2"): (-10, 35),
    ("outgoing", "S2"): (-35, 10),
    ("outgoing", "S1"): (-35, 10),
    ("outgoing", "N1"): (-10, 36),
}
DEFAULT_WINDOW = (-15, 15)


# ── DB ───────────────────────────────────────────────────────

def _make_conn(cfg):
    return psycopg2.connect(
        host=cfg.pg_host, port=cfg.pg_port,
        dbname=cfg.pg_db, user=cfg.pg_user, password=cfg.pg_pass,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _load_device(conn, device_name: str) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM devices WHERE name = %s AND enabled = TRUE",
            (device_name,),
        )
        row = cur.fetchone()
    if not row:
        raise RuntimeError(f"Device '{device_name}' not found or disabled")
    url = (row["public_url"] or row["internal_url"] or "").rstrip("/")
    if not url:
        raise RuntimeError(f"Device '{device_name}' has no URL configured")
    return {"url": url, "username": row["username"] or "", "password": row["password"] or ""}


def _fetch_sessions(conn, since: datetime, until: datetime) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT door_id, unlock_id, event_time_vn, direction,
                   user_name, label, method, raw_hex
            FROM gate_sessions_v2
            WHERE event_time_vn >= %(s)s AND event_time_vn < %(u)s
              AND direction IN ('incoming','outgoing')
            ORDER BY event_time_vn
        """, {"s": since.replace(tzinfo=None), "u": until.replace(tzinfo=None)})
        return cur.fetchall()


def _upsert(conn, rows: list[dict]):
    if not rows:
        return
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, """
            INSERT INTO gate_session_clips (
                session_id, unlock_id,
                event_time_vn, direction, user_name, label, method, raw_hex,
                frigate_event_id, camera, frigate_label, frigate_score,
                event_start_time, event_end_time, delta_seconds,
                snapshot_url, clip_url, clip_finalized, codec,
                match_score, is_best_match
            ) VALUES (
                %(session_id)s, %(unlock_id)s,
                %(event_time_vn)s, %(direction)s, %(user_name)s, %(label)s,
                %(method)s, %(raw_hex)s,
                %(frigate_event_id)s, %(camera)s, %(frigate_label)s, %(frigate_score)s,
                %(event_start_time)s, %(event_end_time)s, %(delta_seconds)s,
                %(snapshot_url)s, %(clip_url)s, %(clip_finalized)s, %(codec)s,
                %(match_score)s, %(is_best_match)s
            )
            ON CONFLICT (event_time_vn, direction, frigate_event_id) DO UPDATE SET
                event_end_time = EXCLUDED.event_end_time,
                clip_finalized = EXCLUDED.clip_finalized,
                frigate_score  = EXCLUDED.frigate_score,
                snapshot_url   = EXCLUDED.snapshot_url,
                clip_url       = EXCLUDED.clip_url,
                match_score    = EXCLUDED.match_score,
                is_best_match  = CASE
                                     WHEN gate_session_clips.manual_best_match
                                     THEN gate_session_clips.is_best_match
                                     ELSE EXCLUDED.is_best_match
                                  END,
                updated_at     = NOW()
        """, rows, page_size=100)
    conn.commit()
    log.info(f"Upserted {len(rows)} rows")


def _log_run(conn, stats: dict):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO mapping_runs
                (sessions_scanned, events_queried, matches_found, skipped_active, time_window_sec, notes)
            VALUES
                (%(sessions_scanned)s, %(events_queried)s, %(matches_found)s,
                 %(skipped_active)s, %(time_window_sec)s, %(notes)s)
        """, stats)
    conn.commit()


# ── Mapping ──────────────────────────────────────────────────

def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=VN_TZ)
    return dt.astimezone(timezone.utc)


def _build_candidates_for_session(
    session: dict,
    client: FrigateClient,
    window_sec: int = None,
) -> tuple[list[dict], int]:
    """
    Query Frigate events trong asymmetric window cho 1 session.
    window_sec không còn dùng — giữ signature để không break caller cũ.
    """
    gate_utc  = _to_utc(session["event_time_vn"])
    direction = session["direction"]
    cameras   = CAMERAS.get(direction, ["N1", "S1"])
    cam_prio  = {c: i for i, c in enumerate(cameras)}

    candidates = []
    skipped    = 0

    for cam in cameras:
        off_before, off_after = WINDOWS.get((direction, cam), DEFAULT_WINDOW)
        after_ts  = gate_utc.timestamp() + off_before
        before_ts = gate_utc.timestamp() + off_after

        try:
            events = client.get_events(cam, after_ts, before_ts)
        except Exception as e:
            log.warning(f"  {cam}: {e}")
            continue

        for ev in events:
            end_ts = ev.get("end_time")
            if end_ts is None:
                skipped += 1
                continue

            start_ts = ev.get("start_time") or 0
            delta    = abs(gate_utc.timestamp() - start_ts)
            data     = ev.get("data") or {}
            fscore   = float(data.get("top_score") or data.get("score") or
                             ev.get("top_score") or 0)
            score    = delta * SCORE_W_TIME - fscore * SCORE_W_CONF

            candidates.append({
                "session_id":       session.get("door_id"),
                "unlock_id":        session.get("unlock_id"),
                "event_time_vn":    session["event_time_vn"],
                "direction":        session["direction"],
                "user_name":        session.get("user_name"),
                "label":            session.get("label"),
                "method":           session.get("method"),
                "raw_hex":          session.get("raw_hex"),
                "frigate_event_id": ev["id"],
                "camera":           cam,
                "frigate_label":    ev.get("label"),
                "frigate_score":    round(fscore, 4),
                "event_start_time": datetime.fromtimestamp(start_ts, tz=timezone.utc),
                "event_end_time":   datetime.fromtimestamp(end_ts,   tz=timezone.utc),
                "delta_seconds":    round(delta, 3),
                "snapshot_url":     client.snapshot_url(ev["id"]),
                "clip_url":         client.clip_url(ev["id"]),
                "clip_finalized":   True,
                "codec":            None,
                "match_score":      round(score, 4),
                "is_best_match":    False,
                # meta for conflict resolution
                "_cam_prio":        cam_prio.get(cam, 99),
                "_gate_ts":         _to_utc(session["event_time_vn"]).timestamp(),
            })

    # Sort trong session: score thấp + cam priority
    candidates.sort(key=lambda x: (x["match_score"], x["_cam_prio"]))
    return candidates, skipped


def _resolve_conflicts(all_candidates: list[dict], locked_events: frozenset = frozenset()) -> list[dict]:
    """
    Resolve tranh chấp: mỗi (frigate_event_id, camera) chỉ là best_match
    của 1 session duy nhất — session nào có delta nhỏ nhất giành quyền.

    Ví dụ từ data thực:
      1781840395-N1 xuất hiện ở session 542 (delta=6.3s) và 377 (delta=43.5s)
      → session 542 giành vì delta nhỏ hơn
    """
    # Loại event đã bị khóa bởi chốt tay khỏi vòng tranh chấp
    if locked_events:
        all_candidates = [
            c for c in all_candidates
            if (c["frigate_event_id"], c["camera"]) not in locked_events
        ]

    # Bước 1: với mỗi session, tìm best candidate PER CAMERA
    # key = (session_id, event_time_vn, direction)
    session_best_per_cam: dict[tuple, dict[str, dict]] = defaultdict(dict)

    for c in all_candidates:
        sk  = (c["session_id"], str(c["event_time_vn"]), c["direction"])
        cam = c["camera"]
        cur = session_best_per_cam[sk].get(cam)
        if cur is None or c["match_score"] < cur["match_score"]:
            session_best_per_cam[sk][cam] = c

    # Bước 2: collect tất cả "best per cam per session" candidates
    # và resolve conflict cho từng (frigate_event_id, camera)
    # key = (frigate_event_id, camera) → best candidate across all sessions
    event_cam_winner: dict[tuple, dict] = {}

    for sk, cam_map in session_best_per_cam.items():
        for cam, cand in cam_map.items():
            ek = (cand["frigate_event_id"], cam)
            existing = event_cam_winner.get(ek)
            if existing is None or cand["delta_seconds"] < existing["delta_seconds"]:
                event_cam_winner[ek] = cand

    # Bước 3: build final list
    # - Tất cả candidates vẫn được upsert (để có history)
    # - is_best_match = True chỉ khi:
    #     a) candidate này là best trong session
    #     b) không có session khác có delta nhỏ hơn cho cùng event
    winner_keys: set[tuple] = set()
    for sk, cam_map in session_best_per_cam.items():
        for cam, cand in cam_map.items():
            ek = (cand["frigate_event_id"], cam)
            if event_cam_winner[ek] is cand:
                winner_keys.add(id(cand))  # dùng object id để đánh dấu

    # Bước 4: với mỗi session, chọn best_match = candidate được mark winner
    # ưu tiên: camera đầu tiên theo direction priority
    session_winner: dict[tuple, dict] = {}
    for c in all_candidates:
        sk = (c["session_id"], str(c["event_time_vn"]), c["direction"])
        if id(c) not in winner_keys:
            continue
        existing = session_winner.get(sk)
        if existing is None or (c["match_score"], c["_cam_prio"]) < (existing["match_score"], existing["_cam_prio"]):
            session_winner[sk] = c

    # Bước 5: set is_best_match flag
    winner_obj_ids = {id(v) for v in session_winner.values()}
    result = []
    for c in all_candidates:
        row = {k: v for k, v in c.items() if not k.startswith("_")}
        row["is_best_match"] = id(c) in winner_obj_ids
        result.append(row)

    return result


# ── Manual-lock helpers ──────────────────────────────────────

def _fetch_locks(conn) -> tuple[set, set]:
    """
    Trả về 2 tập:
      locked_sessions — (session_id, event_time_vn_str, direction) đã chốt tay → skip hoàn toàn
      locked_events   — (frigate_event_id, camera) đã bị khóa → loại khỏi tranh chấp
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT session_id, event_time_vn, direction, frigate_event_id, camera
            FROM gate_session_clips
            WHERE manual_best_match = TRUE
        """)
        rows = cur.fetchall()
    locked_sessions = {(r["session_id"], str(r["event_time_vn"]), r["direction"]) for r in rows}
    locked_events   = {(r["frigate_event_id"], r["camera"]) for r in rows}
    return locked_sessions, locked_events


# ── Public entry point ───────────────────────────────────────

def run_mapper(cfg, since: datetime, until: datetime, dry_run: bool = False) -> dict:
    conn   = _make_conn(cfg)
    device = _load_device(conn, cfg.device_name)
    log.info(f"Device: {cfg.device_name} → {device['url']}")

    client = FrigateClient(device["url"], device["username"], device["password"])
    client.login()

    sessions = _fetch_sessions(conn, since, until)
    log.info(f"Sessions: {len(sessions)} [{since.strftime('%H:%M')} – {until.strftime('%H:%M')} VN]")

    locked_sessions, locked_events = _fetch_locks(conn)
    if locked_sessions:
        log.info(f"Locked (manual): {len(locked_sessions)} sessions, {len(locked_events)} events")

    all_candidates = []
    total_skipped  = 0

    for i, session in enumerate(sessions, 1):
        sk = (session["door_id"], str(session["event_time_vn"]), session["direction"])
        tag = f"[{i:03d}/{len(sessions)}]"
        if sk in locked_sessions:
            log.info(f"{tag} {session['event_time_vn']} {session['direction']:8s} → chốt tay, bỏ qua")
            continue

        candidates, skipped = _build_candidates_for_session(session, client)
        total_skipped += skipped
        all_candidates.extend(candidates)
        log.info(f"{tag} {session['event_time_vn']} {session['direction']:8s}"
                 f" → {len(candidates)} candidates, {skipped} active skipped")

    # Resolve conflicts across sessions TRƯỚC khi ghi DB
    log.info(f"Resolving conflicts across {len(all_candidates)} total candidates...")
    resolved = _resolve_conflicts(all_candidates, frozenset(locked_events))

    matched = sum(1 for r in resolved if r["is_best_match"])
    log.info(f"After resolve: {matched} sessions have best_match, {len(resolved)} total rows")

    if not dry_run:
        _upsert(conn, resolved)
        _log_run(conn, {
            "sessions_scanned": len(sessions),
            "events_queried":   len(all_candidates) + total_skipped,
            "matches_found":    matched,
            "skipped_active":   total_skipped,
            "time_window_sec":  cfg.window_sec,
            "notes":            f"since={since.isoformat()} until={until.isoformat()}",
        })

    conn.close()
    return {
        "sessions":       len(sessions),
        "matched":        matched,
        "clips":          len(resolved),
        "skipped_active": total_skipped,
    }
