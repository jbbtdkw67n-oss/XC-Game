/*
 * TrainingEngine — Phase 3.
 *
 * Every week, for every athlete in the world:
 *  - apply the team's training plan (fatigue, fitness, injury risk)
 *  - run the development engine (attribute growth driven by coach,
 *    facilities, potential, work ethic, morale, fatigue, and each
 *    athlete's hidden development archetype)
 *  - tick injuries and morale
 *
 * The player sets plans per squad on the Training screen; AI programs
 * derive plans from their coach's personality and the season phase.
 */
(function () {
  const D = window.XCD.data;
  const Utils = window.XCD.core.Utils;

  /* ================================================================ *
   * Plans
   * ================================================================ */
  function defaultPlan() {
    return { intensity: 2, primary: 'mileage', secondary: 'strength' };
  }

  // Weeks in which meets run (invites + championship rounds).
  const MEET_WEEKS = new Set([5, 7, 9, 11, 13, 16, 19, 21]);

  // AI plan: personality picks the flavor, calendar picks the emphasis.
  // Race weeks are absorb-the-race weeks: light legs going in.
  function aiPlan(gameState, coach) {
    const week = gameState.week;
    let primary, secondary, intensity = 2;

    if (MEET_WEEKS.has(week)) { primary = 'easy'; secondary = 'tempo'; intensity = 1; } // race week: stay fresh
    else if (week <= 4) { primary = 'mileage'; secondary = 'strength'; }               // summer base
    else if (week <= 14) { primary = 'intervals'; secondary = 'tempo'; }               // in-season
    else if (week <= 22) { primary = 'tempo'; secondary = 'easy'; intensity = 1; }     // championship taper
    else { primary = 'mileage'; secondary = 'cross'; intensity = 1; }                  // offseason: easy base

    if (coach) {
      if (coach.personality === 'Distance Specialist') { primary = week <= 14 && !MEET_WEEKS.has(week) ? 'longRun' : primary; }
      if (coach.personality === 'Development Guru') { secondary = MEET_WEEKS.has(week) ? secondary : 'strength'; }
      if (!MEET_WEEKS.has(week)) {
        if (coach.discipline >= 75) intensity = Math.min(3, intensity + 1);
        else if (coach.discipline < 40) intensity = Math.max(1, intensity - 1);
      }
    }
    return { intensity, primary, secondary };
  }

  /* ================================================================ *
   * Development
   * ================================================================ */

  // Hidden archetype multiplier by athlete age (college years 18-23).
  function devProfileMult(athlete) {
    const profile = athlete.devProfile || 'normal';
    const age = athlete.age;
    switch (profile) {
      case 'early': return age <= 19 ? 1.5 : age <= 20 ? 0.9 : 0.5;
      case 'late':  return age <= 19 ? 0.5 : age <= 20 ? 0.9 : 1.6;
      case 'bust':  return 0.45;
      default:      return 1.0;
    }
  }

  /*
   * Weekly development points for one athlete. ~0.2-1.2 typical; a point
   * converts into +1 on a plan-weighted attribute via the fractional
   * devProgress accumulator.
   */
  function devPoints(athlete, coach, school, planMeta, rng) {
    const gap = athlete.potential - athlete.currentOverall;
    const gapFactor = Utils.clamp(gap / 22, 0.06, 1.25);   // stars plateau near their ceiling
    const coachFactor = coach ? 0.55 + coach.development / 110 : 0.9;
    const facFactor = 0.6 + (school.facilities.trainingCenter + school.facilities.sportsScienceLab) / 320;
    const makeupFactor = 0.55 + (athlete.workEthic + athlete.coachability) / 320;
    const moraleFactor = 0.75 + athlete.morale / 280;
    const fatiguePenalty = athlete.fatigue > 75 ? 0.55 : athlete.fatigue > 55 ? 0.85 : 1.0;
    const ageFactor = athlete.age <= 19 ? 1.15 : athlete.age <= 21 ? 1.0 : 0.8;
    const academicStress = athlete.academics < 45 ? 0.85 : 1.0;  // struggling in class costs training focus
    const noise = 0.75 + rng.next() * 0.5;

    // Base of ~3.4 attribute-points/week (before factors): a high-ceiling
    // freshman gains roughly 5-8 overall per season, a senior near his
    // ceiling barely moves. (Overall is a weighted average, so one
    // attribute point ≈ +0.08 overall.)
    return 3.4 * planMeta.devMult * gapFactor * coachFactor * facFactor * makeupFactor *
      moraleFactor * fatiguePenalty * ageFactor * academicStress *
      devProfileMult(athlete) * noise;
  }

  // Spend accumulated development on attributes weighted by the plan.
  function applyDevelopment(athlete, attrWeights, rng) {
    const keys = Object.keys(attrWeights);
    if (!keys.length) return;
    while (athlete.devProgress >= 1) {
      athlete.devProgress -= 1;
      const key = rng.weightedChoice(keys, (k) => attrWeights[k]);
      // Physical ceilings track potential: nobody trains 40-potential legs to 99.
      const cap = Math.min(97, athlete.potential + 8);
      if (athlete[key] < cap) athlete[key] += 1;
    }
  }

  /* ================================================================ *
   * Injuries
   * ================================================================ */
  function rollInjury(athlete, school, planMeta, rng) {
    const base = 0.010; // ~1% per athlete-week at neutral settings
    const fatigueMult = 1 + Math.max(0, athlete.fatigue - 60) / 45;
    const resistMult = 1.6 - athlete.injuryResistance / 100;
    const duraMult = 1.35 - athlete.durability / 200;
    const chance = base * planMeta.injuryMult * fatigueMult * resistMult * duraMult;
    if (!rng.bool(Utils.clamp(chance, 0.0005, 0.20))) return null;

    const injury = rng.weightedChoice(D.INJURIES, (i) => i.weight);
    let weeks = rng.int(injury.weeks[0], injury.weeks[1]);
    // Good recovery centers and personal recovery shorten layoffs.
    const rehab = 1.15 - athlete.recovery / 400 - school.facilities.recoveryCenter / 500;
    weeks = Math.max(1, Math.round(weeks * rehab));
    return { type: injury.type, weeksRemaining: weeks, totalWeeks: weeks };
  }

  /* ================================================================ *
   * Weekly processing
   * ================================================================ */
  function planMetaFor(plan, override) {
    const primary = D.WORKOUTS[plan.primary] || D.WORKOUTS.mileage;
    const secondary = D.WORKOUTS[plan.secondary] || D.WORKOUTS.easy;
    const intensity = (D.INTENSITIES.find((i) => i.value === plan.intensity) || D.INTENSITIES[1]).mult;

    let loadMult = 1;
    if (override === 'reduced') loadMult = 0.55;
    if (override === 'rest') return {
      fatigue: D.WORKOUTS.rest.fatigue,
      fitness: 0,
      injuryMult: D.WORKOUTS.rest.injury,
      devMult: 0.15,
      attrWeights: {}
    };

    const attrWeights = {};
    for (const [k, w] of Object.entries(primary.attrs)) attrWeights[k] = (attrWeights[k] || 0) + w * 0.65;
    for (const [k, w] of Object.entries(secondary.attrs)) attrWeights[k] = (attrWeights[k] || 0) + w * 0.35;

    return {
      fatigue: (primary.fatigue * 0.65 + secondary.fatigue * 0.35) * intensity * loadMult,
      fitness: (primary.fitness * 0.65 + secondary.fitness * 0.35) * intensity * loadMult,
      injuryMult: (primary.injury * 0.65 + secondary.injury * 0.35) * intensity * loadMult,
      devMult: intensity * loadMult,
      attrWeights
    };
  }

  function processAthlete(gameState, athlete, coach, school, planMeta, rng, isPlayerSchool) {
    // Injured athletes rehab instead of training.
    if (athlete.injury) {
      athlete.injury.weeksRemaining -= 1;
      athlete.fatigue = Utils.clamp(athlete.fatigue - 12, 0, 100);
      athlete.fitness = Utils.clamp(athlete.fitness - 3, 0, 100);
      athlete.morale = Utils.clamp(athlete.morale - 1, 0, 100);
      if (athlete.injury.weeksRemaining <= 0) {
        athlete.injury = null;
        athlete.health = 'Healthy';
        if (isPlayerSchool) gameState.logNews(`${athlete.fullName} is healthy and returns to full training.`);
      }
      athlete.lastDelta = 0;
      return;
    }

    const before = athlete.currentOverall;

    // Fatigue & fitness (integers keep every display clean)
    const recoveryRate = 4 + athlete.recovery / 18 + school.facilities.recoveryCenter / 40;
    athlete.fatigue = Math.round(Utils.clamp(athlete.fatigue + planMeta.fatigue - recoveryRate, 0, 100));
    athlete.fitness = Math.round(Utils.clamp(athlete.fitness + planMeta.fitness - 1.8, 0, 100));

    // Development
    athlete.devProgress = (athlete.devProgress || 0) + devPoints(athlete, coach, school, planMeta, rng);
    applyDevelopment(athlete, planMeta.attrWeights, rng);
    athlete.recalculateOverall();
    athlete.lastDelta = athlete.currentOverall - before;
    athlete.seasonDev = (athlete.seasonDev || 0) + athlete.lastDelta;

    if (isPlayerSchool && athlete.lastDelta >= 2) {
      gameState.logNews(`${athlete.fullName} is making a leap in training (+${athlete.lastDelta} overall this week).`);
    }

    // Injury roll
    const injury = rollInjury(athlete, school, planMeta, rng);
    if (injury) {
      athlete.injury = injury;
      athlete.health = 'Injured';
      if (isPlayerSchool) {
        gameState.logNews(`Injury: ${athlete.fullName} — ${injury.type}, out ~${injury.totalWeeks} week${injury.totalWeeks > 1 ? 's' : ''}.`);
      }
    }

    // Morale drifts with load and general program health.
    let moraleShift = 0;
    if (athlete.fatigue > 80) moraleShift -= 2;
    else if (athlete.fatigue < 30) moraleShift += 1;
    moraleShift += athlete.morale < 65 ? 1 : athlete.morale > 82 ? -1 : 0;
    athlete.morale = Utils.clamp(athlete.morale + moraleShift, 0, 100);
  }

  function processWeek(gameState, rng) {
    const playerId = gameState.playerSchoolId;

    for (const school of Object.values(gameState.world.schools)) {
      const coach = gameState.getCoach(school.coachId);
      const isPlayer = school.id === playerId;

      ['M', 'W'].forEach((gender) => {
        const plan = isPlayer
          ? (gameState.training[gender] || defaultPlan())
          : aiPlan(gameState, coach);
        const baseMeta = planMetaFor(plan);
        const roster = gender === 'M' ? school.rosterM : school.rosterW;

        roster.forEach((id) => {
          const athlete = gameState.world.athletes[id];
          if (!athlete) return;
          let meta = baseMeta;
          if (isPlayer) {
            const override = gameState.training.overrides[id];
            if (override) meta = planMetaFor(plan, override);
          }
          processAthlete(gameState, athlete, coach, school, meta, rng, isPlayer);
        });
      });
    }
  }

  // Race readiness (used by the race engine in Phase 4, shown in UI now).
  function readiness(athlete) {
    return Math.round(Utils.clamp(athlete.fitness * 0.62 + (100 - athlete.fatigue) * 0.38, 0, 100));
  }

  window.XCD.engine.Training = {
    processWeek,
    defaultPlan,
    aiPlan,
    planMetaFor,
    readiness,
    devProfileMult
  };
})();
