// 20-season stress sim + balance checks + full UI sweep + save/load.
// Updated for Update 2: 21-week calendar, mileage, reputation, carousel,
// dynamic prestige, generational talents, permanent history ledgers.
const { chromium } = require('playwright');
const { newDynasty, wireErrors } = require('./helpers');

(async () => {
  const launchOpts = process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {};
  const browser = await chromium.launch(launchOpts);
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
      const weeksPerYear = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
      for (let season = 0; season < 20; season++) {
        for (let w = 0; w < weeksPerYear; w++) g.advanceWeek();
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

    // Update 2 systems after 20 seasons
    const coaches = Object.values(g.world.coaches);
    const schools = Object.values(g.world.schools);
    const avg = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
    const prestiges = schools.map((s) => s.prestige);
    const u2 = {
      retiredCoaches: (g.history.coachRegistry || []).length,
      generational: (g.history.generational || []).length,
      alumni: (g.history.alumni || []).length,
      programsTracked: Object.keys(g.history.programs || {}).length,
      schoolsWithoutCoach: schools.filter((s) => !s.coachId || !g.world.coaches[s.coachId]).length,
      avgReputation: +avg(coaches.filter((c) => c.schoolId).map((c) => c.reputation || 0)).toFixed(1),
      legendCount: coaches.filter((c) => (c.reputation || 0) >= 80).length,
      prestigeSpread: Math.max(...prestiges) - Math.min(...prestiges),
      prestigeMoved: schools.filter((s) => {
        const ph = s.prestigeHistory || [];
        return ph.length >= 10 && Math.abs(ph[ph.length - 1].prestige - ph[0].prestige) >= 8;
      }).length,
      avgSharpness: +avg(Object.values(g.world.athletes).filter((a) => !a.isRecruit).map((a) => a.sharpness ?? 0)).toFixed(1)
    };
    return { samples, ms: Math.round(ms), distinctChamps: champs.size, u2 };
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
    // 10K men's champion time sanity. Lower bound relaxed to 26:40 (1600s)
    // for Update 3: peaking + high team morale + Pre-Nationals course
    // familiarity legitimately shave a bit off an elite champion's time.
    // Below 26:40 or above 33:00 would be unrealistic.
    const times = sim.samples.map((s) => s.indivTime).filter(Boolean);
    const badTimes = times.filter((t) => t < 1600 || t > 1980);
    if (badTimes.length) errors.push('Nationals 10K champ times off: ' + badTimes.join(','));
    if (sim.samples[19].athletes < 8000) errors.push('Athlete population collapsed: ' + last.athletes);

    // Update 2 health checks
    const u2 = sim.u2;
    console.log('update-2 systems:', JSON.stringify(u2));
    if (u2.schoolsWithoutCoach > 0) errors.push('Vacant chairs after carousel: ' + u2.schoolsWithoutCoach);
    if (u2.retiredCoaches < 5) errors.push('Coach registry suspiciously empty after 20y: ' + u2.retiredCoaches);
    if (u2.programsTracked < 300) errors.push('Program ledgers missing: ' + u2.programsTracked);
    if (u2.prestigeMoved < 20) errors.push('Prestige too static: only ' + u2.prestigeMoved + ' programs moved 8+ pts');
    if (u2.prestigeSpread < 40) errors.push('Prestige compressed: spread ' + u2.prestigeSpread);
    if (u2.avgReputation < 15 || u2.avgReputation > 75) errors.push('Reputation drift: avg ' + u2.avgReputation);
    if (u2.alumni < 50) errors.push('Alumni ledger empty: ' + u2.alumni);
    // ~1 per 7-8 classes → 0 in 20 years is a ~6% tail; just report it.
    console.log(`generational talents in 20 classes: ${u2.generational}`);
  }

  // Save -> load roundtrip mid-dynasty
  const roundtrip = await page.evaluate(async () => {
    const g = window.XCD.ui.state.game;
    await window.XCD.engine.SaveManager.manualSave(g);
    const loaded = await window.XCD.engine.SaveManager.load(g.dynastyId);
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
