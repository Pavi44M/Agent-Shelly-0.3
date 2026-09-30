"""
Shelly · Supply Chain module — synthetic data generator
--------------------------------------------------------
Creates a realistic but 100% FICTIONAL dataset for a New Zealand importer of
medicines, medical consumables and medical equipment.

The *shape* (tables, fields, lead-time ranges, expiry logic) is modelled on a
typical NZ medical-distribution business. No real company, supplier, customer,
price or volume data is used. Swap in your own schema-compatible CSVs later.

Run:  python src/generate_data.py   -> writes CSVs into data/
"""
from pathlib import Path
import numpy as np
import pandas as pd

RNG = np.random.default_rng(44)
OUT = Path(__file__).resolve().parents[1] / "data"
OUT.mkdir(exist_ok=True)

TODAY = pd.Timestamp("2026-09-30")
START = TODAY - pd.Timedelta(days=730)

# ---------------------------------------------------------------- suppliers
SUPPLIERS = [
    # id, name, country, mode, base lead days, reliability(0-1), category focus
    ("SUP01", "Aravind Generics Pvt",      "India",     "Sea", 42, 0.82, "Medicine"),
    ("SUP02", "Ganges Pharma Labs",         "India",     "Sea", 45, 0.74, "Medicine"),
    ("SUP03", "Shenzhen MedTex Co",         "China",     "Sea", 30, 0.86, "Consumable"),
    ("SUP04", "Jiangsu SafeGlove Ltd",      "China",     "Sea", 28, 0.69, "Consumable"),
    ("SUP05", "Rheinmed Diagnostik GmbH",   "Germany",   "Air", 14, 0.95, "Equipment"),
    ("SUP06", "Baltic Surgical AG",         "Germany",   "Sea", 55, 0.90, "Equipment"),
    ("SUP07", "Lakeshore Devices Inc",      "USA",       "Air", 12, 0.91, "Equipment"),
    ("SUP08", "Pacific Ortho Supply",       "USA",       "Sea", 38, 0.84, "Consumable"),
    ("SUP09", "Straits BioPharma Pte",      "Singapore", "Air", 9,  0.93, "Medicine"),
    ("SUP10", "Coral Coast Medical Pty",    "Australia", "Sea", 10, 0.88, "Consumable"),
    ("SUP11", "Southern Cross Pharma Pty",  "Australia", "Air", 5,  0.92, "Medicine"),
    ("SUP12", "Kyushu Precision Medical",   "Japan",     "Sea", 26, 0.94, "Equipment"),
]
suppliers = pd.DataFrame(SUPPLIERS, columns=[
    "supplier_id", "supplier_name", "country", "default_mode",
    "base_lead_days", "reliability", "category_focus"])

# ---------------------------------------------------------------- products
PRODUCTS = [
    # name, category, subcat, unit cost NZD, base daily demand, shelf life days (None=no expiry), cold chain
    ("Paracetamol 500mg tab x100",       "Medicine",   "Analgesic",       3.10, 180, 1095, False),
    ("Ibuprofen 400mg tab x100",         "Medicine",   "NSAID",           4.20, 140, 1095, False),
    ("Amoxicillin 500mg cap x20",        "Medicine",   "Antibiotic",      5.80,  90,  730, False),
    ("Cefazolin 1g inj vial",            "Medicine",   "Antibiotic",      7.40,  60,  730, False),
    ("Lidocaine 1% 5ml amp x10",         "Medicine",   "Anaesthetic",    12.50,  45,  900, False),
    ("Ondansetron 4mg inj x5",           "Medicine",   "Antiemetic",     14.90,  30,  730, False),
    ("Enoxaparin 40mg syringe x10",      "Medicine",   "Anticoagulant",  38.00,  25,  730, True),
    ("Insulin glargine pen x5",          "Medicine",   "Endocrine",      62.00,  20,  540, True),
    ("Adrenaline 1mg/ml amp x10",        "Medicine",   "Emergency",      22.00,  18,  540, False),
    ("Sodium chloride 0.9% 1L bag",      "Medicine",   "IV fluid",        2.60, 210,  730, False),
    ("Nitrile exam gloves M x100",       "Consumable", "PPE",             6.50, 260, 1825, False),
    ("Surgical mask Type IIR x50",       "Consumable", "PPE",             4.10, 150, 1825, False),
    ("Syringe 5ml luer-lock x100",       "Consumable", "Injection",       9.80, 110, 1825, False),
    ("IV cannula 20G x50",               "Consumable", "Vascular access",31.00,  40, 1825, False),
    ("Sterile gauze 10x10 x100",         "Consumable", "Wound care",      5.20, 130, 1825, False),
    ("Elastic crepe bandage 10cm x12",   "Consumable", "Sports/Ortho",    8.40,  85, 1825, False),
    ("Kinesiology tape 5cm roll x6",     "Consumable", "Sports/Ortho",   11.20,  60, 1095, False),
    ("Instant cold pack x24",            "Consumable", "Sports/Ortho",   14.00,  55, 1095, False),
    ("Wrist/ankle brace (asst) x10",     "Consumable", "Sports/Ortho",   42.00,  22, None,  False),
    ("Suture kit 3-0 absorbable x12",    "Consumable", "Surgical",       36.00,  30, 1460, False),
    ("Pulse oximeter fingertip",         "Equipment",  "Monitoring",     28.00,  12, None,  False),
    ("Digital BP monitor (clinical)",    "Equipment",  "Monitoring",     95.00,   6, None,  False),
    ("AED trainer/defib unit",           "Equipment",  "Emergency",    1450.00, 0.6, None,  False),
    ("Infusion pump (volumetric)",       "Equipment",  "Infusion",     2100.00, 0.4, None,  False),
    ("Portable ultrasound probe",        "Equipment",  "Imaging",      4800.00, 0.15,None,  False),
    ("Wheelchair standard",              "Equipment",  "Mobility",      310.00, 1.2, None,  False),
    ("Crutches (pair, adjustable)",      "Equipment",  "Mobility",       48.00,  5,  None,  False),
    ("Spinal board + straps",            "Equipment",  "Emergency",     390.00, 0.5, None,  False),
]
prod = pd.DataFrame(PRODUCTS, columns=[
    "product_name", "category", "subcategory", "unit_cost_nzd",
    "base_daily_demand", "shelf_life_days", "cold_chain"])
