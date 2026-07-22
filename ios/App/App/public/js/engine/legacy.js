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
      confTitles: 0, regionalTitles: 0, natTitles: 0, natRunnerUp: 0,
      ncaaAppearances: 0, podiums: 0, bestFinish: null, highestRank: null,
      indivConfChamps: 0, indivNatChamps: 0, indivRegChamps: 0,
      allAmericans: 0, allConference: 0,
      // Season ledgers (Update 12): stamped once a year at awards week.
      seasonsPlayed: 0, top25Finishes: 0, ncaaStreak: 0, ncaaStreakBest: 0,
      // Program Statistics ledgers (History & Legacy update, Phase 7).
      top5Finishes: 0, top10Finishes: 0, confRunnerUp: 0,
      indivNcaaQualifiers: 0, natCoyAwards: 0, confCoyAwards: 0,
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
    if (p.natCoyAwards === undefined) Object.assign(p, { ...blankProgram(gameState.getSchool(schoolId)), ...p });
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
    natChampTeam: 0, natChampIndiv: 1, natRunnerUp: 2, runnerOfYear: 3,
    allAmerican: 4, freshmanOfYear: 5, regChamp: 6, confChamp: 7,
    confRunnerOfYear: 8, confFreshmanOfYear: 9,
    allConference: 10, academicAllAmerican: 11
  };

  Legacy.recordAccolade = function (athlete, acc) {
    if (!athlete) return;
    athlete.accolades = athlete.accolades || [];
    const conf = acc.conference || null;
    const dup = athlete.accolades.some((x) =>
      x.year === acc.year && x.type === acc.type &&
      (x.division || null) === (acc.division || null) &&
      (x.conference || null) === conf);
    // Every honor is stamped with the program it was earned AT (History &
    // Legacy update, Phase 8), so program pages can show only the
    // accomplishments earned while representing that school.
    if (!dup) {
      athlete.accolades.push({
        ...acc, conference: conf,
        schoolId: acc.schoolId !== undefined ? acc.schoolId : (athlete.schoolId || null)
      });
    }
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
      ['natRunnerUp', '🥈', 'National Runner-Up'],
      ['allAmerican', '🇺🇸', 'All-American'],
      ['regChamp', '🗺', 'Regional Champion'],
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
      athleteId: athlete.id,
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
    // Stamp the GOAT-formula legacy score at graduation (Update 12) — it
    // both ranks the all-time lists and decides who history keeps.
    const rec = gameState.history.alumni[gameState.history.alumni.length - 1];
    const GOAT = window.XCD.engine.GOAT;
    rec.legacyScore = GOAT ? GOAT.athleteScore({
      accolades: rec.accolades,
      stats: rec.stats,
      seasons: rec.overallHistory.length || 4
    }) : 0;
    // The ledger is permanent and unbounded (History & Legacy update):
    // every recorded career stays forever — nothing is ever trimmed away.
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
  // `reason` (Coach Timeline fix) stamps WHY the tenure ended — retired,
  // fired, left for another job, released — and the prestige the program
  // stood at when they walked out the door. Both are permanent.
  Legacy.closeStint = function (gameState, coach, school, endYear, reason) {
    coach.stints = coach.stints || [];
    const open = coach.stints.find((s) => !s.endYear);
    if (open) {
      open.endYear = endYear;
      if (reason && !open.reason) open.reason = reason;
      if (school && open.prestigeEnd === undefined) open.prestigeEnd = school.prestige;
    }
    if (school) {
      const prog = Legacy.program(gameState, school.id);
      const entry = prog.coaches.find((c) => c.coachId === coach.id && !c.endYear);
      if (entry) {
        entry.endYear = endYear;
        if (reason && !entry.reason) entry.reason = reason;
        if (entry.prestigeEnd === undefined) entry.prestigeEnd = school.prestige;
      }
    }
  };

  Legacy.openStint = function (gameState, coach, school, startYear) {
    coach.stints = coach.stints || [];
    const role = coach.role || 'Head';
    coach.stints.push({
      schoolId: school.id, school: school.name,
      division: school.division || 'DI', startYear, endYear: null, role,
      prestigeStart: school.prestige
    });
    // Only head coaches appear on the program's head-coaching ledger; an
    // assistant's stint lives on their own timeline (Update 5).
    if (role === 'Head') {
      const prog = Legacy.program(gameState, school.id);
      prog.coaches.push({ coachId: coach.id, name: coach.fullName, startYear, endYear: null, prestigeStart: school.prestige });
    }
  };

  /*
   * Seed every program's head-coaching ledger with its CURRENT head coach
   * (Profiles & Records fix). Worldgen gives each CPU coach a stint but never
   * an entry on the program ledger, so before this ran a CPU program had an
   * empty coaching history: its coach couldn't hold or break program records,
   * their departure was never stamped, and their profile came up blank from
   * the champions page. Seeding the ledger from each coach's own open stint
   * makes CPU coaches first-class — they accumulate records at their school,
   * show up on the program tab, and hand the record on when the next coach
   * breaks it. Idempotent, so it also backfills existing saves on load.
   */
  Legacy.seedInitialCoaches = function (gameState) {
    Object.values(gameState.world.schools).forEach((school) => {
      const coach = gameState.getCoach(school.coachId);
      if (!coach) return;
      const prog = Legacy.program(gameState, school.id);
      prog.coaches = prog.coaches || [];
      if (prog.coaches.some((c) => c.coachId === coach.id)) return;
      // Match the coach's own seeded open stint so the program ledger and the
      // coach's personal timeline agree on when the tenure began.
      const stint = (coach.stints || []).find((s) => !s.endYear && s.schoolId === school.id && (s.role || 'Head') === 'Head');
      const startYear = stint ? stint.startYear : (gameState.year || 2026);
      prog.coaches.push({
        coachId: coach.id, name: coach.fullName,
        startYear, endYear: null, prestigeStart: school.prestige
      });
    });
  };

  /*
   * Who coached this program in a given year (Championship History fix):
   * resolved from the permanent head-coaching ledger, so every historical
   * championship entry can name the coach responsible — even in saves from
   * before coach names were stamped onto the championship records.
   */
  Legacy.coachForSchoolYear = function (gameState, schoolId, year) {
    if (!schoolId) return '';
    const prog = (gameState.history.programs || {})[schoolId];
    if (!prog || !prog.coaches) return '';
    const y = Number(year);
    const hit = prog.coaches.slice().reverse().find((c) =>
      y >= c.startYear && y <= (c.endYear || gameState.year));
    return hit ? hit.name : '';
  };

  /*
   * Why (and in what shape) a head-coaching tenure ended, for the Coach
   * Timeline. Uses the stamped reason when present, then falls back to the
   * registry (retired/released careers) and the coach's own later stints
   * (left for another program), so old saves still read correctly.
   */
  Legacy.departureInfo = function (gameState, entry, schoolId) {
    if (!entry.endYear) return { label: 'Current head coach', current: true };
    if (entry.reason) {
      const map = {
        fired: 'Fired', retired: 'Retired', released: 'Let go',
        left: 'Left for another program', promoted: 'Promoted away', faded: 'Left the profession'
      };
      return { label: map[entry.reason] || entry.reason };
    }
    // Registry: a career that ended entirely.
    const reg = (gameState.history.coachRegistry || []).slice().reverse().find((r) =>
      (entry.coachId && r.coachId === entry.coachId) || r.name === entry.name);
    if (reg && Math.abs((reg.year || 0) - entry.endYear) <= 1) {
      return { label: reg.reason === 'retired' ? 'Retired' : reg.reason === 'faded' ? 'Left the profession' : 'Let go' };
    }
    // A later stint elsewhere: they left for another job.
    const live = entry.coachId && gameState.getCoach && gameState.getCoach(entry.coachId);
    const stints = (live && live.stints) || (reg && reg.stints) || [];
    const next = stints.find((s) => s.startYear >= entry.endYear && s.schoolId !== schoolId);
    if (next) return { label: `Left for ${next.school}` };
    return { label: 'Moved on' };
  };

  // Retired (or permanently departed) coaches stay searchable forever.
  Legacy.recordRetiredCoach = function (gameState, coach, reason) {
    gameState.history.coachRegistry = gameState.history.coachRegistry || [];
    gameState.history.coachRegistry.push({
      coachId: coach.id || null,
      name: coach.fullName,
      portrait: coach.portrait,
      gender: coach.gender || null,
      appearance: coach.appearance ? { ...coach.appearance } : null,
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

  /* ---------------- Season ledgers (Update 12) ------------------------ *
   * Runs once per year at awards week, when the final polls are in. Stamps
   * every program (and its coach) with the season's permanent footprint:
   * seasons played, final top-25 finishes, and NCAA-appearance streaks —
   * the raw material of the GOAT lists and legacy leaderboards.
   */
  Legacy.recordSeasonLedgers = function (gameState) {
    const season = gameState.season;
    const rankings = gameState.rankings || {};

    // Which programs made a nationals field this year (either gender)?
    const inNationals = new Set();
    Object.values((season && season.championships) || {}).forEach((champ) => {
      ['M', 'W'].forEach((g) => ((champ.fieldIds || {})[g] || []).forEach((id) => inNationals.add(id)));
    });

    // Final-poll top-25 per gender, within each division's own poll.
    const top25 = new Set();
    ['M', 'W'].forEach((g) => {
      (rankings[g] || []).forEach((r) => { if (r.rank <= 25) top25.add(`${r.schoolId}-${g}`); });
    });

    Object.values(gameState.world.schools).forEach((school) => {
      const prog = Legacy.program(gameState, school.id);
      prog.seasonsPlayed = (prog.seasonsPlayed || 0) + 1;

      let t25 = 0;
      ['M', 'W'].forEach((g) => { if (top25.has(`${school.id}-${g}`)) t25 += 1; });
      if (t25) prog.top25Finishes = (prog.top25Finishes || 0) + t25;

      if (inNationals.has(school.id)) {
        prog.ncaaStreak = (prog.ncaaStreak || 0) + 1;
        if (prog.ncaaStreak > (prog.ncaaStreakBest || 0)) prog.ncaaStreakBest = prog.ncaaStreak;
      } else {
        prog.ncaaStreak = 0;
      }

      // The coach's résumé mirrors the program's season footprint.
      const coach = gameState.getCoach(school.coachId);
      if (coach) {
        coach.careerRecord.top25 = (coach.careerRecord.top25 || 0) + t25;
      }
    });
  };

  /* ---------------- Permanent coach registry ------------------------- *
   * History & Legacy update (Phases 3 & 4): every coach exists forever.
   * The registry is never pruned — no career fades, no profile is ever
   * lost, no matter how many decades a dynasty runs. `coachNotable` is
   * kept as a helper for highlighting historically significant careers.
   */
  Legacy.coachNotable = function (rec) {
    const cr = rec.careerRecord || {};
    const games = (cr.wins || 0) + (cr.losses || 0);
    const winPct = games ? (cr.wins / games) * 100 : 0;
    return !!(rec.isPlayer ||
      (cr.nationalTitles || 0) > 0 ||
      (cr.natRunnerUp || 0) > 0 ||
      (cr.natCOY || 0) > 0 ||
      (cr.confCOY || 0) >= 3 ||
      (cr.conferenceTitles || 0) >= 2 ||
      (cr.regionalTitles || 0) >= 2 ||
      (cr.indivNatChamps || 0) > 0 ||
      (cr.allAmericans || 0) >= 8 ||
      (cr.seasons || 0) >= 18 ||
      ((cr.seasons || 0) >= 8 && winPct >= 62));
  };

  // Kept for API compatibility: pruning is permanently disabled — the
  // registry preserves every coach forever.
  Legacy.pruneCoachRegistry = function () { return 0; };

  /* ---------------- Per-school coach record (Phases 3, 6 & 8) --------- *
   * A coach's accomplishments AT a specific school, reconstructed from the
   * permanent history ledgers: dual record and NCAA trips from the stint
   * ledger (tracked going forward), championships matched season by season
   * against the school's title history, and Coach-of-the-Year awards
   * matched to the years of their stints there. Works identically for live
   * coaches and registry records.
   */
  Legacy.coachSchoolRecord = function (gameState, coach, schoolId) {
    const H = gameState.history || {};
    const school = gameState.getSchool ? gameState.getSchool(schoolId) : null;
    const schoolName = school ? school.name : null;
    const out = {
      wins: 0, losses: 0, seasons: 0, natTitles: 0, natRunnerUp: 0,
      confTitles: 0, regTitles: 0, natApps: 0, natCOY: 0, confCOY: 0,
      startYear: null, endYear: null, current: false
    };
    const stints = (coach.stints || []).filter((s) =>
      s.schoolId === schoolId || (schoolName && s.school === schoolName));
    if (!stints.length) return out;
    const nowYear = gameState.year;
    const inStint = (y) => stints.some((s) => y >= s.startYear && y <= (s.endYear || nowYear));

    stints.forEach((s) => {
      out.wins += s.wins || 0;
      out.losses += s.losses || 0;
      out.natApps += s.ncaaApps || 0;
      const end = s.endYear || nowYear;
      out.seasons += Math.max(1, end - s.startYear + (s.endYear ? 1 : 0));
      if (out.startYear === null || s.startYear < out.startYear) out.startYear = s.startYear;
      if (!s.endYear) out.current = true;
      if (s.endYear && (out.endYear === null || s.endYear > out.endYear)) out.endYear = s.endYear;

      // Head-coach stints collect the school's hardware from those years.
      if ((s.role || 'Head') !== 'Head') return;
      const division = s.division || 'DI';
      for (let y = s.startYear; y <= end; y++) {
        const nat = (H.nationalChampions || {})[y] || {};
        ['M', 'W'].forEach((g) => {
          const key = division === 'DI' ? g : `${division}-${g}`;
          if (nat[key] && (nat[key].teamId === schoolId || nat[key].team === s.school)) out.natTitles += 1;
        });
        Object.entries((H.conferenceChampions || {})[y] || {}).forEach(([, name]) => {
          if (name === s.school) out.confTitles += 1;
        });
        Object.entries((H.regionalChampions || {})[y] || {}).forEach(([, name]) => {
          if (name === s.school) out.regTitles += 1;
        });
      }
    });

    (coach.coachAccolades || []).forEach((a) => {
      if (!inStint(a.year)) return;
      if (a.type === 'natCOY') out.natCOY += 1;
      else if (a.type === 'confCOY') out.confCOY += 1;
    });

    const games = out.wins + out.losses;
    out.winPct = games ? Math.round((out.wins / games) * 1000) / 10 : 0;
    return out;
  };

  /* ---------------- Living program history (Phase 11) ----------------- *
   * Every program page carries an automatically generated timeline of its
   * defining moments, reconstructed from the permanent history ledgers so
   * it works for any save and keeps growing forever: championships, coach
   * hires and departures, individual national champions, Hall of Fame
   * inductions, and program milestones stamped as they happen.
   */
  Legacy.recordProgramMilestone = function (gameState, schoolId, text) {
    const prog = Legacy.program(gameState, schoolId);
    prog.milestones = prog.milestones || [];
    if (!prog.milestones.some((m) => m.year === gameState.year && m.text === text)) {
      prog.milestones.push({ year: gameState.year, text });
    }
  };

  Legacy.programMilestones = function (gameState, school) {
    const H = gameState.history || {};
    const sid = school.id;
    const name = school.name;
    const events = []; // { year, icon, text }
    const push = (year, icon, text) => events.push({ year: Number(year), icon, text });

    // Coaching timeline: every hire and departure the program ever made.
    const prog = Legacy.program(gameState, sid);
    (prog.coaches || []).forEach((c) => {
      push(c.startYear, '🧢', `${c.name} became head coach.`);
      if (c.endYear) push(c.endYear, '👋', `${c.name}'s tenure ended after ${Math.max(1, c.endYear - c.startYear)} season${c.endYear - c.startYear === 1 ? '' : 's'}.`);
    });

    // Championships, counted so firsts read as the landmarks they are.
    let natCount = 0;
    Object.keys(H.nationalChampions || {}).sort((a, b) => a - b).forEach((year) => {
      const slate = H.nationalChampions[year];
      Object.keys(slate).forEach((key) => {
        const rec = slate[key];
        const g = key.endsWith('W') ? "women's" : "men's";
        if (rec.teamId === sid || rec.team === name) {
          natCount += 1;
          push(year, '🏆', natCount === 1
            ? `Won the program's first National Championship (${g}).`
            : `Won the ${g} National Championship — title #${natCount}.`);
        }
        if (rec.individualSchoolId === sid || rec.individualSchool === name) {
          push(year, '🥇', `${rec.individual} won the ${g} individual national title.`);
        }
      });
    });

    let confCount = 0;
    Object.keys(H.conferenceChampions || {}).sort((a, b) => a - b).forEach((year) => {
      const slate = H.conferenceChampions[year];
      Object.keys(slate).forEach((key) => {
        if (slate[key] !== name) return;
        confCount += 1;
        const conf = key.slice(0, key.lastIndexOf('-'));
        const g = key.endsWith('-W') ? "women's" : "men's";
        push(year, '🏅', confCount === 1
          ? `Won the program's first conference championship (${conf}, ${g}).`
          : `Won the ${conf} ${g} title — conference championship #${confCount}.`);
      });
    });

    Object.keys(H.regionalChampions || {}).sort((a, b) => a - b).forEach((year) => {
      const slate = H.regionalChampions[year];
      Object.keys(slate).forEach((key) => {
        if (slate[key] !== name) return;
        const g = key.endsWith('-W') ? "women's" : "men's";
        push(year, '🗺', `Won the ${key.slice(0, key.lastIndexOf('-'))} ${g} regional championship.`);
      });
    });

    // Hall of Fame inductions are program moments too.
    (H.hallOfFame || []).forEach((h) => {
      if (h.schoolId !== sid) return;
      push(h.inducted, '🏛', `${h.name} entered the Hall of Fame.`);
    });

    // Milestones stamped as they happened (win thresholds, first NCAA trip…).
    (prog.milestones || []).forEach((m) => push(m.year, '📌', m.text));

    events.sort((a, b) => a.year - b.year);
    return events;
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
