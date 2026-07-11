/*
 * TrainingEngine — Update 2.
 *
 * Two layers now drive every athlete's week:
 *
 *  1) The day-by-day plan (Update 1): seven days, seven workout types.
 *     Balanced plans (2-3 quality days, a long run, real recovery)
 *     develop athletes fastest; stacked hard days cause overtraining.
 *
 *  2) Weekly mileage (Update 2, Part 6): an independent volume dial,
 *     30-120 miles/week, set per squad with per-athlete overrides.
 *     Mileage is NOT fitness — it influences fitness, fatigue, injury
 *     risk, adaptation, and race sharpness:
 *       - High volume: bigger aerobic development (Stamina, Threshold,
 *         VO₂ Max), more long-term improvement — but more fatigue, more
 *         injuries, less sharpness, slightly blunted speed.
 *       - Low volume: fresher legs, sharper racing, better speed work,
 *         lower injury risk — but weak aerobic growth and fading fitness.
 *       - Durability gates volume: only durable runners survive
 *         100-120-mile weeks; fragile ones break down.
 *       - Tapering: cutting volume below the recent chronic load sheds
 *         fatigue and spikes sharpness while fitness holds — time it
 *         right and your squad flies at championships; taper too long
 *         and fitness leaks away, too little and they race tired.
 */
