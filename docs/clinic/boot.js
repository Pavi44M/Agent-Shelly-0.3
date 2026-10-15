/* Tōtara Clinic boot: a heartbeat line draws while the log states the day. Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_CLINIC;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("clinic.booted") === "1"; sessionStorage.setItem("clinic.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  svg.innerHTML = `<polyline points="10,100 120,100 140,100 152,60 166,140 180,40 194,120 206,100 300,100 312,80 324,100 410,100" fill="none" stroke="#8fe3c8" stroke-width="3" stroke-dasharray="700" stroke-dashoffset="700" style="transition:stroke-dashoffset 1.6s ease" id="beat"/>`;
  requestAnimationFrame(() => { const b = document.getElementById("beat"); if (b) b.style.strokeDashoffset = "0"; });
  const L = D ? [`› ${D.kpis.patients} patients across GP, nurse, urgent care and physio`, `› ${D.rooms.reduce((a, r) => a + r.count, 0)} rooms and beds on levels 5 to 7`, `› staffing checked hour by hour, roles only`, `› counts only: no patient records`] : ["› Clinic data is missing: run python scripts/build_tower_biz.py"];
  await sleep(quick ? 30 : 250);
  for (const l of L) { if (skip) break; log.insertAdjacentHTML("beforeend", esc(l) + "\n"); await sleep(quick ? 50 : 420); }
  document.getElementById("bootH").innerHTML = "Clinic <b>open.</b>";
  await sleep(skip || quick ? 120 : 900);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
