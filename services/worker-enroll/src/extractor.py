"""
extractor.py — GPU feature extraction (InsightFace buffalo_l)
Face 512-dim + age + gender + color upper/lower 24-dim + body_ratio
"""
import logging, os, time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

import cv2
import numpy as np

log = logging.getLogger(__name__)

def _setup_cudnn():
    try:
        import nvidia.cudnn
        lib = os.path.dirname(nvidia.cudnn.__file__) + "/lib"
        cur = os.environ.get("LD_LIBRARY_PATH", "")
        if lib not in cur:
            os.environ["LD_LIBRARY_PATH"] = f"{lib}:{cur}"
    except ImportError:
        log.warning("nvidia-cudnn-cu12 not found — may fall back to CPU")


@dataclass
class PersonFeatures:
    face_embedding:  Optional[np.ndarray]  # (512,) L2-norm, None if no face
    face_quality:    float                  # avg det_score
    face_frame_count: int
    source_cam:      Optional[str]
    age:             Optional[int]
    gender:          Optional[str]
    color_upper:     Optional[np.ndarray]  # (24,) HSV hist upper body
    color_lower:     Optional[np.ndarray]  # (24,) HSV hist lower body
    body_ratio:      float                 # height/width
    appearance_notes: str
    avg_x_norm:      float = 0.5           # for cross-camera person matching


@dataclass
class ExtractionResult:
    source:      str           # 'snapshot' | 'video'
    camera_id:   str
    frames:      int
    persons:     List[PersonFeatures]
    confidence:  float
    face_score:  float
    color_score: float
    multi_person: bool
    has_occlusion: bool


