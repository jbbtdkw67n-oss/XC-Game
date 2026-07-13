// Injury System Expansion (master spec Part 2, Section 10).
// Drives the real game headless and verifies:
//   - immediate injury effects: fitness bleeds fast, sharpness deteriorates,
//     confidence and morale sink every week of the layoff
//   - the return-to-form phase: athletes come back as 'Recovering' (not at
//     peak form), train at reduced quality, and only reach 'Healthy' after
//     several weeks of rebuilding
//   - the permanent career injury ledger on every athlete (human and CPU)
//   - long-term toll: repeated MAJOR injuries erode potential and growth
//     rate (1 major ≈ no scar, 2 = slight, 3+ = noticeable)
//   - durability: fragile athletes get hurt more often than durable ones
//   - UI: injury history card on the player card, Recovering status
//   - long-sim stability and save/load round-trip of the new fields
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

  // ---- 1) The dev-mult curve: careers remember major injuries ----
  const curve = await page.evaluate(() => {
    const T = window.XCD.engine.Training;
    const fake = (majors) => ({ careerInjuries: Array.from({ length: majors }, () => ({ major: true })) });
    return {
      weeks: T.MAJOR_INJURY_WEEKS,
      m0: T.careerInjuryDevMult(fake(0)),
      m1: T.careerInjuryDevMult(fake(1)),
      m2: T.careerInjuryDevMult(fake(2)),
      m3: T.careerInjuryDevMult(fake(3)),
      m5: T.careerInjuryDevMult(fake(5)),
      count: T.majorInjuryCount({ careerInjuries: [{ major: true }, { major: false }, { major: true }] })
    };
  });
  ok(curve.weeks >= 4 && curve.weeks <= 6, 'major-injury threshold should be a real layoff: ' + curve.weeks);
  ok(curve.m0 === 1 && curve.m1 === 1, 'one major injury must leave almost no long-term scar');
  ok(curve.m2 > 0.85 && curve.m2 < 1, 'two majors = slight reduction: ' + curve.m2);
  ok(curve.m3 < curve.m2, 'three majors = noticeable decline: ' + curve.m3);
  ok(curve.m5 < curve.m3 && curve.m5 >= 0.6, 'toll deepens but never collapses: ' + curve.m5);
  ok(curve.count === 2, 'majorInjuryCount must only count majors: ' + curve.count);
  console.log('dev-mult curve:', JSON.stringify(curve));

  // ---- 2) Immediate effects: the layoff costs form, belief, and mood ----
  const layoff = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const school = g.getPlayerSchool();
    const a = g.getRoster(school.id, 'M')[0];
    a.injury = { type: 'Stress Fracture', weeksRemaining: 6, totalWeeks: 6, overuse: true };
    a.health = 'Injured';
    a.fitness = 70; a.sharpness = 75; a.confidence = 70; a.morale = 75; a.fatigue = 50;
    const before = { fitness: a.fitness, sharpness: a.sharpness, confidence: a.confidence, morale: a.morale };
    g.advanceWeek(); g.advanceWeek(); g.advanceWeek();
    return {
      id: a.id, before,
      after: { fitness: a.fitness, sharpness: a.sharpness, confidence: a.confidence, morale: a.morale },
      health: a.health, weeksRemaining: a.injury && a.injury.weeksRemaining,
      seasonInjuryWeeks: a.seasonInjuryWeeks
    };
  });
  ok(layoff.health === 'Injured' && layoff.weeksRemaining === 3, 'injury clock should tick down: ' + JSON.stringify(layoff));
  ok(layoff.after.fitness <= layoff.before.fitness - 6, 'fitness must bleed fast while injured: ' + layoff.after.fitness);
  ok(layoff.after.sharpness <= layoff.before.sharpness - 9, 'sharpness must deteriorate through recovery: ' + layoff.after.sharpness);
  ok(layoff.after.confidence < layoff.before.confidence, 'confidence must sink while unable to compete');
  ok(layoff.after.morale < layoff.before.morale, 'morale must sink during an extended layoff');
  ok(layoff.seasonInjuryWeeks >= 3, 'season injury weeks must accumulate');
  console.log('layoff effects:', JSON.stringify(layoff.after));

  // ---- 3) Return to form: Recovering phase, then full strength ----
  const comeback = await page.evaluate((athId) => {
    const g = window.XCD.ui.state.game;
    const a = g.world.athletes[athId];
    a.injury.weeksRemaining = 1;
    g.advanceWeek();
    const atReturn = { health: a.health, window: a.recentInjuryWeeks, injury: a.injury };
    let weeksToFull = 0;
    while (a.health === 'Recovering' && weeksToFull < 12) { g.advanceWeek(); weeksToFull++; }
    return { atReturn, weeksToFull, finalHealth: a.health };
  }, layoff.id);
  ok(comeback.atReturn.health === 'Recovering', 'athletes must NOT return at peak form — expected Recovering, got ' + comeback.atReturn.health);
  ok(comeback.atReturn.injury === null, 'the injury itself should be healed at return');
  ok(comeback.atReturn.window >= 2, 'a real rebuilding window is required: ' + comeback.atReturn.window);
  ok(comeback.weeksToFull >= 2 && comeback.finalHealth === 'Healthy', 'several weeks of rebuilding before full strength: ' + JSON.stringify(comeback));
  console.log('comeback:', JSON.stringify(comeback));

  // ---- 4) The world plays by the same rules: 3-season sim, CPU ledgers ----
  const world = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const weeks = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    for (let yr = 0; yr < 3; yr++) for (let w = 0; w < weeks; w++) g.advanceWeek();
    const all = Object.values(g.world.athletes);
    const withLedger = all.filter((a) => (a.careerInjuries || []).length);
    const sample = withLedger[0] && withLedger[0].careerInjuries[0];
    const majors2 = all.filter((a) => (a.careerInjuries || []).filter((i) => i.major).length >= 2);
    const scarred = all.filter((a) => (a.potentialLostToInjury || 0) > 0);
    const badScar = scarred.find((a) => a.careerInjuries.filter((i) => i.major).length < 2);
    const recovering = all.filter((a) => a.health === 'Recovering').length;
    const stuck = all.filter((a) => a.health === 'Recovering' && !(a.recentInjuryWeeks > 0)).length;
    // Durability check: fragile athletes should be hurt more often.
    const fragile = all.filter((a) => a.injuryResistance <= 45);
    const durable = all.filter((a) => a.injuryResistance >= 75);
    const rate = (grp) => grp.length ? grp.reduce((s, a) => s + (a.careerInjuries || []).length, 0) / grp.length : 0;
    return {
      athletes: all.length, ledgers: withLedger.length, sample,
      majors2: majors2.length, scarred: scarred.length, badScar: !!badScar,
      recovering, stuck,
      fragileRate: rate(fragile), durableRate: rate(durable),
      fragileN: fragile.length, durableN: durable.length
    };
  });
  ok(world.ledgers > 20, 'injuries across the world must land in career ledgers: ' + world.ledgers);
  ok(world.sample && world.sample.year && world.sample.type && world.sample.weeks > 0 && world.sample.major !== undefined,
    'ledger entries must carry year/type/weeks/major: ' + JSON.stringify(world.sample));
  ok(world.scarred > 0, 'over 3 seasons some athletes should carry a permanent potential toll');
  ok(!world.badScar, 'nobody may lose potential before a SECOND major injury');
  ok(world.stuck === 0, 'no athlete may be stranded in Recovering without a countdown');
  ok(world.fragileRate > world.durableRate, `fragile athletes must get hurt more than durable ones (fragile ${world.fragileRate.toFixed(2)} vs durable ${world.durableRate.toFixed(2)})`);
  console.log('world after 3 seasons:', JSON.stringify(world));

  // ---- 5) UI: injury history card + Recovering status on the player card ----
  const ui = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const school = g.getPlayerSchool();
    const a = g.getRoster(school.id, 'W')[0];
    a.careerInjuries = [
      { year: g.year - 1, week: 6, type: 'Achilles Tendinitis', weeks: 6, major: true },
      { year: g.year, week: 3, type: 'Stress Fracture', weeks: 7, major: true }
    ];
    a.potentialLostToInjury = 1;
    a.health = 'Recovering'; a.recentInjuryWeeks = 3; a.injury = null;
    window.XCD.ui.showPlayerCard(a, g);
    const modal = document.querySelector('.modal-backdrop');
    const text = modal ? modal.textContent : '';
    modal && modal.remove();
    return {
      hasHistory: text.includes('Injury History'),
      hasMajor: text.includes('MAJOR'),
      hasToll: text.includes('long-term ceiling'),
      hasRecovering: text.includes('Recovering — rebuilding race form'),
      listsInjury: text.includes('Achilles Tendinitis')
    };
  });
  ok(ui.hasHistory, 'player card must show the Injury History card');
  ok(ui.hasMajor, 'major injuries must be badged');
  ok(ui.hasToll, 'the permanent ceiling toll must be explained to the player');
  ok(ui.hasRecovering, 'Recovering status must be visible on the player card');
  ok(ui.listsInjury, 'every past injury must be listed');
  console.log('player card UI:', JSON.stringify(ui));

  // ---- 6) Save/load round-trip preserves the new fields ----
  const roundTrip = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const scarredId = Object.values(g.world.athletes).find((a) => (a.potentialLostToInjury || 0) > 0).id;
    const beforeA = g.world.athletes[scarredId];
    const before = {
      ledger: beforeA.careerInjuries.length, lost: beforeA.potentialLostToInjury,
      potential: beforeA.potential, health: beforeA.health, window: beforeA.recentInjuryWeeks
    };
    const g2 = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    const a2 = g2.world.athletes[scarredId];
    const after = {
      ledger: a2.careerInjuries.length, lost: a2.potentialLostToInjury,
      potential: a2.potential, health: a2.health, window: a2.recentInjuryWeeks
    };
    return { before, after, same: JSON.stringify(before) === JSON.stringify(after) };
  });
  ok(roundTrip.same, 'save/load must preserve injury ledgers, tolls, and recovery state: ' + JSON.stringify(roundTrip));
  console.log('save round-trip:', JSON.stringify(roundTrip.after));

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-injuries');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
