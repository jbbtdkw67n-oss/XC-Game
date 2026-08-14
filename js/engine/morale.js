/*
 * MoraleEngine — Update 3.
 *
 * Team morale (0-100) is a program's confidence, chemistry, and belief in
 * the staff. Its single biggest driver is the coach's Team Culture rating.
 * Beyond that it moves on whether the team is progressing toward its goals —
 * results measured against EXPECTATIONS, not raw wins and losses:
 *
 *   - A rebuilding program projected 8th that finishes 5th gains morale.
 *   - A title favorite projected 1st that finishes 5th loses morale.
 *   - A mid-major exceeding expectations grows confident without winning meets.
 *   - A powerhouse underperforming its ceiling slowly loses belief.
 *
 * Morale never overrides talent or fitness. It acts as a realistic race-day
 * modifier (amplified at championships), shifts transfer risk, and lightly
 * colors training response — explaining why similar teams differ on the day.
 */
(function () {
  const Utils = window.XCD.core.Utils;

  // The coach's culture defines the gravity morale settles toward.
  function cultureBaseline(gameState, school) {
    const coach = gameState.getCoach(school.coachId);
    const culture = coach ? coach.culture : 55;
    const relationships = coach ? (coach.relationships || 55) : 55;
    // Culture is the dominant term; relationships and prestige nudge it.
    return Utils.clamp(38 + culture * 0.42 + relationships * 0.10 + school.prestige * 0.06, 20, 92);
  }

  // Seed every program's morale near its culture baseline (world gen / new game).
  function init(gameState) {
    Object.values(gameState.world.schools).forEach((school) => {
      const base = cultureBaseline(gameState, school);
      if (school.teamMorale === undefined || school.teamMorale === null) {
        school.teamMorale = Math.round(Utils.clamp(base + (Math.random() - 0.5) * 8, 20, 92));
      }
    });
  }

  // A team's expected finish in a meet: its standing among the field by
  // preseason projection (falls back to prestige when no poll exists yet).
  function expectedPlaceInField(gameState, meet, gender, schoolId) {
    const season = gameState.season;
    const pre = season && season.preseasonRanks && season.preseasonRanks[gender];
    const rankOf = (id) => {
      if (pre && pre[id]) return pre[id];
      const s = gameState.getSchool(id);
      return s ? 1000 - s.prestige : 999; // prestige proxy (lower = better)
    };
    const field = meet.schoolIds.slice().sort((a, b) => rankOf(a) - rankOf(b));
    const idx = field.indexOf(schoolId);
    return idx >= 0 ? idx + 1 : field.length;
  }

  /*
   * After a meet, nudge each participating team's morale by how its finish
   * compared to expectation. Championship meets move morale more. Small
   * per-meet deltas accumulate into believable season-long arcs.
   */
  function afterMeet(gameState, meet, gender) {
    const res = meet.results[gender];
    if (!res || res.teamScores.length < 2) return;
    const isChamp = meet.type === 'conference' || meet.type === 'regional' || meet.type === 'national';
    const scale = isChamp ? 1.8 : (meet.preNationals ? 1.3 : 0.8);

    res.teamScores.forEach((t) => {
      const school = gameState.getSchool(t.schoolId);
      if (!school) return;
      const expected = expectedPlaceInField(gameState, meet, gender, t.schoolId);
      const over = expected - t.place; // positive = beat expectations
      // Normalize by field size so a small meet and a big meet feel similar.
      const norm = over / Math.max(4, res.teamScores.length * 0.5);
      let delta = Utils.clamp(norm * 2.2 * scale, -4.5, 4.5);
      // Belief pulls gently toward the culture baseline every meet.
      const base = cultureBaseline(gameState, school);
      delta += (base - (school.teamMorale ?? 65)) * 0.04;
      school.teamMorale = Utils.clamp(Math.round((school.teamMorale ?? 65) + delta), 5, 100);
    });
  }

  /*
   * A per-team race-day form factor from morale (Update 3 performance
   * variation). Returns a small multiplier on race time — negative is faster.
   * High morale occasionally lifts a whole team above its projected fitness;
   * low morale occasionally drags it below. Amplified at championships, and
   * always bounded so it never overrides talent.
   */
  function teamForm(gameState, schoolId, isChampionship, rng) {
    const school = gameState.getSchool(schoolId);
    const tm = (school && school.teamMorale) ?? 65;
    const ampl = isChampionship ? 1.4 : 1.0;
    let form = (tm - 62) * 0.00012 * ampl; // steady confidence effect
    const roll = rng.next();
    if (tm >= 72 && roll < 0.15) form -= (0.002 + rng.next() * 0.004) * ampl;      // rise-up day
    else if (tm <= 45 && roll > 0.85) form += (0.002 + rng.next() * 0.005) * ampl; // flat day
    // Asymmetric caps keep morale a modest, non-decisive edge that never
    // overrides talent: the upside (faster) is small so it can't manufacture
    // absurd champion times, while a fractured team's downside runs deeper.
    return Utils.clamp(form, -0.010, 0.016);
  }

  /*
   * Yearly settle (rollover): the season's body of work vs its projection,
   * championship success, development, recruiting, transfers, and injuries —
   * then a strong pull toward the coach's culture baseline. Runs after the
   * season's results are in but before the roster turns over.
   */
  function yearlyUpdate(gameState, rng) {
    const year = gameState.year - 1;
    const rankings = gameState.rankings;
    const season = gameState.season;
    const nat = (gameState.history.nationalChampions || {})[year] || {};
    const conf = (gameState.history.conferenceChampions || {})[year] || {};
    const classes = (gameState.history.recruitingClasses || {})[year] || [];
    const classRank = {};
    classes.forEach((c) => { classRank[c.schoolId] = c.rank; });
    // Per-school portal departures this cycle (chemistry hit).
    const portalOut = {};
    const lastPortal = (gameState.history.portalSummaries || {})[year];
    if (lastPortal && lastPortal.outBySchool) Object.assign(portalOut, lastPortal.outBySchool);

    Object.values(gameState.world.schools).forEach((school) => {
      const division = school.division || 'DI';
      let delta = 0;

      // 1) Season vs projection (the heart of the system).
      const preM = season && season.preseasonRanks && season.preseasonRanks.M;
      const preW = season && season.preseasonRanks && season.preseasonRanks.W;
      const finalRank = (g) => {
        const row = rankings && rankings[g] && rankings[g].find((r) => r.schoolId === school.id);
        return row ? row.rank : null;
      };
      ['M', 'W'].forEach((g) => {
        const pre = g === 'M' ? preM : preW;
        const projected = pre && pre[school.id];
        const actual = finalRank(g);
        if (projected && actual) {
          const over = projected - actual; // positive = exceeded projection
          delta += Utils.clamp(over / 12, -3.5, 3.5);
        }
      });

      // 2) Championship success (progress toward goals).
      ['M', 'W'].forEach((g) => {
        const key = division === 'DI' ? g : `${division}-${g}`;
        if (nat[key] && nat[key].teamId === school.id) delta += 4;
        if (conf[`${school.conference}-${g}`] === school.name) delta += 1.2;
      });

      // 3) Development — a program that visibly improves runners believes.
      const roster = gameState.getRoster(school.id, 'M').concat(gameState.getRoster(school.id, 'W'));
      if (roster.length) {
        const avgDev = Utils.average(roster.map((a) => a.seasonDev || 0));
        delta += Utils.clamp((avgDev - 2.0) * 0.30, -1.2, 1.2);
        // Major injuries to key athletes sap belief.
        const topInjured = roster.sort((a, b) => b.currentOverall - a.currentOverall).slice(0, 7)
          .filter((a) => (a.seasonInjuryWeeks || 0) >= 5).length;
        delta -= topInjured * 0.7;
      }

      // 4) A strong recruiting class energizes the locker room.
      const cr = classRank[school.id];
      if (cr) delta += cr <= 10 ? 1.2 : cr <= 30 ? 0.6 : 0;

      // 5) Transfer churn out of the program dents chemistry.
      delta -= (portalOut[school.id] || 0) * 0.5;

      // 6) Belief settles toward the coach's culture (the biggest driver):
      //    a strong pull so culture dominates the long-run level.
      const base = cultureBaseline(gameState, school);
      delta += (base - (school.teamMorale ?? 65)) * 0.35;

      delta += (rng.next() - 0.5) * 0.6;
      const before = school.teamMorale ?? 65;
      school.teamMorale = Utils.clamp(Math.round(before + delta), 5, 100);

      if (school.id === gameState.playerSchoolId) {
        if (school.teamMorale - before >= 6) {
          gameState.logNews(`📈 TEAM MORALE surges to ${school.teamMorale}: the locker room believes in the direction of the program.`);
        } else if (before - school.teamMorale >= 6) {
          gameState.logNews(`📉 TEAM MORALE dips to ${school.teamMorale}: falling short of expectations is testing the team's belief.`);
        }
      }
    });
  }

  // A short label for the UI.
  function label(morale) {
    if (morale >= 82) return { text: 'Buzzing', tone: 'good' };
    if (morale >= 68) return { text: 'Confident', tone: 'good' };
    if (morale >= 52) return { text: 'Steady', tone: 'neutral' };
    if (morale >= 38) return { text: 'Uneasy', tone: 'warn' };
    return { text: 'Fractured', tone: 'bad' };
  }

  window.XCD.engine.Morale = { init, afterMeet, teamForm, yearlyUpdate, cultureBaseline, label };
})();
