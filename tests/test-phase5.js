// Phase 5 test: coach creation flow, 4 ratings only, archetype bonus,
// upgrade points earned + spendable, archetype gameplay effects.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);

  // Wizard flow (Update 6): identity → appearance → archetype (mandatory) →
  // philosophies → summary → school.
  await page.goto('file://' + require('path').resolve(__dirname, '../index.html'));
  await page.click('#btn-new');
  await page.waitForSelector('#coach-first');
  await page.click('#btn-next');
  // Update 12: the appearance step is a human avatar builder with sliders.
  await page.waitForSelector('#coach-avatar-preview');
  await page.$eval('[data-app="skin"]', (el) => { el.value = '5'; el.dispatchEvent(new Event('input')); });
  await page.click('#btn-next');
  await page.waitForSelector('[data-arch]');
  const nextDisabled = await page.$eval('#btn-next', (b) => b.disabled);
  if (!nextDisabled) errors.push('Next enabled before archetype chosen');
  await page.click('[data-arch="Tactician"]');
  await page.click('#btn-next');
  await page.waitForSelector('[data-tp]');
  await page.click('#btn-next');
  await page.waitForSelector('[data-rp]');
  await page.click('#btn-next');
  await page.waitForSelector('.wizard-summary-box');
  await page.click('#btn-next');
  await page.waitForSelector('.school-pick');
  await page.click('.school-pick');
  await page.click('#btn-start');
  await page.waitForSelector('#sidebar');

  const coach = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const c = g.getPlayerCoach();
    return {
      archetype: c.archetype, skin: c.appearance && c.appearance.skin, gender: c.gender,
      ratings: { recruiting: c.recruiting, training: c.training, peaking: c.peaking, culture: c.culture },
      legacy: ['raceStrategy', 'development', 'loyalty', 'charisma', 'discipline', 'personality'].filter((k) => c[k] !== undefined),
      overall: c.overallRating
    };
  });
  console.log('player coach:', JSON.stringify(coach));
  if (coach.archetype !== 'Tactician') errors.push('Archetype not applied');
  if (coach.skin !== 5) errors.push('Avatar appearance not applied: skin=' + coach.skin);
  if (coach.gender !== 'M' && coach.gender !== 'W') errors.push('Coach gender missing: ' + coach.gender);
  if (coach.ratings.peaking !== 64) errors.push('Archetype bonus missing: peaking=' + coach.ratings.peaking);
  if (coach.legacy.length) errors.push('Legacy coach attrs present: ' + coach.legacy);

  // AI coaches also have only 4 ratings + archetypes
  const ai = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const cs = Object.values(g.world.coaches).filter((c) => !c.isPlayer).slice(0, 50);
    return {
      badArch: cs.filter((c) => !['Recruiter', 'Developer', 'Tactician', 'Players Coach'].includes(c.archetype)).length,
      legacy: cs.filter((c) => c.development !== undefined || c.charisma !== undefined).length
    };
  });
  if (ai.badArch || ai.legacy) errors.push('AI coaches malformed: ' + JSON.stringify(ai));

  // Simulate a full season; give ourselves a title-caliber team first so
  // upgrade points definitely flow.
  const pts = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // Boost the player's roster to elite so they win things
    ['M', 'W'].forEach((gen) => {
      g.getRoster(g.playerSchoolId, gen).forEach((a) => {
        ['vo2Max', 'runningEconomy', 'stamina', 'lactateThreshold', 'speed'].forEach((k) => { a[k] = 95; });
        a.potential = 99; a.fitness = 90; a.fatigue = 5;
        a.recalculateOverall();
      });
    });
    for (let i = 0; i < 20; i++) g.advanceWeek(); // through nationals + awards + signing
    const c = g.getPlayerCoach();
    return { upgradePoints: c.upgradePoints, news: g.newsLog.filter((n) => n.text.includes('RÉSUMÉ')).length };
  });
  console.log('upgrade points after title season:', JSON.stringify(pts));
  if (!pts.upgradePoints) errors.push('No upgrade points earned after a title season');

  // Spend a point on My Program
  await page.click('[data-nav="school"]');
  await page.waitForSelector('[data-coach-upg]');
  const before = await page.evaluate(() => window.XCD.ui.state.game.getPlayerCoach().recruiting);
  await page.click('[data-coach-upg="recruiting"]');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => {
    const c = window.XCD.ui.state.game.getPlayerCoach();
    return { recruiting: c.recruiting, pts: c.upgradePoints };
  });
  if (after.recruiting !== before + 1) errors.push(`Upgrade spend broken: ${before} -> ${after.recruiting}`);
  console.log('spend check:', before, '->', JSON.stringify(after));

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
