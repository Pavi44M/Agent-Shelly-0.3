"""
Real-data intake (v1.1): take whatever a business hands over and turn it into Shelly's standard tables.

Sources
- A folder of CSV / Excel exports (POS, SAP, ERP, accounting). One file per table, or one workbook
  with a sheet per table, or a single "transactions" file that also carries product columns.
- A SQL database (PostgreSQL, MySQL, SQL Server, SQLite ...) through a SQLAlchemy URL, read-only,
  one SELECT per table. Credentials come from an environment variable, never from the config file.

Column matching
- Explicit `column_map` in config.yaml always wins.
- Otherwise headers are matched to Shelly's names with a synonym list plus fuzzy matching
  ("Trans Date", "Posting date", "Qty Sold", "Net Amt excl GST", "Material" ...).
- Every choice is recorded with a confidence score in the data check report, so a person can
  confirm the mapping before numbers are trusted.
"""
from __future__ import annotations

import difflib
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

TABLES = ["sales", "products", "inventory", "waste", "recalls"]
REQUIRED_COLS = {
    "sales": ["date", "sku", "units", "net_sales"],
    "products": ["sku", "product_name", "category"],
    "inventory": ["count_date", "sku", "sap_qty", "physical_qty"],
    "waste": ["date", "sku", "units_wasted"],
    "recalls": ["notice_date", "gtin"],
}
SYNONYMS: dict[str, list[str]] = {
    # sales
    "date": ["date", "trans date", "transaction date", "sale date", "sales date", "posting date", "business date",
             "trading date", "day", "invoice date", "order date", "doc date", "billing date", "calendar day"],
    "sku": ["sku", "article", "article number", "material", "material number", "item", "item code", "item number",
            "product code", "product id", "plu", "code", "stock code", "part number", "article id", "sku id"],
    "channel": ["channel", "sales channel", "order type", "tender channel", "source", "platform", "store channel"],
    "units": ["units", "qty", "quantity", "qty sold", "units sold", "sales qty", "sold qty", "sales quantity",
              "billed quantity", "volume", "pieces"],
    "net_sales": ["net sales", "sales", "revenue", "net revenue", "amount", "net amount", "sales value", "turnover",
                  "sales excl gst", "net amt excl gst", "value excl gst", "sales ex gst", "net sales value", "total"],
    "cost": ["cost", "cogs", "cost of sales", "cost value", "total cost", "cost amount", "landed cost"],
    "promo_flag": ["promo", "promo flag", "on promotion", "promotion", "is promo", "deal flag"],
    # products
    "product_name": ["product name", "description", "item description", "article description", "material description",
                     "product", "item name", "name", "product description"],
    "category": ["category", "department", "dept", "merchandise category", "product group", "category name",
                 "class", "sub department", "family"],
    "unit_price": ["unit price", "price", "retail price", "sell price", "rrp", "selling price", "shelf price"],
    "unit_cost": ["unit cost", "cost price", "average cost", "moving average price", "standard cost", "buy price"],
    "shelf_life_days": ["shelf life", "shelf life days", "life days", "best before days", "use by days"],
    "supplier": ["supplier", "vendor", "vendor name", "supplier name", "manufacturer", "brand owner"],
    "gtin": ["gtin", "barcode", "ean", "upc", "ean13", "gtin13", "bar code"],
    # inventory
    "count_date": ["count date", "stocktake date", "inventory date", "snapshot date", "cycle count date"],
    "sap_qty": ["sap qty", "system qty", "book qty", "system stock", "soh system", "expected qty", "book stock"],
    "physical_qty": ["physical qty", "counted qty", "count qty", "actual qty", "physical count", "counted"],
    # waste
    "units_wasted": ["units wasted", "waste qty", "wastage", "write off qty", "written off", "waste units", "shrink qty"],
    "units_marked_down": ["units marked down", "markdown qty", "reduced to clear", "markdowns", "rtc qty"],
    "reason": ["reason", "waste reason", "reason code"],
    # recalls
    "notice_date": ["notice date", "recall date", "date issued"],
    "product_description": ["product description", "recalled product"],
    "action": ["action", "instruction"],
}
TABLE_COLS = {
    "sales": ["date", "sku", "channel", "units", "net_sales", "cost", "promo_flag", "product_name", "category",
              "unit_price", "unit_cost", "supplier", "gtin"],
    "products": ["sku", "product_name", "category", "unit_price", "unit_cost", "shelf_life_days", "supplier", "gtin"],
    "inventory": ["count_date", "sku", "sap_qty", "physical_qty"],
    "waste": ["date", "sku", "units_wasted", "units_marked_down", "reason"],
    "recalls": ["notice_date", "gtin", "product_description", "reason", "action"],
}
FILE_HINTS = {
    "sales": ["sales", "transactions", "trans", "pos", "billing", "invoice", "orders", "turnover"],
    "products": ["products", "product", "items", "articles", "material", "master", "catalog", "catalogue"],
    "inventory": ["inventory", "stock", "stocktake", "counts", "soh"],
    "waste": ["waste", "wastage", "writeoff", "write_off", "shrink", "markdown"],
    "recalls": ["recall", "recalls"],
}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