(function () {
  const D = window.XCD.data;
  const Utils = window.XCD.core.Utils;

  const HARD_KEYS = Object.keys(D.WORKOUTS).filter((k) => D.WORKOUTS[k].hard);
  const CAL = D.CALENDAR;

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

  // Weeks in which meets run (invites + championship rounds).
  const MEET_WEEKS = new Set([...CAL.MEET_WEEKS, CAL.CONFERENCE_WEEK, CAL.REGIONAL_WEEK, CAL.NATIONAL_WEEK]);

  // AI weekly plans: the calendar picks the template, the coach's identity
  // nudges the emphasis.
  const AI_TEMPLATES = {
    race:      ['easy', 'tempo', 'recovery', 'easy', 'recovery', 'easy', 'recovery'],       // taper into the meet
    build:     ['easy', 'intervals', 'recovery', 'tempo', 'easy', 'long', 'recovery'],      // classic in-season week
    sharpen:   ['easy', 'speed', 'recovery', 'intervals', 'easy', 'long', 'recovery'],      // late-season sharpening
    strength:  ['easy', 'hills', 'recovery', 'tempo', 'easy', 'long', 'recovery'],          // hill/strength emphasis
    base:      ['easy', 'easy', 'recovery', 'tempo', 'easy', 'long', 'recovery']            // aerobic base
  };

  function aiPlan(gameState, coach) {
    const week = gameState.week;
    if (MEET_WEEKS.has(week)) return AI_TEMPLATES.race.slice();
    if (week <= CAL.SUMMER_WEEKS || week >= CAL.OFFSEASON_START) return AI_TEMPLATES.base.slice();
    if (week >= CAL.MEET_WEEKS[Math.max(0, CAL.MEET_WEEKS.length - 2)] - 1) return AI_TEMPLATES.sharpen.slice();
    const t = coach && (coach.archetype === 'Developer') ? AI_TEMPLATES.strength : AI_TEMPLATES.build;
    return t.slice();
  }

  /*
   * AI mileage (Part 6): a coach's volume philosophy (tendencies) sets the
   * baseline; the calendar shapes the season — summer base, race-week
   * trims, and a genuine championship taper.
   */
  function aiMileage(gameState, coach, gender) {
    const Coaching = window.XCD.engine.Coaching;
    let m = Coaching ? Coaching.preferredMileage(coach, gender) : 70;
    const week = gameState.week;
    if (week >= CAL.OFFSEASON_START) m = Math.round(m * 0.8);        // offseason maintenance
    else if (week <= CAL.SUMMER_WEEKS) m += 8;                       // summer volume block
    else if (week >= CAL.CONFERENCE_WEEK) m = Math.round(m * 0.62);  // championship taper
    else if (MEET_WEEKS.has(week)) m = Math.round(m * 0.85);         // race-week trim
    return Utils.clamp(m, D.MILEAGE.MIN, D.MILEAGE.MAX);
  }

  // Resolve the weekly miles for one athlete.
  function mileageFor(gameState, school, gender, athlete, coach) {
    if (school.id === gameState.playerSchoolId) {
      const t = gameState.training;
      const override = t.mileageOverrides && t.mileageOverrides[athlete.id];
      const m = override !== undefined ? override
        : (t.mileage && t.mileage[gender] !== undefined ? t.mileage[gender] : D.MILEAGE.DEFAULT[gender]);
      return Utils.clamp(Math.round(m), D.MILEAGE.MIN, D.MILEAGE.MAX);
    }
    let m = aiMileage(gameState, coach, gender);
    // Smart AI staffs protect fragile runners from crushing volume —
    // poor talent evaluators don't notice until it's too late.
    const safe = safeMileage(athlete);
    const buffer = coach && coach.talentEval >= 55 ? 4 : 16;
    if (m > safe + buffer) m = safe + buffer;
    return Utils.clamp(m, D.MILEAGE.MIN, D.MILEAGE.MAX);
  }

  // The volume a runner's body can absorb: durability decides who can
  // live at 100-120 miles (Part 6 — durability matters enormously).
  function safeMileage(athlete) {
    return Math.round(62 + athlete.injuryResistance * 0.55);
  }

  /*
   * Mileage meta: cheap per-athlete arithmetic layered onto the plan meta.
   *   fatigueAdd  — weekly fatigue from volume
   *   fitnessMult — scales the plan's fitness build
   *   injuryMult  — volume multiplier (durability applied at roll time)
   *   devMult     — long-term adaptation bonus/penalty
   *   sharpTarget — where race sharpness drifts at this volume
   *   taper       — true when cutting well below chronic load
   */
  function mileageMeta(mileage, chronicMileage) {
    const v = mileage / 70;
    const chronic = chronicMileage || mileage;
    const taper = mileage <= chronic - 15;
    let sharpTarget = Utils.clamp(133 - mileage * 0.85, 20, 95);
    if (taper) sharpTarget = Math.min(95, sharpTarget + 10); // the taper pop
    return {
      mileage,
      fatigueAdd: (mileage - 62) * 0.22 - (taper ? 3 : 0),
      fitnessMult: 0.55 + v * 0.45,
      injuryMult: v <= 1 ? 0.55 + v * 0.45 : 1 + (mileage - 70) / 95,
      devMult: 0.82 + v * 0.22,
      sharpTarget,
      taper
    };
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
        quality: { label: 'Resting', tone: 'warn' }, hillsDays: 0, speedDays: 0
      };
    }
    const loadMult = override === 'reduced' ? 0.55 : 1;

    const days = normalizePlan(plan);
    let fatigue = 0;
    let injurySum = 0;
    let hardDays = 0;
    let easyDays = 0;
    let hillsDays = 0;
    let speedDays = 0;
    const attrWeights = {};

    days.forEach((key) => {
      const w = D.WORKOUTS[key];
      fatigue += w.fatigue;
      injurySum += w.injury;
      if (w.hard) hardDays++;
      if (key === 'recovery' || key === 'easy') easyDays++;
      if (key === 'hills') hillsDays++;
      if (key === 'speed' || key === 'intervals') speedDays++;
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
      hardDays, hasLong, hillsDays, speedDays, quality,
      loadMult
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

  // Mileage-adjusted development weights: volume drives aerobic
  // adaptation; low mileage sharpens the fast stuff (Part 6).
  function mileageAttrWeights(attrWeights, mileage) {
    if (mileage >= 85) {
      const boost = (mileage - 70) / 50; // 0.3 at 85, 1.0 at 120
      const w = { ...attrWeights };
      w.stamina = (w.stamina || 0) + 2.2 * boost;
      w.lactateThreshold = (w.lactateThreshold || 0) + 1.5 * boost;
      w.vo2Max = (w.vo2Max || 0) + 0.8 * boost;
      if (w.speed) w.speed *= Utils.clamp(1.25 - boost * 0.75, 0.4, 1); // volume blunts speed work
      return w;
    }
    if (mileage <= 55) {
      const boost = (60 - mileage) / 30; // ~0.17 at 55, 1.0 at 30
      const w = { ...attrWeights };
      w.speed = (w.speed || 0) + 1.4 * boost;
      w.runningEconomy = (w.runningEconomy || 0) + 0.7 * boost;
      if (w.stamina) w.stamina *= Utils.clamp(1 - boost * 0.5, 0.5, 1);
      return w;
    }
    return attrWeights;
  }

  /* ================================================================ *
   * Injuries
   * ================================================================ */
  function rollInjury(athlete, school, planMeta, mMeta, rng) {
    const base = 0.010; // ~1% per athlete-week at neutral settings
    const fatigueMult = 1 + Math.max(0, athlete.fatigue - 60) / 45;
    const resistMult = 1.6 - athlete.injuryResistance / 100;
    // Sports science and the weight room keep runners healthy.
    const facilityMult = 1.12 - (school.facilities.sportsScienceLab + school.facilities.weightRoom) / 800;
    let chance = base * planMeta.injuryMult * fatigueMult * resistMult * facilityMult;

    if (mMeta) {
      chance *= mMeta.injuryMult;
      // Durability gates volume: miles beyond what this body can absorb
      // multiply risk fast — fragile runners break at 100+ mile weeks.
      const excess = mMeta.mileage - safeMileage(athlete);
      if (excess > 0) chance *= 1 + excess * 0.055;
    }

    if (!rng.bool(Utils.clamp(chance, 0.0005, 0.22))) return null;

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
  function processAthlete(gameState, athlete, coach, school, planMeta, mMeta, rng, isPlayerSchool, culture) {
    // Injured athletes rehab instead of training.
    if (athlete.injury) {
      athlete.injury.weeksRemaining -= 1;
      athlete.seasonInjuryWeeks = (athlete.seasonInjuryWeeks || 0) + 1;
      athlete.fatigue = Utils.clamp(athlete.fatigue - 12, 0, 100);
      athlete.fitness = Utils.clamp(athlete.fitness - 3, 0, 100);
      athlete.morale = Utils.clamp(athlete.morale - 1, 0, 100);
      athlete.chronicMileage = Math.round((athlete.chronicMileage || 60) * 0.7); // detraining
      if (athlete.injury.weeksRemaining <= 0) {
        athlete.injury = null;
        athlete.health = 'Healthy';
        if (isPlayerSchool) gameState.logNews(`${athlete.fullName} is healthy and returns to full training.`);
      }
      athlete.lastDelta = 0;
      return;
    }

    const before = athlete.currentOverall;

    // Fatigue & fitness. Volume adds its own load; recovery rate scales
    // with innate resilience and the program's recovery facilities.
    const recoveryRate = 4 + athlete.injuryResistance / 30 +
      school.facilities.recoveryCenter / 40 + school.facilities.nutrition / 80;
    const weeklyFatigue = planMeta.fatigue + mMeta.fatigueAdd * (planMeta.loadMult ?? 1);
    athlete.fatigue = Math.round(Utils.clamp(athlete.fatigue + weeklyFatigue - recoveryRate, 0, 100));
    // Training effectiveness: a modern training center makes every week count.
    const fitnessMult = (0.85 + school.facilities.trainingCenter / 300) * mMeta.fitnessMult;
    athlete.fitness = Math.round(Utils.clamp(athlete.fitness + planMeta.fitness * fitnessMult - 1.8, 0, 100));

    // Race sharpness (Part 6): drifts toward what this volume allows.
    // Speed work sharpens; tapering off a real base sharpens fastest.
    let sharpTarget = mMeta.sharpTarget + (planMeta.speedDays || 0) * 2.5;
    sharpTarget = Utils.clamp(sharpTarget, 15, 96);
    athlete.sharpness = Math.round(Utils.clamp(
      (athlete.sharpness ?? 55) + (sharpTarget - (athlete.sharpness ?? 55)) * 0.30, 0, 100));

    // Chronic load: the rolling base that makes tapers work — and fade.
    athlete.chronicMileage = Math.round((athlete.chronicMileage || mMeta.mileage) * 0.7 + mMeta.mileage * 0.3);

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
    let dev = devPoints(athlete, coach, school, planMeta, rng) * mMeta.devMult;
    if (culture) {
      dev *= 0.88 + culture.chemistry / 450; // 0.88–1.10
      if (athlete.classYear === 'Freshman' && culture.captainLeadership >= 75) dev *= 1.10;
    }
    athlete.devProgress = (athlete.devProgress || 0) + dev;
    if (athlete.devProgress >= 1) {
      applyDevelopment(athlete, mileageAttrWeights(planMeta.attrWeights, mMeta.mileage), rng);
    }

    // Tiny chance of a durability gain — Injury Resistance barely moves.
    if (rng.bool(0.01) && athlete.injuryResistance < 95) athlete.injuryResistance += 1;

    athlete.recalculateOverall();
    athlete.lastDelta = athlete.currentOverall - before;
    athlete.seasonDev = (athlete.seasonDev || 0) + athlete.lastDelta;

    if (isPlayerSchool && athlete.lastDelta >= 2) {
      gameState.logNews(`${athlete.fullName} is making a leap in training (+${athlete.lastDelta} overall this week).`);
    }

    // Injury roll
    const injury = rollInjury(athlete, school, planMeta, mMeta, rng);
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
          const miles = mileageFor(gameState, school, gender, athlete, coach);
          const mMeta = mileageMeta(miles, athlete.chronicMileage);
          processAthlete(gameState, athlete, coach, school, meta, mMeta, rng, isPlayer, culture);
        });
      });
    }
  }

  /* ================================================================ *
   * Offseason development (Part 12)
   * ================================================================ */
  /*
   * Between seasons every athlete in the world progresses or regresses.
   * Runs at the year rollover (after aging, before enrollment): potential
   * gap, work ethic, the coach's Training rating, the season's injuries,
   * burnout, confidence, consistency, and hidden dev profiles all matter —
   * and regression is genuinely possible.
   */
  function offseasonDevelopment(gameState, rng) {
    const improvers = [];
    Object.values(gameState.world.schools).forEach((school) => {
      const coach = gameState.getCoach(school.coachId);
      const coachSkill = coach ? coach.training : 50;
      ['rosterM', 'rosterW'].forEach((key) => {
        school[key].forEach((id) => {
          const a = gameState.world.athletes[id];
          if (!a) return;

          const gap = a.potential - a.currentOverall;
          let pts = Utils.clamp(gap * 0.16, 0, 4.2);       // headroom drives growth
          if (gap < 5) pts *= 0.3;                          // the plateau near the ceiling
          pts *= 0.55 + a.workEthic / 140;                  // summer is unsupervised
          pts *= 0.70 + coachSkill / 180;                   // the program's summer plan
          pts *= devProfileMult(a);                         // late bloomers pop here
          pts *= 0.85 + a.consistency / 400;
          if (a.morale < 45) pts *= 0.75;                   // shaken confidence
          else if (a.morale > 78) pts *= 1.1;
          if ((a.seasonInjuryWeeks || 0) >= 4) pts *= Math.max(0.35, 1 - a.seasonInjuryWeeks * 0.07);
          if (a.fatigue > 70) pts *= 0.65;                  // burnout eats the summer
          pts *= 0.7 + rng.next() * 0.6;

          // Regression: age, injuries, apathy, and burnout take ratings back.
          let loss = 0;
          if (a.age >= 22 && rng.bool(0.30)) loss += rng.int(1, 2);
          if (a.workEthic < 42 && rng.bool(0.35)) loss += rng.int(1, 2);
          if ((a.seasonInjuryWeeks || 0) >= 7 && rng.bool(0.4)) loss += rng.int(1, 3);
          if (a.fatigue > 82 && rng.bool(0.3)) loss += 1;

          const attrs = ['vo2Max', 'runningEconomy', 'stamina', 'lactateThreshold', 'speed'];
          const gain = Math.round(pts);
          for (let i = 0; i < gain; i++) {
            const k = rng.choice(attrs);
            const cap = Math.min(97, a.potential + 8);
            if (a[k] < cap) a[k] += 1;
          }
          for (let i = 0; i < loss; i++) {
            const k = rng.choice(attrs);
            if (a[k] > 15) a[k] -= 1;
          }

          const before = a.currentOverall;
          a.recalculateOverall();
          const delta = a.currentOverall - before;

          // Summer reset: rested legs, refreshed heads, race rust.
          a.fatigue = Utils.clamp(a.fatigue - 35, 0, 100);
          a.morale = Utils.clamp(a.morale + 4, 0, 100);
          a.fitness = Utils.clamp(a.fitness - 8, 0, 100);
          a.sharpness = Utils.clamp((a.sharpness ?? 55) * 0.8 + 8, 0, 100);

          if (school.id === gameState.playerSchoolId && delta !== 0) {
            improvers.push({ a, delta });
          }
        });
      });
    });

    improvers.sort((x, y) => y.delta - x.delta);
    const up = improvers.filter((x) => x.delta > 0).slice(0, 3);
    const down = improvers.filter((x) => x.delta <= -2).slice(0, 2);
    if (up.length) {
      gameState.logNews(`Offseason report: ${up.map((x) => `${x.a.fullName} +${x.delta}`).join(', ')} led the summer improvement.`);
    }
    down.forEach((x) => {
      gameState.logNews(`Offseason concern: ${x.a.fullName} regressed over the summer (${x.delta} overall).`);
    });
  }

  // Race readiness (used by the race engine, shown in the UI): fitness,
  // freshness, and race sharpness in one number.
  function readiness(athlete) {
    return Math.round(Utils.clamp(
      athlete.fitness * 0.50 + (100 - athlete.fatigue) * 0.30 + (athlete.sharpness ?? 55) * 0.20,
      0, 100));
  }

  window.XCD.engine.Training = {
    processWeek,
    offseasonDevelopment,
    defaultPlan,
    normalizePlan,
    aiPlan,
    aiMileage,
    mileageFor,
    mileageMeta,
    safeMileage,
    planMetaFor,
    readiness,
    devProfileMult,
    MEET_WEEKS
  };
})();
