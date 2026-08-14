// Update 16 test suite — Assistant Coach Mobility & Transfer Portal
// Competition Overhaul. Verifies:
//   Phase 1 (assistant career progression)
//     - every coach carries a hidden career ambition (motivation)
//     - the hiring pool is varied: young riser, veteran, and a rotating
//       wildcard (fired HC / DII-DIII standout / ex-athlete), each with a
//       real origin + career history — never a generic replacement
//     - assistant reputation rises for producing All-Americans / national
//       champions (seasonStaffHonors credit) and team improvement
//     - the player's OWN assistant can be hired away for a head-coaching job
//       (no special protection); the seat is left OPEN + a departure is flagged
//   Phase 2 (transfer portal competition)
//     - suitor bands match the spec (elite 10-15, good 5-10, avg 2-6, low 0-3)
//     - transfer-ranking storylines fire for a hot uncommitted athlete
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // A head coach at a modest program (easy for a star assistant to be poached).
  await newDynasty(page, { archetype: 'Recruiter' });

  // ---- 1) Hidden ambitions are seeded on every coach ----
  const ambitions = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const keys = new Set((window.XCD.data.COACH_AMBITIONS || []).map((a) => a.key));
    const coaches = Object.values(g.world.coaches);
    const withAmb = coaches.filter((c) => c.ambition && keys.has(c.ambition)).length;
    const distinct = new Set(coaches.map((c) => c.ambition).filter(Boolean));
    return { total: coaches.length, withAmb, distinct: distinct.size, catalog: keys.size };
  });
  ok(ambitions.catalog === 6, 'six ambition archetypes should be defined');
  ok(ambitions.withAmb / ambitions.total > 0.98, `nearly every coach must carry an ambition (${ambitions.withAmb}/${ambitions.total})`);
  ok(ambitions.distinct >= 5, 'the world should show a spread of ambitions: ' + ambitions.distinct);
  console.log('ambitions:', JSON.stringify(ambitions));

  // ---- 2) Varied hiring pool with real origins + career history ----
  const pool = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.week = 17; g.staffHiredYear = null; // open the staffing window
    const cands = window.XCD.engine.Coaching.assistantCandidates(g);
    return cands.map((c) => ({
      origin: c.origin || '', seasons: (c.careerRecord || {}).seasons || 0,
      hasRatings: c.recruiting > 0 && c.training > 0 && c.culture > 0,
      age: c.age, ambition: c.ambition || null
    }));
  });
  ok(pool.length === 3, 'the weekly shortlist stays three candidates: ' + pool.length);
  ok(pool.every((c) => c.origin), 'every candidate must carry a background origin: ' + JSON.stringify(pool));
  ok(new Set(pool.map((c) => c.origin)).size >= 2, 'the pool should be varied, not identical: ' + JSON.stringify(pool.map((c) => c.origin)));
  ok(pool.every((c) => c.hasRatings && c.ambition), 'candidates must have full ratings + an ambition');
  console.log('hiring pool:', JSON.stringify(pool));

  // ---- 3) Assistant reputation rewards producing national-caliber athletes ----
  const rep = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const school = g.getPlayerSchool();
    const C = window.XCD.engine.Coaching;
    // A fresh CPU-style assistant to score cleanly (not the player's coach).
    const asst = new window.XCD.models.Coach({
      firstName: 'Test', lastName: 'Coordinator', role: 'Assistant',
      recruiting: 60, training: 60, reputation: 30, schoolId: school.id, age: 40
    });
    const year = g.year - 1;
    const rng = new window.XCD.core.SeededRNG(12345);
    // Control: no honors this season.
    const before = asst.reputation;
    C.updateAssistantReputation(g, asst, school, new window.XCD.core.SeededRNG(1));
    const noHonorGain = asst.reputation - before;

    // With honors: 5 All-Americans + a national champion credited to the school.
    const asst2 = new window.XCD.models.Coach({
      firstName: 'Star', lastName: 'Coordinator', role: 'Assistant',
      recruiting: 60, training: 60, reputation: 30, schoolId: school.id, age: 40
    });
    g.history.seasonStaffHonors = g.history.seasonStaffHonors || {};
    g.history.seasonStaffHonors[year] = { [school.id]: { allAmericans: 5, indivNatChamps: 1 } };
    const before2 = asst2.reputation;
    C.updateAssistantReputation(g, asst2, school, new window.XCD.core.SeededRNG(1));
    const honorGain = asst2.reputation - before2;
    return { noHonorGain: +noHonorGain.toFixed(2), honorGain: +honorGain.toFixed(2) };
  });
  ok(rep.honorGain > rep.noHonorGain + 1, `producing All-Americans/champions must visibly build an assistant's reputation (honors +${rep.honorGain} vs none +${rep.noHonorGain})`);
  console.log('assistant reputation:', JSON.stringify(rep));

  // ---- 4) The player's own assistant can be hired away for a head job ----
  const departure = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const Careers = window.XCD.engine.Careers;
    const school = g.getPlayerSchool();
    const others = Object.values(g.world.schools).filter((s) => s.id !== g.playerSchoolId);
    let departed = null;
    for (let i = 0; i < 60 && !departed; i++) {
      // Make the player's coordinator an obvious, ambitious top candidate.
      let asst = school.assistantId && g.getCoach(school.assistantId);
      if (!asst) break; // already gone
      asst.reputation = 95; asst.recruiting = 90; asst.training = 85;
      asst.age = 42; asst.ambition = 'careerBuilder';
      // Open a genuine mid-major head-coaching vacancy and let the carousel fill it.
      const target = others[i % others.length];
      if (!target || target.prestige > 70) continue;
      target.coachId = null;
      const rng = new window.XCD.core.SeededRNG((1000 + i * 7) >>> 0);
      Careers.fillVacancy(g, target, rng, 0);
      if (g.assistantDeparture && g.assistantDeparture.year === g.year) {
        departed = {
          kind: g.assistantDeparture.kind,
          seatVacant: !(school.assistantId && g.getCoach(school.assistantId)),
          nowHeadElsewhere: Object.values(g.world.schools).some((s) => {
            const c = s.coachId && g.getCoach(s.coachId);
            return c && c.fullName === g.assistantDeparture.coachName && c.role === 'Head';
          })
        };
      }
    }
    return departed;
  });
  ok(!!departure, 'the player\'s assistant must be able to leave for a head-coaching job');
  if (departure) {
    ok(departure.kind === 'head', 'the departure should be recorded as a head-coaching move');
    ok(departure.seatVacant, 'the player\'s coordinator seat must be left OPEN to fill from the pool');
    ok(departure.nowHeadElsewhere, 'the departed assistant should now be a head coach elsewhere');
  }
  console.log('player assistant departure:', JSON.stringify(departure));

  // ---- 5) After a departure, the player can hire a replacement ----
  const rehire = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const C = window.XCD.engine.Coaching;
    const school = g.getPlayerSchool();
    if (school.assistantId && g.getCoach(school.assistantId)) return { skipped: true };
    g.week = 1; g.staffHiredYear = null; g.seasonPhase = 'Offseason';
    if (g.week1) g.week1 = { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: false, setupConfirmed: false };
    const cand = C.assistantCandidates(g)[0];
    const res = C.hireAssistant(g, cand);
    return {
      ok: res.ok, filled: school.assistantId === cand.id,
      departureCleared: g.assistantDeparture === null
    };
  });
  ok(rehire.skipped || (rehire.ok && rehire.filled), 'the player must be able to hire a replacement into the open seat: ' + JSON.stringify(rehire));
  ok(rehire.skipped || rehire.departureCleared, 'hiring should clear the pending departure flag');
  console.log('rehire:', JSON.stringify(rehire));

  // ---- 6) Transfer-portal suitor bands ----
  const bands = await page.evaluate(() => {
    const P = window.XCD.engine.Portal;
    const sample = (q) => {
      const out = [];
      for (let i = 0; i < 200; i++) out.push(P.suitorTarget(q, new window.XCD.core.SeededRNG((i * 131 + 7) >>> 0)));
      return { min: Math.min(...out), max: Math.max(...out), avg: +(out.reduce((a, b) => a + b, 0) / out.length).toFixed(1) };
    };
    return { elite: sample(78), good: sample(63), avg: sample(52), low: sample(44) };
  });
  ok(bands.elite.min >= 10 && bands.elite.max <= 15, 'elite transfers should draw 10-15 suitors: ' + JSON.stringify(bands.elite));
  ok(bands.good.avg >= 5 && bands.good.max <= 10, 'good transfers should draw ~5-10 suitors: ' + JSON.stringify(bands.good));
  ok(bands.avg.max <= 6, 'average transfers should draw at most ~6 suitors: ' + JSON.stringify(bands.avg));
  ok(bands.low.min >= 0 && bands.low.max <= 3, 'lower-rated transfers should draw 0-3 suitors: ' + JSON.stringify(bands.low));
  console.log('suitor bands:', JSON.stringify(bands));

  // ---- 7) Transfer-ranking storylines fire for a hot uncommitted athlete ----
  const storyline = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // Stage a genuinely elite, former-champion athlete as an uncommitted
    // portal entry with a deep field of suitors.
    const star = Object.values(g.world.athletes).find((a) => a.schoolId);
    if (!star) return { staged: false };
    star.currentOverall = 80; star.potential = 80;
    star.honors = { allAmerican: 3, natChamp: 1, confChamp: 1, awards: [] };
    const suitors = Object.values(g.world.schools).filter((s) => s.id !== star.schoolId).slice(0, 9).map((s) => s.id);
    g.portal = { year: g.year, open: true, entries: [{
      athleteId: star.id, fromSchoolId: star.schoolId, reason: 'Championship aspirations',
      offers: suitors, destination: null, decidedWeek: null
    }] };
    // logNews prepends (unshift), so capture from the front until the prior top.
    const topBefore = g.newsLog[0] && g.newsLog[0].id;
    window.XCD.engine.Portal.portalStorylines(g);
    const added = [];
    for (const n of g.newsLog) { if (n.id === topBefore) break; added.push(n.text || n); }
    return { staged: true, added, hit: added.some((t) => /PORTAL WATCH|recruiting war/.test(t)) };
  });
  ok(!storyline.staged || storyline.hit, 'a hot uncommitted transfer should generate a national storyline: ' + JSON.stringify(storyline.added || []));
  console.log('storyline:', JSON.stringify(storyline));

  ok(errors.length === 0, 'no page/console errors: ' + errors.slice(0, 3).join(' | '));

  await browser.close();
  if (fails.length) {
    console.log('\nFAILURES:\n' + fails.map((f) => ' ✗ ' + f).join('\n'));
    console.log('\nFAIL test-update16');
    process.exit(1);
  }
  console.log('\nPASS test-update16');
}

run().catch((e) => { console.error(e); process.exit(1); });
