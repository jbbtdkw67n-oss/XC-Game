# Automated test suite

End-to-end tests that drive the real game in headless Chromium via Playwright.

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
```

Each script prints `PASS` or `FAIL` with details and exits non-zero on failure.

If your Playwright install doesn't bundle a browser, point the suite at any
Chromium binary: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome node tests/...`.
