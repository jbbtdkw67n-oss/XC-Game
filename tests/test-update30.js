// Version 15.16: stronger CPU development, honors-driven coach reputation,
// elite parity across conferences, new recruiting motivations, a stature rule
// for assistant hires, and job security in the coach's season history.
// Verifies:
//   - The Freshmen and Recovery mileage presets are gone (+10, −10 and the
//     Championship taper remain, on the screen too)
//   - CPU staffs train through regular-season meets (no wasted mini-taper)
//     and shape each runner's mileage to their durability; CPU development
//     carries a 5% base rate on top of the difficulty slider
//   - An 85+ DI program gets the power-conference tier whatever its league
//     (school size, budget target, spotlight recruits); 84 does not
//   - The three new motivations exist, are scored in the right direction,
//     and a philosophy believer names a real (non-Balanced) philosophy
//   - Reputation: a DI title moves a decorated coach a lot, results without
//     honors barely move one at the top, gains above 90 count 60% (30% above 95),
//     a name above 85 fades without national honors, and national titles
//     set a legacy floor
//   - Head coaches at 75+ reputation are locked out of the staff market
//   - After a season every head coach has a seat entry for it; the coach
//     History tab shows a job-security pill, and a fired tenure reads Fired
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(600000);
  await newDynasty(page, { seed: 4242 });

  // ---- 1) Mileage presets ----
  const presets = await page.evaluate(() => window.XCD.data.MILEAGE.PRESETS.map((p) => p.key));
  ok(JSON.stringify(presets) === JSON.stringify(['plus10', 'minus10', 'taper']), 'presets must be +10, −10, taper only: ' + presets);
  await page.evaluate(() => window.XCD.ui.navigate('training'));
  await page.waitForSelector('[data-preset="taper"]');
  const btns = await page.$$eval('[data-preset]', (els) => els.map((e) => e.dataset.preset));
  ok(!btns.includes('freshmen') && !btns.includes('recovery'), 'training screen must not show the Freshmen/Recovery presets: ' + btns);

  // ---- 2) CPU development ----
  const cpu = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, T = window.XCD.engine.Training, D = window.XCD.data, CAL = D.CALENDAR;
    const S = window.XCD.engine.Settings;
    const school = Object.values(g.world.schools).find((s) => s.id !== g.playerSchoolId && s.rosterM.length >= 6 &&
      T.coachCraft(g.getCoach(s.coachId)) >= 50);
    const coach = g.getCoach(school.coachId);
    const saveWeek = g.week;
    // A regular-season meet week for this program.
    const MC = window.XCD.engine.MeetCalendar;
    let raceWeek = null;
    for (let w = CAL.REGULAR_SEASON_START; w < CAL.CONFERENCE_WEEK; w++) {
      if (MC.schoolRacesWeek(g, school.id, w)) { raceWeek = w; break; }
    }
    g.week = raceWeek;
    const plan = T.aiPlan(g, coach, 40, { peak: { taperWeek: CAL.NATIONAL_WEEK - 1 }, avgStale: 4 });
    const meta = T.planMetaFor(plan);
    // Individual mileage: a durable and a fragile runner on the same squad.
    g.week = 7;
    const r = g.getRoster(school.id, 'M');
    const tough = r[0], soft = r[1];
    // Both built up to a big chronic load, so the ramp limit isn't what binds.
    const keep = [tough.injuryResistance, soft.injuryResistance, tough.chronicMileage, soft.chronicMileage];
    tough.injuryResistance = 95; soft.injuryResistance = 25;
    tough.chronicMileage = 110; soft.chronicMileage = 110;
    const mTough = T.mileageFor(g, school, 'M', tough, coach);
    const mSoft = T.mileageFor(g, school, 'M', soft, coach);
    tough.injuryResistance = keep[0]; soft.injuryResistance = keep[1];
    tough.chronicMileage = keep[2]; soft.chronicMileage = keep[3];
    g.week = saveWeek;
    const base = T.cpuDevMult(g);
    S.set(g, 'cpuDevelopment', 1.35);
    const legend = T.cpuDevMult(g);
    S.set(g, 'cpuDevelopment', 1);
    return { raceWeek, plan: plan.join(','), dev: meta.devMult, mTough, mSoft, base, legend, BASE: T.CPU_DEV_BASE };
  });
  ok(cpu.raceWeek != null, 'a CPU program must have a regular-season meet');
  ok(cpu.dev >= 1.3, 'a competent CPU staff must train through a regular-season meet: ' + JSON.stringify(cpu));
  ok(cpu.mTough > cpu.mSoft + 8, 'CPU mileage must follow each runner\'s durability: ' + JSON.stringify(cpu));
  ok(cpu.BASE === 1.05 && Math.abs(cpu.base - 1.05) < 1e-9 && Math.abs(cpu.legend - 1.05 * 1.35) < 1e-9,
    'CPU development: 5% base rate times the difficulty slider: ' + JSON.stringify(cpu));
  console.log('cpu:', JSON.stringify(cpu));

  // ---- 3) Elite parity ----
  const parity = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, D = window.XCD.data, F = window.XCD.engine.Finances, R = window.XCD.engine.Recruiting;
    const nau = Object.values(g.world.schools).find((s) => s.name === 'Northern Arizona' && (s.division || 'DI') === 'DI');
    const dii = Object.values(g.world.schools).find((s) => s.division === 'DII');
    const keep = nau.prestige;
    const rec = Object.values(g.world.recruits).find((r) => !r.signed);
    const keepMot = rec.motivations.slice();
    rec.motivations = ['spotlight'];
    nau.prestige = 90;
    const at90 = { tier: D.effectiveTier(nau), size: F.schoolSizeFactor(nau), fit: R.fitScore(g, nau, rec) };
    nau.prestige = 84;
    const at84 = { tier: D.effectiveTier(nau), size: F.schoolSizeFactor(nau), fit: R.fitScore(g, nau, rec) };
    nau.prestige = keep;
    rec.motivations = keepMot;
    const diiKeep = dii.prestige; dii.prestige = 95;
    const diiTier = D.effectiveTier(dii); dii.prestige = diiKeep;
    return { conf: nau.conference, raw: nau.conferenceTier, at90, at84, diiTier, diiRaw: dii.conferenceTier };
  });
  ok(parity.raw >= 3 && parity.at90.tier === 1 && parity.at84.tier === parity.raw,
    'an 85+ DI program plays as a power-conference school, an 84 does not: ' + JSON.stringify(parity));
  ok(parity.at90.size === 1.5 && parity.at84.size < 1.5, 'elite parity must reach school size: ' + JSON.stringify(parity));
  ok(parity.at90.fit > parity.at84.fit + 10, 'a big-conference-atmosphere recruit must treat an elite mid-major as big time: ' + JSON.stringify(parity));
  ok(parity.diiTier === parity.diiRaw, 'parity is a Division I rule: ' + JSON.stringify(parity));

  // ---- 4) Recruiting motivations ----
  const mot = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, D = window.XCD.data, R = window.XCD.engine.Recruiting;
    const keys = D.MOTIVATIONS.map((m) => m.key);
    const recs = Object.values(g.world.recruits);
    const believers = recs.filter((r) => r.motivations.includes('philosophy-fit'));
    const counts = { stability: 0, 'philosophy-fit': 0, 'pro-pipeline': 0 };
    recs.forEach((r) => r.motivations.forEach((m) => { if (m in counts) counts[m]++; }));
    const badPref = believers.filter((r) => !r.philosophyPref || r.philosophyPref === 'balanced').length;
    const strays = recs.filter((r) => r.philosophyPref && !r.motivations.includes('philosophy-fit')).length;
    const label = believers.length ? D.motivationLabel('philosophy-fit', believers[0]) : '';
    const rec = recs.find((r) => !r.signed);
    const keepM = rec.motivations.slice(), keepP = rec.philosophyPref;
    const school = Object.values(g.world.schools).find((s) => s.id !== g.playerSchoolId && (s.division || 'DI') === 'DI' && g.getCoach(s.coachId));
    const coach = g.getCoach(school.coachId);
    const kc = { yrs: coach.yearsAtSchool, hot: coach.hotSeat, tp: coach.trainingPhilosophy, changed: school.coachChangedYear, pipe: school.pipeline };
    const fit = (m) => { rec.motivations = m; return R.fitScore(g, school, rec); };
    // Stability
    coach.hotSeat = 0; school.coachChangedYear = null;
    coach.yearsAtSchool = 10; const stable = fit(['stability']);
    coach.yearsAtSchool = 0; coach.hotSeat = 80; school.coachChangedYear = g.year; const shaky = fit(['stability']);
    coach.yearsAtSchool = kc.yrs; coach.hotSeat = kc.hot; school.coachChangedYear = kc.changed;
    // Philosophy fit
    rec.philosophyPref = 'norwegian';
    coach.trainingPhilosophy = 'norwegian'; const match = fit(['philosophy-fit']);
    coach.trainingPhilosophy = 'speed'; const clash = fit(['philosophy-fit']);
    coach.trainingPhilosophy = kc.tp;
    // Pro pipeline
    school.pipeline = 15; const pro = fit(['pro-pipeline']);
    school.pipeline = 0; const none = fit(['pro-pipeline']);
    school.pipeline = kc.pipe;
    rec.motivations = keepM; rec.philosophyPref = keepP;
    return { has: ['stability', 'philosophy-fit', 'pro-pipeline'].every((k) => keys.includes(k)), counts, badPref, strays, label,
      stable, shaky, match, clash, pro, none };
  });
  ok(mot.has, 'the three new motivations must exist');
  ok(Object.values(mot.counts).every((n) => n > 100), 'each new motivation must show up across the recruiting class: ' + JSON.stringify(mot.counts));
  ok(mot.badPref === 0 && mot.strays === 0, 'philosophy believers (and only they) name a real philosophy: ' + JSON.stringify(mot));
  ok(/^Believes in .+ training$/.test(mot.label) && !/specific/.test(mot.label), 'the believer\'s label names the philosophy: ' + mot.label);
  ok(mot.stable > mot.shaky + 15, 'stability recruits favor a long-tenured, safe staff: ' + JSON.stringify(mot));
  ok(mot.match > mot.clash + 12, 'philosophy believers favor their philosophy: ' + JSON.stringify(mot));
  ok(mot.pro > mot.none + 14, 'pro-pipeline recruits favor programs that produce All-Americans: ' + JSON.stringify(mot));
  console.log('motivations:', JSON.stringify(mot));

  // ---- 5) Reputation ----
  const rep = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, C = window.XCD.engine.Coaching, RNG = window.XCD.core.SeededRNG;
    const school = Object.values(g.world.schools).find((s) => s.id !== g.playerSchoolId && (s.division || 'DI') === 'DI' && g.getCoach(s.coachId));
    const coach = g.getCoach(school.coachId);
    const y = g.year - 1;
    const H = g.history;
    const saved = {
      rankings: g.rankings, nat: (H.nationalChampions || {})[y], conf: (H.conferenceChampions || {})[y],
      reg: (H.regionalChampions || {})[y], staff: H.seasonStaffHonors, rep: coach.reputation,
      cr: JSON.parse(JSON.stringify(coach.careerRecord))
    };
    H.nationalChampions = H.nationalChampions || {}; H.conferenceChampions = H.conferenceChampions || {};
    H.regionalChampions = H.regionalChampions || {};
    const reset = () => {
      H.nationalChampions[y] = {}; H.conferenceChampions[y] = {}; H.regionalChampions[y] = {};
      H.seasonStaffHonors = {};
      coach.careerRecord = JSON.parse(JSON.stringify(saved.cr));
      coach.careerRecord.nationalTitles = 0; coach.careerRecord.natCOY = 0; coach.careerRecord._repNatCOY = 0;
      coach.careerRecord.confCOY = 0; coach.careerRecord._repConfCOY = 0;
      g.rankings = { M: [{ schoolId: school.id, rank: 5 }], W: [], divisionSizes: saved.rankings && saved.rankings.divisionSizes };
    };
    const gain = (start, setup) => {
      reset(); coach.reputation = start; if (setup) setup();
      C.updateReputation(g, coach, school, new RNG(7));
      return Math.round((coach.reputation - start) * 10) / 10;
    };
    const title = () => { H.nationalChampions[y] = { M: { teamId: school.id } }; g.rankings.M[0].rank = 1; };
    const res = {
      plain85: gain(85),
      plain96: gain(96),
      title80: gain(80, title),
      title96: gain(96, title),
      floor: (() => { gain(40, () => { coach.careerRecord.nationalTitles = 3; coach.careerRecord.natCOY = 1; coach.careerRecord._repNatCOY = 1; }); return coach.reputation; })()
    };
    g.rankings = saved.rankings;
    H.nationalChampions[y] = saved.nat; H.conferenceChampions[y] = saved.conf; H.regionalChampions[y] = saved.reg;
    H.seasonStaffHonors = saved.staff; coach.reputation = saved.rep; coach.careerRecord = saved.cr;
    return res;
  });
  ok(rep.plain85 <= 1.6, 'results without honors barely move a coach at 85: ' + JSON.stringify(rep));
  ok(rep.title80 >= 5, 'a DI national title moves a decorated coach a lot: ' + JSON.stringify(rep));
  ok(rep.title96 > rep.plain96 + 1 && rep.title96 < 2.5, 'gains above 95 count 30%: ' + JSON.stringify(rep));
  ok(rep.plain96 < 0, 'a legend without national honors fades (upkeep): ' + JSON.stringify(rep));
  ok(rep.floor >= 74, 'three national titles and a national COY set a legacy floor of 74: ' + JSON.stringify(rep));
  console.log('reputation:', JSON.stringify(rep));

  // ---- 6) Stature: 75+ reputation head coaches won't be assistants ----
  const staff = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, C = window.XCD.engine.Coaching;
    const mine = g.getPlayerSchool();
    const keepP = mine.prestige; mine.prestige = 97;
    let market = C.staffMarket(g);
    const head = market.rows.find((r) => r.source === 'head' && !r.locked);
    const out = { found: !!head };
    if (head) {
      const keepRep = head.coach.reputation;
      head.coach.reputation = 80;
      market = C.staffMarket(g);
      const row = market.rows.find((r) => r.coach.id === head.coach.id);
      out.locked80 = row ? row.locked : 'missing';
      head.coach.reputation = 60;
      market = C.staffMarket(g);
      const row60 = market.rows.find((r) => r.coach.id === head.coach.id);
      out.locked60 = row60 ? row60.locked : null;
      head.coach.reputation = keepRep;
    }
    mine.prestige = keepP;
    out.max = C.STAFF_HEAD_REP_MAX;
    return out;
  });
  ok(staff.found, 'the staff market must list head coaches at smaller programs');
  ok(staff.max === 75 && /stature/.test(staff.locked80 || ''), 'a 75+ reputation head coach is locked out: ' + JSON.stringify(staff));
  ok(!/stature/.test(staff.locked60 || ''), 'a 60-reputation head coach is not stature-locked: ' + JSON.stringify(staff));

  // ---- 7) Job security in the coach history ----
  const season = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, D = window.XCD.data, CAL = D.CALENDAR;
    const year = g.year;
    // Through Nationals: the hot-seat pass has graded every sitting head coach.
    while (g.week <= CAL.NATIONAL_WEEK) g.advanceWeek();
    const heads = Object.values(g.world.schools).map((s) => g.getCoach(s.coachId)).filter(Boolean);
    const logged = heads.filter((c) => c.seatLog && c.seatLog[year] !== undefined).length;
    // Then through the offseason into the next year.
    while (g.year === year) g.advanceWeek();
    const sitting = Object.values(g.world.schools).map((s) => [s, g.getCoach(s.coachId)])
      .filter(([s, c]) => c && !c.isPlayer && c.seatLog && c.seatLog[year] !== undefined &&
        (c.stints || []).some((st) => !st.endYear && st.schoolId === s.id && st.startYear <= year));
    const [s1, c1] = sitting[0];
    // A firing: end another tenure the way the hot-seat pass does.
    const [s2, c2] = sitting[1];
    window.XCD.engine.Legacy.closeStint(g, c2, s2, year, 'fired');
    return { year, logged, heads: heads.length, sittingId: c1.id, sittingSeat: D.seatStatus(c1.seatLog[year]).key, firedId: c2.id };
  });
  ok(season.heads > 50 && season.logged === season.heads, 'every sitting head coach logs the season\'s seat: ' + JSON.stringify(season));
  const pill = async (id) => {
    await page.evaluate((cid) => { const g = window.XCD.ui.state.game; window.XCD.ui.showCoachCard(g.world.coaches[cid], g); }, id);
    await page.waitForSelector('[data-pctab="history"]');
    await page.click('[data-pctab="history"]');
    const pills = await page.$$eval('[data-pcpane="history"] .seat-pill', (els) => els.map((e) => e.className + '|' + e.textContent.trim()));
    await page.evaluate(() => window.XCD.ui.closeModal());
    return pills;
  };
  if (season.sittingId) {
    const pills = await pill(season.sittingId);
    ok(pills.some((p) => p.includes('seat-' + season.sittingSeat)), 'a sitting coach\'s History shows the season\'s job security: ' + JSON.stringify(pills));
  }
  if (season.firedId) {
    const pills = await pill(season.firedId);
    ok(pills.some((p) => p.includes('seat-fired') && /Fired/.test(p)), 'a fired tenure shows Fired on its last season: ' + JSON.stringify(pills));
  }
  await page.screenshot({ path: require('path').resolve(__dirname, '.logs/update30-history.png') }).catch(() => {});

  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  if (fails.length) {
    console.log('FAIL');
    fails.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  }
  console.log('PASS');
}

run().catch((e) => { console.error(e); console.log('FAIL'); process.exit(1); });
