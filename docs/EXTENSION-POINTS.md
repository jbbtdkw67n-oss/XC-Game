# Extension Points — groundwork for the roadmap

The October 2026 code review ([`CODE-REVIEW-2026-10.md`](CODE-REVIEW-2026-10.md))
lists features and optimizations for later. This page covers the plumbing that
shipped first, so those features can be built without touching the save format
or the weekly loop again.

Everything here is **behavior-neutral**: settings default to "no change", nothing
renders the Inbox yet, and no button calls the sim runner. A dynasty plays exactly
as before. `tests/test-groundwork.js` covers every piece.

| Module | Global | Feeds these roadmap items |
|---|---|---|
| `js/engine/settings.js` | `XCD.engine.Settings` | Difficulty sliders, God Mode, light theme, text size |
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
S.get(game, 'godMode');          // false
S.mult(game, 'injuryRate');      // 1 (sliders are multipliers; 1 = today's balance)
S.set(game, 'injuryRate', 1.5);  // clamped + snapped to the slider step
S.isDefault(game);               // false
```

**To wire a difficulty slider**, multiply the existing number at its hook point.
At the default of 1.0 the result is identical to today:

| Setting | Hook point |
|---|---|
| `injuryRate` | the injury chance in `rollInjury` (`js/engine/training.js`) |
| `hotSeatPatience` | divide the hot-seat gain and lengthen the podium streak in `coachFirings` (`js/engine/awards.js`) and `evaluate` (`js/engine/predictions.js`) |
| `recruitingCompetition` | CPU recruiting effort in `Recruiting.processWeek` (`js/engine/recruiting.js`) |
| `cpuDevelopment` | CPU athletes' dev points in `devPoints` (`js/engine/training.js`) |
| `prestigeVolatility` | the yearly `delta` in `Prestige.yearlyUpdate` (`js/engine/prestige.js`) |

**To add a setting**, append to `SCHEMA`. Old saves pick up the default automatically.
**A settings screen** can render straight from `SCHEMA`: `label`, `min`/`max`/`step`,
`options` and `group` (`difficulty` / `sandbox` / `display`) are all there.

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

**To emit a new event**, call `Events.emit` next to the matching `logNews`. Keep
payloads small, plain and id-based: they are saved.

**The Inbox** (`game.inbox`, newest first, capped at 60) fills itself from events
through `Events.INBOX_RULES`. Each rule maps an event to
`{ priority 1–3, title, body, screen }`. Use `Inbox.items / unread / markRead /
markAllRead / push`. A future Inbox screen lists `Inbox.items(game)` and navigates
to `item.screen`. A Dashboard badge is `Inbox.unread(game).length`.

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

**To build the menu**: a dropdown of `Sim.TARGETS` (each has a `label`). On select,
call `advanceUntil`, then autosave and `renderShell()` once. If `reason === 'event'`,
show `events[0]` (or open the Inbox). The ⏩ Sim to Race button could later become
`advanceUntil(game, 'nextRace')` plus one more advance to run the race.

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
