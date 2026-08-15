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
  // The player can spread transfer points across a wider board (Update 15) —
  // the points budget, not this cap, is the real constraint.
  const PLAYER_OFFER_LIMIT = 8;

  // Transfer Portal Nerf (Update 13, Phase 4): desire-driven portal entries
  // are throttled to ~75% of their former rate — the portal was providing too
  // much talent. (The Zero Morale Rule and DI summer roster cuts are separate
  // and unaffected.)
  const PORTAL_ENTRY_SCALE = 0.75;

  /* ================================================================ *
   * The Transfer Points system (Update 15) — a Campus-Dynasty-style,
   * skill-based portal.
   *
   * Every window the player gets a TRANSFER POINTS budget determined by
   * program prestige and the coach's recruiting craft (a high-caliber
   * program with an elite recruiter earns ~300; winning a national title
   * raises next window's budget, a genuinely poor season lowers it). Each
   * portal athlete carries a LOCK COST — the points that make the commit a
   * 100% certainty. Put your whole budget on one star or slide points
   * across several targets: your commit percentage is exactly
   * allocated / lockCost, and every rival school's live percentage shows
   * on the athlete's pursuit profile. Transfers also carry visible
   * PREFERENCES (racing time, contender, close to home, academics, NIL,
   * development, culture) — each preference your program matches lowers
   * that athlete's lock cost, so the right fits come cheaper. Top-level
   * transfers draw ~5-school bidding wars; a max-level program that
   * matches an athlete's preferences locks even a star for roughly a
   * third of its budget, while a mid-major must empty the tank to beat
   * the field for the same name.
   * ================================================================ */
  const TP = {
    BASE: 65,           // everyone can work the phones a little
    PRESTIGE: 1.75,     // the brand does the heavy lifting
    RECRUITING: 0.9,    // the coach's recruiting rating buys real points
    PORTAL_CRAFT: 0.3,  // transfer-recruiting specialists add a touch
    TITLE_BONUS: 50,    // champions recruit from the podium
    POOR_SEASON: -40,   // a bad year quiets the pitch
    MIN: 90, MAX: 400
  };

  function transferQuality(a) {
    return a.currentOverall * 0.7 + a.potential * 0.3;
  }

  /*
   * The window's transfer-points budget for the player's program.
   * Returns { budget, base, titleBonus, seasonAdj } so the UI can explain
   * exactly where the number came from.
   */
  function playerTransferBudget(gameState, summer) {
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    if (!school || !coach) return { budget: 0, base: 0, titleBonus: 0, seasonAdj: 0 };
    const base = TP.BASE + (school.prestige || 50) * TP.PRESTIGE +
      (coach.recruiting || 50) * TP.RECRUITING +
      ((coach.transferRecruiting || 55) - 55) * TP.PORTAL_CRAFT;

    // The season that just ended: the fall window opens after this year's
    // nationals; the summer window follows last calendar year's season.
    const seasonYear = summer ? gameState.year - 1 : gameState.year;
    const slate = (gameState.history.nationalChampions || {})[seasonYear] || {};
    const wonTitle = Object.values(slate).some((c) => c && c.teamId === school.id);
    let titleBonus = 0;
    let seasonAdj = 0;
    if (wonTitle) {
      titleBonus = TP.TITLE_BONUS;
    } else if (gameState.rankings) {
      // A poor season: the final poll far below where the prestige says the
      // program should sit (same expectation curve the prestige engine uses).
      const rk = gameState.rankings;
      const div = school.division || 'DI';
      const divSize = (rk.divisionSizes && rk.divisionSizes[div]) || rk.M.length || 300;
      let best = divSize;
      ['M', 'W'].forEach((g) => {
        const row = (rk[g] || []).find((r) => r.schoolId === school.id);
        if (row) best = Math.min(best, row.rank);
      });
      const expected = Math.round((1 - (school.prestige || 50) / 100) * divSize * 0.92) + 4;
      if (best > expected + Math.max(25, divSize * 0.1)) seasonAdj = TP.POOR_SEASON;
    }
    return {
      budget: Utils.clamp(Math.round(base + titleBonus + seasonAdj), TP.MIN, TP.MAX),
      base: Math.round(base),
      titleBonus,
      seasonAdj
    };
  }

  // The player's per-window points ledger, created when a window opens and
  // rebuilt lazily for saves that predate the system.
  function ensurePlayerPoints(gameState) {
    const portal = gameState.portal;
    if (!portal) return null;
    if (!portal.player) {
      const b = playerTransferBudget(gameState, !!portal.summer);
      portal.player = { budget: b.budget, base: b.base, titleBonus: b.titleBonus, seasonAdj: b.seasonAdj, allocations: {} };
    }
    return portal.player;
  }

  function transferPointsSpent(gameState) {
    const p = gameState.portal && gameState.portal.player;
    if (!p) return 0;
    return Object.values(p.allocations || {}).reduce((s, v) => s + (v || 0), 0);
  }

  function transferPointsLeft(gameState) {
    const p = ensurePlayerPoints(gameState);
    if (!p) return 0;
    return Math.max(0, p.budget - transferPointsSpent(gameState));
  }

  /*
   * What this transfer is looking for in a program (Update 15). Up to three
   * visible preferences derived from who they are and why they left; each
   * one a program matches lowers the lock cost (and raises a CPU suitor's
   * pull), so genuine fits close cheaper — for everyone.
   */
  function transferPreferences(gameState, athlete, entry) {
    const RE = window.XCD.engine.Recruiting;
    const R = window.XCD.data.PORTAL_REASONS;
    const reason = entry ? entry.reason : '';
    const from = entry && gameState.getSchool(entry.fromSchoolId);
    const prefs = [];

    if (reason === R.racing || reason === R.rosterCut || reason === R.walkOnCut) {
      prefs.push({
        key: 'racing', icon: '🏁', label: 'Wants to race right away',
        match: (s) => {
          const top = gameState.getRoster(s.id, athlete.gender)
            .map((x) => x.currentOverall).sort((x, y) => y - x);
          return athlete.currentOverall >= (top[4] ?? 40);
        }
      });
    }
    if (reason === R.contender || reason === R.moveUp || athlete.currentOverall >= 72) {
      prefs.push({ key: 'contender', icon: '🏆', label: 'Wants a national contender', match: (s) => s.prestige >= 72 });
    }
    if (reason === R.homesick || (athlete.hometownState !== 'INT' && from &&
        RE.distanceMiles(athlete.hometownState, from.state) > 900)) {
      prefs.push({
        key: 'home', icon: '🏠', label: 'Wants to be closer to home',
        match: (s) => athlete.hometownState !== 'INT' && RE.distanceMiles(athlete.hometownState, s.state) < 400
      });
    }
    if (reason === R.academics || athlete.academics > 78) {
      prefs.push({ key: 'academics', icon: '🎓', label: 'Values strong academics', match: (s) => s.academics >= 70 });
    }
    if (reason === R.stagnant || (athlete.potential - athlete.currentOverall) > 10) {
      prefs.push({
        key: 'development', icon: '📈', label: 'Wants a staff that develops runners',
        match: (s) => {
          const c = gameState.getCoach(s.coachId);
          return !!c && (c.training >= 62 || (s.facilities && s.facilities.trainingCenter >= 68));
        }
      });
    }
    if (reason === R.nil || athlete.personality === 'Individualist') {
      prefs.push({
        key: 'nil', icon: '💵', label: 'Wants real NIL money',
        match: (s) => {
          const d = window.XCD.data.divisionFor(s);
          return !!d.nil && s.budget.nil >= 25000;
        }
      });
    }
    if (reason === 'Facilities' || reason === R.trainingFit || reason === R.overtraining) {
      prefs.push({ key: 'facilities', icon: '🏟', label: 'Wants elite facilities & sports science', match: (s) => s.facilitiesOverall >= 68 });
    }
    if (reason === R.culture || reason === R.relationship || reason === R.teamChem || reason === R.miserable) {
      prefs.push({
        key: 'culture', icon: '🤝', label: 'Wants a healthy locker room',
        match: (s) => {
          const c = gameState.getCoach(s.coachId);
          return (s.teamMorale ?? 65) >= 68 || (!!c && c.culture >= 62);
        }
      });
    }
    // Everyone cares about something: round out thin lists.
    if (prefs.length < 2) {
      prefs.push({ key: 'winning', icon: '📊', label: 'Wants a program on the rise', match: (s) => (s.prestigeMomentum || 0) > 0.4 || s.prestige >= 62 });
    }
    return prefs.slice(0, 3);
  }

  function prefMatchCount(gameState, athlete, entry, school) {
    return transferPreferences(gameState, athlete, entry).filter((p) => {
      try { return !!p.match(school); } catch (e) { return false; }
    }).length;
  }

  // Each matched preference is worth 12% more effective recruiting pull
  // (Update 18: fit weighted more heavily) — a program that matches all three
  // of an athlete's preferences recruits them ~36% harder, and locks them for
  // meaningfully fewer points, than one that fits none.
  function prefMultiplier(gameState, athlete, entry, school) {
    return 1 + 0.12 * prefMatchCount(gameState, athlete, entry, school);
  }

  /*
   * The points that make this commit a certainty for `school`. Cost rises
   * steeply with talent, climbs further when the athlete is a reach above
   * the program's level, and falls when the program matches the athlete's
   * preferences. Calibration: a max-level program matching an elite
   * transfer's preferences locks them for ~1/3 of a ~300-point budget; a
   * mid-major must spend nearly everything for the same star.
   */
  function pointsToLock(gameState, athlete, school, entry) {
    school = school || gameState.getPlayerSchool();
    const quality = transferQuality(athlete);
    let cost = 20 + (quality * quality) / 82;
    const levelMark = 30 + (school.prestige || 50) * 0.55;
    const reach = quality - levelMark;
    if (reach > 6) cost *= Math.min(2.2, 1 + (reach - 6) * 0.045);
    cost /= prefMultiplier(gameState, athlete, entry, school);
    // Competition drives the price up (Update 18): the more — and the stronger
    // — the rival programs already chasing this athlete, the more it costs to
    // lock them. This is the recruiting battle from the player's side — as
    // elite CPUs pile in and escalate, an early bargain becomes a war. The
    // player gets a slight edge (they see it developing and react smarter), so
    // the surcharge is gentle and capped: a determined coach can always win a
    // battle, but not win them all.
    if (entry && entry.offers && entry.offers.length) {
      const rivalCount = entry.offers.filter((sid) => sid !== gameState.playerSchoolId).length;
      if (rivalCount) {
        // The price scales with HOW MANY programs are chasing, not with how hard
        // they later escalate (Update 18). This keeps the player's committed
        // commit-chance stable — the Update 15 contract — while still making a
        // crowded field expensive. It also rewards moving early: lock a target
        // before the suitors pile in and you pay less. Gentle and capped, so a
        // determined coach can win a bidding war, just not win them all.
        cost *= Utils.clamp(1 + rivalCount * 0.03, 1, 1.22);
      }
    }
    return Math.max(35, Math.round(cost));
  }

  /*
   * A CPU suitor's OPENING effective points in the race for this athlete — the
   * same currency the player spends. Resources (prestige + the staff's
   * recruiting craft) set the ceiling of what a program can throw at a
   * transfer, but PROGRAM FIT is the dominant multiplier (Update 18): a great
   * fit invests hard, a poor fit barely bothers — so a lower-prestige program
   * that genuinely fits an athlete can out-recruit a bigger name that doesn't.
   * Elite programs escalate hardest on athletes who'd immediately raise their
   * championship ceiling. Assigned when the offer lands; escalateCpuPursuits
   * then adjusts it as the battle develops.
   */
  function cpuTransferPoints(gameState, school, athlete, entry, rng) {
    const coach = gameState.getCoach(school.coachId);
    const Coaching = window.XCD.engine.Coaching;
    const fromSchool = entry && gameState.getSchool(entry.fromSchoolId);
    const fit = portalAppeal(gameState, school, athlete, fromSchool); // 0-100, fit-heavy
    const craft = ((coach && coach.recruiting) || 55) * 0.5 +
      ((coach && coach.transferRecruiting) || 55) * 0.5;
    // Resources ceiling: prestige + staff craft.
    const resource = 24 + (school.prestige || 50) * 0.42 + (craft - 55) * 0.35;
    // Fit is the dominant multiplier: fit 50 → ~1.16x, fit 80 → ~1.59x,
    // fit 35 → ~0.95x. Program fit, not prestige alone, decides most races.
    const fitMult = Utils.clamp(0.45 + fit / 70, 0.45, 1.9);
    let pts = resource * fitMult;
    // Elite / contending programs are aggressive on athletes who would
    // immediately raise their championship ceiling (item 2).
    const bestRank = (Coaching && Coaching.bestRank) ? Coaching.bestRank(gameState, school.id) : 999;
    const contender = (school.prestige || 50) >= 75 || bestRank <= 15;
    const quality = transferQuality(athlete);
    if (contender && quality >= 66 && fit >= 55) pts *= 1.22;
    const noise = 0.9 + (rng ? rng.next() : Math.random()) * 0.24;
    return Math.max(18, Math.round(pts * noise));
  }

  /*
   * Dynamic portal reallocation (Update 18, item 3). Each week a window is open,
   * CPU programs that are genuinely pursuing a contested athlete recognize the
   * rising competition and increase their investment to stay in the race —
   * turning a one-and-done decision into an actual bidding war. Only programs
   * that value the fit escalate (nobody overspends on a poor fit), and elite /
   * aggressive-recruiting programs push hardest and furthest. Escalation is
   * imperfect (probabilistic, capped) so the player — who reacts with full
   * information and no cap — keeps a slight, not overwhelming, edge.
   */
  function escalateCpuPursuits(gameState, rng) {
    const portal = gameState.portal;
    if (!portal || !portal.open) return;
    const playerId = gameState.playerSchoolId;
    portal.entries.forEach((entry) => {
      if (entry.destination || !entry.offers || entry.offers.length < 2) return;
      const a = gameState.getAthlete(entry.athleteId);
      if (!a) return;
      entry.cpuPoints = entry.cpuPoints || {};
      const fromSchool = gameState.getSchool(entry.fromSchoolId);

      // How hot is the market? More rivals — and a heavily-invested player —
      // both raise the pressure to escalate.
      const rivalCount = entry.offers.filter((sid) => sid !== playerId).length;
      let playerPressure = 0;
      if (entry.offers.includes(playerId) && portal.player) {
        const alloc = (portal.player.allocations || {})[a.id] || 0;
        const lock = pointsToLock(gameState, a, gameState.getPlayerSchool(), entry);
        playerPressure = Math.min(1, alloc / Math.max(1, lock));
      }
      const heat = Utils.clamp(rivalCount / 6 + playerPressure * 0.8, 0, 1.5);
      if (heat < 0.4) return; // a quiet race doesn't trigger a bidding war

      entry.offers.forEach((sid) => {
        if (sid === playerId) return;
        const school = gameState.getSchool(sid);
        if (!school) return;
        const coach = gameState.getCoach(school.coachId);
        const fit = portalAppeal(gameState, school, a, fromSchool);
        if (fit < 52) return; // nobody escalates on a poor fit
        if (entry.cpuPoints[sid] === undefined) {
          entry.cpuPoints[sid] = cpuTransferPoints(gameState, school, a, entry, rng);
        }
        // A great fit at a well-resourced program can roughly double its opening
        // bid; a marginal fit barely moves. Elite programs and portal
        // specialists push the ceiling higher.
        const aggression = ((school.prestige || 50) >= 78 ? 1.25 : (school.prestige || 50) >= 62 ? 1.1 : 1.0) *
          (coach && (coach.transferRecruiting || 55) >= 70 ? 1.1 : 1);
        const ceiling = entry.cpuPoints[sid] * (1 + Math.min(1.0, (fit - 50) / 45) * aggression);
        if (entry.cpuPoints[sid] < ceiling && rng.bool(0.55)) {
          const step = (ceiling - entry.cpuPoints[sid]) * (0.25 + heat * 0.2);
          entry.cpuPoints[sid] = Math.round(entry.cpuPoints[sid] + step);
        }
      });
    });
  }

  /*
   * The live win percentages for every school pursuing a portal athlete.
   * The player's chance is exactly allocatedPoints / lockCost (capped at
   * 100%); rival schools split the remaining probability by their own
   * effective points. Anything left over when the field is thin is the
   * chance the athlete withdraws and stays put.
   * Returns { probs: {schoolId: 0..1}, pPlayer, lock, alloc, stay }.
   */
  function winProbabilities(gameState, entry) {
    const a = gameState.getAthlete(entry.athleteId);
    const playerId = gameState.playerSchoolId;
    const out = { probs: {}, pPlayer: 0, lock: 0, alloc: 0, stay: 0 };
    if (!a) return out;

    const playerIn = entry.offers.includes(playerId);
    if (playerIn) {
      const p = ensurePlayerPoints(gameState);
      out.alloc = (p && p.allocations[a.id]) || 0;
      out.lock = pointsToLock(gameState, a, gameState.getPlayerSchool(), entry);
      out.pPlayer = Math.min(1, out.alloc / out.lock);
      out.probs[playerId] = out.pPlayer;
    }

    const cpuIds = entry.offers.filter((sid) => sid !== playerId && gameState.getSchool(sid));
    entry.cpuPoints = entry.cpuPoints || {};
    const weights = cpuIds.map((sid) => {
      if (entry.cpuPoints[sid] === undefined) {
        entry.cpuPoints[sid] = cpuTransferPoints(gameState, gameState.getSchool(sid), a, entry, null);
      }
      return entry.cpuPoints[sid];
    });
    const wsum = weights.reduce((s, w) => s + w, 0);
    const remaining = 1 - out.pPlayer;
    if (wsum > 0) {
      cpuIds.forEach((sid, i) => { out.probs[sid] = remaining * (weights[i] / wsum); });
    } else {
      // Nobody else is pursuing: whatever the player hasn't earned is the
      // chance the athlete simply withdraws and stays.
      out.stay = playerIn ? remaining : 1;
    }
    return out;
  }

  /*
   * Slide transfer points onto (or off) a portal athlete. `points <= 0`
   * withdraws the pursuit and refunds everything. Returns { ok, message }.
   */
  function setTransferPoints(gameState, athleteId, points) {
    const portal = gameState.portal;
    if (!portal || !portal.open) return { ok: false, message: 'The portal is closed.' };
    if (portal.summer && (gameState.getPlayerSchool().division || 'DI') === 'DI') {
      return { ok: false, message: 'The summer window is exclusive to Division II and III programs.' };
    }
    const entry = portal.entries.find((e) => e.athleteId === athleteId);
    if (!entry) return { ok: false, message: 'Not in the portal.' };
    if (entry.destination) return { ok: false, message: 'Already committed elsewhere.' };
    if (entry.fromSchoolId === gameState.playerSchoolId) return { ok: false, message: "That's your own player." };

    const p = ensurePlayerPoints(gameState);
    const a = gameState.getAthlete(athleteId);
    const name = a ? a.fullName : 'transfer';
    const current = p.allocations[athleteId] || 0;

    if (!points || points <= 0) {
      if (!current && !entry.offers.includes(gameState.playerSchoolId)) {
        return { ok: false, message: 'You are not pursuing this athlete.' };
      }
      delete p.allocations[athleteId];
      entry.offers = entry.offers.filter((id) => id !== gameState.playerSchoolId);
      return { ok: true, message: `Pursuit withdrawn — ${current} points refunded.` };
    }

    const pursuing = Object.keys(p.allocations).filter((id) => {
      const e = portal.entries.find((x) => x.athleteId === id);
      return e && !e.destination && (p.allocations[id] || 0) > 0;
    }).length;
    if (!current && pursuing >= PLAYER_OFFER_LIMIT) {
      return { ok: false, message: `You can only pursue ${PLAYER_OFFER_LIMIT} portal athletes at once.` };
    }

    const lock = pointsToLock(gameState, a, gameState.getPlayerSchool(), entry);
    const available = p.budget - (transferPointsSpent(gameState) - current);
    const pts = Math.min(Math.round(points), lock, available);
    if (pts <= 0) return { ok: false, message: 'No transfer points left — withdraw from another pursuit first.' };
    p.allocations[athleteId] = pts;
    if (!entry.offers.includes(gameState.playerSchoolId)) entry.offers.push(gameState.playerSchoolId);
    const pct = Math.round(Math.min(1, pts / lock) * 100);
    const terms = window.XCD.data.offerTerms(gameState.getPlayerSchool());
    return {
      ok: true,
      message: pct >= 100
        ? `${name} is LOCKED IN — 100% committed to your program!`
        : `${pts} points on ${name} — ${pct}% commit chance. ${terms.made.replace(/!$/, '')}.`
    };
  }

  // Rank a portal entry's suitors by the athlete's real appeal (CPU-only
  // races — entries the player is pursuing resolve through winProbabilities).
  function rankedOffers(gameState, entry, a, fromSchool) {
    return entry.offers
      .map((sid) => ({ sid, appeal: portalAppeal(gameState, gameState.getSchool(sid), a, fromSchool) }))
      .sort((x, y) => y.appeal - x.appeal);
  }

  // The athlete's final pick among CPU finalists: appeal, steeply weighted.
  function chooseSuitor(gameState, ranked, rng, pow) {
    return rng.weightedChoice(ranked.slice(0, 3), (o) => Math.pow(Math.max(o.appeal, 1), pow));
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

    // Racing opportunities & role (Update 18, item 6). Talented upperclassmen
    // who aren't getting meaningful competition become significantly more likely
    // to seek it elsewhere — and the older they are, and the longer it drags on,
    // the more frustrated they get. This is deliberately NOT purely rating-based:
    // an athlete with a legitimate reason to sit (genuinely behind better
    // runners, still developing, or with a clear role opening up as starters
    // graduate ahead of them) is far more patient than a proven runner buried on
    // the depth chart with nowhere to go.
    const roster = gameState.getRoster(school.id, a.gender).sort((x, y) => y.currentOverall - x.currentOverall);
    const rank = roster.findIndex((x) => x.id === a.id) + 1;
    const seasonRaces = a.seasonRaces || 0;
    const classIdx = Math.max(0, D.CLASS_YEARS.indexOf(a.classYear)); // Fr0 So1 Jr2 Sr3 Gr4
    const upper = classIdx >= 2; // Junior and older
    const fifth = roster[4] ? roster[4].currentOverall : 40;
    // Scoring-caliber somewhere — they'd contribute at another program.
    const couldScoreElsewhere = a.currentOverall >= fifth - 4;
    // Expected future role: if most of the runners ahead are graduating soon,
    // the athlete's lane is about to open — a legitimate reason to be patient.
    const aheadGraduating = roster.slice(0, Math.max(0, rank - 1))
      .filter((x) => (x.eligibilityRemaining || 5) <= 1).length;
    const roleOpening = rank > 7 && aheadGraduating >= Math.max(1, Math.floor((rank - 7) * 0.6));

    if (!isRedshirted(a) && a.currentOverall > 45) {
      if (seasonRaces === 0 && a.currentOverall > 50) {
        // Never toed the line — the loudest signal, louder with ability and age.
        let w = a.currentOverall > 70 ? 30 : a.currentOverall > 58 ? 22 : 16;
        if (upper) w += (classIdx - 1) * 6;      // Jr +6, Sr +12, 5th-yr +18
        if (couldScoreElsewhere) w += 5;
        if (roleOpening) w *= 0.6;               // patience: their turn is coming
        add(Math.round(w), R.racing);
      } else if (rank > 7 && upper) {
        // Buried on the depth chart as an upperclassman with few opportunities.
        let w = 14 + (classIdx - 1) * 5;
        if (seasonRaces <= 1) w += 6;            // barely raced
        if (couldScoreElsewhere) w += 6;
        if (roleOpening) w *= 0.6;
        add(Math.round(w), R.racing);
      } else if (rank > 7) {
        add(20, R.racing);                        // underclassman buried (baseline)
      }
      // Chronic frustration: an upperclassman who has raced very little across
      // their whole career (few races per year on campus) is the classic portal
      // candidate looking for a fresh start where they'll actually compete.
      const careerRaces = (a.careerStats && a.careerStats.races) || 0;
      if (upper && couldScoreElsewhere && careerRaces < (a.yearsOnCampus || 1) * 2 && !roleOpening) {
        add((classIdx - 1) * 5, R.racing);       // years of sitting compound
      }
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
    // The player's transfer-points budget for this window (Update 15).
    const pp = ensurePlayerPoints(gameState);
    if (pp && pp.titleBonus) {
      gameState.logNews(`🏆 Recruiting from the podium: the national title boosts your transfer points budget to ${pp.budget}.`);
    } else if (pp && pp.seasonAdj) {
      gameState.logNews(`📉 A down season quiets the pitch: your transfer points budget falls to ${pp.budget} this window.`);
    }

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

    // Development environment (Update 18): the coach's training craft, athlete
    // development history (their reputation for improving runners), and the
    // training center. A program that visibly makes runners better is a genuine
    // draw — especially for an athlete with real headroom left to unlock.
    const devEnv = coach
      ? (coach.training || 55) * 0.55 + (school.facilities.trainingCenter ?? 55) * 0.45
      : 50;
    const headroom = (a.potential || 60) - (a.currentOverall || 50);
    const developmentFit = Utils.clamp(devEnv + (headroom >= 10 ? (devEnv - 55) * 0.4 : 0), 0, 100);

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

    // Program fit is heavily weighted (Update 18): prestige matters, but it no
    // longer dominates. Opportunity to compete (playing time), the coaching
    // (reputation + craft + development environment), and a real title shot
    // carry the pitch — so a slightly lower-prestige program that genuinely
    // fits an athlete beats a bigger name that doesn't. This is the engine of
    // balanced dynasties.
    return Utils.clamp(
      school.prestige * 0.14 +
      playingTime * 0.20 +
      rep * 0.10 +
      craft * 0.08 +
      developmentFit * 0.08 +
      champOpp * 0.10 +
      Utils.clamp(100 - dist / 18, 0, 100) * 0.07 +
      school.facilitiesOverall * 0.05 +
      trainingFit * 0.05 +
      academicsFit * academicWeight +
      nilScore * 0.03 +
      (school.conferenceTier === 1 ? 4 : 0) +
      (school.prestige > (fromSchool ? fromSchool.prestige : 50) ? 3 : 0) +
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
        const overalls = roster.map((a) => a.currentOverall).sort((x, y) => y - x);
        const fifth = overalls[4] ?? 40;
        const leaving = roster.filter((a) =>
          a.redshirt !== 'True' && a.redshirt !== 'Medical' &&
          (a.eligibilityRemaining <= 1 || a.classYear === 'Graduate'));
        const eventNeeds = {};
        leaving.forEach((a) => {
          eventNeeds[a.preferredDistance] = (eventNeeds[a.preferredDistance] || 0) + 1;
        });
        per[gender] = {
          returning: roster.length - leaving.length,
          leaving: leaving.length,
          // Departing scorers (Update 16): losing front-runners is a louder
          // need than losing depth — those programs attack the portal for
          // ready replacements rather than leaning on freshmen.
          leavingTop: leaving.filter((a) => a.currentOverall >= fifth).length,
          eventNeeds,
          fifth,
          // Quality shortage: a roster propped up by walk-ons is a roster
          // shortage in disguise — those programs hit the summer market first.
          walkOns: roster.filter((a) => a.isWalkOn).length,
          pending: 0 // transfers already committed here this cycle
        };
      });
      // AI aggression (Update 16): programs coming off a disappointing season,
      // and those that just changed staff, work the portal hardest.
      const divSize = (gameState.rankings && gameState.rankings.divisionSizes &&
        gameState.rankings.divisionSizes[school.division || 'DI']) ||
        (gameState.rankings ? gameState.rankings.M.length : 300);
      const bestRank = rankIndex[school.id] || 999;
      const expected = Math.round((1 - (school.prestige || 50) / 100) * divSize * 0.92) + 4;
      let aggression = 0;
      if (bestRank < 999 && bestRank > expected + Math.max(20, divSize * 0.1)) aggression += 10; // down year
      if (school.coachChangedYear === gameState.year) aggression += 8;                            // new staff
      profiles.push({
        school, coach,
        bestRank,
        aggression,
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
  // Update 16 — the portal is a true offseason battle: the CPU fully works
  // the market, so nearly every impact athlete is contested and the elite
  // names become national recruiting wars. Level-matching still holds
  // (pursuitScore below): the top programs chase the top names, smaller
  // programs work the middle and bottom of the market.
  //   Elite / All-American caliber : 10-15 suitors (a national storyline)
  //   Good, proven scorers         : 5-10
  //   Average contributors         : 2-6
  //   Lower-rated depth / walk-ons : 0-3
  function suitorTarget(quality, rng) {
    if (quality >= 72) return 10 + rng.int(0, 5); // elite: a 10-15 school war
    if (quality >= 66) return 7 + rng.int(0, 3);  // star: 7-10
    if (quality >= 60) return 5 + rng.int(0, 3);  // proven scorer: 5-8
    if (quality >= 54) return 3 + rng.int(0, 3);  // solid contributor: 3-6
    if (quality >= 48) return 2 + rng.int(0, 2);  // depth piece: 2-4
    return rng.int(0, 3);                          // marginal / walk-on: 0-3
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

    // Roster needs: graduation losses and empty spots demand replacements —
    // and losing front-runners (leavingTop) is a louder need than losing depth.
    score += Math.min(18, need.leaving * 4.5) + Math.min(12, Math.max(0, spots - 1) * 2);
    score += Math.min(12, (need.leavingTop || 0) * 6); // graduated a scorer → attack the portal
    // Event needs: a graduating senior leaves a hole in this event group.
    if (need.eventNeeds[a.preferredDistance]) score += 8;

    // Competitive timeline. A national title contender aggressively pursues
    // All-American caliber transfers; a rebuilding program wants athletes
    // who score immediately; smaller programs chase the overlooked.
    const contender = school.prestige >= 75 || prof.bestRank <= 15;
    if (contender && quality >= 72) score += 14;
    if (school.prestige < 58 && a.currentOverall >= need.fifth) score += 10;

    // Program identity fit (Update 16): a pursuit should make sense for who
    // the program is. Each school leans toward the transfers that fit its
    // coaching identity, so the same athlete is a better fit some places than
    // others — and no single factor decides every race.
    const coach = prof.coach;
    const headroom = (a.potential || 60) - (a.currentOverall || 50);
    // Development programs chase high-ceiling projects.
    if (coach && (coach.archetype === 'Developer' || coach.training >= 70 ||
        (coach.hasTendency && coach.hasTendency('development-specialist'))) && headroom >= 10) {
      score += Math.min(12, headroom * 0.5);
    }
    // Championship contenders want immediate contributors, not projects.
    if (contender && a.currentOverall >= need.fifth) score += 8;
    // Rebuilding programs value youth they can grow with.
    if (school.prestige < 55 && (a.eligibilityRemaining || 0) >= 3) score += 7;
    // Distance-focused (mileage-heavy) programs value aerobic engines.
    if (coach && coach.hasTendency && coach.hasTendency('mileage-heavy')) {
      const engine = ((a.stamina || 55) + (a.vo2Max || 55) + (a.lactateThreshold || 55)) / 3;
      if (engine >= 62) score += Math.min(9, (engine - 60) * 0.5);
    }
    // Aggressive / kick-based racing teams value speed and competitiveness.
    if (coach && (coach.racePhilosophy === 'aggressive' || coach.racePhilosophy === 'sit-and-kick' ||
        (coach.hasTendency && coach.hasTendency('aggressive')))) {
      const kick = ((a.speed || 55) + (a.consistency || 55)) / 2;
      if (kick >= 60) score += Math.min(8, (kick - 58) * 0.5);
    }

    // Coaching philosophy & staff craft: portal hunters live in this market.
    if (prof.hunter) score += 12;
    if (prof.coach) score += ((prof.coach.transferRecruiting || 55) - 55) * 0.15;
    // Down-year and coaching-change programs press the portal harder (Update 16).
    score += prof.aggression || 0;

    // Recruiting budget: deep pockets can afford to chase more targets.
    score += Math.min(8, school.budget.recruiting / 15000);

    // Anti-monopoly / balanced dynasties (Update 18, item 5): a program that has
    // already reeled in multiple transfers this cycle has largely filled its
    // needs and eases off the gas, so talent spreads across programs rather than
    // piling up at a single super-team.
    if ((need.pending || 0) >= 2) score -= (need.pending - 1) * 6;

    // D2/D3 portal is a genuine battle now (Update 18, item 10): lower-division
    // programs work the portal harder — and their successful programs pursue
    // aggressively — so a player can't quietly hoard every available body.
    if ((school.division || 'DI') !== 'DI') {
      score += 5;
      if (school.prestige >= 55 || prof.bestRank <= 10) score += 5;
    }

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
      // Offers roll in across the window rather than landing all at once, but
      // the bigger bidding wars (Update 16) need a higher weekly throughput to
      // actually materialize before the deadline — so the per-week cap scales
      // with how contested the athlete is, and elite names surge fastest.
      const perWeekCap = cap >= 10 ? 6 : cap >= 6 ? 5 : 4;
      const additions = Math.min(
        Utils.clamp(Math.ceil((cap - entry.offers.length) / weeksLeft) + (quality >= 74 ? 2 : quality >= 66 ? 1 : 0), 1, perWeekCap),
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
        // The suitor's effective transfer points — set once, so the race the
        // player sees on the pursuit profile is stable across the window.
        entry.cpuPoints = entry.cpuPoints || {};
        entry.cpuPoints[pick.prof.school.id] = cpuTransferPoints(gameState, pick.prof.school, a, entry, rng);
      }
    });
  }

  /*
   * Quick pursue/withdraw toggle (Update 15: now backed by transfer points).
   * Pursuing without an explicit slider value assigns a sensible default —
   * about half the athlete's lock cost — which the pursuit profile's slider
   * can then fine-tune. Calling again withdraws and refunds the points.
   */
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
      return setTransferPoints(gameState, athleteId, 0); // withdraw + refund
    }
    const a = gameState.getAthlete(athleteId);
    if (!a) return { ok: false, message: 'Unknown athlete.' };
    const remaining = transferPointsLeft(gameState);
    if (remaining < 15) return { ok: false, message: 'No transfer points left — withdraw from another pursuit to free some up.' };
    const lock = pointsToLock(gameState, a, gameState.getPlayerSchool(), entry);
    return setTransferPoints(gameState, athleteId, Math.min(remaining, Math.max(25, Math.round(lock * 0.55))));
  }

  /*
   * Resolve one player-pursued entry with the transfer-points model
   * (Update 15). A locked athlete (100%) commits to the player on the spot;
   * otherwise the athlete waits for the deadline, then a single weighted
   * draw over the published percentages decides it — exactly the odds the
   * pursuit profile displayed. Returns true if the entry resolved.
   */
  function resolvePointsEntry(gameState, entry, a, rng, final) {
    const { probs, pPlayer, stay } = winProbabilities(gameState, entry);
    if (pPlayer >= 0.999) {
      commitEntry(gameState, entry, a, gameState.playerSchoolId, true);
      return true;
    }
    if (!final) return false; // pursued athletes take the whole window
    let r = rng.next();
    for (const sid of Object.keys(probs)) {
      r -= probs[sid];
      if (r <= 0) { commitEntry(gameState, entry, a, sid, false); return true; }
    }
    // The leftover slice (thin market): the athlete withdraws and stays.
    // (Summer-window cuts can't stay — they fall through to the close-of-
    // window placement instead, so no message here.)
    if ((stay > 0 || r > 0) && !(gameState.portal && gameState.portal.summer)) {
      const school = gameState.getSchool(entry.fromSchoolId);
      if (a.currentOverall >= 60 || entry.fromSchoolId === gameState.playerSchoolId) {
        gameState.logNews(`${a.fullName} withdraws from the portal and stays at ${school ? school.name : 'their program'}.`);
      }
    }
    return true;
  }

  function commitEntry(gameState, entry, a, sid, locked) {
    const fromSchool = gameState.getSchool(entry.fromSchoolId);
    entry.destination = sid;
    entry.decidedWeek = gameState.week;
    const to = gameState.getSchool(sid);
    const crossDiv = fromSchool && (fromSchool.division || 'DI') !== (to.division || 'DI');
    const moveNote = crossDiv ? ` (${fromSchool.division || 'DI'} → ${to.division || 'DI'})` : '';
    if (sid === gameState.playerSchoolId) {
      gameState.logNews(`✅ TRANSFER COMMIT: ${a.fullName} (${a.currentOverall} OVR) is coming to ${to.name} from ${fromSchool?.name}${moveNote}${locked ? ' — your points locked it in' : ''}!`);
    } else if (a.currentOverall >= 72 || entry.fromSchoolId === gameState.playerSchoolId ||
               entry.offers.includes(gameState.playerSchoolId) || crossDiv) {
      gameState.logNews(`Transfer: ${a.fullName} picks ${to.name}${moveNote} over ${entry.offers.length - 1} other offer${entry.offers.length > 2 ? 's' : ''}.`);
    }
  }

  /*
   * Transfer-ranking storylines (Update 16): the highest-rated portal athletes
   * are national news. A couple of times across the window, surface the top
   * uncommitted name and the fiercest bidding war so the offseason has a
   * portal narrative — "the #1 transfer remains unsigned", "eight schools are
   * pursuing the former NCAA champion." Logged sparingly to avoid spam.
   */
  function portalStorylines(gameState) {
    const portal = gameState.portal;
    if (!portal || !portal.open || portal.summer) return;
    const unsigned = portal.entries
      .filter((e) => !e.destination && e.offers.length)
      .map((e) => ({ e, a: gameState.getAthlete(e.athleteId) }))
      .filter((x) => x.a)
      .sort((x, y) => transferQuality(y.a) - transferQuality(x.a));
    if (!unsigned.length) return;

    const top = unsigned[0];
    if (transferQuality(top.a) >= 66) {
      const n = top.e.offers.length;
      const champ = top.a.honors && top.a.honors.natChamp ? 'former NCAA champion ' : '';
      gameState.logNews(`📰 PORTAL WATCH: ${champ}${top.a.fullName} (${top.a.currentOverall} OVR) is the top uncommitted transfer${n >= 3 ? ` — ${n} programs are chasing` : ' still on the board'}.`);
    }
    // The fiercest bidding war on the board (a different athlete, deep field).
    const contested = unsigned.find((x) => x.a.id !== top.a.id && x.e.offers.length >= 8);
    if (contested) {
      const champ = contested.a.honors && contested.a.honors.natChamp ? 'former NCAA champion ' : '';
      gameState.logNews(`📰 A full-blown recruiting war: ${contested.e.offers.length} schools are pursuing ${champ}${contested.a.fullName}.`);
    }
  }

  function resolveDecisions(gameState, rng, final = false) {
    const portal = gameState.portal;
    if (!portal || !portal.open) return;

    portal.entries.forEach((entry) => {
      if (entry.destination || !entry.offers.length) return;
      const a = gameState.getAthlete(entry.athleteId);
      if (!a) return;

      // The player's pursuits run on the transfer-points model (Update 15).
      if (entry.offers.includes(gameState.playerSchoolId)) {
        resolvePointsEntry(gameState, entry, a, rng, final);
        return;
      }

      // CPU-only races: rolling decisions; everyone left decides at the deadline.
      if (!final && !rng.bool(0.22)) return;
      const fromSchool = gameState.getSchool(entry.fromSchoolId);
      // Elite transfers let their market develop: a star doesn't commit on
      // the first call — the top suitors line up.
      if (!final && a.currentOverall >= 72 && entry.offers.length < 3) return;
      const ranked = rankedOffers(gameState, entry, a, fromSchool);
      if (ranked[0].appeal < 45 && !final) return;

      // Elite transfers weigh their bidding war carefully (Update X): the
      // best recruiter / best program pursuing them wins far more often.
      const pow = a.currentOverall >= 72 ? 4 : 3;
      const choice = chooseSuitor(gameState, ranked, rng, pow);
      commitEntry(gameState, entry, a, choice.sid, false);
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
    // A DII/DIII player works the summer market on transfer points too.
    if ((gameState.getPlayerSchool().division || 'DI') !== 'DI') ensurePlayerPoints(gameState);
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
      const a = gameState.getAthlete(entry.athleteId);
      const fromSchool = gameState.getSchool(entry.fromSchoolId);
      if (!a) return;

      // A DII/DIII player's summer pursuits run on transfer points too
      // (Update 15): locked cuts commit immediately, the rest resolve by
      // the published percentages when the window closes.
      if (entry.offers.includes(gameState.playerSchoolId)) {
        const before = entry.destination;
        resolvePointsEntry(gameState, entry, a, rng, final);
        if (entry.destination && entry.destination !== before) {
          if (applySummerMove(gameState, entry, rng)) moved++;
        }
        return;
      }

      // Rolling commitments across the window; everyone decides at the end.
      if (!final && !rng.bool(0.3)) return;
      const ranked = rankedOffers(gameState, entry, a, fromSchool);
      if (!final && ranked[0].appeal < 45) return;
      const choice = chooseSuitor(gameState, ranked, rng, 3);
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
        escalateCpuPursuits(gameState, rng); // the battle develops (Update 18)
        resolveSummerDecisions(gameState, rng, week === SUMMER_FINAL_WEEK);
      } else {
        closeSummerWindow(gameState, rng); // safety net — never lose an athlete
      }
      return; // summer weeks never overlap the fall portal
    }

    if (week === ENTRY_WEEK) openPortal(gameState, rng);
    if (week > ENTRY_WEEK && week < DECISION_WEEK) {
      aiPortalOffers(gameState, rng);
      // Dynamic reallocation (Update 18): CPU suitors adjust their investment as
      // the competition for each athlete develops.
      escalateCpuPursuits(gameState, rng);
      // Mid-window portal narrative: who's the prize, and who's fighting over
      // whom (logged twice across the window, not every single week).
      if (week === ENTRY_WEEK + 2 || week === DECISION_WEEK - 1) portalStorylines(gameState);
      resolveDecisions(gameState, rng, false);
    }
    if (week === DECISION_WEEK) {
      aiPortalOffers(gameState, rng);
      escalateCpuPursuits(gameState, rng);
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
    // Transfer Points system (Update 15)
    playerTransferBudget,
    ensurePlayerPoints,
    transferPointsLeft,
    transferPointsSpent,
    setTransferPoints,
    pointsToLock,
    transferPreferences,
    prefMatchCount,
    winProbabilities,
    transferQuality,
    cpuTransferPoints,
    escalateCpuPursuits,
    suitorTarget,
    portalStorylines,
    ENTRY_WEEK,
    DECISION_WEEK,
    SUMMER_FINAL_WEEK,
    PLAYER_OFFER_LIMIT,
    DI_ROSTER_LIMIT
  };
})();
