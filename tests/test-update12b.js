// Update 12 (second wave) test:
//  1) Weekly flow is order-independent: Done Recruiting before OR after
//     Confirm Training — neither step ever has to be pressed twice.
//  2) Origin-realistic names: international recruits draw names + hometowns
//     from their country's pool (a Kenyan recruit is never "Tyler Smith").
//  3) Avatars: deterministic, gender-aligned, heritage-aligned little people
//     for athletes and coaches; the player coach's wizard-built appearance
//     persists through a save round-trip.
//  4) GOAT list filters: division/gender/status/search narrow the lists.
//  5) Full individual results + championship honor highlighting metadata.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page);

  // ---- 1) Weekly flow: Done Recruiting FIRST, then Confirm Training ----
  const flow1 = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.weeklyFlow = { trainingConfirmed: false, recruitingDone: false };
    return true;
  });
  ok(flow1, 'flow reset failed');
  await page.click('[data-nav="recruiting"]');
  await page.waitForSelector('#btn-finish-recruiting');
  await page.click('#btn-finish-recruiting');
  const afterRec = await page.evaluate(() => ({ ...window.XCD.ui.state.game.weeklyFlow }));
  ok(afterRec.recruitingDone === true, 'Done Recruiting must register even before training is confirmed');
  ok(afterRec.trainingConfirmed === false, 'training must still be pending');
  // The button routed us to training — confirm the plan there.
  await page.waitForSelector('#btn-confirm-plan');
  await page.click('#btn-confirm-plan');
  const afterBoth = await page.evaluate(() => ({ ...window.XCD.ui.state.game.weeklyFlow }));
  ok(afterBoth.recruitingDone && afterBoth.trainingConfirmed, 'both steps done after one press each (recruiting-first order)');
  console.log('flow order-independence:', JSON.stringify(afterBoth));

  // ---- 2) Origin-realistic names ----
  const names = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const D = window.XCD.data;
    const recs = Object.values(g.world.recruits || {});
    const intl = recs.filter((r) => r.source === 'International');
    let poolMiss = 0, cityMiss = 0;
    const kenyans = [];
    intl.forEach((r) => {
      const pool = D.NAME_POOLS[r.country];
      if (!pool) return;
      const firstOk = pool.M.includes(r.firstName) || pool.W.includes(r.firstName);
      const lastOk = pool.last.includes(r.lastName);
      if (!firstOk || !lastOk) poolMiss++;
      if (pool.cities && !pool.cities.includes(r.hometownCity)) cityMiss++;
      if (r.country === 'Kenya') kenyans.push(r.fullName);
    });
    return { intl: intl.length, poolMiss, cityMiss, kenyans: kenyans.slice(0, 4), heritage: D.heritageOf('Kipruto', 'Kenya') };
  });
  console.log('origin names:', JSON.stringify(names));
  ok(names.intl > 0, 'no international recruits generated');
  ok(names.poolMiss === 0, `${names.poolMiss} international recruits with out-of-pool names`);
  ok(names.cityMiss === 0, `${names.cityMiss} international recruits with non-native hometowns`);
  ok(names.heritage === 'eastafrican', 'heritage classifier wrong for Kenya');

  // ---- 3) Avatars ----
  const av = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const UI = window.XCD.ui;
    const athletes = Object.values(g.world.athletes).slice(0, 200);
    let genderMismatch = 0, nonDeterministic = 0, beardedWomen = 0;
    athletes.forEach((a) => {
      const app1 = UI.appearanceFor(a);
      const app2 = UI.appearanceFor(a);
      if (JSON.stringify(app1) !== JSON.stringify(app2)) nonDeterministic++;
      if (app1.gender !== a.gender) genderMismatch++;
      if (a.gender === 'W' && app1.beard > 0) beardedWomen++;
    });
    // Heritage → skin alignment: Kenyan/Ethiopian recruits read dark-skinned.
    const eastAfricans = Object.values(g.world.recruits)
      .filter((r) => ['Kenya', 'Ethiopia', 'Uganda'].includes(r.country))
      .map((r) => UI.appearanceFor(r).skin);
    const darkShare = eastAfricans.length
      ? eastAfricans.filter((s) => s >= 4).length / eastAfricans.length : 1;
    const svg = UI.avatar(athletes[0], { size: 24 });
    const coachSvg = UI.avatar(g.getPlayerCoach(), { size: 24 });
    return {
      genderMismatch, nonDeterministic, beardedWomen,
      eastAfricans: eastAfricans.length, darkShare,
      athleteSvgOk: svg.includes('<svg') && svg.includes('ellipse'),
      // Update 13: coaches wear polos — the button placket rect is the marker.
      coachPolo: coachSvg.includes('x="31.3"')
    };
  });
  console.log('avatars:', JSON.stringify(av));
  ok(av.nonDeterministic === 0, 'avatar derivation must be deterministic');
  ok(av.genderMismatch === 0, 'avatar gender must match the athlete');
  ok(av.beardedWomen === 0, 'women must never derive beards');
  // The heritage weights intentionally leave a small tail of medium tones,
  // so require a dominant share rather than unanimity.
  ok(av.darkShare >= 0.9, `east-african heritage must map to dark skin tones (got ${av.darkShare})`);
  ok(av.athleteSvgOk, 'athlete avatar SVG malformed');
  ok(av.coachPolo, 'coach avatar must wear the polo outfit');

  // Player coach appearance survives a save round-trip.
  const rt = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.getPlayerCoach().appearance = { gender: 'M', skin: 6, hair: 6, hairStyle: 3, beard: 5 };
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    const revived = window.XCD.engine.GameState.fromJSON(json);
    const c = revived.getPlayerCoach();
    return { app: c.appearance, gender: c.gender };
  });
  ok(rt.app && rt.app.skin === 6 && rt.app.beard === 5, 'coach appearance lost in save round-trip');
  ok(rt.gender === 'M' || rt.gender === 'W', 'coach gender lost in save round-trip');

  // ---- 4) GOAT filters ----
  await page.click('[data-nav="history"]');
  await page.click('[data-tab="goat"]');
  await page.waitForSelector('#goat-search');
  const goatUI = await page.evaluate(() => ({
    hasDiv: !!document.querySelector('#goat-div'),
    hasGender: !!document.querySelector('#goat-gender'),
    hasStatus: !!document.querySelector('#goat-status')
  }));
  ok(goatUI.hasDiv && goatUI.hasGender && goatUI.hasStatus, 'GOAT filter controls missing');
  // Gender filter: every visible athlete row must be women when W selected.
  await page.selectOption('#goat-gender', 'W');
  const goatW = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#goat-body tbody tr')];
    const genders = rows.map((r) => r.children[2] && r.children[2].textContent.trim()).filter(Boolean);
    return { rows: rows.length, nonW: genders.filter((x) => x !== 'W').length };
  });
  ok(goatW.nonW === 0, 'GOAT gender filter leaks men into the women list');
  // Division filter narrows to that division (or empties gracefully).
  await page.selectOption('#goat-gender', '');
  await page.selectOption('#goat-div', 'DC');
  const goatD3 = await page.evaluate(() => {
    const GOAT = window.XCD.engine.GOAT;
    const g = window.XCD.ui.state.game;
    const all = GOAT.athletes(g);
    const d3 = all.filter((r) => r.division === 'DC');
    const rows = document.querySelectorAll('#goat-body tbody tr').length;
    return { d3: d3.length, rows };
  });
  ok(goatD3.rows === Math.min(goatD3.d3, 40), `DC filter row mismatch: ${JSON.stringify(goatD3)}`);
  console.log('goat filters:', JSON.stringify({ goatUI, goatW, goatD3 }));

  // ---- 5) Championship honor metadata + full results ----
  const honors = await page.evaluate(() => {
    const UI = window.XCD.ui;
    return {
      nat: UI.meetHonorInfo({ type: 'national', division: 'DA' }),
      conf: UI.meetHonorInfo({ type: 'conference', division: 'DA' }),
      confD3: UI.meetHonorInfo({ type: 'conference', division: 'DC' }),
      invite: UI.meetHonorInfo({ type: 'invite', division: 'DA' })
    };
  });
  console.log('honors:', JSON.stringify(honors));
  ok(honors.nat && honors.nat.count === 40 && honors.nat.label === 'All-American', 'DA nationals honor window wrong');
  ok(honors.conf && honors.conf.count === 14 && honors.conf.label === 'All-Conference', 'DA conference honor window wrong');
  ok(honors.confD3 && honors.confD3.count === 7, 'DC conference honor window wrong');
  ok(honors.invite === null, 'regular-season meets must have no honor window');

  // Sim to the first race, then verify the Race Center publishes EVERY finisher.
  await page.click('[data-nav="dashboard"]');
  // Week 1 checklist gates simming — complete it via state (it has its own test).
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.week1 = { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: true, setupConfirmed: true };
    g.weeklyFlow = { trainingConfirmed: true, recruitingDone: true };
    window.XCD.ui.renderShell();
  });
  await page.click('#btn-sim-race');
  await page.waitForSelector('#race-track', { timeout: 30000 });
  await page.click('#btn-skip');
  await page.waitForSelector('#race-track h3');
  const fullResults = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const meet = g.season.meets[g.lastPlayerMeetId];
    const gender = document.querySelector('#g-m.active') ? 'M' : 'W';
    const res = meet.results[gender];
    const rows = document.querySelectorAll('#race-track tbody tr').length;
    return { finishers: res.finishers.length, rows };
  });
  console.log('full results:', JSON.stringify(fullResults));
  ok(fullResults.rows === fullResults.finishers, `Race Center must publish all ${fullResults.finishers} finishers (got ${fullResults.rows})`);

  await browser.close();
  const problems = fails.concat(errors);
  if (problems.length) {
    console.error('FAIL');
    problems.forEach((p) => console.error(' -', p));
    process.exit(1);
  }
  console.log('PASS');
})().catch((e) => { console.error('FAIL (exception)', e); process.exit(1); });
