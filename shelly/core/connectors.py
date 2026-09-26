"""
Connectors: one interface for every data source and destination.

Built in:
  folder        local CSV / Excel exports (POS, SAP, warehouse, production)
  sqlite        a SQLite database (the Shelly warehouse or any .db)
  sql           any SQLAlchemy URL (Postgres, SQL Server, MySQL...) if sqlalchemy is installed
  gsheet_csv    a Google Sheet published as CSV (File > Share > Publish to web): no OAuth needed
  http_json     any REST/JSON endpoint (supplier portals, public APIs)
  smtp_email    send reports by email (credentials from environment variables)

Open for more: drop a module into shelly/connectors_ext/ that defines a subclass
of Connector with a `kind` attribute. It's auto-discovered at start-up.

Live SaaS connectors (Gmail, Google Drive, Google Calendar, Indeed, SEEK/LinkedIn search)
run in Shelly's Claude scheduled tasks, which already hold your authorisations,
so no passwords or tokens are stored in this repo.
"""
from __future__ import annotations

import importlib
import json
import os
import pkgutil
import smtplib
import urllib.request
from email.message import EmailMessage
from pathlib import Path

import pandas as pd

KINDS: dict[str, type] = {}


class Connector:
    kind = "base"

    def __init_subclass__(cls, **kw):
        super().__init_subclass__(**kw)
        if getattr(cls, "kind", None):
            KINDS[cls.kind] = cls

    def __init__(self, name: str, **opts):
        self.name, self.opts = name, opts

    def read(self, table: str) -> pd.DataFrame:
        raise NotImplementedError(f"{self.kind} can't read")

    def write(self, name: str, payload) -> str:
        raise NotImplementedError(f"{self.kind} can't write")

    def health(self) -> tuple[bool, str]:
        return True, "ok"


class FolderConnector(Connector):
    kind = "folder"

    def read(self, table):
        base = Path(self.opts["path"])
        for ext in (".csv", ".xlsx", ".xls"):
            p = base / f"{table}{ext}"
            if p.exists():
                return pd.read_csv(p) if ext == ".csv" else pd.read_excel(p)
        raise FileNotFoundError(f"{table} not found in {base}")

    def write(self, name, payload):
        p = Path(self.opts["path"]) / name
        p.parent.mkdir(parents=True, exist_ok=True)
        payload.to_csv(p, index=False) if isinstance(payload, pd.DataFrame) else p.write_text(str(payload))
        return str(p)

    def health(self):
        p = Path(self.opts["path"])
        return p.exists(), f"{len(list(p.glob('*')))} files" if p.exists() else "folder missing"


class SQLiteConnector(Connector):
    kind = "sqlite"

    def _con(self):
        import sqlite3
        return sqlite3.connect(self.opts["path"])

    def read(self, table):
        q = table if table.strip().lower().startswith("select") else f"SELECT * FROM {table}"
        with self._con() as c:
            return pd.read_sql_query(q, c)

    def write(self, name, payload):
        with self._con() as c:
            payload.to_sql(name, c, if_exists="replace", index=False)
        return f"{self.opts['path']}:{name}"

    def health(self):
        return Path(self.opts["path"]).exists(), self.opts["path"]


class SQLConnector(Connector):
    kind = "sql"

    def _eng(self):
        from sqlalchemy import create_engine  # optional dependency
        return create_engine(os.environ.get(self.opts.get("url_env", ""), self.opts.get("url", "")))

    def read(self, table):
        q = table if table.strip().lower().startswith("select") else f"SELECT * FROM {table}"
        return pd.read_sql_query(q, self._eng())

    def write(self, name, payload):
        payload.to_sql(name, self._eng(), if_exists="replace", index=False)
        return name

    def health(self):
        try:
            import sqlalchemy  # noqa: F401
            return True, "sqlalchemy available"
        except ImportError:
            return False, "pip install sqlalchemy"


class GSheetCSVConnector(Connector):
    """Each table maps to a Google Sheet 'Publish to web' CSV URL."""
    kind = "gsheet_csv"

    def read(self, table):
        return pd.read_csv(self.opts["tables"][table])

    def health(self):
        return bool(self.opts.get("tables")), f"{len(self.opts.get('tables', {}))} sheets mapped"


class HTTPJSONConnector(Connector):
    kind = "http_json"

    def read(self, table):
        url = self.opts["endpoints"][table]
        hdr = {k: os.environ.get(v, "") for k, v in self.opts.get("header_env", {}).items()}
        with urllib.request.urlopen(urllib.request.Request(url, headers=hdr), timeout=30) as r:
            data = json.loads(r.read())
        return pd.json_normalize(data if isinstance(data, list) else data.get(self.opts.get("records_key", "data"), data))


class SMTPEmailConnector(Connector):
    """Env: SHELLY_SMTP_HOST, SHELLY_SMTP_USER, SHELLY_SMTP_PASS (e.g. a Gmail app password)."""
    kind = "smtp_email"

    def write(self, name, payload):
        msg = EmailMessage()
        msg["Subject"], msg["From"], msg["To"] = name, os.environ["SHELLY_SMTP_USER"], self.opts["to"]
        msg.set_content("HTML version attached.")
        msg.add_alternative(str(payload), subtype="html")
        with smtplib.SMTP_SSL(os.environ.get("SHELLY_SMTP_HOST", "smtp.gmail.com"), 465) as s:
            s.login(os.environ["SHELLY_SMTP_USER"], os.environ["SHELLY_SMTP_PASS"])
            s.send_message(msg)
        return f"sent to {self.opts['to']}"

    def health(self):
        ok = all(os.environ.get(k) for k in ("SHELLY_SMTP_USER", "SHELLY_SMTP_PASS"))
        return ok, "credentials set" if ok else "set SHELLY_SMTP_USER / SHELLY_SMTP_PASS"


class ClaudeTaskConnector(Connector):
    """Placeholder that documents the connectors Shelly uses through Claude scheduled tasks."""
    kind = "claude_task"

    def health(self):
        return True, "runs in Claude: " + ", ".join(self.opts.get("services", []))


def discover_extensions() -> None:
    try:
        ext = importlib.import_module("shelly.connectors_ext")
    except ImportError:
        return
    for m in pkgutil.iter_modules(ext.__path__):
        importlib.import_module(f"shelly.connectors_ext.{m.name}")


def build(cfg_connectors: list[dict]) -> dict[str, Connector]:
    discover_extensions()
    out = {}
    for c in cfg_connectors or []:
        cls = KINDS.get(c["kind"])
        if not cls:
            raise ValueError(f"Unknown connector kind '{c['kind']}'. Known: {sorted(KINDS)}")
        out[c["name"]] = cls(c["name"], **{k: v for k, v in c.items() if k not in ("name", "kind")})
    return out
