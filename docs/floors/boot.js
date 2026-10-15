/* Floor-by-floor boot: the tower's floors light up from the basement to the roof as the lift is called. Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_FLOORS;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("floors.booted") === "1"; sessionStorage.setItem("floors.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  svg.innerHTML = Array.from({ length: 14 }, (_, i) => `<rect class="bo-f" x="160" y="${160 - (i + 1) * 11}" width="100" height="9" rx="2"/>`).join("") + `<rect x="204" y="8" width="12" height="154" fill="none" stroke="#ffd27a" stroke-dasharray="3 3"/>`;
  const L = D ? [`› ${D.totals.floors} levels, from the loading dock to the vertiport`, `› a plan for every floor: lifts, fire stairs, washrooms, the fit-out`,
    `› ${D.totals.here_now} people at work now, counted by role, never by face`, `› ${D.totals.washrooms} washrooms, accessible and all-gender on every floor`] : ["› Floor data is missing: run python scripts/build_floors.py"];
  const fs = [...svg.querySelectorAll(".bo-f")];
  await sleep(quick ? 30 : 250);
  for (let i = 0; i < L.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", esc(L[i]) + "\n"); fs.slice(i * 4, i * 4 + 4).forEach(f => f.classList.add("on"));
    await sleep(quick ? 50 : 450);
  }
  fs.forEach(f => f.classList.add("on"));
  document.getElementById("bootH").innerHTML = "Doors <b>opening.</b>";
  await sleep(skip || quick ? 120 : 1000);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
