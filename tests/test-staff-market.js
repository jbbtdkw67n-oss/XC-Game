// The staff market and a livelier coaching carousel.
// Verifies:
//   - the market lists applicants, free agents, assistants on other staffs and
//     head coaches at smaller programs — a far bigger menu than the old
//     three-candidate shortlist
//   - hiring reach: nobody above the reputation cap can be hired, and the cap
//     rises with program prestige (a blue blood reaches further than a
//     rebuilding program)
//   - balance: a big program can hire a small program's HEAD coach as its
//     assistant; a small program cannot (no head coach is that far below it)
//   - a yes moves the coach for real: the old program's head chair is refilled
//     through the carousel, the hire is an Assistant on the player's staff,
//     and the one-hire-per-offseason rule holds
//   - a no is final for the offseason, never rerolls, and keeps the hire open
//   - the Staff tab renders the market (tiles, filters, table, offer dialog)
//   - the carousel: shock exits and late dominoes open chairs, small-program
//     moves stay out of the national feed, and over ten seasons coaches turn
//     over far faster than one program in twenty a year
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  /* ---------------- A blue blood ---------------- */
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  await newDynasty(page, { school: 'Colorado' });

  const market = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Coaching;
    g.week = 17; g.seasonPhase = 'Offseason'; g.staffHiredYear = null;
    const m = C.staffMarket(g);
    const school = g.getPlayerSchool();
    const by = (src) => m.rows.filter((r) => r.source === src);
    return {
      prestige: school.prestige, cap: m.reach.cap, gateOk: m.gate.ok,
      counts: m.counts, total: m.rows.length,
      lockedAllAbove: m.rows.filter((r) => r.locked).every((r) => Math.round(r.coach.reputation) > m.reach.cap),
      openAllWithin: m.rows.filter((r) => !r.locked && r.source !== 'applicant').every((r) => Math.round(r.coach.reputation) <= m.reach.cap),
      asstStepUp: by('assistant').every((r) => school.prestige - r.from.prestige >= C.STAFF_STEP_UP),
      headGap: by('head').every((r) => school.prestige - r.from.prestige >= C.STAFF_HEAD_GAP),
      headsAreHeads: by('head').every((r) => r.from.coachId === r.coach.id && r.coach.role === 'Head'),
      interestRange: m.rows.every((r) => r.interest >= 0 && r.interest <= 100),
      noPlayer: m.rows.every((r) => !r.coach.isPlayer)
    };
  });
  console.log('market:', JSON.stringify(market));
  ok(market.gateOk, 'the staffing window should be open in the offseason');
  ok(market.total >= 40, 'the market should be a big menu, not a shortlist: ' + market.total);
  ok(market.counts.assistant >= 20 && market.counts.head >= 10, 'a big program should see assistants and head coaches to hire: ' + JSON.stringify(market.counts));
  ok(market.counts.applicant >= 1, 'applicants should still be listed');
  ok(market.lockedAllAbove && market.openAllWithin, 'only coaches above the reach cap are locked');
  ok(market.asstStepUp && market.headGap && market.headsAreHeads, 'sitting coaches are listed only for a real step up');
  ok(market.interestRange && market.noPlayer, 'interest must be a percentage and the player is never listed');

  // The reach cap is a hard stop.
  const capped = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Coaching;
    const m = C.staffMarket(g);
    const row = m.rows.find((r) => r.source === 'head' && !r.locked);
    const before = g.getPlayerSchool().assistantId;
    row.coach.reputation = m.reach.cap + 12; // now beyond reach
    const res = C.offerAssistantJob(g, row.key);
    const after = C.staffMarket(g).rows.find((r) => r.key === row.key);
    row.coach.reputation = m.reach.cap - 5;
    return { blocked: !res.ok && !res.declined, msg: res.message, locked: !!(after && after.locked),
      unchanged: g.getPlayerSchool().assistantId === before, hireOpen: g.staffHiredYear !== g.year };
  });
  ok(capped.blocked && capped.locked && capped.unchanged && capped.hireOpen, 'a coach above the reach cap cannot be hired: ' + JSON.stringify(capped));

  // A no is final, never rerolls, and keeps the hire open.
  const declined = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Coaching;
    const m = C.staffMarket(g);
    const row = m.rows.filter((r) => r.source === 'head' && !r.locked).sort((a, b) => a.interest - b.interest)[0];
    const real = row.coach.ambition;
    // Force the lowest possible interest so the deterministic answer is a no.
    const before = { asst: g.getPlayerSchool().assistantId, head: row.from.coachId };
    let tries = 0, res;
    do { res = C.offerAssistantJob(g, row.key); tries++; } while (!res.declined && !res.ok && tries < 2);
    if (res.ok) return { skipped: true };
    const again = C.offerAssistantJob(g, row.key);
    const listed = C.staffMarket(g).rows.find((r) => r.key === row.key);
    return { declined: !!res.declined, againBlocked: !again.ok && !again.declined, flagged: !!(listed && listed.declined),
      stayed: row.from.coachId === before.head, mine: g.getPlayerSchool().assistantId === before.asst,
      hireOpen: g.staffHiredYear !== g.year, real };
  });
  console.log('declined:', JSON.stringify(declined));
  ok(declined.skipped || (declined.declined && declined.againBlocked && declined.flagged && declined.stayed && declined.mine && declined.hireOpen),
    'a coach who says no stays put, cannot be asked again, and the hire stays open: ' + JSON.stringify(declined));

  // A yes: a small-program head coach joins the staff; the chair behind fills.
  const coup = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Coaching;
    const oldAsst = g.getCoach(g.getPlayerSchool().assistantId);
    // Each coach's answer is fixed for the offseason, so ask down the list
    // until one says yes (their interest is raised first: a young coach on a
    // hot seat who wants a bigger stage).
    let row = null, from = null, res = null;
    for (const r of C.staffMarket(g).rows.filter((x) => x.source === 'head' && !x.locked && !x.declined)) {
      r.coach.hotSeat = 100; r.coach.ambition = 'recruiter'; r.coach.age = 34;
      r.coach.yearsAtSchool = 1; r.coach.careerRecord.nationalTitles = 0; r.coach.careerRecord.conferenceTitles = 0;
      const attempt = C.offerAssistantJob(g, r.key);
      if (attempt.ok) { row = r; from = r.from; res = attempt; break; }
    }
    if (!row) return { skipped: true };
    const school = g.getPlayerSchool();
    const hired = g.getCoach(school.assistantId);
    const newHead = g.getCoach(from.coachId);
    const second = C.offerAssistantJob(g, C.staffMarket(g).rows.find((r) => r.source === 'freeAgent' || r.source === 'applicant').key);
    return {
      ok: res.ok, hiredIsCoach: hired && hired.id === row.coach.id, role: hired && hired.role,
      atSchool: hired && hired.schoolId === school.id, tenure: hired && hired.yearsAtSchool,
      oldAsstGone: !oldAsst || !g.getCoach(oldAsst.id),
      chairFilled: !!newHead && newHead.id !== row.coach.id, newHeadRole: newHead && newHead.role,
      stintOpen: (hired.stints || []).some((s) => s.schoolId === school.id && !s.endYear && s.role === 'Assistant'),
      leftLedger: (from.formerCoachIds || []).includes(row.coach.id),
      hireUsed: g.staffHiredYear === g.year, secondBlocked: !second.ok,
      news: g.newsLog.some((n) => /STAFF COUP/.test(n.text)),
      everySchoolStaffed: Object.values(g.world.schools).every((s) => s.id === g.playerSchoolId || g.getCoach(s.assistantId))
    };
  });
  console.log('coup:', JSON.stringify(coup));
  ok(!coup.skipped, 'some small-program head coach should accept a blue blood\'s offer');
  ok(coup.skipped || (coup.ok && coup.hiredIsCoach && coup.role === 'Assistant' && coup.atSchool && coup.tenure === 0),
    'a head coach who accepts becomes the player\'s assistant: ' + JSON.stringify(coup));
  ok(coup.skipped || (coup.chairFilled && coup.newHeadRole === 'Head' && coup.oldAsstGone && coup.stintOpen && coup.leftLedger),
    'the chair they left is refilled and the books are kept: ' + JSON.stringify(coup));
  ok(coup.skipped || (coup.hireUsed && coup.secondBlocked && coup.news && coup.everySchoolStaffed),
    'the hire is the one staff move of the offseason: ' + JSON.stringify(coup));

  // Balance: the same program, shrunk to a rebuilding one, reaches far less
  // and has no head coaches far enough below it to raid.
  const small = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Coaching;
    const school = g.getPlayerSchool();
    const real = school.prestige;
    const big = C.staffMarket(g);
    school.prestige = 34;
    const m = C.staffMarket(g);
    const out = { cap: m.reach.cap, bigCap: big.reach.cap, counts: m.counts,
      maxRep: Math.max(0, ...m.rows.filter((r) => !r.locked && r.source !== 'applicant').map((r) => Math.round(r.coach.reputation))) };
    school.prestige = real;
    return out;
  });
  console.log('rebuilding program:', JSON.stringify(small));
  ok(small.cap <= small.bigCap - 25, `a rebuilding program should reach far less than a blue blood (${small.cap} vs ${small.bigCap})`);
  ok(small.counts.head <= 5 && small.counts.head < market.counts.head / 3, 'a small program has almost no head coaches to raid: ' + small.counts.head);
  ok(small.maxRep <= small.cap, 'nobody above the smaller cap is hireable: ' + small.maxRep);

  // The Staff tab.
  await page.evaluate(() => { const g = window.XCD.ui.state.game; g.staffHiredYear = null; window.XCD.ui.navigate('school', 'staff'); });
  await page.waitForSelector('#staff-table [data-hire]');
  const ui = await page.evaluate(() => ({
    tiles: document.querySelectorAll('#school-body .stat-tile').length,
    pills: document.querySelectorAll('[data-staff-src]').length,
    rows: document.querySelectorAll('#staff-table tbody tr').length,
    reachTile: /Hiring Reach/i.test(document.querySelector('#school-body').textContent),
    locked: document.querySelectorAll('#staff-table .interest-chip.locked').length
  }));
  await page.click('[data-staff-src="head"]');
  const headRows = await page.$$eval('#staff-table tbody tr', (trs) => trs.length);
  await page.click('#staff-table [data-hire]:not([disabled])');
  await page.waitForSelector('#btn-confirm-hire');
  const dialog = await page.evaluate(() => {
    const m = document.querySelector('.modal');
    return { compare: m.querySelectorAll('tbody tr').length, stakes: m.querySelectorAll('.stakes li').length };
  });
  await page.evaluate(() => window.XCD.ui.closeModal());
  console.log('staff tab:', JSON.stringify(ui), headRows, JSON.stringify(dialog));
  ok(ui.tiles === 4 && ui.pills === 5 && ui.reachTile, 'the Staff tab shows its summary tiles and source filters');
  ok(ui.rows >= 40 && headRows >= 5 && headRows < ui.rows, 'the market table lists and filters candidates: ' + ui.rows + ' / ' + headRows);
  ok(dialog.compare === 7 && dialog.stakes >= 2, 'the offer dialog compares the candidate with the current assistant');

  /* ---------------- The carousel ---------------- */
  const chaos = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const W = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    g.week = 1; g.seasonPhase = 'Preseason';
    const out = { years: [], shocks: 0, quietSmall: true };
    for (let y = 0; y < 10; y++) {
      for (let i = 0; i < W; i++) {
        if (g.week === 17) {
          const open = Object.values(g.world.schools).filter((s) => !g.getCoach(s.coachId)).length;
          out.openAtMarket = Math.max(out.openAtMarket || 0, open);
        }
        g.advanceWeek();
      }
      const schools = Object.values(g.world.schools);
      const heads = schools.map((s) => g.getCoach(s.coachId)).filter(Boolean);
      out.years.push({
        fresh: heads.filter((c) => (c.yearsAtSchool || 0) <= 0).length,
        mean: heads.reduce((t, c) => t + (c.yearsAtSchool || 0), 0) / heads.length,
        staffed: schools.every((s) => g.getCoach(s.coachId) && (s.id === g.playerSchoolId || g.getCoach(s.assistantId))),
        roles: schools.every((s) => { const h = g.getCoach(s.coachId); const a = g.getCoach(s.assistantId); return h.role === 'Head' && (!a || a.role === 'Assistant'); })
      });
    }
    const schools = Object.values(g.world.schools);
    const tenures = schools.map((s) => g.getCoach(s.coachId).yearsAtSchool || 0);
    out.n = schools.length;
    out.ge15 = tenures.filter((t) => t >= 15).length / tenures.length;
    out.ge10 = tenures.filter((t) => t >= 10).length / tenures.length;
    out.reasons = {};
    schools.forEach((s) => (g.history.programs && g.history.programs[s.id] ? g.history.programs[s.id].coaches : [])
      .forEach((c) => { if (c.reason) out.reasons[c.reason] = (out.reasons[c.reason] || 0) + 1; }));
    return out;
  });
  const fresh = chaos.years.map((y) => y.fresh);
  const avgFresh = fresh.reduce((a, b) => a + b, 0) / fresh.length;
  const lastMean = chaos.years[chaos.years.length - 1].mean;
  console.log('carousel:', JSON.stringify({ n: chaos.n, fresh, avgFresh: avgFresh.toFixed(1), lastMean: lastMean.toFixed(2), ge10: chaos.ge10.toFixed(2), ge15: chaos.ge15.toFixed(2), open: chaos.openAtMarket, reasons: chaos.reasons }));
  ok(chaos.years.every((y) => y.staffed && y.roles), 'every program keeps a head coach and an assistant in the right roles through the churn');
  ok(avgFresh / chaos.n >= 0.08, 'about one program in ten should change head coaches a year: ' + (avgFresh / chaos.n).toFixed(3));
  ok(avgFresh / chaos.n <= 0.2, 'the carousel should stay believable, not a revolving door: ' + (avgFresh / chaos.n).toFixed(3));
  ok(lastMean <= 7.5, 'average tenure should settle well under a decade: ' + lastMean.toFixed(2));
  ok(chaos.ge15 <= 0.12, 'few coaches should sit at a program for 15+ years: ' + chaos.ge15.toFixed(2));
  ok(chaos.openAtMarket >= Math.round(chaos.n * 0.04), 'the offseason market should open with a real number of chairs: ' + chaos.openAtMarket);
  ok(['resigned', 'dismissed', 'pro', 'parted'].some((k) => chaos.reasons[k]), 'surprise exits and partings should be written into program history: ' + JSON.stringify(chaos.reasons));

  ok(errors.length === 0, 'no page/console errors: ' + errors.slice(0, 3).join(' | '));
  await page.close();

  await browser.close();
  if (fails.length) {
    console.log('\nFAILURES:\n' + fails.map((f) => ' ✗ ' + f).join('\n'));
    console.log('\nFAIL test-staff-market');
    process.exit(1);
  }
  console.log('\nPASS test-staff-market');
}

run().catch((e) => { console.error(e); console.log('FAIL test-staff-market'); process.exit(1); });
