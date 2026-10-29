// Update 25 (Stage 4 — progression curve): raw talents surge.
// Verifies:
//   - The growth curve is unchanged for ordinary gaps (≤ 30) and keeps
//     rising past them, capped
//   - Over one full year (season + summer) a 20-overall freshman with 99
//     potential jumps ~20-40 overall, while a 46/70 runner develops at the
//     ordinary pace
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

  const curve = await page.evaluate(() => {
    const T = window.XCD.engine.Training;
    return { g12: T.gapGrowth(12), g24: T.gapGrowth(24), g30: T.gapGrowth(30), g45: T.gapGrowth(45), g60: T.gapGrowth(60), g90: T.gapGrowth(90) };
  });
  ok(curve.g12 === 0.5 && curve.g24 === 1 && curve.g30 === 1.25, 'ordinary gaps must grow exactly as before: ' + JSON.stringify(curve));
  ok(curve.g45 > curve.g30 && curve.g60 > curve.g45 && curve.g90 <= 2.2, 'big gaps must keep accelerating, capped: ' + JSON.stringify(curve));
  console.log('curve:', JSON.stringify(curve));

  const year = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    window.XCD.engine.Settings.set(g, 'injuryRate', 0);
    const K = ['vo2Max', 'lactateThreshold', 'runningEconomy', 'stamina', 'speed'];
    const plant = (a, attr, pot) => {
      K.forEach((k) => { a[k] = attr; }); a.injuryResistance = 60; a.potential = pot; a.workEthic = 65;
      a.devProfile = 'normal'; a.classYear = 'Freshman'; a.yearsOnCampus = 1; a.age = 18; a.eligibilityRemaining = 5;
      a.recalculateOverall();
    };
    const schools = Object.values(g.world.schools).filter((s) => s.id !== g.playerSchoolId && s.rosterM.length >= 4)
      .sort((a, b) => b.prestige - a.prestige);
    const s = schools[Math.floor(schools.length * 0.3)];
    const r = s.rosterM.map((id) => g.world.athletes[id]).filter(Boolean);
    plant(r[0], 20, 99); plant(r[1], 45, 70);
    const raw = r[0], mid = r[1];
    const start = { raw: raw.currentOverall, mid: mid.currentOverall };
    for (let w = 0; w < window.XCD.data.CALENDAR.WEEKS_PER_YEAR; w++) g.advanceWeek();
    return { prestige: s.prestige, rawGain: raw.currentOverall - start.raw, midGain: mid.currentOverall - start.mid };
  });
  ok(year.rawGain >= 20 && year.rawGain <= 42, 'a raw 20/99 freshman should jump ~20-40 overall in a year: ' + JSON.stringify(year));
  ok(year.midGain >= 3 && year.midGain <= 16, 'a 46/70 runner should develop at the ordinary pace: ' + JSON.stringify(year));
  console.log('one year:', JSON.stringify(year));

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
