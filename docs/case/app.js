/* Shelly case-study mode (v2.5.3): the Commercial lab as a five-minute CRISP-DM story. Numbers are read live from docs/data/commercial.js. */
(function () {
  "use strict";
  const D = window.SHELLY_COMMERCIAL, $ = s => document.querySelector(s);
  const m = v => (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-NZ");
  if (D) {
    const T = D.totals, up = Math.round(D.events.reduce((a, e) => a + (e.uplift_pct || 0), 0) / D.events.length);
    $("#ver").textContent = D.version;
    $("#answer").innerHTML = `<b>The answer:</b> shoppers bought <b>${up}% more</b> on promotion, but only <b>${D.share_worth_it}% of ${D.events.length} promos paid their way</b>. Over ${D.years} years they cost <b>${m(T.net)} of margin</b>, and the biggest cost was the <b>${m(T.subsidy)} discount</b> on units that would have sold at full price anyway.`;
    // the bridge takes the lab's live totals
    const parts = [T.extra_gp, -T.subsidy, -T.cannibalised, -T.dip, T.net], mx = Math.max(...parts.map(Math.abs));
    document.querySelectorAll(".bridge > div").forEach((d, i) => { d.querySelector("b").textContent = (parts[i] > 0 ? "+" : "") + m(parts[i]); d.querySelector("i").style.height = (Math.abs(parts[i]) / mx * 88) + "%"; });
  }
  const S = [...document.querySelectorAll(".step")], nav = $("#steps"); let i = 0;
  nav.innerHTML = S.map((s, k) => `<button type="button" data-k="${k}">Step ${k + 1}<b>${s.dataset.t}</b></button>`).join("");
  function show(k) {
    i = Math.max(0, Math.min(S.length - 1, k));
    S.forEach((s, j) => s.classList.toggle("on", j === i));
    [...nav.children].forEach((b, j) => j === i ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current"));
    $("#prog").style.width = ((i + 1) / S.length * 100) + "%"; $("#back").disabled = i === 0;
    $("#next").textContent = i === S.length - 1 ? "Start again ↺" : "Next →";
    try { history.replaceState(null, "", "#step-" + (i + 1)); } catch (e) { /* file:// */ }
    dispatchEvent(new CustomEvent("shelly:mood", { detail: { mood: "happy", ms: 900 } }));
  }
  nav.addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b) show(+b.dataset.k); });
  $("#next").onclick = () => { show(i === S.length - 1 ? 0 : i + 1); nav.scrollIntoView({ behavior: "smooth", block: "start" }); };
  $("#back").onclick = () => show(i - 1);
  const h = location.hash.match(/step-(\d)/); show(h ? +h[1] - 1 : 0);
  window.SHELLY_GUIDE = { "s-case": `<b>Case-study mode.</b> Six steps, about five minutes: the question, the data, the baseline, the model, the checks, and what changes on Monday. Press Next →.` };
})();
