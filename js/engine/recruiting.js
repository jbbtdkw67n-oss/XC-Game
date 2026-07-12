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
      academics: imp(45), facilities: imp(55) // facilities sell — every recruit notices
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
    const decisionWeek = decisionStyleRoll < 0.2 ? rng.int(D.RECRUITING.EARLY_COMMIT_WEEK, 8)
      : decisionStyleRoll < 0.7 ? rng.int(9, 14)
      : rng.int(15, D.RECRUITING.SIGNING_WEEK);

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

  /*
   * Generational talent (Part 12.5): elevate a recruit into a
   * once-in-a-decade prospect — immediately among the best runners in the
   * country, with a signature strength/weakness profile so no two feel
   * the same. Elite in almost everything, perfect in nothing.
   */
  function elevateToGenerational(rng, rec) {
    const G = D.GENERATIONAL;
    rec.potential = rng.int(96, 99);
    rec.peakOverall = rec.potential;

    // Capable of contending for the NCAA title as a freshman.
    const eliteStat = () => rng.gaussianRange(83, 3, 76, 92);
    ['vo2Max', 'lactateThreshold', 'runningEconomy', 'stamina', 'speed'].forEach((k) => { rec[k] = eliteStat(); });
    rec.workEthic = rng.int(88, 99);
    rec.mentalToughness = rng.int(85, 99);
    rec.raceIQ = rng.int(85, 99);
    rec.consistency = rng.int(80, 96);
    rec.injuryResistance = rng.int(40, 95); // durability is NOT guaranteed
    rec.hillAdaptation = rng.int(40, 75);
    rec.fitness = rng.int(70, 85);
    rec.devProfile = rng.weightedChoice(
      [{ t: 'normal', w: 60 }, { t: 'early', w: 25 }, { t: 'late', w: 15 }], (p) => p.w).t;

    // The signature: incredible somewhere, mortal somewhere else.
    const profile = rng.choice(G.PROFILES);
    Object.entries(profile.strengths).forEach(([k, v]) => {
      rec[k] = Utils.clamp((rec[k] || 60) + v, 10, 99);
    });
    Object.entries(profile.weaknesses).forEach(([k, v]) => {
      rec[k] = Utils.clamp((rec[k] || 60) + v, 10, 99);
    });

    rec.generational = true;
    rec.genProfile = profile.key;
    rec.breakout = false;
    // National recruitments run long — the circus follows them all fall.
    rec.decisionWeek = rng.int(9, D.RECRUITING.SIGNING_WEEK);
    rec.recalculateOverall();
    return rec;
  }

  function generateClass(gameState, rng) {
    const gradYear = gameState.year + 1;
    const recruits = {};
    const perGender = D.RECRUITING.CLASS_SIZE_PER_GENDER;
    const generationalArrivals = [];

    ['M', 'W'].forEach((gender) => {
      const pool = [];
      for (let i = 0; i < perGender; i++) {
        const r = buildRecruit(rng, gender, gradYear);
        pool.push(r);
        recruits[r.id] = r;
      }

      // Blue-chip floor (Update 5, Part 2): every recruiting class must carry
      // legitimate blue-chip talent so elite talent is continuously
      // replenished and the average Division I runner stays as strong in
      // Year 20 as in Year 1. If the natural roll produced too few genuine
      // blue-chippers, elevate the best near-misses into that tier.
      const BLUE_CHIP_FLOOR = 8;   // guaranteed elite prospects per gender
      const BLUE_CHIP_POT = 88;    // the potential that defines "blue chip"
      let eliteCount = pool.filter((r) => r.potential >= BLUE_CHIP_POT).length;
      if (eliteCount < BLUE_CHIP_FLOOR) {
        pool.slice().sort((a, b) => b.potential - a.potential).some((r) => {
          if (eliteCount >= BLUE_CHIP_FLOOR) return true;
          if (r.potential >= BLUE_CHIP_POT || r.generational) return false;
          const target = rng.int(BLUE_CHIP_POT, 94);
          const bump = target - r.potential;
          r.potential = target;
          r.peakOverall = target;
          // Raise the physical engine toward the new ceiling so the rating
          // reflects the potential (still developing — not a finished product).
          ['vo2Max', 'lactateThreshold', 'runningEconomy', 'stamina', 'speed'].forEach((k) => {
            r[k] = Utils.clamp((r[k] || 55) + Math.round(bump * 0.55), 15, 92);
          });
          r.workEthic = Math.max(r.workEthic, rng.int(70, 90));
          r.recalculateOverall();
          eliteCount++;
          return false;
        });
      }

      // Generational spawn roll (Part 12.5): weighted odds, no pattern.
      // Averages ~1 per 7-8 classes across both genders; streaks and long
      // droughts both happen, and (very rarely) two land in one class.
      const G = D.GENERATIONAL;
      const roll = rng.next();
      const count = roll < G.P_TWO ? 2 : roll < G.P_TWO + G.P_ONE ? 1 : 0;
      for (let g = 0; g < count; g++) {
        const idx = rng.int(0, pool.length - 1);
        generationalArrivals.push(elevateToGenerational(rng, pool[idx]));
      }

      rankPool(pool);
    });

    gameState.world.recruits = recruits;
    gameState.recruiting.classYear = gradYear;

    // The story of the year begins.
    generationalArrivals.forEach((r) => {
      const profile = (D.GENERATIONAL.PROFILES.find((p) => p.key === r.genProfile) || {});
      gameState.logNews(`⭐ GENERATIONAL TALENT: ${r.fullName} (${r.hometownState === 'INT' ? r.country : r.hometownState}) headlines the ${gradYear} class — scouts call ${r.gender === 'M' ? 'him' : 'her'} "${profile.label || 'a once-in-a-decade prospect'}". ${profile.note || ''} Every major program is expected to pursue.`);
    });

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
    const division = D.divisionFor(school);
    const dist = recruit.hometownState === 'INT' ? 1200 : distanceMiles(recruit.hometownState, school.state);
    const imp = recruit.importance;

    // Regional-scope divisions (DII/DIII) live and die on nearby kids.
    const distScale = division.recruitingScope === 'regional' ? 12 : 18;

    const scores = {
      prestige: school.prestige,
      location: Utils.clamp(100 - dist / distScale, 0, 100),
      academics: school.academics,
      facilities: school.facilitiesOverall,
      nil: division.nil ? Utils.clamp(Math.round(school.budget.nil / 1200), 5, 100) : 5,
      playingTime: playingTimeScore(gameState, school, recruit, ctx),
      development: coach ? Math.round(coach.training * 0.65 + school.facilities.sportsScienceLab * 0.35) : 50
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

    // Facilities are a universal draw beyond personal importance: elite
    // buildings turn heads, run-down ones cost you visits.
    fit += (school.facilitiesOverall - 55) * 0.09;

    // Coach reputation (Part 1): the name on the door recruits by itself.
    // A legend at a mid-major out-pulls an average coach at a blue blood.
    if (coach) {
      fit += ((coach.reputation || 25) - 42) * 0.24;
      // International pipelines are a craft — and a division rule.
      if (recruit.hometownState === 'INT') {
        fit += division.internationalRecruiting
          ? ((coach.internationalRecruiting || 45) - 45) * 0.15
          : -22;
      }
      // Relationship-builders close; media darlings intrigue stars.
      fit += ((coach.relationships || 55) - 55) * 0.05;
      if (recruit.starRating >= 4) fit += ((coach.media || 50) - 50) * 0.05;
    }

    // Academic-emphasis divisions (DIII especially): campus fit and the
    // classroom drive the choice more than athletics.
    fit += (school.academics - 55) * Math.max(0, division.academicEmphasis - 0.9) * 0.12;

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
    // Recruiting rating directly buys recruiting resources (Update 5, Part 16):
    // an elite recruiter (99) gets meaningfully more weekly points than a weak
    // one (~+9 over the range), so they out-recruit over many cycles.
    let pts = 8 + Math.round(coach.recruiting / 6) +
      Math.round((coach.reputation || 10) / 30);
    // A head coach's recruiting-coordinator assistant adds a little pull;
    // don't double-count when the player IS the assistant.
    const assistant = gameState.getCoach(school.assistantId);
    if (assistant && assistant.id !== coach.id) pts += Math.round(assistant.recruiting / 20);
    // As an assistant, recruiting is the player's entire remit — a focused
    // coordinator works the board harder than a head coach juggling everything.
    if (gameState.isAssistant()) pts += 3;
    return pts;
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

    // Effect scaling: the coach's Recruiting rating sells the relationship.
    const recruitingMul = 0.75 + coach.recruiting / 200;             // 0.85–1.25
    const coachabilityMul = 0.8 + rec.coachability / 250;
    let rel = action.relationship * recruitingMul * coachabilityMul;
    let int = action.interest * recruitingMul;

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

      // Generational prospects (Part 12.5) jump straight onto every elite
      // board; some coaches below that level gamble a whole class on one.
      const coach = gameState.getCoach(school.coachId);
      ctx.pools[gender].slice(-6).forEach((r) => {
        if (!r.generational || r.committedTo || board[gender].includes(r.id)) return;
        const gambler = coach && coach.hasTendency &&
          (coach.hasTendency('aggressive') || coach.hasTendency('elite-recruiter'));
        if (school.prestige >= 72 || (gambler && rng.bool(0.35)) || rng.bool(0.04)) {
          board[gender].unshift(r.id);
        }
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
      // Auto Recruiting (Update 3): when the player flips the toggle, their
      // program is recruited by this exact same AI path — same boards, same
      // pushes, same offer logic. No special treatment in either direction.
      if (school.id === gameState.playerSchoolId && !gameState.recruiting.auto) continue;
      const coach = gameState.getCoach(school.coachId);
      if (!coach) continue;

      ensureAIBoard(gameState, school, rng, ctx);
      // Mirror the AI's working board onto the player's visible board so
      // they can follow along while the CPU runs their recruiting.
      if (school.id === gameState.playerSchoolId) {
        const aiBoard = R.aiBoards[school.id];
        gameState.recruiting.board = { M: aiBoard.M.slice(), W: aiBoard.W.slice() };
      }
      const board = R.aiBoards[school.id];
      const aggressive = coach.archetype === 'Recruiter';

      ['M', 'W'].forEach((gender) => {
        const committedCount = (ctx.commitCounts[school.id] && ctx.commitCounts[school.id][gender]) || 0;
        if (committedCount >= D.RECRUITING.AI_SIGNEES_TARGET) return;

        // AI spends 2-3 abstract "pushes" per gender per week on top targets.
        const pushes = aggressive ? 3 : 2;
        const targets = board[gender]
          .map((id) => gameState.world.recruits[id])
          .filter((r) => {
            if (!r || r.signed || r.committedTo) return false;
            // Mid-majors shift resources off a generational battle once
            // it's clearly a blue-blood bidding war (Part 12.5).
            if (r.generational && school.prestige < 62 && !aggressive) {
              const eliteOffers = Object.keys(r.interests).filter((sid) => {
                const st = r.interests[sid];
                const s = gameState.getSchool(sid);
                return st.offered && s && s.prestige >= 75;
              }).length;
              if (eliteOffers >= 4) return false;
            }
            return true;
          })
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
      if (rec.breakout && !rec.breakoutFired && week >= 4 && week <= 12 && rng.bool(0.18)) {
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

      // The circus (Part 12.5): an uncommitted generational recruit is the
      // story of the fall — leaders, visits, and rumors make the news.
      if (rec.generational && !rec.committedTo && week >= 4 && week % 3 === 1) {
        const suitors = Object.entries(rec.interests)
          .map(([sid, st]) => ({ sid, pull: st.relationship + st.interest + (st.offered ? 15 : 0) }))
          .sort((a, b) => b.pull - a.pull)
          .slice(0, 3)
          .map((s) => gameState.getSchool(s.sid))
          .filter(Boolean);
        if (suitors.length) {
          const flavor = week >= rec.decisionWeek
            ? 'A decision is expected any week now.'
            : rng.bool(0.5) ? 'Official visits are being scheduled.' : 'Insiders say the race is wide open.';
          gameState.logNews(`⭐ RECRUITING WATCH: ${rec.fullName} (${'★'.repeat(rec.starRating)}) — ${suitors.map((s) => s.name).join(', ')} lead the chase. ${flavor}`);
        }
      }

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
          if (rec.generational) {
            // A national event: the commitment changes the program (Part 12.5).
            gameState.logNews(`⭐⭐ BLOCKBUSTER: ${rec.fullName}, the generational prospect, commits to ${school.name}${choice.sid === player ? ' — YOUR program!' : '!'} The recruiting world is stunned.`);
            school.prestige = Utils.clamp(school.prestige + 2, 5, 99);
            school.prestigeMomentum = Utils.clamp((school.prestigeMomentum || 0) + 1, -3, 3);
            gameState.getRoster(school.id, rec.gender).forEach((a) => {
              a.morale = Utils.clamp(a.morale + 3, 0, 100); // the buzz is real
            });
          } else if (rec.starRating >= 4 || choice.sid === player) {
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

    // Permanent ledgers (Parts 8-9): top classes per program, best class per coach.
    const Legacy = window.XCD.engine.Legacy;
    ranking.forEach((entry, i) => {
      const rank = i + 1;
      Legacy.recordClassRank(gameState, entry.schoolId, gameState.year, rank);
      const coach = gameState.getCoach(gameState.getSchool(entry.schoolId)?.coachId);
      if (coach && (!coach.careerRecord.bestClassRank || rank < coach.careerRecord.bestClassRank)) {
        coach.careerRecord.bestClassRank = rank;
      }
    });

    // Generational signings are national news one more time.
    Object.entries(classes).forEach(([sid, recs]) => {
      recs.filter((r) => r.generational).forEach((r) => {
        const s = gameState.getSchool(sid);
        gameState.logNews(`⭐ SIGNED: generational prospect ${r.fullName} makes it official with ${s ? s.name : '?'}.`);
      });
    });

    const top = ranking[0] && gameState.getSchool(ranking[0].schoolId);
    if (top) gameState.logNews(`SIGNING DAY: ${top.name} hauls in the nation's #1 recruiting class (${ranking[0].count} signees).`);

    const playerRank = ranking.findIndex((e) => e.schoolId === gameState.playerSchoolId);
    const playerClass = classes[gameState.playerSchoolId] || [];
    if (playerClass.length) {
      gameState.logNews(`Your ${playerClass.length}-runner class signs — ranked #${playerRank + 1} nationally.`);
      const coach = gameState.getPlayerCoach();
      // Elite recruiting hauls feed coach progression.
      if (playerRank >= 0 && playerRank < 10 && coach) {
        coach.upgradePoints = (coach.upgradePoints || 0) + 1;
        gameState.logNews(`📋 Top-10 recruiting class: +1 coach upgrade point.`);
      }
      // Building a recruiting reputation is an assistant's whole career arc
      // (Update 5, Part 4): strong classes make them a head-coach candidate.
      if (gameState.isAssistant() && coach && playerRank >= 0) {
        let repGain = 0;
        if (playerRank < 3) repGain = 6;
        else if (playerRank < 10) repGain = 4;
        else if (playerRank < 25) repGain = 2.5;
        else if (playerRank < 45) repGain = 1;
        if (repGain) {
          coach.reputation = window.XCD.core.Utils.clamp((coach.reputation || 12) + repGain, 1, 99);
          gameState.logNews(`📈 Coach ${coach.lastName} builds a name as a recruiter — reputation rising after a #${playerRank + 1} class.`);
        }
      }
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

        // Generational arrivals enter the permanent record (Part 12.5) —
        // legends discussed decades after they graduate.
        if (rec.generational) {
          gameState.history.generational = gameState.history.generational || [];
          gameState.history.generational.push({
            athleteId: athlete.id,
            name: athlete.fullName,
            gender: athlete.gender,
            schoolId,
            school: school.name,
            division: school.division || 'DI',
            classYear: gameState.year,
            classRank: rec.nationalRank,
            profile: rec.genProfile
          });
        }
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
