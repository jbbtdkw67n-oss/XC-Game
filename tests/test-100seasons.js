// 100-season soak test (user request + spec Part 2, Section 20).
// Simulates a full century of dynasty play and verifies the world stays
// coherent: talent pipeline, health rates, rosters, staffs, facilities,
// records, referential integrity, save size, and performance.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page, {});
  const t0 = Date.now();

  // Simulate in 10-season chunks, sampling the world as we go.
  const samples = [];
  for (let chunk = 0; chunk < 10; chunk++) {
    const sample = await page.evaluate(() => {
      const g = window.XCD.ui.state.game;
      const weeks = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
      let err = null;
      try {
        for (let yr = 0; yr < 10; yr++) for (let w = 0; w < weeks; w++) g.advanceWeek();
      } catch (e) { err = e.message + '\n' + (e.stack || '').slice(0, 400); }
      const athletes = Object.values(g.world.athletes);
      const rostered = athletes.filter((a) => a.schoolId);
      const avg = (xs) => xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0;
      return {
        err,
        year: g.year,
        athletes: athletes.length,
        avgOvr: +avg(rostered.map((a) => a.currentOverall)).toFixed(1),
        injuredPct: +(rostered.filter((a) => a.injury).length / rostered.length * 100).toFixed(1),
        recoveringPct: +(rostered.filter((a) => a.health === 'Recovering').length / rostered.length * 100).toFixed(1)
      };
    });
    samples.push(sample);
    console.log(`decade ${chunk + 1}:`, JSON.stringify(sample));
    if (sample.err) break;
  }
  const last = samples[samples.length - 1];
  ok(!last.err, '100-season sim crashed: ' + last.err);
  ok(samples.length === 10 && last.year >= 2125, 'the sim must reach year 100: ' + last.year);

  // World talent must stay stable for a century (no pipeline decay/inflation).
  const ovrs = samples.map((s) => s.avgOvr);
  ok(Math.min(...ovrs) > 32 && Math.max(...ovrs) < 50,
    'world talent must hold steady across 100 seasons: ' + ovrs.join(', '));
  ok(samples.every((s) => s.injuredPct < 6), 'injury rates must stay sane: ' + samples.map((s) => s.injuredPct).join(', '));

  // ---- Century-end integrity sweep ----
  const world = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const schools = Object.values(g.world.schools);
    const FIVE = ['trainingCenter', 'weightRoom', 'rehabCenter', 'indoorTrack', 'alumniCenter'];
    const facBad = schools.filter((s) => {
      const k = Object.keys(s.facilities);
      return k.length !== 5 || FIVE.some((x) => !(s.facilities[x] >= 5 && s.facilities[x] <= 99));
    }).length;
    const noCoach = schools.filter((s) => !s.coachId || !g.world.coaches[s.coachId]).length;
    const noAsst = schools.filter((s) => !s.assistantId || !g.world.coaches[s.assistantId]).length;
    const thinRosters = schools.filter((s) => s.rosterM.length < 14 || s.rosterW.length < 14).length;
    const overDI = schools.filter((s) => (s.division || 'DI') === 'DI' &&
      s.id !== g.playerSchoolId && (s.rosterM.length > 14 || s.rosterW.length > 14)).length;
    let dangling = 0;
    schools.forEach((s) => ['rosterM', 'rosterW'].forEach((k) =>
      s[k].forEach((id) => { if (!g.world.athletes[id]) dangling++; })));
    const champYears = Object.keys(g.history.nationalChampions || {}).length;
    const facAvg = Math.round(schools.reduce((sum, s) => sum + s.facilitiesOverall, 0) / schools.length);
    const json = JSON.stringify(g.toJSON());
    const g2 = window.XCD.engine.GameState.fromJSON(JSON.parse(json));
    const heap = (performance && performance.memory) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
    return {
      schools: schools.length, facBad, noCoach, noAsst, thinRosters, overDI, dangling,
      champYears, facAvg, saveMB: +(json.length / 1048576).toFixed(1),
      reload: g2.year === g.year && Object.keys(g2.world.athletes).length === Object.keys(g.world.athletes).length,
      heapMB: heap
    };
  });
  ok(world.facBad === 0, 'every school must still carry exactly the five facilities: ' + world.facBad);
  ok(world.noCoach === 0 && world.noAsst === 0, `every chair and staff must be filled after a century (${world.noCoach} coachless, ${world.noAsst} assistantless)`);
  ok(world.thinRosters === 0, 'every program must field full squads: ' + world.thinRosters);
  ok(world.overDI === 0, 'CPU Division I programs must respect the 14-athlete limit: ' + world.overDI);
  ok(world.dangling === 0, 'no roster may reference a missing athlete: ' + world.dangling);
  ok(world.champYears >= 100, 'a century of champions must be in the records: ' + world.champYears);
  ok(world.facAvg >= 35 && world.facAvg <= 90, 'AI facility investment must stay believable: avg ' + world.facAvg);
  ok(world.reload, 'the century-old save must round-trip cleanly');
  // A fresh world is ~36 MB (20k living athletes dominate; storage is
  // IndexedDB). History adds ~0.25 MB/season, so a century lands ~60 MB —
  // anything near 90 would mean genuine bloat/leaked references.
  ok(world.saveMB < 90, 'the save must stay a sane size: ' + world.saveMB + ' MB');
  console.log('century integrity:', JSON.stringify(world));
  console.log(`100 seasons in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  ok(errors.length === 0, 'page errors: ' + errors.slice(0, 3).join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-100seasons');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
