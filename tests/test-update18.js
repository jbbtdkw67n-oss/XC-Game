// Update 18 test: DNF runners in race results, Watch Race re-costing (2 pts /
// $0), and the former-staff rule (a program never re-hires a coach who left).
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await newDynasty(page);

  // ---- 1) Watch Race re-cost: 2 recruiting points, no money ----
  const wr = await page.evaluate(() => window.XCD.data.RECRUIT_ACTIONS.watchRace);
  console.log('watchRace:', JSON.stringify({ points: wr.points, cost: wr.cost, scout: wr.scout }));
  if (wr.points !== 2) errors.push('Watch Race should cost 2 points, got ' + wr.points);
  if (wr.cost !== 0) errors.push('Watch Race should cost $0, got ' + wr.cost);
  if (wr.scout !== 30) errors.push('Watch Race scouting reveal changed (should still be 30): ' + wr.scout);

  // ---- 2) DNF: hot weather produces DNFs; they are excluded from the finish
  //         order, listed separately, and cool weather stays (almost) clean ----
  const dnf = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const R = window.XCD.engine.Races;
    const Rng = window.XCD.core.SeededRNG;
    for (let i = 0; i < 5; i++) g.advanceWeek(); // reach a real invitational
    const meet = Object.values(g.season.meets).find((m) =>
      m.results && m.results.M && m.schoolIds.includes(g.playerSchoolId));
    if (!meet) return { error: 'no player meet found' };

    // Snapshot the mutable athlete state so repeated sims stay independent —
    // DNF effects (injury/fatigue) would otherwise compound run to run.
    const ids = [];
    meet.schoolIds.forEach((sid) => {
      const s = g.getSchool(sid); if (!s) return;
      (s.rosterM || []).forEach((id) => ids.push(id));
    });
    const snap = ids.map((id) => {
      const a = g.world.athletes[id];
      return a ? { id, fatigue: a.fatigue, injury: a.injury, health: a.health } : null;
    }).filter(Boolean);
    const reset = () => snap.forEach((x) => {
      const a = g.world.athletes[x.id];
      a.fatigue = 40; a.injury = null; a.health = 'Healthy';
    });

    const runField = (tempF, seeds) => {
      let dnfTotal = 0, races = 0, structureOk = true, overlap = 0, reasonsSeen = {};
      for (let seed = 1; seed <= seeds; seed++) {
        reset();
        meet.conditions.tempF = tempF;
        const res = R.simulateRace(g, meet, 'M', new Rng(seed * 6151), true);
        if (!res) continue;
        races++;
        if (!Array.isArray(res.dnfs)) { structureOk = false; continue; }
        dnfTotal += res.dnfs.length;
        const finIds = new Set(res.finishers.map((f) => f.athleteId));
        res.dnfs.forEach((d) => {
          if (finIds.has(d.athleteId)) overlap++;      // must NOT be a finisher
          if (d.time !== undefined) structureOk = false; // no finish time
          reasonsSeen[d.reason] = (reasonsSeen[d.reason] || 0) + 1;
        });
      }
      return { dnfTotal, races, structureOk, overlap, reasonsSeen };
    };

    const hot = runField(97, 40);
    const cool = runField(52, 40);
    reset();
    return { field: ids.length, hot, cool, meetName: meet.name };
  });
  console.log('DNF:', JSON.stringify(dnf));
  if (dnf.error) errors.push('DNF setup: ' + dnf.error);
  else {
    if (!dnf.hot.structureOk) errors.push('DNF result structure invalid (hot)');
    if (dnf.hot.overlap > 0) errors.push('DNF runners leaked into finishers: ' + dnf.hot.overlap);
    if (dnf.hot.dnfTotal < 1) errors.push('Extreme heat produced no DNFs across 40 races');
    if (dnf.cool.dnfTotal > dnf.hot.dnfTotal) errors.push('Cool weather DNFs exceeded hot: ' + JSON.stringify(dnf));
  }

  // A DNF must leave a marked race-log entry (place "DNF", no time).
  const dnfLog = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const R = window.XCD.engine.Races;
    const Rng = window.XCD.core.SeededRNG;
    const meet = Object.values(g.season.meets).find((m) =>
      m.results && m.results.M && m.schoolIds.includes(g.playerSchoolId));
    if (!meet) return null;
    // Force a guaranteed DNF: an already-fragile, gassed field in brutal heat.
    meet.conditions.tempF = 100;
    (meet.schoolIds || []).forEach((sid) => (g.getSchool(sid)?.rosterM || []).forEach((id) => {
      const a = g.world.athletes[id];
      if (a) { a.fatigue = 95; a.injury = null; a.health = 'Healthy'; a.mentalToughness = 20; a.injuryResistance = 20; }
    }));
    let found = null;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const res = R.simulateRace(g, meet, 'M', new Rng(seed * 99991), true);
      if (res && res.dnfs.length) {
        const a = g.world.athletes[res.dnfs[0].athleteId];
        const entry = (a.raceLog || []).find((r) => r.dnf);
        found = { has: !!entry, place: entry && entry.p, time: entry && entry.t };
      }
    }
    return found;
  });
  console.log('DNF log entry:', JSON.stringify(dnfLog));
  if (!dnfLog || !dnfLog.has) errors.push('DNF produced no marked race-log entry');
  else if (dnfLog.place !== 'DNF' || dnfLog.time !== null) errors.push('DNF log entry malformed: ' + JSON.stringify(dnfLog));

  // ---- 3) Former-staff rule: a coach who left is never re-hired by that
  //         same program (player staff pool + AI carousel) ----
  const staff = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const Legacy = window.XCD.engine.Legacy;
    const Coaching = window.XCD.engine.Coaching;
    const Careers = window.XCD.engine.Careers;
    const Rng = window.XCD.core.SeededRNG;
    const out = {};

    // (a) Player's own coordinator leaves — must not reappear on the board.
    const school = g.getPlayerSchool();
    const asst = g.world.coaches[school.assistantId];
    out.hadAssistant = !!asst;
    Legacy.closeStint(g, asst, school, g.year, 'left'); // they walk out the door
    asst.schoolId = null;
    school.assistantId = null;
    out.recorded = Legacy.hasLeftSchool(school, asst.id);
    const board = Coaching.assistantCandidates(g).map((c) => c.id);
    out.onBoard = board.includes(asst.id);
    const hire = Coaching.hireAssistant(g, asst);
    out.hireBlocked = !hire.ok;

    // (b) AI: a fired head coach is never re-hired by the school that fired
    //     them. Make them the strongest free agent, then open that chair.
    const target = Object.values(g.world.schools).find((s) =>
      s.id !== g.playerSchoolId && s.coachId && g.world.coaches[s.coachId] &&
      !g.world.coaches[s.coachId].isPlayer);
    const fired = g.world.coaches[target.coachId];
    fired.reputation = 90; // clearly the best free agent available
    Legacy.closeStint(g, fired, target, g.year, 'fired');
    fired.schoolId = null;
    target.coachId = null;
    out.aiRecorded = Legacy.hasLeftSchool(target, fired.id);
    let cameBack = 0;
    for (let seed = 1; seed <= 25; seed++) {
      target.coachId = null;
      fired.schoolId = null;
      Careers.fillVacancy(g, target, new Rng(seed * 7717), 0);
      if (target.coachId === fired.id) cameBack++;
    }
    out.aiCameBack = cameBack;
    return out;
  });
  console.log('former-staff rule:', JSON.stringify(staff));
  if (!staff.hadAssistant) errors.push('No assistant to test departure with');
  if (!staff.recorded) errors.push('Departure not recorded on former-staff ledger');
  if (staff.onBoard) errors.push('Departed assistant reappeared on the hiring board');
  if (!staff.hireBlocked) errors.push('Departed assistant was re-hireable by the player');
  if (!staff.aiRecorded) errors.push('AI departure not recorded on former-staff ledger');
  if (staff.aiCameBack > 0) errors.push('AI school re-hired a coach it let go: ' + staff.aiCameBack + '/25');

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS test-update17');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
