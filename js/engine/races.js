/*
 * RaceEngine — Phase 4.
 *
 * Season scheduling, segment-based race simulation with pack dynamics,
 * NCAA team scoring (top 5 score, 6-7 displace, incomplete teams removed,
 * 6th-runner tiebreak), championships (conference → regional → national
 * with auto + at-large bids), and statistics/records bookkeeping.
 */
(function () {
  const D = window.XCD.data;
  const Utils = window.XCD.core.Utils;

  /*
   * The standard season (every year):
   *   Wk 1 Regular Season Meet · Wk 2 Training · Wk 3 Regular Season Meet
   *   Wk 4 Training · Wk 5 Pre-Nationals (elite + invited mid-majors;
   *   everyone else runs a normal invitational) · Wk 6 Training
   *   Wk 7 Regular Season Meet · Wk 8 Conference · Wk 9 Regionals
   *   Wk 10 Nationals. Weeks 11-14 are the offseason (awards, portal,
   *   signing day) before the year rolls over.
   */
  const RACE_WEEKS = [1, 3, 7];
  const PRENATS_WEEK = 5;
  const CONFERENCE_WEEK = 8;
  const REGIONAL_WEEK = 9;
  const NATIONAL_WEEK = 10;
  const SEGMENTS = 12;
  const NATIONALS_FIELD = 31;
  const PRENATS_ELITE = 36;      // top-prestige programs auto-invited
  const PRENATS_CAP = 60;        // field cap including mid-major invites

  /* ================================================================ *
   * Season schedule
   * ================================================================ */
  function newSeason(gameState, rng) {
    const season = {
      year: gameState.year,
      raceWeeks: [...RACE_WEEKS, PRENATS_WEEK].sort((a, b) => a - b),
      prenatsWeek: PRENATS_WEEK,
      conferenceWeek: CONFERENCE_WEEK,
      regionalWeek: REGIONAL_WEEK,
      nationalWeek: NATIONAL_WEEK,
      meets: {},
      byWeek: {},
      playerMeetByWeek: {},
      nationalsFieldIds: { M: null, W: null }, // set after regionals
      individualQualifiers: { M: [], W: [] }   // top-10 regional finishers not on qualifying teams
    };

    const schoolIds = gameState.world.schoolOrder.slice();

    // Groups a set of schools into ~20-team invitationals for one week.
    function scheduleInvitationals(week, ids) {
      const shuffled = rng.shuffle(ids);
      const meetCount = Math.max(1, Math.ceil(shuffled.length / 20));
      season.byWeek[week] = season.byWeek[week] || [];
      for (let i = 0; i < meetCount; i++) {
        const group = shuffled.filter((_, idx) => idx % meetCount === i);
        if (!group.length) continue;
        const host = gameState.getSchool(group[0]);
        const meet = buildMeet(gameState, rng, {
          week,
          name: `${host.name} Invitational`,
          hostId: host.id,
          schoolIds: group,
          type: 'invite'
        });
        season.meets[meet.id] = meet;
        season.byWeek[week].push(meet.id);
        if (group.includes(gameState.playerSchoolId)) season.playerMeetByWeek[week] = meet.id;
      }
    }

    RACE_WEEKS.forEach((week) => scheduleInvitationals(week, schoolIds));

    // --- Week 5: Pre-Nationals -----------------------------------------
    // Elite programs are auto-invited; mid-majors occasionally get the call;
    // everyone else runs a regular invitational the same week.
    {
      const byPrestige = schoolIds
        .map((id) => gameState.getSchool(id))
        .sort((a, b) => b.prestige - a.prestige);
      const field = byPrestige.slice(0, PRENATS_ELITE).map((s) => s.id);
      for (const s of byPrestige.slice(PRENATS_ELITE)) {
        if (field.length >= PRENATS_CAP) break;
        // Mid-major invites: stronger programs are likelier to hear back.
        const tierChance = s.conferenceTier <= 2 ? 0.30 : s.conferenceTier === 3 ? 0.12 : 0.05;
        if (rng.bool(tierChance)) field.push(s.id);
      }
      const host = gameState.getSchool(field[0]);
      const prenats = buildMeet(gameState, rng, {
        week: PRENATS_WEEK,
        name: 'Pre-Nationals',
        hostId: host.id,
        schoolIds: field,
        type: 'prenats'
      });
      season.meets[prenats.id] = prenats;
      season.byWeek[PRENATS_WEEK] = [prenats.id];
      season.prenatsMeetId = prenats.id;
      if (field.includes(gameState.playerSchoolId)) season.playerMeetByWeek[PRENATS_WEEK] = prenats.id;

      const rest = schoolIds.filter((id) => !field.includes(id));
      scheduleInvitationals(PRENATS_WEEK, rest);
    }

    // Conference championships
    const byConference = {};
    schoolIds.forEach((id) => {
      const s = gameState.getSchool(id);
      (byConference[s.conference] = byConference[s.conference] || []).push(id);
    });
    season.byWeek[CONFERENCE_WEEK] = [];
    Object.entries(byConference).forEach(([conf, ids]) => {
      const host = gameState.getSchool(rng.choice(ids));
      const meet = buildMeet(gameState, rng, {
        week: CONFERENCE_WEEK,
        name: `${conf} Championships`,
        hostId: host.id,
        schoolIds: ids,
        type: 'conference',
        conference: conf
      });
      season.meets[meet.id] = meet;
      season.byWeek[CONFERENCE_WEEK].push(meet.id);
      if (ids.includes(gameState.playerSchoolId)) season.playerMeetByWeek[CONFERENCE_WEEK] = meet.id;
    });

    // Regionals (NCAA-style regions from our geography)
    const byRegion = {};
    schoolIds.forEach((id) => {
      const s = gameState.getSchool(id);
      (byRegion[s.region] = byRegion[s.region] || []).push(id);
    });
    season.byWeek[REGIONAL_WEEK] = [];
    Object.entries(byRegion).forEach(([region, ids]) => {
      const host = gameState.getSchool(rng.choice(ids));
      const meet = buildMeet(gameState, rng, {
        week: REGIONAL_WEEK,
        name: `${region} Regional`,
        hostId: host.id,
        schoolIds: ids,
        type: 'regional',
        region
      });
      season.meets[meet.id] = meet;
      season.byWeek[REGIONAL_WEEK].push(meet.id);
      if (ids.includes(gameState.playerSchoolId)) season.playerMeetByWeek[REGIONAL_WEEK] = meet.id;
    });

    // Nationals shell (field determined after regionals)
    const natHost = gameState.getSchool(rng.choice(schoolIds));
    const natMeet = buildMeet(gameState, rng, {
      week: NATIONAL_WEEK,
      name: 'NCAA Championships',
      hostId: natHost.id,
      schoolIds: [], // filled post-regionals per gender
      type: 'national'
    });
    season.meets[natMeet.id] = natMeet;
    season.byWeek[NATIONAL_WEEK] = [natMeet.id];
    season.nationalsMeetId = natMeet.id;

    gameState.season = season;
    return season;
  }

  function buildMeet(gameState, rng, base) {
    const host = gameState.getSchool(base.hostId);
    const distances = (base.week >= CONFERENCE_WEEK || base.type === 'prenats')
      ? { M: 8000, W: 6000 }
      : { M: 8000, W: 5000 };
    if (base.type === 'national') distances.M = 10000;
    return {
      id: Utils.generateId('meet'),
      ...base,
      distances,
      conditions: {
        tempF: Math.round(host.weather.tempBase + rng.int(-10, 12) - (base.week - 5) * 1.1),
        hilliness: rng.int(10, 85),
        altitude: host.weather.altitude,
        rain: rng.bool(0.18)
      },
      results: { M: null, W: null }
    };
  }

  /* ================================================================ *
   * Race simulation
   * ================================================================ */
  /*
   * Race rating from the six core physical ratings (plus a little mental
   * makeup). Distance shifts the weights: longer races lean on Stamina,
   * shorter races reward raw Speed.
   */
  function raceRating(a, distanceM) {
    const long = distanceM >= 9000;
    const short = distanceM <= 6000;
    const wStamina = long ? 0.22 : short ? 0.14 : 0.18;
    const wSpeed = long ? 0.06 : short ? 0.14 : 0.10;
    return a.vo2Max * 0.24 + a.lactateThreshold * 0.18 + a.runningEconomy * 0.17 +
      a.stamina * wStamina + a.speed * wSpeed +
      a.mentalToughness * 0.06 + a.raceIQ * 0.04 + a.consistency * 0.03;
  }

  // Rating -> total seconds for gender/distance, before conditions/noise.
  function baseTime(rating, gender, distanceM) {
    const km = distanceM / 1000;
    const perKm = gender === 'M'
      ? (1800 - 5.2 * rating) / 8    // anchored at 8K
      : (1500 - 3.4 * rating) / 6;   // anchored at 6K
    return perKm * km;
  }

  // How well an athlete handles hilly courses (hidden hill adaptation from
  // Hills training + economy + strength-speed).
  function hillAbility(a) {
    return (a.hillAdaptation ?? 40) * 0.45 + a.runningEconomy * 0.35 + a.speed * 0.20;
  }

  function conditionsMultiplier(gameState, a, meet, gender) {
    const c = meet.conditions;
    let mult = 1;

    // Heat & cold: tough, consistent runners handle bad days better.
    const weatherSkill = (a.mentalToughness * 0.6 + a.consistency * 0.4) / 100;
    if (c.tempF > 65) {
      let heat = (c.tempF - 65) * 0.0006 * (1.4 - weatherSkill);
      if (a.preferredClimate === 'Warm') heat *= 0.5;
      mult += Utils.clamp(heat, 0, 0.03);
    } else if (c.tempF < 38) {
      let cold = (38 - c.tempF) * 0.0005 * (1.4 - weatherSkill);
      if (a.preferredClimate === 'Cold') cold *= 0.5;
      mult += Utils.clamp(cold, 0, 0.02);
    }
    if (c.rain) mult += 0.004 * (1.3 - weatherSkill);

    // Altitude: a big aerobic engine copes best up high.
    if (c.altitude === 'High') mult += 0.020 * (1.5 - a.vo2Max / 100);
    else if (c.altitude === 'Medium') mult += 0.007 * (1.5 - a.vo2Max / 100);

    // Readiness (training state) and morale
    const TE = window.XCD.engine.Training;
    const ready = TE.readiness(a);
    mult += Utils.clamp((62 - ready) * 0.00075, -0.008, 0.035);
    mult += Utils.clamp((65 - a.morale) * 0.0002, -0.004, 0.008);

    // Peaking: a great tactician has athletes flying for championship races.
    if (meet.type === 'conference' || meet.type === 'regional' || meet.type === 'national') {
      const school = gameState.getSchool(a.schoolId);
      const coach = school && gameState.getCoach(school.coachId);
      const peaking = coach ? (coach.peaking ?? coach.raceStrategy ?? 55) : 55;
      mult -= (peaking - 50) * 0.00016; // ±0.8% swing at the extremes
    }

    return mult;
  }

  /*
   * Simulate one gender's race at a meet — a true segment-by-segment
   * simulation in which positioning changes naturally:
   *
   *  - Early race (segs 0-2): pack formation — the field compresses and
   *    runs together; nobody's race is decided yet.
   *  - Mid race (segs 3-7): pace drifts apart. Elite Lactate Threshold
   *    holds pace; aggressive runners throw in surges that cost energy;
   *    big VO2 Max engines recover from surges best. Hills bite twice.
   *  - Late race (segs 8-10): the grind. Every runner burns an energy
   *    reserve built from Stamina + fitness + freshness; runners who
   *    empty the tank fade hard, strong Stamina runners move up.
   *  - Final segment: the kick — Speed + Running Economy + whatever is
   *    left in the tank. Fresh, fast runners carve through the field
   *    over the final 800-1000m.
   *
   * Returns { finishers, teamScores, splits, events } (splits/events when
   * detailed) — the race center replays the splits as a live broadcast.
   */
  function simulateRace(gameState, meet, gender, rng, detailed) {
    const distanceM = meet.distances[gender];
    const hillSegs = new Set([3, 7]); // where the course's hills live

    // Field: top 7 healthy runners per team, readiness-weighted selection,
    // plus any individually-qualified athletes (nationals).
    const entries = [];
    meet.schoolIds.forEach((schoolId) => {
      const school = gameState.getSchool(schoolId);
      if (!school) return;
      const squad = (gender === 'M' ? school.rosterM : school.rosterW)
        .map((id) => gameState.world.athletes[id])
        .filter((a) => a && !a.injury && a.redshirt !== 'True' && a.redshirt !== 'Medical')
        .sort((a, b) => (raceRating(b, distanceM) + b.fitness * 0.1) - (raceRating(a, distanceM) + a.fitness * 0.1))
        .slice(0, 7);
      squad.forEach((a) => entries.push({ athlete: a, schoolId }));
    });
    (meet.individualEntries && meet.individualEntries[gender] || []).forEach((athId) => {
      const a = gameState.world.athletes[athId];
      if (a && !a.injury && !entries.some((e) => e.athlete.id === athId)) {
        entries.push({ athlete: a, schoolId: a.schoolId, individual: true });
      }
    });
    if (!entries.length) return null;

    const hillFactor = meet.conditions.hilliness / 100;

    // --- Per-runner race state -----------------------------------------
    const runners = entries.map(({ athlete: a, schoolId, individual }) => {
      const rating = raceRating(a, distanceM);
      let total = baseTime(rating, gender, distanceM) * conditionsMultiplier(gameState, a, meet, gender);
      const chem = gameState.getSchool(schoolId)?.chemistry?.[gender];
      if (chem !== undefined) total *= 1 + (55 - chem) * 0.0002;
      // Day form: consistent runners have narrower swings.
      total *= 1 + rng.gaussian(0, 0.015 * (1.45 - a.consistency / 100));

      // The energy tank: Stamina + current fitness + freshness. A 12-segment
      // race costs ~66-78 depending on Lactate Threshold, so tired or
      // low-stamina runners run out before the finish and fade.
      const reserve = 35 + a.stamina * 0.35 + a.fitness * 0.20 + (100 - a.fatigue) * 0.16;

      return {
        athlete: a, schoolId, individual: !!individual,
        segBase: total / SEGMENTS,
        cum: [], segTimes: [],
        reserve,
        faded: false,
        surgedLastSeg: false,
        surges: 0,
        aggression: a.confidence * 0.5 + a.raceIQ * 0.5,
        hill: hillAbility(a),
        kicked: false
      };
    });

    const fieldPace = median(runners.map((r) => r.segBase));
    const events = [];
    const cums = new Array(runners.length).fill(0);
    let lastLeaderId = null;

    // --- The race, segment by segment -----------------------------------
    for (let s = 0; s < SEGMENTS; s++) {
      const isEarly = s <= 2;
      const isMid = s >= 3 && s <= 7;
      const isLate = s >= 8 && s <= 10;
      const kickPhase = s >= SEGMENTS - 2; // the final 800-1000m

      // Current running order (for pack math + event context).
      const order = runners.map((r, i) => ({ i, t: cums[i] })).sort((a, b) => a.t - b.t);
      const posOf = {};
      order.forEach((o, pos) => { posOf[o.i] = pos + 1; });

      // Local pack pace for every runner: the mean natural pace of the
      // group they're physically running with (±3 positions, within ~4s).
      const localPace = new Array(runners.length).fill(0);
      for (let k = 0; k < order.length; k++) {
        let sum = 0, n = 0;
        for (let j = Math.max(0, k - 3); j <= Math.min(order.length - 1, k + 3); j++) {
          if (s > 0 && Math.abs(order[j].t - order[k].t) > 4) continue;
          sum += runners[order[j].i].segBase; n++;
        }
        localPace[order[k].i] = n ? sum / n : runners[order[k].i].segBase;
      }

      runners.forEach((r, i) => {
        const a = r.athlete;
        let t = r.segBase;

        // Cost of covering this segment (drained from the tank). A strong
        // threshold makes hard running cheaper.
        let cost = 6.6 - a.lactateThreshold * 0.016;

        if (s === 0) {
          // The gun: adrenaline + the field goes out together.
          t = t * 0.5 + fieldPace * 0.5;
          t *= 0.985;
        } else if (isEarly) {
          // Pack formation: everyone tucks into a group. Hanging with a
          // pack that's quicker than you costs energy you'll miss later.
          t = t * 0.45 + localPace[i] * 0.55;
        } else if (isMid) {
          // Packs still matter mid-race, but the elastic starts stretching.
          t = t * 0.55 + localPace[i] * 0.45;
        }
        if (s > 0 && (isEarly || isMid) && localPace[i] < r.segBase) {
          const overreach = (r.segBase - localPace[i]) / r.segBase; // running above your head
          cost += overreach * 150;
        }

        if (isMid) {
          // Mid-race drift: weak thresholds leak time as the pace tells.
          t *= 1 + 0.010 * (1.35 - a.lactateThreshold / 100) * ((s - 2) / 5);

          // Surges: confident, race-smart runners attack mid-race.
          const surgeChance = 0.05 + (r.aggression / 100) * 0.10;
          if (!r.surgedLastSeg && r.reserve > 30 && rng.bool(surgeChance)) {
            t *= 0.972;
            cost += 7;
            r.surges++;
            r.surgedLastSeg = true;
            if (detailed && posOf[i] <= 30) {
              events.push({ seg: s, type: 'surge', athleteId: a.id, name: a.fullName, schoolId: r.schoolId });
            }
          } else if (r.surgedLastSeg) {
            // Recovering from the surge: big VO2 Max engines re-settle fastest.
            t *= 1 + 0.012 * (1.35 - a.vo2Max / 100);
            r.surgedLastSeg = false;
          }
        }

        // Hills: adapted hill runners gain time on everyone here.
        if (hillSegs.has(s)) {
          t *= 1 + hillFactor * 0.045 * (1.30 - r.hill / 100);
          cost += 2.5 * hillFactor;
        }

        if (isLate) {
          // The grind: pace held by stamina + toughness. This is where
          // strong distance runners move up through the field.
          const grind = 0.016 * (1.45 - (a.stamina * 0.6 + a.mentalToughness * 0.4) / 100) * (s - 7);
          t *= 1 + grind;
        }

        if (kickPhase && !r.faded && r.reserve > 10) {
          // The final 800-1000m: Speed + Running Economy + whatever's left.
          const kickPower = Utils.clamp(
            ((a.speed * 0.50 + a.runningEconomy * 0.30 + a.confidence * 0.20) / 100 - 0.40) * 0.095 +
            Utils.clamp((r.reserve - 10) / 300, 0, 0.018),
            -0.015, 0.065) * (s === SEGMENTS - 1 ? 1 : 0.5);
          t *= 1 - kickPower;
          cost += 2.5;
          if (s === SEGMENTS - 1) {
            r.kicked = kickPower > 0.03;
            if (detailed && r.kicked && posOf[i] <= 25) {
              events.push({ seg: s, type: 'kick', athleteId: a.id, name: a.fullName, schoolId: r.schoolId });
            }
          }
        }

        // Burn the tank; an empty tank means the dreaded late-race bonk.
        r.reserve -= cost;
        if (r.reserve <= 0) {
          const depth = Math.min(1.6, -r.reserve / 18);
          t *= 1 + 0.020 + 0.024 * depth;
          if (!r.faded) {
            r.faded = true;
            if (detailed && posOf[i] <= 30) {
              events.push({ seg: s, type: 'fade', athleteId: a.id, name: a.fullName, schoolId: r.schoolId });
            }
          }
        }

        // Segment-level noise: races breathe.
        t *= 1 + rng.gaussian(0, 0.008 * (1.45 - a.consistency / 100));

        r.segTimes.push(t);
      });

      // Pack drafting: runners with company share the work (race IQ helps).
      if (s >= 1 && s <= SEGMENTS - 2) {
        for (let k = 0; k < order.length; k++) {
          let packmates = 0;
          for (let j = Math.max(0, k - 3); j <= Math.min(order.length - 1, k + 3); j++) {
            if (j !== k && Math.abs(order[j].t - order[k].t) < 4) packmates++;
          }
          if (packmates >= 2) {
            const r = runners[order[k].i];
            r.segTimes[s] *= 1 - 0.0022 * (r.athlete.raceIQ / 100);
          }
        }
      }

      // Commit the segment.
      runners.forEach((r, i) => {
        cums[i] += r.segTimes[s];
        r.cum.push(Math.round(cums[i] * 10) / 10);
      });

      // Lead-change events for the broadcast.
      if (detailed && s >= 1) {
        const leader = runners.reduce((best, r, i) => (cums[i] < cums[best] ? i : best), 0);
        const leadId = runners[leader].athlete.id;
        if (lastLeaderId && leadId !== lastLeaderId && s < SEGMENTS - 1) {
          events.push({ seg: s, type: 'lead', athleteId: leadId, name: runners[leader].athlete.fullName, schoolId: runners[leader].schoolId });
        }
        lastLeaderId = leadId;
      }
    }

    // Finish order
    const finishers = runners
      .map((r) => ({
        athleteId: r.athlete.id,
        name: r.athlete.fullName,
        schoolId: r.schoolId,
        classYear: r.athlete.classYear,
        individual: r.individual,
        time: r.cum[SEGMENTS - 1]
      }))
      .sort((a, b) => a.time - b.time);
    finishers.forEach((f, i) => { f.place = i + 1; });

    const teamScores = scoreRace(finishers);

    const result = {
      distanceM,
      finishers: detailed ? finishers : finishers.slice(0, 15),
      finisherCount: finishers.length,
      teamScores
    };
    if (detailed) {
      result.splits = {};
      runners.forEach((r) => { result.splits[r.athlete.id] = r.cum; });
      result.events = events.slice(0, 60);
    }

    // Post-race bookkeeping: stats, PRs, records, fatigue, morale.
    applyRaceEffects(gameState, meet, gender, finishers, teamScores, distanceM);

    return result;
  }

  function median(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* NCAA team scoring */
  function scoreRace(finishers) {
    const byTeam = {};
    finishers.forEach((f) => { (byTeam[f.schoolId] = byTeam[f.schoolId] || []).push(f); });

    // Teams need 5 finishers; runners 8+ per team are excluded from scoring.
    const eligible = new Set(Object.keys(byTeam).filter((id) => byTeam[id].length >= 5));
    const scoringRunners = finishers.filter((f) => {
      if (!eligible.has(f.schoolId)) return false;
      const teamIdx = byTeam[f.schoolId].indexOf(f);
      return teamIdx < 7;
    });
    scoringRunners.forEach((f, i) => { f.scoringPlace = i + 1; });

    const teams = [...eligible].map((schoolId) => {
      const team = scoringRunners.filter((f) => f.schoolId === schoolId);
      const top5 = team.slice(0, 5);
      const points = top5.reduce((s, f) => s + f.scoringPlace, 0);
      return {
        schoolId,
        points,
        scorers: top5.map((f) => f.scoringPlace),
        sixth: team[5] ? team[5].scoringPlace : Infinity,
        finishers: team.length
      };
    });

    teams.sort((a, b) => (a.points - b.points) || (a.sixth - b.sixth));
    teams.forEach((t, i) => { t.place = i + 1; });
    return teams;
  }

  function distKey(distanceM) { return `${distanceM / 1000}K`; }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = (sec - m * 60).toFixed(1);
    return `${m}:${s.padStart(4, '0')}`;
  }

  function applyRaceEffects(gameState, meet, gender, finishers, teamScores, distanceM) {
    const key = distKey(distanceM);
    const isChampionship = meet.type !== 'invite';

    finishers.forEach((f) => {
      const a = gameState.world.athletes[f.athleteId];
      if (!a) return;
      a.careerStats.races += 1;
      a.seasonRaces = (a.seasonRaces || 0) + 1;
      a.raceLog = a.raceLog || [];
      a.raceLog.unshift({ y: gameState.year, w: meet.week, m: meet.name, p: f.place, t: f.time, d: key });
      if (a.raceLog.length > 8) a.raceLog.length = 8;
      if (f.place === 1) a.careerStats.wins += 1;
      if (f.place <= 5) a.careerStats.top5 += 1;
      const pr = a.careerStats.personalBests[key];
      if (!pr || f.time < pr) a.careerStats.personalBests[key] = f.time;

      // Race fatigue + morale swing
      a.fatigue = Utils.clamp(a.fatigue + 8, 0, 100);
      if (f.place === 1) a.morale = Utils.clamp(a.morale + 5, 0, 100);
      else if (f.place <= 10) a.morale = Utils.clamp(a.morale + 2, 0, 100);
      else if (f.place > finishers.length * 0.8) a.morale = Utils.clamp(a.morale - 2, 0, 100);

      // Race experience nudges race IQ for young runners
      if (a.careerStats.races % 6 === 0 && a.raceIQ < 90) a.raceIQ += 1;

      // School records
      const school = gameState.getSchool(f.schoolId);
      if (school) {
        school.records = school.records || {};
        const rKey = `${gender}-${key}`;
        const rec = school.records[rKey];
        if (!rec || f.time < rec.time) {
          school.records[rKey] = { time: f.time, name: f.name, year: gameState.year };
          if (f.schoolId === gameState.playerSchoolId) {
            gameState.logNews(`SCHOOL RECORD: ${f.name} runs ${formatTime(f.time)} for ${key} — fastest in ${school.name} history.`);
          }
        }
      }

      // National all-time record
      const nKey = `${gender}-${key}`;
      gameState.history.records = gameState.history.records || {};
      const nrec = gameState.history.records[nKey];
      if (!nrec || f.time < nrec.time) {
        gameState.history.records[nKey] = {
          time: f.time, name: f.name,
          school: gameState.getSchool(f.schoolId)?.name || '?', year: gameState.year
        };
        if (nrec) gameState.logNews(`NATIONAL RECORD: ${f.name} (${gameState.getSchool(f.schoolId)?.name}) runs ${formatTime(f.time)} for ${key}!`);
      }
    });

    // Team morale for meet winners
    if (teamScores[0]) {
      const winners = gameState.getRoster(teamScores[0].schoolId, gender);
      winners.forEach((a) => { a.morale = Utils.clamp(a.morale + (isChampionship ? 4 : 2), 0, 100); });
    }
  }

  /* ================================================================ *
   * Championships bookkeeping
   * ================================================================ */
  function recordConferenceChampions(gameState, meet, gender) {
    const res = meet.results[gender];
    if (!res || !res.teamScores.length) return;
    const champId = res.teamScores[0].schoolId;
    const school = gameState.getSchool(champId);
    school.historicalSuccess[gender === 'M' ? 'conferenceTitlesM' : 'conferenceTitlesW'] += 1;
    const confCoach = gameState.getCoach(school.coachId);
    if (confCoach) confCoach.careerRecord.conferenceTitles += 1;

    const H = gameState.history;
    H.conferenceChampions = H.conferenceChampions || {};
    H.conferenceChampions[gameState.year] = H.conferenceChampions[gameState.year] || {};
    H.conferenceChampions[gameState.year][`${meet.conference}-${gender}`] = school.name;

    if (champId === gameState.playerSchoolId) {
      gameState.logNews(`🏆 CONFERENCE CHAMPIONS! Your ${gender === 'M' ? 'men' : 'women'} win the ${meet.conference} title!`);
      school.prestige = Utils.clamp(school.prestige + 1, 0, 99);
    } else if (meet.conference === gameState.getPlayerSchool().conference) {
      gameState.logNews(`${school.name} wins the ${meet.conference} ${gender === 'M' ? "men's" : "women's"} title.`);
    }
  }

  function buildNationalsField(gameState) {
    // Auto qualifiers: top 2 teams per regional; at-large: best-ranked rest.
    const season = gameState.season;
    const rankings = gameState.rankings || {};
    ['M', 'W'].forEach((gender) => {
      const auto = [];
      (season.byWeek[REGIONAL_WEEK] || []).forEach((meetId) => {
        const meet = season.meets[meetId];
        const res = meet.results[gender];
        if (res) res.teamScores.slice(0, 2).forEach((t) => auto.push(t.schoolId));
      });
      const ranked = (rankings[gender] || []).map((r) => r.schoolId);
      const field = [...auto];
      for (const sid of ranked) {
        if (field.length >= NATIONALS_FIELD) break;
        if (!field.includes(sid)) field.push(sid);
      }
      season.nationalsFieldIds[gender] = field;
      if (field.includes(gameState.playerSchoolId)) {
        const wasAuto = auto.includes(gameState.playerSchoolId);
        gameState.logNews(`Your ${gender === 'M' ? 'men' : 'women'} are headed to the NCAA Championships${wasAuto ? ' as automatic qualifiers' : ' with an at-large bid'}!`);
      }
    });
  }

  function recordNationalChampions(gameState, meet, gender) {
    const res = meet.results[gender];
    if (!res || !res.teamScores.length) return;
    const champId = res.teamScores[0].schoolId;
    const school = gameState.getSchool(champId);
    school.historicalSuccess[gender === 'M' ? 'nationalTitlesM' : 'nationalTitlesW'] += 1;
    school.prestige = Utils.clamp(school.prestige + 2, 0, 99);
    const natCoach = gameState.getCoach(school.coachId);
    if (natCoach) natCoach.careerRecord.nationalTitles += 1;
    res.teamScores.slice(1, 4).forEach((t) => {
      const s = gameState.getSchool(t.schoolId);
      if (s) s.prestige = Utils.clamp(s.prestige + 1, 0, 99);
    });

    const indiv = res.finishers[0];
    const H = gameState.history;
    H.nationalChampions = H.nationalChampions || {};
    H.nationalChampions[gameState.year] = H.nationalChampions[gameState.year] || {};
    H.nationalChampions[gameState.year][gender] = {
      team: school.name,
      teamId: champId,
      individual: indiv ? indiv.name : '?',
      individualSchool: indiv ? (gameState.getSchool(indiv.schoolId)?.name || '?') : '?',
      individualTime: indiv ? indiv.time : 0
    };

    const label = gender === 'M' ? "men's" : "women's";
    if (champId === gameState.playerSchoolId) {
      gameState.logNews(`🏆🏆 NATIONAL CHAMPIONS! Your ${label} team wins the NCAA title!`);
    } else {
      gameState.logNews(`${school.name} wins the ${label} NCAA team title. ${indiv ? `${indiv.name} takes the individual crown in ${formatTime(indiv.time)}.` : ''}`);
    }
  }

  /* ================================================================ *
   * Weekly driver
   * ================================================================ */
  function processWeek(gameState, rng) {
    const season = gameState.season;
    if (!season || season.year !== gameState.year) return;
    const week = gameState.week;

    if (week === NATIONAL_WEEK) buildNationalsFieldIfNeeded(gameState);

    const meetIds = season.byWeek[week];
    if (!meetIds || !meetIds.length) return;

    meetIds.forEach((meetId) => {
      const meet = season.meets[meetId];
      if (!meet) return;
      const isPlayerMeet = meet.schoolIds.includes(gameState.playerSchoolId) ||
        (meet.type === 'national' &&
          (season.nationalsFieldIds.M?.includes(gameState.playerSchoolId) ||
           season.nationalsFieldIds.W?.includes(gameState.playerSchoolId)));
      const detailed = isPlayerMeet || meet.type === 'national';

      ['M', 'W'].forEach((gender) => {
        if (meet.type === 'national') {
          meet.fieldByGender = meet.fieldByGender || {};
          meet.fieldByGender[gender] = season.nationalsFieldIds[gender] || [];
          const saved = meet.schoolIds;
          meet.schoolIds = meet.fieldByGender[gender];
          meet.results[gender] = simulateRace(gameState, meet, gender, rng, detailed);
          meet.schoolIds = saved.length ? saved : meet.fieldByGender[gender];
        } else {
          meet.results[gender] = simulateRace(gameState, meet, gender, rng, detailed);
        }

        if (meet.type === 'conference') recordConferenceChampions(gameState, meet, gender);
        if (meet.type === 'national') recordNationalChampions(gameState, meet, gender);
      });

      // Player meet headline
      if (isPlayerMeet && meet.type !== 'national') {
        ['M', 'W'].forEach((gender) => {
          const res = meet.results[gender];
          if (!res) return;
          const mine = res.teamScores.find((t) => t.schoolId === gameState.playerSchoolId);
          if (mine) {
            gameState.logNews(`${meet.name}: your ${gender === 'M' ? 'men' : 'women'} finish ${Utils.ordinal(mine.place)} of ${res.teamScores.length} (${mine.points} pts).`);
          }
        });
      }
    });

    // Upset headlines from around the country
    meetIds.slice(0, 4).forEach((meetId) => {
      const meet = season.meets[meetId];
      const res = meet && meet.results.M;
      if (!res || !res.teamScores.length || meet.type !== 'invite') return;
      // handled lightly — big news engine arrives in Phase 5
    });

    // Refresh polls after every race week
    window.XCD.engine.Rankings.compute(gameState);
  }

  function isRaceWeek(season, week) {
    return !!(season.byWeek[week] && season.byWeek[week].length);
  }

  function buildNationalsFieldIfNeeded(gameState) {
    const season = gameState.season;
    if (!season.nationalsFieldIds.M || !season.nationalsFieldIds.M.length) {
      buildNationalsField(gameState);
    }
  }

  // Regionals happen at week 19; field building right after.
  function postWeekHousekeeping(gameState) {
    if (gameState.week === REGIONAL_WEEK + 1 || gameState.week === REGIONAL_WEEK) {
      const season = gameState.season;
      if (season && (!season.nationalsFieldIds.M || !season.nationalsFieldIds.M.length)) {
        const regionalsDone = (season.byWeek[REGIONAL_WEEK] || [])
          .every((id) => season.meets[id] && season.meets[id].results.M);
        if (regionalsDone) buildNationalsField(gameState);
      }
    }
  }

  window.XCD.engine.Races = {
    newSeason,
    processWeek,
    postWeekHousekeeping,
    simulateRace,
    scoreRace,
    raceRating,
    formatTime,
    distKey,
    isRaceWeek,
    RACE_WEEKS,
    PRENATS_WEEK,
    CONFERENCE_WEEK,
    REGIONAL_WEEK,
    NATIONAL_WEEK,
    SEGMENTS
  };
})();