prod.insert(0, "sku", [f"SKU{i:03d}" for i in range(1, len(prod) + 1)])
prod["unit_price_nzd"] = (prod.unit_cost_nzd * RNG.uniform(1.25, 1.55, len(prod))).round(2)
prod["regulator"] = np.where(prod.category == "Medicine", "Medsafe",
                     np.where(prod.category == "Equipment", "WAND (Medsafe)", "WAND (Medsafe)"))
prod["pharmac_listed"] = prod.category.eq("Medicine") & (RNG.random(len(prod)) > 0.2)

def pick_supplier(cat):
    pool = suppliers[suppliers.category_focus == cat].supplier_id.tolist()
    return RNG.choice(pool)
prod["primary_supplier_id"] = [pick_supplier(c) for c in prod.category]
prod["moq_units"] = np.maximum(1, (prod.base_daily_demand * RNG.uniform(10, 25, len(prod)))).round().astype(int)

# ---------------------------------------------------------------- customers
CUSTOMERS = [
    # name, segment, region, size multiplier, focus categories weights (Med, Cons, Equip)
    ("Harbourview Regional Hospital",   "Public hospital",     "Auckland",   9.0, (0.5, 0.35, 0.15)),
    ("Southgate District Hospital",     "Public hospital",     "Waikato",    6.5, (0.5, 0.35, 0.15)),
    ("Kōwhai Private Surgical",         "Private hospital",    "Auckland",   4.0, (0.4, 0.45, 0.15)),
    ("Rimu Bay Private Hospital",       "Private hospital",    "Bay of Plenty", 2.8, (0.4, 0.45, 0.15)),
    ("Ponsonby Medical Centre",         "Medical centre / GP", "Auckland",   1.3, (0.6, 0.35, 0.05)),
    ("Eastside Urgent Care",            "Medical centre / GP", "Auckland",   1.8, (0.55, 0.4, 0.05)),
    ("Riverbend Family Health",         "Medical centre / GP", "Hamilton",   0.9, (0.6, 0.35, 0.05)),
    ("Northshore A&M Clinic",           "Medical centre / GP", "Auckland",   1.5, (0.5, 0.45, 0.05)),
    ("Tamaki Rugby Union (demo)",       "Sports organisation", "Auckland",   0.8, (0.15, 0.7, 0.15)),
    ("Harbour Netball Academy (demo)",  "Sports organisation", "Auckland",   0.4, (0.1, 0.8, 0.1)),
    ("Alpine Adventure Tours Ltd",      "High-injury industry","Queenstown", 0.5, (0.2, 0.6, 0.2)),
    ("Kaimai Forestry Contractors",     "High-injury industry","Bay of Plenty", 0.6, (0.2, 0.6, 0.2)),
    ("Metro Build Group",               "High-injury industry","Auckland",   0.7, (0.15, 0.65, 0.2)),
    ("Coastline Aged Care Trust",       "Aged care / institution","Wellington",1.6, (0.5, 0.35, 0.15)),
    ("Unitech Campus Health (demo)",    "Aged care / institution","Auckland", 0.5, (0.6, 0.35, 0.05)),
]
cust = pd.DataFrame(CUSTOMERS, columns=["customer_name", "segment", "region", "size", "mix"])
cust.insert(0, "customer_id", [f"CUS{i:02d}" for i in range(1, len(cust) + 1)])
cust["payment_terms_days"] = np.where(cust.segment.str.contains("Public"), 60, 30)

