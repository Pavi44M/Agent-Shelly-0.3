/* Operations boot: dock doors light up one by one as trucks reverse in, with the real numbers in the log.
   Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_OPS;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("ops.booted") === "1"; sessionStorage.setItem("ops.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  let docks = ""; for (let i = 0; i < 8; i++) docks += `<rect class="bo-dock" x="${30 + i * 46}" y="40" width="34" height="44" rx="3"/>`;
  let trucks = ""; for (let i = 0; i < 4; i++) trucks += `<g class="bo-truck" style="transform:translate(${40 + i * 92}px,190px)"><rect width="34" height="26" rx="3" fill="#e9eef3"/><rect y="26" width="34" height="10" rx="2" fill="${["#63b6d8", "#b69cf2", "#8fb8ff", "#8fe3c8"][i]}"/></g>`;
  svg.innerHTML = `<rect x="18" y="26" width="384" height="66" rx="4" fill="#0b1119" stroke="#2a3a50"/><rect x="18" y="20" width="384" height="8" fill="#8fb8ff"/>${docks}<line x1="0" y1="160" x2="420" y2="160" stroke="#2a3a50" stroke-dasharray="6 6"/>${trucks}`;
  const G = D && D.gateway, T = D && D.totara;
  const L = D ? [
    `› ${G.docks.length} Gateway sites · ${G.docks.reduce((a, d) => a + d.jobs.length, 0)} trucks booked into docks`,
    `› ${G.billing.length} client invoices built from what was really used`,
    `› Tōtara: ${T.scorecards.length} suppliers scored · $${T.expiry_saved.toLocaleString("en-NZ")} of short-dated stock rescued`,
    `› ${D.flows.length} flows followed from the store and Tōtara through Gateway`,
  ] : ["› Operations data is missing: run python scripts/build_ops.py"];
  const ds = [...svg.querySelectorAll(".bo-dock")], ts = [...svg.querySelectorAll(".bo-truck")];
  await sleep(quick ? 30 : 250);
  for (let i = 0; i < L.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", esc(L[i]) + "\n");
    ds.slice(i * 2, i * 2 + 2).forEach(d => d.classList.add("on"));
    if (ts[i]) ts[i].style.transform = `translate(${36 + i * 92}px,94px)`;
    await sleep(quick ? 50 : 450);
  }
  ds.forEach(d => d.classList.add("on")); ts.forEach((t, i) => { t.style.transform = `translate(${36 + i * 92}px,94px)`; });
  document.getElementById("bootH").innerHTML = "Docks <b>booked.</b>";
  await sleep(skip || quick ? 120 : 1000);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
