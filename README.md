# Cross Country Dynasty

A browser-based college cross country coaching dynasty game. Coach a program in **NCAA Division I, II, or III** over decades: recruit, train, race, and build the greatest dynasty in NCAA history.

Built entirely in vanilla HTML/CSS/JavaScript — no build step, no backend.

## How to Play

Open `index.html` in any modern browser. That's it.

(If your browser restricts `file://` pages, serve the folder with any static server, e.g. `python3 -m http.server` and open http://localhost:8000.)

## Version 8.0 — Update X: Recruiting Realism & The Living Transfer Market

The recruiting world wakes up: real bidding wars in the portal, a fully
populated Division III, one recruiting economy for humans and CPUs alike,
and no recruit ever left holding an offer nobody honored.

- **Transfer portal bidding wars.** CPU programs no longer stumble into
  the portal at random. Every staff evaluates each transfer against its
  own situation — prestige, roster holes, graduation losses, event needs,
  roster space, recruiting budget, timeline (contender vs. rebuild), and
  the staff's recruiting philosophy. Elite transfers now draw **9–10+
  pursuing schools** and let the market develop before choosing; mid-level
  athletes draw a handful of genuine fits; overlooked runners still hear
  from the programs where they'd matter. The winner skews toward the best
  recruiter and the best program at the table.
- **One recruiting economy for everyone.** CPU schools and Auto
  Recruiting now play by the player's exact rules: the same weekly
  recruiting points, the same yearly budget, the same actions with the
  same costs, gates, and effects. Auto Recruiting spends your real points
  and budget like a competent human assistant — it scouts, calls,
  hosts visits, and extends offers against roster needs until the class
  is filled.
- **Division III lives.** Nearly every D3 program (~95%+) now signs a
  class every year: needs-driven boards, budget-scaled activity, and a
  late-cycle scramble for overlooked recruits. And per NCAA rules, DIII
  programs now **Offer Roster Spots** — never scholarships — everywhere
  in recruiting, while DI/DII keep scholarship language.
- **Every offer gets an answer.** A recruit holding at least one valid
  offer always evaluates the field, ranks the schools, and signs before
  the cycle closes. Only recruits with zero offers go unsigned.
- **A 3,600-recruit national class.** The class grows from 2,400 to
  3,600 (1,800 per gender) so all 727 programs across three divisions can
  genuinely eat — while generational talents still arrive only every
  7–10 years.
- **Assistant careers accelerate.** Assistant reputation now grows from
  the things scouts actually notice: recruiting class rankings (a top-5
  DI class far outweighs a top DII or DIII haul), landing elite portal
  transfers, player development, team success, and conference/national
  titles.
- **CPU fitness management buff.** CPU staffs monitor squad fatigue and
  schedule real recovery weeks, rest struggling runners sooner, taper
  properly into conference and peak again for nationals — even weak
  staffs stop marching exhausted rosters into championship season.
- **Smarter roster building all around.** CPU boards track graduation
  losses, event balance, empty roster spots, redshirt-aware departures,
  and scholarship/roster-spot caps — programs recruit to a long-term
  roster plan, not just the best name available, and dynasties stay
  stable 40+ seasons (soak-verified).
- **The assistant job ladder.** Assistant seats now appear in the job
  market as genuine **step-up moves only**: a head coach grinding at a
  weak program (or sweating a warm seat) gets courted for an elite
  assistant post at a clearly better program, and a low-level assistant
  earns offers for bigger assistant jobs as their recruiting reputation
  grows — alongside their head-coach offers. The ladder runs through
  Division I: a DII seat is a rare flagship call, a DIII seat never
  comes, and no offer is ever lateral or a step down.

## Version 7.9 — Facilities That Matter & Success-Driven Fundraising

Eight decorative facilities become five that genuinely shape training —
verified by a full 100-season soak test.

- **Five living facilities.** 🏋️ **Weight Room** (injury prevention —
  strong bodies break down less), 🏥 **Rehab Center** (faster weekly
  recovery, shorter injury layoffs, less fitness lost while hurt), 🏃
  **Training Center** (development speed and fitness gains for the whole
  roster), 🏟 **Indoor Track** (speed sessions and race simulations
  sharpen more, and Speed develops faster from speed work), and 🎓
  **Alumni Center** (fundraising power). The dead weight — nutrition,
  locker room, altitude room, sports science lab — folds into them; old
  saves migrate automatically, and the facilities panel now states every
  implication on hover.
- **Fundraising follows success and size.** A booster push is now driven
  by how successful the program is (current poll standing, trophy case,
  prestige trajectory) and how big the school is (a power-conference DI
  university dwarfs a DIII college), amplified by the Alumni Center —
  from ~$5k for a struggling small college to $120k+ for a national
  power with a strong donor network. The yearly facilities-fund refill
  compounds with the alumni network too.
- **100-season soak test.** A new `tests/test-100seasons.js` simulates a
  full century (~9 minutes): world talent held flat all hundred years,
  injury/recovery rates stable, every chair and staff filled, every
  roster full and DI-capped, facilities intact, 100 champion years in
  the records, and the save round-trips cleanly.

## Version 7.8 — The Open Coaching Market

Job hunting becomes a real decision with real risk.

- **Every chair, every division.** The offseason dashboard now lists *all*
  open head-coaching jobs in the country — DI, DII, DIII — in one
  organized, scrollable market card. Nothing is hidden behind fit filters:
  the blue-blood dream job is on the board next to the rebuilding DIII
  program.
- **Interest is your chance.** Each listing shows the school's **Interest**
  in you (4–95%) — the literal percent chance an application lands the
  job, built from your reputation, program, results, and hardware against
  what the chair expects. Direct courtships (elite assistant posts,
  assistant promotions) show **Offer** instead and are yours to take.
- **Schools can go another direction.** Apply and fail the roll, and the
  school hires someone else on the spot — the listing greys out ("Went
  another direction"), the chair genuinely fills, and the door stays
  closed for the cycle. Each chair's search outcome is seeded, so
  re-clicking can never reroll a rejection. Rejections cost you nothing
  but the opportunity; your current job is safe.
- **Offseason only.** The market opens with the awards ceremony, moves
  weekly (new searches surface, other chairs fill behind the scenes — all
  in the news), and closes before the season begins. Nothing job-related
  renders on the dashboard in-season.

## Version 7.7 — Assistants That Matter & a Living Job Market

Assistant coaches stop being names on a door (spec Part 2, Sections 12-13 +
the expanded job market).

- **Real coaching value.** An assistant's ratings now feed the systems they
  should: **Dev** multiplies every athlete's weekly development (±12% at
  the extremes), **Cul** feeds squad chemistry, **Mot** lifts struggling
  athletes' morale (a checked-out assistant lets them stew), **Rec** adds
  weekly recruiting points — and powers CPU programs' pushes identically —
  and **Peak** contributes a quarter-weight to championship race-day
  sharpness. Elite assistants are genuinely worth chasing; poor ones
  noticeably underperform.
- **Full comparison profiles.** The Manage Staff panel now shows every
  craft that matters (Rec/Dev/Peak/Cul/Mot/Com/Eval with tooltips
  explaining exactly what each does), both philosophies, age, experience,
  career record, and reputation — plus a Profile button opening the full
  coach card for every candidate.
- **The unemployed pool is real.** Fired and displaced coaches stay in the
  ecosystem: when the pool has anyone, a genuine **free agent** — career
  record, stints, coaching tree and all — replaces one generated candidate
  on the weekly list, badged in the panel.
- **A living job market.** A strong résumé now draws up to **six** head-
  coaching offers across all three divisions in the first wave — and the
  market keeps moving all offseason: new openings surface week to week
  (looser fits included, so there are meaningful choices every cycle) and
  listed vacancies occasionally get filled behind the scenes, all reported
  in the news. Elite assistant posts for sitting head coaches remain.

## Version 7.6 — The Week 1 Administrative Phase

Week 1 becomes the season's front office (spec Part 2, Section 15).

- **The season-setup checklist.** A head coach's Week 1 runs through five
  required tasks on the Dashboard — review the offseason progression
  report, finalize the roster, finalize the schedule, settle the staff
  (keep the assistant or make the one offseason hire), and confirm the
  season setup. **Week 2 stays locked until the checklist is complete**;
  Sim to Race waits too. Assistants are never gated, and the checklist
  resets every rollover.
- **Finalized schedules.** Meet selection and the Pre-Nationals answer now
  live in Week 1 only: pick the slate, then hit **Finalize Schedule** to
  lock it permanently — the selection UI disappears for the season,
  leaving the clean finalized table. Advancing past Week 1 locks the
  slate regardless. Accepting the Pre-Nationals invitation drops it
  straight into the finalized schedule, with a clear ✓ Accepted state
  (no more dead buttons).
- **Division I roster limits.** DI programs carry at most **14 athletes
  per squad**. Enter Week 1 over the limit and the roster task blocks
  until you cut — the Roster screen gains a cut banner and per-athlete
  ✂️ Cut buttons, with overall, potential, class, work ethic, injury
  history, transfer risk, and stats all on hand for the decision. Cut
  athletes enter the portal and land at programs with room (a few walk
  away). **CPU Division I programs make the same intelligent cuts every
  rollover**; DII and DIII rosters stay unlimited.

## Version 7.5 — Live Team Score Projection Overhaul

Team scoring in the Race Center broadcast is now genuinely live (spec
Part 2, Section 17).

- **Every runner, every frame.** The projected team score is recomputed
  continuously from the current position of the entire field — finished
  runners by time, in-progress runners by actual distance covered from
  their real race splits — not from the eventual final order.
- **Real drama.** Standings surge, fade, and trade the lead naturally as
  the race unfolds; team rows carry movement arrows and point gaps back to
  the projected leader, and championship outcomes stay uncertain until the
  last scorers cross.
- **Your scoring detail, live.** A player panel under the board shows your
  projected finish and points, the five currently scoring (tagged ·live
  until they finish), your displacement runners, and the point gaps to the
  leader and the team chasing you.
- **Locked when it's real.** The board reads *Projected* until every
  counted runner (top seven of every scoring team) has finished — then it
  locks, flips to *Final*, and matches the official result exactly.
- **The staffing window** (Section 12 rule): assistant hires are an
  offseason activity — one hire per cycle, with the Manage Staff panel
  explaining the lock during the season. Coaches finish the season they
  signed on for; the CPU's assistant carousel already lives by the same
  yearly rhythm.

## Version 7.4 — High School Personal Bests & Prep History

Recruiting gets a stopwatch (spec Part 2, Section 16): every recruit now
carries an official **5K Personal Best**.

- **Realistic, separate distributions.** Boys' and girls' PBs are generated
  from distinct curves: the nation's elite run genuinely national-class
  times (low-14s / mid-16s) while development projects sit where you'd
  expect, with no artificial spacing — the record realm caps the front,
  believable prep times close the back.
- **Fast now vs. good later.** The PB correlates strongly with current
  ability (overall, stamina, threshold, VO₂ Max) plus race-day noise, but
  potential stays independent enough that a 16:40 kid can hide an elite
  ceiling — and a 14:30 phenom can be nearly a finished product. Balancing
  the stopwatch against the projection is now the recruiting craft.
- **Displayed everywhere.** A sortable 5K PB column on the recruiting
  board, the PB front-and-center on the recruit profile with class year,
  and a permanent **HS 5K PB** line on the college player card, forever.
- **Prep history that follows the athlete.** The best high-school senior in
  each of the 50 states earns a **State Championship** (🏵 permanent badge
  + accolade), NXN now stamps each top-30 **finish** on the athlete for
  life alongside the existing NXN Champion/All-American honors, and all of
  it survives enrollment, transfers, graduation, and the alumni ledger.
- Old saves get deterministic backfilled PBs for the in-progress class.

## Version 7.3 — Transfer Desire & the Transfer Risk Indicator

Transfer decisions become legible (spec Part 2, Section 14 core): every
athlete carries an internal Transfer Desire score — the exact same score the
CPU's portal entries roll against.

- **Five visible levels.** Every rostered athlete's profile now shows a
  **Transfer Risk** indicator — Very Low / Low / Moderate / High / Very
  High — and the roster gains a sortable Risk column. Graduating seniors
  show "finishing career" instead: they never enter the portal.
- **Click to understand.** Expanding the indicator reveals the concrete
  drivers: high risk lists what's pushing them out (poor coach
  relationship, limited development, no racing, injury frustration, a
  program that can't contend…); low risk lists the anchors keeping them
  home (excellent coach relationship, strong team chemistry, consistent
  development, championship contender, winning locker room).
- **New desire inputs.** Development stagnation (real headroom, zero
  growth) and a season lost to the training room now feed transfer desire,
  alongside the existing playing time, culture, morale, relationships,
  homesickness, academics, NIL, training fit, and championship factors.
- **The Zero Morale Rule.** An athlete at rock bottom now almost always
  enters the portal (92%). The only reprieves: an exceptionally strong
  coach or team bond, or a career already in its final season.
- **Program culture matters.** Strong-culture staffs, confident locker
  rooms, and contending programs actively suppress desire, so retention
  naturally varies by school — for the CPU exactly as for you.

## Version 7.2 — Offseason Progression Report & Coaching Logic Fixes

Part 2 of the master spec continues: visible summer development and a fairer
coaching evaluation (Sections 11 + Coaching Logic fixes).

- **The Offseason Progression Report.** Every returning athlete develops
  between seasons — track season, physical maturity, strength gains, aerobic
  development — and the dashboard now presents the full report ahead of
  Week 1: overall before → after for both squads, attribute by attribute
  (VO₂ Max, Economy, Stamina, Threshold, Speed, Consistency, Race IQ), with
  incoming signees tagged. The report persists in the save.
- **Work Ethic is the biggest driver.** Summer is unsupervised: elite
  grinders commonly jump several points while low-effort athletes barely
  move. Underclassmen grow faster than seniors on a realistic maturity
  curve, late bloomers still pop, and injuries or burnout can stall a
  summer entirely. Offseason film sessions also sharpen Race IQ and
  consistency for disciplined, experienced runners.
- **Hot Seat reset (bug fix).** Pressure no longer follows a coach to a new
  school: any job change — head or assistant, player or CPU — starts the
  seat at Stable, with expectations recalculated against the new program
  only. Reputation still travels.
- **Either-program expectations.** Schools now recognize success in either
  gender's squad: the better program carries most of the yearly evaluation
  and a nationally competitive team in either gender actively cools the
  chair. Real pressure only builds when both squads underperform together.

## Version 7.1 — Injury System Expansion: Injuries Shape Careers

Injuries are no longer a temporary absence — they are events a career
remembers (master spec Part 2, Section 10).

- **The layoff has real costs.** An injured runner's fitness bleeds far
  faster than a healthy athlete's (durability and the recovery center slow
  the slide), race sharpness deteriorates every week of the layoff,
  confidence sinks while unable to compete, and morale grinds down harder
  the longer the recovery drags on.
