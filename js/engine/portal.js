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
  // Summer window (Update 11): the portal reopens across Summer Training
  // (weeks 1-3) EXCLUSIVELY for DII/DIII programs, stocked with Division I
  // roster cuts — a realistic second recruiting window.
  const SUMMER_FINAL_WEEK = CAL.SUMMER_WEEKS;
  const SEASON_END_WEEK = CAL.NATIONAL_WEEK;
  const REDSHIRT_CUTOFF = CAL.MEET_WEEKS[2];  // mid regular season
  // The player can work more of the board at once (Update 11.1) — chasing
  // only three transfers made landing any of them a coin-flip grind.
  const PLAYER_OFFER_LIMIT = 6;
  // A transfer the player actively pursues is being recruited by a head
  // coach in person — direct contact and a real pitch the passive CPU
  // market doesn't match. Two levers model that edge:
  //  - a modest appeal bump, so the player's program clears the athlete's
  //    "worth committing to" bar and lands among the finalists; and
  //  - a heavier weight in the final choice, because an athlete genuinely
  //    prefers the staff courting them hardest.
  // It's a real edge, not a guarantee: a blue blood can still out-pull the
  // player for a true star, where CPU appeal towers over a mid program's.
  const PLAYER_PURSUIT_BONUS = 16;
  const PLAYER_PURSUIT_WEIGHT = 6;

  // Transfer Portal Nerf (Update 13, Phase 4): desire-driven portal entries
  // are throttled to ~75% of their former rate — the portal was providing too
  // much talent. (The Zero Morale Rule and DI summer roster cuts are separate
  // and unaffected.)
  const PORTAL_ENTRY_SCALE = 0.75;

  // Rank a portal entry's suitors by the athlete's real appeal, with the
  // player's own program credited for actively pursuing (see above).
  function rankedOffers(gameState, entry, a, fromSchool) {
    return entry.offers
      .map((sid) => {
        let appeal = portalAppeal(gameState, gameState.getSchool(sid), a, fromSchool);
        if (sid === gameState.playerSchoolId) {
          appeal = Utils.clamp(appeal + PLAYER_PURSUIT_BONUS, 0, 100);
        }
        return { sid, appeal };
      })
      .sort((x, y) => y.appeal - x.appeal);
  }

  // The athlete's final pick among its finalists: appeal, steeply weighted,
  // with the player's active pursuit favored. The edge is strongest for
  // athletes who'd realistically choose a program at the player's level and
  // fades (never to nothing) for stars far above it, who have their pick of
  // blue bloods — so the player reliably lands roster help they focus on, but
  // still has to win a real fight for a difference-maker.
  function chooseSuitor(gameState, ranked, rng, pow, athlete) {
    const school = gameState.getPlayerSchool();
    let mult = PLAYER_PURSUIT_WEIGHT;
    if (athlete && school) {
      const reach = athlete.currentOverall - (30 + school.prestige * 0.55);
      if (reach > 10) mult = Math.max(2, PLAYER_PURSUIT_WEIGHT - (reach - 10) * 0.35);
    }
    return rng.weightedChoice(ranked.slice(0, 3), (o) =>
      Math.pow(Math.max(o.appeal, 1), pow) *
      (o.sid === gameState.playerSchoolId ? mult : 1));
  }

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
    // A just-arrived transfer (Update 11) is committed to the program they
    // chose — no transfer risk during their first season on the new campus.
    // Whatever drove them out of their old school does not follow them in.
    if (athlete.transferGraceYear === gameState.year) {
      return {
        score: 0,
        level: window.XCD.data.transferRiskLevel(0),
        reasons: [],
        anchors: ['Just transferred in — settling into the new program'],
        graduating: athlete.eligibilityRemaining < 2
      };
    }
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
          // A transfer in their grace season stays put — they just got here.
          if (a.transferGraceYear === gameState.year) return;
          const { u, reason } = unhappiness(gameState, a, school);
          // Transfer Portal Nerf (Update 13, Phase 4): the portal was providing
          // too much talent. Entry probability is scaled to ~75% of its former
          // rate, so meaningfully fewer runners churn each cycle and rosters
          // are built more through recruiting and development than the portal.
          let p = Utils.clamp((u - 14) / 130, 0, 0.5) * PORTAL_ENTRY_SCALE;
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

    // Coach reputation (Part 1) + recruiting craft pull hard (Update X):
    // the transfer should land with the best recruiter and/or the best
    // program pursuing them, so the coach's Recruiting rating and portal
    // craft carry real weight in the decision.
    const rep = coach ? (coach.reputation || 25) : 25;
    const craft = coach
      ? ((coach.recruiting || 55) * 0.55 + (coach.transferRecruiting || 55) * 0.45)
      : 45;

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
      playingTime * 0.19 +
      rep * 0.11 +
      craft * 0.09 +
      champOpp * 0.10 +
      Utils.clamp(100 - dist / 18, 0, 100) * 0.08 +
      school.facilitiesOverall * 0.06 +
      trainingFit * 0.05 +
      academicsFit * academicWeight +
      nilScore * 0.03 +
      (school.conferenceTier === 1 ? 5 : 0) +
      (school.prestige > (fromSchool ? fromSchool.prestige : 50) ? 4 : 0) +
      // Coaching stability (Update 11): a staff that just turned over is a
      // gamble no transfer needs to take.
      (school.coachChangedYear === gameState.year ? -4 : 0),
      0, 100);
  }

  /*
   * The transfer market, rebuilt (Update X, Part 1). Schools don't pursue
   * transfers randomly — every CPU staff evaluates each portal athlete
   * against its own situation: program prestige, current roster holes,
   * graduation losses, event needs, available roster space, recruiting
   * budget, competitive timeline (contender vs rebuild), and the staff's
   * recruiting philosophy. Interest scales with talent: All-American
   * caliber transfers draw a genuine national bidding war of ~10 programs,
   * mid-level transfers a handful of fits, and overlooked runners still
   * hear from the smaller programs where they'd matter.
   */
  function buildPortalMarket(gameState, summer) {
    const portal = gameState.portal;
    const rankIndex = {};
    if (gameState.rankings) {
      ['M', 'W'].forEach((g) => gameState.rankings[g].forEach((r) => {
        rankIndex[r.schoolId] = Math.min(rankIndex[r.schoolId] || 999, r.rank);
      }));
    }
    const profiles = [];
    Object.values(gameState.world.schools).forEach((school) => {
      if (school.id === gameState.playerSchoolId) return; // the player pursues manually
      // The summer window is EXCLUSIVE to Division II and III (Update 11):
      // the programs a Division I cut can actually continue a career at.
      if (summer && (school.division || 'DI') === 'DI') return;
      const coach = gameState.getCoach(school.coachId);
      const per = {};
      ['M', 'W'].forEach((gender) => {
        const roster = gameState.getRoster(school.id, gender);
        const leaving = roster.filter((a) =>
          a.redshirt !== 'True' && a.redshirt !== 'Medical' &&
          (a.eligibilityRemaining <= 1 || a.classYear === 'Graduate'));
        const eventNeeds = {};
        leaving.forEach((a) => {
          eventNeeds[a.preferredDistance] = (eventNeeds[a.preferredDistance] || 0) + 1;
        });
        const overalls = roster.map((a) => a.currentOverall).sort((x, y) => y - x);
        per[gender] = {
          returning: roster.length - leaving.length,
          leaving: leaving.length,
          eventNeeds,
          fifth: overalls[4] ?? 40,
          // Quality shortage: a roster propped up by walk-ons is a roster
          // shortage in disguise — those programs hit the summer market first.
          walkOns: roster.filter((a) => a.isWalkOn).length,
          pending: 0 // transfers already committed here this cycle
        };
      });
      profiles.push({
        school, coach,
        bestRank: rankIndex[school.id] || 999,
        hunter: coach && (coach.archetype === 'Recruiter' ||
          (coach.hasTendency && coach.hasTendency('transfer-expert')) ||
          (coach.transferRecruiting || 55) >= 75),
        per
      });
    });
    const byId = {};
    profiles.forEach((p) => { byId[p.school.id] = p; });
    (portal.entries || []).forEach((e) => {
      if (!e.destination) return;
      const a = gameState.getAthlete(e.athleteId);
      const p = a && byId[e.destination];
      if (p) p.per[a.gender].pending += 1;
    });
    return profiles;
  }

  // How many programs should end up chasing this athlete across the window.
  // Update 11: reverted to an intimate market — 2-4 programs pursue each
  // athlete. Level-matching still holds (pursuitScore below): the top
  // programs chase the top names, smaller programs work the middle and
  // bottom of the market; only the suitor COUNT came back down.
  function suitorTarget(quality, rng) {
    if (quality >= 66) return 3 + rng.int(0, 1); // proven scorer & up: 3-4 serious suitors
    if (quality >= 56) return 2 + rng.int(0, 2); // solid contributor: 2-4
    return 2 + rng.int(0, 1);                    // developmental / depth: 2-3
  }

  function pursuitScore(prof, a, quality, rng, summer) {
    const school = prof.school;
    const need = prof.per[a.gender];
    // Roster space is a hard gate: DI programs at the limit (returners +
    // already-committed transfers) sit the market out for that gender.
    const spots = ((school.division || 'DI') === 'DI' ? DI_ROSTER_LIMIT : 18)
      - need.returning - need.pending;
    if (spots <= 0) return -1;

    // Summer window (Update 11): lower divisions aggressively evaluate every
    // available cut, and a roster full of walk-ons is the loudest shortage —
    // a proven Division I body upgrades it immediately.
    let summerBoost = 0;
    if (summer) {
      summerBoost = 8 + Math.min(12, (need.walkOns || 0) * 3);
      if (a.currentOverall >= need.fifth) summerBoost += 8; // an instant scorer
    }

    // Talent-program fit: pursue athletes near or above your level. An
    // above-level target is exciting; one far below doesn't move the needle.
    const levelMark = 30 + school.prestige * 0.55;
    const gap = quality - levelMark;
    let score = 38 - Math.abs(gap) * (gap > 0 ? 0.5 : 1.4);

    // Roster needs: graduation losses and empty spots demand replacements.
    score += Math.min(18, need.leaving * 4.5) + Math.min(12, Math.max(0, spots - 1) * 2);
    // Event needs: a graduating senior leaves a hole in this event group.
    if (need.eventNeeds[a.preferredDistance]) score += 8;

    // Competitive timeline. A national title contender aggressively pursues
    // All-American caliber transfers; a rebuilding program wants athletes
    // who score immediately; smaller programs chase the overlooked.
    const contender = school.prestige >= 75 || prof.bestRank <= 15;
    if (contender && quality >= 72) score += 14;
    if (school.prestige < 58 && a.currentOverall >= need.fifth) score += 10;

    // Coaching philosophy & staff craft: portal hunters live in this market.
    if (prof.hunter) score += 12;
    if (prof.coach) score += ((prof.coach.transferRecruiting || 55) - 55) * 0.15;

    // Recruiting budget: deep pockets can afford to chase more targets.
    score += Math.min(8, school.budget.recruiting / 15000);

    // The market has noise — no two searches shake out the same.
    score += rng.next() * 16;
    return score + summerBoost;
  }

  function aiPortalOffers(gameState, rng) {
    const portal = gameState.portal;
    if (!portal || !portal.open) return;

    const summer = !!portal.summer;
    const market = buildPortalMarket(gameState, summer);
    const week = gameState.week;
    const weeksLeft = Math.max(1, (summer ? SUMMER_FINAL_WEEK : DECISION_WEEK) - week + 1);
    const divRank = (d) => (d === 'DI' ? 3 : d === 'DII' ? 2 : 1);

    portal.entries.forEach((entry) => {
      if (entry.destination) return;
      const a = gameState.getAthlete(entry.athleteId);
      if (!a) return;

      const quality = a.currentOverall * 0.7 + a.potential * 0.3;
      if (entry.suitorCap === undefined) {
        entry.suitorCap = suitorTarget(quality, rng);
        // Some low-appeal transfers draw no interest at all (Update 12):
        // role players and walk-ons can go unpursued for the whole window —
        // a chance for an alert program to add depth uncontested. Decided
        // once and stored, so the cold market is stable across the weeks.
        if (quality < 52 && rng.bool(0.4)) entry.suitorCap = 0;
      }
      const cap = entry.suitorCap;
      if (entry.offers.length >= cap) return;
      // Offers roll in across the window rather than landing all at once.
      const additions = Math.min(
        Utils.clamp(Math.ceil((cap - entry.offers.length) / weeksLeft) + (quality >= 74 ? 1 : 0), 1, 4),
        cap - entry.offers.length);

      const fromSchool = gameState.getSchool(entry.fromSchoolId);
      const movingUp = fromSchool && entry.reason === window.XCD.data.PORTAL_REASONS.moveUp;
      const taken = new Set(entry.offers);
      taken.add(entry.fromSchoolId);

      const scored = [];
      for (const prof of market) {
        if (taken.has(prof.school.id)) continue;
        let s = pursuitScore(prof, a, quality, rng, summer);
        if (s <= 0) continue;
        // Lower-division stars climbing (Update 5): an athlete chasing
        // higher-division competition draws the higher division's interest.
        if (movingUp && divRank(prof.school.division || 'DI') > divRank(fromSchool.division || 'DI')) s += 10;
        scored.push({ prof, s });
      }
      if (!scored.length) return;
      scored.sort((x, y) => y.s - x.s);

      // Genuine interest only: a school pursues when the fit clears a real
      // bar, so weak matches never generate junk offers.
      const bar = 34;
      const interested = scored.filter((c) => c.s >= bar);
      let pool;
      if (interested.length) {
        pool = interested.slice(0, additions * 3);
      } else if (quality >= 58) {
        // A capable athlete always draws at least a courtesy look or two.
        pool = scored.slice(0, 2);
      } else {
        // Some transfers simply aren't pursued (Update 12): role players and
        // walk-ons can linger in the portal unclaimed — depth an alert program
        // could add uncontested. Occasionally a low-key suitor still bites.
        pool = rng.bool(0.35) ? scored.slice(0, 1) : [];
      }
      if (!pool.length) return;
      for (let i = 0; i < additions && pool.length; i++) {
        const pick = rng.weightedChoice(pool, (c) => Math.max(1, c.s - bar + 8));
        pool.splice(pool.indexOf(pick), 1);
        entry.offers.push(pick.prof.school.id);
      }
    });
  }

  function playerOffer(gameState, athleteId) {
    const portal = gameState.portal;
    if (!portal || !portal.open) return { ok: false, message: 'The portal is closed.' };
    // The summer window is a DII/DIII-only market (Update 11).
    if (portal.summer && (gameState.getPlayerSchool().division || 'DI') === 'DI') {
      return { ok: false, message: 'The summer window is exclusive to Division II and III programs.' };
    }
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
    // DIII programs offer roster spots, not scholarships (Update X, Part 3).
    const terms = window.XCD.data.offerTerms(gameState.getPlayerSchool());
    return { ok: true, message: `${terms.made} ${a ? a.fullName : 'transfer'}.` };
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
      // Elite transfers let their (smaller, Update 11) market develop: a
      // star doesn't commit on the first call — the top suitors line up.
      if (!final && a.currentOverall >= 72 && entry.offers.length < 3) return;
      const ranked = rankedOffers(gameState, entry, a, fromSchool);
      if (ranked[0].appeal < 45 && !final) return;

      // Elite transfers weigh their bidding war carefully (Update X): the
      // best recruiter / best program pursuing them wins far more often.
      const pow = a.currentOverall >= 72 ? 4 : 3;
      const choice = chooseSuitor(gameState, ranked, rng, pow, a);
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

  /* ================================================================ *
   * The summer transfer window (Update 11)
   * ================================================================ */
  /*
   * Opened at the year rollover, stocked with every Division I roster cut
   * (scholarship athletes and walk-ons alike). Runs through Summer Training
   * weeks 1-3, exclusively for DII/DIII programs — the AI market reuses the
   * standard offer/pursuit machinery with the summer rules, a DII/DIII
   * player pursues through the normal portal screen, and every athlete
   * resolves by the end of week 3: signed somewhere with genuine room and
   * fit, or (rarely) walking away from the sport.
   */
  function openSummerWindow(gameState, cuts) {
    const R = window.XCD.data.PORTAL_REASONS;
    const entries = cuts.map(({ athlete, from }) => ({
      athleteId: athlete.id,
      fromSchoolId: from.id,
      reason: athlete.isWalkOn ? R.walkOnCut : R.rosterCut,
      offers: [],
      destination: null,
      decidedWeek: null
    }));
    gameState.portal = { year: gameState.year, entries, open: true, summer: true };
    const impact = cuts.filter(({ athlete }) => athlete.currentOverall >= 55).length;
    gameState.logNews(`☀️ SUMMER WINDOW: the transfer portal reopens for Division II and III — ${entries.length} Division I roster cuts hit the market${impact ? ` (${impact} rated 55+ overall)` : ''}.`);
  }

  // Move a summer transfer onto their new roster immediately — it's the
  // preseason, so there is no rollover to wait for.
  function applySummerMove(gameState, entry, rng) {
    const a = gameState.getAthlete(entry.athleteId);
    const to = gameState.getSchool(entry.destination);
    if (!a || !to) return false;
    const key = a.gender === 'M' ? 'rosterM' : 'rosterW';
    to[key].push(a.id);
    a.schoolId = to.id;
    a.morale = 72;
    a.coachRelationship = 55;
    a.teamRelationship = 50;
    a.transferGraceYear = gameState.year; // committed to the new program (Update 11)
    const engine = ((a.vo2Max || 55) + (a.stamina || 55)) / 2;
    a.fitness = Utils.clamp(Math.round(44 + (engine - 55) * 0.4 + rng.int(-12, 18)), 34, 84);
    a.fatigue = Utils.clamp(Math.min(a.fatigue, rng.int(6, 22)), 0, 100);
    a.sharpness = Utils.clamp(Math.round(rng.int(45, 68)), 0, 100);

    // Landing a proven Division I body is a real résumé line for a DII/DIII
    // staff — this is exactly how a small-school recruiter builds a name.
    if (a.currentOverall >= 62) {
      const head = gameState.getCoach(to.coachId);
      const asst = to.assistantId && gameState.world.coaches[to.assistantId];
      if (head) head.reputation = Utils.clamp((head.reputation || 25) + 0.6, 1, 99);
      if (asst && (!head || asst.id !== head.id)) {
        asst.reputation = Utils.clamp((asst.reputation || 12) + 1.2, 1, 99);
        if (asst.isPlayer) {
          gameState.logNews(`📈 Landing ${a.fullName} (${a.currentOverall} OVR) from the summer window boosts your recruiting reputation.`);
        }
      }
    }
    return true;
  }

  function resolveSummerDecisions(gameState, rng, final) {
    const portal = gameState.portal;
    if (!portal || !portal.summer || !portal.open) return;
    let moved = 0;

    portal.entries.forEach((entry) => {
      if (entry.destination || !entry.offers.length) return;
      // Rolling commitments across the window; everyone decides at the end.
      if (!final && !rng.bool(0.3)) return;
      const a = gameState.getAthlete(entry.athleteId);
      const fromSchool = gameState.getSchool(entry.fromSchoolId);
      if (!a) return;
      const ranked = rankedOffers(gameState, entry, a, fromSchool);
      if (!final && ranked[0].appeal < 45) return;
      const choice = chooseSuitor(gameState, ranked, rng, 3, a);
      entry.destination = choice.sid;
      entry.decidedWeek = gameState.week;
      if (applySummerMove(gameState, entry, rng)) {
        moved++;
        const to = gameState.getSchool(choice.sid);
        if (choice.sid === gameState.playerSchoolId) {
          gameState.logNews(`✅ SUMMER TRANSFER: ${a.fullName} (${a.currentOverall} OVR, cut by ${fromSchool?.name}) is coming to ${to.name}!`);
        } else if (a.currentOverall >= 62 || entry.fromSchoolId === gameState.playerSchoolId) {
          gameState.logNews(`Summer window: ${a.fullName} (cut by ${fromSchool?.name}) lands at ${to.name} (${to.division}).`);
        }
      }
    });

    if (final) closeSummerWindow(gameState, rng);
    return moved;
  }

  function closeSummerWindow(gameState, rng) {
    const portal = gameState.portal;
    if (!portal || !portal.summer) return;
    let placed = 0;
    let walkedAway = 0;
    // Whoever the market never called still lands wherever there's genuine
    // room and fit (DI is full post-trim, so this is DII/DIII by
    // construction) — cut athletes continue their careers, they don't
    // vanish. A few walk away from the sport, as some always did.
    portal.entries.forEach((entry) => {
      if (entry.destination) { placed++; return; }
      const a = gameState.getAthlete(entry.athleteId);
      if (!a) return;
      const to = placeCutAthlete(gameState, a, gameState.getSchool(entry.fromSchoolId), rng);
      if (to) { entry.destination = to.id; placed++; }
      else walkedAway++;
    });
    gameState.history.summerPortals = gameState.history.summerPortals || {};
    gameState.history.summerPortals[portal.year] = {
      entries: portal.entries.length, placed, walkedAway
    };
    gameState.portal = null;
    if (portal.entries.length) {
      gameState.logNews(`The summer transfer window closes: ${placed} cut athletes continue their careers at DII/DIII programs${walkedAway ? `, ${walkedAway} step away from the sport` : ''}.`);
    }
  }

  // Execute the moves at the year rollover (before graduation/aging).
  function applyTransfers(gameState, rng) {
    const portal = gameState.portal;
    if (!portal) return 0;
    rng = rng || new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 61) >>> 0);
    let moved = 0;
    const outBySchool = {};
    const inBySchool = {};
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
      // A transfer chose this program — they arrive committed, not still
      // looking to leave. Reset the bonds that pushed them out of their old
      // school to a fresh baseline, and grant a first-season grace so their
      // transfer risk reads low (Update 11).
      a.coachRelationship = 62;
      a.teamRelationship = 58;
      a.transferGraceYear = gameState.year;

      // The transfer-success ledger (Update X): who landed whom, and how
      // good they were — feeds staff reputation at the yearly progression.
      const haul = (inBySchool[to.id] = inBySchool[to.id] || { count: 0, elite: 0, best: 0 });
      haul.count += 1;
      haul.best = Math.max(haul.best, a.currentOverall);
      if (a.currentOverall >= 72) {
        haul.elite += 1;
        // Landing an elite portal athlete is an immediate résumé line for
        // the staff that closed the deal (Part 4: portal success matters).
        const head = gameState.getCoach(to.coachId);
        const asst = to.assistantId && gameState.world.coaches[to.assistantId];
        if (head) head.reputation = Utils.clamp((head.reputation || 25) + 0.8, 1, 99);
        if (asst && (!head || asst.id !== head.id)) {
          asst.reputation = Utils.clamp((asst.reputation || 12) + 1.5, 1, 99);
          if (asst.isPlayer) {
            gameState.logNews(`📈 Landing ${a.fullName} (${a.currentOverall} OVR) from the portal boosts your recruiting reputation.`);
          }
        }
      }
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
      outBySchool,
      inBySchool
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
    a.transferGraceYear = gameState.year; // a fresh start — no lingering flight risk
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
    const name = a.fullName;
    // Update 11: a Week 1 cut joins the summer transfer window with the CPU
    // cuts — DII/DIII programs evaluate them across weeks 1-3 rather than
    // the athlete teleporting to a new roster the same day.
    const R = window.XCD.data.PORTAL_REASONS;
    if (!gameState.portal || !gameState.portal.summer) {
      gameState.portal = { year: gameState.year, entries: [], open: true, summer: true };
    }
    gameState.portal.entries.push({
      athleteId: a.id,
      fromSchoolId: school.id,
      reason: a.isWalkOn ? R.walkOnCut : R.rosterCut,
      offers: [],
      destination: null,
      decidedWeek: null
    });
    // Cuts sting the locker room a little — the roster crunch is real.
    school.teamMorale = Utils.clamp((school.teamMorale ?? 65) - 1, 0, 100);
    gameState.logNews(`Roster cut: ${name} is released into the summer transfer window — DII/DIII programs will come calling.`);
    return { ok: true, message: `${name} released — they enter the summer transfer window.` };
  }

  /*
   * CPU cut day (runs at the rollover, before walk-ons): every Division I
   * program over the limit keeps its most valuable 14 per squad and moves
   * the rest on. The player's own cuts are a Week 1 task, never automated
   * — unless an AI head coach runs the program (player is the assistant).
   *
   * Update 11: cuts no longer scatter instantly — they stock the summer
   * transfer window (weeks 1-3, DII/DIII only), where lower divisions
   * aggressively evaluate every available body before hunting walk-ons.
   */
  function trimRosters(gameState, rng) {
    const cuts = [];
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
          cuts.push({ athlete: cut, from: school });
        }
      });
    });
    if (cuts.length) openSummerWindow(gameState, cuts);
    return cuts.length;
  }

  /* ================================================================ *
   * Weekly driver (called after the week increments)
   * ================================================================ */
  function processWeek(gameState, rng) {
    const week = gameState.week;
    if (week === CAL.SUMMER_WEEKS) aiRedshirts(gameState, rng); // decided before racing starts
    medicalRedshirtScan(gameState);

    // The summer window (Update 11): DII/DIII pursue Division I roster cuts
    // across Summer Training, everything resolved before the racing starts.
    if (gameState.portal && gameState.portal.summer) {
      if (week <= SUMMER_FINAL_WEEK) {
        aiPortalOffers(gameState, rng);
        resolveSummerDecisions(gameState, rng, week === SUMMER_FINAL_WEEK);
      } else {
        closeSummerWindow(gameState, rng); // safety net — never lose an athlete
      }
      return; // summer weeks never overlap the fall portal
    }

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
    SUMMER_FINAL_WEEK,
    PLAYER_OFFER_LIMIT,
    DI_ROSTER_LIMIT
  };
})();
