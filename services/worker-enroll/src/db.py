"""
db.py — Database layer (psycopg2, sync — khớp với project)
READ:  gate_sessions (view), gate_session_clips
WRITE: enroll.* schema chỉ
"""
import uuid
import logging
from contextlib import contextmanager
from typing import List, Optional, Tuple

import psycopg2
import psycopg2.extras

from config import db_dsn, WORKER_ID

log = logging.getLogger(__name__)


@contextmanager
def get_conn():
    conn = psycopg2.connect(db_dsn(), cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()


# ── Gate data (READ ONLY) ────────────────────────────────────

def poll_new_gate_events(since_min: int = 15) -> List[dict]:
    """Lấy gate events mới chưa có job trong job_queue"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT gs.door_id, gs.unlock_id,
                       gs.event_time_vn, gs.label AS room_label
                FROM gate_sessions gs
                WHERE gs.method      = 'password'
                  AND gs.label       LIKE 'P.%%'
                  AND gs.event_time_vn >= now() - (%(m)s || ' minutes')::interval
                  AND NOT EXISTS (
                      SELECT 1 FROM enroll.job_queue jq
                      WHERE jq.door_id   = gs.door_id::text
                        AND jq.unlock_id = gs.unlock_id::text
                  )
                ORDER BY gs.event_time_vn DESC
            """, {"m": str(since_min)})
            return [dict(r) for r in cur.fetchall()]


def get_gate_clips(door_id: str, unlock_id: str) -> List[dict]:
    """
    Clips từ gate_session_clips cho 1 gate event.
    Join trực tiếp qua unlock_id (BIGINT) — tránh join view gate_sessions phức tạp.
    Sort: N1 trước, S1, S2 sau — đúng priority.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    gsc.id, gsc.camera,
                    gsc.frigate_event_id,
                    gsc.clip_url, gsc.snapshot_url,
                    gsc.clip_finalized,
                    gsc.frigate_score, gsc.event_time_vn
                FROM gate_session_clips gsc
                WHERE gsc.unlock_id = %(uid)s::bigint
                  AND gsc.direction = 'incoming'
                ORDER BY
                    CASE gsc.camera
                        WHEN 'N1' THEN 1
                        WHEN 'S1' THEN 2
                        WHEN 'S2' THEN 3
                        ELSE 9
                    END,
                    COALESCE(gsc.frigate_score, 0) DESC
            """, {"uid": unlock_id})
            return [dict(r) for r in cur.fetchall()]


# ── Job queue ────────────────────────────────────────────────

def enqueue(door_id: str, unlock_id: str, event_time_vn, room_label: str,
            delay_s: int) -> Optional[int]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO enroll.job_queue
                    (door_id, unlock_id, event_time_vn, room_label,
                     status, scheduled_at)
                VALUES (%(d)s,%(u)s,%(t)s,%(r)s,'pending',
                        now()+(%(ds)s||' seconds')::interval)
                ON CONFLICT (door_id, unlock_id) DO NOTHING
                RETURNING id
            """, {"d": door_id, "u": unlock_id, "t": event_time_vn,
                  "r": room_label, "ds": str(delay_s)})
            conn.commit()
            row = cur.fetchone()
            return row["id"] if row else None


def claim_job() -> Optional[dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM enroll.claim_job(%(w)s)", {"w": WORKER_ID})
            conn.commit()
            row = cur.fetchone()
            return dict(row) if row else None


def done_job(job_id: int, session_id: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE enroll.job_queue
                SET status='done', finished_at=now(),
                    enroll_session_id=%(sid)s, locked_by=NULL
                WHERE id=%(jid)s
            """, {"sid": session_id, "jid": job_id})
        conn.commit()


def fail_job(job_id: int, error: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE enroll.job_queue SET
                    status = CASE
                        WHEN attempt_count < max_attempts THEN 'pending'
                        ELSE 'failed' END,
                    last_error   = %(err)s,
                    finished_at  = CASE
                        WHEN attempt_count >= max_attempts THEN now()
                        ELSE NULL END,
                    scheduled_at = CASE
                        WHEN attempt_count < max_attempts
                        THEN now() + power(2,attempt_count)*interval '1 minute'
                        ELSE scheduled_at END,
                    locked_by = NULL
                WHERE id = %(jid)s
            """, {"err": error, "jid": job_id})
        conn.commit()


def skip_job(job_id: int, reason: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE enroll.job_queue
                SET status='skipped', finished_at=now(),
                    last_error=%(r)s, locked_by=NULL
                WHERE id=%(jid)s
            """, {"r": reason, "jid": job_id})
        conn.commit()