- **Nobody returns at peak form.** When an injury heals the athlete enters a
  visible **Recovering** phase — training quality is reduced, race sharpness
  can't fully peak on rust, and reinjury risk stays elevated — for several
  weeks (longer after longer layoffs) before they're back to full strength.
  Recovering runners can race, but on rebuilding-in-progress fitness,
  sharpness, and confidence. The roster, training planner, dashboard, and
  player card all show the phase and its countdown.
- **A permanent career injury ledger.** Every injury an athlete ever suffers
  is stamped into their profile with the year, week, type, and length — and
  long layoffs are flagged **MAJOR**. The player card renders the full
  history for life.
- **Repeated major injuries shape careers.** One major injury leaves almost
  no scar. A second slightly erodes the development ceiling and slows future
  progression; a third or more cause a noticeable long-term decline — in
  both weekly training development and offseason growth. Athletes never
  suddenly lose ability; their future improvement simply becomes smaller
  than projected, and the player card explains exactly how much ceiling the
  breakdowns have cost.
- **Durability is a genuine roster strategy.** Durable athletes get hurt
  less, recover faster, keep developing, and therefore reach higher
  long-term potential; injury-prone athletes are a real long-term roster
  risk worth weighing on the recruiting trail (Injury Resistance is
  scoutable on every recruit). CPU programs live under exactly the same
  rules.

