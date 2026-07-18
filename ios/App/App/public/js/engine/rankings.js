/*
 * RankingsEngine — weekly polls.
 *
 * Team rankings blend roster strength with season results (quality-weighted
 * placements). Individual & freshman rankings rank season-best paces.
 * Regional rankings and conference standings are filtered national views.
 */
(function () {
  const Utils = window.XCD.core.Utils;

  function teamStrength(gameState, school, gender) {
    const Races = window.XCD.engine.Races;
    const distanceM = gender === 'M' ? 8000 : 6000;
    const top = (gender === 'M' ? school.rosterM : school.rosterW)
      .map((id) => gameState.world.athletes[id])
      .filter(Boolean)
      .map((a) => Races.raceRating(a, distanceM))
      .sort((a, b) => b - a)
      .slice(0, 5);
    return top.length >= 5 ? Utils.average(top) : (top.length ? Utils.average(top) * 0.8 : 0);
  }

  function compute(gameState) {
    const season = gameState.season;
    const rankings = {
      computedWeek: gameState.week, M: [], W: [],
      individuals: { M: [], W: [] }, freshmen: { M: [], W: [] },
      divisionSizes: { DI: 0, DII: 0, DIII: 0 }
    };

    // --- Season results score per team --------------------------------
    const resultPoints = { M: {}, W: {} };
    if (season) {
      Object.values(season.meets).forEach((meet) => {
        ['M', 'W'].forEach((gender) => {
          const res = meet.results[gender];
          if (!res || !res.teamScores.length) return;
          const field = res.teamScores.length;
          if (field < 2) return;
          // Field quality = mean strength of competing teams.
          const quality = Utils.average(res.teamScores.map((t) => {
            const s = gameState.getSchool(t.schoolId);
            return s ? teamStrength(gameState, s, gender) : 40;
          }));
          // Elite invitationals (Part 7) carry real poll weight.
          const typeWeight = (meet.type === 'national' ? 2.2 : meet.type === 'regional' ? 1.5 : meet.type === 'conference' ? 1.3 : 1.0) *
            (meet.elite || 1);
          res.teamScores.forEach((t) => {
            const placeScore = 1 - (t.place - 1) / (field - 1); // 1.0 for win, 0 for last
            const pts = placeScore * (quality / 62) * typeWeight;
            const bucket = resultPoints[gender];
            (bucket[t.schoolId] = bucket[t.schoolId] || []).push(pts);
          });
        });
      });
    }

    const DIV_ORDER = { DI: 0, DII: 1, DIII: 2 };
    ['M', 'W'].forEach((gender) => {
      const rows = Object.values(gameState.world.schools).map((school) => {
        const strength = teamStrength(gameState, school, gender);
        const results = resultPoints[gender][school.id];
        const resultScore = results && results.length
          ? Utils.average(results) * 60
          : strength * 0.55; // preseason: strength carries the poll
        const score = strength * 0.55 + resultScore * 0.45;
        return { schoolId: school.id, name: school.name, conference: school.conference, region: school.region, division: school.division || 'DI', score: Math.round(score * 10) / 10 };
      });

      // Rank is WITHIN a division (Update 3): each division runs its own
      // poll, so a DIII #1 is #1 in DIII — never buried under DI. Rows are
      // ordered DI→DII→DIII then by rank so lookups (.find by id) return the
      // school's standing among its true peers.
      const byDivision = {};
      rows.forEach((r) => { (byDivision[r.division] = byDivision[r.division] || []).push(r); });
      const prev = gameState.rankings && gameState.rankings[gender];
      const Legacy = window.XCD.engine.Legacy;
      const ordered = [];
      Object.keys(byDivision)
        .sort((a, b) => (DIV_ORDER[a] ?? 9) - (DIV_ORDER[b] ?? 9))
        .forEach((division) => {
          const list = byDivision[division].sort((a, b) => b.score - a.score);
          rankings.divisionSizes[division] = list.length;
          list.forEach((r, i) => {
            r.rank = i + 1;
            r.divisionSize = list.length;
            const old = prev && prev.find((p) => p.schoolId === r.schoolId);
            r.prevRank = old ? old.rank : null;
            // Permanent program ledger: highest poll ranking ever (Part 8).
            if (r.rank <= 50) {
              const prog = Legacy.program(gameState, r.schoolId);
              if (!prog.highestRank || r.rank < prog.highestRank) prog.highestRank = r.rank;
            }
            ordered.push(r);
          });
        });
      rankings[gender] = ordered;
    });

    // --- Individual & freshman rankings (season-best pace) ------------
    // Ranked within division: a DIII runner competes for DIII honors, not
    // against DI paces. Each row carries its division so the UI and awards
    // can filter to the relevant division.
    ['M', 'W'].forEach((gender) => {
      const rows = [];
      Object.values(gameState.world.schools).forEach((school) => {
        (gender === 'M' ? school.rosterM : school.rosterW).forEach((id) => {
          const a = gameState.world.athletes[id];
          if (!a) return;
          const bests = a.careerStats.personalBests || {};
          let bestPace = null;
          Object.entries(bests).forEach(([key, time]) => {
            const km = parseFloat(key);
            if (!km) return;
            const pace = time / km;
            if (bestPace === null || pace < bestPace) bestPace = pace;
          });
          if (bestPace === null) return;
          rows.push({
            athleteId: a.id, name: a.fullName, classYear: a.classYear,
            schoolId: school.id, school: school.name,
            division: school.division || 'DI',
            pace: Math.round(bestPace * 10) / 10,
            wins: a.careerStats.wins
          });
        });
      });
      rows.sort((a, b) => (a.pace - b.pace) || (b.wins - a.wins));
      const indivByDiv = {};
      const freshByDiv = {};
      const indiv = [];
      const fresh = [];
      rows.forEach((r) => {
        const d = r.division;
        indivByDiv[d] = (indivByDiv[d] || 0) + 1;
        if (indivByDiv[d] <= 100) indiv.push({ ...r, rank: indivByDiv[d] });
        if (r.classYear === 'Freshman') {
          freshByDiv[d] = (freshByDiv[d] || 0) + 1;
          if (freshByDiv[d] <= 50) fresh.push({ ...r, rank: freshByDiv[d] });
        }
      });
      rankings.individuals[gender] = indiv;
      rankings.freshmen[gender] = fresh;
    });

    gameState.rankings = rankings;
    return rankings;
  }

  /*
   * Preseason individual rankings (Update 4, Part 9). Before a season has any
   * race results, project each returning/incoming athlete's standing from
   * returning ability (race rating), current fitness, and projected
   * development (headroom toward potential), lightly weighted by last year's
   * results. Produces realistic favorites: national contenders return near
   * the top unless graduation/regression changed the picture. Ranked within
   * each division and per gender.
   */
  function computePreseasonIndividuals(gameState) {
    const Races = window.XCD.engine.Races;
    const out = { M: [], W: [] };
    ['M', 'W'].forEach((gender) => {
      const distanceM = gender === 'M' ? 8000 : 6000;
      const rows = [];
      Object.values(gameState.world.schools).forEach((school) => {
        (gender === 'M' ? school.rosterM : school.rosterW).forEach((id) => {
          const a = gameState.world.athletes[id];
          if (!a || a.redshirt === 'True' || a.redshirt === 'Medical') return;
          const ability = Races.raceRating(a, distanceM);
          const headroom = Utils.clamp(a.potential - a.currentOverall, 0, 40);
          const devFactor = a.age <= 19 ? 0.55 : a.age <= 21 ? 0.35 : 0.15;
          // Prior-season résumé nudges the projection (returning stars stay up).
          const resume = (a.careerStats.wins || 0) * 1.2 + (a.careerStats.top5 || 0) * 0.4 +
            (a.honorYears && a.honorYears.allAmerican ? a.honorYears.allAmerican.length * 3 : 0);
          const proj = ability + a.fitness * 0.12 + headroom * devFactor + Math.min(12, resume);
          rows.push({
            athleteId: a.id, name: a.fullName, classYear: a.classYear,
            schoolId: school.id, school: school.name,
            division: school.division || 'DI',
            proj: Math.round(proj * 10) / 10,
            generational: !!a.generational
          });
        });
      });
      rows.sort((a, b) => b.proj - a.proj);
      const byDiv = {};
      rows.forEach((r) => {
        byDiv[r.division] = (byDiv[r.division] || 0) + 1;
        if (byDiv[r.division] <= 100) out[gender].push({ ...r, rank: byDiv[r.division] });
      });
    });
    return out;
  }

  function teamRank(gameState, schoolId, gender) {
    const list = gameState.rankings && gameState.rankings[gender];
    if (!list) return null;
    const row = list.find((r) => r.schoolId === schoolId);
    return row ? row.rank : null;
  }

  window.XCD.engine.Rankings = { compute, teamStrength, teamRank, computePreseasonIndividuals };
})();
