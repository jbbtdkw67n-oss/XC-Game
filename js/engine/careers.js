/*
 * CareersEngine — v1.1: the coaching carousel becomes a career ladder.
 *
 * - After strong seasons the player receives job offers from bigger
 *   programs (especially ones that just fired their coach) and can move.
 * - AI poaching: elite programs raid successful small-school coaches.
 * - Coach title records feed the national coach rankings.
 */
(function () {
  const Utils = window.XCD.core.Utils;

  const OFFER_EXPIRY_WEEK = 27;

  /* ---------------- Player job offers ---------------- */
  function bestPlayerRank(gameState) {
    const r = gameState.rankings;
    if (!r) return 999;
    const m = r.M.find((x) => x.schoolId === gameState.playerSchoolId);
    const w = r.W.find((x) => x.schoolId === gameState.playerSchoolId);
    return Math.min(m ? m.rank : 999, w ? w.rank : 999);
  }

  /*
   * Called right after awards + firings (week 22). Success relative to
   * your program's stature is what gets athletic directors calling.
   */
  function generateOffers(gameState, rng) {
    const school = gameState.getPlayerSchool();
    const rank = bestPlayerRank(gameState);
    const total = gameState.rankings ? gameState.rankings.M.length : 354;

    // Prestige says you "should" finish around this rank.
    const expectedRank = Math.round((1 - school.prestige / 100) * total);
    const overachievement = expectedRank - rank;
    const titledSeason = gameState.newsLog.slice(0, 60).some((n) =>
      n.year === gameState.year && (n.text.includes('CONFERENCE CHAMPIONS') || n.text.includes('NATIONAL CHAMPIONS')));

    if (overachievement < 40 && !titledSeason && rank > 30) { gameState.jobOffers = null; return; }
    const interestLevel = Utils.clamp((overachievement / 40) + (rank <= 30 ? 1 : 0) + (titledSeason ? 1 : 0), 0, 4);
    if (!rng.bool(0.25 * interestLevel)) { gameState.jobOffers = null; return; }

    // Suitors: clearly bigger programs, preferring ones with fresh vacancies
    // or weak incumbents.
    const suitors = Object.values(gameState.world.schools)
      .filter((s) => {
        if (s.id === gameState.playerSchoolId) return false;
        if (s.prestige < school.prestige + 8) return false;
        const coach = gameState.getCoach(s.coachId);
        const vacancy = s.coachChangedYear === gameState.year;
        return vacancy || (coach && coach.overallRating < 55) || rng.bool(0.06);
      })
      .sort((a, b) => b.prestige - a.prestige);

    const count = Math.min(suitors.length, rng.int(1, 3));
    if (!count) { gameState.jobOffers = null; return; }

    const offers = rng.shuffle(suitors.slice(0, 8)).slice(0, count).map((s) => ({
      schoolId: s.id,
      schoolName: s.name,
      prestige: s.prestige,
      conference: s.conference
    }));
    gameState.jobOffers = { year: gameState.year, expiresWeek: OFFER_EXPIRY_WEEK, offers };
    gameState.logNews(`📞 Your phone is ringing: ${offers.length === 1 ? offers[0].schoolName + ' wants' : offers.length + ' programs want'} to talk about their head coaching job.`);
  }

  function acceptOffer(gameState, schoolId) {
    const offers = gameState.jobOffers;
    if (!offers || !offers.offers.some((o) => o.schoolId === schoolId)) {
      return { ok: false, message: 'That offer is no longer on the table.' };
    }
    const oldSchool = gameState.getPlayerSchool();
    const newSchool = gameState.getSchool(schoolId);
    const coach = gameState.getPlayerCoach();
    const rng = new window.XCD.core.SeededRNG((gameState.seed + gameState.year * 31 + schoolId.length) >>> 0);

    // Old program hires a replacement; your departure stings the roster.
    const replacement = window.XCD.engine.WorldGenerator.buildReplacementCoach(rng, oldSchool);
    gameState.world.coaches[replacement.id] = replacement;
    oldSchool.coachId = replacement.id;
    oldSchool.coachChangedYear = gameState.year;

    // New program clears its bench for you.
    if (newSchool.coachId && gameState.world.coaches[newSchool.coachId]) {
      delete gameState.world.coaches[newSchool.coachId];
    }
    newSchool.coachId = coach.id;
    coach.schoolId = newSchool.id;
    coach.yearsAtSchool = 0;
    gameState.playerSchoolId = newSchool.id;

    // Session state tied to the old program resets.
    gameState.training.overrides = {};
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

  /* ---------------- AI poaching (at rollover) ---------------- */
  function aiPoaching(gameState, rng) {
    const ranks = { M: {}, W: {} };
    if (gameState.rankings) {
      ['M', 'W'].forEach((g) => gameState.rankings[g].forEach((r) => { ranks[g][r.schoolId] = r.rank; }));
    }
    let poached = 0;
    const bigs = Object.values(gameState.world.schools)
      .filter((s) => s.prestige >= 72 && s.id !== gameState.playerSchoolId && s.coachChangedYear === gameState.year - 1);

    for (const big of bigs) {
      if (poached >= 5 || !rng.bool(0.5)) continue;
      // Find an overachieving coach at a clearly smaller program.
      const candidates = Object.values(gameState.world.schools).filter((s) => {
        if (s.id === gameState.playerSchoolId || s.prestige > big.prestige - 12) return false;
        const bestRank = Math.min(ranks.M[s.id] || 999, ranks.W[s.id] || 999);
        return bestRank <= 40;
      });
      if (!candidates.length) continue;
      const from = rng.choice(candidates);
      const coach = gameState.getCoach(from.coachId);
      if (!coach || coach.isPlayer) continue;

      // The move
      delete gameState.world.coaches[big.coachId];
      big.coachId = coach.id;
      coach.schoolId = big.id;
      coach.yearsAtSchool = 0;
      coach.hotSeat = 0;
      big.coachChangedYear = gameState.year;

      const replacement = window.XCD.engine.WorldGenerator.buildReplacementCoach(rng, from);
      gameState.world.coaches[replacement.id] = replacement;
      from.coachId = replacement.id;
      from.coachChangedYear = gameState.year;

      poached++;
      gameState.logNews(`POACHED: ${big.name} hires ${coach.fullName} away from ${from.name} after his breakout season.`);
    }
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
        (total - bestRank) / 8 + coach.overallRating * 0.25 + coach.yearsAtSchool * 0.3
      );
      rows.push({
        coachId: coach.id, name: coach.fullName, isPlayer: coach.isPlayer,
        school: school.name, schoolId: school.id, personality: coach.personality,
        natTitles: cr.nationalTitles, confTitles: cr.conferenceTitles,
        bestRank, score
      });
    });
    rows.sort((a, b) => b.score - a.score);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }

  window.XCD.engine.Careers = {
    generateOffers, acceptOffer, declineOffers, expireOffers, aiPoaching, coachRankings
  };
})();
