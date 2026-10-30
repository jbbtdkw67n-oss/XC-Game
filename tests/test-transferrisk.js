// Transfer Desire & Transfer Risk Indicator (master spec Part 2, Section 14).
// Verifies:
//   - every rostered athlete carries a five-level Transfer Risk built from
//     the same desire score the CPU's portal entries use
//   - the indicator reveals concrete reasons (high risk) or anchors (low)
//   - the Zero Morale Rule: rock-bottom athletes almost always enter the
//     portal, with exceptionally strong bonds the only reprieve
//   - development stagnation and injury-lost seasons now feed desire
//   - UI: Risk column on the roster, expandable indicator on the profile
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

  // ---- 1) The level scale + reasons/anchors on live athletes ----
  const scale = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const school = g.getPlayerSchool();
    const roster = g.getRoster(school.id, 'M');
    // First-season athletes are graced (always Very Low), so the scale is
    // judged on returners.
    roster.forEach((a) => { a.yearsOnCampus = Math.max(2, a.yearsOnCampus || 1); a.transferGraceYear = null; });

    // A miserable, unheard athlete with eligibility left → Very High.
    const sad = roster.find((a) => a.eligibilityRemaining >= 2);
    sad.morale = 0; sad.coachRelationship = 20; sad.teamRelationship = 20;
    const sadRisk = P.transferRisk(g, sad);

    // The same misery, anchored by an exceptional coach bond → not forced.
    const held = roster.filter((a) => a.eligibilityRemaining >= 2)[1];
    held.morale = 0; held.coachRelationship = 95; held.teamRelationship = 90;
    held.seasonDev = 4;
    const heldRisk = P.transferRisk(g, held);

    // A thriving athlete in a healthy program → low, with anchors shown.
    const happy = roster.filter((a) => a.eligibilityRemaining >= 2)[2];
    happy.morale = 85; happy.coachRelationship = 88; happy.teamRelationship = 85;
    happy.seasonDev = 4; happy.currentOverall = Math.min(happy.currentOverall, school.prestige);
    const happyRisk = P.transferRisk(g, happy);

    // Stagnation feeds desire: big headroom, zero growth, not a freshman.
    // A season-scoped reason (Update 24): judged once the season has run.
    const stuck = roster.filter((a) => a.eligibilityRemaining >= 2)[3];
    stuck.classYear = 'Junior'; stuck.seasonDev = 0;
    stuck.potential = stuck.currentOverall + 20;
    const wk = g.week;
    g.week = 10;
    const stuckRisk = P.transferRisk(g, stuck);
    g.week = wk;

    // A graduating senior never shows live risk.
    const senior = roster.find((a) => a.eligibilityRemaining < 2);
    const seniorRisk = senior ? P.transferRisk(g, senior) : null;

    return {
      levels: window.XCD.data.TRANSFER_RISK_LEVELS.map((l) => l.label),
      sad: { level: sadRisk.level.label, reasons: sadRisk.reasons },
      held: { level: heldRisk.level.label },
      happy: { level: happyRisk.level.label, anchors: happyRisk.anchors },
      stuckReasons: stuckRisk.reasons,
      seniorGraduating: seniorRisk ? seniorRisk.graduating : true,
      ids: { sad: sad.id, happy: happy.id }
    };
  });
  ok(scale.levels.join(',') === 'Very Low,Low,Moderate,High,Very High',
    'the five desire levels must exist: ' + scale.levels);
  ok(scale.sad.level === 'Very High', 'zero morale + weak bonds must read Very High, got ' + scale.sad.level);
  ok(scale.sad.reasons.includes('Completely unhappy'), 'the zero-morale reason must be revealed: ' + scale.sad.reasons);
  ok(scale.held.level !== 'Very High', 'an exceptional bond must be able to hold a miserable athlete: ' + scale.held.level);
  ok(scale.happy.level === 'Very Low' || scale.happy.level === 'Low',
    'a thriving athlete must read Very Low/Low, got ' + scale.happy.level);
  ok(scale.happy.anchors.length >= 2, 'low risk must reveal what anchors them: ' + JSON.stringify(scale.happy.anchors));
  ok(scale.stuckReasons.includes('Limited development'), 'stagnation must feed transfer desire: ' + scale.stuckReasons);
  ok(scale.seniorGraduating, 'graduating athletes must be marked as finishing, not at risk');
  console.log('risk scale:', JSON.stringify(scale));

  // ---- 2) UI: roster Risk column + player-card indicator ----
  await page.click('[data-nav="roster"]');
  await page.waitForSelector('#roster-table');
  const ui = await page.evaluate((ids) => {
    const table = document.querySelector('#roster-table');
    const header = table.textContent.includes('Risk');
    const veryHigh = table.textContent.includes('Very High');
    window.XCD.ui.showPlayerCard(window.XCD.ui.state.game.getAthlete(ids.sad), window.XCD.ui.state.game);
    const modal = document.querySelector('.modal-backdrop');
    const text = modal ? modal.textContent : '';
    const details = modal && modal.querySelector('details');
    if (details) details.open = true;
    const reveals = details ? details.textContent.includes('Completely unhappy') : false;
    modal && modal.remove();
    return { header, veryHigh, cardShows: text.includes('Transfer Risk'), reveals };
  }, scale.ids);
  ok(ui.header, 'the roster must show a Risk column');
  ok(ui.veryHigh, 'the miserable athlete must show Very High on the roster');
  ok(ui.cardShows, 'the player card must show the Transfer Risk indicator');
  ok(ui.reveals, 'expanding the indicator must reveal the reasons');
  console.log('risk UI:', JSON.stringify(ui));

  // ---- 3) The Zero Morale Rule drives real portal entries ----
  const zero = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const CAL = window.XCD.data.CALENDAR;
    const entryWeek = window.XCD.engine.Portal.ENTRY_WEEK;
    while (g.week < entryWeek - 1) g.advanceWeek();
    // Three rock-bottom athletes with eligibility and no anchoring bonds.
    const school = g.getPlayerSchool();
    const victims = g.getRoster(school.id, 'W')
      .filter((a) => a.eligibilityRemaining >= 2 && a.redshirt !== 'True' && a.redshirt !== 'Medical')
      .slice(0, 3);
    victims.forEach((a) => { a.yearsOnCampus = Math.max(2, a.yearsOnCampus || 1); a.transferGraceYear = null; a.morale = 0; a.coachRelationship = 15; a.teamRelationship = 15; });
    g.advanceWeek(); // the portal opens this week
    const open = g.portal && g.portal.open;
    const total = ((g.portal && g.portal.entries) || []).length;
    // A week of training lifts morale a point or two, so judge the rule on
    // athletes who are still at rock bottom when the window opens.
    victims.forEach((a) => { a.morale = 0; });
    let hits = 0, tries = 0;
    for (let k = 0; k < 10; k++) {
      window.XCD.engine.Portal.openPortal(g, new window.XCD.core.SeededRNG(4100 + k));
      victims.forEach((a) => { tries++; if (g.portal.entries.some((e) => e.athleteId === a.id)) hits++; });
    }
    const inPortal = Math.round(hits / tries * victims.length * 10) / 10;
    return { week: g.week, entryWeek, open, victims: victims.length, inPortal, rate: hits / tries, total };
  });
  ok(zero.open, 'the portal must be open at week ' + zero.entryWeek + ': ' + JSON.stringify(zero));
  ok(zero.inPortal >= 2, `zero-morale athletes must almost always enter the portal (${zero.inPortal}/${zero.victims})`);
  console.log('zero-morale rule:', JSON.stringify(zero));

  // ---- 4) New arrivals are settled; reasons need a real cause ----
  const fresh = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const R = window.XCD.data.PORTAL_REASONS;
    const school = g.getPlayerSchool();
    const roster = g.getRoster(school.id, 'M');
    const save = g.week;
    const out = {};

    // A freshman with every push maxed out still reads Very Low — and a
    // signee is stamped with the grace year when they enroll.
    const fr = roster.find((a) => a.eligibilityRemaining >= 2);
    const snap = { ...fr };
    fr.yearsOnCampus = 1; fr.transferGraceYear = null; fr.classYear = 'Freshman';
    fr.morale = 30; fr.coachRelationship = 20; fr.teamRelationship = 20; fr.hometownState = 'AK';
    const r1 = P.transferRisk(g, fr);
    out.freshman = { level: r1.level.key, score: r1.score, anchors: r1.anchors };
    // ...and never enters this season's portal.
    let entered = 0;
    for (let k = 0; k < 20; k++) {
      P.openPortal(g, new window.XCD.core.SeededRNG(900 + k));
      if (g.portal.entries.some((e) => e.athleteId === fr.id)) entered++;
    }
    g.portal = null;
    out.freshmanEntered = entered;
    Object.assign(fr, snap);

    // Week 1 of a season: low fitness is the summer reset, not undertraining,
    // and ordinary depth hasn't been denied anything yet.
    g.week = 1;
    const ret = roster.filter((a) => a.eligibilityRemaining >= 2 && !a.injury)
      .sort((a, b) => a.currentOverall - b.currentOverall)[0]; // deepest on the depth chart
    const rsnap = { ...ret };
    ret.yearsOnCampus = 3; ret.transferGraceYear = null;
    ret.fitness = 30; ret.fatigue = 10; ret.workEthic = 80; ret.currentOverall = Math.max(ret.currentOverall, 46);
    out.week1Reasons = P.transferRisk(g, ret).reasons;
    // Midseason, a healthy runner good enough to race who never has.
    g.week = 10;
    ret.seasonRaces = 0; ret.seasonInjuryWeeks = 0; ret.currentOverall = 60;
    out.week10Reasons = P.transferRisk(g, ret).reasons;

    // Training fit follows the miles the runner actually carries.
    ret.chronicMileage = 40;
    out.lowMilesFit = P.transferRisk(g, ret).reasons.includes(R.trainingFit);
    ret.chronicMileage = 140;
    out.highMilesFit = P.transferRisk(g, ret).reasons.includes(R.trainingFit);
    Object.assign(ret, rsnap);
    g.week = save;
    return out;
  });
  console.log('new arrivals:', JSON.stringify(fresh));
  ok(fresh.freshman.level === 'very-low' && fresh.freshman.score === 0,
    'a first-season athlete must read Very Low whatever else is going on: ' + JSON.stringify(fresh.freshman));
  ok(fresh.freshman.anchors.some((x) => /First season/.test(x)), 'a freshman must show the first-season anchor');
  ok(fresh.freshmanEntered === 0, 'a first-season athlete must never enter that season\'s portal: ' + fresh.freshmanEntered);
  const RR = { racing: 'Lack of racing opportunities', under: 'Undertraining' };
  ok(!fresh.week1Reasons.includes(RR.under), 'week 1 low fitness must not read as undertraining: ' + fresh.week1Reasons);
  ok(!fresh.week1Reasons.includes(RR.racing), 'ordinary depth must not be "buried" on day one: ' + fresh.week1Reasons);
  ok(fresh.week10Reasons.includes(RR.racing), 'a healthy runner who never races must feel it by midseason: ' + fresh.week10Reasons);
  ok(fresh.week10Reasons.includes(RR.under), 'midseason chronic undertraining must still count: ' + fresh.week10Reasons);
  ok(!fresh.lowMilesFit && fresh.highMilesFit, 'training fit must follow the runner\'s actual mileage: ' + JSON.stringify(fresh));

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-transferrisk');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
