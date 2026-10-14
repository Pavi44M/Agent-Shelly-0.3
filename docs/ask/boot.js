/* Shelly's mind boot: a small web of thoughts lights up node by node, with the real counts in the log.
   Quick on repeat visits; Skip jumps in. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), svg = document.getElementById("bootSv"), D = window.SHELLY_MIND;
  if (!box || !log || !svg) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("ask.booted") === "1"; sessionStorage.setItem("ask.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  const N = [[210, 88], [120, 40], [300, 40], [80, 120], [340, 120], [160, 150], [260, 150], [40, 70], [380, 70]];
  const E = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 7], [2, 8], [3, 5], [4, 6], [1, 2]];
  svg.innerHTML = E.map(([a, b]) => `<line class="bo-l" x1="${N[a][0]}" y1="${N[a][1]}" x2="${N[b][0]}" y2="${N[b][1]}" stroke-width="1.5"/>`).join("") +
    N.map(([x, y], i) => `<circle class="bo-n" cx="${x}" cy="${y}" r="${i ? 9 : 16}" stroke-width="1.5"/>`).join("");
  const L = D ? [`› ${D.answers.length} questions I can answer, worked out from today's numbers`, `› ${D.huddles.length} huddles: departments agreeing one plan`,
    `› ${D.memory.length} memories, all from what really happened`, `› ask by typing or with the 🎙 microphone`] : ["› Mind data is missing: run python scripts/build_mind.py"];
  const ns = [...svg.querySelectorAll(".bo-n")], ls = [...svg.querySelectorAll(".bo-l")];
  await sleep(quick ? 30 : 250);
  for (let i = 0; i < L.length; i++) {
    if (skip) break;
    log.insertAdjacentHTML("beforeend", esc(L[i]) + "\n");
    ns.slice(i * 2, i * 2 + 3).forEach(n => n.classList.add("on")); ls.slice(i * 3, i * 3 + 3).forEach(n => n.classList.add("on"));
    await sleep(quick ? 50 : 450);
  }
  ns.forEach(n => n.classList.add("on")); ls.forEach(n => n.classList.add("on"));
  document.getElementById("bootH").innerHTML = "Mind <b>awake.</b>";
  await sleep(skip || quick ? 120 : 1000);
  box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
