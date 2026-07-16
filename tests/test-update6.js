// Update 6 — "Every Dynasty Tells a Story" (spec Part 1).
// Drives the real game headless: the multi-step creation wizard, Legacy
// Dynasty Mode (retire → successor, world persists), coaching trees, the
// training overhaul (merged easy run, championship simulation, periodization,
// adaptation, recovery weeks), CPU training intelligence tiers, CPU wave
// recruiting + pivots, generational HS/INT-only sourcing, staff management,
// and elite assistant offers for sitting head coaches.
const { chromium } = require('playwright');
const { wireErrors, launchOpts } = require('./helpers');
const path = require('path');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // ---- 1) The creation wizard, step by step, with identity fields ----
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.click('#btn-new');
  await page.waitForSelector('#coach-first');
  await page.fill('#coach-first', 'Rae');
  await page.fill('#coach-last', 'Solano');
  await page.fill('#coach-age', '41');
  await page.fill('#coach-town', 'Cedarfalls, OR');
  await page.fill('#coach-alma', 'Willamette State');
  await page.click('#btn-next');                       // → appearance
  await page.waitForSelector('[data-portrait]');
  await page.click('#rand-portrait');                  // randomize works
  await page.click('#btn-next');                       // → archetype
  await page.waitForSelector('[data-arch]');
  ok(await page.$eval('#btn-next', (b) => b.disabled), 'archetype must be mandatory');
  await page.click('[data-arch="Developer"]');
  await page.click('#btn-next');                       // → training philosophy
  await page.waitForSelector('[data-tp]');
  await page.click('#btn-next');                       // → race philosophy
  await page.waitForSelector('[data-rp]');
  await page.click('#btn-next');                       // → summary
  await page.waitForSelector('.wizard-summary-box');
  await page.click('#btn-next');                       // → school select
  await page.waitForSelector('.school-pick');
  await page.click('.school-pick');
  await page.click('#btn-start');
  await page.waitForSelector('#sidebar');

  const created = await page.evaluate(() => {
    const c = window.XCD.ui.state.game.getPlayerCoach();
    return { name: c.fullName, age: c.age, hometown: c.hometown, alma: c.almaMater };
  });
  ok(created.name === 'Rae Solano', 'wizard name not applied');
  ok(created.age === 41, 'wizard age not applied: ' + created.age);
  ok(created.hometown === 'Cedarfalls, OR', 'wizard hometown not applied');
  ok(created.alma === 'Willamette State', 'wizard alma mater not applied');
  console.log('wizard:', JSON.stringify(created));

  // ---- 2) Training overhaul: workouts, periodization, adaptation ----
  const training = await page.evaluate(() => {
    const D = window.XCD.data;
    const TE = window.XCD.engine.Training;
    const build = TE.planMetaFor(['easy', 'intervals', 'easy', 'tempo', 'easy', 'long', 'easy']);
    const recov = TE.planMetaFor(['easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy']);
    const sim = TE.planMetaFor(['easy', 'racesim', 'easy', 'easy', 'easy', 'easy', 'easy']);
    const doubleSim = TE.planMetaFor(['easy', 'racesim', 'easy', 'racesim', 'easy', 'easy', 'easy']);
    const legacy = TE.normalizePlan(['easy', 'intervals', 'recovery', 'tempo', 'easy', 'long', 'recovery']);
    return {
      noRecoveryWorkout: !D.WORKOUTS.recovery,
      hasRaceSim: !!D.WORKOUTS.racesim && D.WORKOUTS.racesim.hard,
      easyRestorative: D.WORKOUTS.easy.fatigue < 0,
      legacyMapped: legacy.every((k) => k !== 'recovery') && legacy.filter((k) => k === 'easy').length === 4,
      recovWeekTone: recov.quality.tone,
      simSharper: sim.racesimDays === 1,
      doubleSimPunished: doubleSim.injuryMult > sim.injuryMult * 1.15,
      phases: (D.TRAINING_PHASES || []).length,
      buildFitsBuild: D.trainingPhaseForWeek(5).fit(build),
      buildFightsChamp: !D.trainingPhaseForWeek(14).fit(build),
      recovFitsChamp: D.trainingPhaseForWeek(14).fit(recov)
    };
  });
  console.log('training:', JSON.stringify(training));
  ok(training.noRecoveryWorkout, 'recovery workout should be merged away');
  ok(training.hasRaceSim, 'championship simulation missing');
  ok(training.easyRestorative, 'easy run should be restorative');
  ok(training.legacyMapped, 'legacy recovery plans must map to easy');
  ok(training.recovWeekTone === 'good', 'recovery week should read as strategy, not a warning');
  ok(training.doubleSimPunished, 'two race sims in a week must be punished');
  ok(training.phases === 7, 'expected 7 periodization phases (Update 13 adds Postseason Recovery + Track Prep, replacing Transition)');
  ok(training.buildFitsBuild && training.buildFightsChamp && training.recovFitsChamp, 'phase fit logic wrong');

  // ---- 3) CPU training intelligence tiers ----
  const cpu = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const TE = window.XCD.engine.Training;
    const CAL = window.XCD.data.CALENDAR;
    const mk = (t, p, id) => ({ id, training: t, peaking: p, archetype: 'Tactician', hasTendency: () => false });
    const wk = g.week;
    g.week = CAL.NATIONAL_WEEK; // championship week
    let poorHammers = 0, eliteTapers = 0;
    for (let i = 0; i < 30; i++) {
      const poor = TE.aiPlan(g, mk(30, 30, 'poor' + i));
      const elite = TE.aiPlan(g, mk(85, 85, 'elite' + i));
      if (poor.filter((d) => window.XCD.data.WORKOUTS[d].hard).length >= 3) poorHammers++;
      if (elite.filter((d) => window.XCD.data.WORKOUTS[d].hard).length <= 1) eliteTapers++;
    }
    // Elite staffs rehearse championships late in the regular season.
    g.week = CAL.MEET_WEEKS[CAL.MEET_WEEKS.length - 2] - 1;
    const eliteSharp = TE.aiPlan(g, mk(85, 85, 'elite-x'));
    g.week = wk;
    return { poorHammers, eliteTapers, eliteUsesSim: eliteSharp.includes('racesim') };
  });
  console.log('cpu tiers:', JSON.stringify(cpu));
  ok(cpu.poorHammers >= 8, 'poor staffs should often overtrain through championships: ' + cpu.poorHammers);
  ok(cpu.eliteTapers === 30, 'elite staffs must always taper championships: ' + cpu.eliteTapers);
  ok(cpu.eliteUsesSim, 'elite staffs should rehearse with race simulations');

  // ---- 4) Recruiting: generational sourcing, wave boards, pivots ----
  const rec = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const RE = window.XCD.engine.Recruiting;
    const rng = new window.XCD.core.SeededRNG(777);
    const genSources = {};
    for (let i = 0; i < 25; i++) {
      const cls = RE.generateClass(g, rng);
      Object.values(cls).forEach((r) => {
        if (r.generational) genSources[r.source] = (genSources[r.source] || 0) + 1;
      });
    }
    RE.generateClass(g, rng);
    g.week = 3;
    for (let w = 0; w < 3; w++) { RE.processWeek(g, rng); g.week++; }
    const R = g.recruiting;
    const elite = Object.values(g.world.schools).filter((s) => s.prestige >= 75 && s.id !== g.playerSchoolId);
    const boards = elite.map((s) => R.aiBoards[s.id]).filter(Boolean);
    const waved = boards.filter((b) => b.M.length <= 4 && b.W.length <= 4).length;
    return { genSources, eliteBoards: boards.length, waved };
  });
  console.log('recruiting:', JSON.stringify(rec));
  ok(!rec.genSources.JUCO, 'generational talents must never come from JUCO');
  ok(Object.keys(rec.genSources).length > 0, 'no generational talents in 25 classes');
  ok(rec.eliteBoards > 0 && rec.waved >= rec.eliteBoards * 0.8, 'elite first-wave boards should be small');

  // ---- 5) Staff management: candidates, hire, mentor link ----
  // Staffing is an offseason activity (spec Part 2, Section 12).
  await page.evaluate(() => { window.XCD.ui.state.game.week = 17; });
  await page.click('[data-nav="school"]');
  await page.waitForSelector('#btn-manage-staff');
  const asstBefore = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    return g.getCoach(g.getPlayerSchool().assistantId).fullName;
  });
  await page.click('#btn-manage-staff');
  await page.waitForSelector('[data-hire]');
  const candCount = await page.$$eval('[data-hire]', (els) => els.length);
  await page.click('[data-hire="0"]');
  await page.waitForTimeout(150);
  const staff = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const a = g.getCoach(g.getPlayerSchool().assistantId);
    return { name: a.fullName, mentor: a.mentorName, role: a.role };
  });
  console.log('staff:', candCount, asstBefore, '→', JSON.stringify(staff));
  ok(candCount === 3, 'expected 3 assistant candidates');
  ok(staff.name !== asstBefore, 'hire must replace the incumbent');
  ok(staff.mentor && staff.role === 'Assistant', 'hired assistant must be linked to the head coach');

  // One staff hire per offseason, and never mid-season (spec Part 2, §12).
  const staffRule = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Coaching;
    const second = C.hireAssistant(g, C.assistantCandidates(g)[1]);
    g.week = 6;
    const inSeason = C.canHireAssistant(g);
    g.week = 17;
    return { secondBlocked: !second.ok, inSeasonBlocked: !inSeason.ok };
  });
  ok(staffRule.secondBlocked, 'a second staff hire in the same offseason must be blocked');
  ok(staffRule.inSeasonBlocked, 'staff hires must be blocked during the season');

  // ---- 6) Elite assistant offers for a proven head coach ----
  const eliteOffer = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Careers;
    g.getPlayerCoach().reputation = 55;
    let added = null;
    for (let i = 0; i < 200 && !added; i++) {
      g.jobOffers = null;
      C.generateOffers(g, new window.XCD.core.SeededRNG(9000 + i));
      added = g.jobOffers && g.jobOffers.offers.find((o) => o.assistantRole);
    }
    g.jobOffers = null; // don't actually take it — this dynasty retires below
    return { found: !!added, kind: added && added.kind };
  });
  console.log('elite assistant offer:', JSON.stringify(eliteOffer));
  ok(eliteOffer.found && eliteOffer.kind === 'Elite assistant post', 'elite assistant offers never generate');

  // ---- 7) Legacy Dynasty Mode: retire → successor, world persists ----
  const pre = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    while (g.seasonPhase !== 'Offseason') { g.weeklyFlow.trainingConfirmed = true; g.weeklyFlow.recruitingDone = true; g.advanceWeek(); }
    return {
      coach: g.getPlayerCoach().fullName,
      school: g.getPlayerSchool().name,
      schools: Object.keys(g.world.schools).length,
      athletes: Object.keys(g.world.athletes).length,
      canRetire: window.XCD.engine.Careers.canRetire(g)
    };
  });
  ok(pre.canRetire, 'retirement must be available in the offseason');
  await page.click('[data-nav="school"]');
  await page.waitForSelector('#btn-retire-coach');
  await page.click('#btn-retire-coach');
  await page.waitForSelector('#btn-retire-confirm');
  await page.click('#btn-retire-confirm');
  await page.waitForSelector('#coach-first');           // succession wizard
  await page.fill('#coach-first', 'Nova');
  await page.fill('#coach-last', 'Reyes');
  await page.click('#btn-next');
  await page.waitForSelector('[data-portrait]');
  await page.click('#btn-next');
  await page.waitForSelector('[data-arch]');
  await page.click('[data-arch="Recruiter"]');
  await page.click('#btn-next');
  await page.waitForSelector('[data-tp]');
  await page.click('#btn-next');
  await page.waitForSelector('[data-rp]');
  await page.click('#btn-next');
  await page.waitForSelector('.wizard-summary-box');
  await page.click('#btn-next');
  await page.waitForSelector('.school-pick');           // program select (default: stay)
  await page.click('#btn-start');
  await page.waitForSelector('#sidebar');

  const post = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    return {
      coach: g.getPlayerCoach().fullName,
      school: g.getPlayerSchool().name,
      seasons: g.career.seasons,
      lineage: (g.history.playerCareers || []).map((p) => p.name),
      registryHasPlayer: (g.history.coachRegistry || []).some((r) => r.isPlayer),
      schools: Object.keys(g.world.schools).length,
      athletes: Object.keys(g.world.athletes).length,
      chairs: Object.values(g.world.schools).every((s) => s.coachId && g.world.coaches[s.coachId]),
      asstChairs: Object.values(g.world.schools).every((s) => s.assistantId && g.world.coaches[s.assistantId])
    };
  });
  console.log('succession:', JSON.stringify(post));
  ok(post.coach === 'Nova Reyes', 'successor not installed');
  ok(post.school === pre.school, 'staying home should be the default');
  ok(post.seasons === 0, 'successor must start a fresh career ledger');
  ok(post.lineage.includes(pre.coach), 'lineage must remember the retired coach');
  ok(post.registryHasPlayer, 'retired player coach missing from the registry');
  ok(post.schools === pre.schools && post.athletes === pre.athletes, 'the world must not reset');
  ok(post.chairs && post.asstChairs, 'every chair must stay filled through succession');

  // ---- 8) Continuity + coaching trees: six more seasons ----
  const longRun = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const CAL = window.XCD.data.CALENDAR;
    let err = null;
    try {
      for (let i = 0; i < CAL.WEEKS_PER_YEAR * 6 + 6; i++) {
        g.weeklyFlow.trainingConfirmed = true;
        g.weeklyFlow.recruitingDone = true;
        g.advanceWeek();
      }
    } catch (e) { err = e.message; }
    const coaches = Object.values(g.world.coaches);
    const asst = coaches.filter((c) => c.role === 'Assistant' && !c.isPlayer);
    const trees = coaches.filter((c) => (c.coachingTree || []).length).length +
      (g.history.coachRegistry || []).filter((r) => (r.coachingTree || []).length).length;
    const rosterSizes = Object.values(g.world.schools).map((s) => Math.min(s.rosterM.length, s.rosterW.length));
    return {
      err, year: g.year,
      coach: g.getPlayerCoach() && g.getPlayerCoach().fullName,
      mentored: asst.filter((c) => c.mentorName).length, asstCount: asst.length,
      trees,
      thinRosters: rosterSizes.filter((n) => n < 7).length
    };
  });
  console.log('long run:', JSON.stringify(longRun));
  ok(!longRun.err, 'simulation error after succession: ' + longRun.err);
  ok(longRun.coach === 'Nova Reyes', 'player coach lost during long run');
  ok(longRun.mentored >= longRun.asstCount * 0.9, 'assistants should carry mentor links');
  ok(longRun.trees > 0, 'coaching trees should form over six seasons');
  ok(longRun.thinRosters === 0, 'rosters must stay healthy across generations');

  await browser.close();

  if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); }
  if (fails.length) { console.error('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
  if (errors.length) { process.exit(1); }
  console.log('PASS');
}

run().catch((e) => { console.error(e); process.exit(1); });
