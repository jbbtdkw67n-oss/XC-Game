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
   * The season — Update 2 (Part 5):
   *   Wk 1-3 Summer Training (no racing) · Wk 4/6/8/10/12 meets with one
   *   bye week between each · Wk 13 Conference · Wk 14 Regionals ·
   *   Wk 15 Nationals (no byes between championship rounds) ·
   *   Wk 16-21 Offseason.
   *
   * Prestigious invitationals (Part 7): on weeks 6/8/10 the elite fields
   * split into named meets (Nuttycombe, Pre-Nationals, Joe Piane, Roy
   * Griak, Wisconsin) that carry extra poll weight; everyone else runs
   * regional invitationals. Weeks 4 and 12 are open invitationals.
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

    // Groups a set of schools into ~20-team invitationals for one week.
    function scheduleInvitationals(week, ids, regionalize) {
      season.byWeek[week] = season.byWeek[week] || [];
      const buildGroup = (group) => {
        if (!group.length) return;
        const host = gameState.getSchool(group[0]);
        // Custom League (Update 13): if the dynasty supplied its own meet
        // names, invitationals draw from that pool; otherwise the host names it.
        const custom = window.XCD.data.customMeetName(season._inviteSeq = (season._inviteSeq || 0) + 1);
        const meet = buildMeet(gameState, rng, {
          week,
          name: custom || `${host.name} Invitational`,
          hostId: host.id,
          schoolIds: group,
          type: 'invite'
        });
        season.meets[meet.id] = meet;
        season.byWeek[week].push(meet.id);
        if (group.includes(gameState.playerSchoolId)) season.playerMeetByWeek[week] = meet.id;
      };

      if (regionalize) {
        // Smaller schools race close to home (Part 7): group by region.
        const byRegion = {};
        ids.forEach((id) => {
          const s = gameState.getSchool(id);
          (byRegion[s.region] = byRegion[s.region] || []).push(id);
        });
        Object.values(byRegion).forEach((regionIds) => {
          const shuffled = rng.shuffle(regionIds);
          const meetCount = Math.max(1, Math.ceil(shuffled.length / 20));
          for (let i = 0; i < meetCount; i++) {
            buildGroup(shuffled.filter((_, idx) => idx % meetCount === i));
          }
        });
        return;
      }

      const shuffled = rng.shuffle(ids);
      const meetCount = Math.max(1, Math.ceil(shuffled.length / 20));
      for (let i = 0; i < meetCount; i++) {
        buildGroup(shuffled.filter((_, idx) => idx % meetCount === i));
      }
    }

    // --- Regular season ---------------------------------------------
    const eliteByWeek = {};
    (D.ELITE_MEETS || []).forEach((m) => {
      (eliteByWeek[m.week] = eliteByWeek[m.week] || []).push(m);
    });

    RACE_WEEKS.forEach((week) => {
      const eliteMeets = eliteByWeek[week];
      if (!eliteMeets || !eliteMeets.length) {
        // Open weekends (season opener, last-chance): everyone mixes.
        scheduleInvitationals(week, schoolIds);
        return;
      }

      // Elite weekends (Invitational Balancing): invitations go out on MERIT
      // — prestige blended with the current poll, so a rapidly improving
      // top-25-caliber program earns elite invites well before its prestige
      // catches up — and the invite pool is DEALT across the weekend's named
      // meets instead of piling every contender into one field. The biggest
      // meets (highest weight) still draw a larger share of the headliners,
      // so Nuttycombe occasionally lands nearly every national contender —
      // but most weekends produce several genuinely competitive meets.
      const prevRank = {};
      if (gameState.rankings) {
        ['M', 'W'].forEach((g) => (gameState.rankings[g] || []).forEach((r) => {
          prevRank[r.schoolId] = Math.min(prevRank[r.schoolId] || 999, r.rank);
        }));
      }
      const meritOf = (s) => s.prestige + (prevRank[s.id] && prevRank[s.id] <= 40
        ? (40 - prevRank[s.id]) * 0.9 : 0);
      const byMerit = schoolIds
        .map((id) => gameState.getSchool(id))
        .sort((a, b) => meritOf(b) - meritOf(a));
      season.byWeek[week] = season.byWeek[week] || [];
      const invited = new Set();

      // Pre-Nationals is built specially (DI-only, nationals course,
      // invite/decline) before the generic elite fields on the same week.
      eliteMeets.filter((em) => em.preNationals).forEach((em) => {
        buildPreNationals(gameState, rng, week, season, diCourse, invited);
      });

      const weekElite = eliteMeets.filter((em) => !em.preNationals);
      if (weekElite.length) {
        // ~15% of each elite field stays open for lottery invites from
        // further down the ladder.
        const lotterySlots = weekElite.map((em) => Math.round(em.size * 0.15));
        const fields = weekElite.map(() => []);
        const meritTotal = weekElite.reduce((s, em, i) => s + em.size - lotterySlots[i], 0);
        let cursor = 0;
        let placedCount = 0;
        while (placedCount < meritTotal && cursor < byMerit.length) {
          const s = byMerit[cursor++];
          if (invited.has(s.id)) continue;
          const open = weekElite
            .map((em, i) => ({ i, cap: em.size - lotterySlots[i] - fields[i].length, w: em.weight || 1 }))
            .filter((o) => o.cap > 0);
          if (!open.length) break;
          // Bigger meets pull harder for each contender, without a monopoly.
          const pick = open.length === 1 ? open[0]
            : rng.weightedChoice(open, (o) => Math.pow(o.w, 4) * Math.min(o.cap, 6));
          fields[pick.i].push(s.id);
          invited.add(s.id);
          placedCount++;
        }
        const pool = byMerit.filter((s) => !invited.has(s.id));
        weekElite.forEach((em, i) => {
          for (let j = 0; j < lotterySlots[i] && pool.length; j++) {
            const lotto = pool.splice(rng.int(0, Math.min(pool.length - 1, 60)), 1)[0];
            fields[i].push(lotto.id); invited.add(lotto.id);
          }
          if (!fields[i].length) return;
          const host = gameState.getSchool(fields[i][0]);
          const meet = buildMeet(gameState, rng, {
            week,
            name: em.name,
            hostId: host.id,
            schoolIds: fields[i],
            type: 'invite',
            elite: em.weight, // extra poll credit for elite fields
            courseMeta: em    // the famous course's real profile
          });
          season.meets[meet.id] = meet;
          season.byWeek[week].push(meet.id);
          if (fields[i].includes(gameState.playerSchoolId)) season.playerMeetByWeek[week] = meet.id;
        });
      }

      // Everyone not invited runs a regional invitational that weekend.
      scheduleInvitationals(week, schoolIds.filter((id) => !invited.has(id)), true);
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

  /*
   * Pre-Nationals Invitational (Update 3): a Division I-only elite meet on
   * the NCAA DI Championship course. Invitations go to last year's top
   * programs, national powers by prestige, the host, and a few rising
   * mid-majors — never every DI school. Coaches accept or decline by
   * philosophy; racing it earns a small familiarity edge at Nationals.
   */
  function buildPreNationals(gameState, rng, week, season, diCourse, invitedSet) {
    const cfg = D.PRE_NATIONALS;
    const diIds = gameState.world.schoolOrder.filter((id) => (gameState.getSchool(id).division || 'DI') === 'DI');
    if (!diIds.length) return;

    // Standing that earns an invite: last year's poll (defending qualifiers /
    // top-25) blended with prestige (traditional powers). First season has no
    // prior poll, so prestige carries it.
    const prevRank = {};
    if (gameState.rankings) {
      ['M', 'W'].forEach((g) => (gameState.rankings[g] || []).forEach((r) => {
        if ((gameState.getSchool(r.schoolId) || {}).division === 'DI') {
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
    const invited = [];
    const seen = new Set();
    // Host always gets a spot.
    if (host) { invited.push(host.id); seen.add(host.id); }
    for (const id of ranked) {
      if (invited.length >= meritSlots) break;
      if (!seen.has(id)) { invited.push(id); seen.add(id); }
    }
    // At-large: rising mid-majors having exceptional seasons (mid prestige,
    // decent recent poll) sneak onto the list.
    const atLargePool = ranked.filter((id) => !seen.has(id) && gameState.getSchool(id).prestige >= 45);
    for (let i = 0; i < cfg.atLargeSlots && atLargePool.length; i++) {
      const pick = atLargePool.splice(rng.int(0, Math.min(atLargePool.length - 1, 40)), 1)[0];
      invited.push(pick); seen.add(pick);
    }

    // Accept / decline by coaching philosophy. Contenders and aggressive
    // coaches race; development-minded and conservative staffs may rest.
    const accepted = [];
    const declined = [];
    invited.forEach((id) => {
      invitedSet.add(id);
      if (id === gameState.playerSchoolId) { accepted.push(id); return; } // player defaults in; can decline in UI
      const s = gameState.getSchool(id);
      const coach = gameState.getCoach(s.coachId);
      const rank = prevRank[id] || 999;
      let accept = 0.82;
      if (coach) {
        if (coach.archetype === 'Developer') accept -= 0.30;
        if (coach.hasTendency && coach.hasTendency('conservative')) accept -= 0.20;
        if (coach.hasTendency && coach.hasTendency('aggressive')) accept += 0.15;
        if (coach.hasTendency && coach.hasTendency('mileage-heavy')) accept -= 0.10; // stay in the block
      }
      if (rank <= 15) accept += 0.15;       // real contenders show up
      if (s.prestige >= 80) accept += 0.08;
      (rng.bool(Utils.clamp(accept, 0.15, 0.97)) ? accepted : declined).push(id);
    });

    const conditions = {
      tempF: Math.round((diCourse ? diCourse.tempBase : host.weather.tempBase) + rng.int(-8, 8) - (week - 5) * 1.1),
      hilliness: diCourse ? diCourse.hilliness : rng.int(30, 80),
      altitude: diCourse ? diCourse.altitude : host.weather.altitude,
      rain: rng.bool(0.18)
    };
    const meet = {
      id: Utils.generateId('meet'),
      week,
      name: cfg.name,
      hostId: host.id,
      schoolIds: accepted,
      type: 'invite',
      division: 'DI',
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
    if (accepted.includes(gameState.playerSchoolId)) season.playerMeetByWeek[week] = meet.id;

    season.preNationals = {
      meetId: meet.id,
      week,
      hostId: host.id,
      diNationalsHostId: diCourse ? diCourse.hostId : null,
      invited,
      accepted: accepted.slice(),
      declined,
      playerInvited: invited.includes(gameState.playerSchoolId),
      playerAccepted: accepted.includes(gameState.playerSchoolId)
    };

    if (invited.includes(gameState.playerSchoolId)) {
      gameState.logNews(`✉️ PRE-NATIONALS INVITE: your program is invited to the Pre-Nationals Invitational (Week ${week}) on the NCAA Championship course — an honor. Accept to preview the course, or rest and decline (Schedule screen).`);
    }
  }

  // Did a school race Pre-Nationals this season (course familiarity)?
  function racedPreNationals(gameState, schoolId) {
    const pn = gameState.season && gameState.season.preNationals;
    return !!(pn && pn.accepted && pn.accepted.includes(schoolId));
  }

  // Player accepts or declines their Pre-Nationals invitation.
  function setPreNationalsDecision(gameState, accept) {
    const season = gameState.season;
    const pn = season && season.preNationals;
    if (!pn || !pn.playerInvited) return { ok: false, message: 'No Pre-Nationals invitation is open.' };
    // The invitation is answered during Week 1 (spec Part 2, Section 15):
    // once the schedule is finalized, the decision locks with it.
    if (gameState.scheduleLocked && gameState.scheduleLocked()) {
      return { ok: false, message: 'The schedule is finalized — the Pre-Nationals decision locked with it after Week 1.' };
    }
    if (gameState.week >= pn.week) return { ok: false, message: 'Too late to change — Pre-Nationals has arrived.' };
    const meet = season.meets[pn.meetId];
    if (!meet) return { ok: false, message: 'Meet not found.' };
    const pid = gameState.playerSchoolId;
    if (accept && !pn.playerAccepted) {
      if (!meet.schoolIds.includes(pid)) meet.schoolIds.push(pid);
      if (!pn.accepted.includes(pid)) pn.accepted.push(pid);
      pn.declined = pn.declined.filter((id) => id !== pid);
      pn.playerAccepted = true;
      season.playerMeetByWeek[pn.week] = pn.meetId;
      return { ok: true, message: 'Accepted — your team will race Pre-Nationals and preview the Championship course.' };
    }
    if (!accept && pn.playerAccepted) {
      meet.schoolIds = meet.schoolIds.filter((id) => id !== pid);
      pn.accepted = pn.accepted.filter((id) => id !== pid);
      if (!pn.declined.includes(pid)) pn.declined.push(pid);
      pn.playerAccepted = false;
      if (season.playerMeetByWeek[pn.week] === pn.meetId) delete season.playerMeetByWeek[pn.week];
      return { ok: true, message: 'Declined — your squad rests and stays in its training block that week.' };
    }
    return { ok: true, message: 'No change.' };
  }

  function buildMeet(gameState, rng, base) {
    const host = gameState.getSchool(base.hostId);
    const distances = (base.week >= CONFERENCE_WEEK || base.elite)
      ? { M: 8000, W: 6000 }
      : { M: 8000, W: 5000 };
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
    // mountain host's invitational is always thin-air racing.
    const cm = base.courseMeta;
    return {
      id: Utils.generateId('meet'),
      ...base,
      distances,
      conditions: {
        tempF: Math.round(host.weather.tempBase + rng.int(-10, 12) - (base.week - 5) * 1.1),
        hilliness: cm && cm.hilliness !== undefined
          ? Utils.clamp(cm.hilliness + rng.int(-4, 4), 5, 95)
          : rng.int(10, 85),
        altitude: cm && cm.altitudeFt !== undefined
          ? D.altitudeCategory(cm.altitudeFt)
          : host.weather.altitude,
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
      ? (1800 - 4.6 * rating) / 8    // anchored at 8K (~23:00 elite)
      : (1500 - 3.2 * rating) / 6;   // anchored at 6K (~19:45 elite)
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

    // Course profile (Course Hilliness System): flat courses race genuinely
    // fast, rolling courses a touch slower, hilly courses significantly
    // slower — and hill specialists (built through Hills training) with
    // strong endurance lose far less of that time, so they outperform
    // expectations on hard courses. Centered near "rolling" (40), so a flat
    // 15-hilliness course is a PR track and an 85 is a war of attrition.
    const hillSkill = (hillAbility(a) * 0.7 + a.stamina * 0.3) / 100;
    mult += (c.hilliness - 40) * 0.00028 * (1.45 - hillSkill);

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
    const homeAlt = (gameState.getSchool(a.schoolId) || { weather: {} }).weather.altitude || 'Low';
    const altAdapt = homeAlt === 'High' ? 0.30 : homeAlt === 'Medium' ? 0.60 : 1;
    if (c.altitude === 'High') mult += 0.024 * (1.5 - a.vo2Max / 100) * altAdapt;
    else if (c.altitude === 'Medium') mult += 0.009 * (1.5 - a.vo2Max / 100) * altAdapt;
    else if (homeAlt === 'High') mult -= 0.004;   // live high, race low
    else if (homeAlt === 'Medium') mult -= 0.0015;

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
    if (meet.type === 'national' && (meet.division || 'DI') === 'DI') {
      const pn = gameState.season && gameState.season.preNationals;
      if (pn && meet.hostId === pn.diNationalsHostId && pn.accepted &&
          pn.accepted.includes(a.schoolId)) {
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

      // Confidence (Update 5, Part 7): built by strong races and personal
      // bests, dented by rough outings. A dynamic belief metric that feeds
      // race-day performance.
      const wasPR = !pr || f.time < pr;
      if (f.place === 1) a.confidence = Utils.clamp((a.confidence ?? 60) + 3, 10, 99);
      else if (f.place <= 10) a.confidence = Utils.clamp((a.confidence ?? 60) + 1.5, 10, 99);
      else if (f.place > finishers.length * 0.85) a.confidence = Utils.clamp((a.confidence ?? 60) - 1.5, 10, 99);
      if (wasPR) a.confidence = Utils.clamp((a.confidence ?? 60) + 1, 10, 99);

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
        gameState.history.records[nKey] = {
          time: f.time, name: f.name, athleteId: f.athleteId,
          school: gameState.getSchool(f.schoolId)?.name || '?',
          schoolId: f.schoolId, year: gameState.year
        };
        if (nrec) gameState.logNews(`NATIONAL RECORD: ${f.name} (${gameState.getSchool(f.schoolId)?.name}) runs ${formatTime(f.time)} for ${key}!`);
      }
    });

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
      const winsBefore = prog.wins;
      prog.wins += w;
      prog.losses += l;
      // Program milestone: all-time victory thresholds (Phase 11).
      [100, 250, 500, 1000, 2000].forEach((mark) => {
        if (winsBefore < mark && prog.wins >= mark) {
          Legacy.recordProgramMilestone(gameState, t.schoolId, `Program reached ${mark} all-time victories.`);
        }
      });
      if (t.place === 1 && teamScores.length >= 2) prog.meetWins += 1;
      const coach = gameState.getCoach(gameState.getSchool(t.schoolId)?.coachId);
      if (coach) {
        coach.careerRecord.wins += w;
        coach.careerRecord.losses += l;
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

        // At-large selections: the committee weighs season performance AND
        // championship results. Teams that missed the auto cut are ranked by
        // their national poll standing blended with how they placed at their
        // own regional — a strong regional finish (just missing the auto bids)
        // is a core NCAA at-large criterion.
        const rankIndex = {};
        (rankings[gender] || []).forEach((r) => {
          if (((gameState.getSchool(r.schoolId) || {}).division || 'DI') === division) {
            rankIndex[r.schoolId] = r.rank || 999;
          }
        });
        const ranked = (rankings[gender] || [])
          .filter((r) => ((gameState.getSchool(r.schoolId) || {}).division || 'DI') === division)
          .map((r) => r.schoolId);
        const atLarge = Object.keys(regionalPlace)
          .filter((sid) => !autoSet.has(sid))
          .map((sid) => {
            const pollScore = rankIndex[sid] ? Math.max(0, 100 - rankIndex[sid]) : 0;
            const regionScore = Math.max(0, 12 - (regionalPlace[sid] || 12));
            return { sid, score: pollScore + regionScore * 2.2 };
          })
          .sort((a, b) => b.score - a.score);

        const field = [...auto];
        for (const c of atLarge) {
          if (field.length >= rules.nationalsFieldSize) break;
          if (!field.includes(c.sid)) field.push(c.sid);
        }
        // Safety top-off (tiny/custom divisions): fill any remainder from poll.
        for (const sid of ranked) {
          if (field.length >= rules.nationalsFieldSize) break;
          if (!field.includes(sid)) field.push(sid);
        }
        champ.fieldIds[gender] = field;

        // Individuals: division's top regional finishers not on a qualifying team.
        const fieldSet = new Set(field);
        const individuals = [];
        regionalMeets.forEach((meet) => {
          const res = meet.results[gender];
          if (!res) return;
          res.finishers.slice(0, rules.individualQualifiersPerRegional).forEach((f) => {
            if (!fieldSet.has(f.schoolId)) individuals.push(f.athleteId);
          });
        });
        champ.individualQualifiers[gender] = individuals;

        if (division === playerDivision) {
          // Mirror onto the season-level view the UI reads.
          season.nationalsFieldIds[gender] = field;
          season.individualQualifiers[gender] = individuals;

          if (field.includes(gameState.playerSchoolId)) {
            const wasAuto = auto.includes(gameState.playerSchoolId);
            gameState.logNews(`Your ${gender === 'M' ? 'men' : 'women'} are headed to the NCAA Championships${wasAuto ? ' as automatic qualifiers' : ' with an at-large bid'}!`);
          } else {
            const mine = individuals
              .map((id) => gameState.world.athletes[id])
              .filter((a) => a && a.schoolId === gameState.playerSchoolId);
            if (mine.length) {
              gameState.logNews(`${mine.map((a) => a.fullName).join(' and ')} punch${mine.length === 1 ? 'es' : ''} an individual ticket to the NCAA Championships (top-${rules.individualQualifiersPerRegional} at regionals)!`);
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
        const declinedElite = ((gameState.season.preNationals || {}).declined || [])
          .map((id) => gameState.getSchool(id))
          .filter((s) => s && s.prestige >= 80);
        if (declinedElite.length) {
          gameState.logNews(`Notable absence: ${declinedElite.slice(0, 2).map((s) => s.name).join(', ')} chose to rest and skip Pre-Nationals, banking on their championship training block.`);
        }
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
  function postWeekHousekeeping(gameState) {
    if (gameState.week === REGIONAL_WEEK + 1 || gameState.week === REGIONAL_WEEK) {
      const season = gameState.season;
      if (season && !nationalsFieldsReady(season)) {
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
    racedPreNationals,
    setPreNationalsDecision,
    RACE_WEEKS,
    CONFERENCE_WEEK,
    REGIONAL_WEEK,
    NATIONAL_WEEK,
    SEGMENTS
  };
})();
