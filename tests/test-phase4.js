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

  // Advance through the early season (at least six weeks, as before) until the
  // player's most recent race is a men's 8K. Schedules are random: the opener
  // can be a week-4 6K, and some teams don't race until week 7, so a fixed
  // week count can land on a 6K or on no race at all.
  const stats = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const R = window.XCD.engine.Races;
    const raced = [];
    const lastMeet = () => g.season.meets[g.lastPlayerMeetId];
    const is8k = (m) => m && m.results.M && m.results.M.distanceM === 8000;
    for (let i = 0; i < 6 || (!is8k(lastMeet()) && g.week <= R.CONFERENCE_WEEK); i++) {
      g.advanceWeek();
      const m = lastMeet();
      if (m && m.results.M && !raced.includes(m)) raced.push(m);
    }
    const meet = lastMeet();
    if (!is8k(meet)) return { error: 'player never raced a men\'s 8K: ' + (meet ? meet.distances.M : 'no race') };
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

    // Do fast finishers (speed + running economy) CLOSE faster than slow
    // finishers? Measured by closing PACE — each runner's final two segments
    // relative to their own average segment — pooled across every race the
    // player has run so far. This is unconfounded by starting position (an
    // elite runner already near the front has no places left to gain, so the old place-change metric
    // was pure noise under the random dynasty seed); a genuine kick shows up as
    // a closing ratio below 1 (speeding up), a fade as a ratio above 1.
    const closers = [];
    raced.map((m) => m.results.M).filter((r) => r && r.splits).forEach((r) => {
      const sp = r.splits;
      Object.keys(sp).forEach((id) => {
        const a = g.world.athletes[id];
        if (!a) return;
        const t = sp[id];
        const avgSeg = t[S - 1] / S;
        const last2 = (t[S - 1] - t[S - 3]) / 2;
        if (avgSeg > 0) closers.push({ spd: a.speed + a.runningEconomy, closeRatio: last2 / avgSeg });
      });
    });
    closers.sort((a, b) => b.spd - a.spd);
    const topQ = closers.slice(0, Math.floor(closers.length / 4));
    const botQ = closers.slice(-Math.floor(closers.length / 4));
    const avg = (xs) => xs.reduce((s, x) => s + x.closeRatio, 0) / xs.length;

    return {
      week: meet.week,
      field: ids.length,
      avgAbsMoveMidToFin: +(midToFin / top40.length).toFixed(2),
      avgAbsMoveEarlyToFin: +(earlyToFin / top40.length).toFixed(2),
      lateMovers: lateMoves,
      fastKickersClose: +avg(topQ).toFixed(3),
      slowKickersClose: +avg(botQ).toFixed(3),
      events: (res.events || []).length,
      eventTypes: [...new Set((res.events || []).map((e) => e.type))],
      winTime8k: res.finishers[0].time
    };
  });
  console.log('race dynamics:', JSON.stringify(stats, null, 1));
  if (stats.error) {
    console.log('FAIL\n' + stats.error);
    await browser.close();
    process.exit(1);
  }
  if (stats.fastKickersClose >= stats.slowKickersClose) errors.push('Kickers not closing faster than the field');
  if (!stats.events) errors.push('No race events recorded');

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

  // The checks below race the same field many times. simulateRace also applies
  // post-race effects (fatigue, morale, PRs), so each race is isolated:
  // snapshot the field, race, then restore every runner in place.
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const R = window.XCD.engine.Races;
    const Rng = window.XCD.core.SeededRNG;
    window.__isolatedRace = (meet, seed, prep) => {
      const field = [];
      meet.schoolIds.forEach((sid) => g.getSchool(sid).rosterM.forEach((id) => field.push(g.world.athletes[id])));
      const snap = field.map((a) => JSON.stringify(a));
      if (prep) prep();
      const res = R.simulateRace(g, meet, 'M', new Rng(seed), true);
      field.forEach((a, i) => {
        Object.keys(a).forEach((k) => { delete a[k]; });
        Object.assign(a, JSON.parse(snap[i]));
      });
      return res;
    };
  });

  // Fatigued runners fade: the player's best runner races the same meet on the
  // same seeds, fresh vs exhausted. Each race starts from the same state, so
  // the only difference is the fatigue. A DNF counts as the slowest finish.
  const fadeTest = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const roster = g.getRoster(g.playerSchoolId, 'M').filter((a) => !a.injury)
      .sort((a, b) => b.currentOverall - a.currentOverall);
    const star = roster[0];
    const meet = g.season.meets[g.lastPlayerMeetId]; // the 8K analysed above
    if (!meet || !star) return null;
    const run = (fatigue) => {
      let sum = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const res = window.__isolatedRace(meet, seed * 977, () => { star.fatigue = fatigue; });
        const f = res.finishers.find((x) => x.athleteId === star.id);
        sum += f ? f.time : res.finishers[res.finishers.length - 1].time;
      }
      return sum / 12;
    };
    return { freshTime: +run(5).toFixed(1), gassedTime: +run(90).toFixed(1) };
  });
  console.log('fatigue fade test:', JSON.stringify(fadeTest));
  if (fadeTest && !(fadeTest.gassedTime > fadeTest.freshTime)) errors.push('Fatigue has no cost: ' + JSON.stringify(fadeTest));

  // Controlled race: the nation's 25 strongest DI men's teams over a neutral
  // 8K course (rolling 40, 600 ft, 55°F, firm, light wind) on fixed seeds.
  // The player's own race can't anchor these checks: its field (42 runners or
  // 250; a 65-rated winner or a 94) and its weather (heat, hills, altitude,
  // mud, wind) swing the winning time by two minutes, and a small field barely
  // changes places. Here a sound pace model wins in ~23:10-23:35 across random
  // worlds (mean of 5 seeds, SD ~6s), so the 22:50-24:00 window sits 5+ SD
  // either side yet still catches a ±6 s/km or ±3% pace error. The dense field
  // also shows the mid-race to finish reshuffling.
  const controlled = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const R = window.XCD.engine.Races;
    const S = R.SEGMENTS;
    const teamStrength = (s) => s.rosterM.map((id) => g.world.athletes[id]).filter((a) => a && !a.injury)
      .map((a) => R.raceRating(a, 8000)).sort((a, b) => b - a).slice(0, 5)
      .reduce((sum, r) => sum + r, 0) / 5;
    const schoolIds = Object.values(g.world.schools).filter((s) => (s.division || 'DI') === 'DI')
      .sort((a, b) => teamStrength(b) - teamStrength(a)).slice(0, 25).map((s) => s.id);
    const meet = {
      id: 'phase4-controlled', name: 'Controlled 8K', week: g.week, type: 'invite', division: 'DI',
      hostId: schoolIds[0], schoolIds,
      distances: { M: 8000, W: 6000 },
      conditions: { tempF: 55, windMph: 5, rain: false, ground: 'Firm', hilliness: 40, altitude: 'Low', altitudeFt: 600 },
      results: { M: null, W: null }
    };
    const placeAt = (sp, seg) => {
      const m = {};
      Object.keys(sp).map((id) => ({ id, t: sp[id][seg] })).sort((a, b) => a.t - b.t)
        .forEach((x, i) => { m[x.id] = i + 1; });
      return m;
    };
    const times = [];
    let moves = 0, field = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const res = window.__isolatedRace(meet, seed * 7919);
      times.push(res.finishers[0].time);
      field = res.finishers.length;
      const mid = placeAt(res.splits, 7), fin = placeAt(res.splits, S - 1);
      const top40 = res.finishers.slice(0, 40).map((f) => f.athleteId);
      moves += top40.reduce((sum, id) => sum + Math.abs(fin[id] - mid[id]), 0) / top40.length;
    }
    return {
      field,
      winTimes8k: times,
      meanWinTime8k: +(times.reduce((s, t) => s + t, 0) / times.length).toFixed(1),
      avgAbsMoveMidToFin: +(moves / 5).toFixed(2)
    };
  });
  console.log('controlled elite 8K:', JSON.stringify(controlled));
  if (controlled.avgAbsMoveMidToFin < 2) errors.push('Race too static: avg move mid->fin ' + controlled.avgAbsMoveMidToFin);
  if (controlled.meanWinTime8k < 1370 || controlled.meanWinTime8k > 1440) errors.push('Winning 8K time off: ' + JSON.stringify(controlled));

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
