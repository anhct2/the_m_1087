"""
pipeline.py — Enroll job orchestrator

Per gate event:
  for cam in [N1, S1, S2]:
    for clip in gate_session_clips (frigate_score DESC):
      1. Try snapshot → if confidence >= CONF_STOP: DONE
      2. If snapshot < SNAP_OK → try video → if >= CONF_STOP: DONE
    Accumulate persons across cameras (merge by x-position)
  Upsert person_profiles
"""
import logging, shutil, tempfile, time
from pathlib import Path
from typing import List, Optional, Tuple

import requests

from config import (
    CAMERA_ORDER, OUTGOING_CAMERA_ORDER, CAM,
    CONF_STOP, CONF_MEDIUM, CONF_LOW,
    FACE_POSSIBLE, MERGE_FACE_SIM, RECOGNIZE_SIM_MIN, SNAP_OK_THRESHOLD,
    MAX_FRAMES, SAMPLE_FPS, EARLY_EXIT_SCORE,
    FRIGATE_URL, FRIGATE_USER, FRIGATE_PASS,
)
from db import (
    get_gate_clips, create_session, update_session, save_clip_result,
    find_similar_profile, find_best_profile_match, close_room_stay,
    upsert_profile, done_job, fail_job, skip_job,
)
from extractor import Extractor, ExtractionResult, PersonFeatures

log = logging.getLogger(__name__)
_BASE = FRIGATE_URL.rstrip("/")


def _frigate_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"X-CSRF-TOKEN": "1", "X-CACHE-BYPASS": "1"})
    if FRIGATE_PASS:
        r = s.post(f"{_BASE}/api/login",
                   json={"user": FRIGATE_USER, "password": FRIGATE_PASS}, timeout=10)
        if r.status_code not in (200, 204):
            raise RuntimeError(f"Frigate login failed {r.status_code}")
    return s


def _internal(url: Optional[str]) -> Optional[str]:
    if not url: return None
    for pub in ["https://f87.m2s.io.vn", "http://f87.m2s.io.vn"]:
        if url.startswith(pub):
            return url.replace(pub, _BASE)
    return url


def _download(sess: requests.Session, url: str, dest: Path) -> bool:
    try:
        r = sess.get(url, timeout=60, stream=True)
        if r.status_code != 200: return False
        with open(dest, "wb") as f:
            for chunk in r.iter_content(65536): f.write(chunk)
        return True
    except Exception as e:
        log.debug(f"download fail {url}: {e}")
        return False


