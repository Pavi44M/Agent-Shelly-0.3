/* Hotel boot: room windows light up floor by floor while the log states the night. Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_HOTEL;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("hotel.booted") === "1"; sessionStorage.setItem("hotel.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  let s = ""; for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) s += `<rect class="bo-w" x="${70 + c * 28}" y="${30 + r * 30}" width="18" height="20" rx="2" fill="#141e2c" stroke="#2a3a50" style="transition:fill .3s"/>`;
  svg.innerHTML = s;
  const L = D ? [`› ${D.kpis.rooms} rooms and apartments on levels 16 and 17`, `› ${D.kpis.occ_pct}% occupied at ${"$" + D.kpis.adr} a night`, `› ${D.events.length} events in the next 30 days`, `› bookings are counts and room numbers, never names`] : ["› Hotel data is missing: run python scripts/build_tower_biz.py"];
  const ws = [...svg.querySelectorAll(".bo-w")];
  await sleep(quick ? 30 : 250);
  for (let i = 0; i < L.length; i++) { if (skip) break; log.insertAdjacentHTML("beforeend", esc(L[i]) + "\n"); ws.slice(i * 10, i * 10 + 10).forEach((w, j) => { if ((i + j) % 3) w.setAttribute("fill", "#ffd27a"); }); await sleep(quick ? 50 : 420); }
  document.getElementById("bootH").innerHTML = "Doors <b>open.</b>";
  await sleep(skip || quick ? 120 : 900);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
