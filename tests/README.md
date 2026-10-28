# Automated test suite

End-to-end tests that drive the real game in headless Chromium via Playwright.

Run them all with `npm test` (2 at a time, the two long soak runs skipped),
`npm run test:soak` for everything, or `npm test -- <name-filter>`. Logs land in
`tests/.logs/`.

```bash
npm i -g playwright   # or: npm i playwright (and ensure a chromium is installed)
node tests/test-phase1.js      # season structure, rollover→dashboard, conference filter
node tests/test-phase23.js     # weekly planner, 6 core attributes, development balance
node tests/test-phase4.js      # dynamic race engine: passing, kicks, fades, events
node tests/test-phase5.js      # coach creation, 4 ratings, archetypes, upgrade points
node tests/test-phase6to9.js   # facilities, 14/14 rosters + walk-ons, individual qualifiers, weekly flow
node tests/test-update2.js     # Update 2: save migration, mileage/taper, reputation, divisions, ledgers
node tests/test-update3.js     # Update 3: filter stress, 3 divisions, Pre-Nationals, auto-recruit, rest/morale/mileage, 40-season stability
node tests/test-20seasons.js   # 20-season stress sim + balance + full UI sweep + save/load
node tests/test-update5.js     # Update 5: assistant-coach path + promotion, relationship attrs, seat status, altitude, blue-chip floor
node tests/test-update6.js     # Update 6: creation wizard, Legacy Dynasty Mode (retire → successor), coaching trees, training overhaul + periodization, CPU tiers, wave recruiting, staff management
node tests/test-injuries.js    # Injury System Expansion: layoff costs, Recovering return-to-form phase, career injury ledgers, major-injury toll on potential/growth, durability, UI, save round-trip
node tests/test-offseason.js   # Offseason progression report (Work Ethic driven, class curve, full before→after UI), Hot Seat reset on school change, either-program expectations
node tests/test-transferrisk.js # Transfer Desire levels, reasons/anchors reveal, Zero Morale Rule portal entries, stagnation/injury desire inputs, roster + profile UI
node tests/test-hspb.js        # HS 5K PBs: gender distributions, ability correlation + potential independence, state champions, NXN finishes, prep history through enrollment, UI, save round-trip
node tests/test-livescore.js   # Live team score projection: dynamic per-frame scoring from real splits, convergence to the official final, lock timing, player scoring panel, broadcast render
node tests/test-week1.js       # Week 1 admin phase: checklist gates Week 2, schedule finalization + Pre-Nationals lock, DI 14-athlete limit with player cuts + CPU trim, rollover reset
node tests/test-staff.js       # Assistant value (dev/chemistry/morale/recruiting/peaking wiring), free-agent pool, comparison panel + profiles, open job market (all chairs, Interest %, apply/reject flow, offseason-only)
node tests/test-facilities.js  # Five-facility overhaul: shape + old-save migration, rehab/indoor-track/training-center implications, success+size fundraising, panel UI
node tests/test-100seasons.js  # Century soak (~9 min): talent stability, health rates, staffing/roster/facility integrity, records, save size + round-trip
node tests/test-updatex.js     # Update X: 6,000-recruit classes, DIII "Offer Roster Spot" wording, mandatory signing for offered recruits, near-universal CPU signing coverage, Auto Recruiting real economy, intimate portal markets (2-4 suitors), CPU championship fitness
node tests/test-update11.js    # Update 11: recruit-to-need signing targets (quality over quantity — full coverage, ~3-5/gender, <15% of DI freshmen cut), quality-weighted class rankings (3 four-stars > 8 three-stars; top classes star-heavy), diamonds in the rough (perceived vs true potential, noisy scout notes), division-preference recruits, 2-4 suitor portal, summer transfer window (DI cuts → DII/DIII, weeks 1-3), carousel closes after accepting a job, transfer-in risk grace
node tests/test-update12.js    # Update 12 (Living History & Legacy): GOAT lists (top-40, weighted legacy scores, dynamic recalc), championship-team snapshots, legacy leaderboards (sortable + division/conference filters), clickable profiles everywhere (incl. graduated legends), program history archive/records/hall of fame, mileage +10/-10 quick sets, unpursued transfers, D1/D2 regional 10K + Pre-Nats 8K distance fix, save round-trip of new history
node tests/test-update13-features.js # Update 13 (Balance/Coach Progression/Training): Double Threshold workout, Sway action + gating, elite-coach recruit motivation, role-aware reputation tiers, Reset Ideal Training (phase-appropriate), Build-phase advice/eval alignment, facility decay + floor, Hot Seat 3-season firing, philosophy fatigue relief, mileage scaling M75/W60, GOAT division weighting
node tests/test-groundwork.js       # Groundwork: settings (neutral defaults, clamping, save round-trip), events + inbox, Sim.advanceUntil targets/stops, save index (fast listing, legacy backfill, rename, delete)
node tests/test-racecenter-speed.js # Race Center replay: 1×/2×/4× highlight matches the real playback rate (clock runs 2×/4× as fast), survives Replay + Men/Women switch
node tests/test-roadmap-features.js # Sim-to-date menu + report, pack stats, Kolas at-large + DI individual qualifying (4/regional, top 25, +2 at-large), Inbox, one-time job popup, settings presets/theme/text size, injuryRate 0, no God Mode
node tests/test-update21.js        # Inbox clear (one / filter / all), true 1 km splits, Pack Report w/o pack-in-field, sectioned menu, Week 1 card on top + gone when done, no Trophy Case / Coach's Desk, fixed course terrain + yearly weather + fast/slow courses, American Rivers Conference (DIII) incl. filters + save backfill
node tests/test-sw-precache.js     # Offline install: sw.js precaches every script/stylesheet index.html loads (no browser needed)
```

Each script prints `PASS` or `FAIL` with details and exits non-zero on failure.

If your Playwright install doesn't bundle a browser, point the suite at any
Chromium binary: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome node tests/...`.
