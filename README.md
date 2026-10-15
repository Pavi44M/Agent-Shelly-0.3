# Shelly: a personal analytics agent for retail and the businesses around it

![tests](https://github.com/Pavi44M/Agent-Shelly-0.3/actions/workflows/tests.yml/badge.svg)
![Python](https://img.shields.io/badge/python-3.11-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green)

**[🚀 Launchpad](https://pavi44m.github.io/Agent-Shelly-0.3/launchpad/)** · **[▦ Store Floor (3D)](https://pavi44m.github.io/Agent-Shelly-0.3/store/)** · **[▶ Talk to Shelly (live demo)](https://pavi44m.github.io/Agent-Shelly-0.3/)** · [Tōtara Medical Supply Chain Command](https://pavi44m.github.io/Agent-Shelly-0.3/supply-chain/) · **[⛟ Gateway Warehousing & Transport](https://pavi44m.github.io/Agent-Shelly-0.3/gateway/)** · **[🏙 Shelly Tower](https://pavi44m.github.io/Agent-Shelly-0.3/tower/)** · [Example Excel output](docs/example/) · [Portfolio](https://pavi44m.github.io/pavibamunu)

![Shelly v0.2](docs/screenshot.png)

## What's new in v2.6.1: the Tower page uses the 3D floors too

- Opening a floor on the Tower page now slides out the floor modelled in Blender (closed hotel rooms with doors, washrooms as a door and a sign, faceless figures by role) instead of the older open drawing. The GLB reader is shared at `docs/kit/glb.js`.

## What's new in v2.6.0: Shelly Tower in 3D, built in Blender

- **The tower and all 35 floors are real 3D models** (`docs/floors/model/*.glb`), generated headless by `scripts/blender/build_tower_3d.py` (`pip install bpy`, then `python scripts/blender/build_tower_3d.py`) from each floor's plan in `docs/data/floors.js`.
- **The tower** (top of the Floors page): drag to spin, pinch or scroll to zoom, tap any floor to fly in; the chosen floor slides out like a drawer.
- **Every floor**: slab, curtain-wall glazing, the core (four lifts, two fire stairs, risers, washrooms), walls with doors, and furniture for what the floor is for: aisles, chillers and checkouts on the Store floor; consult rooms, urgent-care bays with curtains, X-ray and a day ward in Tōtara Clinic; desks, meeting rooms and kitchens on the offices. Three views (Angle, From above, Eye level), room labels, and the floor rises into place when you arrive by lift.
- **Privacy by design**: hotel guest rooms, suites and apartments are closed rooms with closed doors, and nobody is drawn inside them; washrooms are a door and a sign only. People are plain figures coloured by role, never faces.
- Phones get a lighter renderer; without WebGL the 2D plan is shown instead, and it stays one tap away for everyone. The Tower page links straight to the floors in 3D.

## What's new in v2.5.4: quality you can see

- **Quality page** (`docs/quality/`, "✓ Quality" in the Workspaces menu; `shelly/quality.py`): the forecast league table (every model's error on weeks it never saw, the best model by category, and why the day-ahead weekday average stays in charge), an anomaly radar that flags unusual trading days against a same-weekday baseline with the likely reason and how sure it is, the data checks run on the raw store data before any model, and build health (automated tests, pages rendered at desktop and phone width on every release, CI on every push and the Monday rebuild).

## What's new in v2.5.3: case-study mode

- **Case-study mode** (`docs/case/`, "🎓 Case study" in the Workspaces menu): the Commercial lab told as a five-minute CRISP-DM story for a hiring manager. Six steps (the business question, the data, the baseline, the model, how the numbers were checked, and what changes on Monday) with Next and Back, a progress bar and a link to every piece of evidence. Every number is read live from the lab's data, so the story never drifts from the model.
- The same case study lives on the portfolio at pavi44m.github.io/pavibamunu/case-study.html, and the CV cites it.

## What's new in v2.5.2: Tōtara Clinic and the Shelly Tower Hotel

- **Tōtara Clinic** (`docs/clinic/`, levels 5 to 7; `shelly/tower_biz/clinic.py`): a mini hospital with GP and nurse clinics, urgent care, X-ray, ultrasound, a lab, a minor procedures room, an eight-bed day ward, physio and the Tōtara pharmacy. One day hour by hour: arrivals by stream, waits against target, day-ward beds, staffing by role against need, and the supplies it uses from Tōtara Medical's own stock. Counts only, never patient records; nothing is medical advice.
- **Shelly Tower Hotel** (`docs/hotel/`, levels 16 to 18; `shelly/tower_biz/hotel.py`): occupancy, ADR and RevPAR for 60 nights back and 30 on the books, reservations by segment, channel and lead time, repeat guests, every room's housekeeping status, covers per sitting, menu engineering (stars, plough-horses, puzzles, dogs), the events diary and guest experience against a five-star standard. Guest scores are synthetic and labelled so; no guest names anywhere.
- The Tower now lists the clinic on L5 to L7 (replacing the fictional Rimu Health Clinic tenancy) and the hotel's restaurant, ballroom and conference centre on L18.

## What's new in v2.5.1: Shelly Tower floor by floor

- **Floors page** (`docs/floors/`; `shelly/floors.py`): ride the lift from B3 to the rooftop. Every level has a plan on its real area: four lifts, two fire stairs, women's, men's, all-gender and accessible washrooms (and a parents' room on working floors), then the fit-out for what the floor is for. The people at work as dots and counts by role, the technology on the floor, and building systems (energy, CO₂, lift wait, washroom visits driving cleaning rounds).
- **Store Floor**: tap a shelf to see its lines' promo verdicts and what they sell best with, from the Commercial lab.
- The Workspaces menu gains Commercial, Floors, Clinic and Hotel.

## What's new in v2.5.0: the Commercial lab

- **Commercial lab page** (`docs/commercial/`, "💲 Commercial" in the Workspaces menu; `shelly/commercial/`). Every in-store promotion in the two years of sample data (317 of them) is scored against what the line would have sold anyway (same weekday, 4 weeks before, promo days left out): extra units, margin on those units, the discount given on units that would have sold anyway, margin taken from other lines in the same category, and the dip in the 3 days after. A margin bridge shows where it all went, then a keep / shallower / stop call for every line.
- **Discount depth lab**: each line's promo response from its own history, the margin a day at 5% to 30% off, and how much of the discount a supplier must fund for the store to break even.
- **What sells together**: pairs with support, confidence and lift, and six shopping missions (share of baskets against share of sales). The sample data has daily totals, not receipts, so baskets are simulated and labelled that way; no basket is ever linked to a person.
- CLI: `python -m shelly commercial promo | depth | basket`; new `commercial` pack skills owned by the Category agent; three new answers on the Ask page.

## What's new in v2.4: Smarter Shelly

- **Ask Shelly page** (`docs/ask/`, "💬 Ask" on every page; `shelly/mind/ask.py`). Ask a plain question about any of the four businesses, by typing or with the 🎙 microphone (the browser's own speech recognition, en-NZ), and get today's number with a link to where the full picture lives. Every answer is computed from the same data the pages show; typos and other words for the same thing are forgiven, and Shelly says plainly when she doesn't know.
- **Cross-department huddles** (`shelly/mind/huddle.py`): agents from different departments agree one plan. Store replenishment checks the inventory budget left and rides on Gateway's existing store run; Tōtara's medicine gaps weigh air freight against the sales at risk and book a chilled dock; Gateway's late service moves pickers with their agreement first. One owner per step, conflicts resolved in a fixed order (safety and law, customers, then cost), one sign-off.
- **Agent memory** (`shelly/mind/memory.py`): what each agent did before, what happened and the lesson it keeps, only from things Shelly really recorded (Skill Lab tunings, Loss Prevention rounds, forecast exams, supplier track records, budget variances, dock clashes, decisions).
- **3-minute tour**: "▶ 3-min tour" on the Launchpad walks nine stops across the site, about 20 seconds each, with Next and Stop.
- **Moods that follow the work**: Shelly looks thoughtful while you review approvals and while she works out an answer.
- CLI: `python -m shelly mind ask "how is cash?" | huddles | memory`.

## What's new in v2.3: Group HQ, the Tower departments at work

- **Group HQ page** (`docs/group/`, "🏛 Group" on every page; `shelly/group/hq.py`). **Finance**: the month-end close (business day, owner, status; the board pack waits for Pavi), P&L by business to EBITDA with **intercompany eliminations** (Gateway's warehousing for Tōtara and deliveries to the store come off both sides), the biggest variance in each business explained, and a **13-week cash-flow forecast** (store takings, Tōtara 30-day terms, Gateway billing on the 20th, tower rent on the 1st; fortnightly wages, imports as shipments land, GST) with its low point against a $600k buffer.
- **People and HR, roles only**: headcount and weekly pay by business and role, leave owed, and the licences that keep each site legal (Manager's Certificates, forklift F endorsements, a first aider on every shift, GDP training, food safety) with what's expiring.
- **Procurement**: categories several businesses buy separately, what one group tender saves, and buying gloves from Tōtara instead of outside suppliers.
- **Board pack**: results, risks, decisions only Pavi makes, compliance.
- **Governance**: every agent's **action limit** (what it does alone, a cap of $500 or its department limit, what always escalates) and an **audit log** of every action and approval. The limits themselves wait in Pavi's approvals queue.
- `python -m shelly group [pnl|close|cash|people|procurement|board|limits|audit]`; skills `group.*` on the finance, HR and management agents. Grid cards now shrink properly on phones everywhere.

## What's new in v2.2: Gateway and Tōtara operations

- **Operations page** (`docs/ops/`, "⛓ Ops" on every page; `shelly/ops/`). **Gateway**: a dock scheduler that books every truck (today's runs and inbound deliveries) into a dock, cold loads only on chilled docks, and flags any truck waiting over 30 minutes with a fix; a labour planner (pickers, forklift drivers, loaders per shift from the day's pallets against the roster); client billing as used (storage by temperature, handling, deliveries, cold-chain monitoring) against each contract.
- **Tōtara**: supplier scorecards (on time, in full, steady lead times; grade A–D and the one thing to raise at the quarterly review), expiry rescue (short-dated batches offered to clients who will use them in time; medicines and clinical items to hospitals and clinics only) and a what-if planner (any supplier 7, 14 or 28 days late: the SKUs that run short, sales at stake and the best fix).
- **Followed end to end**: a store stock-out through ordering, the Gateway run, a dock slot and check-in; a Tōtara stock gap through expediting, a chilled inbound dock and hospital delivery, with who signs off at each step.
- **Shelly talks on every page again**: the Shift, OS and Operations pages now have their own welcome and a line for every section (with live numbers) as she follows you down the page. A test makes sure no new page ships without them. The navigation stacks onto two rows on laptops so the business names stay readable.
- `python -m shelly ops [docks|labour|billing|suppliers|expiry|whatif|flows]`; skills `ops.*` on the Gateway and Tōtara agents.

## What's new in v2.1: the Store Shift Pilot

- **The Duty Manager's day** (`docs/shift/`, "⏱ Shift" on every page; `shelly/shift/pilot.py`): an **opening brief** at 06:00 (the forecast with its range and reasons, staff on vs staff needed by hour, recalls, orders waiting, the top three), a **live to-do list** you can play through the day (routine, compliance such as fridge logs and the liquor licence, forecast-driven tasks and tasks raised by the Shelly OS event bus, each with the role that owns it), and a **closing report with handover notes** for the next Duty Manager.
- **Daily demand sensing** (`shelly/shift/sensing.py`): weather, public and school holidays, big nights at Eden Park and paydays. Every model is marked one day ahead on the last 14 days it never saw, and over 8 weeks. **A new model only runs the roster when it beats the current one on both**, so one lucky fortnight can't change it; the page says which model is in charge and why. The store's history is synthetic, so what the model learned is shown next to the true effect of each driver.
- **Skill Lab for the shift skills** (`shelly/shift/lab.py`): forecasting, reorder (the lab tries five safety-stock settings and keeps the leanest that holds 95% on the shelf) and rostering (an hour short counts double an hour over), each scored daily for 14 days with a level.
- New agent **Shift Pilot** in the Brain, skills `shift.brief / todo / close / sense / lab`, and `python -m shelly shift [brief|todo|close|sense|lab]`.

## What's new in v2.0: the Shelly OS foundation

- **One data model** (`shelly/os/model.py`): 13 SQLite tables with the same names and keys for all four businesses (businesses, departments, agents, sites, stock, sales, service, expiry, KPIs, flags, approvals, events, actions). It is built from the published synthetic data; real-data mode will fill the same tables on your own PC. `python -m shelly os tables`, or `python -m shelly os db` to save `outputs/shelly.db`.
- **An event bus** (`shelly/os/bus.py`): detectors read the model and publish events (`store.stock.below_cover`, `totara.stock.gap`, `gateway.service.below_target` ...), subscribed agents react, and every action is checked against the agent's autonomy and the Brain's approval chain. Routine actions run on their own; money, people and customers wait for a person. **Departments talk to each other**: a store stock-out raises the order *and* books the Gateway delivery. `python -m shelly os run`.
- **Shelly OS page** (`docs/os/`, "⚙ OS" on every page): today's events with each agent's action and who signs off, the cross-business handoffs, and the data model, with its own boot screen.
- **One release command** (`scripts/release.py 2.0.1 -m "..."`): bumps the version everywhere (code, data, mascot kit, every `?v=` tag), rebuilds the pages, runs the tests, commits and writes the bundle to push.
- **Phone layouts checked on every page**: a render test opens all 12 pages on a desktop and a phone (no script errors, no sideways scrolling) and saves screenshots; it runs on every release (`SHELLY_RENDER=1`). Fixed the Tower page scrolling sideways on phones.
- Removed a stray example spreadsheet that slipped into v1.22.2.

## What's new in v1.22: Shelly gets her own robot head

- **A robot head on every page** (`docs/kit/shelly-head.js`): a rounded TV-style head in real 3D (three.js, vendored) with a rolled clear-coat shell, a recessed bezel with a teal gasket, four screws, knob ears, a back vent panel and an **LED-matrix face** (28 x 16 LEDs) that glows and blooms. Her old light bulb now sits on a springy antenna that whips when she moves, and still glows amber when approvals are waiting.
- **Moods with their own face, colour and motion**: idle, thinking, searching, listening, speaking (live lip-sync from her voice), working, happy, alert, error, sleeping, dizzy, annoyed, hungry. A mood change plays a short glitch and the colour cross-fades. The head and eyes follow the pointer; a tap is a poke (she blinks and rocks back, a little harder with each quick tap) and only the 6th tap in a row makes her hop and spin; reduced motion keeps a still, friendly pose.
- **Works everywhere**: a 2D head takes over when WebGL is missing or the device is slow. Pages can set her mood with `ShellyHead.set("thinking", 4000)`; `?bulb=classic` brings back the 3D bulb.
- **Boot screens for Store Vision and Loss Prevention**: the camera's iris opens and the floor's zones light up; a shield gathers every Shelly site and the padlock closes on the locked scope. Real numbers in the log, quick on repeat visits, Skip to jump in.
- The idea of LED-faced agent heads comes from robot-heads (MIT, fayazara); the design and all the code here are Shelly's own.

## What's new in v1.21: Shelly Intelligence · Loss Prevention, on every Shelly site

- **Patterns about stock and places, never people** (`docs/lp/`, `shelly/lp/`, `modules/lp/lp.yaml`). Store: picked at a high-risk shelf (spirits, razors, formula, vapes) → concealed → left without a till transaction for that shelf. Two steps prompt a floor staff member to offer help; all three open a case for the Duty Manager. A single gesture (a phone into a pocket, arms crossed, an own shopping bag) never becomes a case. Also self-checkout mismatches, till exceptions and after-hours movement; Gateway docks with no booking, trucks with no manifest, cage access out of hours and count variances; Tōtara Medical's controlled-drugs cage and receipt shortfalls; Shelly Tower tailgates, restricted floors after hours and tagged laptops leaving.
- **Concealment from the skeleton only** (`shelly/lp/pose.py`): 17 COCO body points with the face points dropped; a reach towards the shelf, then the same hand into the pocket region and held (or hidden). `python -m shelly lp pose --source aisle.mp4` runs YOLO11-pose on a real video and keeps no frames.
- **Tuned safely**: from factory settings (44 false aisle cases a day) to tuned (0.25 a day, about 71% of losses caught) one setting at a time, kept only when held-out days agree and false alarms stay under the budget of 1 per camera per day. The tuned settings wait for Pavi (Brain approval, or `python -m shelly lp approve`).
- **Law and privacy built in** (`shelly/lp/policy.py`): refuses to run with identity, face matching, biometrics, demographics, per-person scores, stored video, retention over 30 days, or any site outside Shelly's own businesses (scope locked; expansion needs Pavi, a privacy impact assessment and a legal check). Incident clips only, faces pixelated, originals sealed for NZ Police requests. A privacy impact checklist per site, the door sign and the staff rules (never detain, chase, touch, search or accuse).
- **Evidence packs** with the steps, clip windows, value and blanks for the reviewer, police report number and trespass decision; **step 1 without a camera**: where the loss is by cause and place for each site.
- **Four agents** in the Brain, team "Shelly Intelligence · Loss Prevention": Store, Warehouse (Gateway + Tōtara), Tower, and Cases & privacy. `python -m shelly lp demo | tune | approve | pia | pack`.

## What's new in v1.20: Shelly Intelligence · Store Vision, with a Skill Lab

- **Store Vision** (`docs/vision/`, `shelly/vision/`, `modules/vision/vision.yaml`): the store camera turned into store numbers. Unique visitors (tracking, minimum life, identity switches re-linked), door IN/OUT across a line with a dead band and cooldown, zone visits and dwell with an exit grace, the checkout queue with wait and open-a-till prompts, staff-only area prompts with a grace period and opening hours, and a heatmap of **time spent** in seconds (a live map that fades and a day map that keeps). Outputs `summary.json`, `events.jsonl`, `hourly.csv` and the heat grid.
- **Real video**: `python -m shelly vision run --source store.mp4 --show` runs YOLO + ByteTrack (Ultralytics, optional install) on a file, webcam or CCTV stream; zones scale to the camera.
- **Privacy by design**: everyone pixelated before a frame is shown or saved, frames never stored, no face recognition or re-identification, events purged after 30 days; NZ Privacy Act 2020 notes on the page. The website uses a synthetic camera only.
- **Checked against the truth**: a simulator with realistic camera noise (missed detections, identity switches, false positives, jitter) knows what really happened; a full synthetic day counts 637 of 637 visitors.
- **Skill Lab (Shelly Intelligence)**: every vision skill sits an exam each day, scores 0-100 and levels 1 Learning → 5 Expert; exams get harder as she improves; a coach tunes a weak skill's own settings and keeps a change only if a held-out day improves and nothing else gets worse; a new skill is unlocked each day from a curriculum (conversion, staff vs shopper by movement, next-hour footfall, hot zone, rush warning), trains in suggest-only, and goes live when Pavi approves (the request lands in the approvals queue). `python -m shelly vision lab`.
- **Five agents** in the Shelly Brain, team "Shelly Intelligence · Vision": Footfall and Floor (Sales), Queue (Office Manager), Safety & privacy (Management), Skill Lab coach (Developers). Vision skills are registered skills (`shelly/packs/vision.py`).

## What's new in v1.19: Shelly Brain boot in 3D, sculpted in Blender

- **A brain you can look into.** The Brain is sculpted in Blender (`blender/shelly_brain_points.py`: two hemispheres folded into gyri and sulci by displacement textures, a ridged cerebellum, the brain stem) and sampled into ~20,000 points of light (`docs/brain/brain-points.js`).
- **The boot, in three.js** (`docs/brain/boot3d.js`): the points fly in from deep space and assemble; synapse threads link them and impulses race through in department colours; a holographic scan sweeps the brain; the eight departments orbit in 3D, ignite one by one and fire beams in; the camera dollies in and follows your pointer or your phone's tilt for depth and parallax; star dust behind; at 100% the brain flares, a core spark bursts and shockwave rings roll out.
- The 2D brain from v1.18 stays as the fallback when WebGL2 isn't available.

## What's new in v1.18: Shelly Brain wakes up

- **A new boot for the Brain page.** Hundreds of points of light fly in and settle into a brain (folded cerebrum, ridged cerebellum, brain stem), a web of synapses links them and impulses race across it; as the boot log runs, each of the eight departments ignites in its own colour round the brain and wires itself in, with a live percentage and a colour progress bar; at 100% a core spark flashes and a shockwave rolls out. Quick on repeat visits; still for reduced motion.

## What's new in v1.17: Shelly speaks, with live lip-sync and VFX

- **Voice on every page.** Tap 🗣 Voice in Shelly's bubble and she reads her tips and the page guide aloud, using the device's speech voice (the same voice picked on the main page). The choice is remembered. Browsers only allow speech after your first tap or key, so the first message waits for that.
- **Real-time lip-sync.** Her mouth follows the words as they are spoken: each word the speech engine starts is turned into mouth shapes (open vowels with teeth and tongue, round O/U/W, closed M/B/P, F/V), timed across the word; she nods with the words. Works on the 3D bulb and the 2D fallback.
- **VFX.** Light rays turn behind her, rings of sound ripple out while she speaks, motes of light drift round the glass, and the tungsten coil flickers and brightens with her voice.

## What's new in v1.16: Gateway, real vehicles and a real site

- **Vehicles modelled in Blender** (`blender/shelly_vehicles_build.py` → `docs/kit/vehicle-mesh.js`, `docs/kit/vehicles.js`): cab-over truck cabs with windscreen, grille, bumper, mirrors, steps and fuel tank; vans; saloons, hatchbacks and SUVs; real wheels (tyre, rim, hub, nuts); a counterbalance forklift with overhead guard, mast and a lifting fork carriage; a reefer unit. Fleet paint, glass, chrome, black trim and rubber each have their own material.
- **Trailers and box bodies** get aluminium corner posts and roof rails, side guards, rear doors with hinges, chassis and lamps.
- **A real site**: asphalt yard and roads, grass verges, concrete footpaths and warehouse floor, profiled metal cladding on every wall, sectional dock doors, a sky dome that follows the time of day, Blender-built trees; the cartoon outlines are gone.

## What's new in v1.15: the Blender look and real people across the whole group

- **Shelly HQ / Brain.** Every agent at every desk is now a person (the Blender-built body from v1.14) in their business colour, seated and typing when working, looking round when something waits for sign-off. Department heads wear long sleeves.
- **Store Floor.** Filmic tone mapping, soft image-based light, PBR materials (glossy floor tiles, metal shelving, glass doors) and real shadows from the fixtures and the team.
- **Gateway.** Image-based light for metal, glass, trucks and racking, following day and night.
- Same people everywhere: Store Floor, Gateway, Shelly Tower and Shelly HQ all share `docs/kit/human-mesh.js`.

## What's new in v1.14: real-looking people, and Blender detail in the live tower

- **People, rebuilt in Blender.** Everyone in the 3D worlds (Store Floor, Gateway, Shelly Tower) now has a body modelled in Blender (`blender/shelly_people_build.py` → `docs/kit/human-mesh.js`): smooth limbs with real hips, knees, ankles, shoulders, elbows and neck, a face (eyes, brows, mouth, nose, ears), four hair styles, two builds, trousers or skirts, short or long sleeves by role. Walking bends the knees, sitting puts thighs level and shins down, hands type at the desk. Gateway crews wear a proper hi-vis vest with reflective bands and a hard hat. All invented people, synthetic data only.
- **People do their jobs in Shelly Tower.** Open a floor and the team works like Shelly HQ: seated at their desks, in the meeting room, round the deal tables, in the boardroom, at the Shelly OS desks, technicians at the data-centre racks; visitors walk the podium and amenity floors.
- **Blender facade in the live 3D.** `blender/shelly_tower_05_web_detail.py` exports window frames for every floor and the aluminium fins (`docs/tower/model/shelly-tower-detail.glb`, 260 KB). Frames ride inside each floor, so they twist with it in 2050 and step aside when a floor slides out.
- **Film rig.** `blender/shelly_tower_04_film.py` sets up a 30-second film in the .blend (flyover → floor tour → 2050), driven by one control object, ready to render.

## What's new in v1.13: Shelly Tower rendered in Blender
- Shelly Tower modelled, lit and rendered in **Blender** from the same floor data: the floor bands, aluminium fins, the SHELLY crown, the podium and Neighbourhood Store flagship, the roof garden, helipad, solar canopy and spire, glass lifts, and the Auckland setting (CBD, Sky Tower, parks, wharves, harbour).
- Three renders at the top of the [Shelly Tower page](https://pavi44m.github.io/Agent-Shelly-0.3/tower/): today at golden hour, today at dusk, and the Shelly Business Centre in 2050 (twisting garden tower, holographic rings, satellite towers, skyways linking both sides, garden domes, air taxis). Each opens the same look in the live 3D view; the Launchpad card shows the 2050 render.

## What's new in v1.12: Shelly Tower (module v1.3), the Shelly Business Tower in Auckland city
- **[Shelly Tower](https://pavi44m.github.io/Agent-Shelly-0.3/tower/)** in 3D, built from *Shelly Business Tower: Integrated Architecture*: a commerce operating system with a building around it, standing in a stylised model of Auckland city (CBD, Sky Tower, Albert Park, Victoria Park, the Viaduct and the Waitematā Harbour; a picture, not survey data).
- **Shelly OS**: six layers (physical building, edge, data fabric and digital twin, Shelly OS, sector services, experiences and open API) with trust and governance down the side; the elevated capabilities (virtual power plant, simulation sandbox, commerce graph) and the new ones (agent mesh, decision ledger, predictive maintenance, building copilot, federated learning, edge plus cloud, self-learning loop).
- **Agent mesh**: Workplace, Retail, Logistics, Trade, Mobility, Energy, Security and Concierge agents negotiate through the orchestrator (live feed), all eight in the Shelly Brain; decision tiers (low acts, medium asks a person, high only advises) and a decision ledger. An MFC order over the limit and a new lease wait in the approvals tray.
- **Nine sectors matched to Shelly's businesses**: offices (group cores and tenants), the experiential mall (Neighbourhood Store), FMCG and the basement micro-fulfilment centre (Gateway), the international trade centre (Tōtara Medical with Gateway), mobility and the rooftop drone hub and vertiport (Gateway and Shelly Energy), health (Rimu Health Clinic and Tōtara), hospitality (hotel, apartments, food hall), innovation (Launchpad, Shelly Ventures and Shelly Academy) and culture (public plaza, Te Reo Māori wayfinding).
- **35 levels** from the rooftop vertiport to the MFC, parking with vehicle-to-grid and the loading dock and battery microgrid; tap any floor and it slides out (deal tables and a globe in the trade centre, hotel rooms, robots running on the MFC grid, EV chargers, AR mirrors and pop-up pods, the Shelly OS video wall).
- **Sustainability, trust, business model and phases**: energy and carbon, privacy and AI governance, ten income streams (synthetic run rate), four phases with gates and the ten success measures against their targets.
- **Two looks**: today and the **Shelly Business Centre in 2050** (twisting garden tower, satellite towers, skyways to the buildings on both sides, garden domes, world map, air taxis, flying cars). `python -m shelly tower` prints the summary.

## What's new in v1.11: Gateway v1.3, a realistic yard, sorting centres and processing centres
- **Two gates, no congestion**: Gate 1 (two lanes in, with a 20 m driveway so waiting trucks are off the road) and a separate Gate 2 (out), each with its own gatehouse officer and live PC. Trucks only turn in or out when there is a real gap in traffic, and oncoming drivers hold back to let them through.
- **One-way yard**: five marshalling lanes where trucks wait to be called, one truck at a time down the dock lane, swing out and reverse straight onto the dock, then leave west to Gate 2. Every truck and car checks the space ahead and the dock lane is locked while a truck reverses on or pulls out, so vehicles never drive through each other (tested with long runs on every site: no overlaps, no gridlock).
- **Fleet park**: eight drive-through bays for Gateway trucks not on a job; they leave forwards along the back lane when called for an outbound load.
- **Sorting centre at every site**: an overhead conveyor from the warehouse to a loop sorter with a chute and roll cage for each business (plus Returns and Exceptions), pick & pack benches, a sort-control desk and a glass manager's office. New roles: Sort Centre Manager, Sort Supervisor, Sort Operative, Pick & Pack Operative, on every shift's roster; a Sorting & Processing Manager in the management team; a Gateway sorting agent in the Brain.
- **Workstations**: live PC screens at both gates, receiving, the planning office, sort control, the manager's office and every pack bench. Tap one to read its screen; the new PCs tab lists them all.
- **Two processing centres**: Gateway Albany Processing Centre and Gateway Airport Processing Centre (Māngere), with bigger sorting halls and more pack benches.

## What's new in v1.10: Gateway v1.2, cold storage, 24/7 shifts and night
- **Cold storage** at every Gateway site: chillers (2–8°C pharma, 2–5°C food), freezers (−20°C) and a chilled cross-dock lane, built as insulated rooms around their racks with strip-curtain doors, cold mist when a forklift goes through, rooftop units and live temperatures (alarm colours outside range). Reefer trucks are put away into the right cold room.
- **Day, afternoon and night shifts** from a real roster: names, stations, staggered breaks, forklift / first-aid / cold-room licences. In 3D the crew clocks in from the car park, takes breaks in the staff room, hands over and goes home; only licensed operators drive forklifts, so the night shift runs fewer. Roster checks (supervisor, first aider, licensed drivers, gate and yard, cold-trained) flag a real gap.
- **Rosters & shifts** section: each site × shift, wages per day (night ×1.25), and a 24-hour chart of crew on site against trucks booked.
- **Day and night**: the sky, sun and shadows follow the clock; yard light towers, office windows, light panels and truck headlights come on at night. Jump to Day / Afternoon / Night / Now.
- **Bolder and smoother**: ink outlines, ribbed walls, painted bay numbers and hazard edges; trucks follow curved paths and their wheels turn; eased zoom and drag; busier yard with road traffic, queues at the gate and replenishment moves in quiet times.

## What's new in v1.9: Gateway Warehousing & Transport (new business, module v1.1)
- **[Gateway](https://pavi44m.github.io/Agent-Shelly-0.3/gateway/)**: Shelly's third business, a third-party logistics company that stores, picks and delivers for the Neighbourhood store, Tōtara Medical, other medical suppliers and food-service operators (all fictional, synthetic data).
- **Three Auckland sites live in 3D** (Wiri DC, Cold Chain, Cross-Dock): trucks book in at the gatehouse, reverse onto a free dock and are unloaded or loaded by forklifts; pickers build orders, receivers check temperatures and ASNs, the yard marshal guides trucks in, the supervisor walks the dock line, drivers wait in the drivers' room. Zoom in and the roof lifts to show the racks. Tap any truck, forklift, person or dock.
- **Control-room cards**: site status, stock vs capacity, clients stored, shipment tracking (order → picked → loaded → in transit → delivered), the docks / forklifts / trucks board and a live feed.
- **The business behind it**: client contracts with OTIF against SLA, what Shelly flagged (service, cold chain, capacity, docks, fleet), decisions that join the approvals tray, Gateway's own management team (General Manager reporting to Pavi), 17 floor and road roles with headcounts ("Show me" finds one in 3D), fleet and the roadmap to v2.0.
- **Brain**: five Gateway agents (warehouse operations, transport planning, cold chain & quality, client accounts, shifts) in the company-wide departments; the business switch now has three businesses. `python -m shelly gateway` prints the summary.

## What's new in v1.8: Shelly guides you
- **Drag Shelly anywhere** (mouse or finger, or arrow keys when she has focus). She stays where you put her, on every visit, until you tap **🏠 Home**.
- **🧭 Guide me**: as you scroll she glides beside the section you're reading and explains it, with this week's numbers where she has them (sales, the top action, the category furthest behind budget, the best forecast model…).
- **Point at anything**: rest the pointer on a section, chart, tile or report for a moment and she flies over, looks at it and explains it. **💬 Ask Shelly** sends a matching question to the chat; **📖 More** opens the section's own "What is this?".
- On phones her message sits along the bottom of the screen so it never runs off the edge. Works on every page (store, floor, Brain, Launchpad, Tōtara Medical).

## What's new in v1.7: Shelly switches on
- **New loading screen for Shelly AI**: a light bulb that switches on as the weekly run finishes. Its filament is the store's last 14 days of sales, the three bands of the base fill as data, models and actions are done, data points drift up into it, and the step list counts up the real figures (rows read, data quality, best model, 7-day forecast, actions). It then flies to Shelly's corner, where the mascot takes over. Quick on repeat visits, Skip any time, calm with reduced motion.
- **One version everywhere**: every page, report and export now shows the running version (no more old v0.1 / v1.2 labels).

## What's new in v1.6: Store Floor, Classic look
- **Classic look (default)**: the live store with one card per category over its shelves (this week's sales and the change on last week, a RECALL badge when one is open), a header with the view ("Sales heat") and a big clock, glass walls, and cards for the checkout (baskets a day), delivery pickup (share of sales) and stockroom. Tap a card to go to the shelf. **Detailed** brings back the sign on every shelf.
- **Hourly timeline** under the floor: customers expected each hour (today's live POS when connected), a strip for floor cover (red under two people), **Now** and **Play the day**, and tap or drag to jump the store to any time.

## What's new in v1.5: Store Floor, points to improve and live trade
- **Improve tab**: points to improve worked out from this week's results, today's rostered team and the store plan: recall, lines below lead-time cover, hours with fewer than two people on the floor, the busiest hour per person, waste over target, the shelf furthest behind budget, delivery-app outages and shelf-space productivity (gross margin per metre of shelf). Tap a point to fly to the shelf.
- **New shelf views**: Stock cover, vs Budget and Forecast (next 7 days), alongside Status, Sales, WoW, Margin and Waste.
- **Delivery drivers** (Uber Eats / On-Demand) come in at the store's delivery share and collect at the counter.
- **Live POS (optional, private)**: `python -m shelly live path/to/till_export.csv --watch 60` writes `docs/data/live.json` (git-ignored, never published); open `store/?live=1` and the shopper rate and Improve tab follow today's real hourly trade.
- **Linked both ways**: every action in the store app has a "🗺 On the floor" link (`store/#cat=<category>&m=<view>`, `store/#fx-<shelf>`).

## What's new in v1.4: Store Floor v3, the store in 3D with the team at work
- **[Store Floor](https://pavi44m.github.io/Agent-Shelly-0.3/store/)** ([`modules/store-floor`](modules/store-floor/)): the Neighbourhood store built in 3D from the printed store plan (1 px = 2 cm): back-wall chillers, produce walls and islands, five grocery aisles, the beer and wine corner, freezer doors, grab & go, hot food, specials and checkout. **Overview** orbits the floor; **Walk** puts you at eye height with a joystick or W A S D.
- **This week's numbers on every shelf.** `shelly/storefloor.py` places each SKU on its fixture (by SKU, then by category; anything that fits nowhere is listed, never dropped) and rolls up 7-day sales, change on last week, margin, waste, lowest stock cover and count variance. Shelves turn **red** (act today: recall, likely stock-out, shrinkage, waste blow-out, under a day of cover), **amber** (watch) or **green**; colour by sales, change, margin or waste instead; gaps on a shelf mean low cover. Tap a shelf for its products, reasons, 14-day trend, report links and the decisions waiting for sign-off (approve from the shelf, same queue as everywhere else).
- **v3: the store team at work.** A trading-day simulation driven by one config block (`operations` in `planogram.yaml`): open 7am–9pm every day; morning shift from 6am and evening shift from 1:30pm, 8 hours each; breaks of 10 min after 2h, 30 min lunch after 4h and 10 min after 6h, staggered so the till is never left empty; deliveries on Tuesday, Thursday and Saturday (unload at the dock, put away in the storeroom, then top up the shelves on the order). The **Duty Manager** works and directs: hands out jobs in person or by 📻 radio, finds cover for the till at break time, walks the floor. Jobs come from Shelly's data (recall pulls, stock-out checks, re-counts, markdowns, top-ups before the after-5pm rush). **Customers** arrive all day from average sales ÷ basket, busiest after 5pm: they browse, say so when a shelf is empty, queue, pay and leave.
- **Checkouts, café and kitchen**: 4 self-checkouts with no staff (a team member or the Duty Manager comes over for alcohol ID checks and scan problems), a main checkout and a separate café till, each with its own person. A cook works every morning shift in the kitchen (baking, hot food to the café cabinet, sandwiches and salads for Grab & Go); in the afternoon one café hand runs the café till until it closes at 4pm, closes the café and kitchen, then tops up and faces up fruit and veg until 9pm.
- **Trolleys and hand baskets**: a few trolleys at the door and a basket stack; customers take either (or neither). Trolleys get left in the car park and baskets pile up at the checkouts, so the team brings them back when they run low.
- **Back of house**: kitchen, storeroom racking, walk-in chiller, manager's office and desk, staff room, restrooms and the receiving dock; people find their way with A* pathfinding on a 25 cm grid.
- **HQ-style panels**: clock with day picker, speeds (1×–180×), jump to 6am / midday / 5pm rush / close / NZ now; **Tasks** (scheduled · waiting · in progress · done, with progress bars), **Team** (who is on, on break, on the till, breaks taken), **Day** (roster bars with breaks, footfall curve, delivery marker, live log).
- `python -m shelly store` prints the same walk-through, worst shelves first. Rebuilt with the site every week (`scripts/build_store.py`).

## What's new in v1.3: Shelly HQ v2, eight departments with heads, approval chains
- **One company, eight departments** that serve every business (store, Tōtara, Group, and any future business): **Management Team** (with Pavi as Managing Director), **Finance** (funds control, payroll, cash), **Sales**, **Inventory**, **Office Manager** (decides shifts and rosters for every business), **HR** (minimum level), **IT** and **Developers**. 43 agents; each department has a head agent and the person accountable, with a spending limit and a monthly budget.
- **Approval chains, department by department:** every request goes first to its own department head; over that head's limit (or any budget, markdown or write-off) Finance does a funds check; over Finance's $10k limit, new-business funding, hiring, policy, pricing, credit and customer terms go to Pavi. Payroll runs Office Manager (confirm shifts) → Finance (approve pay run). The tray and every page show the steps (✓ Inventory Manager › ● Finance Manager › ○ Pavi) and approve "as" the current signer.
- **Shelly HQ v2** (Brain page): a 3D campus with eight department islands around the brain plaza, live cards (agents, doing / next / done, waiting approvals), shirts coloured by the business each agent serves, paper hand-offs and gold sheets flying when an approval moves to the next signer. Tap a department to go in: desks get labels and the left panel becomes its **head**, whom you can ask for status, issues, what's waiting, what's next and budget.
- **Task status** for the whole office or one department (scheduled · backlog · in progress · waiting · done), and a composer that routes a new task to the best agent in a department; add a spend and it joins the right approval chain.
- **Calendar** of every routine (daily, weekdays, weekly, monthly) by department; **Funds** board (budget, spent, approved, pending, left per department); **Opportunities** pipeline for future businesses with scoring and funding requests (Chief of Staff › Finance › Pavi). A funded new business is added with one line in `shelly/brain/registry.py`.
- The orchestrator now knows the new departments ("run payroll", "who is working tomorrow", "should we open a new business").

## What's new in v1.2: Shelly Brain, the Shelly mascot and one approvals inbox
- **Shelly Brain** ([docs/brain](docs/brain/)): an operating map of the AI system, in the style of an "AI brain" consultancy build. 24 agents across 19 departments and 3 businesses (Neighbourhood store, Tōtara Medical, Shelly Group), around 8 core modules (orchestrator, memory, governance, knowledge, learning, reporting, voice, connectors). Each agent card shows its mission, skills, inputs, outputs, triggers, schedule, autonomy level (auto / suggest / approve), guardrails, when it escalates, who it hands off to, its human owner and live KPIs.
- **Shelly HQ** (a 3D office view on the Brain page, with the map as a second tab): one floor per business and one desk per agent. Desk screens show each agent's live numbers; ⚠ marks work waiting for you, 💡 a suggestion, a glow an agent working on its own; paper hand-offs fly between desks; data-source tiles (POS, Excel, Power BI, ERP, Medsafe, news, email) link to the agents that read them, and speech bubbles show real events. Drag to turn, zoom, tap an agent to open its details and approve. Built with three.js (vendored, MIT).
- **Ask the brain**: type a question and the orchestrator shows which department agent takes it, and whether it may act alone or needs your approval. Same logic in Python: `python -m shelly brain ask "what do I need to order?"`.
- **Shelly the mascot** on every page (store, Launchpad, Tōtara, Brain, reports): a light bulb rendered in real 3D with three.js: refracting glass, a glowing coiled filament on support wires, a threaded chrome base, a soft halo and an inner light, supersampled for crisp edges on high-DPI screens. Her face is drawn live on the glass: eyes follow your cursor and blink, and she turns toward you. Her light shows status: warm glow normally, amber pulse when approvals are waiting, a bright flash when you answer one, flicker when dizzy, and the light goes off when she falls asleep. Slow devices drop resolution automatically and fall back to a 2D version of the same character.
- **Shelly reacts** (spring physics, inspired by the Coucou notch mascot; own code and sounds): she breathes, peeks out and waves when you hover, squishes when tapped, gets dizzy on a fast triple-click, does a happy jump when you answer an approval and an alert hop when a new one arrives, gets sleepy and tucks down after a minute idle, and "eats" a file dropped on her (the file is never read on the public site; she tells you the command to load it on your PC). Her face changes with each reaction (wink, squint, spiral eyes, big grin, sleepy) and emotes pop above her head; optional synthesized sounds (off by default, toggle in her bubble).
- **Approvals badge and tray**: one inbox for every decision Shelly will not take alone (store decision log, Tōtara escalations, industry packs). Approve or reject from any page; the answer syncs to the page that owns it.
- Brain data is rebuilt with the site (`scripts/build_brain.py` → `docs/data/brain.js`, `docs/data/approvals.js`).

## What's new: Launchpad and the medical supply-chain module

- **[Launchpad](https://pavi44m.github.io/Agent-Shelly-0.3/launchpad/)**: one page that opens every part of Shelly (retail agent, supply chain, reports, industry packs, decisions, TD Report, skills), each card with a live figure. Rebuilt by `scripts/build_site.py` every week.
- **[Tōtara Medical Supply Chain Command](https://pavi44m.github.io/Agent-Shelly-0.3/supply-chain/)** for a New Zealand importer of medicines, medical consumables and equipment ([`modules/medical-supply-chain`](modules/medical-supply-chain/)): a zoomable supplier → product → client **vision board** where every circle's dot ring shows the last 12 weeks of sales vs plan (or last 12 deliveries for suppliers); zoom in and circles become radial widgets, tap any circle or line for a landing widget with weekly plan vs actual, stock, OTIF and connections. Plus stock-out and reorder points, FEFO expiry risk, inbound shipments with Medsafe/WAND holds, supplier scorecard, SARIMA-X forecasts and client segments (hospitals, medical centres, sports and high-injury industries).
- New **medical** pack skills: `medical.supply_chain` (stock-out, expiry and clearance escalations wait for your confirmation) and `medical.brief`. Shelly's relevance check now accepts supply-chain questions that mention "medical" while still sending medical *advice* questions elsewhere.
- Synthetic data only; its shape is based on how NZ medical-import distributors work.

## What's new in v1.1 (big jump: reports that do the work)

- **Ask for any report in plain words.** "Make a budget for the next 3 months", "13-week forecast for Dairy", "stock report for Beverages in Excel", "roster plan PDF". Shelly works out the report, the time frame and the category, says so when it rounds (5 months → 6-month plan), and is honest when it can't build something.
- **11 report types**: budget & forecast plan (1/3/6/12 months), 13-week forecast (4/8/13 weeks), weekly trading, category review, roster & labour, stock & reorder, waste & shrink, and four industry packs (consumer electronics, wholesale, warehousing, production). Whole store or any category: 137 ready-made report views.
- **Excel workbooks built like an analyst would**: Dashboard (Category dropdown, KPI tiles, charts) · Model (live SUMIFS / INDEX-MATCH / EDATE formulas, nothing typed in) · Pivot (real Excel PivotTables) · Raw (Excel Table) · Lookup · Assumptions (blue inputs: change one and everything recalculates) · Notes (method, data dictionary, sign-off). Formulas carry cached values, so phone previews show numbers too. Zero formula errors, checked on every build.
- **PDF in the Shelly look**: the report page prints in white for paper, in the dark Shelly theme, or as a presentation (one section per screen, arrow keys). `python -m shelly report all --pdf` writes PDFs directly.
- **Planning forecasts with honest ranges**: last year's same period × recent trend, backtested (months and weeks); the 80% range comes from real backtest errors. Budgets flag calendar shifts and months whose "last year" isn't finished.
- **Ready for real data**: CSV/Excel exports (POS, SAP, ERP, accounting; one file or many), SQL databases (read-only SELECTs, credentials from environment variables), automatic column matching with confidence scores, and a data check report (`python -m shelly check --data folder`).
- **Claude/Ollama connection test** in Settings, and a clear reason when the AI engine can't be reached.

## What's new in v0.3.2

- **Self-launching daily briefing**: when the page opens, Shelly greets you by time of day ("Good morning, Pavi") and reads today's briefing aloud: date and time, week sales vs last week and budget, any recall, today's P1 actions and decisions waiting for you. Browsers only allow sound after a first touch, so Shelly tries straight away and otherwise plays on the first tap (with a "Tap to hear" button).
- **Your name, your way**: Settings → You & your day: Pavi, Sir, Ma'am or your own name; briefing every open, first open of the day, or off.
- **Sign-off**: say "done for the day", "good night", "bye" or tap 🌙 Done. Shelly sums up the actions you ticked and decisions still open, then says goodbye to suit the time ("Have a lovely day, Pavi" / "Have a lovely evening, Pavi, and good night").

## What's new in v0.3.1
- **Security hardening.** Content Security Policy on every page, API keys kept for the session only by default, one-click "Clear my data", input limits and LLM rate limits, SQL-identifier validation (raw SQL off by default), no path traversal, HTTPS-only connectors, schema-checked decision imports, Dependabot and [SECURITY.md](SECURITY.md). Every control has a test in `tests/test_security_router.py`.
- **Voices across regions.** 27 regions and languages for speech input and voice: English (NZ, AU, UK, US, IE, CA, IN, ZA, SG, PH), Te reo Māori, Sinhala, Tamil, Hindi, Chinese, Japanese, Korean, Indonesian, Vietnamese, Thai, Filipino, Spanish, French, German, Portuguese and Arabic. Shelly picks the closest installed voice and says so if your device lacks one. Speed, pitch and a test button are included. Answers come in the chosen language when using Claude or Ollama.
- **Relevance check and connected agents.** Every typed or spoken question is checked against Shelly's skills. In scope, the answer shows which skill produced it. Out of scope (travel, email/calendar, writing, coding, investment/medical/legal advice, weather), Shelly explains and tells you which agent to connect in ⚙ Settings → Connected agents (Claude API, Ollama, or OpenJarvis / any OpenAI-compatible local server). It only sends the question after you tap **Send**. Same check on the CLI: `python -m shelly ask "…"`.
- **Depth on demand.** Every dashboard section has a "What is this?" note, plus [16 in-depth guide pages](https://pavi44m.github.io/Agent-Shelly-0.3/guide/) covering what each part shows, how it works, the formulas, how to read it, limits and example questions.
- **TD Report runs unattended.** The scheduled task now carries standing pre-approval for its narrow set of actions: research, the Shelly Drive folder, reading your replies, and emailing only you.

## What's new in v0.3: Shelly Core
- **Every capability is a skill** (21 skills across 5 packs). `python -m shelly skills export` writes an agentskills.io `SKILL.md` for each one, so OpenJarvis or any LLM planner can call them.
- **Industry packs** beyond convenience retail: **consumer electronics** (sell-through, weeks of cover, aged-stock markdowns with a below-cost check, price erosion, attach rate), **wholesale** (customer profitability after cost-to-serve, debtor ageing and DSO, fill rate and OTIF), **warehousing** (ABC-XYZ slotting, pick productivity, capacity runway) and **production** (OEE, scrap cost, schedule adherence).
- **Decision log: you stay in charge.** Big-money, compliance, price, range, credit and markdown judgements are *proposed*, not acted on. They wait as `pending` until you confirm or reject them (CLI, or buttons in the web app plus import). Every event goes into an append-only audit trail.
- **Learning loop.** Shelly tracks how often you confirm each kind of alert (Beta precision) and tunes its own thresholds, within safe bounds and only after 5+ answers. It also tracks its forecast error over time to catch model drift. Every change is logged with its reason.
- **Validation reports** for every run (`reports/<run>/run_report.md`): SHA-256 of each input file, config hash, automated PASS/WARN/FAIL checks (freshness, data quality, beats the baseline, recalls blocked, P&L reconciles, cluster stability), models, decisions and what Shelly learned.
- **Connectors** you can extend: folder/Excel, SQLite, any SQL database, Google Sheets (published CSV), REST/JSON, SMTP email, plus live Gmail, Drive, Calendar, Indeed and web news through Shelly's Claude scheduled tasks. Drop a new connector into `shelly/connectors_ext/` and it's auto-discovered.
- **Daily TD Report.** A Technology & Data newsletter at 6:15am NZ time covering retail and grocery, consumer electronics, wholesale/warehousing/production, AI and data, markets (information only) and matching jobs. Every item is confirmed by 2+ sources or an official source, and it learns from your 👍/👎 replies.

```mermaid
flowchart LR
  subgraph Sources
    A[POS / SAP exports] --- B[Warehouse / ERP / Sheets] --- C[Gmail · Drive · Calendar · Indeed · News]
  end
  Sources --> K[Connectors]
  K --> S[Skills<br/>retail · electronics · wholesale<br/>warehousing · production]
  S --> J{Major judgement?}
  J -- no --> R[Reports · dashboard · WhatsApp · TD Report]
  J -- yes --> D[Decision log<br/>pending → you confirm / reject]
  D --> L[Learning loop<br/>tunes thresholds, tracks model drift]
  L --> S
  D --> R
  R --> V[Validation report<br/>hashes · checks · audit trail]
```

## Everyday commands
```bash
python -m shelly run                         # weekly retail run + decisions + learning + validation report
python -m shelly decisions                   # what's waiting for you
python -m shelly decisions confirm D-1a2b3c4d --note "done"
python -m shelly decisions reject  D-1a2b3c4d --note "false alarm: promo week"
python -m shelly decisions import shelly-decisions.json    # answers exported from the web app
python -m shelly pack electronics            # or wholesale | warehousing | production
python -m shelly learn                       # what Shelly has learned
python -m shelly skills [export]             # list skills / write SKILL.md files
python -m shelly connectors                  # connector health
python -m shelly ask "book me a flight"      # relevance check: skill, or which agent to connect
python -m shelly check --data path/to/exports              # real data: what was found, how columns were matched
python -m shelly report all --data path/to/exports --pdf   # every report: Excel + report page + PDFs in outputs/reports
python -m shelly report budget --months 6 --category Dairy --pdf --theme light,present
```

## What's new in v0.2
- **Ask Shelly.** A chat on the landing page, like talking to Claude. Ask about sales, margin, budget, today's actions, reordering, shrinkage, waste, delivery, forecasts, rostering, segments, models, **any category or any product**. Answers come from the week's computed results, so Shelly never invents a number.
- **Voice.** 🎙 ask by voice (Chrome, Edge, Safari), 🔊 spoken replies, and **▶ Briefing** reads the week's summary and today's priorities aloud. You can pick the voice and speed in ⚙ Settings.
- **Loading sequence** that shows the pipeline running (rows loaded, data-quality score, models backtested, exceptions found).
- **Interactive dashboard.** Hover tooltips on every chart, a tickable action plan that remembers progress, sortable and searchable tables, what-if sliders, and a segment explorer. Tap any number, bar or row to ask Shelly about it.
- **Optional LLM.** Switch the answer engine in ⚙ Settings to **Ollama** (local, private) or the **Claude API** (your key, stored only in your browser). It only receives computed facts, and falls back to the built-in engine if unreachable.
- **Auto-update.** A GitHub Action reruns Shelly every Monday at ~7am NZ time and republishes the site.
- Styled to match [my portfolio](https://pavi44m.github.io/pavibamunu/).

**Shelly** is an analytics agent. Its retail pack reads a convenience store's sales, stock and waste exports and writes the owner's weekly digest. Every Monday it answers three questions: **what happened, what's wrong, and what to do about it today**, with a dollar figure against each action.

It's built as a full **CRISP-DM** pipeline. The forecasting and segmentation methods are the ones from my Master of Applied Business research (SARIMA-X, XGBoost and K-means). The rules come from running a Four Square store day to day: recalls, SAP count variances, Uber Eats outages and short-life waste.

> The demo data is **100% synthetic** (`scripts/generate_sample_data.py`). No employer data is used or published.

---

## What it produces

| Output | For whom |
|---|---|
| `digest_<date>.html` | Owner: dashboard with KPI tiles, action plan, charts, exceptions, reorder list, roster, segments and model evaluation |
| `whatsapp_<date>.txt` | Team: 6-line summary of today's priorities |
| `Weekly_Sales_Digest_<date>.xlsx` | Analyst: category P&L with live formulas, what-if scenario model, pivot-ready tables, SQL results |
| `warehouse.db` + `sql/*.sql` | Analyst: SQLite star schema and KPI queries |
| `powerbi/` | BI: star schema (fact/dim CSVs) and `measures.dax` |
| `tableau/` | BI: tidy extracts ready for a Tableau workbook |
| `actions_<date>.json` | Other agents: machine-readable actions (OpenJarvis skill) |

## CRISP-DM pipeline

```mermaid
flowchart LR
  A[1 Business understanding<br/>config.yaml: objectives, KPI targets] --> B[2 Data understanding<br/>quality score, duplicates, refunds, gaps]
  B --> C[3 Data preparation<br/>column mapping, cleaning, daily panels]
  C --> D[4 Modelling<br/>5 forecast models · anomaly detection<br/>K-means + PCA · JIT reorder · labour]
  D --> E[5 Evaluation<br/>rolling-origin WAPE/MAPE · silhouette<br/>bootstrap Jaccard · R cross-check]
  E --> F[6 Deployment<br/>HTML · WhatsApp · Excel · SQL · Power BI · Tableau]
  F -. next week .-> A
```

## Skills from my CV and where they live in the code

| CV skill | Implementation |
|---|---|
| **Python (pandas, scikit-learn)** | Whole pipeline in `shelly/` |
| **Demand forecasting: SARIMA-X, XGBoost** | `forecasting.py`: SARIMA-X (weekly seasonal, NZ holiday exog) and a global XGBoost with lag features, competing with Naive, Seasonal Naive and Drift baselines |
| **Customer / product segmentation (K-means)** | `insights.segmentation`: K-means + PCA, k picked by silhouette, **bootstrap Jaccard stability** (100 resamples) |
| **R** | `r/validate.R`: independent re-run: silhouette, **gap statistic**, **MANOVA**, and a SARIMA backtest via `stats::arima` |
| **SQL** | `sql/*.sql` run against `warehouse.db` (window functions, CTEs, conditional aggregation) |
| **Power BI (DAX, data modelling)** | `exports.export_powerbi`: star schema + 20+ DAX measures (WoW, YoY, budget, ABC class, rolling 7-day) |
| **Tableau** | `exports.export_tableau`: denormalised extract with segments and forecasts |
| **Advanced Excel (PivotTables, lookups, scenario modelling)** | `exports.export_excel`: Excel Tables, live P&L formulas, what-if model (price elasticity, waste reduction, outage recovery) |
| **Variance and trend analysis** | WoW / YoY / vs budget by category, **price-volume-mix bridge** |
| **Category P&L, KPI design, budget target setting** | `insights.commercial`: category P&L to contribution; budget = LY × (1 + growth) |
| **Range and assortment planning** | `insights.assortment`: ABC/Pareto × segment → delist / protect / review |
| **Capacity and workload planning, rostering** | `insights.labour_plan`: forecast sales ÷ sales-per-labour-hour, with minimum cover |
| **Inventory & stock control, SAP store operations** | SAP vs physical count variance (shrinkage vs receiving/GR errors) |
| **JIT replenishment** (Orel inventory system) | `insights.replenishment`: reorder point, safety stock (z × σ × √(L+R)), shelf-life cap |
| **GS1 compliance and product recall** | GTIN mod-10 check-digit validation; recall notices matched by GTIN; recalled lines blocked from reorder |
| **Liquor licensing compliance** | Flags liquor sold via delivery for ID-verification spot checks |
| **Data quality and integrity** | `data.profile_quality`: scored report (duplicates, refunds keyed as sales, missing values, calendar gaps, orphan SKUs) |
| **Data integration and vendor mapping** | `config.yaml > column_map` maps any POS/SAP export headers to the standard schema |
| **Translating statistics for non-technical audiences** | `strategist.py`: rules engine → prioritised, costed, owner-assigned actions; optional LLM summary |

## Findings on the demo data (what the evaluation shows)

- **Forecasting:** SARIMA-X (16.4% WAPE) and XGBoost (16.6%) both beat the seasonal-naive baseline (21.6%). The agent still picks the winner per category, and XGBoost wins 4 of the 11 (including Dairy and Food To Go). In my thesis the simple baseline won (3.75% vs 5.03% MAPE). The pipeline is built to accept either outcome.
- **R cross-check:** R reproduces the Python backtest almost exactly (SARIMA 16.42% vs 16.40%, seasonal naive 21.63% vs 21.63%).
- **Segmentation:** silhouette picks k=5, but the scores are low (≈0.28). The **gap statistic suggests k=2**, and two clusters have Jaccard stability below 0.6. The digest labels those clusters "Unstable" instead of overselling them. MANOVA confirms the segments differ (Pillai p < 0.001).
- **Exceptions found:** everything that was deliberately injected into the demo data: a 2-day Uber Eats outage, a milk stock-out, shrinkage on chocolate and RTDs, a sandwich waste blow-out, a sushi decline, an unbooked Salsa case, a supplier recall and two broken GTINs.

## Talk to Shelly with a local LLM (optional)
```bash
ollama pull qwen2.5:7b
OLLAMA_ORIGINS="https://pavi44m.github.io" ollama serve   # allow the site to call your local model
```
Then in the site: ⚙ Settings → Ollama. The built-in engine needs no setup.

## Run it

```bash
pip install -r requirements.txt
python scripts/generate_sample_data.py          # synthetic 2-year dataset
python -m shelly.agent --data data/sample # ~35 s
python -m pytest -q                             # 9 tests
python scripts/build_site.py                    # rerun Shelly and refresh the website in docs/
Rscript r/validate.R outputs                    # optional R cross-validation
```

### With an LLM summary
```bash
ollama pull qwen2.5:7b
python -m shelly.agent --data data/sample --llm ollama     # local, private
ANTHROPIC_API_KEY=... python -m shelly.agent --llm anthropic
```
The LLM only receives computed facts (KPIs + actions), never raw rows. If it's unreachable, the digest falls back to the rules engine.

### On real exports
1. Drop `sales`, `products` (and optionally `inventory`, `waste`, `recalls`) as CSV or Excel into `data/real/`. That folder is git-ignored.
2. Map your column headers in `config.yaml > column_map`.
3. Set your KPI targets, labour rate and lead times in `config.yaml`.
4. `python -m shelly.agent --data data/real`

⚠️ Check your employment agreement and data policies before running it on real store data. Never commit real data.

## Use it inside OpenJarvis
Copy `skills/shelly/` into your OpenJarvis skills folder (it follows the agentskills.io `SKILL.md` format). An OpenJarvis agent can then run the digest on request, or on a Monday-morning schedule with the `scheduled-monitor` preset, and read `actions_<date>.json`.

## Project layout
```
shelly/
  agent.py        orchestrator (CRISP-DM phases, CLI)
  data.py         phase 2-3: load, map, quality-score, prepare
  forecasting.py  phase 4-5: 5 models + rolling-origin backtest
  insights.py     commercial, anomalies, segmentation, range, JIT, labour, compliance
  strategist.py   prioritised actions + optional LLM summary
  report.py       HTML digest, Markdown, WhatsApp
  webexport.py    facts bundle for the web app (docs/data/shelly-data.js)
  exports.py      SQLite + SQL, Power BI, Tableau, Excel
docs/             the website: index.html, app.js (chat + voice + charts), app.css
sql/              KPI queries        r/validate.R   R cross-validation
skills/           OpenJarvis skill   tests/         pytest suite
```

## Author
**Pavithra Maduranga Bamunu**, Commercial & Business Analyst, Auckland.
MAppBus (Business Analytics, First Class Honours) · [LinkedIn](https://linkedin.com/in/pavithra-maduranga-19624675) · [Portfolio](https://pavi44m.github.io/pavibamunu)

## Versions
- **v1.3**: eight company-wide departments with heads, approval chains (head → Finance → Pavi), Shelly HQ v2 (campus, head chat, tasks, calendar, funds, opportunities)
- **v1.2**: Shelly Brain (24 agents, 19 departments, orchestrator), light-bulb Shelly mascot, shared approvals badge and tray
- **v1.1**: report engine (Excel with dashboard, formulas, pivots, lookups, raw; PDF and presentation), planning forecasts, real-data intake
- **v0.3.2**: spoken daily briefing on open, time-aware greeting by name, sign-off
- **v0.3.1**: security hardening, 27 voice regions/languages, relevance router with connected agents, section notes and 16 guide pages, unattended TD Report
- **v0.3**: skills registry, industry packs (electronics, wholesale, warehousing, production), decision log with confirmations, learning loop, validation reports, extensible connectors, daily TD Report
- **v0.2**: conversational web app, voice in/out, interactive dashboard, optional LLM, weekly auto-update
- **v0.1**: CRISP-DM pipeline, forecasting, exceptions, digest, Excel/SQL/Power BI/Tableau outputs

## Roadmap
- **v0.4: program & portfolio management.** A register for future business projects (like the Catchment study) with budgets, resources, milestones, a RAID log, stage gates and weekly status reports, all run through the decision log.
- **v0.5: finance hub.** Income, costs and cash flow tracking, business-idea scoring (market size, margin, payback, risk) and reinvestment scenarios. Shelly analyses; you decide. No automated trading and no financial advice.
- Hourly POS data → hour-level rostering and liquor trading-hours checks
- Weather feed as a SARIMA-X / XGBoost regressor (ice cream, drinks, soup)
- Promo-effectiveness model (uplift vs cannibalisation)
- Upload your own CSV in the browser and get a digest (fully client-side)
- Multi-week memory: "how does this compare to last month?"
- Scheduled email/WhatsApp send of the briefing