## Version 7.0 — Update 6: Every Dynasty Tells a Story

Update 6 (the 6.0 master spec, Part 1) turns the game into a living world that
can span centuries: retirement starts the next generation instead of ending
the dynasty, coaching careers connect into family trees, training becomes a
periodized craft, and the CPU recruits and trains like it means it.

- **Legacy Dynasty Mode.** Retiring never ends the dynasty. A new offseason
  **🏁 Retire** action on My Program seals your coach's entire career into the
  permanent record books — the coach registry and a new **Dynasty Lineage**
  ledger on the My Career tab, both viewable forever — then reruns the creation
  wizard for a brand-new successor who can take any chair in the country
  (staying home is the default). Nothing else resets: every program, athlete,
  rivalry, and record continues. Spend generations inside one world.
- **Coach creation rebuilt as a guided wizard.** Six steps like a AAA franchise
  start: identity (name, **age**, **hometown**, **alma mater**, starting
  position), appearance (expanded portrait set with live preview and
  randomize), archetype, training philosophy, race philosophy, and a career
  summary confirmation screen with starting ratings and projected path.
- **Coaching trees.** Every assistant remembers the head coach who first hired
  them (their mentor) and every boss they served under; every head coach's tree
  grows a branch when a former assistant earns their own program — including
  branches added after the mentor retires. Coach profiles render the full tree
  with each protégé's current status. Entire coaching families emerge over
  decades.