# ---------------------------------------------------------------- daily demand
days = pd.date_range(START, TODAY - pd.Timedelta(days=1), freq="D")
t = np.arange(len(days))
doy = days.dayofyear.values
dow = days.dayofweek.values

def seasonal(subcat):
    winter = 1 + 0.25 * np.cos(2 * np.pi * (doy - 196) / 365)          # peak mid-July (NZ winter)
    sport = 1 + 0.35 * np.cos(2 * np.pi * (doy - 150) / 365)           # winter sports season Apr–Sep
    if subcat in ("Sports/Ortho", "Mobility"):
        return sport
    if subcat in ("Antibiotic", "Analgesic", "NSAID", "PPE", "IV fluid"):
        return winter
    return np.ones_like(doy, dtype=float)

weekday = np.where(dow >= 5, 0.35, 1.08)
cat_idx = {"Medicine": 0, "Consumable": 1, "Equipment": 2}
total_size = cust["size"].sum()

rows = []
for _, p in prod.iterrows():
    base = p.base_daily_demand * seasonal(p.subcategory) * weekday * (1 + 0.0004 * t)
    # a demand shock: flu spike in 2026 winter for medicines/PPE
    if p.subcategory in ("Antibiotic", "PPE", "Analgesic"):
        base = base * (1 + 0.4 * np.exp(-((t - (len(days) - 90)) / 18.0) ** 2))
    for _, c in cust.iterrows():
        share = c["size"] / total_size * c["mix"][cat_idx[p.category]] * 3
        if p.subcategory == "Sports/Ortho" and c.segment in ("Sports organisation", "High-injury industry"):
            share *= 3.5
        lam = base * share
        qty = RNG.poisson(np.maximum(lam, 0))
        nz = qty > 0
        for d, q in zip(days[nz], qty[nz]):
            rows.append((d, c.customer_id, p.sku, int(q)))

sales = pd.DataFrame(rows, columns=["date", "customer_id", "sku", "qty"])
sales = sales.merge(prod[["sku", "unit_price_nzd"]], on="sku")
sales["revenue_nzd"] = (sales.qty * sales.unit_price_nzd).round(2)
sales = sales.drop(columns="unit_price_nzd").sort_values(["date", "customer_id", "sku"])

# ---------------------------------------------------------------- purchase orders / shipments
avg_daily = sales.groupby("sku").qty.sum() / len(days)
ports = {"Sea": ["Ports of Auckland", "Port of Tauranga"], "Air": ["Auckland Airport (AKL)"]}
po_rows = []
po_n = 1
for _, p in prod.iterrows():
    s = suppliers.set_index("supplier_id").loc[p.primary_supplier_id]
    cover_days = 45 if s.default_mode == "Sea" else 21
    order_qty = max(p.moq_units, int(avg_daily.get(p.sku, 1) * cover_days * RNG.uniform(0.86, 1.08)))
    d = START - pd.Timedelta(days=int(RNG.integers(0, cover_days)))
    while d < TODAY + pd.Timedelta(days=20):
        lead_plan = int(s.base_lead_days + RNG.integers(-2, 3))
        eta = d + pd.Timedelta(days=lead_plan)
        late = RNG.random() > s.reliability
        delay = int(RNG.gamma(2.0, 4.0 if s.default_mode == "Sea" else 1.5)) if late else int(RNG.integers(-2, 2))
        actual = eta + pd.Timedelta(days=delay)
        received_qty = order_qty if RNG.random() > (1 - s.reliability) / 2 else int(order_qty * RNG.uniform(0.7, 0.95))
        if actual <= TODAY:
            status = "Received"
        elif d > TODAY:
            status = "Planned"
        else:
            frac = (TODAY - d).days / max(1, (actual - d).days)
            status = ("Customs / Medsafe hold" if RNG.random() < 0.12 else
                      "Arrived port" if frac > 0.9 else
                      "In transit" if frac > 0.15 else "Booked")
        po_rows.append(dict(
            po_id=f"PO{po_n:05d}", sku=p.sku, supplier_id=p.primary_supplier_id,
            order_date=d.normalize(), mode=s.default_mode,
            port=RNG.choice(ports[s.default_mode]),
            planned_eta=eta.normalize(), actual_arrival=(actual.normalize() if status == "Received" else pd.NaT),
            forecast_arrival=actual.normalize(),
            qty_ordered=order_qty,
            qty_received=(received_qty if status == "Received" else 0),
            unit_cost_nzd=round(p.unit_cost_nzd * RNG.uniform(0.95, 1.08), 2),
            freight_nzd=round(order_qty * p.unit_cost_nzd * (0.09 if s.default_mode == "Air" else 0.035), 2),
            status=status))
        po_n += 1
        d = d + pd.Timedelta(days=int(cover_days * RNG.uniform(0.85, 1.15)))
