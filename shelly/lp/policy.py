"""Guardrails for Loss Prevention that code cannot switch off quietly.

validate(cfg) runs before anything else and refuses to start if the config would identify people,
score individuals, keep video it should not, or run outside Shelly's own businesses."""
from __future__ import annotations

SHELLY_BUSINESSES = {"store", "gateway", "totara", "group"}
FORBIDDEN_ACTIONS = {"detain", "chase", "physical contact", "bag search without consent", "accuse", "public naming", "sharing clips on social media"}


class PolicyError(ValueError):
    pass


def validate(cfg: dict) -> list[str]:
    """raise PolicyError on any breach; return the list of checks that passed (shown on the page)."""
    pv, sc, hl = cfg.get("privacy", {}), cfg.get("scope", {}), cfg.get("human_in_the_loop", {})
    bad = []
    if pv.get("identity") != "none": bad.append("identity must be 'none': Shelly never identifies anyone")
    for k in ("biometrics", "face_match", "demographics", "per_person_score", "store_frames"):
        if pv.get(k) is not False: bad.append(f"privacy.{k} must stay false")
    if pv.get("pose") != "skeleton_only": bad.append("pose must be skeleton_only (no face points)")
    if pv.get("faces_in_clips") != "pixelated": bad.append("faces in incident clips must be pixelated")
    if not 0 < int(pv.get("retention_days", 0)) <= 30: bad.append("retention must be 1-30 days")
    if pv.get("signage") != "required" or pv.get("staff_notice") != "required": bad.append("signage and the staff notice are required")
    if sc.get("internal_only") is not True: bad.append("scope.internal_only must be true (Shelly's own businesses only)")
    if sc.get("expansion") != "locked": bad.append("scope.expansion must stay locked until Pavi approves")
    extra = set(sc.get("businesses", [])) - SHELLY_BUSINESSES
    if extra: bad.append(f"not a Shelly business: {sorted(extra)}")
    for sid, s in cfg.get("sites", {}).items():
        if s.get("business") not in SHELLY_BUSINESSES or s.get("business") not in sc.get("businesses", []):
            bad.append(f"site {sid}: business '{s.get('business')}' is outside the locked scope")
    if not FORBIDDEN_ACTIONS <= set(hl.get("never", [])): bad.append("the 'never' list for staff is incomplete")
    if not hl.get("review_by"): bad.append("every case needs a named human reviewer")
    if bad: raise PolicyError("; ".join(bad))
    return ["No identity, faces, biometrics or demographics", "No per-person score: confidence belongs to an incident",
            "Skeleton only for pose (face points dropped)", "Live video dropped; incident clips only, faces pixelated",
            f"Clips and cases deleted after {pv['retention_days']} days", "Signage and a staff notice required",
            "Shelly's own businesses only; expansion locked", "A trained person reviews every case", "Staff never detain, chase, touch, search or accuse"]


def allowed_site(cfg: dict, business: str) -> bool:
    """the scope lock: a site outside Shelly's businesses is refused, whatever the config says."""
    return business in SHELLY_BUSINESSES and business in cfg.get("scope", {}).get("businesses", []) and cfg["scope"].get("internal_only") is True


def check_action(action: str) -> str:
    """staff actions Shelly may suggest; anything on the never list is refused."""
    if action.lower() in FORBIDDEN_ACTIONS: raise PolicyError(f"'{action}' is never suggested: staff safety and the law come first")
    return action
