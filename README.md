# Cross Country Dynasty

A browser-based college cross country coaching dynasty game. Manage a Division I program over decades: recruit, train, race, and build the greatest dynasty in NCAA history.

Built entirely in vanilla HTML/CSS/JavaScript — no build step, no backend.

## How to Play

Open `index.html` in any modern browser. That's it.

(If your browser restricts `file://` pages, serve the folder with any static server, e.g. `python3 -m http.server` and open http://localhost:8000.)

## Version 1.0 — All Six Phases Complete

The full dynasty loop is playable indefinitely: recruit → train → race → manage → develop → offseason → repeat, for 100+ seasons.

### Phase 6 (Polish, Finances, Balancing)

- **Facilities & finances**: upgrade all 8 facilities from a facilities fund that refills yearly and swells with championships; a once-a-year booster fundraiser scales with prestige and coach charisma; all 353 AI programs invest in their weakest facilities every offseason; budgets track prestige over time.
- **Dashboard v2**: poll positions with weekly movement, trophy case, next-race card with conditions, and a Coach's Desk that flags injuries, over-fatigued squads, low morale, and portal departures.
- **Sim to Race**: one click simulates ahead to your next race day and drops you into the broadcast.
- **Balancing (10-season audit)**: 8 distinct national champions per decade, stable rating distributions (no inflation), ~5% injury rate, realistic winning times, Hall of Fame tightened to a few legends per class, offseason fatigue equilibrium tuned.
- **Polish**: integer stat displays, race-center auto-gender fix, focus rings, hover states, animated transitions.

### Phase 5 (Portal, Redshirts, News, Awards, History)

- **Transfer portal**: after nationals, unhappy athletes enter with real reasons (playing time, coach departures, homesickness, prestige, facilities, academics, NIL, morale). AI programs make offers; athletes pick by fit; the player can pursue up to 3 transfers per cycle. Moves execute at the year rollover.
- **Redshirts**: true redshirts (preseason choice, blocked once a runner has raced) and automatic medical redshirts for season-ending injuries — both preserve the year of eligibility inside the NCAA five-year clock. AI programs redshirt raw freshmen too.
- **News engine**: upsets, poll surges, new #1s, championship previews, milestone wins, portal entries/commitments, firings, hirings, records, injuries, and award announcements.
- **Awards**: Runner/Freshman/Coach of the Year, 40 All-Americans per gender, conference runners of the year, Academic All-Americans — all archived forever.
- **Coach carousel**: hot seats build for underperforming AI coaches (fired after sustained failure), retirements continue, and roster exodus can follow a coaching change.
- **History & Hall of Fame**: career ledger for your coaching résumé, season-by-season results, every champion, every award, all-time records, and a Hall of Fame that enshrines legendary careers at graduation.

### Phase 4 (Races, Rankings, Championships, Stats)

- **Full season schedule**: 5 invitationals (weeks 5/7/9/11/13, ~20-team fields covering all 354 schools), conference championships (wk 16), 8 regionals (wk 19), and the NCAA Championships (wk 21).
- **Segment-based race simulation**: 8-leg races with adrenaline starts, hill segments, late-race fade vs. stamina/toughness, finishing kicks, pack-running drafting, day-form variance by consistency, and course conditions (heat/cold/rain/altitude/hills) filtered through each runner's ratings and preferences. Readiness from the training engine feeds directly into race performance.
- **NCAA team scoring**: top 5 score, runners 6-7 displace, 8+ excluded, incomplete teams removed, 6th-runner tiebreaks.
- **Championships**: conference titles, regional auto-qualifiers (top 2) plus at-large bids to a 31-team nationals; team & individual national champions recorded forever; prestige moves with results.
- **Race Center**: your meets are broadcast as animated replays — progress bars, live leaderboard, projected team scores, speed controls, final results with per-leg splits for your squad.
- **Rankings**: weekly national/regional/conference team polls (strength + quality-weighted results), individual and freshman rankings.
- **Stats**: career races/wins/top-5s and PRs on every player card, school record boards, all-time national records with news coverage.

### Phase 3 (Training, Development, Fatigue, Injuries)

- **Weekly training plans** per squad: 10 workout types (mileage, intervals, tempo, long run, hills, strength, cross training, easy runs, recovery weeks, rest) with primary/secondary emphasis and three intensity levels; per-athlete load overrides (normal/reduced/rest).
- **Development engine**: every athlete in the world develops weekly from coach development rating, facilities, potential gap, work ethic, coachability, morale, fatigue, age, and academics — routed into the specific attributes your plan trains. Hidden archetypes create early bloomers, late bloomers, and busts; stars plateau near their ceiling.
- **Fatigue system**: training load vs. recovery (athlete recovery rating + recovery center facility); overtraining tanks development and spikes injuries.
- **Injury system**: eight injury types with severity ranges, influenced by fatigue, injury resistance, durability, and plan risk; rehab time shortened by recovery facilities; injured runners rehab automatically and return.
- **Training screen**: plan editor with live load preview, squad monitor (weekly/seasonal development deltas, fitness/fatigue/readiness/morale meters), and a program-wide injury report. AI programs train too, with plans derived from coach personality and the season calendar.

### Phase 2 (Recruiting)

- **National recruiting classes**: 2,400 new recruits per year (HS, JUCO, and international) with star ratings, national/state/regional rankings, hidden motivations, importance priorities, parents' influence, and decision timelines.
- **Nine recruiting actions** (letters, calls, race scouting, assistant/home/campus visits, overnights, team meets, scholarship offers) with a weekly points economy and an annual dollar budget.
- **Fog of war**: recruit ratings display as ranges that tighten as you scout; hidden motivations unlock through calls and home visits.
- **Living market**: all 353 AI programs build boards in their talent range with regional bias, push relationships weekly, and offer scholarships; recruits commit on their own timelines, flip, decommit, and rise late.
- **Signing day** (week 24) locks classes, publishes national class rankings, and signees enroll as freshmen at the year rollover (JUCOs as sophomores).

### Phase 1 (Foundation)

- **World generation**: 354 D1 schools across 31 real conferences, each with prestige, academics, campus appeal, facilities (8 types), budgets, weather/altitude profiles, program history, and in-state rivalries. Seeded RNG makes worlds reproducible.
- **Coaches**: every school has an AI head coach with 8 ratings and a personality; coaches age and retire, and schools hire replacements.
- **Athletes**: ~9,000 generated runners with 21 physical ratings, 9 mental/makeup ratings, hometowns, majors, preferences, potential, fatigue/morale/fitness state, and eligibility tracking.
- **Game loop**: weekly advancement with season phases (summer training → regular season → conference/regional/national championships → offseason), yearly rollover with graduation and incoming classes.
- **UI**: dark-mode dashboard, sortable/searchable roster, full player cards, program page (coach, facilities, budget, history), world browser with conference filters and school pop-ups, news feed.
- **Saves**: IndexedDB multi-slot saves, weekly autosave, JSON export/import.

## Project Structure

```
index.html            entry point, script load order
css/main.css          full dark theme + components
js/core/              namespace, seeded RNG, utilities
js/data/              constants, name pools, 354-school dataset
js/models/            Athlete / Coach / School classes
js/engine/            worldgen, game state + weekly loop, save manager
js/ui/                UI framework (routing, tables, modals, toasts)
js/ui/screens/        menu, dashboard, roster, program, world, news, saves
```

