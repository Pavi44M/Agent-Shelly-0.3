"""Shelly Brain: one brain, many department agents.

    from shelly.brain import org, ask
    org()            -> the whole organisation: core modules, businesses, departments, agents
    ask("what do I need to order?")  -> which department and agent take the question
"""
from .registry import AGENTS, BUSINESSES, CORE, DEPARTMENTS, org  # noqa: F401
from .orchestrator import ask  # noqa: F401
