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
   *  - needs: per school/gender, the genuine roster-building picture — how
   *    many athletes graduate, which events they vacate, and how many
   *    signees the staff should chase (Update X: CPU coaches recruit to
   *    real roster holes, not a flat quota).
   *  - pools: unsigned/uncommitted recruits sorted by composite per gender,
   *    letting AI board-building binary-search a talent window.
   *  - offerCounts: per school/gender, offers + commits already extended
   *    (the scholarship/roster-spot cap math, precomputed once).
   */
  function buildWeekContext(gameState) {
    const rosterMarks = {};
    const needs = {};
    for (const school of Object.values(gameState.world.schools)) {
      const marks = {};
      const need = {};
      ['M', 'W'].forEach((gender) => {
        const roster = (gender === 'M' ? school.rosterM : school.rosterW)
          .map((id) => gameState.world.athletes[id])
          .filter(Boolean);
        const overalls = roster.map((a) => a.currentOverall).sort((a, b) => b - a);
        marks[gender] = { fifth: overalls[4] ?? 40, seventh: overalls[6] ?? 35 };

        // Graduation losses: who leaves after this season (redshirts keep
        // their year, so they don't count as departures).
        const leaving = roster.filter((a) =>
          a.redshirt !== 'True' && a.redshirt !== 'Medical' &&
          (a.eligibilityRemaining <= 1 || a.classYear === 'Graduate'));
        const eventNeeds = {};
        leaving.forEach((a) => {
          eventNeeds[a.preferredDistance] = (eventNeeds[a.preferredDistance] || 0) + 1;
        });
        need[gender] = {
          leaving: leaving.length,
          eventNeeds,
          target: signingTarget(school, roster)
        };
      });
      rosterMarks[school.id] = marks;
      needs[school.id] = need;
    }

    const pools = { M: [], W: [] };
    const commitCounts = {};
    const offerCounts = {};
    for (const r of Object.values(gameState.world.recruits || {})) {
      if (r.committedTo) {
        const c = (commitCounts[r.committedTo] = commitCounts[r.committedTo] || { M: 0, W: 0 });
        c[r.gender] += 1;
        const oc = (offerCounts[r.committedTo] = offerCounts[r.committedTo] || { M: 0, W: 0 });
        oc[r.gender] += 1;
        continue;
      }
      if (!r.signed) {
        pools[r.gender].push(r);
        for (const sid in r.interests) {
          if (r.interests[sid].offered) {
            const oc = (offerCounts[sid] = offerCounts[sid] || { M: 0, W: 0 });
            oc[r.gender] += 1;
          }
        }
      }
    }
    pools.M.sort((a, b) => recruitComposite(a) - recruitComposite(b));
    pools.W.sort((a, b) => recruitComposite(a) - recruitComposite(b));

    return { rosterMarks, needs, pools, commitCounts, offerCounts };
  }

  /*
   * How many signees a program chases this cycle (Update 11.1: quality over
   * quantity). A program recruits to GENUINE need, never a flat quota:
   *
   *   target = open roster spots + a modest "improvement" allowance
   *
   * Open spots come from the roster ceiling (DI's hard 14; a healthy squad
   * at the uncapped lower divisions). The improvement allowance lets a
   * program with weak, replaceable underclassmen bring in a bigger class to
   * upgrade past them — and because the roster trim keeps the highest-ceiling
   * athletes, those new freshmen survive while the weak returners are cut.
   *
   * The upshot: a blue blood with a full, strong roster signs a SMALL, ELITE
   * class (it has nothing to fix and few holes), while a rebuilding program
   * or one with bad juniors recruits aggressively. No program signs 20 kids
   * it will only cut.
   *
   * `roster` is the full squad array for one gender.
   */
  function signingTarget(school, roster) {
    const div = school.division || 'DI';
    const cap = (D.RECRUITING.TARGETS[div] || D.RECRUITING.TARGETS.DI)[1];
    const leaving = roster.filter((a) =>
      a.redshirt !== 'True' && a.redshirt !== 'Medical' &&
      (a.eligibilityRemaining <= 1 || a.classYear === 'Graduate')).length;
    const returning = roster.length - leaving;
    // Genuine open spots under the roster ceiling. DI is the hard 14; the
    // uncapped lower divisions aim for a healthy squad a hair deeper (they
    // don't trim, so this is where their rosters naturally settle).
    const ceiling = div === 'DI' ? 14 : 15;
    const openSpots = Math.max(0, ceiling - returning);

    // Improvement recruiting: weak, developing-capped underclassmen who
    // aren't going to become contributors are soft roster holes. The bar
    // rises with the program's level, so a blue blood counts more of its
    // roster as "not good enough" than a small program does.
    const weakBar = 34 + school.prestige * 0.35;
    const weakReturners = roster.filter((a) =>
      a.redshirt !== 'True' && a.redshirt !== 'Medical' &&
      a.eligibilityRemaining >= 2 && a.classYear !== 'Graduate' &&
      (a.potential || 50) < weakBar && (a.currentOverall || 40) < weakBar).length;
    const upgrade = Math.min(3, Math.round(weakReturners * 0.5));

    // A full roster recruits only to genuinely upgrade weak spots — no
    // youth-quota bloat, at any division.
    if (returning >= ceiling) return Utils.clamp(upgrade, 0, cap);
    // Otherwise: fill the holes, plus the upgrade allowance, with a small
    // youth floor when there's real room so every program stays replenished.
    const target = Math.max(openSpots + upgrade, openSpots >= 1 ? 2 : 0);
    return Utils.clamp(target, 0, cap);
  }

  /* ================================================================ *
   * Recruit class generation
   * ================================================================ */
  function buildRecruit(rng, gender, gradYear) {
    const source = rng.weightedChoice(D.RECRUIT_SOURCES, (s) => s === 'HS' ? 90 : s === 'JUCO' ? 6 : 4);
    const international = source === 'International';
    const country = international ? rng.choice(D.INTERNATIONAL_COUNTRIES) : 'USA';

    // Recruiting realism (star vs potential): a recruit's CURRENT ability and
    // their long-term CEILING are drawn SEPARATELY, so the star rating (set
    // later from current ability) never dictates the ceiling. Incoming ability
    // is right-skewed — the top ~1% (future 5-stars) land ~70-80 OVR and are
    // legitimate contributors immediately, while the median recruit is a modest
    // project. JUCO transfers arrive older and more developed.
    const abilityMean = Utils.clamp(Math.round(rng.gaussian(34, 15)), 16, 82);
    const statMean = source === 'JUCO'
      ? Utils.clamp(abilityMean + rng.int(5, 11), 20, 86)
      : abilityMean;
    const statFor = () => rng.gaussianRange(statMean, 7, 8, 92);

    // Potential ceiling = current ability + development "room" — but the two
    // are genuinely DECOUPLED so stars never dictate a ceiling (recruiting
    // realism overhaul). The average room shrinks as starting ability rises (a
    // polished recruit is already near their physical peak), yet the SPREAD is
    // wide, so the tails overlap hard in both directions:
    //   • a fast, high-current recruit can draw almost no room and plateau —
    //     the classic high-school hero who never gets better (a genuine bust,
    //     ceiling floored at today's ability below); and
    //   • a raw, low-current recruit can draw a huge ceiling — the diamond in
    //     the rough who develops into a star.
    // Higher-rated recruits still carry a higher AVERAGE ceiling (their higher
    // floor plus room), so a five-star is far MORE LIKELY to be elite — never
    // guaranteed. The separate hidden-gem, blue-chip, and generational passes
    // then layer additional elite ceilings on top.
    const roomMean = Utils.clamp(28 - statMean * 0.30, 1, 26);
    const growthRoom = Math.round(rng.gaussian(roomMean, 17) * (source === 'JUCO' ? 0.5 : 1));
    let potential = Utils.clamp(statMean + growthRoom, 20, 99);

    let hometown;
    if (international) {
      // Real hometowns abroad (Update 12): a Kenyan recruit is from Iten or
      // Eldoret, a Norwegian from Bergen — not a procedural American town.
      const pool = D.namesFor(country);
      const city = pool.cities ? rng.choice(pool.cities)
        : rng.choice(D.REAL_TOWNS[rng.choice(Object.keys(D.REAL_TOWNS))]);
      hometown = { city, state: 'INT', region: 'International' };
    } else {
      // Real hometowns across the country (Realism Update): every recruit is
      // from an authentic U.S. town — small towns, mid-size cities, and big
      // metros — weighted toward more populous states so the national talent
      // map feels real.
      const states = Object.keys(D.REAL_TOWNS);
      const state = rng.weightedChoice(states, (s) => (D.REAL_TOWNS[s] || []).length);
      const towns = D.REAL_TOWNS[state] || D.REAL_TOWNS.OH;
      hometown = { city: rng.choice(towns), state, region: D.STATE_REGION[state] };
    }

    // 'assigned' motivations (small-school) are never rolled randomly — they
    // attach only through the division-preference pass in generateClass.
    const motivationPool = rng.shuffle(D.MOTIVATIONS.filter((m) => !m.assigned).map((m) => m.key));
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

    // Names true to origin (Update 12): international recruits draw from
    // their country's own name pool — Vincent Kipruto, not Tyler Smith.
    const namePool = D.namesFor(country);
    const firstName = rng.choice(gender === 'M' ? namePool.M : namePool.W);

    const recruit = new M.Recruit({
      firstName,
      lastName: rng.choice(namePool.last),
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
    // A ceiling never sits below today's ability: the deepest bust simply
    // plateaus at their current level (no growth), never regresses on paper.
    if (recruit.potential < recruit.currentOverall) {
      recruit.potential = recruit.currentOverall;
      recruit.peakOverall = recruit.potential;
    }
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
      // A soft floor of guaranteed elite prospects keeps genuine top-end talent
      // in every class WITHOUT flooding the world — set low enough that natural
      // roll variance still produces genuinely strong and genuinely weak classes
      // year to year (some classes far exceed it, some barely clear it).
      const BLUE_CHIP_FLOOR = 6;   // guaranteed elite prospects per gender
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

      // Diamonds in the rough (Update 11): 3-7% of the class hides an elite
      // ceiling behind modest ratings. The scouting consensus (rankings,
      // stars, displayed potential) reads `perceivedPotential`; the real
      // `potential` drives college development. Gems share the classic
      // tells — huge work ethic, coachability, consistency, late growth —
      // but the tells are never proof.
      const gemShare = rng.float(D.HIDDEN_GEMS.SHARE_MIN, D.HIDDEN_GEMS.SHARE_MAX);
      const gemCount = Math.round(pool.length * gemShare);
      const gemCandidates = pool.filter((r) =>
        !r.generational && r.potential >= 38 && r.potential <= 70);
      for (let gi = 0; gi < gemCount && gemCandidates.length; gi++) {
        const pick = gemCandidates.splice(rng.int(0, gemCandidates.length - 1), 1)[0];
        pick.hiddenGem = true;
        pick.perceivedPotential = pick.potential; // what every scout believes
        pick.potential = Utils.clamp(pick.potential + rng.int(12, 32), 72, 96);
        pick.peakOverall = pick.potential;
        pick.workEthic = Math.max(pick.workEthic, rng.int(82, 99));
        pick.coachability = Math.max(pick.coachability, rng.int(78, 97));
        pick.consistency = Math.max(pick.consistency, rng.int(66, 92));
        pick.devProfile = rng.bool(0.6) ? 'late' : 'normal'; // late physical growth
        pick.scoutNotes = rng.shuffle(D.HIDDEN_GEMS.HINTS.slice()).slice(0, 2);
      }
      // The tells are noisy on purpose: plenty of ordinary grinders earn the
      // same scouting lines, so a note never outs a gem by itself.
      pool.forEach((r) => {
        if (r.scoutNotes || r.generational) return;
        if ((r.workEthic >= 84 && rng.bool(0.5)) || rng.bool(0.04)) {
          r.scoutNotes = [rng.choice(D.HIDDEN_GEMS.HINTS)];
        }
      });

      // Generational spawn roll (Part 12.5): weighted odds, no pattern.
      // Averages ~1 per 7-8 classes across both genders; streaks and long
      // droughts both happen, and (very rarely) two land in one class.
      // Update 6, Section 8: generational talents ONLY originate from high
      // school or overseas — a JUCO transfer may become an All-American or
      // even a national champion, but never a once-in-a-generation prospect.
      const G = D.GENERATIONAL;
      const roll = rng.next();
      const count = roll < G.P_TWO ? 2 : roll < G.P_TWO + G.P_ONE ? 1 : 0;
      const eligible = pool.filter((r) => r.source !== 'JUCO' && !r.generational && !r.hiddenGem);
      for (let g = 0; g < count && eligible.length; g++) {
        const idx = rng.int(0, eligible.length - 1);
        const pick = eligible.splice(idx, 1)[0];
        generationalArrivals.push(elevateToGenerational(rng, pick));
      }

      rankPool(pool);
      assignHsCredentials(pool, rng); // 5K PBs + state titles (Section 16)

      // Division preference (Update 11): a real slice of the class — mostly
      // 2-3 stars, some 4s and 1s — actively prefers the DII/DIII experience
      // (small campuses, guaranteed racing, coaches who know their name) and
      // will pick a strong lower-division program over a Division I bench.
      // Discoverable through scouting via the 'small-school' motivation.
      pool.forEach((r) => {
        if (r.generational) return;
        const p = { 1: 0.18, 2: 0.22, 3: 0.20, 4: 0.06, 5: 0 }[r.starRating] || 0;
        if (!rng.bool(p)) return;
        r.divisionPreference = rng.bool(0.5) ? 'DII' : 'DIII';
        if (!r.motivations.includes('small-school')) r.motivations.push('small-school');
      });
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

  // The ceiling the scouting world BELIEVES in (Update 11): hidden gems
  // carry a modest perceived potential while their real one stays secret,
  // so every public-facing read — rankings, stars, boards, AI valuation,
  // the fog-of-war POT display — goes through this helper.
  function perceivedPotential(r) {
    return r.perceivedPotential ?? r.potential;
  }

  // Composite value drives stars & rankings (recruiting realism): star rating
  // is primarily the scouting consensus of CURRENT ability and immediate
  // impact, with only a lighter read on the perceived ceiling — so a polished
  // recruit who may plateau still rates highly, and a raw prospect with a big
  // (perceived) ceiling does not automatically become a 5-star. The true
  // ceiling stays hidden; hidden gems rank like the modest prospects everyone
  // believes they are because this reads the PERCEIVED potential.
  function recruitComposite(r) {
    return r.currentOverall * 0.82 + perceivedPotential(r) * 0.18;
  }

  /*
   * A single recruit's worth to a class ranking (Update 11.1). Value rises
   * STEEPLY with star rating — a four-star is worth far more than a
   * three-star, a five-star more still — so landing genuine talent, not
   * padding a class with bodies, is what moves the needle. The perceived
   * ceiling and current ability refine ordering within a star tier.
   */
  function recruitValue(r) {
    return Math.pow(r.starRating, 3.4) * 12 + perceivedPotential(r) * 1.6 + r.currentOverall * 0.6;
  }

  /*
   * A class's ranking score (Update 11.1). The signees are valued, sorted
   * best-first, and summed with a DIMINISHING weight per additional recruit,
   * so a compact class of blue-chips outranks a big class of role players —
   * three four-stars beat eight three-stars. A small, capped depth bonus
   * rewards actually filling a class without ever rivaling real talent.
   */
  function classScore(recs) {
    const valued = recs.map(recruitValue).sort((a, b) => b - a);
    let score = 0;
    let weight = 1;
    valued.forEach((v) => { score += v * weight; weight *= 0.86; });
    score += Math.min(recs.length, 8) * 4; // modest depth credit
    return Math.round(score);
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
   * High-school credentials (spec Part 2, Section 16)
   * ================================================================ */
  /*
   * Every recruit carries an official 5K Personal Best, generated from a
   * realistic gender-specific distribution. The PB correlates with the
   * CURRENT engine (overall, stamina, threshold, VO₂ Max) plus genuine
   * race-day noise — potential is deliberately absent, so a slow kid can
   * hide an elite ceiling and a fast one can be nearly finished growing.
   */
  function generateHsPB(rng, r) {
    // Current engine: what the athlete can actually run TODAY. The PB tracks
    // present ability, not the hidden ceiling — only a whisper of perceived
    // upside leaks in — so a slow kid can hide an elite ceiling and a fast one
    // can be a nearly finished product (a bust). Times in seconds.
    const engine = r.currentOverall * 0.5 +
      ((r.stamina || 55) + (r.lactateThreshold || 55)) / 2 * 0.3 + (r.vo2Max || 55) * 0.2;
    const m = engine * 0.9 + (perceivedPotential(r) || 60) * 0.1;
    const male = r.gender === 'M';

    // Race-day variance keeps the field from being a clean ladder, and makes
    // where the barriers fall genuinely swing year to year — some classes push
    // several kids under the marks, others barely reach them.
    const noise = rng.gaussian(0, 8);

    // Generational talents alone live in the national-record realm: right
    // around ~14:03 boys / ~16:03 girls, and (rarely) under 14:00 / 16:00.
    // Everyone else is floored well clear of the record.
    if (r.generational) {
      const genBase = male ? 846 : 962;
      const lo = male ? 836 : 955;   // ~13:56 / ~15:55 — record-breaking is rare
      const hi = male ? 864 : 982;
      return Math.round(Utils.clamp(genBase - (m - 88) * 1.5 + noise * 0.75, lo, hi));
    }

    // Concave map from current-ability engine `m` (≈0-92) to 5K time. It
    // COMPRESSES the elite tail: it takes a truly exceptional engine to
    // approach the front, so only a handful of preps a year break the marks
    // (~40 boys under 15:00, ~40 girls under 17:00 in a typical class) while
    // the great mass sits at honest development-project times. A non-
    // generational recruit is floored above the record realm — 14:03 / 16:03
    // stay the exclusive property of generational talent.
    const F = male ? 858 : 969;   // asymptotic fast end for a maxed non-gen engine
    const S = male ? 328 : 352;   // spread down to the slow tail
    const P = male ? 1.46 : 1.36; // curvature — higher = thinner fast tail
    const floor = male ? 853 : 968; // hard floor, safely clear of the record realm
    const ceil = male ? 1145 : 1305;
    const base = F + S * Math.pow(Math.max(0, 1 - m / 92), P);
    return Math.round(Utils.clamp(base + noise, floor, ceil));
  }

  /*
   * Stamp the class's permanent prep credentials: the 5K PB for everyone,
   * and a State Championship for the best high-school senior in each state
   * — history that follows the athlete through college and into the alumni
   * ledger forever.
   */
  function assignHsCredentials(pool, rng) {
    const Legacy = window.XCD.engine.Legacy;
    const stateChampTaken = {};
    pool.forEach((r) => {
      if (r.hsPB === undefined) r.hsPB = generateHsPB(rng, r);
      const st = r.hometownState;
      if (r.source !== 'HS' || !st || st === 'INT' || stateChampTaken[st]) return;
      stateChampTaken[st] = true;
      r.hsStateChampion = true;
      r.honorYears = r.honorYears || {};
      r.honorYears.hsStateChamp = [r.gradYear];
      Legacy.recordAccolade(r, {
        year: r.gradYear, division: null, conference: null,
        type: 'hsStateChamp', label: `${st} HS State Champion`
      });
    });
  }

  /* ================================================================ *
   * Appeal model — how attractive is `school` to `recruit`?
   * ================================================================ */
  function projectedFreshmanOverall(recruit) {
    // Rough one-summer improvement estimate used for playing-time math.
    // Reads the perceived ceiling — nobody projects a hidden gem correctly.
    return recruit.currentOverall + Math.round((perceivedPotential(recruit) - recruit.currentOverall) * 0.15);
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
      development: coach ? Math.round(coach.training * 0.65 + school.facilities.trainingCenter * 0.35) : 50
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
    // "Wants to play for an elite coach" (Update 13, Phase 4): coach
    // reputation IS the pitch. A Legend on the door is a decisive draw; an
    // unknown assistant with a modest name struggles to compete for this kid —
    // another concrete reason to build a reputation over a career.
    if (mot.includes('elite-coach')) {
      const rep = coach ? (coach.reputation || 25) : 25;
      fit += rep >= 80 ? 22 : rep >= 66 ? 14 : rep >= 50 ? 6 : rep >= 34 ? 0 : -12;
    }

    // Climate preference (visible) folds in with real weight (Update 15):
    // a Warm-preference kid genuinely favors the Southeast over the Plains.
    fit += (climateScore(school, recruit) - 60) * 0.14;

    // School-size preference (Update 15): the visible Small/Medium/Large
    // preference now genuinely matters. Size derives from division and
    // conference tier (the same read the finance engine uses): power-
    // conference DI reads Large, mid-tier DI Medium, low-major DI and
    // DII/DIII Small. A match helps; a hard mismatch (Small kid at a huge
    // state school, Large kid at a tiny college) costs real appeal.
    if (recruit.preferredSchoolSize && recruit.preferredSchoolSize !== 'No Preference') {
      const F = window.XCD.engine.Finances;
      const sizeF = F && F.schoolSizeFactor ? F.schoolSizeFactor(school) : 1;
      const sizeCat = sizeF >= 1.4 ? 'Large' : sizeF >= 0.9 ? 'Medium' : 'Small';
      if (recruit.preferredSchoolSize === sizeCat) fit += 4;
      else if ((recruit.preferredSchoolSize === 'Large' && sizeCat === 'Small') ||
               (recruit.preferredSchoolSize === 'Small' && sizeCat === 'Large')) fit -= 5;
      else fit -= 1;
    }

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

    // Division preference (Update 11): some recruits genuinely want the
    // DII/DIII experience and read a Division I offer as a bench sentence.
    // A strong lower-division program beats a blue blood for these kids.
    if (recruit.divisionPreference) {
      const divKey = school.division || 'DI';
      if (divKey === recruit.divisionPreference) fit += 16;
      else if (divKey === 'DI') fit -= 14;
      else fit += 6; // the other lower division still beats DI for them
    }

    // Lower-rated recruits (Update 11): prestige can't carry the pitch to a
    // 1-2 star kid — they weigh the school down the road and the chance to
    // actually race far more, and a big brand name barely moves them.
    if ((recruit.starRating || 2) <= 2) {
      fit += (scores.location - 50) * 0.10 + (scores.playingTime - 50) * 0.08
        - Math.max(0, school.prestige - 60) * 0.06;
    }

    return Utils.clamp(fit, 5, 99);
  }

  /*
   * Rank-based signing odds (recruiting balance): a recruit's decision is
   * driven primarily by where each school sits in their top-9 interest
   * ranking. Finishing FIRST on a recruit's board is a 50% likelihood, second
   * is 25%, and it scales down steeply from there. The weights sum to 100, so
   * against a full field the share IS the percentage (leader 50%, #2 25%,
   * #3 12%, then 6/3/2/1/0.5/0.5) — finishing first genuinely wins the race.
   */
  const RANK_ODDS = [50, 25, 12, 6, 3, 2, 1, 0.5, 0.5];
  const rankWeight = (idx) => RANK_ODDS[idx] ?? 0.5;

  /*
   * The recruit's ranked suitor list — every school with a real recruitment
   * (an offer or meaningful interest), ordered by appeal, capped at nine.
   * This is the single ranking the UI displays and the commit/signing math
   * draws from, so what the player sees is exactly what decides the race.
   */
  function rankedSuitors(gameState, recruit, ctx) {
    return Object.keys(recruit.interests || {})
      .filter((sid) => {
        const s = recruit.interests[sid];
        return s && (s.offered || s.interest >= 15) && gameState.getSchool(sid);
      })
      .map((sid) => ({ sid, appeal: appeal(gameState, gameState.getSchool(sid), recruit, ctx || null) }))
      .sort((x, y) => y.appeal - x.appeal)
      .slice(0, 9);
  }

  /*
   * A recruit's approximate commitment chance FOR a given school: the
   * school's share of the rank-based odds among the recruit's top-9 suitors
   * — the same math the commit engine and signing day use to pick a winner.
   * Gates the Sway action and feeds the UI as a legible percentage.
   */
  function commitChance(gameState, school, recruit) {
    if (!recruit || recruit.signed) return 0;
    const pool = rankedSuitors(gameState, recruit, null);
    if (!pool.some((p) => p.sid === school.id)) {
      const st = recruit.getSchoolState(school.id);
      if (!st || (!st.offered && st.interest < 15)) return 0;
      pool.push({ sid: school.id, appeal: appeal(gameState, school, recruit, null) });
      pool.sort((x, y) => y.appeal - x.appeal);
      if (pool.length > 9) pool.length = 9;
    }
    const idx = pool.findIndex((p) => p.sid === school.id);
    if (idx < 0) return 0;
    const denom = pool.reduce((s, p, i) => s + rankWeight(i), 0);
    return denom > 0 ? rankWeight(idx) / denom : 0;
  }

  // Total appeal = long-term fit + relationship built through recruiting.
  // Appeal decides each school's RANK on the recruit's board; the rank-based
  // odds (RANK_ODDS) then decide commitments and signing day.
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
   * The recruiting economy — one set of rules for everyone (Update X).
   * The player, Auto Recruiting, and every CPU program all buy the same
   * actions with the same weekly points and the same yearly budget.
   * ================================================================ */
  // Weekly recruiting points any program's staff generates. Recruiting
  // rating directly buys recruiting resources (Update 5, Part 16): an elite
  // recruiter (99) gets meaningfully more weekly points than a weak one.
  function schoolWeeklyPoints(gameState, school, coach) {
    // Update 11: the weekly point pool grew with the bigger classes — every
    // staff (player and CPU alike, same economy) works enough names to sign
    // DI 6-8 / DII-DIII 4-8 while contested recruits still walk elsewhere.
    let pts = 11 + Math.round(coach.recruiting / 5) +
      Math.round((coach.reputation || 10) / 25);
    // The recruiting-coordinator assistant adds a little pull; don't
    // double-count when the coach in question IS the assistant.
    const assistant = gameState.getCoach(school.assistantId);
    if (assistant && assistant.id !== coach.id) pts += Math.round(assistant.recruiting / 20);
    return pts;
  }

  function weeklyPoints(gameState) {
    let pts = schoolWeeklyPoints(gameState, gameState.getPlayerSchool(), gameState.getPlayerCoach());
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
   * How many offers (+ commits) a program may have live for one gender.
   * DI/DII: derived from scholarship equivalencies as before. DIII offers
   * roster spots, not scholarships (Update X, Part 3) — the cap follows
   * genuine roster need instead of a scholarship count.
   */
  /*
   * How many live offers (+ commits) a program may float for one gender
   * (Update 11.1). Offers exceed signings because recruits decline — but
   * strong programs LAND most of their offers, so they extend only a few
   * beyond their target, while weaker programs cast a wider net against more
   * declines. This is what stops a blue blood from hoarding 20 offers for a
   * four-man class and then cutting the overflow.
   */
  function offerCap(school, gender, needTarget) {
    const target = Math.max(1, needTarget || 4);
    const prestige = school.prestige || 50;
    // A tight cushion over the target — a few recruits pick a better offer
    // elsewhere, so a program floats slightly more than it will sign. Strong
    // programs land nearly every offer (small cushion); weaker programs face
    // more declines (a bit more). Kept small on purpose: outstanding offers
    // above the target are exactly what turns into freshmen you then cut.
    const cushion = prestige >= 78 ? 1 : prestige >= 58 ? 2 : 3;
    return Math.max(4, target + cushion);
  }

  /*
   * Recruit personality (personality overhaul): a recruit's stated
   * priorities and hidden motivations dynamically reshape how well each
   * recruiting action lands, instead of every action carrying static value.
   * An academics-first kid shrugs at the campus tour but leans in when the
   * conversation is about the classroom; a title-chaser hears every pitch
   * louder from a winning program; an impact recruit lights up at early
   * playing time; a homebody melts for the in-home visit from the local
   * school; a culture/family kid bonds with a coach who genuinely connects;
   * a development believer wants the facilities and the coach who improves
   * runners. Returns { rel, int } multipliers for the action.
   */
  function personalityEffect(gameState, school, coach, rec, actionKey) {
    const imp = rec.importance || {};
    const mot = rec.motivations || [];
    let rel = 1, int = 1;
    const w = (v) => Utils.clamp(((v ?? 50) - 50) / 50, -0.7, 1); // −0.7..1

    // Academics: the academic pitch lands much harder, the tour less.
    const acad = w(imp.academics) + (mot.includes('scholar') ? 0.5 : 0);
    if (acad > 0.25) {
      if (actionKey === 'campusVisit') int *= 1 - acad * 0.25;
      if (actionKey === 'call' || actionKey === 'homeVisit' || actionKey === 'letter') {
        const strong = school.academics >= 72;
        int *= 1 + acad * (strong ? 0.35 : 0.05);
        rel *= 1 + acad * (strong ? 0.25 : 0);
      }
    }
    // Championships: winning programs' pitches carry extra weight.
    const champ = w(imp.prestige) + (mot.includes('title-chaser') ? 0.5 : 0);
    if (champ > 0.25 && school.prestige >= 75) int *= 1 + champ * 0.30;
    // Playing time: the early-playing-time pitch (meet the team, the offer
    // itself) is very effective when the depth chart genuinely has room.
    const pt = w(imp.playingTime) + (mot.includes('impact') ? 0.5 : 0);
    if (pt > 0.25 && (actionKey === 'meetTeam' || actionKey === 'offer' || actionKey === 'hostOvernight')) {
      const ptScore = playingTimeScore(gameState, school, rec, null);
      int *= 1 + pt * (ptScore >= 70 ? 0.40 : ptScore <= 30 ? -0.20 : 0.10);
    }
    // Distance from home: proximity supercharges the family-facing actions.
    const home = w(imp.location) + (mot.includes('homebody') ? 0.5 : 0);
    if (home > 0.25 && (actionKey === 'homeVisit' || actionKey === 'campusVisit')) {
      const dist = rec.hometownState === 'INT' ? 1200 : distanceMiles(rec.hometownState, school.state);
      int *= 1 + home * (dist < 250 ? 0.35 : dist > 800 ? -0.20 : 0.05);
      rel *= 1 + home * (dist < 250 ? 0.20 : 0);
    }
    // Culture: for family-first / team-first kids the coach's genuine
    // relationship craft is what actually moves the needle.
    if (mot.includes('family-first') || rec.personality === 'Team-First') {
      if (['call', 'homeVisit', 'meetTeam', 'hostOvernight'].includes(actionKey)) {
        rel *= 1 + ((coach.culture ?? 55) - 55) / 140 + ((coach.relationships ?? 55) - 55) / 180;
      }
    }
    // Development: training facilities and a coach who demonstrably
    // improves runners sell themselves to a project-minded recruit.
    const dev = w(imp.development) + (mot.includes('project') ? 0.5 : 0);
    if (dev > 0.25) {
      if (actionKey === 'campusVisit') int *= 1 + dev * ((school.facilities.trainingCenter - 50) / 130);
      if (actionKey === 'call' || actionKey === 'assistantVisit') int *= 1 + dev * (((coach.training ?? 55) - 55) / 150);
    }
    return {
      rel: Utils.clamp(rel, 0.5, 1.8),
      int: Utils.clamp(int, 0.5, 1.8)
    };
  }

  /*
   * The shared heart of every recruiting action: relationship/interest
   * effects, visit flags, offer flags, and (for the player's program only)
   * scouting knowledge + motivation discovery. `rand` is a 0-1 generator —
   * Math.random for the live player, the seeded RNG for AI weeks.
   * Returns the discovered motivation key, if any.
   */
  function applyActionEffects(gameState, school, coach, rec, actionKey, st, rand) {
    const action = D.RECRUIT_ACTIONS[actionKey];
    // Effect scaling: the coach's Recruiting rating sells the relationship.
    const recruitingMul = 0.75 + coach.recruiting / 200;             // 0.85–1.25
    const coachabilityMul = 0.8 + rec.coachability / 250;
    let rel = action.relationship * recruitingMul * coachabilityMul;
    let int = action.interest * recruitingMul;

    // Personality-driven dynamic effectiveness: who this recruit is changes
    // how hard each action lands (never applied to the Sway flip roll).
    if (actionKey !== 'sway') {
      const p = personalityEffect(gameState, school, coach, rec, actionKey);
      rel *= p.rel;
      int *= p.int;
    }

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

    // Sway (rebuilt): a genuine FLIP attempt on a recruit committed to
    // another program. Roughly 35% of attempts land — a success flips the
    // commitment to this school ON THE SPOT (the previous school loses the
    // pledge immediately); a miss leaves them committed where they were.
    // The staff's recruiting rating, the assistant coach's recruiting craft,
    // and the built relationship each nudge the odds a little — and repeat
    // attempts get progressively harder, so hammering the button can never
    // grind a flip into a certainty.
    if (actionKey === 'sway') {
      const assistant = gameState.getCoach(school.assistantId);
      let flip = 0.35;
      flip += ((coach.recruiting ?? 55) - 55) * 0.0015;                 // recruiting rating: ±~6%
      if (assistant && assistant.id !== coach.id) {
        flip += ((assistant.recruiting ?? 55) - 55) * 0.0008;           // the assistant works the flip too
      }
      flip += ((st.relationship || 0) - 50) * 0.001;                    // the bond: ±~5%
      st.swayAttempts = (st.swayAttempts || 0) + 1;
      if (st.swayAttempts > 1) flip *= Math.pow(0.85, st.swayAttempts - 1); // diminishing repeats
      flip = Utils.clamp(flip, 0.08, 0.50);

      const prevId = rec.committedTo;
      if (rand() < flip) {
        const prev = prevId && gameState.getSchool(prevId);
        rec.committedTo = school.id;                                    // the flip is immediate
        rec.commitWeek = gameState.week;
        rel = 6; int = 8;
        if (school.id === gameState.playerSchoolId) st._swayOutcome = 'flip';
        if (rec.starRating >= 3 || school.id === gameState.playerSchoolId ||
            prevId === gameState.playerSchoolId) {
          gameState.logNews(`FLIP: ${rec.fullName} is swayed away from ${prev ? prev.name : '?'} and commits to ${school.name}!`);
        }
      } else {
        rel = 2; int = 0;                                               // they hear you out, but stay
        if (school.id === gameState.playerSchoolId) st._swayOutcome = 'hold';
      }
    }

    st.relationship = Utils.clamp(st.relationship + rel, 0, 100);
    st.interest = Utils.clamp(st.interest + int, 0, 100);

    // Scouting knowledge + motivation discovery — fog of war is the
    // player's alone, so only their staff's work (manual or Auto) reveals it.
    if (school.id === gameState.playerSchoolId) {
      const know = rec.playerKnowledge;
      know.scout = Utils.clamp(know.scout + action.scout, 0, 100);
      if (rand() < action.reveal) {
        const hidden = rec.motivations.filter((m) => !know.revealed.includes(m));
        if (hidden.length) {
          const discovered = hidden[Math.floor(rand() * hidden.length)];
          know.revealed.push(discovered);
          return discovered;
        }
      }
    }
    return null;
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

    const terms = D.offerTerms(school);
    const st = rec.getSchoolState(school.id, true);
    if (actionKey === 'offer' && st.offered) return { ok: false, message: terms.already };
    if (action.requires === 'interest30' && st.interest < 30) {
      return { ok: false, message: `${rec.lastName} isn't interested enough to visit campus yet (needs 30 interest).` };
    }
    if (action.requires === 'visited' && !st.visited) {
      return { ok: false, message: 'An overnight requires a campus visit first.' };
    }
    // Sway gate (rebuilt): Sway is a FLIP attempt, so it only exists when
    // the recruit is verbally committed to ANOTHER school and your program
    // holds a real (10%+) commitment chance with them.
    if (action.requires === 'sway') {
      if (!rec.committedTo || rec.committedTo === school.id) {
        return { ok: false, message: `Sway is a flip attempt — ${rec.lastName} isn't committed to another school.` };
      }
      if (commitChance(gameState, school, rec) < 0.10) {
        return { ok: false, message: `${rec.lastName}'s commitment chance with you is under 10% — build the relationship before attempting a flip.` };
      }
    }
    if (actionKey === 'offer') {
      const roster = gameState.getRoster(school.id, rec.gender);
      const needTarget = signingTarget(school, roster);
      if (scholarshipsUsed(gameState, school.id, rec.gender) >= offerCap(school, rec.gender, needTarget)) {
        return { ok: false, message: terms.capped };
      }
    }

    // Pay the costs.
    R.pointsLeft -= action.points;
    R.budgetLeft -= action.cost;
    R.actionsThisWeek[recruitId] = usedThisWeek + 1;

    // The action itself runs on the shared rules every program uses.
    const discovered = applyActionEffects(gameState, school, coach, rec, actionKey, st, Math.random);

    const messages = {
      letter: `Sent a letter to ${rec.fullName}.`,
      call: `Good phone call with ${rec.fullName}.`,
      watchRace: `Scouted ${rec.fullName} at a race — much clearer picture of their ability.`,
      assistantVisit: `Your assistant visited ${rec.fullName}.`,
      homeVisit: `Sat down with ${rec.fullName}'s family.`,
      campusVisit: `${rec.fullName} toured campus.`,
      hostOvernight: `${rec.fullName} stayed overnight with the team.`,
      meetTeam: `${rec.fullName} met the squad.`,
      sway: (() => {
        switch (st._swayOutcome) {
          case 'flip': return `🔥 FLIPPED! ${rec.fullName} decommits and pledges to YOUR program!`;
          default: return `${rec.fullName} heard the pitch but is staying committed — for now.`;
        }
      })(),
      offer: `${terms.made} ${rec.fullName}!`
    };
    let message = messages[actionKey];
    delete st._swayOutcome; // transient — never persist into saves
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
      const week = gameState.week;
      board[gender] = board[gender].filter((id) => {
        const r = gameState.world.recruits[id];
        if (!r || r.signed) return false;
        // A recruit committed elsewhere normally drops off the board — but a
        // staff holding an offer and a real commitment chance keeps them on
        // as a Sway (flip) target for a while.
        if (r.committedTo && r.committedTo !== school.id) {
          const mine = r.interests[school.id];
          return !!(mine && mine.offered && (mine.swayAttempts || 0) < 3 &&
            commitChance(gameState, school, r) >= 0.10);
        }
        // Dynamic pivots (Update 6, Section 6): boards evolve weekly. Once a
        // rival's relationship lead is decisive and the clock is running,
        // stop wasting pushes on a lost battle — replace the target instead.
        if (week >= 6 && !r.committedTo && !r.generational) {
          const mine = (r.interests[school.id] || {}).relationship || 0;
          let best = 0, bestSid = null;
          Object.entries(r.interests).forEach(([sid, st]) => {
            if ((st.relationship || 0) > best) { best = st.relationship; bestSid = sid; }
          });
          if (bestSid && bestSid !== school.id && best - mine > 30) return false;
        }
        return true;
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

      // Wave recruiting (Update 6, Sections 6-7). Elite programs open the
      // cycle laser-focused on a handful of elite targets and commit nearly
      // all effort there; the board only expands once commitments land.
      // Everyone else works a board sized to their genuine roster needs
      // (Update X): heavy graduation losses mean a bigger board.
      const committed = (ctx.commitCounts[school.id] && ctx.commitCounts[school.id][gender]) || 0;
      const need = ctx.needs[school.id][gender];
      const elite = school.prestige >= 75;
      const boardCap = elite && committed === 0 && week <= D.RECRUITING.SIGNING_WEEK - 3
        ? 4
        : Utils.clamp(need.target * 2, 6, 16);
      if (board[gender].length >= boardCap) return;

      // Target recruits whose composite matches the program's level, with
      // a bias toward nearby kids (regional recruiting territories).
      // Random sampling inside the talent window spreads 700+ programs
      // across the whole class instead of piling onto the same names.
      const pool = ctx.pools[gender];
      const targetComposite = 30 + school.prestige * 0.55;
      let lo = lowerBound(pool, targetComposite - 18);
      let hi = lowerBound(pool, targetComposite + 18);
      if (hi - lo < 25) { // elite programs: widen downward so the window isn't empty
        lo = Math.max(0, lo - 60);
      }
      // The late scramble (Update X): a program still short of its class in
      // the final month stops fighting lost bidding wars and shops
      // down-market for the overlooked — recruits nobody has offered yet.
      const scramble = week >= D.RECRUITING.SIGNING_WEEK - 8 && committed < need.target;
      if (scramble) lo = Math.max(0, lo - 50);
      // The first wave shops only at the very top of the window.
      if (elite && boardCap === 4) lo = Math.max(lo, hi - 30);
      const windowSize = hi - lo;
      if (windowSize <= 0) return;

      const onBoard = new Set(board[gender]);
      let attempts = 0;
      while (board[gender].length < boardCap && attempts < 40) {
        attempts++;
        const r = pool[lo + rng.int(0, windowSize - 1)];
        if (!r || r.signed || r.committedTo || onBoard.has(r.id)) continue;
        // Regional bias: nearby recruits usually make the board; far ones sometimes.
        const dist = r.hometownState === 'INT' ? 1000 : distanceMiles(r.hometownState, school.state);
        let keepChance = Utils.clamp(1.05 - dist / 1600, 0.25, 1);
        // Event balance (Update X): graduating seniors leave a hole in their
        // event group — recruits who fill it are prioritized for the board.
        if (need.eventNeeds[r.preferredDistance]) keepChance = Math.min(1, keepChance + 0.25);
        // Program identity (Update 11): staffs recruit athletes who fit how
        // they actually train — volume programs hunt aerobic engines, speed
        // programs hunt the kick.
        const tp = coach && coach.trainingPhilosophy;
        if (tp === 'high-mileage' || tp === 'strength-endurance') {
          keepChance += (r.stamina || 55) > (r.speed || 55) + 6 ? 0.15 : -0.08;
        } else if (tp === 'speed') {
          keepChance += (r.speed || 55) > (r.stamina || 55) + 6 ? 0.15 : -0.08;
        }
        keepChance = Utils.clamp(keepChance, 0.1, 1);
        // Scrambling programs chase uncontested names: an offer-free recruit
        // is a near-certain add, a bidding war is mostly a waste of a slot.
        if (scramble) {
          const contested = Object.keys(r.interests).some((sid) => r.interests[sid].offered);
          keepChance = contested ? keepChance * 0.45 : 1;
        }
        if (!rng.bool(keepChance)) continue;
        board[gender].push(r.id);
        onBoard.add(r.id);
      }
    });
  }

  /*
   * The AI recruiting week, rebuilt on the real economy (Update X, Part 5).
   * Every CPU program — and the player's program under Auto Recruiting —
   * spends the same weekly points, the same yearly recruiting budget, and
   * buys the same actions with the same effects and gates as a human coach.
   * No abstract pushes, no shortcuts: identical rules for everyone.
   */
  function makeEcon(gameState, school, coach) {
    const R = gameState.recruiting;
    if (school.id === gameState.playerSchoolId) {
      // Auto Recruiting spends the player's REAL points and budget, so the
      // recruiting screen reflects exactly what the staff did.
      return {
        get points() { return R.pointsLeft; }, set points(v) { R.pointsLeft = v; },
        get budget() { return R.budgetLeft; }, set budget(v) { R.budgetLeft = v; },
        actions: R.actionsThisWeek
      };
    }
    // CPU programs: a yearly budget ledger that persists across the cycle.
    R.aiBudgets = R.aiBudgets || {};
    if (R.aiBudgets[school.id] === undefined) R.aiBudgets[school.id] = school.budget.recruiting;
    const box = { pts: schoolWeeklyPoints(gameState, school, coach) };
    return {
      get points() { return box.pts; }, set points(v) { box.pts = v; },
      get budget() { return R.aiBudgets[school.id]; }, set budget(v) { R.aiBudgets[school.id] = v; },
      actions: {} // same 2-contacts-per-recruit weekly cap as the player
    };
  }

  // Spend one action through the shared rules. Returns true if it happened.
  function tryAIAction(gameState, school, coach, rec, actionKey, econ, rng, ctx) {
    const action = D.RECRUIT_ACTIONS[actionKey];
    if (!action || rec.signed) return false;
    if (econ.points < action.points || econ.budget < action.cost) return false;
    const used = econ.actions[rec.id] || 0;
    if (used >= D.MAX_ACTIONS_PER_RECRUIT_WEEK) return false;
    const st = rec.getSchoolState(school.id, true);
    if (actionKey === 'offer' && st.offered) return false;
    if (action.requires === 'interest30' && st.interest < 30) return false;
    if (action.requires === 'visited' && !st.visited) return false;
    if (action.requires === 'sway' &&
        (!rec.committedTo || rec.committedTo === school.id ||
         commitChance(gameState, school, rec) < 0.10)) return false;

    econ.points -= action.points;
    econ.budget -= action.cost;
    econ.actions[rec.id] = used + 1;
    applyActionEffects(gameState, school, coach, rec, actionKey, st, () => rng.next());
    if (actionKey === 'offer') {
      const oc = (ctx.offerCounts[school.id] = ctx.offerCounts[school.id] || { M: 0, W: 0 });
      oc[rec.gender] += 1;
    }
    return true;
  }

  /*
   * What would a competent human staff do with this recruit right now?
   * Close when the fit is believed, sell the campus once interest allows,
   * work the family when the relationship lags, and keep cheap contact
   * flowing otherwise — all inside the week's remaining points and the
   * year's remaining budget.
   */
  function chooseAIAction(gameState, school, rec, st, o) {
    const A = D.RECRUIT_ACTIONS;
    const affordable = (k) =>
      o.econ.points >= A[k].points && o.econ.budget >= A[k].cost && A[k].cost <= o.weekSpend + 400;

    // 0) A recruit committed ELSEWHERE: the only play left is the Sway flip
    //    attempt (rebuilt). Confident staffs with a real foot in the door
    //    occasionally take the ~35% shot; everyone else moves on.
    if (rec.committedTo && rec.committedTo !== school.id) {
      if (st.offered && affordable('sway') && o.coachRecruiting >= 60 &&
          o.rng && o.rng.bool(o.coachRecruiting >= 78 ? 0.20 : 0.10)) {
        if (commitChance(gameState, school, rec) >= 0.10) return 'sway';
      }
      return null;
    }

    // 1) The close: offer when the AI believes in the match and slots remain.
    //    Late in the cycle programs behind on their class lower the bar —
    //    empty roster spots trigger aggressive recruiting, and the final two
    //    weeks are a genuine closing sweep so no class goes unsigned for
    //    want of paperwork.
    const talentBar = 34 + school.prestige * 0.62 + o.urgency * 12;
    // Quality over quantity (Update 11.1): a high-prestige program doesn't
    // spend offers on recruits well beneath its level — a blue blood chases
    // blue-chips, not depth pieces — unless it's genuinely desperate late in
    // the cycle. The floor rises with prestige and lifts once the closing
    // sweep begins, so a strong roster ends up with a small, elite class.
    const talentFloor = school.prestige >= 72 && o.urgency < 2 ? school.prestige * 0.5 : 0;
    // In the closing sweep a program short on bodies offers on contact —
    // a roster spot in hand beats an empty locker. Bars start low so offers
    // move early rather than a season of letters followed by a panic.
    const interestBar = o.urgency >= 2 ? -1 : o.urgency === 1 ? 10 : 20;
    const composite = recruitComposite(rec);
    if (!st.offered && st.interest > interestBar &&
        composite <= talentBar && composite >= talentFloor && affordable('offer')) {
      const oc = ctxOfferCount(o.ctx, school.id, rec.gender);
      if (oc < offerCap(school, rec.gender, o.need.target)) return 'offer';
    }
    // 1b) Scouting: fog of war is the player's problem alone, so an Auto
    //     Recruiting staff sends a scout to a race before it commits real
    //     money to a name it can't read. (CPU programs carry no fog — a
    //     scouting trip would buy them nothing.)
    if (school.id === gameState.playerSchoolId && !st.offered &&
        rec.playerKnowledge.scout < 40 && st.interest >= 10 && affordable('watchRace')) {
      return 'watchRace';
    }
    // 2) The big sell: get them to campus, then keep them overnight.
    if (!st.visited && st.interest >= 30 && affordable('campusVisit')) return 'campusVisit';
    if (st.visited && !st.overnight && st.interest >= 45 && affordable('hostOvernight')) return 'hostOvernight';
    // 3) Work the family when the bond is the bottleneck.
    if (st.relationship < 55 && affordable('homeVisit')) return 'homeVisit';
    // 4) Keep contact flowing at whatever the budget allows.
    if (affordable('assistantVisit')) return 'assistantVisit';
    if (affordable('meetTeam') && st.interest >= 20) return 'meetTeam';
    if (affordable('call')) return 'call';
    if (affordable('letter')) return 'letter';
    return null;
  }

  function ctxOfferCount(ctx, schoolId, gender) {
    return (ctx.offerCounts[schoolId] && ctx.offerCounts[schoolId][gender]) || 0;
  }

  function aiRecruitWeek(gameState, rng, ctx) {
    const R = gameState.recruiting;
    const week = gameState.week;
    if (week > D.RECRUITING.SIGNING_WEEK) return;
    const weeksLeft = Math.max(1, D.RECRUITING.SIGNING_WEEK - week + 1);

    for (const school of Object.values(gameState.world.schools)) {
      // Auto Recruiting: when the player flips the toggle, their program is
      // recruited by this exact same path — same boards, same actions, same
      // economy. No special treatment in either direction.
      const isPlayer = school.id === gameState.playerSchoolId;
      if (isPlayer && !R.auto) continue;
      const coach = gameState.getCoach(school.coachId);
      if (!coach) continue;

      ensureAIBoard(gameState, school, rng, ctx);
      // Mirror the AI's working board onto the player's visible board so
      // they can follow along while the CPU runs their recruiting.
      if (isPlayer) {
        const aiBoard = R.aiBoards[school.id];
        R.board = { M: aiBoard.M.slice(), W: aiBoard.W.slice() };
      }
      const board = R.aiBoards[school.id];
      const econ = makeEcon(gameState, school, coach);
      // Budget pacing: spend the year's budget evenly-but-confidently, the
      // way a staff that intends to use all of it does — never dumping it
      // all in September, never sitting on it until signing day.
      let weekSpend = Math.max(1500, Math.round((econ.budget / weeksLeft) * 1.7));
      const aggressive = coach.archetype === 'Recruiter' ||
        (coach.hasTendency && coach.hasTendency('elite-recruiter'));

      // Work genders in alternating priority so one squad never starves.
      const genders = week % 2 === 0 ? ['M', 'W'] : ['W', 'M'];
      genders.forEach((gender) => {
        const need = ctx.needs[school.id][gender];
        const committedCount = (ctx.commitCounts[school.id] && ctx.commitCounts[school.id][gender]) || 0;
        // CPU coaches keep recruiting until roster needs are met — then stop.
        if (committedCount >= need.target) return;
        // Urgency rises as signing day nears with the class still short:
        // 1 = push harder and lower the bars, 2 = the final closing sweep.
        // Update 11: both fire earlier — bigger classes need a longer close.
        const urgency = weeksLeft <= 3 ? 2 : weeksLeft <= 8 ? 1 : 0;

        const targets = board[gender]
          .map((id) => gameState.world.recruits[id])
          .filter((r) => {
            if (!r || r.signed || r.committedTo === school.id) return false;
            // Committed-elsewhere recruits stay workable only as flip targets.
            if (r.committedTo) {
              const mine = r.interests[school.id];
              return !!(mine && mine.offered);
            }
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
          .sort((a, b) => recruitComposite(b) - recruitComposite(a));

        // Points are shared across both squads (like the player's), with a
        // soft per-gender ceiling so the first squad can't spend everything.
        const genderPointCap = Math.ceil(econ.points * 0.7);
        let spentHere = 0;
        // Bigger classes need a wider weekly rotation (Update 11): staffs
        // chasing 6-8 signees work more names per week than replacement-only
        // programs, on the same point economy.
        const workCount = Math.min(targets.length,
          (aggressive ? 6 : 5) + urgency * 2 + Math.max(0, need.target - 4));
        for (let i = 0; i < workCount; i++) {
          const rec = targets[i];
          if (econ.points <= 0 || spentHere >= genderPointCap) break;
          const st = rec.getSchoolState(school.id, true);
          while ((econ.actions[rec.id] || 0) < D.MAX_ACTIONS_PER_RECRUIT_WEEK &&
                 econ.points > 0 && spentHere < genderPointCap) {
            const key = chooseAIAction(gameState, school, rec, st, { econ, weekSpend, urgency, need, ctx, coachRecruiting: coach.recruiting || 55, rng });
            if (!key) break;
            const cost = D.RECRUIT_ACTIONS[key];
            if (!tryAIAction(gameState, school, coach, rec, key, econ, rng, ctx)) break;
            spentHere += cost.points;
            weekSpend -= cost.cost;
          }
        }
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
        // The picky threshold softens as signing day nears (Update X): a
        // recruit holding real offers stops holding out for a dream school.
        const appealFloor = week >= D.RECRUITING.SIGNING_WEEK - 2 ? 40 : 52;
        if (best.appeal < appealFloor) continue;

        // Probability of pulling the trigger rises as signing day nears.
        const urgency = (week - rec.decisionWeek + 1) / Math.max(1, D.RECRUITING.SIGNING_WEEK - rec.decisionWeek + 1);
        const p = Utils.clamp(0.08 + urgency * 0.35 + (best.appeal - 52) / 150, 0, 0.75);
        if (rng.bool(p)) {
          // The decision runs on the recruit's top-9 ranking: the leader wins
          // 50% of these, #2 25%, #3 12% — finishing first genuinely pays.
          const pool = ranked.slice(0, 9).map((o, i) => ({ ...o, rank: i }));
          const choice = rng.weightedChoice(pool, (o) => rankWeight(o.rank));
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
        // Signing-day rule (Update X, Part 7): a recruit holding at least one
        // valid offer ALWAYS signs somewhere. They evaluate every offer, rank
        // the schools, and pick a destination — usually the best fit, with
        // the occasional heart-over-head surprise. Only recruits with zero
        // offers go unsigned.
        const offers = Object.keys(rec.interests).filter((sid) =>
          rec.interests[sid].offered && gameState.getSchool(sid));
        if (offers.length) {
          // Signing probability runs on the final top-9 ranking: 1st signs
          // them 50% of the time, 2nd 25%, 3rd 12%, then 6/3/2/1/0.5/0.5 —
          // the school that finishes first on the board wins far more often.
          const ranked = offers
            .map((sid) => ({ sid, appeal: appeal(gameState, gameState.getSchool(sid), rec, ctx) }))
            .sort((a, b) => b.appeal - a.appeal);
          const pool = ranked.slice(0, 9).map((o, i) => ({ ...o, rank: i }));
          rec.committedTo = pool.length > 1
            ? rng.weightedChoice(pool, (o) => rankWeight(o.rank)).sid
            : pool[0].sid;
        }
      }
      if (rec.committedTo) {
        rec.signed = true;
        (classes[rec.committedTo] = classes[rec.committedTo] || []).push(rec);
      }
    }

    // Rank the signing classes (Update 11.1: quality over quantity).
    const ranking = Object.entries(classes)
      .map(([sid, recs]) => ({
        schoolId: sid,
        division: (gameState.getSchool(sid) || {}).division || 'DI',
        score: classScore(recs),
        count: recs.length,
        stars: Math.round(recs.reduce((s, r) => s + r.starRating, 0) / recs.length * 10) / 10
      }))
      .sort((a, b) => b.score - a.score);

    // Division-separated recruiting rankings (Update 5, Part 11): each
    // division runs its own recruiting race, so a DII program's #1 DII class
    // is a genuine achievement rather than being buried under DI. Every entry
    // carries both its national rank and its within-division rank.
    const divCounters = {};
    ranking.forEach((entry, i) => {
      entry.rank = i + 1; // national
      divCounters[entry.division] = (divCounters[entry.division] || 0) + 1;
      entry.divisionRank = divCounters[entry.division];
    });

    // Every signing class is ranked (Update 11): a single signee of any star
    // level puts a program on its division's board — there is no talent
    // threshold. The stored ledger keeps each division's top 60 (plus the
    // player's class wherever it lands) so saves stay a sane size while the
    // rankings screen always has a full board for DI, DII, and DIII alike.
    const storedPerDiv = {};
    const stored = ranking.filter((entry) => {
      storedPerDiv[entry.division] = (storedPerDiv[entry.division] || 0) + 1;
      return storedPerDiv[entry.division] <= 60 || entry.schoolId === gameState.playerSchoolId;
    });
    gameState.history.recruitingClasses[gameState.year] = stored.map((entry) => ({
      rank: entry.rank,
      divisionRank: entry.divisionRank,
      division: entry.division,
      schoolId: entry.schoolId,
      schoolName: gameState.getSchool(entry.schoolId)?.name || '?',
      score: entry.score,
      count: entry.count,
      avgStars: entry.stars
    }));

    // Permanent ledgers (Parts 8-9): top classes per program, best class per
    // coach. Recorded by within-division rank (Update 5, Part 11) so a strong
    // DII/DIII class counts as the achievement it is.
    const Legacy = window.XCD.engine.Legacy;
    ranking.forEach((entry) => {
      const rank = entry.divisionRank;
      Legacy.recordClassRank(gameState, entry.schoolId, gameState.year, rank);
      const school = gameState.getSchool(entry.schoolId);
      // Credit the class to whoever runs recruiting: the head coach, and the
      // assistant/recruiting coordinator, so assistants build a résumé too.
      [school && school.coachId, school && school.assistantId].forEach((cid) => {
        const coach = cid && gameState.getCoach(cid);
        if (coach && (!coach.careerRecord.bestClassRank || rank < coach.careerRecord.bestClassRank)) {
          coach.careerRecord.bestClassRank = rank;
        }
      });
    });

    // CPU coaches earn the same top-10-class upgrade point the player earns
    // (Update 13) and put it to work immediately — the CPU never banks.
    ranking.forEach((entry) => {
      if (entry.divisionRank > 10 || entry.schoolId === gameState.playerSchoolId) return;
      const school = gameState.getSchool(entry.schoolId);
      const coach = school && gameState.getCoach(school.coachId);
      if (coach && !coach.isPlayer) {
        coach.upgradePoints = (coach.upgradePoints || 0) + 1;
        window.XCD.engine.Awards.cpuSpendUpgradePoints(coach, rng);
      }
      // A top-10 class is the recruiting coordinator's résumé line too: the
      // CPU assistant banks the same point and spends it immediately.
      const asst = school && school.assistantId && gameState.getCoach(school.assistantId);
      if (asst && !asst.isPlayer && asst.id !== (coach && coach.id)) {
        asst.upgradePoints = (asst.upgradePoints || 0) + 1;
        window.XCD.engine.Awards.cpuSpendUpgradePoints(asst, rng);
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

    const playerEntry = ranking.find((e) => e.schoolId === gameState.playerSchoolId);
    // Judge the player against their own division's recruiting race (Part 11).
    const playerRank = playerEntry ? playerEntry.divisionRank - 1 : -1; // 0-indexed within division
    const playerDiv = (gameState.getPlayerSchool().division) || 'DI';
    const divLabel = window.XCD.data.divisionFor(gameState.getPlayerSchool()).label;
    const playerClass = classes[gameState.playerSchoolId] || [];
    if (playerClass.length) {
      gameState.logNews(`Your ${playerClass.length}-runner class signs — ranked #${playerRank + 1} in ${divLabel} (#${playerEntry.rank} nationally).`);
      const coach = gameState.getPlayerCoach();
      // Elite recruiting hauls feed coach progression.
      if (playerRank >= 0 && playerRank < 10 && coach) {
        coach.upgradePoints = (coach.upgradePoints || 0) + 1;
        gameState.logNews(`📋 Top-10 ${playerDiv} recruiting class: +1 dynasty point.`);
      }
      // Building a recruiting reputation is an assistant's whole career arc
      // (Update 5, Part 4): strong classes make them a head-coach candidate.
      // Update X: gains are larger and division-weighted — a top-5 DI class
      // is a bigger résumé line than a top DII or DIII class, because the
      // recruiting competition is fiercer at the higher level.
      // Update 11: the lower-division discount softened (DIII 0.5 → 0.7,
      // DII 0.7 → 0.85) so a DIII assistant who recruits well builds a real
      // résumé at a livable pace — the climb is slower than DI, not hopeless.
      if (gameState.isAssistant() && coach && playerRank >= 0) {
        const divW = { DI: 1, DII: 0.85, DIII: 0.7 }[playerDiv] ?? 1;
        let repGain = 0;
        if (playerRank < 3) repGain = 9;
        else if (playerRank < 5) repGain = 7.5;
        else if (playerRank < 10) repGain = 5.5;
        else if (playerRank < 25) repGain = 3;
        else if (playerRank < 45) repGain = 1.4;
        repGain = Math.round(repGain * divW * 10) / 10;
        if (repGain) {
          coach.reputation = window.XCD.core.Utils.clamp((coach.reputation || 12) + repGain, 1, 99);
          gameState.logNews(`📈 Coach ${coach.lastName} builds a name as a recruiter — reputation rising after a #${playerRank + 1} ${playerDiv} class.`);
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
      // Eligibility is granted by the division the athlete ENROLLS in
      // (accurate NCAA rules): DI freshmen hold five seasons of competition
      // on the five-year clock, DII/DIII four-in-five. JUCO transfers have
      // already burned a season of competition on their clock.
      const divSeasons = (D.eligibilityFor ? D.eligibilityFor(school) : { seasons: 4 }).seasons;
      recs.forEach((rec) => {
        const athlete = new M.Athlete({
          ...rec,
          id: rec.id, // keep identity for history continuity
          isRecruit: false,
          classYear: rec.source === 'JUCO' ? 'Sophomore' : 'Freshman',
          eligibilityRemaining: rec.source === 'JUCO' ? divSeasons - 1 : divSeasons,
          yearsOnCampus: rec.source === 'JUCO' ? 2 : 1,
          schoolId,
          morale: 75,
          fatigue: 10
        });
        delete athlete.interests;
        delete athlete.playerKnowledge;
        delete athlete.importance;
        delete athlete.motivations;
        // The recruiting fog lifts at enrollment (Update 11): the athlete's
        // real ceiling becomes canonical — a hidden gem's development from
        // here on is the discovery the recruitment never allowed.
        delete athlete.perceivedPotential;
        delete athlete.scoutNotes;
        delete athlete.divisionPreference;
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
    gameState.recruiting.aiBudgets = {}; // every CPU program's budget refills
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
    commitChance,
    rankedSuitors,
    RANK_ODDS,
    fitScore,
    distanceMiles,
    recruitComposite,
    recruitValue,
    classScore,
    perceivedPotential,
    signingTarget,
    weeklyPoints,
    schoolWeeklyPoints,
    scholarshipsUsed,
    offerCap,
    enrollSignees,
    projectedFreshmanOverall,
    generateHsPB
  };
})();
