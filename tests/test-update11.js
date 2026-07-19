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
  if (cls.perGender !== 3000 || cls.m !== 3000 || cls.w !== 3000) {
    fail('class should be 3000 per gender: ' + JSON.stringify(cls));
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
          // Track the DI signees so we can measure how many get cut at the
          // rollover — over-recruiting waste (Kentucky signed 22, kept ~10).
          out.diSignedIds = recs.filter((r) => r.signed &&
            (g.getSchool(r.committedTo) || {}).division === 'DI')
            .map((r) => ({ id: r.id, to: r.committedTo }));
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
          const diClasses = classes.filter((e) => e.division === 'DI');
          out.rankings = {
            diii: classes.filter((e) => e.division === 'DIII').length,
            lowStar: classes.filter((e) => e.avgStars <= 2).length,
            total: classes.length,
            // Quality-first check: the top DI classes must be genuinely
            // star-heavy — no 2.6-avg class ranking near the top anymore.
            top5AvgStars: +(diClasses.slice(0, 5).reduce((s, e) => s + e.avgStars, 0) / Math.min(5, diClasses.length)).toFixed(2),
            top5MaxCount: Math.max(...diClasses.slice(0, 5).map((e) => e.count))
          };
          continue;
        }
        g.advanceWeek();
      }

      // The season rolled over: signees enrolled, DI trimmed to 14. Measure
      // how many just-signed DI freshmen were cut — the over-recruiting waste.
      let diCut = 0;
      (out.diSignedIds || []).forEach((s) => {
        const a = g.world.athletes[s.id];
        if (!a || a.schoolId !== s.to) diCut++;
      });
      out.waste = {
        diSigned: (out.diSignedIds || []).length,
        diCut,
        diCutPct: (out.diSignedIds || []).length ? +(diCut / out.diSignedIds.length).toFixed(3) : 0
      };
      delete out.diSignedIds;

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
      // Recruit-to-need (Update 11.1): classes track real roster holes, not a
      // flat quota. A 14-cap DI roster fills ~3-4 spots/gender plus a modest
      // upgrade allowance — not 6-8 signees it will only cut.
      if (s.DI.avgPerGender < 2.5 || s.DI.avgPerGender > 6) fail('DI classes should average ~3-5 per gender (recruit-to-need): ' + s.DI.avgPerGender);
      if (s.DII.avgPerGender < 2.5 || s.DII.avgPerGender > 7) fail('DII classes should average ~3-6 per gender: ' + s.DII.avgPerGender);
      if (s.DIII.avgPerGender < 2.5 || s.DIII.avgPerGender > 7) fail('DIII classes should average ~3-6 per gender: ' + s.DIII.avgPerGender);
    }
    // Over-recruiting waste: the vast majority of DI signees must stick.
    // (The bug this fixes: Kentucky signed 22 and kept ~10 — a 55% cut rate.)
    if (!sim.waste || sim.waste.diSigned < 500) fail('waste sample missing: ' + JSON.stringify(sim.waste));
    else if (sim.waste.diCutPct > 0.15) fail('too many DI freshmen cut — programs are over-recruiting: ' + JSON.stringify(sim.waste));
    if (!sim.rankings || sim.rankings.diii < 25) fail('DIII class rankings board too thin: ' + JSON.stringify(sim.rankings));
    if (sim.rankings && sim.rankings.lowStar === 0) fail('classes with no 3-star recruits must still be ranked');
    // Quality over quantity: the top DI classes must be star-heavy, not big
    // and mediocre (the reported bug: a 2.6-avg class ranking 6th).
    if (sim.rankings && sim.rankings.top5AvgStars < 3.4) fail('top-5 DI classes should be genuinely elite (avg stars): ' + sim.rankings.top5AvgStars);
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

  // ---- 3c) Class-ranking quality: three 4-stars outrank eight 3-stars ----
  const rank = await page.evaluate(() => {
    const RE = window.XCD.engine.Recruiting;
    const mk = (star, pot, ovr) => ({ starRating: star, perceivedPotential: pot, potential: pot, currentOverall: ovr });
    return {
      threeFours: RE.classScore([mk(4, 80, 62), mk(4, 78, 60), mk(4, 82, 64)]),
      eightThrees: RE.classScore(Array.from({ length: 8 }, () => mk(3, 66, 52))),
      oneFive: RE.classScore([mk(5, 92, 72)]),
      tenTwos: RE.classScore(Array.from({ length: 10 }, () => mk(2, 50, 42))),
      // A recruit's value must rise steeply with star rating.
      v4: RE.recruitValue(mk(4, 78, 60)),
      v3: RE.recruitValue(mk(3, 66, 52))
    };
  });
  if (!(rank.threeFours > rank.eightThrees)) fail('three 4-stars must outrank eight 3-stars: ' + JSON.stringify(rank));
  if (!(rank.oneFive > rank.tenTwos)) fail('a single 5-star must outrank ten 2-stars: ' + JSON.stringify(rank));
  if (!(rank.v4 > rank.v3 * 1.8)) fail('a 4-star must be worth far more than a 3-star: ' + JSON.stringify(rank));
  console.log('ranking quality:', JSON.stringify(rank));

  // ---- 3d) Portal: the player's active pursuit is a real edge, and every
  //          transfer ages a year of eligibility across the move ----
  const portalRun = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const out = { pursued: 0, landed: 0, offerLimit: P.PLAYER_OFFER_LIMIT, aging: [], err: null };
    try {
      // Sim forward, and each fall-portal week pursue level-appropriate
      // transfers up to the offer limit; record eligibility of committed
      // transfers just before the rollover, then verify they aged.
      let pendingCheck = null;
      for (let s = 0; s < 8 && (out.pursued < 25 || out.aging.length < 6); s++) {
        const yr = g.year;
        while (g.year === yr) {
          g.weeklyFlow.trainingConfirmed = true;
          g.weeklyFlow.recruitingDone = true;
          g.recruiting.auto = true;
          if (g.portal && g.portal.open && !g.portal.summer) {
            const mine = g.getRoster(g.playerSchoolId, 'M').concat(g.getRoster(g.playerSchoolId, 'W'))
              .map((a) => a.currentOverall).sort((x, y) => y - x);
            const fifth = mine[4] || 45;
            // Update 15: pursuits run on the transfer-points budget — spread
            // ~45%-of-lock stakes so a mid program can work several targets.
            g.portal.entries.filter((e) => !e.destination &&
              !e.offers.includes(g.playerSchoolId) && e.fromSchoolId !== g.playerSchoolId)
              .map((e) => ({ e, a: g.getAthlete(e.athleteId) })).filter((x) => x.a)
              .filter(({ a }) => a.currentOverall >= fifth - 6 && a.currentOverall <= fifth + 10)
              .sort((x, y) => y.a.currentOverall - x.a.currentOverall)
              .slice(0, 10).forEach(({ e, a }) => {
                const left = P.transferPointsLeft(g);
                const lock = P.pointsToLock(g, a, g.getPlayerSchool(), e);
                // Meaningful stakes only — a token allocation is a wasted pursuit.
                if (left < Math.max(20, lock * 0.35)) return;
                P.setTransferPoints(g, a.id, Math.min(left, Math.round(lock * 0.6)));
              });
          }
          if (g.week === P.DECISION_WEEK) {
            pendingCheck = [];
            g.portal.entries.forEach((e) => {
              if (e.offers && e.offers.includes(g.playerSchoolId)) {
                out.pursued++;
                if (e.destination === g.playerSchoolId) out.landed++;
              }
              // Snapshot committed transfers for the aging check.
              if (e.destination && pendingCheck.length < 30) {
                const a = g.getAthlete(e.athleteId);
                if (a) pendingCheck.push({ id: a.id, to: e.destination, elig: a.eligibilityRemaining, cyIdx: window.XCD.data.CLASS_YEARS.indexOf(a.classYear), yoc: a.yearsOnCampus });
              }
            });
          }
          g.advanceWeek();
        }
        // Post-rollover: every snapshot transfer must have aged (used a year
        // of eligibility and moved up a class) or graduated out.
        (pendingCheck || []).forEach((snap) => {
          if (out.aging.length >= 6) return;
          const a = g.world.athletes[snap.id];
          const aged = !a /* graduated */ ||
            (a.eligibilityRemaining === snap.elig - 1 && a.yearsOnCampus === snap.yoc + 1);
          out.aging.push({ before: snap.elig, after: a ? a.eligibilityRemaining : 'grad', aged });
        });
        pendingCheck = null;
      }
    } catch (e) { out.err = e.message + '\n' + e.stack; }
    return out;
  });
  if (portalRun.err) fail('portal run crash: ' + portalRun.err);
  else {
    if (portalRun.offerLimit < 5) fail('player should be able to pursue more transfers at once: ' + portalRun.offerLimit);
    const landPct = portalRun.pursued ? portalRun.landed / portalRun.pursued : 0;
    // Update 15: pursuits are budget-limited (transfer points), so a mid
    // program realistically works ~3-5 targets a cycle rather than ten.
    if (portalRun.pursued < 10) fail('not enough player pursuits sampled: ' + portalRun.pursued);
    // A ~45%-of-lock stake should land ~45% of pursuits — the points model
    // pays out exactly the published odds, well clear of the old coin flip.
    else if (landPct < 0.3) fail(`player still can't land level-appropriate transfers: ${(landPct * 100).toFixed(0)}% (${portalRun.landed}/${portalRun.pursued})`);
    // Every transfer must age a year of eligibility across the move.
    const notAged = portalRun.aging.filter((r) => !r.aged);
    if (!portalRun.aging.length) fail('no transfers sampled for the eligibility-aging check');
    if (notAged.length) fail('transfers did not age eligibility: ' + JSON.stringify(notAged));
  }
  console.log('portal:', JSON.stringify(portalRun));

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
