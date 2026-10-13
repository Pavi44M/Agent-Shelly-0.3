"""Run Shelly Vision on a video file, a webcam or a CCTV stream.

    python -m shelly vision run --source store.mp4 [--config modules/vision/vision.yaml] [--out outputs/vision]
                                [--show] [--save-video] [--model yolo11s.pt] [--stride 2] [--start 2026-10-13T07:00]
    python -m shelly vision demo            a synthetic trading day (no camera, no people) -> outputs/vision/demo
    python -m shelly vision purge           delete event logs older than privacy.retention_days

Needs `pip install ultralytics opencv-python` for real video (the analytics engine itself only needs numpy).
Every person is anonymised (head or whole body pixelated) BEFORE a frame is shown or written, frames are
never stored unless you ask for --save-video, and only counts, times and an anonymous heat grid are kept.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import yaml

from .engine import VisionEngine

ROOT = Path(__file__).resolve().parents[2]
CFG = ROOT / "modules/vision/vision.yaml"


def load_cfg(path=None, learned=True) -> dict:
    """the module config, with whatever the Skill Lab has learned (kept changes only) layered on top."""
    cfg = yaml.safe_load(open(path or CFG, encoding="utf-8"))
    if learned:
        from .skilllab import STATE, _set
        if STATE.exists():
            for k, v in json.loads(STATE.read_text()).get("knobs", {}).items(): _set(cfg, k, v)
    return cfg


def anonymise(frame, boxes, mode="head", method="pixelate"):
    """blur people in place before anything leaves this function (head = top 22% of the box)."""
    import cv2
    if mode == "off": return frame
    H, W = frame.shape[:2]
    for b in boxes:
        x1, y1, x2, y2 = [int(round(v)) for v in b[:4]]
        if mode == "head": y2 = y1 + max(8, int((y2 - y1) * .22))
        x1, y1, x2, y2 = max(0, x1), max(0, y1), min(W, x2), min(H, y2)
        if x2 - x1 < 4 or y2 - y1 < 4: continue
        roi = frame[y1:y2, x1:x2]
        if method == "blur": frame[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (0, 0), max(4, (x2 - x1) / 4))
        else:
            s = max(4, (x2 - x1) // 6)
            small = cv2.resize(roi, (max(1, (x2 - x1) // s), max(1, (y2 - y1) // s)), interpolation=cv2.INTER_LINEAR)
            frame[y1:y2, x1:x2] = cv2.resize(small, (x2 - x1, y2 - y1), interpolation=cv2.INTER_NEAREST)
    return frame


def overlay(frame, eng: VisionEngine, boxes):
    """draw the analysis: live heat (fading), zones with their numbers, the count line, tracked people."""
    import cv2
    out = frame.copy()
    h = eng.heat_live
    if (h > 0).any():
        top = float(np.percentile(h[h > 0], 99)) or 1
        norm = np.clip(h / top, 0, 1).astype(np.float32)
        col = cv2.resize(cv2.applyColorMap((norm * 255).astype(np.uint8), cv2.COLORMAP_INFERNO), (eng.W, eng.H))
        a = cv2.resize(norm * .55, (eng.W, eng.H))[..., None]
        out = (out * (1 - a) + col * a).astype(np.uint8)
    C = {"dwell": (216, 182, 99), "queue": (78, 193, 242), "restricted": (90, 90, 230)}
    for z in eng.zones:
        p = np.array(z["poly"], np.int32); c = C.get(z.get("kind"), (200, 200, 200))
        cv2.polylines(out, [p], True, c, 2)
        n = eng.queue_now(z["id"]) if z.get("kind") == "queue" else len(eng.visits.get(z["id"], []))
        label = f"{z['name']}  {'queue ' if z.get('kind') == 'queue' else ''}{n}"
        cv2.putText(out, label, (int(p[:, 0].min()) + 6, int(p[:, 1].min()) + 20), cv2.FONT_HERSHEY_SIMPLEX, .55, c, 2, cv2.LINE_AA)
    for L in eng.lines:
        cv2.line(out, tuple(map(int, L["a"])), tuple(map(int, L["b"])), (127, 209, 168), 3)
        cv2.putText(out, f"{L['name']}  IN {eng.counts[L['id'] + '_in']}  OUT {eng.counts[L['id'] + '_out']}",
                    (int(L["a"][0]), int(L["a"][1]) - 10), cv2.FONT_HERSHEY_SIMPLEX, .6, (127, 209, 168), 2, cv2.LINE_AA)
    for b in boxes:
        x1, y1, x2, y2 = [int(v) for v in b[1:5]]
        cv2.rectangle(out, (x1, y1), (x2, y2), (99, 182, 216), 1)
        cv2.circle(out, ((x1 + x2) // 2, y2), 3, (255, 255, 255), -1)
    s = f"{eng.clock():%H:%M:%S}  visitors {eng.visitors}  in store {eng.occupancy()}"
    cv2.rectangle(out, (0, 0), (len(s) * 11 + 20, 34), (18, 22, 30), -1)
    cv2.putText(out, s, (10, 23), cv2.FONT_HERSHEY_SIMPLEX, .62, (234, 240, 246), 2, cv2.LINE_AA)
    return out


def run_video(source, cfg=None, out="outputs/vision", show=False, save_video=False, model=None, stride=None, start=None, max_s=None):
    import cv2
    from ultralytics import YOLO          # optional dependency: pip install ultralytics
    cfg = cfg or load_cfg(); det = cfg.get("detector", {}); pv = cfg.get("privacy", {})
    cap = cv2.VideoCapture(int(source) if str(source).isdigit() else str(source))
    if not cap.isOpened(): raise SystemExit(f"cannot open {source}")
    fps = cap.get(cv2.CAP_PROP_FPS) or cfg["camera"].get("fps", 10)
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sx, sy = W / cfg["camera"]["width"], H / cfg["camera"]["height"]          # zones are drawn for the reference size: scale them
    if abs(sx - 1) > .01 or abs(sy - 1) > .01:
        for z in cfg["zones"]: z["poly"] = [[x * sx, y * sy] for x, y in z["poly"]]
        for L in cfg["counting"]["lines"]: L["a"] = [L["a"][0] * sx, L["a"][1] * sy]; L["b"] = [L["b"][0] * sx, L["b"][1] * sy]
        cfg["camera"]["width"], cfg["camera"]["height"] = W, H
    live = not Path(str(source)).exists()
    eng = VisionEngine(cfg, start=datetime.fromisoformat(start) if start else datetime.now().replace(microsecond=0))
    yolo = YOLO(model or det.get("model", "yolo11n.pt"))
    stride = int(stride or det.get("stride", 1)); n = 0; t0 = time.time()
    writer = None
    outp = Path(out); outp.mkdir(parents=True, exist_ok=True)
    while True:
        ok, frame = cap.read()
        if not ok: break
        n += 1
        if (n - 1) % stride: continue
        t = (time.time() - t0) if live else (n - 1) / fps
        if max_s and t > max_s: break
        r = yolo.track(frame, persist=True, tracker=det.get("tracker", "bytetrack.yaml"), conf=det.get("conf", .35),
                       classes=det.get("classes", [0]), imgsz=det.get("imgsz", 640), verbose=False)[0]
        dets = []
        if r.boxes is not None and r.boxes.id is not None:
            for (x1, y1, x2, y2), i, c in zip(r.boxes.xyxy.cpu().numpy(), r.boxes.id.cpu().numpy(), r.boxes.conf.cpu().numpy()):
                dets.append((int(i), x1, y1, x2, y2, float(c)))
        eng.update(t, dets)
        if show or save_video:
            safe = anonymise(frame, [d[1:5] for d in dets], pv.get("anonymise", "head"), pv.get("method", "pixelate"))
            view = overlay(safe, eng, dets)
            if save_video:
                if writer is None: writer = cv2.VideoWriter(str(outp / "vision.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), fps / stride, (W, H))
                writer.write(view)
            if show:
                cv2.imshow("Shelly Vision", view)
                if cv2.waitKey(1) & 0xFF in (27, ord("q")): break
    cap.release()
    if writer: writer.release()
    if show: cv2.destroyAllWindows()
    eng.update((eng.t or 0) + 10, [])
    s = eng.write(outp); eng.heat_png(outp / "heat_day.png")
    return s


def demo(out="outputs/vision/demo", seed=13):
    from .simulate import simulate
    cfg = load_cfg(); eng = VisionEngine(cfg, start=datetime(2026, 10, 13, 7, 0))
    simulate(cfg, eng, seed=seed)
    s = eng.write(out)
    try: eng.heat_png(Path(out) / "heat_day.png")
    except Exception: pass
    s["truth"] = eng.truth
    return s


def purge(out="outputs/vision", days=None):
    cfg = load_cfg(); days = days or cfg.get("privacy", {}).get("retention_days", 30)
    cut = time.time() - days * 86400; gone = 0
    for p in Path(out).rglob("events.jsonl"):
        if p.stat().st_mtime < cut: p.unlink(); gone += 1
    return gone
