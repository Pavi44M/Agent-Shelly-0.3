"""
Decision log: human-in-the-loop governance for major judgements.

Shelly never acts on a major judgement by itself. It *proposes* a decision with
its evidence, estimated impact and confidence, and the decision waits as
`pending` until Pavi confirms or rejects it (CLI, web app export, or later by
email). Every event is appended to an append-only JSONL audit trail.

Status flow:  proposed -> confirmed | rejected | expired      (+ optional outcome)
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
import os
DEFAULT_PATH = Path(os.environ.get("SHELLY_STATE_DIR", ROOT / "state")) / "decisions.jsonl"


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


class DecisionLog:
    def __init__(self, path: str | Path = DEFAULT_PATH):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=True)

    # ---------------------------------------------------------- storage
    def _events(self) -> list[dict]:
        return [json.loads(l) for l in self.path.read_text().splitlines() if l.strip()]

    def _append(self, ev: dict) -> None:
        with self.path.open("a") as f:
            f.write(json.dumps(ev, default=str) + "\n")

    def state(self) -> pd.DataFrame:
        """Current state of every decision (last event wins per field)."""
        rows: dict[str, dict] = {}
        for ev in self._events():
            d = rows.setdefault(ev["id"], {})
            d.update({k: v for k, v in ev.items() if k != "event"})
            d["last_event"] = ev["event"]
        cols = ["id", "created", "asof", "pack", "area", "rule", "statement", "impact_nzd", "confidence",
                "status", "note", "decided_at", "outcome"]
        df = pd.DataFrame(rows.values())
        for c in cols:
            if c not in df:
                df[c] = None
        return df[cols + [c for c in df.columns if c not in cols]]

    # ---------------------------------------------------------- API
    @staticmethod
    def make_id(asof: str, area: str, statement: str) -> str:
        return "D-" + hashlib.sha1(f"{asof}|{area}|{statement}".encode()).hexdigest()[:8]

    def propose(self, *, asof: str, pack: str, area: str, rule: str, statement: str, evidence: dict,
                impact_nzd: float = 0.0, confidence: float = 0.5, needs_confirmation: bool = True,
                ttl_days: int = 7) -> dict:
        did = self.make_id(asof, area, statement)
        st = self.state()
        if len(st) and did in set(st["id"]):
            return st.set_index("id").loc[did].to_dict() | {"id": did}
        ev = {"event": "proposed", "id": did, "created": _now(), "asof": asof, "pack": pack, "area": area,
              "rule": rule, "statement": statement, "evidence": evidence, "impact_nzd": round(float(impact_nzd), 2),
              "confidence": round(float(confidence), 2),
              "status": "pending" if needs_confirmation else "auto-approved",
              "expires": (datetime.now() + timedelta(days=ttl_days)).date().isoformat()}
        self._append(ev)
        return ev

    def decide(self, did: str, status: str, note: str = "", by: str = "Pavi") -> dict:
        if status not in {"confirmed", "rejected"}:
            raise ValueError("status must be confirmed or rejected")
        st = self.state()
        if did not in set(st["id"]):
            raise KeyError(f"No decision {did}")
        ev = {"event": status, "id": did, "status": status, "note": note, "decided_by": by, "decided_at": _now()}
        self._append(ev)
        return ev

    def record_outcome(self, did: str, outcome: str, value_nzd: float | None = None) -> dict:
        ev = {"event": "outcome", "id": did, "outcome": outcome, "outcome_value_nzd": value_nzd, "outcome_at": _now()}
        self._append(ev)
        return ev

    def expire_old(self) -> int:
        st = self.state()
        n = 0
        today = datetime.now().date().isoformat()
        for r in st[st["status"] == "pending"].itertuples():
            if getattr(r, "expires", None) and r.expires < today:
                self._append({"event": "expired", "id": r.id, "status": "expired", "decided_at": _now()})
                n += 1
        return n

    def pending(self) -> pd.DataFrame:
        st = self.state()
        return st[st["status"] == "pending"].sort_values("impact_nzd", key=lambda s: s.abs(), ascending=False)

    def import_web_file(self, path: str | Path) -> int:
        """Apply confirmations exported from the web app (Download decisions)."""
        data = json.loads(Path(path).read_text())
        n = 0
        for d in data.get("decisions", []):
            if d.get("status") in {"confirmed", "rejected"}:
                try:
                    self.decide(d["id"], d["status"], d.get("note", ""), by="Pavi (web)")
                    n += 1
                except KeyError:
                    pass
        return n


# ------------------------------------------------------------------ governance policy
def needs_confirmation(action: dict, policy: dict) -> bool:
    """Major judgements = big money, compliance, range/price/budget changes, or low confidence."""
    if action.get("area") in policy.get("always_confirm_areas", []):
        return True
    if abs(action.get("weekly_impact_nzd") or 0) >= policy.get("confirm_if_impact_over_nzd", 250):
        return True
    return False


def propose_from_actions(log: DecisionLog, acts: list[dict], asof: str, policy: dict, pack: str = "retail") -> list[dict]:
    out = []
    for a in acts:
        conf = a.get("confidence", 0.6)
        out.append(log.propose(asof=asof, pack=pack, area=a["area"], rule=a.get("rule", "action:" + a["area"]),
                               statement=a["action"], evidence={"why": a["why"], "owner": a["owner"],
                                                                 "priority": a["priority"]},
                               impact_nzd=a.get("weekly_impact_nzd") or 0, confidence=conf,
                               needs_confirmation=needs_confirmation(a, policy)))
    return out
