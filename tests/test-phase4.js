// Phase 4 test: dynamic racing. Measures position changes through the race,
// late-race movement by attribute, fades under fatigue, events, replay UI.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await newDynasty(page);

  // Advance through summer to the week-4 season opener
  const stats = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    for (let i = 0; i < 4; i++) g.advanceWeek();
    const firstMeet = g.season.meets[g.lastPlayerMeetId]; // week-4 race
    for (let i = 0; i < 2; i++) g.advanceWeek();
    const meet = g.season.meets[g.lastPlayerMeetId];      // week-6 race
    const res = meet.results.M;
    const S = window.XCD.engine.Races.SEGMENTS;
    const splits = res.splits;
    const ids = Object.keys(splits);

    // Position of each runner at each segment
    const placeAtIn = (sp, seg) => {
      const arr = Object.keys(sp).map((id) => ({ id, t: sp[id][seg] })).sort((a, b) => a.t - b.t);
      const m = {}; arr.forEach((x, i) => { m[x.id] = i + 1; });
      return m;
    };
    const placeAt = (seg) => placeAtIn(splits, seg);
    const early = placeAt(2);
    const mid = placeAt(7);
    const late = placeAt(9);
    const fin = placeAt(S - 1);

    // Total absolute position change mid->finish (dynamism metric)
    const top40 = res.finishers.slice(0, 40).map((f) => f.athleteId);
    let midToFin = 0, earlyToFin = 0, lateMoves = 0;
    top40.forEach((id) => {
      midToFin += Math.abs(fin[id] - mid[id]);
      earlyToFin += Math.abs(fin[id] - early[id]);
      if (Math.abs(fin[id] - late[id]) >= 2) lateMoves++;
    });

    // Do fast finishers (speed+RE) gain over the closing segments? Pool the
    // ENTIRE field of BOTH early-season races so the quartile means are
    // statistically stable — the old single-race top-40 sample (10 per
    // quartile over two segments) made this assertion flaky.
    const gains = [];
    [firstMeet && firstMeet.results.M, res].filter((r) => r && r.splits).forEach((r) => {
      const lateR = placeAtIn(r.splits, 9);
      const finR = placeAtIn(r.splits, S - 1);
      r.finishers.forEach((f) => {
        const a = g.world.athletes[f.athleteId];
        if (a) gains.push({ spd: a.speed + a.runningEconomy, gain: lateR[f.athleteId] - finR[f.athleteId] });
      });
    });
    gains.sort((a, b) => b.spd - a.spd);
    const topQ = gains.slice(0, Math.floor(gains.length / 4));
    const botQ = gains.slice(-Math.floor(gains.length / 4));
    const avg = (xs) => xs.reduce((s, x) => s + x.gain, 0) / xs.length;

    const winTime = res.finishers[0].time;
    return {
      field: ids.length,
      avgAbsMoveMidToFin: +(midToFin / top40.length).toFixed(2),
      avgAbsMoveEarlyToFin: +(earlyToFin / top40.length).toFixed(2),
      lateMovers: lateMoves,
      fastKickersGain: +avg(topQ).toFixed(2),
      slowKickersGain: +avg(botQ).toFixed(2),
      events: (res.events || []).length,
      eventTypes: [...new Set((res.events || []).map((e) => e.type))],
      winTime8k: winTime
    };
  });
  console.log('race dynamics:', JSON.stringify(stats, null, 1));
  if (stats.avgAbsMoveMidToFin < 2) errors.push('Race too static: avg move mid->fin ' + stats.avgAbsMoveMidToFin);
  if (stats.fastKickersGain <= stats.slowKickersGain) errors.push('Kickers not gaining late');
  if (!stats.events) errors.push('No race events recorded');
  if (stats.winTime8k < 1300 || stats.winTime8k > 1560) errors.push('Winning 8K time off: ' + stats.winTime8k);

  // Ratings still respected: correlation of rating rank vs finish
  const corr = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const meet = g.season.meets[g.lastPlayerMeetId];
    const res = meet.results.M;
    const R = window.XCD.engine.Races;
    const rows = res.finishers.map((f) => ({
      place: f.place,
      rating: R.raceRating(g.world.athletes[f.athleteId], res.distanceM)
    }));
    // Spearman-ish: rank ratings
    const byRating = rows.slice().sort((a, b) => b.rating - a.rating);
    const ratingRank = new Map(); byRating.forEach((r, i) => ratingRank.set(r, i + 1));
    const n = rows.length;
    let d2 = 0;
    rows.forEach((r) => { const d = r.place - ratingRank.get(r); d2 += d * d; });
    return 1 - (6 * d2) / (n * (n * n - 1));
  });
  console.log('rating/finish correlation:', corr.toFixed(3));
  if (corr < 0.55) errors.push('Ratings not respected enough: ' + corr);
  if (corr > 0.965) errors.push('Race outcome too deterministic: ' + corr);

  // Race center replay renders with ticker + moving bars
  await page.click('[data-nav="racecenter"]');
  await page.waitForSelector('#race-track');
  await page.waitForTimeout(2500);
  const ui = await page.evaluate(() => ({
    bars: document.querySelectorAll('[id^="bar-"]').length,
    someProgress: [...document.querySelectorAll('[id^="bar-"]')].some((b) => parseFloat(b.style.width) > 1),
    ticker: !!document.querySelector('.race-ticker'),
    board: document.querySelector('#live-board').textContent.includes('Live Leaders')
  }));
  console.log('race center:', JSON.stringify(ui));
  if (!ui.bars || !ui.someProgress || !ui.ticker || !ui.board) errors.push('Race center replay broken: ' + JSON.stringify(ui));

  // Fatigued runners fade: run a controlled comparison
  const fadeTest = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // Take the player's best runner, race him fresh vs exhausted on the same meet
    const R = window.XCD.engine.Races;
    const roster = g.getRoster(g.playerSchoolId, 'M').sort((a, b) => b.currentOverall - a.currentOverall);
    const star = roster[0];
    const meet = Object.values(g.season.meets).find((m) => m.week === 6 && m.schoolIds.includes(g.playerSchoolId));
    if (!meet) return null;
    const Rng = window.XCD.core.SeededRNG;
    // Compare average TIME (continuous — no place floor when the star wins
    // either way) over enough seeds for a stable mean. The old 6-seed
    // place comparison made this assertion flaky.
    const run = (fatigue) => {
      const old = star.fatigue;
      star.fatigue = fatigue;
      let sum = 0, n = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const res = R.simulateRace(g, meet, 'M', new Rng(seed * 977), true);
        const f = res.finishers.find((x) => x.athleteId === star.id);
        if (f) { sum += f.time; n++; }
      }
      star.fatigue = old;
      return sum / n;
    };
    const freshTime = run(5);
    const gassedTime = run(90);
    return { freshTime: +freshTime.toFixed(1), gassedTime: +gassedTime.toFixed(1) };
  });
  console.log('fatigue fade test:', JSON.stringify(fadeTest));
  if (fadeTest && fadeTest.gassedTime <= fadeTest.freshTime) errors.push('Fatigue has no cost: ' + JSON.stringify(fadeTest));

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
