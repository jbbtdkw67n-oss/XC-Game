/*
 * LegacyEngine — Update 2 (Parts 8, 9, 10).
 *
 * The permanent memory of the game world:
 *  - Program ledgers: every meet win, title, appearance, podium, honor,
 *    coach stint, W/L record, and best finish, forever, per school —
 *    division-aware so DII/DIII histories stay separate when they arrive.
 *  - Athlete honor years: badges (🏅 All-Conference, 🇺🇸 All-American,
 *    🏆 National Champion, 🥇 Conference Champion) with the years earned,
 *    preserved past graduation in the alumni ledger.
 *  - The coach registry: every coach who ever led a program remains
 *    searchable after retirement.
 */
(function () {
  const Legacy = {};

  /* ---------------- Program ledgers (Part 8) ---------------- */
  function blankProgram(school) {
    return {
      schoolId: school ? school.id : null,
      division: (school && school.division) || 'DI',
      wins: 0, losses: 0, meetWins: 0,
      confTitles: 0, regionalTitles: 0, natTitles: 0,
      ncaaAppearances: 0, podiums: 0, bestFinish: null, highestRank: null,
      indivConfChamps: 0, indivNatChamps: 0,
      allAmericans: 0, allConference: 0,
      topClasses: [],  // { year, rank }
      coaches: []      // { coachId, name, startYear, endYear }
    };
  }

  Legacy.program = function (gameState, schoolId) {
    const H = gameState.history;
    H.programs = H.programs || {};
    if (!H.programs[schoolId]) {
      H.programs[schoolId] = blankProgram(gameState.getSchool(schoolId));
    }
    const p = H.programs[schoolId];
    // Old ledgers created before a field existed pick it up here.
    if (p.allConference === undefined) Object.assign(p, { ...blankProgram(gameState.getSchool(schoolId)), ...p });
    return p;
  };

  Legacy.programWinPct = function (prog) {
    const games = (prog.wins || 0) + (prog.losses || 0);
    return games ? Math.round((prog.wins / games) * 1000) / 10 : 0;
  };

  /* ---------------- Athlete honors (Part 10) ---------------- */
  // key: allAmerican | natChamp | confChamp | allConference
  Legacy.athleteHonor = function (gameState, athlete, key) {
    athlete.honorYears = athlete.honorYears ||
      { allAmerican: [], natChamp: [], confChamp: [], allConference: [] };
    if (!athlete.honorYears[key]) athlete.honorYears[key] = [];
    if (!athlete.honorYears[key].includes(gameState.year)) {
      athlete.honorYears[key].push(gameState.year);
    }
  };

  Legacy.badgesFor = function (athlete) {
    const hy = athlete.honorYears || {};
    const defs = [
      ['natChamp', '🏆', 'National Champion'],
      ['allAmerican', '🇺🇸', 'All-American'],
      ['confChamp', '🥇', 'Conference Champion'],
      ['allConference', '🏅', 'All-Conference']
    ];
    const badges = defs
      .filter(([k]) => hy[k] && hy[k].length)
      .map(([k, icon, label]) => ({ key: k, icon, label, years: hy[k].slice().sort() }));
    if (athlete.generational) {
      badges.unshift({ key: 'generational', icon: '⭐', label: 'Generational Recruit', years: [] });
    }
    return badges;
  };

  /*
   * Alumni ledger: graduating athletes with any honors (or a notable
   * career) live on forever with their badges intact.
   */
  Legacy.recordAlumni = function (gameState, athlete) {
    const hy = athlete.honorYears || {};
    // The ledger remembers genuine careers, not every all-conference
    // season: All-Americans, champions, generational talents, repeat
    // all-conference runners, and prolific winners.
    const notable = athlete.generational ||
      (hy.allAmerican && hy.allAmerican.length) ||
      (hy.natChamp && hy.natChamp.length) ||
      (hy.confChamp && hy.confChamp.length) ||
      (hy.allConference && hy.allConference.length >= 2) ||
      (athlete.careerStats && athlete.careerStats.wins >= 5);
    if (!notable) return;
    const school = gameState.getSchool(athlete.schoolId);
    gameState.history.alumni = gameState.history.alumni || [];
    gameState.history.alumni.push({
      name: athlete.fullName,
      gender: athlete.gender,
      school: school ? school.name : '?',
      schoolId: athlete.schoolId,
      division: (school && school.division) || 'DI',
      gradYear: gameState.year,
      generational: !!athlete.generational,
      genProfile: athlete.genProfile || null,
      badges: Legacy.badgesFor(athlete),
      stats: {
        races: athlete.careerStats.races,
        wins: athlete.careerStats.wins,
        top5: athlete.careerStats.top5,
        prs: athlete.careerStats.personalBests
      }
    });
    // The ledger is permanent but bounded: keep the most decorated 600.
    if (gameState.history.alumni.length > 600) {
      gameState.history.alumni.sort((a, b) =>
        (b.badges.length * 10 + b.stats.wins) - (a.badges.length * 10 + a.stats.wins));
      gameState.history.alumni.length = 600;
    }
  };

  /* ---------------- Coach history (Part 9) ---------------- */
  // Close the coach's open stint and note it on the program ledger.
  Legacy.closeStint = function (gameState, coach, school, endYear) {
    coach.stints = coach.stints || [];
    const open = coach.stints.find((s) => !s.endYear);
    if (open) open.endYear = endYear;
    if (school) {
      const prog = Legacy.program(gameState, school.id);
      const entry = prog.coaches.find((c) => c.coachId === coach.id && !c.endYear);
      if (entry) entry.endYear = endYear;
    }
  };

  Legacy.openStint = function (gameState, coach, school, startYear) {
    coach.stints = coach.stints || [];
    coach.stints.push({
      schoolId: school.id, school: school.name,
      division: school.division || 'DI', startYear, endYear: null
    });
    const prog = Legacy.program(gameState, school.id);
    prog.coaches.push({ coachId: coach.id, name: coach.fullName, startYear, endYear: null });
  };

  // Retired (or permanently departed) coaches stay searchable forever.
  Legacy.recordRetiredCoach = function (gameState, coach, reason) {
    gameState.history.coachRegistry = gameState.history.coachRegistry || [];
    gameState.history.coachRegistry.push({
      name: coach.fullName,
      portrait: coach.portrait,
      archetype: coach.archetype,
      tendencies: (coach.tendencies || []).slice(),
      reputation: coach.reputation || 0,
      reputationLabel: (window.XCD.data.reputationLevel(coach.reputation || 0) || {}).label,
      age: coach.age,
      reason, // retired | faded
      year: gameState.year,
      careerRecord: { ...coach.careerRecord },
      winPct: coach.winPct,
      stints: (coach.stints || []).map((s) => ({ ...s, endYear: s.endYear || gameState.year })),
      isPlayer: !!coach.isPlayer
    });
  };

  /* Signing-day hook: remember every program's best classes (Part 8). */
  Legacy.recordClassRank = function (gameState, schoolId, year, rank) {
    if (rank > 25) return;
    const prog = Legacy.program(gameState, schoolId);
    prog.topClasses.push({ year, rank });
    if (prog.topClasses.length > 20) {
      prog.topClasses.sort((a, b) => a.rank - b.rank);
      prog.topClasses.length = 20;
    }
  };

  window.XCD.engine.Legacy = Legacy;
})();
