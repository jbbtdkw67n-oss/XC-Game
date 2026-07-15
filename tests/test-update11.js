// Update 11 test suite. Verifies the recruiting balance overhaul:
//  - class volume: 4,800 per gender so all 727 programs sign real classes
//  - signing coverage & class sizes: DI ~6-8 signees, DII/DIII ~4-8, and
//    (nearly) every DIII program signs every cycle
//  - class rankings take ANY signees: no star threshold, DIII boards filled
//  - diamonds in the rough: 3-7% of each class hides an elite ceiling
//    behind a modest perceivedPotential; rankings, stars, and the scouted
//    POT display all read the perceived number; scout notes are noisy
//  - division preference: a slice of 1-4★ recruits prefers DII/DIII
//  - fall portal: an intimate 2-4 suitor market per athlete
//  - summer window: DI roster cuts stock a weeks 1-3 window exclusive to
//    DII/DIII; every cut resolves (placed or walks away), none vanish
//  - coaching carousel: accepting a job wipes remaining offers and closes
//    the market for the rest of that offseason
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

  // ---- 1) Class volume, gems, division preferences ----
  const cls = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const D = window.XCD.data;
    const RE = window.XCD.engine.Recruiting;
    const recs = Object.values(g.world.recruits);
    const byGender = { M: recs.filter((r) => r.gender === 'M'), W: recs.filter((r) => r.gender === 'W') };
    const gems = recs.filter((r) => r.hiddenGem);
    const badGems = gems.filter((r) =>
      r.perceivedPotential == null || r.potential <= r.perceivedPotential || r.workEthic < 80);
    // recruitComposite must read the PERCEIVED ceiling, never the real one.
    const leakyComposite = gems.filter((r) =>
      Math.abs(RE.recruitComposite(r) - (r.perceivedPotential * 0.62 + r.currentOverall * 0.38)) > 1e-9);
    const notedNonGems = recs.filter((r) => !r.hiddenGem && r.scoutNotes && r.scoutNotes.length).length;
    const prefs = recs.filter((r) => r.divisionPreference);
    const prefStars = {};
    prefs.forEach((r) => { prefStars[r.starRating] = (prefStars[r.starRating] || 0) + 1; });
    const prefMissingMotivation = prefs.filter((r) => !r.motivations.includes('small-school')).length;
    return {
      perGender: D.RECRUITING.CLASS_SIZE_PER_GENDER,
      m: byGender.M.length, w: byGender.W.length,
      gemPctM: byGender.M.filter((r) => r.hiddenGem).length / byGender.M.length,
      gemPctW: byGender.W.filter((r) => r.hiddenGem).length / byGender.W.length,
      badGems: badGems.length,
      leakyComposite: leakyComposite.length,
      notedNonGems,
      prefCount: prefs.length,
      prefStars,
      prefMissingMotivation
    };
  });
  if (cls.perGender !== 4800 || cls.m !== 4800 || cls.w !== 4800) {
    fail('class should be 4800 per gender: ' + JSON.stringify(cls));
  }
  ['gemPctM', 'gemPctW'].forEach((k) => {
    if (cls[k] < 0.02 || cls[k] > 0.09) fail(`${k} should land in ~3-7%: ${(cls[k] * 100).toFixed(1)}%`);
  });
  if (cls.badGems) fail(cls.badGems + ' gems missing perceived/true split or the work-ethic tell');
  if (cls.leakyComposite) fail('recruitComposite leaks true potential for ' + cls.leakyComposite + ' gems');
  if (cls.notedNonGems < 50) fail('scout notes must be noisy (ordinary grinders earn them too): ' + cls.notedNonGems);
  if (cls.prefCount < 300) fail('too few division-preference recruits: ' + cls.prefCount);
  if ((cls.prefStars[5] || 0) > 0) fail('5-star recruits must never carry a division preference');
  if (!(cls.prefStars[2] > 0 && cls.prefStars[3] > 0)) fail('division preference must hit 2-3 stars: ' + JSON.stringify(cls.prefStars));
  if (cls.prefMissingMotivation) fail(cls.prefMissingMotivation + ' preference recruits missing the small-school motivation');
  console.log('class:', JSON.stringify(cls));

  // ---- 2) UI never shows a gem's true ceiling ----
  const gemUI = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const gem = Object.values(g.world.recruits).find((r) => r.hiddenGem && r.scoutNotes && r.scoutNotes.length);
    gem.playerKnowledge.scout = 100; // fully scouted — the fog is gone, the lie is not
    window.XCD.ui.showRecruitCard(g, gem);
    const modal = document.querySelector('.modal-overlay') || document.body;
    const text = modal.textContent;
    const showsPerceived = text.includes(`POT ${gem.perceivedPotential}`);
    const showsTrue = text.includes(`POT ${gem.potential}`);
    const showsNotes = gem.scoutNotes.every((n) => text.includes(n));
    document.querySelectorAll('.modal-overlay').forEach((n) => n.remove());
    return { showsPerceived, showsTrue, showsNotes, perceived: gem.perceivedPotential, real: gem.potential };
  });
  if (!gemUI.showsPerceived || gemUI.showsTrue) fail('recruit card must show perceived POT only: ' + JSON.stringify(gemUI));
  if (!gemUI.showsNotes) fail('scout notes must appear on a fully scouted card');
  console.log('gem UI:', JSON.stringify(gemUI));

  // ---- 3) One full season: signing coverage, class sizes, rankings,
  //         fall-portal suitors; then the summer window in year 2 ----
  const sim = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const XCD = window.XCD;
    const D = XCD.data;
    g.recruiting.auto = true;
    const out = { err: null, portalOffers: [] };
    try {
      const yr = g.year;
      while (g.year === yr) {
        g.weeklyFlow.trainingConfirmed = true;
        g.weeklyFlow.recruitingDone = true;

        // Fall portal snapshot right before final decisions.
        if (g.portal && g.portal.open && !g.portal.summer &&
            g.week === XCD.engine.Portal.DECISION_WEEK - 1) {
          g.portal.entries.forEach((e) => out.portalOffers.push(e.offers.length));
        }

        if (g.week === D.RECRUITING.SIGNING_WEEK) {
          g.advanceWeek();
          const recs = Object.values(g.world.recruits);
          const bySchool = {};
          recs.forEach((r) => {
            if (r.signed) bySchool[r.committedTo] = (bySchool[r.committedTo] || 0) + 1;
          });
          const div = { DI: { signed: 0, schools: 0, signees: 0 }, DII: { signed: 0, schools: 0, signees: 0 }, DIII: { signed: 0, schools: 0, signees: 0 } };
          Object.values(g.world.schools).forEach((s) => {
            const d = div[s.division || 'DI'];
            d.schools++;
            if (bySchool[s.id]) { d.signed++; d.signees += bySchool[s.id]; }
          });
          out.signing = {};
          Object.entries(div).forEach(([k, d]) => {
            out.signing[k] = {
              coverage: +(d.signed / d.schools).toFixed(3),
              // per-gender average class among signing schools
              avgPerGender: +(d.signees / Math.max(1, d.signed) / 2).toFixed(2)
            };
          });
          const classes = g.history.recruitingClasses[yr] || [];
          out.rankings = {
            diii: classes.filter((e) => e.division === 'DIII').length,
            lowStar: classes.filter((e) => e.avgStars <= 2).length,
            total: classes.length
          };
          continue;
        }
        g.advanceWeek();
      }

      // Year 2: the summer window (weeks 1-3, DII/DIII exclusive).
      out.summer = {
        openAtW1: !!(g.portal && g.portal.summer && g.portal.open),
        entries: g.portal && g.portal.summer ? g.portal.entries.length : 0
      };
      const entryIds = g.portal && g.portal.summer ? g.portal.entries.map((e) => e.athleteId) : [];
      while (g.week < D.CALENDAR.REGULAR_SEASON_START) {
        g.weeklyFlow.trainingConfirmed = true;
        g.weeklyFlow.recruitingDone = true;
        g.advanceWeek();
      }
      const summary = (g.history.summerPortals || {})[g.year] || null;
      const landedDivs = {};
      let vanished = 0;
      let riskChecked = 0;
      let riskHigh = 0; // just-transferred athletes must NOT read high risk
      let graceMissing = 0;
      entryIds.forEach((id) => {
        const a = g.world.athletes[id];
        if (!a) return; // walked away — recorded as alumni, a legal outcome
        if (!a.schoolId) { vanished++; return; }
        const s = g.getSchool(a.schoolId);
        landedDivs[s.division || 'DI'] = (landedDivs[s.division || 'DI'] || 0) + 1;
        // A just-arrived transfer should read zero/very-low transfer risk.
        if (a.transferGraceYear !== g.year) graceMissing++;
        const risk = window.XCD.engine.Portal.transferRisk(g, a);
        if (risk) {
          riskChecked++;
          if (risk.score > 8) riskHigh++;
        }
      });
      out.summer.closedByW4 = !g.portal || !g.portal.summer;
      out.summer.summary = summary;
      out.summer.landedDivs = landedDivs;
      out.summer.vanished = vanished;
      out.summer.riskChecked = riskChecked;
      out.summer.riskHigh = riskHigh;
      out.summer.graceMissing = graceMissing;
    } catch (e) { out.err = e.message + '\n' + e.stack; }
    return out;
  });
  if (sim.err) fail('simulation crash: ' + sim.err);
  else {
    const s = sim.signing;
    if (!s) fail('signing snapshot missing');
    else {
      if (s.DIII.coverage < 0.95) fail('every DIII school should sign a class: coverage ' + s.DIII.coverage);
      if (s.DII.coverage < 0.95) fail('every DII school should sign a class: coverage ' + s.DII.coverage);
      if (s.DI.coverage < 0.95) fail('every DI school should sign a class: coverage ' + s.DI.coverage);
      if (s.DI.avgPerGender < 5.5 || s.DI.avgPerGender > 9.5) fail('DI classes should average ~6-8 per gender: ' + s.DI.avgPerGender);
      if (s.DII.avgPerGender < 3.5 || s.DII.avgPerGender > 8.5) fail('DII classes should average ~4-8 per gender: ' + s.DII.avgPerGender);
      if (s.DIII.avgPerGender < 3.5 || s.DIII.avgPerGender > 8.5) fail('DIII classes should average ~4-8 per gender: ' + s.DIII.avgPerGender);
    }
    if (!sim.rankings || sim.rankings.diii < 25) fail('DIII class rankings board too thin: ' + JSON.stringify(sim.rankings));
    if (sim.rankings && sim.rankings.lowStar === 0) fail('classes with no 3-star recruits must still be ranked');
    if (sim.portalOffers.length) {
      const avg = sim.portalOffers.reduce((a, b) => a + b, 0) / sim.portalOffers.length;
      const max = Math.max(...sim.portalOffers);
      if (avg < 1 || avg > 4.6) fail('fall portal should average 2-4 suitors: ' + avg.toFixed(1));
      if (max > 6) fail('fall portal suitor cap blown: max ' + max);
    }
    if (!sim.summer.openAtW1 || !sim.summer.entries) fail('summer window must open at week 1 with DI cuts: ' + JSON.stringify(sim.summer));
    if (!sim.summer.closedByW4) fail('summer window must be closed before the regular season');
    if (sim.summer.vanished) fail(sim.summer.vanished + ' summer-window athletes left in limbo (no roster, not retired)');
    if (sim.summer.landedDivs.DI) fail('summer window placed athletes at Division I schools: ' + JSON.stringify(sim.summer.landedDivs));
    if (!(sim.summer.landedDivs.DII || 0) && !(sim.summer.landedDivs.DIII || 0)) {
      fail('summer window placed nobody at DII/DIII: ' + JSON.stringify(sim.summer));
    }
    if (!sim.summer.summary || sim.summer.summary.placed + sim.summer.summary.walkedAway !== sim.summer.summary.entries) {
      fail('summer summary must account for every entry: ' + JSON.stringify(sim.summer.summary));
    }
    // Just-transferred athletes must not carry their old high transfer risk.
    if (!sim.summer.riskChecked) fail('no transferred athletes available to check transfer risk');
    if (sim.summer.graceMissing) fail(sim.summer.graceMissing + ' transferred-in athletes missing the arrival grace flag');
    if (sim.summer.riskHigh) fail(sim.summer.riskHigh + '/' + sim.summer.riskChecked + ' just-transferred athletes still read elevated transfer risk');
  }
  console.log('season sim:', JSON.stringify(sim));

  // ---- 3b) The arrival grace overrides even a maximally-unhappy athlete:
  //          whatever drove them out does not follow them in ----
  const grace = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const a = Object.values(g.world.athletes).find((x) => x.schoolId && !x.isRecruit && x.eligibilityRemaining >= 2);
    // Manufacture the exact bug: a runner who'd read Very High risk.
    a.morale = 1; a.coachRelationship = 10; a.teamRelationship = 10;
    a.seasonRaces = 0; a.currentOverall = 80;
    const before = P.transferRisk(g, a);
    a.transferGraceYear = g.year; // ...but they just transferred in
    const after = P.transferRisk(g, a);
    return { beforeScore: before.score, beforeLevel: before.level.key, afterScore: after.score, afterLevel: after.level.key };
  });
  if (grace.beforeScore <= 8) fail('test setup wrong — the athlete should read high risk without grace: ' + JSON.stringify(grace));
  if (grace.afterScore !== 0 || grace.afterLevel !== 'very-low') {
    fail('the arrival grace must zero out transfer risk: ' + JSON.stringify(grace));
  }
  console.log('grace:', JSON.stringify(grace));

  // ---- 4) Coaching carousel: accepting a job ends the offseason search ----
  const carousel = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const XCD = window.XCD;
    const C = XCD.engine.Careers;
    window.XCD.ui.state.game = g;
    g.week = 17; // mid-offseason
    const target = Object.values(g.world.schools).find((s) =>
      s.id !== g.playerSchoolId && s.coachId);
    const decoy = Object.values(g.world.schools).find((s) =>
      s.id !== g.playerSchoolId && s.id !== target.id);
    g.jobOffers = {
      year: g.year, expiresWeek: 99,
      offers: [
        { schoolId: target.id, schoolName: target.name },
        { schoolId: decoy.id, schoolName: decoy.name }
      ]
    };
    const res = C.acceptOffer(g, target.id);
    const wiped = g.jobOffers === null;
    const closedYear = g.jobSearchClosedYear === g.year;
    // The market must stay shut for the rest of this offseason...
    const rng = new XCD.core.SeededRNG(7);
    C.evolveJobMarket(g, rng);
    C.generateOffers(g, rng);
    const staysShut = g.jobOffers === null;
    const reapply = C.applyForJob(g, decoy.id);
    // ...and reopen normally next cycle.
    g.year += 1;
    C.generateOffers(g, new XCD.core.SeededRNG(11));
    const reopensNextYear = g.jobSearchClosedYear !== g.year;
    return {
      accepted: res.ok, wiped, closedYear, staysShut,
      reapplyBlocked: !reapply.ok, reopensNextYear,
      nowAt: g.playerSchoolId === target.id
    };
  });
  if (!carousel.accepted || !carousel.nowAt) fail('accepting the offer failed: ' + JSON.stringify(carousel));
  if (!carousel.wiped) fail('remaining offers must disappear after accepting a job');
  if (!carousel.closedYear) fail('jobSearchClosedYear must mark the accepted season final');
  if (!carousel.staysShut) fail('the market must not re-list openings after a job is accepted');
  if (!carousel.reapplyBlocked) fail('applying after accepting must be refused');
  if (!carousel.reopensNextYear) fail('the carousel must function normally the next offseason');
  console.log('carousel:', JSON.stringify(carousel));

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
