/* Launchpad boot sequence: quick on repeat visits in the same tab; Skip jumps straight in */
(async function () {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog");
  if (!box || !log) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let skip = false, quick = false, lines = [];
  try { lines = JSON.parse(log.dataset.lines || "[]"); } catch (e) {}
  try { quick = sessionStorage.getItem("launchpad.booted") === "1"; sessionStorage.setItem("launchpad.booted", "1"); } catch (e) {}
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  for (const t of lines) {
    if (skip) break;
    log.insertAdjacentText("beforeend", t + "\n");
    await sleep(quick ? 50 : 360);
  }
  const ok = document.createElement("span"); ok.className = "ok"; ok.textContent = "✓ Launchpad ready."; log.appendChild(ok);
  await sleep(skip || quick ? 80 : 450);
  box.classList.add("done");
  setTimeout(() => box.remove(), 700);
})();
