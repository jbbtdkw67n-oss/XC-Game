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
    const rankings = { computedWeek: gameState.week, M: [], W: [], individuals: { M: [], W: [] }, freshmen: { M: [], W: [] } };

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
          const typeWeight = meet.type === 'national' ? 2.2 : meet.type === 'regional' ? 1.5 : meet.type === 'conference' ? 1.3 : 1.0;
          res.teamScores.forEach((t) => {
            const placeScore = 1 - (t.place - 1) / (field - 1); // 1.0 for win, 0 for last
            const pts = placeScore * (quality / 62) * typeWeight;
            const bucket = resultPoints[gender];
            (bucket[t.schoolId] = bucket[t.schoolId] || []).push(pts);
          });
        });
      });
    }

    ['M', 'W'].forEach((gender) => {
      const rows = Object.values(gameState.world.schools).map((school) => {
        const strength = teamStrength(gameState, school, gender);
        const results = resultPoints[gender][school.id];
        const resultScore = results && results.length
          ? Utils.average(results) * 60
          : strength * 0.55; // preseason: strength carries the poll
        const score = strength * 0.55 + resultScore * 0.45;
        return { schoolId: school.id, name: school.name, conference: school.conference, region: school.region, score: Math.round(score * 10) / 10 };
      });
      rows.sort((a, b) => b.score - a.score);
      const prev = gameState.rankings && gameState.rankings[gender];
      rows.forEach((r, i) => {
        r.rank = i + 1;
        const old = prev && prev.find((p) => p.schoolId === r.schoolId);
        r.prevRank = old ? old.rank : null;
      });
      rankings[gender] = rows;
    });

    // --- Individual & freshman rankings (season-best pace) ------------
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
            pace: Math.round(bestPace * 10) / 10,
            wins: a.careerStats.wins
          });
        });
      });
      rows.sort((a, b) => (a.pace - b.pace) || (b.wins - a.wins));
      rankings.individuals[gender] = rows.slice(0, 100).map((r, i) => ({ ...r, rank: i + 1 }));
      rankings.freshmen[gender] = rows.filter((r) => r.classYear === 'Freshman').slice(0, 50).map((r, i) => ({ ...r, rank: i + 1 }));
    });

    gameState.rankings = rankings;
    return rankings;
  }

  function teamRank(gameState, schoolId, gender) {
    const list = gameState.rankings && gameState.rankings[gender];
    if (!list) return null;
    const row = list.find((r) => r.schoolId === schoolId);
    return row ? row.rank : null;
  }

  window.XCD.engine.Rankings = { compute, teamStrength, teamRank };
})();
