# Code Review, Optimization & Improvement Roadmap — October 2026

This review covers three things: the test failures that were present on `main`, a pass
over the code (hot paths, save system, UI flow), and a researched list of features
that other sim games in this genre rely on. Timings come from headless Chromium
(Playwright) on a 4-core cloud container. Phones will be slower, so read them as
ratios, not absolutes.

---

## 1. Test failures on `main` — root causes and fixes

| Test | Symptom | Root cause | Fix |
|---|---|---|---|
| `test-phase1`, `test-update12` | World/History screen vanished right after navigating; `#conf-filter` "destroyed" | **Real UI bug.** The Advance Week (and Sim to Race) handler `await`ed the autosave *before* redrawing. A rollover save is ~65 MB and takes long enough that, if the player opened another screen meanwhile, the late `renderShell()` yanked them back to the Dashboard/Race Center. | `js/ui/framework.js`: draw the new week (and the Available Jobs popup) first, then autosave. Tests that click through the offseason now close the jobs popup with "Decide Later" (`dismissJobOffers` in `tests/helpers.js`), like a player would. |
| `test-update12b` | Race Center row count off by 3 (intermittent) | The results table lists DNFs after the finishers. The test counted all rows but expected finishers only, so it failed whenever a race had DNFs. | Test now expects `finishers + dnfs` rows. |
| `test-update6` | "every chair must stay filled through succession" | Stale assertion. Since the offseason job market (Updates 14–15), open head-coach chairs deliberately stay vacant from Week 16 until the rollover carousel, so the player can apply for them. Retiring never opened a *new* vacancy. | Test now asserts that succession opens no new vacancy (post-retirement vacancies ⊆ pre-retirement vacancies) and that every assistant seat is filled. |
| `test-update15-balance` | NAU prestige "96 → 8", few transfers and 4★/5★ signings | **Not a prestige collapse.** Northern Arizona stayed at 94–96. The harness coach was **fired** (three straight preseason-podium picks without a top-3 finish, `js/engine/awards.js:552`) and sent to a bottom-15 program (`js/engine/careers.js:1347`): Eastern Illinois, prestige 12. The harness never job-hunts, so it spent 35 seasons at the bottom, and the test read *that* school's prestige. | The harness keeps its coach in place (clears `career.pendingFiring`, counts and prints each override) because the test measures recruiting/transfer balance *at a blue blood*. Firing has its own coverage in `test-update13-features`. A new check fails if the harness ever changes schools. |

Result after the fixes: **35 / 35 tests pass**. The 40-season balance run now holds NAU at prestige 92–99, with 23 five-star signings, about 2.8 transfers per season, and a flat world average OVR of 47.

### Design question raised by the balance run (your call)

With the harness kept in place, a "competent" auto-player at the #1 program in the country
**won 0 national titles in 40 seasons** and **would have been fired 4 times**. In the instrumented
run, the firing came from the podium-miss rule while the seat itself was never "hot" (it peaked
at 44 of 100). A team picked top-3 in the preseason that keeps finishing just off the podium
loses its coach after three years, even while ranked 2nd–13th. You asked for that rule, so it
is unchanged. Options if it feels too harsh:

- Count a miss only when the team finishes well below its pick (e.g. outside the top 6–8), not 4th.
- Let a conference title, or a top-5 finish in the *other* gender, reset the streak.
- Scale the streak length by heritage (blue bloods get patience, a hot mid-major does not).

---

## 2. Bugs and risks found during the code pass

**Fixed in this branch**

1. **Offline install was broken for 5 scripts.** `sw.js` precached only 53 of the 58 scripts
   in `index.html`. Missing: `js/data/geography.js`, `js/data/courses.js`,
   `js/engine/courses.js`, `js/ui/tutorial.js`, `js/ui/screens/courses.js`. An installed
   (home-screen / PWA) copy would fail the first time it ran offline. All 5 are added,
   `CACHE_VERSION` is bumped to `xcd-v8`, and the new `tests/test-sw-precache.js` (no browser,
   runs in <1 s) fails if the two lists ever drift again.
2. **Advance Week redraw after autosave** (see §1).

**Open — recommended next fixes**

