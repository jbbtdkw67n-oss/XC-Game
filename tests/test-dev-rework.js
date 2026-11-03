// Development Rework: one development core for every athlete, season and summer.
// Verifies:
//   - Every development curve is visible under its own honest label
//   - The foundation boost: faster below 75 overall, ordinary from 75 up
//   - Late Bloomers: top end locked early (little growth as underclassmen),
//     then it opens all at once for a big junior-year jump
//   - The summer obeys the same open ceiling as the season
//   - Below 75, a high-potential runner outgrows a low-potential one
//   - The player card shows the curve and the ceiling this program realizes
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(600000);
  await newDynasty(page, {});

  // ---- 1) Curves are visible and distinct; the boost's shape ----
  const basics = await page.evaluate(() => {
    const D = window.XCD.data, T = window.XCD.engine.Training;
    const labels = ['normal', 'early', 'late', 'bust', 'legend'].map((p) => D.growthCurve(p).label);
    return {
      labels,
      b40: T.foundationBoost(40), b50: T.foundationBoost(50), b62: T.foundationBoost(62),
      b75: T.foundationBoost(75), b90: T.foundationBoost(90)
    };
  });
  ok(new Set(basics.labels).size === 5, 'every development curve must show its own label: ' + basics.labels.join(', '));
  ok(basics.b40 === basics.b50 && basics.b50 > 1.3, 'the foundation boost must be strongest at 50 and under: ' + JSON.stringify(basics));
  ok(basics.b62 > 1 && basics.b62 < basics.b50, 'the boost must taper toward 75: ' + JSON.stringify(basics));
  ok(basics.b75 === 1 && basics.b90 === 1, 'from 75 up development runs at the ordinary rate: ' + JSON.stringify(basics));

  // ---- 2) Careers: a Late Bloomer vs a Steady runner, and potential below 75 ----
  const career = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    window.XCD.engine.Settings.set(g, 'injuryRate', 0);
    const K = ['vo2Max', 'lactateThreshold', 'runningEconomy', 'stamina', 'speed'];
    const plant = (a, attr, pot, profile) => {
      K.forEach((k) => { a[k] = attr; }); a.injuryResistance = 60; a.potential = pot; a.workEthic = 70;
      a.devProfile = profile; a.classYear = 'Freshman'; a.yearsOnCampus = 1; a.age = 18; a.eligibilityRemaining = 5;
      a.devBase = null; a.injuryDeficit = null; a.recalculateOverall();
    };
    const schools = Object.values(g.world.schools).filter((s) => s.id !== g.playerSchoolId && s.rosterM.length >= 6)
      .sort((a, b) => b.prestige - a.prestige);
    const s = schools[Math.floor(schools.length * 0.2)];
    const r = s.rosterM.map((id) => g.world.athletes[id]).filter(Boolean);
    plant(r[0], 45, 92, 'late'); plant(r[1], 45, 92, 'normal');
    plant(r[2], 45, 85, 'normal'); plant(r[3], 45, 60, 'normal');
    const late = r[0], steady = r[1], hiPot = r[2], loPot = r[3];
    const T = window.XCD.engine.Training;
    const lockedYr1 = T.growthOutlook(g, late);
    const hist = { late: [late.currentOverall], steady: [steady.currentOverall] };
    const firstYear = { hi: hiPot.currentOverall, lo: loPot.currentOverall };
    // Summer check: right before the junior summer, the locked share must still
    // hold — a Late Bloomer can't use the summer to sneak past their open ceiling.
    for (let y = 0; y < 3; y++) {
      for (let w = 0; w < window.XCD.data.CALENDAR.WEEKS_PER_YEAR; w++) g.advanceWeek();
      hist.late.push(late.currentOverall); hist.steady.push(steady.currentOverall);
      if (y === 0) { firstYear.hi = hiPot.currentOverall - firstYear.hi; firstYear.lo = loPot.currentOverall - firstYear.lo; }
    }
    const lockedYr4 = T.growthOutlook(g, late);
    return { prestige: s.prestige, hist, lockedYr1, lockedYr4, firstYear };
  });
  const lateGains = career.hist.late.slice(1).map((v, i) => v - career.hist.late[i]);
  const steadyGains = career.hist.steady.slice(1).map((v, i) => v - career.hist.steady[i]);
  console.log('career:', JSON.stringify({ ...career, lateGains, steadyGains }));
  ok(career.lockedYr1 && career.lockedYr1.locked >= 15 && career.lockedYr1.unlockYear === 3,
    'a freshman Late Bloomer must have a big locked share that opens as a junior: ' + JSON.stringify(career.lockedYr1));
  ok(career.lockedYr4 && career.lockedYr4.locked === 0, 'by senior year nothing stays locked: ' + JSON.stringify(career.lockedYr4));
  ok(lateGains[0] < steadyGains[0], 'a Late Bloomer must trail a Steady runner as a freshman: ' + lateGains + ' vs ' + steadyGains);
  ok(lateGains[2] >= 12 && lateGains[2] > lateGains[0] && lateGains[2] > lateGains[1],
    'a Late Bloomer\'s junior year must be the big jump (≥ +12): ' + lateGains.join(', '));
  ok(career.firstYear.hi > career.firstYear.lo + 5,
    'below 75, a high-potential runner must outgrow a low-potential one: ' + JSON.stringify(career.firstYear));

  // ---- 3) The summer obeys the same open ceiling ----
  const summer = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const T = window.XCD.engine.Training;
    const s = g.getPlayerSchool();
    const a = g.getRoster(s.id, 'M')[0];
    const K = ['vo2Max', 'lactateThreshold', 'runningEconomy', 'stamina', 'speed'];
    K.forEach((k) => { a[k] = 50; }); a.potential = 95; a.devProfile = 'late'; a.yearsOnCampus = 2;
    a.recalculateOverall(); a.devBase = a.currentOverall - 30; // already past this year's open share
    a.workEthic = 95; a.fatigue = 10; a.morale = 80;
    const o = T.growthOutlook(g, a);
    const before = a.currentOverall;
    T.offseasonDevelopment(g, new window.XCD.core.SeededRNG(5));
    return { roomNow: o.roomNow, gain: a.currentOverall - before };
  });
  console.log('summer:', JSON.stringify(summer));
  ok(summer.roomNow === 0 && summer.gain <= 1, 'with no open room, the summer must add (almost) nothing: ' + JSON.stringify(summer));

  // ---- 4) The player card explains the outlook ----
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    window.XCD.ui.openAthlete(g, g.getRoster(g.playerSchoolId, 'M')[1].id);
  });
  await page.waitForSelector('#pc-ceiling-here');
  const card = await page.evaluate(() => {
    const row = document.querySelector('#pc-ceiling-here');
    return { ceil: row.innerText, prev: row.previousElementSibling.innerText, hasRoom: /Room to Grow/.test(document.body.innerText) };
  });
  console.log('card:', JSON.stringify(card));
  ok(/Development Curve/.test(card.prev), 'the card must show the development curve');
  ok(/Ceiling Here\s*\d+ of \d+ POT/.test(card.ceil), 'the card must show the ceiling this program realizes: ' + card.ceil);
  ok(!card.hasRoom, 'the card must not show a Room to Grow row');

  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  if (fails.length) {
    console.log('FAIL');
    fails.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  }
  console.log('PASS');
}

run().catch((e) => { console.error(e); console.log('FAIL'); process.exit(1); });
