/* Shelly report page (v1.1). Renders a report spec from data/shelly-reports.js.
   URL: report.html?type=budget&cat=Dairy&h=3&theme=light|dark|present   (or ?id=budget-3m-Dairy)
   The same page is printed to PDF (browser "Save as PDF", or headless Chromium from `python -m shelly report --pdf`). */
(function () {
"use strict";
const R = window.SHELLY_REPORTS;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const store = { get(k, d) { try { const v = localStorage.getItem("shelly.r." + k); return v == null ? d : v; } catch (e) { return d; } },
                set(k, v) { try { localStorage.setItem("shelly.r." + k, v); } catch (e) { /* ignore */ } } };

/* ---------- formatting ---------- */
const nf0 = new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-NZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function fmt(v, f) {
  if (v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v))) return "–";
  if (typeof v !== "number") return f === "text" || !f ? String(v) : String(v);
  const neg = v < 0 ? "−" : "";
  switch (f) {
    case "money": return neg + "$" + nf0.format(Math.abs(v));
    case "money2": return neg + "$" + Math.abs(v).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "pct": return (v > 0 ? "+" : neg) + nf1.format(Math.abs(v)) + "%";
    case "pctv": return nf1.format(v) + "%";
    case "int": return neg + nf0.format(Math.abs(v));
    case "num1": return neg + nf1.format(Math.abs(v));
    default: return String(v);
  }
}
const short = (v, f) => {           // axis labels
  if (f === "money" || f === "money2") { const a = Math.abs(v); return (v < 0 ? "−" : "") + "$" + (a >= 1e6 ? (a / 1e6).toFixed(1) + "m" : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k" : nf0.format(a)); }
  if (f === "pct" || f === "pctv") return nf1.format(v) + "%";
  return Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + "k" : nf1.format(v);
};

/* ---------- which report ---------- */
const P = new URLSearchParams(location.search);
const cat0 = R ? R.catalog : [];
function findSpec() {
  if (!R) return null;
  if (P.get("id") && R.specs[P.get("id")]) return R.specs[P.get("id")];
  const type = P.get("type") || "weekly", cat = P.get("cat") || "All";
  const t = cat0.find(x => x.type === type);
  if (!t) return null;
  if (t.pack) return R.specs["pack-" + t.pack];
  if (t.horizons) {
    const want = +P.get("h") || t.default;
    const h = t.horizons.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
    return R.specs[`${type}-${h}${t.unit === "months" ? "m" : "w"}-${cat}`] || R.specs[`${type}-${h}${t.unit === "months" ? "m" : "w"}-All`];
  }
  return R.specs[`${type}-${cat}`] || R.specs[`${type}-All`];
}

/* ---------- charts (inline SVG) ---------- */
const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function chart(b) {
  const W = 640, H = b.kind === "hbar" ? Math.max(140, b.x.length * 24 + 40) : (b.height || 220);
  const f = b.fmt || "money";
  const ser = b.series.filter(s => !s.role);
  const band = { low: b.series.find(s => s.role === "low"), high: b.series.find(s => s.role === "high") };
  let svg = "";
  const legend = ser.map((s, i) => `<span><i style="background:${COLORS[i % 6]}"></i>${esc(s.name)}</span>`).join("") +
    (band.low ? `<span><i style="background:var(--band);height:8px"></i>80% range</span>` : "");
  if (b.kind === "hbar") {
    const vals = ser[0].values.map(v => v ?? 0);
    const lab = 150, L = lab + 10, Rr = W - 70;
    const mx = Math.max(...vals.map(Math.abs), 1), hasNeg = vals.some(v => v < 0);
    const zero = hasNeg ? L + (Rr - L) / 2 : L, span = hasNeg ? (Rr - L) / 2 : Rr - L;
    b.x.forEach((x, i) => {
      const y = 14 + i * 24, v = vals[i], w = Math.abs(v) / mx * span;
      svg += `<text x="${lab}" y="${y + 12}" text-anchor="end">${esc(String(x).slice(0, 24))}</text>`;
      svg += `<rect x="${v < 0 ? zero - w : zero}" y="${y + 2}" width="${Math.max(1, w)}" height="14" rx="2" fill="${v < 0 ? "var(--bad)" : COLORS[0]}"/>`;
      svg += `<text x="${v < 0 ? zero + 4 : zero + w + 4}" y="${y + 13}" text-anchor="start">${esc(short(v, f))}</text>`;
    });
    if (hasNeg) svg += `<line class="axis" x1="${zero}" x2="${zero}" y1="8" y2="${H - 10}"/>`;
    return wrapChart(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title)}">${svg}</svg>`, ser.length > 1 ? legend : "");
  }
  const L = 56, Rr = W - 12, T = 12, B = H - 30;
  const all = b.series.flatMap(s => s.values).filter(v => v !== null && v !== undefined);
  let mn = Math.min(0, ...all), mx = Math.max(...all, 0);
  if (b.kind === "stacked") mx = Math.max(...b.x.map((_, i) => ser.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0)));
  if (b.kind === "line" || b.kind === "band") {
    const lo = Math.min(...all), hi = mx;
    const step = niceMax((hi - Math.max(0, lo - (hi - lo) * 0.3)) / 4 || 1);
    mn = lo > 0 ? Math.max(0, Math.floor((lo - (hi - lo) * 0.3) / step) * step) : Math.floor(lo / step) * step;
    mx = Math.ceil(hi / step) * step; if (mx === hi) mx += step;
  } else { mx = niceMax(mx); if (mn < 0) mn = -niceMax(-mn); }
  const y = v => B - (v - mn) / (mx - mn) * (B - T);
  const n = b.x.length, step = (Rr - L) / n, xc = i => L + step * (i + .5);
  for (let k = 0; k <= 4; k++) { const v = mn + (mx - mn) * k / 4; svg += `<line class="grid" x1="${L}" x2="${Rr}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${esc(short(v, f))}</text>`; }
  const every = Math.ceil(n / 13);
  b.x.forEach((x, i) => { if (i % every === 0) svg += `<text x="${xc(i)}" y="${H - 12}" text-anchor="middle">${esc(String(x).slice(0, 10))}</text>`; });
  if (band.low && band.high) {
    const idx = band.low.values.map((v, i) => v == null ? -1 : i).filter(i => i >= 0);
    if (idx.length) {
      const up = idx.map(i => `${xc(i)},${y(band.high.values[i])}`), dn = idx.slice().reverse().map(i => `${xc(i)},${y(band.low.values[i])}`);
      svg += `<polygon points="${up.concat(dn).join(" ")}" fill="var(--band)"/>`;
    }
  }
  const bars = ser.filter(s => b.kind === "bar" || b.kind === "stacked" || (b.kind === "combo" && s.kind !== "line"));
  const lines = ser.filter(s => !bars.includes(s));
  if (bars.length) {
    const gw = step * .72, bw = b.kind === "stacked" ? gw : gw / bars.length;
    const base = [];
    bars.forEach((s, j) => {
      const ci = ser.indexOf(s);
      s.values.forEach((v, i) => {
        if (v === null || v === undefined) return;
        let x0 = xc(i) - gw / 2 + (b.kind === "stacked" ? 0 : j * bw), y0, y1;
        if (b.kind === "stacked") { const b0 = base[i] || 0; y0 = y(b0 + v); y1 = y(b0); base[i] = b0 + v; }
        else { y0 = y(Math.max(0, v)); y1 = y(Math.min(0, v)); }
        svg += `<rect x="${x0}" y="${y0}" width="${Math.max(1, bw - 2)}" height="${Math.max(1, y1 - y0)}" rx="1.5" fill="${b.kind === "bar" && bars.length === 1 && v < 0 ? "var(--bad)" : COLORS[ci % 6]}"><title>${esc(s.name)} ${esc(b.x[i])}: ${esc(fmt(v, f))}</title></rect>`;
      });
    });
  }
  lines.forEach(s => {
    const ci = ser.indexOf(s);
    let d = "", pen = false;
    s.values.forEach((v, i) => { if (v === null || v === undefined) { pen = false; return; } d += (pen ? "L" : "M") + xc(i) + "," + y(v); pen = true; });
    svg += `<path d="${d}" fill="none" stroke="${COLORS[ci % 6]}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.values.forEach((v, i) => { if (v !== null && v !== undefined && n <= 16) svg += `<circle cx="${xc(i)}" cy="${y(v)}" r="2.6" fill="${COLORS[ci % 6]}"><title>${esc(s.name)} ${esc(b.x[i])}: ${esc(fmt(v, f))}</title></circle>`; });
  });
  if (mn < 0) svg += `<line class="axis" x1="${L}" x2="${Rr}" y1="${y(0)}" y2="${y(0)}"/>`;
  return wrapChart(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title)}">${svg}</svg>`, legend);
}
const wrapChart = (b, svg, legend) => `<div class="chart"><div class="ct">${esc(b.title)}</div>${svg}${legend ? `<div class="legend">${legend}</div>` : ""}${b.note ? `<div class="tnote">${esc(b.note)}</div>` : ""}</div>`;

/* ---------- blocks ---------- */
function table(b) {
  const cls = (c, v) => (c.align === "right" ? "r" : "") + ((c.fmt === "pct" || c.key === "gap" || c.key === "vs_budget") && typeof v === "number" ? (v < 0 ? " neg" : "") : "");
  const head = b.columns.map(c => `<th class="${c.align === "right" ? "r" : ""}">${esc(c.label)}</th>`).join("");
  const rows = b.rows.map(r => `<tr>${b.columns.map(c => `<td class="${cls(c, r[c.key])}">${c.fmt === "text" ? md(r[c.key] ?? "") : esc(fmt(r[c.key], c.fmt))}</td>`).join("")}</tr>`).join("");
  const tot = b.total ? `<tr class="total">${b.columns.map((c, i) => {
    const v = b.total[c.key] ?? (i === 0 ? (b.total.label || "Total") : "");
    return `<td class="${cls(c, v)}">${typeof v === "number" ? esc(fmt(v, c.fmt)) : esc(v)}</td>`; }).join("")}</tr>` : "";
  return `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}${tot}</tbody></table></div>${b.note ? `<p class="tnote">${esc(b.note)}</p>` : ""}`;
}
function block(b) {
  if (b.type === "text") return `<p>${md(b.text)}</p>`;
  if (b.type === "bullets") return `<ul>${b.items.map(i => `<li>${md(i)}</li>`).join("")}</ul>`;
  if (b.type === "callout") return `<div class="callout ${esc(b.tone)}"><div class="t">${esc(b.title)}</div><p>${md(b.text)}</p></div>`;
  if (b.type === "table") return table(b);
  if (b.type === "chart") return chart(b);
  return "";
}

/* ---------- page ---------- */
function render(sp) {
  const t = cat0.find(x => x.type === sp.type || (x.pack && sp.id === "pack-" + x.pack)) || {};
  document.title = `${sp.title} · Shelly`;
  const parts = sp.title.split(" · ");
  const words = parts[0].split(" ");
  const h1 = parts.length > 1 ? `${esc(parts[0])} <b>· ${esc(parts.slice(1).join(" · "))}</b>`
    : (words.length > 1 ? `${esc(words.slice(0, -1).join(" "))} <b>${esc(words.at(-1))}</b>` : `<b>${esc(parts[0])}</b>`);
  const kpis = sp.kpis.map(k => `<div class="kpi ${esc(k.tone)}"><div class="l">${esc(k.label)}</div><div class="v">${esc(fmt(k.value, k.fmt))}</div>${k.sub ? `<div class="s">${esc(k.sub)}</div>` : ""}</div>`).join("");
  const secs = sp.sections.map((s, i) => `<section class="sec" id="s${i}"><h2>${esc(s.title)}</h2>${s.lead ? `<p class="lead">${md(s.lead)}</p>` : ""}${s.blocks.map(block).join("")}</section>`).join("");
  const list = (h, arr) => arr && arr.length ? `<div class="card"><h3>${h}</h3><ul>${arr.map(a => `<li>${md(a)}</li>`).join("")}</ul></div>` : "";
  const notes = (sp.assumptions.length || sp.risks.length || sp.method.length) ?
    `<section class="sec" id="notes"><h2>Assumptions, risks and method</h2><div class="cols">${list("Assumptions", sp.assumptions)}${list("Risks to watch", sp.risks)}${list("Method & accuracy", sp.method)}</div></section>` : "";
  const sign = sp.approvals && sp.approvals.length ? `<section class="sec" id="signoff"><h2>For your approval</h2><p class="lead">Shelly prepares; people decide. Nothing here is final until approved.</p>
    <div class="sign"><div class="row hd"><div>Decision</div><div>Approved by</div><div>Date</div></div>${sp.approvals.map(a => `<div class="row"><div>☐ ${md(a)}</div><span></span><span></span></div>`).join("")}</div></section>` : "";
  $("#doc").innerHTML = `
    <header class="cover" id="cover"><div class="tag"><span class="dot"></span>Shelly · ${esc(t.title || "report")}</div>
      <h1>${h1}</h1>
      <p class="subt">${esc(sp.subtitle)}</p>
      <div class="meta"><span>${esc(sp.store)}</span><span>Data to ${esc(sp.asof_label || sp.asof)}</span><span>Generated ${esc(sp.generated)}</span>${sp.version ? `<span>Shelly v${esc(sp.version)}</span>` : ""}${sp.synthetic ? `<span class="syn">Synthetic demo data</span>` : ""}</div>
      ${sp.headline ? `<p class="headline">${md(sp.headline)}</p>` : ""}
      ${kpis ? `<div class="kpis">${kpis}</div>` : ""}
    </header>${secs}${notes}${sign}
    <div class="foot"><span>Shelly · analytics agent by Pavithra Bamunu</span><span>${esc(sp.id)}</span><span>Numbers are computed, not written by an AI.</span></div>`;
  const x = $("#xlsx");
  if (sp.excel) { x.href = "reports/" + sp.excel; x.hidden = false; x.setAttribute("download", sp.excel); } else x.hidden = true;
}

/* ---------- toolbar ---------- */
function toolbar(sp) {
  const ts = $("#rType"), cs = $("#rCat"), hs = $("#rH");
  ts.innerHTML = cat0.map(t => `<option value="${esc(t.type)}">${esc(t.title)}</option>`).join("");
  const cur = cat0.find(t => t.type === sp.type || (t.pack && sp.id === "pack-" + t.pack));
  ts.value = cur ? cur.type : "weekly";
  const cats = [...new Set(Object.values(R.specs).filter(s => s.type === sp.type).map(s => s.category))];
  cs.innerHTML = cats.map(c => `<option>${esc(c)}</option>`).join("");
  cs.value = sp.category; cs.hidden = cats.length < 2;
  if (cur && cur.horizons) { hs.innerHTML = cur.horizons.map(h => `<option value="${h}">${h} ${cur.unit}</option>`).join(""); hs.value = sp.horizon; hs.hidden = false; }
  else hs.hidden = true;
  const go = () => { const q = new URLSearchParams({ type: ts.value, cat: cs.hidden ? "All" : cs.value, theme: document.documentElement.dataset.theme });
    if (!hs.hidden) q.set("h", hs.value); location.search = q.toString(); };
  ts.onchange = () => { cs.value = "All"; hs.hidden = true; go(); }; cs.onchange = go; hs.onchange = go;
}
function setTheme(t) {
  document.documentElement.dataset.theme = t; store.set("theme", t);
  // page setup for printing / Save as PDF: white paper keeps margins; dark looks print edge to edge
  let ps = document.getElementById("pageSetup");
  if (!ps) { ps = document.createElement("style"); ps.id = "pageSetup"; document.head.appendChild(ps); }
  ps.textContent = t === "present" ? "@page{size:A4 landscape;margin:0}" : t === "dark" ? "@page{size:A4;margin:0}" : "@page{size:A4;margin:14mm 12mm 16mm}";
  document.querySelectorAll("[data-t]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
}

function init() {
  if (!R) { $("#doc").innerHTML = '<p class="empty">Report data not found (data/shelly-reports.js). Run <b>python scripts/build_site.py</b>.</p>'; return; }
  const sp = findSpec();
  setTheme(P.get("theme") || store.get("theme", "light"));
  document.querySelectorAll("[data-t]").forEach(b => b.onclick = () => setTheme(b.dataset.t));
  if (!sp) { $("#doc").innerHTML = '<p class="empty">That report isn\'t available. Pick one above.</p>'; toolbar({ type: "weekly", category: "All" }); return; }
  render(sp); toolbar(sp);
  $("#pdf").onclick = () => window.print();
  const secs = () => [...document.querySelectorAll(".cover,.sec")];
  const move = d => { const s = secs(), y = scrollY + 70; let i = s.findIndex(e => e.offsetTop + 10 > y); if (i < 0) i = s.length; const t = s[Math.min(s.length - 1, Math.max(0, i + (d > 0 ? 0 : -2)))]; t && t.scrollIntoView({ behavior: "smooth" }); };
  $("#prev").onclick = () => move(-1); $("#next").onclick = () => move(1);
  addEventListener("keydown", e => { if (document.documentElement.dataset.theme !== "present") return;
    if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); move(1); }
    if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); move(-1); } });
  if (P.get("print") === "1") setTimeout(() => window.print(), 400);
  window.__shellyReady = true;
}
init();
})();
