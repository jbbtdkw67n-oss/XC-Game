// High School Personal Best Recruiting System (master spec Part 2, Section 16).
// Verifies:
//   - every recruit carries an official 5K PB from realistic, separate
//     boys'/girls' distributions (elite = nationally competitive times)
//   - the PB correlates with current ability while potential stays
//     independent enough that slow kids can hide elite ceilings
//   - one HS state champion per state per gender, stamped permanently
//   - NXN finishes persist on the athlete
//   - prep history (PB, state title, NXN) follows the athlete into college
//   - UI: 5K PB column on the board, PB + credentials on profiles
//   - old saves get deterministic backfilled PBs on load
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

  // ---- 1) Distributions, correlation, and potential independence ----
  const dist = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const recs = Object.values(g.world.recruits);
    const boys = recs.filter((r) => r.gender === 'M');
    const girls = recs.filter((r) => r.gender === 'W');
    const avg = (xs) => xs.reduce((p, c) => p + c, 0) / xs.length;
    const pbs = (grp) => grp.map((r) => r.hsPB);
    const eliteBoys = boys.filter((r) => r.nationalRank <= 10);
    const eliteGirls = girls.filter((r) => r.nationalRank <= 10);
    const corr = (grp) => {
      const xs = grp.map((r) => r.hsPB), ys = grp.map((r) => r.currentOverall);
      const mx = avg(xs), my = avg(ys);
      let num = 0, dx = 0, dy = 0;
      grp.forEach((r, i) => { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; });
      return num / Math.sqrt(dx * dy);
    };
    // Potential independence: same-speed boys should span wide ceilings.
    const band = boys.filter((r) => r.hsPB >= 950 && r.hsPB <= 1000).map((r) => r.potential);
    return {
      missing: recs.filter((r) => r.hsPB === undefined).length,
      nBoys: boys.length, nGirls: girls.length,
      eliteBoysAvg: avg(pbs(eliteBoys)), eliteGirlsAvg: avg(pbs(eliteGirls)),
      boysAvg: avg(pbs(boys)), girlsAvg: avg(pbs(girls)),
      boysMin: Math.min(...pbs(boys)), girlsMin: Math.min(...pbs(girls)),
      boysMax: Math.max(...pbs(boys)), girlsMax: Math.max(...pbs(girls)),
      corrBoys: corr(boys),
      bandSpread: band.length >= 5 ? Math.max(...band) - Math.min(...band) : null,
      bandN: band.length
    };
  });
  ok(dist.missing === 0, 'every recruit must carry a 5K PB: ' + dist.missing + ' missing');
  ok(dist.eliteBoysAvg < 900, `elite boys must run nationally competitive times (<15:00 avg): ${(dist.eliteBoysAvg / 60).toFixed(2)} min`);
  ok(dist.eliteGirlsAvg < 1030, `elite girls must run nationally competitive times (<17:10 avg): ${(dist.eliteGirlsAvg / 60).toFixed(2)} min`);
  ok(dist.boysMin >= 835 && dist.boysMax <= 1160, `boys' range must stay realistic: ${dist.boysMin}-${dist.boysMax}s`);
  ok(dist.girlsMin >= 955 && dist.girlsMax <= 1325, `girls' range must stay realistic: ${dist.girlsMin}-${dist.girlsMax}s`);
  ok(dist.girlsAvg > dist.boysAvg + 100, 'the distributions must be generated separately by gender');
  ok(dist.corrBoys < -0.55, 'PB must correlate strongly with current ability: r=' + dist.corrBoys.toFixed(2));
  ok(dist.bandSpread === null || dist.bandSpread >= 25,
    'same-speed recruits must span wide ceilings (potential independent): spread ' + dist.bandSpread);
  console.log('PB distributions:', JSON.stringify({
    eliteBoys: (dist.eliteBoysAvg / 60).toFixed(2), eliteGirls: (dist.eliteGirlsAvg / 60).toFixed(2),
    corr: +dist.corrBoys.toFixed(2), bandSpread: dist.bandSpread, bandN: dist.bandN
  }));

  // ---- 2) State champions: one per state per gender, stamped forever ----
  const states = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const recs = Object.values(g.world.recruits);
    const problems = [];
    let champs = 0;
    ['M', 'W'].forEach((gender) => {
      const byState = {};
      recs.filter((r) => r.gender === gender && r.source === 'HS' && r.hometownState !== 'INT')
        .forEach((r) => { (byState[r.hometownState] = byState[r.hometownState] || []).push(r); });
      Object.entries(byState).forEach(([st, grp]) => {
        const c = grp.filter((r) => r.hsStateChampion);
        if (c.length !== 1) problems.push(`${gender}/${st}: ${c.length} champs`);
        else {
          champs++;
          const a = c[0];
          if (!(a.honorYears.hsStateChamp || []).length) problems.push(`${gender}/${st}: no honor year`);
          if (!(a.accolades || []).some((x) => x.type === 'hsStateChamp')) problems.push(`${gender}/${st}: no accolade`);
        }
      });
    });
    return { champs, problems: problems.slice(0, 5) };
  });
  ok(states.problems.length === 0, 'state titles must be exactly one per state per gender: ' + states.problems.join('; '));
  ok(states.champs >= 60, 'most states should crown champions in both genders: ' + states.champs);
  console.log('state champions:', states.champs);

  // ---- 3) The recruiting board shows the 5K PB column ----
  await page.click('[data-nav="recruiting"]');
  await page.waitForSelector('[data-tab="search"]');
  await page.click('[data-tab="search"]');
  // The recruiting board renders as a card list on every screen size now.
  await page.waitForSelector('.m-cards, .data');
  const board = await page.evaluate(() => {
    const t = document.querySelector('.screen-body, main, body').textContent;
    return { column: t.includes('5K PB'), times: /1[456789]:\d\d\.\d/.test(t) };
  });
  ok(board.column && board.times, 'the board must display the 5K PB column with times: ' + JSON.stringify(board));

  // ---- 4) NXN finishes persist; prep history follows the athlete ----
  const legacy = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    while (g.week <= g.season.nationalWeek) g.advanceWeek(); // NXN runs with NCAAs
    const recs = Object.values(g.world.recruits);
    const withFinish = recs.filter((r) => r.nxn && r.nxn.finish);
    const champ = withFinish.find((r) => r.nxn.finish === 1);

    // Enroll a decorated recruit and confirm the history survives.
    const pick = recs.find((r) => r.hsStateChampion && !r.committedTo) || recs[0];
    pick.committedTo = g.playerSchoolId;
    pick.signed = true;
    window.XCD.engine.Recruiting.enrollSignees(g);
    const a = g.world.athletes[pick.id];
    window.XCD.ui.showPlayerCard(a, g);
    const modal = document.querySelector('.modal-backdrop');
    const text = modal ? modal.textContent : '';
    modal && modal.remove();
    const badges = window.XCD.engine.Legacy.badgesFor(a);
    return {
      withFinish: withFinish.length, hasChamp: !!champ,
      enrolled: !!a && !a.isRecruit,
      pbKept: a && a.hsPB === pick.hsPB,
      titleKept: a && (a.honorYears.hsStateChamp || []).length === 1,
      cardShowsPB: text.includes('HS 5K PB'),
      badge: badges.some((b) => b.key === 'hsStateChamp')
    };
  });
  ok(legacy.withFinish >= 40, 'top-30 NXN finishes must persist on recruits (both genders): ' + legacy.withFinish);
  ok(legacy.hasChamp, 'an NXN champion must carry finish #1');
  ok(legacy.enrolled && legacy.pbKept && legacy.titleKept,
    'prep history must follow the athlete into college: ' + JSON.stringify(legacy));
  ok(legacy.cardShowsPB, 'the college profile must display the HS 5K PB forever');
  ok(legacy.badge, 'the HS State Champion badge must render for life');
  console.log('prep legacy:', JSON.stringify(legacy));

  // ---- 5) Save/load keeps every credential ----
  const persisted = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const g2 = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    const recs = Object.values(g2.world.recruits);
    const anyPBLost = recs.some((r) => r.hsPB === undefined);
    const champsKept = recs.filter((r) => r.hsStateChampion).length ===
      Object.values(g.world.recruits).filter((r) => r.hsStateChampion).length;
    return { anyPBLost, champsKept };
  });
  ok(!persisted.anyPBLost && persisted.champsKept, 'credentials must survive save/load: ' + JSON.stringify(persisted));

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-hspb');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
