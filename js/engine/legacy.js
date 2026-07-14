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

  /* ---------------- Rich accolade ledger (Update 4, Part 1) ----------- *
   * Every honor an athlete earns is recorded here with full context —
   * division, conference (when applicable), and year — and nothing is ever
   * overwritten. Honors from different divisions/conferences (via transfers
   * or realignment) all coexist, forming a complete career record.
   */
  const DIV_SHORT = () => window.XCD.data.DIVISION_SHORT || { DI: 'D1', DII: 'D2', DIII: 'D3' };

  // Human-readable one-line label, e.g. "2029 SEC First Team All-Conference"
  // or "2030 D3 Team National Champion".
  Legacy.accoladeLabel = function (acc) {
    const div = (DIV_SHORT())[acc.division] || acc.division || '';
    const parts = [acc.year];
    if (acc.conference) parts.push(acc.conference);
    else if (div) parts.push(div);
    parts.push(acc.label);
    return parts.filter(Boolean).join(' ');
  };

  // Sort key so profiles read chronologically then by prestige of the honor.
  const ACC_ORDER = {
    natChampTeam: 0, natChampIndiv: 1, runnerOfYear: 2, allAmerican: 3,
    freshmanOfYear: 4, confChamp: 5, confRunnerOfYear: 6, confFreshmanOfYear: 7,
    allConference: 8, academicAllAmerican: 9
  };

  Legacy.recordAccolade = function (athlete, acc) {
    if (!athlete) return;
    athlete.accolades = athlete.accolades || [];
    const conf = acc.conference || null;
    const dup = athlete.accolades.some((x) =>
      x.year === acc.year && x.type === acc.type &&
      (x.division || null) === (acc.division || null) &&
      (x.conference || null) === conf);
    if (!dup) athlete.accolades.push({ ...acc, conference: conf });
  };

  // Ordered accolade list for display (newest year first, best honor first).
  Legacy.accoladesFor = function (athlete) {
    const list = (athlete && athlete.accolades) ? athlete.accolades.slice() : [];
    list.sort((a, b) => (b.year - a.year) ||
      ((ACC_ORDER[a.type] ?? 99) - (ACC_ORDER[b.type] ?? 99)));
    return list;
  };

  // One-time backfill for pre-Update-4 saves: reconstruct accolades from the
  // year-stamped honor ledger (division/conference context is unknown for old
  // honors, so they carry the athlete's current program context as a best
  // effort — new honors are always fully stamped).
  Legacy.backfillAccolades = function (athlete) {
    const hy = athlete.honorYears || {};
    const defs = [
      ['natChamp', 'natChampIndiv', 'Individual National Champion'],
      ['allAmerican', 'allAmerican', 'All-American'],
      ['confChamp', 'confChamp', 'Conference Champion'],
      ['allConference', 'allConference', 'All-Conference']
    ];
    athlete.accolades = athlete.accolades || [];
    if (athlete.accolades.length) return;
    defs.forEach(([hkey, type, label]) => {
      (hy[hkey] || []).forEach((year) => {
        athlete.accolades.push({ year, division: null, conference: null, type, label });
      });
    });
  };

  Legacy.badgesFor = function (athlete) {
    const hy = athlete.honorYears || {};
    const defs = [
      ['natChamp', '🏆', 'National Champion'],
      ['allAmerican', '🇺🇸', 'All-American'],
      ['confChamp', '🥇', 'Conference Champion'],
      ['allConference', '🏅', 'All-Conference'],
      // Nike Cross Nationals prep honors (Update 5, Part 9) — permanent, and
      // carried into college when the recruit enrolls.
      ['nxnChampion', '👟', 'NXN Champion'],
      ['nxnAllAmerican', '🎽', 'NXN All-American'],
      // High-school state titles (Section 16) — permanent prep history.
      ['hsStateChamp', '🏵', 'HS State Champion']
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
      // The full career accolade ledger travels into the alumni record, so a
      // graduated athlete's profile still shows every division/conference honor.
      accolades: (athlete.accolades || []).slice(),
      overallHistory: (athlete.overallHistory || []).slice(),
      classYear: athlete.classYear,
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

  /* ---------------- Coach accolades (Update 4, Part 6) ---------------- */
  // National/conference Coach-of-the-Year and other coach honors, stamped
  // with division/conference/year and never overwritten.
  Legacy.recordCoachAccolade = function (coach, acc) {
    if (!coach) return;
    coach.coachAccolades = coach.coachAccolades || [];
    const conf = acc.conference || null;
    const dup = coach.coachAccolades.some((x) =>
      x.year === acc.year && x.type === acc.type &&
      (x.division || null) === (acc.division || null) &&
      (x.conference || null) === conf);
    if (!dup) coach.coachAccolades.push({ ...acc, conference: conf });
  };

  Legacy.coachAccoladesFor = function (coach) {
    const list = (coach && coach.coachAccolades) ? coach.coachAccolades.slice() : [];
    list.sort((a, b) => (b.year - a.year));
    return list;
  };

  /* ---------------- Coaching tree (Update 6, Section 1) --------------- */
  /*
   * Record the working relationship between a school's head coach and its
   * assistant. Idempotent — safe to call every offseason for every school.
   * The first head who employs an assistant becomes their mentor forever;
   * every later boss is appended to the workedFor timeline.
   */
  Legacy.linkStaff = function (gameState, school, year) {
    const head = school.coachId && gameState.world.coaches[school.coachId];
    const asst = school.assistantId && gameState.world.coaches[school.assistantId];
    if (!head || !asst || head.id === asst.id) return;
    if (!asst.mentorName) { asst.mentorName = head.fullName; asst.mentorId = head.id; }
    asst.workedFor = asst.workedFor || [];
    const last = asst.workedFor[asst.workedFor.length - 1];
    if (!last || last.name !== head.fullName) {
      asst.workedFor.push({ name: head.fullName, school: school.name, year: year || null });
    }
  };

  /*
   * An assistant just became a head coach: their most recent boss earns a
   * branch on the coaching tree — even if that boss has already retired
   * (the registry record keeps growing; history never stops being written).
   */
  Legacy.creditPromotion = function (gameState, promo, school, year) {
    const served = (promo.workedFor || []);
    const boss = served[served.length - 1];
    if (!boss) return;
    const entry = { name: promo.fullName, coachId: promo.id, year, school: school.name };
    const live = Object.values(gameState.world.coaches)
      .find((c) => c.fullName === boss.name && c.id !== promo.id);
    const tree = (owner) => {
      owner.coachingTree = owner.coachingTree || [];
      if (!owner.coachingTree.some((t) => t.coachId === promo.id && t.school === school.name)) {
        owner.coachingTree.push(entry);
      }
    };
    if (live) { tree(live); return; }
    const reg = (gameState.history.coachRegistry || []).slice().reverse()
      .find((r) => r.name === boss.name);
    if (reg) tree(reg);
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
    const role = coach.role || 'Head';
    coach.stints.push({
      schoolId: school.id, school: school.name,
      division: school.division || 'DI', startYear, endYear: null, role
    });
    // Only head coaches appear on the program's head-coaching ledger; an
    // assistant's stint lives on their own timeline (Update 5).
    if (role === 'Head') {
      const prog = Legacy.program(gameState, school.id);
      prog.coaches.push({ coachId: coach.id, name: coach.fullName, startYear, endYear: null });
    }
  };

  // Retired (or permanently departed) coaches stay searchable forever.
  Legacy.recordRetiredCoach = function (gameState, coach, reason) {
    gameState.history.coachRegistry = gameState.history.coachRegistry || [];
    gameState.history.coachRegistry.push({
      name: coach.fullName,
      portrait: coach.portrait,
      archetype: coach.archetype,
      hometown: coach.hometown || '',
      almaMater: coach.almaMater || '',
      tendencies: (coach.tendencies || []).slice(),
      reputation: coach.reputation || 0,
      reputationLabel: (window.XCD.data.reputationLevel(coach.reputation || 0) || {}).label,
      age: coach.age,
      reason, // retired | faded
      year: gameState.year,
      careerRecord: { ...coach.careerRecord },
      winPct: coach.winPct,
      stints: (coach.stints || []).map((s) => ({ ...s, endYear: s.endYear || gameState.year })),
      trainingPhilosophy: coach.trainingPhilosophy || 'balanced',
      racePhilosophy: coach.racePhilosophy || 'even',
      coachAccolades: (coach.coachAccolades || []).slice(),
      // The coaching tree survives retirement — and keeps growing when a
      // former assistant later earns their own program.
      mentorName: coach.mentorName || '',
      workedFor: (coach.workedFor || []).slice(),
      coachingTree: (coach.coachingTree || []).map((t) => ({ ...t })),
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
