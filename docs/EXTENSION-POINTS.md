# Extension Points — groundwork for the roadmap

The October 2026 code review ([`CODE-REVIEW-2026-10.md`](CODE-REVIEW-2026-10.md))
lists features and optimizations for later. This page covers the plumbing that
shipped first, so those features can be built without touching the save format
or the weekly loop again.

This plumbing shipped first and is now wired into the game (v14.4): the ⚙️
Settings screen edits the settings and the engine reads every difficulty slider,
the 📥 Inbox screen renders the inbox, and the ⏩ Sim to… menu calls the sim
runner. At default settings a dynasty plays exactly as before.
`tests/test-groundwork.js` covers the plumbing and `tests/test-roadmap-features.js`
the features built on it.

| Module | Global | Feeds these roadmap items |
|---|---|---|
| `js/engine/settings.js` | `XCD.engine.Settings` | Difficulty sliders, light theme, text size |
| `js/engine/events.js` | `XCD.engine.Events`, `XCD.engine.Inbox` | Inbox, sim stop conditions, achievements, media moments |
| `js/engine/sim.js` | `XCD.engine.Sim` | Sim to a date/event |
| `js/engine/savemanager.js` (index) | — | Fast Load screen; split-record saves |
| `scripts/run-tests.js` | `npm test` | Every future change |

---

## Settings (`gameState.settings`)

The schema lives in `Settings.SCHEMA`: each entry has a key, type (`slider` / `flag` /
`choice`), range and default. Values are validated on load (`Settings.ensure`), so
hand-edited or newer saves can't push a slider out of range.

```js
const S = XCD.engine.Settings;
S.get(game, 'theme');            // 'dark'
S.mult(game, 'injuryRate');      // 1 (sliders are multipliers; 1 = today's balance)
S.set(game, 'injuryRate', 1.5);  // clamped + snapped to the slider step
S.isDefault(game);               // false
```

Every difficulty slider is wired. At the default of 1.0 the result is identical
to before:

| Setting | Where the engine reads it |
|---|---|
| `injuryRate` | scales the whole injury chance in `rollInjury` (`js/engine/training.js`); 0 = no injuries. The roll is always drawn so the RNG stream is unchanged |
| `hotSeatPatience` | divides the player's hot-seat gain and podium pressure, and sets the firing clock via `Settings.hotSeatLimit` (2–6 seasons) in `coachFirings` (`js/engine/awards.js`) |
| `recruitingCompetition` | CPU staffs' weekly recruiting points in `makeEcon` (`js/engine/recruiting.js`) |
| `cpuDevelopment` | CPU athletes' weekly dev points (`processAthlete`) and summer growth (`offseasonDevelopment`) in `js/engine/training.js` |
| `prestigeVolatility` | the yearly `delta` (and its clamp) in `Prestige.yearlyUpdate` (`js/engine/prestige.js`) |

`Settings.PRESETS` (rookie / normal / veteran / legend) and `Settings.applyPreset`
/ `currentPreset` drive the preset buttons. Display settings are applied by
`UI.applyDisplaySettings` (`data-theme` on `<html>`, `--ui-zoom` for text size).

**To add a setting**, append to `SCHEMA`. Old saves pick up the default automatically.
The settings screen (`js/ui/screens/settings.js`) renders straight from `SCHEMA`.

## Events and the Inbox

`Events.emit(game, type, payload)` records a typed event in `game.eventLog` (the
last 200, saved) and notifies subscribers. A subscriber that throws can never
break a simulated week.

```js
const off = XCD.engine.Events.on('race:completed', (game, evt) => { /* … */ });
XCD.engine.Events.on('*', (game, evt) => { /* every event */ });
const mark = XCD.engine.Events.mark(game);   // bookmark…
game.advanceWeek();
XCD.engine.Events.since(game, mark);         // …everything since
```

Events emitted today:

