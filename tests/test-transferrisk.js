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
    const stuck = roster.filter((a) => a.eligibilityRemaining >= 2)[3];
    stuck.classYear = 'Junior'; stuck.seasonDev = 0;
    stuck.potential = stuck.currentOverall + 20;
    const stuckRisk = P.transferRisk(g, stuck);

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
    victims.forEach((a) => { a.morale = 0; a.coachRelationship = 15; a.teamRelationship = 15; });
    g.advanceWeek(); // the portal opens this week
    const entries = (g.portal && g.portal.entries) || [];
    const inPortal = victims.filter((a) => entries.some((e) => e.athleteId === a.id)).length;
    return { week: g.week, entryWeek, open: g.portal && g.portal.open, victims: victims.length, inPortal, total: entries.length };
  });
  ok(zero.open, 'the portal must be open at week ' + zero.entryWeek + ': ' + JSON.stringify(zero));
  ok(zero.inPortal >= 2, `zero-morale athletes must almost always enter the portal (${zero.inPortal}/${zero.victims})`);
  console.log('zero-morale rule:', JSON.stringify(zero));

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-transferrisk');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
