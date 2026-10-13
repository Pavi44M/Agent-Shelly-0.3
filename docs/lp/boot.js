/* Loss Prevention boot: a shield draws in, each Shelly site joins it and lights up, the privacy checks
   pass in the log, and the padlock closes: the scope is locked. Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_LP;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("lp.booted") === "1"; sessionStorage.setItem("lp.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  const LAB = { store: "Store", gateway: "Gateway", totara: "Tōtara", group: "Tower" }, keys = D ? Object.keys(D.sites) : Object.keys(LAB);
  const pos = [[60, 40], [360, 40], [60, 132], [360, 132]];
  const sites = keys.map((k, i) => { const [x, y] = pos[i % 4];
    return `<line class="bl-link" x1="${x < 210 ? x + 22 : x - 22}" y1="${y}" x2="${x < 210 ? 170 : 250}" y2="${y < 90 ? 70 : 105}"/><g class="bl-site"><circle cx="${x}" cy="${y}" r="20"/><text x="${x}" y="${y + 36}">${esc(LAB[k] || k)}</text></g>`; }).join("");
  svg.innerHTML = `${sites}<path class="bl-shield" d="M210 14 L262 32 V86 C262 122 238 146 210 158 C182 146 158 122 158 86 V32 Z"/>
    <path class="bl-shackle" d="M198 82 V72 a12 12 0 0 1 24 0 V82"/><rect class="bl-body" x="192" y="80" width="36" height="28" rx="5"/><circle cx="210" cy="92" r="3.5" fill="#0b1119"/><rect x="208.5" y="93" width="3" height="8" fill="#0b1119"/>`;
  const W = D ? Object.values(D.sites).map(s => s.week) : [], T = a => a.reduce((x, y) => x + y, 0);
  const L = D ? [
    `› scope: locked to ${keys.length} Shelly businesses · expansion needs Pavi + a privacy check + a legal check`,
    `› privacy checks: ${D.checks.length}/${D.checks.length} pass · no identity, faces, biometrics or scores`,
    `› pose: skeleton only, face points dropped · live video never kept`,
    `› 7 days: ${T(W.map(w => w.cases))} cases for a person to check · ${T(W.map(w => w.true))}/${T(W.map(w => w.losses))} real losses flagged`,
    `› staff: safety first · never detain, chase, touch, search or accuse`,
  ] : ["› Loss Prevention data is missing: run python scripts/build_lp.py"];
  const ss = [...svg.querySelectorAll(".bl-site")], ls = [...svg.querySelectorAll(".bl-link")];
  await sleep(quick ? 30 : 500);
  for (let i = 0; i < L.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", esc(L[i]) + "\n");
    const a = Math.floor(i * ss.length / (L.length - 1)), b = Math.floor((i + 1) * ss.length / (L.length - 1));
    ss.slice(a, b).forEach(s => s.classList.add("on")); ls.slice(a, b).forEach(s => s.classList.add("on"));
    await sleep(quick ? 50 : 430);
  }
  ss.forEach(s => s.classList.add("on")); ls.forEach(s => s.classList.add("on"));
  svg.classList.add("locked");
  document.getElementById("bootH").innerHTML = "Protection <b>on.</b>";
  await sleep(skip || quick ? 150 : 1100);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
