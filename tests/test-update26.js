// Update 26: the Down Week, the absorption bank, and season expectations.
// Verifies:
//   - A Down Week sheds fatigue WITHOUT spending the peak — even with a
//     quality session on a cut big enough to be the taper — keeps the taper
//     charge building, restores every runner's mileage after the week, and
//     can't be run back to back (cooldown), surviving a save round-trip
//   - The absorption bank: a tired runner banks part of the week's gains
//     (a fresh one banks none); a recovery / down week lands about half
//   - Season expectations move with last season's finish, the preseason
//     poll, and roster talent; the hot seat reads them
//   - UI: the Down Week button + hint, the Absorbing row, and the
//     dashboard's expectation target
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(600000);
  await newDynasty(page, {});

  // ---- 1) Down Week vs the same cut without it ----
  const dw = await page.evaluate(() => {
    const g0 = window.XCD.ui.state.game;
    const GS = window.XCD.engine.GameState;
    const T = window.XCD.engine.Training;
    window.XCD.engine.Settings.set(g0, 'injuryRate', 0);
    const setup = (g) => {
      g.week = 9;
      g.getRoster(g.playerSchoolId, 'M').forEach((a) => {
        a.injury = null; a.health = 'Healthy';
        a.chronicMileage = 80; a.taperCharge = 0.5; a.peakSeason = null; a.peakBonus = 0;
        a.fatigue = 72; a.staleness = 12; a.absorbBank = 3; a.highLoadWeeks = 0;
      });
      g.training.overrides = {}; g.training.mileageOverrides = {};
      g.training.M = ['easy', 'tempo', 'easy', 'easy', 'easy', 'long', 'easy']; // one quality session
      g.training.mileage.M = 80;
    };
    const clone = () => GS.fromJSON(JSON.parse(JSON.stringify(g0.toJSON())));
    const avg = (g, f) => { const r = g.getRoster(g.playerSchoolId, 'M'); return r.reduce((s, a) => s + f(a), 0) / r.length; };
    const out = {};

    // A: a 45% cut with a quality session and NO down week → the taper.
    const A = clone(); setup(A);
    A.getRoster(A.playerSchoolId, 'M').forEach((a) => { A.training.mileageOverrides[a.id] = 44; });
    T.processWeek(A, new window.XCD.core.SeededRNG(5));
    out.plainCutSpent = A.getRoster(A.playerSchoolId, 'M').every((a) => a.peakSeason === A.year);

    // B: the same cut flagged as a Down Week → the peak is saved.
    const B = clone(); setup(B);
    B.getRoster(B.playerSchoolId, 'M').forEach((a) => { B.training.mileageOverrides[a.id] = 30; }); // set before
    const res = T.setDownWeek(B, 'M', true);
    B.getRoster(B.playerSchoolId, 'M').forEach((a) => { B.training.mileageOverrides[a.id] = 44; }); // coach goes lower
    out.setOk = res.ok;
    T.processWeek(B, new window.XCD.core.SeededRNG(5));
    const rB = B.getRoster(B.playerSchoolId, 'M');
    out.downSaved = rB.every((a) => a.peakSeason !== B.year);
    out.downCharge = avg(B, (a) => a.taperCharge);
    out.restored = rB.every((a) => B.training.mileageOverrides[a.id] === 30);
    out.flagCleared = !T.downWeekStatus(B, 'M').active;

    // C: the default Down Week cut (~75%) vs D: the same miles, no flag.
    const C = clone(); setup(C);
    T.setDownWeek(C, 'M', true);
    out.cutMiles = Math.round(avg(C, (a) => C.training.mileageOverrides[a.id]));
    const D2 = clone(); setup(D2);
    D2.getRoster(D2.playerSchoolId, 'M').forEach((a) => { D2.training.mileageOverrides[a.id] = C.training.mileageOverrides[a.id]; });
    T.processWeek(C, new window.XCD.core.SeededRNG(6));
    T.processWeek(D2, new window.XCD.core.SeededRNG(6));
    out.fatigueDown = avg(C, (a) => a.fatigue);
    out.fatiguePlain = avg(D2, (a) => a.fatigue);
    out.staleDown = avg(C, (a) => a.staleness);
    out.stalePlain = avg(D2, (a) => a.staleness);
    out.bankDown = avg(C, (a) => a.absorbBank);
    out.bankPlain = avg(D2, (a) => a.absorbBank);
    out.chronicDown = avg(C, (a) => a.chronicMileage);
    out.chronicPlain = avg(D2, (a) => a.chronicMileage);

    // Cooldown: not again next week, available three weeks on.
    C.week = 10;
    out.nextWeek = T.downWeekStatus(C, 'M');
    out.refused = !T.setDownWeek(C, 'M', true).ok;
    C.week = 12;
    out.later = T.downWeekStatus(C, 'M').available;
    // Save round-trip keeps the clock and an active flag.
    T.setDownWeek(C, 'M', true);
    const back = GS.fromJSON(JSON.parse(JSON.stringify(C.toJSON())));
    out.saveActive = T.downWeekStatus(back, 'M').active;
    out.saveBank = back.getRoster(back.playerSchoolId, 'M')[0].absorbBank === C.getRoster(C.playerSchoolId, 'M')[0].absorbBank;
    return out;
  });
  console.log('down week:', JSON.stringify(dw));
  ok(dw.plainCutSpent, 'control: a big cut with a quality session (no Down Week) must still be the taper');
  ok(dw.setOk && dw.downSaved, 'a Down Week must never spend the peak, even with a taper-sized cut + quality: ' + JSON.stringify(dw));
  ok(dw.downCharge > 0.5, 'a Down Week with a session must keep the taper charge building: ' + dw.downCharge);
  ok(dw.restored && dw.flagCleared, 'each runner\'s own mileage must come back after the Down Week');
  ok(dw.cutMiles >= 56 && dw.cutMiles <= 64, 'the Down Week must cut to ~75% of recent load (80 → ~60): ' + dw.cutMiles);
  ok(dw.fatigueDown <= dw.fatiguePlain - 5, 'a Down Week must shed clearly more fatigue than the same miles alone: ' + JSON.stringify(dw));
  ok(dw.staleDown < dw.stalePlain, 'a Down Week must shed staleness');
  ok(dw.bankDown < dw.bankPlain, 'a Down Week must land banked training: ' + JSON.stringify(dw));
  ok(dw.chronicDown > dw.chronicPlain, 'a Down Week must dent the rolling load less (no spike the week after)');
  ok(!dw.nextWeek.available && dw.refused && dw.later, 'Down Weeks must have a cooldown: ' + JSON.stringify(dw));
  ok(dw.saveActive && dw.saveBank, 'Down Week state and the bank must survive a save round-trip');

  // ---- 2) The absorption bank ----
  const ab = await page.evaluate(() => {
    const g0 = window.XCD.ui.state.game;
    const GS = window.XCD.engine.GameState;
    const T = window.XCD.engine.Training;
    const clone = () => GS.fromJSON(JSON.parse(JSON.stringify(g0.toJSON())));
    const setup = (g, fatigue, plan) => {
      g.week = 8;
      g.training.overrides = {}; g.training.mileageOverrides = {};
      g.training.W = plan; g.training.mileage.W = 60;
      g.getRoster(g.playerSchoolId, 'W').forEach((a) => {
        a.injury = null; a.health = 'Healthy'; a.fatigue = fatigue; a.absorbBank = 0;
        a.chronicMileage = 60; a.highLoadWeeks = 0; a.devProgress = 0;
      });
    };
    const avg = (g, f) => { const r = g.getRoster(g.playerSchoolId, 'W'); return r.reduce((s, a) => s + f(a), 0) / r.length; };
    const build = ['easy', 'intervals', 'easy', 'tempo', 'easy', 'long', 'easy'];
    const tired = clone(); setup(tired, 85, build);
    T.processWeek(tired, new window.XCD.core.SeededRNG(8));
    const fresh = clone(); setup(fresh, 10, build);
    T.processWeek(fresh, new window.XCD.core.SeededRNG(8));
    const out = { tiredBank: avg(tired, (a) => a.absorbBank), freshBank: avg(fresh, (a) => a.absorbBank) };
    // A recovery week lands about half of what's banked.
    const rec = clone(); setup(rec, 70, ['easy', 'easy', 'rest', 'easy', 'easy', 'easy', 'easy']);
    rec.getRoster(rec.playerSchoolId, 'W').forEach((a) => { a.absorbBank = 4; });
    T.processWeek(rec, new window.XCD.core.SeededRNG(9));
    out.afterRecovery = avg(rec, (a) => a.absorbBank);
    out.absorbed = avg(rec, (a) => a.lastAbsorbed || 0);
    return out;
  });
  console.log('absorption:', JSON.stringify(ab));
  ok(ab.tiredBank > 0.2 && ab.freshBank < 0.01, 'tired runners must bank part of the week, fresh ones none: ' + JSON.stringify(ab));
  ok(ab.absorbed >= 1.8 && ab.afterRecovery <= 2.1, 'a recovery week must land about half the bank: ' + JSON.stringify(ab));

  // ---- 3) Season expectations ----
  const ex = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Coaching;
    const A = window.XCD.engine.Awards;
    const school = g.getPlayerSchool();
    const out = {};
    out.stamped = !!(school.expectation && school.expectation.year === g.year && school.expectation.M.pollRank);
    // Last season's finish moves the bar.
    const base = C.expectedFinish(g, school).pct;
    school.seasonFinish = { year: g.year - 1, M: 0.02, W: 0.04, MRank: 5, WRank: 10 };
    school.expectation = null;
    const afterTitleRun = C.expectedFinish(g, school).pct;
    school.seasonFinish = { year: g.year - 1, M: 0.95, W: 0.95, MRank: 300, WRank: 300 };
    school.expectation = null;
    const afterBadYear = C.expectedFinish(g, school).pct;
    out.base = base; out.afterTitleRun = afterTitleRun; out.afterBadYear = afterBadYear;
    // Roster talent and the preseason poll move it too.
    const e = C.seasonExpectation(g, school);
    const set = (p) => { ['M', 'W'].forEach((gd) => { e[gd].poll = p; e[gd].talent = p; }); return C.expectedFinish(g, school).pct; };
    out.stacked = set(0.02);
    out.thin = set(0.6);
    // The hot seat reads it: same finish, a high bar heats more than a low one.
    const coach = g.getPlayerCoach();
    const total = C.divisionSize(g, school.division);
    const place = (gd, rank) => {
      const list = g.rankings[gd].filter((r) => r.schoolId !== school.id);
      list.splice(0, 0, { schoolId: school.id, rank, division: school.division || 'DI' });
      g.rankings[gd] = list;
    };
    const seatAt = (p) => {
      ['M', 'W'].forEach((gd) => { e[gd].last = p; e[gd].poll = p; e[gd].talent = p; });
      school.expectation = e;
      coach.hotSeat = 30; coach.hotSeatYears = 0; coach.yearsAtSchool = 4; coach.seatTrack = null;
      coach._podiumPressure = 0; coach.podiumMissStreak = 0;
      place('M', Math.round(total * 0.45)); place('W', Math.round(total * 0.45));
      A.coachFirings(g, new window.XCD.core.SeededRNG(3));
      g.career.pendingFiring = null;
      return coach.hotSeat;
    };
    out.highBarSeat = seatAt(0.05);
    out.lowBarSeat = seatAt(0.6);
    out.finishStamped = !!(school.seasonFinish && school.seasonFinish.year === g.year);
    coach.hotSeat = 0;
    C.setSeasonExpectations(g);
    return out;
  });
  console.log('expectations:', JSON.stringify(ex));
  ok(ex.stamped, 'every program must carry a preseason expectation with its parts');
  ok(ex.afterTitleRun < ex.base && ex.afterBadYear > ex.afterTitleRun, 'last season\'s finish must move the bar: ' + JSON.stringify(ex));
  ok(ex.stacked < ex.thin, 'roster talent and the preseason poll must move the bar: ' + JSON.stringify(ex));
  ok(ex.highBarSeat > ex.lowBarSeat, 'the hot seat must judge against the season\'s expectation: ' + JSON.stringify(ex));
  ok(ex.finishStamped, 'the final poll must be stamped for next season\'s expectations');

  // ---- 4) UI ----
  await page.click('[data-nav="training"]');
  await page.waitForSelector('#preset-downweek');
  const ui1 = await page.evaluate(() => ({
    absorbing: /Absorbing/.test(document.body.textContent),
    disabled: document.querySelector('#preset-downweek').disabled
  }));
  if (!ui1.disabled) {
    await page.click('#preset-downweek');
    await page.waitForSelector('#preset-downweek');
  }
  const ui2 = await page.evaluate(() => ({
    hint: (document.querySelector('#mileage-hint') || {}).textContent || '',
    on: /✓/.test(document.querySelector('#preset-downweek').textContent)
  }));
  await page.click('[data-nav="dashboard"]');
  await page.waitForSelector('#expectations-detail');
  const ui3 = await page.evaluate(() => ({
    target: /Target: around #\d+/.test(document.body.textContent),
    detail: /preseason poll/.test(document.querySelector('#expectations-detail').textContent)
  }));
  console.log('ui:', JSON.stringify({ ui1, ui2, ui3 }));
  ok(ui1.absorbing, 'the Squad Form card must show the Absorbing row');
  ok(ui1.disabled || (ui2.on && /DOWN WEEK/.test(ui2.hint)), 'the Down Week button must toggle on and explain itself: ' + JSON.stringify(ui2));
  ok(ui3.target && ui3.detail, 'the dashboard must show the season target and what set it');

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-update26');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
