/*
 * PortalEngine — Phase 5: redshirts + the transfer portal.
 *
 * Redshirts: true redshirts (chosen preseason) and medical redshirts
 * (granted after season-ending injuries). Redshirted runners don't race,
 * keep the year of eligibility, and stay in their athletic class — all
 * bounded by the NCAA five-year clock (yearsOnCampus).
 *
 * Portal: after nationals, unhappy athletes enter the portal with real
 * reasons (playing time, coach change, homesickness, prestige, facilities,
 * academics, NIL, morale). AI programs with roster needs make offers;
 * athletes choose by fit. Transfers move at the year rollover.
 */
(function () {
  const Utils = window.XCD.core.Utils;
  const D = window.XCD.data;

  const CAL = window.XCD.data.CALENDAR;
  const ENTRY_WEEK = CAL.NATIONAL_WEEK + 1;   // the week after nationals
  const DECISION_WEEK = CAL.WEEKS_PER_YEAR - 1; // portal closes before rollover
  const SEASON_END_WEEK = CAL.NATIONAL_WEEK;
  const REDSHIRT_CUTOFF = CAL.MEET_WEEKS[2];  // mid regular season
  const PLAYER_OFFER_LIMIT = 3;

  /* ================================================================ *
   * Redshirts
   * ================================================================ */
  function isRedshirted(athlete) {
    return athlete.redshirt === 'True' || athlete.redshirt === 'Medical';
  }

  function canRedshirt(gameState, athlete) {
    if (athlete.redshirt !== 'None') return { ok: false, why: 'Redshirt already used or active.' };
    if (athlete.seasonRaces > 0) return { ok: false, why: 'Has already raced this season.' };
    if (gameState.week > REDSHIRT_CUTOFF) return { ok: false, why: 'Too late in the season.' };
    if (athlete.yearsOnCampus >= 5) return { ok: false, why: 'Five-year clock expired.' };
    return { ok: true };
  }

  function toggleRedshirt(gameState, athleteId) {
    const a = gameState.getAthlete(athleteId);
    if (!a) return { ok: false, message: 'Unknown athlete.' };
    if (isRedshirted(a)) {
      if (a.redshirt === 'Medical') return { ok: false, message: 'Medical redshirts cannot be cancelled.' };
      a.redshirt = 'None';
      return { ok: true, message: `${a.fullName}'s redshirt is cancelled — eligible to race.` };
    }
    const chk = canRedshirt(gameState, a);
    if (!chk.ok) return { ok: false, message: chk.why };
    a.redshirt = 'True';
    return { ok: true, message: `${a.fullName} will redshirt this season (develops, doesn't race, keeps the year).` };
  }

  // AI teams redshirt promising-but-raw freshmen early in the season.
  function aiRedshirts(gameState, rng) {
    for (const school of Object.values(gameState.world.schools)) {
      if (school.id === gameState.playerSchoolId) continue;
      ['rosterM', 'rosterW'].forEach((key) => {
        const roster = school[key].map((id) => gameState.world.athletes[id]).filter(Boolean)
          .sort((a, b) => b.currentOverall - a.currentOverall);
        let count = 0;
        roster.forEach((a, idx) => {
          if (count >= 3 || idx < 7) return;
          if (a.classYear === 'Freshman' && a.redshirt === 'None' &&
              a.potential - a.currentOverall > 14 && rng.bool(0.6)) {
            a.redshirt = 'True';
            count++;
          }
        });
      });
    }
  }

  // Season-ending injuries earn a medical redshirt (keeps the year).
  function medicalRedshirtScan(gameState) {
    if (gameState.week < 2 || gameState.week > SEASON_END_WEEK) return;
    Object.values(gameState.world.athletes).forEach((a) => {
      if (!a.injury || a.redshirt !== 'None' || a.seasonRaces > 2) return;
      if (a.injury.totalWeeks >= 4 && gameState.week + a.injury.weeksRemaining > SEASON_END_WEEK) {
        a.redshirt = 'Medical';
        if (a.schoolId === gameState.playerSchoolId) {
          gameState.logNews(`${a.fullName} is granted a medical redshirt — the season is lost, but the year of eligibility is saved.`);
        }
      }
    });
  }

  /* ================================================================ *
   * Portal: entries
   * ================================================================ */
  /*
   * Smart entry model (Part 4): every departure has a concrete, legible
   * cause. Returns the accumulated unhappiness and the loudest reason.
   */
  function unhappiness(gameState, a, school) {
    const RE = window.XCD.engine.Recruiting;
    const TE = window.XCD.engine.Training;
    const R = window.XCD.data.PORTAL_REASONS;
    let u = 0;
    const reasons = []; // { w, label }
    const add = (w, label) => { u += w; reasons.push({ w, label }); };

    const coach = gameState.getCoach(school.coachId);

    // Racing opportunities: good runners who never toe the line leave —
    // and elite ones who rarely race become MORE likely to go each year.
    const roster = gameState.getRoster(school.id, a.gender).sort((x, y) => y.currentOverall - x.currentOverall);
    const rank = roster.findIndex((x) => x.id === a.id) + 1;
    const buried = rank > 7 && a.currentOverall > 45;
    if ((a.seasonRaces || 0) === 0 && !isRedshirted(a) && a.currentOverall > 50) {
      add(a.currentOverall > 70 ? 30 : 18, R.racing);
    } else if (buried) {
      add(20, R.racing);
    }

    // Coach left this year — loyalty walks out the door with them.
    if (school.coachChangedYear === gameState.year) add(18, R.coachLeft);

    // Team culture: chemistry + the coach's culture/relationship craft.
    const chem = (school.chemistry && school.chemistry[a.gender]) ?? 55;
    if (chem < 42) add(14, R.culture);
    if (coach) u -= (coach.culture - 50) * 0.20 + ((coach.relationships || 55) - 50) * 0.12;
    else add(8, R.culture);

    // Team morale (Update 3): a fractured locker room drives athletes out;
    // a confident one keeps them home. High morale = lower transfer risk.
    const teamMorale = school.teamMorale ?? 65;
    if (teamMorale < 42) add(13, R.culture);
    else u -= (teamMorale - 60) * 0.16;

    // Low coach relationship: unhappy AND unheard.
    if (a.morale < 50 && coach && (coach.relationships || 55) < 45) add(10, R.relationship);

    // Homesickness
    const dist = a.hometownState === 'INT' ? 0 : RE.distanceMiles(a.hometownState, school.state);
    if (dist > 900) add(a.personality === 'Anxious' ? 16 : 11, R.homesick);

    // Academics
    if (a.academics > 80 && school.academics < 50) add(9, R.academics);

    // Championship aspirations: stars stuck outside the national picture.
    if (a.currentOverall > school.prestige + 18) add(20, R.contender);

    // Training fit (Part 6 interplay): fragile bodies on crushing volume,
    // or speed merchants ground down by a mileage-heavy program.
    const teamMiles = TE.aiMileage ? TE.aiMileage(gameState, coach, a.gender) : 70;
    const safe = TE.safeMileage ? TE.safeMileage(a) : 100;
    if (teamMiles > safe + 10) add(12, R.trainingFit);
    else if (a.speed > a.stamina + 18 && coach && coach.hasTendency && coach.hasTendency('mileage-heavy')) {
      add(9, R.style);
    }

    // Overtraining / undertraining: chronic states, not one bad week.
    if (a.fatigue > 75) add(10, R.overtraining);
    else if (a.fitness < 38 && a.fatigue < 30 && a.workEthic > 60) add(8, R.undertraining);

    // NIL money talks (only where the division allows it).
    const division = window.XCD.data.divisionFor(school);
    if (division.nil && school.budget.nil < 15000 && (a.personality === 'Individualist' || a.currentOverall >= 75)) {
      add(8, R.nil);
    }

    // Facilities & misery
    if (school.facilitiesOverall < 40) add(7, 'Facilities');
    if (a.morale < 40) add(24, 'Unhappy');
    else if (a.morale < 55) u += 10;

    reasons.sort((x, y) => y.w - x.w);
    return { u, reason: reasons.length ? reasons[0].label : R.fresh };
  }

  function openPortal(gameState, rng) {
    const entries = [];
    Object.values(gameState.world.schools).forEach((school) => {
      ['rosterM', 'rosterW'].forEach((key) => {
        school[key].forEach((id) => {
          const a = gameState.world.athletes[id];
          if (!a || a.eligibilityRemaining < 2 || isRedshirted(a)) return;
          const { u, reason } = unhappiness(gameState, a, school);
          const p = Utils.clamp((u - 14) / 130, 0, 0.5);
          if (rng.bool(p)) {
            entries.push({
              athleteId: a.id,
              fromSchoolId: school.id,
              reason,
              offers: [],
              destination: null,
              decidedWeek: null
            });
          }
        });
      });
    });

    gameState.portal = { year: gameState.year, entries, open: true };

    const stars = entries
      .map((e) => gameState.getAthlete(e.athleteId))
      .filter((a) => a && a.currentOverall >= 70).length;
    gameState.logNews(`The transfer portal opens: ${entries.length} runners enter (${stars} rated 70+ overall).`);
    entries.forEach((e) => {
      const a = gameState.getAthlete(e.athleteId);
      if (a && (e.fromSchoolId === gameState.playerSchoolId || a.currentOverall >= 74)) {
        gameState.logNews(`PORTAL: ${a.fullName} (${gameState.getSchool(e.fromSchoolId)?.name}) enters the portal — reason: ${e.reason.toLowerCase()}.`);
      }
    });
  }

  /* ================================================================ *
   * Portal: offers & decisions
   * ================================================================ */
  /*
   * Destination model (Part 4): transfers weigh the coach's national
   * reputation, prestige, the genuine likelihood of racing, recent
   * success, facilities, academics, distance from home, conference
   * level, NIL, and whether the training philosophy fits their body.
   * Division is no barrier — a buried DI runner will drop down for
   * racing opportunities, and a DIII star will chase DI competition.
   */
  function portalAppeal(gameState, school, a, fromSchool) {
    const RE = window.XCD.engine.Recruiting;
    const TE = window.XCD.engine.Training;
    const coach = gameState.getCoach(school.coachId);
    const roster = gameState.getRoster(school.id, a.gender).map((x) => x.currentOverall).sort((x, y) => y - x);
    const fifth = roster[4] ?? 40;
    const playingTime = a.currentOverall >= fifth ? 90 : a.currentOverall >= (roster[6] ?? 35) ? 65 : 30;
    const dist = a.hometownState === 'INT' ? 900 : RE.distanceMiles(a.hometownState, school.state);

    // Recent success: poll standing reads as "they're going somewhere."
    let recentSuccess = 50;
    if (gameState.rankings) {
      const row = gameState.rankings[a.gender].find((r) => r.schoolId === school.id);
      if (row) recentSuccess = Utils.clamp(100 - row.rank * 1.1, 20, 100);
    }

    // Coach reputation (Part 1) + transfer-recruiting craft pull hard.
    const rep = coach ? (coach.reputation || 25) : 25;
    const pull = coach ? (coach.transferRecruiting || 55) : 45;

    // Training philosophy fit: durable grinders want volume programs;
    // fragile or speed-based runners want to be handled with care.
    let trainingFit = 60;
    if (coach && coach.hasTendency) {
      const safe = TE.safeMileage ? TE.safeMileage(a) : 100;
      if (coach.hasTendency('mileage-heavy')) trainingFit = safe >= 105 ? 85 : safe <= 85 ? 25 : 55;
      else if (coach.hasTendency('low-mileage')) trainingFit = a.speed > a.stamina ? 85 : 50;
    }

    const division = window.XCD.data.divisionFor(school);
    const nilScore = division.nil ? Utils.clamp(school.budget.nil / 1200, 5, 100) : 5;
    const academicsFit = a.academics > 75 ? school.academics : 50;

    return Utils.clamp(
      school.prestige * 0.22 +
      playingTime * 0.22 +
      rep * 0.13 +
      recentSuccess * 0.09 +
      Utils.clamp(100 - dist / 18, 0, 100) * 0.09 +
      school.facilitiesOverall * 0.07 +
      trainingFit * 0.06 +
      academicsFit * 0.05 +
      nilScore * 0.04 +
      pull * 0.03 +
      (school.conferenceTier === 1 ? 5 : 0) +
      (school.prestige > (fromSchool ? fromSchool.prestige : 50) ? 4 : 0),
      0, 100);
  }

  function aiPortalOffers(gameState, rng) {
    const portal = gameState.portal;
    if (!portal || !portal.open) return;

    // Which programs need bodies/talent?
    const needy = Object.values(gameState.world.schools).filter((s) => s.id !== gameState.playerSchoolId);
    portal.entries.forEach((entry) => {
      if (entry.destination) return;
      const a = gameState.getAthlete(entry.athleteId);
      if (!a) return;
      // 2-4 suitors accumulate over the window; better runners draw better offers.
      if (entry.offers.length >= 4) return;
      const candidates = [];
      for (let i = 0; i < 30; i++) {
        const s = rng.choice(needy);
        if (s.id === entry.fromSchoolId || entry.offers.includes(s.id)) continue;
        // Programs chase talent near/above their level; portal-expert
        // coaches and elite transfer recruiters hunt everyone.
        const coach = gameState.getCoach(s.coachId);
        const hunter = coach && (coach.archetype === 'Recruiter' ||
          (coach.hasTendency && coach.hasTendency('transfer-expert')) ||
          (coach.transferRecruiting || 55) >= 75);
        if (!hunter && Math.abs(a.currentOverall - (30 + s.prestige * 0.55)) > 22) continue;
        candidates.push(s);
        if (candidates.length >= 3) break;
      }
      if (candidates.length && rng.bool(0.55)) {
        entry.offers.push(rng.choice(candidates).id);
      }
    });
  }

  function playerOffer(gameState, athleteId) {
    const portal = gameState.portal;
    if (!portal || !portal.open) return { ok: false, message: 'The portal is closed.' };
    const entry = portal.entries.find((e) => e.athleteId === athleteId);
    if (!entry) return { ok: false, message: 'Not in the portal.' };
    if (entry.destination) return { ok: false, message: 'Already committed elsewhere.' };
    if (entry.fromSchoolId === gameState.playerSchoolId) return { ok: false, message: "That's your own player." };
    if (entry.offers.includes(gameState.playerSchoolId)) {
      entry.offers = entry.offers.filter((id) => id !== gameState.playerSchoolId);
      return { ok: true, message: 'Offer withdrawn.' };
    }
    const active = portal.entries.filter((e) => !e.destination && e.offers.includes(gameState.playerSchoolId)).length;
    if (active >= PLAYER_OFFER_LIMIT) return { ok: false, message: `You can only pursue ${PLAYER_OFFER_LIMIT} portal athletes at once.` };
    entry.offers.push(gameState.playerSchoolId);
    const a = gameState.getAthlete(athleteId);
    return { ok: true, message: `Scholarship offered to ${a ? a.fullName : 'transfer'}.` };
  }

  function resolveDecisions(gameState, rng, final = false) {
    const portal = gameState.portal;
    if (!portal || !portal.open) return;

    portal.entries.forEach((entry) => {
      if (entry.destination || !entry.offers.length) return;
      // Rolling decisions; everyone left decides at the deadline.
      if (!final && !rng.bool(0.22)) return;

      const a = gameState.getAthlete(entry.athleteId);
      const fromSchool = gameState.getSchool(entry.fromSchoolId);
      if (!a) return;
      const ranked = entry.offers
        .map((sid) => ({ sid, appeal: portalAppeal(gameState, gameState.getSchool(sid), a, fromSchool) }))
        .sort((x, y) => y.appeal - x.appeal);
      if (ranked[0].appeal < 45 && !final) return;

      const choice = rng.weightedChoice(ranked.slice(0, 3), (o) => Math.pow(o.appeal, 3));
      entry.destination = choice.sid;
      entry.decidedWeek = gameState.week;
      const to = gameState.getSchool(choice.sid);
      if (choice.sid === gameState.playerSchoolId) {
        gameState.logNews(`✅ TRANSFER COMMIT: ${a.fullName} (${a.currentOverall} OVR) is coming to ${to.name} from ${fromSchool?.name}!`);
      } else if (a.currentOverall >= 72 || entry.fromSchoolId === gameState.playerSchoolId) {
        gameState.logNews(`Transfer: ${a.fullName} picks ${to.name} over ${entry.offers.length - 1} other offer${entry.offers.length > 2 ? 's' : ''}.`);
      }
    });

    if (final) {
      const undecided = portal.entries.filter((e) => !e.destination);
      undecided.forEach((e) => {
        const a = gameState.getAthlete(e.athleteId);
        if (a && e.fromSchoolId === gameState.playerSchoolId) {
          gameState.logNews(`${a.fullName} withdraws from the portal and will stay with your program.`);
        }
      });
      portal.open = false;
    }
  }

  // Execute the moves at the year rollover (before graduation/aging).
  function applyTransfers(gameState) {
    const portal = gameState.portal;
    if (!portal) return 0;
    let moved = 0;
    const outBySchool = {};
    portal.entries.forEach((entry) => {
      if (!entry.destination) return;
      const a = gameState.world.athletes[entry.athleteId];
      const from = gameState.getSchool(entry.fromSchoolId);
      const to = gameState.getSchool(entry.destination);
      if (!a || !from || !to) return;
      const key = a.gender === 'M' ? 'rosterM' : 'rosterW';
      from[key] = from[key].filter((id) => id !== a.id);
      to[key].push(a.id);
      a.schoolId = to.id;
      a.morale = 72;
      outBySchool[from.id] = (outBySchool[from.id] || 0) + 1;
      moved++;
    });
    gameState.history.portalSummaries = gameState.history.portalSummaries || {};
    gameState.history.portalSummaries[portal.year] = {
      entries: portal.entries.length,
      moved,
      outBySchool
    };
    gameState.portal = null;
    return moved;
  }

  /* ================================================================ *
   * Weekly driver (called after the week increments)
   * ================================================================ */
  function processWeek(gameState, rng) {
    const week = gameState.week;
    if (week === CAL.SUMMER_WEEKS) aiRedshirts(gameState, rng); // decided before racing starts
    medicalRedshirtScan(gameState);
    if (week === ENTRY_WEEK) openPortal(gameState, rng);
    if (week > ENTRY_WEEK && week < DECISION_WEEK) {
      aiPortalOffers(gameState, rng);
      resolveDecisions(gameState, rng, false);
    }
    if (week === DECISION_WEEK) {
      aiPortalOffers(gameState, rng);
      resolveDecisions(gameState, rng, true);
    }
  }

  window.XCD.engine.Portal = {
    processWeek,
    toggleRedshirt,
    canRedshirt,
    isRedshirted,
    playerOffer,
    portalAppeal,
    applyTransfers,
    ENTRY_WEEK,
    DECISION_WEEK,
    PLAYER_OFFER_LIMIT
  };
})();
