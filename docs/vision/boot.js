/* Store Vision boot: the camera's iris opens, the floor plan's zones light up one by one, a scan
   sweeps the floor, with the day's real numbers in the log. Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_VISION;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("vision.booted") === "1"; sessionStorage.setItem("vision.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  // the eye (left) and the floor plan (right): zones scaled from the 1280 x 720 camera into a 230 x 130 box
  let blades = ""; for (let i = 0; i < 6; i++) blades += `<path class="bv-blade" d="M85 85 L85 25 A60 60 0 0 1 137 55 Z" transform="rotate(${i * 60} 85 85)"/>`;
  const zs = D ? D.zones : [], sx = 230 / 1280, sy = 130 / 720;
  const zones = zs.map(z => { const xs = z.poly.map(p => p[0]), ys = z.poly.map(p => p[1]);
    return `<rect class="bv-zone ${z.kind === "queue" ? "q" : z.kind === "restricted" ? "r" : ""}" x="${180 + Math.min(...xs) * sx}" y="${20 + Math.min(...ys) * sy}" width="${(Math.max(...xs) - Math.min(...xs)) * sx}" height="${(Math.max(...ys) - Math.min(...ys)) * sy}" rx="3"/>`; }).join("");
  let dots = ""; for (let i = 0; i < 14; i++) dots += `<rect class="bv-dot" x="${190 + (i * 53) % 210}" y="${30 + (i * 37) % 110}" width="5" height="9" rx="1"/>`;
  svg.innerHTML = `<defs><linearGradient id="bvBeam" x1="0" x2="1"><stop offset="0" stop-color="#63e0ff" stop-opacity="0"/><stop offset=".5" stop-color="#63e0ff" stop-opacity=".35"/><stop offset="1" stop-color="#63e0ff" stop-opacity="0"/></linearGradient>
    <clipPath id="bvEye"><circle cx="85" cy="85" r="60"/></clipPath></defs>
    <circle cx="85" cy="85" r="60" fill="#0b1119"/><circle class="bv-pupil" cx="85" cy="85" r="18"/><circle class="bv-pupil" cx="79" cy="79" r="5" style="fill:#fff"/>
    <g clip-path="url(#bvEye)" id="bvBlades">${blades}</g><circle class="bv-ring" cx="85" cy="85" r="64"/>
    <rect x="178" y="18" width="234" height="134" rx="6" fill="#0b1119" stroke="#2a3a50"/>${zones}${dots}<rect class="bv-beam" x="180" y="20" width="34" height="130"/>`;
  const L = D ? [
    `› ${D.camera.name} · ${D.camera.width} x ${D.camera.height} at ${D.camera.fps} fps`,
    `› ${zs.length} zones · a door line for IN / OUT · one staff-only area`,
    `› privacy: everyone pixelated first · frames never stored · ${D.privacy.retention_days} days`,
    `› today: ${D.day.visitors.toLocaleString("en-NZ")} visitors · ${D.day.in} in / ${D.day.out} out`,
    `› Skill Lab: ${Object.keys(D.lab.skills).length} skills tested against the truth every day`,
  ] : ["› Vision data is missing: run python scripts/build_vision.py"];
  await sleep(quick ? 30 : 250);
  svg.querySelectorAll(".bv-blade").forEach((b, i) => { b.style.transform = `rotate(${i * 60}deg) translate(0,-46px)`; });
  svg.classList.add("on");
  const zr = [...svg.querySelectorAll(".bv-zone")], dr = [...svg.querySelectorAll(".bv-dot")];
  for (let i = 0; i < L.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", esc(L[i]) + "\n");
    zr.slice(Math.floor(i * zr.length / L.length), Math.floor((i + 1) * zr.length / L.length)).forEach(z => z.classList.add("on"));
    dr.slice(Math.floor(i * dr.length / L.length), Math.floor((i + 1) * dr.length / L.length)).forEach(z => z.classList.add("on"));
    await sleep(quick ? 50 : 430);
  }
  zr.forEach(z => z.classList.add("on")); dr.forEach(z => z.classList.add("on"));
  document.getElementById("bootH").innerHTML = "Vision <b>online.</b>";
  await sleep(skip || quick ? 120 : 1000);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