3. **The Load screen reads every save in full.** `SaveManager.listSlots()`
   (`js/engine/savemanager.js:220`) calls `getAll()`, which deserializes every dynasty *and*
   its yearly backup (~65 MB each after two seasons, ~135 MB after 100) just to show names
   and dates. With three dynasties that's ~400 MB+ of structured-clone work on the main
   thread. On an iPhone this is the most likely path to a freeze or a tab crash. *Fix:* write
   a small metadata record (`meta_<dynId>`) next to each save, or a separate object store,
   and list from that.
4. **Rollover blocks the UI with no feedback.** The Week 21 → Week 1 advance takes 1.2–1.9 s
   of synchronous work on desktop Chromium, likely 3–6 s on a phone. There is no spinner,
   and the button stays live, so an impatient double tap advances twice. *Fix:* disable the
   button and show a "Simulating…" overlay while `advanceWeek()` runs, yielding one frame first
   (`await new Promise(requestAnimationFrame)`) so the overlay can paint.
5. **Non-deterministic randomness inside the seeded engine.** `js/engine/morale.js:35`
   (team morale), `js/models/models.js:281` (coach retire age) and `:364` use `Math.random()`
   even though `advanceWeek()` builds a seeded RNG "so simulated worlds are reproducible".
   Two runs of the same seed diverge, which makes balance bugs hard to reproduce (the
   firing above showed up on different seasons in each run). *Fix:* pass the week's `rng` through.
6. **Tests depend on timing.** Several UI tests use fixed `waitForTimeout(40–150)` sleeps
   around async handlers, which is exactly how the autosave race stayed hidden as "flaky".
   Prefer `waitForFunction(() => …)` on the state the test needs.
7. **`package.json` `"test"` runs a single file.** `npm test` only runs
   `test-update13-features.js`. Add a runner (e.g. `scripts/run-tests.js`) that runs every
   `tests/test-*.js` in parallel and summarizes, with the 100-season soak behind a flag.

---

## 3. Performance — measured, and ranked by payoff

Profile of a fresh DI dynasty over two seasons (42 weeks):

| Measure | Value |
|---|---|
| Average week | ~430 ms (in-season meet weeks 400–500 ms, quiet weeks 150–250 ms) |
| Rollover week (21 → 1) | 1,200–1,600 ms; Week 2 spike 1,900 ms |
| Time split | Training 5.1 s · Races 4.2 s · Recruiting 3.2 s · Rollover 2.3 s |
| Save size after 2 seasons | **65.8 MB** of JSON (athletes 46 MB, recruits 12 MB, coaches 1.9 MB, history 3.2 MB) |
| `toJSON` + stringify / `fromJSON` | 574 ms / 1,048 ms |
| World size | 727 schools · 23,819 athletes · 6,000 recruits · 1,455 coaches |
| Slowest screen renders | Portal 39 ms · World 36 ms · Roster 21 ms (everything else < 16 ms) |

Top self-time functions: `Training.processAthlete`, the IndexedDB success callback (the save),
garbage collection, `Rankings.teamStrength`, `Races.raceRating`, `Races.simulateRace`,
`Portal.portalAppeal` / `pursuitScore`, `Training.safeMileage`, `majorInjuryCount`.

### Biggest wins

1. **Shrink the save, which also shrinks every autosave.** Athlete records average ~1.9 KB, and the
   size is spread across many fields rather than one hog (`raceLog` 5 MB, `honorYears`
   1.9 MB, `careerStats` 1.7 MB, `overallHistory` 1.6 MB, then dozens of ~0.6 MB fields).
   That pattern points to per-field overhead: long key names repeated 24k times, and full
   double-precision floats such as `confidence: 0.48372619…`.
   - Round internal floats to 2–3 decimals in `toJSON`. This is likely a 20–30% cut by itself.
   - Drop default and empty values (`[]`, `0`, `null`, `false`) on write and restore them in `fromJSON`.
   - Cap or summarize `raceLog` for graduated/old seasons (keep season bests, drop splits).
   - Recruits: `importance`, `playerKnowledge` and `motivations` are 1.4 MB for a class that is
     regenerated yearly. Keep only what the UI shows for recruits the player has never touched.
