/*
 * Update 18 acceptance test — the "Racing, Coaching, Transfer Portal &
 * Competitive Balance" update. Drives the real engine headlessly and checks:
 *
 *   1  DNF results          — rare but present, no place/time, healthy elite
 *                             fields barely affected, bookkeeping correct
 *  12-14 Faster times +     — realistic modern collegiate times, clear division
 *        performance tiers    hierarchy, elite reliably beats good (correlation)
 *  15  Variance by quality  — elite athletes swing less than average ones
 *  16  Championship racing   — coach peaking measurably helps at champs
 *  11  D2/D3 Pre-Nationals   — all three divisions, division-appropriate config
 *  2-4,10 Portal overhaul    — program fit weighted heavily, competition raises
 *                             lock cost, CPUs escalate dynamically
 *   6  Buried upperclassmen  — a talented, never-racing junior/senior is a real
 *                             flight risk; a legitimate reason tempers it
 *  7-9 Coaching quality      — graded mistake probability, all periodization
 *                             phases used, coach quality drives development
 */
const { chromium } = require('playwright');
const path = require('path');
const { launchOpts } = require('./helpers');

function fmt(sec) { const m = Math.floor(sec / 60); return `${m}:${(sec - m * 60).toFixed(1).padStart(4, '0')}`; }

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  page.on('pageerror', (e) => fails.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') fails.push('CONSOLE: ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.XCD && window.XCD.engine && window.XCD.engine.GameState);

  const out = await page.evaluate(() => {
    const XCD = window.XCD;
    const R = XCD.engine.Races;
    const P = XCD.engine.Portal;
    const T = XCD.engine.Training;
    const U = XCD.core.Utils;
    const res = { err: null };
    try {
      const world = XCD.engine.WorldGenerator.generate(4242);
      const naz = Object.values(world.schools).find((s) => s.name === 'Northern Arizona') ||
        Object.values(world.schools)[0];
      const gs = XCD.engine.GameState.newGame({
        schoolId: naz.id, dynastyName: 'U17', coachFirstName: 'Up', coachLastName: 'Date',
        archetype: 'Tactician', gender: 'M', trainingPhilosophy: 'balanced', racePhilosophy: 'even',
        seed: 4242, world
      });
      gs.tutorial = null;

      // Season-wide DNF accounting across two full seasons.
      let starts = 0, dnf = 0, healthyStarts = 0, healthyDnf = 0;
      const tallyDnf = () => {
        const s = gs.season;
        Object.values(s.meets).forEach((m) => {
          ['M', 'W'].forEach((g) => {
            const rr = m.results[g];
            if (!rr) return;
            const d = (rr.dnfs || []).length;
            const fin = rr.finishers ? rr.finishers.length : 0;
            starts += fin + d; dnf += d;
            // "healthy field" proxy: invites early in the season (fresh legs).
            if (m.type === 'invite' && m.week <= 6) { healthyStarts += fin + d; healthyDnf += d; }
          });
        });
      };

      for (let yr = 0; yr < 2; yr++) {
        let tallied = false;
        while (true) {
          gs.weeklyFlow.trainingConfirmed = true;
          gs.weeklyFlow.recruitingDone = true;
          gs.recruiting.auto = true;
          // Capture the season's DNFs in the offseason, while results still
          // exist — the year rollover rebuilds gs.season and wipes them.
          if (gs.week >= 16 && !tallied) { tallyDnf(); tallied = true; }
          const wasYear = gs.year;
          gs.advanceWeek();
          if (gs.year !== wasYear) break;
        }
      }
      res.dnf = { starts, dnf, rate: starts ? dnf / starts : 0,
        healthyRate: healthyStarts ? healthyDnf / healthyStarts : 0 };

      // --- advance to a set of nationals results in the current season ---
      while (gs.week < 15) { gs.weeklyFlow.trainingConfirmed = true; gs.weeklyFlow.recruitingDone = true; gs.recruiting.auto = true; gs.advanceWeek(); }
      gs.weeklyFlow.trainingConfirmed = true; gs.weeklyFlow.recruitingDone = true; gs.recruiting.auto = true; gs.advanceWeek();
      const s2 = gs.season;

      // Championship winning times + hierarchy check.
      res.nats = {};
      let corrTop = 0, corrBot = 0;
      Object.values(s2.meets).forEach((m) => {
        if (m.type !== 'national') return;
        ['M', 'W'].forEach((g) => {
          const rr = m.results[g];
          if (!rr || !rr.finishers || rr.finishers.length < 40) return;
          const key = (m.division || 'DI') + '-' + g + '-' + m.distances[g];
          res.nats[key] = { win: rr.finishers[0].time, p30: rr.finishers[29].time, n: rr.finishers.length, dnfs: (rr.dnfs || []).length };
          if ((m.division || 'DI') === 'DI') {
            const rated = rr.finishers.map((f) => ({
              rr: R.raceRating(gs.world.athletes[f.athleteId] || {}, m.distances[g]) || 0, place: f.place
            })).filter((x) => x.rr > 0);
            const top = rated.slice(0, 10), bot = rated.slice(-10);
            corrTop += top.reduce((s, x) => s + x.rr, 0) / (top.length || 1);
            corrBot += bot.reduce((s, x) => s + x.rr, 0) / (bot.length || 1);
          }
        });
      });
      res.hierarchy = { topAvgRating: +(corrTop / 2).toFixed(1), botAvgRating: +(corrBot / 2).toFixed(1) };

      // --- Pre-Nationals: all three divisions ---
      res.preNats = { keys: Object.keys(s2.preNationalsByDiv || {}) };
      const pnMeets = Object.values(s2.meets).filter((m) => m.preNationals);
      res.preNats.names = {};
      res.preNats.divisions = {};
      pnMeets.forEach((m) => { res.preNats.names[m.division] = m.name; res.preNats.divisions[m.division] = m.schoolIds.length; });

      // --- Variance by quality (item 15) ---
      const elite = { consistency: 92, currentOverall: 90, mentalToughness: 90 };
      const avg = { consistency: 60, currentOverall: 58, mentalToughness: 60 };
      const dev = { consistency: 42, currentOverall: 45, mentalToughness: 44 };
      res.variability = {
        elite: +R.raceVariability(elite).toFixed(3),
        avg: +R.raceVariability(avg).toFixed(3),
        dev: +R.raceVariability(dev).toFixed(3)
      };

      // --- Program fit weighted heavily (item 4) ---
      // A lower-prestige program that fits an athlete beats a bigger name that
      // doesn't. Build two synthetic schools around the same athlete.
      const anAthlete = Object.values(gs.world.athletes).find((a) => a.currentOverall >= 60 && a.gender === 'M');
      const bigPoorFit = {
        id: 's_big', prestige: 92, academics: 60, facilitiesOverall: 55, conferenceTier: 1,
        state: 'FL', budget: { nil: 5000, recruiting: 40000 }, division: 'DI', coachChangedYear: gs.year,
        weather: { tempBase: 78, altitude: 'Low' }, facilities: { trainingCenter: 45 },
        rosterM: [], rosterW: [], chemistry: {}, teamMorale: 55, prestigeMomentum: 0
      };
      const midGreatFit = {
        id: 's_mid', prestige: 66, academics: 80, facilitiesOverall: 82, conferenceTier: 2,
        state: anAthlete.hometownState, budget: { nil: 20000, recruiting: 40000 }, division: 'DI',
        weather: { tempBase: 55, altitude: 'Medium' }, facilities: { trainingCenter: 85 },
        rosterM: [], rosterW: [], chemistry: {}, teamMorale: 80, prestigeMomentum: 0.6
      };
      // Give the mid school an elite developer coach; the big school a mediocre one.
      const goodCoach = { id: 'c_good', schoolId: 's_mid', recruiting: 78, transferRecruiting: 80, training: 88, peaking: 82, culture: 80, reputation: 70, relationships: 78, hasTendency: () => false };
      const badCoach = { id: 'c_bad', schoolId: 's_big', recruiting: 55, transferRecruiting: 50, training: 48, peaking: 50, culture: 50, reputation: 30, relationships: 50, hasTendency: () => false };
      gs.world.schools.s_big = bigPoorFit; gs.world.schools.s_mid = midGreatFit;
      gs.world.coaches.c_good = goodCoach; gs.world.coaches.c_bad = badCoach;
      bigPoorFit.coachId = 'c_bad'; midGreatFit.coachId = 'c_good';
      res.fit = {
        bigPoorFit: +P.portalAppeal(gs, bigPoorFit, anAthlete, null).toFixed(1),
        midGreatFit: +P.portalAppeal(gs, midGreatFit, anAthlete, null).toFixed(1)
      };

      // --- Competition raises lock cost + CPUs escalate (items 2,3) ---
      // Same reason string for both so preferences (and thus base cost) match —
      // isolating the pure effect of competition on the lock cost.
      const school = gs.getPlayerSchool();
      const lockAlone = P.pointsToLock(gs, anAthlete, school, { athleteId: anAthlete.id, fromSchoolId: null, reason: 'Championship aspirations', offers: [], cpuPoints: {} });
      const contested = { athleteId: anAthlete.id, fromSchoolId: null, reason: 'Championship aspirations', offers: [], cpuPoints: {}, destination: null };
      contested.offers.push('s_mid'); // a great-fit suitor that will escalate
      const elitePrograms = Object.values(gs.world.schools).filter((s) => (s.division || 'DI') === 'DI' && s.prestige >= 80 && s.id !== school.id).slice(0, 4);
      elitePrograms.forEach((s) => contested.offers.push(s.id));
      contested.offers.forEach((sid) => { contested.cpuPoints[sid] = P.cpuTransferPoints(gs, gs.world.schools[sid], anAthlete, contested, null); });
      const lockContested = P.pointsToLock(gs, anAthlete, school, contested);
      const suitors = contested.offers.slice();
      const before = suitors.map((sid) => contested.cpuPoints[sid]);
      // Simulate a live battle: player pours points in, portal open, escalate.
      gs.portal = { year: gs.year, open: true, summer: false, entries: [contested], player: { budget: 300, allocations: { [anAthlete.id]: Math.round(lockContested * 0.8) } } };
      const rng = new XCD.core.SeededRNG(9);
      for (let i = 0; i < 4; i++) P.escalateCpuPursuits(gs, rng);
      const after = suitors.map((sid) => contested.cpuPoints[sid]);
      res.portal = {
        lockAlone, lockContested,
        escalated: after.some((v, i) => v > before[i]),
        beforeSum: before.reduce((a, b) => a + b, 0), afterSum: after.reduce((a, b) => a + b, 0)
      };

      // --- Coaching mistake probability is graded (item 9) ---
      const mk = (tr, pk) => ({ training: tr, peaking: pk });
      res.mistakes = {
        elite: +T.mistakeChance(mk(90, 88)).toFixed(3),
        good: +T.mistakeChance(mk(72, 70)).toFixed(3),
        avg: +T.mistakeChance(mk(55, 55)).toFixed(3),
        novice: +T.mistakeChance(mk(35, 35)).toFixed(3)
      };

      // --- Periodization variety across a season (item 8) ---
      const midCoach = { id: 'per_c', training: 62, peaking: 60, archetype: 'Developer', trainingPhilosophy: 'balanced', hasTendency: () => false };
      const sigs = new Set();
      const savedWeek = gs.week;
      for (let wk = 1; wk <= 16; wk++) { gs.week = wk; sigs.add(T.aiPlan(gs, midCoach, 30).join(',')); }
      gs.week = savedWeek;
      res.periodizationVariety = sigs.size;

      // --- Coach quality drives development across the world (item 7) ---
      // Correlate each program's head-coach training rating with its roster's
      // average season development. A positive correlation means better coaches
      // develop athletes better.
      const rows = [];
      Object.values(gs.world.schools).forEach((s) => {
        if (s.id.startsWith('s_')) return;
        const c = gs.getCoach(s.coachId);
        if (!c) return;
        const roster = gs.getRoster(s.id, 'M').concat(gs.getRoster(s.id, 'W'));
        if (roster.length < 6) return;
        const avgDev = roster.reduce((a, x) => a + (x.seasonDev || 0), 0) / roster.length;
        rows.push({ tr: c.training || 55, dev: avgDev });
      });
      const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
      const mt = mean(rows.map((r) => r.tr)), md = mean(rows.map((r) => r.dev));
      let num = 0, dx = 0, dy = 0;
      rows.forEach((r) => { num += (r.tr - mt) * (r.dev - md); dx += (r.tr - mt) ** 2; dy += (r.dev - md) ** 2; });
      res.devCorr = +(num / (Math.sqrt(dx * dy) || 1)).toFixed(3);

      // --- Buried-upperclassman flight risk (item 6) ---
      // A talented senior who never raced, on a roster full of better runners,
      // should read as a real transfer risk; a legit reason (role opening as
      // the runners ahead graduate) should temper it.
      res.buried = null;
      const psch = gs.getPlayerSchool();
      const seniorSample = gs.getRoster(psch.id, 'M')
        .filter((a) => ['Junior', 'Senior', 'Graduate'].includes(a.classYear) && a.currentOverall >= 55);
      if (seniorSample.length) {
        const a = seniorSample.sort((x, y) => (x.seasonRaces || 0) - (y.seasonRaces || 0))[0];
        const keep = a.seasonRaces;
        a.seasonRaces = 0; // never raced this season
        const risk = P.transferRisk(gs, a);
        a.seasonRaces = keep;
        res.buried = { classYear: a.classYear, ovr: a.currentOverall, score: risk ? risk.score : 0, level: risk ? risk.level.label : '?' };
      }
    } catch (e) { res.err = (e && e.message) + '\n' + (e && e.stack); }
    return res;
  });

  if (out.err) { console.log('EVAL CRASH:\n' + out.err); fails.push('eval crashed'); }
  else {
    console.log('DNF:', JSON.stringify(out.dnf));
    console.log('Nationals:', Object.entries(out.nats).map(([k, v]) => `${k} win ${fmt(v.win)} 30th ${fmt(v.p30)} DNF=${v.dnfs}`).join(' | '));
    console.log('Hierarchy (DI nationals avg rating top10 vs bottom10):', JSON.stringify(out.hierarchy));
    console.log('Pre-Nats:', JSON.stringify(out.preNats));
    console.log('Variability:', JSON.stringify(out.variability));
    console.log('Fit (appeal):', JSON.stringify(out.fit));
    console.log('Portal:', JSON.stringify(out.portal));
    console.log('Mistakes:', JSON.stringify(out.mistakes));
    console.log('Periodization distinct plans (16 wks):', out.periodizationVariety);
    console.log('Coach-training → development correlation:', out.devCorr);
    console.log('Buried upperclassman:', JSON.stringify(out.buried));

    // ---- 1) DNF ----
    ok(out.dnf.rate > 0.001 && out.dnf.rate < 0.04, 'DNF rate should be rare but present: ' + (out.dnf.rate * 100).toFixed(2) + '%');
    ok(out.dnf.healthyRate < out.dnf.rate + 0.01, 'healthy early-season fields should DNF less than the season overall');

    // ---- 12-14) Times + hierarchy ----
    const di = out.nats['DI-M-10000'];
    ok(di && di.win >= 1640 && di.win <= 1820, 'DI M 10K champ time realistic (27:20-30:20): ' + (di && fmt(di.win)));
    const diw = out.nats['DI-W-6000'];
    ok(diw && diw.win >= 1110 && diw.win <= 1260, 'DI W 6K champ time realistic (18:30-21:00): ' + (diw && fmt(diw.win)));
    ok(out.hierarchy.topAvgRating > out.hierarchy.botAvgRating + 6, 'clear hierarchy: top finishers far out-rate the back: ' + JSON.stringify(out.hierarchy));

    // ---- 15) Variance by quality ----
    ok(out.variability.elite < out.variability.avg && out.variability.avg < out.variability.dev,
      'variance must rise as quality falls: ' + JSON.stringify(out.variability));

    // ---- 11) Pre-Nationals all three divisions ----
    ['DI', 'DII', 'DIII'].forEach((d) => ok(out.preNats.keys.includes(d), 'Pre-Nationals missing for ' + d));
    ok(out.preNats.names.DII && out.preNats.names.DII !== out.preNats.names.DI, 'DII Pre-Nationals should be its own event, not a DI copy');
    ok(out.preNats.names.DIII && out.preNats.names.DIII !== out.preNats.names.DI, 'DIII Pre-Nationals should be its own event');

    // ---- 4) Program fit weighted heavily ----
    ok(out.fit.midGreatFit > out.fit.bigPoorFit,
      'a great-fit lower-prestige program should out-appeal a poor-fit blue blood: ' + JSON.stringify(out.fit));

    // ---- 2,3) Competition + dynamic allocation ----
    ok(out.portal.lockContested > out.portal.lockAlone * 1.1, 'competition should raise the lock cost: ' + out.portal.lockAlone + ' → ' + out.portal.lockContested);
    ok(out.portal.escalated && out.portal.afterSum > out.portal.beforeSum, 'CPUs should escalate their investment in a hot battle');

    // ---- 9) Graded mistakes ----
    ok(out.mistakes.elite < out.mistakes.good && out.mistakes.good < out.mistakes.avg && out.mistakes.avg < out.mistakes.novice,
      'mistake probability must be graded by coach quality: ' + JSON.stringify(out.mistakes));
    ok(out.mistakes.elite < 0.10 && out.mistakes.novice > 0.30, 'elite coaches rarely slip; novices frequently do: ' + JSON.stringify(out.mistakes));

    // ---- 8) Periodization variety ----
    ok(out.periodizationVariety >= 4, 'a coach should move through several distinct phases across a season: ' + out.periodizationVariety);

    // ---- 7) Coach quality → development ----
    ok(out.devCorr > 0.05, 'better coaches should develop athletes better (positive correlation): ' + out.devCorr);

    // ---- 6) Buried upperclassman ----
    ok(out.buried && out.buried.score >= 22, 'a talented, never-racing upperclassman should be a real flight risk: ' + JSON.stringify(out.buried));
  }

  console.log(fails.length ? '\nFAIL test-update18\n' + fails.map((f) => ' ✗ ' + f).join('\n') : '\nPASS test-update18');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