pos = pd.DataFrame(po_rows)

# ---------------------------------------------------------------- batches (lots) with expiry, FEFO stock
batch_rows = []
for _, po in pos[pos.status == "Received"].iterrows():
    p = prod.set_index("sku").loc[po.sku]
    if pd.isna(p.shelf_life_days):
        exp = pd.NaT
    else:
        # supplier ships product that's already aged 5–35% of its shelf life
        # short-dated stock is a known issue with some suppliers
        hi = 0.75 if po.supplier_id in ("SUP02", "SUP04") else 0.35
        age = RNG.uniform(0.05, hi) * p.shelf_life_days
        exp = (po.actual_arrival + pd.Timedelta(days=int(p.shelf_life_days - age))).normalize()
    batch_rows.append(dict(batch_id=f"LOT-{po.po_id[2:]}", po_id=po.po_id, sku=po.sku,
                           received_date=po.actual_arrival, expiry_date=exp,
                           qty_received=po.qty_received))
batches = pd.DataFrame(batch_rows)

# Consume batches FEFO against aggregate sales to get on-hand per lot today
batches["qty_on_hand"] = 0
batches["qty_written_off"] = 0
daily = sales.groupby(["sku", "date"]).qty.sum()
for sku, g in batches.groupby("sku"):
    lots = g.sort_values("received_date").copy()
    lots["rem"] = lots.qty_received.astype(float)
    dem = daily.loc[sku] if sku in daily.index.get_level_values(0) else pd.Series(dtype=float)
    for day, q in dem.items():
        # write off expired lots
        expired = lots.expiry_date.notna() & (lots.expiry_date <= day) & (lots.rem > 0)
        batches.loc[lots[expired].index, "qty_written_off"] += lots.loc[expired, "rem"].astype(int)
        lots.loc[expired, "rem"] = 0
        avail = lots[(lots.received_date <= day) & (lots.rem > 0)]
        avail = avail.sort_values(["expiry_date", "received_date"], na_position="last")
        need = q
        for idx, r in avail.iterrows():
            take = min(need, r.rem)
            lots.at[idx, "rem"] -= take
            need -= take
            if need <= 0:
                break
    batches.loc[lots.index, "qty_on_hand"] = lots.rem.round().astype(int)

# Residual slow-moving lots (e.g. after a lost tender or a Pharmac brand switch):
# these sit outside normal FEFO flow and create realistic expiry exposure.
batches["note"] = ""
exp_skus = prod[prod.shelf_life_days.notna()].sample(7, random_state=4)
for i, (_, p) in enumerate(exp_skus.iterrows()):
    days_left = int(RNG.choice([18, 37, 55, 74, 96, 130, 170]))
    qty = int(avg_daily[p.sku] * days_left * RNG.uniform(0.6, 1.6))
    batches.loc[len(batches)] = dict(
        batch_id=f"LOT-R{i+1:03d}", po_id="", sku=p.sku,
        received_date=(TODAY - pd.Timedelta(days=int(p.shelf_life_days - days_left))).normalize(),
        expiry_date=(TODAY + pd.Timedelta(days=days_left)).normalize(),
        qty_received=qty, qty_on_hand=qty, qty_written_off=0,
        note="Residual lot – lost tender / brand switch")

# ---------------------------------------------------------------- write
suppliers.to_csv(OUT / "suppliers.csv", index=False)
prod.to_csv(OUT / "products.csv", index=False)
cust.drop(columns="mix").to_csv(OUT / "customers.csv", index=False)
sales.to_csv(OUT / "sales_daily.csv", index=False)
pos.to_csv(OUT / "purchase_orders.csv", index=False)
batches.to_csv(OUT / "batches.csv", index=False)
print(f"suppliers {len(suppliers)} | products {len(prod)} | customers {len(cust)} | "
      f"sales rows {len(sales):,} | POs {len(pos)} | batches {len(batches)}")
