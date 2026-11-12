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

  /* ---------------- Season expectations ---------------- */
  /*
   * Program expectations move every season (user request). At the preseason
   * the athletic director sets a target finish for each squad from four
   * things, each read as a fraction of the division (0 = #1):
   *   talent    — roster talent: the top seven by overall, ranked in division
   *   poll      — the preseason poll
   *   last      — where the squad finished last season
   *   prestige  — the brand's standing (read live, it barely moves in-season)
   * What the squad actually has on the roster this year leads: talent and
   * the preseason poll carry 70% of the target, last season 20%, and the
   * brand only 10% — a blue blood with a thin roster isn't expected to win,
   * and a loaded mid-major is. With no finish on record (a new dynasty, a
   * new program) last season's share goes to talent and the poll, never to
   * prestige. A breakthrough season raises next year's bar; a rebuild
   * lowers it. The AD's floor still holds — nobody expects to live in the
   * bottom 35%.
   */
  const STRUGGLE_LINE = 0.65;
  const EXPECT_WEIGHTS = { talent: 0.35, poll: 0.35, last: 0.2, prestige: 0.1 };

  // Average overall of a squad's top seven: the roster's raw talent.
  function rosterTalent(gameState, school, gender) {
    const ovr = (gender === 'M' ? school.rosterM : school.rosterW)
      .map((id) => gameState.world.athletes[id]).filter(Boolean)
      .map((a) => a.currentOverall).sort((a, b) => b - a).slice(0, 7);
    return ovr.length ? ovr.reduce((x, y) => x + y, 0) / 7 : 0;
  }

  // { schoolId: talentRank } within each division, per gender.
  function talentRanks(gameState) {
    const out = { M: {}, W: {} };
    const byDiv = {};
    Object.values(gameState.world.schools).forEach((s) => {
      (byDiv[s.division || 'DI'] = byDiv[s.division || 'DI'] || []).push(s);
    });
    ['M', 'W'].forEach((g) => {
      Object.values(byDiv).forEach((list) => {
        list.map((s) => ({ id: s.id, t: rosterTalent(gameState, s, g) }))
          .sort((a, b) => b.t - a.t)
          .forEach((r, i) => { out[g][r.id] = i + 1; });
      });
    });
    return out;
  }

  function buildExpectation(gameState, school, talent) {
    const total = divisionSize(gameState, school.division);
    const pre = (gameState.season && gameState.season.preseasonRanks) || null;
    const live = { M: {}, W: {} };
    if (!pre && gameState.rankings) {
      ['M', 'W'].forEach((g) => gameState.rankings[g].forEach((r) => { live[g][r.schoolId] = r.rank; }));
    }
    const fin = school.seasonFinish && school.seasonFinish.year === gameState.year - 1 ? school.seasonFinish : null;
    const exp = { year: gameState.year };
    ['M', 'W'].forEach((g) => {
      const pollRank = (pre ? pre[g][school.id] : live[g][school.id]) || total;
      exp[g] = {
        last: fin && fin[g] != null ? fin[g] : null, // no record yet: talent and the poll carry it
        poll: Math.min(1, pollRank / total),
        talent: Math.min(1, (talent[g][school.id] || total) / total),
        lastRank: fin ? fin[g + 'Rank'] || null : null,
        pollRank,
        talentRank: talent[g][school.id] || null
      };
    });
    return exp;
  }

  // Set every program's expectation for the new season (preseason). Last
  // season's target is kept so the Dashboard can show how the bar moved.
  function setSeasonExpectations(gameState) {
    const talent = talentRanks(gameState);
    Object.values(gameState.world.schools).forEach((school) => {
      const old = school.expectation;
      const fin = school.seasonFinish;
      if (fin && fin.targetM && fin.year === gameState.year - 1) {
        school.lastTarget = { year: fin.year, rankM: fin.targetM, rankW: fin.targetW }; // as graded
      } else if (old && old.year < gameState.year) {
        const f = finishFrom(gameState, school, old);
        school.lastTarget = { year: old.year, rankM: f.rankM, rankW: f.rankW };
      }
      school.expectation = buildExpectation(gameState, school, talent);
    });
  }

  // The season's expectation for one program, built on the spot if the
  // preseason never set one (an old save, a brand-new school).
  function seasonExpectation(gameState, school) {
    if (!school.expectation || school.expectation.year !== gameState.year) {
      school.expectation = buildExpectation(gameState, school, talentRanks(gameState));
    }
    return school.expectation;
  }

  /*
   * The target finish as a division fraction (0 = #1), per gender and
   * combined the same way results are judged (the better squad carries 70%).
   * Returns { pct, M, W, rankM, rankW }.
   */
  function expectedFinish(gameState, school) {
    return finishFrom(gameState, school, seasonExpectation(gameState, school));
  }

  function finishFrom(gameState, school, exp) {
    const total = divisionSize(gameState, school.division);
    const prestigePct = 1 - (school.prestige || 50) / 100;
    const W8 = EXPECT_WEIGHTS;
    const per = {};
    ['M', 'W'].forEach((g) => {
      const e = exp[g];
      if (e.last == null) {
        // No finish on record: split last season's share between talent
        // and the poll in proportion.
        const k = 1 + W8.last / (W8.talent + W8.poll);
        per[g] = prestigePct * W8.prestige + (e.poll * W8.poll + e.talent * W8.talent) * k;
      } else {
        per[g] = prestigePct * W8.prestige + e.last * W8.last + e.poll * W8.poll + e.talent * W8.talent;
      }
      per[g] = Math.min(STRUGGLE_LINE, per[g]);
    });
    const pct = Math.min(STRUGGLE_LINE,
      Math.min(per.M, per.W) * 0.7 + Math.max(per.M, per.W) * 0.3);
    const rank = (p) => Math.max(1, Math.round(p * total));
    return { pct, M: per.M, W: per.W, rankM: rank(per.M), rankW: rank(per.W), total, parts: exp };
  }

  // Stamp the season just finished (final poll) for next year's targets.
  function recordSeasonFinishes(gameState) {
    const idx = { M: {}, W: {} };
    ['M', 'W'].forEach((g) => (gameState.rankings[g] || []).forEach((r) => { idx[g][r.schoolId] = r.rank; }));
    Object.values(gameState.world.schools).forEach((school) => {
      const total = divisionSize(gameState, school.division);
      const mRank = idx.M[school.id] || total;
      const wRank = idx.W[school.id] || total;
      // The target it was graded against, frozen for next year's comparison.
      const t = expectedFinish(gameState, school);
      school.seasonFinish = { year: gameState.year, M: mRank / total, W: wRank / total, MRank: mRank, WRank: wRank,
        targetM: t.rankM, targetW: t.rankW };
    });
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

    // Honors (Version 15.16). National honors (a national title, runner-up,
    // national Coach of the Year, an individual national champion) are the
    // currency of a legend: kept apart from the results, which taper hard
    // near the summit, they taper only lightly, so every one visibly moves
    // even a decorated coach. Routine honors (conference and regional
    // titles, a podium, All-Americans, conference Coach of the Year) come
    // every year at a strong program, so they count with the results.
    let honors = 0;
    const division = school.division || 'DI';
    const conf = (gameState.history.conferenceChampions || {})[year] || {};
    if (conf[`${school.conference}-M`] === school.name) delta += 0.8;
    if (conf[`${school.conference}-W`] === school.name) delta += 0.8;
    const reg = (gameState.history.regionalChampions || {})[year] || {};
    ['M', 'W'].forEach((g) => { if (reg[`${school.region}-${g}`] === school.name) delta += 0.4; });
    const nat = (gameState.history.nationalChampions || {})[year] || {};
    ['M', 'W'].forEach((g) => {
      const key = division === 'DI' ? g : `${division}-${g}`;
      // A Division I crown (the deepest field in the country) makes a name
      // more than any other single result.
      if (nat[key] && nat[key].teamId === school.id) honors += division === 'DI' ? 7.0 : 5.0;
      else {
        // National runner-up / podium team also builds a name (Update 13).
        const row = gameState.rankings && gameState.rankings[g].find((r) => r.schoolId === school.id);
        if (row && row.rank === 2) honors += 2.2;
        else if (row && row.rank <= 4) delta += 0.9;
      }
    });

    // Coach of the Year is a marquee honor. This runs once per coach per
    // rollover, so newly won awards (the difference since last season's
    // baseline) add reputation exactly once.
    const cr = coach.careerRecord || {};
    const gainedNat = (cr.natCOY || 0) - (cr._repNatCOY || 0);
    const gainedConf = (cr.confCOY || 0) - (cr._repConfCOY || 0);
    if (gainedNat > 0) honors += gainedNat * 2.5;
    if (gainedConf > 0) delta += gainedConf * 0.5;
    cr._repNatCOY = cr.natCOY || 0;
    cr._repConfCOY = cr.confCOY || 0;

    // All-Americans and individual national champions the program produced.
    const H = gameState.history.seasonStaffHonors || {};
    const made = (H[year] || {})[school.id] || (H[gameState.year] || {})[school.id];
    if (made) {
      delta += Math.min(1.2, (made.allAmericans || 0) * 0.12);
      honors += Math.min(2.0, (made.indivNatChamps || 0) * 1.0);
    }

    // Development: turning rosters into better runners gets a coach noticed.
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
    const rep = coach.reputation || 20;
    // Results (and routine honors) taper hard near the summit: winning
    // seasons alone carry a coach into the 80s and no further.
    let applied = Utils.clamp(delta, -5, 4);
    if (applied > 0) applied *= Utils.clamp(1 - rep / 120, 0.05, 1);
    // Honors taper only lightly.
    applied += Math.min(honors, 12) * Utils.clamp(1 - rep / 320, 0.7, 1);
    // The last rungs are the hardest: gains above 90 count 60%, above 95
    // just 30%, so the very top spreads out instead of piling up at 99.
    let next = rep + applied;
    if (applied > 0) {
      const squeeze = (from, to, line, keep) => (to <= line ? to : Math.max(from, line) + (to - Math.max(from, line)) * keep);
      next = squeeze(rep, next, 90, 0.6);
      next = squeeze(Math.max(rep, 90), next, 95, 0.5); // 0.6 × 0.5 = 30% of the raw gain above 95
    }
    // Upkeep: a big name fades unless it is renewed. Above 85, a coach loses
    // 0.115 a year for every point of reputation over 85, so
    // the 90s belong to coaches still winning national honors.
    if (rep > 85) next -= (rep - 85) * 0.115;
    // A legacy floor: national titles and national Coach of the Year awards
    // are never forgotten. A champion's name can fade, but not below what
    // the hardware earned (a title is worth 7 points, a national COY 3, on
    // top of 50; at most 88).
    const titles = cr.nationalTitles || 0;
    if (titles > 0) next = Math.max(next, Math.min(88, 50 + titles * 7 + (cr.natCOY || 0) * 3));
    coach.reputation = Utils.clamp(Math.round(next * 10) / 10, 1, 99);
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
  // Coach progression pace: every coach (player and CPU) develops 1.5x as
  // fast as the original curve — natural growth and dynasty points alike.
  const PROGRESSION_RATE = 1.5;

  // Bank dynasty points at the progression pace. Fractions carry over so a
  // single point is never rounded up into two.
  function awardPoints(coach, pts) {
    if (!coach || !(pts > 0)) return 0;
    const total = (coach.pointCarry || 0) + pts * PROGRESSION_RATE;
    const whole = Math.floor(total + 1e-9);
    coach.pointCarry = Math.round((total - whole) * 100) / 100;
    coach.upgradePoints = (coach.upgradePoints || 0) + whole;
    return whole;
  }

  function progressRatings(coach, rng, isPlayer) {
    const bump = (key, amt) => { coach[key] = Utils.clamp(coach[key] + amt, 15, 99); };
    const arch = (D.COACH_ARCHETYPES || []).find((a) => a.key === coach.archetype);

    if (coach.age < 35) {
      // Young coaches improve quickly (player growth flows through
      // upgrade points instead, but craft skills still sharpen).
      const n = isPlayer ? (rng.bool(PROGRESSION_RATE - 1) ? 2 : 1) : 3;
      for (let i = 0; i < n; i++) {
        const pool = isPlayer ? SECONDARY : (rng.bool(0.5) && arch ? [arch.rating] : CORE.concat(SECONDARY));
        bump(rng.choice(pool), 1);
      }
    } else if (coach.age < 50) {
      if (!isPlayer && rng.bool(Math.min(0.95, 0.55 * PROGRESSION_RATE))) {
        const pool = rng.bool(0.45) && arch ? [arch.rating] : CORE.concat(SECONDARY);
        bump(rng.choice(pool), 1);
      } else if (isPlayer && rng.bool(0.35 * PROGRESSION_RATE)) {
        bump(rng.choice(SECONDARY), 1);
      }
    } else if (coach.age < 62) {
      // The plateau: identity is set; craft holds steady.
      if (!isPlayer && rng.bool(0.15 * PROGRESSION_RATE)) bump(rng.choice(SECONDARY), 1);
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
    const Legacy = window.XCD.engine.Legacy;
    const pool = Object.values(gameState.world.coaches)
      .filter((c) => !c.schoolId && !c.isPlayer && c.id !== school.assistantId && (c.age || 40) < 68 &&
        // A coach who has already left this program is never brought back
        // (Update 19): the former-staff ledger keeps them off your board.
        !Legacy.hasLeftSchool(school, c.id))
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

  // The shared install: let the incumbent go and seat the new coordinator.
  // Every route onto the player's staff — an applicant, a free agent, a
  // coach hired away from another program — ends here.
  function installAssistant(gameState, candidate, wasVacancy) {
    const Legacy = window.XCD.engine.Legacy;
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    releaseCurrentAssistant(gameState);
    candidate.schoolId = school.id;
    candidate.yearsAtSchool = 0;
    candidate.role = 'Assistant';
    candidate.hotSeat = 0;
    candidate.hotSeatYears = 0;
    candidate.podiumMissStreak = 0;
    candidate.poolYears = 0;
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
  }

  // The incumbent is let go (history keeps the career). No-op on an empty seat.
  function releaseCurrentAssistant(gameState) {
    const Legacy = window.XCD.engine.Legacy;
    const school = gameState.getPlayerSchool();
    const current = school.assistantId && gameState.world.coaches[school.assistantId];
    if (!current || current.isPlayer) return;
    Legacy.closeStint(gameState, current, school, gameState.year, 'released');
    Legacy.recordRetiredCoach(gameState, current, 'released'); // history keeps every career (Phase 3)
    delete gameState.world.coaches[current.id];
    school.assistantId = null;
    gameState.logNews(`Staff change: ${school.name} lets assistant ${current.fullName} go.`);
  }

  function hireAssistant(gameState, candidate) {
    const Legacy = window.XCD.engine.Legacy;
    const school = gameState.getPlayerSchool();
    const gate = canHireAssistant(gameState);
    if (!gate.ok) return { ok: false, message: gate.why };
    // Safety net for the former-staff rule (Update 19): even if a stale
    // candidate list slips a departed coach through, the hire itself refuses
    // anyone who has already left this program.
    if (candidate && Legacy.hasLeftSchool(school, candidate.id)) {
      return { ok: false, message: `${candidate.fullName} left ${school.name} — the program won't bring them back.` };
    }
    const current = school.assistantId && gameState.world.coaches[school.assistantId];
    if (current && current.isPlayer) return { ok: false, message: 'You cannot replace yourself.' };
    installAssistant(gameState, candidate, !!gate.vacancy);
    return { ok: true, message: `${candidate.fullName} joins your staff.` };
  }

  /* ---------------- The staff market ---------------- *
   * A head coach can fill the assistant's chair from four places:
   *   applicant  — this week's applicants (assistantCandidates): they came
   *                to you, so they always say yes
   *   freeAgent  — every coach out of work, career history and all
   *   assistant  — an assistant on another program's staff, who only moves
   *                for a real step up
   *   head       — a HEAD coach at a much smaller program, who gives up
   *                their own chair to join a big staff
   *
   * Two rules keep it honest:
   *   Hiring reach — a program can only attract coaches up to a reputation
   *     cap set by its prestige (most of it), the head coach's own name, and
   *     Staff Management. A blue blood reaches nearly everyone; a rebuilding
   *     program reaches unknowns. Anyone above the cap is out of reach.
   *   Interest — a coach with a job has to want the move. Their interest is
   *     the literal chance they accept, and the answer is settled per coach
   *     per offseason, so asking again never rerolls a no. Being turned down
   *     does not spend the program's one hire.
   */
  const STAFF_STEP_UP = 6;   // an assistant moves only to a program this much bigger
  const STAFF_HEAD_GAP = 22; // a head coach gives up the chair only for one this much bigger
  const STAFF_LIST = { assistant: 60, head: 30, locked: 6 };
  // Stature (Version 15.16): a head coach with a 75+ reputation has outgrown
  // an assistant's chair. Sitting head coaches and out-of-work former heads
  // at that level are never offered one, by the player or a CPU staff.
  const STAFF_HEAD_REP_MAX = 75;
  const tooProminent = (c, source) => {
    const head = source === 'head' || (source === 'freeAgent' && (c.role || 'Head') === 'Head');
    const rep = Math.round(c.reputation || 0);
    return head && rep >= STAFF_HEAD_REP_MAX
      ? `Reputation ${rep}: a head coach of this stature won't take an assistant's job` : null;
  };

  function hiringReach(gameState) {
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    const parts = {
      program: Math.round((school.prestige || 0) * 0.6),
      name: Math.round((coach.reputation || 0) * 0.2),
      staff: Math.round(((coach.staffManagement ?? 55) - 50) * 0.15),
      base: 6
    };
    const cap = Utils.clamp(parts.program + parts.name + parts.staff + parts.base, 18, 90);
    return { cap, parts, prestige: school.prestige || 0 };
  }

  const ambitionOf = (coach) => D.coachAmbition(coach && coach.ambition) ||
    { weightHC: 1, weightLateral: 1, prestigePull: 1, stay: 1 };
  const DIV_ORDER = { DI: 3, DII: 2, DIII: 1 };

  // How much a coach wants the player's assistant chair, 0-100. `from` is the
  // program they work for now (null for a free agent).
  function staffInterest(gameState, coach, source, from) {
    const school = gameState.getPlayerSchool();
    const boss = gameState.getPlayerCoach();
    const P = school.prestige || 0;
    const am = ambitionOf(coach);
    const bossPull = ((boss.reputation || 20) - 40) * 0.2;
    if (source === 'freeAgent') {
      return Math.round(Utils.clamp(68 + (P - (coach.reputation || 0)) * 0.5 + (coach.poolYears || 0) * 8, 25, 97));
    }
    const divStep = (DIV_ORDER[school.division || 'DI'] || 3) - (DIV_ORDER[(from && from.division) || 'DI'] || 3);
    const gap = P - ((from && from.prestige) || 0);
    let p;
    if (source === 'assistant') {
      p = 28 + Utils.clamp(gap, 0, 60) * (0.6 + 0.4 * am.prestigePull);
      p += (Utils.clamp(am.weightLateral / Math.max(0.5, am.stay), 0.45, 1.6) - 1) * 22;
      if (coach.ambition === 'recruiter' && P >= 72) p += 10;
      if ((coach.yearsAtSchool || 0) === 0) p -= 10;      // only just arrived
      else if ((coach.yearsAtSchool || 0) >= 6) p -= 6;   // settled
    } else {
      p = 12 + Math.max(0, gap - STAFF_HEAD_GAP) * 1.3 * (0.6 + 0.4 * am.prestigePull);
      const seat = D.seatStatus(coach.hotSeat || 0).key;
      p += seat === 'hot' ? 25 : seat === 'warm' ? 12 : 0; // jump before the push
      p += { recruiter: 10, prestigeChaser: 8, moneyFocused: 8, loyal: -15, careerBuilder: -12, builder: -10 }[coach.ambition] || 0;
      const cr = coach.careerRecord || {};
      p -= Math.min(24, (cr.nationalTitles || 0) * 8) + Math.min(10, (cr.conferenceTitles || 0) * 2);
      if ((coach.yearsAtSchool || 0) >= 8) p -= 8;        // an institution where they are
      if ((coach.age || 45) < 40) p += 6;                 // young and hungry for the big stage
      else if ((coach.age || 45) >= 58) p -= 10;
    }
    p += divStep > 0 ? 8 : divStep < 0 ? -25 : 0;         // the ladder runs up the divisions
    p += bossPull;
    return Math.round(Utils.clamp(p, source === 'head' ? 3 : 5, source === 'head' ? 85 : 95));
  }

  // The answer a coach will give this offseason, fixed per coach/program/year.
  function staffRoll(gameState, coachId) {
    const key = `${coachId}|${gameState.playerSchoolId}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = ((h * 31) + key.charCodeAt(i)) >>> 0;
    return new window.XCD.core.SeededRNG((gameState.seed ^ (gameState.year * 197) ^ h) >>> 0).next();
  }

  function declinedThisYear(gameState, coachId) {
    const d = gameState.staffDeclined;
    return !!(d && d.year === gameState.year && d.ids.includes(coachId));
  }

  /*
   * Everyone the player could put in the assistant's chair right now.
   * Returns { reach, gate, counts, rows } — each row:
   *   { key, coach, source, from (school | null), interest, locked (reason |
   *     null), declined }
   * Sitting coaches are listed best-first and capped (the top of the market
   * is what matters); a few just beyond the reach cap are shown locked so the
   * cap is visible.
   */
  function staffMarket(gameState) {
    const Legacy = window.XCD.engine.Legacy;
    const school = gameState.getPlayerSchool();
    const reach = hiringReach(gameState);
    const gate = canHireAssistant(gameState);
    const rows = [];
    if (!school || gameState.isAssistant()) return { reach, gate, rows, counts: {} };
    const tooBig = (c) => Math.round(c.reputation || 0) > reach.cap
      ? `Reputation ${Math.round(c.reputation || 0)} is beyond your hiring reach (${reach.cap})` : null;
    const push = (coach, source, from, key) => rows.push({
      key: key || coach.id, coach, source, from: from || null,
      interest: source === 'applicant' ? 100 : staffInterest(gameState, coach, source, from),
      locked: source === 'applicant' ? null : (tooProminent(coach, source) || tooBig(coach)),
      declined: declinedThisYear(gameState, coach.id)
    });

    // Applicants: the weekly shortlist. (A real free agent on it is listed
    // with the free agents instead.)
    const inWorld = (c) => !!gameState.world.coaches[c.id];
    assistantCandidates(gameState).forEach((c, i) => { if (!inWorld(c)) push(c, 'applicant', null, String(i)); });

    // Free agents: every coach out of work.
    Object.values(gameState.world.coaches)
      .filter((c) => !c.schoolId && !c.isPlayer && (c.age || 40) < 68 && !Legacy.hasLeftSchool(school, c.id))
      .sort((a, b) => b.overallRating - a.overallRating)
      .forEach((c) => push(c, 'freeAgent', null));

    // Coaches with jobs elsewhere: assistants a step below, head coaches well
    // below. Best first; the list is capped, plus a few beyond the reach cap.
    const sitting = { assistant: [], head: [] };
    Object.values(gameState.world.schools).forEach((s) => {
      if (s.id === school.id) return;
      const gap = (school.prestige || 0) - (s.prestige || 0);
      const a = s.assistantId && gameState.world.coaches[s.assistantId];
      if (a && !a.isPlayer && gap >= STAFF_STEP_UP && (a.age || 40) < 68 && !Legacy.hasLeftSchool(school, a.id)) {
        sitting.assistant.push({ c: a, s });
      }
      const h = s.coachId && gameState.world.coaches[s.coachId];
      if (h && !h.isPlayer && gap >= STAFF_HEAD_GAP && (h.age || 45) < 68 && !Legacy.hasLeftSchool(school, h.id)) {
        sitting.head.push({ c: h, s });
      }
    });
    ['assistant', 'head'].forEach((source) => {
      const list = sitting[source].sort((x, y) => y.c.overallRating - x.c.overallRating);
      const out = (c) => tooBig(c) || tooProminent(c, source);
      list.filter((x) => !out(x.c)).slice(0, STAFF_LIST[source]).forEach((x) => push(x.c, source, x.s));
      list.filter((x) => out(x.c)).slice(0, STAFF_LIST.locked).forEach((x) => push(x.c, source, x.s));
    });

    const counts = { applicant: 0, freeAgent: 0, assistant: 0, head: 0 };
    rows.forEach((r) => { counts[r.source]++; });
    return { reach, gate, rows, counts };
  }

  // A fresh young assistant for a program whose seat just opened.
  function newAssistantFor(gameState, school, rng) {
    const a = window.XCD.engine.WorldGenerator.buildAssistant(rng, school);
    a.age = rng.int(25, 40);
    a.reputation = Utils.clamp(a.reputation || 12, 3, 28);
    a.yearsAtSchool = 0;
    a.careerRecord.seasons = 0;
    a.stints = [{ schoolId: school.id, school: school.name, division: school.division || 'DI', startYear: gameState.year, endYear: null }];
    return a;
  }

  /*
   * Offer the assistant's chair to anyone on the staff market (by row key).
   * Applicants and free agents who want the job simply sign. A coach with a
   * job answers by their interest; a yes pulls them out of their old program,
   * which fills the hole behind them — an assistant's seat with a new hire, a
   * head coach's chair through the real carousel (chains and all).
   */
  function offerAssistantJob(gameState, key) {
    const Legacy = window.XCD.engine.Legacy;
    const school = gameState.getPlayerSchool();
    const gate = canHireAssistant(gameState);
    if (!gate.ok) return { ok: false, message: gate.why };
    const row = staffMarket(gameState).rows.find((r) => r.key === key);
    if (!row) return { ok: false, message: 'That coach is no longer on the market.' };
    const c = row.coach;
    if (row.source === 'applicant') return hireAssistant(gameState, c);
    if (row.locked) return { ok: false, message: `${c.fullName} is out of reach — ${row.locked.charAt(0).toLowerCase()}${row.locked.slice(1)}.` };
    if (row.declined) return { ok: false, message: `${c.fullName} already turned ${school.name} down this offseason.` };
    const current = school.assistantId && gameState.world.coaches[school.assistantId];
    if (current && current.isPlayer) return { ok: false, message: 'You cannot replace yourself.' };

    if (staffRoll(gameState, c.id) >= row.interest / 100) {
      if (!gameState.staffDeclined || gameState.staffDeclined.year !== gameState.year) {
        gameState.staffDeclined = { year: gameState.year, ids: [] };
      }
      gameState.staffDeclined.ids.push(c.id);
      const where = row.from ? ` and stays at ${row.from.name}` : '';
      return { ok: false, declined: true, message: `${c.fullName} turns the job down${where}. Your hire is still open.` };
    }

    const wasVacancy = !!gate.vacancy;
    const from = row.from;
    if (row.source === 'freeAgent') {
      if (!c.origin) c.origin = 'Free agent';
      installAssistant(gameState, c, wasVacancy);
      return { ok: true, message: `${c.fullName} joins your staff.` };
    }

    // A coach with a job: the incumbent goes first, then the old program
    // fills the hole, then the new coordinator is seated — so the carousel
    // that fills a head chair never sees the player's staff mid-move.
    const rng = new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 59 + gameState.week * 13 + from.id.length) >>> 0);
    releaseCurrentAssistant(gameState);
    Legacy.closeStint(gameState, c, from, gameState.year, 'left');
    c.schoolId = school.id;
    if (row.source === 'assistant') {
      from.assistantId = null;
      const fill = newAssistantFor(gameState, from, rng);
      gameState.world.coaches[fill.id] = fill;
      from.assistantId = fill.id;
      Legacy.linkStaff(gameState, from, gameState.year);
      c.origin = `Hired from the ${from.name} staff`;
      gameState.logNews(`STAFF RAID: ${school.name} hires assistant ${c.fullName} away from ${from.name}.`);
    } else {
      c.role = 'Assistant';
      c.reputation = Math.min(c.reputation || 0, 92); // the assistant ladder tops out lower
      from.coachId = null;
      from.coachChangedYear = gameState.year;
      c.origin = `Former head coach at ${from.name}`;
      gameState.logNews(`STAFF COUP: ${c.fullName} gives up the head job at ${from.name} to join the ${school.name} staff. ${from.name} opens a head-coaching search.`);
      window.XCD.engine.Careers.fillVacancy(gameState, from, rng, 0);
      // Filling a head chair can promote another program's assistant. That
      // seat would otherwise sit empty until the next offseason, so every
      // program the chain touched is given a coordinator now.
      Object.values(gameState.world.schools).forEach((s) => {
        if (s.id === school.id || (s.assistantId && gameState.world.coaches[s.assistantId])) return;
        const a = newAssistantFor(gameState, s, rng);
        gameState.world.coaches[a.id] = a;
        s.assistantId = a.id;
        Legacy.linkStaff(gameState, s, gameState.year);
      });
    }
    installAssistant(gameState, c, wasVacancy);
    return { ok: true, poached: true, message: `${c.fullName} leaves ${from.name} to join your staff.` };
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
    STRUGGLE_LINE,
    setSeasonExpectations,
    seasonExpectation,
    expectedFinish,
    recordSeasonFinishes,
    yearlyProgression,
    awardPoints,
    PROGRESSION_RATE,
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
    hiringReach,
    staffInterest,
    staffMarket,
    offerAssistantJob,
    STAFF_STEP_UP,
    STAFF_HEAD_GAP,
    STAFF_HEAD_REP_MAX,
    CORE_RATINGS: CORE,
    SECONDARY_RATINGS: SECONDARY
  };
})();
