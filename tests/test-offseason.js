// Offseason Player Progression + Coaching Logic fixes (master spec Part 2,
// Sections 11 & "Coaching Logic & Career System Fixes").
// Verifies:
//   - every returning athlete receives visible offseason progression, and a
//     full before → after report (overall + attributes) is published for the
//     player's program ahead of Week 1
//   - Work Ethic is the dominant driver of summer improvement
//   - seniors generally improve less than underclassmen
//   - the dashboard surfaces the report and the modal lists both squads
//   - Hot Seat resets to Stable when a coach changes schools (the bug fix)
//   - program expectations honor success in EITHER gender's program
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

  // ---- 1) One full season, snapshotting the world before the rollover ----
  const season = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const weeks = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    while (g.week < weeks) g.advanceWeek();       // park on the final week
    const snap = {};
    Object.values(g.world.athletes).forEach((a) => {
      if (a.schoolId) snap[a.id] = { ovr: a.currentOverall, we: a.workEthic, age: a.age };
    });
    g.advanceWeek();                              // rollover: summer happens here
    const rep = g.offseasonReport;

    // World-wide progression by work ethic and (new) class year.
    const buckets = { hiWE: [], loWE: [], soph: [], senior: [] };
    Object.values(g.world.athletes).forEach((a) => {
      const s = snap[a.id];
      if (!s || !a.schoolId) return;
      const d = a.currentOverall - s.ovr;
      if (s.age <= 20) {
        if (s.we >= 75) buckets.hiWE.push(d);
        if (s.we <= 45) buckets.loWE.push(d);
      }
      if (a.classYear === 'Sophomore') buckets.soph.push(d);
      if (a.classYear === 'Senior') buckets.senior.push(d);
    });
    const avg = (xs) => xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0;

    const school = g.getPlayerSchool();
    const roster = g.getRoster(school.id, 'M').concat(g.getRoster(school.id, 'W'));
    const returners = roster.filter((a) => (a.yearsOnCampus || 1) >= 2);
    const reported = new Set((rep ? rep.entries : []).map((e) => e.id));
    const missing = returners.filter((a) => !reported.has(a.id)).map((a) => a.fullName);
    const sample = rep && rep.entries.find((e) => e.attrs.length);
    return {
      week: g.week, year: g.year,
      hasReport: !!rep, repYear: rep && rep.year, entryCount: rep ? rep.entries.length : 0,
      genders: rep ? [...new Set(rep.entries.map((e) => e.gender))].sort() : [],
      missing, sample,
      avgHiWE: avg(buckets.hiWE), avgLoWE: avg(buckets.loWE),
      nHi: buckets.hiWE.length, nLo: buckets.loWE.length,
      avgSoph: avg(buckets.soph), avgSenior: avg(buckets.senior),
      nSoph: buckets.soph.length, nSen: buckets.senior.length
    };
  });
  ok(season.week === 1, 'rollover should land on Week 1: ' + season.week);
  ok(season.hasReport && season.repYear === season.year, 'offseason report must exist and be stamped with the new season');
  ok(season.entryCount >= 10, 'the report must cover the whole program: ' + season.entryCount);
  ok(season.genders.join(',') === 'M,W', 'both squads must be in the report: ' + season.genders);
  ok(season.missing.length === 0, 'every returning athlete must be reported; missing: ' + season.missing.join(', '));
  ok(season.sample && season.sample.attrs.every((r) => r.from !== r.to && r.key),
    'attribute rows must show real before → after changes: ' + JSON.stringify(season.sample && season.sample.attrs));
  ok(season.avgHiWE > season.avgLoWE,
    `work ethic must drive summer gains (hi ${season.avgHiWE.toFixed(2)} [n=${season.nHi}] vs lo ${season.avgLoWE.toFixed(2)} [n=${season.nLo}])`);
  ok(season.avgSoph > season.avgSenior,
    `underclassmen must outgrow seniors (soph ${season.avgSoph.toFixed(2)} [n=${season.nSoph}] vs sr ${season.avgSenior.toFixed(2)} [n=${season.nSen}])`);
  console.log('offseason progression:', JSON.stringify({
    entries: season.entryCount, hiWE: +season.avgHiWE.toFixed(2), loWE: +season.avgLoWE.toFixed(2),
    soph: +season.avgSoph.toFixed(2), senior: +season.avgSenior.toFixed(2)
  }));

  // ---- 2) Dashboard surfaces the report; the modal shows both squads ----
  await page.click('[data-nav="dashboard"]');
  await page.waitForSelector('#btn-offseason-report');
  await page.click('#btn-offseason-report');
  const modal = await page.evaluate(() => {
    const m = document.querySelector('.modal-backdrop');
    const text = m ? m.textContent : '';
    const res = {
      title: text.includes('Offseason Progression Report'),
      arrows: text.includes('→'),
      men: text.includes("Men's Squad"),
      women: text.includes("Women's Squad")
    };
    m && m.remove();
    return res;
  });
  ok(modal.title && modal.arrows && modal.men && modal.women,
    'report modal must render both squads with before → after: ' + JSON.stringify(modal));
  console.log('report modal:', JSON.stringify(modal));

  // ---- 3) Hot Seat resets on any school change (isolated save copy) ----
  const hotSeat = await page.evaluate(() => {
    const g0 = window.XCD.ui.state.game;
    const g = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g0.toJSON())));
    window.XCD.ui.state.game = g; // acceptOffer navigates via UI state
    const coach = g.getPlayerCoach();
    coach.hotSeat = 77;
    const target = Object.values(g.world.schools).find((s) => s.id !== g.playerSchoolId && s.division === 'DI');
    g.jobOffers = { year: g.year, expiresWeek: 99, offers: [{ schoolId: target.id, schoolName: target.name }] };
    const res = window.XCD.engine.Careers.acceptOffer(g, target.id);
    const out = { ok: res.ok, hotSeat: coach.hotSeat, atNew: coach.schoolId === target.id, years: coach.yearsAtSchool };
    window.XCD.ui.state.game = g0; // restore the real session
    return out;
  });
  ok(hotSeat.ok && hotSeat.atNew, 'the job move itself must succeed: ' + JSON.stringify(hotSeat));
  ok(hotSeat.hotSeat === 0, 'Hot Seat must reset to Stable at a new school, got ' + hotSeat.hotSeat);
  ok(hotSeat.years === 0, 'expectations must restart with the new school');
  console.log('hot seat reset:', JSON.stringify(hotSeat));

  // ---- 4) Expectations honor success in EITHER program ----
  const either = await page.evaluate(() => {
    const g0 = window.XCD.ui.state.game;
    const g = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g0.toJSON())));
    const rng = new window.XCD.core.SeededRNG(4242);
    const school = Object.values(g.world.schools).find((s) =>
      s.id !== g.playerSchoolId && s.division === 'DI' && s.coachId && g.world.coaches[s.coachId]);
    const coach = g.world.coaches[school.coachId];
    school.prestige = 85;            // high expectations
    coach.yearsAtSchool = 2;         // safe from the firing branch
    const dropUs = (list) => list.filter((r) => r.schoolId !== school.id);
    // Case A: #1 men's team, unranked (dead-last) women's team.
    coach.hotSeat = 50;
    g.rankings.M = [{ schoolId: school.id, rank: 1 }].concat(dropUs(g.rankings.M));
    g.rankings.W = dropUs(g.rankings.W);
    window.XCD.engine.Awards.coachFirings(g, rng);
    const cooled = coach.hotSeat;
    // Case B: both programs unranked (dead last).
    coach.hotSeat = 50;
    g.rankings.M = dropUs(g.rankings.M);
    window.XCD.engine.Awards.coachFirings(g, rng);
    const heated = coach.hotSeat;
    return { cooled, heated };
  });
  ok(either.cooled < 50, 'a #1 team in EITHER gender must cool the seat, got ' + either.cooled);
  ok(either.heated > 50, 'both programs underperforming must heat the seat, got ' + either.heated);
  console.log('either-program expectations:', JSON.stringify(either));

  // ---- 5) The report survives a save/load round-trip ----
  const persisted = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const g2 = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    return !!(g2.offseasonReport && g2.offseasonReport.year === g.offseasonReport.year &&
      g2.offseasonReport.entries.length === g.offseasonReport.entries.length);
  });
  ok(persisted, 'the offseason report must survive save/load');

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-offseason');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
