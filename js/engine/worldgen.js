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

  const MOUNTAIN_STATES = new Set(['CO','UT','WY','MT','ID','NM','AZ']);

  const CLASS_DEV_FACTOR = { Freshman: 0.55, Sophomore: 0.68, Junior: 0.80, Senior: 0.92, Graduate: 0.97 };
  const CLASS_AGE_BASE = { Freshman: 18, Sophomore: 19, Junior: 20, Senior: 21, Graduate: 22 };

  function tierPrestigeRange(tier) {
    switch (tier) {
      case 1: return [62, 92];
      case 2: return [48, 76];
      case 3: return [34, 64];
      default: return [22, 54];
    }
  }

  function buildSchool(rng, raw) {
    const [name, state, conference] = raw;
    const region = D.STATE_REGION[state] || 'Midwest';
    const tier = (D.CONFERENCES[conference] || { tier: 3 }).tier;
    const [pMin, pMax] = tierPrestigeRange(tier);
    const prestige = rng.int(pMin, pMax);

    let academics = rng.int(35, 78) + (tier === 1 ? 6 : 0);
    if (ELITE_ACADEMICS.has(name)) academics += rng.int(12, 20);
    academics = Utils.clamp(academics, 30, 99);

    const campusAppeal = Utils.clamp(Math.round(prestige * 0.5 + rng.int(15, 45)), 20, 99);

    const fBase = Utils.clamp(prestige - rng.int(-8, 8), 20, 95);
    const facilities = {
      trainingCenter: Utils.clamp(fBase + rng.int(-10, 10), 15, 99),
      weightRoom: Utils.clamp(fBase + rng.int(-10, 10), 15, 99),
      recoveryCenter: Utils.clamp(fBase - 10 + rng.int(-10, 10), 10, 99),
      nutrition: Utils.clamp(fBase - 5 + rng.int(-10, 10), 10, 99),
      lockerRoom: Utils.clamp(fBase + rng.int(-10, 10), 15, 99),
      indoorTrack: Utils.clamp(fBase - 20 + rng.int(-15, 15), 5, 95),
      altitudeRoom: Utils.clamp((MOUNTAIN_STATES.has(state) ? fBase + 10 : fBase - 30) + rng.int(-10, 10), 0, 95),
      sportsScienceLab: Utils.clamp(fBase - 15 + rng.int(-15, 15), 5, 95)
    };

    const budgetScale = { 1: 1.0, 2: 0.65, 3: 0.4, 4: 0.22 }[tier];
    const budgetTotal = Math.round((300000 + prestige * 4000) * budgetScale);
    const budget = {
      total: budgetTotal,
      recruiting: Math.round(budgetTotal * 0.16),
      travel: Math.round(budgetTotal * 0.22),
      scholarships: Math.round(budgetTotal * 0.42),
      nil: Math.round(budgetTotal * 0.08 * (tier === 1 ? 2 : 1)),
      facilitiesFund: Math.round(budgetTotal * 0.12)
    };

    const weatherProfile = D.REGION_WEATHER[region] || { tempBase: 60, altitude: 'Low', humidity: 'Medium' };
    const altitude = MOUNTAIN_STATES.has(state)
      ? (rng.bool(0.5) ? 'High' : 'Medium')
      : weatherProfile.altitude;

    const historicalSuccess = {
      conferenceTitlesM: rng.bool(0.3) ? rng.int(0, Math.max(1, Math.round(tier === 1 ? 12 : 4))) : 0,
      conferenceTitlesW: rng.bool(0.3) ? rng.int(0, Math.max(1, Math.round(tier === 1 ? 12 : 4))) : 0,
      nationalTitlesM: tier === 1 && rng.bool(0.08) ? rng.int(1, 3) : 0,
      nationalTitlesW: tier === 1 && rng.bool(0.08) ? rng.int(1, 3) : 0
    };

    return new M.School({
      name, state, region, conference, conferenceTier: tier,
      prestige, academics, campusAppeal, facilities, budget,
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
    const city = `${rng.choice(D.TOWN_ROOTS)}${rng.choice(D.TOWN_SUFFIXES)}`;
    return { city: Utils.capitalize(city), state, region };
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
      discipline: rng.gaussianRange(60, 14, 20, 99),
      leadership: rng.gaussianRange(classYear === 'Senior' || classYear === 'Graduate' ? 62 : 48, 15, 15, 99),
      confidence: rng.gaussianRange(58, 15, 15, 99),
      consistency: rng.gaussianRange(58, 14, 15, 99),
      workEthic: rng.gaussianRange(62, 14, 20, 99),
      coachability: rng.gaussianRange(60, 14, 15, 99),
      mentalToughness: statFor(),
      raceIQ: rng.gaussianRange(statMean - 5, 10, 15, 99),
      personality: rng.choice(D.ATHLETE_PERSONALITIES),

      preferredDistance: rng.choice(D.PREFERRED_DISTANCES),
      preferredClimate: rng.choice(D.PREFERRED_CLIMATES),
      preferredSchoolSize: rng.choice(D.PREFERRED_SCHOOL_SIZES),

      potential,
      peakOverall: potential,

      vo2Max: statFor(), lactateThreshold: statFor(), endurance: statFor(), rawSpeed: statFor(),
      kickSpeed: statFor(), acceleration: statFor(), runningEconomy: statFor(), strength: statFor(),
      recovery: statFor(), stamina: statFor(), packRunning: statFor(), hillRunning: statFor(),
      downhillRunning: statFor(), trackSpeed: statFor(), fiveKAbility: statFor(), eightKAbility: statFor(),
      tenKAbility: statFor(), weatherPerformance: statFor(), altitudePerformance: statFor(),
      injuryResistance: statFor(), durability: statFor(),

      fatigue: rng.int(5, 20),
      fitness: Math.round(Utils.clamp(statMean - rng.int(0, 15), 10, 90)),
      morale: rng.int(55, 85),

      eligibilityRemaining: { Freshman: 4, Sophomore: 3, Junior: 2, Senior: 1, Graduate: 1 }[classYear],
      schoolId: school.id
    });
    athlete.recalculateOverall();
    return athlete;
  }

  function buildCoach(rng, school, isPlayer) {
    const gender = rng.bool(0.75) ? 'M' : 'W';
    const firstName = gender === 'M' ? rng.choice(D.FIRST_NAMES_M) : rng.choice(D.FIRST_NAMES_W);
    const tierBonus = { 1: 14, 2: 6, 3: 0, 4: -6 }[school.conferenceTier];
    const statFor = () => rng.gaussianRange(58 + tierBonus, 13, 20, 99);

    return new M.Coach({
      firstName,
      lastName: rng.choice(D.LAST_NAMES),
      age: rng.int(32, 64),
      personality: rng.choice(D.COACH_PERSONALITIES),
      recruiting: statFor(), training: statFor(), raceStrategy: statFor(), development: statFor(),
      loyalty: rng.gaussianRange(55, 18, 10, 99), charisma: statFor(),
      discipline: rng.gaussianRange(58, 15, 15, 99), culture: statFor(),
      schoolId: school.id,
      isPlayer,
      yearsAtSchool: isPlayer ? 0 : rng.int(0, 14)
    });
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

  function generate(seed, options = {}) {
    const rng = new window.XCD.core.SeededRNG(seed);
    const rosterMin = options.rosterMin ?? 10;
    const rosterMax = options.rosterMax ?? 15;

    const schools = {};
    const coaches = {};
    const athletes = {};
    const schoolOrder = [];

    D.RAW_SCHOOLS.forEach((raw) => {
      const school = buildSchool(rng, raw);
      const coach = buildCoach(rng, school, false);
      school.coachId = coach.id;

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

    assignRivalries(Object.values(schools));

    return { schools, coaches, athletes, schoolOrder, seed };
  }

  window.XCD.engine.WorldGenerator = {
    generate,
    buildAthlete,
    buildReplacementCoach: (rng, school) => buildCoach(rng, school, false)
  };
})();
