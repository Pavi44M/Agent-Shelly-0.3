"""The Shelly Brain organisation chart.

Structure (the same pattern an "AI brain" consultancy builds for a client):

    Brain core      shared by everything: orchestrator, memory, governance, knowledge, learning,
                    reporting, voice & chat, connectors
    Businesses      Neighbourhood store (retail) · Tōtara Medical (medical imports) · Shelly Group (advisory),
                    plus future businesses that come in through the Opportunities pipeline
    Departments     eight company-wide departments that serve every business: Management Team, Finance,
                    Sales, Inventory, Office Manager, HR, IT, Developers. Each has a head (an agent + the
                    person accountable) with a spending limit; agents keep a "team" naming the business unit
    Approvals       every request first goes to its own department head; over that head's limit it goes to
                    Finance for a funds check; big spends, new-business funding, hires and policy go to
                    Management (Pavi). Payroll: Office Manager confirms shifts → Finance runs pay.
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
    team: str = ""                                       # business unit inside the department (e.g. "Store · ordering")
    work: list = field(default_factory=list)             # current work items [status, text] (status: doing/next/done/backlog)


@dataclass
class Team:
    """A business unit (the original per-business departments). Agents keep their team inside a department."""
    id: str
    business: str
    name: str
    purpose: str
    head: str


@dataclass
class Department:
    id: str
    name: str
    purpose: str
    head: str            # the person accountable
    head_agent: str      # the agent that runs the department day to day and answers "status?"
    colour: str
    icon: str
    limit: int           # NZ$ the department head may approve on their own
    budget: int          # NZ$ per month allocated by Finance (funds control)
    approves: list = field(default_factory=list)   # what this head signs off


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

TEAMS = [ Team(*t) for t in [
    # Neighbourhood store
    ("store-exec", "store", "Store management", "Daily priorities, the weekly digest and the decisions that need the manager.", "Store Manager"),
    ("store-sales", "store", "Sales & category", "What sells, what doesn't, what to range, and what next weeks will look like.", "Store Manager"),
    ("store-inventory", "store", "Inventory & ordering", "Right stock on the shelf without over-ordering short-life lines.", "Duty Manager"),
    ("store-people", "store", "People & rostering", "Hours and wages that match the forecast.", "Store Manager"),
    ("store-loss", "store", "Loss prevention", "Waste, markdowns, count shrinkage and unusual trading.", "Duty Manager"),
    ("store-compliance", "store", "Compliance & safety", "Recalls, barcodes, liquor and food-safety duties.", "Licence Manager"),
    ("store-finance", "store", "Finance", "Budget, margin and the profit line.", "Owner"),
    ("store-channels", "store", "Delivery channels", "Uber Eats and On-Demand running reliably.", "Duty Manager"),
    # Tōtara Medical
    ("totara-exec", "totara", "Leadership", "The Monday brief and the calls that need a person.", "General Manager"),
    ("totara-demand", "totara", "Demand planning", "Weekly demand per product with seasonality and accuracy tracking.", "Supply Planner"),
    ("totara-procurement", "totara", "Procurement & suppliers", "Supplier OTIF, lead-time risk and single-source exposure.", "Procurement Lead"),
    ("totara-inventory", "totara", "Inventory & warehouse", "Stock-out risk, reorder points and FEFO expiry.", "Warehouse Manager"),
    ("totara-logistics", "totara", "Logistics & inbound", "Sea and air shipments from booking to shelf.", "Logistics Coordinator"),
    ("totara-regulatory", "totara", "Regulatory affairs", "Medsafe consent and WAND notifications before clearance.", "Regulatory Officer"),
    ("totara-sales", "totara", "Sales & clients", "Hospitals, medical centres, sports and high-injury industries: plan vs actual.", "Sales Manager"),
    # Shelly Group
    ("group-intel", "group", "Market intelligence", "The daily Technology & Data newsletter, verified.", "Pavi"),
    ("group-reporting", "group", "Reporting & insights", "Reports for any business, on request.", "Pavi"),
    ("group-advisory", "group", "Industry advisory", "The same engine for electronics, wholesale, warehousing and production.", "Pavi"),
    ("group-governance", "group", "Governance & learning", "Approvals across every business, and what the brain has learned.", "Pavi"),
]]

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


# ====================================================================== company-wide departments
DEPARTMENTS = [
    Department("mgmt", "Management Team", "Direction, the weekly briefs, compliance and risk, new opportunities, and the calls only the owner makes.",
               "Pavi (Managing Director)", "mgmt-head", "#f2c14e", "★", 1_000_000, 0,
               ["New business and opportunity funding", "Spend over Finance's limit", "Hiring", "Policy, pricing and customer-terms changes"]),
    Department("finance", "Finance", "Funds control for every business: budgets, cash, receivables, payroll and the money side of every approval.",
               "Finance Manager", "fin-head", "#7fd1a8", "$", 10_000, 6_000,
               ["Any spend over a department head's limit (funds check against budget)", "Pay runs", "Budget changes"]),
    Department("sales", "Sales", "What sells and to whom: forecasts, ranges, delivery channels, hospital and clinic clients, and advisory clients.",
               "Sales Manager", "sales-head", "#63b6d8", "↗", 1_000, 4_000,
               ["Range changes", "Markdowns under $1k", "Client plans"]),
    Department("inventory", "Inventory", "The right stock in the right place: ordering, waste, expiry, suppliers, inbound shipments and demand plans.",
               "Inventory Manager", "inv-head", "#b69cf2", "▣", 2_000, 25_000,
               ["Purchase orders under $2k", "Write-offs under $2k", "Supplier changes"]),
    Department("office", "Office Manager", "Runs the place: decides shifts and rosters for every business, facilities, supplies and the office calendar.",
               "Office Manager", "office-head", "#ff9f6e", "◷", 500, 2_500,
               ["Shifts and rosters (all businesses)", "Facilities and supplies under $500"]),
    Department("hr", "HR", "Minimum HR: contracts, onboarding, leave and policies. Hiring decisions sit with Management.",
               "HR Advisor", "hr-head", "#f28fb3", "♥", 300, 800,
               ["Onboarding packs", "Leave requests"]),
    Department("it", "IT", "Systems, security, data connectors and the reporting service every department uses.",
               "IT Manager", "it-head", "#5ec8c8", "⌁", 800, 1_500,
               ["Access requests", "New connectors", "Software under $800"]),
    Department("dev", "Developers", "Builds and ships Shelly itself: releases, tests, model quality and what the brain learns.",
               "Lead Developer", "dev-head", "#9aa7ff", "</>", 400, 1_200,
               ["Releases to the live site", "Model changes after backtest"]),
]

# heads and the new company-wide agents
AGENTS += [
    A("mgmt-head", "Chief of Staff", "group", "mgmt", "Runs the Management Team for Pavi: one view of every department's status, issues and approvals, and the weekly priorities.",
      skills=["governance.queue"], inputs=["department status", "approvals queue", "briefs"], outputs=["weekly priorities", "status of any department", "escalations to Pavi"],
      triggers=["how is the company doing", "department status", "what needs Pavi"], schedule="Weekdays 7:30am", autonomy="suggest",
      guardrails=["Never approves money on Pavi's behalf"], escalates_when=["Anything over Finance's limit", "Any new business funding"],
      hands_off_to=["fin-head", "office-head"], owner="Pavi", page="../brain/",
      work=[["doing", "Collecting Monday status from all 8 department heads"], ["next", "Weekly priorities for Pavi (Mon 8:00)"], ["done", "Escalated the opportunity shortlist to Finance"]]),
    A("mgmt-opps", "Opportunities agent", "group", "mgmt", "Keeps the pipeline of future businesses and new revenue: scores each idea (market, margin, payback, risk) and asks Finance for funds.",
      skills=["finance.score"], inputs=["opportunity briefs", "market data", "Finance budgets"], outputs=["opportunity scorecards", "funding requests"],
      triggers=["new business", "opportunity", "should we open"], schedule="Weekly Thursday", autonomy="approve",
      guardrails=["Scores are explained, never a single number", "No commitment without Finance and Pavi"], escalates_when=["Every funding request"],
      hands_off_to=["fin-funds", "mgmt-head"], owner="Pavi", page="../brain/#opps",
      work=[["doing", "Scoring 'Clinic consumables subscription'"], ["next", "Market check: second neighbourhood store"], ["done", "Payback model for advisory retainers"]]),
    A("fin-head", "Finance head", "group", "finance", "Controls the funds of every business: checks each request against the department budget, signs off within limit, and runs payroll after Office Manager confirms shifts.",
      skills=["finance.funds"], inputs=["budgets", "approvals with amounts", "cash position"], outputs=["funds checks", "budget vs spend", "monthly finance pack"],
      triggers=["funds", "how much budget is left", "finance status", "cash"], schedule="Weekdays 9:00", autonomy="approve",
      guardrails=["Every spend is checked against its department budget", "Over $10k goes to Pavi"], escalates_when=["Over $10k", "Department over budget"],
      hands_off_to=["fin-payroll", "mgmt-head"], owner="Finance Manager", page="../brain/#funds",
      work=[["doing", "Funds check on 4 requests from Inventory and IT"], ["next", "Month-end budget vs spend pack"], ["done", "Released October budgets to departments"]]),
    A("fin-funds", "Funds controller", "group", "finance", "Holds each department's monthly budget, commits spend as approvals come through, and warns before anyone runs over.",
      skills=["finance.funds"], inputs=["department budgets", "approved spend", "pending requests"], outputs=["funds board", "over-budget warnings"],
      triggers=["budget left", "funds board", "over budget"], schedule="Continuous", autonomy="auto",
      guardrails=["Read-only on bank data"], hands_off_to=["fin-head"], owner="Finance Manager", page="../brain/#funds",
      work=[["doing", "Committing approved spend against budgets"], ["done", "Warned Inventory at 82% of budget"]]),
    A("fin-payroll", "Payroll agent", "group", "finance", "Builds each pay run from the shifts Office Manager confirmed, checks hours and rates, and waits for Finance sign-off.",
      skills=["finance.payroll"], inputs=["confirmed shifts", "pay rates", "leave"], outputs=["pay run", "payslips (draft)", "wage cost vs budget"],
      triggers=["payroll", "pay run", "wages"], schedule="Weekly Tuesday 10:00", autonomy="approve",
      guardrails=["Only shifts confirmed by Office Manager are paid", "Never sends money: drafts the run for approval"], escalates_when=["Every pay run"],
      hands_off_to=["fin-head"], owner="Finance Manager", page="../brain/#funds",
      work=[["next", "Pay run for week ending Sun (waits for shift confirmation)"], ["done", "Last pay run reconciled"]]),
    A("fin-cash", "Cash & receivables agent", "group", "finance", "Watches cash in every business: client debtors, supplier payments due and the 13-week cash view.",
      skills=["wholesale.ar_ageing"], inputs=["invoices", "payments", "supplier terms"], outputs=["debtor list", "13-week cash", "chase list"],
      triggers=["who owes us", "debtors", "cash flow"], schedule="Weekdays 8:00", autonomy="suggest",
      guardrails=["No credit holds without Finance head"], hands_off_to=["fin-head", "sales-head"], owner="Finance Manager", page="../brain/#funds",
      work=[["doing", "Debtor days by client (Tōtara)"], ["next", "Chase list for 3 clients over 45 days"]]),
    A("sales-head", "Sales head", "group", "sales", "Leads Sales across the store, Tōtara clients and advisory: plan vs actual, ranges, channels and which clients need attention.",
      inputs=["sales", "client plans", "forecasts"], outputs=["sales status", "weekly sales brief"], triggers=["sales status", "how are sales"],
      schedule="Weekdays 8:30", autonomy="suggest", escalates_when=["Over $1k", "Customer terms changes"], hands_off_to=["fin-head", "inv-head"],
      owner="Sales Manager", page="../index.html#s-act",
      work=[["doing", "Plan vs actual for 14 Tōtara clients"], ["next", "Range review sign-off for the store"], ["done", "Weekly sales brief"]]),
    A("inv-head", "Inventory head", "group", "inventory", "Leads Inventory for every business: orders, write-offs, expiry and suppliers; signs off under $2k and sends bigger orders to Finance.",
      inputs=["orders", "stock", "expiry", "inbound"], outputs=["inventory status", "approved orders"], triggers=["inventory status", "stock status"],
      schedule="Weekdays 7:00", autonomy="approve", escalates_when=["Orders over $2k", "Recalls"], hands_off_to=["fin-head"], owner="Inventory Manager",
      page="../supply-chain/",
      work=[["doing", "Reviewing today's store order ($1.7k)"], ["next", "Tōtara expiry write-off decision"], ["done", "Supplier scorecard for September"]]),
    A("office-head", "Office manager", "group", "office", "Decides the shifts and rosters for every business, keeps the office calendar, and handles facilities and supplies.",
      inputs=["roster suggestions", "leave", "forecast hours"], outputs=["confirmed shifts", "office calendar", "supply orders"],
      triggers=["shifts", "who is working", "office status", "facilities"], schedule="Weekdays 8:00 + Thursday shift sign-off", autonomy="approve",
      guardrails=["Never below two people open to close", "Shifts confirmed before payroll runs"], escalates_when=["Overtime over budget", "Over $500"],
      hands_off_to=["fin-payroll", "hr-head"], owner="Office Manager", page="../brain/",
      work=[["doing", "Confirming next week's shifts (store + Tōtara warehouse)"], ["next", "Send shift confirmations for tomorrow (17:00)"], ["done", "Booked fire-safety check"]]),
    A("office-shifts", "Warehouse shift agent", "totara", "office", "Plans Tōtara warehouse shifts from inbound shipments and pick volumes, then hands them to Office Manager to confirm.",
      inputs=["inbound schedule", "pick volumes", "leave"], outputs=["shift plan", "cover gaps"], triggers=["warehouse shifts", "who is picking"],
      schedule="Weekly Thursday", autonomy="suggest", hands_off_to=["office-head"], owner="Office Manager", page="../supply-chain/",
      work=[["doing", "Cover for 2 sea containers next Tuesday"], ["next", "Flag anyone not checked in 15 min after start"]]),
    A("office-admin", "Facilities & supplies agent", "group", "office", "Keeps the office and stores running: supplies, maintenance, bookings and safety checks.",
      inputs=["supply levels", "maintenance log"], outputs=["supply orders", "bookings"], triggers=["supplies", "maintenance"],
      schedule="Weekly Monday", autonomy="approve", escalates_when=["Over $500"], hands_off_to=["office-head"], owner="Office Manager", page="../brain/",
      work=[["next", "Order cleaning and packaging supplies"], ["done", "Chiller service booked"]]),
    A("hr-head", "HR lead", "group", "hr", "Minimum HR for every business: contracts, onboarding packs, leave and policies. Hiring decisions go to Management.",
      inputs=["new starters", "leave requests", "policies"], outputs=["onboarding packs", "leave decisions", "policy answers"],
      triggers=["onboarding", "new starter", "leave", "contract", "policy"], schedule="Weekdays 9:00", autonomy="approve", escalates_when=["Any hire", "Disputes"],
      hands_off_to=["office-head", "mgmt-head"], owner="HR Advisor", page="../brain/",
      work=[["doing", "Onboarding pack for Monday's starter"], ["next", "Leave calendar for December"]]),
    A("hr-leave", "Leave & policy agent", "group", "hr", "Answers policy questions, tracks leave balances and checks leave against the shifts Office Manager has planned.",
      inputs=["leave requests", "policies", "shift plan"], outputs=["leave calendar", "policy answers"], triggers=["leave balance", "policy question"],
      schedule="Daily 9:00", autonomy="suggest", hands_off_to=["office-head"], owner="HR Advisor", page="../brain/",
      work=[["doing", "December leave vs shift plan"], ["done", "Answered 3 policy questions"]]),
    A("it-head", "IT head", "group", "it", "Runs IT for every business: systems, access, security, connectors and the reporting service.",
      inputs=["system health", "access requests"], outputs=["IT status", "access decisions"], triggers=["it status", "access", "system down"],
      schedule="Weekdays 8:00", autonomy="approve", escalates_when=["Software over $800", "Security incidents"], hands_off_to=["fin-head", "dev-head"],
      owner="IT Manager", page="../brain/",
      work=[["doing", "Connector health checks (7 sources)"], ["next", "Quarterly access review"], ["done", "Backup restore test passed"]]),
    A("it-connect", "Connectors agent", "group", "it", "Brings data in from every source (POS, Excel, ERP, databases) with a column-by-column data check.",
      skills=["shelly.check"], inputs=["exports", "databases"], outputs=["data checks", "connector health"], triggers=["connect data", "data check", "import"],
      schedule="Daily 5:30am", autonomy="auto", guardrails=["Read-only database access"], hands_off_to=["it-head"], owner="IT Manager", page="../brain/",
      work=[["doing", "Nightly POS export check"], ["done", "Mapped 12/12 columns in Tōtara orders"]]),
    A("it-security", "Security agent", "group", "it", "Watches access, secrets and the public site: no keys in files, no employer data, read-only connectors.",
      inputs=["repo scan", "access list"], outputs=["security report"], triggers=["security", "is it safe", "secure", "site secure"], schedule="Weekly Friday",
      autonomy="auto", hands_off_to=["it-head"], owner="IT Manager", page="../guide/security.html",
      work=[["next", "Weekly secret scan (Fri)"], ["done", "CSP and dependency check clean"]]),
    A("dev-head", "Dev lead", "group", "dev", "Leads the developers building Shelly: what ships next, release sign-off and test health.",
      inputs=["backlog", "test results"], outputs=["release plan", "release sign-off"], triggers=["dev status", "what ships next", "release"],
      schedule="Weekdays 10:00", autonomy="approve", escalates_when=["Releases to the live site"], hands_off_to=["it-head"], owner="Lead Developer", page="../brain/",
      work=[["doing", "Shelly HQ v2 release"], ["next", "Router fix for out-of-scope requests"], ["done", "3D mascot shipped"]]),
    A("dev-release", "Release agent", "group", "dev", "Builds the site, runs every test and browser check, and prepares the release for sign-off.",
      inputs=["code", "tests"], outputs=["build", "test report"], triggers=["build", "tests", "deploy"], schedule="On every change", autonomy="auto",
      guardrails=["Nothing ships with a failing test"], hands_off_to=["dev-head"], owner="Lead Developer", page="../brain/",
      work=[["doing", "Browser checks on 5 pages"], ["done", "43 tests passing"]]),
    A("dev-models", "Model QA agent", "group", "dev", "Backtests every forecast model before it is used and keeps the accuracy league table honest.",
      inputs=["forecast history"], outputs=["backtest report", "model ranking"], triggers=["model accuracy", "backtest"], schedule="Weekly Sunday",
      autonomy="auto", guardrails=["Compared against a naive forecast every run"], hands_off_to=["dev-head"], owner="Lead Developer", page="../index.html#s-models",
      work=[["next", "Weekly backtest (Sun)"], ["done", "XGBoost re-ranked first on 12-week error"]]),
]

# where each existing agent now sits: department + its team (business unit)
_HOME = {
    "store-briefing": "mgmt", "totara-brief": "mgmt", "group-td": "mgmt", "group-governance": "mgmt",
    "store-compliance": "mgmt", "totara-regulatory": "mgmt",
    "store-budget": "finance",
    "store-forecast": "sales", "store-category": "sales", "store-channels": "sales", "totara-clients": "sales",
    "group-electronics": "sales", "group-wholesale": "sales", "group-warehousing": "sales", "group-production": "sales",
    "store-ordering": "inventory", "store-waste": "inventory", "totara-stock": "inventory", "totara-demand": "inventory",
    "totara-suppliers": "inventory", "totara-inbound": "inventory",
    "store-roster": "office",
    "group-reports": "it",
    "group-learning": "dev",
}
_TEAM = {t.id: t for t in TEAMS}
_BIZN = {"store": "Store", "totara": "Tōtara", "group": "Group"}
for _a in AGENTS:
    if _a.department in _TEAM:
        _t = _TEAM[_a.department]
        _a.team = f"{_BIZN[_t.business]} · {_t.name}"
        _a.department = _HOME[_a.id]
    elif not _a.team:
        _a.team = "Company-wide" if _a.business == "group" else f"{_BIZN[_a.business]}"
for _d in DEPARTMENTS:   # every agent in a department reports to its head
    for _a in AGENTS:
        if _a.department == _d.id and _a.id != _d.head_agent and _d.head_agent not in _a.hands_off_to:
            _a.hands_off_to.append(_d.head_agent)

# ====================================================================== approvals policy
POLICY = {
    "always_mgmt": ["Opportunity", "New business", "Hiring", "Policy", "Customer terms", "Price", "Credit"],
    "always_finance": ["Pay run", "Budget", "Markdown", "Write-off"],
    "payroll": ["office", "finance"],
    "summary": [
        "Step 1 · inside the department: the agent's own department head reviews every request.",
        "Step 2 · Finance: anything over the head's limit, or any budget, pay run, markdown or write-off, gets a funds check.",
        "Step 3 · Management (Pavi): over Finance's $10k limit, new business funding, hiring, policy, pricing, credit and customer terms.",
        "Payroll: Office Manager confirms shifts → Finance head approves the pay run.",
    ],
}


def approval_chain(dept: str, area: str, amount) -> list:
    """Who signs, in order: [{dept, role, head}]. The last step is the final decision.
    1 · own department head  2 · Finance funds check (over the head's limit, or money areas)
    3 · Pavi (over Finance's limit, new business, hiring, policy, pricing, credit, customer terms)."""
    D = {d.id: d for d in DEPARTMENTS}
    amt, al = abs(amount or 0), area.lower()
    if area == "Pay run":
        steps = ["office", "finance"]
    else:
        to_mgmt = amt > D["finance"].limit or any(k.lower() in al for k in POLICY["always_mgmt"])
        to_fin = to_mgmt or amt > D[dept].limit or any(k.lower() in al for k in POLICY["always_finance"])
        steps = [dept]
        if to_fin and dept != "finance":
            steps.append("finance")
        if to_mgmt:
            steps.append("pavi")
    out = []
    for x in steps:
        if x == "pavi":
            out.append({"dept": "mgmt", "role": "Pavi (Managing Director)", "head": "mgmt-head", "final": True})
        else:
            role = "Chief of Staff" if x == "mgmt" else D[x].head
            out.append({"dept": x, "role": role, "head": D[x].head_agent})
    return out


# ====================================================================== future businesses
OPPORTUNITIES = [
    {"id": "opp-clinic-sub", "name": "Clinic consumables subscription", "business": "Tōtara Medical (new line)", "stage": "Scoring",
     "ask": 18_000, "score": 74, "payback_months": 9, "owner": "Opportunities agent",
     "why": "Monthly boxes of gloves, dressings and swabs for 40 GP clinics; Tōtara already holds the stock and the clients."},
    {"id": "opp-store-2", "name": "Second neighbourhood store", "business": "New business", "stage": "Market check",
     "ask": 120_000, "score": 61, "payback_months": 30, "owner": "Opportunities agent",
     "why": "Same playbook as store #1 in a growing suburb; needs a site, a lease review and a full budget."},
    {"id": "opp-advisory", "name": "Advisory retainers (electronics & wholesale)", "business": "Shelly Group", "stage": "Funding request",
     "ask": 6_500, "score": 82, "payback_months": 4, "owner": "Opportunities agent",
     "why": "Sell the industry packs as a monthly retainer to 3 pilot clients; mostly time, small marketing spend."},
    {"id": "opp-delivery", "name": "Own delivery for the store", "business": "Neighbourhood store", "stage": "Idea",
     "ask": 9_000, "score": 48, "payback_months": 18, "owner": "Opportunities agent",
     "why": "Replace part of the Uber Eats share with own delivery at lower commission; risky on staffing."},
]

# requests raised by the new departments (synthetic demo), each runs through approval_chain()
ORG_REQUESTS = [
    {"id": "pay-wk40", "agent": "fin-payroll", "dept": "finance", "area": "Pay run", "amount": 11_840,
     "title": "Pay run for week ending Sunday: 312 hours across store and Tōtara warehouse",
     "text": "Built from shifts confirmed by Office Manager · 2 overtime shifts flagged"},
    {"id": "opp-advisory", "agent": "mgmt-opps", "dept": "mgmt", "area": "Opportunity funding", "amount": 6_500,
     "title": "Fund 'Advisory retainers' pilot: $6.5k for 3 pilot clients",
     "text": "Score 82/100 · payback about 4 months · Finance funds check needed"},
    {"id": "it-licence", "agent": "it-head", "dept": "it", "area": "Software", "amount": 1_200,
     "title": "Power BI Pro licences for Finance and Sales (6 users, 12 months)",
     "text": "Over the IT head's $800 limit, so it goes to Finance"},
    {"id": "hr-hire", "agent": "hr-head", "dept": "hr", "area": "Hiring", "amount": 0,
     "title": "Hire a part-time warehouse picker for Tōtara (20 h/week)",
     "text": "Requested by Warehouse shift agent: cover gap on container days"},
    {"id": "office-supplies", "agent": "office-admin", "dept": "office", "area": "Supplies", "amount": 380,
     "title": "Cleaning and packaging supplies for October",
     "text": "Within the Office Manager's $500 limit"},
    {"id": "dev-release", "agent": "dev-head", "dept": "dev", "area": "Release", "amount": 0,
     "title": "Release Shelly HQ v2 to the live site",
     "text": "All tests and browser checks pass"},
    {"id": "inv-po", "agent": "inv-head", "dept": "inventory", "area": "Purchase order", "amount": 14_600,
     "title": "Tōtara sea-freight order: nitrile gloves and dressings for Q1",
     "text": "Over the Inventory head's $2k limit and Finance's $10k limit"},
]


def org() -> dict:
    """The organisation as plain data (no live numbers)."""
    return {"autonomy": AUTONOMY, "core": CORE, "businesses": BUSINESSES, "policy": POLICY,
            "departments": [asdict(d) for d in DEPARTMENTS], "teams": [asdict(t) for t in TEAMS],
            "agents": [asdict(a) for a in AGENTS], "opportunities": OPPORTUNITIES}
