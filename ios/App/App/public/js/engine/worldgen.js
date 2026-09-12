/*
 * WorldGenerator builds the entire game world (350+ schools, coaches, and
 * full men's/women's rosters) from the raw schools data using a seeded RNG
 * so a given dynasty seed always produces the same starting world.
 */
(function () {
  const D = window.XCD.data;
  const M = window.XCD.models;
  const Utils = window.XCD.core.Utils;

  const ELITE_ACADEMICS = new Set([
    'Stanford','Duke','Notre Dame','Georgetown','Vanderbilt','Rice','Northwestern','Boston College',
    'Brown','Columbia','Cornell','Dartmouth','Harvard','Penn','Princeton','Yale','UCLA','USC',
    'Virginia','Michigan','California','William & Mary','Richmond','Villanova','Bucknell','Lehigh',
    'Lafayette','Colgate','Fordham','Wake Forest','Davidson'
  ]);

  const CLASS_DEV_FACTOR = { Freshman: 0.55, Sophomore: 0.68, Junior: 0.80, Senior: 0.92, Graduate: 0.97 };
  const CLASS_AGE_BASE = { Freshman: 18, Sophomore: 19, Junior: 20, Senior: 21, Graduate: 22 };

  // Prestige ranges are absolute and national (one scale across all three
  // divisions), so combined regular-season polls sort naturally: DI powers
  // on top, DII/DIII below — while a strong DII flagship still overlaps the
  // weakest DI programs (and can beat them in cross-division meets). Within
  // its own division a school is still judged against its peers.
  function tierPrestigeRange(tier, division) {
    if (division === 'DII') {
      switch (tier) {
        case 1: return [42, 64];
        case 2: return [32, 54];
        default: return [24, 46];
      }
    }
    if (division === 'DIII') {
      switch (tier) {
        case 1: return [34, 54];
        case 2: return [26, 46];
        default: return [20, 40];
      }
    }
    // Non-seeded programs sit BELOW the elite tier: the 80+ blue-blood band is
    // reserved for real cross country powers (PRESTIGE_SEEDS), so a football-
    // brand school with no distance pedigree starts strong-but-not-elite rather
    // than randomly inflated. Genuine XC powers get their standing from seeds.
    switch (tier) { // Division I
      case 1: return [56, 80];
      case 2: return [44, 72];
      case 3: return [32, 60];
      default: return [20, 50];
    }
  }

  function buildSchool(rng, raw, division = 'DI') {
    const [name, state, conference] = raw;
    const region = D.STATE_REGION[state] || 'Midwest';
    const tier = (D.CONFERENCES[conference] || { tier: 3 }).tier;
    const [pMin, pMax] = tierPrestigeRange(tier, division);
    // Real-world heritage (Update 4, Part 8): historically great cross country
    // programs open with elevated prestige and a resilient `heritage` value.
    const seed = D.PRESTIGE_SEEDS && D.PRESTIGE_SEEDS[name];
    let prestige = rng.int(pMin, pMax);
    let heritage = 0;
    if (seed !== undefined) {
      prestige = Utils.clamp(seed + rng.int(-3, 3), pMin, 99);
      heritage = seed;
    }
    const divRules = D.divisionFor(division);

    // Consume the same RNG draws as before (world determinism is preserved),
    // then let the real-world academic seed win when the school has one so a
    // program's Academics rating matches its true academic standing.
    let academics = rng.int(35, 78) + (tier === 1 ? 6 : 0);
    if (ELITE_ACADEMICS.has(name)) academics += rng.int(12, 20);
    const acadSeed = D.ACADEMIC_SEEDS && D.ACADEMIC_SEEDS[name];
    if (acadSeed !== undefined) academics = acadSeed;
    academics = Utils.clamp(academics, 30, 99);

    const campusAppeal = Utils.clamp(Math.round(prestige * 0.5 + rng.int(15, 45)), 20, 99);

    // Five facilities that matter (spec Part 2): training center (development),
    // weight room (injury prevention), rehab center (recovery), indoor track
    // (sharpness & speed work), alumni center (fundraising & pull).
    const fBase = Utils.clamp(prestige - rng.int(-8, 8), 20, 95);
    const facilities = {
      trainingCenter: Utils.clamp(fBase + rng.int(-10, 10), 15, 99),
      weightRoom: Utils.clamp(fBase + rng.int(-10, 10), 15, 99),
      rehabCenter: Utils.clamp(fBase - 8 + rng.int(-10, 10), 10, 99),
      indoorTrack: Utils.clamp(fBase - 18 + rng.int(-15, 15), 5, 95),
      alumniCenter: Utils.clamp(Math.round(prestige * 0.6 + (heritage ? 12 : 0)) + rng.int(-8, 12), 10, 99)
    };

    // Budgets scale by conference tier AND by division: DII operates on a
    // fraction of DI money, DIII on far less (data-driven via divisionFor).
    const budgetScale = ({ 1: 1.0, 2: 0.65, 3: 0.4, 4: 0.22 }[tier]) * divRules.budgetScale;
    const budgetTotal = Math.round((300000 + prestige * 4000) * budgetScale);
    const budget = {
      total: budgetTotal,
      recruiting: Math.round(budgetTotal * 0.16),
      travel: Math.round(budgetTotal * 0.22),
      scholarships: divRules.scholarshipModel === 'none' ? 0 : Math.round(budgetTotal * 0.42),
      nil: divRules.nil ? Math.round(budgetTotal * 0.08 * (tier === 1 ? 2 : 1)) : 0,
      facilitiesFund: Math.round(budgetTotal * 0.12)
    };

    const weatherProfile = D.REGION_WEATHER[region] || { tempBase: 60, altitude: 'Low', humidity: 'Medium' };
    // Altitude is a REAL location trait (Realism Update): a program's elevation
    // is deterministic and matches its true campus (Northern Arizona always
    // trains high; Utah State moderate), never a per-save coin flip.
    const altitude = D.altitudeForSchool(name, state) || weatherProfile.altitude;

    const historicalSuccess = {
      conferenceTitlesM: rng.bool(0.3) ? rng.int(0, Math.max(1, Math.round(tier === 1 ? 12 : 4))) : 0,
      conferenceTitlesW: rng.bool(0.3) ? rng.int(0, Math.max(1, Math.round(tier === 1 ? 12 : 4))) : 0,
      nationalTitlesM: tier === 1 && rng.bool(0.08) ? rng.int(1, 3) : 0,
      nationalTitlesW: tier === 1 && rng.bool(0.08) ? rng.int(1, 3) : 0
    };

    // Blue bloods start with a title or two on the books to match their lore.
    if (heritage >= 82 && division === 'DI') {
      historicalSuccess.nationalTitlesM += rng.int(0, 3);
      historicalSuccess.nationalTitlesW += rng.int(0, 2);
    } else if (heritage >= 55) {
      historicalSuccess.conferenceTitlesM += rng.int(1, 5);
      historicalSuccess.conferenceTitlesW += rng.int(1, 5);
    }

    return new M.School({
      name, state, city: D.cityForSchool({ name, state }), region, conference, conferenceTier: tier,
      division,
      prestige, heritage, academics, campusAppeal, facilities, budget,
      weather: { tempBase: weatherProfile.tempBase + rng.int(-4, 4), altitude, humidity: weatherProfile.humidity },
      historicalSuccess
    });
  }

  function randomHometown(rng, schoolRegion) {
    let region = schoolRegion;
    if (!rng.bool(0.55)) {
      const regions = Object.values(D.STATE_REGION);
      region = rng.choice(regions);
    }
    const statesInRegion = Object.keys(D.STATE_REGION).filter((s) => D.STATE_REGION[s] === region);
    const state = rng.choice(statesInRegion) || 'OH';
    // Real hometowns (Realism Update): athletes come from authentic towns in
    // their state — never a procedurally-assembled place name.
    const towns = (D.REAL_TOWNS && D.REAL_TOWNS[state]) || (D.REAL_TOWNS && D.REAL_TOWNS.OH) || ['Columbus'];
    return { city: rng.choice(towns), state, region };
  }

  function buildAthlete(rng, school, gender) {
    const classYear = rng.weightedChoice(D.CLASS_YEARS, (c) => (c === 'Graduate' ? 6 : 24));
    const devFactor = CLASS_DEV_FACTOR[classYear];
    const ageBase = CLASS_AGE_BASE[classYear];
    const age = ageBase + rng.int(0, 1);

    // Recruits arriving at higher-prestige programs skew toward higher ceilings,
    // but every tier produces occasional gems and busts.
    const prestige = school.prestige;
    const potentialMean = 35 + prestige * 0.45;
    const potential = Utils.clamp(Math.round(rng.gaussian(potentialMean, 14)), 20, 99);

    const statMean = Utils.clamp(potential * devFactor, 15, 97);
    const statFor = () => rng.gaussianRange(statMean, 8, 10, 99);

    const home = randomHometown(rng, school.region);
    const firstName = gender === 'M' ? rng.choice(D.FIRST_NAMES_M) : rng.choice(D.FIRST_NAMES_W);

    const academicsBase = Utils.clamp(school.academics + rng.int(-20, 10), 25, 99);

    const athlete = new M.Athlete({
      firstName,
      lastName: rng.choice(D.LAST_NAMES),
      gender,
      hometownCity: home.city,
      hometownState: home.state,
      region: home.region,
      classYear,
      age,
      heightIn: rng.int(gender === 'M' ? 66 : 62, gender === 'M' ? 76 : 70),
      weightLb: rng.int(gender === 'M' ? 115 : 95, gender === 'M' ? 165 : 135),
      major: rng.choice(D.MAJORS),

      academics: academicsBase,
      leadership: rng.gaussianRange(classYear === 'Senior' || classYear === 'Graduate' ? 62 : 48, 15, 15, 99),
      confidence: rng.gaussianRange(58, 15, 15, 99),
      consistency: rng.gaussianRange(58, 14, 15, 99),
      workEthic: rng.gaussianRange(62, 14, 20, 99),
      mentalToughness: statFor(),
      raceIQ: rng.gaussianRange(statMean - 5, 10, 15, 99),
      personality: rng.choice(D.ATHLETE_PERSONALITIES),

      preferredDistance: rng.choice(D.PREFERRED_DISTANCES),
      preferredClimate: rng.choice(D.PREFERRED_CLIMATES),
      preferredSchoolSize: rng.choice(D.PREFERRED_SCHOOL_SIZES),

      potential,
      peakOverall: potential,

      vo2Max: statFor(), lactateThreshold: statFor(), runningEconomy: statFor(),
      stamina: statFor(), speed: statFor(),
      injuryResistance: rng.gaussianRange(58, 14, 15, 99), // mostly innate, barely trainable
      hillAdaptation: rng.gaussianRange(40, 12, 10, 85),

      fatigue: rng.int(5, 20),
      fitness: Math.round(Utils.clamp(statMean - rng.int(0, 15), 10, 90)),
      sharpness: rng.int(45, 65),
      chronicMileage: gender === 'M' ? rng.int(55, 80) : rng.int(45, 70),
      morale: rng.int(55, 85),
      devProfile: rng.weightedChoice(D.DEV_PROFILES, (p) => p.weight).type,

      // Eligibility (Update 20 — redshirts removed): every athlete gets five
      // straight years; a Freshman has all five, a Senior two, and so on.
      eligibilityRemaining: Math.max(1,
        window.XCD.data.eligibilityFor(school).seasons -
        ({ Freshman: 0, Sophomore: 1, Junior: 2, Senior: 3, Graduate: 4 }[classYear] || 0)),
      yearsOnCampus: { Freshman: 1, Sophomore: 2, Junior: 3, Senior: 4, Graduate: 5 }[classYear],
      schoolId: school.id
    });
    athlete.recalculateOverall();
    return athlete;
  }

  function buildCoach(rng, school, isPlayer, role = 'Head') {
    const gender = rng.bool(0.75) ? 'M' : 'W';
    const firstName = gender === 'M' ? rng.choice(D.FIRST_NAMES_M) : rng.choice(D.FIRST_NAMES_W);
    const tierBonus = { 1: 14, 2: 6, 3: 0, 4: -6 }[school.conferenceTier];
    // Strong programs are led by strong coaches (Realism Update): a head
    // coach's quality tracks the PROGRAM'S prestige and heritage, so an elite
    // historical program is never handed a poor coach — even when it sits in a
    // weak conference (Northern Arizona in the Big Sky, Iona in the MAAC).
    // Rebuilding programs skew toward weaker, hungrier coaches.
    const prestigeBonus = Utils.clamp(
      Math.round((school.prestige - 58) * 0.42) +
      (school.heritage >= 82 ? 6 : school.heritage >= 55 ? 3 : 0), -12, 20);
    // Heads: the better of conference pull and program prestige. Assistants
    // track the program's resources (conference) at a junior level.
    const strengthBonus = role === 'Assistant' ? tierBonus : Math.max(tierBonus, prestigeBonus);
    // Lower divisions employ less-established coaches on average — but the
    // division-agnostic ladder still lets the great ones climb.
    const divPenalty = { DI: 0, DII: 6, DIII: 10 }[school.division || 'DI'] || 0;
    const rolePenalty = role === 'Assistant' ? 8 : 0;
    const statFor = () => rng.gaussianRange(56 + strengthBonus - rolePenalty - divPenalty, 13, 20, 99);

    const archetype = rng.choice(D.COACH_ARCHETYPES);
    // Initial dynasty (Update 3): coaches span 25-75 so the world starts with
    // a realistic age spread; future generated coaches start younger.
    const coach = new M.Coach({
      firstName,
      lastName: rng.choice(D.LAST_NAMES),
      gender,
      age: role === 'Assistant' ? rng.int(25, 52) : rng.int(25, 75),
      role,
      archetype: archetype.key,
      portrait: rng.choice(D.COACH_PORTRAITS),
      recruiting: statFor(), training: statFor(), peaking: statFor(), culture: statFor(),
      talentEval: statFor(), motivation: statFor(), transferRecruiting: statFor(),
      internationalRecruiting: Utils.clamp(statFor() - 10, 15, 95),
      media: statFor(), staffManagement: statFor(), relationships: statFor(),
      retireAge: 75 + rng.int(0, 8), // retirement is random, always 75+
      schoolId: school.id,
      isPlayer,
      yearsAtSchool: 0
    });
    coach.almaMater = rng.choice(D.ALMA_MATERS);
    // Tenure can't exceed a plausible career length for the coach's age.
    if (!isPlayer) coach.yearsAtSchool = Math.min(rng.int(0, 14), Math.max(0, coach.age - 26));
    // Seed years of experience so a generated coach reads as a real career.
    if (!isPlayer) coach.careerRecord.seasons = coach.yearsAtSchool;
    // Archetypes matter: a real bump to the signature rating.
    coach[archetype.rating] = Utils.clamp(coach[archetype.rating] + 12, 20, 99);

    // Tendencies (Part 2): one or two identity traits per coach, seeded
    // from ratings so identities feel earned rather than random.
    const t = [];
    if (coach.recruiting >= 68) t.push('elite-recruiter');
    else if (coach.training >= 66) t.push('development-specialist');
    if (coach.transferRecruiting >= 70) t.push('transfer-expert');
    if (coach.internationalRecruiting >= 62) t.push('international');
    else if (rng.bool(0.35)) t.push('regional');
    t.push(rng.bool(0.5) ? (rng.bool(0.45) ? 'mileage-heavy' : 'low-mileage') : null);
    t.push(rng.bool(0.55) ? (rng.bool(0.5) ? 'aggressive' : 'conservative') : null);
    coach.tendencies = t.filter(Boolean).slice(0, 3);

    // Hidden career ambition (Update 16): lightly biased by the coach's
    // archetype so identities feel of a piece, but with real spread — every
    // motivation appears across the simulation, and it stays private.
    coach.ambition = pickAmbition(rng, coach);

    // Coaching philosophies (Update 4): seeded from identity for variety, with
    // real randomness so every philosophy appears across the simulation. The
    // training philosophy is permanent; the race philosophy is a tactic.
    coach.trainingPhilosophy = pickTrainingPhilosophy(rng, coach);
    coach.racePhilosophy = pickRacePhilosophy(rng, coach);

    // Reputation (Part 1): seeded from stature — most coaches start as
    // regional names; blue-blood veterans arrive established. A storied
    // program's head coach carries a national name to match the program.
    const heritageRep = role === 'Assistant' ? 0
      : (school.heritage >= 82 ? 10 : school.heritage >= 55 ? 5 : 0);
    coach.reputation = Utils.clamp(Math.round(
      coach.overallRating * 0.5 + strengthBonus - divPenalty + heritageRep +
      coach.yearsAtSchool * 0.8 + rng.int(-8, 8) - (role === 'Assistant' ? 15 : 0)
    ), 3, 88);

    coach.stints = [{ schoolId: school.id, school: school.name, division: school.division || 'DI', startYear: 2026 - coach.yearsAtSchool, endYear: null }];
    return coach;
  }

  // Identity-biased but genuinely varied philosophy assignment for AI coaches.
  function pickTrainingPhilosophy(rng, coach) {
    const t = coach.tendencies || [];
    if (t.includes('mileage-heavy') && rng.bool(0.6)) return 'high-mileage';
    if (t.includes('low-mileage') && rng.bool(0.6)) return 'speed';
    if (coach.archetype === 'Developer' && rng.bool(0.4)) return 'polarized';
    if (coach.archetype === 'Tactician' && rng.bool(0.4)) return 'threshold';
    if (coach.lactateThreshold >= 72 && rng.bool(0.4)) return 'norwegian';
    return rng.choice(D.TRAINING_PHILOSOPHIES).key;
  }

  function pickRacePhilosophy(rng, coach) {
    const t = coach.tendencies || [];
    if (t.includes('aggressive') && rng.bool(0.6)) return 'aggressive';
    if (t.includes('conservative') && rng.bool(0.6)) return 'conservative';
    if (coach.archetype === 'Players Coach' && rng.bool(0.45)) return 'pack';
    if (coach.speed >= 70 && rng.bool(0.4)) return 'sit-and-kick';
    return rng.choice(D.RACE_PHILOSOPHIES).key;
  }

  // Hidden career ambition (Update 16): archetype nudges the odds, but every
  // motivation still shows up across the world so the carousel stays varied.
  function pickAmbition(rng, coach) {
    const AM = D.COACH_AMBITIONS || [];
    if (!AM.length) return null;
    const bias = {
      Recruiter: 'recruiter', Developer: 'builder',
      Tactician: 'careerBuilder', 'Players Coach': 'loyal'
    }[coach.archetype];
    if (bias && rng.bool(0.4)) return bias;
    // Assistants skew a touch more ambitious — they're climbing the ladder.
    if (coach.role === 'Assistant' && rng.bool(0.28)) return 'careerBuilder';
    return rng.choice(AM).key;
  }

  function assignRivalries(schools) {
    const byState = {};
    schools.forEach((s) => {
      byState[s.state] = byState[s.state] || [];
      byState[s.state].push(s);
    });
    Object.values(byState).forEach((group) => {
      if (group.length < 2) return;
      for (let i = 0; i < group.length; i++) {
        const a = group[i];
        const b = group[(i + 1) % group.length];
        if (a.id === b.id) continue;
        if (!a.rivalries.includes(b.id) && a.rivalries.length < 2) a.rivalries.push(b.id);
        if (!b.rivalries.includes(a.id) && b.rivalries.length < 2) b.rivalries.push(a.id);
      }
    });
  }

  /*
   * Walk-ons: fill roster spots below the 14-per-gender requirement.
   * Clearly weaker than scholarship athletes with poor ceilings — but
   * roughly 1 in 1000 is a hidden legend who blossoms into a star.
   */
  function buildWalkOn(rng, school, gender) {
    const athlete = buildAthlete(rng, school, gender);
    athlete.classYear = 'Freshman';
    athlete.age = 18 + rng.int(0, 1);
    athlete.eligibilityRemaining = window.XCD.data.eligibilityFor(school).seasons;
    athlete.yearsOnCampus = 1;
    athlete.isWalkOn = true;

    athlete.potential = rng.int(25, 45);
    ['vo2Max', 'runningEconomy', 'stamina', 'lactateThreshold', 'speed'].forEach((k) => {
      athlete[k] = rng.gaussianRange(30, 6, 12, 45);
    });
    athlete.devProfile = rng.weightedChoice(
      [{ t: 'normal', w: 50 }, { t: 'bust', w: 35 }, { t: 'late', w: 15 }], (p) => p.w).t;

    // The legend roll: ~0.1% of walk-ons secretly have superstar ceilings.
    if (rng.bool(0.001)) {
      athlete.potential = rng.int(88, 99);
      athlete.devProfile = 'legend';
      athlete.workEthic = rng.int(85, 99);
    }
    athlete.recalculateOverall();
    return athlete;
  }

  function generate(seed, options = {}) {
    const rng = new window.XCD.core.SeededRNG(seed);
    const rosterMin = options.rosterMin ?? 14;
    const rosterMax = options.rosterMax ?? 14;

    const schools = {};
    const coaches = {};
    const athletes = {};
    const schoolOrder = [];

    // Every active division populates from its own real-school roster. The
    // three divisions coexist in one world; postseason stays separate, while
    // regular-season invitationals may mix them (handled by the race engine).
    const divisionRosters = [
      ['DI', D.RAW_SCHOOLS],
      ['DII', D.RAW_SCHOOLS_DII || []],
      ['DIII', D.RAW_SCHOOLS_DIII || []]
    ];

    divisionRosters.forEach(([division, raws]) => {
      if (!D.divisionFor(division).active) return;
      raws.forEach((raw) => {
        const school = buildSchool(rng, raw, division);
        const coach = buildCoach(rng, school, false);
        school.coachId = coach.id;
        const assistant = buildCoach(rng, school, false, 'Assistant');
        school.assistantId = assistant.id;
        // Coaching tree (Update 6): the head who employs you is your mentor.
        assistant.mentorName = coach.fullName;
        assistant.mentorId = coach.id;
        assistant.workedFor = [{ name: coach.fullName, school: school.name, year: null }];
        coaches[assistant.id] = assistant;

        const rosterSizeM = rng.int(rosterMin, rosterMax);
        const rosterSizeW = rng.int(rosterMin, rosterMax);
        for (let i = 0; i < rosterSizeM; i++) {
          const athlete = buildAthlete(rng, school, 'M');
          athletes[athlete.id] = athlete;
          school.rosterM.push(athlete.id);
        }
        for (let i = 0; i < rosterSizeW; i++) {
          const athlete = buildAthlete(rng, school, 'W');
          athletes[athlete.id] = athlete;
          school.rosterW.push(athlete.id);
        }

        schools[school.id] = school;
        coaches[coach.id] = coach;
        schoolOrder.push(school.id);
      });
    });

    assignRivalries(Object.values(schools));

    return { schools, coaches, athletes, schoolOrder, seed };
  }

  /*
   * Build only the Division II and III worlds (Update 3 save migration):
   * existing DI-only dynasties gain the lower divisions so all three
   * coexist. Returns plain maps to merge into an existing world.
   */
  function generateLowerDivisions(seed, options = {}) {
    const rng = new window.XCD.core.SeededRNG((seed ^ 0xD22D33) >>> 0);
    const rosterMin = options.rosterMin ?? 14;
    const rosterMax = options.rosterMax ?? 14;
    const schools = {};
    const coaches = {};
    const athletes = {};
    const order = [];

    [['DII', D.RAW_SCHOOLS_DII || []], ['DIII', D.RAW_SCHOOLS_DIII || []]].forEach(([division, raws]) => {
      if (!D.divisionFor(division).active) return;
      raws.forEach((raw) => {
        const school = buildSchool(rng, raw, division);
        const coach = buildCoach(rng, school, false);
        school.coachId = coach.id;
        const assistant = buildCoach(rng, school, false, 'Assistant');
        school.assistantId = assistant.id;
        assistant.mentorName = coach.fullName;
        assistant.mentorId = coach.id;
        assistant.workedFor = [{ name: coach.fullName, school: school.name, year: null }];
        coaches[assistant.id] = assistant;
        coaches[coach.id] = coach;
        const rM = rng.int(rosterMin, rosterMax);
        const rW = rng.int(rosterMin, rosterMax);
        for (let i = 0; i < rM; i++) { const a = buildAthlete(rng, school, 'M'); athletes[a.id] = a; school.rosterM.push(a.id); }
        for (let i = 0; i < rW; i++) { const a = buildAthlete(rng, school, 'W'); athletes[a.id] = a; school.rosterW.push(a.id); }
        schools[school.id] = school;
        order.push(school.id);
      });
    });
    return { schools, coaches, athletes, order };
  }

  /* ================================================================ *
   * Custom League (Update 13) — team, mascot, color & roster overrides.
   *
   * A custom-league spec's `teams` are applied ON TOP of a fully generated
   * world, so the ~500-school ecosystem (conferences, regions, championships)
   * always stays intact and the simulation never breaks: a team entry either
   * OVERRIDES an existing school by name (rename it, restyle it, re-conference
   * it, rewrite its roster) or ADDS a brand-new program. This keeps custom
   * leagues robust whether the user supplies two teams or two hundred.
   * ================================================================ */
  function applyTeamMeta(school, t, renamed) {
    if (t.mascot) school.mascot = String(t.mascot);
    else if (renamed) school.mascot = D.schoolMeta(school.name).mascot;
    if (Array.isArray(t.colors) && t.colors.length >= 2) {
      school.colors = t.colors.slice(0, 2);
    } else if (renamed) {
      school.colors = D.schoolMeta(school.name).colors.slice();
    }
    if (t.conference) {
      school.conference = String(t.conference);
      school.conferenceTier = (D.CONFERENCES[school.conference] || { tier: 3 }).tier;
    }
    if (t.state && D.STATE_REGION[t.state]) {
      school.state = t.state;
      school.region = D.STATE_REGION[t.state];
    }
    // Real campus city: an explicit custom value wins; otherwise resolve a
    // real town for the (possibly new) state/name so host cities stay authentic.
    if (t.city) school.city = String(t.city);
    else if (renamed || t.state) school.city = D.cityForSchool(school);
    if (t.division && D.DIVISIONS[t.division]) school.division = t.division;
    // Recompute the kit so pattern (name-seeded) and colors stay consistent.
    school.kit = D.kitFor(school.name, { colors: school.colors });
  }

  function applyCustomRoster(world, school, t, rng) {
    const roster = t.roster;
    if (!roster) return;
    ['M', 'W'].forEach((g) => {
      const names = Array.isArray(roster) ? (g === 'M' ? roster : null) : roster[g];
      if (!Array.isArray(names) || !names.length) return;
      const key = g === 'M' ? 'rosterM' : 'rosterW';
      names.forEach((nm, i) => {
        const parts = String(nm).trim().split(/\s+/);
        const first = parts.shift() || 'Runner';
        const last = parts.join(' ') || 'Athlete';
        if (i < school[key].length) {
          const a = world.athletes[school[key][i]];
          if (a) { a.firstName = first; a.lastName = last; }
        } else {
          const a = buildAthlete(rng, school, g);
          a.firstName = first; a.lastName = last;
          world.athletes[a.id] = a;
          school[key].push(a.id);
        }
      });
    });
  }

  function addCustomSchool(world, t, rng) {
    const state = (t.state && D.STATE_REGION[t.state]) ? t.state : 'OR';
    const conf = t.conference || 'Independent';
    const division = (t.division && D.DIVISIONS[t.division]) ? t.division : 'DI';
    const school = buildSchool(rng, [String(t.name), state, conf], division);
    applyTeamMeta(school, t, false);
    const coach = buildCoach(rng, school, false);
    school.coachId = coach.id;
    const assistant = buildCoach(rng, school, false, 'Assistant');
    school.assistantId = assistant.id;
    assistant.mentorName = coach.fullName;
    assistant.mentorId = coach.id;
    assistant.workedFor = [{ name: coach.fullName, school: school.name, year: null }];
    world.coaches[coach.id] = coach;
    world.coaches[assistant.id] = assistant;
    for (let i = 0; i < 14; i++) { const a = buildAthlete(rng, school, 'M'); world.athletes[a.id] = a; school.rosterM.push(a.id); }
    for (let i = 0; i < 14; i++) { const a = buildAthlete(rng, school, 'W'); world.athletes[a.id] = a; school.rosterW.push(a.id); }
    world.schools[school.id] = school;
    world.schoolOrder.push(school.id);
    applyCustomRoster(world, school, t, rng);
    return school;
  }

  function applyCustomLeague(world, spec, seed) {
    if (!spec || !Array.isArray(spec.teams) || !spec.teams.length) return world;
    const rng = new window.XCD.core.SeededRNG((seed ^ 0xC0FFEE) >>> 0);
    const byName = {};
    Object.values(world.schools).forEach((s) => { byName[s.name.toLowerCase()] = s; });

    spec.teams.forEach((t) => {
      if (!t || (!t.name && !t.match)) return;
      const matchKey = String(t.match || t.name).toLowerCase();
      const school = byName[matchKey];
      if (school) {
        let renamed = false;
        if (t.name && String(t.name) !== school.name) {
          delete byName[school.name.toLowerCase()];
          school.name = String(t.name);
          byName[school.name.toLowerCase()] = school;
          renamed = true;
        }
        applyTeamMeta(school, t, renamed);
        applyCustomRoster(world, school, t, rng);
      } else if (t.name) {
        const added = addCustomSchool(world, t, rng);
        byName[added.name.toLowerCase()] = added;
      }
    });
    // Rivalries can shift when states change or teams are added.
    assignRivalries(Object.values(world.schools));
    return world;
  }

  window.XCD.engine.WorldGenerator = {
    generate,
    generateLowerDivisions,
    applyCustomLeague,
    buildAthlete,
    buildWalkOn,
    buildReplacementCoach: (rng, school) => buildCoach(rng, school, false),
    buildAssistant: (rng, school) => buildCoach(rng, school, false, 'Assistant')
  };
})();
