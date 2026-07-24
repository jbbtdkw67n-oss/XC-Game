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
   * Update 6, Section 10: elite programs also occasionally court a proven
   * head coach for a top assistant job — career paths bend both ways.
   */
  // Once a position is accepted, the carousel is closed to the player until
  // the next hiring cycle (Update 11) — no lingering or late offers.
  function searchClosed(gameState) {
    return gameState.jobSearchClosedYear === gameState.year;
  }

  function generateOffers(gameState, rng) {
    if (searchClosed(gameState)) return;
    generateHeadCoachOffers(gameState, rng);
    maybeEliteAssistantOffer(gameState, rng);
  }

  function generateHeadCoachOffers(gameState, rng) {
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

    // The open job market (spec Part 2): EVERY vacant chair is listed —
    // Division I, II, and III — and the player may apply to any of them.
    // Each listing carries the school's Interest in the player: the literal
    // percent chance they hire you when you apply. Long-shot chairs stay
    // visible; they simply tend to go another direction.
    const offers = vacancies
      .map((s) => buildOfferRow(gameState, school, resume, s))
      .sort((a, b) => b.prestige - a.prestige);

    gameState.jobOffers = { year: gameState.year, expiresWeek: OFFER_EXPIRY_WEEK, offers };
    const hot = offers.filter((o) => (o.interest || 0) >= 60).length;
    gameState.logNews(`📞 The coaching market opens: ${offers.length} head-coaching ${offers.length === 1 ? 'chair is' : 'chairs are'} open across the country${hot ? ` — ${hot} with genuine interest in you` : ''}.`);
  }

  function bestRankOf(gameState, sid) {
    const r = gameState.rankings;
    if (!r) return null;
    const m = r.M.find((x) => x.schoolId === sid);
    const w = r.W.find((x) => x.schoolId === sid);
    const b = Math.min(m ? m.rank : 999, w ? w.rank : 999);
    return b < 999 ? b : null;
  }

  function buildOfferRow(gameState, school, resume, s) {
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
      bestRank: bestRankOf(gameState, s.id),
      expectations: Math.round((window.XCD.data.divisionFor(s).expectations || 1) * 100),
      natTitles: (hs.nationalTitlesM || 0) + (hs.nationalTitlesW || 0),
      confTitles: (hs.conferenceTitlesM || 0) + (hs.conferenceTitlesW || 0),
      repFit: Utils.clamp(Math.round(resume - (s.prestige * 0.68 - 10) + 50), 0, 100),
      // The school's interest in the player — the percent chance an
      // application lands the job. Never 0 (chairs take fliers) and never
      // 100 (a school can always go another direction).
      interest: Utils.clamp(Math.round(resume - (s.prestige * 0.68 - 10) + 55), 4, 95),
      kind: crossDiv && (s.division === 'DII' || s.division === 'DIII') && (school.division === 'DI')
          ? `Move to ${s.division}`
        : crossDiv && school.division !== 'DI' && s.division === 'DI' ? 'Jump to DI'
        : s.prestige >= 85 && s.conferenceTier === 1 ? 'Dream job'
        : s.prestige >= school.prestige + 10 ? 'Step up'
        : s.prestige >= school.prestige - 8 ? 'Lateral move'
        : 'Step down'
    };
  }

  /*
   * The offseason job market keeps moving (spec Part 2): week to week new
   * openings surface — any division, looser fit — and the occasional listing
   * gets filled behind the scenes. Head-coach path only; assistant players
   * have their own promotion market.
   */
  function evolveJobMarket(gameState, rng) {
    if (searchClosed(gameState)) return; // committed for the season — no new listings
    if (gameState.isAssistant()) return;
    if (gameState.seasonPhase !== 'Offseason' || gameState.week >= OFFER_EXPIRY_WEEK) return;
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    if (!school || !coach) return;
    const resumeLite = (coach.reputation || 20) + Math.max(0, school.prestige - 35) * 0.30;

    let market = gameState.jobOffers;
    if (market && market.promotion) return; // assistant promotion offers evolve elsewhere

    // A listing occasionally gets filled behind the scenes — the chair
    // genuinely fills (not just a cosmetic removal), so the world stays
    // consistent with the board.
    if (market && market.offers.filter((o) => !o.rejected).length > 2 && rng.bool(0.15)) {
      // Only head-coach listings fill behind the scenes — a direct assistant
      // offer stays on the table until the market closes.
      const open = market.offers.filter((o) => !o.rejected && !o.assistantRole && (o.interest || 50) < 75);
      if (open.length) {
        const gone = rng.choice(open);
        const s = gameState.getSchool(gone.schoolId);
        if (s && !s.coachId) fillVacancy(gameState, s, rng, 0);
        market.offers = market.offers.filter((o) => o !== gone);
        gameState.logNews(`Job market: ${gone.schoolName} fills its head-coaching vacancy — that door closes.`);
      }
    }

    // Any chair that opened since the market posted (poach chains, late
    // firings) joins the board — every opening is always visible.
    const offeredIds = new Set(((market && market.offers) || []).map((o) => o.schoolId));
    const fresh = Object.values(gameState.world.schools).filter((s) =>
      s.id !== gameState.playerSchoolId && !offeredIds.has(s.id) &&
      (!s.coachId || !gameState.world.coaches[s.coachId]));
    fresh.forEach((s) => {
      if (!market) {
        market = gameState.jobOffers = { year: gameState.year, expiresWeek: OFFER_EXPIRY_WEEK, offers: [] };
      }
      market.offers.push(buildOfferRow(gameState, school, resumeLite, s));
      gameState.logNews(`📞 New opening: ${s.name} (${s.division || 'DI'}, ${s.conference}) begins a head-coaching search.`);
    });
    if (market && fresh.length) market.offers.sort((a, b) => b.prestige - a.prestige);
  }

  /*
   * Assistant-seat offers are STEP-UP moves only (Update X.1): a program
   * courts you for its staff only when the move is clearly upward — never
   * a lateral shuffle, never a step down. And because the assistant ladder
   * runs through Division I, DII seats are almost never dangled (a DII
   * flagship makes the rare call) and DIII seats never are.
   */
  function assistantSeatPool(gameState, rng, minPrestige, maxPrestige, taken) {
    return Object.values(gameState.world.schools).filter((s) => {
      if (s.id === gameState.playerSchoolId || (taken && taken.has(s.id))) return false;
      if (s.prestige < minPrestige) return false;                 // steps up only
      if (maxPrestige !== null && s.prestige > maxPrestige) return false; // within résumé reach
      const div = s.division || 'DI';
      if (div === 'DIII') return false;                            // never a DIII seat
      if (div === 'DII' && !rng.bool(0.08)) return false;          // almost never DII
      const head = s.coachId && gameState.world.coaches[s.coachId];
      if (!head || head.isPlayer) return false;                    // a real staff to join
      const sitting = s.assistantId && gameState.world.coaches[s.assistantId];
      return !sitting || !sitting.isPlayer;
    });
  }

  function assistantOfferRow(gameState, s, rep, kind) {
    const hs = s.historicalSuccess || {};
    return {
      schoolId: s.id, schoolName: s.name, prestige: s.prestige, conference: s.conference,
      division: s.division || 'DI', budget: s.budget.total, facilities: s.facilitiesOverall,
      academics: s.academics, bestRank: null,
      expectations: Math.round((window.XCD.data.divisionFor(s).expectations || 1) * 100),
      natTitles: (hs.nationalTitlesM || 0) + (hs.nationalTitlesW || 0),
      confTitles: (hs.conferenceTitlesM || 0) + (hs.conferenceTitlesW || 0),
      repFit: Utils.clamp(Math.round(70 + rep - s.prestige * 0.4), 0, 100),
      assistantRole: true,
      kind
    };
  }

  /*
   * Elite assistant offers for sitting head coaches (Update 6, Section 10;
   * reworked in Update X.1). Sometimes the smartest career move is joining
   * a bigger program's staff: recruit inside their machine, build a bigger
   * name, and take a bigger chair later. The call comes most often to a
   * head coach grinding at a weak program or sweating a warm seat — the
   * classic springboard. Accepting switches to the assistant career path.
   */
  function maybeEliteAssistantOffer(gameState, rng) {
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    if (!coach || gameState.isAssistant()) return;
    const rep = coach.reputation || 20;
    if (rep < 22) return;               // big staffs don't court total unknowns
    // The weaker the current program (and the hotter the seat), the more
    // attractive the springboard — and the more often the phone rings.
    let chance = 0.22;
    if (school.prestige < 55) chance += 0.18;
    if ((coach.hotSeat || 0) >= 34) chance += 0.12;
    if (!rng.bool(Math.min(0.5, chance))) return;
    const existing = (gameState.jobOffers && gameState.jobOffers.offers) || [];
    const taken = new Set(existing.map((o) => o.schoolId));
    // A genuine step up: a clearly better program than the one they run.
    const pool = assistantSeatPool(gameState, rng, Math.max(70, school.prestige + 12), null, taken);
    if (!pool.length) return;
    const s = pool[rng.int(0, pool.length - 1)];
    if (!gameState.jobOffers) {
      gameState.jobOffers = { year: gameState.year, expiresWeek: OFFER_EXPIRY_WEEK, offers: [] };
    }
    gameState.jobOffers.offers.push(assistantOfferRow(gameState, s, rep, 'Elite assistant post'));
    gameState.logNews(`📞 ${s.name} wants you to run their recruiting as a top assistant — a springboard inside one of the sport's biggest machines.`);
  }

  /*
   * Assistant-coach offers (Update 5, Part 4; expanded in Update X.1). A
   * recruiting coordinator who builds classes earns two kinds of calls:
   *  - head-coach offers, first at smaller programs, then bigger ones as
   *    the reputation grows — the payoff of the assistant path; and
   *  - BIGGER assistant seats: strictly step-up moves to clearly better
   *    programs (almost always Division I — a DII seat is a rare flagship
   *    call, a DIII seat never comes), so a low-level assistant can climb
   *    the staff ladder without waiting for a head chair.
   */
  function generateAssistantOffers(gameState, rng) {
    if (searchClosed(gameState)) return;
    const coach = gameState.getPlayerCoach();
    const home = gameState.getPlayerSchool();
    const rep = coach.reputation || 12;
    const offers = [];

    // A) Head-coach promotions from genuine vacancies (fired/retired/open).
    const vacancies = Object.values(gameState.world.schools).filter((s) =>
      s.id !== gameState.playerSchoolId && (!s.coachId || !gameState.world.coaches[s.coachId]));

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
    let interested = candidates.filter(() => rng.bool(Utils.clamp(0.22 + resume / 160, 0.2, 0.7)));
    if (!interested.length && (bestClass && bestClass <= 15) && candidates.length) {
      interested = [rng.choice(candidates)];
    }
    rng.shuffle(interested).slice(0, 3).forEach((s) => {
      const hs = s.historicalSuccess || {};
      offers.push({
        schoolId: s.id, schoolName: s.name, prestige: s.prestige, conference: s.conference,
        division: s.division || 'DI', budget: s.budget.total, facilities: s.facilitiesOverall,
        academics: s.academics, bestRank: null,
        expectations: Math.round((window.XCD.data.divisionFor(s).expectations || 1) * 100),
        natTitles: (hs.nationalTitlesM || 0) + (hs.nationalTitlesW || 0),
        confTitles: (hs.conferenceTitlesM || 0) + (hs.conferenceTitlesW || 0),
        repFit: Utils.clamp(Math.round(resume - s.prestige * 0.55 + 55), 0, 100),
        promotion: true,
        kind: s.division === (home.division || 'DI') ? 'Head coach job' : `Head coach — ${s.division}`
      });
    });

    // B) Bigger assistant seats (Update X.1): strictly upward, within reach
    //    of the résumé, and essentially a Division I ladder. The stronger
    //    the reputation, the more often — and the higher — the calls come.
    if (rng.bool(Utils.clamp(0.25 + rep / 130, 0.25, 0.65))) {
      const taken = new Set(offers.map((o) => o.schoolId));
      const pool = assistantSeatPool(gameState, rng,
        home.prestige + 10,           // steps up only — never lateral, never down
        rep * 1.2 + 34,               // a résumé opens doors only so far up
        taken);
      const count = pool.length && rng.bool(0.3) ? 2 : pool.length ? 1 : 0;
      rng.shuffle(pool).slice(0, count).forEach((s) => {
        offers.push(assistantOfferRow(gameState, s, rep, 'Bigger assistant job'));
      });
    }

    if (!offers.length) { gameState.jobOffers = null; return; }
    offers.sort((a, b) => b.prestige - a.prestige);
    const promos = offers.filter((o) => o.promotion).length;
    gameState.jobOffers = {
      year: gameState.year, expiresWeek: OFFER_EXPIRY_WEEK, offers,
      promotion: promos > 0
    };
    if (promos) {
      gameState.logNews(`📞 Head-coaching interest: ${promos === 1 ? offers.find((o) => o.promotion).schoolName + ' wants' : promos + ' programs want'} to make you a head coach.`);
    }
    const seats = offers.filter((o) => o.assistantRole);
    if (seats.length) {
      gameState.logNews(`📞 ${seats.map((o) => o.schoolName).join(' and ')} ${seats.length === 1 ? 'wants' : 'want'} you on staff — a bigger assistant job, a step up the ladder.`);
    }
  }

  /*
   * Accepting ANY position ends the offseason job search (Update 11): every
   * remaining offer disappears, no school may extend a new one until the
   * next hiring cycle, and the accepted chair is final for the season. The
   * schools that were passed over keep searching — their vacancies fill
   * through the normal carousel — and next offseason opens fresh.
   */
  function closeJobSearch(gameState) {
    gameState.jobOffers = null;
    gameState.jobSearchClosedYear = gameState.year;
    // Taking any outside job makes a pending internal promotion moot (Update 17).
    gameState.headCoachDeparture = null;
  }

  function acceptOffer(gameState, schoolId) {
    const offers = gameState.jobOffers;
    if (!offers || !offers.offers.some((o) => o.schoolId === schoolId)) {
      return { ok: false, message: 'That offer is no longer on the table.' };
    }
    const offer = offers.offers.find((o) => o.schoolId === schoolId);

    // Head coach → elite assistant (Update 6, Section 10): step off the hot
    // seat and into a blue-blood staff. Your old chair opens for real.
    if (offer && offer.assistantRole && !gameState.isAssistant()) {
      const Legacy = window.XCD.engine.Legacy;
      const oldSchool = gameState.getPlayerSchool();
      const newSchool = gameState.getSchool(schoolId);
      const coach = gameState.getPlayerCoach();
      const rng = new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 41 + schoolId.length) >>> 0);

      Legacy.closeStint(gameState, coach, oldSchool, gameState.year, 'left');
      oldSchool.coachId = null;
      oldSchool.coachChangedYear = gameState.year;
      fillVacancy(gameState, oldSchool, rng, 0);

      const asst = newSchool.assistantId && gameState.world.coaches[newSchool.assistantId];
      if (asst && !asst.isPlayer) {
        Legacy.closeStint(gameState, asst, newSchool, gameState.year, 'released');
        Legacy.recordRetiredCoach(gameState, asst, 'released'); // no coach ever vanishes (Phase 3)
        delete gameState.world.coaches[asst.id];
      }
      coach.role = 'Assistant';
      gameState.playerRole = 'Assistant';
      coach.schoolId = newSchool.id;
      coach.yearsAtSchool = 0;
      coach.hotSeat = 0;
      coach.hotSeatYears = 0;
      newSchool.assistantId = coach.id;
      gameState.playerSchoolId = newSchool.id;
      Legacy.openStint(gameState, coach, newSchool, gameState.year + 1);
      Legacy.linkStaff(gameState, newSchool, gameState.year);

      gameState.training.overrides = {};
      gameState.training.mileageOverrides = {};
      gameState.culture.captains = { M: [], W: [] };
      gameState.recruiting.budgetLeft = Math.round(newSchool.budget.recruiting * 0.5);
      gameState.recruiting.board = { M: [], W: [] };
      gameState.lastPlayerMeetId = null;
      closeJobSearch(gameState);
      gameState.weeklyFlow.trainingConfirmed = true; // the head coach plans now

      gameState.career.stops = gameState.career.stops || [];
      gameState.career.stops.push({ school: newSchool.name, startYear: gameState.year + 1, role: 'Assistant' });

      gameState.logNews(`🔁 CAREER MOVE: You step down from the ${oldSchool.name} head job to run recruiting at ${newSchool.name} — betting a blue-blood springboard beats a hot seat.`);
      return { ok: true, message: `Welcome to the ${newSchool.name} staff!` };
    }

    // Assistant → bigger assistant seat (Update X.1): the program courted
    // the player to run its recruiting — a strict step up the same career
    // track. The old seat is backfilled so no program runs without a staff.
    if (offer && offer.assistantRole && gameState.isAssistant()) {
      const Legacy = window.XCD.engine.Legacy;
      const WG = window.XCD.engine.WorldGenerator;
      const oldSchool = gameState.getPlayerSchool();
      const newSchool = gameState.getSchool(schoolId);
      const coach = gameState.getPlayerCoach();
      const rng = new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 43 + schoolId.length) >>> 0);

      Legacy.closeStint(gameState, coach, oldSchool, gameState.year, 'left');
      if (oldSchool.assistantId === coach.id) oldSchool.assistantId = null;
      const fill = WG.buildAssistant(rng, oldSchool);
      fill.age = rng.int(25, 40);
      fill.reputation = Utils.clamp(fill.reputation || 12, 3, 28);
      gameState.world.coaches[fill.id] = fill;
      oldSchool.assistantId = fill.id;
      Legacy.linkStaff(gameState, oldSchool, gameState.year);

      const displaced = newSchool.assistantId && gameState.world.coaches[newSchool.assistantId];
      if (displaced && !displaced.isPlayer) {
        Legacy.closeStint(gameState, displaced, newSchool, gameState.year, 'released');
        Legacy.recordRetiredCoach(gameState, displaced, 'released'); // no coach ever vanishes (Phase 3)
        delete gameState.world.coaches[displaced.id];
      }
      coach.schoolId = newSchool.id;
      coach.yearsAtSchool = 0;
      newSchool.assistantId = coach.id;
      gameState.playerSchoolId = newSchool.id;
      Legacy.openStint(gameState, coach, newSchool, gameState.year + 1);
      Legacy.linkStaff(gameState, newSchool, gameState.year);

      gameState.training.overrides = {};
      gameState.training.mileageOverrides = {};
      gameState.culture.captains = { M: [], W: [] };
      gameState.recruiting.budgetLeft = Math.round(newSchool.budget.recruiting * 0.5);
      gameState.recruiting.board = { M: [], W: [] };
      gameState.lastPlayerMeetId = null;
      closeJobSearch(gameState);
      gameState.weeklyFlow.trainingConfirmed = true; // still an assistant — the head coach plans

      gameState.career.stops = gameState.career.stops || [];
      gameState.career.stops.push({ school: newSchool.name, startYear: gameState.year + 1, role: 'Assistant' });

      gameState.logNews(`📶 CAREER MOVE: You leave ${oldSchool.name} for a bigger assistant post at ${newSchool.name} — a step up the recruiting ladder.`);
      return { ok: true, message: `Welcome to the ${newSchool.name} staff!` };
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

      Legacy.closeStint(gameState, coach, oldSchool, gameState.year, 'promoted');
      if (oldSchool.assistantId === coach.id) oldSchool.assistantId = null;
      // Your old boss's coaching tree grows a branch (Update 6).
      Legacy.creditPromotion(gameState, coach, newSchool, gameState.year);

      const incumbent = newSchool.coachId && gameState.world.coaches[newSchool.coachId];
      if (incumbent && !incumbent.isPlayer) {
        Legacy.closeStint(gameState, incumbent, newSchool, gameState.year, 'fired');
        incumbent.schoolId = null;
        incumbent.hotSeat = 0;
        incumbent.hotSeatYears = 0;
        incumbent.poolYears = 0;
      }
      coach.role = 'Head';
      gameState.playerRole = 'Head';
      // Assistant prestige does not transfer 1:1 into a head-coaching
      // reputation (Phase 13): the converted value reflects the résumé but
      // is always a step down — first-time head coaches prove themselves.
      window.XCD.engine.Coaching.convertAssistantPrestige(coach);
      newSchool.coachId = coach.id;
      coach.schoolId = newSchool.id;
      coach.yearsAtSchool = 0;
      coach.hotSeat = 0;
      coach.hotSeatYears = 0;
      gameState.playerSchoolId = newSchool.id;
      Legacy.openStint(gameState, coach, newSchool, gameState.year + 1);
      newSchool.coachChangedYear = gameState.year;

      gameState.training.overrides = {};
      gameState.training.mileageOverrides = {};
      gameState.culture.captains = { M: [], W: [] };
      gameState.recruiting.budgetLeft = Math.round(newSchool.budget.recruiting * 0.5);
      gameState.lastPlayerMeetId = null;
      closeJobSearch(gameState);
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
    Legacy.closeStint(gameState, coach, oldSchool, gameState.year, 'left');
    oldSchool.coachId = null;
    oldSchool.coachChangedYear = gameState.year;
    fillVacancy(gameState, oldSchool, rng, 0);

    // If the new chair somehow still has a sitting coach, they hit the market.
    const incumbent = newSchool.coachId && gameState.world.coaches[newSchool.coachId];
    if (incumbent) {
      Legacy.closeStint(gameState, incumbent, newSchool, gameState.year, 'fired');
      incumbent.schoolId = null;
      incumbent.hotSeat = 0;
    }
    newSchool.coachId = coach.id;
    coach.schoolId = newSchool.id;
    coach.yearsAtSchool = 0;
    // Hot Seat Reset (spec Part 2): pressure never follows a coach to a new
    // job. Reputation transfers; the seat starts Stable, and expectations
    // are recalculated against the new school only.
    coach.hotSeat = 0;
    coach.hotSeatYears = 0;
    gameState.playerSchoolId = newSchool.id;
    Legacy.openStint(gameState, coach, newSchool, gameState.year + 1);
    newSchool.coachChangedYear = gameState.year;

    // Session state tied to the old program resets.
    gameState.training.overrides = {};
    gameState.training.mileageOverrides = {};
    gameState.culture.captains = { M: [], W: [] };
    gameState.recruiting.budgetLeft = Math.round(newSchool.budget.recruiting * 0.5); // mid-cycle move
    gameState.lastPlayerMeetId = null;
    closeJobSearch(gameState);

    gameState.career.stops = gameState.career.stops || [];
    gameState.career.stops.push({ school: newSchool.name, startYear: gameState.year + 1 });

    gameState.logNews(`🚨 COACHING MOVE: You leave ${oldSchool.name} for ${newSchool.name} (${newSchool.conference}). The rebuild begins.`);
    return { ok: true, message: `Welcome to ${newSchool.name}!` };
  }

  /*
   * Apply for a listed opening (spec: the player may pursue ANY chair).
   * The school's interest is the literal chance they hire you — fail the
   * roll and they go another direction: the chair fills with someone else
   * and the listing closes. The outcome is seeded per chair/year, so
   * re-clicking can't reroll a rejection. Direct offers (elite assistant
   * posts, assistant promotions) skip the roll — those schools courted YOU.
   */
  // The deterministic per-chair search draw: each opening quietly settled on
  // how strong a candidate it would take this cycle, so re-clicking Apply can
  // never reroll a rejection. Hired iff the draw clears the interest chance.
  function applicationRoll(gameState, schoolId) {
    let h = 0;
    for (let i = 0; i < schoolId.length; i++) h = ((h * 31) + schoolId.charCodeAt(i)) >>> 0;
    const rng = new window.XCD.core.SeededRNG((gameState.seed ^ (gameState.year * 131) ^ h) >>> 0);
    return rng.next();
  }

  function applyForJob(gameState, schoolId) {
    if (searchClosed(gameState)) {
      return { ok: false, message: 'You already accepted a position this offseason — the carousel reopens next cycle.' };
    }
    const market = gameState.jobOffers;
    const offer = market && market.offers.find((o) => o.schoolId === schoolId);
    if (!offer) return { ok: false, message: 'That opening is no longer listed.' };
    if (offer.assistantRole || market.promotion) return acceptOffer(gameState, schoolId);
    if (offer.rejected) return { ok: false, message: `${offer.schoolName} already went another direction.` };
    if (gameState.seasonPhase !== 'Offseason') {
      return { ok: false, message: 'The coaching market runs in the offseason.' };
    }
    if (applicationRoll(gameState, schoolId) < (offer.interest ?? 50) / 100) {
      return acceptOffer(gameState, schoolId);
    }
    // Passed over: the school hires someone else and the listing closes.
    offer.rejected = true;
    const school = gameState.getSchool(schoolId);
    const rng = new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 977 + schoolId.length) >>> 0);
    fillVacancy(gameState, school, rng, 0);
    const hired = school.coachId && gameState.world.coaches[school.coachId];
    gameState.logNews(`Passed over: ${school.name} goes another direction${hired ? ` and hires ${hired.fullName}` : ''} — with ${offer.interest}% interest, your candidacy fell short.`);
    return {
      ok: false, rejected: true,
      message: `${school.name} went another direction${hired ? ` — they hired ${hired.fullName}` : ''}.`
    };
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

  /* ---------------- Candidate evaluation (Update 16) ---------------- *
   * Schools rank coaching candidates on merit, and candidates decide by their
   * own hidden ambition. The player's assistants run through this exact same
   * machinery — no special protection: if a program judges your coordinator
   * the best candidate, and their ambition says go, they leave.
   */
  function ambitionOf(coach) {
    return window.XCD.data.coachAmbition(coach && coach.ambition) ||
      { weightHC: 1, weightLateral: 1, prestigePull: 1, stay: 1 };
  }

  // How attractive `coach` is to a hiring `school`. Values what athletic
  // directors actually weigh: recruiting and development ability, career
  // success, recent team results, experience, and stature-to-job fit. Pass a
  // prebuilt schoolId→bestRank index to skip rescanning the polls per call.
  function candidateScore(gameState, coach, school, rankIndex) {
    const cr = coach.careerRecord || {};
    const rep = coach.reputation || 15;
    const total = window.XCD.engine.Coaching.divisionSize(gameState, school.division);
    let score = rep;
    score += (coach.recruiting || 55) * 0.18;   // recruiting ability
    score += (coach.training || 55) * 0.14;     // development ability
    score += Math.min(24, (cr.nationalTitles || 0) * 8 + (cr.conferenceTitles || 0) * 2); // career success
    score += Math.min(12, (cr.allAmericans || 0) * 0.5);   // producing national-caliber athletes
    const recent = rankIndex                                 // recent team success
      ? (rankIndex[coach.schoolId] && rankIndex[coach.schoolId] < 999 ? rankIndex[coach.schoolId] : null)
      : bestRankOf(gameState, coach.schoolId);
    if (recent !== null) {
      if (recent <= total * 0.05) score += 12;
      else if (recent <= total * 0.15) score += 7;
      else if (recent <= total * 0.4) score += 3;
    }
    score += Math.min(10, (cr.seasons || 0) * 0.5);         // experience
    score -= Math.abs(rep - school.prestige * 0.7) * 0.22;  // prestige fit
    return score;
  }

  // Does a candidate accept a HEAD-coaching promotion? A head job is a rung up
  // for almost anyone, but ambition still bends it: a Loyal coach in a good
  // spot may pass, a Prestige/Money chaser won't run a bottom-tier program
  // once established, and a Builder relishes a reclamation project.
  function acceptsHeadJob(coach, fromSchool, toSchool, rng) {
    const am = ambitionOf(coach);
    let p = 0.8 * am.weightHC / Math.max(0.5, am.stay);
    const step = (toSchool.prestige || 40) - (fromSchool ? (fromSchool.prestige || 40) * 0.6 : 22);
    p += Utils.clamp(step / 120, -0.25, 0.25) * am.prestigePull;
    if (am.prestigePull >= 1.3 && toSchool.prestige < 45 && (coach.reputation || 20) > 44) p *= 0.4;
    if (coach.ambition === 'builder' && toSchool.prestige < 58) p += 0.15;
    return rng.bool(Utils.clamp(p, 0.12, 0.97));
  }

  // Does a candidate accept a bigger ASSISTANT seat? More discretionary than a
  // head job — the pull comes from ambition and how much better the program is.
  function acceptsLateral(coach, fromSchool, toSchool, rng) {
    const am = ambitionOf(coach);
    let p = 0.55 * am.weightLateral / Math.max(0.5, am.stay);
    const step = (toSchool.prestige || 40) - (fromSchool ? (fromSchool.prestige || 40) : 40);
    p += Utils.clamp(step / 90, 0, 0.3) * am.prestigePull;
    if (coach.ambition === 'recruiter' && toSchool.prestige >= 72) p += 0.15; // elite recruiting draw
    return rng.bool(Utils.clamp(p, 0.1, 0.9));
  }

  // The player just lost their coordinator (Update 16): a major offseason
  // event. Post the headline, flag it for the dashboard, and leave the seat
  // OPEN — the player replaces them from the hiring pool.
  function notePlayerAssistantDeparture(gameState, coach, destSchool, kind) {
    gameState.assistantDeparture = {
      year: gameState.year, coachName: coach.fullName,
      school: destSchool.name, kind
    };
    const verb = kind === 'head'
      ? `accepts the head coaching job at ${destSchool.name}`
      : `leaves for a bigger assistant post at ${destSchool.name}`;
    gameState.logNews(`📣 STAFF DEPARTURE: your assistant coach ${coach.fullName} ${verb}. Replace them from the hiring pool on My Program.`);
  }

  // Hold the player's head chair open for their own promotion decision when
  // they are the sitting assistant and the head coach departs (Update 17):
  // rather than hire over them, the program offers the associate the top job.
  // Returns true when the seat is claimed for the player (the caller must NOT
  // fill it — it stays open until the player accepts or declines).
  function offerPlayerHeadPromotion(gameState, school, departingCoach, kind) {
    if (!gameState.isAssistant() || school.id !== gameState.playerSchoolId) return false;
    gameState.headCoachDeparture = {
      year: gameState.year,
      coachName: departingCoach ? departingCoach.fullName : 'The head coach',
      kind, schoolId: school.id
    };
    gameState.logNews(`📣 HEAD JOB OPEN AT ${school.name}: with the chair vacant, the program offers YOU the promotion to head coach. Accept or step aside on My Program.`);
    return true;
  }

  /*
   * Fill one vacancy from the market. Chains are real: hiring a sitting
   * coach opens their old chair (depth-limited so the carousel settles).
   */
  function fillVacancy(gameState, school, rng, depth) {
    const Legacy = window.XCD.engine.Legacy;

    // The player is the sitting assistant at a program whose head chair just
    // opened (Update 17): never hire over them. The seat is held for their
    // promotion decision, flagged at the departure site — leave it open.
    if (gameState.isAssistant() && school.id === gameState.playerSchoolId &&
        gameState.headCoachDeparture && gameState.headCoachDeparture.schoolId === school.id) {
      return null;
    }

    const rankIndex = {};
    if (gameState.rankings) {
      gameState.rankings.M.forEach((r) => { rankIndex[r.schoolId] = Math.min(rankIndex[r.schoolId] || 999, r.rank); });
      gameState.rankings.W.forEach((r) => { rankIndex[r.schoolId] = Math.min(rankIndex[r.schoolId] || 999, r.rank); });
    }

    // 0) Internal promotion (Update 17): the program's own associate coach is
    //    frequently the natural successor when a head chair opens — continuity,
    //    a staff already in place, and a coordinator who knows the roster. A
    //    ready assistant gets first refusal before the program looks outside.
    //    Weak programs promote from within readily; blue bloods demand a proven
    //    coordinator (a higher reputation bar) and more often shop outside. The
    //    player's own case is intercepted above; a player-run staff's assistant
    //    (when the player is a head coach elsewhere) is exempted below.
    if (depth < 2) {
      const own = school.assistantId && gameState.world.coaches[school.assistantId];
      const readyBar = school.prestige * 0.48 - 8;
      if (own && !own.isPlayer && own.age >= 30 && (own.reputation || 0) >= readyBar &&
          rng.bool(0.4) && acceptsHeadJob(own, school, school, rng)) {
        school.assistantId = null;
        Legacy.closeStint(gameState, own, school, gameState.year, 'promoted');
        Legacy.creditPromotion(gameState, own, school, gameState.year);
        own.role = 'Head';
        window.XCD.engine.Coaching.convertAssistantPrestige(own);
        own.schoolId = school.id;
        own.yearsAtSchool = 0;
        own.hotSeat = 0;
        own.hotSeatYears = 0;
        school.coachId = own.id;
        Legacy.openStint(gameState, own, school, gameState.year);
        school.coachChangedYear = gameState.year;
        gameState.logNews(`${school.name} promotes assistant ${own.fullName} to head coach — the natural successor steps up from within.`);
        return own;
      }
    }

    // 1) Poach a sitting coach whose reputation outgrew their program —
    //    the natural ladder: DIII champion → DII → low-major → power
    //    conference → blue blood (division-agnostic by design). The player's
    //    own program is shielded while they run it; but when the player is an
    //    ASSISTANT, the head coach they serve is fair game — losing that boss
    //    to a bigger job is exactly what opens the door to their promotion.
    if (depth < 2 && school.prestige >= 45 && rng.bool(0.6)) {
      const targets = Object.values(gameState.world.schools)
        .filter((s) => {
          if (s.id === school.id) return false;
          if (s.id === gameState.playerSchoolId && !gameState.isAssistant()) return false;
          if (s.prestige > school.prestige - 10) return false;
          const c = s.coachId && gameState.world.coaches[s.coachId];
          if (!c || c.isPlayer) return false;
          return (c.reputation || 0) >= school.prestige * 0.65 - 5 || (rankIndex[s.id] || 999) <= 35;
        })
        .sort((a, b) => (gameState.world.coaches[b.coachId].reputation || 0) - (gameState.world.coaches[a.coachId].reputation || 0));
      if (targets.length) {
        const from = targets[rng.int(0, Math.min(2, targets.length - 1))];
        const c = gameState.world.coaches[from.coachId];
        Legacy.closeStint(gameState, c, from, gameState.year, 'left');
        from.coachId = null;
        from.coachChangedYear = gameState.year;
        school.coachId = c.id;
        c.schoolId = school.id;
        c.yearsAtSchool = 0;
        c.hotSeat = 0;
        c.hotSeatYears = 0;
        Legacy.openStint(gameState, c, school, gameState.year);
        school.coachChangedYear = gameState.year;
        gameState.logNews(`POACHED: ${school.name} hires ${c.fullName} away from ${from.name} (${(c.reputationLevel || {}).label || 'rising name'}).`);
        // If we just poached the player's own head coach, hold that chair for
        // the player's promotion decision instead of backfilling it.
        if (offerPlayerHeadPromotion(gameState, from, c, 'left')) return c;
        fillVacancy(gameState, from, rng, depth + 1);
        return c;
      }
    }

    // 1.5) Promote a strong assistant into the head chair — the natural
    //      career step. The program's own assistant gets first crack (internal
    //      promotion); otherwise a standout assistant elsewhere earns their
    //      first head job. Their old assistant seat is refilled by the
    //      assistant carousel afterward.
    if (depth < 2 && rng.bool(0.55)) {
      const readyBar = school.prestige * 0.5 - 8;
      const own = school.assistantId && gameState.world.coaches[school.assistantId];
      // The candidate board: the program's own coordinator (a continuity edge)
      // plus every ready assistant in the country — the player's included, on
      // exactly equal footing (Update 16). Schools rank on merit.
      const board = [];
      if (own && !own.isPlayer && (own.reputation || 0) >= readyBar && own.age >= 30) {
        board.push({ c: own, s: school, internal: true, score: candidateScore(gameState, own, school, rankIndex) + 6 });
      }
      Object.values(gameState.world.schools).forEach((s) => {
        if (s.id === school.id) return;
        const c = s.assistantId && gameState.world.coaches[s.assistantId];
        if (!c || c.isPlayer) return;
        if ((c.reputation || 0) < readyBar + 4 || c.age < 30) return;
        board.push({ c, s, internal: false, score: candidateScore(gameState, c, s, rankIndex) });
      });
      board.sort((a, b) => b.score - a.score);
      // Interview the shortlist; the first whose ambition says yes is hired.
      let pick = null;
      for (const cand of board.slice(0, 5)) {
        if (acceptsHeadJob(cand.c, cand.s, school, rng)) { pick = cand; break; }
      }
      if (pick) {
        const promo = pick.c, fromSchool = pick.s, internal = pick.internal;
        const wasPlayerAsst = fromSchool.id === gameState.playerSchoolId && fromSchool.assistantId === promo.id;
        if (fromSchool.assistantId === promo.id) fromSchool.assistantId = null;
        Legacy.closeStint(gameState, promo, fromSchool, gameState.year, 'promoted');
        // The boss they leave behind earns a branch on the coaching tree.
        Legacy.creditPromotion(gameState, promo, school, gameState.year);
        promo.role = 'Head'; // set before openStint so the program ledger records it
        // Promotion converts (and reduces) assistant prestige (Phase 13).
        window.XCD.engine.Coaching.convertAssistantPrestige(promo);
        promo.schoolId = school.id;
        promo.yearsAtSchool = 0;
        promo.hotSeat = 0;
        promo.hotSeatYears = 0;
        school.coachId = promo.id;
        Legacy.openStint(gameState, promo, school, gameState.year);
        school.coachChangedYear = gameState.year;
        gameState.logNews(`${school.name} promotes ${promo.fullName} to head coach${internal ? ' from within the staff' : ' — a first big break out of ' + fromSchool.name}.`);
        if (wasPlayerAsst) notePlayerAssistantDeparture(gameState, promo, school, 'head');
        return promo;
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

  // Did this coach's program win a national title in the just-ended season?
  // (Titles are recorded under the season's calendar year, which is now
  // gameState.year - 1 because the rollover already advanced the year.)
  function wonNationalTitleLastSeason(gameState, school) {
    const year = gameState.year - 1;
    const nat = (gameState.history.nationalChampions || {})[year] || {};
    return ['M', 'W'].some((g) => {
      const key = (school.division || 'DI') === 'DI' ? g : `${school.division}-${g}`;
      return nat[key] && nat[key].teamId === school.id;
    });
  }

  /*
   * One coach's retirement decision for the offseason carousel (Update 17).
   * Retirements cluster around the coach's personal clock (~age 70, SD ~5),
   * with two extra paths: a small age-scaled EARLY exit from the early 60s on
   * (burnout, health, the right stopping point), and "going out on top" — a
   * veteran who just won it all sometimes walks away a champion rather than
   * chase the encore, and the older they are the more tempting that mic-drop
   * exit. Pure decision, no side effects, so it is unit-testable in isolation.
   */
  function coachRetirementDecision(gameState, coach, school, rng) {
    const wonTitle = wonNationalTitleLastSeason(gameState, school);
    const onTopChance = coach.age >= 72 ? 0.6 : coach.age >= 68 ? 0.42 : coach.age >= 64 ? 0.18 : 0.05;
    const goOutOnTop = wonTitle && rng.bool(onTopChance);
    const earlyRetire = coach.age >= 62 && rng.bool(Math.min(0.16, (coach.age - 61) * 0.022));
    const retires = coach.age >= coach.retireAge || earlyRetire || goOutOnTop;
    return { retires, goOutOnTop, wonTitle };
  }

  /*
   * The offseason carousel, run at the year rollover (after coach aging).
   *  - Retirements: clustered around age 70 (SD ~5), plus "out on top" exits.
   *  - Vacancies (from firings + retirements + moves) get filled.
   *  - Free agents nobody calls eventually retire quietly.
   */
  function runCarousel(gameState, rng) {
    const Legacy = window.XCD.engine.Legacy;

    // Retirements
    Object.values(gameState.world.schools).forEach((school) => {
      const coach = school.coachId && gameState.world.coaches[school.coachId];
      if (!coach || coach.isPlayer) return;
      const { retires, goOutOnTop } = coachRetirementDecision(gameState, coach, school, rng);
      if (retires) {
        Legacy.closeStint(gameState, coach, school, gameState.year, 'retired');
        Legacy.recordRetiredCoach(gameState, coach, 'retired');
        delete gameState.world.coaches[coach.id];
        school.coachId = null;
        school.coachChangedYear = gameState.year;
        const cr = coach.careerRecord;
        if (goOutOnTop) {
          const her = coach.gender === 'W' ? 'she' : 'he';
          gameState.logNews(`🏆 OUT ON TOP: ${coach.fullName} retires at ${coach.age} as a reigning national champion — ${cr.nationalTitles} career title${cr.nationalTitles === 1 ? '' : 's'} — walking away the very season ${her} reached the summit.`);
        } else {
          gameState.logNews(`RETIREMENT: ${coach.fullName} steps away at ${coach.age} after ${cr.seasons || 'many'} seasons (${cr.nationalTitles} national titles).`);
        }
        // If the coach who just retired was the player's own head coach (the
        // player is the sitting assistant), hold the chair for their promotion.
        offerPlayerHeadPromotion(gameState, school, coach, goOutOnTop ? 'onTop' : 'retired');
      }
    });

    // Fill every open chair, biggest jobs first (so the ladder cascades) —
    // except the player's own program when the head seat is being held for
    // their promotion decision (Update 17); that one stays open until they act.
    Object.values(gameState.world.schools)
      .filter((s) => !s.coachId || !gameState.world.coaches[s.coachId])
      .filter((s) => !(gameState.headCoachDeparture && s.id === gameState.headCoachDeparture.schoolId))
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

  /* ---------------- Assistant carousel (Update 6, Phase 3) ----------- *
   * Assistant coaches are living careers, not static names. Every offseason
   * (after the head-coach carousel, which may have promoted some of them):
   *   - aging assistants retire,
   *   - a few weak/stagnant assistants are let go,
   *   - standout assistants step up to bigger assistant jobs, and
   *   - every program that ends up without an assistant hires a fresh one,
   * so the assistant ranks stay full and the ecosystem keeps churning.
   */
  function runAssistantCarousel(gameState, rng) {
    const Legacy = window.XCD.engine.Legacy;
    const WG = window.XCD.engine.WorldGenerator;
    // A single poll snapshot for candidate scoring (recent team success).
    const rankIndex = {};
    if (gameState.rankings) {
      gameState.rankings.M.forEach((r) => { rankIndex[r.schoolId] = Math.min(rankIndex[r.schoolId] || 999, r.rank); });
      gameState.rankings.W.forEach((r) => { rankIndex[r.schoolId] = Math.min(rankIndex[r.schoolId] || 999, r.rank); });
    }

    // Whether the player runs their own staff (a head coach). When they do,
    // their coordinator is fair game for the carousel — no protection — and a
    // departure leaves the seat OPEN for the player to fill from the pool.
    const playerHeadSchoolId = !gameState.isAssistant() ? gameState.playerSchoolId : null;

    // 1) Retirements + firings.
    Object.values(gameState.world.schools).forEach((school) => {
      const asst = school.assistantId && gameState.world.coaches[school.assistantId];
      if (!asst || asst.isPlayer) return;
      const playerAsst = school.id === playerHeadSchoolId;

      const earlyRetire = asst.age >= 61 && rng.bool(Math.min(0.14, (asst.age - 60) * 0.022));
      if (asst.age >= (asst.retireAge || 70) || earlyRetire) {
        Legacy.closeStint(gameState, asst, school, gameState.year, 'retired');
        Legacy.recordRetiredCoach(gameState, asst, 'retired');
        delete gameState.world.coaches[asst.id];
        school.assistantId = null;
        if (playerAsst) {
          gameState.assistantDeparture = { year: gameState.year, coachName: asst.fullName, school: null, kind: 'retired' };
          gameState.logNews(`📣 STAFF DEPARTURE: your assistant coach ${asst.fullName} retires after ${asst.careerRecord.seasons || 'many'} seasons. Hire a replacement from the pool on My Program.`);
        }
        return;
      }
      // Programs churn staff: a weak, stagnating assistant is occasionally let
      // go. The player makes their own firing calls, so never auto-fire theirs.
      if (!playerAsst && (asst.reputation || 0) < 18 && asst.age >= 34 && rng.bool(0.12)) {
        Legacy.closeStint(gameState, asst, school, gameState.year, 'released');
        Legacy.recordRetiredCoach(gameState, asst, 'released'); // history keeps every career (Phase 3)
        delete gameState.world.coaches[asst.id]; // assistants don't pool as free agents
        school.assistantId = null;
      }
    });

    // 2) Upward lateral moves: a standout assistant fills an open assistant
    //    seat at a bigger program, leaving their old seat to be regenerated.
    //    The player's coordinator is a candidate like any other (Update 16) —
    //    if a bigger program judges them the best fit and their ambition says
    //    go, they leave, and the player must replace them.
    Object.values(gameState.world.schools)
      .filter((s) => (!s.assistantId || !gameState.world.coaches[s.assistantId]) && s.prestige >= 55)
      .sort((a, b) => b.prestige - a.prestige)
      .forEach((school) => {
        if (school.assistantId && gameState.world.coaches[school.assistantId]) return;
        if (school.id === gameState.playerSchoolId) return; // the player fills their OWN opening manually
        if (!rng.bool(0.5)) return;
        const cands = Object.values(gameState.world.schools)
          .filter((s) => s.prestige < school.prestige - 8 &&
            s.assistantId && gameState.world.coaches[s.assistantId])
          .map((s) => ({ s, c: gameState.world.coaches[s.assistantId] }))
          .filter(({ c }) => !c.isPlayer && (c.reputation || 0) >= school.prestige * 0.4)
          .map((x) => ({ ...x, score: candidateScore(gameState, x.c, school, rankIndex) }))
          .sort((a, b) => b.score - a.score);
        if (!cands.length) return;
        // Court the shortlist; the first whose ambition says yes takes it.
        let choice = null;
        for (const cand of cands.slice(0, 4)) {
          if (acceptsLateral(cand.c, cand.s, school, rng)) { choice = cand; break; }
        }
        if (!choice) return;
        const from = choice.s, c = choice.c;
        const wasPlayerAsst = from.id === playerHeadSchoolId;
        from.assistantId = null;
        Legacy.closeStint(gameState, c, from, gameState.year, 'left');
        c.schoolId = school.id;
        c.yearsAtSchool = 0;
        school.assistantId = c.id;
        Legacy.openStint(gameState, c, school, gameState.year);
        gameState.logNews(`${c.fullName} lands a bigger assistant job at ${school.name}, leaving ${from.name}.`);
        if (wasPlayerAsst) notePlayerAssistantDeparture(gameState, c, school, 'lateral');
      });

    // 3) Regenerate: every program must have an assistant coach — except the
    //    player's own program when they're a head coach. A vacancy there is a
    //    strategic decision for the player to resolve from the hiring pool, so
    //    it stays open rather than auto-filling with a generic name (Update 16).
    Object.values(gameState.world.schools).forEach((school) => {
      if (school.assistantId && gameState.world.coaches[school.assistantId]) return;
      if (school.id === playerHeadSchoolId) return; // the player hires their own replacement
      const asst = WG.buildAssistant(rng, school);
      asst.age = rng.int(25, 40); // new assistants enter the profession young
      asst.reputation = Utils.clamp(asst.reputation || 12, 3, 28);
      asst.yearsAtSchool = 0;
      asst.careerRecord.seasons = 0;
      asst.stints = [{ schoolId: school.id, school: school.name, division: school.division || 'DI', startYear: gameState.year, endYear: null }];
      gameState.world.coaches[asst.id] = asst;
      school.assistantId = asst.id;
    });

    // 4) Coaching-tree bookkeeping (Update 6): whoever the head coach is now,
    //    the assistant works for them — mentors and workedFor timelines stay
    //    current no matter how the carousel shuffled the chairs above.
    Object.values(gameState.world.schools).forEach((school) => {
      Legacy.linkStaff(gameState, school, gameState.year);
    });
  }

  /* ---------------- Legacy Dynasty Mode (Update 6, Section 1) -------- *
   * Retirement never ends the dynasty. The player's coach retires into the
   * permanent record books (coach registry + the dynasty's own lineage
   * ledger), the world keeps living, and a brand-new coach — created through
   * the same wizard — picks up the whistle at any program. Centuries of
   * seasons, one continuous world.
   */
  function canRetire(gameState) {
    return gameState.seasonPhase === 'Offseason';
  }

  /*
   * One atomic operation: seal the old career, install the successor.
   * Nothing else about the world resets — that is the whole point.
   */
  function retireAndSucceed(gameState, spec, newSchoolId) {
    const Legacy = window.XCD.engine.Legacy;
    const WG = window.XCD.engine.WorldGenerator;
    const M = window.XCD.models;
    const D = window.XCD.data;
    const old = gameState.getPlayerCoach();
    const oldSchool = gameState.getPlayerSchool();
    const newSchool = gameState.getSchool(newSchoolId);
    if (!old || !oldSchool || !newSchool) return { ok: false, message: 'Succession failed: missing coach or school.' };
    if (!canRetire(gameState)) return { ok: false, message: 'Coaches announce retirement in the offseason.' };
    const year = gameState.year;
    const rng = new window.XCD.core.SeededRNG((gameState.seed ^ (year * 2654435761)) >>> 0);

    // 1) The retirement: career sealed into the permanent registry, and into
    //    the dynasty's own lineage ledger (viewable forever on My Career).
    Legacy.closeStint(gameState, old, oldSchool, year, 'retired');
    Legacy.recordRetiredCoach(gameState, old, 'retired');
    const registryEntry = gameState.history.coachRegistry[gameState.history.coachRegistry.length - 1];
    gameState.history.playerCareers = gameState.history.playerCareers || [];
    gameState.history.playerCareers.push({
      ...JSON.parse(JSON.stringify(registryEntry)),
      hometown: old.hometown || '',
      almaMater: old.almaMater || '',
      retiredYear: year,
      dynastyCareer: JSON.parse(JSON.stringify(gameState.career))
    });
    // The tutorial belongs to the dynasty's first coach alone (Update 15):
    // a successor never sees the origin story or the first-season tips.
    gameState.tutorial = null;
    if (old.role === 'Assistant') {
      if (oldSchool.assistantId === old.id) oldSchool.assistantId = null;
    } else if (oldSchool.coachId === old.id) {
      oldSchool.coachId = null;
      oldSchool.coachChangedYear = year;
    }
    delete gameState.world.coaches[old.id];
    const cr = old.careerRecord || {};
    gameState.logNews(`🏁 END OF AN ERA: ${old.fullName} retires after ${cr.seasons || 0} season${cr.seasons === 1 ? '' : 's'} — ${cr.nationalTitles || 0} national title${cr.nationalTitles === 1 ? '' : 's'}, ${cr.conferenceTitles || 0} conference title${cr.conferenceTitles === 1 ? '' : 's'}. The career enters the record books; the world keeps turning.`);

    // 2) The successor takes their first job.
    const isAssistant = spec.startRole === 'Assistant';
    if (!isAssistant) {
      const incumbent = newSchool.coachId && gameState.world.coaches[newSchool.coachId];
      if (incumbent) {
        Legacy.closeStint(gameState, incumbent, newSchool, year, 'fired');
        incumbent.schoolId = null;
        incumbent.hotSeat = 0;
        incumbent.hotSeatYears = 0;
        incumbent.poolYears = 0; // hits the open market, not oblivion
        gameState.logNews(`${newSchool.name} moves on from ${incumbent.fullName} to hand the program to a new voice.`);
      }
      newSchool.coachId = null;
    } else {
      const asst = newSchool.assistantId && gameState.world.coaches[newSchool.assistantId];
      if (asst && !asst.isPlayer) {
        Legacy.closeStint(gameState, asst, newSchool, year, 'released');
        Legacy.recordRetiredCoach(gameState, asst, 'released'); // history keeps every career (Phase 3)
        delete gameState.world.coaches[asst.id];
      }
      newSchool.assistantId = null;
    }

    const arch = (D.COACH_ARCHETYPES || []).find((a) => a.key === spec.archetype) || { key: 'Developer', rating: 'training' };
    const successor = new M.Coach({
      firstName: spec.first || 'Alex',
      lastName: spec.last || 'Carter',
      age: Utils.clamp(Math.round(spec.age || (isAssistant ? 30 : 34)), 26, 60),
      hometown: spec.hometown || '',
      almaMater: spec.almaMater || '',
      archetype: arch.key,
      portrait: spec.portrait || '🧢',
      gender: spec.gender === 'W' ? 'W' : 'M',
      appearance: (spec.appearance && spec.appearance.skin !== undefined)
        ? { ...spec.appearance, gender: spec.gender === 'W' ? 'W' : 'M' } : null,
      recruiting: 50, training: 50, peaking: 50, culture: 50,
      trainingPhilosophy: (D.trainingPhilosophy(spec.trainingPhilosophy) || {}).key || 'balanced',
      racePhilosophy: (D.racePhilosophy(spec.racePhilosophy) || {}).key || 'even',
      schoolId: newSchool.id,
      role: isAssistant ? 'Assistant' : 'Head',
      isPlayer: true,
      yearsAtSchool: 0
    });
    successor[arch.rating] = 64;
    if (isAssistant) successor.recruiting = Math.max(successor.recruiting, 58);
    successor.reputation = isAssistant ? 12 : 20; // a fresh name, whatever the predecessor built
    gameState.world.coaches[successor.id] = successor;
    gameState.playerCoachId = successor.id;
    gameState.playerRole = isAssistant ? 'Assistant' : 'Head';
    gameState.playerSchoolId = newSchool.id;
    if (isAssistant) newSchool.assistantId = successor.id;
    else { newSchool.coachId = successor.id; newSchool.coachChangedYear = year; }
    Legacy.openStint(gameState, successor, newSchool, year + 1);

    // 3) The world never stalls: whatever the old program lost is refilled
    //    from the real market (which may cascade, as always).
    if (!oldSchool.coachId || !gameState.world.coaches[oldSchool.coachId]) {
      fillVacancy(gameState, oldSchool, rng, 0);
    }
    if (!oldSchool.assistantId || !gameState.world.coaches[oldSchool.assistantId]) {
      const asst = WG.buildAssistant(rng, oldSchool);
      asst.age = rng.int(25, 40);
      asst.reputation = Utils.clamp(asst.reputation || 12, 3, 28);
      asst.yearsAtSchool = 0;
      asst.careerRecord.seasons = 0;
      asst.stints = [{ schoolId: oldSchool.id, school: oldSchool.name, division: oldSchool.division || 'DI', startYear: year, endYear: null }];
      gameState.world.coaches[asst.id] = asst;
      oldSchool.assistantId = asst.id;
    }
    // A head-coach successor also needs a staff under them.
    if (!isAssistant && (!newSchool.assistantId || !gameState.world.coaches[newSchool.assistantId])) {
      const asst = WG.buildAssistant(rng, newSchool);
      gameState.world.coaches[asst.id] = asst;
      newSchool.assistantId = asst.id;
    }

    // The head-coaching carousel above can promote an assistant out of another
    // program to fill a vacancy; make sure no school is left without a
    // coordinator once the dust settles, so a succession never leaves the world
    // short-staffed (the assistant carousel would otherwise backfill later).
    Object.values(gameState.world.schools).forEach((s) => {
      if (s.assistantId && gameState.world.coaches[s.assistantId]) return;
      const a = WG.buildAssistant(rng, s);
      a.age = rng.int(25, 42);
      a.reputation = Utils.clamp(a.reputation || 12, 3, 30);
      a.yearsAtSchool = 0;
      if (a.careerRecord) a.careerRecord.seasons = 0;
      a.stints = [{ schoolId: s.id, school: s.name, division: s.division || 'DI', startYear: year, endYear: null }];
      gameState.world.coaches[a.id] = a;
      s.assistantId = a.id;
    });

    // 4) A fresh personal ledger — the dynasty's history is untouched.
    gameState.career = {
      seasons: 0, conferenceTitles: 0, nationalTitles: 0,
      nationalsAppearances: 0, podiums: 0, bestFinish: null, awards: [],
      stops: [{ school: newSchool.name, startYear: year + 1, role: gameState.playerRole }]
    };
    gameState.training.M = D.DEFAULT_WEEK_PLAN.slice();
    gameState.training.W = D.DEFAULT_WEEK_PLAN.slice();
    gameState.training.overrides = {};
    gameState.training.mileage = { M: D.MILEAGE.DEFAULT.M, W: D.MILEAGE.DEFAULT.W };
    gameState.training.mileageOverrides = {};
    gameState.culture.captains = { M: [], W: [] };
    gameState.recruiting.board = { M: [], W: [] };
    gameState.recruiting.auto = false;
    gameState.recruiting.budgetLeft = Math.round(newSchool.budget.recruiting * 0.5);
    gameState.lastPlayerMeetId = null;
    gameState.jobOffers = null;
    gameState.headCoachDeparture = null; // a fresh successor career clears any pending promotion
    gameState.weeklyFlow.trainingConfirmed = !gameState.controlsTraining();

    // Coaching-tree bookkeeping for both staffs touched by the succession.
    Legacy.linkStaff(gameState, oldSchool, year);
    Legacy.linkStaff(gameState, newSchool, year);

    gameState.logNews(`🌅 A NEW ERA: ${successor.fullName} ${isAssistant ? `joins ${newSchool.name} as recruiting coordinator` : `takes over as head coach at ${newSchool.name}`}. The dynasty continues.`);
    return { ok: true, retired: old.fullName, successor: successor.fullName };
  }

  /* ---------------- Internal promotion (Update 17) ----------------- *
   * When the player's head coach departs (retires — sometimes on top —, is
   * let go, or leaves for another job) while the player is the sitting
   * assistant, the program offers the associate the top job. It is the classic
   * internal promotion, and the choice is the player's: step up, or step aside
   * and let the program run its search.
   */
  function hasHeadPromotion(gameState) {
    const dep = gameState.headCoachDeparture;
    return !!(dep && gameState.isAssistant() && dep.schoolId === gameState.playerSchoolId);
  }

  /*
   * The player (an assistant) steps up to head coach at their own program. The
   * seat was held for exactly this decision, so there is no incumbent to
   * displace. Experience, attributes, and career history carry over; assistant
   * prestige converts to a first-time head-coaching reputation, and the player
   * now controls training, scheduling, and race strategy.
   */
  function acceptHeadPromotion(gameState) {
    const dep = gameState.headCoachDeparture;
    if (!dep) return { ok: false, message: 'There is no head-coaching vacancy to step into.' };
    if (!gameState.isAssistant()) return { ok: false, message: 'You already run a program.' };
    const Legacy = window.XCD.engine.Legacy;
    const WG = window.XCD.engine.WorldGenerator;
    const D = window.XCD.data;
    const school = gameState.getSchool(dep.schoolId);
    const coach = gameState.getPlayerCoach();
    if (!school || !coach) return { ok: false, message: 'Promotion failed: missing school or coach.' };
    const year = gameState.year;
    const rng = new window.XCD.core.SeededRNG((gameState.seed + year * 47 + (school.id.length || 3)) >>> 0);

    // Vacate the assistant seat and take the head chair at the same school.
    Legacy.closeStint(gameState, coach, school, year, 'promoted');
    if (school.assistantId === coach.id) school.assistantId = null;
    // The boss they served under earns a branch on the coaching tree — the
    // lineage keeps growing even when that boss has retired (Update 6 tree).
    Legacy.creditPromotion(gameState, coach, school, year);
    coach.role = 'Head';
    gameState.playerRole = 'Head';
    // A first-time head coach proves themselves: assistant prestige converts
    // DOWN into a head-coaching reputation (Phase 13), never 1:1.
    window.XCD.engine.Coaching.convertAssistantPrestige(coach);
    coach.schoolId = school.id;
    coach.yearsAtSchool = 0;
    coach.hotSeat = 0;
    coach.hotSeatYears = 0;
    school.coachId = coach.id;
    school.coachChangedYear = year;
    Legacy.openStint(gameState, coach, school, year);

    // The staff stays full: a fresh coordinator is hired under the new head
    // coach (the player can replace them from the pool later, as any head coach).
    const asst = WG.buildAssistant(rng, school);
    asst.age = rng.int(28, 46);
    asst.reputation = Utils.clamp(asst.reputation || 12, 3, 30);
    asst.yearsAtSchool = 0;
    if (asst.careerRecord) asst.careerRecord.seasons = 0;
    gameState.world.coaches[asst.id] = asst;
    school.assistantId = asst.id;
    Legacy.linkStaff(gameState, school, year);

    // Now a head coach: the player plans training and scheduling again.
    gameState.training.M = (gameState.training.M && gameState.training.M.length) ? gameState.training.M : D.DEFAULT_WEEK_PLAN.slice();
    gameState.training.W = (gameState.training.W && gameState.training.W.length) ? gameState.training.W : D.DEFAULT_WEEK_PLAN.slice();
    gameState.training.overrides = gameState.training.overrides || {};
    gameState.weeklyFlow.trainingConfirmed = false;
    gameState.headCoachDeparture = null;
    // Committing to take over closes the coaching market for the cycle — a
    // freshly-promoted head coach isn't job-hunting the same offseason.
    gameState.jobOffers = null;
    gameState.jobSearchClosedYear = gameState.year;

    gameState.career.stops = gameState.career.stops || [];
    gameState.career.stops.push({ school: school.name, startYear: year, role: 'Head' });

    const how = dep.kind === 'fired' ? 'was let go'
      : dep.kind === 'left' ? 'moved on to another program'
      : 'retired';
    gameState.logNews(`🎉 PROMOTED FROM WITHIN: You take over as head coach at ${school.name} after ${dep.coachName} ${how}. The program is yours to run — training, scheduling, and race strategy included.`);
    return { ok: true, message: `You're the head coach at ${school.name}!` };
  }

  // The player passes on the promotion (Update 17): they remain an assistant
  // and the program hires a head coach from the open market as usual.
  function declinePlayerHeadPromotion(gameState) {
    const dep = gameState.headCoachDeparture;
    if (!dep) return { ok: false, message: 'No promotion is pending.' };
    const school = gameState.getSchool(dep.schoolId);
    gameState.headCoachDeparture = null; // cleared first so fillVacancy won't hold the seat
    if (school && (!school.coachId || !gameState.world.coaches[school.coachId])) {
      const rng = new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 59 + (school.id.length || 3)) >>> 0);
      fillVacancy(gameState, school, rng, 0);
      const hired = school.coachId && gameState.world.coaches[school.coachId];
      gameState.logNews(`You stay on as assistant at ${school.name}${hired ? `; ${hired.fullName} is hired to run the program.` : '.'}`);
    }
    return { ok: true, message: `You remain an assistant at ${school ? school.name : 'your program'}.` };
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
    generateOffers, generateAssistantOffers, acceptOffer, applyForJob, applicationRoll,
    declineOffers, expireOffers, evolveJobMarket, runCarousel, runAssistantCarousel,
    fillVacancy, coachRankings, canRetire, retireAndSucceed,
    hasHeadPromotion, acceptHeadPromotion, declinePlayerHeadPromotion,
    coachRetirementDecision, wonNationalTitleLastSeason
  };
})();
