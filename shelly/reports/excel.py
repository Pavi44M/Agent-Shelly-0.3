"""
Excel writer for Shelly reports.

Every workbook has the same shape, so anyone who opens one knows where to look:

  Dashboard    title, selectors (Category dropdown + report inputs), KPI tiles, charts
  Model        the numbers, all live formulas over Raw + Assumptions (SUMIFS / INDEX-MATCH)
  Pivot        real Excel PivotTables over Raw (drag fields to explore)
  Raw          the source rows as an Excel Table (filter / sort)
  Lookup       reference tables used by INDEX-MATCH (category targets, owners ...)
  Assumptions  every input in its own labelled cell (blue = change me)
  Notes        method, data dictionary, data check, sign-off

A workbook is described by a WorkbookPlan; builders in retail.py / packs.py only fill in the plan.

Formula template tokens (resolved per row in Model blocks):
  {key}          the row's key cell, e.g. $A7
  {R:col}        the Raw column range, e.g. Raw!$E$2:$E$9000
  {L:table.col}  a Lookup column range
  {IN:name}      an Assumptions input cell (defined name)
  {SEL}          category criteria: "*" when Category = All, else the chosen category
  {C:header}     the same-row cell of another column in this block
  {ROW}          this row number;  {IDX} 1-based position in the block
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

import pandas as pd
from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.chart.series import SeriesLabel
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule, DataBarRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.properties import PageSetupProperties
from openpyxl.worksheet.table import Table, TableStyleInfo

from .pivot import add_pivot, make_cache

FONT = "Arial"
NAVY, INK, ACCENT, MUTED, LINE, PAPER = "0B1220", "1B2433", "2A8FB8", "6B7686", "D9DEE5", "F4F7FA"
F_TITLE = Font(name=FONT, size=18, bold=True, color="FFFFFF")
F_SUB = Font(name=FONT, size=10, color="C9D4E0")
F_H = Font(name=FONT, size=11, bold=True, color=INK)
F_TH = Font(name=FONT, size=9, bold=True, color="FFFFFF")
F_TD = Font(name=FONT, size=10, color=INK)
F_IN = Font(name=FONT, size=10, color="0000FF", bold=True)
F_LINK = Font(name=FONT, size=10, color="008000")
F_NOTE = Font(name=FONT, size=9, italic=True, color=MUTED)
F_KPI = Font(name=FONT, size=18, bold=True, color=INK)
F_KPI_L = Font(name=FONT, size=8, bold=True, color=MUTED)
FILL_NAVY = PatternFill("solid", fgColor=NAVY)
FILL_TH = PatternFill("solid", fgColor="22324A")
FILL_PAPER = PatternFill("solid", fgColor=PAPER)
FILL_IN = PatternFill("solid", fgColor="FFF7CC")
FILL_TOTAL = PatternFill("solid", fgColor="E8EEF4")
THIN = Side(style="thin", color=LINE)
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
BOTTOM = Border(bottom=THIN)
FMT = {"money": '$#,##0;($#,##0);"-"', "money2": '$#,##0.00;($#,##0.00);"-"', "int": '#,##0;(#,##0);"-"',
       "num1": '#,##0.0;(#,##0.0);"-"', "pct": '0.0%;(0.0%);"-"', "date": "d mmm yyyy", "month": "mmm yyyy",
       "text": "@", "x": '0.00"x"'}


@dataclass
class Col:
    header: str
    formula: str | None = None       # template; None = value from Block.values
    fmt: str = "money"
    total: str | None = "sum"        # sum | avg | formula template for the total row | None
    note: str = ""
    width: int = 14


@dataclass
class Block:
    title: str
    key_header: str
    keys: list                       # row keys (month dates, categories, sku ...)
    cols: list                       # list[Col]
    key_fmt: str = "text"
    values: dict = field(default_factory=dict)   # header -> list of static values (for non-formula cols)
    total_label: str | None = "Total"
    note: str = ""
    conditional: list = field(default_factory=list)  # (header, "neg_red" | "bars")
    name: str = ""                   # id used by KPIs/charts
    autofilter: bool = False         # add filter buttons to this block (one per sheet)


@dataclass
class Kpi:
    label: str
    formula: str                     # template; may use {B:block.header.total} / {B:block.header.N}
    fmt: str = "money"
    note: str = ""


@dataclass
class ChartSpec:
    title: str
    block: str
    series: list                     # headers in the block
    kind: str = "bar"                # bar | line | stacked
    y_fmt: str = "money"


@dataclass
class PivotSpec:
    title: str
    rows: str
    value: str
    cols: str | None = None
    page: str | None = None
    caption: str | None = None


@dataclass
class WorkbookPlan:
    title: str
    subtitle: str
    raw: pd.DataFrame
    raw_formats: dict = field(default_factory=dict)          # column -> fmt key
    categories: list = field(default_factory=list)            # dropdown values (without "All")
    category_label: str = "Category"
    inputs: list = field(default_factory=list)                # (name, label, value, fmt, note)
    lookups: dict = field(default_factory=dict)               # name -> DataFrame
    blocks: list = field(default_factory=list)
    kpis: list = field(default_factory=list)
    charts: list = field(default_factory=list)
    pivots: list = field(default_factory=list)
    extra_sheets: dict = field(default_factory=dict)          # sheet name -> DataFrame (static lists, e.g. actions)
    notes: list = field(default_factory=list)                 # (heading, [lines])
    dictionary: dict = field(default_factory=dict)            # raw column -> meaning
    signoff: list = field(default_factory=list)               # approval lines


def _w(ws, r, c, v=None, font=F_TD, fill=None, fmt=None, align=None, border=None):
    cell = ws.cell(r, c)
    if v is not None:
        cell.value = v
    cell.font = font
    if fill: cell.fill = fill
    if fmt: cell.number_format = FMT.get(fmt, fmt)
    if align: cell.alignment = align
    if border: cell.border = border
    return cell


def _band(ws, title, subtitle, width=12):
    for r in (1, 2, 3):
        for c in range(1, width + 1):
            ws.cell(r, c).fill = FILL_NAVY
    _w(ws, 1, 2, "SHELLY", Font(name=FONT, size=8, bold=True, color="63B6D8"), FILL_NAVY)
    _w(ws, 2, 2, title, F_TITLE, FILL_NAVY)
    _w(ws, 3, 2, subtitle, F_SUB, FILL_NAVY)
    ws.row_dimensions[2].height = 26
    ws.column_dimensions["A"].width = 2


def _header_row(ws, r, c0, headers, widths=None):
    for j, h in enumerate(headers):
        _w(ws, r, c0 + j, h, F_TH, FILL_TH, align=Alignment(horizontal="center", vertical="center", wrap_text=True))
        if widths:
            ws.column_dimensions[get_column_letter(c0 + j)].width = max(ws.column_dimensions[get_column_letter(c0 + j)].width or 0, widths[j])
    ws.row_dimensions[r].height = 28


def build_workbook(plan: WorkbookPlan, path) -> str:
    wb = Workbook()
    dash = wb.active
    dash.title = "Dashboard"
    model = wb.create_sheet("Model")
    pivot = wb.create_sheet("Pivot") if plan.pivots else None
    raw = wb.create_sheet("Raw")
    look = wb.create_sheet("Lookup")
    ins = wb.create_sheet("Assumptions")
    extra = {n: wb.create_sheet(n[:31]) for n in plan.extra_sheets}
    notes = wb.create_sheet("Notes")

    # ---------------- Raw
    df = plan.raw.reset_index(drop=True)
    cols = list(df.columns)
    for j, c in enumerate(cols, 1):
        raw.cell(1, j, c)
    for i, row in enumerate(df.itertuples(index=False), 2):
        for j, v in enumerate(row, 1):
            if isinstance(v, pd.Timestamp):
                v = v.to_pydatetime()
            elif pd.isna(v) if not isinstance(v, (list, dict)) else False:
                v = None
            raw.cell(i, j, v)
    n = len(df) + 1
    last = get_column_letter(len(cols))
    t = Table(displayName="RawData", ref=f"A1:{last}{n}")
    t.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
    raw.add_table(t)
    for j, c in enumerate(cols, 1):
        L = get_column_letter(j)
        raw.column_dimensions[L].width = max(12, min(40, len(c) + 4))
        f = plan.raw_formats.get(c)
        if f:
            for r in range(2, n + 1):
                raw.cell(r, j).number_format = FMT[f]
        for r in range(1, n + 1):
            raw.cell(r, j).font = F_TD if r > 1 else Font(name=FONT, size=10, bold=True, color="FFFFFF")
    raw.freeze_panes = "A2"
    rng = {c: f"Raw!${get_column_letter(j)}$2:${get_column_letter(j)}${n}" for j, c in enumerate(cols, 1)}

    # ---------------- Assumptions (inputs as defined names)
    _band(ins, "Assumptions", "Blue cells are inputs: change them and every sheet recalculates.", 6)
    _header_row(ins, 5, 2, ["Input", "Value", "Why / source"], [34, 14, 70])
    in_ref = {}
    for i, (name, label, value, fmt, note) in enumerate(plan.inputs):
        r = 6 + i
        _w(ins, r, 2, label, border=BOTTOM)
        c = _w(ins, r, 3, value, F_IN, FILL_IN, fmt, border=BOX)
        _w(ins, r, 4, note, F_NOTE, border=BOTTOM)
        in_ref[name] = f"Assumptions!$C${r}"
        wb.defined_names[f"in_{name}"] = DefinedName(f"in_{name}", attr_text=f"Assumptions!$C${r}")

    # ---------------- Lookup tables
    _band(look, "Lookup tables", "Reference data used by INDEX-MATCH formulas in the Model sheet.", 10)
    lk_rng, r0 = {}, 5
    for tname, ldf in plan.lookups.items():
        _w(look, r0, 2, tname, F_H)
        _header_row(look, r0 + 1, 2, list(ldf.columns), [max(12, len(c) + 4) for c in ldf.columns])
        for i, row in enumerate(ldf.itertuples(index=False)):
            for j, v in enumerate(row):
                _w(look, r0 + 2 + i, 2 + j, None if pd.isna(v) else v, border=BOTTOM,
                   fmt="pct" if "pct" in ldf.columns[j] or "%" in ldf.columns[j] else None)
        end = r0 + 1 + len(ldf)
        for j, c in enumerate(ldf.columns):
            L = get_column_letter(2 + j)
            lk_rng[f"{tname}.{c}"] = f"Lookup!${L}${r0 + 2}:${L}${end}"
        r0 = end + 3

    # ---------------- Dashboard selectors (Category + inputs mirrored)
    width = 14
    _band(dash, plan.title, plan.subtitle, width)
    _w(dash, 5, 2, plan.category_label, F_KPI_L)
    sel = _w(dash, 6, 2, "All", Font(name=FONT, size=12, bold=True, color="0000FF"), FILL_IN, border=BOX)
    dash.column_dimensions["B"].width = 24
    if plan.categories:
        look_c = look.max_column + 3
        _w(look, 5, look_c, f"{plan.category_label} list", F_H)
        for i, cname in enumerate(["All"] + list(plan.categories)):
            _w(look, 6 + i, look_c, cname)
        L = get_column_letter(look_c)
        dv = DataValidation(type="list", formula1=f"=Lookup!${L}$6:${L}${6 + len(plan.categories)}", allow_blank=False)
        dv.prompt, dv.promptTitle = f"Pick a {plan.category_label.lower()} or All", plan.category_label
        dash.add_data_validation(dv)
        dv.add("B6")
    sel.comment = Comment("Choose a value from the list. Every KPI, table and chart follows this choice.", "Shelly")
    wb.defined_names["SelCat"] = DefinedName("SelCat", attr_text="Dashboard!$B$6")
    wb.defined_names["CatCrit"] = DefinedName("CatCrit", attr_text='IF(Dashboard!$B$6="All","*",Dashboard!$B$6)')
    _w(dash, 7, 2, "Change the blue cell to filter the whole workbook.", F_NOTE)

    # ---------------- Model blocks
    def resolve(tpl: str, row: int, idx: int, block_cols: dict) -> str:
        s = tpl
        s = re.sub(r"\{R:([^}]+)\}", lambda m: rng[m.group(1)], s)
        s = re.sub(r"\{L:([^}]+)\}", lambda m: lk_rng[m.group(1)], s)
        s = re.sub(r"\{IN:([^}]+)\}", lambda m: in_ref[m.group(1)], s)
        s = re.sub(r"\{C:([^}]+)\}", lambda m: f"{block_cols[m.group(1)]}{row}", s)
        s = re.sub(r"\{BR:([^|}]+)\|([^}]+)\}", lambda m: (lambda br: f"${br['cols'][m.group(2)]}${br['first']}:${br['cols'][m.group(2)]}${br['last']}")(block_ref[m.group(1)]), s)
        s = re.sub(r"\{BK:([^}]+)\}", lambda m: (lambda br: f"$B${br['first']}:$B${br['last']}")(block_ref[m.group(1)]), s)
        s = s.replace("{SEL}", "CatCrit").replace("{key}", f"$B{row}").replace("{ROW}", str(row)).replace("{IDX}", str(idx))
        return s

    _band(model, "Model", "Live formulas over Raw, Lookup and Assumptions. Nothing on this sheet is typed in.", 16)
    model.column_dimensions["B"].width = 18
    block_ref: dict[str, dict] = {}
    r = 5
    for b in plan.blocks:
        _w(model, r, 2, b.title, F_H)
        if b.note:
            _w(model, r + 1, 2, b.note, F_NOTE)
        hr = r + 2
        headers = [b.key_header] + [c.header for c in b.cols]
        _header_row(model, hr, 2, headers, [18] + [c.width for c in b.cols])
        letters = {c.header: get_column_letter(3 + j) for j, c in enumerate(b.cols)}
        first = hr + 1
        for i, k in enumerate(b.keys):
            rr = first + i
            kv = k.to_pydatetime() if isinstance(k, pd.Timestamp) else k
            _w(model, rr, 2, kv, fmt=b.key_fmt, border=BOTTOM)
            for j, c in enumerate(b.cols):
                if c.formula:
                    v = "=" + resolve(c.formula, rr, i + 1, letters)
                else:
                    v = b.values[c.header][i]
                    v = None if (isinstance(v, float) and v != v) else v
                _w(model, rr, 3 + j, v, fmt=c.fmt, border=BOTTOM)
        lastr = first + len(b.keys) - 1
        ref = {"first": first, "last": lastr, "key": ("B", first, lastr), "cols": {}}
        if b.total_label and len(b.keys):
            tr = lastr + 1
            _w(model, tr, 2, b.total_label, Font(name=FONT, size=10, bold=True, color=INK), FILL_TOTAL)
            for j, c in enumerate(b.cols):
                L = letters[c.header]
                if c.total == "sum":
                    v = f"=SUM({L}{first}:{L}{lastr})"
                elif c.total == "avg":
                    v = f"=IFERROR(AVERAGE({L}{first}:{L}{lastr}),0)"
                elif c.total:
                    v = "=" + resolve(c.total, tr, 0, letters).replace("{FIRST}", str(first)).replace("{LAST}", str(lastr))
                else:
                    v = None
                _w(model, tr, 3 + j, v, Font(name=FONT, size=10, bold=True, color=INK), FILL_TOTAL, c.fmt)
            ref["total"] = tr
        for j, c in enumerate(b.cols):
            ref["cols"][c.header] = letters[c.header]
            if c.note:
                model.cell(hr, 3 + j).comment = Comment(c.note, "Shelly")
        for hdr, how in b.conditional:
            L = letters[hdr]
            area = f"{L}{first}:{L}{lastr}"
            if how == "neg_red":
                model.conditional_formatting.add(area, CellIsRule(operator="lessThan", formula=["0"], font=Font(color="C0392B", bold=True)))
            elif how == "bars":
                model.conditional_formatting.add(area, DataBarRule(start_type="min", end_type="max", color="63B6D8"))
        if b.autofilter and len(b.keys):
            model.auto_filter.ref = f"B{hr}:{get_column_letter(2 + len(b.cols))}{lastr}"
        block_ref[b.name or b.title] = ref
        r = (ref.get("total") or lastr) + 3
    model.freeze_panes = "C5"

    # ---------------- KPI tiles
    def kpi_formula(tpl: str) -> str:
        def rep(m):
            bname, hdr, which = m.group(1).split("|")
            br = block_ref[bname]
            L = br["cols"][hdr]
            if which == "total":
                return f"Model!${L}${br['total']}"
            if which == "range":
                return f"Model!${L}${br['first']}:${L}${br['last']}"
            if which == "keys":
                return f"Model!$B${br['first']}:$B${br['last']}"
            return f"Model!${L}${br['first'] + int(which) - 1}"
        s = re.sub(r"\{B:([^}]+)\}", rep, tpl)
        s = re.sub(r"\{IN:([^}]+)\}", lambda m: in_ref[m.group(1)], s)
        s = re.sub(r"\{R:([^}]+)\}", lambda m: rng[m.group(1)], s)
        return s.replace("{SEL}", "CatCrit")

    kr = 9
    for i, k in enumerate(plan.kpis):
        c = 2 + (i % 4) * 3
        rr = kr + (i // 4) * 4
        for dc in range(3):
            for dr in range(3):
                dash.cell(rr + dr, c + dc).fill = FILL_PAPER
        _w(dash, rr, c, k.label.upper(), F_KPI_L, FILL_PAPER)
        _w(dash, rr + 1, c, "=" + kpi_formula(k.formula), F_KPI, FILL_PAPER, k.fmt, align=Alignment(horizontal="left"))
        if k.note:
            _w(dash, rr + 2, c, k.note, F_NOTE, FILL_PAPER)
        for dr in range(3):
            dash.merge_cells(start_row=rr + dr, start_column=c, end_row=rr + dr, end_column=c + 1)
    for c in range(3, 3 + 12):
        dash.column_dimensions[get_column_letter(c)].width = 12
    dash.column_dimensions["B"].width = 24

    # ---------------- Charts (from Model blocks)
    cr = kr + ((len(plan.kpis) + 3) // 4) * 4 + 1
    for i, ch in enumerate(plan.charts):
        br = block_ref[ch.block]
        if ch.kind == "line":
            chart = LineChart()
        else:
            chart = BarChart(); chart.type = "col"
            if ch.kind == "stacked":
                chart.grouping = "stacked"; chart.overlap = 100
        chart.title = ch.title
        chart.height, chart.width = 7.5, 16
        chart.y_axis.numFmt = FMT[ch.y_fmt].split(";")[0]
        chart.y_axis.majorGridlines = None if ch.kind != "line" else chart.y_axis.majorGridlines
        chart.legend.position = "b"
        palette = ["2A8FB8", "0B1220", "E0A43A", "7FB77E", "C0392B", "8E7CC3"]
        for j, hdr in enumerate(ch.series):
            L = br["cols"][hdr]
            col_idx = model[f"{L}1"].column
            ref = Reference(model, min_col=col_idx, min_row=br["first"], max_row=br["last"])
            chart.add_data(ref, titles_from_data=False)
            s = chart.series[-1]
            s.tx = SeriesLabel(v=hdr)
            color = palette[j % len(palette)]
            if ch.kind == "line":
                s.graphicalProperties.line.solidFill = color
                s.graphicalProperties.line.width = 22000
                s.smooth = False
            else:
                s.graphicalProperties.solidFill = color
                s.graphicalProperties.line.solidFill = color
        chart.x_axis.tickLblPos = "low"
        chart.x_axis.delete = False
        chart.y_axis.delete = False
        cats = Reference(model, min_col=2, min_row=br["first"], max_row=br["last"])
        chart.set_categories(cats)
        anchor = f"{get_column_letter(2 + (i % 2) * 7)}{cr + (i // 2) * 16}"
        dash.add_chart(chart, anchor)
    dash.sheet_view.showGridLines = False
    for ws_ in (dash, model):
        ws_.page_setup.orientation = "landscape"
        ws_.page_setup.fitToWidth, ws_.page_setup.fitToHeight = 1, 0
        ws_.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)

    # ---------------- Pivots
    if pivot is not None:
        _band(pivot, "Pivot tables", "Real Excel PivotTables over the Raw sheet: drag fields in the PivotTable pane to explore. "
                                    "They refresh when the file opens.", 12)
        pr = 6
        bundle = make_cache(df, "Raw", _src_ref(df, [], n))
        for i, p in enumerate(plan.pivots):
            _w(pivot, pr - 1, 1, p.title, F_H)
            last_r, last_c = add_pivot(pivot, bundle, pr, p.rows, p.cols, p.value, p.page, name=f"Pivot{i + 1}",
                                       value_caption=p.caption)
            pr = last_r + 5
        pivot.column_dimensions["A"].width = 26
        for c in range(2, 20):
            pivot.column_dimensions[get_column_letter(c)].width = 13

    # ---------------- Extra static sheets (actions, exceptions ...)
    for name, edf in plan.extra_sheets.items():
        ws = extra[name]
        _band(ws, name, "", max(6, len(edf.columns) + 1))
        _header_row(ws, 5, 2, list(edf.columns), [min(60, max(12, len(c) + 4)) for c in edf.columns])
        for i, row in enumerate(edf.itertuples(index=False)):
            for j, v in enumerate(row):
                v = v.to_pydatetime() if isinstance(v, pd.Timestamp) else v
                col = edf.columns[j]
                f = "money" if any(k in col.lower() for k in ("$", "value", "impact", "sales", "cost")) and isinstance(v, (int, float)) else None
                _w(ws, 6 + i, 2 + j, None if (isinstance(v, float) and v != v) else v, fmt=f, border=BOTTOM,
                   align=Alignment(wrap_text=True, vertical="top"))
        if len(edf):
            ws.auto_filter.ref = f"B5:{get_column_letter(1 + len(edf.columns))}{5 + len(edf)}"
        ws.freeze_panes = "B6"

    # ---------------- Notes
    _band(notes, "Notes, method and sign-off", "How the numbers were made, what each column means, and who approved it.", 6)
    notes.column_dimensions["B"].width = 30
    notes.column_dimensions["C"].width = 100
    nr = 5
    for head, lines in plan.notes:
        _w(notes, nr, 2, head, F_H); nr += 1
        for ln in lines:
            _w(notes, nr, 3, ln, align=Alignment(wrap_text=True, vertical="top")); nr += 1
        nr += 1
    if plan.dictionary:
        _w(notes, nr, 2, "Data dictionary (Raw sheet)", F_H); nr += 1
        for k, v in plan.dictionary.items():
            _w(notes, nr, 2, k, F_TD, border=BOTTOM); _w(notes, nr, 3, v, F_TD, border=BOTTOM); nr += 1
        nr += 1
    if plan.signoff:
        _w(notes, nr, 2, "Sign-off", F_H); nr += 1
        for s in plan.signoff:
            _w(notes, nr, 2, s, F_TD); _w(notes, nr, 3, "Name: ____________   Date: ________   ☐ Approved  ☐ Changes needed", F_NOTE); nr += 1
    _w(notes, nr + 1, 2, f"Generated by Shelly on {datetime.now():%d %b %Y %H:%M}", F_NOTE)

    for ws in wb.worksheets:
        ws.sheet_properties.tabColor = {"Dashboard": "2A8FB8", "Model": "0B1220", "Pivot": "E0A43A"}.get(ws.title, "9AA5B1")
    wb.calculation.fullCalcOnLoad = True
    wb.save(path)
    return str(path)


def _src_ref(df: pd.DataFrame, used: list, n: int) -> str:
    """Pivot source = the whole Raw table (all columns), so users can add any field later."""
    return f"A1:{get_column_letter(len(df.columns))}{n}"


# ------------------------------------------------------------------ cached values
def cache_values(path, timeout: int = 120) -> bool:
    """Give every formula a cached result so phone / web previewers that don't calculate still show numbers.

    LibreOffice (if installed) recalculates a throw-away copy; the results are written back into the
    original file next to each formula. The original keeps its formatting, charts and PivotTables.
    Returns False (and leaves the file as-is, Excel recalculates on open) when LibreOffice isn't available.
    """
    import html
    import os
    import re
    import shutil
    import subprocess
    import tempfile
    import zipfile

    from openpyxl import load_workbook

    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return False
    tmp = tempfile.mkdtemp()
    try:
        src = os.path.join(tmp, "in.xlsx")
        shutil.copy(path, src)
        env = dict(os.environ, HOME=tmp, SAL_USE_VCLPLUGIN="svp")
        if os.environ.get("SHELLY_SOFFICE_PRELOAD"):
            env["LD_PRELOAD"] = os.environ["SHELLY_SOFFICE_PRELOAD"]
        prof = "file://" + os.path.join(tmp, "profile")
        subprocess.run([soffice, f"-env:UserInstallation={prof}", "--headless", "--calc", "--convert-to",
                        "xlsx:Calc MS Excel 2007 XML", "--outdir", os.path.join(tmp, "out"), src],
                       capture_output=True, timeout=timeout, env=env)
        calc = os.path.join(tmp, "out", "in.xlsx")
        if not os.path.exists(calc):
            return False
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            vals = load_workbook(calc, data_only=True)
            forms = load_workbook(path)
        sheet_files = {}
        with zipfile.ZipFile(path) as z:
            wbx = z.read("xl/workbook.xml").decode()
            rels = z.read("xl/_rels/workbook.xml.rels").decode()
            for name, rid in re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wbx):
                tgt = re.search(rf'Id="{rid}"[^>]*Target="([^"]+)"', rels) or re.search(rf'Target="([^"]+)"[^>]*Id="{rid}"', rels)
                sheet_files[html.unescape(name)] = "xl/" + tgt.group(1).lstrip("/").replace("xl/", "")
            contents = {n: z.read(n) for n in z.namelist()}
        for ws in forms.worksheets:
            f = sheet_files.get(ws.title)
            if not f or ws.title not in vals.sheetnames:
                continue
            vws = vals[ws.title]
            xml = contents[f].decode()

            def fill(m):
                ref, attrs, body = m.group(1), m.group(2), m.group(3)
                v = vws[ref].value
                if v is None:
                    return m.group(0)
                if isinstance(v, bool):
                    return f'<c r="{ref}"{attrs} t="b">{body}<v>{int(v)}</v></c>'
                if isinstance(v, (int, float)):
                    return f'<c r="{ref}"{attrs}>{body}<v>{v!r}</v></c>'
                if hasattr(v, "toordinal"):     # dates -> Excel serial
                    from openpyxl.utils.datetime import to_excel
                    return f'<c r="{ref}"{attrs}>{body}<v>{to_excel(v)}</v></c>'
                return f'<c r="{ref}"{attrs} t="str">{body}<v>{html.escape(str(v))}</v></c>'

            xml = re.sub(r'<c r="([A-Z]+\d+)"((?:\s(?!t=)[a-z]+="[^"]*")*)>(<f>.*?</f>)<v\s*/?>(?:</v>)?</c>', fill, xml)
            xml = re.sub(r'<c r="([A-Z]+\d+)"((?:\s(?!t=)[a-z]+="[^"]*")*)>(<f>.*?</f>)</c>', fill, xml)
            contents[f] = xml.encode()
        out = path + ".tmp"
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            for n, b in contents.items():
                z.writestr(n, b)
        os.replace(out, path)
        return True
    except Exception:
        return False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
