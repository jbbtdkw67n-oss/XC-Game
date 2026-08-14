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

    // Reputation Rebalance (Update 13): a national standing must reflect
    // SUSTAINED excellence over many years, not a couple of good seasons.
    // Accomplishments — titles, podiums, top classes, development — are the
    // engine of a reputation; simply competing contributes only a trickle.
    // Results against the size of the job: overachieving a small program
    // builds a name faster than treading water at a blue blood — but the
    // passive, expectation-based gains are now modest.
    const expectedRank = Math.round((1 - school.prestige / 100) * total * 0.9) + 5;
    const over = expectedRank - rank;
    delta += Utils.clamp(over / 70, -1.8, 1.2);
    if (rank <= 5) delta += 0.7;         // a genuine national podium showing
    else if (rank <= 15) delta += 0.4;
    else if (rank <= 40) delta += 0.15;

    // Titles are the currency of legend — the dominant, lasting input.
    const conf = (gameState.history.conferenceChampions || {})[year] || {};
    if (conf[`${school.conference}-M`] === school.name) delta += 1.1;
    if (conf[`${school.conference}-W`] === school.name) delta += 1.1;
    const nat = (gameState.history.nationalChampions || {})[year] || {};
    ['M', 'W'].forEach((g) => {
      const key = (school.division || 'DI') === 'DI' ? g : `${school.division}-${g}`;
      if (nat[key] && nat[key].teamId === school.id) delta += 4.0;
      // National runner-up / podium team also builds a name (Update 13).
      else {
        const row = gameState.rankings && gameState.rankings[g].find((r) => r.schoolId === school.id);
        if (row && row.rank === 2) delta += 1.6;
        else if (row && row.rank <= 4) delta += 0.9;
      }
    });

    // Coach of the Year is a marquee honor — it should move the needle. This
    // runs once per coach per rollover, so newly-won awards (the difference
    // since last season's baseline) add reputation exactly once.
    const cr = coach.careerRecord || {};
    const gainedNat = (cr.natCOY || 0) - (cr._repNatCOY || 0);
    const gainedConf = (cr.confCOY || 0) - (cr._repConfCOY || 0);
    if (gainedNat > 0) delta += gainedNat * 1.2;
    if (gainedConf > 0) delta += gainedConf * 0.4;
    cr._repNatCOY = cr.natCOY || 0;
    cr._repConfCOY = cr.confCOY || 0;

    // Development & All-Americans: turning rosters into better runners, and
    // producing national-caliber athletes, gets a coach noticed.
    const roster = gameState.getRoster(school.id, 'M').concat(gameState.getRoster(school.id, 'W'));
    if (roster.length) {
      const avgDev = Utils.average(roster.map((a) => a.seasonDev || 0));
      delta += Utils.clamp((avgDev - 2.2) * 0.28, -0.9, 0.8);
    }

    // Roster exodus stings; a locked-in locker room quietly builds trust.
    const unhappy = roster.filter((a) => a.morale < 45).length;
    if (unhappy >= 5) delta -= 0.8;

    // Winning the portal (Update X): a staff that lands elite transfers is
    // seen as a program on the move.
    const ps = (gameState.history.portalSummaries || {})[year];
    const haul = ps && ps.inBySchool && ps.inBySchool[school.id];
    if (haul && haul.elite) delta += Math.min(1.0, haul.elite * 0.45);

    // Longevity: staying employed contributes only a very small amount —
    // existing for decades is not, by itself, a reputation (Update 13).
    delta += 0.04;

    // Bad seasons bite, and long droughts erode legends.
    if (over < -total * 0.18) delta -= 1.2;
    if (coach.reputation >= 70 && rank > 40) delta -= 0.8;

    delta += (rng.next() - 0.5) * 0.4; // media noise
    // Diminishing returns near the summit (Update 13): reaching Legend
    // requires DECADES of success — each rung above National Coach is
    // harder to climb, so multi-title dynasties rise steadily while average
    // coaches plateau well short of the top tiers.
    let applied = Utils.clamp(delta, -5, 6);
    if (applied > 0) applied *= Utils.clamp(1 - (coach.reputation || 20) / 155, 0.28, 1);
    coach.reputation = Utils.clamp(Math.round((coach.reputation + applied) * 10) / 10, 1, 99);
  }

  /*
   * Assistant reputation (Update 6, Phase 3; overhauled in Update X, Part 4):
   * a recruiting coordinator builds a name through the recruiting classes
   * they land — the calling card, heavily weighted — plus transfer portal
   * wins, player development, team success, and titles. Everything is
   * division-weighted: a top-5 DI class builds a reputation substantially
   * faster than a top DII or DIII class, because the competition for those
   * recruits is fiercer. Progression should feel rewarding season over
   * season; assistants who never step up eventually plateau and fade.
   */
  const ASSISTANT_DIV_WEIGHT = { DI: 1, DII: 0.72, DIII: 0.5 };

  function updateAssistantReputation(gameState, coach, school, rng) {
    const year = gameState.year - 1; // the season that just ended
    const total = divisionSize(gameState, school.division);
    const rank = bestRank(gameState, school.id);
    const divW = ASSISTANT_DIV_WEIGHT[school.division || 'DI'] ?? 1;
    // Reputation Rebalance (Update 13): climbing the assistant ladder to
    // Legend should take 15-25 SUCCESSFUL seasons. Signing classes and
    // sharing in title runs still build a name — but simply holding a seat
    // barely moves it, and the gains taper as the reputation grows.
    let delta = 0.12; // early-career assistants build a name only slowly

    // Team success: the whole staff shares in a nationally relevant season.
    if (rank <= total * 0.05) delta += 1.3 * divW;
    else if (rank <= total * 0.15) delta += 0.85 * divW;
    else if (rank <= total * 0.40) delta += 0.32 * divW;

    // Titles: hardware on the program's mantle burnishes every résumé on
    // staff. Championships are a marquee line for an assistant and should
    // visibly raise the reputation — so the title reward is tracked
    // separately and shielded from the diminishing-returns taper below,
    // ensuring a conference or national title always moves the needle even
    // for an already-decorated coordinator.
    let titleBump = 0;
    const conf = (gameState.history.conferenceChampions || {})[year] || {};
    if (conf[`${school.conference}-M`] === school.name) titleBump += 1.0 * divW;
    if (conf[`${school.conference}-W`] === school.name) titleBump += 1.0 * divW;
    const nat = (gameState.history.nationalChampions || {})[year] || {};
    ['M', 'W'].forEach((g) => {
      const key = (school.division || 'DI') === 'DI' ? g : `${school.division}-${g}`;
      if (nat[key] && nat[key].teamId === school.id) titleBump += 3.5 * divW;
      // A national runner-up / podium finish is a résumé line too.
      else {
        const row = gameState.rankings && gameState.rankings[g].find((r) => r.schoolId === school.id);
        if (row && row.rank === 2) titleBump += 1.2 * divW;
        else if (row && row.rank <= 4) titleBump += 0.6 * divW;
      }
    });

    // THIS season's recruiting class — the assistant's signature work and
    // the largest single input. Judged within the division's own race.
    const classes = (gameState.history.recruitingClasses || {})[year] || [];
    const entry = classes.find((e) => e.schoolId === school.id);
    if (entry) {
      const r = entry.divisionRank || entry.rank;
      if (r <= 3) delta += 2.4 * divW;
      else if (r <= 5) delta += 1.9 * divW;
      else if (r <= 10) delta += 1.35 * divW;
      else if (r <= 25) delta += 0.7 * divW;
      else if (r <= 60) delta += 0.28 * divW;
    }

    // Transfer portal success: landing elite portal athletes is a modern
    // recruiting résumé line (the immediate bump lands at transfer time;
    // a strong overall haul compounds it here).
    const ps = (gameState.history.portalSummaries || {})[year];
    const haul = ps && ps.inBySchool && ps.inBySchool[school.id];
    if (haul) {
      if (haul.elite) delta += Math.min(1.4, haul.elite * 0.6) * divW;
      else if (haul.count >= 2) delta += 0.28 * divW;
    }

    // Player development: a room that visibly improves reflects on the staff.
    const roster = gameState.getRoster(school.id, 'M').concat(gameState.getRoster(school.id, 'W'));
    if (roster.length) {
      const avgDev = Utils.average(roster.map((a) => a.seasonDev || 0));
      delta += Utils.clamp((avgDev - 2.2) * 0.24, -0.6, 0.7);
    }

    // Team improvement (Update 16): a program that climbed the poll from where
    // it opened the season reflects on the whole staff. The last season's
    // preseason snapshot is still live at the rollover (the new season is not
    // built until later), so compare it against the final standing.
    const pre = gameState.season && gameState.season.preseasonRanks;
    if (pre) {
      const preRank = Math.min(pre.M && pre.M[school.id] || 999, pre.W && pre.W[school.id] || 999);
      if (preRank < 999) {
        const climb = preRank - rank; // positive = finished higher than projected
        delta += Utils.clamp(climb / 45, -0.5, 1.0) * divW;
      }
    }

    // Producing national-caliber athletes (Update 16): All-Americans and
    // individual national champions coached this season are a recruiting
    // coordinator's loudest résumé line. Credited at nationals while the
    // roster is intact and tallied here at the rollover.
    const honors = ((gameState.history.seasonStaffHonors || {})[year] || {})[school.id];
    if (honors) {
      delta += Math.min(1.6, (honors.allAmericans || 0) * 0.4) * divW;
      delta += Math.min(2.2, (honors.indivNatChamps || 0) * 1.1) * divW;
    }

    if ((coach.recruiting || 55) >= 70) delta += 0.35; // recruiting is their calling card
    if (coach.age > 55) delta -= 0.7; // long-tenured assistants who never stepped up plateau
    delta += (rng.next() - 0.5) * 0.3;
    // Diminishing returns near the top: the final rungs to a Legend
    // Assistant reputation demand many more seasons of sustained success —
    // but only the non-title inputs are tapered. Championships (titleBump)
    // are added on top at nearly full value, so winning always visibly
    // raises an assistant's reputation even when they're already decorated.
    let applied = Utils.clamp(delta, -3, 6);
    if (applied > 0) applied *= Utils.clamp(1 - (coach.reputation || 12) / 150, 0.3, 1);
    applied += titleBump * Utils.clamp(1 - (coach.reputation || 12) / 260, 0.7, 1);
    coach.reputation = Utils.clamp(
      Math.round((coach.reputation + applied) * 10) / 10, 1, 92);
  }

  /*
   * Assistant → head coach prestige conversion (History & Legacy update,
   * Phase 13). An assistant's prestige is related to — but never identical
   * to — a head coach's. On promotion the new head-coach reputation is
   * derived from the assistant résumé (years served, recruiting ability,
   * championships contributed to) at a meaningful discount: an elite
   * assistant becomes a highly promising FIRST-TIME head coach, not an
   * established legend. Experience, attributes, tendencies, and career
   * history all carry over untouched — only the prestige converts.
   */
  function convertAssistantPrestige(coach) {
    const rep = coach.reputation || 12;
    const cr = coach.careerRecord || {};
    let head = rep * 0.55
      + Math.min(8, (cr.seasons || 0) * 0.4)                    // years of apprenticeship
      + Utils.clamp(((coach.recruiting || 55) - 55) * 0.15, -4, 6) // recruiting is the calling card
      + Math.min(5, (cr.nationalTitles || 0) * 2);              // title runs contributed to
    // Always a real step down, and never an instant elite standing: blue
    // blood chairs remain the culmination of a proven head-coaching career.
    head = Math.min(head, rep - 6, 58);
    coach.reputation = Utils.clamp(Math.round(head), 8, 58);
    return coach.reputation;
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
        assistant.yearsAtSchool = (assistant.yearsAtSchool || 0) + 1;
        assistant.careerRecord.seasons = (assistant.careerRecord.seasons || 0) + 1;
        // A player-assistant grows via upgrade points (like any player coach),
        // so auto-progression is suppressed for them.
        progressRatings(assistant, rng, !!assistant.isPlayer);
        // Assistants build (or lose) a reputation over time, so the strong
        // ones become realistic head-coaching candidates (Update 6, Phase 3).
        updateAssistantReputation(gameState, assistant, school, rng);
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
    // Mileage scaling (Update 13, Phase 7): men average ~75 mpw, women ~60.
    let base = 75;
    if (coach) {
      if (coach.hasTendency && coach.hasTendency('mileage-heavy')) base = 92;
      else if (coach.hasTendency && coach.hasTendency('low-mileage')) base = 56;
      if (coach.hasTendency && coach.hasTendency('aggressive')) base += 4;
      if (coach.hasTendency && coach.hasTendency('conservative')) base -= 4;
    }
    // Women race 6K on lower volume, and their safe ceiling sits below the
    // men's (mileage rebalance) — no sane program plans a 105+ week for women.
    if (gender === 'W') base = Math.min(base - 15, (D.MILEAGE.SAFE_CAP || {}).W || 105);
    return Utils.clamp(base, D.MILEAGE.MIN, D.MILEAGE.MAX);
  }

  // Media buzz: reputation + media skill drive preseason attention.
  function mediaPull(coach) {
    if (!coach) return 0;
    return (coach.reputation || 20) * 0.7 + (coach.media || 50) * 0.3;
  }

  /* ---------------- Staff management (Update 6, Section 9) ------------ *
   * Head coaches run their own staff. Candidates are generated
   * deterministically per week (no reroll-scumming), their quality scaled
   * by program prestige and the head coach's Staff Management craft.
   * Hiring is atomic — the outgoing assistant is let go in the same move,
   * so no program is ever without an assistant.
   */
  function staffRng(gameState) {
    return new window.XCD.core.SeededRNG(
      (gameState.seed ^ (gameState.year * 53 + gameState.week * 7 + 0x5AFF)) >>> 0);
  }

  /*
   * Build one hiring-pool candidate of a given ORIGIN (Update 16). No more
   * interchangeable generics: a candidate is a young up-and-comer, a seasoned
   * veteran, a fired head coach looking for a way back, a decorated DII/DIII
   * assistant earning a look, or a former All-American just entering the
   * profession — each with a believable age, rating profile, and career
   * history. `lift` is the boss's Staff-Management pull on applicant quality.
   */
  function buildAssistantCandidate(gameState, rng, school, type, lift) {
    const WG = window.XCD.engine.WorldGenerator;
    const cand = WG.buildAssistant(rng, school);
    const cr = cand.careerRecord;
    const bump = (extra) => ['recruiting', 'training', 'peaking', 'culture', 'talentEval']
      .forEach((k) => { cand[k] = Utils.clamp((cand[k] || 50) + rng.int(-3, 3) + lift + extra, 20, 92); });

    if (type === 'veteran') {
      cand.age = rng.int(46, 58);
      bump(2);
      cr.seasons = rng.int(12, 26);
      cr.conferenceTitles = rng.int(0, 3);
      cand.origin = 'Veteran assistant';
      cand.reputation = Utils.clamp(18 + cand.recruiting * 0.2 + rng.int(0, 12) + lift, 10, 60);
    } else if (type === 'firedHC') {
      cand.age = rng.int(44, 60);
      bump(1);
      cr.seasons = rng.int(8, 22);
      cr.nationalTitles = rng.bool(0.22) ? 1 : 0;
      cr.conferenceTitles = rng.int(0, 4);
      cand.origin = 'Former head coach';
      cand.reputation = Utils.clamp(20 + cr.nationalTitles * 10 + rng.int(0, 14) + lift, 12, 62);
    } else if (type === 'lowerDiv') {
      cand.age = rng.int(34, 50);
      bump(0);
      cr.seasons = rng.int(6, 18);
      cr.conferenceTitles = rng.int(1, 5);
      cand.origin = 'Decorated DII/DIII assistant';
      cand.reputation = Utils.clamp(14 + cand.recruiting * 0.18 + rng.int(0, 10) + lift, 8, 50);
    } else if (type === 'exAthlete') {
      cand.age = rng.int(27, 36);
      bump(-1);
      cr.seasons = rng.int(0, 5);
      cand.culture = Utils.clamp(cand.culture + 6, 20, 92);
      cand.relationships = Utils.clamp((cand.relationships || 55) + 8, 20, 95);
      cand.origin = 'Former All-American entering coaching';
      cand.reputation = Utils.clamp(12 + rng.int(0, 10) + lift, 6, 42);
    } else { // young up-and-comer
      cand.age = rng.int(26, 33);
      bump(-2);
      cr.seasons = rng.int(0, 4);
      cand.origin = 'Up-and-coming assistant';
      cand.reputation = Utils.clamp(8 + cand.recruiting * 0.15 + rng.int(0, 8) + lift, 3, 40);
    }
    cand.schoolId = null;
    cand.role = 'Assistant';
    return cand;
  }

  function assistantCandidates(gameState) {
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    const rng = staffRng(gameState);
    const lift = Math.round(((coach.staffManagement ?? 55) - 50) / 8); // a connected boss attracts better applicants
    // A varied shortlist every week (Update 16): always a young riser and a
    // seasoned hand, plus a rotating wildcard — a fired head coach, a
    // lower-division standout, or a retired athlete breaking into coaching.
    const types = ['young', 'veteran', rng.choice(['firedHC', 'lowerDiv', 'exAthlete'])];
    const out = types.map((t) => buildAssistantCandidate(gameState, rng, school, t, lift));
    // The unemployed pool (spec Part 2, Section 12): fired and displaced
    // coaches stay in the ecosystem — when the pool has anyone, one genuine
    // free agent (career record, stints, and all) replaces a generated
    // candidate on the weekly list. Same deterministic weekly pick.
    const pool = Object.values(gameState.world.coaches)
      .filter((c) => !c.schoolId && !c.isPlayer && c.id !== school.assistantId && (c.age || 40) < 68)
      .sort((a, b) => a.id < b.id ? -1 : 1); // stable order for determinism
    if (pool.length) {
      const veteran = pool[rng.int(0, pool.length - 1)];
      if (!veteran.origin) veteran.origin = 'Free agent';
      out[rng.int(0, out.length - 1)] = veteran;
    }
    return out;
  }

  // Is the player's own assistant seat genuinely empty? A vacancy is never
  // subject to the offseason window or the one-hire cap — filling it is a
  // mandatory correction, not a discretionary upgrade, so the program can
  // never be stranded without an assistant (which would block the season).
  function assistantSeatVacant(gameState) {
    const school = gameState.getPlayerSchool();
    return !!(school && !(school.assistantId && gameState.world.coaches[school.assistantId]));
  }

  // The staffing window (spec Part 2, Section 12): staff changes are an
  // OFFSEASON activity, and a program makes at most one hire per cycle.
  function canHireAssistant(gameState) {
    const coach = gameState.getPlayerCoach();
    if (!coach || coach.role === 'Assistant') {
      return { ok: false, why: 'Only a head coach hires the staff.' };
    }
    // A genuine vacancy can ALWAYS be filled, in any phase, ignoring the
    // one-hire cap — a departed coordinator must never leave the program
    // permanently stuck (assistant-coach vacancy fix).
    if (assistantSeatVacant(gameState)) return { ok: true, vacancy: true };
    // The hiring window: the offseason proper, plus the Week 1
    // administrative phase (spec Part 2, Section 15).
    if (gameState.seasonPhase !== 'Offseason' && gameState.week !== 1) {
      return { ok: false, why: 'Staff changes happen in the offseason — coaches finish the season they signed on for.' };
    }
    if (gameState.staffHiredYear === gameState.year) {
      return { ok: false, why: 'You have already made your one staff hire this offseason.' };
    }
    return { ok: true };
  }

  function hireAssistant(gameState, candidate) {
    const Legacy = window.XCD.engine.Legacy;
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    const gate = canHireAssistant(gameState);
    if (!gate.ok) return { ok: false, message: gate.why };
    const wasVacancy = !!gate.vacancy;
    const current = school.assistantId && gameState.world.coaches[school.assistantId];
    if (current && current.isPlayer) return { ok: false, message: 'You cannot replace yourself.' };
    if (current) {
      Legacy.closeStint(gameState, current, school, gameState.year, 'released');
      Legacy.recordRetiredCoach(gameState, current, 'released'); // history keeps every career (Phase 3)
      delete gameState.world.coaches[current.id];
      gameState.logNews(`Staff change: ${school.name} lets assistant ${current.fullName} go.`);
    }
    candidate.schoolId = school.id;
    candidate.yearsAtSchool = 0;
    candidate.role = 'Assistant';
    gameState.world.coaches[candidate.id] = candidate;
    school.assistantId = candidate.id;
    Legacy.openStint(gameState, candidate, school, gameState.year);
    Legacy.linkStaff(gameState, school, gameState.year);
    // Filling a forced vacancy does NOT burn the program's discretionary
    // one-hire-per-offseason move — losing your coordinator shouldn't also
    // cost you your ordinary staff decision.
    if (!wasVacancy) gameState.staffHiredYear = gameState.year;
    gameState.assistantDeparture = null; // the vacancy is resolved (Update 16)
    if (gameState.week === 1 && gameState.week1) gameState.week1.staffConfirmed = true; // checklist: staff settled
    gameState.logNews(`Staff hire: ${candidate.fullName} joins ${school.name} as assistant coach under ${coach.fullName}.`);
    return { ok: true, message: `${candidate.fullName} joins your staff.` };
  }

  /*
   * Interim placeholder assistant (assistant-coach vacancy fix). The absolute
   * safety net: if the player's program is ever without a valid assistant when
   * one is required to proceed, install a modest interim coordinator so the
   * program ALWAYS has a valid assistant slot and the season can never be
   * blocked. The player is nudged to hire a permanent replacement, and the
   * interim is freely replaceable through the normal (always-open) vacancy
   * hire without spending the discretionary one-hire-per-offseason move.
   */
  function installInterimAssistant(gameState) {
    const school = gameState.getPlayerSchool();
    if (!school) return null;
    if (school.assistantId && gameState.world.coaches[school.assistantId]) return null;
    const rng = staffRng(gameState);
    const WG = window.XCD.engine.WorldGenerator;
    const asst = WG.buildAssistant(rng, school);
    asst.age = rng.int(28, 44);
    asst.reputation = Utils.clamp(asst.reputation || 10, 3, 24);
    asst.origin = 'Interim assistant';
    asst.interim = true; // flagged so the UI shows it as temporary
    asst.schoolId = school.id;
    asst.role = 'Assistant';
    asst.yearsAtSchool = 0;
    asst.careerRecord.seasons = 0;
    asst.stints = [{ schoolId: school.id, school: school.name, division: school.division || 'DI', startYear: gameState.year, endYear: null }];
    gameState.world.coaches[asst.id] = asst;
    school.assistantId = asst.id;
    if (window.XCD.engine.Legacy && window.XCD.engine.Legacy.linkStaff) {
      window.XCD.engine.Legacy.linkStaff(gameState, school, gameState.year);
    }
    gameState.logNews(`${asst.fullName} steps in as interim assistant at ${school.name} until a permanent hire is made.`);
    return asst;
  }

  window.XCD.engine.Coaching = {
    yearlyProgression,
    installInterimAssistant,
    assistantSeatVacant,
    updateReputation,
    updateAssistantReputation,
    convertAssistantPrestige,
    progressRatings,
    preferredMileage,
    mediaPull,
    bestRank,
    divisionSize,
    assistantCandidates,
    canHireAssistant,
    hireAssistant,
    CORE_RATINGS: CORE,
    SECONDARY_RATINGS: SECONDARY
  };
})();
