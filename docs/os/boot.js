/* Shelly OS boot: the tables of the data model light up, an event pulse runs along the bus to the
   departments, with the real counts in the log. Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_OS;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("os.booted") === "1"; sessionStorage.setItem("os.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  const names = D ? D.tables.map(t => t.name) : [];
  let cells = ""; names.forEach((n, i) => { const x = 20 + (i % 5) * 78, y = 14 + Math.floor(i / 5) * 34;
    cells += `<g class="bo-t" data-i="${i}"><rect x="${x}" y="${y}" width="70" height="26" rx="5"/><text x="${x + 35}" y="${y + 17}" text-anchor="middle" fill="#b0bac8">${esc(n.slice(0, 11))}</text></g>`; });
  const deps = ["Store", "Tōtara", "Gateway", "Group"];
  svg.innerHTML = `${cells}<line x1="30" y1="138" x2="390" y2="138" stroke="#2a3a50" stroke-width="2"/><circle class="bo-pulse" cx="40" cy="138" r="5"/>` +
    deps.map((d, i) => `<g><line x1="${70 + i * 95}" y1="138" x2="${70 + i * 95}" y2="150" stroke="#2a3a50"/><text x="${70 + i * 95}" y="166" text-anchor="middle" font-size="11" fill="#7d8a9c" font-family="JetBrains Mono,monospace">${d}</text></g>`).join("");
  const S = D ? D.summary : null;
  const L = D ? [
    `› ${D.tables.length} tables · ${D.tables.reduce((a, t) => a + t.rows, 0).toLocaleString("en-NZ")} rows · one model for 4 businesses`,
    `› event bus: ${S.events} events detected today`,
    `› agents: ${S.actions} actions · ${S.on_their_own} ran on their own · ${S.waiting} wait for a person`,
    `› ${S.cross_business} actions where one business helps another`,
  ] : ["› Shelly OS data is missing: run python scripts/build_os.py"];
  const ts = [...svg.querySelectorAll(".bo-t")];
  await sleep(quick ? 30 : 250);
  for (let i = 0; i < L.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", esc(L[i]) + "\n");
    ts.slice(Math.floor(i * ts.length / L.length), Math.floor((i + 1) * ts.length / L.length)).forEach(t => t.classList.add("on"));
    if (i === 1) svg.classList.add("on");
    await sleep(quick ? 50 : 450);
  }
  ts.forEach(t => t.classList.add("on")); svg.classList.add("on");
  document.getElementById("bootH").innerHTML = "Shelly OS <b>running.</b>";
  await sleep(skip || quick ? 120 : 1000);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
