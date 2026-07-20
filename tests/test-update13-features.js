// Update 13 feature verification: the NEW mechanics this update introduces —
// Double Threshold, Sway, elite-coach motivation, role-aware reputation tiers,
// Reset Ideal Training, facility decay, Hot Seat 3-season firing, philosophy
// fatigue relief, and the postseason recovery week.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  await newDynasty(page, { archetype: 'Recruiter' });
  page.setDefaultTimeout(120000);
  const fail = (m) => errors.push(m);

  // ---- 1) Data: Double Threshold, Sway, elite-coach motivation, mileage ----
  const data = await page.evaluate(() => {
    const D = window.XCD.data;
    return {
      double: D.WORKOUTS.double,
      easyFatigue: D.WORKOUTS.easy.fatigue,
      sway: D.RECRUIT_ACTIONS.sway,
      eliteCoachMot: D.MOTIVATIONS.some((m) => m.key === 'elite-coach'),
      mileage: D.MILEAGE.DEFAULT,
      asstLegend: D.reputationLevel(85, 'Assistant').label,
      headLegend: D.reputationLevel(85, 'Head').label,
      asstUnknown: D.reputationLevel(5, 'Assistant').label,
      phases: D.TRAINING_PHASES.map((p) => p.key),
      upgradeStep: 1
    };
  });
  if (!data.double || !data.double.hard || data.double.fatigue !== 12) fail('Double Threshold workout missing/mis-tuned: ' + JSON.stringify(data.double));
  // ~2x tempo benefit: tempo attrs sum 4, double should sum ~8.
  const dblSum = Object.values(data.double.attrs).reduce((a, b) => a + b, 0);
  if (dblSum < 7) fail('Double Threshold benefit should ~2x a tempo (~8): ' + dblSum);
  if (data.easyFatigue !== -4) fail('Easy run fatigue should be eased to -4: ' + data.easyFatigue);
  if (!data.sway || data.sway.cost !== 5000 || data.sway.requires !== 'sway') fail('Sway action missing/mis-tuned: ' + JSON.stringify(data.sway));
  if (!data.eliteCoachMot) fail('elite-coach motivation missing');
  if (data.mileage.M !== 75 || data.mileage.W !== 60) fail('Mileage scaling wrong (M75/W60): ' + JSON.stringify(data.mileage));
  if (data.asstLegend !== 'Legend Assistant') fail('assistant Legend tier wrong: ' + data.asstLegend);
  if (data.headLegend !== 'Legend') fail('head Legend tier wrong: ' + data.headLegend);
  if (data.asstUnknown !== 'Unknown') fail('assistant Unknown tier wrong: ' + data.asstUnknown);
  if (!data.phases.includes('recovery') || !data.phases.includes('trackprep')) fail('postseason phases missing: ' + data.phases.join(','));
  console.log('data:', JSON.stringify(data));

  // ---- 2) Periodization Build-phase advice/eval alignment ----
  const period = await page.evaluate(() => {
    const D = window.XCD.data;
    const TE = window.XCD.engine.Training;
    // The recommended build week: 2 quality + long run + a third quality.
    const twoQualityPlusLong = TE.planMetaFor(['easy', 'intervals', 'tempo', 'easy', 'speed', 'long', 'easy']);
    const threeQuality = TE.planMetaFor(['easy', 'intervals', 'tempo', 'easy', 'speed', 'easy', 'easy']);
    return {
      // "2-3 quality PLUS long run" (4 hard incl. long) must NOT be penalized.
      qplLabelTone: twoQualityPlusLong.quality.tone,
      qplDev: twoQualityPlusLong.devMult,
      threeQualDev: threeQuality.devMult,
      // The Build phase (week 5) must FIT the recommended 3-quality+long plan.
      buildFits: D.trainingPhaseForWeek(5).fit(twoQualityPlusLong)
    };
  });
  if (period.qplLabelTone !== 'good') fail('3 quality + long run must read as a good week, not "very heavy": ' + period.qplLabelTone);
  if (period.qplDev < period.threeQualDev) fail('following the build advice must not be penalized vs 3 quality alone: ' + JSON.stringify(period));
  if (!period.buildFits) fail('Build phase must fit its own recommended plan');
  console.log('periodization:', JSON.stringify(period));

  // ---- 3) idealPlanForPhase returns phase-appropriate, phase-fitting plans ----
  const ideal = await page.evaluate(() => {
    const D = window.XCD.data;
    const TE = window.XCD.engine.Training;
    const g = window.XCD.ui.state.game;
    const out = {};
    [[2, 'base'], [5, 'build'], [9, 'specific'], [14, 'championship'], [16, 'recovery'], [18, 'trackprep']].forEach(([wk, key]) => {
      g.week = wk;
      const plan = TE.idealPlanForPhase(g);
      const meta = TE.planMetaFor(plan);
      const phase = D.trainingPhaseForWeek(wk);
      out[key] = { fits: !!(phase.fit && phase.fit(meta)), phase: phase.key };
    });
    return out;
  });
  Object.entries(ideal).forEach(([k, v]) => {
    if (v.phase !== k) fail(`week map wrong for ${k}: got ${v.phase}`);
    if (!v.fits) fail(`Reset Ideal Training plan does not fit the ${k} phase`);
  });
  console.log('ideal plans:', JSON.stringify(ideal));

  // ---- 4) Sway gating (rebuilt): uncommitted → blocked; committed
  //         elsewhere with a real (10%+) commit chance → flip attempt runs ----
  const sway = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const RE = window.XCD.engine.Recruiting;
    g.week = 6; g.recruiting.pointsLeft = 40; g.recruiting.budgetLeft = 100000;
    g.recruiting.actionsThisWeek = {};
    const rec = Object.values(g.world.recruits).find((r) => r.gender === 'M' && !r.signed && !r.committedTo);
    const sid = g.playerSchoolId;
    // Not committed anywhere → Sway refused (it's a flip attempt).
    const st = rec.getSchoolState(sid, true);
    st.interest = 60; st.relationship = 60; st.offered = true;
    const blocked = RE.doAction(g, rec.id, 'sway');
    // Commit them to a rival while we hold a strong position → Sway allowed.
    const rival = Object.values(g.world.schools).find((s) => s.id !== sid);
    rec.committedTo = rival.id;
    const rst = rec.getSchoolState(rival.id, true);
    rst.offered = true; rst.interest = 30; rst.relationship = 30;
    rec.interests = { [sid]: st, [rival.id]: rst };
    const cc = RE.commitChance(g, g.getPlayerSchool(), rec);
    g.recruiting.actionsThisWeek = {};
    g.recruiting.pointsLeft = 40; g.recruiting.budgetLeft = 100000;
    const allowed = RE.doAction(g, rec.id, 'sway');
    const resolved = rec.committedTo === sid ? 'flipped' : 'held';
    return { blockedOk: !blocked.ok, blockedMsg: blocked.message, cc: Math.round(cc * 100), allowedOk: allowed.ok, allowedMsg: allowed.message, resolved };
  });
  if (!sway.blockedOk) fail('Sway must be blocked for uncommitted recruits: ' + sway.blockedMsg);
  if (sway.cc < 10) fail('leading-suitor commit chance should clear the sway gate: ' + sway.cc);
  if (!sway.allowedOk) fail('Sway must run on a committed-elsewhere target: ' + sway.allowedMsg);
  console.log('sway:', JSON.stringify(sway));

  // ---- 5) Elite-coach motivation: reputation swings fit hard ----
  const eliteCoach = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const RE = window.XCD.engine.Recruiting;
    const coach = g.getPlayerCoach();
    const school = g.getPlayerSchool();
    const rec = Object.values(g.world.recruits).find((r) => r.gender === 'W' && !r.signed);
    if (!rec.motivations.includes('elite-coach')) rec.motivations.push('elite-coach');
    const old = coach.reputation;
    coach.reputation = 5;  const low = RE.fitScore(g, school, rec);
    coach.reputation = 90; const high = RE.fitScore(g, school, rec);
    coach.reputation = old;
    return { low, high, gap: +(high - low).toFixed(1) };
  });
  if (eliteCoach.gap < 15) fail('elite-coach motivation should make reputation swing fit a lot: ' + JSON.stringify(eliteCoach));
  console.log('elite-coach motivation:', JSON.stringify(eliteCoach));

  // ---- 6) Philosophy fatigue relief: Norwegian handles double threshold ----
  const relief = await page.evaluate(() => {
    const TE = window.XCD.engine.Training;
    const dbl = TE.planMetaFor(['easy', 'double', 'easy', 'tempo', 'easy', 'long', 'easy']);
    const norwegian = TE.philoFatigueRelief('norwegian', dbl, 75);
    const speed = TE.philoFatigueRelief('speed', dbl, 75); // no double comfort
    return { norwegian: +norwegian.toFixed(3), speed: +speed.toFixed(3) };
  });
  if (!(relief.norwegian < relief.speed)) fail('Norwegian must inflict less fatigue on a double-threshold week: ' + JSON.stringify(relief));
  console.log('philosophy relief:', JSON.stringify(relief));

  // ---- 7) Facility decay: a maintained-then-neglected facility slips ----
  const decay = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const F = window.XCD.engine.Finances;
    // Pick a non-player school, max out a facility, then run 10 yearly refreshes
    // WITHOUT its AI reinvesting on that facility (raise the others high too).
    const s = Object.values(g.world.schools).find((x) => x.id !== g.playerSchoolId);
    Object.keys(s.facilities).forEach((k) => { s.facilities[k] = 90; });
    const before = s.facilities.trainingCenter;
    // Starve the fund so AI can't upgrade, isolating decay.
    let anyDropped = false;
    for (let i = 0; i < 12; i++) {
      const snap = { ...s.facilities };
      const rng = new window.XCD.core.SeededRNG((g.seed ^ (i * 7919)) >>> 0);
      s.budget.facilitiesFund = 0; // no reinvestment
      F.yearlyRefresh(g, rng);
      s.budget.facilitiesFund = 0;
      if (Object.keys(snap).some((k) => s.facilities[k] < snap[k])) anyDropped = true;
    }
    const minLevel = Math.min(...Object.values(s.facilities));
    return { before, after: s.facilities.trainingCenter, anyDropped, minLevel };
  });
  if (!decay.anyDropped) fail('facilities must decay over time without maintenance');
  if (decay.minLevel < 25) fail('facility decay floor breached (should stop at 25): ' + decay.minLevel);
  console.log('facility decay:', JSON.stringify(decay));

  // ---- 8) Hot Seat: three straight Hot Seat seasons fires an AI coach ----
  const hotSeat = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const A = window.XCD.engine.Awards;
    const rng = new window.XCD.core.SeededRNG(99);
    const s = Object.values(g.world.schools).find((x) =>
      x.id !== g.playerSchoolId && x.coachId && g.world.coaches[x.coachId] && !g.world.coaches[x.coachId].isPlayer);
    const coach = g.world.coaches[s.coachId];
    s.prestige = 90; coach.yearsAtSchool = 4;
    // Bury both squads dead last so the seat heats every season.
    const drop = (list) => list.filter((r) => r.schoolId !== s.id);
    g.rankings.M = drop(g.rankings.M); g.rankings.W = drop(g.rankings.W);
    const years = [];
    for (let i = 0; i < 4; i++) {
      if (!s.coachId || !g.world.coaches[s.coachId]) { years.push('fired'); break; }
      A.coachFirings(g, rng);
      years.push({ hot: g.world.coaches[s.coachId] ? g.world.coaches[s.coachId].hotSeatYears : 'fired', has: !!s.coachId });
    }
    return { years, fired: !s.coachId || !g.world.coaches[s.coachId] };
  });
  if (!hotSeat.fired) fail('three straight Hot Seat seasons must fire an AI coach: ' + JSON.stringify(hotSeat.years));
  console.log('hot seat firing:', JSON.stringify(hotSeat));

  // ---- 9) GOAT division weighting: DI edges DII edges DIII for equal feats --
  const goat = await page.evaluate(() => {
    const G = window.XCD.engine.GOAT;
    const acc = (division) => ({ accolades: [{ type: 'natChampIndiv', division }], stats: { races: 10, wins: 5, top5: 8 }, seasons: 4 });
    return { di: G.athleteScore(acc('DI')), dii: G.athleteScore(acc('DII')), diii: G.athleteScore(acc('DIII')) };
  });
  if (!(goat.di > goat.dii && goat.dii > goat.diii)) fail('GOAT division weighting wrong: ' + JSON.stringify(goat));
  // "Noticeable but not overwhelming": DIII within ~30% of DI.
  if (goat.diii < goat.di * 0.6) fail('division gap too large — lower divisions must still rank highly: ' + JSON.stringify(goat));
  console.log('GOAT weighting:', JSON.stringify(goat));

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS test-update13-features');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
