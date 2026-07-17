/*
 * PrestigeEngine — Update 2 (Part 3).
 *
 * Program prestige is no longer static. Every offseason each school's
 * prestige moves on the year's evidence: poll finishes vs expectation,
 * conference and national success, recruiting class strength, facilities,
 * the coach's reputation, budget health, and long-run momentum. Mid-majors
 * can climb into the blue-blood tier over a decade of results; sleeping
 * giants that stop winning slowly fall back to the pack.
 *
 * Deltas are small (±3/year hard cap) so rises and falls read as eras,
 * not lottery tickets.
 */
(function () {
  const Utils = window.XCD.core.Utils;

  function yearlyUpdate(gameState, rng) {
    const year = gameState.year - 1; // the season that just ended
    const rankings = gameState.rankings;
    const divSize = (d) => (rankings && rankings.divisionSizes && rankings.divisionSizes[d]) ||
      (rankings ? rankings.M.length : 354);
    const rankIndex = { M: {}, W: {} };
    if (rankings) {
      ['M', 'W'].forEach((g) => rankings[g].forEach((r) => { rankIndex[g][r.schoolId] = r.rank; }));
    }
    const conf = (gameState.history.conferenceChampions || {})[year] || {};
    const nat = (gameState.history.nationalChampions || {})[year] || {};
    const classes = (gameState.history.recruitingClasses || {})[year] || [];
    const classRank = {};
    classes.forEach((c) => { classRank[c.schoolId] = c.rank; });

    Object.values(gameState.world.schools).forEach((school) => {
      const division = school.division || 'DA';
      const coach = gameState.getCoach(school.coachId);
      let score = 0; // season evidence, roughly -3 .. +3

      // 1) National standing vs where the prestige says you should be
      //    (measured within the school's own division).
      const total = divSize(division);
      const best = Math.min(rankIndex.M[school.id] || total, rankIndex.W[school.id] || total);
      const expected = Math.round((1 - school.prestige / 100) * total * 0.92) + 4;
      score += Utils.clamp((expected - best) / 55, -1.4, 1.4);

      // 2) Hardware.
      if (conf[`${school.conference}-M`] === school.name) score += 0.5;
      if (conf[`${school.conference}-W`] === school.name) score += 0.5;
      ['M', 'W'].forEach((g) => {
        const key = division === 'DA' ? g : `${division}-${g}`;
        const n = nat[key];
        if (n && n.teamId === school.id) score += 2.2;
      });
      const season = gameState.season;
      if (season && season.championships) {
        const champ = season.championships[division];
        ['M', 'W'].forEach((g) => {
          const field = champ && champ.fieldIds && champ.fieldIds[g];
          if (field && field.includes(school.id)) score += 0.35; // making nationals matters
        });
      }

      // 3) Recruiting rankings feed the brand.
      const cr = classRank[school.id];
      if (cr) score += cr <= 5 ? 0.7 : cr <= 15 ? 0.45 : cr <= 30 ? 0.2 : 0;

      // 4) Facilities, budget, and the coach's name.
      score += Utils.clamp((school.facilitiesOverall - school.prestige) / 40, -0.5, 0.5);
      if (coach) score += Utils.clamp(((coach.reputation || 25) - school.prestige) / 60, -0.4, 0.6);

      // 5) Athlete development reputation (programs that improve runners).
      const roster = gameState.getRoster(school.id, 'M');
      if (roster.length) {
        const avgDev = Utils.average(roster.map((a) => a.seasonDev || 0));
        score += Utils.clamp((avgDev - 2.2) * 0.15, -0.3, 0.3);
      }

      // 6) Momentum: sustained eras move mountains; one-offs fade.
      school.prestigeMomentum = Utils.clamp((school.prestigeMomentum || 0) * 0.65 + score * 0.5, -3, 3);
      let delta = score * 0.55 + school.prestigeMomentum * 0.45 + (rng.next() - 0.5) * 0.4;

      // Gravity at the extremes: staying elite requires sustained winning,
      // and rock bottom eventually finds new leadership energy.
      if (school.prestige >= 88 && score < 0.5) delta -= 0.4;
      if (school.prestige <= 25 && score > -0.5) delta += 0.3;

      // --- Heritage resilience (Update 4, Part 8) --------------------------
      // Historically great programs resist collapse: a blue blood needs
      // several poor seasons before its standing truly falls, while weak
      // programs remain free to climb into the elite tier over time.
      const heritage = school.heritage || 0;
      school.poorSeasons = score < -0.2 ? (school.poorSeasons || 0) + 1 : 0;
      if (delta < 0 && heritage > school.prestige) {
        // The cushion weakens with each consecutive down year, so sustained
        // failure eventually breaks even a legendary program.
        const grace = Math.max(0, 1 - (school.poorSeasons || 0) * 0.22);
        const cushion = Utils.clamp((heritage - school.prestige) / 100, 0, 0.6) * grace;
        delta *= (1 - cushion);
      }
      // A gentle pull toward ~60% of heritage keeps legends off the floor —
      // but a genuinely failing blue blood (many poor years) still slides.
      const floor = heritage * 0.6;
      if (school.prestige < floor && score > -0.6) delta += (floor - school.prestige) * 0.02;

      // Heritage itself is dynamic: sustained excellence builds a new blue
      // blood; a long drought erodes an old one's standing.
      if (score > 0.8 && school.prestige >= 78) school.heritage = Math.min(96, heritage + 1);
      else if ((school.poorSeasons || 0) >= 5 && heritage > 0) school.heritage = Math.max(0, heritage - 1);

      delta = Utils.clamp(delta, -3, 3);
      const before = school.prestige;
      school.prestige = Utils.clamp(Math.round(school.prestige + delta), 5, 99);

      // Trajectory ledger (drives job-offer pitches + program page charts).
      school.prestigeHistory = school.prestigeHistory || [];
      school.prestigeHistory.push({ year, prestige: school.prestige });
      if (school.prestigeHistory.length > 30) school.prestigeHistory.shift();

      // Big brand moves make the news.
      if (school.prestige - before >= 3 && school.prestige >= 70) {
        gameState.logNews(`RISING POWER: ${school.name} is becoming a national brand (prestige ${before} → ${school.prestige}).`);
      } else if (before - school.prestige >= 3 && before >= 80) {
        gameState.logNews(`FADING GIANT: ${school.name}'s standing slips after another quiet year (prestige ${before} → ${school.prestige}).`);
      }
    });
  }

  window.XCD.engine.Prestige = { yearlyUpdate };
})();
