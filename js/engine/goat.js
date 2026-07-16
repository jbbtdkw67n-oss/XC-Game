/*
 * GOATEngine — Update 12 (Living History & Legacy), Phase 1.
 *
 * The all-time rankings of the universe: Greatest Athlete, Greatest Coach,
 * Greatest Program, and Greatest Team. Every list is a weighted legacy
 * score — national championships dramatically outweigh conference hardware,
 * major honors dwarf minor ones — recalculated every offseason at awards
 * week and stored permanently in history.goat (top 40 per list).
 *
 * Greatest Team works differently: only national-championship teams
 * qualify, ranked by how dominant the title run actually was (team rating,
 * performance, margin of victory, team score, strength of field).
 */
(function () {
  const Utils = window.XCD.core.Utils;
  const LIST_SIZE = 40;

  /* ---------------- Athlete legacy score ---------------- */
  // Weighted accolade values. A national title is worth ten conference
  // titles and twenty-five all-conference nods — majors dominate.
  const ATH_WEIGHTS = {
    natChampIndiv: 100,       // individual national championship
    natChampTeam: 45,         // scoring on a title team
    natRunnerUp: 42,          // individual national runner-up
    runnerOfYear: 55,         // NCAA athlete of the year
    allAmerican: 22,
    regChamp: 12,
    confChamp: 10,            // conference individual title
    confRunnerOfYear: 8,      // conference athlete of the year
    freshmanOfYear: 6,
    allConference: 4,
    confFreshmanOfYear: 2,
    academicAllAmerican: 2
  };

  // rec: a normalized athlete record — { accolades, stats:{races,wins,top5},
  // seasons } — built by normalizeAthlete/normalizeAlumni below.
  function athleteScore(rec) {
    let score = 0;
    (rec.accolades || []).forEach((acc) => { score += ATH_WEIGHTS[acc.type] || 0; });
    const s = rec.stats || {};
    score += (s.wins || 0) * 3;                 // career meet wins
    score += (s.top5 || 0) * 0.8;               // career podium consistency
    if (s.races) score += (s.wins / s.races) * 12;  // career winning percentage
    score += Math.min(5, rec.seasons || 0) * 1.5;   // longevity
    return Math.round(score * 10) / 10;
  }

  function normalizeAlumni(al) {
    return {
      kind: 'alumni',
      athleteId: al.athleteId || null,
      name: al.name,
      gender: al.gender,
      school: al.school,
      schoolId: al.schoolId,
      division: al.division || 'DI',
      years: al.gradYear ? `’${String(al.gradYear).slice(2)}` : '',
      gradYear: al.gradYear || null,
      generational: !!al.generational,
      accolades: al.accolades || [],
      stats: al.stats || { races: 0, wins: 0, top5: 0 },
      seasons: (al.overallHistory || []).length || 4,
      record: al
    };
  }

  function normalizeAthlete(gameState, a) {
    const school = gameState.getSchool(a.schoolId);
    return {
      kind: 'active',
      athleteId: a.id,
      name: a.fullName,
      gender: a.gender,
      school: school ? school.name : '?',
      schoolId: a.schoolId,
      division: (school && school.division) || 'DI',
      years: 'active',
      gradYear: null,
      generational: !!a.generational,
      accolades: a.accolades || [],
      stats: a.careerStats || { races: 0, wins: 0, top5: 0 },
      seasons: (a.overallHistory || []).length || 1,
      record: null
    };
  }

  function athletes(gameState) {
    const rows = [];
    (gameState.history.alumni || []).forEach((al) => rows.push(normalizeAlumni(al)));
    Object.values(gameState.world.athletes).forEach((a) => {
      if (a.isRecruit || !a.schoolId) return;
      if (!(a.accolades || []).length && !(a.careerStats || {}).wins) return;
      rows.push(normalizeAthlete(gameState, a));
    });
    rows.forEach((r) => {
      r.score = athleteScore(r);
      const count = (type) => (r.accolades || []).filter((x) => x.type === type).length;
      r.natTitles = count('natChampIndiv');
      r.aoyAwards = count('runnerOfYear');
      r.allAmerican = count('allAmerican');
      r.confChamps = count('confChamp');
      r.regChamps = count('regChamp');
      r.allConference = count('allConference');
      r.natRunnerUp = count('natRunnerUp');
      r.wins = (r.stats || {}).wins || 0;
      r.races = (r.stats || {}).races || 0;
      r.winPct = r.races ? Math.round((r.wins / r.races) * 1000) / 10 : 0;
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  }

  /* ---------------- Coach legacy score ---------------- */
  function coachScore(cr, winPct) {
    return Math.round((
      (cr.nationalTitles || 0) * 100 +      // by far the strongest factor
      (cr.natRunnerUp || 0) * 38 +
      (cr.natCOY || 0) * 28 +
      (cr.confCOY || 0) * 6 +
      (cr.regionalTitles || 0) * 14 +
      (cr.conferenceTitles || 0) * 11 +
      (cr.top25 || 0) * 4 +
      (cr.nationalsAppearances || 0) * 5 +
      (cr.indivNatChamps || 0) * 18 +
      (cr.allAmericans || 0) * 2 +
      (winPct || 0) * 0.5 +
      (cr.wins || 0) * 0.015 +
      Math.min(30, cr.seasons || 0) * 1.2   // longevity
    ) * 10) / 10;
  }

  function coaches(gameState) {
    const rows = [];
    Object.values(gameState.world.coaches).forEach((c) => {
      const cr = c.careerRecord || {};
      const school = c.schoolId && gameState.getSchool(c.schoolId);
      rows.push({
        kind: 'active', coachId: c.id, name: c.fullName, isPlayer: !!c.isPlayer,
        school: school ? school.name : 'Free agent', schoolId: school ? school.id : null,
        years: 'active', cr, winPct: c.winPct || 0, record: null
      });
    });
    (gameState.history.coachRegistry || []).forEach((rec) => {
      rows.push({
        kind: 'retired', coachId: null, name: rec.name, isPlayer: !!rec.isPlayer,
        school: (rec.stints && rec.stints.length) ? rec.stints[rec.stints.length - 1].school : '—',
        schoolId: null,
        years: `ret. ${rec.year}`, cr: rec.careerRecord || {}, winPct: rec.winPct || 0,
        record: rec
      });
    });
    rows.forEach((r) => {
      r.score = coachScore(r.cr, r.winPct);
      r.natTitles = r.cr.nationalTitles || 0;
      r.natRunnerUp = r.cr.natRunnerUp || 0;
      r.coy = (r.cr.natCOY || 0) + (r.cr.confCOY || 0);
      r.confTitles = r.cr.conferenceTitles || 0;
      r.regTitles = r.cr.regionalTitles || 0;
      r.top25 = r.cr.top25 || 0;
      r.natApps = r.cr.nationalsAppearances || 0;
      r.wins = r.cr.wins || 0;
      r.seasons = r.cr.seasons || 0;
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  }

  /* ---------------- Program legacy score ---------------- */
  function programScore(prog, school) {
    const winPct = window.XCD.engine.Legacy.programWinPct(prog);
    return Math.round((
      (prog.natTitles || 0) * 100 +
      (prog.natRunnerUp || 0) * 40 +
      (prog.podiums || 0) * 10 +
      (prog.top25Finishes || 0) * 4 +
      (prog.confTitles || 0) * 9 +
      (prog.regionalTitles || 0) * 13 +
      (prog.ncaaAppearances || 0) * 4 +
      (prog.ncaaStreakBest || 0) * 3 +
      (prog.indivNatChamps || 0) * 14 +
      (prog.allAmericans || 0) * 1.5 +
      winPct * 0.6 +
      (prog.wins || 0) * 0.01 +
      Math.min(50, prog.seasonsPlayed || 0) * 0.8 +
      ((school && school.heritage) || 0) * 0.4
    ) * 10) / 10;
  }

  function programs(gameState) {
    const H = gameState.history;
    const rows = Object.keys(H.programs || {}).map((sid) => {
      const prog = H.programs[sid];
      const school = gameState.getSchool(sid);
      if (!school) return null;
      return {
        schoolId: sid,
        name: school.name,
        conference: school.conference,
        division: school.division || 'DI',
        prestige: school.prestige,
        natTitles: prog.natTitles || 0,
        natRunnerUp: prog.natRunnerUp || 0,
        confTitles: prog.confTitles || 0,
        regTitles: prog.regionalTitles || 0,
        top25: prog.top25Finishes || 0,
        natApps: prog.ncaaAppearances || 0,
        streak: prog.ncaaStreakBest || 0,
        winPct: window.XCD.engine.Legacy.programWinPct(prog),
        wins: prog.wins || 0,
        seasons: prog.seasonsPlayed || 0,
        score: programScore(prog, school)
      };
    }).filter(Boolean);
    rows.sort((a, b) => b.score - a.score);
    return rows;
  }

  /* ---------------- Greatest Team ---------------- */
  // Only national champions qualify. Among champions, dominance decides:
  // roster quality, how the five actually raced, margin of victory, raw
  // team score, and the strength of the field they beat.
  function teamScore(t) {
    return Math.round((
      (t.teamOverall || 0) * 1.6 +
      (t.teamPerformance || 0) * 1.2 +
      Utils.clamp(t.margin || 0, 0, 150) * 0.9 +
      Utils.clamp(160 - (t.teamScore || 160), 0, 140) * 0.5 +
      (t.sos || 50) * 0.6
    ) * 10) / 10;
  }

  function teams(gameState) {
    const rows = (gameState.history.championTeams || []).map((t) => ({
      ...t,
      label: `${t.year} ${t.school} (${t.gender})`,
      score: teamScore(t)
    }));
    rows.sort((a, b) => b.score - a.score);
    return rows;
  }

  /* ---------------- The offseason snapshot ---------------- */
  // Recalculated at awards week every season and stored permanently, so the
  // GOAT conversation always reflects the full sweep of history.
  function recalculate(gameState) {
    gameState.history.goat = {
      year: gameState.year,
      athletes: athletes(gameState).slice(0, LIST_SIZE),
      coaches: coaches(gameState).slice(0, LIST_SIZE),
      programs: programs(gameState).slice(0, LIST_SIZE),
      teams: teams(gameState).slice(0, LIST_SIZE)
    };
    return gameState.history.goat;
  }

  // Stored snapshot when available; live recompute otherwise (old saves,
  // or a dynasty that hasn't finished its first season yet).
  function get(gameState) {
    return gameState.history.goat || recalculate(gameState);
  }

  window.XCD.engine.GOAT = {
    athleteScore, coachScore, programScore, teamScore,
    athletes, coaches, programs, teams,
    recalculate, get, LIST_SIZE
  };
})();
