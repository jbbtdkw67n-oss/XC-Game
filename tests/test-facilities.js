// Facilities overhaul (user request + spec Part 2, Section 18 audit).
// Verifies:
//   - exactly five facilities everywhere: Training Center, Weight Room,
//     Rehab Center, Indoor Track, Alumni Center
//   - old eight-facility saves fold down cleanly on load
//   - each facility has a real training implication: rehab softens injury
//     layoffs, the indoor track sharpens speed work, the training center
//     accelerates development
//   - fundraising scales with program success and school size, amplified
//     by the Alumni Center; once per year
//   - the facilities panel explains every implication
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

  const KEYS = ['trainingCenter', 'weightRoom', 'rehabCenter', 'indoorTrack', 'alumniCenter'];

  // ---- 1) Every school carries exactly the five facilities ----
  const shape = await page.evaluate((KEYS) => {
    const g = window.XCD.ui.state.game;
    const schools = Object.values(g.world.schools);
    const bad = schools.filter((s) => {
      const k = Object.keys(s.facilities).sort();
      return k.length !== 5 || !KEYS.slice().sort().every((x, i) => x === k[i]) ||
        KEYS.some((x) => !(s.facilities[x] >= 5 && s.facilities[x] <= 99));
    });
    // Old-save migration: an eight-facility school folds down on revive.
    const M = window.XCD.models;
    const legacy = new M.School({
      name: 'Old State', prestige: 70, heritage: 60,
      facilities: {
        trainingCenter: 80, weightRoom: 75, recoveryCenter: 60, nutrition: 55,
        lockerRoom: 70, indoorTrack: 50, altitudeRoom: 20, sportsScienceLab: 45
      }
    });
    return {
      schools: schools.length, bad: bad.length,
      migratedKeys: Object.keys(legacy.facilities).sort(),
      migratedSane: KEYS.every((x) => legacy.facilities[x] >= 5 && legacy.facilities[x] <= 99),
      alumniSeeded: legacy.facilities.alumniCenter > 40 // prestige+heritage flow in
    };
  }, KEYS);
  ok(shape.bad === 0, `every school must carry exactly the five facilities: ${shape.bad} bad of ${shape.schools}`);
  ok(shape.migratedKeys.join(',') === KEYS.slice().sort().join(','), 'old saves must fold to the five: ' + shape.migratedKeys);
  ok(shape.migratedSane && shape.alumniSeeded, 'migration must produce sane, seeded values');
  console.log('shape:', JSON.stringify(shape));

  // ---- 2) Implications: rehab, indoor track, training center ----
  const fx = await page.evaluate(() => {
    const g0 = window.XCD.ui.state.game;
    const clone = () => window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g0.toJSON())));

    // (a) Rehab Center: an injured star bleeds less fitness per week.
    const slideWith = (rehab) => {
      const g = clone();
      const school = g.getPlayerSchool();
      school.facilities.rehabCenter = rehab;
      const a = g.getRoster(school.id, 'M')[0];
      a.injury = { type: 'Stress Fracture', weeksRemaining: 6, totalWeeks: 6 };
      a.health = 'Injured';
      a.fitness = 70;
      g.advanceWeek();
      return 70 - a.fitness;
    };
    const slideGood = slideWith(95), slidePoor = slideWith(10);

    // (b) Indoor Track: speed sessions sharpen more on a real facility.
    const sharpWith = (track) => {
      const g = clone();
      const school = g.getPlayerSchool();
      school.facilities.indoorTrack = track;
      g.training.M = ['easy', 'speed', 'easy', 'speed', 'easy', 'long', 'rest'];
      for (let i = 0; i < 3; i++) g.advanceWeek();
      const roster = g.getRoster(school.id, 'M');
      return roster.reduce((s, a) => s + a.sharpness, 0) / roster.length;
    };
    const sharpGood = sharpWith(95), sharpPoor = sharpWith(10);

    // (c) Training Center: the whole squad develops faster.
    // Injuries are rolled independently of the training center, and once the
    // two clones' random streams diverge a layoff (≈ -2 overall a week) lands
    // on different runners in each — enough to swamp the facility's edge in a
    // whole-roster total. So compare the runners who stayed healthy in BOTH
    // clones, and pool a few independent weekly-RNG seeds (g.seed only drives
    // the weekly sim stream; the world itself is already built).
    const devWith = (tc, seed) => {
      const g = clone();
      g.seed = seed;
      const school = g.getPlayerSchool();
      school.facilities.trainingCenter = tc;
      const squad = () => g.getRoster(school.id, 'M').concat(g.getRoster(school.id, 'W'));
      const hurt = new Set(squad().filter((a) => a.injury).map((a) => a.id));
      for (let i = 0; i < 6; i++) {
        g.advanceWeek();
        squad().forEach((a) => { if (a.injury) hurt.add(a.id); });
      }
      const dev = {};
      squad().forEach((a) => { dev[a.id] = a.seasonDev || 0; });
      return { dev, hurt };
    };
    let devGood = 0, devPoor = 0, devRunners = 0;
    for (let s = 0; s < 3; s++) {
      const seed = (g0.seed + s * 104729) >>> 0;
      const good = devWith(95, seed), poor = devWith(15, seed);
      Object.keys(good.dev)
        .filter((id) => id in poor.dev && !good.hurt.has(id) && !poor.hurt.has(id))
        .forEach((id) => { devGood += good.dev[id]; devPoor += poor.dev[id]; devRunners++; });
    }

    return { slideGood, slidePoor, sharpGood, sharpPoor, devGood, devPoor, devRunners };
  });
  ok(fx.slideGood < fx.slidePoor, `a rehab center must soften the injury fitness slide (${fx.slideGood} vs ${fx.slidePoor})`);
  ok(fx.sharpGood > fx.sharpPoor + 1, `an indoor track must sharpen speed work (${fx.sharpGood.toFixed(1)} vs ${fx.sharpPoor.toFixed(1)})`);
  ok(fx.devRunners >= 30, `the development check needs a real sample of healthy runners (${fx.devRunners})`);
  ok(fx.devGood > fx.devPoor, `a training center must accelerate development (${fx.devGood} vs ${fx.devPoor} over ${fx.devRunners} healthy runner-runs)`);
  console.log('implications:', JSON.stringify(fx));

  // ---- 3) Fundraising: success × size × alumni network ----
  const money = await page.evaluate(() => {
    const g0 = window.XCD.ui.state.game;
    const F = window.XCD.engine.Finances;
    const raise = (mut) => {
      const g = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g0.toJSON())));
      g.fundraisedYear = null;
      mut(g.getPlayerSchool(), g);
      const r = F.fundraise(g);
      const again = F.fundraise(g);
      return { amount: r.amount, onceOnly: !again.ok };
    };
    const giant = raise((s, g) => {
      s.division = 'DI'; s.conferenceTier = 1; s.prestige = 90;
      s.facilities.alumniCenter = 95;
      s.historicalSuccess = { nationalTitlesM: 3, nationalTitlesW: 2, conferenceTitlesM: 10, conferenceTitlesW: 8 };
      g.rankings.M[0] = { ...g.rankings.M[0], schoolId: s.id, rank: 2 };
    });
    const tiny = raise((s) => {
      s.division = 'DIII'; s.prestige = 32; s.facilities.alumniCenter = 15;
      s.historicalSuccess = {};
    });
    const sizes = {
      big: F.schoolSizeFactor({ division: 'DI', conferenceTier: 1 }),
      small: F.schoolSizeFactor({ division: 'DIII', conferenceTier: 4 }),
      label: F.schoolSizeLabel({ division: 'DI', conferenceTier: 1 })
    };
    return { giant: giant.amount, tiny: tiny.amount, onceOnly: giant.onceOnly && tiny.onceOnly, sizes };
  });
  ok(money.giant > money.tiny * 3, `a successful large program must out-raise a small one by miles ($${money.giant} vs $${money.tiny})`);
  ok(money.onceOnly, 'the boosters must still give only once a year');
  ok(money.sizes.big > money.sizes.small && money.sizes.label === 'Large university', 'school size factors must be sane');
  console.log('fundraising:', JSON.stringify(money));

  // ---- 4) UI: the panel names all five and explains the implications ----
  await page.click('[data-nav="school"]');
  await page.waitForSelector('#btn-fundraise');
  const panel = await page.evaluate(() => {
    const text = document.body.textContent;
    return {
      five: ['Training Center', 'Weight Room', 'Rehab Center', 'Indoor Track', 'Alumni Center'].every((l) => text.includes(l)),
      noDead: !text.includes('Altitude Room') && !text.includes('Sports Science Lab') && !text.includes('Nutrition Program'),
      explains: text.includes('real training implication'),
      sized: /university|college/i.test(text)
    };
  });
  ok(panel.five && panel.noDead, 'the panel must show exactly the five living facilities: ' + JSON.stringify(panel));
  ok(panel.explains && panel.sized, 'the panel must explain implications and school size');
  console.log('panel:', JSON.stringify(panel));

  // ---- 5) Save round-trip keeps the five ----
  const persisted = await page.evaluate((KEYS) => {
    const g = window.XCD.ui.state.game;
    const g2 = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    return Object.values(g2.world.schools).every((s) =>
      Object.keys(s.facilities).length === 5 && KEYS.every((k) => s.facilities[k] !== undefined));
  }, KEYS);
  ok(persisted, 'the five facilities must survive save/load');

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-facilities');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
