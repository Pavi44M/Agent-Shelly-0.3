/* Gateway boot: the warehouse front draws in, each dock door turns green as a figure loads,
   then a truck reverses onto the last dock. Quick on repeat visits in the same tab; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootDc"), G = window.SHELLY_GATEWAY;
  if (!box || !log) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("gw.booted") === "1"; sessionStorage.setItem("gw.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  const N = 8;
  let doors = "";
  for (let i = 0; i < N; i++) doors += `<rect class="bd" x="${40 + i * 44}" y="78" width="30" height="40" rx="2"/>`;
  svg.innerHTML = `<path class="bw" d="M20 120 V40 H400 V120"/><rect class="bf" x="18" y="36" width="384" height="8"/>${doors}` +
    `<line class="br" x1="0" y1="150" x2="420" y2="150"/><g class="bt" id="bootTruck"><rect x="0" y="0" width="56" height="26" rx="2"/><rect class="bc" x="56" y="6" width="16" height="20" rx="2"/><circle cx="12" cy="29" r="4"/><circle cx="46" cy="29" r="4"/><circle cx="64" cy="29" r="4"/></g>`;
  const k = G ? G.kpis : null, s = G ? G.sites : [];
  const lines = G ? [
    `› ${s.length} sites · ${s.reduce((a, x) => a + x.docks, 0)} docks · ${k.capacity.toLocaleString("en-NZ")} pallet positions`,
    `› ${k.stock.toLocaleString("en-NZ")} pallets stored for ${G.clients.length} clients (${k.fill_pct}% full)`,
    `› ${k.trucks} trucks · ${k.forklifts} forklifts · ${k.headcount} people`,
    `› on-time-in-full ${k.otif}% over 4 weeks · ${k.deliveries} deliveries this week`,
    `› ${G.flags.length} things flagged · ${G.decisions.length} decisions waiting`,
  ] : ["› Gateway data is missing: run python scripts/build_gateway.py"];
  const ds = [...svg.querySelectorAll(".bd")];
  for (let i = 0; i < lines.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", lines[i].replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])) + "\n");
    ds.slice(Math.floor(i * N / lines.length), Math.floor((i + 1) * N / lines.length)).forEach(d => d.classList.add("on"));
    await sleep(quick ? 50 : 420);
  }
  ds.forEach(d => d.classList.add("on"));
  svg.querySelector("#bootTruck").classList.add("go");
  document.getElementById("bootH").innerHTML = "Docks <b>open.</b>";
  await sleep(skip || quick ? 120 : 1100);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
