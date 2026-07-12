# Cross Country Dynasty

A browser-based college cross country coaching dynasty game. Coach a program in **NCAA Division I, II, or III** over decades: recruit, train, race, and build the greatest dynasty in NCAA history.

Built entirely in vanilla HTML/CSS/JavaScript — no build step, no backend.

## How to Play

Open `index.html` in any modern browser. That's it.

(If your browser restricts `file://` pages, serve the folder with any static server, e.g. `python3 -m http.server` and open http://localhost:8000.)

## Version 5.0 — Update 4: Identity, History & Prestige

Update 4 deepens the dynasty: coaches gain distinct identities, every athlete
carries a complete career record, programs feel like living institutions with
real heritage, and profiles are reachable from nearly everywhere.

- **Expanded athlete accolades.** Every honor is now a permanent, richly
  labeled record — division, conference (when applicable), and year — e.g.
  *2028 D1 Individual National Champion*, *2029 SEC First Team All-Conference*,
  *2031 RMAC Runner of the Year*. Honors earned across multiple divisions or
  conferences (via transfers/realignment) all coexist; nothing is ever
  overwritten. Athlete profiles show the full accolade ledger and a career
  overall-progression chart, and it all survives graduation in the alumni ledger.
- **Coach Training Philosophy (permanent).** Chosen at coach creation and never
  changed — its effectiveness instead scales with the coach's **Training**
  rating. Seven real-world-inspired schools: Norwegian Method, High Mileage,
  Polarized, Threshold Focus, Speed Development, Strength Endurance, and
  Balanced. Each is a genuine trade-off (which attributes develop, fatigue,
  overtraining risk), so none is objectively best. AI coaches receive varied
  philosophies, creating natural coaching diversity across the sim.
- **Coach Race Philosophy (changeable).** Sit & Kick, Aggressive Front Running,
  Conservative, Even Pace, and Pack Running each visibly shape in-race behavior
  — pack discipline, energy conservation, surging, late-race grind, and the
  finishing kick. Changeable anytime on the My Program screen.
- **Custom race scheduling.** A new preseason phase: choose which meets to
  attend each regular-season week, with **eligibility gated by prestige** —
  elite invitationals only invite high-prestige programs, so a rebuild races
  regionals until it earns its way up. Rest a week to bank a training block.
- **Dynamic prestige with real-world heritage.** Historically great programs
  (NAU, Oklahoma State, BYU, Stanford, Oregon… Adams State, Colorado Mines,
  Grand Valley State… North Central, UW–La Crosse, MIT…) start elevated and
  carry *heritage* — resilience that resists collapse until several poor
  seasons pile up, while weak programs can still build into national powers
  over time. Heritage itself is dynamic.
- **Preseason individual rankings** projected from returning ability, fitness,
  and expected development, so favorites return near the top.
- **Champions & Awards, all divisions.** Champions page spans D1/D2/D3 team and
  individual champions plus conference champions grouped by division →
  conference. Awards page carries national awards per division and conference
  awards (Runner of the Year, Freshman of the Year, Coach of the Year) for
  every conference — all permanent history, shown on athlete and coach profiles.
- **Universal profile navigation.** Athletes, coaches, and programs are
  clickable almost everywhere — rankings, standings, champions, awards, meet
  results, schedules, the world table. Program profiles show prestige, coach,
  conference, division, roster, team ratings, season schedule/results, and
  historical achievements; every popup fails gracefully if data is missing.

Saves upgrade automatically (**save v4 → v5**): coaches gain philosophies,
athletes gain their accolade ledger, and programs pick up heritage — all
without disturbing existing rosters, careers, or history.

## Version 4.0 — Update 3: The Three-Division NCAA

Update 3 completes the multi-division architecture: Divisions I, II, and III
now coexist in one living NCAA ecosystem, each with its own real schools,
conferences, recruiting reality, and separate postseason. You can coach in
any division and build a career that climbs (or falls) between them.

- **All three divisions, real programs.** ~200 DII and ~165 DIII schools
  across every major conference (RMAC, GLIAC, PSAC, NSIC, WIAC, NESCAC, UAA,
  MIAC, and more), with division-scaled prestige, budgets, scholarships/NIL,
  and coach stature. Rankings run **within each division** — a DIII #1 is #1
  in DIII, never buried under DI.
- **Cross-division competition, separate championships.** Open invitationals
  and regional meets mix all three divisions; conference, regionals, and
  nationals stay strictly per-division (DI/DII at 10K, DIII at 8K).
- **Pre-Nationals Invitational.** A DI-only elite meet on the NCAA
  Championship course. An invite is an accomplishment; coaches accept or
  decline by philosophy; racing it earns a small course-familiarity edge at
  Nationals and heavy poll weight.
- **Auto Recruiting.** A toggle that hands your board to the *exact* same CPU
  recruiting AI every computer school uses — no cheating, on or off any time.
- **Rest Days** as a selectable weekly workout: sharpen and recover, but
  overuse stalls development.
- **Team Morale** (0-100), driven mostly by coach Team Culture and by results
  vs *expectations* (not raw win/loss) — a bounded race-day modifier,
  amplified at championships, that never overrides talent.
- **Mileage consequences.** Overreaching a body's durable limit drives
  chronic overuse injuries (stress fractures, Achilles, plantar fasciitis),
  burnout, confidence loss, and temporary regression.
- **Coach careers.** Detailed coach profiles (age, titles, Coach of the Year
  awards, athletes coached, full career timeline), ages 25-75 with realistic
  retirement, free movement between divisions, and a richer offseason **Job
  Offer** phase with program detail and accept / stay / wait.
- **Save compatibility.** Existing Update 2 dynasties migrate automatically
  (save v3 → v4): DII and DIII are generated alongside your untouched
  program, roster, and history.

Recruiting-filter crash (Star Rating / High School / JUCO) fixed — the Safari
WebContent crash from rebuilding a `<select>` inside its own change handler is
gone; filters now update in place with graceful empty states.

## Version 3.0 — Update 2: The Living NCAA

Update 2 turns the game from a solid Division I simulator into the framework
for a living, multi-division NCAA coaching universe. Dynasty building is
harder, every decision echoes for decades, and the world writes its own
stories — Cinderella programs, coaching legends, shocking transfers, and
once-in-a-generation recruits — so no two dynasties ever feel the same.

### The new season (Part 5)

A full 21-week year: **Summer Training (wk 1-3) → Regular Season (wk 4-12,
meets at 4/6/8/10/12 with one bye week between every meet) → Conference
(wk 13) → NCAA Regionals (wk 14) → NCAA Nationals (wk 15) → Offseason
(wk 16-21)**. No byes between championship rounds. All numbers live in
`XCD.data.CALENDAR` — nothing downstream hardcodes the calendar.

### Mileage & tapering (Part 6)

Weekly volume is now its own training dial, independent of the day-by-day
planner: 30-120 miles per week, per squad, with per-athlete overrides.
Mileage is **not** fitness — it drives fitness, fatigue, injury risk,
aerobic adaptation, and race **sharpness**. High volume builds huge
Stamina/Threshold engines at the cost of fatigue, injuries, and flat legs;
low volume races sharp but stagnates. **Durability gates volume**: only
durable runners survive 100-120-mile weeks. Cutting volume below the
chronic load produces a genuine **taper** — sheds fatigue, spikes
sharpness, preserves fitness — and timing it is a real coaching skill. The
training screen adds a program mileage slider, individual sliders,
Quick Set All, and Freshmen / Redshirt / Championship-taper / Recovery
presets.

### Coach reputation & living AI coaches (Parts 1-2)

Every coach carries a national **reputation** (Unknown Assistant → Small
School Coach → Respected Builder → National Coach → Elite Recruiter →
Legend → Hall of Fame Coach), separate from school prestige — a legend at a
mid-major out-recruits an average coach at a blue blood. Reputation feeds
recruiting, the transfer portal, job offers, and media buzz; it's earned by
winning, developing athletes, and producing All-Americans, and lost through
losing seasons and roster exodus. Coaches also gained seven secondary craft
ratings (talent evaluation, motivation, transfer recruiting, international
recruiting, media, staff management, relationship building) and permanent
**tendencies** (mileage-heavy/low-mileage, elite recruiter, development
specialist, transfer expert, international/regional, aggressive/
conservative) that shape their programs for entire careers. Young coaches
improve fast, veterans plateau, and some decline with age — the same rules
for AI and player alike.

### Dynamic prestige (Part 3)

Prestige is no longer static. Every offseason it moves on the year's
evidence — poll finishes vs expectation, titles, nationals trips,
recruiting class ranks, facilities, budget, coach reputation — with
momentum, so sustained eras move mountains. Mid-majors can become national
powers over a decade; sleeping blue bloods decline. Every program tracks a
prestige trajectory chart on its History tab.

### The smart portal (Part 4)

Transfer logic rewritten from scratch. Entries have legible causes: lack of
racing opportunities (elite athletes who never race grow likelier to leave
every year), coach departures, poor culture, homesickness, academics,
championship aspirations, training-philosophy misfit, low coach
relationship, NIL, style mismatch, overtraining, undertraining.
Destinations weigh coach reputation, prestige, genuine racing likelihood,
recent success, facilities, academics, distance, conference, NIL, and
whether the program's volume philosophy fits the athlete's body.

### Prestigious invitationals (Part 7)

Elite programs get invitations to named fall classics — the **Nuttycombe
Invitational**, **Pre-Nationals**, **Joe Piane**, **Roy Griak**, and
**Wisconsin Invitational** — which carry extra poll weight. Everyone else
races regional invitationals close to home, with a few lottery invites for
hot mid-majors.

### Permanent history (Parts 8-10)

- **Program ledgers**: every school permanently tracks meet wins, W/L
  record and winning percentage, conference/regional/national titles, NCAA
  appearances and podiums, best finish, highest ranking, individual
  champions, All-Americans, All-Conference honors, top recruiting classes,
  and its full coaching history — on a new History tab of the program page.
- **Coach history**: career records, stints, titles, All-Americans coached,
  reputation arcs — and retired coaches remain **searchable forever** in the
  new Coach Registry (History → Coaches).
- **Athlete badges**: 🏆 National Champion, 🇺🇸 All-American, 🥇 Conference
  Champion, 🏅 All-Conference — year-stamped, displayed on player cards for
  life, and preserved after graduation in the Decorated Alumni ledger
  (History → Legends).

### The coaching carousel (Part 11)

Schools only hire when a coach retires (randomly, always 75+), is fired, or
leaves. Fired coaches enter a free-agent pool and may resurface; vacancies
cascade as bigger schools poach sitting coaches whose reputations outgrew
their programs; unknown assistants get first breaks. The player receives
offers only from genuine vacancies — step-ups, laterals, step-downs, and
the occasional 🌟 dream job.

### Offseason development & generational talent (Parts 12, 12.5)

Between seasons every athlete in the world progresses **or regresses**
based on potential, work ethic, the coach's training, injuries, burnout,
confidence, consistency, and hidden late-bloomer/plateau profiles.

And roughly once every 7-8 recruiting classes — on weighted odds with no
pattern, streaks and droughts both possible — a **⭐ generational recruit**
appears: immediately among the best runners in the country, capable of
winning NCAAs as a freshman, but never perfect (The Diesel, The Closer, The
Aerobic Freak, The Tactician, The Metronome, The Prodigy — each with a
signature weakness). Their recruitment becomes the story of the year with
rolling news coverage; landing one lifts a program's prestige, buzz, and
roster morale; and they're remembered forever in History → Legends.

### Division architecture (Part 13 — the foundation)

Division I is no longer hardcoded anywhere. A new division layer
(`js/data/divisions.js`) defines scholarships, championship structure
(field sizes, auto-qualifiers, All-America counts, distances), budgets,
NIL, recruiting scope, academic emphasis, and expectations per division —
DI active, DII and DIII fully specified and awaiting schools. Schools carry
a `division`; postseason scheduling, nationals fields, awards, transfer
logic, finances, and the history database are all division-aware, while
regular-season invitationals can mix divisions. Saves are protected by a
versioned migration system (`GameState.SAVE_VERSION` = 3): pre-Update-2
dynasties load cleanly, resuming at the top of the same academic year with
rosters, records, and history intact.

### Architectural changes (for developers)

- `js/data/divisions.js` — the division rule layer (`D.divisionFor(school)`).
- `js/engine/legacy.js` — permanent memory: program ledgers, athlete honor
  years/badges, alumni, coach stints, and the retired-coach registry.
- `js/engine/coaching.js` — reputation updates, age-curve progression,
  tendencies, mileage philosophy.
- `js/engine/prestige.js` — the yearly dynamic-prestige engine.
- `careers.js` rebuilt around vacancies/free agents/poach chains;
  `portal.js` rewritten; `training.js` gained the mileage/sharpness/taper
  layer and offseason development; `races.js` schedules from
  `D.CALENDAR`/`D.ELITE_MEETS` and builds championships per division.
- Save migrations run in `GameState.migrateSave`; entity-level defaults
  live in the model constructors, so every layer heals old data.

### Roadmap — Update 3: Full Division II & III integration

The foundation above makes DII/DIII a data-and-content update, not a rewrite:

1. **School data**: add DII and DIII school datasets (names, states,
   conferences) with `division` set; worldgen already routes budgets,
   scholarships, and facilities through division rules.
2. **Conference data**: add DII/DIII conference tables to `D.CONFERENCES`
   (division-tagged tiers) so postseason grouping picks them up.
3. **Activate divisions**: flip `active: true` in `D.DIVISIONS` and scale
   worldgen counts (target 1,000+ schools; the recruiting pool and rankings
   already partition by division).
4. **Cross-division scheduling polish**: large invitationals inviting
   nearby DII/DIII programs (the invite builder already mixes divisions).
5. **Career-mode starts** at DII/DIII schools, with the carousel's ladder
   (DIII → DII → DI) already in place, plus division-aware job-offer flavor.
6. **UI filters**: division dropdowns on rankings, world, and history
   screens (ranking rows already carry `division`).
7. **Partial-scholarship recruiting** for DII (offer fractions) and
   walk-on-driven DIII recruiting emphasizing academics/campus fit — the
   fit model already reads `scholarshipModel`, `academicEmphasis`, and
   `recruitingScope`.
8. **Performance pass** at 1,000+ schools: pool partitioning per division
   and lazy meet simulation (only detailed meets keep splits).

## Version 2.0 — Update 1: The Simulation Overhaul

A ground-up gameplay overhaul: dynamic racing, a real weekly training planner, six core athlete ratings, a four-rating coach system with archetypes and progression, facilities that matter, and a tight 14-week yearly rhythm.

### Update 1 highlights

- **Live races that breathe**: a segment-by-segment race engine with pack formation, mid-race surges, lactate-threshold pace holding, energy reserves, late-race fades, and a final-800m kick. The Race Center broadcasts it all with a live event feed and position-movement arrows — runners genuinely pass each other all race long.
- **The season** *(superseded by Update 2's 21-week calendar)*: Wk 1 Meet · Wk 2 Training · Wk 3 Meet · Wk 4 Training · Wk 5 **Pre-Nationals** (elite field + invited mid-majors) · Wk 6 Training · Wk 7 Meet · Wk 8 Conference · Wk 9 Regionals · Wk 10 Nationals · Wk 11-14 Offseason (awards, portal, signing day). New seasons always open on the Dashboard.
- **Weekly training planner**: assign one of seven workouts (Easy Run, Recovery Run, Long Run, Tempo, Hills, Intervals, Speed Development) to every day, Monday-Sunday. Balanced weeks develop athletes fastest; stacked hard days cause overtraining, fatigue, and injuries.
- **Six core ratings**: VO₂ Max, Running Economy, Stamina, Injury Resistance, Lactate Threshold, Speed. Each workout trains specific ratings; races are computed straight from them (no more per-distance abilities).
- **Coach creation & progression**: every dynasty starts by creating a coach — name, portrait, and one of four archetypes (Recruiter, Developer, Tactician, Players Coach). Coaches have exactly four ratings — Recruiting, Training, Peaking, Culture — and earn upgrade points from titles, champions, All-Americans, top classes, and beating expectations.
- **The weekly coaching rhythm**: every week you plan training → recruit → advance, in that order, tracked in the top bar.
- **Facilities with teeth**: recruiting pull, development speed, training effectiveness, recovery, injury prevention, and long-run prestige all flow from your buildings.
- **14 + 14 rosters**: every program always fields 14 men and 14 women; shortfalls fill with weak walk-ons — and about 1 in 1,000 walk-ons is a secret future legend.
- **True NCAA qualifying**: top-2 teams per regional plus at-larges make the 31-team Nationals field, and the top-10 regional finishers not on qualifying teams race Nationals as individuals.
- **Fixed**: the World → Conferences crash in Safari (the filter no longer rebuilds the screen mid-dropdown-dismiss).

Automated end-to-end tests live in `tests/` (Playwright; see `tests/README.md`), including a 20-season stress simulation.

## Version 1.1 — Career Mode & Team Culture

The full dynasty loop is playable indefinitely: recruit → train → race → manage → develop → offseason → repeat, for 100+ seasons.

### v1.1 (Careers & Culture)

- **The coaching ladder**: overachieve at a small program and athletic directors call — accept a job offer to move up (career record travels; the roster stays behind). Elite AI programs also poach breakout small-school coaches, so the whole carousel is alive.
- **Team culture**: name up to two captains per squad; chemistry (morale + discipline + captain leadership + coach culture) feeds weekly development and race-day performance, and high-leadership captains mentor freshmen.
- **Coach rankings**: a national coach leaderboard (titles + polls + résumé) — the scoreboard for becoming the greatest coach in NCAA history.
- **Race logs**: every athlete's last 8 races on their player card.

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

