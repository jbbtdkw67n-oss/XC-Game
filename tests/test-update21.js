// Update 21: clearing Inbox notifications, true 1 km splits, the Pack Report
// without "Pack in field", a sectioned menu, the Week 1 setup card pinned to
// the top of the Dashboard (gone once confirmed), no Trophy Case tile, fixed
// course terrain with year-to-year weather and fast/slow courses, and the
// American Rivers Conference (Wartburg) in Division III — in every filter and
// backfilled into older saves.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page, {});

  /* ---------- 1) Week 1 setup on top of the Dashboard, gone once done ---------- */
  await page.evaluate(() => window.XCD.ui.navigate('dashboard'));
  await page.waitForSelector('.week1-card');
  const w1 = await page.evaluate(() => {
    const first = document.querySelector('#screen-container .card');
    return {
      onTop: !!(first && first.classList.contains('week1-card')),
      trophy: /Trophy Case/.test(document.querySelector('#screen-container').textContent),
      desk: /Coach's Desk/.test(document.querySelector('#screen-container').textContent)
    };
  });
  ok(w1.onTop, 'Week 1 setup is the first card under the Dashboard header');
  ok(!w1.trophy, 'the Trophy Case tile is gone from the Dashboard');
  ok(!w1.desk, "the Coach's Desk card is gone from the Dashboard");
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    Object.assign(g.week1, { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: true });
    window.XCD.ui.navigate('dashboard');
  });
  await page.click('#w1-confirm');
  await page.waitForTimeout(80);
  ok(!(await page.$('.week1-card')), 'the Week 1 card disappears once season setup is confirmed');

  /* ---------- 2) Menu sections ---------- */
  const nav = await page.evaluate(() => ({
    labels: [...document.querySelectorAll('#sidebar .nav-section-label')].map((e) => e.textContent),
    items: [...document.querySelectorAll('#sidebar .nav-item')].map((b) => b.dataset.nav),
    total: window.XCD.ui.NAV_ITEMS.length
  }));
  ok(nav.labels.join('|') === 'This Week|Team|Program|League|Game', 'sidebar is grouped into sections: ' + nav.labels.join('|'));
  ok(nav.items.length === nav.total && new Set(nav.items).size === nav.total, 'every screen appears exactly once in the menu');

  /* ---------- 3) Inbox: clear one, clear a filter, clear all ---------- */
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game; const I = window.XCD.engine.Inbox;
    g.inbox = [];
    I.push(g, { title: 'Injury A', eventType: 'athlete:injured', priority: 2 });
    I.push(g, { title: 'Commit B', eventType: 'recruit:committed', priority: 2 });
    I.push(g, { title: 'Commit C', eventType: 'recruit:committed', priority: 2 });
    I.push(g, { title: 'Result D', eventType: 'race:completed', priority: 1 });
    window.XCD.ui.navigate('inbox');
  });
  await page.waitForSelector('[data-inbox-dismiss]');
  ok((await page.$$('[data-inbox-dismiss]')).length === 4, 'each notification has a clear (✕) button');
  const injuryId = await page.evaluate(() => window.XCD.ui.state.game.inbox.find((i) => i.title === 'Injury A').id);
  await page.click(`[data-inbox-dismiss="${injuryId}"]`);
  await page.waitForTimeout(50);
  const afterOne = await page.evaluate(() => window.XCD.ui.state.game.inbox.map((i) => i.title));
  ok(afterOne.length === 3 && !afterOne.includes('Injury A'), '✕ clears a single notification: ' + afterOne.join(','));
  await page.click('[data-inbox-filter="recruiting"]');
  await page.click('#inbox-clear-all');
  await page.waitForSelector('#inbox-clear-confirm');
  await page.click('#inbox-clear-confirm');
  await page.waitForTimeout(50);
  const afterFilter = await page.evaluate(() => window.XCD.ui.state.game.inbox.map((i) => i.title));
  ok(afterFilter.length === 1 && afterFilter[0] === 'Result D', 'Clear shown removes only the filtered notifications: ' + afterFilter.join(','));
  await page.click('[data-inbox-filter="all"]');
  await page.click('#inbox-clear-all');
  await page.waitForSelector('#inbox-clear-confirm');
  await page.click('[data-modal-close]');
  ok((await page.evaluate(() => window.XCD.ui.state.game.inbox.length)) === 1, 'cancelling the confirm keeps the inbox');
  await page.click('#inbox-clear-all');
  await page.waitForSelector('#inbox-clear-confirm');
  await page.click('#inbox-clear-confirm');
  await page.waitForTimeout(50);
  const cleared = await page.evaluate(() => ({
    n: window.XCD.ui.state.game.inbox.length,
    badge: !!document.querySelector('#btn-inbox .count-badge'),
    disabled: document.querySelector('#inbox-clear-all').disabled
  }));
  ok(cleared.n === 0 && !cleared.badge && cleared.disabled, 'Clear all empties the inbox and the unread badge: ' + JSON.stringify(cleared));

  /* ---------- 4) 1 km splits + Pack Report ---------- */
  const km = await page.evaluate(() => {
    const R = window.XCD.engine.Races;
    const cum8 = Array.from({ length: 12 }, (_, i) => (i + 1) * 120); // even pace: 180 s/km over 8K
    const k8 = R.kmSplits(cum8, 8000);
    const k5 = R.kmSplits(Array.from({ length: 12 }, (_, i) => (i + 1) * 75), 5000);
    const k65 = R.kmSplits(Array.from({ length: 12 }, (_, i) => (i + 1) * 100), 6500);
    return {
      n8: k8.length, kms8: k8.map((k) => k.km).join(','), even: k8.every((k) => Math.abs(k.split - 180) < 0.11),
      end8: k8[k8.length - 1].at, n5: k5.length, n65: k65.length, last65: k65[k65.length - 1]
    };
  });
  ok(km.n8 === 8 && km.kms8 === '1,2,3,4,5,6,7,8' && km.even && km.end8 === 1440, '8K gives eight true 1 km splits: ' + JSON.stringify(km));
  ok(km.n5 === 5, '5K gives five 1 km splits');
  ok(km.n65 === 7 && km.last65.km === 6.5 && Math.abs(km.last65.split - 92.3) < 0.2, 'a partial final km is its own short leg: ' + JSON.stringify(km.last65));

  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.weeklyFlow = { trainingConfirmed: true, recruitingDone: true };
    while (!g.lastPlayerMeetId && g.week < 12) { g.weeklyFlow = { trainingConfirmed: true, recruitingDone: true }; g.advanceWeek(); }
    window.XCD.ui.navigate('racecenter');
  });
  await page.waitForSelector('#btn-skip');
  await page.click('#btn-skip');
  await page.waitForSelector('.pack-report');
  const rc = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const meet = g.season.meets[g.lastPlayerMeetId];
    const res = meet.results.M;
    const txt = document.querySelector('#live-teams').textContent;
    const first = document.querySelector('.km-splits');
    return {
      packInField: /Pack in field/i.test(txt),
      stats: document.querySelectorAll('.pack-report .pack-stat').length,
      perKm: /Your Splits \(per km\)/.test(txt),
      splitCount: first ? first.querySelectorAll('.km-split').length : 0,
      expect: Math.ceil(res.distanceM / 1000)
    };
  });
  ok(!rc.packInField && rc.stats === 2, 'Pack Report drops the "Pack in field" stat: ' + JSON.stringify(rc));
  ok(rc.perKm && rc.splitCount === rc.expect, 'Race Center shows one split per km: ' + JSON.stringify(rc));

  /* ---------- 5) Courses: fixed terrain, weather by year, fast vs slow ---------- */
  const course = await page.evaluate(() => {
    const D = window.XCD.data; const R = window.XCD.engine.Races; const g = window.XCD.ui.state.game;
    const SeededRNG = window.XCD.core.SeededRNG;
    const terrainByCourse = (season) => {
      const out = {};
      Object.values(season.meets).forEach((m) => {
        const name = m.venue || (m.courseMeta && m.courseMeta.course);
        if (name) out[name] = { h: m.conditions.hilliness, a: m.conditions.altitudeFt };
      });
      return out;
    };
    const saved = g.season;
    const y1 = R.newSeason(g, new SeededRNG(101)); const t1 = terrainByCourse(y1); const w1 = y1.weather;
    const y2 = R.newSeason(g, new SeededRNG(202)); const t2 = terrainByCourse(y2); const w2 = y2.weather;
    g.season = saved;
    const shared = Object.keys(t1).filter((k) => t2[k]);
    const sameTerrain = shared.every((k) => t1[k].h === t2[k].h && t1[k].a === t2[k].a);
    const temps = (s) => Object.values(s.meets).map((m) => m.conditions.tempF).join(',');
    const grounds = new Set(Object.values(y1.meets).concat(Object.values(y2.meets)).map((m) => m.conditions.ground));

    const homes = Object.values(g.world.schools).map((s) => D.homeCourseFor(s));
    const speeds = { fast: 0, average: 0, slow: 0 };
    homes.forEach((h) => { speeds[D.courseSpeed(h.hilliness, h.altitudeFt).key]++; });

    // Same runner, same day — only the course / weather changes.
    const a = g.getRoster(g.playerSchoolId, 'M')[0];
    const base = { tempF: 55, windMph: 3, rain: false, ground: 'Firm' };
    const mk = (c) => R.conditionsMultiplier(g, a, { type: 'invite', conditions: Object.assign({}, base, c) }, 'M');
    const fast = mk({ hilliness: 10, altitude: 'Low', altitudeFt: 400 });
    const rolling = mk({ hilliness: 45, altitude: 'Low', altitudeFt: 700 });
    const hilly = mk({ hilliness: 82, altitude: 'Low', altitudeFt: 700 });
    const high = mk({ hilliness: 45, altitude: 'High', altitudeFt: 7000 });
    const muddy = mk({ hilliness: 45, altitude: 'Low', altitudeFt: 700, rain: true, ground: 'Muddy', windMph: 18 });
    return {
      shared: shared.length, sameTerrain, weatherDiffers: temps(y1) !== temps(y2), w1, w2,
      grounds: [...grounds], speeds,
      fast, rolling, hilly, high, muddy,
      labels: [D.courseSpeed(10, 400).key, D.courseSpeed(45, 700).key, D.courseSpeed(70, 600).key, D.courseSpeed(20, 7000).key]
    };
  });
  console.log('courses:', JSON.stringify(course));
  ok(course.shared > 50 && course.sameTerrain, `a course races identical terrain every season (${course.shared} courses compared)`);
  ok(course.weatherDiffers && course.w1 && course.w2 && course.w1.label, 'weather changes year to year: ' + JSON.stringify([course.w1, course.w2]));
  ok(course.grounds.includes('Firm') && course.grounds.some((x) => x !== 'Firm'), 'race-day footing varies (firm / soft / muddy)');
  ok(course.speeds.fast > 30 && course.speeds.slow > 30 && course.speeds.average > 30, 'there are fast, average and slow home courses: ' + JSON.stringify(course.speeds));
  ok(course.labels.join(',') === 'fast,average,slow,slow', 'flat low courses are fast; hilly or high ones slow: ' + course.labels);
  ok(course.fast < course.rolling && course.rolling < course.hilly, 'flat courses run faster than rolling, rolling faster than hilly');
  ok(course.high > course.rolling + 0.008, 'high altitude slows times markedly');
  ok(course.muddy > course.rolling + 0.008, 'mud and wind slow times');
  ok(course.hilly - course.fast > 0.025, 'fast vs slow course spread is meaningful (>2.5%): ' + (course.hilly - course.fast).toFixed(4));

  /* ---------- 6) American Rivers Conference in Division III ---------- */
  const arc = await page.evaluate(() => {
    const g = window.XCD.ui.state.game; const D = window.XCD.data;
    const members = Object.values(g.world.schools).filter((s) => s.conference === 'American Rivers');
    const wart = members.find((s) => s.name === 'Wartburg');
    const confMeet = Object.values(g.season.meets).find((m) => m.type === 'conference' &&
      (m.schoolIds || []).includes(wart && wart.id));
    return {
      n: members.length, allDIII: members.every((s) => s.division === 'DIII'),
      wart: wart ? { div: wart.division, city: wart.city, region: D.ncaaRegionFor(wart), full: wart.rosterM.length >= 14 && wart.rosterW.length >= 14 } : null,
      confMeet: confMeet ? confMeet.schoolIds.length : 0
    };
  });
  ok(arc.n === 9 && arc.allDIII, 'the 9-team American Rivers Conference is in Division III: ' + JSON.stringify(arc));
  ok(arc.wart && arc.wart.city === 'Waverly' && arc.wart.region === 'Central' && arc.wart.full, 'Wartburg: Waverly, DIII Central region, full rosters ' + JSON.stringify(arc.wart));
  ok(arc.confMeet === 9, 'American Rivers runs its own conference championship: ' + arc.confMeet);

  await page.evaluate(() => window.XCD.ui.navigate('world'));
  await page.waitForSelector('#conf-filter');
  ok(await page.evaluate(() => [...document.querySelectorAll('#conf-filter option')].some((o) => o.value === 'American Rivers')), 'World conference filter lists American Rivers');
  await page.selectOption('#div-filter', 'DIII');
  await page.waitForTimeout(60);
  await page.selectOption('#conf-filter', 'American Rivers');
  await page.waitForTimeout(80);
  ok(await page.evaluate(() => /Wartburg/.test(document.querySelector('#world-table').textContent)), 'filtering World by American Rivers shows Wartburg');
  await page.evaluate(() => { window.XCD.ui.navigate('history'); });
  await page.click('[data-tab="boards"]');
  await page.waitForSelector('#board-conf');
  ok(await page.evaluate(() => [...document.querySelectorAll('#board-conf option')].some((o) => o.value === 'American Rivers')), 'History leaderboard conference filter lists American Rivers');

  // Older saves gain the new conference on load.
  const backfill = await page.evaluate(() => {
    const g = window.XCD.ui.state.game; const GS = window.XCD.engine.GameState;
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    const drop = Object.values(json.world.schools).filter((s) => s.conference === 'American Rivers').map((s) => s.id);
    drop.forEach((id) => { delete json.world.schools[id]; });
    json.world.schoolOrder = json.world.schoolOrder.filter((id) => !drop.includes(id));
    json.season = null;
    const loaded = GS.fromJSON(json);
    const again = GS.fromJSON(JSON.parse(JSON.stringify(loaded.toJSON())));
    const count = (gs) => Object.values(gs.world.schools).filter((s) => s.conference === 'American Rivers').length;
    return { dropped: drop.length, loaded: count(loaded), again: count(again), total: Object.keys(again.world.schools).length, before: Object.keys(g.world.schools).length };
  });
  ok(backfill.dropped === 9 && backfill.loaded === 9, 'an older save without the conference gains it on load: ' + JSON.stringify(backfill));
  ok(backfill.again === 9 && backfill.total === backfill.before, 'the backfill is idempotent across reloads');

  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  if (fails.length) {
    console.log('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS — update 21 (inbox clear, 1 km splits, menu, week 1 card, courses & weather, American Rivers)');
}

run().catch((e) => { console.log('FAIL', e); process.exit(1); });
