/* Shelly Tower boot: the tower builds floor by floor in each floor's colour, then the crown lights up.
   Quick on repeat visits in the same tab; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootTw"), T = window.SHELLY_TOWER;
  if (!box || !log) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("tw.booted") === "1"; sessionStorage.setItem("tw.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  const fl = T ? [...T.floors].filter(f => f.order >= 0).sort((a, b) => a.order - b.order) : [];
  const H = 200 / Math.max(1, fl.length);
  svg.innerHTML = `<line class="gr" x1="20" y1="232" x2="400" y2="232"/>` + fl.map((f, i) => { const pod = f.order <= 4, w = pod ? 200 : 120, x = 210 - w / 2;
    return `<rect class="fl0" x="${x}" y="${(230 - (i + 1) * H).toFixed(1)}" width="${w}" height="${(H - 1.2).toFixed(1)}" rx="1" fill="${f.colour}"/>`; }).join("") +
    `<circle class="crown" cx="210" cy="${(230 - fl.length * H - 10).toFixed(1)}" r="6"/>`;
  const k = T ? T.kpis : null;
  const lines = T ? [
    `› ${k.floors} floors, a podium, a sky garden and two basements · ${k.height_m} m`,
    `› ${k.shelly_floors} Shelly floors: business core, technology core, every business`,
    `› ${k.tenants} tenants · ${k.available} floors to let · ${k.occupancy_pct}% let`,
    `› ${k.people.toLocaleString("en-NZ")} people work here · ${k.agents} Shelly agents run it`,
    `› ${T.flags.length} things flagged · the 2050 plan is ready`,
  ] : ["› Tower data is missing: run python scripts/build_tower.py"];
  const rs = [...svg.querySelectorAll("rect.fl0")];
  for (let i = 0; i < lines.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", lines[i].replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])) + "\n");
    const a = Math.floor(i * rs.length / lines.length), b = Math.floor((i + 1) * rs.length / lines.length);
    for (let j = a; j < b; j++) { rs[j].classList.add("on"); if (!quick) await sleep(40); }
    await sleep(quick ? 40 : 200);
  }
  rs.forEach(r => r.classList.add("on")); const c = svg.querySelector(".crown"); if (c) c.classList.add("on");
  document.getElementById("bootH").innerHTML = "Tower <b>open.</b>";
  await sleep(skip || quick ? 120 : 1000);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
