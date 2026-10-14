/* Group HQ boot: four business columns rise into the group total, ticks fill the close checklist, with the real numbers in the log.
   Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_GROUP;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("group.booted") === "1"; sessionStorage.setItem("group.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  const P = D && D.pnl, bs = P ? Object.entries(P.by_business) : [], mx = P ? Math.max(...bs.map(([, v]) => v.revenue)) : 1;
  const C = ["#63b6d8", "#b69cf2", "#8fb8ff", "#f2c14e"];
  svg.innerHTML = bs.map(([b, v], i) => `<rect class="bo-col" data-h="${Math.max(8, v.revenue / mx * 120)}" x="${40 + i * 70}" y="150" width="46" height="0" rx="4" style="stroke:${C[i]}"/>`).join("") +
    `<line x1="20" y1="150" x2="330" y2="150" stroke="#2a3a50" stroke-width="2"/><rect id="boTot" x="340" y="150" width="56" height="0" rx="4" fill="rgba(242,193,78,.25)" stroke="#f2c14e"/>`;
  const L = D ? [
    `› ${P.month}: four businesses, ${Object.keys(P.by_business).length} P&Ls, eliminations ${P.eliminations.toLocaleString("en-NZ")}`,
    `› group revenue $${P.group_revenue.toLocaleString("en-NZ")} · EBITDA $${P.group_ebitda.toLocaleString("en-NZ")} (${P.group_margin_pct}%)`,
    `› 13-week cash low $${D.cash.low.close.toLocaleString("en-NZ")} · ${D.people.headcount} people (roles only)`,
    `› ${D.limits.length} agent limits wait for your approval · ${D.audit.length} entries in the audit log`,
  ] : ["› Group data is missing: run python scripts/build_group.py"];
  const cols = [...svg.querySelectorAll(".bo-col")];
  await sleep(quick ? 30 : 250);
  for (let i = 0; i < L.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", esc(L[i]) + "\n");
    const c = cols[i]; if (c) { const h = +c.dataset.h; c.setAttribute("height", h); c.setAttribute("y", 150 - h); c.classList.add("on"); }
    await sleep(quick ? 50 : 450);
  }
  cols.forEach(c => { const h = +c.dataset.h; c.setAttribute("height", h); c.setAttribute("y", 150 - h); c.classList.add("on"); });
  const t = svg.querySelector("#boTot"); if (t) { t.setAttribute("height", 128); t.setAttribute("y", 22); }
  document.getElementById("bootH").innerHTML = "Month <b>closed.</b>";
  await sleep(skip || quick ? 120 : 1000);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
