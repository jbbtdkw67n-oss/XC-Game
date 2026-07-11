/*
 * TrainingEngine — Update 1.
 *
 * Training is a true weekly planner: seven days (Mon-Sun), each assigned
 * one of the seven workout types. The weekly combination drives fitness,
 * fatigue, injury risk, and attribute growth:
 *
 *   Easy Run     → small Stamina gains, light load
 *   Recovery Run → sheds fatigue, tiny Stamina gains
 *   Long Run     → large Stamina gains, small VO2 Max gains
 *   Tempo        → Lactate Threshold, small Stamina gains
 *   Intervals    → VO2 Max, small Speed gains
 *   Hills        → VO2 Max, Speed, Running Economy (and hill adaptation)
 *   Speed Dev.   → Speed, Running Economy
 *
 * Balanced plans (2-3 quality days, a long run, real recovery) develop
 * athletes fastest. Stacking hard days causes overtraining: fatigue piles
 * up, injuries spike, and development slows. Injury Resistance is mostly
 * innate and is not trained by any workout.
 */
(function () {
  const D = window.XCD.data;
  const Utils = window.XCD.core.Utils;

  const HARD_KEYS = Object.keys(D.WORKOUTS).filter((k) => D.WORKOUTS[k].hard);

  /* ================================================================ *
   * Plans
   * ================================================================ */
  function defaultPlan() {
    return D.DEFAULT_WEEK_PLAN.slice();
  }

  function normalizePlan(plan) {
    const days = Array.isArray(plan) ? plan.slice(0, 7) : [];
    while (days.length < 7) days.push('easy');
    return days.map((k) => (D.WORKOUTS[k] ? k : 'easy'));
  }

  // Weeks in which meets run (invites + pre-nats + championship rounds).
  const MEET_WEEKS = new Set([1, 3, 5, 7, 8, 9, 10]);

  // AI weekly plans: the calendar picks the template, the coach's Training
  // rating nudges quality-day count.
  const AI_TEMPLATES = {
    race:      ['easy', 'tempo', 'recovery', 'easy', 'recovery', 'easy', 'recovery'],       // taper into the meet
    build:     ['easy', 'intervals', 'recovery', 'tempo', 'easy', 'long', 'recovery'],      // classic in-season week
    sharpen:   ['easy', 'speed', 'recovery', 'intervals', 'easy', 'long', 'recovery'],      // late-season sharpening
    strength:  ['easy', 'hills', 'recovery', 'tempo', 'easy', 'long', 'recovery'],          // hill/strength emphasis
    offseason: ['easy', 'easy', 'recovery', 'tempo', 'easy', 'long', 'recovery']            // aerobic base
  };

  function aiPlan(gameState, coach) {
    const week = gameState.week;
    if (MEET_WEEKS.has(week)) return AI_TEMPLATES.race.slice();
    if (week > 10) return AI_TEMPLATES.offseason.slice();
    if (week >= 6) return AI_TEMPLATES.sharpen.slice();
    const t = coach && (coach.archetype === 'Developer') ? AI_TEMPLATES.strength : AI_TEMPLATES.build;
    return t.slice();
  }

  /* ================================================================ *
   * Weekly plan analysis
   * ================================================================ */

  /*
   * Turn a 7-day plan into weekly effects. Returned meta:
   *   fatigue     — net weekly fatigue load (before recovery rate)
   *   fitness     — weekly fitness build
   *   injuryMult  — injury-risk multiplier
   *   devMult     — development multiplier (balanced plans peak)
   *   attrWeights — which core ratings this week develops
   *   hardDays, hasLong, quality — for the UI
   */
  function planMetaFor(plan, override) {
    if (override === 'rest') {
      return {
        fatigue: -16, fitness: 0, injuryMult: 0.2, devMult: 0.15,
        attrWeights: {}, hardDays: 0, hasLong: false,
        quality: { label: 'Resting', tone: 'warn' }, hillsDays: 0
      };
    }
    const loadMult = override === 'reduced' ? 0.55 : 1;

    const days = normalizePlan(plan);
    let fatigue = 0;
    let injurySum = 0;
    let hardDays = 0;
    let easyDays = 0;
    let hillsDays = 0;
    const attrWeights = {};

    days.forEach((key) => {
      const w = D.WORKOUTS[key];
      fatigue += w.fatigue;
      injurySum += w.injury;
      if (w.hard) hardDays++;
      if (key === 'recovery' || key === 'easy') easyDays++;
      if (key === 'hills') hillsDays++;
      for (const [attr, wt] of Object.entries(w.attrs)) {
        attrWeights[attr] = (attrWeights[attr] || 0) + wt;
      }
    });

    // Back-to-back quality days pound the legs.
    let backToBack = 0;
    for (let i = 1; i < 7; i++) {
      if (D.WORKOUTS[days[i]].hard && D.WORKOUTS[days[i - 1]].hard) backToBack++;
    }

    let injuryMult = (injurySum / 7) * (1 + backToBack * 0.18);
    const recoveryDays = days.filter((d) => d === 'recovery').length;
    if (recoveryDays === 0) { injuryMult *= 1.25; fatigue += 4; } // no true recovery all week

    // Development quality: 2-3 hard days is the sweet spot; more is
    // overtraining, fewer is undertraining.
    let devMult;
    switch (hardDays) {
      case 0: devMult = 0.40; break;
      case 1: devMult = 0.75; break;
      case 2: devMult = 1.05; break;
      case 3: devMult = 1.15; break;
      case 4: devMult = 0.95; break;
      case 5: devMult = 0.78; break;
      default: devMult = 0.60;
    }
    const hasLong = days.includes('long');
    const hardVariety = new Set(days.filter((d) => D.WORKOUTS[d].hard)).size;
    const balanced = hardDays >= 2 && hardDays <= 3 && hasLong && easyDays >= 3;
    if (balanced) devMult += 0.12;               // the reward for a textbook week
    if (hardVariety >= 3) devMult += 0.05;       // varied stimulus
    if (hardDays >= 5) fatigue += 6;             // overtraining tax

    let quality;
    if (hardDays >= 5) quality = { label: 'Overtraining — injuries & burnout likely', tone: 'bad' };
    else if (hardDays === 4) quality = { label: 'Very heavy — watch fatigue closely', tone: 'warn' };
    else if (balanced) quality = { label: 'Balanced — optimal development', tone: 'good' };
    else if (hardDays >= 2) quality = { label: 'Solid training week', tone: 'good' };
    else if (hardDays === 1) quality = { label: 'Light — slow development', tone: 'warn' };
    else quality = { label: 'Recovery week — fitness will fade', tone: 'warn' };

    return {
      fatigue: fatigue * 0.42 * loadMult,
      fitness: (1.2 + hardDays * 0.55 + (hasLong ? 0.35 : 0)) * loadMult,
      injuryMult: injuryMult * loadMult,
      devMult: devMult * loadMult,
      attrWeights,
      hardDays, hasLong, hillsDays, quality
    };
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
      case 'legend': return 1.9; // the 1-in-1000 walk-on who becomes a star
      default:      return 1.0;
    }
  }

  /*
   * Weekly development points for one athlete. A point converts into +1 on
   * a plan-weighted attribute via the fractional devProgress accumulator.
   */
  function devPoints(athlete, coach, school, planMeta, rng) {
    const gap = athlete.potential - athlete.currentOverall;
    const gapFactor = Utils.clamp(gap / 22, 0.06, 1.25);   // stars plateau near their ceiling
    const coachSkill = coach ? (coach.training ?? coach.development ?? 55) : 50;
    const coachFactor = 0.55 + coachSkill / 110;
    // Facilities matter: training center + sports science drive development.
    const facFactor = 0.55 + (school.facilities.trainingCenter + school.facilities.sportsScienceLab) / 290;
    const makeupFactor = 0.55 + (athlete.workEthic + athlete.coachability) / 320;
    const moraleFactor = 0.75 + athlete.morale / 280;
    const fatiguePenalty = athlete.fatigue > 75 ? 0.50 : athlete.fatigue > 55 ? 0.85 : 1.0;
    const ageFactor = athlete.age <= 19 ? 1.15 : athlete.age <= 21 ? 1.0 : 0.8;
    const academicStress = athlete.academics < 45 ? 0.85 : 1.0;
    const noise = 0.75 + rng.next() * 0.5;

    return 3.4 * planMeta.devMult * gapFactor * coachFactor * facFactor * makeupFactor *
      moraleFactor * fatiguePenalty * ageFactor * academicStress *
      devProfileMult(athlete) * noise;
  }

  // Spend accumulated development on attributes weighted by the plan.
  // Injury Resistance is never in attrWeights — it's essentially innate.
  function applyDevelopment(athlete, attrWeights, rng) {
    const keys = Object.keys(attrWeights);
    if (!keys.length) return;
    while (athlete.devProgress >= 1) {
      athlete.devProgress -= 1;
      const key = rng.weightedChoice(keys, (k) => attrWeights[k]);
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
    // Sports science and the weight room keep runners healthy.
    const facilityMult = 1.12 - (school.facilities.sportsScienceLab + school.facilities.weightRoom) / 800;
    const chance = base * planMeta.injuryMult * fatigueMult * resistMult * facilityMult;
    if (!rng.bool(Utils.clamp(chance, 0.0005, 0.20))) return null;

    const injury = rng.weightedChoice(D.INJURIES, (i) => i.weight);
    let weeks = rng.int(injury.weeks[0], injury.weeks[1]);
    // Good recovery centers and natural resilience shorten layoffs.
    const rehab = 1.15 - athlete.injuryResistance / 500 - school.facilities.recoveryCenter / 450;
    weeks = Math.max(1, Math.round(weeks * rehab));
    return { type: injury.type, weeksRemaining: weeks, totalWeeks: weeks };
  }

  /* ================================================================ *
   * Weekly processing
   * ================================================================ */
  function processAthlete(gameState, athlete, coach, school, planMeta, rng, isPlayerSchool, culture) {
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

    // Fatigue & fitness. Recovery rate scales with innate resilience and
    // the program's recovery/nutrition facilities.
    const recoveryRate = 4 + athlete.injuryResistance / 30 +
      school.facilities.recoveryCenter / 40 + school.facilities.nutrition / 80;
    athlete.fatigue = Math.round(Utils.clamp(athlete.fatigue + planMeta.fatigue - recoveryRate, 0, 100));
    athlete.fitness = Math.round(Utils.clamp(athlete.fitness + planMeta.fitness - 1.8, 0, 100));

    // Chronic exhaustion erodes stamina — the cost of overtraining.
    if (athlete.fatigue > 85 && rng.bool(0.35) && athlete.stamina > 20) {
      athlete.stamina -= 1;
    }

    // Hills adaptation: builds with hill work, slowly fades without it.
    if (planMeta.hillsDays > 0) {
      athlete.hillAdaptation = Utils.clamp((athlete.hillAdaptation || 40) + 1.2 * planMeta.hillsDays, 0, 95);
    } else {
      athlete.hillAdaptation = Math.max(30, (athlete.hillAdaptation || 40) - 0.3);
    }

    // Development — chemistry lifts everyone; strong captains mentor freshmen.
    let dev = devPoints(athlete, coach, school, planMeta, rng);
    if (culture) {
      dev *= 0.88 + culture.chemistry / 450; // 0.88–1.10
      if (athlete.classYear === 'Freshman' && culture.captainLeadership >= 75) dev *= 1.10;
    }
    athlete.devProgress = (athlete.devProgress || 0) + dev;
    applyDevelopment(athlete, planMeta.attrWeights, rng);

    // Tiny chance of a durability gain — Injury Resistance barely moves.
    if (rng.bool(0.01) && athlete.injuryResistance < 95) athlete.injuryResistance += 1;

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

  /*
   * Team culture: captains lead, chemistry binds. Chemistry blends squad
   * morale, discipline, captain leadership, and the coach's Culture rating.
   */
  function squadCulture(gameState, school, gender, coach) {
    const roster = (gender === 'M' ? school.rosterM : school.rosterW)
      .map((id) => gameState.world.athletes[id])
      .filter(Boolean);
    if (!roster.length) return { chemistry: 50, captainLeadership: 50 };

    let captains = [];
    if (school.id === gameState.playerSchoolId && gameState.culture) {
      captains = (gameState.culture.captains[gender] || [])
        .map((id) => gameState.world.athletes[id])
        .filter((a) => a && a.schoolId === school.id);
    }
    if (!captains.length) {
      captains = roster
        .filter((a) => ['Junior', 'Senior', 'Graduate'].includes(a.classYear))
        .sort((a, b) => b.leadership - a.leadership)
        .slice(0, 2);
    }
    const captainLeadership = captains.length
      ? Math.round(Utils.average(captains.map((a) => a.leadership)))
      : 45;

    const chemistry = Math.round(Utils.clamp(
      Utils.average(roster.map((a) => a.morale)) * 0.40 +
      Utils.average(roster.map((a) => a.discipline)) * 0.20 +
      captainLeadership * 0.25 +
      (coach ? coach.culture : 50) * 0.15,
      0, 100));
    return { chemistry, captainLeadership };
  }

  function processWeek(gameState, rng) {
    const playerId = gameState.playerSchoolId;

    for (const school of Object.values(gameState.world.schools)) {
      const coach = gameState.getCoach(school.coachId);
      const isPlayer = school.id === playerId;
      school.chemistry = school.chemistry || {};

      ['M', 'W'].forEach((gender) => {
        const plan = isPlayer
          ? (gameState.training[gender] || defaultPlan())
          : aiPlan(gameState, coach);
        const baseMeta = planMetaFor(plan);
        const roster = gender === 'M' ? school.rosterM : school.rosterW;
        const culture = squadCulture(gameState, school, gender, coach);
        school.chemistry[gender] = culture.chemistry;

        roster.forEach((id) => {
          const athlete = gameState.world.athletes[id];
          if (!athlete) return;
          let meta = baseMeta;
          if (isPlayer) {
            const override = gameState.training.overrides[id];
            if (override) meta = planMetaFor(plan, override);
          }
          processAthlete(gameState, athlete, coach, school, meta, rng, isPlayer, culture);
        });
      });
    }
  }

  // Race readiness (used by the race engine, shown in the UI).
  function readiness(athlete) {
    return Math.round(Utils.clamp(athlete.fitness * 0.62 + (100 - athlete.fatigue) * 0.38, 0, 100));
  }

  window.XCD.engine.Training = {
    processWeek,
    defaultPlan,
    normalizePlan,
    aiPlan,
    planMetaFor,
    readiness,
    devProfileMult,
    MEET_WEEKS
  };
})();
