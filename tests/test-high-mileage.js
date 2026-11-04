// High-mileage rework: volume a DURABLE runner has built up to pays off.
// Verifies:
//   - Adapted miles above the normal load cost no extra fatigue and only a
//     little injury risk, while development climbs well above a 70-mile week
//   - Normal programs (default mileage) are untouched
//   - The same week for a FRAGILE runner (past their durable limit) or a
//     runner who hasn't built up to it (a ramp) still costs full price
//   - Women get the same dividend on their lower volume scale
//   - A season's adapted base grows the summer; a big base grows the taper peak
//   - The other road: race-specific quality on fresh, lower-volume legs peaks
//     just as high, and keeps a runner sharper week to week
//   - The Training screen explains the approaches and the rules of thumb
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(120000);
  await newDynasty(page, {});

  const r = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const T = window.XCD.engine.Training;
    const runner = (gender, ir) => {
      const a = Object.values(g.world.athletes).find((x) => x.gender === gender && x.schoolId);
      return Object.assign(Object.create(Object.getPrototypeOf(a)), a, {
        gender, injuryResistance: ir, fatigue: 30, fitness: 60, recentInjuryWeeks: 0, careerInjuries: []
      });
    };
    const durable = runner('M', 95);
    const fragile = runner('M', 35);
    const woman = runner('W', 95);
    const m = (mi, chronic, a) => T.mileageMeta(mi, chronic, a);
    const out = {
      safeDurable: T.safeMileage(durable), safeFragile: T.safeMileage(fragile), safeWoman: T.safeMileage(woman),
      d70: m(70, 70, durable), d75: m(75, 75, durable), d110: m(110, 110, durable),
      ramp110: m(110, 75, durable), f110: m(110, 110, fragile),
      plain75: m(75, 75, null), w60: m(60, 60, woman), w92: m(92, 92, woman),
      summerNone: T.summerBaseMult({ seasonBase: 0 }), summerFull: T.summerBaseMult({ seasonBase: 9999 })
    };
    // Taper peak: same runner, same charge — a big adapted base peaks higher.
    const school = g.getPlayerSchool();
    const keepSchools = g.world.schools;
    g.world.schools = { [school.id]: school };
    const keepRoster = school.rosterM;
    const peak = (chronic) => {
      const a = g.world.athletes[keepRoster[0]];
      Object.assign(a, { injuryResistance: 95, fatigue: 25, fitness: 70, chronicMileage: chronic, taperCharge: 1,
        peakSeason: null, peakBonus: 0, injury: null, health: 'Healthy', recentInjuryWeeks: 0, staleness: 0 });
      school.rosterM = [a.id];
      g.week = 14;
      g.training.M = T.idealPlanForPhase({ week: 14 });
      g.training.mileageOverrides = { [a.id]: Math.round(chronic * 0.55) };
      T.processWeek(g, new window.XCD.core.SeededRNG(3));
      return a.peakBonus;
    };
    out.peak70 = peak(70);
    out.peak110 = peak(110);
    // Quality road: 55 mi with a quality-heavy history peaks like a big base.
    const qa = g.world.athletes[keepRoster[0]];
    qa.qualityLoad = 3.6; out.peakQuality55 = peak(55);
    qa.qualityLoad = 0; out.peakNoQuality55 = peak(55);
    const qf = (q, chronic) => T.qualityPeakForm(Object.assign({}, durable, { qualityLoad: q }), chronic);
    out.qFresh = qf(3.6, 55); out.qHeavy = qf(3.6, 100);
    school.rosterM = keepRoster;
    g.world.schools = keepSchools;
    return out;
  });

  ok(r.safeDurable >= 110 && r.safeFragile < 90, 'durability gates volume: ' + JSON.stringify([r.safeDurable, r.safeFragile]));
  // Adapted durable 110: no more volume fatigue than a normal 75-mile week.
  ok(Math.abs(r.d110.fatigueAdd - r.d75.fatigueAdd) < 0.01, 'adapted miles above the normal load add no fatigue: ' + r.d110.fatigueAdd + ' vs ' + r.d75.fatigueAdd);
  ok(r.d110.devMult >= r.d70.devMult + 0.6, 'adapted high volume develops far faster: ' + r.d110.devMult + ' vs ' + r.d70.devMult);
  ok(r.d110.injuryMult < 1.25, 'adapted volume adds only a little injury risk: ' + r.d110.injuryMult);
  ok(r.d110.sharpTarget < r.d70.sharpTarget, 'high volume still leaves legs a little flat before the taper');
  // Normal programs are unchanged.
  ok(r.d75.devMult === r.plain75.devMult && r.d75.fatigueAdd === r.plain75.fatigueAdd && r.d75.injuryMult === r.plain75.injuryMult,
    'a normal 75-mile week plays exactly as before');
  // Ramping or fragile: full price.
  ok(r.ramp110.fatigueAdd > r.d110.fatigueAdd + 5 && r.ramp110.devMult < r.d110.devMult, 'jumping to 110 without building up costs full price: ' + JSON.stringify([r.ramp110.fatigueAdd, r.d110.fatigueAdd]));
  ok(r.f110.fatigueAdd > r.d110.fatigueAdd + 3 && r.f110.injuryMult > r.d110.injuryMult, 'a fragile runner at 110 pays full price past their limit');
  // Women: same dividend on their own scale, normal load untouched.
  ok(r.w92.devMult >= r.w60.devMult + 0.5 && r.w92.highVolume > 0, 'durable women get the high-volume dividend: ' + JSON.stringify([r.w92.devMult, r.w60.devMult]));
  ok(r.w60.highVolume === 0 && r.w60.adapted === 60, 'a normal women\'s week has no dividend');
  // Summer and taper.
  ok(r.summerNone === 1 && r.summerFull > 1.25, 'season base grows the summer: ' + r.summerFull);
  ok(r.peak110 >= r.peak70 + 8, 'a big adapted base peaks higher at the taper: ' + r.peak110 + ' vs ' + r.peak70);
  ok(r.peakQuality55 >= r.peakNoQuality55 + 8 && Math.abs(r.peakQuality55 - r.peak110) <= 3,
    'quality on fresh legs peaks about as high as a big base: ' + JSON.stringify([r.peakQuality55, r.peakNoQuality55, r.peak110]));
  ok(r.qFresh > 10 && r.qHeavy === 0, 'quality credit belongs to fresh, lower-volume legs: ' + JSON.stringify([r.qFresh, r.qHeavy]));

  // The approaches guide on the Training screen.
  await page.evaluate(() => window.XCD.ui.navigate('training'));
  await page.waitForSelector('#approaches-guide');
  const guide = await page.evaluate(() => document.querySelector('#approaches-guide').textContent.replace(/\s+/g, ' '));
  ok(/Aerobic base/.test(guide) && /Quality on fresh legs/.test(guide) && /balanced middle/.test(guide) &&
    /Taper once/.test(guide) && /Base early, sharpen late/.test(guide) && /healthy runners/.test(guide),
    'the Training screen lays out the approaches and rules of thumb: ' + guide.slice(0, 200));

  ok(errors.length === 0, 'page errors: ' + errors.slice(0, 4).join(' | '));
  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-high-mileage');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