@dataclass
class Mapping:
    table: str
    source: str
    columns: dict = field(default_factory=dict)     # std -> (source column, confidence 0..1, how)
    missing: list = field(default_factory=list)
    derived: list = field(default_factory=list)


def match_columns(table: str, headers: list[str], explicit: dict | None = None) -> Mapping:
    """Map raw headers to Shelly's standard names for one table."""
    m = Mapping(table, "")
    free = {h: _norm(h) for h in headers}
    explicit = {k: v for k, v in (explicit or {}).items() if v in free}
    for std, src in explicit.items():
        m.columns[std] = (src, 1.0, "config")
        free.pop(src, None)
    for std in TABLE_COLS[table]:
        if std in m.columns:
            continue
        best, score, how = None, 0.0, ""
        for h, n in free.items():
            for syn in SYNONYMS.get(std, [std.replace("_", " ")]):
                if n == syn:
                    s, w = 1.0, "exact"
                elif re.search(rf"\b{re.escape(syn)}\b", n) and len(syn) >= 4:
                    s, w = 0.85, "contains"
                else:
                    s, w = difflib.SequenceMatcher(None, n, syn).ratio() * 0.8, "fuzzy"
                if s > score:
                    best, score, how = h, s, w
        if best is not None and score >= 0.62:
            m.columns[std] = (best, round(score, 2), how)
            free.pop(best)
    m.missing = [c for c in REQUIRED_COLS[table] if c not in m.columns]
    return m


def _apply(df: pd.DataFrame, m: Mapping) -> pd.DataFrame:
    return df.rename(columns={src: std for std, (src, _, _) in m.columns.items()})[[s for s in m.columns]]


def _files(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in (".csv", ".xlsx", ".xls", ".xlsm")
                  and not p.name.startswith("~$"))


def _read_any(p: Path) -> dict[str, pd.DataFrame]:
    if p.suffix.lower() == ".csv":
        head = p.open("rb").readline().decode("latin-1")
        sep = max([",", ";", "\t", "|"], key=head.count)
        for enc in ("utf-8-sig", "cp1252", "latin-1"):
            try:
                return {p.stem: pd.read_csv(p, encoding=enc, sep=sep, low_memory=False)}
            except UnicodeDecodeError:
                continue
    return {f"{p.stem}:{k}": v for k, v in pd.read_excel(p, sheet_name=None).items()}


def _guess_table(name: str, df: pd.DataFrame) -> str | None:
    n = _norm(name)
    for t, hints in FILE_HINTS.items():
        if any(h in n.split() or n.endswith(h) or n.startswith(h) for h in hints):
            return t
    # fall back on columns: whichever table's required columns match best
    best, score = None, 0
    for t in TABLES:
        m = match_columns(t, list(df.columns))
        s = len([c for c in REQUIRED_COLS[t] if c in m.columns]) / len(REQUIRED_COLS[t])
        if s > score:
            best, score = t, s
    return best if score >= 0.75 else None


