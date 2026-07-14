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
    const reasons = []; // { w, label } — what pushes toward the door
    const anchors = []; //  labels — what keeps this athlete home
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
    if (coach) {
      u -= (coach.culture - 50) * 0.20 + ((coach.relationships || 55) - 50) * 0.12;
      if (coach.culture >= 68) anchors.push('Strong program culture');
    } else add(8, R.culture);

    // Team morale (Update 3): a fractured locker room drives athletes out;
    // a confident one keeps them home. High morale = lower transfer risk.
    const teamMorale = school.teamMorale ?? 65;
    if (teamMorale < 42) add(13, R.culture);
    else {
      u -= (teamMorale - 60) * 0.16;
      if (teamMorale >= 78) anchors.push('Confident, winning locker room');
    }

    // Low coach relationship: unhappy AND unheard.
    if (a.morale < 50 && coach && (coach.relationships || 55) < 45) add(10, R.relationship);

    // Relationship attributes (Update 5, Part 7): loyalty is two-sided and
    // athlete-specific. A frayed bond with the coach OR a disconnect from
    // teammates each pushes toward the door — but a strong bond in either
    // direction is a genuine anchor, so a runner may stay for a coach they
    // love despite weak team chemistry, or for close friends despite a cold
    // relationship with the staff. No two exits weigh the same.
    const coachRel = a.coachRelationship ?? 60;
    const teamRel = a.teamRelationship ?? 60;
    if (coachRel < 35) add(coachRel < 22 ? 20 : 12, R.relationship);
    if (teamRel < 35) add(teamRel < 22 ? 16 : 10, R.teamChem);
    // Strong bonds keep runners home even when other things go wrong.
    if (coachRel >= 72) { u -= (coachRel - 70) * 0.5; anchors.push('Excellent coach relationship'); }
    if (teamRel >= 72) { u -= (teamRel - 70) * 0.4; anchors.push('Strong team chemistry'); }

    // Homesickness
    const dist = a.hometownState === 'INT' ? 0 : RE.distanceMiles(a.hometownState, school.state);
    if (dist > 900) add(a.personality === 'Anxious' ? 16 : 11, R.homesick);

    // Academics
    if (a.academics > 80 && school.academics < 50) add(9, R.academics);

    // Championship aspirations: stars stuck outside the national picture —
    // while a genuine contender is one of the strongest anchors there is.
    if (a.currentOverall > school.prestige + 18) add(20, R.contender);
    else if (school.prestige >= 72) { u -= 5; anchors.push('Championship contender'); }

    // Development & progression (Section 14): an athlete with real headroom
    // who isn't improving starts looking for a staff that will develop them;
    // visible growth is a genuine anchor.
    const seasonGrowth = a.seasonDev || 0;
    if (seasonGrowth <= 0 && (a.potential - a.currentOverall) > 8 &&
        !['Freshman'].includes(a.classYear)) {
      add(12, R.stagnant);
    } else if (seasonGrowth >= 3) { u -= 6; anchors.push('Consistent development'); }

    // A season lost to the training room breeds frustration — doubly so for
    // athletes whose careers already carry major injuries.
    if ((a.seasonInjuryWeeks || 0) >= 6) add(9, R.injuries);

    // Lower-division stars drawing higher-division interest (Update 5,
    // Section 1). Exceptionally decorated DII/DIII athletes — national
    // champions, multi-time All-Americans, dominant conference champions —
    // occasionally get the itch to test themselves a level up. Kept UNCOMMON
    // (a modest nudge, not a guarantee) so many elite lower-division athletes
    // stay loyal, and their coach/team bonds (below) can anchor them home.
    if ((school.division === 'DII' || school.division === 'DIII') && a.eligibilityRemaining >= 2) {
      const hy = a.honorYears || {};
      const champ = (hy.natChamp || []).length;
      const aa = (hy.allAmerican || []).length;
      const conf = (hy.confChamp || []).length;
      let decorated = 0;
      if (champ) decorated = 2;
      else if (aa >= 2) decorated = 1.5;
      else if (aa >= 1) decorated = 1;
      else if (conf && a.currentOverall > school.prestige + 10) decorated = 0.7;
      if (decorated) add(decorated * 6, R.moveUp);
    }

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
    // Merge duplicate labels (culture can trigger twice) for clean display.
    const seen = new Set();
    const topReasons = reasons.filter((r) => !seen.has(r.label) && seen.add(r.label))
      .map((r) => r.label);
    return {
      u,
      reason: reasons.length ? reasons[0].label : R.fresh,
      reasons: topReasons,
      anchors: [...new Set(anchors)]
    };
  }

  /*
   * Transfer Risk Indicator (spec Part 2, Section 14): the athlete's
   * internal Transfer Desire mapped to a visible five-step level, with the
   * concrete reasons (or anchors keeping them home) ready to reveal on the
   * profile. The CPU's portal entries run on this exact same scale.
   */
  function transferRisk(gameState, athlete) {
    const school = athlete.schoolId && gameState.getSchool(athlete.schoolId);
    if (!school || athlete.isRecruit) return null;
    const { u, reasons, anchors } = unhappiness(gameState, athlete, school);
    const R = window.XCD.data.PORTAL_REASONS;
    let score = u;
    let zeroMorale = false;
    // The Zero Morale Rule: a completely unhappy athlete is almost certain
    // to leave unless an exceptionally strong bond holds them.
    if (athlete.morale <= 2 &&
        (athlete.coachRelationship ?? 60) < 85 && (athlete.teamRelationship ?? 60) < 85) {
      score = Math.max(score, 70);
      zeroMorale = true;
    }
    const level = window.XCD.data.transferRiskLevel(score);
    const shown = zeroMorale ? [R.miserable, ...reasons] : reasons;
    return {
      score: Math.round(score),
      level,
      // High risk reveals what's driving it; low risk reveals what anchors them.
      reasons: shown.slice(0, 4),
      anchors: anchors.slice(0, 4),
      graduating: athlete.eligibilityRemaining < 2 // seniors don't enter the portal
    };
  }

  function openPortal(gameState, rng) {
    const entries = [];
    Object.values(gameState.world.schools).forEach((school) => {
      ['rosterM', 'rosterW'].forEach((key) => {
        school[key].forEach((id) => {
          const a = gameState.world.athletes[id];
          if (!a || a.eligibilityRemaining < 2 || isRedshirted(a)) return;
          const { u, reason } = unhappiness(gameState, a, school);
          let p = Utils.clamp((u - 14) / 130, 0, 0.5);
          // The Zero Morale Rule (Section 14): athletes at rock bottom almost
          // always leave. The only rare exceptions are exceptionally strong
          // bonds (and seniors, who never enter — they finish out the career).
          if (a.morale <= 2 &&
              (a.coachRelationship ?? 60) < 85 && (a.teamRelationship ?? 60) < 85) {
            p = 0.92;
          }
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

    // Championship opportunity (Update 3): a genuine shot at contending —
    // making nationals and finishing high — pulls transfers across divisions
    // in both directions (a buried DI runner drops to DII/DIII to race and
    // win; a DIII star climbs to chase DI titles).
    let champOpp = recentSuccess * 0.5;
    if (gameState.season && gameState.season.championships) {
      const champ = gameState.season.championships[school.division || 'DI'];
      const inField = champ && champ.fieldIds &&
        ((champ.fieldIds[a.gender] || []).includes(school.id));
      if (inField) champOpp += 30; // this program goes to nationals
    }
    if (playingTime >= 90 && school.prestige >= 55) champOpp += 15; // star who'd score right away

    // DIII athletes weigh academics/campus fit far more (division identity).
    const academicWeight = division.academicEmphasis >= 1.4 ? 0.10 : 0.05;

    return Utils.clamp(
      school.prestige * 0.20 +
      playingTime * 0.20 +
      rep * 0.12 +
      champOpp * 0.10 +
      Utils.clamp(100 - dist / 18, 0, 100) * 0.09 +
      school.facilitiesOverall * 0.07 +
      trainingFit * 0.06 +
      academicsFit * academicWeight +
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

      // Lower-division stars climbing (Update 5, Section 1): a decorated
      // DII/DIII athlete who entered chasing higher-division competition
      // should actually draw a higher-division suitor, not just lateral ones.
      const fromSchool = gameState.getSchool(entry.fromSchoolId);
      const divRank = (d) => (d === 'DI' ? 3 : d === 'DII' ? 2 : 1);
      if (fromSchool && entry.reason === window.XCD.data.PORTAL_REASONS.moveUp) {
        const higher = needy.filter((s) =>
          divRank(s.division || 'DI') > divRank(fromSchool.division || 'DI') &&
          !entry.offers.includes(s.id) && s.id !== entry.fromSchoolId &&
          Math.abs(a.currentOverall - (30 + s.prestige * 0.55)) <= 26);
        if (higher.length) candidates.push(rng.choice(higher));
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
      const crossDiv = fromSchool && (fromSchool.division || 'DI') !== (to.division || 'DI');
      const moveNote = crossDiv ? ` (${fromSchool.division || 'DI'} → ${to.division || 'DI'})` : '';
      if (choice.sid === gameState.playerSchoolId) {
        gameState.logNews(`✅ TRANSFER COMMIT: ${a.fullName} (${a.currentOverall} OVR) is coming to ${to.name} from ${fromSchool?.name}${moveNote}!`);
      } else if (a.currentOverall >= 72 || entry.fromSchoolId === gameState.playerSchoolId || crossDiv) {
        gameState.logNews(`Transfer: ${a.fullName} picks ${to.name}${moveNote} over ${entry.offers.length - 1} other offer${entry.offers.length > 2 ? 's' : ''}.`);
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
  function applyTransfers(gameState, rng) {
    const portal = gameState.portal;
    if (!portal) return 0;
    rng = rng || new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 61) >>> 0);
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
      // A transfer arrives fresh for a new program with a believable, varied
      // base of summer fitness — never an empty bar. Correlated lightly with
      // the athlete's aerobic engine so stronger runners show up fitter, plus
      // real individual variation. (The offseason summer reset that follows
      // applies its usual small trim on top of this.)
      const engine = ((a.vo2Max || 55) + (a.stamina || 55)) / 2;
      a.fitness = Utils.clamp(Math.round(44 + (engine - 55) * 0.4 + rng.int(-12, 18)), 34, 84);
      a.fatigue = Utils.clamp(Math.min(a.fatigue, rng.int(6, 22)), 0, 100); // arrive rested
      a.sharpness = Utils.clamp(Math.round(rng.int(45, 68)), 0, 100);       // race rust, not zeroed
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
   * Division I roster limits (spec Part 2, Section 15)
   * ================================================================ */
  const DI_ROSTER_LIMIT = 14;

  // Who a smart staff keeps: mostly ceiling and current ability, with a
  // nod to work ethic and a penalty for repeat major injuries.
  function keepScore(a) {
    const majors = (a.careerInjuries || []).filter((i) => i.major).length;
    return (a.potential || 50) * 0.5 + (a.currentOverall || 40) * 0.4 +
      ((a.workEthic || 60) - 60) * 0.08 - majors * 1.5 - (a.isWalkOn ? 3 : 0);
  }

  /*
   * A cut athlete enters the portal and lands wherever there's genuine
   * room and fit — a DI program under the limit, or a DII/DIII roster.
   * A few walk away from the sport entirely (recorded as alumni).
   */
  function placeCutAthlete(gameState, a, fromSchool, rng) {
    const key = a.gender === 'M' ? 'rosterM' : 'rosterW';
    const candidates = Object.values(gameState.world.schools).filter((s) => {
      if (fromSchool && s.id === fromSchool.id) return false;
      if (s.id === gameState.playerSchoolId) return false; // never auto-added to the player
      const div = s.division || 'DI';
      if (div === 'DI' && s[key].length >= DI_ROSTER_LIMIT) return false;
      if (s[key].length >= 20) return false; // lower-division rosters stay believable
      return Math.abs((30 + s.prestige * 0.55) - a.currentOverall) <= 30;
    });
    if (!candidates.length || rng.bool(0.08)) {
      window.XCD.engine.Legacy.recordAlumni(gameState, a);
      a.schoolId = null;
      a.health = 'Graduated';
      delete gameState.world.athletes[a.id];
      return null;
    }
    const ranked = candidates
      .map((s) => ({ s, appeal: portalAppeal(gameState, s, a, fromSchool) }))
      .sort((x, y) => y.appeal - x.appeal)
      .slice(0, 3);
    const to = rng.weightedChoice(ranked, (o) => Math.pow(Math.max(o.appeal, 5), 2)).s;
    to[key].push(a.id);
    a.schoolId = to.id;
    a.morale = 68;
    a.coachRelationship = 55;
    a.teamRelationship = 50;
    return to;
  }

  // Player-facing Week 1 cut: only a DI head coach over the limit, with
  // the athlete moving on through the portal immediately.
  function cutAthlete(gameState, athleteId) {
    const a = gameState.getAthlete(athleteId);
    if (!a) return { ok: false, message: 'Unknown athlete.' };
    const school = a.schoolId && gameState.getSchool(a.schoolId);
    if (!school || school.id !== gameState.playerSchoolId) return { ok: false, message: 'Not on your roster.' };
    if (gameState.isAssistant && gameState.isAssistant()) return { ok: false, message: 'Roster cuts are a head-coach call.' };
    if (gameState.week !== 1) return { ok: false, message: 'Roster moves happen during the Week 1 administrative phase.' };
    if ((school.division || 'DI') !== 'DI') return { ok: false, message: 'Only Division I enforces the 14-athlete limit — your roster is unlimited.' };
    const key = a.gender === 'M' ? 'rosterM' : 'rosterW';
    if (school[key].length <= DI_ROSTER_LIMIT) {
      return { ok: false, message: `That squad is at or under the ${DI_ROSTER_LIMIT}-athlete limit — no cuts required.` };
    }
    school[key] = school[key].filter((id) => id !== a.id);
    a.schoolId = null;
    const rng = new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 97 + a.id.length * 31) >>> 0);
    const name = a.fullName;
    const to = placeCutAthlete(gameState, a, school, rng);
    // Cuts sting the locker room a little — the roster crunch is real.
    school.teamMorale = Utils.clamp((school.teamMorale ?? 65) - 1, 0, 100);
    gameState.logNews(to
      ? `Roster cut: ${name} is released and lands at ${to.name} through the portal.`
      : `Roster cut: ${name} is released and steps away from collegiate running.`);
    return { ok: true, message: to ? `${name} released — picked up by ${to.name}.` : `${name} released.` };
  }

  /*
   * CPU cut day (runs at the rollover, before walk-ons): every Division I
   * program over the limit keeps its most valuable 14 per squad and moves
   * the rest on. The player's own cuts are a Week 1 task, never automated
   * — unless an AI head coach runs the program (player is the assistant).
   */
  function trimRosters(gameState, rng) {
    let cuts = 0;
    Object.values(gameState.world.schools).forEach((school) => {
      if ((school.division || 'DI') !== 'DI') return;
      const playerRuns = school.id === gameState.playerSchoolId &&
        !(gameState.isAssistant && gameState.isAssistant());
      if (playerRuns) return;
      ['rosterM', 'rosterW'].forEach((key) => {
        while (school[key].length > DI_ROSTER_LIMIT) {
          const roster = school[key].map((id) => gameState.world.athletes[id]).filter(Boolean);
          if (roster.length <= DI_ROSTER_LIMIT) { school[key] = roster.map((x) => x.id); break; }
          const cut = roster.sort((x, y) => keepScore(x) - keepScore(y))[0];
          school[key] = school[key].filter((id) => id !== cut.id);
          cut.schoolId = null;
          placeCutAthlete(gameState, cut, school, rng);
          cuts++;
        }
      });
    });
    return cuts;
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
    transferRisk,
    applyTransfers,
    cutAthlete,
    trimRosters,
    ENTRY_WEEK,
    DECISION_WEEK,
    PLAYER_OFFER_LIMIT,
    DI_ROSTER_LIMIT
  };
})();
