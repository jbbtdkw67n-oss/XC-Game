// Phase 1 test: Update 2 calendar (21 weeks), full-season advance via UI,
// rollover->dashboard, world conference filter, schedule rendering.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await newDynasty(page);

  // Advance through one full year via the UI button (21 weeks)
  const log = [];
  for (let i = 0; i < 21; i++) {
    const info = await page.evaluate(() => {
      const g = window.XCD.ui.state.game;
      const meets = (g.season.byWeek[g.week] || []).length;
      return { week: g.week, year: g.year, meets };
    });
    log.push(info);
    // Complete the mandatory weekly flow (tested in depth elsewhere)
    await page.evaluate(() => { window.XCD.ui.state.game.weeklyFlow = { trainingConfirmed: true, recruitingDone: true }; });
    await page.click('#btn-advance-week');
    await page.waitForTimeout(120);
    if (errors.length) break;
  }
  console.log('weeks:', log.map((l) => `${l.week}:${l.meets}m`).join(' '));

  // After rollover we should be on the dashboard in year+1 week 1
  const post = await page.evaluate(() => ({
    week: window.XCD.ui.state.game.week,
    year: window.XCD.ui.state.game.year,
    screen: window.XCD.ui.state.currentScreen
  }));
  console.log('after year:', JSON.stringify(post));
  if (post.week !== 1 || post.screen !== 'dashboard') errors.push('ROLLOVER did not land on dashboard week 1: ' + JSON.stringify(post));

  // Verify season structure: summer weeks 1-3 empty, meets at 4/6/8/10/12
  // with byes at 5/7/9/11, championships 13/14/15, offseason 16-21 empty.
  const structure = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const out = {};
    for (let w = 1; w <= 21; w++) out[w] = (g.season.byWeek[w] || []).length;
    const elite = Object.values(g.season.meets).filter((m) => m.elite).map((m) => m.name);
    return { out, elite };
  });
  console.log('season meets by week:', JSON.stringify(structure));
  const s = structure.out;
  [4, 6, 8, 10, 12, 13, 14, 15].forEach((w) => { if (!s[w]) errors.push(`No meets scheduled week ${w}`); });
  [1, 2, 3, 5, 7, 9, 11, 16, 17, 18, 19, 20, 21].forEach((w) => { if (s[w]) errors.push(`Unexpected meets week ${w}`); });
  if (structure.elite.length < 5) errors.push('Elite invitationals missing: ' + JSON.stringify(structure.elite));
  if (!structure.elite.includes('Nuttycombe Invitational')) errors.push('No Nuttycombe on the calendar');

  // Nationals results exist?
  const nats = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const years = Object.keys(g.history.nationalChampions || {});
    return years.length;
  });
  if (!nats) errors.push('No national champion recorded after a full season');

  // World conference filter sweep (crash-fix regression)
  await page.click('[data-nav="world"]');
  await page.waitForSelector('#conf-filter');
  const options = await page.$$eval('#conf-filter option', (els) => els.map((e) => e.value));
  for (const conf of options.slice(0, 12)) {
    await page.selectOption('#conf-filter', conf);
    await page.waitForTimeout(30);
    const hasTable = await page.$('#world-table table');
    if (!hasTable) errors.push(`NO TABLE after selecting ${conf}`);
  }
  // The select must survive the redraw (it should never be rebuilt)
  const selAlive = await page.$('#conf-filter');
  if (!selAlive) errors.push('conf-filter select was destroyed');

  // Schedule screen renders
  await page.click('[data-nav="schedule"]');
  await page.waitForTimeout(100);

  // Sim a second full year quickly in-engine
  const simErr = await page.evaluate(() => {
    try { const g = window.XCD.ui.state.game; for (let i = 0; i < 21; i++) g.advanceWeek(); return null; }
    catch (e) { return e.message + '\n' + e.stack; }
  });
  if (simErr) errors.push('YEAR2 SIM ERROR: ' + simErr);

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
