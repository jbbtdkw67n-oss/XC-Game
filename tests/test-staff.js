// Assistant coach value + the living job market (master spec Part 2,
// Sections 12-13 minus contracts, and "Expanded Coaching Job Market").
// Verifies:
//   - assistants now genuinely matter: development multiplier, squad
//     chemistry, morale lift for strugglers, recruiting points — all wired
//     to the assistant's real ratings (CPU pushes included)
//   - the unemployed coach pool feeds the weekly candidate list, and a
//     real free agent can be hired with career history intact
//   - the Manage Staff panel shows full comparison profiles with impact
//     explanations and per-candidate Profile cards
//   - the head-coach job market grows (up to 6 first-wave offers) and
//     keeps evolving through the offseason (new openings, filled ones)
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

  // ---- 1) Assistant ratings feed real gameplay systems ----
  const impact = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const TE = window.XCD.engine.Training;
    const RE = window.XCD.engine.Recruiting;
    const school = g.getPlayerSchool();
    const coach = g.getPlayerCoach();
    const asst = g.getCoach(school.assistantId);

    const withRatings = (training, culture, motivation, recruiting, fn) => {
      const save = { t: asst.training, c: asst.culture, m: asst.motivation, r: asst.recruiting };
      asst.training = training; asst.culture = culture; asst.motivation = motivation; asst.recruiting = recruiting;
      const out = fn();
      Object.assign(asst, { training: save.t, culture: save.c, motivation: save.m, recruiting: save.r });
      return out;
    };

    const elite = withRatings(92, 90, 90, 95, () => ({
      culture: TE.squadCulture(g, school, 'M', coach),
      pts: RE.weeklyPoints(g)
    }));
    const poor = withRatings(20, 20, 20, 20, () => ({
      culture: TE.squadCulture(g, school, 'M', coach),
      pts: RE.weeklyPoints(g)
    }));
    return {
      eliteDev: elite.culture.asstDev, poorDev: poor.culture.asstDev,
      eliteChem: elite.culture.chemistry, poorChem: poor.culture.chemistry,
      eliteMot: elite.culture.asstMotivation, poorMot: poor.culture.asstMotivation,
      elitePts: elite.pts, poorPts: poor.pts
    };
  });
  ok(impact.eliteDev > 1.05 && impact.poorDev < 0.95,
    `assistant Dev must multiply weekly development (elite ${impact.eliteDev.toFixed(3)} vs poor ${impact.poorDev.toFixed(3)})`);
  ok(impact.eliteChem > impact.poorChem, 'assistant culture must feed squad chemistry');
  ok(impact.eliteMot >= 75 && impact.poorMot <= 35, 'assistant motivation must ride into the weekly loop');
  ok(impact.elitePts > impact.poorPts, 'assistant recruiting must add weekly recruiting points');
  console.log('assistant impact:', JSON.stringify(impact));

  // ---- 2) The unemployed pool feeds candidates; free agents hireable ----
  const pool = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Coaching;
    const M = window.XCD.models;
    g.week = 17; // the staffing window
    g.staffHiredYear = null;
    // Drop a distinctive veteran into the free-agent pool.
    const vet = new M.Coach({
      firstName: 'Marta', lastName: 'Quillfeather', age: 51, role: 'Head',
      recruiting: 70, training: 78, peaking: 66, culture: 72, schoolId: null,
      careerRecord: { wins: 300, losses: 120, seasons: 12, nationalTitles: 1, conferenceTitles: 4 }
    });
    g.world.coaches[vet.id] = vet;
    const cands = C.assistantCandidates(g);
    const found = cands.some((c) => c.id === vet.id);
    // Hire the veteran (or whoever) and confirm the mechanics.
    const target = cands.find((c) => c.id === vet.id) || cands[0];
    const res = C.hireAssistant(g, target);
    const school = g.getPlayerSchool();
    return {
      found, hireOk: res.ok,
      hiredId: school.assistantId === target.id,
      role: g.getCoach(school.assistantId).role,
      historyKept: target.id === vet.id ? g.getCoach(school.assistantId).careerRecord.seasons === 12 : null
    };
  });
  ok(pool.found, 'a real free agent must appear among the weekly candidates');
  ok(pool.hireOk && pool.hiredId && pool.role === 'Assistant', 'hiring must install the candidate as assistant: ' + JSON.stringify(pool));
  ok(pool.historyKept !== false, 'a hired free agent must keep their career history');
  console.log('free-agent pool:', JSON.stringify(pool));

  // ---- 3) The Manage Staff panel: full comparison + profiles ----
  await page.evaluate(() => { window.XCD.ui.state.game.staffHiredYear = null; }); // reopen the window for the UI check
  await page.click('[data-nav="school"]');
  await page.waitForSelector('#btn-manage-staff');
  await page.click('#btn-manage-staff');
  await page.waitForSelector('[data-view-cand]');
  const panel = await page.evaluate(() => {
    const m = document.querySelector('.modal-backdrop');
    const text = m ? m.textContent : '';
    return {
      crafts: ['Rec', 'Dev', 'Peak', 'Cul', 'Mot', 'Com', 'Eval'].every((k) => text.includes(k)),
      explains: text.includes('multiplies weekly development'),
      profiles: document.querySelectorAll('[data-view-cand]').length
    };
  });
  await page.click('[data-view-cand="0"]');
  await page.waitForTimeout(200);
  const profileOpened = await page.evaluate(() => {
    const cards = document.querySelectorAll('.modal-backdrop');
    const top = cards[cards.length - 1];
    const okCard = top && /Age|Career|Coach/.test(top.textContent);
    cards.forEach((c) => c.remove());
    return okCard;
  });
  ok(panel.crafts && panel.explains, 'the staff panel must show the full craft comparison with impact notes: ' + JSON.stringify(panel));
  ok(panel.profiles >= 3 && profileOpened, 'every candidate must open a full profile card');
  console.log('staff panel:', JSON.stringify(panel));

  // ---- 4) The open job market: every chair listed, evolving offseason ----
  const market = await page.evaluate(() => {
    const g0 = window.XCD.ui.state.game;
    const g = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g0.toJSON())));
    const C = window.XCD.engine.Careers;
    const coach = g.getPlayerCoach();
    coach.reputation = 80;
    g.week = 17;
    // Open ten chairs across the country so the market has inventory.
    const others = Object.values(g.world.schools).filter((s) => s.id !== g.playerSchoolId).slice(0, 10);
    others.forEach((s) => { if (s.coachId) { delete g.world.coaches[s.coachId]; s.coachId = null; } });
    C.generateOffers(g, new window.XCD.core.SeededRNG(11));
    // Elite assistant posts are direct courtships, not vacancies — exclude.
    const offers = (g.jobOffers ? g.jobOffers.offers : []).filter((o) => !o.assistantRole);
    const vacancies = Object.values(g.world.schools).filter((s) =>
      s.id !== g.playerSchoolId && (!s.coachId || !g.world.coaches[s.coachId])).length;
    const interestsOk = offers.every((o) => o.interest >= 4 && o.interest <= 95);
    // The market evolves: a chair opening mid-offseason joins the board.
    const late = Object.values(g.world.schools).find((s) =>
      s.id !== g.playerSchoolId && s.coachId && g.world.coaches[s.coachId] && !g.world.coaches[s.coachId].isPlayer);
    delete g.world.coaches[late.coachId];
    late.coachId = null;
    const before = g.jobOffers.offers.length;
    C.evolveJobMarket(g, new window.XCD.core.SeededRNG(500));
    const grew = g.jobOffers.offers.length > before &&
      g.jobOffers.offers.some((o) => o.schoolId === late.id);
    const newsHit = g.newsLog.some((n) => (n.text || n).toString().includes('New opening') ||
      (n.text || n).toString().includes('coaching market opens'));
    return { firstWave: offers.length, vacancies, interestsOk, grew, newsHit };
  });
  ok(market.firstWave >= 10 && market.firstWave === market.vacancies,
    `EVERY open chair must be listed (${market.firstWave} offers vs ${market.vacancies} vacancies)`);
  ok(market.interestsOk, 'every listing must carry a 4-95% interest chance');
  ok(market.grew, 'a chair opening mid-offseason must join the board');
  ok(market.newsHit, 'market movement must be reported in the news');
  console.log('job market:', JSON.stringify(market));

  // ---- 5) Applications: interest is the literal hire chance ----
  const apply = await page.evaluate(() => {
    const g0 = window.XCD.ui.state.game;
    const C = window.XCD.engine.Careers;
    const mk = (seed) => {
      const g = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g0.toJSON())));
      g.getPlayerCoach().reputation = 60;
      g.week = 17;
      Object.values(g.world.schools).filter((s) => s.id !== g.playerSchoolId).slice(0, 10)
        .forEach((s) => { if (s.coachId) { delete g.world.coaches[s.coachId]; s.coachId = null; } });
      C.generateOffers(g, new window.XCD.core.SeededRNG(seed));
      return g;
    };

    // The per-chair search draw is deterministic and exposed, so we can pick
    // a chair that is GUARANTEED to reject (draw above the interest chance)
    // and one guaranteed to hire — the test never flakes on a roll.
    // (a) A school with modest interest goes another direction.
    const g1 = mk(21);
    g1.jobOffers.offers.forEach((o) => { o.interest = 40; });
    const doomed = g1.jobOffers.offers.find((o) => C.applicationRoll(g1, o.schoolId) >= 0.4);
    const rej = C.applyForJob(g1, doomed.schoolId);
    const rejSchool = g1.getSchool(doomed.schoolId);
    const chairFilled = !!(rejSchool.coachId && g1.world.coaches[rejSchool.coachId]);
    const reapply = C.applyForJob(g1, doomed.schoolId);
    const stillHome = g1.playerSchoolId === g0.playerSchoolId;
    const rejection = !rej.ok && rej.rejected ? rej : null;

    // (b) A school with genuine interest hires the player.
    const g2 = mk(22);
    g2.jobOffers.offers.forEach((o) => { o.interest = 40; });
    const lock = g2.jobOffers.offers.find((o) => C.applicationRoll(g2, o.schoolId) < 0.4);
    let landed = false;
    if (lock) {
      const r = C.applyForJob(g2, lock.schoolId);
      landed = r.ok && g2.playerSchoolId === lock.schoolId;
    }

    // (c) The market only runs in the offseason.
    const g3 = mk(23);
    g3.week = 5;
    const inSeason = C.applyForJob(g3, g3.jobOffers.offers[0].schoolId);

    return {
      gotRejected: !!rejection, chairFilled,
      reapplyBlocked: !reapply.ok && !reapply.rejected,
      stillHome, landed,
      inSeasonBlocked: !inSeason.ok && /offseason/i.test(inSeason.message)
    };
  });
  ok(apply.gotRejected, 'low-interest schools must be able to go another direction');
  ok(apply.chairFilled, 'a school that passes on the player must hire someone else');
  ok(apply.reapplyBlocked, 'a closed door must stay closed for the cycle');
  ok(apply.stillHome, 'a rejected applicant must stay at their current program');
  ok(apply.landed, 'sufficient interest must land the player the job (and move them)');
  ok(apply.inSeasonBlocked, 'applications must only work in the offseason stage');
  console.log('applications:', JSON.stringify(apply));

  // ---- 6) Dashboard: the market card renders organized, offseason-only ----
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.week = 17;
    Object.values(g.world.schools).filter((s) => s.id !== g.playerSchoolId).slice(0, 6)
      .forEach((s) => { if (s.coachId) { delete g.world.coaches[s.coachId]; s.coachId = null; } });
    window.XCD.engine.Careers.generateOffers(g, new window.XCD.core.SeededRNG(31));
  });
  await page.click('[data-nav="dashboard"]');
  await page.waitForSelector('[data-apply]');
  const board = await page.evaluate(() => {
    const text = document.body.textContent;
    return {
      title: text.includes('Coaching Job Market'),
      interestHeader: text.includes('Interest'),
      pct: /\d+%/.test(text),
      applies: document.querySelectorAll('[data-apply]').length
    };
  });
  await page.click('[data-apply]');
  await page.waitForSelector('#confirm-apply');
  const modalText = await page.evaluate(() => {
    const m = document.querySelector('.modal-backdrop');
    const t = m ? m.textContent : '';
    m && m.remove();
    return { chance: t.includes('chance'), anotherDirection: t.includes('another direction') || t.includes('someone else') };
  });
  const inSeasonCard = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.week = 5; // regular season: the card must vanish even if offers linger
    window.XCD.ui.navigate('dashboard');
    return document.body.textContent.includes('Coaching Job Market');
  });
  ok(board.title && board.interestHeader && board.pct && board.applies >= 5,
    'the dashboard market card must list every chair with Interest %: ' + JSON.stringify(board));
  ok(modalText.chance && modalText.anotherDirection, 'the apply dialog must explain the interest roll');
  ok(!inSeasonCard, 'the job market card must only render during the offseason');
  await page.evaluate(() => { window.XCD.ui.state.game.week = 17; }); // restore
  console.log('market UI:', JSON.stringify({ ...board, modal: modalText }));

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-staff');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
