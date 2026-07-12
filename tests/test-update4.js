// Update 4 test suite. Verifies the deep-dynasty additions:
//  - Coaching philosophies: permanent training philosophy (scales with
//    Training) + changeable race philosophy; assigned to AI + player.
//  - Rich accolades: division/conference/year-stamped, never overwritten,
//    persisting into the alumni ledger after graduation.
//  - Universal profile navigation: program/coach/athlete profiles open from
//    rankings, champions, awards, and meet results without crashing.
//  - Champions + Awards pages: D1/D2/D3 + conference sections.
//  - Custom race scheduling: prestige-gated meet selection + rest weeks.
//  - Dynamic prestige seeds + heritage resilience.
//  - Preseason individual rankings.
//  - Save migration to v5.
//  - Stability: rapid modal/tab/filter interaction, no errors.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  await newDynasty(page);
  page.setDefaultTimeout(300000);
  const fail = (m) => errors.push(m);
  const bail = (label) => {
    if (errors.length) { console.log(label + ' ERRORS:\n' + errors.join('\n')); return true; }
    return false;
  };

  // ---- 1) Coaching philosophies exist + are viable/varied ----
  const philo = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const TE = window.XCD.engine.Training;
    const coach = g.getPlayerCoach();
    coach.trainingPhilosophy = 'speed'; coach.training = 90;
    const strong = TE.philosophyEffect(coach).strength;
    coach.training = 25;
    const weak = TE.philosophyEffect(coach).strength;
    // AI variety: more than one distinct philosophy across the world.
    const tset = new Set(), rset = new Set();
    Object.values(g.world.coaches).forEach((c) => { tset.add(c.trainingPhilosophy); rset.add(c.racePhilosophy); });
    coach.trainingPhilosophy = 'norwegian';
    return { scalesWithTraining: strong > weak, tKinds: tset.size, rKinds: rset.size,
      allValid: [...tset].every((k) => window.XCD.data.trainingPhilosophy(k).key === k) };
  });
  if (!philo.scalesWithTraining) fail('training philosophy does not scale with Training rating');
  if (philo.tKinds < 3) fail('too little AI training-philosophy variety: ' + philo.tKinds);
  if (philo.rKinds < 3) fail('too little AI race-philosophy variety: ' + philo.rKinds);
  if (!philo.allValid) fail('invalid training philosophy assigned to a coach');
  console.log('philosophies: ' + JSON.stringify(philo));
  if (bail('PHILOSOPHY')) { await browser.close(); process.exit(1); }

  // ---- 2) Race philosophy changeable via My Program ----
  await page.evaluate(() => window.XCD.ui.navigate('school'));
  await page.waitForSelector('[data-race-philo]');
  await page.click('[data-race-philo="pack"]');
  const racePhilo = await page.evaluate(() => window.XCD.ui.state.game.getPlayerCoach().racePhilosophy);
  if (racePhilo !== 'pack') fail('race philosophy did not change to pack: ' + racePhilo);
  console.log('race philosophy change: ok');

  // ---- 3) Prestige seeds + heritage ----
  const prestige = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const di = Object.values(g.world.schools).filter((s) => (s.division || 'DI') === 'DI')
      .sort((a, b) => b.prestige - a.prestige).slice(0, 8).map((s) => s.name);
    const nau = Object.values(g.world.schools).find((s) => s.name === 'Northern Arizona');
    return { top: di, nauPrestige: nau && nau.prestige, nauHeritage: nau && nau.heritage };
  });
  if (!(prestige.nauHeritage >= 80)) fail('NAU heritage not seeded: ' + JSON.stringify(prestige));
  if (!prestige.top.slice(0, 5).includes('Northern Arizona')) fail('NAU not near the top of DI prestige');
  console.log('prestige seeds: ' + JSON.stringify(prestige));

  // ---- 4) Simulate several seasons (auto), collect accolades ----
  const sim = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.recruiting.auto = true;
    for (let i = 0; i < 66; i++) { g.weeklyFlow.trainingConfirmed = true; g.weeklyFlow.recruitingDone = true; g.advanceWeek(); }
    const L = window.XCD.engine.Legacy;
    // accolade coverage: types present across active + alumni
    const types = {}; let multiDiv = 0;
    const scan = (a) => {
      const divs = new Set();
      (a.accolades || []).forEach((x) => { types[x.type] = (types[x.type] || 0) + 1; if (x.division) divs.add(x.division); });
      if (divs.size >= 2) multiDiv++;
    };
    Object.values(g.world.athletes).forEach(scan);
    (g.history.alumni || []).forEach(scan);
    // a sample label
    let label = null;
    for (const a of Object.values(g.world.athletes)) for (const x of (a.accolades || [])) if (x.conference) { label = L.accoladeLabel(x); break; }
    return { year: g.year, types, multiDiv,
      alumniHaveAccolades: (g.history.alumni || []).some((a) => a.accolades && a.accolades.length),
      sampleLabel: label,
      coachAccolades: Object.values(g.world.coaches).some((c) => (c.coachAccolades || []).length) };
  });
  const needTypes = ['allConference', 'allAmerican', 'natChampTeam', 'confRunnerOfYear', 'freshmanOfYear'];
  needTypes.forEach((t) => { if (!sim.types[t]) fail('missing accolade type after sim: ' + t); });
  if (!sim.alumniHaveAccolades) fail('alumni ledger lost accolades');
  if (!sim.coachAccolades) fail('no coach accolades recorded');
  console.log('accolades: ' + JSON.stringify(sim));
  if (bail('ACCOLADES')) { await browser.close(); process.exit(1); }

  // ---- 5) Preseason individual rankings populate ----
  const pre = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const pi = g.season.preseasonIndividuals;
    return { m: pi && pi.M.length, hasRank1: pi && pi.M.some((r) => r.rank === 1) };
  });
  if (!(pre.m > 50) || !pre.hasRank1) fail('preseason individual rankings not populated: ' + JSON.stringify(pre));
  console.log('preseason individuals: ' + JSON.stringify(pre));

  // ---- 6) Custom scheduling: prestige gate + rest, then sims cleanly ----
  const sched = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const S = window.XCD.engine.Scheduling;
    S.buildOptions(g);
    const weeks = g.season.playerSchedule.weeks;
    // find an elite option and confirm gating matches prestige
    let gateOk = true, eliteSeen = false;
    weeks.forEach((w) => w.options.forEach((o) => {
      if (o.tier === 'Elite') { eliteSeen = true; if (o.eligible !== (g.getPlayerSchool().prestige >= o.prestigeReq)) gateOk = false; }
    }));
    // rest an editable week
    const editable = weeks.find((w) => !w.locked);
    const rest = editable ? S.select(g, editable.week, null) : { ok: false };
    const restedWeek = editable ? editable.week : null;
    const isRest = restedWeek ? !g.season.playerMeetByWeek[restedWeek] : false;
    return { eliteSeen, gateOk, restOk: rest.ok, isRest };
  });
  if (!sched.gateOk) fail('elite meet eligibility does not match prestige gate');
  if (!sched.restOk || !sched.isRest) fail('resting a scheduled week failed');
  console.log('scheduling: ' + JSON.stringify(sched));

  // ---- 7) Champions + Awards pages across divisions (no crashes) ----
  await page.evaluate(() => window.XCD.ui.navigate('history'));
  await page.click('[data-tab="champions"]');
  await page.waitForSelector('[data-champ-div]');
  for (const d of ['DII', 'DIII', 'DI']) await page.click(`[data-champ-div="${d}"]`);
  await page.click('[data-tab="awards"]');
  await page.waitForSelector('[data-award-div]');
  for (const d of ['DII', 'DIII', 'DI']) await page.click(`[data-award-div="${d}"]`);
  const pages = await page.evaluate(() => ({
    champDetails: !!document.querySelector('[data-tab] , details'),
    hasDetails: document.querySelectorAll('details').length
  }));
  console.log('champions/awards pages: ' + JSON.stringify(pages));
  if (bail('PAGES')) { await browser.close(); process.exit(1); }

  // ---- 8) Universal profile navigation from rankings (program/coach) ----
  await page.evaluate(() => window.XCD.ui.navigate('rankings'));
  await page.waitForSelector('[data-school]');
  await page.click('[data-school]');
  await page.waitForSelector('.modal');
  const progOpen = await page.evaluate(() => !!document.querySelector('.modal .player-card-header'));
  await page.evaluate(() => window.XCD.ui.closeModal());
  if (!progOpen) fail('program profile did not open from rankings');
  await page.click('[data-tab="coaches"]');
  await page.waitForSelector('[data-coach]');
  await page.click('[data-coach]');
  await page.waitForSelector('.modal');
  const coachOpen = await page.evaluate(() => !!document.querySelector('.modal'));
  await page.evaluate(() => window.XCD.ui.closeModal());
  if (!coachOpen) fail('coach profile did not open from rankings');
  console.log('universal navigation: ok');
  if (bail('NAV')) { await browser.close(); process.exit(1); }

  // ---- 9) Stability: rapid modal open/close + tab/gender churn ----
  await page.evaluate(async () => {
    const g = window.XCD.ui.state.game;
    const UI = window.XCD.ui;
    const schools = Object.values(g.world.schools);
    const aths = Object.values(g.world.athletes);
    for (let i = 0; i < 40; i++) {
      UI.showSchoolCard(schools[i % schools.length], g);
      UI.closeModal();
      UI.showPlayerCard(aths[(i * 7) % aths.length], g);
      UI.closeModal();
    }
    // churn tabs + genders on rankings
    UI.navigate('rankings');
  });
  for (let i = 0; i < 2; i++) {
    for (const t of ['national', 'region', 'conference', 'individual', 'freshman', 'coaches']) {
      await page.click(`[data-tab="${t}"]`);
      await page.click('#g-w'); await page.click('#g-m');
    }
  }
  // world filter churn (dropdowns)
  await page.evaluate(() => window.XCD.ui.navigate('world'));
  await page.waitForSelector('#div-filter');
  for (const d of ['DII', 'DIII', 'All', 'DI']) await page.selectOption('#div-filter', d);
  await page.waitForTimeout(50);
  if (bail('STABILITY')) { await browser.close(); process.exit(1); }
  console.log('stability sweep: ok');

  // ---- 10) Save migration to v5 + roundtrip ----
  const save = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    const restored = window.XCD.engine.GameState.fromJSON(json);
    const c = restored.getPlayerCoach();
    return { saveVersion: json.saveVersion, hasTP: !!c.trainingPhilosophy, hasRP: !!c.racePhilosophy,
      accoladesKept: Object.values(restored.world.athletes).some((a) => (a.accolades || []).length),
      heritageKept: Object.values(restored.world.schools).some((s) => (s.heritage || 0) > 0) };
  });
  if (save.saveVersion !== 5) fail('save version not 5: ' + save.saveVersion);
  if (!save.hasTP || !save.hasRP) fail('philosophies lost on save/load');
  if (!save.accoladesKept) fail('accolades lost on save/load');
  if (!save.heritageKept) fail('heritage lost on save/load');
  console.log('save migration: ' + JSON.stringify(save));

  if (errors.length) { console.log('FAIL:\n' + errors.join('\n')); await browser.close(); process.exit(1); }
  console.log('PASS');
  await browser.close();
})();
