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

      Legacy.closeStint(gameState, coach, oldSchool, gameState.year);
      oldSchool.coachId = null;
      oldSchool.coachChangedYear = gameState.year;
      fillVacancy(gameState, oldSchool, rng, 0);

      const asst = newSchool.assistantId && gameState.world.coaches[newSchool.assistantId];
      if (asst && !asst.isPlayer) {
        Legacy.closeStint(gameState, asst, newSchool, gameState.year);
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

      Legacy.closeStint(gameState, coach, oldSchool, gameState.year);
      if (oldSchool.assistantId === coach.id) oldSchool.assistantId = null;
      const fill = WG.buildAssistant(rng, oldSchool);
      fill.age = rng.int(25, 40);
      fill.reputation = Utils.clamp(fill.reputation || 12, 3, 28);
      gameState.world.coaches[fill.id] = fill;
      oldSchool.assistantId = fill.id;
      Legacy.linkStaff(gameState, oldSchool, gameState.year);

      const displaced = newSchool.assistantId && gameState.world.coaches[newSchool.assistantId];
      if (displaced && !displaced.isPlayer) {
        Legacy.closeStint(gameState, displaced, newSchool, gameState.year);
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

      Legacy.closeStint(gameState, coach, oldSchool, gameState.year);
      if (oldSchool.assistantId === coach.id) oldSchool.assistantId = null;
      // Your old boss's coaching tree grows a branch (Update 6).
      Legacy.creditPromotion(gameState, coach, newSchool, gameState.year);

      const incumbent = newSchool.coachId && gameState.world.coaches[newSchool.coachId];
      if (incumbent && !incumbent.isPlayer) {
        Legacy.closeStint(gameState, incumbent, newSchool, gameState.year);
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
        c.hotSeatYears = 0;
        Legacy.openStint(gameState, c, school, gameState.year);
        school.coachChangedYear = gameState.year;
        gameState.logNews(`POACHED: ${school.name} hires ${c.fullName} away from ${from.name} (${(c.reputationLevel || {}).label || 'rising name'}).`);
        fillVacancy(gameState, from, rng, depth + 1);
        return c;
      }
    }

    // 1.5) Promote a strong assistant into the head chair — the natural
    //      career step. The program's own assistant gets first crack (internal
    //      promotion); otherwise a standout assistant elsewhere earns their
    //      first head job. Their old assistant seat is refilled by the
    //      assistant carousel afterward.
    if (depth < 2 && rng.bool(0.5)) {
      const readyBar = school.prestige * 0.5 - 8;
      const own = school.assistantId && gameState.world.coaches[school.assistantId];
      let promo = null, fromSchool = null, internal = false;
      if (own && !own.isPlayer && (own.reputation || 0) >= readyBar && own.age >= 30) {
        promo = own; fromSchool = school; internal = true;
      } else {
        const cands = Object.values(gameState.world.schools)
          .filter((s) => s.id !== school.id && s.id !== gameState.playerSchoolId &&
            s.assistantId && gameState.world.coaches[s.assistantId])
          .map((s) => ({ s, c: gameState.world.coaches[s.assistantId] }))
          .filter(({ c }) => !c.isPlayer && (c.reputation || 0) >= readyBar + 4 && c.age >= 30)
          .sort((a, b) => (b.c.reputation || 0) - (a.c.reputation || 0));
        if (cands.length && rng.bool(0.7)) { promo = cands[0].c; fromSchool = cands[0].s; }
      }
      if (promo) {
        if (fromSchool.assistantId === promo.id) fromSchool.assistantId = null;
        Legacy.closeStint(gameState, promo, fromSchool, gameState.year);
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

    // 1) Retirements + firings.
    Object.values(gameState.world.schools).forEach((school) => {
      const asst = school.assistantId && gameState.world.coaches[school.assistantId];
      if (!asst || asst.isPlayer) return;

      const earlyRetire = asst.age >= 63 && rng.bool(Math.min(0.12, (asst.age - 62) * 0.02));
      if (asst.age >= (asst.retireAge || 75) || earlyRetire) {
        Legacy.closeStint(gameState, asst, school, gameState.year);
        Legacy.recordRetiredCoach(gameState, asst, 'retired');
        delete gameState.world.coaches[asst.id];
        school.assistantId = null;
        return;
      }
      // Programs churn staff: a weak, stagnating assistant is occasionally let go.
      if ((asst.reputation || 0) < 18 && asst.age >= 34 && rng.bool(0.12)) {
        Legacy.closeStint(gameState, asst, school, gameState.year);
        Legacy.recordRetiredCoach(gameState, asst, 'released'); // history keeps every career (Phase 3)
        delete gameState.world.coaches[asst.id]; // assistants don't pool as free agents
        school.assistantId = null;
      }
    });

    // 2) Upward lateral moves: a standout assistant fills an open assistant
    //    seat at a bigger program, leaving their old seat to be regenerated.
    Object.values(gameState.world.schools)
      .filter((s) => (!s.assistantId || !gameState.world.coaches[s.assistantId]) && s.prestige >= 55)
      .sort((a, b) => b.prestige - a.prestige)
      .forEach((school) => {
        if (school.assistantId && gameState.world.coaches[school.assistantId]) return;
        if (school.id === gameState.playerSchoolId) return; // never move the player's staff out from under them
        if (!rng.bool(0.5)) return;
        const cands = Object.values(gameState.world.schools)
          .filter((s) => s.id !== gameState.playerSchoolId && s.prestige < school.prestige - 8 &&
            s.assistantId && gameState.world.coaches[s.assistantId])
          .map((s) => ({ s, c: gameState.world.coaches[s.assistantId] }))
          .filter(({ c }) => !c.isPlayer && (c.reputation || 0) >= school.prestige * 0.4)
          .sort((a, b) => (b.c.reputation || 0) - (a.c.reputation || 0));
        if (!cands.length) return;
        const { s: from, c } = cands[0];
        from.assistantId = null;
        Legacy.closeStint(gameState, c, from, gameState.year);
        c.schoolId = school.id;
        c.yearsAtSchool = 0;
        school.assistantId = c.id;
        Legacy.openStint(gameState, c, school, gameState.year);
        gameState.logNews(`${c.fullName} lands a bigger assistant job at ${school.name}, leaving ${from.name}.`);
      });

    // 3) Regenerate: every program must have an assistant coach.
    Object.values(gameState.world.schools).forEach((school) => {
      if (school.assistantId && gameState.world.coaches[school.assistantId]) return;
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
    Legacy.closeStint(gameState, old, oldSchool, year);
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
        Legacy.closeStint(gameState, incumbent, newSchool, year);
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
        Legacy.closeStint(gameState, asst, newSchool, year);
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
    gameState.weeklyFlow.trainingConfirmed = !gameState.controlsTraining();

    // Coaching-tree bookkeeping for both staffs touched by the succession.
    Legacy.linkStaff(gameState, oldSchool, year);
    Legacy.linkStaff(gameState, newSchool, year);

    gameState.logNews(`🌅 A NEW ERA: ${successor.fullName} ${isAssistant ? `joins ${newSchool.name} as recruiting coordinator` : `takes over as head coach at ${newSchool.name}`}. The dynasty continues.`);
    return { ok: true, retired: old.fullName, successor: successor.fullName };
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
    fillVacancy, coachRankings, canRetire, retireAndSucceed
  };
})();
