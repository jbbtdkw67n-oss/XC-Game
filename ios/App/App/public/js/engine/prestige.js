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
      const division = school.division || 'DI';
      const coach = gameState.getCoach(school.coachId);
      let score = 0; // season evidence, roughly -3 .. +3

      // 1) National standing vs where the prestige says you should be
      //    (measured within the school's own division).
      const total = divSize(division);
      const best = Math.min(rankIndex.M[school.id] || total, rankIndex.W[school.id] || total);
      const expected = Math.round((1 - school.prestige / 100) * total * 0.92) + 4;
      score += Utils.clamp((expected - best) / 55, -1.4, 1.4);

      // 2) Hardware (Prestige Rebalancing: recent success moves the needle
      //    faster). Conference titles, regional titles, national title
      //    contention, and All-Americans all raise the brand quickly.
      if (conf[`${school.conference}-M`] === school.name) score += 0.8;
      if (conf[`${school.conference}-W`] === school.name) score += 0.8;
      const reg = (gameState.history.regionalChampions || {})[year] || {};
      ['M', 'W'].forEach((g) => {
        if (reg[`${school.region}-${g}`] === school.name) score += 0.6; // regional success
      });
      ['M', 'W'].forEach((g) => {
        const key = division === 'DI' ? g : `${division}-${g}`;
        const n = nat[key];
        if (n && n.teamId === school.id) score += 3.0;
        // National title CONTENTION: a podium run builds the brand fast.
        else if ((rankIndex[g][school.id] || 999) <= 4) score += 0.9;
      });
      // All-Americans produced this season are prestige in the flesh.
      const honors = ((gameState.history.seasonStaffHonors || {})[gameState.year] ||
        (gameState.history.seasonStaffHonors || {})[year] || {})[school.id];
      if (honors) {
        score += Math.min(1.0, (honors.allAmericans || 0) * 0.2);
        score += Math.min(0.8, (honors.indivNatChamps || 0) * 0.4);
      }
      const season = gameState.season;
      if (season && season.championships) {
        const champ = season.championships[division];
        ['M', 'W'].forEach((g) => {
          const field = champ && champ.fieldIds && champ.fieldIds[g];
          if (field && field.includes(school.id)) score += 0.4; // making nationals matters
        });
      }

      // 3) Recruiting rankings feed the brand.
      const cr = classRank[school.id];
      if (cr) score += cr <= 5 ? 0.7 : cr <= 15 ? 0.45 : cr <= 30 ? 0.2 : 0;

      // 4) Facilities, budget, and the coach's name. The head coach is one of
      // the strongest influences on a program's trajectory (History & Legacy
      // update, Phase 14): an elite coach can drag an average program toward
      // national relevance, and sustained poor leadership erodes even a
      // historically successful one.
      score += Utils.clamp((school.facilitiesOverall - school.prestige) / 40, -0.5, 0.5);
      if (coach) score += Utils.clamp(((coach.reputation || 25) - school.prestige) / 55, -0.7, 0.8);

      // 5) Athlete development reputation (programs that improve runners).
      const roster = gameState.getRoster(school.id, 'M');
      if (roster.length) {
        const avgDev = Utils.average(roster.map((a) => a.seasonDev || 0));
        score += Utils.clamp((avgDev - 2.2) * 0.15, -0.3, 0.3);
      }

      // 6) Momentum: sustained eras move mountains; one-offs fade.
      //    Rebalanced: the CURRENT season carries more of the movement, so
      //    prestige responds to what a program is doing now.
      school.prestigeMomentum = Utils.clamp((school.prestigeMomentum || 0) * 0.6 + score * 0.55, -3.5, 3.5);
      let delta = score * 0.7 + school.prestigeMomentum * 0.4 + (rng.next() - 0.5) * 0.4;

      // Gravity at the extremes: staying elite requires sustained winning,
      // and rock bottom eventually finds new leadership energy.
      if (school.prestige >= 88 && score < 0.5) delta -= 0.5;
      if (school.prestige <= 25 && score > -0.5) delta += 0.3;

      // Multiple poor seasons compound (Prestige Rebalancing): one down year
      // is noise, but a program stacking bad seasons sheds standing at an
      // accelerating rate — inflation no longer lingers.
      const heritage = school.heritage || 0;
      school.poorSeasons = score < -0.2 ? (school.poorSeasons || 0) + 1 : 0;
      if ((school.poorSeasons || 0) >= 2) {
        delta -= Math.min(1.5, (school.poorSeasons - 1) * 0.45);
      }

      // Prestige inflation guard (Phase 14, retuned): the summit stays
      // stable — only a handful of true perennial powers at any time — while
      // the climb THROUGH the upper-middle class is a little freer, so new
      // powerhouses can rise into national prominence within several strong
      // seasons. Declines are untouched — gravity works at full strength.
      if (delta > 0) {
        if (school.prestige >= 90) delta *= 0.45;
        else if (school.prestige >= 82) delta *= 0.65;
        else if (school.prestige >= 74) delta *= 0.85;
      }

      // --- Heritage resilience (Update 4, Part 8; inertia trimmed) ---------
      // Historically great programs resist collapse — but only for so long.
      // The cushion now erodes faster with each consecutive down year, so a
      // blue blood with poor coaching genuinely falls within a handful of
      // bad seasons instead of coasting on its name indefinitely.
      if (delta < 0 && heritage > school.prestige) {
        const grace = Math.max(0, 1 - (school.poorSeasons || 0) * 0.3);
        const cushion = Utils.clamp((heritage - school.prestige) / 100, 0, 0.5) * grace;
        delta *= (1 - cushion);
      }
      // A gentle pull toward ~55% of heritage keeps legends off the floor —
      // but a genuinely failing blue blood (many poor years) still slides.
      const floor = heritage * 0.55;
      if (school.prestige < floor && score > -0.6) delta += (floor - school.prestige) * 0.02;

      // Heritage itself is dynamic: sustained excellence builds a new blue
      // blood; a drought erodes an old one's standing (now after 4 poor
      // seasons rather than 5 — history fades a little faster).
      if (score > 0.8 && school.prestige >= 78) school.heritage = Math.min(96, heritage + 1);
      else if ((school.poorSeasons || 0) >= 4 && heritage > 0) school.heritage = Math.max(0, heritage - 1);

      // Movement cap raised ±3 → ±4: eras still read as eras, but a
      // championship breakthrough (or a collapse) visibly moves the brand.
      delta = Utils.clamp(delta, -4, 4);
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
