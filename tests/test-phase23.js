// Phase 2+3 test: weekly planner UI, 7 workouts, 6 core attributes, development.
const { chromium } = require('playwright');
const { newDynasty, wireErrors } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await newDynasty(page);

  // Athletes have exactly the 6 physical ratings, no legacy ones
  const attrCheck = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const a = Object.values(g.world.athletes)[0];
    const legacy = ['endurance', 'rawSpeed', 'kickSpeed', 'fiveKAbility', 'weatherPerformance', 'durability']
      .filter((k) => a[k] !== undefined);
    const core = ['vo2Max', 'runningEconomy', 'stamina', 'injuryResistance', 'lactateThreshold', 'speed']
      .filter((k) => typeof a[k] !== 'number');
    return { legacy, core, overall: a.currentOverall };
  });
  if (attrCheck.legacy.length) errors.push('Legacy attrs present: ' + attrCheck.legacy);
  if (attrCheck.core.length) errors.push('Missing core attrs: ' + attrCheck.core);
  if (!(attrCheck.overall > 10 && attrCheck.overall < 100)) errors.push('Bad overall: ' + attrCheck.overall);

  // Training planner UI: 7 day selects with 7 workout options each
  await page.click('[data-nav="training"]');
  await page.waitForSelector('#week-planner');
  const planner = await page.evaluate(() => {
    const sels = [...document.querySelectorAll('[data-day]')];
    return { days: sels.length, options: sels[0] ? sels[0].options.length : 0 };
  });
  if (planner.days !== 7) errors.push('Planner days: ' + planner.days);
  if (planner.options !== 7) errors.push('Workout options: ' + planner.options);

  // Change Tuesday to Hills via the UI, verify plan state updates
  await page.selectOption('[data-day="1"]', 'hills');
  const planState = await page.evaluate(() => window.XCD.ui.state.game.training.M[1]);
  if (planState !== 'hills') errors.push('Plan not updated: ' + planState);

  // Overtraining plan preview should warn
  for (let i = 0; i < 7; i++) await page.selectOption(`[data-day="${i}"]`, 'intervals');
  const overtraining = await page.evaluate(() => document.querySelector('#plan-preview').textContent);
  if (!/Overtraining/i.test(overtraining)) errors.push('No overtraining warning: ' + overtraining.slice(0, 80));
  await page.click('#btn-balanced');

  // Development over a season: snapshot a freshman, advance 9 weeks
  const before = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const roster = g.getRoster(g.playerSchoolId, 'M');
    const fresh = roster.find((a) => a.classYear === 'Freshman' && a.potential - a.currentOverall > 8) || roster[0];
    return { id: fresh.id, ovr: fresh.currentOverall, sta: fresh.stamina };
  });
  const devErr = await page.evaluate(() => {
    try { const g = window.XCD.ui.state.game; for (let i = 0; i < 9; i++) g.advanceWeek(); return null; }
    catch (e) { return e.message + '\n' + e.stack; }
  });
  if (devErr) errors.push('DEV SIM ERROR: ' + devErr);
  const after = await page.evaluate((id) => {
    const g = window.XCD.ui.state.game;
    const a = g.getAthlete(id);
    const all = Object.values(g.world.athletes);
    const avgFatigue = all.reduce((s, x) => s + x.fatigue, 0) / all.length;
    const injured = all.filter((x) => x.injury).length / all.length;
    const grew = all.filter((x) => (x.seasonDev || 0) > 0).length / all.length;
    return { ovr: a ? a.currentOverall : null, sta: a ? a.stamina : null, avgFatigue, injured, grew };
  }, before.id);
  console.log('dev check:', JSON.stringify({ before, after }));
  if (after.ovr !== null && after.ovr < before.ovr) errors.push('Athlete regressed in-season');
  if (after.avgFatigue > 75) errors.push('World fatigue runaway: ' + after.avgFatigue);
  if (after.injured > 0.15) errors.push('Injury rate too high: ' + after.injured);
  if (after.grew < 0.3) errors.push('Too few athletes developing: ' + after.grew);

  // Race results still sane (times not NaN, ordered)
  const race = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const meet = Object.values(g.season.meets).find((m) => m.results.M);
    const f = meet.results.M.finishers;
    return { ok: f.every((x) => Number.isFinite(x.time)), first: f[0].time, last: f[f.length - 1].time };
  });
  if (!race.ok) errors.push('NaN race times');
  console.log('race times sample:', JSON.stringify(race));

  // Finish the year + one more full year
  const yearErr = await page.evaluate(() => {
    try { const g = window.XCD.ui.state.game; for (let i = 0; i < 19; i++) g.advanceWeek(); return { week: g.week, year: g.year }; }
    catch (e) { return { err: e.message + '\n' + e.stack }; }
  });
  if (yearErr.err) errors.push('YEAR SIM ERROR: ' + yearErr.err);
  else console.log('sim state:', JSON.stringify(yearErr));

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
