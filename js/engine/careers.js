/*
 * CareersEngine — Update 2 (Part 11): the coaching carousel, rebuilt.
 *
 * Schools only hire when their coach retires (randomly, at 75+), is
 * fired, or leaves for another job. Every offseason, vacancies are filled
 * from a real market: sitting coaches at smaller programs get poached
 * (creating chained vacancies), fired coaches wait in a free-agent pool
 * for a call, and unknown assistants get their first break. Coach
 * reputation — not just school prestige — decides who gets which job.
 *
 * The player fields offers from schools with actual openings: lateral
 * moves, step-downs after rough stretches, big steps up after
 * overachieving, and the occasional dream job.
 */
(function () {
  const Utils = window.XCD.core.Utils;

  const CAL = window.XCD.data.CALENDAR;
  const OFFER_EXPIRY_WEEK = CAL.WEEKS_PER_YEAR - 1;

  /* ---------------- Player job offers ---------------- */
  function bestPlayerRank(gameState) {
    const r = gameState.rankings;
    if (!r) return 999;
    const m = r.M.find((x) => x.schoolId === gameState.playerSchoolId);
    const w = r.W.find((x) => x.schoolId === gameState.playerSchoolId);
    return Math.min(m ? m.rank : 999, w ? w.rank : 999);
  }

  /*
   * Called right after awards + firings (awards week). Offers come only
   * from programs with genuine vacancies; your reputation is the résumé.
   */
  function generateOffers(gameState, rng) {
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    const rep = coach.reputation || 25;
    const rank = bestPlayerRank(gameState);
    const total = window.XCD.engine.Coaching.divisionSize(gameState, school.division);

    // Vacant chairs (fired this week, or already open).
    const vacancies = Object.values(gameState.world.schools).filter((s) =>
      s.id !== gameState.playerSchoolId && (!s.coachId || !gameState.world.coaches[s.coachId]));
    if (!vacancies.length) { gameState.jobOffers = null; return; }

    // Interest: your reputation must fit the chair. Big programs want
    // proven names; small programs will bet on a riser. A legendary coach
    // fields calls from everywhere.
    const expectedRank = Math.round((1 - school.prestige / 100) * total);
    const overachievement = expectedRank - rank;
    const candidates = vacancies.filter((s) => {
      const fit = rep - (s.prestige * 0.75 - 12); // rep needed scales with the job
      if (fit < 0 && !(overachievement > 60 && rng.bool(0.4))) return false;
      // Lateral and downward offers only make sense with some pull factor.
      if (s.prestige < school.prestige - 20 && rep > s.prestige) return rng.bool(0.35);
      return true;
    });
    if (!candidates.length) { gameState.jobOffers = null; return; }

    // Not every fit calls: reputation drives volume of interest.
    const interested = candidates.filter(() => rng.bool(Utils.clamp(0.25 + rep / 160, 0.2, 0.8)));
    if (!interested.length) { gameState.jobOffers = null; return; }

    const offers = rng.shuffle(interested).slice(0, 3).map((s) => ({
      schoolId: s.id,
      schoolName: s.name,
      prestige: s.prestige,
      conference: s.conference,
      division: s.division || 'DI',
      kind: s.prestige >= 85 && s.conferenceTier === 1 ? 'Dream job'
        : s.prestige >= school.prestige + 10 ? 'Step up'
        : s.prestige >= school.prestige - 8 ? 'Lateral move'
        : 'Step down'
    })).sort((a, b) => b.prestige - a.prestige);

    gameState.jobOffers = { year: gameState.year, expiresWeek: OFFER_EXPIRY_WEEK, offers };
    gameState.logNews(`📞 Your phone is ringing: ${offers.length === 1 ? offers[0].schoolName + ' wants' : offers.length + ' programs want'} to talk about their head coaching job.`);
  }

  function acceptOffer(gameState, schoolId) {
    const offers = gameState.jobOffers;
    if (!offers || !offers.offers.some((o) => o.schoolId === schoolId)) {
      return { ok: false, message: 'That offer is no longer on the table.' };
    }
    const Legacy = window.XCD.engine.Legacy;
    const oldSchool = gameState.getPlayerSchool();
    const newSchool = gameState.getSchool(schoolId);
    const coach = gameState.getPlayerCoach();
    const rng = new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 31 + schoolId.length) >>> 0);

    // Your departure opens a real vacancy behind you.
    Legacy.closeStint(gameState, coach, oldSchool, gameState.year);
    oldSchool.coachId = null;
    oldSchool.coachChangedYear = gameState.year;
    fillVacancy(gameState, oldSchool, rng, 0);

    // If the new chair somehow still has a sitting coach, they hit the market.
    const incumbent = newSchool.coachId && gameState.world.coaches[newSchool.coachId];
    if (incumbent) {
      Legacy.closeStint(gameState, incumbent, newSchool, gameState.year);
      incumbent.schoolId = null;
      incumbent.hotSeat = 0;
    }
    newSchool.coachId = coach.id;
    coach.schoolId = newSchool.id;
    coach.yearsAtSchool = 0;
    gameState.playerSchoolId = newSchool.id;
    Legacy.openStint(gameState, coach, newSchool, gameState.year + 1);
    newSchool.coachChangedYear = gameState.year;

    // Session state tied to the old program resets.
    gameState.training.overrides = {};
    gameState.training.mileageOverrides = {};
    gameState.culture.captains = { M: [], W: [] };
    gameState.recruiting.budgetLeft = Math.round(newSchool.budget.recruiting * 0.5); // mid-cycle move
    gameState.lastPlayerMeetId = null;
    gameState.jobOffers = null;

    gameState.career.stops = gameState.career.stops || [];
    gameState.career.stops.push({ school: newSchool.name, startYear: gameState.year + 1 });

    gameState.logNews(`🚨 COACHING MOVE: You leave ${oldSchool.name} for ${newSchool.name} (${newSchool.conference}). The rebuild begins.`);
    return { ok: true, message: `Welcome to ${newSchool.name}!` };
  }

  function declineOffers(gameState) {
    if (!gameState.jobOffers) return;
    gameState.logNews(`You turn down outside interest and recommit to ${gameState.getPlayerSchool().name}.`);
    gameState.jobOffers = null;
  }

  function expireOffers(gameState) {
    if (gameState.jobOffers &&
        (gameState.week > gameState.jobOffers.expiresWeek || gameState.year !== gameState.jobOffers.year)) {
      gameState.jobOffers = null;
    }
  }

  /* ---------------- The market ---------------- */
  function freeAgents(gameState) {
    return Object.values(gameState.world.coaches)
      .filter((c) => !c.isPlayer && !c.schoolId && c.role === 'Head');
  }

  /*
   * Fill one vacancy from the market. Chains are real: hiring a sitting
   * coach opens their old chair (depth-limited so the carousel settles).
   */
  function fillVacancy(gameState, school, rng, depth) {
    const Legacy = window.XCD.engine.Legacy;
    const rankIndex = {};
    if (gameState.rankings) {
      gameState.rankings.M.forEach((r) => { rankIndex[r.schoolId] = Math.min(rankIndex[r.schoolId] || 999, r.rank); });
      gameState.rankings.W.forEach((r) => { rankIndex[r.schoolId] = Math.min(rankIndex[r.schoolId] || 999, r.rank); });
    }

    // 1) Poach a sitting coach whose reputation outgrew their program —
    //    the natural ladder: DIII champion → DII → low-major → power
    //    conference → blue blood (division-agnostic by design).
    if (depth < 2 && school.prestige >= 45 && rng.bool(0.6)) {
      const targets = Object.values(gameState.world.schools)
        .filter((s) => {
          if (s.id === school.id || s.id === gameState.playerSchoolId) return false;
          if (s.prestige > school.prestige - 10) return false;
          const c = s.coachId && gameState.world.coaches[s.coachId];
          if (!c || c.isPlayer) return false;
          return (c.reputation || 0) >= school.prestige * 0.65 - 5 || (rankIndex[s.id] || 999) <= 35;
        })
        .sort((a, b) => (gameState.world.coaches[b.coachId].reputation || 0) - (gameState.world.coaches[a.coachId].reputation || 0));
      if (targets.length) {
        const from = targets[rng.int(0, Math.min(2, targets.length - 1))];
        const c = gameState.world.coaches[from.coachId];
        Legacy.closeStint(gameState, c, from, gameState.year);
        from.coachId = null;
        from.coachChangedYear = gameState.year;
        school.coachId = c.id;
        c.schoolId = school.id;
        c.yearsAtSchool = 0;
        c.hotSeat = 0;
        Legacy.openStint(gameState, c, school, gameState.year);
        school.coachChangedYear = gameState.year;
        gameState.logNews(`POACHED: ${school.name} hires ${c.fullName} away from ${from.name} (${(c.reputationLevel || {}).label || 'rising name'}).`);
        fillVacancy(gameState, from, rng, depth + 1);
        return c;
      }
    }

    // 2) The free-agent pool: fired coaches wait for the phone to ring.
    const pool = freeAgents(gameState)
      .filter((c) => (c.reputation || 0) >= school.prestige * 0.45 - 10)
      .sort((a, b) => (b.reputation || 0) - (a.reputation || 0));
    if (pool.length && rng.bool(0.7)) {
      const c = pool[rng.int(0, Math.min(1, pool.length - 1))];
      school.coachId = c.id;
      c.schoolId = school.id;
      c.yearsAtSchool = 0;
      c.hotSeat = 0;
      Legacy.openStint(gameState, c, school, gameState.year);
      school.coachChangedYear = gameState.year;
      gameState.logNews(`SECOND ACT: ${school.name} gives ${c.fullName} another shot at a head job.`);
      return c;
    }

    // 3) Promote an unknown assistant — everyone's career starts somewhere.
    const replacement = window.XCD.engine.WorldGenerator.buildReplacementCoach(rng, school);
    replacement.age = Math.min(replacement.age, 48);
    replacement.reputation = Utils.clamp(replacement.reputation || 15, 3, 30); // an unknown, by definition
    replacement.stints = [];
    gameState.world.coaches[replacement.id] = replacement;
    school.coachId = replacement.id;
    replacement.schoolId = school.id;
    Legacy.openStint(gameState, replacement, school, gameState.year);
    school.coachChangedYear = gameState.year;
    gameState.logNews(`${school.name} promotes ${replacement.fullName} to head coach — a first big break.`);
    return replacement;
  }

  /*
   * The offseason carousel, run at the year rollover (after coach aging).
   *  - Retirements: random, always 75+.
   *  - Vacancies (from firings + retirements + moves) get filled.
   *  - Free agents nobody calls eventually retire quietly.
   */
  function runCarousel(gameState, rng) {
    const Legacy = window.XCD.engine.Legacy;

    // Retirements
    Object.values(gameState.world.schools).forEach((school) => {
      const coach = school.coachId && gameState.world.coaches[school.coachId];
      if (!coach || coach.isPlayer) return;
      if (coach.age >= coach.retireAge) {
        Legacy.closeStint(gameState, coach, school, gameState.year);
        Legacy.recordRetiredCoach(gameState, coach, 'retired');
        delete gameState.world.coaches[coach.id];
        school.coachId = null;
        school.coachChangedYear = gameState.year;
        gameState.logNews(`RETIREMENT: ${coach.fullName} steps away at ${coach.age} after ${coach.careerRecord.seasons || 'many'} seasons (${coach.careerRecord.nationalTitles} national titles).`);
      }
    });

    // Fill every open chair, biggest jobs first (so the ladder cascades).
    Object.values(gameState.world.schools)
      .filter((s) => !s.coachId || !gameState.world.coaches[s.coachId])
      .sort((a, b) => b.prestige - a.prestige)
      .forEach((school) => { fillVacancy(gameState, school, rng, 0); });

    // The pool thins: no calls for years, or simply time to go.
    freeAgents(gameState).forEach((c) => {
      c.poolYears = (c.poolYears || 0) + 1;
      if (c.age >= c.retireAge || c.poolYears >= 3) {
        Legacy.recordRetiredCoach(gameState, c, c.age >= c.retireAge ? 'retired' : 'faded');
        delete gameState.world.coaches[c.id];
      }
    });
  }

  /* ---------------- Coach rankings ---------------- */
  function coachRankings(gameState) {
    const ranks = { M: {}, W: {} };
    if (gameState.rankings) {
      ['M', 'W'].forEach((g) => gameState.rankings[g].forEach((r) => { ranks[g][r.schoolId] = r.rank; }));
    }
    const total = gameState.rankings ? gameState.rankings.M.length : 354;
    const rows = [];
    Object.values(gameState.world.schools).forEach((school) => {
      const coach = gameState.getCoach(school.coachId);
      if (!coach) return;
      const bestRank = Math.min(ranks.M[school.id] || total, ranks.W[school.id] || total);
      const cr = coach.careerRecord || { conferenceTitles: 0, nationalTitles: 0 };
      const score = Math.round(
        cr.nationalTitles * 30 + cr.conferenceTitles * 5 +
        (total - bestRank) / 8 + (coach.reputation || 25) * 0.5 +
        coach.overallRating * 0.15 + coach.yearsAtSchool * 0.3
      );
      rows.push({
        coachId: coach.id, name: coach.fullName, isPlayer: coach.isPlayer,
        school: school.name, schoolId: school.id, personality: coach.archetype,
        reputation: Math.round(coach.reputation || 0),
        repLabel: (coach.reputationLevel || {}).label || '',
        natTitles: cr.nationalTitles, confTitles: cr.conferenceTitles,
        bestRank, score
      });
    });
    rows.sort((a, b) => b.score - a.score);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }

  window.XCD.engine.Careers = {
    generateOffers, acceptOffer, declineOffers, expireOffers,
    runCarousel, fillVacancy, coachRankings
  };
})();
