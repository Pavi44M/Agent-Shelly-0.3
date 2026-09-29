"""
CRISP-DM Phase 2 (Data Understanding) and Phase 3 (Data Preparation).

- load_raw():        read CSV/Excel exports and rename columns via config.column_map
- profile_quality(): data-quality report (duplicates, negatives, missing values, date gaps)
- prepare():         clean + build the analysis tables used by the models
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

TABLES = ["sales", "products", "inventory", "waste", "recalls"]
REQUIRED = {"sales", "products"}


def _read(path_stem: Path) -> pd.DataFrame | None:
    for ext in (".csv", ".xlsx", ".xls"):
        p = path_stem.with_suffix(ext)
        if p.exists():
            return pd.read_csv(p) if ext == ".csv" else pd.read_excel(p)
    return None


LAST_MAPPING: list = []    # column-matching record from the last load (for the data check report)


def load_raw(data_dir: str | Path, column_map: dict, source: dict | None = None) -> dict[str, pd.DataFrame]:
    """Standard-named files load directly; anything else (real exports, one flat file, a database)
    goes through shelly.ingest, which auto-matches columns and records every choice."""
    global LAST_MAPPING
    source = source or {}
    data_dir = Path(data_dir)
    standard = (data_dir / "sales.csv").exists() or (data_dir / "sales.xlsx").exists()
    if source.get("kind") == "database" or not standard:
        from . import ingest
        if source.get("kind") == "database":
            tables, LAST_MAPPING = ingest.load_database(source["url"], source["queries"], column_map, source)
        else:
            tables, LAST_MAPPING = ingest.load_folder(data_dir, column_map, source)
        return tables
    LAST_MAPPING = []
    out: dict[str, pd.DataFrame] = {}
    for t in TABLES:
        df = _read(data_dir / t)
        if df is None:
            if t in REQUIRED:
                raise FileNotFoundError(f"Missing required table '{t}' (.csv/.xlsx) in {data_dir}")
            continue
        mapping = {src: std for std, src in column_map.get(t, {}).items() if src in df.columns}
        df = df.rename(columns=mapping)
        if "gtin" in df.columns:  # barcodes are identifiers, never numbers
            df["gtin"] = df["gtin"].astype(str).str.replace(r"\.0$", "", regex=True).str.strip()
        out[t] = df
    return out


@dataclass
class QualityReport:
    rows: dict = field(default_factory=dict)
    issues: list = field(default_factory=list)   # (severity, message)
    score: float = 100.0
    date_range: tuple = ()

    def add(self, severity: str, msg: str, penalty: float) -> None:
        self.issues.append((severity, msg))
        self.score = max(0.0, self.score - penalty)


def profile_quality(raw: dict[str, pd.DataFrame]) -> QualityReport:
    q = QualityReport()
    s = raw["sales"].copy()
    q.rows = {k: len(v) for k, v in raw.items()}
    s["date"] = pd.to_datetime(s["date"], errors="coerce")
    q.date_range = (s["date"].min().date(), s["date"].max().date())

    bad_dates = s["date"].isna().sum()
    if bad_dates:
        q.add("high", f"{bad_dates} sales rows have unreadable dates (dropped)", 10)
    dups = s.duplicated().sum()
    if dups:
        q.add("medium", f"{dups} exact duplicate sales rows (removed)", min(10, dups * 0.5))
    neg = (s["units"] < 0).sum()
    if neg:
        q.add("low", f"{neg} negative-unit rows - likely refunds keyed as sales (excluded)", neg * 0.5)
    miss = s["net_sales"].isna().sum()
    if miss:
        q.add("low", f"{miss} rows missing net_sales (rebuilt from units x price)", miss * 0.5)

    full = pd.date_range(s["date"].min(), s["date"].max(), freq="D")
    gaps = len(full.difference(s["date"].dropna().unique()))
    if gaps:
        q.add("high", f"{gaps} calendar days with no sales at all (store closed or missing export?)", gaps)

    unknown = set(s["sku"]) - set(raw["products"]["sku"])
    if unknown:
        q.add("medium", f"{len(unknown)} SKUs in sales not in product master: {sorted(unknown)[:5]}", 5)
    if "inventory" not in raw:
        q.add("low", "No stock-count file - shrinkage checks skipped", 0)
    if "waste" not in raw:
        q.add("low", "No waste file - waste KPIs skipped", 0)
    if not q.issues:
        q.issues.append(("ok", "No data-quality issues found"))
    return q


@dataclass
class Prepared:
    sales: pd.DataFrame          # clean line-level sales with product attributes
    daily_sku: pd.DataFrame      # date x sku (all channels), zero-filled
    daily_cat: pd.DataFrame      # date x category units & sales
    products: pd.DataFrame
    inventory: pd.DataFrame | None
    waste: pd.DataFrame | None
    asof: pd.Timestamp
    recalls: pd.DataFrame | None = None


def prepare(raw: dict[str, pd.DataFrame], asof: str | None = None) -> Prepared:
    p = raw["products"].copy()
    s = raw["sales"].copy()
    s["date"] = pd.to_datetime(s["date"], errors="coerce")
    s = s.dropna(subset=["date"]).drop_duplicates()
    s = s[s["units"] > 0]
    s = s.merge(p, on="sku", how="left")
    s["net_sales"] = s["net_sales"].fillna(s["units"] * s["unit_price"])
    s["cost"] = s["cost"].fillna(s["units"] * s["unit_cost"])
    if "channel" not in s:
        s["channel"] = "in_store"
    if "promo_flag" not in s:
        s["promo_flag"] = 0
    s["category"] = s["category"].fillna("Unmapped")

    asof_ts = pd.Timestamp(asof) if asof else s["date"].max()
    s = s[s["date"] <= asof_ts]

    idx = pd.MultiIndex.from_product(
        [pd.date_range(s["date"].min(), asof_ts, freq="D"), p["sku"]], names=["date", "sku"])
    daily_sku = (s.groupby(["date", "sku"])[["units", "net_sales", "cost"]].sum()
                 .reindex(idx, fill_value=0).reset_index()
                 .merge(p[["sku", "product_name", "category"]], on="sku", how="left"))
    daily_cat = daily_sku.groupby(["date", "category"])[["units", "net_sales"]].sum().reset_index()

    inv = raw.get("inventory")
    if inv is not None:
        inv = inv.copy()
        inv["count_date"] = pd.to_datetime(inv["count_date"])
        inv = inv[inv["count_date"] <= asof_ts].merge(p, on="sku", how="left")
        inv["variance_units"] = inv["physical_qty"] - inv["sap_qty"]
        inv["variance_value"] = inv["variance_units"] * inv["unit_cost"]

    w = raw.get("waste")
    if w is not None:
        w = w.copy()
        w["date"] = pd.to_datetime(w["date"])
        w = w[w["date"] <= asof_ts].merge(p, on="sku", how="left")
        w["waste_value"] = w["units_wasted"] * w["unit_cost"]
        w["markdown_value"] = w["units_marked_down"] * w["unit_price"] * 0.5  # ~50% off

    return Prepared(s, daily_sku, daily_cat, p, inv, w, asof_ts, raw.get("recalls"))
