"""The Shelly Brain organisation chart.

Structure (the same pattern an "AI brain" consultancy builds for a client):

    Brain core      shared by everything: orchestrator, memory, governance, knowledge, learning,
                    reporting, voice & chat, connectors
    Businesses      Neighbourhood store (retail) · Tōtara Medical (medical imports) · Shelly Group (advisory)
    Departments     the business's real departments (ordering, finance, compliance ...)
    Agents          each agent owns a job: its skills, data, schedule, KPIs, how much it may do on its own,
                    when it must hand over to a person, and which agent it passes work to

Autonomy levels
    auto      runs and publishes by itself (analysis, forecasts, reports)
    suggest   prepares a recommendation; a person decides whether to act
    approve   anything with money, compliance or customer impact waits for a named person to approve
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

AUTONOMY = {
    "auto": "Runs and publishes on its own (analysis, forecasts, reports). Nothing leaves the business.",
    "suggest": "Prepares a recommendation with the numbers behind it; a person decides whether to act.",
    "approve": "Money, compliance or customer-facing actions wait for a named person to approve.",
}


@dataclass
class Agent:
    id: str
    name: str
    business: str
    department: str
    mission: str
    skills: list = field(default_factory=list)        # registered skills (shelly.core.skills) or engines
    inputs: list = field(default_factory=list)        # data it reads
    outputs: list = field(default_factory=list)       # what it produces
    triggers: list = field(default_factory=list)      # questions / events that wake it
    schedule: str = "On demand"
    autonomy: str = "suggest"
    guardrails: list = field(default_factory=list)
    escalates_when: list = field(default_factory=list)
    hands_off_to: list = field(default_factory=list)  # agent ids
    owner: str = "Pavi"                                # the human it answers to
    decision_areas: list = field(default_factory=list)  # decision-log areas / escalation kinds it raises
    kpis: list = field(default_factory=list)            # keys resolved to live values at build time
    page: str = ""                                       # where to see its work


@dataclass
class Department:
    id: str
    business: str
    name: str
    purpose: str
    head: str            # human role accountable


BUSINESSES = [
    {"id": "store", "name": "Neighbourhood store", "kind": "Retail · convenience grocery", "colour": "#63b6d8", "icon": "🛒",
     "page": "../index.html", "tagline": "A neighbourhood store run with a daily briefing, a ranked to-do list and decisions that wait for you.",
     "data": "POS sales by product and channel, product master, stock counts, waste log, supplier recalls (synthetic demo)"},
    {"id": "totara", "name": "Tōtara Medical", "kind": "Medical imports · distribution", "colour": "#b69cf2", "icon": "✚",
     "page": "../supply-chain/", "tagline": "An importer of medicines, consumables and equipment: stock-outs, expiry, inbound holds and suppliers under one command.",
     "data": "Sales by client and product, purchase orders, batches with expiry, supplier lead times, Medsafe / WAND status (synthetic demo)"},
    {"id": "group", "name": "Shelly Group", "kind": "Advisory · shared services", "colour": "#7fd1a8", "icon": "◎",
     "page": "../launchpad/", "tagline": "Shared services every business uses (reporting, market intelligence) and advisory packs for other industries.",
     "data": "Outputs of the other businesses, public news sources, industry-pack demo data"},
]

CORE = [
    {"id": "orchestrator", "name": "Orchestrator", "icon": "⇄",
     "what": "Reads every question or event, decides which department agent owns it, and refuses what is outside Shelly's skills (pointing to a connected agent instead).",
     "how": ["Relevance check: domain words + skill trigger phrases + out-of-scope list (travel, email, writing, coding, advice)",
             "Routes to the agent that owns the best-matching skill", "Hands work between agents (e.g. Forecast → Ordering → Roster)"],
     "code": "shelly/core/router.py, shelly/brain/orchestrator.py"},
    {"id": "memory", "name": "Memory", "icon": "◷",
     "what": "Append-only decision log: every proposal, who answered it, when, and why. Nothing is overwritten, so every judgement can be audited.",
     "how": ["JSONL log in state/decisions.jsonl", "Decisions expire after 7 days if unanswered", "Web answers can be exported and imported"],
     "code": "shelly/core/decisions.py"},
    {"id": "governance", "name": "Governance", "icon": "⚖",
     "what": "The rules for what agents may do alone. Money over a threshold, compliance, range, price, credit and markdowns always wait for a person.",
     "how": ["Confirm if impact over a set $ amount", "Always-confirm areas (recall, budget, range, credit, markdown …)", "Read-only data access, no outbound messages without approval"],
     "code": "config.yaml › governance"},
    {"id": "knowledge", "name": "Knowledge", "icon": "▤",
     "what": "What each business's data means: tables, columns, definitions, targets, owners. Real exports are matched to it column by column.",
     "how": ["Data check with confidence per column", "CSV / Excel / SQL database intake (read-only)", "Power BI star schema and Tableau extract on every run"],
     "code": "shelly/ingest.py, shelly/data.py"},
    {"id": "learning", "name": "Learning", "icon": "↻",
     "what": "Gets better from your answers: when you keep rejecting a type of alert, its threshold moves; forecast models are re-ranked on recent accuracy.",
     "how": ["Beta-binomial precision per rule", "Thresholds move only after 5+ answers", "EWMA error per forecast model"],
     "code": "shelly/core/learning.py"},
    {"id": "reporting", "name": "Reporting", "icon": "▦",
     "what": "Turns any agent's work into an Excel workbook (dashboard, formulas, pivots, raw, lookups), a PDF and a presentation.",
     "how": ["11 report types, any category", "Formulas recalculate when inputs change", "Approval sign-off sheet in every report"],
     "code": "shelly/reports/"},
    {"id": "voice", "name": "Voice & chat", "icon": "◉",
     "what": "How you talk to the brain: typed or spoken questions, a time-aware spoken briefing, 27 voice regions, and a sign-off.",
     "how": ["Built-in engine answers from computed facts only", "Optional Claude / Ollama for wording, never for numbers", "Connected agents for out-of-scope questions"],
     "code": "docs/app.js"},
    {"id": "connectors", "name": "Connectors", "icon": "⌁",
     "what": "How data gets in and results get out: folders, SQLite / SQL, Google Sheets, HTTPS APIs, email, and Claude tasks (Gmail, Drive, Calendar).",
     "how": ["HTTPS-only, size-capped", "Credentials from environment variables, never in files", "Each connector has a health check"],
     "code": "shelly/core/connectors.py"},
]

DEPARTMENTS = [
    # Neighbourhood store
    Department("store-exec", "store", "Store management", "Daily priorities, the weekly digest and the decisions that need the manager.", "Store Manager"),
    Department("store-sales", "store", "Sales & category", "What sells, what doesn't, what to range, and what next weeks will look like.", "Store Manager"),
    Department("store-inventory", "store", "Inventory & ordering", "Right stock on the shelf without over-ordering short-life lines.", "Duty Manager"),
    Department("store-people", "store", "People & rostering", "Hours and wages that match the forecast.", "Store Manager"),
    Department("store-loss", "store", "Loss prevention", "Waste, markdowns, count shrinkage and unusual trading.", "Duty Manager"),
    Department("store-compliance", "store", "Compliance & safety", "Recalls, barcodes, liquor and food-safety duties.", "Licence Manager"),
    Department("store-finance", "store", "Finance", "Budget, margin and the profit line.", "Owner"),
    Department("store-channels", "store", "Delivery channels", "Uber Eats and On-Demand running reliably.", "Duty Manager"),
    # Tōtara Medical
    Department("totara-exec", "totara", "Leadership", "The Monday brief and the calls that need a person.", "General Manager"),
    Department("totara-demand", "totara", "Demand planning", "Weekly demand per product with seasonality and accuracy tracking.", "Supply Planner"),
    Department("totara-procurement", "totara", "Procurement & suppliers", "Supplier OTIF, lead-time risk and single-source exposure.", "Procurement Lead"),
    Department("totara-inventory", "totara", "Inventory & warehouse", "Stock-out risk, reorder points and FEFO expiry.", "Warehouse Manager"),
    Department("totara-logistics", "totara", "Logistics & inbound", "Sea and air shipments from booking to shelf.", "Logistics Coordinator"),
    Department("totara-regulatory", "totara", "Regulatory affairs", "Medsafe consent and WAND notifications before clearance.", "Regulatory Officer"),
    Department("totara-sales", "totara", "Sales & clients", "Hospitals, medical centres, sports and high-injury industries: plan vs actual.", "Sales Manager"),
    # Shelly Group
    Department("group-intel", "group", "Market intelligence", "The daily Technology & Data newsletter, verified.", "Pavi"),
    Department("group-reporting", "group", "Reporting & insights", "Reports for any business, on request.", "Pavi"),
    Department("group-advisory", "group", "Industry advisory", "The same engine for electronics, wholesale, warehousing and production.", "Pavi"),
    Department("group-governance", "group", "Governance & learning", "Approvals across every business, and what the brain has learned.", "Pavi"),
]

A = Agent
AGENTS = [
    # ------------------------------------------------------------------ Neighbourhood store
    A("store-briefing", "Briefing agent", "store", "store-exec",
      "Runs the full weekly CRISP-DM cycle and turns it into today's ranked actions and a spoken briefing.",
      skills=["retail.weekly_digest"], inputs=["sales", "products", "stock counts", "waste", "recalls"],
      outputs=["KPIs", "ranked actions P1–P3", "spoken daily briefing", "digest (HTML, WhatsApp, Excel)"],
      triggers=["what should I do today?", "how did we trade?", "briefing"], schedule="Weekly Monday 7am NZ + every page open",
      autonomy="auto", guardrails=["Numbers are computed, never written by an AI", "Synthetic demo data on the public site"],
      escalates_when=["Any action over $250/week impact or in an always-confirm area"],
      hands_off_to=["store-ordering", "store-roster", "store-compliance", "store-budget"], owner="Store Manager", kpis=["store.sales", "store.p1", "store.vs_budget"], page="../index.html#s-act"),
    A("store-forecast", "Forecast agent", "store", "store-sales",
      "Forecasts next week by category with five competing models and picks the best on a rolling backtest.",
      skills=["retail.forecast"], inputs=["daily sales by category", "NZ public holidays"],
      outputs=["7-day forecast", "13-week forecast", "model leaderboard"], triggers=["forecast", "next week", "how busy"],
      schedule="Weekly", autonomy="auto", guardrails=["Backtested before use (WAPE)", "Ranges shown, not single numbers"],
      escalates_when=["Accuracy drops below the naive benchmark"], hands_off_to=["store-ordering", "store-roster", "store-budget"],
      kpis=["store.wape", "store.next_week"], page="../report.html?type=forecast"),
    A("store-category", "Category agent", "store", "store-sales",
      "Segments products and proposes range changes: protect the traffic drivers, review the long tail.",
      skills=["retail.segments", "retail.range_review"], inputs=["13 weeks of product sales", "margin", "waste"],
      outputs=["ABC × segment matrix", "delist / protect proposals", "category review report"],
      triggers=["range review", "which products to delist", "category"], schedule="Monthly", autonomy="approve",
      guardrails=["Never delists on its own", "Bootstrap stability check before trusting segments"],
      escalates_when=["Any delist or range change"], hands_off_to=["store-ordering"], owner="Store Manager",
      decision_areas=["Range", "Category"], kpis=["store.segments"], page="../report.html?type=category"),
    A("store-ordering", "Ordering agent", "store", "store-inventory",
      "Calculates just-in-time reorder points and order quantities, capped by shelf life so orders don't become waste.",
      skills=["retail.reorder"], inputs=["daily demand by product", "stock counts", "lead times", "recalls"],
      outputs=["suggested orders by supplier", "stock-out warnings"], triggers=["what do I need to order?", "reorder", "stock"],
      schedule="Daily", autonomy="approve", guardrails=["Recalled products are blocked", "Order-up-to capped at shelf-life demand"],
      escalates_when=["Order line over $250", "Product below lead-time cover"], hands_off_to=["store-waste"], owner="Duty Manager",
      decision_areas=["Replenishment", "Range & stock"], kpis=["store.order_value", "store.order_now"], page="../report.html?type=stock"),
    A("store-roster", "Roster agent", "store", "store-people",
      "Turns the sales forecast into hours and wages for the next 7 days and 13 weeks.",
      skills=["retail.roster"], inputs=["forecast", "sales-per-hour target", "minimum hours", "wage rate"],
      outputs=["hours by day", "13-week labour budget"], triggers=["roster", "how many hours", "staff"],
      schedule="Weekly", autonomy="suggest", guardrails=["Never below two people open to close"],
      escalates_when=["Wage % of sales above target"], owner="Store Manager", kpis=["store.hours"], page="../report.html?type=labour"),
    A("store-waste", "Shrink & waste agent", "store", "store-loss",
      "Finds unusual trading: spikes, stock-outs, channel outages, shrinkage and waste blow-outs, with robust z-scores.",
      skills=["retail.anomalies"], inputs=["daily sales", "waste log", "stock counts"],
      outputs=["exceptions list", "waste & shrink report"], triggers=["shrinkage", "waste", "anything unusual"],
      schedule="Daily", autonomy="suggest", guardrails=["Ignores anything under $40 impact", "Thresholds learned from your answers"],
      escalates_when=["Count variance above tolerance", "Waste above target"], hands_off_to=["store-ordering"],
      decision_areas=["Markdown"], kpis=["store.exceptions", "store.waste_pct"], page="../report.html?type=waste"),
    A("store-compliance", "Compliance agent", "store", "store-compliance",
      "Matches supplier recalls to stock, checks GS1 barcodes and watches liquor sold by delivery.",
      skills=["retail.compliance"], inputs=["recall notices", "product master (GTINs)", "delivery sales"],
      outputs=["recall pull list", "invalid barcodes", "liquor-by-delivery count"], triggers=["recall", "barcode", "liquor"],
      schedule="Daily + on every recall notice", autonomy="approve",
      guardrails=["A recalled product is blocked from reordering immediately"],
      escalates_when=["Any recall match (P1, today)"], hands_off_to=["store-ordering"], owner="Licence Manager",
      decision_areas=["Compliance - recall"], kpis=["store.recalls"], page="../index.html#s-act"),
    A("store-budget", "Budget agent", "store", "store-finance",
      "Builds the monthly budget (last year + growth target) and checks it against the forecast, by category.",
      skills=["reports.budget"], inputs=["24 months of sales and margin", "growth target"],
      outputs=["budget plan 1–12 months", "gap by category", "Excel model with live formulas"],
      triggers=["make a budget", "next quarter", "are we on budget"], schedule="Monthly", autonomy="approve",
      guardrails=["Budget is never final until approved"], escalates_when=["Category forecast more than 1.5% below budget"],
      owner="Owner", decision_areas=["Budget", "Margin"], kpis=["store.budget_3m", "store.gap_3m"], page="../report.html?type=budget"),
    A("store-channels", "Delivery agent", "store", "store-channels",
      "Watches Uber Eats and On-Demand: outages, share of sales and week-on-week change.",
      skills=["retail.anomalies"], inputs=["sales by channel"], outputs=["channel outage alerts", "delivery share"],
      triggers=["is Uber Eats ok", "delivery"], schedule="Daily", autonomy="suggest",
      escalates_when=["A channel at $0 on a normal trading day"], owner="Duty Manager", decision_areas=["Delivery channel"],
      kpis=["store.delivery_share"], page="../index.html#s-ops"),
    # ------------------------------------------------------------------ Tōtara Medical
    A("totara-brief", "Monday brief agent", "totara", "totara-exec",
      "Writes the Monday brief and lists every judgement that needs a person, across the whole supply chain.",
      skills=["medical.brief"], inputs=["all Tōtara agents' findings"], outputs=["Monday brief", "escalation list"],
      triggers=["what needs my attention", "supply chain brief"], schedule="Weekly Monday", autonomy="auto",
      escalates_when=["Anything from the agents below that needs approval"],
      hands_off_to=["totara-stock", "totara-inbound", "totara-suppliers"], owner="General Manager", kpis=["totara.escalations"],
      page="../supply-chain/"),
    A("totara-demand", "Demand forecast agent", "totara", "totara-demand",
      "Forecasts weekly demand per product with SARIMA-X and NZ seasonality (winter illness, winter sport).",
      skills=["medical.supply_chain"], inputs=["24 months of sales by product and client"],
      outputs=["13-week forecast with 80% band", "8-week holdout accuracy"], triggers=["demand forecast", "how much will we sell"],
      schedule="Weekly", autonomy="auto", guardrails=["Compared with a naive forecast every run"],
      hands_off_to=["totara-stock"], owner="Supply Planner", kpis=["totara.wape"], page="../supply-chain/"),
    A("totara-stock", "Stock & expiry agent", "totara", "totara-inventory",
      "Sets reorder points at a 95% service level and projects first-expiry-first-out sales to find stock that will expire unsold.",
      skills=["medical.supply_chain"], inputs=["stock on hand by batch", "expiry dates", "lead times", "forecast"],
      outputs=["stock-out risk list", "expiry write-off risk", "redistribution / clearance proposals"],
      triggers=["which products will run out", "expiring stock"], schedule="Daily", autonomy="approve",
      guardrails=["Never air-freights, discounts or returns stock without approval"],
      escalates_when=["Stock runs out before the next arrival", "Stock won't sell before expiry"],
      hands_off_to=["totara-inbound", "totara-suppliers"], owner="Warehouse Manager", decision_areas=["Stock-out risk", "Expiry"],
      kpis=["totara.at_risk", "totara.expiry_risk"], page="../supply-chain/"),
    A("totara-suppliers", "Supplier agent", "totara", "totara-procurement",
      "Scores suppliers on on-time-in-full, lead-time volatility, short-dated deliveries and single-source dependency.",
      skills=["medical.supply_chain"], inputs=["purchase orders", "deliveries", "batches"], outputs=["supplier scorecard", "risk 0–100"],
      triggers=["supplier OTIF", "which supplier is risky"], schedule="Weekly", autonomy="suggest",
      escalates_when=["Supplier risk above 60", "OTIF below 85%"], owner="Procurement Lead", kpis=["totara.otif"], page="../supply-chain/"),
    A("totara-inbound", "Inbound agent", "totara", "totara-logistics",
      "Tracks every open purchase order from booking to arrival at Auckland or Tauranga, and flags gaps before the ETA.",
      skills=["medical.supply_chain"], inputs=["open POs", "ETAs", "shipping mode"], outputs=["inbound pipeline", "gap-before-ETA alerts"],
      triggers=["shipments", "when does it arrive"], schedule="Daily", autonomy="suggest",
      escalates_when=["Stock runs out before the shipment lands"], hands_off_to=["totara-regulatory"], owner="Logistics Coordinator",
      kpis=["totara.inbound", "totara.holds"], page="../supply-chain/"),
    A("totara-regulatory", "Regulatory agent", "totara", "totara-regulatory",
      "Checks Medsafe consent for medicines and WAND notification for devices before a shipment can clear.",
      skills=["medical.supply_chain"], inputs=["product regulatory status", "inbound shipments"], outputs=["clearance holds"],
      triggers=["Medsafe", "WAND", "on hold"], schedule="On every shipment", autonomy="approve",
      guardrails=["Never releases a held shipment"], escalates_when=["Any clearance hold"], owner="Regulatory Officer",
      kpis=["totara.holds"], page="../supply-chain/"),
    A("totara-clients", "Client agent", "totara", "totara-sales",
      "Compares sales with plan for every client over 12 weeks and segments clients by what and how they buy.",
      skills=["medical.supply_chain"], inputs=["sales by client", "plan"], outputs=["vision board", "client segments"],
      triggers=["sales vs plan", "which clients are behind"], schedule="Weekly", autonomy="auto", owner="Sales Manager",
      kpis=["totara.vs_plan"], page="../supply-chain/"),
    # ------------------------------------------------------------------ Shelly Group
    A("group-td", "TD Report agent", "group", "group-intel",
      "Researches, verifies and emails the Technology & Data newsletter every morning at 6:15am NZ.",
      skills=["claude_task (Gmail, Drive, web search)"], inputs=["public news", "your feedback replies"],
      outputs=["daily email", "Drive archive"], triggers=["TD report", "news"], schedule="Daily 6:15am NZ", autonomy="auto",
      guardrails=["Emails only you", "Every item needs 2 sources or 1 official source", "Markets: information, not advice"],
      kpis=[], page="../guide/td-report.html"),
    A("group-reports", "Report agent", "group", "group-reporting",
      "Builds any of the 11 report types for any business and category: Excel, PDF and presentation.",
      skills=["reports.*"], inputs=["every agent's results"], outputs=["Excel workbooks", "PDFs", "report pages"],
      triggers=["make a report", "excel", "pdf"], schedule="On demand + weekly rebuild", autonomy="auto",
      guardrails=["Approvals section in every report"], kpis=["group.reports"], page="../report.html"),
    A("group-electronics", "Electronics agent", "group", "group-advisory",
      "Sell-through, weeks of cover, aged stock markdowns, price erosion and attach rate.",
      skills=["electronics.sell_through", "electronics.aged_stock", "electronics.price_erosion", "electronics.attach_rate"],
      inputs=["weekly sales", "stock", "products"], outputs=["electronics report"], triggers=["electronics", "TVs", "aged stock"],
      schedule="On demand", autonomy="approve", escalates_when=["Any markdown"], decision_areas=["Markdown", "Attach", "Range & stock"],
      kpis=[], page="../report.html?type=pack-electronics"),
    A("group-wholesale", "Wholesale agent", "group", "group-advisory",
      "Customer profitability after cost-to-serve, receivables ageing and OTIF.",
      skills=["wholesale.customer_profitability", "wholesale.ar_ageing", "wholesale.fill_rate"],
      inputs=["invoices", "orders", "receivables"], outputs=["wholesale report"], triggers=["wholesale", "debtors", "credit"],
      schedule="On demand", autonomy="approve", escalates_when=["Credit holds", "Customer terms changes"],
      decision_areas=["Credit", "Customer terms"], kpis=[], page="../report.html?type=pack-wholesale"),
    A("group-warehousing", "Warehouse agent", "group", "group-advisory",
      "ABC-XYZ slotting, pick productivity and capacity runway.",
      skills=["warehousing.abc_xyz", "warehousing.productivity", "warehousing.capacity"], inputs=["picks", "labour", "locations"],
      outputs=["warehouse report"], triggers=["warehouse", "slotting", "picking"], schedule="On demand", autonomy="approve",
      escalates_when=["Re-slotting moves"], decision_areas=["Slotting"], kpis=[], page="../report.html?type=pack-warehousing"),
    A("group-production", "Production agent", "group", "group-advisory",
      "OEE, scrap cost and schedule adherence by line.",
      skills=["production.oee", "production.scrap", "production.schedule_adherence"], inputs=["production runs"],
      outputs=["production report"], triggers=["OEE", "scrap", "production"], schedule="On demand", autonomy="approve",
      escalates_when=["Quality root-cause actions"], decision_areas=["Quality", "Production"], kpis=[], page="../report.html?type=pack-production"),
    A("group-governance", "Approvals agent", "group", "group-governance",
      "Collects every proposal from every agent into one approvals queue, applies the governance rules and records your answers.",
      skills=["core.decisions"], inputs=["all proposals"], outputs=["approvals queue", "decision log"],
      triggers=["what needs my confirmation", "approve"], schedule="Continuous", autonomy="auto",
      guardrails=["Append-only log", "Unanswered proposals expire after 7 days"], kpis=["group.pending"], page="../index.html#s-dec"),
    A("group-learning", "Learning agent", "group", "group-governance",
      "Moves alert thresholds from your answers and re-ranks forecast models on recent accuracy.",
      skills=["core.learning"], inputs=["decision log", "forecast accuracy"], outputs=["updated thresholds", "model ranking"],
      triggers=["what have you learned"], schedule="Every run", autonomy="auto",
      guardrails=["Needs 5+ answers before changing a rule", "Changes are logged and reversible"], kpis=[], page="../index.html#s-dec"),
]


def org() -> dict:
    """The organisation as plain data (no live numbers)."""
    return {"autonomy": AUTONOMY, "core": CORE, "businesses": BUSINESSES,
            "departments": [asdict(d) for d in DEPARTMENTS], "agents": [asdict(a) for a in AGENTS]}
