"""Industry packs. Importing this package registers every pack's skills."""
from . import commercial, electronics, group, lp, medical, mind, ops, production, retail, shift, vision, warehousing, wholesale  # noqa: F401
from .common import PACKS, pack_markdown, run_pack  # noqa: F401
