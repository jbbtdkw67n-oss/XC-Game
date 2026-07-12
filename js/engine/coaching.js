/*
 * CoachingEngine — Update 2 (Parts 1 & 2).
 *
 * Reputation: a coach's national standing, separate from school prestige.
 * A legend at a mid-major out-recruits an average coach at a blue blood.
 * Earned by winning, titles, development, and All-Americans; lost through
 * losing seasons, stagnation, and roster exodus. Feeds recruiting, the
 * transfer portal, job offers, media buzz, and preseason attention.
 *
 * Progression: every coach — AI and player alike — ages under the same
 * rules. Young coaches improve quickly, veterans plateau, and some
 * decline with age. Tendencies (mileage philosophy, recruiting identity,
 * temperament) persist for entire careers.
 */
(function () {
  const Utils = window.XCD.core.Utils;
  const D = window.XCD.data;

  const CORE = ['recruiting', 'training', 'peaking', 'culture'];
  const SECONDARY = ['talentEval', 'motivation', 'transferRecruiting',
    'internationalRecruiting', 'media', 'staffManagement', 'relationships'];

  // Field size of a division's poll (Update 3): every expectation-vs-result
  // calculation is scaled to the division the school actually competes in.
  function divisionSize(gameState, division) {
    const ds = gameState.rankings && gameState.rankings.divisionSizes;
    const n = ds && ds[division || 'DI'];
    return n || (gameState.rankings ? gameState.rankings.M.length : 354);
  }

  /* ---------------- Reputation ---------------- */
  function bestRank(gameState, schoolId) {
    const r = gameState.rankings;
    if (!r) return 999;
    const m = r.M.find((x) => x.schoolId === schoolId);
    const w = r.W.find((x) => x.schoolId === schoolId);
    return Math.min(m ? m.rank : 999, w ? w.rank : 999);
  }

  /*
   * Yearly reputation update from the season's evidence. Called at the
   * year rollover, before the coaching carousel evaluates anyone.
   */
  function updateReputation(gameState, coach, school, rng) {
    const year = gameState.year - 1; // the season that just ended
    // Judge a coach against their own division's field, not the whole NCAA.
    const total = divisionSize(gameState, school.division);
    const rank = bestRank(gameState, school.id);
    let delta = 0;

    // Results against the size of the job: overachieving a small program
    // builds a name faster than treading water at a blue blood.
    const expectedRank = Math.round((1 - school.prestige / 100) * total * 0.9) + 5;
    const over = expectedRank - rank;
    delta += Utils.clamp(over / 45, -2.0, 2.5);
    if (rank <= 10) delta += 1.0;
    else if (rank <= 30) delta += 0.5;

    // Titles are the currency of legend.
    const conf = (gameState.history.conferenceChampions || {})[year] || {};
    if (conf[`${school.conference}-M`] === school.name) delta += 1.2;
    if (conf[`${school.conference}-W`] === school.name) delta += 1.2;
    const nat = (gameState.history.nationalChampions || {})[year] || {};
    ['M', 'W'].forEach((g) => {
      const key = (school.division || 'DI') === 'DI' ? g : `${school.division}-${g}`;
      if (nat[key] && nat[key].teamId === school.id) delta += 4.5;
    });

    // Development: turning rosters into better runners gets noticed.
    const roster = gameState.getRoster(school.id, 'M').concat(gameState.getRoster(school.id, 'W'));
    if (roster.length) {
      const avgDev = Utils.average(roster.map((a) => a.seasonDev || 0));
      delta += Utils.clamp((avgDev - 2.2) * 0.35, -1.0, 1.0);
    }

    // Roster exodus stings; a locked-in locker room quietly builds trust.
    const portalOut = ((gameState.history.portalSummaries || {})[year] || {}).entries !== undefined
      ? null : null; // program-level exits tracked below via morale proxy
    const unhappy = roster.filter((a) => a.morale < 45).length;
    if (unhappy >= 5) delta -= 0.8;

    // Longevity: staying employed is itself a reputation.
    delta += 0.15;

    // Bad seasons bite, and long droughts erode legends.
    if (over < -total * 0.18) delta -= 1.2;
    if (coach.reputation >= 70 && rank > 40) delta -= 0.8;

    delta += (rng.next() - 0.5) * 0.6; // media noise
    coach.reputation = Utils.clamp(Math.round((coach.reputation + Utils.clamp(delta, -5, 7)) * 10) / 10, 1, 99);
    void portalOut;
  }

  /* ---------------- Rating progression ---------------- */
  function progressRatings(coach, rng, isPlayer) {
    const bump = (key, amt) => { coach[key] = Utils.clamp(coach[key] + amt, 15, 99); };
    const arch = (D.COACH_ARCHETYPES || []).find((a) => a.key === coach.archetype);

    if (coach.age < 35) {
      // Young coaches improve quickly (player growth flows through
      // upgrade points instead, but craft skills still sharpen).
      const n = isPlayer ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const pool = isPlayer ? SECONDARY : (rng.bool(0.5) && arch ? [arch.rating] : CORE.concat(SECONDARY));
        bump(rng.choice(pool), 1);
      }
    } else if (coach.age < 50) {
      if (!isPlayer && rng.bool(0.55)) {
        const pool = rng.bool(0.45) && arch ? [arch.rating] : CORE.concat(SECONDARY);
        bump(rng.choice(pool), 1);
      } else if (isPlayer && rng.bool(0.35)) {
        bump(rng.choice(SECONDARY), 1);
      }
    } else if (coach.age < 62) {
      // The plateau: identity is set; craft holds steady.
      if (!isPlayer && rng.bool(0.15)) bump(rng.choice(SECONDARY), 1);
    } else {
      // Some coaches decline with age — same rules for everyone.
      const declineChance = 0.18 + Math.max(0, coach.age - 68) * 0.04;
      if (rng.bool(declineChance)) {
        bump(rng.choice(CORE), -1);
        if (rng.bool(0.4)) bump(rng.choice(SECONDARY), -1);
      }
    }
  }

  /*
   * Yearly pass over every coach in the world: aging, seasons served,
   * rating progression/decline, and reputation movement. Runs at the
   * rollover BEFORE the carousel so retirement/firing decisions see
   * current ages and reputations.
   */
  function yearlyProgression(gameState, rng) {
    Object.values(gameState.world.schools).forEach((school) => {
      const coach = gameState.world.coaches[school.coachId];
      if (coach) {
        coach.age += 1;
        coach.yearsAtSchool += 1;
        coach.careerRecord.seasons = (coach.careerRecord.seasons || 0) + 1;
        progressRatings(coach, rng, coach.isPlayer);
        updateReputation(gameState, coach, school, rng);
      }
      const assistant = gameState.world.coaches[school.assistantId];
      if (assistant) {
        assistant.age += 1;
        // A player-assistant grows via upgrade points (like any player coach),
        // so auto-progression is suppressed for them.
        progressRatings(assistant, rng, !!assistant.isPlayer);
      }
    });

    // Free agents (fired coaches awaiting a call) age too.
    Object.values(gameState.world.coaches).forEach((c) => {
      if (!c.schoolId && c.role === 'Head') {
        c.age += 1;
        c.reputation = Utils.clamp((c.reputation || 20) - 1.5, 1, 99); // out of sight, out of mind
      }
    });
  }

  /* ---------------- Identity helpers ---------------- */
  // Weekly volume philosophy (Part 6): tendencies set the baseline.
  function preferredMileage(coach, gender) {
    let base = 72;
    if (coach) {
      if (coach.hasTendency && coach.hasTendency('mileage-heavy')) base = 92;
      else if (coach.hasTendency && coach.hasTendency('low-mileage')) base = 56;
      if (coach.hasTendency && coach.hasTendency('aggressive')) base += 4;
      if (coach.hasTendency && coach.hasTendency('conservative')) base -= 4;
    }
    if (gender === 'W') base -= 8;
    return Utils.clamp(base, D.MILEAGE.MIN, D.MILEAGE.MAX);
  }

  // Media buzz: reputation + media skill drive preseason attention.
  function mediaPull(coach) {
    if (!coach) return 0;
    return (coach.reputation || 20) * 0.7 + (coach.media || 50) * 0.3;
  }

  window.XCD.engine.Coaching = {
    yearlyProgression,
    updateReputation,
    progressRatings,
    preferredMileage,
    mediaPull,
    bestRank,
    divisionSize,
    CORE_RATINGS: CORE,
    SECONDARY_RATINGS: SECONDARY
  };
})();