def upsert_heartbeat(worker_id: str, status: str, active_jobs: int,
                     max_concurrent: int, poll_interval_s: int,
                     started_at, hostname: str = "") -> None:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO enroll.worker_heartbeat
                        (worker_id, last_beat, status, active_jobs,
                         max_concurrent, poll_interval_s, hostname, started_at, updated_at)
                    VALUES (%(w)s, now(), %(s)s, %(a)s, %(mc)s, %(pi)s, %(h)s, %(st)s, now())
                    ON CONFLICT (worker_id) DO UPDATE SET
                        last_beat       = now(),
                        status          = EXCLUDED.status,
                        active_jobs     = EXCLUDED.active_jobs,
                        max_concurrent  = EXCLUDED.max_concurrent,
                        poll_interval_s = EXCLUDED.poll_interval_s,
                        hostname        = EXCLUDED.hostname,
                        updated_at      = now()
                """, {"w": worker_id, "s": status, "a": active_jobs,
                      "mc": max_concurrent, "pi": poll_interval_s,
                      "h": hostname, "st": started_at})
            conn.commit()
    except Exception as e:
        log.warning(f"heartbeat write error: {e}")


def release_stuck(timeout_min: int = 30) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT enroll.release_stuck(%s) AS n", (timeout_min,))
            conn.commit()
            return cur.fetchone()["n"] or 0


# ── Enroll writes ────────────────────────────────────────────

def create_session(job_id: int, door_id: str, unlock_id: str,
                   event_time_vn, room_label: str) -> str:
    sid = str(uuid.uuid4())
    with get_conn() as conn:
        with conn.cursor() as cur:
            # On retry: keep existing id (FK from camera_clip_results), reset all result fields
            cur.execute("""
                INSERT INTO enroll.enroll_sessions
                    (id,job_id,door_id,unlock_id,event_time_vn,room_label,status)
                VALUES (%(sid)s,%(jid)s,%(d)s,%(u)s,%(t)s,%(r)s,'processing')
                ON CONFLICT (door_id, unlock_id) DO UPDATE SET
                    job_id           = EXCLUDED.job_id,
                    status           = 'processing',
                    person_count     = 0,
                    persons_enrolled = 0,
                    overall_quality  = NULL,
                    best_face_score  = NULL,
                    stopped_at_cam   = NULL,
                    used_video       = false,
                    fetch_ms         = NULL,
                    extract_ms       = NULL,
                    total_ms         = NULL,
                    error_msg        = NULL,
                    warnings         = NULL,
                    finished_at      = NULL
                RETURNING id
            """, {"sid": sid, "jid": job_id, "d": door_id,
                  "u": unlock_id, "t": event_time_vn, "r": room_label})
            actual_sid = cur.fetchone()["id"]
            # Clean up previous attempt's results so retry starts fresh
            cur.execute(
                "DELETE FROM enroll.camera_clip_results WHERE enroll_session_id = %s",
                (actual_sid,))
            cur.execute(
                "DELETE FROM enroll.person_session_map WHERE enroll_session_id = %s",
                (actual_sid,))
        conn.commit()
    return actual_sid


def update_session(sid: str, **kw) -> None:
    allowed = {
        "status","person_count","persons_enrolled","overall_quality",
        "best_face_score","stopped_at_cam","used_video",
        "fetch_ms","extract_ms","total_ms","error_msg","warnings",
    }
    fields = {k: v for k, v in kw.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=%({k})s" for k in fields) + ", finished_at=now()"
    fields["_sid"] = sid
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE enroll.enroll_sessions SET {sets} WHERE id=%(_sid)s",
                fields,
            )
        conn.commit()


def save_clip_result(sid: str, camera_id: str, camera_order: int,
                     frigate_event_id: Optional[str], gsc_id: Optional[int],
                     source_type: str, frames: int, persons: int,
                     confidence: float, face_score: float, color_score: float,
                     stopped_here: bool, multi_person: bool, occlusion: bool) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO enroll.camera_clip_results
                    (enroll_session_id,camera_id,camera_order,frigate_event_id,gsc_id,
                     source_type,frames_processed,persons_detected,
                     confidence,face_score,color_score,
                     stopped_here,has_multi_person,has_occlusion)
                VALUES (%(sid)s,%(cam)s,%(ord)s,%(feid)s,%(gid)s,
                        %(src)s,%(fr)s,%(pe)s,
                        %(conf)s,%(fs)s,%(cs)s,
                        %(stop)s,%(mp)s,%(occ)s)
            """, dict(sid=sid, cam=camera_id, ord=camera_order,
                      feid=frigate_event_id, gid=gsc_id,
                      src=source_type, fr=frames, pe=persons,
                      conf=confidence, fs=face_score, cs=color_score,
                      stop=stopped_here, mp=multi_person, occ=occlusion))
        conn.commit()