def run_job(job_id: int, door_id: str, unlock_id: str,
            event_time_vn, room_label: str) -> None:
    t0 = time.perf_counter()
    sid = None
    try:
        sid = create_session(job_id, door_id, unlock_id, event_time_vn, room_label)
        log.info(f"[Job#{job_id}] start room={room_label} session={sid[:8]}")

        t_fetch = time.perf_counter()
        clips = get_gate_clips(door_id, unlock_id)
        fetch_ms = int((time.perf_counter()-t_fetch)*1000)

        if not clips:
            log.warning(f"[Job#{job_id}] no clips found")
            update_session(sid, status="no_detection", error_msg="no clips",
                           total_ms=int((time.perf_counter()-t0)*1000))
            skip_job(job_id, "no clips")
            return

        log.info(f"[Job#{job_id}] {len(clips)} clips: "
                 f"{[(c['camera'], c['frigate_score']) for c in clips]}")

        extractor = Extractor.get()
        tmp = Path(tempfile.mkdtemp(prefix=f"enroll_{job_id}_"))
        accumulated: List[PersonFeatures] = []
        best_conf = 0.0; best_face = 0.0
        stopped_cam = None; used_video = False; warnings = []

        try:
            sess = _frigate_session()
            t_ext = time.perf_counter()

            for cam_id in CAMERA_ORDER:
                cam_clips = [c for c in clips if c["camera"] == cam_id]
                if not cam_clips: continue
                cfg = CAM[cam_id]

                result, src_used, used_clip = _process_camera(
                    sess, cam_clips, cam_id, extractor, tmp, warnings
                )
                if result is None: continue
                if src_used == "video": used_video = True

                _merge_into(accumulated, result.persons)
                if result.confidence > best_conf: best_conf = result.confidence
                if result.face_score > best_face: best_face = result.face_score

                stopped_here = result.confidence >= CONF_STOP
                save_clip_result(
                    sid, cam_id, cfg.order,
                    used_clip.get("frigate_event_id") if used_clip else None,
                    used_clip.get("id") if used_clip else None,
                    src_used, result.frames, len(result.persons),
                    result.confidence, result.face_score, result.color_score,
                    stopped_here, result.multi_person, result.has_occlusion,
                )
                if stopped_here:
                    stopped_cam = cam_id
                    log.info(f"[Job#{job_id}] conf={result.confidence:.3f} >= {CONF_STOP} at {cam_id} → STOP")
                    break

            extract_ms = int((time.perf_counter()-t_ext)*1000)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        persons_enrolled = 0
        if accumulated:
            persons_enrolled = _upsert_persons(accumulated, room_label, sid)

        status = ("enrolled"      if best_conf >= CONF_MEDIUM else
                  "low_quality"   if best_conf >= CONF_LOW else
                  "no_detection")

        total_ms = int((time.perf_counter()-t0)*1000)
        update_session(sid, status=status,
                       person_count=len(accumulated), persons_enrolled=persons_enrolled,
                       overall_quality=round(best_conf, 4), best_face_score=round(best_face, 4),
                       stopped_at_cam=stopped_cam, used_video=used_video,
                       fetch_ms=fetch_ms, extract_ms=extract_ms, total_ms=total_ms,
                       warnings=warnings or None)
        done_job(job_id, sid)
        log.info(f"[Job#{job_id}] {status} persons={persons_enrolled}/{len(accumulated)} "
                 f"conf={best_conf:.3f} {total_ms}ms")

    except Exception as e:
        log.exception(f"[Job#{job_id}] error: {e}")
        total_ms = int((time.perf_counter()-t0)*1000)
        if sid:
            update_session(sid, status="failed", error_msg=str(e), total_ms=total_ms)
        fail_job(job_id, str(e))


def _process_camera(sess, clips: List[dict], cam_id: str,
                    extractor: Extractor, tmp: Path,
                    warnings: List[str]) -> Tuple[Optional[ExtractionResult], str, Optional[dict]]:
    best_result = None; best_clip = None

    for clip in clips:
        # 1. Snapshot
        snap_result = None
        snap_url = _internal(clip.get("snapshot_url"))
        if snap_url:
            snap_path = tmp / f"{cam_id}_{clip['id']}_snap.jpg"
            if _download(sess, snap_url, snap_path):
                snap_result = extractor.extract_snapshot(snap_path, cam_id)
                log.debug(f"[{cam_id}] clip#{clip['id']} snap conf={snap_result.confidence:.3f}")
                if snap_result.confidence >= CONF_STOP:
                    return snap_result, "snapshot", clip
                if snap_result.confidence >= SNAP_OK_THRESHOLD:
                    if best_result is None or snap_result.confidence > best_result.confidence:
                        best_result = snap_result; best_clip = clip

        # 2. Video (nếu snapshot chưa đủ)
        clip_url = _internal(clip.get("clip_url"))
        if clip_url and (snap_result is None or snap_result.confidence < SNAP_OK_THRESHOLD):
            clip_path = tmp / f"{cam_id}_{clip['id']}.mp4"
            if _download(sess, clip_url, clip_path):
                vid = extractor.extract_clip(clip_path, cam_id,
                                             SAMPLE_FPS, MAX_FRAMES, EARLY_EXIT_SCORE)
                log.debug(f"[{cam_id}] clip#{clip['id']} video conf={vid.confidence:.3f} "
                          f"frames={vid.frames}")
                if vid.confidence >= CONF_STOP:
                    return vid, "video", clip
                if best_result is None or vid.confidence > best_result.confidence:
                    best_result = vid; best_clip = clip
            else:
                warnings.append(f"{cam_id}: clip download failed")

    src = "snapshot" if best_result and best_result.source == "snapshot" else "video"
    return best_result, src, best_clip


