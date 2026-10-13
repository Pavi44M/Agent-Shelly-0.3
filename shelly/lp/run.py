"""Run Shelly Loss Prevention.

    python -m shelly lp demo [--days 7]         synthetic week across every Shelly site, scored against the truth
    python -m shelly lp tune                    tune the concealment pattern (held-out check); waits for Pavi
    python -m shelly lp approve                 put the tuned settings live (Pavi only)
    python -m shelly lp pose --source aisle.mp4 read concealment gestures from a real video (needs ultralytics)
    python -m shelly lp pia --site store        the privacy impact checklist for a site

Policy checks run first: anything that would identify people or leave Shelly's own businesses refuses to start.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import yaml

from .policy import validate

ROOT = Path(__file__).resolve().parents[2]
CFG = ROOT / "modules/lp/lp.yaml"


def load_cfg(path=None, live=True) -> dict:
    """the module config; tuned settings are layered on only after Pavi approved them."""
    cfg = yaml.safe_load(open(path or CFG, encoding="utf-8"))
    validate(cfg)
    if live:
        from . import tune
        st = tune.load()
        if st and st.get("status") == "approved":
            cfg["pose"] = {**cfg.get("pose", {}), **{k.split(".")[1]: v for k, v in st["knobs"].items() if k.startswith("pose.")}}
            for k, v in st["knobs"].items():
                if k.startswith("rule."): cfg["sites"]["store"]["rules"]["unpaid_exit"][k.split(".")[1]] = v
    return cfg


def params(cfg):
    return {k: v for k, v in cfg.get("pose", {}).items()}


def week(cfg, days=7, start=datetime(2026, 10, 7), knobs=None):
    """every site for `days` synthetic days -> cases, assists and scores."""
    from .cases import score
    from .simulate import site_day, store_day
    from .tune import apply
    out = {}
    for site in cfg["sites"]:
        allc, alla, sc = [], [], []
        for d in range(days):
            day = start + timedelta(days=d)
            if site == "store":
                c, p = apply(cfg, knobs) if knobs else (cfg, params(cfg))
                eng, truth = store_day(c, 300 + d, params=p, start=day)
            else:
                eng, truth = site_day(cfg, site, 300 + d, start=day)
            sc.append(score(eng, truth)); allc += eng.cases; alla += eng.assists
        out[site] = {"cases": allc, "assists": alla, "scores": sc}
    return out


def pose_video(source, cfg=None, model="yolo11n-pose.pt", out="outputs/lp"):
    """concealment gestures from a real video: skeleton only, face points dropped, frames never kept."""
    import cv2
    from ultralytics import YOLO
    from .pose import Gestures
    cfg = cfg or load_cfg()
    cap = cv2.VideoCapture(int(source) if str(source).isdigit() else str(source))
    fps = cap.get(cv2.CAP_PROP_FPS) or 10
    yolo, G, n = YOLO(model), Gestures(params(cfg)), 0
    while True:
        ok, frame = cap.read()
        if not ok: break
        n += 1
        r = yolo.track(frame, persist=True, verbose=False, classes=[0])[0]
        if r.boxes is None or r.boxes.id is None or r.keypoints is None: continue
        kp = r.keypoints.data.cpu().numpy()
        for tid, k in zip(r.boxes.id.cpu().numpy(), kp):
            G.update(n / fps, int(tid), [[float(a), float(b), float(c)] for a, b, c in k])
        del frame
    cap.release()
    Path(out).mkdir(parents=True, exist_ok=True)
    (Path(out) / "gestures.json").write_text(json.dumps(G.events, indent=1))
    return G.events
