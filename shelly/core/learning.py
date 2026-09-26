"""
Learning loop: Shelly adjusts itself from evidence. It never changes silently.

Two feedback signals:
1. Your judgements. Every confirmed/rejected decision updates a Beta(α, β)
   estimate of that rule's precision. Rules you keep rejecting get stricter
   thresholds (fewer false alarms); rules you nearly always confirm are
   allowed to fire a little earlier.
2. Its own accuracy. Each run stores forecast error per model; a smoothed
   error history shows which models are improving or drifting.

Every change is written to state/learning.json with the reason and the numbers
behind it, and appears in the run's validation report.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
import os
STATE = Path(os.environ.get("SHELLY_STATE_DIR", ROOT / "state")) / "learning.json"

# which action areas are driven by which tunable anomaly thresholds
AREA_TO_KNOB = {
    "Demand": ("spike_z", 0.25),          # sales-spike alerts
    "Availability": ("drop_z", 0.25),     # stock-out alerts
    "Shrinkage": ("count_tol", 1.0),      # SAP vs shelf tolerance (units)
    "Waste": ("waste_mult", 0.25),        # waste blow-out multiplier
    "Category": ("decline_ratio", -0.05), # sustained-decline ratio (lower = stricter)
}
DEFAULT_KNOBS = {"spike_z": 3.0, "drop_z": 3.0, "count_tol": 5.0, "waste_mult": 2.0, "decline_ratio": 0.75}
BOUNDS = {"spike_z": (2.5, 4.5), "drop_z": (2.5, 4.5), "count_tol": (3, 12), "waste_mult": (1.5, 3.5),
          "decline_ratio": (0.55, 0.85)}


def load() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"knobs": dict(DEFAULT_KNOBS), "rules": {}, "model_error": {}, "changes": []}


def save(s: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(s, indent=1, default=str))


def apply_to_config(cfg: dict, s: dict | None = None) -> dict:
    """Inject learned thresholds into the run config."""
    s = s or load()
    k = s["knobs"]
    cfg["analysis"]["spike_z"] = k["spike_z"]
    cfg["analysis"]["drop_z"] = k["drop_z"]
    cfg["analysis"]["waste_mult"] = k["waste_mult"]
    cfg["analysis"]["decline_ratio"] = k["decline_ratio"]
    cfg["kpi_targets"]["count_variance_units"] = k["count_tol"]
    return cfg


def learn_from_decisions(decisions_df, s: dict | None = None, min_n: int = 5) -> tuple[dict, list[dict]]:
    """Update rule precision from confirmed/rejected decisions and tune thresholds."""
    s = s or load()
    changes = []
    done = decisions_df[decisions_df["status"].isin(["confirmed", "rejected"])] if len(decisions_df) else decisions_df
    for area, g in (done.groupby("area") if len(done) else []):
        a = 1 + (g["status"] == "confirmed").sum()
        b = 1 + (g["status"] == "rejected").sum()
        prec = a / (a + b)
        s["rules"][area] = {"confirmed": int(a - 1), "rejected": int(b - 1), "precision": round(prec, 3)}
        if area not in AREA_TO_KNOB or (a + b - 2) < min_n:
            continue
        knob, step = AREA_TO_KNOB[area]
        old = s["knobs"][knob]
        new = old
        if prec < 0.4:
            new = old + step          # too many false alarms: be stricter
        elif prec > 0.85:
            new = old - step          # reliably right: allow earlier warnings
        lo, hi = BOUNDS[knob]
        new = round(min(max(new, lo), hi), 3)
        if new != old:
            s["knobs"][knob] = new
            ch = {"at": datetime.now().isoformat(timespec="seconds"), "knob": knob, "from": old, "to": new,
                  "reason": f"{area}: you confirmed {a - 1} and rejected {b - 1} (precision {prec:.0%})"}
            s["changes"].append(ch)
            changes.append(ch)
    return s, changes


def learn_from_accuracy(leaderboard, asof: str, s: dict | None = None, alpha: float = 0.3) -> tuple[dict, list[dict]]:
    """Exponentially smoothed forecast error per model; flags drift of > 20%."""
    s = s or load()
    notes = []
    for r in leaderboard.itertuples():
        h = s["model_error"].setdefault(r.model, {"ewma": None, "history": []})
        if h["history"] and h["history"][-1]["asof"] == asof:
            continue
        prev = h["ewma"]
        h["ewma"] = round(r.wape if prev is None else alpha * r.wape + (1 - alpha) * prev, 3)
        h["history"].append({"asof": asof, "wape": round(float(r.wape), 2)})
        h["history"] = h["history"][-52:]
        if prev is not None and r.wape > prev * 1.2:
            notes.append({"at": asof, "knob": f"model:{r.model}", "from": prev, "to": round(float(r.wape), 2),
                          "reason": f"{r.model} error jumped {r.wape / prev - 1:+.0%} vs its running average; check for a data or demand change"})
    return s, notes
