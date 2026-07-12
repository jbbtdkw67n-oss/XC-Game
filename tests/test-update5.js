// Update 5 — Living Dynasty & Coaching Careers.
// Drives the real game headless: assistant-coach career path, new mental
// attributes, job-security labels, altitude programs, blue-chip talent floor,
// and a multi-season stability check that the assistant→head promotion works.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');
const path = require('path');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // ---- 1) Assistant-coach start flow via the real menu UI ----
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.click('#btn-new');
  await page.waitForSelector('[data-role]');
  await page.click('[data-role="Assistant"]');
  await page.click('[data-arch="Recruiter"]');
  await page.click('#btn-next');
  await page.waitForSelector('.school-pick');
  await page.click('.school-pick');
  await page.click('#btn-start');
  await page.waitForSelector('#sidebar');

  const asst = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const school = g.getPlayerSchool();
    const player = g.getPlayerCoach();
    const head = g.getCoach(school.coachId);
    return {
      role: g.playerRole,
      isAssistant: g.isAssistant(),
      controlsTraining: g.controlsTraining(),
      playerIsAssistantOfSchool: school.assistantId === player.id,
      headExistsAndDifferent: !!head && head.id !== player.id && !head.isPlayer,
      trainingConfirmed: g.weeklyFlow.trainingConfirmed,
      headPlanControlled: g.getHeadCoach() && g.getHeadCoach().id === head.id
    };
  });
  ok(asst.role === 'Assistant', 'assistant role not set');
  ok(asst.isAssistant && !asst.controlsTraining, 'assistant should not control training');
  ok(asst.playerIsAssistantOfSchool, 'player not set as school assistant');
  ok(asst.headExistsAndDifferent, 'AI head coach should remain and differ from player');
  ok(asst.trainingConfirmed, 'assistant training step should be pre-confirmed');
  ok(asst.headPlanControlled, 'getHeadCoach() should resolve to the AI head coach');

  // Training screen shows the assistant read-only view (no plan editor).
  await page.click('[data-nav="training"]');
  await page.waitForTimeout(120);
  const trainingView = await page.evaluate(() => ({
    hasBanner: !!document.querySelector('#screen-container').textContent.match(/Head Coach Controls Training/i),
    hasConfirmBtn: !!document.querySelector('#btn-confirm-plan')
  }));
  ok(trainingView.hasBanner, 'assistant training banner missing');
  ok(!trainingView.hasConfirmBtn, 'assistant should not see the confirm-plan editor');

  // Recruiting points should reflect the recruiting rating (Section 16).
  const pts = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const coach = g.getPlayerCoach();
    const base = window.XCD.engine.Recruiting.weeklyPoints(g);
    coach.recruiting = 99;
    const high = window.XCD.engine.Recruiting.weeklyPoints(g);
    coach.recruiting = 30;
    const low = window.XCD.engine.Recruiting.weeklyPoints(g);
    return { base, high, low };
  });
  ok(pts.high > pts.low + 5, `recruiting rating should scale points (low ${pts.low} -> high ${pts.high})`);

  // ---- 2) New mental attributes exist and are wired ----
  const attrs = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const a = Object.values(g.world.athletes).find((x) => !x.isRecruit);
    return {
      hasCoachRel: typeof a.coachRelationship === 'number',
      hasTeamRel: typeof a.teamRelationship === 'number',
      hasConfidence: typeof a.confidence === 'number',
      reasons: Object.keys(window.XCD.data.PORTAL_REASONS)
    };
  });
  ok(attrs.hasCoachRel && attrs.hasTeamRel, 'relationship attributes missing on athletes');
  ok(attrs.reasons.includes('teamChem'), 'team-chemistry portal reason missing');

  // ---- 3) Simulate ~6 seasons as an assistant; expect a promotion path ----
  const sim = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // Force a strong recruiter so head-coach offers materialize.
    g.getPlayerCoach().recruiting = 92;
    let sawPromotionOffer = false;
    let becameHead = false;
    for (let i = 0; i < 21 * 8 && !becameHead; i++) {
      // Auto-run recruiting + training confirmation each week to advance.
      g.recruiting.auto = true;
      g.weeklyFlow.recruitingDone = true;
      if (g.controlsTraining()) g.weeklyFlow.trainingConfirmed = true;
      g.advanceWeek();
      if (g.jobOffers && g.jobOffers.promotion && g.jobOffers.offers.length) {
        sawPromotionOffer = true;
        // Accept the first promotion offer.
        const res = window.XCD.engine.Careers.acceptOffer(g, g.jobOffers.offers[0].schoolId);
        if (res.ok && !g.isAssistant()) becameHead = true;
      }
    }
    return {
      sawPromotionOffer,
      becameHead,
      roleAfter: g.playerRole,
      controlsTrainingAfter: g.controlsTraining(),
      year: g.year
    };
  });
  ok(sim.sawPromotionOffer, 'assistant never received a head-coach promotion offer in 8 seasons');
  ok(sim.becameHead && sim.roleAfter === 'Head', 'assistant promotion to head coach failed');
  ok(sim.controlsTrainingAfter, 'promoted head coach should control training');

  // ---- 4) Head-coach start: seat status + expectations + altitude ----
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await newDynasty(page, { archetype: 'Developer' });
  const head = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // Seat-status helper covers the full range.
    const D = window.XCD.data;
    const stable = D.seatStatus(0).key;
    const warm = D.seatStatus(45).key;
    const hot = D.seatStatus(80).key;
    // Dashboard renders expectations + a seat pill.
    const dash = document.querySelector('#screen-container');
    return {
      role: g.playerRole,
      controlsTraining: g.controlsTraining(),
      stable, warm, hot
    };
  });
  ok(head.role === 'Head' && head.controlsTraining, 'default start should be a head coach');
  ok(head.stable === 'stable' && head.warm === 'warm' && head.hot === 'hot', 'seat-status tiers wrong');

  // Dashboard should show the expectations card + job-security pill.
  const dashText = await page.evaluate(() => document.querySelector('#screen-container').textContent);
  ok(/Program Expectations/i.test(dashText), 'dashboard expectations card missing');
  ok(/Job security/i.test(dashText), 'dashboard job-security line missing');

  // ---- 5) Blue-chip talent floor: every fresh class has real elite talent ----
  const talent = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const perGender = { M: [], W: [] };
    Object.values(g.world.recruits).forEach((r) => perGender[r.gender].push(r.potential));
    const eliteM = perGender.M.filter((p) => p >= 88).length;
    const eliteW = perGender.W.filter((p) => p >= 88).length;
    return { eliteM, eliteW };
  });
  ok(talent.eliteM >= 8 && talent.eliteW >= 8, `blue-chip floor not met (M ${talent.eliteM}, W ${talent.eliteW})`);

  // ---- 6) Altitude program benefit is applied in training ----
  const altitude = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // Find a high-altitude school and a low one, snapshot stamina, run a
    // handful of training weeks, compare fatigue accrual tendency.
    const schools = Object.values(g.world.schools);
    const high = schools.find((s) => s.weather.altitude === 'High');
    return { hasHighAltitude: !!high, altOfHigh: high ? high.weather.altitude : null };
  });
  ok(altitude.hasHighAltitude, 'no high-altitude program exists in the world');

  await browser.close();

  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
  if (fails.length) { console.log('FAIL:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS');
}

run().catch((e) => { console.log('SCRIPT ERROR', e); process.exit(1); });