def _merge_into(acc: List[PersonFeatures], new_persons: List[PersonFeatures]) -> None:
    import numpy as np
    for p in new_persons:
        match = None; best_dx = 0.30
        for ex in acc:
            dx = abs(ex.avg_x_norm - p.avg_x_norm)
            if dx < best_dx: best_dx = dx; match = ex
        if match is None:
            acc.append(p)
        else:
            if p.face_quality > match.face_quality and p.face_embedding is not None:
                match.face_embedding = p.face_embedding
                match.face_quality = p.face_quality
                match.source_cam = p.source_cam
                if p.age:    match.age = p.age
                if p.gender: match.gender = p.gender
            for attr in ("color_upper", "color_lower"):
                pv = getattr(p, attr); mv = getattr(match, attr)
                if pv is not None:
                    if mv is not None:
                        m = (mv + pv) / 2; n = np.linalg.norm(m)
                        setattr(match, attr, m/n if n>0 else m)
                    else:
                        setattr(match, attr, pv)
            if len(p.appearance_notes) > len(match.appearance_notes):
                match.appearance_notes = p.appearance_notes


def run_outgoing_job(job_id: int, door_id: str, unlock_id: str,
                     event_time_vn, room_label: str) -> None:
    """
    Outgoing pipeline: nhận diện người rời cổng, đóng room_stay nếu match.
    Dùng cùng extraction nhưng search toàn bộ profiles thay vì tạo mới.
    """
    t0 = time.perf_counter()
    sid = None
    try:
        sid = create_session(job_id, door_id, unlock_id, event_time_vn, room_label,
                             direction='outgoing')
        log.info(f"[OJob#{job_id}] outgoing start room={room_label} session={sid[:8]}")

        t_fetch = time.perf_counter()
        clips = get_gate_clips(door_id, unlock_id, direction='outgoing')
        fetch_ms = int((time.perf_counter() - t_fetch) * 1000)

        if not clips:
            log.warning(f"[OJob#{job_id}] no outgoing clips")
            update_session(sid, status="no_detection", error_msg="no outgoing clips",
                           total_ms=int((time.perf_counter() - t0) * 1000))
            skip_job(job_id, "no outgoing clips")
            return

        log.info(f"[OJob#{job_id}] {len(clips)} clips: "
                 f"{[(c['camera'], c['frigate_score']) for c in clips]}")

        extractor = Extractor.get()
        tmp = Path(tempfile.mkdtemp(prefix=f"out_{job_id}_"))
        accumulated: List[PersonFeatures] = []
        best_conf = 0.0; best_face = 0.0
        stopped_cam = None; used_video = False; warnings = []

        try:
            sess = _frigate_session()
            t_ext = time.perf_counter()

            for cam_id in OUTGOING_CAMERA_ORDER:
                cam_clips = [c for c in clips if c["camera"] == cam_id]
                if not cam_clips:
                    continue
                cfg = CAM.get(cam_id)
                if not cfg:
                    continue

                result, src_used, used_clip = _process_camera(
                    sess, cam_clips, cam_id, extractor, tmp, warnings
                )
                if result is None:
                    continue
                if src_used == "video":
                    used_video = True

                _merge_into(accumulated, result.persons)
                if result.confidence > best_conf:
                    best_conf = result.confidence
                if result.face_score > best_face:
                    best_face = result.face_score

                stopped_here = result.confidence >= CONF_STOP
                save_clip_result(
                    sid, cam_id, cfg.order,
                    used_clip.get("frigate_event_id") if used_clip else None,
                    used_clip.get("id") if used_clip else None,
                    src_used, result.frames, len(result.persons),
                    result.confidence, result.face_score, result.color_score,
                    stopped_here, result.multi_person, result.has_occlusion,
                )
                if stopped_here:
                    stopped_cam = cam_id
                    log.info(f"[OJob#{job_id}] conf={result.confidence:.3f} >= {CONF_STOP} at {cam_id} → STOP")
                    break

            extract_ms = int((time.perf_counter() - t_ext) * 1000)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        # Nhận diện: chỉ match người đang có room_stay mở và entry_ts < event_time_vn
        best_pid = None; best_sim = 0.0; best_room = None
        for p in accumulated:
            if p.face_embedding is not None and p.face_quality >= FACE_POSSIBLE:
                match = find_best_profile_match(
                    p.face_embedding.tolist(), event_time_vn, RECOGNIZE_SIM_MIN
                )
                if match and match[1] > best_sim:
                    best_pid, best_sim, best_room = match[0], match[1], match[2]

        if best_pid:
            n = close_room_stay(best_pid, event_time_vn, door_id, unlock_id)
            log.info(f"[OJob#{job_id}] identified {best_pid[:8]} "
                     f"room={best_room} sim={best_sim:.3f} closed {n} room_stay(s)")
            status = "enrolled"
            # Cập nhật room_label của session từ profile để hiển thị đúng trên UI
            update_session(sid, room_label=best_room or '')
        else:
            status = "low_quality" if best_conf >= CONF_LOW else "no_detection"

        total_ms = int((time.perf_counter() - t0) * 1000)
        update_session(
            sid, status=status,
            person_count=len(accumulated),
            persons_enrolled=1 if best_pid else 0,
            overall_quality=round(best_conf, 4),
            best_face_score=round(best_face, 4),
            stopped_at_cam=stopped_cam, used_video=used_video,
            fetch_ms=fetch_ms, extract_ms=extract_ms, total_ms=total_ms,
            warnings=warnings or None,
            recognized_person_id=best_pid,
            recognition_sim=round(best_sim, 4) if best_pid else None,
        )
        done_job(job_id, sid)
        log.info(f"[OJob#{job_id}] {status} identified={bool(best_pid)} "
                 f"room={best_room} conf={best_conf:.3f} {total_ms}ms")

    except Exception as e:
        log.exception(f"[OJob#{job_id}] error: {e}")
        total_ms = int((time.perf_counter() - t0) * 1000)
        if sid:
            update_session(sid, status="failed", error_msg=str(e), total_ms=total_ms)
        fail_job(job_id, str(e))


def _upsert_persons(persons: List[PersonFeatures], room_label: str, sid: str) -> int:
    enrolled = 0
    for p in persons:
        fe_list = p.face_embedding.tolist() if p.face_embedding is not None else None
        cu_list = p.color_upper.tolist() if p.color_upper is not None else None
        cl_list = p.color_lower.tolist() if p.color_lower is not None else None

        existing_id = merge_sim = None
        if fe_list and p.face_quality >= FACE_POSSIBLE:
            match = find_similar_profile(fe_list, room_label, MERGE_FACE_SIM)
            if match: existing_id, merge_sim = match

        fq = p.face_quality if p.face_quality >= FACE_POSSIBLE else None
        pid, is_new = upsert_profile(
            sid, room_label, fe_list, fq, p.source_cam, p.face_frame_count,
            p.age, p.gender, cu_list, cl_list, p.body_ratio, p.appearance_notes,
            existing_id, merge_sim,
        )
        if pid:
            enrolled += 1
            log.info(f"Profile {'NEW' if is_new else 'MERGE'} {pid[:8]} "
                     f"room={room_label} face_q={p.face_quality:.3f}")
    return enrolled
