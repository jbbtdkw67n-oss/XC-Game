# Automated test suite (Update 1)

End-to-end tests that drive the real game in headless Chromium via Playwright.

```bash
npm i -g playwright   # or: npm i playwright (and ensure a chromium is installed)
node tests/test-phase1.js      # season structure, rollover→dashboard, conference filter
node tests/test-phase23.js     # weekly planner, 6 core attributes, development balance
node tests/test-phase4.js      # dynamic race engine: passing, kicks, fades, events
node tests/test-phase5.js      # coach creation, 4 ratings, archetypes, upgrade points
node tests/test-phase6to9.js   # facilities, 14/14 rosters + walk-ons, individual qualifiers, weekly flow
node tests/test-20seasons.js   # 20-season stress sim + balance + full UI sweep + save/load
```

Each script prints `PASS` or `FAIL` with details and exits non-zero on failure.
