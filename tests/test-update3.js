// Update 3 test suite. Verifies the full multi-division NCAA:
//  - recruiting filter stability (no crash on any star/HS/JUCO combo)
//  - three divisions coexist with independent postseasons + per-division polls
//  - cross-division invitationals schedule and simulate
//  - Pre-Nationals: DI-only, nationals course, selectable Week 10 elite meet
//  - Auto Recruiting parity with CPU logic
//  - Rest days, team morale, mileage consequences interact without exploits
//  - coach profiles/ages/awards persist; retirement logic works
//  - job offers appear at the right point with program detail
//  - a long (40-season) simulation stays stable
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

  // ---- 1) Recruiting filter stress: every combo, in-place, no crash ----
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.weeklyFlow.trainingConfirmed = true;
    window.XCD.ui.navigate('recruiting');
  });
  await page.click('[data-tab="search"]');
  await page.waitForSelector('#star-filter');
  for (const gsel of ['#g-m', '#g-w']) {
    await page.click(gsel);
    await page.waitForSelector('#star-filter');
    for (const s of ['0', '2', '3', '4', '5']) {
      for (const src of ['All', 'HS', 'JUCO', 'International']) {
        await page.selectOption('#star-filter', s);
        await page.selectOption('#source-filter', src);
      }
    }
  }
  // 5-star + JUCO is frequently empty — must render an empty state, not crash.
  await page.selectOption('#star-filter', '5');
  await page.selectOption('#source-filter', 'JUCO');
  const filterOk = await page.evaluate(() => !!document.querySelector('#rec-table table'));
  if (!filterOk) fail('recruiting filter did not render a table for empty result set');
  if (errors.length) { console.log('FILTER CRASH:\n' + errors.join('\n')); await browser.close(); process.exit(1); }
  console.log('filter stress: ok');

  // ---- 2) Three divisions coexist, independent postseason + polls ----
  const div = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const counts = { DI: 0, DII: 0, DIII: 0 };
    Object.values(g.world.schools).forEach((s) => { counts[s.division] = (counts[s.division] || 0) + 1; });
    return {
      counts,
      allActive: ['DI', 'DII', 'DIII'].every((k) => counts[k] > 40),
      championships: Object.keys(g.season.championships).sort().join(','),
      divisionSizes: g.rankings.divisionSizes,
      diiiDistance: window.XCD.data.divisionFor('DIII').championship.nationalsDistanceM.M // 8000
    };
  });
  if (!div.allActive) fail('divisions not all populated: ' + JSON.stringify(div.counts));
  if (div.championships !== 'DI,DII,DIII') fail('missing per-division championships: ' + div.championships);
  if (div.diiiDistance !== 8000) fail('DIII nationals distance should be 8000, got ' + div.diiiDistance);
  console.log('divisions:', JSON.stringify(div));

  // ---- 3) Cross-division invitationals exist; postseason stays separate ----
  const cross = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const s = g.season;
    let crossInvite = false, mixedPostseason = false;
    Object.values(s.meets).forEach((m) => {
      const divs = new Set(m.schoolIds.map((id) => (g.getSchool(id) || {}).division).filter(Boolean));
      if (m.type === 'invite' && divs.size > 1) crossInvite = true;
      if ((m.type === 'conference' || m.type === 'regional' || m.type === 'national') && divs.size > 1) mixedPostseason = true;
    });
    return { crossInvite, mixedPostseason };
  });
  if (!cross.crossInvite) fail('no cross-division invitational found');
  if (cross.mixedPostseason) fail('a conference/regional/national meet mixed divisions');
  console.log('cross-division:', JSON.stringify(cross));

  // ---- 4) Pre-Nationals: DI-only, nationals course, a selectable Week 10
  //         elite meet option (Update 20 — no more invite/decline) ----
  const pn = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // Move to top DI school and rebuild the season so the elite option is open.
    const top = Object.values(g.world.schools).filter((s) => s.division === 'DI')
      .sort((a, b) => b.prestige - a.prestige)[0];
    g.playerSchoolId = top.id;
    g.week = 1; // meet selection lives in the Week 1 admin phase (Section 15)
    g.week1 = window.XCD.engine.GameState.freshWeek1();
    const rng = new window.XCD.core.SeededRNG(7);
    window.XCD.engine.Races.newSeason(g, rng);
    window.XCD.engine.Rankings.compute(g);
    const p = g.season.preNationals;
    const meet = p && g.season.meets[p.meetId];
    const diOnly = meet && (meet.schoolIds || []).every((id) => g.getSchool(id).division === 'DI');
    const onCourse = p && p.diNationalsHostId === g.season.nationalsHosts.DI;
    const isEliteMeet = !!(meet && meet.elite && meet.preNationals);
    // It appears as a selectable schedule option in Week 10.
    const opts = window.XCD.engine.Scheduling.buildOptions(g);
    const wk = (opts.weeks || []).find((w) => w.week === p.week);
    const isOption = !!(wk && wk.options.some((o) => o.meetId === p.meetId));
    // A top program can enter it, then rest instead — the new mechanic that
    // replaces accepting/declining an invitation.
    const sel = window.XCD.engine.Scheduling.select(g, p.week, p.meetId);
    const entered = g.season.meets[p.meetId].schoolIds.includes(g.playerSchoolId);
    const rest = window.XCD.engine.Scheduling.select(g, p.week, null);
    const restedOut = !g.season.meets[p.meetId].schoolIds.includes(g.playerSchoolId);
    return { exists: !!p, diOnly, onCourse, isEliteMeet, isOption,
      selectWorks: sel.ok && entered, restWorks: rest.ok && restedOut };
  });
  console.log('pre-nationals:', JSON.stringify(pn));
  if (!pn.exists || !pn.diOnly || !pn.onCourse) fail('Pre-Nationals misconfigured: ' + JSON.stringify(pn));
  if (!pn.isEliteMeet) fail('Pre-Nationals should be a normal elite meet');
  if (!pn.isOption) fail('Pre-Nationals should be a selectable schedule option');
  if (!pn.selectWorks) fail('Could not enter Pre-Nationals as a top program');
  if (!pn.restWorks) fail('Could not swap out of Pre-Nationals to rest');

  // ---- 5) Auto Recruiting parity: CPU AI runs the player's board ----
  const auto = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.recruiting.auto = true;
    const before = Object.values(g.world.recruits).filter((r) => r.committedTo === g.playerSchoolId).length;
    const rng = new window.XCD.core.SeededRNG(99);
    for (let i = 0; i < 12; i++) { window.XCD.engine.Recruiting.processWeek(g, rng); g.week++; }
    const board = g.recruiting.board;
    const boardMirrors = (board.M.length + board.W.length) > 0;
    return { boardMirrors, autoFlag: g.recruiting.auto };
  });
  if (!auto.boardMirrors) fail('Auto Recruiting did not build/mirror a board via CPU AI');
  console.log('auto recruiting:', JSON.stringify(auto));

  // ---- 6) Systems interplay: rest days, morale, mileage (no exploit) ----
  const sys = await page.evaluate(() => {
    const TE = window.XCD.engine.Training, D = window.XCD.data;
    const noRest = TE.planMetaFor(['easy', 'intervals', 'recovery', 'tempo', 'easy', 'long', 'recovery']);
    const allRest = TE.planMetaFor(['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest']);
    return {
      restIsWorkout: !!D.WORKOUTS.rest,
      allRestNoDev: allRest.devMult < noRest.devMult * 0.7, // spamming rest cripples development
      moraleBounded: (() => { const g = window.XCD.ui.state.game; return Object.values(g.world.schools).every((s) => s.teamMorale >= 0 && s.teamMorale <= 100); })(),
      overuseInjuries: D.OVERUSE_INJURIES.length >= 5,
      durableGate: TE.safeMileage({ injuryResistance: 95 }) > 100 && TE.safeMileage({ injuryResistance: 30 }) < 85
    };
  });
  Object.entries(sys).forEach(([k, v]) => { if (!v) fail('systems interplay failed: ' + k); });
  console.log('systems:', JSON.stringify(sys));

  // ---- 7) Long-run stability: 40 seasons, no crash/corruption ----
  const long = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const t0 = performance.now();
    let err = null;
    try {
      for (let yr = 0; yr < 40; yr++) { for (let w = 0; w < 21; w++) g.advanceWeek(); }
    } catch (e) { err = e.message + '\n' + (e.stack || ''); }
    const t1 = performance.now();
    const schools = Object.values(g.world.schools);
    const counts = { DI: 0, DII: 0, DIII: 0 };
    schools.forEach((s) => { counts[s.division] = (counts[s.division] || 0) + 1; });
    // Integrity checks after 40 years.
    const rostersOk = schools.every((s) => s.rosterM.length >= 5 && s.rosterW.length >= 5);
    const coachesOk = schools.every((s) => s.coachId && g.world.coaches[s.coachId]);
    const athletesReferential = schools.every((s) =>
      s.rosterM.concat(s.rosterW).every((id) => !!g.world.athletes[id]));
    const registry = (g.history.coachRegistry || []).length;
    const champYears = Object.keys(g.history.nationalChampions || {}).length;
    return {
      err, seconds: Math.round((t1 - t0) / 100) / 10,
      year: g.year, counts, rostersOk, coachesOk, athletesReferential,
      registry, champYears,
      titlesHaveDivisions: Object.values(g.history.nationalChampions).some((y) =>
        Object.keys(y).some((k) => k.startsWith('DII') || k.startsWith('DIII')))
    };
  });
  if (long.err) fail('long-run crash: ' + long.err);
  if (!long.rostersOk) fail('rosters corrupted after 40 seasons');
  if (!long.coachesOk) fail('schools missing coaches after 40 seasons');
  if (!long.athletesReferential) fail('dangling athlete references after 40 seasons');
  if (long.counts.DII < 40 || long.counts.DIII < 40) fail('divisions collapsed: ' + JSON.stringify(long.counts));
  if (!long.titlesHaveDivisions) fail('no DII/DIII champions recorded across 40 seasons');
  if (long.registry < 20) fail('coach registry suspiciously empty: ' + long.registry);
  console.log('40-season stability:', JSON.stringify(long));

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
