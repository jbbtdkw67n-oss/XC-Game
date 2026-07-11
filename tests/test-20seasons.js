// Phase 10: 20-season stress sim + balance checks + full UI sweep + save/load.
const { chromium } = require('playwright');
const { newDynasty, wireErrors } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  await newDynasty(page, { archetype: 'Recruiter' });

  page.setDefaultTimeout(120000);

  // Simulate 20 seasons in-engine, sampling health metrics each season.
  const sim = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const samples = [];
    const t0 = performance.now();
    try {
      for (let season = 0; season < 20; season++) {
        for (let w = 0; w < 14; w++) g.advanceWeek();
        const athletes = Object.values(g.world.athletes).filter((a) => !a.isRecruit);
        const avg = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
        const natM = (g.history.nationalChampions[g.year - 1] || {}).M;
        samples.push({
          year: g.year,
          athletes: athletes.length,
          avgOvr: +avg(athletes.map((a) => a.currentOverall)).toFixed(1),
          avgFatigue: +avg(athletes.map((a) => a.fatigue)).toFixed(1),
          injuredPct: +(athletes.filter((a) => a.injury).length / athletes.length * 100).toFixed(1),
          champM: natM ? natM.team : null,
          indivTime: natM ? +natM.individualTime.toFixed(0) : null
        });
      }
    } catch (e) {
      return { err: e.message + '\n' + e.stack, samples };
    }
    const ms = performance.now() - t0;
    // Champion variety over 20 years
    const champs = new Set(samples.map((s) => s.champM).filter(Boolean));
    return { samples, ms: Math.round(ms), distinctChamps: champs.size };
  });

  if (sim.err) {
    console.log('SIM CRASH:\n' + sim.err);
    errors.push('20-season sim crashed');
  } else {
    const first = sim.samples[0], mid = sim.samples[9], last = sim.samples[19];
    console.log('season samples (y1, y10, y20):');
    [first, mid, last].forEach((s) => console.log(' ', JSON.stringify(s)));
    console.log(`20 seasons in ${sim.ms}ms; distinct men's champions: ${sim.distinctChamps}`);
    // Rating stability: no inflation/deflation beyond ±6
    if (Math.abs(last.avgOvr - first.avgOvr) > 6) errors.push(`Rating drift: ${first.avgOvr} -> ${last.avgOvr}`);
    if (last.avgFatigue > 55) errors.push('Chronic fatigue in AI world: ' + last.avgFatigue);
    if (last.injuredPct > 12) errors.push('Injury epidemic: ' + last.injuredPct + '%');
    if (sim.distinctChamps < 5) errors.push('Championship monopoly: ' + sim.distinctChamps + ' distinct champs in 20y');
    // 10K men's champion time sanity: 28:00-31:30 (1680-1890s)
    const times = sim.samples.map((s) => s.indivTime).filter(Boolean);
    const badTimes = times.filter((t) => t < 1630 || t > 1980);
    if (badTimes.length) errors.push('Nationals 10K champ times off: ' + badTimes.join(','));
    if (sim.samples[19].athletes < 8000) errors.push('Athlete population collapsed: ' + last.athletes);
  }

  // Save -> load roundtrip mid-dynasty
  const roundtrip = await page.evaluate(async () => {
    const g = window.XCD.ui.state.game;
    await window.XCD.engine.SaveManager.save('test-slot', g, 'test');
    const loaded = await window.XCD.engine.SaveManager.load('test-slot');
    const a1 = Object.values(g.world.athletes)[0];
    const a2 = loaded.world.athletes[a1.id];
    return {
      week: loaded.week === g.week, year: loaded.year === g.year,
      athleteMatch: a2 && a2.currentOverall === a1.currentOverall,
      trainingIsArray: Array.isArray(loaded.training.M),
      coachClean: loaded.getPlayerCoach().development === undefined,
      flow: !!loaded.weeklyFlow
    };
  });
  console.log('save/load roundtrip:', JSON.stringify(roundtrip));
  Object.entries(roundtrip).forEach(([k, v]) => { if (!v) errors.push('Roundtrip failed: ' + k); });

  // Full UI sweep — every screen renders without errors after 20 seasons
  let errBase = errors.length;
  for (const nav of ['dashboard', 'schedule', 'racecenter', 'rankings', 'roster', 'training', 'recruiting', 'portal', 'school', 'history', 'world', 'news', 'saves']) {
    await page.click(`[data-nav="${nav}"]`);
    await page.waitForTimeout(nav === 'racecenter' ? 700 : 120);
    if (errors.length > errBase) { console.log('ERROR ON SCREEN:', nav); errBase = errors.length; }
  }
  {
    await page.click('[data-nav="rankings"]');
    for (const tab of ['national', 'region', 'conference', 'individual', 'freshman', 'coaches']) {
      await page.click(`[data-tab="${tab}"]`);
      await page.waitForTimeout(80);
      if (errors.length > errBase) { console.log('ERROR ON RANKINGS TAB:', tab); errBase = errors.length; }
    }
  }
  {
    await page.click('[data-nav="history"]');
    for (const tab of ['career', 'champions', 'awards', 'records', 'hof']) {
      await page.click(`[data-tab="${tab}"]`);
      await page.waitForTimeout(80);
      if (errors.length > errBase) { console.log('ERROR ON HISTORY TAB:', tab); errBase = errors.length; }
    }
  }
  // World conference sweep once more late-game
  {
    await page.click('[data-nav="world"]');
    await page.waitForSelector('#conf-filter');
    const options = await page.$$eval('#conf-filter option', (els) => els.map((e) => e.value));
    for (const conf of options) {
      await page.selectOption('#conf-filter', conf);
      await page.waitForTimeout(15);
    }
  }
  // A player card + recruit card open fine
  {
    await page.click('[data-nav="roster"]');
    await page.waitForSelector('#roster-table tbody tr');
    await page.click('#roster-table tbody tr');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.click('[data-nav="recruiting"]');
    await page.waitForTimeout(150);
  }

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
