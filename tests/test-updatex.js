// Update X test suite. Verifies the recruiting & portal realism overhaul:
//  - class volume: 6,000 recruits nationally (3,000 per gender — Update 11.1
//    right-sized the class to the 727-program world: every school still
//    signs, with a realistic unsigned tail and no talent dilution)
//  - Division III uses "Offer Roster Spot" wording (engine + UI), DA keeps
//    "Offer Scholarship"; DC offer caps don't collapse to the DA formula
//  - commitment logic: every recruit with >= 1 offer signs somewhere
//  - CPU recruiting participation: nearly every program (esp. DC) signs
//  - Auto Recruiting spends the player's real points/budget and scouts
//  - transfer portal: an intimate 2-4 suitor market per athlete (Update 11
//    reverted the big bidding wars), offers ledger (inBySchool) feeds
//    staff reputation
//  - CPU fitness: ranked teams' varsity arrives at nationals rested
//  - generational talent odds unchanged (still ~1 per 7-10 classes)
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  await newDynasty(page, { archetype: 'Recruiter' });
  page.setDefaultTimeout(300000);
  const fail = (m) => errors.push(m);

  // ---- 1) Class volume + generational odds guard ----
  const classInfo = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const D = window.XCD.data;
    return {
      perGender: D.RECRUITING.CLASS_SIZE_PER_GENDER,
      total: Object.keys(g.world.recruits).length,
      pOne: D.GENERATIONAL.P_ONE,
      pTwo: D.GENERATIONAL.P_TWO
    };
  });
  if (classInfo.perGender !== 3000) fail('class size per gender should be 3000, got ' + classInfo.perGender);
  if (classInfo.total !== 6000) fail('national class should hold 6000 recruits, got ' + classInfo.total);
  // ~1 per 7-8 classes per gender: odds must not scale with the bigger class.
  if (Math.abs(classInfo.pOne - 0.062) > 1e-9 || Math.abs(classInfo.pTwo - 0.004) > 1e-9) {
    fail('generational odds changed: ' + JSON.stringify(classInfo));
  }
  console.log('class volume:', JSON.stringify(classInfo));

  // ---- 2) Offer wording: scholarship for DA/DB, roster spot for DC ----
  const wording = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const D = window.XCD.data;
    const di = D.offerTerms('DA');
    const d3 = D.offerTerms('DC');
    // Engine message parity: doAction's offer message uses the same terms.
    const rec = Object.values(g.world.recruits).find((r) => !r.committedTo);
    g.recruiting.pointsLeft = 50;
    g.recruiting.budgetLeft = 50000;
    const res = window.XCD.engine.Recruiting.doAction(g, rec.id, 'offer');
    return { di: di.action, dii: D.offerTerms('DB').action, d3: d3.action, offerMsg: res.message };
  });
  if (wording.di !== 'Offer Scholarship' || wording.dii !== 'Offer Scholarship') {
    fail('DA/DB must keep scholarship wording: ' + JSON.stringify(wording));
  }
  if (wording.d3 !== 'Offer Roster Spot') fail('DC must use "Offer Roster Spot": ' + wording.d3);
  if (!/Scholarship offered to/.test(wording.offerMsg)) fail('DA offer message wrong: ' + wording.offerMsg);
  console.log('offer wording:', JSON.stringify(wording));

  // UI: the recruit-card button reflects the player's division. Move the
  // player to a DC program and open a recruit card.
  const uiLabels = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const original = g.playerSchoolId;
    const d3School = Object.values(g.world.schools).find((s) => s.division === 'DC');
    const rec = Object.values(g.world.recruits).find((r) => !r.committedTo && !r.signed);
    const grab = () => {
      window.XCD.ui.showRecruitCard(g, rec);
      const btn = document.querySelector('[data-action="offer"]');
      const label = btn ? btn.textContent.trim() : '(missing)';
      document.querySelectorAll('.modal-overlay, [data-modal-close]').forEach((n) => {
        const overlay = n.closest('.modal-overlay') || n.parentElement;
        if (overlay && overlay.remove) overlay.remove();
      });
      return label;
    };
    const diLabel = grab();
    g.playerSchoolId = d3School.id;
    const d3Label = grab();
    g.playerSchoolId = original;
    return { diLabel, d3Label };
  });
  if (!/Offer Scholarship/.test(uiLabels.diLabel)) fail('DA recruit card should show Offer Scholarship: ' + uiLabels.diLabel);
  if (!/Offer Roster Spot/.test(uiLabels.d3Label)) fail('DC recruit card should show Offer Roster Spot: ' + uiLabels.d3Label);
  console.log('ui labels:', JSON.stringify(uiLabels));

  // ---- 3) Two-season simulation: signing coverage, mandatory commits,
  //         portal bidding wars, CPU fitness, auto-recruit economy ----
  const sim = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const XCD = window.XCD;
    const D = XCD.data;
    g.recruiting.auto = true;
    const out = { portalElite: [], fitness: [], signing: [], autoBudgetSpent: 0, err: null };
    try {
      for (let season = 0; season < 2; season++) {
        const yr = g.year;
        while (g.year === yr) {
          g.weeklyFlow.trainingConfirmed = true;
          g.weeklyFlow.recruitingDone = true;

          // Portal snapshot right before final decisions.
          if (g.portal && g.portal.open && g.week === XCD.engine.Portal.DECISION_WEEK - 1) {
            g.portal.entries.forEach((e) => {
              const a = g.getAthlete(e.athleteId);
              if (a && a.currentOverall >= 74) out.portalElite.push(e.offers.length);
            });
          }
          // CPU championship fitness: top-25 ranked varsity at nationals.
          if (g.week === D.CALENDAR.NATIONAL_WEEK) {
            let fit = 0, fat = 0, n = 0;
            (g.rankings.M.slice(0, 25) || []).forEach((row) => {
              if (row.schoolId === g.playerSchoolId) return;
              g.getRoster(row.schoolId, 'M')
                .sort((a, b) => b.currentOverall - a.currentOverall).slice(0, 7)
                .forEach((a) => { fit += a.fitness; fat += a.fatigue; n++; });
            });
            out.fitness.push({ fit: +(fit / n).toFixed(1), fat: +(fat / n).toFixed(1) });
          }
          // Mid-cycle: Auto Recruiting must be spending the player's budget.
          if (g.week === 12) {
            out.autoBudgetSpent = Math.max(out.autoBudgetSpent,
              g.getPlayerSchool().budget.recruiting - g.recruiting.budgetLeft);
            out.autoBoard = (g.recruiting.board.M.length + g.recruiting.board.W.length);
          }
          if (g.week === D.RECRUITING.SIGNING_WEEK) {
            g.advanceWeek();
            const recs = Object.values(g.world.recruits);
            const offeredUnsigned = recs.filter((r) => !r.signed &&
              Object.values(r.interests).some((st) => st.offered)).length;
            const bySchool = {};
            recs.forEach((r) => { if (r.signed) bySchool[r.committedTo] = 1; });
            const div = { DA: [0, 0], DB: [0, 0], DC: [0, 0] };
            Object.values(g.world.schools).forEach((s) => {
              const d = div[s.division || 'DA'];
              d[1]++; if (bySchool[s.id]) d[0]++;
            });
            out.signing.push({
              offeredUnsigned,
              signers: Object.keys(bySchool).length,
              d3: div.DC[0] + '/' + div.DC[1],
              d3Pct: div.DC[0] / div.DC[1]
            });
            continue;
          }
          g.advanceWeek();
        }
      }
      // The transfer-success ledger feeds staff reputation.
      const ps = Object.values(g.history.portalSummaries || {});
      out.inLedger = ps.some((p) => p.inBySchool && Object.keys(p.inBySchool).length > 0);
    } catch (e) { out.err = e.message + '\n' + e.stack; }
    return out;
  });
  if (sim.err) fail('simulation crash: ' + sim.err);
  else {
    sim.signing.forEach((s, i) => {
      if (s.offeredUnsigned !== 0) fail(`year ${i + 1}: ${s.offeredUnsigned} offered recruits went unsigned`);
      if (s.signers < 600) fail(`year ${i + 1}: only ${s.signers} programs signed a class`);
      if (s.d3Pct < 0.85) fail(`year ${i + 1}: DC signing coverage too low (${s.d3})`);
    });
    const eliteAvg = sim.portalElite.length
      ? sim.portalElite.reduce((a, b) => a + b, 0) / sim.portalElite.length : 0;
    // Update 11: the portal is an intimate market again — 2-4 programs
    // pursue each athlete, elite names included. Assert on the average.
    if (sim.portalElite.length && (eliteAvg < 1.5 || eliteAvg > 4.6)) {
      fail(`elite transfers should average 2-4 suitors, got ${eliteAvg.toFixed(1)}: ${JSON.stringify(sim.portalElite)}`);
    }
    sim.fitness.forEach((f, i) => {
      if (f.fat > 30) fail(`year ${i + 1}: CPU varsity arrived at nationals fatigued (${f.fat})`);
      if (f.fit < 40) fail(`year ${i + 1}: CPU varsity arrived at nationals unfit (${f.fit})`);
    });
    if (sim.autoBudgetSpent <= 0) fail('Auto Recruiting never spent the player recruiting budget');
    if (!sim.autoBoard) fail('Auto Recruiting never built a board');
    if (!sim.inLedger) fail('portal inBySchool transfer-success ledger never recorded');
  }
  console.log('simulation:', JSON.stringify(sim));

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
