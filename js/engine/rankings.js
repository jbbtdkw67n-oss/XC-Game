/*
 * RankingsEngine — weekly polls.
 *
 * Team rankings start from roster strength and are driven by head-to-head
 * results from there (margin-aware ratings + a soft head-to-head rule). Individual & freshman rankings rank season-best paces.
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

  /*
   * Final-poll rule (History & Legacy update, Phase 2): once the NCAA
   * Championships have been run, the final rankings ARE the championship
   * results. The champion finishes #1, the runner-up #2, and so on through
   * the nationals field; teams that missed nationals follow, ordered by the
   * regular formula. Returns { [division]: { schoolId: place } } when this
   * season's nationals have results, else null.
   */
  function championshipTeamPlaces(gameState, gender) {
    const season = gameState.season;
    if (!season || season.year !== gameState.year) return null;
    const natWeek = season.nationalWeek;
    const out = {};
    let any = false;
    (season.byWeek[natWeek] || []).forEach((id) => {
      const meet = season.meets[id];
      if (!meet || meet.type !== 'national' || !meet.results[gender]) return;
      const map = {};
      meet.results[gender].teamScores.forEach((t) => { map[t.schoolId] = t.place; });
      out[meet.division || 'DI'] = map;
      any = true;
    });
    return any ? out : null;
  }

  // Same rule for individuals: the nationals finish order leads the final
  // individual rankings. { [division]: { athleteId: place } } or null.
  function championshipIndivPlaces(gameState, gender) {
    const season = gameState.season;
    if (!season || season.year !== gameState.year) return null;
    const natWeek = season.nationalWeek;
    const out = {};
    let any = false;
    (season.byWeek[natWeek] || []).forEach((id) => {
      const meet = season.meets[id];
      if (!meet || meet.type !== 'national' || !meet.results[gender]) return;
      const map = {};
      meet.results[gender].finishers.forEach((f) => { map[f.athleteId] = f.place; });
      out[meet.division || 'DI'] = map;
      any = true;
    });
    return any ? out : null;
  }

  /*
   * Poll ratings (rankings rework). Every team starts the season at its
   * roster strength; from there the poll is driven by what happens on the
   * course. Each meet is a set of head-to-head matchups — every team against
   * every team it raced — scored by margin, so:
   *   - beating strong teams is worth a lot, losing to weak ones costs a lot
   *   - beating a weak team counts only if the performance beats what was
   *     expected (crush them and it helps; scrape by and it can hurt)
   *   - championships and elite invitationals carry more weight
   * The rating is in strength points (a 1-point edge ≈ 58% to win a
   * head-to-head), recomputed from the season's results every week.
   * Tuned on simulated seasons against the old strength-heavy formula: it
   * picks next week's head-to-heads at least as well (~78%), predicts the
   * Nationals order better, cuts "ranked above a team that just beat you"
   * from ~18% of top-25 pairs to ~6%, and churns no more week to week.
   */
  const POLL = {
    SCALE: 3.0,     // rating points per e-fold of head-to-head odds
    MARGIN: 0.25,   // mean-percentile gap per scorer for a decisive result
    K: 1.5,         // rating points a meet can move a team (before weight)
    H2H_WINDOW: 3,  // soft head-to-head: within this many poll spots
    // Finishing margins saturate (a team can only be so far ahead), so no
    // matchup is ever treated as more certain than this: routing a weak
    // field still counts a little, scraping past it still costs.
    EXP_CAP: 0.95
  };

  function meetWeight(meet) {
    const type = meet.type === 'national' ? 2.2 : meet.type === 'regional' ? 1.5 : meet.type === 'conference' ? 1.3 : 1.0;
    return type * (meet.elite || 1);
  }

  function resultRatings(gameState, gender) {
    const rating = {};
    Object.values(gameState.world.schools).forEach((s) => { rating[s.id] = teamStrength(gameState, s, gender); });
    const season = gameState.season;
    const meetsByTeam = {}; // schoolId -> [{ order, place, points }] for head-to-head lookups
    if (!season) return { rating, meetsByTeam };
    const meets = Object.values(season.meets)
      .filter((m) => m.results && m.results[gender] && m.results[gender].teamScores.length >= 2)
      .sort((a, b) => (a.week - b.week) || String(a.id).localeCompare(String(b.id)));
    meets.forEach((meet, order) => {
      const teams = meet.results[gender].teamScores.filter((t) => rating[t.schoolId] != null);
      const n = teams.length;
      if (n < 2) return;
      // Scoring runners in the race (the last scorer's place), to turn team
      // points into a per-scorer finishing-percentile margin.
      const field = Math.max(5, ...teams.map((t) => Math.max(...(t.scorers || [0]))));
      const acc = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        const ri = rating[teams[i].schoolId];
        for (let j = i + 1; j < n; j++) {
          const d = ((teams[j].points - teams[i].points) / 5) / field; // > 0: i was better
          const actual = 0.5 + 0.5 * Math.tanh(d / POLL.MARGIN);
          const expected = Utils.clamp(1 / (1 + Math.exp(-(ri - rating[teams[j].schoolId]) / POLL.SCALE)),
            1 - POLL.EXP_CAP, POLL.EXP_CAP);
          acc[i] += actual - expected;
          acc[j] -= actual - expected;
        }
      }
      const k = POLL.K * meetWeight(meet) / Math.sqrt(n - 1);
      teams.forEach((t, i) => {
        rating[t.schoolId] += k * acc[i];
        (meetsByTeam[t.schoolId] = meetsByTeam[t.schoolId] || []).push({ order, place: t.place });
      });
    });
    return { rating, meetsByTeam };
  }

  // Who won the most recent meeting between two teams? (schoolId or null)
  function lastMeetingWinner(rr, a, b) {
    const la = rr.meetsByTeam[a], lb = rr.meetsByTeam[b];
    if (!la || !lb) return null;
    let j = lb.length - 1;
    for (let i = la.length - 1; i >= 0 && j >= 0; i--) {
      while (j >= 0 && lb[j].order > la[i].order) j--;
      if (j >= 0 && lb[j].order === la[i].order) return la[i].place < lb[j].place ? a : b;
    }
    return null;
  }

  // Soft head-to-head: walking down the poll, a team moves directly ahead of
  // the highest team within H2H_WINDOW spots above it that it beat in their
  // most recent meeting. Each team moves at most once, so cycles can't spin.
  function headToHead(list, rr) {
    const moved = new Set();
    const limit = Math.min(list.length, 100);
    for (let idx = 1; idx < limit; idx++) {
      const team = list[idx];
      if (moved.has(team.schoolId)) continue;
      let target = -1;
      for (let k = Math.min(POLL.H2H_WINDOW, idx); k >= 1; k--) {
        if (lastMeetingWinner(rr, team.schoolId, list[idx - k].schoolId) === team.schoolId) { target = idx - k; break; }
      }
      if (target < 0) continue;
      list.splice(idx, 1);
      list.splice(target, 0, team);
      moved.add(team.schoolId);
    }
  }

  function compute(gameState) {
    const season = gameState.season;
    const rankings = {
      computedWeek: gameState.week, M: [], W: [],
      individuals: { M: [], W: [] }, freshmen: { M: [], W: [] },
      divisionSizes: { DI: 0, DII: 0, DIII: 0 }
    };

    // --- Results ratings (head-to-head, margin-aware) -------------------
    const ratings = { M: resultRatings(gameState, 'M'), W: resultRatings(gameState, 'W') };

    const DIV_ORDER = { DI: 0, DII: 1, DIII: 2 };
    ['M', 'W'].forEach((gender) => {
      const rr = ratings[gender];
      const rows = Object.values(gameState.world.schools).map((school) => {
        const score = rr.rating[school.id] ?? teamStrength(gameState, school, gender);
        return { schoolId: school.id, name: school.name, conference: school.conference, region: school.region, ncaaRegion: window.XCD.data.ncaaRegionFor(school), division: school.division || 'DI', score: Math.round(score * 10) / 10 };
      });

      // Rank is WITHIN a division (Update 3): each division runs its own
      // poll, so a DIII #1 is #1 in DIII — never buried under DI. Rows are
      // ordered DI→DII→DIII then by rank so lookups (.find by id) return the
      // school's standing among its true peers.
      const byDivision = {};
      rows.forEach((r) => { (byDivision[r.division] = byDivision[r.division] || []).push(r); });
      const prev = gameState.rankings && gameState.rankings[gender];
      const Legacy = window.XCD.engine.Legacy;
      // After Nationals, the championship results override the formula
      // (Phase 2): the final poll mirrors what happened on the course.
      const champPlaces = championshipTeamPlaces(gameState, gender);
      const ordered = [];
      Object.keys(byDivision)
        .sort((a, b) => (DIV_ORDER[a] ?? 9) - (DIV_ORDER[b] ?? 9))
        .forEach((division) => {
          const places = champPlaces && champPlaces[division];
          const list = byDivision[division].sort((a, b) => {
            if (places) {
              const pa = places[a.schoolId];
              const pb = places[b.schoolId];
              if (pa && pb) return pa - pb;      // nationals finish order rules
              if (pa) return -1;                 // any nationals team outranks
              if (pb) return 1;                  // every team that missed it
            }
            return b.score - a.score;
          });
          // Soft head-to-head (coaches'-poll style): a team that won the most
          // recent meeting with a team ranked just above it moves ahead.
          // Skipped once the Nationals finish order sets the final poll.
          if (!places) headToHead(list, rr);
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
      // Final-poll rule for individuals (Phase 2): nationals finishers hold
      // the top of the final rankings in finish order — the national champion
      // is #1 in their division; runners who missed nationals follow by pace.
      const indivPlaces = championshipIndivPlaces(gameState, gender);
      const natPlace = (r) => {
        const map = indivPlaces && indivPlaces[r.division];
        return (map && map[r.athleteId]) || Infinity;
      };
      rows.sort((a, b) => {
        if (indivPlaces) {
          const pa = natPlace(a);
          const pb = natPlace(b);
          if (pa !== pb) return pa - pb;
          if (pa !== Infinity) return 0;
        }
        return (a.pace - b.pace) || (b.wins - a.wins);
      });
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
          if (!a) return;
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

  window.XCD.engine.Rankings = { compute, teamStrength, teamRank, computePreseasonIndividuals, resultRatings, POLL };
})();
