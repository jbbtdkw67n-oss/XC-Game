/*
 * RecruitingEngine — the heart of Phase 2.
 *
 * Responsibilities:
 *  - Generate a national recruiting class every year (thousands of recruits
 *    with star ratings, rankings, hidden motivations, and preferences).
 *  - Compute each recruit's "appeal" for a school from fit + relationship.
 *  - Process the player's recruiting actions (points + budget economy).
 *  - Run AI recruiting for every school every week.
 *  - Handle verbal commitments, flips, late risers, and signing day.
 *  - Enroll signed recruits at the yearly rollover and rank classes.
 */
(function () {
  const D = window.XCD.data;
  const M = window.XCD.models;
  const Utils = window.XCD.core.Utils;

  /* ================================================================ *
   * Geography
   * ================================================================ */
  const distCache = new Map();
  function distanceMiles(stateA, stateB) {
    if (stateA === stateB) return 40;
    const key = stateA < stateB ? stateA + stateB : stateB + stateA;
    let cached = distCache.get(key);
    if (cached !== undefined) return cached;
    const a = D.STATE_COORDS[stateA];
    const b = D.STATE_COORDS[stateB];
    if (!a || !b) return 900;
    const R = 3959;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const lat1 = a[0] * Math.PI / 180;
    const lat2 = b[0] * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    cached = Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
    distCache.set(key, cached);
    return cached;
  }

  /*
   * Weekly computation context: caches that make one simulated week cheap.
   *  - rosterMarks: per school/gender, the 5th & 7th best returner overall
   *    (playing-time math) computed once instead of per appeal() call.
   *  - pools: unsigned/uncommitted recruits sorted by composite per gender,
   *    letting AI board-building binary-search a talent window.
   */
  function buildWeekContext(gameState) {
    const rosterMarks = {};
    for (const school of Object.values(gameState.world.schools)) {
      const marks = {};
      ['M', 'W'].forEach((gender) => {
        const overalls = (gender === 'M' ? school.rosterM : school.rosterW)
          .map((id) => gameState.world.athletes[id])
          .filter(Boolean)
          .map((a) => a.currentOverall)
          .sort((a, b) => b - a);
        marks[gender] = { fifth: overalls[4] ?? 40, seventh: overalls[6] ?? 35 };
      });
      rosterMarks[school.id] = marks;
    }

    const pools = { M: [], W: [] };
    const commitCounts = {};
    for (const r of Object.values(gameState.world.recruits || {})) {
      if (r.committedTo) {
        const c = (commitCounts[r.committedTo] = commitCounts[r.committedTo] || { M: 0, W: 0 });
        c[r.gender] += 1;
        continue;
      }
      if (!r.signed) pools[r.gender].push(r);
    }
    pools.M.sort((a, b) => recruitComposite(a) - recruitComposite(b));
    pools.W.sort((a, b) => recruitComposite(a) - recruitComposite(b));

    return { rosterMarks, pools, commitCounts };
  }

  /* ================================================================ *
   * Recruit class generation
   * ================================================================ */
  function buildRecruit(rng, gender, gradYear) {
    const source = rng.weightedChoice(D.RECRUIT_SOURCES, (s) => s === 'HS' ? 90 : s === 'JUCO' ? 6 : 4);
    const international = source === 'International';
    const country = international ? rng.choice(D.INTERNATIONAL_COUNTRIES) : 'USA';

    // Wide national talent distribution — the elite tail is tiny.
    const potential = Utils.clamp(Math.round(rng.gaussian(58, 15)), 25, 99);
    // HS seniors are raw; JUCO transfers arrive more developed.
    const devFactor = source === 'JUCO' ? rng.float(0.62, 0.75) : rng.float(0.42, 0.58);
    const statMean = Utils.clamp(potential * devFactor, 15, 90);
    const statFor = () => rng.gaussianRange(statMean, 8, 8, 95);

    let hometown;
    if (international) {
      hometown = { city: `${rng.choice(D.TOWN_ROOTS)}${rng.choice(D.TOWN_SUFFIXES)}`, state: 'INT', region: 'International' };
    } else {
      const states = Object.keys(D.STATE_REGION);
      const state = rng.choice(states);
      hometown = {
        city: `${rng.choice(D.TOWN_ROOTS)}${rng.choice(D.TOWN_SUFFIXES)}`,
        state,
        region: D.STATE_REGION[state]
      };
    }

    const motivationPool = rng.shuffle(D.MOTIVATIONS.map((m) => m.key));
    const motivations = motivationPool.slice(0, rng.int(2, 3));

    const imp = (base) => Utils.clamp(Math.round(rng.gaussian(base, 18)), 15, 100);
    const importance = {
      playingTime: imp(50), development: imp(55), prestige: imp(50),
      location: international ? imp(25) : imp(50), nil: imp(30),
      academics: imp(45), facilities: imp(45)
    };
    // Motivations pull the visible importance sliders in their direction.
    if (motivations.includes('homebody')) importance.location = Utils.clamp(importance.location + 30, 15, 100);
    if (motivations.includes('scholar')) importance.academics = Utils.clamp(importance.academics + 30, 15, 100);
    if (motivations.includes('nil-money')) importance.nil = Utils.clamp(importance.nil + 35, 15, 100);
    if (motivations.includes('facilities-hound')) importance.facilities = Utils.clamp(importance.facilities + 30, 15, 100);
    if (motivations.includes('impact')) importance.playingTime = Utils.clamp(importance.playingTime + 30, 15, 100);
    if (motivations.includes('project')) importance.development = Utils.clamp(importance.development + 30, 15, 100);
    if (motivations.includes('title-chaser') || motivations.includes('spotlight')) {
      importance.prestige = Utils.clamp(importance.prestige + 30, 15, 100);
    }

    const decisionStyleRoll = rng.next();
    const decisionWeek = decisionStyleRoll < 0.2 ? rng.int(D.RECRUITING.EARLY_COMMIT_WEEK, 5)
      : decisionStyleRoll < 0.7 ? rng.int(6, 9)
      : rng.int(10, D.RECRUITING.SIGNING_WEEK);

    const firstName = gender === 'M' ? rng.choice(D.FIRST_NAMES_M) : rng.choice(D.FIRST_NAMES_W);

    const recruit = new M.Recruit({
      firstName,
      lastName: rng.choice(D.LAST_NAMES),
      gender,
      hometownCity: Utils.capitalize(hometown.city),
      hometownState: hometown.state,
      region: hometown.region,
      classYear: 'Freshman',
      age: source === 'JUCO' ? rng.int(19, 21) : rng.int(17, 19),
      heightIn: rng.int(gender === 'M' ? 66 : 62, gender === 'M' ? 76 : 70),
      weightLb: rng.int(gender === 'M' ? 110 : 92, gender === 'M' ? 160 : 132),
      major: rng.choice(D.MAJORS),

      academics: rng.gaussianRange(62, 16, 25, 99),
      discipline: rng.gaussianRange(60, 14, 20, 99),
      leadership: rng.gaussianRange(45, 15, 15, 99),
      confidence: rng.gaussianRange(58, 15, 15, 99),
      consistency: rng.gaussianRange(55, 14, 15, 99),
      workEthic: rng.gaussianRange(62, 14, 20, 99),
      coachability: rng.gaussianRange(62, 14, 15, 99),
      mentalToughness: statFor(),
      raceIQ: rng.gaussianRange(statMean - 8, 10, 10, 95),
      personality: rng.choice(D.ATHLETE_PERSONALITIES),

      preferredDistance: rng.choice(D.PREFERRED_DISTANCES),
      preferredClimate: rng.choice(D.PREFERRED_CLIMATES),
      preferredSchoolSize: rng.choice(D.PREFERRED_SCHOOL_SIZES),

      potential,
      peakOverall: potential,

      vo2Max: statFor(), lactateThreshold: statFor(), runningEconomy: statFor(),
      stamina: statFor(), speed: statFor(),
      injuryResistance: rng.gaussianRange(58, 14, 15, 99),
      hillAdaptation: rng.gaussianRange(38, 12, 10, 80),

      fatigue: rng.int(0, 15),
      fitness: Math.round(Utils.clamp(statMean - rng.int(0, 10), 10, 85)),
      morale: rng.int(60, 90),
      devProfile: rng.weightedChoice(D.DEV_PROFILES, (p) => p.weight).type,
      eligibilityRemaining: source === 'JUCO' ? 3 : 4,

      source,
      country,
      gradYear,
      motivations,
      parentsInfluence: rng.gaussianRange(50, 22, 5, 99),
      importance,
      decisionWeek,
      breakout: rng.bool(0.05)
    });
    recruit.recalculateOverall();
    return recruit;
  }

  function generateClass(gameState, rng) {
    const gradYear = gameState.year + 1;
    const recruits = {};
    const perGender = D.RECRUITING.CLASS_SIZE_PER_GENDER;

    ['M', 'W'].forEach((gender) => {
      const pool = [];
      for (let i = 0; i < perGender; i++) {
        const r = buildRecruit(rng, gender, gradYear);
        pool.push(r);
        recruits[r.id] = r;
      }
      rankPool(pool);
    });

    gameState.world.recruits = recruits;
    gameState.recruiting.classYear = gradYear;
    return recruits;
  }

  // Composite value drives stars & rankings: mostly ceiling, some floor.
  function recruitComposite(r) {
    return r.potential * 0.62 + r.currentOverall * 0.38;
  }

  function rankPool(pool) {
    pool.sort((a, b) => recruitComposite(b) - recruitComposite(a));
    const n = pool.length;
    const byState = {};
    const byRegion = {};
    pool.forEach((r, i) => {
      r.nationalRank = i + 1;
      const pct = i / n;
      r.starRating = pct < 0.01 ? 5 : pct < 0.06 ? 4 : pct < 0.26 ? 3 : pct < 0.66 ? 2 : 1;
      byState[r.hometownState] = (byState[r.hometownState] || 0) + 1;
      r.stateRank = byState[r.hometownState];
      byRegion[r.region] = (byRegion[r.region] || 0) + 1;
      r.regionalRank = byRegion[r.region];
    });
  }

  /* ================================================================ *
   * Appeal model — how attractive is `school` to `recruit`?
   * ================================================================ */
  function projectedFreshmanOverall(recruit) {
    // Rough one-summer improvement estimate used for playing-time math.
    return recruit.currentOverall + Math.round((recruit.potential - recruit.currentOverall) * 0.15);
  }

  function playingTimeScore(gameState, school, recruit, ctx) {
    let fifth, seventh;
    if (ctx) {
      const marks = ctx.rosterMarks[school.id][recruit.gender];
      fifth = marks.fifth; seventh = marks.seventh;
    } else {
      const roster = gameState.getRoster(school.id, recruit.gender)
        .map((a) => a.currentOverall)
        .sort((a, b) => b - a);
      fifth = roster[4] ?? 40;
      seventh = roster[6] ?? 35;
    }
    const proj = projectedFreshmanOverall(recruit);
    if (proj >= fifth) return 95;        // walks into the scoring five
    if (proj >= seventh) return 70;      // varsity seven
    if (proj >= seventh - 8) return 45;  // fringe
    return 20;
  }

  function climateScore(school, recruit) {
    const t = school.weather.tempBase;
    const pref = recruit.preferredClimate;
    if (pref === 'No Preference') return 60;
    if (pref === 'Warm') return t >= 70 ? 90 : t >= 60 ? 60 : 30;
    if (pref === 'Cold') return t <= 52 ? 90 : t <= 60 ? 60 : 30;
    return t > 52 && t < 70 ? 85 : 55; // Temperate
  }

  function fitScore(gameState, school, recruit, ctx) {
    const coach = gameState.getCoach(school.coachId);
    const dist = recruit.hometownState === 'INT' ? 1200 : distanceMiles(recruit.hometownState, school.state);
    const imp = recruit.importance;

    const scores = {
      prestige: school.prestige,
      location: Utils.clamp(100 - dist / 18, 0, 100),
      academics: school.academics,
      facilities: school.facilitiesOverall,
      nil: Utils.clamp(Math.round(school.budget.nil / 1200), 5, 100),
      playingTime: playingTimeScore(gameState, school, recruit, ctx),
      development: coach ? Math.round(coach.development * 0.65 + school.facilities.sportsScienceLab * 0.35) : 50
    };

    let total = 0;
    let weight = 0;
    for (const key in scores) {
      total += scores[key] * imp[key];
      weight += imp[key];
    }
    let fit = total / weight;

    // Hidden motivations act as secret bonuses/penalties on top of the
    // visible importance weights.
    const mot = recruit.motivations;
    if (mot.includes('homebody')) fit += dist < 150 ? 10 : dist > 800 ? -12 : 0;
    if (mot.includes('title-chaser')) fit += school.prestige >= 80 ? 10 : school.prestige < 55 ? -8 : 0;
    if (mot.includes('scholar')) fit += school.academics >= 80 ? 8 : 0;
    if (mot.includes('warm-weather')) fit += school.weather.tempBase >= 68 ? 8 : school.weather.tempBase <= 52 ? -8 : 0;
    if (mot.includes('cold-weather')) fit += school.weather.tempBase <= 55 ? 8 : school.weather.tempBase >= 70 ? -8 : 0;
    if (mot.includes('altitude-seeker')) fit += school.weather.altitude === 'High' ? 12 : school.weather.altitude === 'Medium' ? 5 : -3;
    if (mot.includes('spotlight')) fit += school.conferenceTier === 1 ? 10 : school.conferenceTier >= 3 ? -6 : 0;
    if (mot.includes('underdog')) fit += school.prestige < 55 ? 8 : school.prestige > 80 ? -5 : 0;
    if (mot.includes('facilities-hound')) fit += school.facilitiesOverall >= 75 ? 6 : 0;

    // Climate preference (visible) folds in lightly.
    fit += (climateScore(school, recruit) - 60) * 0.1;

    return Utils.clamp(fit, 5, 99);
  }

  // Total appeal = long-term fit + relationship built through recruiting.
  function appeal(gameState, school, recruit, ctx) {
    const st = recruit.getSchoolState(school.id);
    const rel = st ? st.relationship : 0;
    const interest = st ? st.interest : 0;
    const offered = st && st.offered ? 8 : 0;
    const visited = st && st.visited ? 5 : 0;
    return Utils.clamp(
      fitScore(gameState, school, recruit, ctx) * 0.55 + rel * 0.25 + interest * 0.20 + offered + visited,
      0, 100
    );
  }

  /* ================================================================ *
   * Player economy
   * ================================================================ */
  function weeklyPoints(gameState) {
    const coach = gameState.getPlayerCoach();
    const school = gameState.getPlayerSchool();
    const assistant = gameState.getCoach(school.assistantId);
    return 10 + Math.round(coach.recruiting / 8) + (assistant ? Math.round(assistant.recruiting / 20) : 0);
  }

  function scholarshipsUsed(gameState, schoolId, gender) {
    return Object.values(gameState.world.recruits || {}).filter((r) =>
      r.gender === gender &&
      (r.committedTo === schoolId ||
        (!r.committedTo && r.interests[schoolId] && r.interests[schoolId].offered))).length;
  }

  /*
   * Execute a player recruiting action. Returns { ok, message }.
   */
  function doAction(gameState, recruitId, actionKey) {
    const rec = gameState.world.recruits[recruitId];
    const action = D.RECRUIT_ACTIONS[actionKey];
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    const R = gameState.recruiting;

    if (!rec || !action) return { ok: false, message: 'Unknown recruit or action.' };
    if (rec.signed) return { ok: false, message: `${rec.fullName} has already signed.` };
    if (gameState.week > D.RECRUITING.SIGNING_WEEK) return { ok: false, message: 'The signing period is over for this cycle.' };
    if (R.pointsLeft < action.points) return { ok: false, message: 'Not enough recruiting points this week.' };
    if (R.budgetLeft < action.cost) return { ok: false, message: 'Recruiting budget is exhausted for this year.' };

    const usedThisWeek = R.actionsThisWeek[recruitId] || 0;
    if (usedThisWeek >= D.MAX_ACTIONS_PER_RECRUIT_WEEK) {
      return { ok: false, message: `You've already contacted ${rec.lastName} twice this week.` };
    }

    const st = rec.getSchoolState(school.id, true);
    if (actionKey === 'offer' && st.offered) return { ok: false, message: 'Scholarship already offered.' };
    if (action.requires === 'interest30' && st.interest < 30) {
      return { ok: false, message: `${rec.lastName} isn't interested enough to visit campus yet (needs 30 interest).` };
    }
    if (action.requires === 'visited' && !st.visited) {
      return { ok: false, message: 'An overnight requires a campus visit first.' };
    }
    if (actionKey === 'offer') {
      const cap = rec.gender === 'M' ? Math.floor(school.scholarshipsAvailableM / 2) : Math.floor(school.scholarshipsAvailableW / 2);
      if (scholarshipsUsed(gameState, school.id, rec.gender) >= Math.max(4, cap)) {
        return { ok: false, message: 'No scholarship slots left for this class (offers + commits at cap).' };
      }
    }

    // Pay the costs.
    R.pointsLeft -= action.points;
    R.budgetLeft -= action.cost;
    R.actionsThisWeek[recruitId] = usedThisWeek + 1;

    // Effect scaling: charisma sells the relationship; personality matters.
    const charismaMul = 0.75 + coach.charisma / 200;                 // 0.85–1.25
    const coachabilityMul = 0.8 + rec.coachability / 250;
    let rel = action.relationship * charismaMul * coachabilityMul;
    let int = action.interest * charismaMul;

    // Campus visit lands harder when the campus/facilities are genuinely good.
    if (actionKey === 'campusVisit') {
      int *= 0.6 + (school.campusAppeal + school.facilitiesOverall) / 250;
      st.visited = true;
    }
    if (actionKey === 'hostOvernight') st.overnight = true;
    if (actionKey === 'assistantVisit') {
      const assistant = gameState.getCoach(school.assistantId);
      const aMul = assistant ? 0.7 + assistant.recruiting / 160 : 0.8;
      rel *= aMul; int *= aMul;
    }
    // Home visits work through the family.
    if (actionKey === 'homeVisit') rel *= 0.8 + rec.parentsInfluence / 250;
    if (actionKey === 'offer') {
      st.offered = true;
      int += rec.starRating >= 4 ? 0 : 4; // lower-rated kids are flattered
    }

    st.relationship = Utils.clamp(st.relationship + rel, 0, 100);
    st.interest = Utils.clamp(st.interest + int, 0, 100);

    // Scouting knowledge + motivation discovery.
    const know = rec.playerKnowledge;
    know.scout = Utils.clamp(know.scout + action.scout, 0, 100);
    let discovered = null;
    if (Math.random() < action.reveal) {
      const hidden = rec.motivations.filter((m) => !know.revealed.includes(m));
      if (hidden.length) {
        discovered = hidden[Math.floor(Math.random() * hidden.length)];
        know.revealed.push(discovered);
      }
    }

    const messages = {
      letter: `Sent a letter to ${rec.fullName}.`,
      call: `Good phone call with ${rec.fullName}.`,
      watchRace: `Scouted ${rec.fullName} at a race — much clearer picture of their ability.`,
      assistantVisit: `Your assistant visited ${rec.fullName}.`,
      homeVisit: `Sat down with ${rec.fullName}'s family.`,
      campusVisit: `${rec.fullName} toured campus.`,
      hostOvernight: `${rec.fullName} stayed overnight with the team.`,
      meetTeam: `${rec.fullName} met the squad.`,
      offer: `Scholarship offered to ${rec.fullName}!`
    };
    let message = messages[actionKey];
    if (discovered) {
      const label = D.MOTIVATIONS.find((m) => m.key === discovered)?.label || discovered;
      message += ` You learned something: ${label.toLowerCase()}.`;
    }
    return { ok: true, message, discovered };
  }

  /* ================================================================ *
   * AI recruiting
   * ================================================================ */
  // Binary search: first index in ascending-composite pool >= value.
  function lowerBound(pool, value) {
    let lo = 0, hi = pool.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (recruitComposite(pool[mid]) < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function ensureAIBoard(gameState, school, rng, ctx) {
    const R = gameState.recruiting;
    R.aiBoards[school.id] = R.aiBoards[school.id] || { M: [], W: [] };
    const board = R.aiBoards[school.id];

    ['M', 'W'].forEach((gender) => {
      board[gender] = board[gender].filter((id) => {
        const r = gameState.world.recruits[id];
        return r && !r.signed && (!r.committedTo || r.committedTo === school.id);
      });
      if (board[gender].length >= 8) return;

      // Target recruits whose composite matches the program's level, with
      // a bias toward nearby kids (regional recruiting territories).
      // Random sampling inside the talent window spreads 350 programs
      // across the whole class instead of piling onto the same names.
      const pool = ctx.pools[gender];
      const targetComposite = 30 + school.prestige * 0.55;
      let lo = lowerBound(pool, targetComposite - 18);
      let hi = lowerBound(pool, targetComposite + 18);
      if (hi - lo < 25) { // elite programs: widen downward so the window isn't empty
        lo = Math.max(0, lo - 60);
      }
      const windowSize = hi - lo;
      if (windowSize <= 0) return;

      const onBoard = new Set(board[gender]);
      let attempts = 0;
      while (board[gender].length < 8 && attempts < 40) {
        attempts++;
        const r = pool[lo + rng.int(0, windowSize - 1)];
        if (!r || r.signed || r.committedTo || onBoard.has(r.id)) continue;
        // Regional bias: nearby recruits usually make the board; far ones sometimes.
        const dist = r.hometownState === 'INT' ? 1000 : distanceMiles(r.hometownState, school.state);
        const keepChance = Utils.clamp(1.05 - dist / 1600, 0.25, 1);
        if (!rng.bool(keepChance)) continue;
        board[gender].push(r.id);
        onBoard.add(r.id);
      }
    });
  }

  function aiRecruitWeek(gameState, rng, ctx) {
    const R = gameState.recruiting;
    const signingOver = gameState.week > D.RECRUITING.SIGNING_WEEK;
    if (signingOver) return;

    for (const school of Object.values(gameState.world.schools)) {
      if (school.id === gameState.playerSchoolId) continue;
      const coach = gameState.getCoach(school.coachId);
      if (!coach) continue;

      ensureAIBoard(gameState, school, rng, ctx);
      const board = R.aiBoards[school.id];
      const aggressive = coach.personality === 'Aggressive Recruiter';

      ['M', 'W'].forEach((gender) => {
        const committedCount = (ctx.commitCounts[school.id] && ctx.commitCounts[school.id][gender]) || 0;
        if (committedCount >= D.RECRUITING.AI_SIGNEES_TARGET) return;

        // AI spends 2-3 abstract "pushes" per gender per week on top targets.
        const pushes = aggressive ? 3 : 2;
        const targets = board[gender]
          .map((id) => gameState.world.recruits[id])
          .filter((r) => r && !r.signed && !r.committedTo)
          .sort((a, b) => recruitComposite(b) - recruitComposite(a))
          .slice(0, pushes);

        targets.forEach((rec) => {
          const st = rec.getSchoolState(school.id, true);
          const push = (3 + coach.recruiting / 18) * (0.8 + rng.next() * 0.4);
          st.relationship = Utils.clamp(st.relationship + push, 0, 100);
          st.interest = Utils.clamp(st.interest + push * 0.75, 0, 100);
          // Offer once the AI believes in the match.
          if (!st.offered && st.interest > 35 && recruitComposite(rec) <= 34 + school.prestige * 0.62) {
            st.offered = true;
            st.interest = Utils.clamp(st.interest + 8, 0, 100);
          }
        });
      });
    }
  }

  /* ================================================================ *
   * Weekly decisions: breakouts, commitments, flips
   * ================================================================ */
  function processDecisions(gameState, rng, ctx) {
    const week = gameState.week;
    const player = gameState.playerSchoolId;
    if (week > D.RECRUITING.SIGNING_WEEK) return;

    for (const rec of Object.values(gameState.world.recruits)) {
      if (rec.signed) continue;

      // Late risers: a hidden breakout fires mid-season and bumps ratings.
      if (rec.breakout && !rec.breakoutFired && week >= 3 && week <= 9 && rng.bool(0.18)) {
        rec.breakoutFired = true;
        rec.potential = Utils.clamp(rec.potential + rng.int(5, 10), 25, 99);
        ['vo2Max', 'stamina', 'lactateThreshold', 'runningEconomy'].forEach((k) => {
          rec[k] = Utils.clamp(rec[k] + rng.int(4, 9), 8, 97);
        });
        rec.recalculateOverall();
        if (rec.starRating >= 3 || rec.playerKnowledge.scout > 20) {
          gameState.logNews(`Late riser: ${rec.fullName} (${rec.hometownState}) is turning heads with breakout races this fall.`);
        }
      }

      const offers = Object.keys(rec.interests).filter((sid) => rec.interests[sid].offered);

      if (!rec.committedTo) {
        if (week < D.RECRUITING.EARLY_COMMIT_WEEK || week < rec.decisionWeek || offers.length === 0) continue;

        const ranked = offers
          .map((sid) => ({ sid, appeal: appeal(gameState, gameState.getSchool(sid), rec, ctx) }))
          .sort((a, b) => b.appeal - a.appeal);
        const best = ranked[0];
        if (best.appeal < 52) continue;

        // Probability of pulling the trigger rises as signing day nears.
        const urgency = (week - rec.decisionWeek + 1) / Math.max(1, D.RECRUITING.SIGNING_WEEK - rec.decisionWeek + 1);
        const p = Utils.clamp(0.08 + urgency * 0.35 + (best.appeal - 52) / 150, 0, 0.75);
        if (rng.bool(p)) {
          // Usually the leader, but not always — hidden hearts want what they want.
          const pool = ranked.slice(0, 3);
          const choice = rng.weightedChoice(pool, (o) => Math.pow(o.appeal, 3));
          rec.committedTo = choice.sid;
          rec.commitWeek = week;
          const school = gameState.getSchool(choice.sid);
          if (rec.starRating >= 4 || choice.sid === player) {
            gameState.logNews(`${'★'.repeat(rec.starRating)} ${rec.fullName} (${rec.hometownState === 'INT' ? rec.country : rec.hometownState}) commits to ${school.name}!`);
          }
        }
      } else {
        // Flip watch: a clearly better suitor can steal a verbal commit.
        const committedSchool = gameState.getSchool(rec.committedTo);
        if (!committedSchool) { rec.committedTo = null; continue; }
        const committedAppeal = appeal(gameState, committedSchool, rec, ctx);
        for (const sid of offers) {
          if (sid === rec.committedTo) continue;
          const rivalAppeal = appeal(gameState, gameState.getSchool(sid), rec, ctx);
          const loyaltyBrake = rec.personality === 'Team-First' || rec.discipline > 75 ? 6 : 0;
          if (rivalAppeal > committedAppeal + 12 + loyaltyBrake && rng.bool(0.10)) {
            const from = committedSchool.name;
            rec.committedTo = sid;
            rec.commitWeek = week;
            const to = gameState.getSchool(sid).name;
            if (rec.starRating >= 3 || sid === player || committedSchool.id === player) {
              gameState.logNews(`FLIP: ${rec.fullName} decommits from ${from} and pledges to ${to}!`);
            }
            break;
          }
        }
        // Cold feet: commits with cratering appeal can reopen recruitment.
        if (rec.committedTo && committedAppeal < 40 && rng.bool(0.08)) {
          const from = gameState.getSchool(rec.committedTo).name;
          rec.committedTo = null;
          rec.commitWeek = null;
          if (rec.starRating >= 3 || committedSchool.id === player) {
            gameState.logNews(`${rec.fullName} has decommitted from ${from} and reopened his recruitment.`);
          }
        }
      }
    }
  }

  /* ================================================================ *
   * Signing day & class rankings
   * ================================================================ */
  function signingDay(gameState, rng, ctx) {
    const classes = {}; // schoolId -> [recruit]
    for (const rec of Object.values(gameState.world.recruits)) {
      if (rec.signed) continue;

      if (!rec.committedTo) {
        // Uncommitted seniors take their best offer if it's palatable.
        const offers = Object.keys(rec.interests).filter((sid) => rec.interests[sid].offered);
        if (offers.length) {
          const ranked = offers
            .map((sid) => ({ sid, appeal: appeal(gameState, gameState.getSchool(sid), rec, ctx) }))
            .sort((a, b) => b.appeal - a.appeal);
          if (ranked[0].appeal >= 45) rec.committedTo = ranked[0].sid;
        }
      }
      if (rec.committedTo) {
        rec.signed = true;
        (classes[rec.committedTo] = classes[rec.committedTo] || []).push(rec);
      }
    }

    // Rank the signing classes.
    const ranking = Object.entries(classes)
      .map(([sid, recs]) => ({
        schoolId: sid,
        score: Math.round(recs.reduce((sum, r) => sum + Math.pow(r.starRating, 2.2) * 10 + recruitComposite(r) / 4, 0)),
        count: recs.length,
        stars: Math.round(recs.reduce((s, r) => s + r.starRating, 0) / recs.length * 10) / 10
      }))
      .sort((a, b) => b.score - a.score);

    gameState.history.recruitingClasses[gameState.year] = ranking.slice(0, 50).map((entry, i) => ({
      rank: i + 1,
      schoolId: entry.schoolId,
      schoolName: gameState.getSchool(entry.schoolId)?.name || '?',
      score: entry.score,
      count: entry.count,
      avgStars: entry.stars
    }));

    const top = ranking[0] && gameState.getSchool(ranking[0].schoolId);
    if (top) gameState.logNews(`SIGNING DAY: ${top.name} hauls in the nation's #1 recruiting class (${ranking[0].count} signees).`);

    const playerRank = ranking.findIndex((e) => e.schoolId === gameState.playerSchoolId);
    const playerClass = classes[gameState.playerSchoolId] || [];
    if (playerClass.length) {
      gameState.logNews(`Your ${playerClass.length}-runner class signs — ranked #${playerRank + 1} nationally.`);
    } else {
      gameState.logNews('Signing day passes without a single signature for your program.');
    }
  }

  /* ================================================================ *
   * Enrollment at year rollover
   * ================================================================ */
  function enrollSignees(gameState) {
    const bySchool = {};
    for (const rec of Object.values(gameState.world.recruits)) {
      if (!rec.signed || !rec.committedTo) continue;
      (bySchool[rec.committedTo] = bySchool[rec.committedTo] || []).push(rec);
    }

    for (const [schoolId, recs] of Object.entries(bySchool)) {
      const school = gameState.getSchool(schoolId);
      if (!school) continue;
      recs.forEach((rec) => {
        const athlete = new M.Athlete({
          ...rec,
          id: rec.id, // keep identity for history continuity
          isRecruit: false,
          classYear: rec.source === 'JUCO' ? 'Sophomore' : 'Freshman',
          eligibilityRemaining: rec.eligibilityRemaining,
          schoolId,
          morale: 75,
          fatigue: 10
        });
        delete athlete.interests;
        delete athlete.playerKnowledge;
        delete athlete.importance;
        delete athlete.motivations;
        athlete.recalculateOverall();
        gameState.world.athletes[athlete.id] = athlete;
        (rec.gender === 'M' ? school.rosterM : school.rosterW).push(athlete.id);
      });
    }
    return bySchool;
  }

  function resetForNewYear(gameState, rng) {
    const school = gameState.getPlayerSchool();
    gameState.recruiting.budgetLeft = school.budget.recruiting;
    gameState.recruiting.aiBoards = {};
    gameState.recruiting.board = { M: [], W: [] };
    generateClass(gameState, rng);
  }

  /* ================================================================ *
   * Weekly hook, called by GameState.advanceWeek (pre-increment)
   * ================================================================ */
  function processWeek(gameState, rng) {
    if (gameState.week > D.RECRUITING.SIGNING_WEEK) return;
    const ctx = buildWeekContext(gameState);
    aiRecruitWeek(gameState, rng, ctx);
    processDecisions(gameState, rng, ctx);
    if (gameState.week === D.RECRUITING.SIGNING_WEEK) signingDay(gameState, rng, ctx);
  }

  function startNewWeek(gameState) {
    gameState.recruiting.pointsLeft = weeklyPoints(gameState);
    gameState.recruiting.actionsThisWeek = {};
  }

  window.XCD.engine.Recruiting = {
    generateClass,
    resetForNewYear,
    processWeek,
    startNewWeek,
    doAction,
    appeal,
    fitScore,
    distanceMiles,
    recruitComposite,
    weeklyPoints,
    scholarshipsUsed,
    enrollSignees,
    projectedFreshmanOverall
  };
})();
