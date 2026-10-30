// Update 25 (Stage 1 — coaching): hot seats at struggling programs, promotion
// from within for an assistant who out-rates the head coach, and bigger
// recruiting-class dynasty points for a recruiting coordinator.
// Verifies:
//   - A coach buried in the bottom 35% of a low-prestige program is fired
//     within a handful of seasons (low prestige no longer protects the seat)
//   - New hires get a honeymoon (less heat in their first two seasons)
//   - Climbing the standings cools the seat
//   - The player's seat heats at a bottom program too
//   - An assistant who out-rates the head coach gets a "promotion from within"
//     offer (at awards week, and later in the offseason after spending points);
//     taking it makes them head coach at the same school and the old head
//     coach leaves; no offer when the assistant does not out-rate the boss
//   - A recruiting coordinator earns tiered dynasty points for a top class
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const errors = [];
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // ================= Hot seat (head-coach dynasty) =================
  const page = await browser.newPage();
  wireErrors(page, errors);
  page.setDefaultTimeout(120000);
  await newDynasty(page, {});

  const seat = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const A = window.XCD.engine.Awards;
    const rng = new window.XCD.core.SeededRNG(7);
    const cpu = Object.values(g.world.schools).filter((s) =>
      s.id !== g.playerSchoolId && s.coachId && g.world.coaches[s.coachId] && !g.world.coaches[s.coachId].isPlayer);
    const drop = (list, id) => list.filter((r) => r.schoolId !== id);
    const bury = (id) => { g.rankings.M = drop(g.rankings.M, id); g.rankings.W = drop(g.rankings.W, id); };
    const out = {};

    // 1) A long-tenured coach dead last at a 10-prestige program is fired.
    const s1 = cpu[0];
    const c1 = g.world.coaches[s1.coachId];
    s1.prestige = 10; c1.yearsAtSchool = 8; c1.hotSeat = 0; c1.hotSeatYears = 0; c1.seatTrack = null;
    bury(s1.id);
    let seasons = 0;
    while (s1.coachId === c1.id && seasons < 10) {
      A.coachFirings(g, rng);
      c1.yearsAtSchool += 1;
      seasons++;
    }
    out.firedAfter = s1.coachId === c1.id ? null : seasons;

    // 2) Honeymoon: a brand-new hire heats less than a veteran in the same spot.
    const s2 = cpu[1], s3 = cpu[2];
    const c2 = g.world.coaches[s2.coachId], c3 = g.world.coaches[s3.coachId];
    [[s2, c2, 0], [s3, c3, 3]].forEach(([s, c, yrs]) => {
      s.prestige = 30; s.conferenceTier = 2; c.yearsAtSchool = yrs; c.hotSeat = 0; c.hotSeatYears = 0; c.seatTrack = null; bury(s.id);
    });
    A.coachFirings(g, new window.XCD.core.SeededRNG(11));
    out.newHireHeat = c2.hotSeat;
    out.veteranHeat = c3.hotSeat;

    // 3) Improvement cools: last year dead last, this year mid-table.
    const s4 = cpu[3];
    const c4 = g.world.coaches[s4.coachId];
    s4.prestige = 20; c4.yearsAtSchool = 6; c4.hotSeat = 50; c4.hotSeatYears = 0;
    c4.seatTrack = { schoolId: s4.id, pct: 1 };
    const total = window.XCD.engine.Coaching.divisionSize(g, s4.division);
    const midRank = Math.round(total * 0.5);
    ['M', 'W'].forEach((gd) => {
      const list = drop(g.rankings[gd], s4.id);
      const at = list.findIndex((r) => (r.division || 'DI') === (s4.division || 'DI') && r.rank === midRank);
      list.splice(Math.max(0, at), 0, { schoolId: s4.id, rank: midRank, division: s4.division || 'DI' });
      g.rankings[gd] = list;
    });
    A.coachFirings(g, new window.XCD.core.SeededRNG(13));
    out.improvedSeat = c4.hotSeat;

    // 4) The player's seat heats at a bottom program too.
    const ps = g.getPlayerSchool();
    const pc = g.getPlayerCoach();
    ps.prestige = 12; pc.yearsAtSchool = 3; pc.hotSeat = 0; pc.hotSeatYears = 0; pc.seatTrack = null;
    bury(ps.id);
    A.coachFirings(g, new window.XCD.core.SeededRNG(17));
    out.playerHeat = pc.hotSeat;

    // 5) Breakthrough protection: the player turns a low-prestige program
    //    into a nationally ranked one (men #12, women still poor) — even
    //    with leftover heat and a missed preseason podium pick, the seat
    //    goes cool and the podium streak can't get them fired.
    const place = (id, gd, rank) => {
      const list = drop(g.rankings[gd], id);
      const div = ps.division || 'DI';
      const at = list.findIndex((r) => (r.division || 'DI') === div && r.rank === rank);
      list.splice(Math.max(0, at), 0, { schoolId: id, rank, division: div });
      g.rankings[gd] = list;
    };
    const ptotal = window.XCD.engine.Coaching.divisionSize(g, ps.division);
    ps.prestige = 35; pc.yearsAtSchool = 4; pc.hotSeat = 70; pc.hotSeatYears = 1;
    pc.seatTrack = { schoolId: ps.id, pct: 0.55 };
    pc.podiumMissStreak = 2; pc._podiumPressure = 40;
    place(ps.id, 'M', 12);
    place(ps.id, 'W', Math.round(ptotal * 0.6));
    g.career.pendingFiring = null;
    A.coachFirings(g, new window.XCD.core.SeededRNG(19));
    out.breakthrough = { seat: pc.hotSeat, years: pc.hotSeatYears, streak: pc.podiumMissStreak,
      fired: !!(g.career.pendingFiring && g.career.pendingFiring.fromId === ps.id) };

    // 6) An overachieving season never adds heat, even outside the Top 25.
    pc.hotSeat = 40; pc.hotSeatYears = 0; pc.seatTrack = { schoolId: ps.id, pct: 0.5 };
    pc.podiumMissStreak = 0; pc._podiumPressure = 0;
    place(ps.id, 'M', Math.round(ptotal * 0.4));
    place(ps.id, 'W', Math.round(ptotal * 0.5));
    A.coachFirings(g, new window.XCD.core.SeededRNG(23));
    out.overachieverSeat = pc.hotSeat;
    return out;
  });
  ok(seat.breakthrough.seat <= 20 && seat.breakthrough.years === 0 && !seat.breakthrough.fired && seat.breakthrough.streak === 0,
    'a breakthrough into the Top 25 must cool the seat and clear the podium streak: ' + JSON.stringify(seat.breakthrough));
  ok(seat.overachieverSeat <= 40, 'a season that beats expectations must never heat the seat: ' + JSON.stringify(seat));
  ok(seat.firedAfter !== null && seat.firedAfter <= 6, 'a coach stuck at the bottom of a low-prestige program must be fired within 6 seasons: ' + JSON.stringify(seat));
  ok(seat.newHireHeat < seat.veteranHeat, 'a new hire must get a honeymoon (less heat): ' + JSON.stringify(seat));
  ok(seat.improvedSeat < 50, 'a program that climbed the standings must cool the seat: ' + JSON.stringify(seat));
  ok(seat.playerHeat > 0, 'the player at a bottom program must feel hot-seat pressure: ' + JSON.stringify(seat));
  console.log('hot seat:', JSON.stringify(seat));
  await page.close();

  // ================= Assistant: promotion from within + recruiting points =================
  const ap = await browser.newPage();
  wireErrors(ap, errors);
  ap.setDefaultTimeout(120000);
  await newDynasty(ap, { role: 'Assistant' });

  const promo = await ap.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Careers;
    const rng = new window.XCD.core.SeededRNG(21);
    const out = {};
    const school = g.getPlayerSchool();
    const me = g.getPlayerCoach();
    const head = g.getCoach(school.coachId);
    out.isAssistant = g.isAssistant();
    g.week = window.XCD.data.CALENDAR.AWARDS_WEEK;

    // Not better than the boss → no internal offer.
    ['recruiting', 'training', 'peaking', 'culture'].forEach((k) => { me[k] = 30; head[k] = 70; });
    g.jobSearchClosedYear = null;
    g.jobOffers = null;
    C.generateAssistantOffers(g, rng);
    out.offerWhenWorse = !!(g.jobOffers && g.jobOffers.offers.some((o) => o.internal));

    // Later in the offseason, spending points pushes the assistant past the
    // boss → the offer appears on the board.
    ['recruiting', 'training', 'peaking', 'culture'].forEach((k) => { me[k] = 80; });
    g.week = window.XCD.data.CALENDAR.AWARDS_WEEK + 1;
    C.evolveJobMarket(g, rng);
    const offer = g.jobOffers && g.jobOffers.offers.find((o) => o.internal);
    out.lateOffer = !!offer && offer.schoolId === school.id && g.jobOffers.promotion === true;
    out.inbox = (g.inbox || []).some((m) => m.eventType === 'jobs:promotionOffer');

    // Take it.
    const headId = head.id;
    const res = C.applyForJob(g, school.id);
    out.accepted = res.ok;
    out.role = g.playerRole;
    out.headNow = school.coachId === me.id;
    out.sameSchool = g.playerSchoolId === school.id;
    out.oldHeadGone = !g.world.coaches[headId] || g.world.coaches[headId].schoolId !== school.id;
    out.asstSeatOpen = !school.assistantId;
    out.searchClosed = g.jobSearchClosedYear === g.year;
    return out;
  });
  ok(promo.isAssistant, 'dynasty must start as an assistant');
  ok(!promo.offerWhenWorse, 'no promotion offer when the assistant does not out-rate the head coach');
  ok(promo.lateOffer, 'out-rating the head coach later in the offseason must add a promotion-from-within offer: ' + JSON.stringify(promo));
  ok(promo.accepted && promo.role === 'Head' && promo.headNow && promo.sameSchool, 'taking the offer must make the player head coach at the same school: ' + JSON.stringify(promo));
  ok(promo.oldHeadGone, 'the out-rated head coach must leave the chair');
  ok(promo.inbox, 'the promotion offer must reach the inbox');
  ok(promo.asstSeatOpen && promo.searchClosed, 'the assistant seat opens and the job search closes: ' + JSON.stringify(promo));
  console.log('promotion from within:', JSON.stringify(promo));
  await ap.close();

  // Recruiting coordinator points (fresh assistant dynasty).
  const rp = await browser.newPage();
  wireErrors(rp, errors);
  rp.setDefaultTimeout(120000);
  await newDynasty(rp, { role: 'Assistant' });
  const recPts = await rp.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const D = window.XCD.data;
    const me = g.getPlayerCoach();
    const sid = g.playerSchoolId;
    // Hand the coordinator a stacked class: the best recruits commit early.
    const recs = Object.values(g.world.recruits).filter((r) => !r.signed)
      .sort((a, b) => b.starRating - a.starRating || b.currentOverall - a.currentOverall);
    recs.slice(0, 10).forEach((r) => { r.committedTo = sid; r.interests[sid] = Object.assign(r.interests[sid] || {}, { offered: true }); });
    g.week = D.RECRUITING.SIGNING_WEEK;
    me.upgradePoints = 0; me.pointCarry = 0;
    window.XCD.engine.Recruiting.processWeek(g, new window.XCD.core.SeededRNG(31));
    const row = (g.history.recruitingClasses[g.year] || []).find((e) => e.schoolId === sid);
    return { divRank: row && row.divisionRank, division: row && row.division, pts: me.upgradePoints, carry: me.pointCarry };
  });
  if (recPts.divRank && recPts.divRank <= 25) {
    const r = recPts.divRank - 1;
    const base = r < 3 ? 4 : r < 5 ? 3 : r < 10 ? 2 : 1;
    const divW = { DI: 1, DII: 0.85, DIII: 0.7 }[recPts.division] || 1;
    const expected = Math.floor(base * divW * 1.5 + 1e-9);
    ok(recPts.pts === expected, `recruiting coordinator must earn ${expected} points for a #${recPts.divRank} class: ` + JSON.stringify(recPts));
  } else {
    ok(false, 'the stacked class should rank inside the top 25: ' + JSON.stringify(recPts));
  }
  console.log('recruiting coordinator points:', JSON.stringify(recPts));
  await rp.close();

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