2. **Stop writing the whole world every week.** Basketball GM found the same thing: one
   giant object per entity made every save and load slower as history grew, because
   IndexedDB has no partial writes. Their fix was splitting data across stores. Options:
   - Split the record into separate IndexedDB keys (`meta`, `world.athletes`, `world.recruits`,
     `history`, `season`…) and write only dirty parts. History changes yearly, athletes weekly.
   - At minimum, run `toJSON` (or `structuredClone`) inside a Web Worker and post the result,
     so the 0.5–1 s clone isn't on the main thread.
3. **Move the simulation into a Web Worker.** The engine is plain data plus pure functions, and
   OpenFrontIO-style "simulation in a worker, UI on the main thread" fits it well. Advance Week
   then never freezes the screen, rollover can show live progress ("Signing day… Portal…"), and
   the autosave can happen in the worker. It's the biggest change and pays off the most on phones.
4. **Cache team strength per week.** `teamStrength()` re-maps, re-rates and re-sorts each
   roster on every call (rankings, predictions, job offers, World screen). Memoize per
   `(schoolId, gender, week)` and clear the cache in `advanceWeek()`.
5. **Hoist per-athlete invariants in training.** `safeMileage()` runs 3–4× per athlete per
   week, and each call re-filters `careerInjuries` via `majorInjuryCount()`. Compute both once
   per athlete per week, or keep a `majorInjuries` counter updated when an injury is logged.
6. **Lower the garbage-collection churn.** GC is the #3 cost. Hot loops build throwaway arrays
   (`.map().filter().sort().slice()` chains in `teamStrength`, `getRoster`, portal scoring).
   Swap the busiest ones for plain loops with a reused buffer.
7. **Virtualize long lists.** The World screen builds 727 rows and Portal ~40 ms of DOM. Render
   the visible window plus a buffer, or page at 50 rows.
8. **Bundle and minify for release.** 59 separate `<script>` files download serially on a
   cold install. `scripts/build-www.js` could concatenate and minify into one file for the
   iOS/PWA build, and the service worker list would collapse to a few entries.

---

## 4. Feature ideas from sims in this genre

The game already covers a lot of ground: archetypes, recruiting funnels with sway, the
portal, NIL, facilities, prestige eras, coaching trees, GOAT lists, course records,
predictions, firings, and Legacy succession. The ideas below are gaps that other sims
in the genre cover.

### Pacing and quality of life
- **Sim to a date/event.** One menu with "Sim to Conference / Regionals / Nationals / Signing Day / Next Season", plus *stop conditions* (injury to a top-7 runner, a recruit committing, a job offer). Football Manager-style "continue until something needs me" is the most-praised QoL loop in the genre.
- **An inbox.** One prioritized feed of things that need a decision (injury reports, recruit visits, staff requests, job offers, Hot Seat warnings), each with action buttons. Today these are scattered across news, toasts, and the Dashboard. Reviewers single out how a management sim delivers its updates as make-or-break.
- **Delegation.** Let the assistant run selected weekly tasks (mileage, recruiting calls, schedule), with a quality based on their ratings. It's a natural fit with the existing assistant-value system.
- **Difficulty settings** (none today): recruiting competitiveness, injury frequency, Hot Seat patience, CPU development speed. Sports-game communities rarely stick to designer defaults. An Operation Sports analysis of NHL 17 found only 5 of 129 tracked slider settings averaged at the default.
- **Explain the numbers.** A "Why?" popover on ratings changes, the hot seat, prestige moves, and recruit interest that lists the inputs (the engine already computes them). It turns opaque math into decisions.

### Cross-country realism
- **Kolas-style at-large selection.** Real DI at-large bids come from regular-season wins over teams that later earned automatic bids (Kolas points), and wins count only when the losing team ran its "A team". Today at-larges come from poll order. Kolas would make the regular-season schedule matter, and the Schedule screen could show a live "Kolas points" tracker.
- **Pack running stats.** Show 1–5 spread / time gap, and the 5th–7th displacers, in race results and the team profile. They're the core stats XC fans and coaches read, and the engine already has every split.
- **Course conditions on the start line.** Mud, heat and wind already exist in `conditions`. Show a pre-race "conditions report" and let race philosophy react (e.g. conservative in heat).
- **Track season tie-in (light).** Even a summarized indoor/outdoor track season (10K/5K/steeple qualifiers) would give runners year-round arcs and give distance-program prestige another input.
- **Redshirt decisions as a real choice.** Prompt the player on Week 1 for freshmen and injured runners, with a projected-development preview.

