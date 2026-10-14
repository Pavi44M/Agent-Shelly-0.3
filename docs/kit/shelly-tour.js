/* Shelly's 3-minute tour (v2.4): nine stops across the site, about 20 seconds each. Shelly flies to the section,
   says what it shows (aloud when Voice is on), then moves on. A bar at the top shows the stop, with Next and Stop.
   State lives in this tab only (sessionStorage), so closing the tab ends the tour. */
const STOPS = [
  ["launchpad/", "", "This is the Launchpad: every Shelly workspace, one tap away. Four businesses run on one brain."],
  ["shift/", "s-open", "The store's day starts here: the forecast and the reasons, who's on, the recall to pull and the top three jobs."],
  ["shift/", "s-sense", "Every forecast is marked against what really happened. A new model only runs the roster after winning both the 14-day exam and the 8-week check."],
  ["os/", "s-bus", "Shelly OS: events from every business, the agent that acted, and who has to sign off. Routine work runs on its own."],
  ["ops/", "s-flow", "One event followed end to end: a store stock-out becomes an order, a Gateway truck slot and a check-in."],
  ["ops/", "s-docks", "Gateway books every truck into a dock; cold loads only go on chilled docks."],
  ["group/", "s-board", "Group HQ: the month's results, the risks, and the few decisions only the owner makes."],
  ["group/", "s-gov", "Every agent works inside a limit the owner approves, and every action is in the audit log."],
  ["ask/", "s-ask", "And you can just ask: by typing or by voice. That's the tour. Thanks for watching."],
];
const KEY = "shelly.tour", SEC = 20;
const get = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
const set = v => { try { v == null ? sessionStorage.removeItem(KEY) : sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } };

export function init(K) {
  const { BASE, msg, bubble } = K;
  const go = i => { if (i >= STOPS.length) { set(null); bar && bar.remove(); return; } set({ i }); const [p, s] = STOPS[i]; location.href = BASE + p + (s ? "#" + s : ""); };
  window.ShellyTour = { start: () => go(0), stop: () => { set(null); if (bar) bar.remove(); } };
  document.addEventListener("click", e => { if (e.target.closest && e.target.closest("[data-tour-start]")) { e.preventDefault(); go(0); } });
  const st = get(); let bar = null;
  if (!st) return window.ShellyTour;
  const [path, sec, line] = STOPS[st.i];
  if (!location.pathname.endsWith(path) && !(path === "" && /\/$/.test(location.pathname))) { go(st.i); return window.ShellyTour; }
  bar = document.createElement("div"); bar.className = "sk-tour";
  bar.innerHTML = `<b>Tour ${st.i + 1}/${STOPS.length}</b><i><u style="animation-duration:${SEC}s"></u></i><button type="button" data-t="next">Next ›</button><button type="button" data-t="stop">✕ Stop</button>`;
  document.body.appendChild(bar);
  bar.addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (!b) return; if (b.dataset.t === "next") go(st.i + 1); else window.ShellyTour.stop(); });
  const show = () => {
    const el = sec && document.getElementById(sec);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.SHELLY_TOUR_LINE = line; bubble.hidden = false; msg.innerHTML = line;   // the kit keeps this line up while the tour runs
    try { if (window.ShellyVoice && window.ShellyVoice.on) window.ShellyVoice.speak(line); } catch (e) { /* no voice */ }
    dispatchEvent(new CustomEvent("shelly:mood", { detail: { mood: "happy", ms: 1500 } }));
  };
  const wait = () => { const b = document.getElementById("boot"); if (b && !b.classList.contains("done")) return setTimeout(wait, 300); setTimeout(show, 600); };
  wait();
  setTimeout(() => go(st.i + 1), SEC * 1000);
  return window.ShellyTour;
}