def find_similar_profile(face_emb: List[float], room_label: str,
                         threshold: float = 0.40) -> Optional[Tuple[str, float]]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, 1-(face_embedding<=>%(emb)s::vector) AS sim
                FROM enroll.person_profiles
                WHERE known_room=%(room)s AND face_embedding IS NOT NULL
                  AND is_active=true
                ORDER BY face_embedding<=>%(emb)s::vector
                LIMIT 1
            """, {"emb": face_emb, "room": room_label})
            row = cur.fetchone()
            if row and row["sim"] >= threshold:
                return row["id"], float(row["sim"])
            return None


def _weighted_avg_emb(old_raw, count: int, new_emb: List[float]) -> List[float]:
    import numpy as np
    if old_raw is None:
        return new_emb
    if isinstance(old_raw, str):
        old = np.array([float(x) for x in old_raw.strip()[1:-1].split(",")], dtype=np.float32)
    else:
        old = np.array(old_raw, dtype=np.float32)
    return ((old * count + np.array(new_emb, dtype=np.float32)) / (count + 1)).tolist()


def upsert_profile(sid: str, room_label: str,
                   face_emb: Optional[List[float]], face_quality: Optional[float],
                   face_src_cam: Optional[str], face_frame_cnt: int,
                   age: Optional[int], gender: Optional[str],
                   color_upper: Optional[List[float]], color_lower: Optional[List[float]],
                   body_ratio: Optional[float], appearance_notes: str,
                   existing_id: Optional[str] = None,
                   merge_sim: Optional[float] = None) -> Tuple[str, bool]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            if existing_id:
                # Compute weighted average in Python — pgvector scalar multiply not supported
                merged_emb = None
                if face_emb is not None:
                    cur.execute(
                        "SELECT face_embedding, enroll_count FROM enroll.person_profiles WHERE id=%s",
                        (existing_id,)
                    )
                    prof = cur.fetchone()
                    if prof:
                        merged_emb = _weighted_avg_emb(prof["face_embedding"], prof["enroll_count"], face_emb)
                    else:
                        merged_emb = face_emb

                cur.execute("""
                    UPDATE enroll.person_profiles SET
                        face_embedding   = COALESCE(%(fe)s::vector, face_embedding),
                        face_quality     = GREATEST(COALESCE(face_quality,0),COALESCE(%(fq)s,0)),
                        face_source_cam  = COALESCE(%(fsc)s, face_source_cam),
                        face_frame_count = face_frame_count + %(ffc)s,
                        age_estimate     = COALESCE(%(age)s, age_estimate),
                        gender           = COALESCE(%(gen)s, gender),
                        color_upper      = COALESCE(%(cu)s::vector, color_upper),
                        color_lower      = COALESCE(%(cl)s::vector, color_lower),
                        body_ratio       = COALESCE(%(br)s, body_ratio),
                        appearance_notes = COALESCE(%(an)s, appearance_notes),
                        enroll_count     = enroll_count + 1,
                        last_seen_ts     = now(), updated_at = now()
                    WHERE id = %(pid)s
                """, dict(fe=merged_emb, fq=face_quality, fsc=face_src_cam,
                          ffc=face_frame_cnt, age=age, gen=gender,
                          cu=color_upper, cl=color_lower, br=body_ratio,
                          an=appearance_notes, pid=existing_id))
                pid, is_new = existing_id, False
            else:
                pid = str(uuid.uuid4())
                confidence = "gate_code" if (face_quality or 0) >= 0.45 else "appearance_only"
                cur.execute("""
                    INSERT INTO enroll.person_profiles
                        (id,known_room,confidence_lvl,face_embedding,face_quality,
                         face_source_cam,face_frame_count,age_estimate,gender,
                         color_upper,color_lower,body_ratio,appearance_notes)
                    VALUES(%(pid)s,%(rm)s,%(conf)s,%(fe)s::vector,%(fq)s,
                           %(fsc)s,%(ffc)s,%(age)s,%(gen)s,
                           %(cu)s::vector,%(cl)s::vector,%(br)s,%(an)s)
                """, dict(pid=pid, rm=room_label, conf=confidence,
                          fe=face_emb, fq=face_quality, fsc=face_src_cam,
                          ffc=face_frame_cnt, age=age, gen=gender,
                          cu=color_upper, cl=color_lower, br=body_ratio,
                          an=appearance_notes))
                cur.execute("""
                    INSERT INTO enroll.room_stays
                        (person_id,room_id,entry_ts,entry_confidence)
                    VALUES(%(pid)s,%(rm)s,now(),'gate_code')
                """, {"pid": pid, "rm": room_label})
                is_new = True

            cur.execute("""
                INSERT INTO enroll.person_session_map
                    (person_id,enroll_session_id,is_new,merge_sim)
                VALUES(%(pid)s,%(sid)s,%(new)s,%(sim)s)
                ON CONFLICT DO NOTHING
            """, {"pid": pid, "sid": sid, "new": is_new, "sim": merge_sim})
        conn.commit()
        return pid, is_new