### Story and replayability
- **Media moments.** Short pre- and post-nationals press questions whose answers nudge morale or recruit interest. Reviews of Football Manager credit its media and captaincy systems for the club's story.
- **Rivalries with stakes.** Head-to-head rival records on the Schedule and Race Center, plus bonus morale and prestige for beating a rival in a championship race.
- **Achievements and a trophy case.** Career milestones (first title, 100 All-Americans, a DIII → DI climb) give long dynasties goals beyond titles.
- **Scenario starts.** "Rebuild a fallen blue blood", "DIII to the top", "Win with walk-ons": pre-set dynasties with a goal and a scoreboard.
- **Editor / God mode.** Edit any runner, coach or school and force results. Basketball GM's God Mode (rig the lottery, regenerate draft classes, edit awards) is one of its most-used features for storytelling leagues.
- **Career history across jobs.** The GM History page in Basketball GM was added specifically because switching teams scattered a player's record. The equivalent here is a single page of every stint, record, title and firing across all your coaches.
- **Recruiting pipelines and dealbreakers.** College Football 25 ties coaches and schools to regional pipelines, and recruits carry dealbreakers (academics, facilities) that shut a school out completely. Pipelines would fit the existing geography data well.

### Accessibility and platform
- **Accessibility.** Only a few files use `aria-` attributes, and there's no keyboard navigation beyond Escape. Add labeled controls, focus traps in modals, and keyboard shortcuts (Space = Advance, R = Sim to Race).
- **Light theme** (the CSS is dark-only) and a text-size setting for phones.
- **Cloud save / file sync** for iOS, since IndexedDB can be evicted under storage pressure. Pair it with the existing JSON export.

### Sources
- [Going Deep On What Did (And Didn't) Make Dynasty Mode In 'EA Sports College Football 25'](https://uproxx.com/?p=404145002) · [CFB 25 Dynasty Review](https://uproxx.com/?p=404163987) · [Everything You Need To Know About Recruiting In CFB 25](https://uproxx.com/?p=404156783) · [Pipelines in College Football 25](https://deltiasgaming.com/?p=77684)
- [College Baseball: Dynasty Builder (Steam)](https://store.steampowered.com/app/3897330/College_Baseball_Dynasty_Builder/)
- [Storytelling in Football Manager](https://fmprojects.substack.com/p/storytelling-in-football-manager) · [Football Manager 2015 Diary: This Is a Game About Stories](https://games.softpedia.com/blog/Football-Manager-2015-Diary-This-Is-a-Game-About-Stories-467215.shtml) · [Is Football Manager the Greatest RPG Ever?](https://loudpoet.com/2023/09/23/is-football-manager-the-greatest-rpg-ever-tldr-yes/)
- [Basketball GM: Game simulation performance improvements](https://zengm.com/blog/2016/04/game-simulation-performance-improvements/) · [God Mode](https://zengm.com/blog/tag/god-mode/) · [GM History page](https://zengm.com/blog/2020/08/gm-history/)
- [Scouting In OOTP](https://baseballreplayjournal.substack.com/p/scouting-in-ootp) · [Introduction to OOTP Finances](https://baseballreplayjournal.substack.com/p/introduction-to-ootp-finances)
- [Full breakdown of the NCAA cross country qualifying system (Kolas)](https://flotrack.org/article/46947-full-breakdown-of-the-ncaa-cross-country-qualifying-system) · [Understanding Kolas](https://www.thestridereport.com/understanding-kolas) · [2025 Kolas Projections](https://www.flotrack.org/articles/14758409-2025-kolas-projections-ncaa-xc-auto-qualifiers-at-large-bids-revealed)
- [The psychology of sliders (NHL 17)](https://www.osftw.com/features/2643/the-psychology-of-sliders-how-the-community-is-changing-nhl-17) · [NBA General Manager 2014 review](https://www.pocketgamer.com/nba-general-manager-2014/review)
- [OpenFrontIO architecture (simulation in a Web Worker)](https://www.mintlify.com/openfrontio/OpenFrontIO/development/architecture) · [Trail Tycoon (training-week sim)](https://maldrend.itch.io/trail-tycoon) · [Cross Country Simulator](https://isaac-venable.itch.io/cross-country-simulator)
