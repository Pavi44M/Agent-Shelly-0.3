"""
Skills registry: every capability Shelly has is a named, documented skill.

A skill is a plain Python function registered with @skill(...). The registry
lets the CLI, the web app, an LLM planner or OpenJarvis discover what Shelly
can do, and exports agentskills.io-style SKILL.md files for each one.

    from shelly.core.skills import skill
    @skill("warehousing.slotting", pack="warehousing", summary="ABC-XYZ slotting plan",
           inputs=["picks"], outputs=["slotting table"], confirm=False)
    def slotting(picks): ...
"""
from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


@dataclass
class Skill:
    name: str
    pack: str
    summary: str
    fn: Callable
    inputs: list = field(default_factory=list)
    outputs: list = field(default_factory=list)
    confirm: bool = False          # does acting on the result need human confirmation?
    triggers: list = field(default_factory=list)   # example user phrasings

    def __call__(self, *a, **k):
        return self.fn(*a, **k)

    def skill_md(self) -> str:
        doc = inspect.getdoc(self.fn) or self.summary
        trig = "\n".join(f"- \"{t}\"" for t in self.triggers) or "- (called by other skills)"
        return f"""---
name: {self.name}
description: {self.summary}
---

# {self.name}

{doc}

## When to use
{trig}

## Inputs
{chr(10).join('- ' + i for i in self.inputs) or '- none'}

## Outputs
{chr(10).join('- ' + o for o in self.outputs) or '- none'}

## Governance
{'Results are **proposals**: they go to the decision log and wait for Pavi to confirm before anyone acts on them.' if self.confirm else 'Informational: no confirmation needed.'}

## Run
```bash
python -m shelly skill {self.name}
```
"""


REGISTRY: dict[str, Skill] = {}


def skill(name: str, pack: str, summary: str, inputs=None, outputs=None, confirm=False, triggers=None):
    def deco(fn):
        REGISTRY[name] = Skill(name, pack, summary, fn, inputs or [], outputs or [], confirm, triggers or [])
        return fn
    return deco


def load_all() -> dict[str, Skill]:
    """Import every pack so its skills register themselves."""
    from .. import packs  # noqa: F401  (packs/__init__ imports each pack)
    return REGISTRY


def export_skill_files(out_dir: str | Path) -> list[Path]:
    load_all()
    out = Path(out_dir)
    paths = []
    for s in REGISTRY.values():
        d = out / s.name.replace(".", "-")
        d.mkdir(parents=True, exist_ok=True)
        (d / "SKILL.md").write_text(s.skill_md())
        paths.append(d / "SKILL.md")
    index = ["# Shelly skills index", "", "| Skill | Pack | What it does | Needs confirmation |", "|---|---|---|---|"]
    index += [f"| `{s.name}` | {s.pack} | {s.summary} | {'yes' if s.confirm else 'no'} |"
              for s in sorted(REGISTRY.values(), key=lambda s: (s.pack, s.name))]
    (out / "INDEX.md").write_text("\n".join(index) + "\n")
    return paths
