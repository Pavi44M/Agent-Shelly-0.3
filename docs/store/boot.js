/* Store Floor boot sequence, same as the other Shelly pages: quick on repeat visits in the same tab, Skip jumps straight in.
   The shelves draw in on a mini plan in their status colours while the live figures load. */
(async function boot() {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog"), ST = window.SHELLY_STORE;
  if (!box || !log) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let skip = false, quick = false;
  try { quick = sessionStorage.getItem("store.booted") === "1"; sessionStorage.setItem("store.booted", "1"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  const COL = { alert: "#ff6b6b", watch: "#ffc466", ok: "#3fb87f", empty: "#56657a", service: "#56657a" };
  const svg = box.querySelector(".boot-plan");
  if (ST && svg) {                                   // the plan, fixture by fixture
    const g = ST.fixtures.map((f, i) => {
      const r = f.rect || [Math.min(f.seg[0], f.seg[2]), Math.min(f.seg[1], f.seg[3]) - 25, Math.max(f.seg[0], f.seg[2]), Math.max(f.seg[1], f.seg[3]) + 25];
      return `<rect x="${r[0]}" y="${r[1]}" width="${r[2] - r[0]}" height="${r[3] - r[1]}" rx="6" fill="${COL[f.status] || "#56657a"}" style="animation-delay:${(quick ? 0 : i * .045).toFixed(2)}s"/>`;
    }).join("");
    const floor = ST.plan.sales_floor.map(p => p.join(",")).join(" ");
    svg.innerHTML = `<polygon points="${floor}" class="bp-floor"/>${g}`;
  }
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const d = DAYS[(new Date().getDay() + 6) % 7], O = (ST && ST.operations) || {}, c = (ST && ST.counts) || {};
  const team = (O.team || []).filter(m => !m.days || m.days.includes(d)).length;
  const lines = ST ? [
    `› store plan · ${ST.fixtures.length} fixtures · ${(O.self_checkouts || {}).count || 0} self-checkouts · café till · kitchen · storeroom`,
    `› shelves · ${c.alert} act today · ${c.watch} to watch · ${c.ok} on plan · week to ${ST.meta.asof}`,
    `› open ${(O.trading_hours || {}).open}–${(O.trading_hours || {}).close} · shifts ${(O.shifts || []).map(s => s.start).join(" and ")} · café to ${(O.cafe || {}).close}`,
    `› ${d} · ${team} on the roster · ${(O.deliveries && O.deliveries.days.includes(d)) ? "delivery at " + O.deliveries.arrive : "no delivery today"}`,
    `› about ${O.customers_per_day} customers today, busiest after 5pm · ${(O.trolleys || {}).total} trolleys · ${(O.baskets || {}).total} baskets`,
  ] : ["› store data missing: run python scripts/build_store.py"];
  for (const t of lines) { if (skip) break; log.insertAdjacentText("beforeend", t + "\n"); await sleep(quick ? 50 : 380); }
  const ok = document.createElement("span"); ok.className = "ok"; ok.textContent = "✓ Store open."; log.appendChild(ok);
  await sleep(skip || quick ? 80 : 450); box.classList.add("done"); setTimeout(() => box.remove(), 700);
})();
