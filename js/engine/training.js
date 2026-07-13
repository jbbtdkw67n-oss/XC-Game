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
    // 'recovery' merged into 'easy' (Update 6, Section 4) — legacy saves and
    // any unknown key both land on the easy run.
    return days.map((k) => (D.WORKOUTS[k] ? k : 'easy'));
  }

  // Weeks in which meets run (invites + championship rounds).
  const MEET_WEEKS = new Set([...CAL.MEET_WEEKS, CAL.CONFERENCE_WEEK, CAL.REGIONAL_WEEK, CAL.NATIONAL_WEEK]);

  // AI weekly plans: the calendar picks the template, the coach's identity
  // nudges the emphasis.
  // AI templates now use scheduled rest days as a real tool (Update 3):
  // race/taper weeks and the championship taper bank a rest day for freshness.
  const AI_TEMPLATES = {
    race:      ['easy', 'tempo', 'rest', 'easy', 'easy', 'easy', 'easy'],            // taper into the meet
    taper:     ['easy', 'easy', 'rest', 'easy', 'tempo', 'rest', 'easy'],            // championship taper
    build:     ['easy', 'intervals', 'easy', 'tempo', 'easy', 'long', 'easy'],       // classic in-season week
    sharpen:   ['easy', 'speed', 'easy', 'intervals', 'rest', 'long', 'easy'],       // late-season sharpening
    sharpsim:  ['easy', 'racesim', 'easy', 'speed', 'rest', 'long', 'easy'],         // elite: rehearse the championship
    strength:  ['easy', 'hills', 'easy', 'tempo', 'easy', 'long', 'easy'],           // hill/strength emphasis
    base:      ['easy', 'easy', 'easy', 'tempo', 'easy', 'long', 'easy'],            // aerobic base
    recovery:  ['easy', 'easy', 'rest', 'easy', 'easy', 'easy', 'easy']              // absorb the work
  };

  /*
   * CPU coaching intelligence (Update 6, Section 5). A staff's training +
   * peaking craft decides how well they run the calendar:
   *   - Elite staffs peak correctly, schedule recovery weeks, and rehearse
   *     championships with race simulations.
   *   - Average staffs are mostly sound with occasional mistakes.
   *   - Poor staffs overtrain, skip recovery, and peak too early — they keep
   *     hammering quality straight through championship weeks.
   * Mistakes are deterministic per coach+week (no save-scumming the CPU).
   */
  function coachCraft(coach) {
    if (!coach) return 50;
    return ((coach.training ?? 50) + (coach.peaking ?? 50)) / 2;
  }

  function coachRoll(coach, week, salt) {
    // Cheap deterministic hash → [0, 1). Stable for a coach-week.
    let h = (salt || 0) + week * 2654435761;
    const id = (coach && coach.id) || 'x';
    for (let i = 0; i < id.length; i++) h = (h ^ id.charCodeAt(i)) * 16777619 >>> 0;
    return (h % 1000) / 1000;
  }

  function aiPlan(gameState, coach) {
    const week = gameState.week;
    const craft = coachCraft(coach);

    // Championship weeks: a genuine taper with rest days built in —
    // unless the staff simply doesn't know how to peak.
    if (week >= CAL.CONFERENCE_WEEK && week <= CAL.NATIONAL_WEEK) {
      if (craft < 45 && coachRoll(coach, week, 11) < 0.55) return AI_TEMPLATES.build.slice(); // overtrains into the biggest meets
      return AI_TEMPLATES.taper.slice();
    }
    if (MEET_WEEKS.has(week)) {
      // Conservative / development-minded staffs rest more before meets.
      const restful = coach && (coach.archetype === 'Developer' ||
        (coach.hasTendency && coach.hasTendency('conservative')));
      if (craft < 45 && coachRoll(coach, week, 13) < 0.4) return AI_TEMPLATES.build.slice(); // trains through races
      return (restful ? AI_TEMPLATES.taper : AI_TEMPLATES.race).slice();
    }
    if (week <= CAL.SUMMER_WEEKS || week >= CAL.OFFSEASON_START) return AI_TEMPLATES.base.slice();
    if (week >= CAL.MEET_WEEKS[Math.max(0, CAL.MEET_WEEKS.length - 2)] - 1) {
      if (craft < 45) return AI_TEMPLATES.build.slice();             // never sharpens
      if (craft >= 65) return AI_TEMPLATES.sharpsim.slice();         // rehearses the championship
      return AI_TEMPLATES.sharpen.slice();
    }
    // Elite staffs bank a genuine recovery week mid-season to absorb work.
    if (craft >= 65 && week > CAL.SUMMER_WEEKS + 2 && coachRoll(coach, week, 17) < 0.18) {
      return AI_TEMPLATES.recovery.slice();
    }
    // Poor staffs peak too early: quality sharpening long before it matters.
    if (craft < 45 && coachRoll(coach, week, 19) < 0.3) return AI_TEMPLATES.sharpen.slice();
    // Average staffs make the occasional odd call.
    if (craft < 65 && coachRoll(coach, week, 23) < 0.08) return AI_TEMPLATES.strength.slice();
    const t = coach && (coach.archetype === 'Developer') ? AI_TEMPLATES.strength : AI_TEMPLATES.build;
    return t.slice();
  }

  /*
   * AI mileage (Part 6): a coach's volume philosophy (tendencies) sets the
   * baseline; the calendar shapes the season — summer base, race-week
   * trims, and a genuine championship taper. Poor staffs (Update 6) miss
   * the taper: they keep the volume high straight into championships.
   */
  function aiMileage(gameState, coach, gender) {
    const Coaching = window.XCD.engine.Coaching;
    let m = Coaching ? Coaching.preferredMileage(coach, gender) : 70;
    const week = gameState.week;
    const craft = coachCraft(coach);
    if (week >= CAL.OFFSEASON_START) m = Math.round(m * 0.8);        // offseason maintenance
    else if (week <= CAL.SUMMER_WEEKS) m += 8;                       // summer volume block
    else if (week >= CAL.CONFERENCE_WEEK) m = Math.round(m * (craft < 45 ? 0.9 : 0.62)); // championship taper (missed by poor staffs)
    else if (MEET_WEEKS.has(week)) m = Math.round(m * 0.85);         // race-week trim
    return Utils.clamp(m, D.MILEAGE.MIN, D.MILEAGE.MAX);
  }

  // Resolve the weekly miles for one athlete.
  function mileageFor(gameState, school, gender, athlete, coach) {
    // Only a head-coach player sets mileage manually; an assistant's program
    // is run by its AI head coach, so it follows the AI mileage plan.
    if (school.id === gameState.playerSchoolId && gameState.controlsTraining()) {
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
        attrWeights: {}, hardDays: 0, hasLong: false, easyDays: 0,
        quality: { label: 'Resting', tone: 'warn' }, hillsDays: 0, speedDays: 0, racesimDays: 0
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
    let racesimDays = 0;
    let restDays = 0;
    const attrWeights = {};

    days.forEach((key) => {
      const w = D.WORKOUTS[key];
      fatigue += w.fatigue;
      injurySum += w.injury;
      if (w.hard) hardDays++;
      if (w.isRest) restDays++;
      if (key === 'easy') easyDays++;
      if (key === 'hills') hillsDays++;
      if (key === 'speed' || key === 'intervals') speedDays++;
      if (key === 'racesim') racesimDays++;
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
    // Easy runs are the recovery currency now (Update 6): a week with no easy
    // running and no rest day gives the body nothing to adapt with.
    const recoveryDays = easyDays + restDays;
    if (recoveryDays === 0) { injuryMult *= 1.25; fatigue += 4; } // no true recovery all week
    if (restDays > 0) injuryMult *= Math.max(0.6, 1 - restDays * 0.12); // rest keeps runners healthy
    // Multiple race simulations in one week is reckless — the body can only
    // absorb one full championship effort.
    if (racesimDays >= 2) { injuryMult *= 1 + (racesimDays - 1) * 0.35; fatigue += (racesimDays - 1) * 5; }

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

    // Rest days (Update 3): one well-placed rest day sharpens without cost;
    // stacking them cuts weekly stimulus and slows long-term aerobic
    // development, threshold, and endurance gains.
    let fitnessBuild = 1.2 + hardDays * 0.55 + (hasLong ? 0.35 : 0);
    if (restDays >= 2) {
      const excess = restDays - 1;
      devMult *= Math.max(0.45, 1 - excess * 0.12);   // slowed development
      fitnessBuild *= Math.max(0.5, 1 - excess * 0.14); // reduced stimulus
    }

    let quality;
    if (hardDays >= 5) quality = { label: 'Overtraining — injuries & burnout likely', tone: 'bad' };
    else if (hardDays === 4) quality = { label: 'Very heavy — watch fatigue closely', tone: 'warn' };
    else if (restDays >= 3) quality = { label: 'Rest-heavy — fresh, but development stalls', tone: 'warn' };
    else if (balanced) quality = { label: `Balanced — optimal development${restDays ? ' (rest day included)' : ''}`, tone: 'good' };
    else if (hardDays >= 2) quality = { label: `Solid training week${restDays ? ' with rest' : ''}`, tone: 'good' };
    else if (hardDays === 1) quality = { label: 'Light — slow development', tone: 'warn' };
    else quality = { label: 'Recovery week — absorb the work, recharge body & mind', tone: 'good' };

    return {
      fatigue: fatigue * 0.42 * loadMult,
      fitness: fitnessBuild * loadMult,
      injuryMult: injuryMult * loadMult,
      devMult: devMult * loadMult,
      attrWeights,
      hardDays, hasLong, hillsDays, speedDays, racesimDays, restDays, easyDays, quality,
      loadMult
    };
  }

  /* ================================================================ *
   * Training philosophy (Update 4, Part 2)
   * ================================================================ *
   * A coach's permanent training philosophy shapes HOW a program develops.
   * Effectiveness scales with the coach's Training rating: a great trainer
   * executes the philosophy near its full potential, a poor one realizes
   * only a fraction of its bonuses. The scaling is centered so an average
   * (55) trainer runs the philosophy at ~85% strength. Every philosophy is a
   * balanced trade-off, so none is objectively best.
   */
  function philosophyEffect(coach) {
    const def = D.trainingPhilosophy(coach ? coach.trainingPhilosophy : 'balanced');
    // Execution strength 0.55 (weak trainer) → ~1.05 (elite trainer).
    const training = coach ? (coach.training ?? 55) : 55;
    const strength = Utils.clamp(0.55 + training / 130, 0.55, 1.1);
    const e = def.effects || {};
    // Scale each multiplier's DISTANCE from 1.0 by execution strength, so a
    // weak trainer barely realizes the philosophy and an elite one fully does.
    const scaleMult = (m) => 1 + ((m ?? 1) - 1) * strength;
    const attrMult = {};
    Object.entries(e.attrMult || {}).forEach(([k, v]) => { attrMult[k] = scaleMult(v); });
    return {
      key: def.key,
      attrMult,
      devMult: scaleMult(e.devMult),
      fatigueMult: scaleMult(e.fatigueMult),
      injuryMult: scaleMult(e.injuryMult),
      durability: (e.durability || 1),
      strength
    };
  }

  // Apply a philosophy's attribute emphasis to a plan's dev weights.
  function applyPhilosophyWeights(attrWeights, philo) {
    if (!philo || !philo.attrMult) return attrWeights;
    const w = { ...attrWeights };
    Object.entries(philo.attrMult).forEach(([k, mult]) => {
      if (w[k] !== undefined) w[k] *= mult;
      else if (mult > 1) w[k] = (mult - 1) * 1.5; // introduce a small bias even if the plan omits it
    });
    return w;
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
  function rollInjury(athlete, school, planMeta, mMeta, rng, philoInjuryMult = 1) {
    // Rebalanced (Update 6, Phase 2). Injury risk is now driven far more
    // strongly by how much a runner is being pushed: severe fatigue,
    // consecutive weeks of heavy workload, recent race intensity, a recent
    // injury, low durability, and overtraining all compound. A healthy,
    // well-rested, durable runner on a sane plan is still rarely hurt; a
    // severely fatigued athlete raced or trained hard week after week becomes
    // genuinely risky.
    const base = 0.011; // ~1.1% per athlete-week at neutral settings

    // Severe fatigue is the dominant driver, escalating steeply once a runner
    // is deep in the red. Fresh legs (≤45) carry no fatigue penalty at all.
    const fatigueMult = 1 + Math.max(0, athlete.fatigue - 45) / 40
      + Math.max(0, athlete.fatigue - 75) / 18;

    // Low durability (Injury Resistance) breaks down far sooner.
    const resistMult = 1.7 - athlete.injuryResistance / 100;

    // Consecutive weeks of high workload accumulate structural risk.
    const loadWeeks = athlete.highLoadWeeks || 0;
    const chronicMult = 1 + Math.min(1.3, loadWeeks * 0.15);

    // Recent race intensity leaves the body vulnerable (decays weekly).
    const raceMult = 1 + (athlete.raceLoad || 0) / 100 * 0.7;

    // A recently-healed runner is markedly more likely to break down again.
    const reinjuryMult = (athlete.recentInjuryWeeks || 0) > 0 ? 1.7 : 1;

    // Sports science and the weight room keep runners healthy.
    const facilityMult = 1.12 - (school.facilities.sportsScienceLab + school.facilities.weightRoom) / 800;

    let chance = base * planMeta.injuryMult * fatigueMult * resistMult
      * chronicMult * raceMult * reinjuryMult * facilityMult * philoInjuryMult;

    // Mileage abuse (Update 3): the further past a body's durable limit the
    // volume goes, the sharper the breakdown risk — and the more it skews to
    // chronic overuse injuries. Only exceptionally durable runners tolerate
    // 100-120 mile weeks; fragile ones break down well before that.
    let excess = 0;
    if (mMeta) {
      chance *= mMeta.injuryMult;
      excess = mMeta.mileage - safeMileage(athlete);
      if (excess > 0) chance *= 1 + excess * 0.085 + Math.pow(excess / 22, 2) * 0.12;
    }

    if (!rng.bool(Utils.clamp(chance, 0.0005, 0.42))) return null;

    // Over the limit — by mileage or by sustained overtraining while deeply
    // fatigued — skews to overuse breakdowns (stress reactions/fractures,
    // Achilles, plantar fasciitis, shin splints). Otherwise the usual mix.
    const overLimit = excess > 6 || (loadWeeks >= 6 && athlete.fatigue >= 80);
    const table = overLimit ? D.OVERUSE_INJURIES : D.INJURIES;
    const injury = rng.weightedChoice(table, (i) => i.weight);
    let weeks = rng.int(injury.weeks[0], injury.weeks[1]);
    // Chronic overuse from big mileage overreach means longer layoffs.
    if (overLimit && excess > 14) weeks = Math.round(weeks * (1 + Math.min(0.6, (excess - 14) * 0.03)));
    // Good recovery centers and natural resilience shorten layoffs.
    const rehab = 1.15 - athlete.injuryResistance / 500 - school.facilities.recoveryCenter / 450;
    weeks = Math.max(1, Math.round(weeks * rehab));
    return { type: injury.type, weeksRemaining: weeks, totalWeeks: weeks, overuse: !!injury.overuse };
  }

  /* ================================================================ *
   * Weekly processing
   * ================================================================ */
  function processAthlete(gameState, athlete, coach, school, planMeta, mMeta, rng, isPlayerSchool, culture, philo) {
    philo = philo || philosophyEffect(coach);
    // Injured athletes rehab instead of training.
    if (athlete.injury) {
      athlete.injury.weeksRemaining -= 1;
      athlete.seasonInjuryWeeks = (athlete.seasonInjuryWeeks || 0) + 1;
      athlete.fatigue = Utils.clamp(athlete.fatigue - 12, 0, 100);
      athlete.fitness = Utils.clamp(athlete.fitness - 3, 0, 100);
      athlete.morale = Utils.clamp(athlete.morale - 1, 0, 100);
      athlete.chronicMileage = Math.round((athlete.chronicMileage || 60) * 0.7); // detraining
      if (athlete.injury.weeksRemaining <= 0) {
        // A recently-healed runner is fragile: a reinjury window where the
        // body is still adapting back to full load (longer for the injury
        // that just cost more weeks). Feeds rollInjury below.
        athlete.recentInjuryWeeks = Math.min(8, 2 + Math.round((athlete.injury.totalWeeks || 2) / 2));
        athlete.injury = null;
        athlete.health = 'Healthy';
        if (isPlayerSchool) gameState.logNews(`${athlete.fullName} is healthy and returns to full training.`);
      }
      athlete.lastDelta = 0;
      return;
    }

    const before = athlete.currentOverall;

    // High-altitude programs (Update 5, Part 3): training at elevation is a
    // real physiological edge — a bigger aerobic engine and stronger
    // threshold — but the thin air taxes the body, so fatigue builds faster
    // and recovery is a touch slower. A realistic advantage a coach must
    // manage, never a free win.
    const alt = (school.weather && school.weather.altitude) || 'Low';
    const altFatigue = alt === 'High' ? 1.6 : alt === 'Medium' ? 0.6 : 0;
    const altRecovery = alt === 'High' ? 0.7 : alt === 'Medium' ? 0.3 : 0;

    // Fatigue & fitness. Volume adds its own load; recovery rate scales
    // with innate resilience and the program's recovery facilities.
    const recoveryRate = 4 + athlete.injuryResistance / 30 +
      school.facilities.recoveryCenter / 40 + school.facilities.nutrition / 80 - altRecovery;
    let weeklyFatigue = planMeta.fatigue + mMeta.fatigueAdd * (planMeta.loadMult ?? 1);
    // Training philosophy shifts how much fatigue the work accumulates (only
    // the load side — recovery is unaffected).
    if (weeklyFatigue > 0) weeklyFatigue *= philo.fatigueMult;
    if (weeklyFatigue > 0) weeklyFatigue += altFatigue;
    athlete.fatigue = Math.round(Utils.clamp(athlete.fatigue + weeklyFatigue - recoveryRate, 0, 100));

    // Altitude's aerobic payoff: a small, steady boost to the stamina and
    // threshold engines (the systems that adapt to thin air).
    if (alt !== 'Low' && rng.bool(alt === 'High' ? 0.10 : 0.04)) {
      const k = rng.bool(0.5) ? 'stamina' : 'lactateThreshold';
      const cap = Math.min(97, athlete.potential + 8);
      if (athlete[k] < cap) athlete[k] += 1;
    }
    // Training effectiveness: a modern training center makes every week count.
    const fitnessMult = (0.85 + school.facilities.trainingCenter / 300) * mMeta.fitnessMult;
    athlete.fitness = Math.round(Utils.clamp(athlete.fitness + planMeta.fitness * fitnessMult - 1.8, 0, 100));

    // Race sharpness (Part 6 + Update 3): drifts toward what this volume
    // allows. Speed work sharpens; tapering off a real base sharpens fastest;
    // scheduled rest days add freshness; a championship simulation (Update 6)
    // is the sharpest single stimulus there is.
    let sharpTarget = mMeta.sharpTarget + (planMeta.speedDays || 0) * 2.5 + (planMeta.restDays || 0) * 3
      + (planMeta.racesimDays || 0) * 6;
    sharpTarget = Utils.clamp(sharpTarget, 15, 96);
    athlete.sharpness = Math.round(Utils.clamp(
      (athlete.sharpness ?? 55) + (sharpTarget - (athlete.sharpness ?? 55)) * 0.30, 0, 100));

    // Chronic load: the rolling base that makes tapers work — and fade.
    athlete.chronicMileage = Math.round((athlete.chronicMileage || mMeta.mileage) * 0.7 + mMeta.mileage * 0.3);

    // Workload history (Update 6, Phase 2): a week counts as "high load" when
    // the runner is carrying real fatigue, stacking hard days, or pushing past
    // their durable mileage limit. Consecutive high-load weeks compound injury
    // risk; a genuinely easy/taper week lets the body recover the counter.
    const hardDayCount = planMeta.hardDays || 0;
    const highLoadWeek = athlete.fatigue >= 70 || hardDayCount >= 5 ||
      (mMeta.mileage - safeMileage(athlete)) > 4;
    if (highLoadWeek) athlete.highLoadWeeks = Math.min(24, (athlete.highLoadWeeks || 0) + 1);
    else athlete.highLoadWeeks = Math.max(0, (athlete.highLoadWeeks || 0) - 2);

    // Recent race intensity and the post-injury fragility window both fade
    // week over week as the body absorbs and recovers.
    athlete.raceLoad = Math.max(0, Math.round((athlete.raceLoad || 0) - 22));
    if (athlete.recentInjuryWeeks > 0) athlete.recentInjuryWeeks -= 1;

    // Chronic exhaustion erodes stamina — the cost of overtraining.
    if (athlete.fatigue > 85 && rng.bool(0.35) && athlete.stamina > 20) {
      athlete.stamina -= 1;
    }

    // Mileage abuse consequences (Update 3): running well past a body's
    // durable limit doesn't just risk injury — it grinds runners down.
    // Confidence erodes, burnout builds, and severe overreach causes a
    // temporary regression the athlete must rebuild. Durable runners
    // (high injury resistance) shrug off far more before this bites.
    const overBy = mMeta.mileage - safeMileage(athlete);
    if (overBy > 6) {
      athlete.overuseLoad = (athlete.overuseLoad || 0) + overBy * 0.5;
      athlete.fatigue = Utils.clamp(athlete.fatigue + Math.min(6, overBy * 0.15), 0, 100);
      if (rng.bool(Utils.clamp(overBy * 0.02, 0.02, 0.4))) {
        athlete.confidence = Utils.clamp(athlete.confidence - 1, 10, 99);
        athlete.morale = Utils.clamp(athlete.morale - 2, 0, 100);
      }
      // Burnout / temporary regression when the overreach is sustained.
      if (overBy > 16 && rng.bool(Utils.clamp((overBy - 16) * 0.03, 0.03, 0.3))) {
        const k = rng.choice(['vo2Max', 'stamina', 'lactateThreshold', 'runningEconomy']);
        if (athlete[k] > 20) athlete[k] -= 1; // ground down; must be rebuilt
        if (isPlayerSchool && rng.bool(0.5)) {
          gameState.logNews(`${athlete.fullName} is showing signs of burnout under a punishing mileage load — form is slipping.`);
        }
      }
    } else if (athlete.overuseLoad) {
      athlete.overuseLoad = Math.max(0, athlete.overuseLoad - 3); // recovers when volume is sane
    }

    // Hills adaptation: builds with hill work, slowly fades without it.
    if (planMeta.hillsDays > 0) {
      athlete.hillAdaptation = Utils.clamp((athlete.hillAdaptation || 40) + 1.2 * planMeta.hillsDays, 0, 95);
    } else {
      athlete.hillAdaptation = Math.max(30, (athlete.hillAdaptation || 40) - 0.3);
    }

    // Development — chemistry lifts everyone; strong captains mentor freshmen;
    // a confident team (high morale) responds more positively to training.
    let dev = devPoints(athlete, coach, school, planMeta, rng) * mMeta.devMult;
    if (culture) {
      dev *= 0.88 + culture.chemistry / 450; // 0.88–1.10
      if (athlete.classYear === 'Freshman' && culture.captainLeadership >= 75) dev *= 1.10;
    }
    dev *= 0.94 + (school.teamMorale ?? 65) / 1100; // ~0.96–1.03 by team morale
    dev *= philo.devMult; // the coach's training philosophy, executed to skill

    // Training adaptation (Update 6, Section 4): the body habituates.
    // Week after week of heavy load dulls the stimulus — constant maximum
    // intensity stops working — while a fresh, healthy athlete soaks up
    // training fastest of all.
    const loadWeeksNow = athlete.highLoadWeeks || 0;
    if (loadWeeksNow >= 5) dev *= Math.max(0.6, 1 - (loadWeeksNow - 4) * 0.05);
    else if (athlete.fatigue < 30 && loadWeeksNow === 0) dev *= 1.08;

    // Periodization (Update 6): a plan that matches the season's training
    // phase develops athletes a touch faster — intelligent planning pays.
    if (planMeta.phaseFit) dev *= 1.06;

    // Recovery weeks are legitimate strategy (Update 6): a genuinely easy
    // week lets athletes ABSORB banked hard work — converting accumulated
    // load into development — while body and mind recharge.
    const recoveryWeek = planMeta.hardDays === 0 && (planMeta.easyDays || 0) >= 4;
    if (recoveryWeek) {
      const banked = Math.min(4, loadWeeksNow);
      dev += banked * 0.4;                                          // the absorbed workload pays out
      athlete.morale = Utils.clamp(athlete.morale + 2, 0, 100);     // mental recovery
      if (athlete.health !== 'Injured') {
        athlete.confidence = Utils.clamp((athlete.confidence ?? 60) + 1, 10, 99);
      }
    }

    // A championship simulation is a confidence rehearsal too: a fit runner
    // comes out believing; a buried one just gets more tired.
    if ((planMeta.racesimDays || 0) > 0 && athlete.health !== 'Injured') {
      if (athlete.fitness >= 60 && athlete.fatigue < 70) {
        athlete.confidence = Utils.clamp((athlete.confidence ?? 60) + 1.2, 10, 99);
      } else if (athlete.fatigue > 80) {
        athlete.morale = Utils.clamp(athlete.morale - 1, 0, 100);
      }
    }
    athlete.devProgress = (athlete.devProgress || 0) + dev;
    if (athlete.devProgress >= 1) {
      const weights = applyPhilosophyWeights(mileageAttrWeights(planMeta.attrWeights, mMeta.mileage), philo);
      applyDevelopment(athlete, weights, rng);
    }

    // Tiny chance of a durability gain — Injury Resistance barely moves.
    // Strength-Endurance philosophies build fatigue resistance a bit faster.
    if (rng.bool(0.01 * (philo.durability || 1)) && athlete.injuryResistance < 95) athlete.injuryResistance += 1;

    athlete.recalculateOverall();
    athlete.lastDelta = athlete.currentOverall - before;
    athlete.seasonDev = (athlete.seasonDev || 0) + athlete.lastDelta;

    if (isPlayerSchool && athlete.lastDelta >= 2) {
      gameState.logNews(`${athlete.fullName} is making a leap in training (+${athlete.lastDelta} overall this week).`);
    }

    // Injury roll (philosophy adjusts overtraining risk — Norwegian/
    // strength-endurance staffs manage load better).
    const injury = rollInjury(athlete, school, planMeta, mMeta, rng, philo.injuryMult);
    if (injury) {
      athlete.injury = injury;
      athlete.health = 'Injured';
      // Injuries dent confidence (Update 5, Part 7) — the longer the layoff,
      // the bigger the hit to belief.
      athlete.confidence = Utils.clamp((athlete.confidence ?? 60) - Math.min(8, 2 + injury.totalWeeks), 10, 99);
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

    // Relationship drift (Update 5, Part 7). Both bonds slowly converge on a
    // target set by how the athlete is being treated. Coach relationship
    // follows the staff's culture/relationship craft and genuine development;
    // injuries and stagnation strain it. Team relationship follows squad
    // chemistry. Drift is gentle so a bond is built (or lost) over a season,
    // not a single week.
    const coachTarget = Utils.clamp(
      (coach ? (coach.culture * 0.35 + (coach.relationships ?? 55) * 0.35) : 35) + 22 +
      (athlete.lastDelta >= 2 ? 6 : athlete.lastDelta <= 0 ? -3 : 0) +
      (athlete.health === 'Injured' ? -8 : 0), 10, 95);
    athlete.coachRelationship = Utils.clamp(
      (athlete.coachRelationship ?? 60) + (coachTarget - (athlete.coachRelationship ?? 60)) * 0.10, 10, 99);
    const teamTarget = Utils.clamp((culture && culture.chemistry ? culture.chemistry : 55) + 6, 10, 95);
    athlete.teamRelationship = Utils.clamp(
      (athlete.teamRelationship ?? 60) + (teamTarget - (athlete.teamRelationship ?? 60)) * 0.08, 10, 99);

    // Confidence (Update 5, Part 7) also builds through consistent, healthy
    // training and erodes when a runner is buried by fatigue or unfit — a
    // gentle reversion toward a fitness-anchored baseline keeps belief
    // dynamic without letting it drift permanently to the floor or ceiling.
    if (athlete.health !== 'Injured') {
      const confTarget = Utils.clamp(52 + (athlete.fitness - 50) * 0.35 - (athlete.fatigue > 78 ? 10 : 0), 20, 90);
      athlete.confidence = Utils.clamp(
        (athlete.confidence ?? 60) + (confTarget - (athlete.confidence ?? 60)) * 0.06, 10, 99);
    }
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
    const phase = D.trainingPhaseForWeek(gameState.week);

    for (const school of Object.values(gameState.world.schools)) {
      const coach = gameState.getCoach(school.coachId);
      const isPlayer = school.id === playerId;
      // A head-coach player designs the plan; an assistant's program follows
      // its AI head coach's plan (the assistant only runs recruiting).
      const playerPlans = isPlayer && gameState.controlsTraining();
      school.chemistry = school.chemistry || {};
      const philo = philosophyEffect(coach);
      const craft = coachCraft(coach);

      ['M', 'W'].forEach((gender) => {
        const plan = playerPlans
          ? (gameState.training[gender] || defaultPlan())
          : aiPlan(gameState, coach);
        const baseMeta = planMetaFor(plan);
        // Periodization fit (Update 6): does this week's plan match the phase?
        baseMeta.phaseFit = !!(phase.fit && phase.fit(baseMeta));
        const roster = gender === 'M' ? school.rosterM : school.rosterW;
        const culture = squadCulture(gameState, school, gender, coach);
        school.chemistry[gender] = culture.chemistry;

        roster.forEach((id) => {
          const athlete = gameState.world.athletes[id];
          if (!athlete) return;
          let meta = baseMeta;
          if (playerPlans) {
            const override = gameState.training.overrides[id];
            if (override) { meta = planMetaFor(plan, override); meta.phaseFit = baseMeta.phaseFit; }
          } else if (athlete.fatigue > 78 && craft >= 60) {
            // Elite AI staffs rest struggling athletes (Update 6, Section 5):
            // a runner deep in the red gets a reduced-load week. Poor staffs
            // never notice until the injury report does it for them.
            meta = planMetaFor(plan, 'reduced');
            meta.phaseFit = baseMeta.phaseFit;
          }
          const miles = mileageFor(gameState, school, gender, athlete, coach);
          const mMeta = mileageMeta(miles, athlete.chronicMileage);
          processAthlete(gameState, athlete, coach, school, meta, mMeta, rng, isPlayer, culture, philo);
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
      const philo = philosophyEffect(coach);
      ['rosterM', 'rosterW'].forEach((key) => {
        school[key].forEach((id) => {
          const a = gameState.world.athletes[id];
          if (!a) return;

          const gap = a.potential - a.currentOverall;
          let pts = Utils.clamp(gap * 0.16, 0, 4.2);       // headroom drives growth
          if (gap < 5) pts *= 0.3;                          // the plateau near the ceiling
          pts *= 0.55 + a.workEthic / 140;                  // summer is unsupervised
          if (a.workEthic >= 88) pts *= 1.12;               // elite grinders (90+) make the biggest summer leaps (Update 5, Part 7)
          pts *= 0.70 + coachSkill / 180;                   // the program's summer plan
          pts *= devProfileMult(a);                         // late bloomers pop here
          pts *= philo.devMult;                             // the coach's philosophy
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
          // The philosophy biases WHICH attributes summer gains land on.
          const attrWeight = (k) => (philo.attrMult && philo.attrMult[k]) || 1;
          const gain = Math.round(pts);
          for (let i = 0; i < gain; i++) {
            const k = rng.weightedChoice(attrs, attrWeight);
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
          // Season-by-season career progression ledger (Update 4, Part 10).
          a.overallHistory = a.overallHistory || [];
          a.overallHistory.push({ year: gameState.year, overall: a.currentOverall });
          if (a.overallHistory.length > 8) a.overallHistory.shift();

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
    philosophyEffect,
    coachCraft,
    MEET_WEEKS
  };
})();
