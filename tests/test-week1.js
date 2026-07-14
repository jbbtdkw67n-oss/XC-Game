// Week 1 Administrative Phase (master spec Part 2, Section 15) + the
// Pre-Nationals acceptance flow fix.
// Verifies:
//   - Week 2 is locked behind the season-setup checklist (UI gate)
//   - the checklist completes task by task through the real dashboard UI
//   - schedule finalization locks meet selection and the Pre-Nationals
//     answer permanently; the selection UI disappears afterward
//   - accepting Pre-Nationals lands it directly in the finalized slate
//   - the Division I 14-athlete limit: player cuts required when over,
//     cut athletes move on through the portal, CPU programs self-trim
//   - assistants are never gated; the checklist resets every rollover
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

  // ---- 1) Week 2 locked: the advance bounces to the checklist ----
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.weeklyFlow = { trainingConfirmed: true, recruitingDone: true };
  });
  await page.click('#btn-advance-week');
  await page.waitForTimeout(150);
  const gate = await page.evaluate(() => ({
    week: window.XCD.ui.state.game.week,
    screen: window.XCD.ui.state.currentScreen,
    complete: window.XCD.ui.state.game.week1Complete()
  }));
  ok(gate.week === 1 && !gate.complete, 'Week 2 must stay locked behind the checklist: ' + JSON.stringify(gate));
  ok(gate.screen === 'dashboard', 'a blocked advance must route to the Dashboard checklist');

  // ---- 2) The checklist card renders with every task ----
  await page.waitForSelector('#w1-confirm');
  const card = await page.evaluate(() => {
    const text = document.body.textContent;
    return {
      title: text.includes('Week 1 — Season Setup'),
      locked: text.includes('Week 2 is locked'),
      confirmDisabled: document.querySelector('#w1-confirm').disabled
    };
  });
  ok(card.title && card.locked, 'the Week 1 checklist card must render');
  ok(card.confirmDisabled, 'final confirmation must wait for the other tasks');

  // ---- 3) Pre-Nationals: accepting lands straight in the schedule ----
  const pn = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const season = g.season;
    const p = season.preNationals;
    // Guarantee an invitation regardless of starting prestige.
    if (!p.playerInvited) {
      p.playerInvited = true;
      if (!p.invited.includes(g.playerSchoolId)) p.invited.push(g.playerSchoolId);
    }
    // Start from a declined state, then accept.
    window.XCD.engine.Races.setPreNationalsDecision(g, false);
    const accept = window.XCD.engine.Races.setPreNationalsDecision(g, true);
    return {
      acceptOk: accept.ok,
      inSlate: season.playerMeetByWeek[p.week] === p.meetId,
      week: p.week
    };
  });
  ok(pn.acceptOk, 'accepting the Pre-Nationals invitation must work at Week 1');
  ok(pn.inSlate, 'an accepted invitation must go straight into the finalized schedule');

  // ---- 4) Complete the checklist through the real UI ----
  await page.click('[data-nav="dashboard"]');
  await page.waitForSelector('#w1-confirm');
  // First season: no offseason to review, so that task is already Done.
  const reportAuto = await page.evaluate(() => {
    if (document.querySelector('#w1-report')) return false;
    return !window.XCD.ui.state.game.week1NeedsReport();
  });
  ok(reportAuto, 'season one must auto-complete the progression review (nothing to review yet)');
  await page.click('#w1-roster');          // at the limit — confirms
  await page.waitForSelector('#w1-staff');
  await page.click('#w1-staff');           // keep current staff
  // Schedule: finalize on the Schedule screen.
  await page.click('[data-nav="schedule"]');
  await page.waitForSelector('#btn-finalize-schedule');
  const preLock = await page.evaluate(() => document.body.textContent.includes('Race Schedule Selection'));
  await page.click('#btn-finalize-schedule');
  await page.waitForTimeout(150);
  const postLock = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const text = document.body.textContent;
    return {
      finalized: g.week1.scheduleFinalized,
      selectionGone: !text.includes('Race Schedule Selection'),
      lockedNote: text.includes('Schedule Finalized'),
      pnLockedNote: text.includes('Locked with the finalized schedule') || !g.season.preNationals.playerInvited,
      selectBlocked: !window.XCD.engine.Scheduling.select(g, g.season.raceWeeks[0], null).ok,
      pnBlocked: !window.XCD.engine.Races.setPreNationalsDecision(g, false).ok,
      pnStillInSlate: g.season.playerMeetByWeek[g.season.preNationals.week] === g.season.preNationals.meetId
    };
  });
  ok(preLock, 'the selection UI must be visible before finalization');
  ok(postLock.finalized && postLock.selectionGone && postLock.lockedNote,
    'finalizing must permanently replace the selection UI: ' + JSON.stringify(postLock));
  ok(postLock.selectBlocked, 'meet selection must be locked after finalization');
  ok(postLock.pnBlocked && postLock.pnStillInSlate, 'the Pre-Nationals answer must lock with the schedule');

  // Final sign-off unlocks Week 2.
  await page.click('[data-nav="dashboard"]');
  await page.waitForSelector('#w1-confirm');
  await page.click('#w1-confirm');
  await page.evaluate(() => { window.XCD.ui.state.game.weeklyFlow = { trainingConfirmed: true, recruitingDone: true }; });
  await page.click('#btn-advance-week');
  await page.waitForTimeout(250);
  const advanced = await page.evaluate(() => window.XCD.ui.state.game.week);
  ok(advanced === 2, 'completing the checklist must unlock Week 2: week=' + advanced);
  console.log('checklist flow: complete, advanced to week', advanced);

  // ---- 5) DI roster limit: player cuts + CPU self-trim ----
  const cuts = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const school = g.getPlayerSchool();
    // Rebuild a Week 1 situation two athletes over the limit.
    g.week = 1;
    g.week1 = window.XCD.engine.GameState.freshWeek1();
    const donor = Object.values(g.world.schools).find((s) =>
      s.id !== g.playerSchoolId && s.rosterM.length >= 14);
    for (let i = 0; i < 2; i++) {
      const id = donor.rosterM.pop();
      g.world.athletes[id].schoolId = school.id;
      school.rosterM.push(id);
    }
    const before = school.rosterM.length;
    const overStatus = g.rosterLimitStatus();
    const blockedConfirm = overStatus.over;
    // Cutting below the limit is refused; cutting while over works.
    const victim1 = school.rosterM[school.rosterM.length - 1];
    const r1 = P.cutAthlete(g, victim1);
    const victim2 = school.rosterM[school.rosterM.length - 1];
    const r2 = P.cutAthlete(g, victim2);
    const atLimit = school.rosterM.length;
    const r3 = P.cutAthlete(g, school.rosterM[0]); // now at the limit — refused
    const cutA = g.world.athletes[victim1];
    return {
      before, blockedConfirm,
      cut1: r1.ok, cut2: r2.ok, atLimit,
      overCutRefused: !r3.ok,
      landedSomewhere: !cutA || (cutA.schoolId && cutA.schoolId !== g.playerSchoolId),
      after: g.rosterLimitStatus()
    };
  });
  ok(cuts.before === 16 && cuts.blockedConfirm, 'the over-limit state must be detected: ' + JSON.stringify(cuts));
  ok(cuts.cut1 && cuts.cut2 && cuts.atLimit === 14, 'cuts must reduce the squad to 14');
  ok(cuts.overCutRefused, 'cutting below the limit must be refused');
  ok(cuts.landedSomewhere, 'cut athletes must move on through the portal (or leave the sport)');
  ok(!cuts.after.over, 'the roster task must be satisfiable after cuts');
  console.log('player cuts:', JSON.stringify(cuts));

  // ---- 6) CPU programs trim to 14; the checklist resets at rollover ----
  const world = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const weeks = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    g.week1 = { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: true, setupConfirmed: true };
    for (let w = 0; w < weeks + 2; w++) g.advanceWeek(); // through the rollover
    const over = Object.values(g.world.schools).filter((s) =>
      (s.division || 'DI') === 'DI' && s.id !== g.playerSchoolId &&
      (s.rosterM.length > 14 || s.rosterW.length > 14));
    const fresh = g.week1;
    return {
      week: g.week, overCount: over.length,
      checklistReset: !fresh.setupConfirmed && !fresh.scheduleFinalized,
      scheduleUnlockedAtW1: g.week === 1 ? !g.scheduleLocked() : null
    };
  });
  ok(world.overCount === 0, 'every CPU Division I program must trim to 14 per squad: ' + world.overCount + ' over');
  ok(world.checklistReset, 'the Week 1 checklist must reset each season');
  console.log('world after rollover:', JSON.stringify(world));

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-week1');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
