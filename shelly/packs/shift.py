"""Shift pack (Store Shift Pilot, v2.1): the store's day from opening brief to handover. Synthetic store on the public site."""
from __future__ import annotations

from datetime import date

from ..core.skills import skill


def _day(d=None):
    from ..shift.pilot import build
    return build(date.fromisoformat(d) if d else date(2026, 9, 25))


@skill("shift.brief", pack="shift", summary="Opening brief: the day's forecast and why, staff on vs needed by hour, recalls, orders waiting, top three",
       inputs=["takings history", "drivers", "roster", "event bus"], outputs=["brief"], triggers=["opening brief", "what's on today"])
def brief(day: str | None = None):
    return _day(day)["brief"]


@skill("shift.todo", pack="shift", summary="The day's to-do list from routine, compliance, the forecast and the event bus, with owner roles",
       inputs=["brief", "event bus"], outputs=["tasks"], triggers=["to-do", "what's next"])
def todo(day: str | None = None):
    return _day(day)["tasks"]


@skill("shift.close", pack="shift", summary="Closing report and handover notes for the next Duty Manager",
       inputs=["takings", "tasks", "tomorrow's forecast"], outputs=["closing report", "handover notes"], triggers=["handover", "closing report"])
def close(day: str | None = None):
    return _day(day)["closing"]


@skill("shift.sense", pack="shift", summary="Daily demand sensing: weather, school and public holidays, Eden Park nights, paydays; honest 14-day exam",
       inputs=["takings history", "drivers"], outputs=["7-day forecast", "learned effects", "exam"], triggers=["forecast", "demand sensing"])
def sense(day: str | None = None):
    d = _day(day); return {"model": d["model"], "next7": d["next7"], "effects": d["effects"]}


@skill("shift.lab", pack="shift", summary="Skill Lab for forecasting, reorder and rostering: daily scores and levels over 14 days",
       inputs=["takings history", "products", "roster"], outputs=["levels"], triggers=["skill level"])
def lab(day: str | None = None):
    from ..shift import lab as L
    return L.run(date.fromisoformat(day) if day else date(2026, 9, 25))