- **Training overhaul.** The separate Easy/Recovery runs merge into one
  genuinely restorative **Easy Run** (old plans auto-migrate), and the new
  **Championship Simulation** joins the hard sessions — the biggest sharpness
  stimulus in the game and a confidence rehearsal for fit runners, at heavy
  fatigue/injury cost. The season now moves through six named **periodization
  phases** (Base → Build → Specific → Peak → Championship → Transition) shown
  live on the planner; plans that match the phase develop athletes faster.
  **Training adaptation**: week after week of heavy load dulls the stimulus
  while fresh athletes improve fastest — and a genuinely easy week lets runners
  **absorb** banked hard work into development while body and mind recover.
  Recovery weeks are now legitimate strategy.
- **CPU training intelligence.** AI staffs train at their craft level: elite
  staffs peak correctly, schedule mid-season recovery weeks, rehearse
  championships with race simulations, and rest athletes deep in the red;
  average staffs make occasional odd calls; poor staffs overtrain through race
  weeks, skip the championship taper, and peak too early.
- **CPU wave recruiting.** Elite programs open the cycle laser-focused on 2-4
  elite targets with every push landing harder, expanding the board only after
  commitments land. All boards now **pivot weekly** — once a rival's lead is
  decisive, the CPU drops the lost battle and re-shops the spot instead of
  wasting effort.
