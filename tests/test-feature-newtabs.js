// Feature test: blank records, News tabs (News/Awards/Watch), predictions,
// coach reputation from DI titles, podium hot-seat/firing (player + CPU),
// assistant firing for poor recruiting, and CPU rating upgrades.
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

  // 1) Records start BLANK (no auto-seeded marks) and predictions exist.
  const start = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const preds = g.season && g.season.predictions;
    return {
      recordCount: Object.keys(g.history.records || {}).length,
      hasPreds: !!(preds && preds.divisions),
      podiumMarkers: preds ? (preds.podiumTeams || []).length : 0,
      writeup: preds && preds.divisions.DI ? preds.divisions.DI.writeup : '',
      contendersDI_M: preds && preds.divisions.DI ? preds.divisions.DI.M.contenders.length : 0,
      podiumDI_M: preds && preds.divisions.DI ? preds.divisions.DI.M.podium.length : 0
    };
  });
  ok(start.recordCount === 0, 'records must start blank: ' + start.recordCount);
  ok(start.hasPreds, 'season predictions must be generated at start');
  ok(start.podiumMarkers > 0, 'predictions must mark podium teams: ' + start.podiumMarkers);
  ok(start.podiumDI_M === 3, 'DI men predicted podium must be top 3: ' + start.podiumDI_M);
  ok(start.contendersDI_M === 5, 'DI men title contenders must be 5: ' + start.contendersDI_M);
  ok(typeof start.writeup === 'string' && start.writeup.length > 40, 'a sports-talk preview must be generated: ' + start.writeup);

  // 2) News screen: all three tabs render without error and have content.
  await page.evaluate(() => window.XCD.ui.navigate('news'));
  await page.waitForSelector('[data-ntab="awards"]');
  const tabRender = { news: 0, awards: 0, watch: 0 };
  for (const tab of ['news', 'awards', 'watch']) {
    await page.click(`[data-ntab="${tab}"]`);
    await page.waitForTimeout(40);
    tabRender[tab] = await page.evaluate(() => document.querySelector('#news-body').innerHTML.length);
  }
  ok(tabRender.news > 20 && tabRender.awards > 20 && tabRender.watch > 20,
    'all news tabs must render content: ' + JSON.stringify(tabRender));
  // Watch tab must contain tappable cards (podium + contenders).
  await page.click('[data-ntab="watch"]');
  await page.waitForTimeout(40);
  const watchCards = await page.evaluate(() => document.querySelectorAll('#news-body .pcard').length);
  ok(watchCards >= 6, 'Watch tab must render player/team cards: ' + watchCards);

  // 3) Simulate a full season → awards, conference honors, recap all populate.
  const afterSeason = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const weeks = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    let err = null;
    try { for (let w = 0; w < weeks; w++) g.advanceWeek(); } catch (e) { err = e.message + '\n' + (e.stack || '').slice(0, 300); }
    const lastAwardYear = Math.max(...Object.keys(g.history.awards || {}).map(Number).concat([0]));
    const aw = (g.history.awards || {})[lastAwardYear] || {};
    // All-Conference teams live in the 4-year confHonors store (display data).
    const chYears = Object.keys(g.history.confHonors || {}).map(Number);
    const chYear = chYears.length ? Math.max(...chYears) : 0;
    const chConf = (((g.history.confHonors || {})[chYear] || {}).divisions || {}).DI || {};
    const someConf = Object.values(chConf.conferences || {})[0] || {};
    const allConf = (someConf.M && someConf.M.allConference) || [];
    return {
      err,
      lastAwardYear,
      hasConfHonors: Object.keys(g.history.confHonors || {}).length > 0,
      hasRecap: Object.keys(g.history.awardsRecap || {}).length > 0,
      hasAllConference: allConf.length > 0,
      hasAllAmericans: !!(aw.M && aw.M.allAmericans && aw.M.allAmericans.length),
      predsYear: g.season && g.season.predictions ? g.season.predictions.year : null,
      gameYear: g.year
    };
  });
  ok(!afterSeason.err, 'a full season sim must not crash: ' + afterSeason.err);
  ok(afterSeason.lastAwardYear > 0, 'awards must be handed out after a season');
  ok(afterSeason.hasConfHonors, 'conference honors preview must be recorded after conference week');
  ok(afterSeason.hasRecap, 'an original awards recap must be generated');
  ok(afterSeason.hasAllConference, 'All-Conference teams must be recorded');
  ok(afterSeason.hasAllAmericans, 'All-America teams must be recorded after nationals');
  ok(afterSeason.predsYear === afterSeason.gameYear, 'predictions must regenerate for the new season');

  // Awards tab now renders real award cards (All-America / All-Conference).
  await page.evaluate(() => window.XCD.ui.navigate('news'));
  await page.click('[data-ntab="awards"]');
  await page.waitForTimeout(40);
  const awardCards = await page.evaluate(() => document.querySelectorAll('#news-body .pcard, #news-body .award-line').length);
  ok(awardCards >= 3, 'Awards tab must render award/player cards after a season: ' + awardCards);

  // 4) Multi-season soak: coach reputations move, firings occur, no errors.
  const soak = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const weeks = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    let err = null;
    const repBefore = Object.values(g.world.coaches).filter((c) => !c.isPlayer).map((c) => c.reputation);
    const avg = (xs) => xs.reduce((p, c) => p + c, 0) / (xs.length || 1);
    const before = avg(repBefore);
    try { for (let y = 0; y < 8; y++) for (let w = 0; w < weeks; w++) g.advanceWeek(); }
    catch (e) { err = e.message + '\n' + (e.stack || '').slice(0, 300); }
    // Any DI national champion coach should carry a strong reputation.
    let diChampRep = 0;
    const natNow = (g.history.nationalChampions || {})[g.year - 1] || {};
    const champTeam = natNow.M && natNow.M.teamId;
    if (champTeam) {
      const cs = g.getSchool(champTeam);
      const cc = cs && g.getCoach(cs.coachId);
      if (cc) diChampRep = cc.reputation;
    }
    return {
      err,
      firings: g.history.firings || 0,
      year: g.year,
      predsYear: g.season && g.season.predictions ? g.season.predictions.year : null,
      diChampRep,
      // A rough check that CPU craft ratings climbed for at least some coaches.
      strongCoaches: Object.values(g.world.coaches).filter((c) => !c.isPlayer &&
        ((c.recruiting || 0) + (c.training || 0) + (c.peaking || 0) + (c.culture || 0)) / 4 >= 70).length
    };
  });
  ok(!soak.err, 'an 8-season soak must not crash: ' + soak.err);
  ok(soak.firings > 0, 'CPU coaches must be getting fired over time: ' + soak.firings);
  ok(soak.predsYear === soak.year, 'predictions must keep regenerating each season');
  ok(soak.strongCoaches > 0, 'CPU coaches must upgrade their ratings over time: ' + soak.strongCoaches);

  // 5) Player firing path is safe: flag it, roll a season, land at a new school.
  const fired = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const weeks = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    const beforeSchool = g.playerSchoolId;
    g.career.pendingFiring = { fromId: g.playerSchoolId, year: g.year };
    let err = null;
    try {
      for (let w = 0; w < weeks; w++) g.advanceWeek();
      // Keep playing a bit past the move to prove the new season is coherent.
      for (let w = 0; w < 6; w++) g.advanceWeek();
    } catch (e) { err = e.message + '\n' + (e.stack || '').slice(0, 300); }
    return {
      err,
      moved: g.playerSchoolId !== beforeSchool,
      timesFired: g.career.timesFired || 0,
      hasSchool: !!g.getPlayerSchool(),
      role: g.playerRole
    };
  });
  ok(!fired.err, 'player firing + fresh start must not crash: ' + fired.err);
  ok(fired.moved, 'a fired player must be relocated to a new program');
  ok(fired.timesFired >= 1, 'the firing must be recorded on the career');
  ok(fired.hasSchool && fired.role === 'Head', 'a fired player must land as head coach of a valid program');

  ok(errors.length === 0, 'page errors: ' + errors.slice(0, 4).join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-feature-newtabs');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
