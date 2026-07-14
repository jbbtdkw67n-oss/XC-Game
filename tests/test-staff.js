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

  // ---- 4) The job market: bigger first wave, evolving offseason ----
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
    const firstWave = g.jobOffers ? g.jobOffers.offers.length : 0;
    const divisions = g.jobOffers ? [...new Set(g.jobOffers.offers.map((o) => o.division))] : [];
    // The market evolves week to week.
    let grew = false, newsHit = false;
    for (let i = 0; i < 12; i++) {
      const before = g.jobOffers ? g.jobOffers.offers.length : 0;
      C.evolveJobMarket(g, new window.XCD.core.SeededRNG(500 + i));
      const after = g.jobOffers ? g.jobOffers.offers.length : 0;
      if (after > before) grew = true;
    }
    newsHit = g.newsLog.some((n) => (n.text || n).toString().includes('New opening') ||
      (n.text || n).toString().includes('fills its head-coaching vacancy'));
    return { firstWave, divisions, grew, newsHit, final: g.jobOffers ? g.jobOffers.offers.length : 0 };
  });
  ok(market.firstWave >= 4, 'a strong resume with open chairs must draw a big first wave (up to 6): ' + market.firstWave);
  ok(market.grew, 'the market must evolve — new openings surfacing through the offseason');
  ok(market.newsHit, 'market movement must be reported in the news');
  console.log('job market:', JSON.stringify(market));

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-staff');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
