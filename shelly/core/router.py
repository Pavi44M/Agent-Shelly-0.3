"""
Relevance router: decides whether a text or voice request is inside Shelly's skills.

In scope     -> the best-matching skill (by trigger phrases and domain vocabulary)
Out of scope -> an explanation plus which kind of agent to connect in Settings.
                Shelly never guesses outside its skills.

    python -m shelly ask "what do I need to order?"
    python -m shelly ask "book me a flight to Colombo"
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .skills import load_all

DOMAIN = re.compile(
    r"(sale|sold|sell|trade|trading|revenue|takings|margin|profit|budget|forecast|order|stock|inventory|shrink|waste|"
    r"markdown|deliver|uber|roster|staff|labou?r|wage|segment|cluster|model|recall|complian|barcode|gtin|price|pricing|"
    r"promo|category|product|sku|customer|debtor|credit|warehouse|pick|slot|oee|scrap|production|supplier|kpi|report|"
    r"decision|confirm|reject|data|quality|store|shelly|what.?if|scenario|electronic|wholesale|anomal|exception|spike|"
    r"cover|reorder|fill rate|otif|capacity|shelf|p&l|gross|units|basket|aged|attach|erosion|yield|schedule adherence)")

OUT_OF_SCOPE = [
    ("travel", r"(flight|hotel|holiday|travel|trip|airport|airline|book (a|me) )",
     "a travel agent, e.g. Claude with the Kiwi.com or lastminute.com connectors"),
    ("email & calendar", r"(send (an |a )?e-?mail|reply to|inbox|calendar|meeting|remind me|appointment|set a reminder)",
     "a personal-assistant agent with Gmail and Google Calendar"),
    ("writing", r"(poem|story|essay|joke|song|lyrics|write me|cover letter|translate)", "a general assistant (Claude API or Ollama)"),
    ("coding", r"(write (some )?code|python script|javascript|debug|excel formula|regex)", "a coding agent"),
    ("investment advice", r"(stock tip|which shares|buy shares|sell shares|crypto|bitcoin|forex|trading idea|should i invest)",
     "a licensed financial adviser (Shelly shares market information only, never advice)"),
    ("professional advice", r"(doctor|medical|symptom|diagnos|legal advice|lawyer|immigration|visa|tax return)", "a qualified professional"),
    ("weather, traffic & sport", r"(weather|rain|temperature|traffic|sports? score|rugby|cricket)", "a general assistant or a weather app"),
    ("general knowledge", r"(who is |who was |capital of|define |meaning of|history of|recipe|population of)", "a general assistant (Claude API or Ollama)"),
]
_OOS = [(k, re.compile(p), a) for k, p, a in OUT_OF_SCOPE]
_STOP = {"the", "a", "an", "is", "are", "what", "how", "do", "i", "we", "my", "our", "to", "of", "for", "in", "on", "and", "any", "should"}


@dataclass
class Route:
    in_scope: bool
    skill: str | None = None
    score: float = 0.0
    kind: str = ""
    advice: str = ""


def _words(t: str) -> set[str]:
    out = set()
    for w in re.findall(r"[a-z0-9&]+", t.lower()):
        if w in _STOP or len(w) <= 2:
            continue
        out.add(w[:-1] if len(w) > 4 and w.endswith("s") else w)   # light stemming: debtors -> debtor
    return out


def route(text: str) -> Route:
    q = " " + re.sub(r"[\x00-\x1f\x7f]", " ", str(text))[:500].lower() + " "
    oos = next(((k, a) for k, rx, a in _OOS if rx.search(q)), None)
    domain = bool(DOMAIN.search(q))
    if oos and (oos[0] != "general knowledge" or not domain) and not re.search(r"(order|stock|sales|store|shelly|report)", q):
        return Route(False, kind=oos[0], advice=f"That's outside Shelly's skills. For {oos[0]}, connect {oos[1]} in Settings → Connected agents.")
    # best skill by overlap with trigger phrases + summary
    qw = _words(q)
    best, best_s = None, 0.0
    for s in load_all().values():
        vocab = _words(" ".join(s.triggers) + " " + s.summary + " " + s.name.replace(".", " ").replace("_", " "))
        score = len(qw & vocab) / (len(qw) or 1)
        if score > best_s:
            best, best_s = s.name, score
    if domain or best_s >= 0.34:
        return Route(True, skill=best if best_s > 0 else None, score=round(best_s, 2))
    return Route(False, kind="this topic", advice="That's outside Shelly's skills. Connect a general assistant (Claude API or Ollama) in Settings → Connected agents.")