- **Generational talent rules.** Once-in-a-generation prospects only originate
  from **high school or international** pipelines — a JUCO transfer can become
  an All-American or a national champion, but never a generational recruit.
- **Staff management.** Head coaches run their staff: a **Manage Staff** panel
  compares the incumbent assistant against three weekly candidates (quality
  scaled by prestige and your Staff Management craft, deterministic per week so
  it can't be reroll-scummed); hiring atomically replaces the incumbent, so no
  program is ever without an assistant.
- **Two-way career paths.** Elite programs occasionally court a proven head
  coach for a **top assistant job** — accepting steps you off your chair (which
  opens for real) and onto a blue-blood staff on the assistant career path,
  with the promotion ladder back to a head job already in place.

## Version 6.0 — Update 5: Living Dynasty & Coaching Careers

Update 5 makes a dynasty feel alive over decades. You can now build a coaching
career from the ground up, athletes carry two-sided loyalty that drives real
transfer stories, every coach's chair carries visible pressure, and elite
talent is guaranteed to keep flowing so Year 30 feels as strong as Year 1.

- **Assistant Coach career path.** Choose your starting role when you create a
  dynasty: begin as a **Head Coach** with full control, or as an **Assistant
  Coach** (recruiting coordinator) who runs *only* recruiting, scholarship
  allocation, and scouting while an established head coach handles training,
  scheduling, redshirts, and race strategy. Build top recruiting classes to
  grow your reputation and earn **head-coaching offers** — recruit your way
  into your own program, then take the reins. Coach creation is identical for
  both paths; only the starting position differs. Saves default every existing
  dynasty to Head Coach.
- **Two-sided athlete loyalty.** The mental model is rebuilt around what
  actually keeps a runner home: **Work Ethic** (drives the biggest offseason
  leaps — 90+ grinders can jump 6-7 overall), **Confidence** (a dynamic belief
  metric built by strong races and PRs, dented by injuries and layoffs, with a
  real race-day payoff), **Mental Toughness** (lose far less on hilly, wet, hot,
  or cold courses), **Academics**, and — new — separate **Coach Relationship**
  and **Team Relationship** attributes. An athlete may stay for a beloved coach
  despite weak team chemistry, or for close friendships despite a frosty staff
  relationship. Both feed the transfer portal with legible, distinct reasons, so
  no two exits feel the same.
- **Coaching expectations & job security.** Every program now carries clear
  annual expectations scaled by prestige, division pressure, budget, history,
  and conference strength, shown on your dashboard. Coach profiles display a
  live **🟢 Stable / 🟠 Warm Seat / 🔥 Hot Seat** status; sustained misses heat
  the seat for AI coaches (who get fired) and for you (you get warned, never
  auto-fired — your dynasty continues).
- **Elite talent that never runs dry.** Every recruiting class is now guaranteed
  a floor of legitimate **blue-chip prospects**, on top of the existing
  ⭐ generational once-in-a-decade talents, so the average Division I runner
  stays as strong deep into a dynasty as on day one.
- **High-altitude programs.** Elevation is a real program characteristic:
  altitude schools get a steady lift to **Stamina** and **Lactate Threshold**,
  but the thin air taxes recovery — athletes fatigue faster, so workload must be
  managed more carefully. A realistic edge, never a free win.
- **Recruiting rating pays off.** A coach's **Recruiting** rating now directly
  buys weekly recruiting points, so elite recruiters meaningfully out-work weak
  ones over many cycles.
- **Nike Cross Nationals (NXN).** A full high-school national championship runs
  the same week as NCAA Nationals. Top prep recruits earn **👟 NXN Champion**
  and **🎽 NXN All-American** honors that stay on their profile forever and are
  carried into college when they enroll — richer recruiting stories, and a
  reason to chase the decorated names.
- **Season Overview dashboard widget.** A season-at-a-glance card: current
  **W–L record**, **national ranking** (M/W), **conference standing**, **next
  opponent**, upcoming meets, and recent results — the player's primary season
  overview.
- **Division-separated recruiting rankings.** D1, D2, and D3 each run their own
  recruiting race, with a within-division rank alongside the national rank, so a
  DII program's #1 DII class is the achievement it should be (and coach
  "best class" ledgers are judged in-division).
- **Lower-division stars can climb.** Exceptionally decorated DII/DIII athletes —
  national champions, multi-time All-Americans, dominant conference champions —
  occasionally draw higher-division interest and may transfer up. Kept uncommon,
  and strong coach/team bonds keep many elite lower-division runners loyal.

Saves upgrade automatically: coaches gain a role, athletes gain their coach/team
relationship attributes (seeded from morale), and every pre-Update-5 dynasty
starts as a Head Coach. Older recruiting-class history renders under Division I.

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

