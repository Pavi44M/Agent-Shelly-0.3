/* Commercial lab boot: promo bars rise one by one while the log states what was scored. Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_COMMERCIAL;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("commercial.booted") === "1"; sessionStorage.setItem("commercial.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  const H = [60, 95, 75, 120, 88, 140, 104, 70, 128, 90, 112, 82];
  svg.innerHTML = H.map((h, i) => `<rect class="bo-b" x="${18 + i * 33}" y="${160 - h}" width="22" height="${h}" rx="3"/>`).join("");
  const L = D ? [`› ${D.events.length} promotions over ${D.years} years, each against what it would have sold anyway`, `› margin gained, taken from other lines, and the dip after`,
    `› ${D.price_lab.length} lines in the discount depth lab`, `› ${D.basket.baskets.toLocaleString("en-NZ")} anonymous baskets: what sells together`] : ["› Commercial data is missing: run python scripts/build_commercial.py"];
  const bs = [...svg.querySelectorAll(".bo-b")];
  await sleep(quick ? 30 : 250);
  for (let i = 0; i < L.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", esc(L[i]) + "\n"); bs.slice(i * 3, i * 3 + 3).forEach(b => b.classList.add("on"));
    await sleep(quick ? 50 : 450);
  }
  bs.forEach(b => b.classList.add("on"));
  document.getElementById("bootH").innerHTML = "Every promo <b>scored.</b>";
  await sleep(skip || quick ? 120 : 1000);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
