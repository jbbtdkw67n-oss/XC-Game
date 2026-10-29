// Update 22: a cleaner Meet Browser, no weather while the schedule is being
// built, wider year-to-year weather on every course, hot days slow / cold
// days fast, and — once the schedule is locked — the clean season schedule
// on top of the Schedule tab with the Meet Browser gone.
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

  /* ---------- 1) Temperature: hot is slower, cold is faster ---------- */
  const temp = await page.evaluate(() => {
    const R = window.XCD.engine.Races; const g = window.XCD.ui.state.game;
    const a = Object.assign({}, g.getRoster(g.playerSchoolId, 'M')[0], { preferredClimate: null });
    const mk = (tempF) => R.conditionsMultiplier(g, a, { type: 'invite',
      conditions: { tempF, windMph: 3, rain: false, ground: 'Firm', hilliness: 40, altitude: 'Low', altitudeFt: 600 } }, 'M');
    return { frigid: mk(20), cold: mk(35), mild: mk(55), hot: mk(85), veryHot: mk(95) };
  });
  console.log('temperature:', JSON.stringify(temp));
  ok(temp.cold < temp.mild && temp.frigid <= temp.cold, 'cold weather makes times faster: ' + JSON.stringify(temp));
  ok(temp.hot > temp.mild && temp.veryHot > temp.hot, 'hot weather makes times slower: ' + JSON.stringify(temp));

  /* ---------- 2) A course's weather varies year to year ---------- */
  const yr = await page.evaluate(() => {
    const R = window.XCD.engine.Races; const g = window.XCD.ui.state.game;
    const SeededRNG = window.XCD.core.SeededRNG;
    const saved = g.season;
    const byKey = {};
    for (let y = 0; y < 6; y++) {
      const s = R.newSeason(g, new SeededRNG(1000 + y * 37));
      Object.values(s.meets).forEach((m) => {
        if (!m.calendarKey) return;
        (byKey[m.calendarKey] = byKey[m.calendarKey] || []).push(m.conditions.tempF);
      });
    }
    g.season = saved;
    const spreads = Object.values(byKey).filter((t) => t.length >= 6).map((t) => Math.max(...t) - Math.min(...t));
    spreads.sort((a, b) => a - b);
    return { courses: spreads.length, median: spreads[Math.floor(spreads.length / 2)], unchanged: spreads.filter((x) => x === 0).length };
  });
  console.log('year-to-year:', JSON.stringify(yr));
  ok(yr.courses > 50 && yr.median >= 12 && yr.unchanged === 0, 'every course\'s race-day temperature swings year to year: ' + JSON.stringify(yr));

  /* ---------- 3) Schedule builder: no weather, compact browser ---------- */
  await page.evaluate(() => window.XCD.ui.navigate('schedule'));
  await page.waitForSelector('#schedule-builder');
  const pre = await page.evaluate(() => {
    const root = document.querySelector('#screen-container');
    const browserEl = document.querySelector('#meet-browser');
    const meet = browserEl && browserEl.querySelector('.sb-meet');
    return {
      weather: /°F|\bmph\b|\bmuddy?\b/i.test(root.textContent),
      weatherHits: [...root.textContent.matchAll(/.{60}(°F|\bmph\b|\bmuddy?\b).{30}/gi)].map((m) => m[0].replace(/\s+/g, ' ')).slice(0, 4),
      browser: !!browserEl,
      meetLines: meet ? meet.querySelectorAll('.sb-meet-sub').length : -1,
      avgPower: /avg Team Power/.test(browserEl ? browserEl.textContent : ''),
      builderFirst: !!document.querySelector('#schedule-builder ~ #meet-browser ~ #season-schedule')
    };
  });
  ok(!pre.weather, 'the schedule creator never reveals race-day weather: ' + JSON.stringify(pre.weatherHits));
  ok(pre.browser && pre.meetLines === 1 && !pre.avgPower, 'the meet browser shows one compact line per meet: ' + JSON.stringify(pre));
  ok(pre.builderFirst, 'while building, the builder and browser come before the season list');

  /* ---------- 4) Locked: clean schedule on top, no browser ---------- */
  await page.click('#btn-finalize-schedule');
  await page.waitForTimeout(120);
  const post = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#screen-container .card')];
    return {
      firstIsSchedule: cards[0] && cards[0].id === 'season-schedule',
      title: cards[0] ? cards[0].querySelector('h2').textContent : '',
      browser: !!document.querySelector('#meet-browser'),
      builder: !!document.querySelector('#schedule-builder'),
      inTheField: !!document.querySelector('[data-if-div]')
    };
  });
  ok(post.firstIsSchedule && /Schedule Finalized/.test(post.title), 'the locked schedule is the first card: ' + JSON.stringify(post));
  ok(!post.browser && !post.builder && !post.inTheField, 'the Meet Browser, builder and In the Field panel disappear once locked: ' + JSON.stringify(post));
  ok(!/🔒/.test(post.title), 'the locked schedule title has no lock symbol: ' + post.title);

  // Race week shows the forecast.
  const fc = await page.evaluate(() => {
    const g = window.XCD.ui.state.game; const UI = window.XCD.ui;
    const m = Object.values(g.season.meets).find((x) => x.week === 4);
    return { far: UI.weatherKnown(g, m), near: UI.weatherKnown(g, Object.assign({}, m, { week: g.week + 1 })) };
  });
  ok(!fc.far && fc.near, 'weather is forecast only close to race week: ' + JSON.stringify(fc));

  if (errors.length) fails.push('page errors:\n' + errors.join('\n'));
  await browser.close();
  if (fails.length) {
    console.log('FAIL\n- ' + fails.join('\n- '));
    process.exit(1);
  }
  console.log('PASS — update 22 (clean meet browser, hidden forecast, weather by year, hot slow / cold fast, locked schedule on top)');
}

run().catch((e) => { console.error(e); process.exit(1); });
