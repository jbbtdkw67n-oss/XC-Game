/*
 * CareersEngine — Update 2 (Part 11): the coaching carousel, rebuilt.
 *
 * Schools only hire when their coach retires (randomly, at 75+), is
 * fired, or leaves for another job. Every offseason, vacancies are filled
 * from a real market: sitting coaches at smaller programs get poached
 * (creating chained vacancies), fired coaches wait in a free-agent pool
 * for a call, and unknown assistants get their first break. Coach
 * reputation — not just school prestige — decides who gets which job.
 *
 * The player fields offers from schools with actual openings: lateral
 * moves, step-downs after rough stretches, big steps up after
 * overachieving, and the occasional dream job.
 */
(function () {
  const Utils = window.XCD.core.Utils;

  const CAL = window.XCD.data.CALENDAR;
  const OFFER_EXPIRY_WEEK = CAL.WEEKS_PER_YEAR - 1;

  /* ---------------- Player job offers ---------------- */
  function bestPlayerRank(gameState) {
    const r = gameState.rankings;
    if (!r) return 999;
    const m = r.M.find((x) => x.schoolId === gameState.playerSchoolId);
    const w = r.W.find((x) => x.schoolId === gameState.playerSchoolId);
    return Math.min(m ? m.rank : 999, w ? w.rank : 999);
  }

  /*
   * Called right after awards + firings (awards week). Offers come only
   * from programs with genuine vacancies; your reputation is the résumé.
   */
  function generateOffers(gameState, rng) {
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    const rep = coach.reputation || 20;
    const rank = bestPlayerRank(gameState);
    const total = window.XCD.engine.Coaching.divisionSize(gameState, school.division);

    // Vacant chairs (fired this week, or already open).
    const vacancies = Object.values(gameState.world.schools).filter((s) =>
      s.id !== gameState.playerSchoolId && (!s.coachId || !gameState.world.coaches[s.coachId]));
    if (!vacancies.length) { gameState.jobOffers = null; return; }

    // Did you win a title this season? Titles turn heads immediately.
    const year = gameState.year;
    const conf = (gameState.history.conferenceChampions || {})[year] || {};
    const nat = (gameState.history.nationalChampions || {})[year] || {};
    const wonConf = conf[`${school.conference}-M`] === school.name || conf[`${school.conference}-W`] === school.name;
    const wonNat = ['M', 'W'].some((g) => {
      const key = (school.division || 'DI') === 'DI' ? g : `${school.division}-${g}`;
      return nat[key] && nat[key].teamId === school.id;
    });

    // Your résumé is more than a reputation number: running a real program and
    // beating expectations this season carry weight too, so a coach who is
    // winning gets calls from peer programs before their "name" fully catches
    // up. (Interest is what athletic directors see when they pick up the phone.)
    const expectedRank = Math.round((1 - school.prestige / 100) * total);
    const overachievement = expectedRank - rank; // positive = beating expectations
    // Beating expectations lifts your stock; badly missing them cools the
    // market this cycle. The penalty is capped so one rough year doesn't erase
    // an established name entirely.
    const seasonSwing = overachievement >= 0
      ? overachievement * 0.18
      : Math.max(-32, overachievement * 0.22);
    const resume = rep
      + Math.max(0, school.prestige - 35) * 0.30       // steering a legitimate program
      + seasonSwing                                    // how this season actually went
      + (rank <= 15 ? 12 : rank <= 40 ? 6 : rank <= 90 ? 3 : 0) // a strong national showing
      + (wonNat ? 15 : wonConf ? 7 : 0);               // hardware on the mantle

    const candidates = vacancies.filter((s) => {
      const need = s.prestige * 0.68 - 10;             // reputation the chair expects
      const fit = resume - need;
      // A near-miss still gets a look when you're clearly overachieving.
      if (fit < -6 && !(overachievement > 30 && rng.bool(0.5))) return false;
      // A big step down needs a genuine reason to tempt you (still surfaced,
      // just rarer) — no one calls a rising coach about a far-lesser job often.
      if (s.prestige < school.prestige - 25 && resume > s.prestige + 10) return rng.bool(0.4);
      return true;
    });
    if (!candidates.length) { gameState.jobOffers = null; return; }

    // Not every fit calls, but a stronger résumé means more phones ring.
    let interested = candidates.filter(() => rng.bool(Utils.clamp(0.32 + resume / 140, 0.28, 0.85)));
    // A standout season (national top-15 or a title) all but guarantees that
    // at least one suitor comes calling if any program fits.
    if (!interested.length) {
      if ((rank <= 15 || wonConf || wonNat) && candidates.length) {
        interested = [rng.choice(candidates)];
      } else { gameState.jobOffers = null; return; }
    }

    const bestRankOf = (sid) => {
      const r = gameState.rankings;
      if (!r) return null;
      const m = r.M.find((x) => x.schoolId === sid);
      const w = r.W.find((x) => x.schoolId === sid);
      const b = Math.min(m ? m.rank : 999, w ? w.rank : 999);
      return b < 999 ? b : null;
    };
    const offers = rng.shuffle(interested).slice(0, 3).map((s) => {
      const hs = s.historicalSuccess || {};
      const crossDiv = (s.division || 'DI') !== (school.division || 'DI');
      return {
        schoolId: s.id,
        schoolName: s.name,
        prestige: s.prestige,
        conference: s.conference,
        division: s.division || 'DI',
        // Rich offer detail (Update 3 Job Offer phase).
        budget: s.budget.total,
        facilities: s.facilitiesOverall,
        academics: s.academics,
        bestRank: bestRankOf(s.id),
        expectations: Math.round((window.XCD.data.divisionFor(s).expectations || 1) * 100),
        natTitles: (hs.nationalTitlesM || 0) + (hs.nationalTitlesW || 0),
        confTitles: (hs.conferenceTitlesM || 0) + (hs.conferenceTitlesW || 0),
        repFit: Utils.clamp(Math.round(resume - (s.prestige * 0.68 - 10) + 50), 0, 100),
        kind: crossDiv && (s.division === 'DII' || s.division === 'DIII') && (school.division === 'DI')
            ? `Move to ${s.division}`
          : crossDiv && school.division !== 'DI' && s.division === 'DI' ? 'Jump to DI'
          : s.prestige >= 85 && s.conferenceTier === 1 ? 'Dream job'
          : s.prestige >= school.prestige + 10 ? 'Step up'
          : s.prestige >= school.prestige - 8 ? 'Lateral move'
          : 'Step down'
      };
    }).sort((a, b) => b.prestige - a.prestige);

    gameState.jobOffers = { year: gameState.year, expiresWeek: OFFER_EXPIRY_WEEK, offers };
    gameState.logNews(`📞 Your phone is ringing: ${offers.length === 1 ? offers[0].schoolName + ' wants' : offers.length + ' programs want'} to talk about their head coaching job.`);
  }

  /*
   * Assistant-coach promotions (Update 5, Part 4). A recruiting coordinator
   * who builds classes earns head-coach offers — first at smaller programs,
   * then bigger ones as their reputation grows. This is the payoff of the
   * assistant career path: recruit your way into your own program.
   */
  function generateAssistantOffers(gameState, rng) {
    const coach = gameState.getPlayerCoach();
    const home = gameState.getPlayerSchool();
    const rep = coach.reputation || 12;

    // Genuine head-coach vacancies (fired/retired/open chairs).
    const vacancies = Object.values(gameState.world.schools).filter((s) =>
      s.id !== gameState.playerSchoolId && (!s.coachId || !gameState.world.coaches[s.coachId]));
    if (!vacancies.length) { gameState.jobOffers = null; return; }

    // A recruiting reputation is the résumé; best recent class sweetens it.
    const bestClass = coach.careerRecord && coach.careerRecord.bestClassRank;
    const classBoost = bestClass ? Utils.clamp((30 - bestClass) * 0.6, 0, 18) : 0;
    const resume = rep + classBoost + (coach.recruiting - 55) * 0.25;

    // Programs hire an unproven head coach only when the résumé clears their
    // (modest) bar — smaller schools take the chance on a hot recruiter first.
    const candidates = vacancies.filter((s) => {
      const need = s.prestige * 0.55; // lower bar than a sitting head coach faces
      if (resume < need - 4) return false;
      // Powers won't hand their program to a first-time head coach yet.
      if (s.prestige > 72 && resume < s.prestige) return false;
      return true;
    });
    if (!candidates.length) { gameState.jobOffers = null; return; }

    let interested = candidates.filter(() => rng.bool(Utils.clamp(0.22 + resume / 160, 0.2, 0.7)));
    if (!interested.length && (bestClass && bestClass <= 15)) interested = [rng.choice(candidates)];
    if (!interested.length) { gameState.jobOffers = null; return; }

    const offers = rng.shuffle(interested).slice(0, 3).map((s) => {
      const hs = s.historicalSuccess || {};
      return {
        schoolId: s.id, schoolName: s.name, prestige: s.prestige, conference: s.conference,
        division: s.division || 'DI', budget: s.budget.total, facilities: s.facilitiesOverall,
        academics: s.academics, bestRank: null,
        expectations: Math.round((window.XCD.data.divisionFor(s).expectations || 1) * 100),
        natTitles: (hs.nationalTitlesM || 0) + (hs.nationalTitlesW || 0),
        confTitles: (hs.conferenceTitlesM || 0) + (hs.conferenceTitlesW || 0),
        repFit: Utils.clamp(Math.round(resume - s.prestige * 0.55 + 55), 0, 100),
        promotion: true,
        kind: s.division === (home.division || 'DI') ? 'Head coach job' : `Head coach — ${s.division}`
      };
    }).sort((a, b) => b.prestige - a.prestige);

    gameState.jobOffers = { year: gameState.year, expiresWeek: OFFER_EXPIRY_WEEK, offers, promotion: true };
    gameState.logNews(`📞 Head-coaching interest: ${offers.length === 1 ? offers[0].schoolName + ' wants' : offers.length + ' programs want'} to make you a head coach.`);
  }

  function acceptOffer(gameState, schoolId) {
    const offers = gameState.jobOffers;
    if (!offers || !offers.offers.some((o) => o.schoolId === schoolId)) {
      return { ok: false, message: 'That offer is no longer on the table.' };
    }

    // Assistant → head coach promotion: a distinct transition. The assistant
    // leaves no head-coaching vacancy behind, and takes over the new program
    // (its incumbent, if any, hits the market).
    if (gameState.isAssistant()) {
      const Legacy = window.XCD.engine.Legacy;
      const oldSchool = gameState.getPlayerSchool();
      const newSchool = gameState.getSchool(schoolId);
      const coach = gameState.getPlayerCoach();
      const rng = new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 37 + schoolId.length) >>> 0);

      Legacy.closeStint(gameState, coach, oldSchool, gameState.year);
      if (oldSchool.assistantId === coach.id) oldSchool.assistantId = null;

      const incumbent = newSchool.coachId && gameState.world.coaches[newSchool.coachId];
      if (incumbent && !incumbent.isPlayer) {
        Legacy.closeStint(gameState, incumbent, newSchool, gameState.year);
        incumbent.schoolId = null;
        incumbent.hotSeat = 0;
        incumbent.poolYears = 0;
      }
      coach.role = 'Head';
      gameState.playerRole = 'Head';
      newSchool.coachId = coach.id;
      coach.schoolId = newSchool.id;
      coach.yearsAtSchool = 0;
      coach.hotSeat = 0;
      gameState.playerSchoolId = newSchool.id;
      Legacy.openStint(gameState, coach, newSchool, gameState.year + 1);
      newSchool.coachChangedYear = gameState.year;

      gameState.training.overrides = {};
      gameState.training.mileageOverrides = {};
      gameState.culture.captains = { M: [], W: [] };
      gameState.recruiting.budgetLeft = Math.round(newSchool.budget.recruiting * 0.5);
      gameState.lastPlayerMeetId = null;
      gameState.jobOffers = null;
      gameState.weeklyFlow.trainingConfirmed = false; // now a head coach — you plan again

      gameState.career.stops = gameState.career.stops || [];
      gameState.career.stops.push({ school: newSchool.name, startYear: gameState.year + 1, role: 'Head' });

      gameState.logNews(`🎉 PROMOTION: You leave your assistant post at ${oldSchool.name} to become head coach at ${newSchool.name} (${newSchool.conference})!`);
      return { ok: true, message: `You're the head coach at ${newSchool.name}!` };
    }
    const Legacy = window.XCD.engine.Legacy;
    const oldSchool = gameState.getPlayerSchool();
    const newSchool = gameState.getSchool(schoolId);
    const coach = gameState.getPlayerCoach();
    const rng = new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 31 + schoolId.length) >>> 0);

    // Your departure opens a real vacancy behind you.
    Legacy.closeStint(gameState, coach, oldSchool, gameState.year);
    oldSchool.coachId = null;
    oldSchool.coachChangedYear = gameState.year;
    fillVacancy(gameState, oldSchool, rng, 0);

    // If the new chair somehow still has a sitting coach, they hit the market.
    const incumbent = newSchool.coachId && gameState.world.coaches[newSchool.coachId];
    if (incumbent) {
      Legacy.closeStint(gameState, incumbent, newSchool, gameState.year);
      incumbent.schoolId = null;
      incumbent.hotSeat = 0;
    }
    newSchool.coachId = coach.id;
    coach.schoolId = newSchool.id;
    coach.yearsAtSchool = 0;
    gameState.playerSchoolId = newSchool.id;
    Legacy.openStint(gameState, coach, newSchool, gameState.year + 1);
    newSchool.coachChangedYear = gameState.year;

    // Session state tied to the old program resets.
    gameState.training.overrides = {};
    gameState.training.mileageOverrides = {};
    gameState.culture.captains = { M: [], W: [] };
    gameState.recruiting.budgetLeft = Math.round(newSchool.budget.recruiting * 0.5); // mid-cycle move
    gameState.lastPlayerMeetId = null;
    gameState.jobOffers = null;

    gameState.career.stops = gameState.career.stops || [];
    gameState.career.stops.push({ school: newSchool.name, startYear: gameState.year + 1 });

    gameState.logNews(`🚨 COACHING MOVE: You leave ${oldSchool.name} for ${newSchool.name} (${newSchool.conference}). The rebuild begins.`);
    return { ok: true, message: `Welcome to ${newSchool.name}!` };
  }

  function declineOffers(gameState) {
    if (!gameState.jobOffers) return;
    gameState.logNews(`You turn down outside interest and recommit to ${gameState.getPlayerSchool().name}.`);
    gameState.jobOffers = null;
  }

  function expireOffers(gameState) {
    if (gameState.jobOffers &&
        (gameState.week > gameState.jobOffers.expiresWeek || gameState.year !== gameState.jobOffers.year)) {
      gameState.jobOffers = null;
    }
  }

  /* ---------------- The market ---------------- */
  function freeAgents(gameState) {
    return Object.values(gameState.world.coaches)
      .filter((c) => !c.isPlayer && !c.schoolId && c.role === 'Head');
  }

  /*
   * Fill one vacancy from the market. Chains are real: hiring a sitting
   * coach opens their old chair (depth-limited so the carousel settles).
   */
  function fillVacancy(gameState, school, rng, depth) {
    const Legacy = window.XCD.engine.Legacy;
    const rankIndex = {};
    if (gameState.rankings) {
      gameState.rankings.M.forEach((r) => { rankIndex[r.schoolId] = Math.min(rankIndex[r.schoolId] || 999, r.rank); });
      gameState.rankings.W.forEach((r) => { rankIndex[r.schoolId] = Math.min(rankIndex[r.schoolId] || 999, r.rank); });
    }

    // 1) Poach a sitting coach whose reputation outgrew their program —
    //    the natural ladder: DIII champion → DII → low-major → power
    //    conference → blue blood (division-agnostic by design).
    if (depth < 2 && school.prestige >= 45 && rng.bool(0.6)) {
      const targets = Object.values(gameState.world.schools)
        .filter((s) => {
          if (s.id === school.id || s.id === gameState.playerSchoolId) return false;
          if (s.prestige > school.prestige - 10) return false;
          const c = s.coachId && gameState.world.coaches[s.coachId];
          if (!c || c.isPlayer) return false;
          return (c.reputation || 0) >= school.prestige * 0.65 - 5 || (rankIndex[s.id] || 999) <= 35;
        })
        .sort((a, b) => (gameState.world.coaches[b.coachId].reputation || 0) - (gameState.world.coaches[a.coachId].reputation || 0));
      if (targets.length) {
        const from = targets[rng.int(0, Math.min(2, targets.length - 1))];
        const c = gameState.world.coaches[from.coachId];
        Legacy.closeStint(gameState, c, from, gameState.year);
        from.coachId = null;
        from.coachChangedYear = gameState.year;
        school.coachId = c.id;
        c.schoolId = school.id;
        c.yearsAtSchool = 0;
        c.hotSeat = 0;
        Legacy.openStint(gameState, c, school, gameState.year);
        school.coachChangedYear = gameState.year;
        gameState.logNews(`POACHED: ${school.name} hires ${c.fullName} away from ${from.name} (${(c.reputationLevel || {}).label || 'rising name'}).`);
        fillVacancy(gameState, from, rng, depth + 1);
        return c;
      }
    }

    // 2) The free-agent pool: fired coaches wait for the phone to ring.
    const pool = freeAgents(gameState)
      .filter((c) => (c.reputation || 0) >= school.prestige * 0.45 - 10)
      .sort((a, b) => (b.reputation || 0) - (a.reputation || 0));
    if (pool.length && rng.bool(0.7)) {
      const c = pool[rng.int(0, Math.min(1, pool.length - 1))];
      school.coachId = c.id;
      c.schoolId = school.id;
      c.yearsAtSchool = 0;
      c.hotSeat = 0;
      Legacy.openStint(gameState, c, school, gameState.year);
      school.coachChangedYear = gameState.year;
      gameState.logNews(`SECOND ACT: ${school.name} gives ${c.fullName} another shot at a head job.`);
      return c;
    }

    // 3) Promote an unknown assistant — everyone's career starts somewhere.
    // Fresh coaches enter the profession young (25-40), per Update 3.
    const replacement = window.XCD.engine.WorldGenerator.buildReplacementCoach(rng, school);
    replacement.age = rng.int(25, 40);
    replacement.reputation = Utils.clamp(replacement.reputation || 15, 3, 30); // an unknown, by definition
    replacement.stints = [];
    gameState.world.coaches[replacement.id] = replacement;
    school.coachId = replacement.id;
    replacement.schoolId = school.id;
    Legacy.openStint(gameState, replacement, school, gameState.year);
    school.coachChangedYear = gameState.year;
    gameState.logNews(`${school.name} promotes ${replacement.fullName} to head coach — a first big break.`);
    return replacement;
  }

  /*
   * The offseason carousel, run at the year rollover (after coach aging).
   *  - Retirements: random, always 75+.
   *  - Vacancies (from firings + retirements + moves) get filled.
   *  - Free agents nobody calls eventually retire quietly.
   */
  function runCarousel(gameState, rng) {
    const Legacy = window.XCD.engine.Legacy;

    // Retirements
    Object.values(gameState.world.schools).forEach((school) => {
      const coach = school.coachId && gameState.world.coaches[school.coachId];
      if (!coach || coach.isPlayer) return;
      // Some coaches retire earlier than their clock (Update 3): a small,
      // age-scaled chance from the late 60s on — burnout, health, a good
      // stopping point. Most still coach until 75+.
      const earlyRetire = coach.age >= 66 && rng.bool(Math.min(0.14, (coach.age - 65) * 0.02));
      if (coach.age >= coach.retireAge || earlyRetire) {
        Legacy.closeStint(gameState, coach, school, gameState.year);
        Legacy.recordRetiredCoach(gameState, coach, 'retired');
        delete gameState.world.coaches[coach.id];
        school.coachId = null;
        school.coachChangedYear = gameState.year;
        gameState.logNews(`RETIREMENT: ${coach.fullName} steps away at ${coach.age} after ${coach.careerRecord.seasons || 'many'} seasons (${coach.careerRecord.nationalTitles} national titles).`);
      }
    });

    // Fill every open chair, biggest jobs first (so the ladder cascades).
    Object.values(gameState.world.schools)
      .filter((s) => !s.coachId || !gameState.world.coaches[s.coachId])
      .sort((a, b) => b.prestige - a.prestige)
      .forEach((school) => { fillVacancy(gameState, school, rng, 0); });

    // The pool thins: no calls for years, or simply time to go.
    freeAgents(gameState).forEach((c) => {
      c.poolYears = (c.poolYears || 0) + 1;
      if (c.age >= c.retireAge || c.poolYears >= 3) {
        Legacy.recordRetiredCoach(gameState, c, c.age >= c.retireAge ? 'retired' : 'faded');
        delete gameState.world.coaches[c.id];
      }
    });
  }

  /* ---------------- Coach rankings ---------------- */
  function coachRankings(gameState) {
    const ranks = { M: {}, W: {} };
    if (gameState.rankings) {
      ['M', 'W'].forEach((g) => gameState.rankings[g].forEach((r) => { ranks[g][r.schoolId] = r.rank; }));
    }
    const total = gameState.rankings ? gameState.rankings.M.length : 354;
    const rows = [];
    Object.values(gameState.world.schools).forEach((school) => {
      const coach = gameState.getCoach(school.coachId);
      if (!coach) return;
      const bestRank = Math.min(ranks.M[school.id] || total, ranks.W[school.id] || total);
      const cr = coach.careerRecord || { conferenceTitles: 0, nationalTitles: 0 };
      const score = Math.round(
        cr.nationalTitles * 30 + cr.conferenceTitles * 5 +
        (total - bestRank) / 8 + (coach.reputation || 25) * 0.5 +
        coach.overallRating * 0.15 + coach.yearsAtSchool * 0.3
      );
      rows.push({
        coachId: coach.id, name: coach.fullName, isPlayer: coach.isPlayer,
        school: school.name, schoolId: school.id, personality: coach.archetype,
        reputation: Math.round(coach.reputation || 0),
        repLabel: (coach.reputationLevel || {}).label || '',
        natTitles: cr.nationalTitles, confTitles: cr.conferenceTitles,
        bestRank, score
      });
    });
    rows.sort((a, b) => b.score - a.score);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }

  window.XCD.engine.Careers = {
    generateOffers, generateAssistantOffers, acceptOffer, declineOffers, expireOffers,
    runCarousel, fillVacancy, coachRankings
  };
})();