class Extractor:
    _inst: Optional["Extractor"] = None

    @classmethod
    def get(cls) -> "Extractor":
        if cls._inst is None:
            _setup_cudnn()
            cls._inst = cls()
            cls._inst._load()
        return cls._inst

    def _load(self):
        from insightface.app import FaceAnalysis
        t0 = time.perf_counter()
        self._app = FaceAnalysis(
            name="buffalo_l",
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        self._app.prepare(ctx_id=0, det_size=(640, 640))
        log.info(f"InsightFace loaded in {(time.perf_counter()-t0)*1000:.0f}ms")

    def extract_snapshot(self, path: Path, cam: str) -> ExtractionResult:
        img = cv2.imread(str(path))
        if img is None:
            return self._empty(cam, "snapshot")
        persons = self._detect(img, cam)
        conf, fs, cs = self._confidence(persons, cam)
        return ExtractionResult("snapshot", cam, 1, persons, conf, fs, cs,
                                len(persons) > 1, False)

    def extract_clip(self, path: Path, cam: str,
                     sample_fps=1.0, max_frames=30, early_exit=0.85) -> ExtractionResult:
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            return self._empty(cam, "video")
        fps = cap.get(cv2.CAP_PROP_FPS) or 10.0
        w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        step = max(1, int(fps / sample_fps))
        buckets: dict = {}
        n, best, low = 0, 0.0, 0
        fi = 0
        while n < max_frames:
            cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
            ret, frame = cap.read()
            if not ret: break
            for p in self._detect(frame, cam):
                key = f"{int(p.avg_x_norm * 8):02d}"
                buckets.setdefault(key, []).append(p)
                if p.face_quality > best: best = p.face_quality
                if p.face_quality < 0.35: low += 1
            n += 1; fi += step
            if best >= early_exit: break
        cap.release()
        merged = [m for m in (self._merge(crops, cam) for crops in buckets.values()) if m]
        conf, fs, cs = self._confidence(merged, cam)
        return ExtractionResult("video", cam, n, merged, conf, fs, cs,
                                len(merged) > 1, low > n * 0.5)

    def _detect(self, frame: np.ndarray, cam: str) -> List[PersonFeatures]:
        try: faces = self._app.get(frame)
        except: return []
        h, w = frame.shape[:2]
        results = []
        for face in faces:
            if face.det_score < 0.20: continue
            x1,y1,x2,y2 = [int(v) for v in face.bbox]
            fh, fw = y2-y1, x2-x1
            # upper body crop
            uy1 = max(0,y1); uy2 = min(h,y2+fh*2)
            ux1 = max(0,x1-fw//2); ux2 = min(w,x2+fw//2)
            # lower body crop
            ly1 = uy2; ly2 = min(h,ly1+fh*3)
            cu = self._hist(frame[uy1:uy2, ux1:ux2])
            cl = self._hist(frame[ly1:ly2, ux1:ux2])
            br = (ly2-y1) / max(fw,1)
            age = int(face.age) if hasattr(face,"age") and face.age else None
            gen = ("male" if face.gender==1 else "female") if hasattr(face,"gender") else None
            emb = face.normed_embedding.astype(np.float32)
            notes = self._notes(cu, gen, age)
            results.append(PersonFeatures(
                face_embedding=emb, face_quality=float(face.det_score),
                face_frame_count=1 if face.det_score>=0.30 else 0,
                source_cam=cam, age=age, gender=gen,
                color_upper=cu, color_lower=cl, body_ratio=br,
                appearance_notes=notes,
                avg_x_norm=(x1+x2)/2/max(w,1),
            ))
        return results

    def _merge(self, items: List[PersonFeatures], cam: str) -> Optional[PersonFeatures]:
        if not items: return None
        good = [p.face_embedding for p in items if p.face_quality>=0.30 and p.face_embedding is not None]
        scores = [p.face_quality for p in items]
        emb = None
        if good:
            m = np.stack(good).mean(0); n = np.linalg.norm(m)
            emb = (m/n if n>0 else m).astype(np.float32)
        cu = self._mean_norm([p.color_upper for p in items if p.color_upper is not None])
        cl = self._mean_norm([p.color_lower for p in items if p.color_lower is not None])
        best = max(items, key=lambda p: p.face_quality)
        return PersonFeatures(
            face_embedding=emb, face_quality=float(np.mean(scores)),
            face_frame_count=len(good), source_cam=cam,
            age=best.age, gender=best.gender,
            color_upper=cu, color_lower=cl,
            body_ratio=float(np.mean([p.body_ratio for p in items])),
            appearance_notes=best.appearance_notes,
            avg_x_norm=float(np.mean([p.avg_x_norm for p in items])),
        )

    def _hist(self, crop: np.ndarray, bins=24) -> Optional[np.ndarray]:
        if crop is None or crop.size==0 or min(crop.shape[:2])<8: return None
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        b = bins//3
        vec = np.concatenate([
            cv2.calcHist([hsv],[0],None,[b],[0,180]).flatten(),
            cv2.calcHist([hsv],[1],None,[b],[0,256]).flatten(),
            cv2.calcHist([hsv],[2],None,[b],[0,256]).flatten(),
        ]).astype(np.float32)
        n = np.linalg.norm(vec)
        return vec/n if n>0 else vec

    def _mean_norm(self, hists):
        if not hists: return None
        m = np.stack(hists).mean(0).astype(np.float32)
        n = np.linalg.norm(m)
        return m/n if n>0 else m

    def _confidence(self, persons: List[PersonFeatures], cam: str) -> Tuple[float,float,float]:
        from config import CAM, FACE_CONFIDENT
        cfg = CAM.get(cam)
        if not persons or not cfg: return 0.0, 0.0, 0.0
        best = max(persons, key=lambda p: p.face_quality)
        fs = min(1.0, best.face_quality / max(FACE_CONFIDENT, 0.01))
        cs = 0.5 if (best.color_upper is not None or best.color_lower is not None) else 0.0
        conf = min(1.0, cfg.face_weight * fs + cfg.color_weight * cs)
        return conf, best.face_quality, cs

    def _notes(self, cu, gender, age) -> str:
        parts = []
        if gender: parts.append("Nam" if gender=="male" else "Nữ")
        if age:    parts.append(f"~{age}t")
        if cu is not None:
            hue = int(np.argmax(cu[:8])) * (180/8)
            sat = cu[8:16].mean()
            c = ("trắng/sáng" if cu[16:].mean()>0.5 else "đen/tối") if sat<0.03 \
                else "đỏ" if hue<15 or hue>165 \
                else "vàng/cam" if hue<35 \
                else "xanh lá" if hue<75 \
                else "xanh dương" if hue<130 \
                else "tím/hồng"
            parts.append(f"áo {c}")
        return " · ".join(parts)

    def _empty(self, cam, src) -> ExtractionResult:
        return ExtractionResult(src, cam, 0, [], 0.0, 0.0, 0.0, False, False)
