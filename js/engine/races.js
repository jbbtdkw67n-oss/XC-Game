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
   * The season — Update 2 (Part 5), Real Schedules:
   *   Wk 1-3 Summer Training (no racing) · Wk 4-12 regular season, where
   *   every program races its own 3-7 meet schedule off the persistent meet
   *   calendar (MeetCalendar) · Wk 13 Conference · Wk 14 Regionals ·
   *   Wk 15 Nationals (no byes between championship rounds) ·
   *   Wk 16-21 Offseason.
   *
   * Prestigious invitationals (Part 7): the famous named meets (Nuttycombe,
   * Joe Piane, Roy Griak, …) keep their real weekends and carry extra poll
   * weight; each division's Pre-Nationals runs Week 10 on its NCAA course.
   *
   * Postseason is division-aware (Part 13): conferences, regionals, and
   * nationals are built per division, while regular-season invitationals
   * may mix divisions.
   */
  const CAL = D.CALENDAR;
  const RACE_WEEKS = CAL.MEET_WEEKS.slice();
  const CONFERENCE_WEEK = CAL.CONFERENCE_WEEK;
  const REGIONAL_WEEK = CAL.REGIONAL_WEEK;
  const NATIONAL_WEEK = CAL.NATIONAL_WEEK;
  const SEGMENTS = 12;

  /* ================================================================ *
   * Season schedule
   * ================================================================ */
  function newSeason(gameState, rng) {
    const season = {
      year: gameState.year,
      raceWeeks: RACE_WEEKS.slice(),
      conferenceWeek: CONFERENCE_WEEK,
      regionalWeek: REGIONAL_WEEK,
      nationalWeek: NATIONAL_WEEK,
      meets: {},
      byWeek: {},
      playerMeetByWeek: {},
      // Player-division view (UI compatibility)
      nationalsFieldIds: { M: null, W: null },
      individualQualifiers: { M: [], W: [] },
      // Per-division postseason bookkeeping (Part 13)
      championships: {} // division -> { nationalsMeetId, fieldIds, individualQualifiers }
    };

    // This season's weather (year-to-year variation): every season brings its
    // own autumn — a warm or cool fall, a wet or dry one, a windy or calm one.
    // It shifts every meet's race-day forecast, so the same course runs
    // faster some years and slower in others. The terrain never changes.
    season.weather = seasonWeather(rng);
    activeSeasonWeather = season.weather;

    const schoolIds = gameState.world.schoolOrder.slice();
    const playerDivision = (gameState.getPlayerSchool() && gameState.getPlayerSchool().division) || 'DI';

    // Pre-pick each division's Nationals host up front so Pre-Nationals can
    // be contested on the DI Championship course (Update 3).
    const byDivisionAll = {};
    schoolIds.forEach((id) => {
      const s = gameState.getSchool(id);
      const div = s.division || 'DI';
      (byDivisionAll[div] = byDivisionAll[div] || []).push(id);
    });
    // NCAA Championships are hosted only at REAL venues that have actually held
    // the meet (Authentic Championship Venues): each division draws from the
    // real course rotation, so a national title is always won somewhere like
    // the Zimmer Course (Madison) or Apalachee Regional Park (Tallahassee).
    const nationalsVenues = {};
    const nationalsHosts = {};
    Object.entries(byDivisionAll).forEach(([division, divIds]) => {
      const venue = D.championshipVenue(gameState.year, division);
      nationalsVenues[division] = venue;
      // Keep a real in-division host for realistic race-day weather, preferring
      // a program in the venue's own state; the venue itself drives the course.
      const inState = venue ? divIds.filter((id) => gameState.getSchool(id).state === venue.state) : [];
      nationalsHosts[division] = inState.length ? rng.choice(inState) : rng.choice(divIds);
    });
    const venueCourseMeta = (v) => v ? {
      city: v.city, state: v.state, course: v.name,
      altitudeFt: v.altitudeFt, hilliness: v.hilliness, prestige: 'Elite'
    } : undefined;
    // The DI Championship course profile (hills, altitude) — mirrored by
    // Pre-Nationals so competing teams preview the real terrain.
    const diVenue = nationalsVenues.DI;
    const diHost = gameState.getSchool(nationalsHosts.DI || byDivisionAll.DI?.[0]);
    const diCourse = diHost ? {
      hostId: diHost.id,
      hilliness: diVenue ? diVenue.hilliness : rng.int(30, 80),
      altitude: diVenue ? D.altitudeCategory(diVenue.altitudeFt) : diHost.weather.altitude,
      tempBase: diHost.weather.tempBase,
      courseMeta: venueCourseMeta(diVenue)
    } : null;
    season.nationalsHosts = nationalsHosts;
    season.nationalsVenues = nationalsVenues;
    season.diCourse = diCourse;

    // --- Regular season (Real Schedules) -------------------------------
    // Weeks 4-12 come from the persistent meet calendar: every program
    // builds its own 3-7 meet schedule within a hard travel budget (the CPU
    // first, then the player during Week 1). See MeetCalendar.
    const courseFor = (division) => {
      const venue = nationalsVenues[division];
      const host = gameState.getSchool(nationalsHosts[division] || (byDivisionAll[division] || [])[0]);
      return host ? {
        hostId: host.id,
        hilliness: venue ? venue.hilliness : rng.int(30, 80),
        altitude: venue ? D.altitudeCategory(venue.altitudeFt) : host.weather.altitude,
        tempBase: host.weather.tempBase,
        courseMeta: venueCourseMeta(venue)
      } : null;
    };
    season.preNationalsByDiv = {};
    window.XCD.engine.MeetCalendar.buildRegularSeason(gameState, season, rng, {
      buildMeet,
      buildPreNationals: (gs, r, division, cfg) =>
        buildPreNationals(gs, r, D.PRE_NATIONALS.week, season,
          division === 'DI' ? diCourse : courseFor(division), division, cfg)
    });

    // --- Postseason: built per division (Part 13) --------------------
    const byDivision = {};
    schoolIds.forEach((id) => {
      const s = gameState.getSchool(id);
      const div = s.division || 'DI';
      (byDivision[div] = byDivision[div] || []).push(id);
    });

    season.byWeek[CONFERENCE_WEEK] = [];
    season.byWeek[REGIONAL_WEEK] = [];
    season.byWeek[NATIONAL_WEEK] = [];

    Object.entries(byDivision).forEach(([division, divIds]) => {
      const divRules = D.divisionFor(division);

      // Conference championships
      const byConference = {};
      divIds.forEach((id) => {
        const s = gameState.getSchool(id);
        (byConference[s.conference] = byConference[s.conference] || []).push(id);
      });
      Object.entries(byConference).forEach(([conf, ids]) => {
        const host = gameState.getSchool(rng.choice(ids));
        const meet = buildMeet(gameState, rng, {
          week: CONFERENCE_WEEK,
          name: `${conf} Championships`,
          hostId: host.id,
          schoolIds: ids,
          type: 'conference',
          conference: conf,
          division
        });
        season.meets[meet.id] = meet;
        season.byWeek[CONFERENCE_WEEK].push(meet.id);
        if (ids.includes(gameState.playerSchoolId)) season.playerMeetByWeek[CONFERENCE_WEEK] = meet.id;
      });

      // Regionals (Balanced NCAA Regionals): teams group into the real NCAA
      // championship regions for their division — 9 for DI, 8 for DII/DIII — so
      // every regional carries a comparable, geographically-authentic field.
      const byRegion = {};
      divIds.forEach((id) => {
        const region = D.ncaaRegionFor(gameState.getSchool(id));
        (byRegion[region] = byRegion[region] || []).push(id);
      });
      Object.entries(byRegion).forEach(([region, ids]) => {
        const host = gameState.getSchool(rng.choice(ids));
        const meet = buildMeet(gameState, rng, {
          week: REGIONAL_WEEK,
          name: `NCAA ${division !== 'DI' ? D.DIVISION_SHORT[division] + ' ' : ''}${region} Regional`,
          hostId: host.id,
          schoolIds: ids,
          type: 'regional',
          region,
          division
        });
        season.meets[meet.id] = meet;
        season.byWeek[REGIONAL_WEEK].push(meet.id);
        if (ids.includes(gameState.playerSchoolId)) season.playerMeetByWeek[REGIONAL_WEEK] = meet.id;
      });

      // Nationals shell (field determined after regionals). Host was
      // pre-picked so Pre-Nationals could preview the DI course.
      const natHost = gameState.getSchool(nationalsHosts[division] || rng.choice(divIds));
      const natVenue = nationalsVenues[division];
      const natMeet = buildMeet(gameState, rng, {
        week: NATIONAL_WEEK,
        name: `NCAA ${divRules.label !== 'Division I' ? divRules.label + ' ' : ''}Championships`,
        hostId: natHost.id,
        schoolIds: [], // filled post-regionals per gender
        type: 'national',
        division,
        courseMeta: venueCourseMeta(natVenue), // authentic championship course
        venue: natVenue ? natVenue.name : null
      });
      season.meets[natMeet.id] = natMeet;
      season.byWeek[NATIONAL_WEEK].push(natMeet.id);
      season.championships[division] = {
        nationalsMeetId: natMeet.id,
        fieldIds: { M: null, W: null },
        individualQualifiers: { M: [], W: [] }
      };
    });

    // Player-division mirrors for the UI and older code paths.
    const mine = season.championships[playerDivision] || Object.values(season.championships)[0];
    season.nationalsMeetId = mine.nationalsMeetId;
    season.nationalsFieldIds = mine.fieldIds;
    season.individualQualifiers = mine.individualQualifiers;

    gameState.season = season;
    return season;
  }

  /* ---------------- Race-day weather ---------------- */
  // The season's weather pattern. tempShift moves every forecast warmer or
  // cooler; wetChance is how often a meet gets rain; windShift adds (or
  // removes) wind across the board.
  let activeSeasonWeather = null;
  function seasonWeather(rng) {
    const tempShift = Utils.clamp(Math.round(rng.gaussian(0, 4)), -9, 9);
    const wetChance = Utils.clamp(Math.round((0.18 + rng.gaussian(0, 0.08)) * 100) / 100, 0.04, 0.40);
    const windShift = Utils.clamp(Math.round(rng.gaussian(0, 2)), -3, 5);
    const parts = [];
    if (tempShift >= 3) parts.push('warm'); else if (tempShift <= -3) parts.push('cold');
    if (wetChance >= 0.25) parts.push('wet'); else if (wetChance <= 0.11) parts.push('dry');
    if (windShift >= 3) parts.push('windy');
    return { tempShift, wetChance, windShift, label: parts.length ? `A ${parts.join(', ')} fall` : 'A typical fall' };
  }

  // One meet's race-day forecast: temperature, wind, rain and the footing it
  // leaves (firm, soft, or muddy). Fixed when the schedule is built.
  function raceDayWeather(rng, tempBase, week, sw) {
    const w = sw || activeSeasonWeather || { tempShift: 0, wetChance: 0.18, windShift: 0 };
    const rain = rng.bool(w.wetChance);
    return {
      tempF: Math.round(tempBase + w.tempShift + rng.int(-10, 12) - (week - 5) * 1.1),
      windMph: Utils.clamp(Math.round(Math.abs(rng.gaussian(5 + w.windShift, 4))), 0, 28),
      rain,
      ground: rain ? (rng.bool(0.4) ? 'Muddy' : 'Soft') : 'Firm'
    };
  }

  // A course's fixed terrain. The canonical course data wins, and once a
  // course is in this dynasty's record book its stored profile is the source
  // of truth, so a course races on identical terrain every season.
  function courseTerrain(gameState, cm) {
    if (!cm) return null;
    let hilliness = cm.hilliness;
    let altitudeFt = cm.altitudeFt;
    const book = gameState.history && gameState.history.courseRecords;
    const entry = book && cm.course && book[D.courseSlug(cm.course)];
    if (entry && !D.isNamedCourse(entry.key)) {
      if (entry.hilliness != null) hilliness = entry.hilliness;
      if (entry.altitudeFt != null) altitudeFt = entry.altitudeFt;
    }
    return { hilliness, altitudeFt };
  }

  /*
   * Pre-Nationals (Update 20): a Division I elite meet on the NCAA DI
   * Championship course, contested in Week 10. It is no longer an
   * invitation the player accepts or declines — it is simply the most
   * prestigious meet on the Week 10 calendar, selectable like any other
   * elite invitational (gated by prestige / a top-25 ranking) on the
   * Schedule screen. The field is dealt on merit (last year's poll blended
   * with prestige); racing it earns a small familiarity edge at Nationals.
   */
  function buildPreNationals(gameState, rng, week, season, diCourse, division, sizes) {
    division = division || 'DI';
    const cfg = Object.assign({}, D.PRE_NATIONALS, sizes || {});
    const diIds = gameState.world.schoolOrder.filter((id) => (gameState.getSchool(id).division || 'DI') === division);
    if (!diIds.length) return null;

    // Standing that earns a place in the field: last year's poll (defending
    // qualifiers / top-25) blended with prestige (traditional powers). First
    // season has no prior poll, so prestige carries it.
    const prevRank = {};
    if (gameState.rankings) {
      ['M', 'W'].forEach((g) => (gameState.rankings[g] || []).forEach((r) => {
        if (((gameState.getSchool(r.schoolId) || {}).division || 'DI') === division) {
          prevRank[r.schoolId] = Math.min(prevRank[r.schoolId] || 999, r.rank);
        }
      }));
    }
    const merit = (id) => {
      const s = gameState.getSchool(id);
      const rankScore = prevRank[id] ? Math.max(0, 60 - prevRank[id]) : 0;
      return s.prestige * 0.7 + rankScore * 0.8;
    };

    const host = gameState.getSchool(diCourse ? diCourse.hostId : diIds[0]);
    const ranked = diIds.slice().sort((a, b) => merit(b) - merit(a));
    const meritSlots = Math.max(0, cfg.fieldSize - cfg.atLargeSlots);
    const field = [];
    const seen = new Set();
    // Host always gets a spot.
    if (host) { field.push(host.id); seen.add(host.id); }
    for (const id of ranked) {
      if (field.length >= meritSlots) break;
      if (!seen.has(id)) { field.push(id); seen.add(id); }
    }
    // At-large: rising mid-majors having exceptional seasons (mid prestige,
    // decent recent poll) round out the field.
    const atLargePool = ranked.filter((id) => !seen.has(id) && gameState.getSchool(id).prestige >= 45);
    for (let i = 0; i < cfg.atLargeSlots && atLargePool.length; i++) {
      const pick = atLargePool.splice(rng.int(0, Math.min(atLargePool.length - 1, 40)), 1)[0];
      field.push(pick); seen.add(pick);
    }


    const pnMeta = diCourse && diCourse.courseMeta;
    const conditions = {
      ...raceDayWeather(rng, diCourse ? diCourse.tempBase : host.weather.tempBase, week, season.weather),
      hilliness: diCourse ? diCourse.hilliness : rng.int(30, 80),
      altitude: diCourse ? diCourse.altitude : host.weather.altitude,
      altitudeFt: pnMeta && pnMeta.altitudeFt != null ? pnMeta.altitudeFt : undefined
    };
    const meet = {
      id: Utils.generateId('meet'),
      week,
      name: division === 'DI' ? cfg.name : `${D.DIVISION_SHORT[division] || division} ${cfg.name}`,
      hostId: host.id,
      schoolIds: field,
      type: 'invite',
      division,
      elite: cfg.pollWeight,
      preNationals: true,
      distances: { M: 8000, W: 6000 }, // Pre-Nationals runs the 8K (men) / 6K (women)
      conditions,
      courseMeta: diCourse ? diCourse.courseMeta : undefined, // the real DI championship course
      results: { M: null, W: null }
    };
    season.meets[meet.id] = meet;
    season.byWeek[week] = season.byWeek[week] || [];
    season.byWeek[week].push(meet.id);

    // `accepted` mirrors the invited field so preview stories keep working;
    // familiarity reads the live meet roster (the schedules settle later).
    const info = {
      meetId: meet.id,
      week,
      division,
      hostId: host.id,
      diNationalsHostId: diCourse ? diCourse.hostId : null,
      accepted: field.slice()
    };
    season.preNationalsByDiv = season.preNationalsByDiv || {};
    season.preNationalsByDiv[division] = info;
    if (division === 'DI') season.preNationals = info;
    return meet;
  }

  // Did a school race Pre-Nationals this season (course familiarity)? A team
  // races it when it is in the meet's field — the player's own Schedule-screen
  // choice is reflected there, so this reads the live meet roster.
  function racedPreNationals(gameState, schoolId, division) {
    const season = gameState.season;
    const pn = season && ((division && season.preNationalsByDiv && season.preNationalsByDiv[division]) ||
      (!division || division === 'DI' ? season.preNationals : null));
    if (!pn) return false;
    const meet = season.meets[pn.meetId];
    if (meet) return (meet.schoolIds || []).includes(schoolId);
    return !!(pn.accepted && pn.accepted.includes(schoolId));
  }

  function buildMeet(gameState, rng, base) {
    const host = gameState.getSchool(base.hostId);
    const distances = (base.week >= CONFERENCE_WEEK || base.elite)
      ? { M: 8000, W: 6000 }
      : { M: 8000, W: 5000 };
    // Week 4 men's distance variety (early-season 6K option): a real slice of
    // early/mid-season invitationals race the men at 6K rather than 8K. Applied
    // to ~45% of Week 4 non-championship meets (deterministic per meet via the
    // season-build RNG), so 8K stays the norm and both distances appear, clearly
    // labeled. Women's distances are unchanged. The time model scales the 6K
    // correctly (baseTime distance scaling), and scoring is distance-agnostic.
    if (base.week === 4 && base.type !== 'conference' && base.type !== 'regional' &&
        base.type !== 'national' && rng.bool(0.45)) {
      distances.M = 6000;
    }
    if (base.type === 'regional') {
      // Bug fix: NCAA regionals race the full championship 10K for men in
      // Division I and II (Division III regionals stay at 8K, matching their
      // nationals). Women race 6K everywhere.
      const div = base.division || 'DI';
      distances.M = (div === 'DI' || div === 'DII') ? 10000 : 8000;
      distances.W = 6000;
    }
    if (base.type === 'national') {
      const champ = D.divisionFor(base.division || 'DI').championship;
      distances.M = champ.nationalsDistanceM.M;
      distances.W = champ.nationalsDistanceM.W;
    }
    // Famous meets race on their REAL course (Meet Database Expansion): the
    // stored hilliness/altitude profile drives conditions instead of random
    // host-derived terrain, so Gans Creek is always rolling at 738 ft and a
    // mountain host's invitational is always thin-air racing. Every OTHER meet
    // races the host program's deterministic HOME COURSE (Course Records), so
    // its terrain is stable season to season and it keeps its own course
    // record — an invitational, a conference meet, or a regional all race on
    // a real, identifiable course rather than random one-off terrain.
    if (!base.courseMeta && window.XCD.engine.Courses) {
      base.courseMeta = window.XCD.engine.Courses.homeCourseMeta(host);
    }
    const cm = base.courseMeta;
    const terrain = courseTerrain(gameState, cm);
    return {
      id: Utils.generateId('meet'),
      ...base,
      distances,
      conditions: {
        // Race-day weather changes every meet and every season (wind, rain,
        // footing and temperature are stamped alongside a course record).
        ...raceDayWeather(rng, host.weather.tempBase, base.week),
        // The course itself never changes: the same hills every year.
        hilliness: terrain && terrain.hilliness !== undefined ? terrain.hilliness : rng.int(10, 85),
        altitude: terrain && terrain.altitudeFt !== undefined
          ? D.altitudeCategory(terrain.altitudeFt)
          : host.weather.altitude,
        altitudeFt: terrain && terrain.altitudeFt !== undefined ? terrain.altitudeFt : undefined
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
  //
  // Race-time realism rebalance: the ability→pace mapping is anchored to a
  // broad sample of modern collegiate cross country, NOT one unusually fast
  // championship. Winning times land in real ranges only AFTER conditions and
  // form apply (a well-tapered elite on a fast course runs a minute-plus
  // quicker than the same runner grinding a hilly regular-season meet), so
  // this base is deliberately conservative — the model, not a flat percentage,
  // creates the variation. Calibrated so an elite (race-rating ~90) championship
  // winner runs roughly: M 10K ~29:1x–29:4x, M 8K ~23:2x, W 6K ~19:2x–19:4x,
  // with D2/D3 naturally slower because their fields peak at lower ratings.
  function baseTime(rating, gender, distanceM) {
    const km = distanceM / 1000;
    // Per-km pace (s/km) as a linear function of race rating. Intercept/slope
    // set so realistic collegiate ratings yield realistic per-km pace across
    // the whole field, from champions down to the back of the pack.
    let perKm = gender === 'M'
      ? 240 - 0.62 * rating
      : 264 - 0.62 * rating;
    // Distance scaling: longer races cost a little more per km, shorter races
    // a little less (fresher legs, faster ground). Referenced to the men's 8K
    // / women's 6K championship distance.
    const refKm = gender === 'M' ? 8 : 6;
    perKm *= 1 + (km - refKm) * 0.006;
    // Men's 6K realism: the men only ever contest a 6K early in the season
    // (fresh but under-raced legs, run on the same rugged courses as the 8K),
    // so a pure distance discount makes elite 6K times read unrealistically
    // fast. A small correction keeps the very best men's 6K in the ~17:1x–17:3x
    // range instead of dipping under 17:00. Ordering and scoring are unchanged
    // (every runner in the race takes the same factor); only the clock reads
    // realistically. Women's 5K/6K are unaffected.
    if (gender === 'M' && distanceM < 8000) perKm *= 1.03;
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
    // Rain and footing (year-to-year weather): a wet course is slower, and a
    // muddy one far slower — worst on hills, where every climb turns to
    // sludge. Tough, consistent runners lose the least.
    const ground = c.ground || (c.rain ? 'Soft' : 'Firm');
    if (ground === 'Muddy') mult += (0.010 + (c.hilliness || 0) * 0.00008) * (1.3 - weatherSkill);
    else if (ground === 'Soft' || c.rain) mult += (0.004 + (c.hilliness || 0) * 0.00003) * (1.3 - weatherSkill);

    // Wind: anything beyond a breeze costs time on an open course (the field
    // runs into it for half the race); pack runners shelter, but everyone pays.
    if ((c.windMph || 0) > 8) mult += Utils.clamp((c.windMph - 8) * 0.0007, 0, 0.014);

    // Course profile (Course Hilliness System): flat courses race genuinely
    // fast, rolling courses a touch slower, hilly courses significantly
    // slower — and hill specialists (built through Hills training) with
    // strong endurance lose far less of that time, so they outperform
    // expectations on hard courses. Centered near "rolling" (40), so a flat
    // 10-hilliness course is a PR course and an 85 is a war of attrition.
    const hillSkill = (hillAbility(a) * 0.7 + a.stamina * 0.3) / 100;
    mult += (c.hilliness - 40) * 0.00042 * (1.45 - hillSkill);

    // Difficult terrain (Update 5, Part 7): a genuinely hilly course is an
    // adverse condition all its own, and mentally tough runners lose
    // significantly less over it. (Hill *ability* is modeled per-segment
    // elsewhere; this is the grit to keep grinding when the course bites.)
    if (c.hilliness > 55) {
      const toughness = (a.mentalToughness * 0.7 + a.consistency * 0.3) / 100;
      mult += (c.hilliness - 55) * 0.00018 * (1.5 - toughness);
    }

    // Altitude simulation: thin air slows everyone — but adaptation is real.
    // A big aerobic engine copes best, athletes from programs that TRAIN at
    // altitude carry a much smaller penalty, and altitude-trained runners
    // racing at sea level cash in a modest performance bonus.
    // The cost climbs with the course's real elevation (above ~1,000 ft), so
    // a 7,000 ft course is far slower than a 4,000 ft one and sea-level
    // courses are the fast ones.
    const homeAlt = (gameState.getSchool(a.schoolId) || { weather: {} }).weather.altitude || 'Low';
    const altAdapt = homeAlt === 'High' ? 0.30 : homeAlt === 'Medium' ? 0.60 : 1;
    const altFt = typeof c.altitudeFt === 'number' ? c.altitudeFt : (D.ALTITUDE_FT_FOR[c.altitude] || 600);
    const thinAir = Math.max(0, altFt - 1000) / 1000 * 0.0055;
    if (thinAir > 0) mult += thinAir * (1.5 - a.vo2Max / 100) * altAdapt;
    if (c.altitude !== 'High' && c.altitude !== 'Medium') {
      if (homeAlt === 'High') mult -= 0.004;        // live high, race low
      else if (homeAlt === 'Medium') mult -= 0.0015;
    }

    // Confidence (Update 5, Part 7): current belief in one's running is a
    // meaningful, dynamic race-day edge — a runner riding a wave of PRs
    // races freer than one whose confidence has been shaken.
    mult += Utils.clamp((60 - (a.confidence ?? 60)) * 0.00028, -0.007, 0.010);

    // Readiness (training state) and morale
    const TE = window.XCD.engine.Training;
    const ready = TE.readiness(a);
    mult += Utils.clamp((62 - ready) * 0.00075, -0.008, 0.035);
    mult += Utils.clamp((65 - a.morale) * 0.0002, -0.004, 0.008);

    // Race sharpness (Part 6): a well-timed taper puts speed in the legs;
    // heavy-volume legs race flat. (±~1.3% at the extremes.)
    mult += Utils.clamp((55 - (a.sharpness ?? 55)) * 0.00035, -0.014, 0.014);

    // Peaking: a great tactician has athletes flying for championship races.
    // Race preparation is a staff effort (spec Part 2, Section 12): the
    // assistant contributes a quarter-weight of their own peaking craft.
    if (meet.type === 'conference' || meet.type === 'regional' || meet.type === 'national') {
      const school = gameState.getSchool(a.schoolId);
      const coach = school && gameState.getCoach(school.coachId);
      let peaking = coach ? (coach.peaking ?? coach.raceStrategy ?? 55) : 55;
      const asst = school && school.assistantId && gameState.world.coaches[school.assistantId];
      if (asst && (!coach || asst.id !== coach.id)) peaking += ((asst.peaking ?? 55) - 55) * 0.25;
      mult -= (peaking - 50) * 0.00016; // ±0.8% swing at the extremes
    }

    // Pre-Nationals course familiarity (Update 3): teams that raced
    // Pre-Nationals know this DI Championship course — a small, non-decisive
    // edge (~0.6% faster). Rewards participation without deciding the race.
    if (meet.type === 'national') {
      const div = meet.division || 'DI';
      const season = gameState.season;
      const pn = season && ((season.preNationalsByDiv && season.preNationalsByDiv[div]) || (div === 'DI' ? season.preNationals : null));
      if (pn && meet.hostId === pn.diNationalsHostId && racedPreNationals(gameState, a.schoolId, div)) {
        mult -= D.PRE_NATIONALS.familiarityBonus;
      }
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
        .filter((a) => a && !a.injury)
        .sort((a, b) => (raceRating(b, distanceM) + b.fitness * 0.1) - (raceRating(a, distanceM) + a.fitness * 0.1))
        .slice(0, 7);
      squad.forEach((a) => entries.push({ athlete: a, schoolId }));
    });
    (meet.individualEntries && meet.individualEntries[gender] || []).forEach((athId) => {
      const a = gameState.world.athletes[athId];
      if (a && a.injury && a.schoolId === gameState.playerSchoolId) {
        // Never silent: a qualifier scratched by injury makes the news.
        gameState.logNews(`🩹 ${a.fullName} earned an individual spot at ${meet.name} but is scratched with an injury.`);
      }
      if (a && !a.injury && !entries.some((e) => e.athlete.id === athId)) {
        entries.push({ athlete: a, schoolId: a.schoolId, individual: true });
      }
    });
    if (!entries.length) return null;

    const hillFactor = meet.conditions.hilliness / 100;

    // Per-team race-day form from team morale (Update 3): a coherent, bounded
    // over/under-performance applied to every runner on the team, so a
    // confident squad can collectively beat its projection (and a fractured
    // one fall short) — amplified at championships, never overriding talent.
    const isChampMeet = meet.type === 'conference' || meet.type === 'regional' || meet.type === 'national';
    const Morale = window.XCD.engine.Morale;
    const teamForm = {};
    const teamTactic = {}; // per-school race philosophy (Update 4, Part 3)
    (meet.schoolIds || []).forEach((sid) => {
      teamForm[sid] = Morale ? Morale.teamForm(gameState, sid, isChampMeet, rng) : 0;
      const s = gameState.getSchool(sid);
      const c = s && gameState.getCoach(s.coachId);
      teamTactic[sid] = D.racePhilosophy(c ? c.racePhilosophy : 'even').tactic;
    });
    const defaultTactic = D.racePhilosophy('even').tactic;
    const tacticFor = (sid) => teamTactic[sid] || defaultTactic;

    // --- Per-runner race state -----------------------------------------
    const runners = entries.map(({ athlete: a, schoolId, individual }) => {
      const rating = raceRating(a, distanceM);
      let total = baseTime(rating, gender, distanceM) * conditionsMultiplier(gameState, a, meet, gender);
      if (teamForm[schoolId]) total *= 1 + teamForm[schoolId];
      const chem = gameState.getSchool(schoolId)?.chemistry?.[gender];
      if (chem !== undefined) total *= 1 + (55 - chem) * 0.0002;
      // A strong captain steadies the team on race day — a small edge that
      // grows at championships (up to ~0.3%, ~0.45% in the postseason).
      const capLead = gameState.getSchool(schoolId)?.captainLeadership?.[gender];
      if (capLead > 70 && !individual) total *= 1 - Math.min(25, capLead - 70) * 0.00012 * (isChampMeet ? 1.5 : 1);
      const tactic = tacticFor(schoolId);
      // Day form: consistent runners have narrower swings. Even-pace and
      // pack-running staffs damp the swing further (steadier team scoring).
      const evennessDamp = tactic.evenness ? 0.72 : tactic.teamPack ? 0.82 : 1;
      total *= 1 + rng.gaussian(0, 0.015 * (1.45 - a.consistency / 100) * evennessDamp);

      // The energy tank: Stamina + current fitness + freshness. A 12-segment
      // race costs ~66-78 depending on Lactate Threshold, so tired or
      // low-stamina runners run out before the finish and fade. Energy-saving
      // philosophies (sit-and-kick, conservative) bank a little extra.
      const reserve = (35 + a.stamina * 0.35 + a.fitness * 0.20 + (100 - a.fatigue) * 0.16) *
        (1 + (tactic.reserveBonus || 0));

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
        kicked: false,
        tactic
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
        const tac = r.tactic || defaultTactic;
        let t = r.segBase;

        // Cost of covering this segment (drained from the tank). A strong
        // threshold makes hard running cheaper.
        let cost = 6.6 - a.lactateThreshold * 0.016;

        // Race philosophy shifts pack discipline: sit-and-kick / pack runners
        // tuck in tighter (blend toward the group), aggressive front-runners
        // run their own harder pace.
        const packBias = Utils.clamp((tac.packBias || 0), -0.25, 0.25);

        if (s === 0) {
          // The gun: adrenaline + the field goes out together. Aggressive
          // staffs go out harder; conservative ones bank energy early.
          t = t * 0.5 + fieldPace * 0.5;
          t *= 0.985 * (tac.earlyPace || 1);
        } else if (isEarly) {
          // Pack formation: everyone tucks into a group. Hanging with a
          // pack that's quicker than you costs energy you'll miss later.
          const w = Utils.clamp(0.55 + packBias, 0.30, 0.80);
          t = t * (1 - w) + localPace[i] * w;
          t *= (tac.earlyPace || 1) < 1 ? (0.5 + (tac.earlyPace || 1) * 0.5) : 1; // aggressive push
        } else if (isMid) {
          // Packs still matter mid-race, but the elastic starts stretching.
          const w = Utils.clamp(0.45 + packBias, 0.25, 0.70);
          t = t * (1 - w) + localPace[i] * w;
        }
        if (s > 0 && (isEarly || isMid) && localPace[i] < r.segBase) {
          const overreach = (r.segBase - localPace[i]) / r.segBase; // running above your head
          // Conservative staffs waste less energy chasing an early pace.
          cost += overreach * 150 * (tac.earlyPace > 1 ? 0.8 : 1);
        }

        if (isMid) {
          // Mid-race drift: weak thresholds leak time as the pace tells.
          t *= 1 + 0.010 * (1.35 - a.lactateThreshold / 100) * ((s - 2) / 5);

          // Surges: confident, race-smart runners attack mid-race — how often
          // is shaped by the coach's race philosophy.
          const surgeChance = (0.05 + (r.aggression / 100) * 0.10) * (tac.surge || 1);
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
          // strong distance runners move up through the field. Conservative
          // staffs grind up harder late (having saved early).
          const grind = 0.016 * (1.45 - (a.stamina * 0.6 + a.mentalToughness * 0.4) / 100) * (s - 7);
          t *= 1 + grind;
          if (tac.lateGrind && r.reserve > 15) t *= 1 - (tac.lateGrind - 1) * 0.02;
        }

        if (kickPhase && !r.faded && r.reserve > 10) {
          // The final 800-1000m: Speed + Running Economy + whatever's left.
          // Sit-and-kick philosophies unleash a bigger finish; aggressive
          // front-runners have less left to give.
          const kickPower = Utils.clamp(
            (((a.speed * 0.50 + a.runningEconomy * 0.30 + a.confidence * 0.20) / 100 - 0.40) * 0.095 +
            Utils.clamp((r.reserve - 10) / 300, 0, 0.018)) * (tac.kick || 1),
            -0.015, 0.07) * (s === SEGMENTS - 1 ? 1 : 0.5);
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

    // DNF (Update 19): a small, realistic slice of the field drops out — a
    // fall or rolled ankle, sudden illness, or a catastrophic bonk deep in the
    // red. DNFs are rare on a temperate day and climb sharply in extreme heat.
    // A DNF scores nothing and — crucially — does NOT count toward a team's
    // five, so losing a runner mid-race can knock a team out of the standings.
    markDNFs(runners, meet, rng);

    // Finish order (DNF runners never crossed the line, so they're excluded).
    const finishers = runners
      .filter((r) => !r.dnf)
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

    // The runners who stepped off the course: listed at the bottom of the
    // results with no place and no time.
    const dnfs = runners
      .filter((r) => r.dnf)
      .map((r) => ({
        athleteId: r.athlete.id,
        name: r.athlete.fullName,
        schoolId: r.schoolId,
        classYear: r.athlete.classYear,
        individual: r.individual,
        dnf: true,
        reason: r.dnfReason
      }));

    const teamScores = scoreRace(finishers);

    const result = {
      distanceM,
      // Regionals keep a deeper list: individual qualifying reads finishers
      // down past 25th (top-25 cutoff + national at-large individuals).
      finishers: detailed ? finishers : finishers.slice(0, meet.type === 'regional' ? 60 : 15),
      finisherCount: finishers.length,
      dnfs,
      teamScores
    };
    if (detailed) {
      result.splits = {};
      runners.forEach((r) => { result.splits[r.athlete.id] = r.cum; });
      result.events = events.slice(0, 60);
    }

    // Post-race bookkeeping: stats, PRs, records, fatigue, morale — then the
    // DNF fallout (fatigue, a morale/confidence hit, an injury risk, a marked
    // race-log entry).
    applyRaceEffects(gameState, meet, gender, finishers, teamScores, distanceM);
    applyDNFEffects(gameState, meet, gender, dnfs, rng);

    return result;
  }

  /*
   * Decide which runners fail to finish (Update 19). Flags each dropped runner
   * with `r.dnf = true` and a `r.dnfReason` ('bonk' | 'mishap'). Kept rare and
   * conditions-driven so DNFs feel like real cross country: almost none on a
   * cool day, a rash of them in dangerous heat, and the beaten-up, fragile,
   * or thoroughly bonked runners the most exposed.
   */
  function markDNFs(runners, meet, rng) {
    // DNFs are modeled for real, full-sized fields. In a tiny field (a rare
    // edge case) a dropout distorts scoring wildly and risks leaving too few
    // finishers, so leave those races clean.
    if (!runners || runners.length < 10) return;
    const cond = meet.conditions || {};
    const tempF = cond.tempF == null ? 60 : cond.tempF;
    const veryHot = tempF >= 90;
    const hot = tempF >= 82;
    const cold = tempF <= 15;
    runners.forEach((r) => {
      const a = r.athlete;
      // Base mishap risk: a fall, a rolled ankle in a pack, a cramp, illness.
      let mishap = 0.0022;
      if (cold) mishap += 0.0015;
      mishap += Math.max(0, 55 - (a.injuryResistance ?? 55)) * 0.00028;
      mishap += (a.raceLoad || 0) / 100 * 0.0022;
      // Heat is the dominant real-world DNF driver — dehydration and the body
      // shutting the effort down. Hits the deeply fatigued hardest.
      let heat = veryHot ? 0.020 : hot ? 0.008 : 0;
      heat *= 1 + Math.max(0, a.fatigue - 60) / 90;
      // A catastrophic bonk (finished the tank far in the red) can end a race
      // outright — the legs simply stop.
      let bonk = r.reserve < -24 ? Math.min(0.05, (-r.reserve - 24) * 0.0015) : 0;
      // Grit gets runners to the line: mental toughness scales the whole risk.
      const grit = 1.28 - (a.mentalToughness ?? 60) / 100 * 0.6;
      const pMishap = (mishap + heat) * grit;
      const pBonk = bonk * grit;
      if (rng.bool(Utils.clamp(pMishap, 0, 0.12))) {
        r.dnf = true; r.dnfReason = 'mishap';
      } else if (rng.bool(Utils.clamp(pBonk, 0, 0.10))) {
        r.dnf = true; r.dnfReason = 'bonk';
      }
    });
  }

  // In-race breakdowns for the runners who didn't finish (Update 19). A DNF
  // still costs the body: heavy fatigue, a morale and confidence hit, and —
  // for a physical mishap (a fall, a cramp, illness), not a pure energy bonk —
  // a real chance of a short injury that carries into the following weeks.
  function applyDNFEffects(gameState, meet, gender, dnfs, rng) {
    if (!dnfs || !dnfs.length) return;
    const Training = window.XCD.engine.Training;
    const key = distKey(meet.distances[gender]);
    const raceIntensity = (meet.type === 'national') ? 92
      : (meet.type === 'regional' || meet.type === 'conference') ? 84 : 62;
    dnfs.forEach((d) => {
      const a = gameState.world.athletes[d.athleteId];
      if (!a) return;
      const isPlayerSchool = a.schoolId === gameState.playerSchoolId;
      a.careerStats.races += 1; // they toed the line and started the race
      a.seasonRaces = (a.seasonRaces || 0) + 1;
      a.raceLog = a.raceLog || [];
      a.raceLog.unshift({ y: gameState.year, w: meet.week, m: meet.name, p: 'DNF', t: null, d: key, dnf: true });
      if (a.raceLog.length > 8) a.raceLog.length = 8;
      // Coming apart mid-race is exhausting and demoralizing.
      a.fatigue = Utils.clamp(a.fatigue + 10, 0, 100);
      a.raceLoad = Math.max(a.raceLoad || 0, raceIntensity);
      a.morale = Utils.clamp(a.morale - 5, 0, 100);
      // Coming apart mid-race leaves a real mental mark — worse on a big stage.
      const dnfStakes = meet.type === 'national' ? 1.6
        : (meet.type === 'regional' || meet.type === 'conference') ? 1.3 : 1.0;
      a.confidence = Utils.clamp((a.confidence ?? 60) - 3 * dnfStakes, 10, 99);
      a.mentalToughness = Utils.clamp((a.mentalToughness ?? 60) - 1.5 * dnfStakes, 10, 99);
      a.consistency = Utils.clamp((a.consistency ?? 60) - 1.5 * dnfStakes, 10, 99);
      // A physical mishap can leave a mark — a short layoff (illness/tweak).
      // Only the shorter injuries fit an in-race pull-up; nothing season-ending.
      if (d.reason === 'mishap' && rng.bool(0.5)) {
        const short = (D.INJURIES || []).filter((i) => (i.weeks[1] || 3) <= 4);
        const src = short.length ? short : D.INJURIES;
        const pick = src && src.length ? rng.weightedChoice(src, (i) => i.weight) : null;
        if (pick) {
          // Min 2 weeks: races run before the weekly training pass, which
          // decrements the fresh injury once, so a 1-week layoff would clear
          // the same week and cost no racing at all.
          const weeks = Math.max(2, rng.int(pick.weeks[0], Math.min(pick.weeks[1], 4)));
          const injury = { type: pick.type, weeksRemaining: weeks, totalWeeks: weeks, overuse: !!pick.overuse };
          a.injury = injury;
          a.health = 'Injured';
          a.injuryResistance = Utils.clamp((a.injuryResistance ?? 55) - 1, 10, 99); // parity with the training injury path
          if (Training && Training.recordCareerInjury) {
            Training.recordCareerInjury(gameState, a, injury, isPlayerSchool);
          }
          if (isPlayerSchool) {
            gameState.logNews(`🚑 DNF: ${a.fullName} pulls up at ${meet.name} (${injury.type}) — out ~${weeks} week${weeks === 1 ? '' : 's'}.`);
          }
        }
      } else if (isPlayerSchool) {
        gameState.logNews(`⚠️ DNF: ${a.fullName} fails to finish at ${meet.name}${d.reason === 'bonk' ? ' — the tank ran dry.' : '.'}`);
      }
    });
  }

  function median(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /*
   * Pack stats: how tightly a team's five scorers ran together. `gap` is the
   * 1–5 split (5th scorer's time minus the 1st's), `avg` the scorers' average
   * time, both in seconds (one decimal). Kept on every team score — small
   * enough to save for every meet, and it survives the trimmed finisher
   * lists stored for meets the player didn't run.
   */
  function packOf(top5) {
    if (top5.length < 5 || top5.some((f) => typeof f.time !== 'number')) return {};
    const avg = top5.reduce((s, f) => s + f.time, 0) / 5;
    return { gap: Math.round((top5[4].time - top5[0].time) * 10) / 10, avg: Math.round(avg * 10) / 10 };
  }

  // Pack stats for one team in a result, or null. Older saves have no
  // stored gap; their full (player-meet) finisher lists still give one.
  function packStats(res, schoolId) {
    if (!res) return null;
    const t = (res.teamScores || []).find((x) => x.schoolId === schoolId);
    if (t && typeof t.gap === 'number') return { gap: t.gap, avg: t.avg, place: t.place };
    const mine = (res.finishers || []).filter((f) => f.schoolId === schoolId).slice(0, 5);
    const p = packOf(mine);
    return typeof p.gap === 'number' ? Object.assign(p, { place: t ? t.place : null }) : null;
  }

  // The tightest five-runner pack in a race (lowest 1–5 gap).
  function tightestPack(res) {
    let best = null;
    (res && res.teamScores || []).forEach((t) => {
      if (typeof t.gap === 'number' && (!best || t.gap < best.gap)) best = t;
    });
    return best;
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
      return Object.assign({
        schoolId,
        points,
        scorers: top5.map((f) => f.scoringPlace),
        sixth: team[5] ? team[5].scoringPlace : Infinity,
        finishers: team.length
      }, packOf(top5));
    });

    teams.sort((a, b) => (a.points - b.points) || (a.sixth - b.sixth));
    teams.forEach((t, i) => { t.place = i + 1; });
    return teams;
  }

  // A pack gap for display: "18.4s" under a minute, "1:02.3" beyond.
  function formatGap(sec) {
    if (typeof sec !== 'number' || !Number.isFinite(sec)) return '—';
    return sec < 60 ? `${sec.toFixed(1)}s` : formatTime(sec);
  }

  function distKey(distanceM) { return `${distanceM / 1000}K`; }

  /*
   * True 1 km splits from a runner's stored race splits. The sim runs the
   * race in SEGMENTS equal-distance legs (an 8K's are 0.67 km, a 10K's
   * 0.83 km) at a steady pace within each leg, so the clock at every whole
   * kilometre is read off the leg that contains it. Returns
   *   [{ km, at, split }] — `at` the elapsed time at that mark, `split` the
   *   time for that kilometre. A distance that isn't a whole number of km
   *   ends with its short final leg (km = the full distance in km).
   */
  function kmSplits(cum, distanceM) {
    if (!Array.isArray(cum) || !cum.length || !distanceM) return [];
    const n = cum.length;
    const segM = distanceM / n;
    const timeAt = (m) => {
      if (m >= distanceM) return cum[n - 1];
      const pos = m / segM;
      const i = Math.floor(pos);
      const start = i === 0 ? 0 : cum[i - 1];
      return start + (cum[i] - start) * (pos - i);
    };
    const marks = [];
    for (let m = 1000; m < distanceM - 1e-6; m += 1000) marks.push(m);
    marks.push(distanceM);
    let prev = 0;
    return marks.map((m) => {
      const at = Math.round(timeAt(m) * 10) / 10;
      const out = { km: Math.round(m / 10) / 100, at, split: Math.round((at - prev) * 10) / 10 };
      prev = at;
      return out;
    });
  }

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

      // Race fatigue + morale swing. The course profile matters (Course
      // Hilliness System + Altitude Simulation): flat courses cost a little
      // less, hilly ones grind deeper, and racing in thin air taxes
      // everyone — except athletes whose program trains at altitude.
      let raceFatigue = 8;
      const cond = meet.conditions || {};
      if (cond.hilliness > 55) raceFatigue += Math.min(4, Math.round((cond.hilliness - 55) / 10));
      else if (cond.hilliness < 30) raceFatigue -= 1;
      if (cond.altitude === 'High' || cond.altitude === 'Medium') {
        const homeAlt = (gameState.getSchool(a.schoolId) || { weather: {} }).weather.altitude || 'Low';
        const adapted = homeAlt === 'High' || (homeAlt === 'Medium' && cond.altitude === 'Medium');
        raceFatigue += cond.altitude === 'High' ? (adapted ? 1 : 3) : (adapted ? 0 : 1);
      }
      a.fatigue = Utils.clamp(a.fatigue + raceFatigue, 0, 100);
      // Recent race intensity (Update 6, Phase 2): the pounding of a hard race
      // leaves the body vulnerable for a couple of weeks. Championship efforts
      // (conference/regional/national) take the biggest toll. Decays weekly in
      // the training engine and feeds the injury roll.
      const raceIntensity = (meet.type === 'national') ? 92
        : (meet.type === 'regional' || meet.type === 'conference') ? 84
        : 62;
      a.raceLoad = Math.max(a.raceLoad || 0, raceIntensity);
      if (f.place === 1) a.morale = Utils.clamp(a.morale + 5, 0, 100);
      else if (f.place <= 10) a.morale = Utils.clamp(a.morale + 2, 0, 100);
      else if (f.place > finishers.length * 0.8) a.morale = Utils.clamp(a.morale - 2, 0, 100);

      // Playing time is the strongest bond with a coach (Update 5, Part 7):
      // getting to toe the line for the program builds the relationship.
      a.coachRelationship = Utils.clamp((a.coachRelationship ?? 60) + 1.2, 10, 99);

      // Dynamic mental swings (Update 21): a runner's head moves with what
      // happens on the course, and the bigger the stage the bigger the mark it
      // leaves. Confidence, Mental Toughness, and Consistency all climb after
      // strong, gutsy races and fall after rough ones — so mental ratings live
      // and breathe across a career instead of sitting frozen. Championship
      // meets swing hardest; a personal best always lifts belief.
      const wasPR = !pr || f.time < pr;
      const field = finishers.length || 1;
      const frac = f.place / field; // 0 = winner, 1 = last
      const stakes = meet.type === 'national' ? 1.6
        : (meet.type === 'regional' || meet.type === 'conference') ? 1.3 : 1.0;
      let dConf = 0, dTough = 0, dCons = 0;
      if (f.place === 1) { dConf = 4; dTough = 2; dCons = 1; }
      else if (frac <= 0.10) { dConf = 2.2; dTough = 1.2; dCons = 0.6; }   // podium/front pack — held the pressure
      else if (frac <= 0.40) { dConf = 0.8; dTough = 0.3; dCons = 0.5; }   // a solid, reliable day
      else if (frac >= 0.90) { dConf = -3.5; dTough = -1.6; dCons = -1.6; } // a genuine blow-up
      else if (frac >= 0.70) { dConf = -2.0; dTough = -0.7; dCons = -1.0; } // an off day
      if (wasPR) { dConf += 1.6; dCons += 0.5; }                            // a lifetime best always lifts belief
      // Championship stakes amplify the swing in BOTH directions.
      dConf *= stakes; dTough *= stakes; dCons *= stakes;
      a.confidence = Utils.clamp((a.confidence ?? 60) + dConf, 10, 99);
      a.mentalToughness = Utils.clamp((a.mentalToughness ?? 60) + dTough, 10, 99);
      a.consistency = Utils.clamp((a.consistency ?? 60) + dCons, 10, 99);

      // Race experience nudges race IQ for young runners
      if (a.careerStats.races % 6 === 0 && a.raceIQ < 90) a.raceIQ += 1;

      // School records
      const school = gameState.getSchool(f.schoolId);
      if (school) {
        school.records = school.records || {};
        const rKey = `${gender}-${key}`;
        const rec = school.records[rKey];
        if (!rec || f.time < rec.time) {
          school.records[rKey] = { time: f.time, name: f.name, athleteId: f.athleteId, year: gameState.year };
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
        // The record book opens blank (user request): the first runner to race
        // a distance sets its inaugural mark with no NR badge, and only a
        // runner who then BEATS a standing mark is badged NR on the results
        // screen. Finishers are processed fastest-first, so only the genuine
        // new national-record holder is stamped.
        if (nrec) f.nr = 'NR';
        gameState.history.records[nKey] = {
          time: f.time, name: f.name, athleteId: f.athleteId,
          school: gameState.getSchool(f.schoolId)?.name || '?',
          schoolId: f.schoolId, year: gameState.year
        };
        if (nrec) gameState.logNews(`NATIONAL RECORD: ${f.name} (${gameState.getSchool(f.schoolId)?.name}) runs ${formatTime(f.time)} for ${key}!`);
      }
    });

    // Course records (Course Records system): every course keeps its own
    // men's/women's record. Compare the field against this course's standing
    // record — a break is a genuinely rare, notable accomplishment that stamps
    // the athlete's résumé, the school's history, the course history, and the
    // news feed, and marks the record-setting finisher (CR/NCR) in the results.
    if (window.XCD.engine.Courses) {
      try { window.XCD.engine.Courses.considerRace(gameState, meet, gender, finishers, distanceM); }
      catch (e) { /* course records must never break a race */ }
    }

    // Team morale for meet winners
    if (teamScores[0]) {
      const winners = gameState.getRoster(teamScores[0].schoolId, gender);
      winners.forEach((a) => { a.morale = Utils.clamp(a.morale + (isChampionship ? 4 : 2), 0, 100); });
    }

    // Dual-meet-style W/L ledger (Part 8/9): beating a team is a win,
    // losing to one is a loss — feeds program winning percentage and
    // coach career records.
    const Legacy = window.XCD.engine.Legacy;
    teamScores.forEach((t) => {
      const w = teamScores.length - t.place;
      const l = t.place - 1;
      const prog = Legacy.program(gameState, t.schoolId);
      prog.wins += w;
      prog.losses += l;
      const teamWin = t.place === 1 && teamScores.length >= 2;
      if (teamWin) prog.meetWins += 1;
      const coach = gameState.getCoach(gameState.getSchool(t.schoolId)?.coachId);
      if (coach) {
        coach.careerRecord.wins += w;
        coach.careerRecord.losses += l;
        // Team wins: meets (men's or women's race) the coach's team won outright.
        if (teamWin) coach.careerRecord.teamWins = (coach.careerRecord.teamWins || 0) + 1;
        // Per-school stint ledger (History & Legacy update, Phases 3/6/8):
        // the coach's record AT this school, tracked alongside the career.
        const st = (coach.stints || []).find((s) => !s.endYear && s.schoolId === t.schoolId);
        if (st) {
          st.wins = (st.wins || 0) + w;
          st.losses = (st.losses || 0) + l;
        }
      }
    });
  }

  /* ================================================================ *
   * Championships bookkeeping
   * ================================================================ */
  function recordConferenceChampions(gameState, meet, gender) {
    const res = meet.results[gender];
    if (!res || !res.teamScores.length) return;
    const Legacy = window.XCD.engine.Legacy;
    const champId = res.teamScores[0].schoolId;
    const school = gameState.getSchool(champId);
    school.historicalSuccess[gender === 'M' ? 'conferenceTitlesM' : 'conferenceTitlesW'] += 1;
    const confCoach = gameState.getCoach(school.coachId);
    if (confCoach) confCoach.careerRecord.conferenceTitles += 1;
    Legacy.program(gameState, champId).confTitles += 1;

    // Conference runner-up: a Program Statistics ledger line (Phase 7).
    if (res.teamScores[1]) {
      const ru = Legacy.program(gameState, res.teamScores[1].schoolId);
      ru.confRunnerUp = (ru.confRunnerUp || 0) + 1;
    }

    const H = gameState.history;
    H.conferenceChampions = H.conferenceChampions || {};
    H.conferenceChampions[gameState.year] = H.conferenceChampions[gameState.year] || {};
    H.conferenceChampions[gameState.year][`${meet.conference}-${gender}`] = school.name;

    // Championship History fix: every title entry permanently remembers the
    // coach responsible, so archives can show Season · Championship · Coach ·
    // Program forever. (The name-only ledger above stays for compatibility.)
    H.confChampMeta = H.confChampMeta || {};
    H.confChampMeta[gameState.year] = H.confChampMeta[gameState.year] || {};
    H.confChampMeta[gameState.year][`${meet.conference}-${gender}`] = {
      school: school.name, schoolId: champId,
      coach: confCoach ? confCoach.fullName : '', coachId: confCoach ? confCoach.id : null
    };

    // Individual conference champions persist with full identity (Update 12,
    // Phase 4) so program archives can list Year / Athlete / Coach forever.
    const confWinner = res.finishers[0];
    if (confWinner) {
      H.confIndivChampions = H.confIndivChampions || {};
      H.confIndivChampions[gameState.year] = H.confIndivChampions[gameState.year] || {};
      const ws = gameState.getSchool(confWinner.schoolId);
      H.confIndivChampions[gameState.year][`${meet.conference}-${gender}`] = {
        name: confWinner.name, athleteId: confWinner.athleteId,
        school: ws ? ws.name : '?', schoolId: confWinner.schoolId,
        coach: (gameState.getCoach(ws && ws.coachId) || {}).fullName || ''
      };
    }

    // Individual conference champion + All-Conference honors (division rules)
    const division = meet.division || 'DI';
    const allConfCount = D.divisionFor(division).championship.allConference;
    res.finishers.slice(0, allConfCount).forEach((f, idx) => {
      const a = gameState.world.athletes[f.athleteId];
      if (!a) return;
      Legacy.athleteHonor(gameState, a, 'allConference');
      // Full-context accolade: division + conference + year, never overwritten.
      Legacy.recordAccolade(a, { year: gameState.year, division, conference: meet.conference, type: 'allConference', label: 'First Team All-Conference' });
      Legacy.program(gameState, f.schoolId).allConference += 1;
      const acCoach = gameState.getCoach(gameState.getSchool(f.schoolId)?.coachId);
      if (acCoach) acCoach.careerRecord.allConference = (acCoach.careerRecord.allConference || 0) + 1;
      if (idx === 0) {
        Legacy.athleteHonor(gameState, a, 'confChamp');
        Legacy.recordAccolade(a, { year: gameState.year, division, conference: meet.conference, type: 'confChamp', label: 'Conference Champion' });
        a.honors.confChamp += 1;
        Legacy.program(gameState, f.schoolId).indivConfChamps += 1;
        const c = gameState.getCoach(gameState.getSchool(f.schoolId)?.coachId);
        if (c) c.careerRecord.indivConfChamps += 1;
      }
    });

    if (champId === gameState.playerSchoolId) {
      gameState.logNews(`🏆 CONFERENCE CHAMPIONS! Your ${gender === 'M' ? 'men' : 'women'} win the ${meet.conference} title!`);
    } else if (meet.conference === gameState.getPlayerSchool().conference) {
      gameState.logNews(`${school.name} wins the ${meet.conference} ${gender === 'M' ? "men's" : "women's"} title.`);
    }
  }

  function recordRegionalChampions(gameState, meet, gender) {
    const res = meet.results[gender];
    if (!res || !res.teamScores.length) return;
    const Legacy = window.XCD.engine.Legacy;
    const champId = res.teamScores[0].schoolId;
    const school = gameState.getSchool(champId);
    const coach = gameState.getCoach(school.coachId);
    if (coach) coach.careerRecord.regionalTitles = (coach.careerRecord.regionalTitles || 0) + 1;
    Legacy.program(gameState, champId).regionalTitles += 1;

    const H = gameState.history;
    H.regionalChampions = H.regionalChampions || {};
    H.regionalChampions[gameState.year] = H.regionalChampions[gameState.year] || {};
    H.regionalChampions[gameState.year][`${meet.region}-${gender}`] = school.name;

    // Championship History fix: regional titles remember their coach too.
    // Keyed with the division so same-named regions across DI/DII/DIII never
    // overwrite each other in the permanent record.
    H.regChampMeta = H.regChampMeta || {};
    H.regChampMeta[gameState.year] = H.regChampMeta[gameState.year] || {};
    H.regChampMeta[gameState.year][`${meet.division || 'DI'}:${meet.region}-${gender}`] = {
      school: school.name, schoolId: champId, division: meet.division || 'DI',
      region: meet.region, gender,
      coach: coach ? coach.fullName : '', coachId: coach ? coach.id : null
    };

    // Individual regional champion — a permanent honor (Update 12): stamped
    // on the athlete's ledger, the program ledger, and the history books.
    const regWinner = res.finishers[0];
    if (regWinner) {
      const a = gameState.world.athletes[regWinner.athleteId];
      const division = meet.division || 'DI';
      if (a) {
        Legacy.athleteHonor(gameState, a, 'regChamp');
        Legacy.recordAccolade(a, { year: gameState.year, division, conference: null, type: 'regChamp', label: `${meet.region} Regional Champion` });
      }
      const rprog = Legacy.program(gameState, regWinner.schoolId);
      rprog.indivRegChamps = (rprog.indivRegChamps || 0) + 1;
      H.regIndivChampions = H.regIndivChampions || {};
      H.regIndivChampions[gameState.year] = H.regIndivChampions[gameState.year] || {};
      const ws = gameState.getSchool(regWinner.schoolId);
      H.regIndivChampions[gameState.year][`${meet.region}-${gender}`] = {
        name: regWinner.name, athleteId: regWinner.athleteId,
        school: ws ? ws.name : '?', schoolId: regWinner.schoolId,
        coach: (gameState.getCoach(ws && ws.coachId) || {}).fullName || ''
      };
    }

    if (champId === gameState.playerSchoolId) {
      gameState.logNews(`🏆 REGIONAL CHAMPIONS! Your ${gender === 'M' ? 'men' : 'women'} win the ${meet.region} Regional!`);
    }
  }

  /*
   * Head-to-head team results for the Kolas at-large method: h2h[a][b] is
   * how many times team a placed ahead of team b in a team-scored race this
   * season before Nationals (invitationals, conference, regional), counting
   * only teams of one division.
   */
  function headToHead(gameState, division, gender) {
    const season = gameState.season;
    const h2h = {};
    const divOf = (sid) => ((gameState.getSchool(sid) || {}).division || 'DI');
    Object.values((season && season.meets) || {}).forEach((meet) => {
      if (!meet || meet.type === 'national' || meet.week >= NATIONAL_WEEK) return;
      const res = meet.results && meet.results[gender];
      if (!res || !res.teamScores) return;
      const ids = res.teamScores.filter((t) => divOf(t.schoolId) === division).map((t) => t.schoolId);
      for (let i = 0; i < ids.length; i++) {
        const row = h2h[ids[i]] || (h2h[ids[i]] = {});
        for (let j = i + 1; j < ids.length; j++) row[ids[j]] = (row[ids[j]] || 0) + 1;
      }
    });
    return h2h;
  }
  const wins = (h2h, a, b) => (h2h[a] && h2h[a][b]) || 0;
  function kolasCount(h2h, sid, fieldSet) {
    const row = h2h[sid];
    if (!row) return 0;
    let n = 0;
    fieldSet.forEach((b) => { if (b !== sid) n += row[b] || 0; });
    return n;
  }
  function lossCount(h2h, sid, fieldSet) {
    let n = 0;
    fieldSet.forEach((b) => { if (b !== sid) n += wins(h2h, b, sid); });
    return n;
  }

  /*
   * Kolas standing for one team (the Rankings → Selection board): wins and
   * losses against a field. With no field given, the projected field is the
   * division's current poll top-N (N = the nationals field size).
   *   → { points, losses, field: [ids], vs: [{ schoolId, w, l }] }
   */
  function kolasPoints(gameState, gender, schoolId, fieldIds) {
    const school = gameState.getSchool(schoolId);
    const division = (school && school.division) || 'DI';
    const size = (D.divisionFor(division).championship || {}).nationalsFieldSize || 31;
    const field = fieldIds || ((gameState.rankings && gameState.rankings[gender]) || [])
      .filter((r) => ((gameState.getSchool(r.schoolId) || {}).division || 'DI') === division)
      .slice(0, size).map((r) => r.schoolId);
    const h2h = headToHead(gameState, division, gender);
    const set = new Set(field);
    const vs = field.filter((b) => b !== schoolId)
      .map((b) => ({ schoolId: b, w: wins(h2h, schoolId, b), l: wins(h2h, b, schoolId) }))
      .filter((x) => x.w || x.l);
    return { points: kolasCount(h2h, schoolId, set), losses: lossCount(h2h, schoolId, set), field, vs };
  }

  /*
   * At-Large Watch board (Rankings → Selection, before the field is set):
   * the division's top `n` poll teams, each with Kolas points and losses
   * against the projected field (the poll's top N, N = field size).
   *   → { field: [ids], size, rows: [{ schoolId, rank, points, losses, inField }] }
   */
  function kolasBoard(gameState, gender, division, n) {
    const size = (D.divisionFor(division).championship || {}).nationalsFieldSize || 31;
    const poll = ((gameState.rankings && gameState.rankings[gender]) || [])
      .filter((r) => ((gameState.getSchool(r.schoolId) || {}).division || 'DI') === division);
    const field = poll.slice(0, size).map((r) => r.schoolId);
    const set = new Set(field);
    const h2h = headToHead(gameState, division, gender);
    const rows = poll.slice(0, n || 50).map((r) => ({
      schoolId: r.schoolId, rank: r.rank,
      points: kolasCount(h2h, r.schoolId, set), losses: lossCount(h2h, r.schoolId, set),
      inField: set.has(r.schoolId)
    }));
    return { field, size, rows };
  }

  function buildNationalsField(gameState) {
    // Per division (Part 13): auto qualifiers per regional + at-larges fill
    // the field to the division's size; the division's top regional
    // finishers not on qualifying teams advance as individuals.
    const season = gameState.season;
    const rankings = gameState.rankings || {};
    const playerDivision = (gameState.getPlayerSchool() && gameState.getPlayerSchool().division) || 'DI';

    Object.entries(season.championships || {}).forEach(([division, champ]) => {
      const rules = D.divisionFor(division).championship;
      const regionalMeets = (season.byWeek[REGIONAL_WEEK] || [])
        .map((id) => season.meets[id])
        .filter((m) => m && (m.division || 'DI') === division);

      ['M', 'W'].forEach((gender) => {
        // Automatic qualifiers: the top N teams from every regional (real NCAA
        // structure — top 2 per region in all three divisions).
        const auto = [];
        const regionalPlace = {};
        regionalMeets.forEach((meet) => {
          const res = meet.results[gender];
          if (!res) return;
          res.teamScores.slice(0, rules.autoQualifiersPerRegional).forEach((t) => auto.push(t.schoolId));
          res.teamScores.forEach((t) => { regionalPlace[t.schoolId] = t.place; });
        });
        const autoSet = new Set(auto);

        // At-large selections — the real NCAA Kolas method. Bids go one at a
        // time. The candidates are the highest-finishing non-qualified team
        // from EACH regional (so no team is picked ahead of a team that beat
        // it at its own regional). Each candidate's Kolas points are its
        // head-to-head wins this season (invitationals, conference, regional)
        // over teams ALREADY in the field. The most points earns the bid; the
        // field grows, points are recounted, and the next region's team steps
        // up — until the field is full. Ties: head-to-head, then the regional
        // finish, then the poll.
        const rankIndex = {};
        (rankings[gender] || []).forEach((r) => {
          if (((gameState.getSchool(r.schoolId) || {}).division || 'DI') === division) {
            rankIndex[r.schoolId] = r.rank || 999;
          }
        });
        const ranked = (rankings[gender] || [])
          .filter((r) => ((gameState.getSchool(r.schoolId) || {}).division || 'DI') === division)
          .map((r) => r.schoolId);
        const h2h = headToHead(gameState, division, gender);
        const regionQueues = regionalMeets.map((meet) => {
          const res = meet.results[gender];
          return {
            region: meet.region,
            allIds: res ? res.teamScores.map((t) => t.schoolId) : [],
            ids: res ? res.teamScores.map((t) => t.schoolId).filter((sid) => !autoSet.has(sid)) : []
          };
        });
        const field = [...auto];
        const fieldSet0 = new Set(field);
        const atLargePicks = [];
        let bubble = [];
        while (field.length < rules.nationalsFieldSize) {
          const cands = regionQueues
            .map((q) => {
              const sid = q.ids.find((id) => !fieldSet0.has(id));
              return sid ? { sid, region: q.region } : null;
            })
            .filter(Boolean)
            .map((c) => Object.assign(c, {
              points: kolasCount(h2h, c.sid, fieldSet0),
              losses: lossCount(h2h, c.sid, fieldSet0),
              regionalPlace: regionalPlace[c.sid] || 99,
              poll: rankIndex[c.sid] || 999
            }));
          if (!cands.length) break;
          cands.sort((x, y) => (y.points - x.points) ||
            (wins(h2h, y.sid, x.sid) - wins(h2h, x.sid, y.sid)) ||
            (x.regionalPlace - y.regionalPlace) || (x.poll - y.poll));
          const pick = cands[0];
          atLargePicks.push({ schoolId: pick.sid, region: pick.region, points: pick.points, losses: pick.losses, regionalPlace: pick.regionalPlace, pick: atLargePicks.length + 1 });
          field.push(pick.sid);
          fieldSet0.add(pick.sid);
          bubble = cands.slice(1);
        }
        // "First teams out": the candidates still on the board when the last
        // bid went, re-counted against the final field.
        bubble = bubble.map((c) => ({ schoolId: c.sid, region: c.region, points: kolasCount(h2h, c.sid, fieldSet0), losses: lossCount(h2h, c.sid, fieldSet0), regionalPlace: c.regionalPlace }))
          .sort((x, y) => (y.points - x.points) || (x.regionalPlace - y.regionalPlace));
        champ.selection = champ.selection || {};
        champ.selection[gender] = {
          method: 'kolas',
          auto: auto.map((sid) => ({ schoolId: sid, region: (regionQueues.find((q) => q.allIds.includes(sid)) || {}).region || null, regionalPlace: regionalPlace[sid] || null, points: kolasCount(h2h, sid, fieldSet0) })),
          atLarge: atLargePicks,
          firstOut: bubble.slice(0, 6)
        };
        // Safety top-off (tiny/custom divisions): fill any remainder from poll.
        for (const sid of ranked) {
          if (field.length >= rules.nationalsFieldSize) break;
          if (!field.includes(sid)) field.push(sid);
        }
        champ.fieldIds[gender] = field;
        const fieldSet = new Set(field);

        // Mark the regional results (Update 20) so the standings show who
        // punched a ticket to Nationals: a team qualifies automatically (top N
        // in its region) or on an at-large bid, and the top regional finishers
        // not on a qualifying team advance as individuals. These flags are what
        // the Race Center / history screens read to badge qualifiers.
        //
        // Individual qualifiers: every top-N (10) finisher at a regional goes
        // to Nationals — with their team when it made the field, otherwise as
        // an individual. Then the committee adds national at-large
        // individuals: the best regional placers from non-qualifying teams
        // just outside that cut, compared across regions by place and then by
        // margin behind their regional winner.
        const individuals = [];
        const individualSet = new Set();
        const topN = rules.individualAutoTopN || 10;
        const indivAuto = [];
        const leftovers = [];
        regionalMeets.forEach((meet) => {
          const res = meet.results[gender];
          if (!res) return;
          res.teamScores.forEach((t) => {
            t.nationalsBid = autoSet.has(t.schoolId) ? 'auto'
              : fieldSet.has(t.schoolId) ? 'atlarge' : null;
          });
          const winTime = res.finishers[0] ? res.finishers[0].time : null;
          res.finishers.forEach((f) => {
            if (fieldSet.has(f.schoolId) || individualSet.has(f.athleteId)) return;
            if (f.place <= topN) {
              individuals.push(f.athleteId);
              individualSet.add(f.athleteId);
              indivAuto.push({ athleteId: f.athleteId, schoolId: f.schoolId, place: f.place, region: meet.region });
            } else {
              leftovers.push({
                athleteId: f.athleteId, schoolId: f.schoolId, place: f.place, region: meet.region,
                behind: winTime ? (f.time - winTime) / winTime : 1
              });
            }
          });
        });
        leftovers.sort((a, b) => (a.place - b.place) || (a.behind - b.behind));
        const indivAtLarge = [];
        for (const c of leftovers) {
          if (indivAtLarge.length >= (rules.individualAtLarge || 0)) break;
          if (individualSet.has(c.athleteId)) continue;
          individuals.push(c.athleteId);
          individualSet.add(c.athleteId);
          indivAtLarge.push({ athleteId: c.athleteId, schoolId: c.schoolId, place: c.place, region: c.region });
        }
        const atLargeIndivSet = new Set(indivAtLarge.map((x) => x.athleteId));
        // Flag every finisher belonging to a qualifying team or an individual
        // qualifier, so the results can mark both cleanly.
        regionalMeets.forEach((meet) => {
          const res = meet.results[gender];
          if (!res) return;
          res.finishers.forEach((f) => {
            f.nationalsTeamQualifier = fieldSet.has(f.schoolId);
            f.nationalsIndividual = individualSet.has(f.athleteId);
            f.nationalsIndividualAtLarge = atLargeIndivSet.has(f.athleteId);
          });
        });
        champ.individualQualifiers[gender] = individuals;
        if (champ.selection && champ.selection[gender]) {
          champ.selection[gender].individuals = { auto: indivAuto, atLarge: indivAtLarge, cutoff: topN, perRegional: null };
        }

        if (division === playerDivision) {
          // Mirror onto the season-level view the UI reads.
          season.nationalsFieldIds[gender] = field;
          season.individualQualifiers[gender] = individuals;

          // At-large bids (Update 20): the selection committee's picks — teams
          // that made the field without an automatic qualifying spot — are
          // reported in the news, so the whole bracket picture is visible.
          const atLargeNames = field
            .filter((sid) => !autoSet.has(sid))
            .map((sid) => (gameState.getSchool(sid) || {}).name)
            .filter(Boolean);
          if (atLargeNames.length) {
            const glabel = gender === 'M' ? "men's" : "women's";
            const shown = atLargeNames.slice(0, 8).join(', ');
            const extra = atLargeNames.length > 8 ? `, and ${atLargeNames.length - 8} more` : '';
            gameState.logNews(`🎟️ AT-LARGE BIDS (${glabel}): ${shown}${extra} earn tickets to the NCAA Championships on Kolas points — head-to-head wins over teams already in the field.`);
          }

          if (field.includes(gameState.playerSchoolId)) {
            const wasAuto = auto.includes(gameState.playerSchoolId);
            const myPick = atLargePicks.find((p) => p.schoolId === gameState.playerSchoolId);
            gameState.logNews(`Your ${gender === 'M' ? 'men' : 'women'} are headed to the NCAA Championships${wasAuto ? ' as automatic qualifiers' : ` with an at-large bid${myPick ? ` (${myPick.points} Kolas point${myPick.points === 1 ? '' : 's'}, pick #${myPick.pick})` : ''}`}!`);
          } else {
            const mine = individuals
              .map((id) => gameState.world.athletes[id])
              .filter((a) => a && a.schoolId === gameState.playerSchoolId);
            if (mine.length) {
              gameState.logNews(`${mine.map((a) => a.fullName).join(' and ')} punch${mine.length === 1 ? 'es' : ''} an individual ticket to the NCAA Championships${mine.some((a) => atLargeIndivSet.has(a.id)) ? ' (a national at-large individual pick)' : ` (a top-${topN} regional finish)`}!`);
            }
          }
        }

        // NCAA appearances into the permanent program ledger (Part 8).
        const Legacy = window.XCD.engine.Legacy;
        field.forEach((sid) => {
          const prog = Legacy.program(gameState, sid);
          prog.ncaaAppearances += 1;
          if (prog.ncaaAppearances === 1) {
            Legacy.recordProgramMilestone(gameState, sid, 'First NCAA Championships appearance.');
          }
          const c = gameState.getCoach(gameState.getSchool(sid)?.coachId);
          if (c) {
            c.careerRecord.nationalsAppearances += 1;
            const st = (c.stints || []).find((s) => !s.endYear && s.schoolId === sid);
            if (st) st.ncaaApps = (st.ncaaApps || 0) + 1;
          }
        });
        // Individual NCAA qualifiers stamp the program statistics ledger.
        individuals.forEach((athId) => {
          const a = gameState.world.athletes[athId];
          if (a && a.schoolId) {
            const p = Legacy.program(gameState, a.schoolId);
            p.indivNcaaQualifiers = (p.indivNcaaQualifiers || 0) + 1;
          }
        });
      });
    });
  }

  function recordNationalChampions(gameState, meet, gender) {
    const res = meet.results[gender];
    if (!res || !res.teamScores.length) return;
    const Legacy = window.XCD.engine.Legacy;
    const division = meet.division || 'DI';
    const champId = res.teamScores[0].schoolId;
    const school = gameState.getSchool(champId);
    school.historicalSuccess[gender === 'M' ? 'nationalTitlesM' : 'nationalTitlesW'] += 1;
    const natCoach = gameState.getCoach(school.coachId);
    if (natCoach) natCoach.careerRecord.nationalTitles += 1;
    Legacy.program(gameState, champId).natTitles += 1;

    // Podiums + best finish into the permanent program ledger (Part 8),
    // plus top-5 / top-10 nationals finishes for Program Statistics (Phase 7).
    res.teamScores.forEach((t) => {
      const prog = Legacy.program(gameState, t.schoolId);
      if (t.place <= 4) prog.podiums += 1;
      if (t.place <= 5) prog.top5Finishes = (prog.top5Finishes || 0) + 1;
      if (t.place <= 10) prog.top10Finishes = (prog.top10Finishes || 0) + 1;
      if (!prog.bestFinish || t.place < prog.bestFinish) prog.bestFinish = t.place;
    });

    // Team national title → a permanent accolade for every scoring runner
    // on the winning squad (the top 7 who toed the line for the title).
    const champScorers = res.finishers
      .filter((f) => f.schoolId === champId)
      .slice(0, 7);
    champScorers.forEach((f) => {
      const a = gameState.world.athletes[f.athleteId];
      if (a) Legacy.recordAccolade(a, { year: gameState.year, division, conference: null, type: 'natChampTeam', label: 'Team National Champion' });
    });

    const indiv = res.finishers[0];
    if (indiv) {
      const a = gameState.world.athletes[indiv.athleteId];
      if (a) {
        Legacy.athleteHonor(gameState, a, 'natChamp');
        Legacy.recordAccolade(a, { year: gameState.year, division, conference: null, type: 'natChampIndiv', label: 'Individual National Champion' });
      }
      Legacy.program(gameState, indiv.schoolId).indivNatChamps += 1;
      const c = gameState.getCoach(gameState.getSchool(indiv.schoolId)?.coachId);
      if (c) c.careerRecord.indivNatChamps += 1;
    }

    // National runner-up — team and individual (Update 12, Phase 1): the
    // silver medal is a career-defining line that GOAT scoring weighs heavily.
    const ruTeam = res.teamScores[1];
    if (ruTeam) {
      const ruProg = Legacy.program(gameState, ruTeam.schoolId);
      ruProg.natRunnerUp = (ruProg.natRunnerUp || 0) + 1;
      const ruCoach = gameState.getCoach(gameState.getSchool(ruTeam.schoolId)?.coachId);
      if (ruCoach) ruCoach.careerRecord.natRunnerUp = (ruCoach.careerRecord.natRunnerUp || 0) + 1;
    }
    const ruIndiv = res.finishers[1];
    if (ruIndiv) {
      const a2 = gameState.world.athletes[ruIndiv.athleteId];
      if (a2) {
        Legacy.athleteHonor(gameState, a2, 'natRunnerUp');
        Legacy.recordAccolade(a2, { year: gameState.year, division, conference: null, type: 'natRunnerUp', label: 'Individual National Runner-Up' });
      }
    }

    // History keys are division-aware: DI keeps the legacy 'M'/'W' keys so
    // old saves and UI keep working; other divisions get prefixed keys.
    const H = gameState.history;
    H.nationalChampions = H.nationalChampions || {};
    H.nationalChampions[gameState.year] = H.nationalChampions[gameState.year] || {};
    const key = division === 'DI' ? gender : `${division}-${gender}`;
    const indivCoach = indiv && gameState.getCoach(gameState.getSchool(indiv.schoolId)?.coachId);
    H.nationalChampions[gameState.year][key] = {
      team: school.name,
      teamId: champId,
      division,
      conference: school.conference,
      // Championship History fix: the coaches responsible ride with the entry.
      coach: natCoach ? natCoach.fullName : '',
      coachId: natCoach ? natCoach.id : null,
      individual: indiv ? indiv.name : '?',
      individualId: indiv ? indiv.athleteId : null,
      individualSchool: indiv ? (gameState.getSchool(indiv.schoolId)?.name || '?') : '?',
      individualSchoolId: indiv ? indiv.schoolId : null,
      individualCoach: indivCoach ? indivCoach.fullName : '',
      individualTime: indiv ? indiv.time : 0
    };

    // Greatest-Team snapshot (Update 12, Phase 1): a permanent record of every
    // national-championship team, stamped with the measures that separate a
    // good champion from a legendary one — team rating, race performance,
    // margin of victory, team score, and strength of the field it beat.
    const champScore = res.teamScores[0];
    const runnerUp = res.teamScores[1] || null;
    const scoringFive = champScorers.slice(0, 5);
    const teamOverall = scoringFive.length
      ? Math.round(Utils.average(scoringFive.map((f) => (gameState.world.athletes[f.athleteId] || {}).currentOverall || 0)))
      : 0;
    const avgScoringPlace = scoringFive.length
      ? Utils.average(scoringFive.map((f) => f.place)) : 0;
    // Performance = how the scoring five actually raced (lower places = higher).
    const teamPerformance = Utils.clamp(Math.round(108 - avgScoringPlace * 1.1), 30, 99);
    // Strength of schedule ≈ the average prestige of the field they beat.
    const fieldPrestiges = res.teamScores
      .map((t) => (gameState.getSchool(t.schoolId) || {}).prestige)
      .filter((p) => typeof p === 'number');
    const sos = fieldPrestiges.length ? Math.round(Utils.average(fieldPrestiges)) : 50;
    H.championTeams = H.championTeams || [];
    H.championTeams.push({
      year: gameState.year,
      division,
      gender,
      schoolId: champId,
      school: school.name,
      conference: school.conference,
      coachId: school.coachId || null,
      coachName: natCoach ? natCoach.fullName : '',
      teamScore: champScore ? champScore.points : null,
      margin: runnerUp && champScore ? runnerUp.points - champScore.points : null,
      teamOverall,
      teamPerformance,
      sos,
      fieldSize: res.teamScores.length,
      individual: indiv ? indiv.name : '',
      individualId: indiv ? indiv.athleteId : null,
      // Historical championship roster (History & Legacy update, Phase 10):
      // the seven who toed the line, snapshotted AS THEY WERE that season —
      // class year, rating, finishing place and time, and All-America
      // honors — permanently preserved so legendary teams can be relived.
      roster: champScorers.map((f) => {
        const a = gameState.world.athletes[f.athleteId];
        const aaWindow = ((window.XCD.data.divisionFor(division) || {}).championship || {}).allAmericans || 40;
        return {
          name: f.name, athleteId: f.athleteId, place: f.place,
          time: f.time || null,
          classYear: a ? a.classYear : (f.classYear || null),
          overall: a ? a.currentOverall : null,
          seasonWins: a ? (a.careerStats || {}).wins : null,
          allAmerican: f.place <= aaWindow
        };
      }),
      // Did the champions also win their conference that season?
      wonConference: (() => {
        const conf = (H.conferenceChampions || {})[gameState.year] || {};
        return conf[`${school.conference}-${gender}`] === school.name;
      })()
    });

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
           season.nationalsFieldIds.W?.includes(gameState.playerSchoolId) ||
           ['M', 'W'].some((g) => (season.individualQualifiers?.[g] || [])
             .some((id) => gameState.world.athletes[id]?.schoolId === gameState.playerSchoolId))));
      const detailed = isPlayerMeet || meet.type === 'national';

      ['M', 'W'].forEach((gender) => {
        if (meet.type === 'national') {
          // Each division races its own nationals field (Part 13).
          const champ = (season.championships || {})[meet.division || 'DI'] ||
            { fieldIds: season.nationalsFieldIds, individualQualifiers: season.individualQualifiers };
          meet.fieldByGender = meet.fieldByGender || {};
          meet.fieldByGender[gender] = champ.fieldIds[gender] || [];
          // Individually-qualified runners toe the line too.
          meet.individualEntries = champ.individualQualifiers || { M: [], W: [] };
          const saved = meet.schoolIds;
          meet.schoolIds = meet.fieldByGender[gender];
          meet.results[gender] = simulateRace(gameState, meet, gender, rng, detailed);
          meet.schoolIds = saved.length ? saved : meet.fieldByGender[gender];
        } else {
          meet.results[gender] = simulateRace(gameState, meet, gender, rng, detailed);
        }

        if (meet.type === 'conference') recordConferenceChampions(gameState, meet, gender);
        if (meet.type === 'regional') recordRegionalChampions(gameState, meet, gender);
        if (meet.type === 'national') recordNationalChampions(gameState, meet, gender);

        // Team morale responds to result-vs-expectation (Update 3).
        if (window.XCD.engine.Morale) window.XCD.engine.Morale.afterMeet(gameState, meet, gender);
      });

      // Pre-Nationals media coverage (Update 3): previews already ran; this
      // is the post-race national storyline that shapes the championship
      // narrative — winners, statement performances, and title predictions.
      if (meet.preNationals) {
        ['M', 'W'].forEach((gender) => {
          const res = meet.results[gender];
          if (!res || !res.teamScores.length) return;
          const label = gender === 'M' ? "men's" : "women's";
          const winner = gameState.getSchool(res.teamScores[0].schoolId);
          const runnerUp = res.teamScores[1] && gameState.getSchool(res.teamScores[1].schoolId);
          const champ = res.finishers[0];
          gameState.logNews(`📰 PRE-NATIONALS (${label}): ${winner.name} makes a statement on the Championship course${runnerUp ? `, edging ${runnerUp.name}` : ''}. ${champ ? `${champ.name} wins the individual title.` : ''} A genuine NCAA title contender emerges.`);
          if (res.teamScores.find((t) => t.schoolId === gameState.playerSchoolId && t.place <= 5)) {
            gameState.logNews(`🌟 Your ${label} squad's strong Pre-Nationals run vaults you up the national rankings and onto every title-contender list.`);
          }
        });
      }

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

  function nationalsFieldsReady(season) {
    const champs = Object.values(season.championships || {});
    if (!champs.length) return !!(season.nationalsFieldIds.M && season.nationalsFieldIds.M.length);
    return champs.every((c) => c.fieldIds.M && c.fieldIds.M.length);
  }

  function buildNationalsFieldIfNeeded(gameState) {
    if (!nationalsFieldsReady(gameState.season)) buildNationalsField(gameState);
  }

  // Nationals fields are built as soon as every regional has results.
  // Selection day for the player (Inbox / sim report): how each squad got in
  // — automatic, at-large (with its Kolas points), individuals only, or out.
  function announceSelection(gameState) {
    const Events = window.XCD.engine.Events;
    const season = gameState.season;
    const school = gameState.getPlayerSchool();
    if (!Events || !season || !school) return;
    const champ = season.championships[school.division || 'DI'];
    if (!champ || !champ.selection) return;
    const status = {};
    ['M', 'W'].forEach((g) => {
      const sel = champ.selection[g];
      if (!sel) { status[g] = null; return; }
      const sid = gameState.playerSchoolId;
      const al = sel.atLarge.find((p) => p.schoolId === sid);
      const out = sel.firstOut.find((p) => p.schoolId === sid);
      const indiv = (champ.individualQualifiers[g] || []).filter((id) => (gameState.world.athletes[id] || {}).schoolId === sid).length;
      status[g] = sel.auto.some((p) => p.schoolId === sid) ? { bid: 'auto' }
        : al ? { bid: 'atlarge', points: al.points, pick: al.pick }
        : { bid: null, points: out ? out.points : null, bubble: !!out, individuals: indiv };
    });
    Events.emit(gameState, 'nationals:selection', { M: status.M, W: status.W });
  }

  function postWeekHousekeeping(gameState) {
    if (gameState.week === REGIONAL_WEEK + 1 || gameState.week === REGIONAL_WEEK) {
      const season = gameState.season;
      if (season && !nationalsFieldsReady(season)) {
        const regionalsDone = (season.byWeek[REGIONAL_WEEK] || [])
          .every((id) => season.meets[id] && season.meets[id].results.M);
        if (regionalsDone) {
          buildNationalsField(gameState);
          announceSelection(gameState);
        }
      }
    }
  }

  window.XCD.engine.Races = {
    newSeason,
    processWeek,
    postWeekHousekeeping,
    simulateRace,
    scoreRace,
    packStats,
    tightestPack,
    formatGap,
    kolasPoints,
    kolasBoard,
    raceRating,
    conditionsMultiplier,
    formatTime,
    kmSplits,
    distKey,
    isRaceWeek,
    racedPreNationals,
    RACE_WEEKS,
    CONFERENCE_WEEK,
    REGIONAL_WEEK,
    NATIONAL_WEEK,
    SEGMENTS
  };
})();
