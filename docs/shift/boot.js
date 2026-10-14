/* Shift Pilot boot: the sun comes up over the store, the day's checklist lights up, with the real numbers in the log.
   Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_SHIFT;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("shift.booted") === "1"; sessionStorage.setItem("shift.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  const n = D ? Math.min(12, D.tasks.length) : 8;
  let ticks = ""; for (let i = 0; i < n; i++) ticks += `<rect class="bs-t" x="${226 + (i % 4) * 46}" y="${28 + Math.floor(i / 4) * 30}" width="38" height="20" rx="4"/>`;
  svg.innerHTML = `<defs><clipPath id="bsHz"><rect x="0" y="0" width="420" height="132"/></clipPath></defs>
    <g clip-path="url(#bsHz)"><circle class="bs-sun" cx="100" cy="160" r="26"/></g>
    <line x1="10" y1="132" x2="410" y2="132" stroke="#2a3a50" stroke-width="2"/>
    <rect x="40" y="96" width="120" height="36" rx="3" fill="#141e2c" stroke="#3d5a7a"/><rect x="40" y="88" width="120" height="10" rx="2" fill="#63b6d8"/>
    <rect x="88" y="108" width="24" height="24" fill="#0b1119" stroke="#3d5a7a"/>${ticks}`;
  const B = D && D.brief, C = D && D.closing;
  const L = D ? [
    `› ${new Date(D.day + "T12:00:00").toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })} · ${B.weather.temp_c}°C · ${B.weather.rain_mm ? B.weather.rain_mm + " mm rain" : "dry"}`,
    `› forecast $${B.forecast.toLocaleString("en-NZ")} · ${B.why.join(", ")}`,
    `› ${B.team.length} people on · ${D.tasks.length} tasks · ${B.orders_waiting} orders waiting for sign-off`,
    `› forecast error over the last 14 days: ${D.model.exam14.wape[D.model.live]}%`,
  ] : ["› Shift data is missing: run python scripts/build_shift.py"];
  await sleep(quick ? 30 : 200); svg.classList.add("on");
  const ts = [...svg.querySelectorAll(".bs-t")];
  for (let i = 0; i < L.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", esc(L[i]) + "\n");
    ts.slice(Math.floor(i * ts.length / L.length), Math.floor((i + 1) * ts.length / L.length)).forEach(t => t.classList.add("on"));
    await sleep(quick ? 50 : 450);
  }
  ts.forEach(t => t.classList.add("on"));
  document.getElementById("bootH").innerHTML = "Shift <b>open.</b>";
  await sleep(skip || quick ? 120 : 1000);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