def _clean_types(t: str, df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for c in ("date", "count_date", "notice_date"):
        if c in df:
            iso = df[c].astype(str).str.match(r"^\d{4}-\d{2}-\d{2}").mean() > 0.9
            df[c] = pd.to_datetime(df[c], errors="coerce", dayfirst=not iso, format="ISO8601" if iso else None)
    for c in ("units", "net_sales", "cost", "unit_price", "unit_cost", "sap_qty", "physical_qty", "units_wasted",
              "units_marked_down", "shelf_life_days"):
        if c in df and not pd.api.types.is_numeric_dtype(df[c]):
            df[c] = pd.to_numeric(df[c].astype(str).str.replace(r"[,$\s]", "", regex=True)
                                  .str.replace(r"^\((.*)\)$", r"-\1", regex=True), errors="coerce")
    for c in ("sku", "gtin"):
        if c in df:
            df[c] = df[c].astype(str).str.replace(r"\.0$", "", regex=True).str.strip()
    return df


def _finish(tables: dict[str, pd.DataFrame], maps: list[Mapping], defaults: dict) -> dict[str, pd.DataFrame]:
    """Derive what a real export often lacks, and say so in the mapping notes."""
    s = tables.get("sales")
    if s is None:
        raise FileNotFoundError("No sales / transactions table found. Shelly needs at least date, product code, quantity and sales value.")
    ms = next(m for m in maps if m.table == "sales")
    if "products" not in tables:                                   # one flat transactions file
        cols = [c for c in TABLE_COLS["products"] if c in s.columns]
        p = s[cols].drop_duplicates("sku").copy()
        if "product_name" not in p:
            p["product_name"] = p["sku"]
        if "category" not in p:
            p["category"] = "All products"
        ms.derived.append("products table built from the sales file")
        tables["products"] = p
    p = tables["products"]
    if "unit_price" not in p:
        price = (s.groupby("sku")["net_sales"].sum() / s.groupby("sku")["units"].sum().replace(0, pd.NA)).rename("unit_price")
        p = p.merge(price, on="sku", how="left")
        ms.derived.append("unit price = sales value ÷ units")
    gm = float(defaults.get("default_margin_pct", 30)) / 100
    if "unit_cost" not in p:
        p["unit_cost"] = p["unit_price"] * (1 - gm)
        ms.derived.append(f"unit cost estimated at {100 - gm * 100:.0f}% of price (no cost column; set default_margin_pct)")
    if "shelf_life_days" not in p:
        p["shelf_life_days"] = defaults.get("default_shelf_life_days", 30)
    if "supplier" not in p:
        p["supplier"] = "Unknown"
    tables["products"] = p
    if "cost" not in s:
        s = s.merge(p[["sku", "unit_cost"]], on="sku", how="left")
        s["cost"] = s["units"] * s["unit_cost"]
        s = s.drop(columns="unit_cost")
        ms.derived.append("line cost = units × unit cost")
    if "channel" not in s:
        s["channel"] = "in_store"
    if "promo_flag" not in s:
        s["promo_flag"] = 0
    tables["sales"] = s[[c for c in TABLE_COLS["sales"][:7] if c in s.columns]]
    return tables


def load_folder(folder: str | Path, column_map: dict | None = None, defaults: dict | None = None):
    folder = Path(folder)
    column_map, defaults = column_map or {}, defaults or {}
    found: dict[str, tuple[str, pd.DataFrame]] = {}
    for f in _files(folder):
        for name, df in _read_any(f).items():
            df = df.dropna(how="all").dropna(axis=1, how="all")
            t = _guess_table(name, df)
            if t and t not in found:
                found[t] = (f.name + ("" if ":" not in name else " › " + name.split(":", 1)[1]), df)
    return _map_all(found, column_map, defaults)


def load_database(url: str, queries: dict, column_map: dict | None = None, defaults: dict | None = None):
    """Read-only: each query must be a single SELECT. URL may be 'env:VAR' so secrets stay out of config."""
    for t, q in queries.items():                      # read-only guard before anything connects
        q2 = q.strip().rstrip(";")
        if not re.match(r"(?is)^\s*(select|with)\b", q2) or ";" in q2 or re.search(r"(?i)\b(insert|update|delete|drop|alter|create|truncate|grant|merge|exec)\b", q2):
            raise PermissionError(f"Query for {t} must be a single read-only SELECT")
    try:
        import sqlalchemy as sa
    except ImportError as e:  # pragma: no cover
        raise ImportError("Database sources need SQLAlchemy and a driver: pip install sqlalchemy psycopg2-binary (Postgres), "
                          "pymysql (MySQL) or pyodbc (SQL Server)") from e
    if url.startswith("env:"):
        url = os.environ.get(url[4:], "")
        if not url:
            raise ValueError("Database URL environment variable is empty")
    eng = sa.create_engine(url)
    found = {}
    with eng.connect() as con:
        for t, q in queries.items():
            q = q.strip().rstrip(";")
            if not re.match(r"(?is)^\s*(select|with)\b", q) or ";" in q:
                raise PermissionError(f"Query for {t} must be a single read-only SELECT")
            found[t] = (f"database › {t}", pd.read_sql(sa.text(q), con))
    return _map_all(found, column_map or {}, defaults or {})


def _map_all(found, column_map, defaults):
    tables, maps = {}, []
    for t, (src, df) in found.items():
        m = match_columns(t, [str(c) for c in df.columns], column_map.get(t))
        m.source = src
        maps.append(m)
        if t == "sales" or not m.missing:
            tables[t] = _clean_types(t, _apply(df, m))
    if "sales" in tables:
        ms = next(m for m in maps if m.table == "sales")
        if [c for c in ms.missing]:
            raise ValueError(f"Sales file ({ms.source}) is missing: {', '.join(ms.missing)}. "
                             f"Add these to column_map in config.yaml. Headers found: {list(found['sales'][1].columns)}")
    tables = _finish(tables, maps, defaults)
    return tables, maps


def check_report(tables: dict, maps: list[Mapping]) -> str:
    """Markdown data check: what was found, how columns were matched, what was derived, and what to confirm."""
    out = ["# Shelly data check", "", "| Table | Source | Rows | Status |", "|---|---|---:|---|"]
    for m in maps:
        n = len(tables[m.table]) if m.table in tables else 0
        st = "✅ ready" if not m.missing else ("⚠️ missing " + ", ".join(m.missing))
        out.append(f"| {m.table} | {m.source} | {n:,} | {st} |")
    for t in TABLES:
        if t not in {m.table for m in maps}:
            out.append(f"| {t} | not provided | 0 | {'required' if t == 'sales' else 'optional: related checks skipped'} |")
    out += ["", "## Column matching", "", "| Table | Shelly field | Your column | Confidence | How |", "|---|---|---|---:|---|"]
    for m in maps:
        for std, (src, conf, how) in m.columns.items():
            flag = "" if conf >= 0.85 else " ← please confirm"
            out.append(f"| {m.table} | {std} | {src} | {conf:.0%} | {how}{flag} |")
    der = [d for m in maps for d in m.derived]
    if der:
        out += ["", "## Filled in by Shelly", ""] + [f"- {d}" for d in der]
    s = tables.get("sales")
    if s is not None and len(s):
        out += ["", "## Coverage", "", f"- Dates: {s['date'].min():%d %b %Y} to {s['date'].max():%d %b %Y} "
                f"({s['date'].nunique():,} trading days)", f"- Products: {s['sku'].nunique():,}",
                f"- Sales value: ${s['net_sales'].sum():,.0f}"]
        days = (s["date"].max() - s["date"].min()).days
        if days < 365:
            out.append(f"- ⚠️ Only {days} days of history: year-on-year budgets need 12+ months, so budgets will use trend only.")
    return "\n".join(out) + "\n"