| Type | Payload | Emitted from |
|---|---|---|
| `week:advanced` | `year, week` (the new week) | end of `GameState.advanceWeek` |
| `season:started` | `year` | rollover in `advanceWeek` |
| `race:completed` | `meetId, name, places {M, W}` | `advanceWeek`, for the player's meets |
| `athlete:injured` | `athleteId, name, weeks, injury` | `training.js`, player roster only |
| `recruit:committed` | `recruitId, name, stars, gender` | `recruiting.js`, commits to the player |
| `jobs:marketOpened` | `count, hot` | `Careers.generateOffers` |
| `career:hotSeat` | `year, of` | `Awards.coachFirings` (player) |
| `career:fired` | `schoolId` | `Awards.coachFirings` (player) |
| `staff:assistantLeft` | `name, school, kind` | `careers.js` (player's staff) |
| `recruit:decommitted` | `recruitId, name, stars, to` | `recruiting.js` (from the player) |
| `recruit:signingDay` | `offered` | `advanceWeek`, at the start of Signing Day week |
| `portal:opened` | `count, mine, mineCount` | `portal.js` |
| `nationals:selection` | `M, W` (bid status) | `races.js`, when the field is set |
| `jobs:newOpening` | `schoolId, name, division` | `Careers.evolveJobMarket` |

**To emit a new event**, call `Events.emit` next to the matching `logNews`. Keep
payloads small, plain and id-based: they are saved.

**The Inbox** (`game.inbox`, newest first, capped at 60) fills itself from events
through `Events.INBOX_RULES`. Each rule maps an event to
`{ priority 1–3, title, body, screen }`. Use `Inbox.items / unread / markRead /
markAllRead / push`. A future Inbox screen lists `Inbox.items(game)` and navigates
to `item.screen` (`'screen'`, `'screen:tab'`, or `'jobs'` for the Available Jobs
picker). The Inbox screen (`js/ui/screens/inbox.js`) adds live decisions from
`UI.inboxDecisions(game)` on top. A new season marks last season's items read.

**Achievements** would be an `Events.on('*')` subscriber that checks a catalog
against the event plus game state, the same shape as the empty `Store` catalog.

## Sim runner

```js
XCD.engine.Sim.advanceUntil(game, 'regionals', {
  beforeWeek: (g) => { /* satisfy the weekly flow, as Sim to Race does */ }
});
// → { weeks, reason: 'target' | 'event' | 'seasonSetup' | 'maxWeeks', events }
```

- Targets: `nextRace`, `conference`, `regionals`, `nationals`, `offseason`,
  `signingDay`, `nextSeason`, or a week number. The sim stops at the **start** of the
  target week, so the player still makes that week's call (lineup, signing).
- It never runs past a new season's Week 1 (the setup checklist) unless the target
  is `nextSeason`.
- Stop conditions: pass `stopOn: ['type', …]`. If you leave it out,
  `Sim.defaultStopWhen` applies: a 4+ week injury on your roster, the job market
  opening, or a firing. Short injuries happen about once a week and don't interrupt.

**The menu** (`js/ui/simmenu.js`) lists `Sim.TARGETS` with `Sim.describeTarget`
(week, weeks away, or why it's unavailable) and calls `UI.simTo(game, target)`, which
runs `advanceUntil`, autosaves, and shows the Sim Report. The ⏩ Sim to Race button is
`UI.simTo(game, 'nextRace', { runRace: true })`: it stops only for the job market or a
firing. Default stops now also include `staff:assistantLeft`.

## Save index

Every save writes a small `meta:<slotId>` record (the save browser's columns) in the
same IndexedDB transaction as the full record. `listSlots()` reads only those
records and the store's keys. With several large dynasties, opening Load or the
main menu no longer deserializes every world. `deleteDynasty` and `renameDynasty`
find a dynasty's records by key instead of a full scan. Saves from older builds
have no index record. The first listing falls back to the old full scan once and
backfills the index.

**Split-record saves** (roadmap §3.2) can extend this: write `world.athletes`,
`history`, `season` and so on under their own keys, listed in the meta record. Only
the parts that changed get rewritten, and `load()` reassembles them.

## Test runner

```bash
npm test                     # all tests except the two long soak runs, 2 at a time
npm run test:soak            # everything, including the 40- and 100-season runs
npm test -- --jobs 4         # more parallelism
npm test -- phase1 groundwork   # only tests whose name matches
```

Logs land in `tests/.logs/<name>.log` (git-ignored).
