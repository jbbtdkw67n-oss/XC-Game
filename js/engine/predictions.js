/*
 * PredictionsEngine — Preseason outlook & season storylines.
 *
 * Every season opens with a projected picture of the year ahead: the
 * predicted podium (top-3 teams) for each division, the runners projected to
 * fight for the individual national title, a dark horse with real upside, and
 * a program on the rise — all wrapped in an original, sports-talk-radio-style
 * write-up generated fresh for the season. The News screen's "Teams to Watch"
 * tab reads this outlook.
 *
 * The outlook is also the yardstick for expectations: a program predicted to
 * reach the podium that fails to deliver puts its coach on the hot seat, and
 * repeated failures cost the coach their job (awards.js / careers.js consume
 * the evaluation this module produces).
 *
 * Deterministic: seeded off the dynasty seed + year, so a given season always
 * produces the same outlook and prose, and reloads are stable.
 */
(function () {
  const Utils = window.XCD.core.Utils;

  function divisionsInPlay(gameState) {
    const sizes = (gameState.rankings && gameState.rankings.divisionSizes) || {};
    const list = Object.keys(sizes).filter((d) => (sizes[d] || 0) > 0);
    return list.length ? list : ['DI'];
  }

  // Best (lowest) preseason poll rank a school holds across both genders in a
  // division, plus its conference — for dark-horse / rising-program scoring.
  function teamsByUpside(gameState, division) {
    const R = gameState.rankings;
    const map = {};
    ['M', 'W'].forEach((g) => {
      (R[g] || []).filter((r) => (r.division || 'DI') === division).forEach((r) => {
        const cur = map[r.schoolId];
        const climb = (r.prevRank && r.rank) ? (r.prevRank - r.rank) : 0;
        if (!cur || r.rank < cur.bestRank) {
          map[r.schoolId] = { schoolId: r.schoolId, name: r.name, conference: r.conference, bestRank: r.rank, climb };
        } else if (climb > cur.climb) {
          cur.climb = climb;
        }
      });
    });
    return Object.values(map);
  }

  // Does this division/gender project a genuine national-title-caliber star at
  // a given school? (A top-6 preseason individual projection.)
  function hasProjectedStar(gameState, schoolId, division) {
    const pre = gameState.season && gameState.season.preseasonIndividuals;
    if (!pre) return false;
    return ['M', 'W'].some((g) => (pre[g] || [])
      .filter((r) => (r.division || 'DI') === division).slice(0, 6)
      .some((r) => r.schoolId === schoolId));
  }

  function pickDarkhorse(gameState, division, exclude, rng) {
    const cands = teamsByUpside(gameState, division)
      // A dark horse sits just off the projected podium — good, but not a
      // favorite — with real reasons to believe it can crash the party.
      .filter((t) => t.bestRank >= 4 && t.bestRank <= 14 && !exclude.has(t.schoolId))
      .map((t) => {
        const school = gameState.getSchool(t.schoolId) || {};
        const score = (school.prestigeMomentum || 0) * 1.6
          + Math.max(0, t.climb) * 0.5
          + (hasProjectedStar(gameState, t.schoolId, division) ? 3 : 0)
          + (rng.next() - 0.5) * 1.2;
        return { ...t, score };
      })
      .sort((a, b) => b.score - a.score);
    return cands.length ? cands[0] : null;
  }

  function pickRising(gameState, division, exclude) {
    const cands = teamsByUpside(gameState, division)
      .filter((t) => !exclude.has(t.schoolId))
      .map((t) => {
        const school = gameState.getSchool(t.schoolId) || {};
        // A program "on the rise" is one whose momentum and recent climb point
        // upward — not necessarily a contender yet, but trending hard.
        const score = (school.prestigeMomentum || 0) * 2 + Math.max(0, t.climb) * 0.8;
        return { ...t, score, momentum: school.prestigeMomentum || 0 };
      })
      .filter((t) => t.score > 0.6)
      .sort((a, b) => b.score - a.score);
    return cands.length ? cands[0] : null;
  }

  /* ---------------- Sports-talk write-ups ---------------- */
  const pick = (rng, arr) => arr[Math.floor(rng.next() * arr.length) % arr.length];

  function previewWriteup(gameState, division, slate, darkhorse, rising, rng) {
    const D = window.XCD.data;
    const divLabel = (D.divisionFor(division) || {}).label || division;
    const favM = slate.M.podium[0];
    const favW = slate.W.podium[0];
    const topM = slate.M.contenders[0];
    const topW = slate.W.contenders[0];
    const parts = [];

    parts.push(pick(rng, [
      `🎙️ Welcome to the ${gameState.year} ${divLabel} season, folks — grab a seat, because this one has some juice.`,
      `🎙️ It's ${gameState.year}, and the ${divLabel} cross country season is officially upon us. Let's talk contenders.`,
      `🎙️ Season preview time: the ${gameState.year} ${divLabel} campaign is shaping up to be a barnburner.`,
      `🎙️ Lace 'em up — the ${gameState.year} ${divLabel} season is here and the storylines are already writing themselves.`
    ]));

    if (favM && favW) {
      parts.push(pick(rng, [
        `The ${favM.name} men and the ${favW.name} women enter as the teams to beat.`,
        `All eyes are on ${favM.name} on the men's side and ${favW.name} for the women — the projected favorites.`,
        `${favM.name} headline the men's picture; ${favW.name} are the class of the women's field.`
      ]));
    } else if (favM) {
      parts.push(`${favM.name} enter as the men's favorite.`);
    } else if (favW) {
      parts.push(`${favW.name} are the women's team to beat.`);
    }

    if (topM || topW) {
      const names = [topM && topM.name, topW && topW.name].filter(Boolean).join(' and ');
      parts.push(pick(rng, [
        `Individually, keep the stopwatch on ${names} — genuine national-title material.`,
        `Watch ${names} chase individual glory this fall.`,
        `${names} headline a loaded cast of title contenders up front.`
      ]));
    }

    if (darkhorse) {
      parts.push(pick(rng, [
        `Don't sleep on ${darkhorse.name} — that's a dark horse with real podium upside.`,
        `My sleeper pick? ${darkhorse.name}. Mark it down — they could crash the podium.`,
        `And if you want a dark horse, ${darkhorse.name} has the look of a team nobody wants to see in November.`
      ]));
    }

    if (rising && (!darkhorse || rising.schoolId !== darkhorse.schoolId)) {
      parts.push(pick(rng, [
        `${rising.name}? That's a program clearly on the rise — the arrow is pointing straight up.`,
        `Give it up for ${rising.name} too: a program on the rise you'll be hearing a lot more about.`,
        `${rising.name} is trending hard — a program on the rise that's ahead of schedule.`
      ]));
    }

    parts.push(pick(rng, [
      `Should be a fun one. Buckle up.`,
      `Grab the popcorn — this season's going to deliver.`,
      `We'll see you at the finish line. Let's run.`
    ]));

    return parts.join(' ');
  }

  /*
   * Generate the season outlook. Called from capturePreseasonRanks, right
   * after the preseason poll and individual projections are computed, so the
   * projections it reads are the genuine preseason picture.
   */
  function generate(gameState) {
    const season = gameState.season;
    if (!season || !gameState.rankings) return null;
    const year = gameState.year;
    const rng = new window.XCD.core.SeededRNG((gameState.seed ^ (year * 131071)) >>> 0);
    const R = gameState.rankings;
    const pre = season.preseasonIndividuals || { M: [], W: [] };
    const divisions = {};
    const podiumTeams = []; // evaluation markers

    divisionsInPlay(gameState).forEach((division) => {
      const slate = { M: { podium: [], contenders: [] }, W: { podium: [], contenders: [] } };
      const excludePodium = new Set();
      ['M', 'W'].forEach((gender) => {
        const teams = (R[gender] || [])
          .filter((r) => (r.division || 'DI') === division)
          .sort((a, b) => a.rank - b.rank);
        slate[gender].podium = teams.slice(0, 3).map((r, i) => {
          excludePodium.add(r.schoolId);
          podiumTeams.push({ schoolId: r.schoolId, gender, division, predictedPlace: i + 1 });
          return { schoolId: r.schoolId, name: r.name, conference: r.conference, predictedPlace: i + 1 };
        });
        slate[gender].contenders = (pre[gender] || [])
          .filter((r) => (r.division || 'DI') === division)
          .slice(0, 5)
          .map((r) => ({
            athleteId: r.athleteId, name: r.name, school: r.school, schoolId: r.schoolId,
            classYear: r.classYear, generational: !!r.generational
          }));
      });
      const darkhorse = pickDarkhorse(gameState, division, excludePodium, rng);
      const excludeRising = new Set(excludePodium);
      if (darkhorse) excludeRising.add(darkhorse.schoolId);
      const rising = pickRising(gameState, division, excludeRising);
      slate.darkhorse = darkhorse ? { schoolId: darkhorse.schoolId, name: darkhorse.name } : null;
      slate.rising = rising ? { schoolId: rising.schoolId, name: rising.name } : null;
      slate.writeup = previewWriteup(gameState, division, slate, darkhorse, rising, rng);
      divisions[division] = slate;
    });

    const predictions = { year, generatedWeek: gameState.week, divisions, podiumTeams };
    // The live outlook the News → Teams to Watch tab reads is the one on the
    // current season; a short rolling archive on history keeps saves lean.
    season.predictions = predictions;
    gameState.history.seasonOutlook = gameState.history.seasonOutlook || {};
    gameState.history.seasonOutlook[year] = predictions;
    const yrs = Object.keys(gameState.history.seasonOutlook).map(Number).sort((a, b) => a - b);
    while (yrs.length > 3) delete gameState.history.seasonOutlook[yrs.shift()];
    return predictions;
  }

  /*
   * Evaluate the season just run against its preseason podium predictions.
   * A program predicted to reach the podium (top 3 at nationals) in a gender,
   * that fails to do so in EVERY gender it was predicted for, is charged a
   * "podium miss" — pressure that lands on the coach's hot seat (applied in
   * awards.coachFirings) and, on repeated misses, costs them their job.
   *
   * Runs at awards time, before coachFirings, off the current season's
   * results. Sets, per coach:
   *   coach._podiumPressure  — transient hot-seat points to apply this year
   *   coach.podiumMissStreak — consecutive predicted-but-missed seasons
   */
  function evaluate(gameState) {
    const season = gameState.season;
    const preds = season && season.predictions;
    if (!preds || !preds.podiumTeams || !preds.podiumTeams.length) return;
    const Races = window.XCD.engine.Races;
    const natWeek = Races.NATIONAL_WEEK;

    // nationals finish: `${division}-${gender}` -> { schoolId: place }
    const finish = {};
    (season.byWeek[natWeek] || []).forEach((id) => {
      const meet = season.meets[id];
      if (!meet || meet.type !== 'national') return;
      const division = meet.division || 'DI';
      ['M', 'W'].forEach((g) => {
        const res = meet.results[g];
        if (!res) return;
        const map = {};
        res.teamScores.forEach((t) => { map[t.schoolId] = t.place; });
        finish[`${division}-${g}`] = map;
      });
    });

    // Gather, per predicted school, the genders it was predicted podium in and
    // whether it delivered a top-3 finish in at least one of them.
    const bySchool = {};
    preds.podiumTeams.forEach((p) => {
      const s = (bySchool[p.schoolId] = bySchool[p.schoolId] || { division: p.division, predicted: 0, met: false, place: null });
      s.predicted += 1;
      const place = (finish[`${p.division}-${p.gender}`] || {})[p.schoolId];
      if (place && place <= 3) s.met = true;
      if (place != null && (s.place == null || place < s.place)) s.place = place;
    });

    Object.entries(bySchool).forEach(([schoolId, info]) => {
      const school = gameState.getSchool(schoolId);
      if (!school) return;
      const coach = gameState.getCoach(school.coachId);
      if (!coach) return;
      if (info.met) {
        coach.podiumMissStreak = 0;
        return;
      }
      // Missed the podium the pundits handed them.
      coach.podiumMissStreak = (coach.podiumMissStreak || 0) + 1;
      const streak = coach.podiumMissStreak;
      coach._podiumPressure = (coach._podiumPressure || 0) + 20 + streak * 10;

      const where = info.place ? `finishing ${Utils.ordinal(info.place)}` : 'missing the national meet';
      if (coach.isPlayer) {
        gameState.logNews(`🎙️ EXPECTATIONS: ${school.name} was picked for the ${(window.XCD.data.divisionFor(school.division) || {}).label || ''} podium and fell short, ${where}. ${streak >= 2 ? 'The boosters are done waiting — the seat is scorching.' : 'The pressure is on.'}`);
      } else if ((school.prestige || 0) >= 62 || streak >= 2) {
        gameState.logNews(`🎙️ UNDERACHIEVERS: ${school.name} was a preseason podium pick but fell short, ${where}. ${coach.fullName} is feeling the heat.`);
      }
    });
  }

  /*
   * Season-in-review, sports-talk style — one original recap per division per
   * season, generated after the championships. Stored on
   * history.awardsRecap[year][division] and shown atop the News → Awards tab.
   */
  function awardsRecap(gameState, byDivision) {
    const rng = new window.XCD.core.SeededRNG((gameState.seed ^ (gameState.year * 2654435761)) >>> 0);
    const D = window.XCD.data;
    const nat = (gameState.history.nationalChampions || {})[gameState.year] || {};
    const recap = {};
    Object.keys(byDivision || {}).forEach((division) => {
      const divLabel = (D.divisionFor(division) || {}).label || division;
      const slate = byDivision[division] || {};
      const natName = (g) => {
        const key = division === 'DI' ? g : `${division}-${g}`;
        return nat[key] && nat[key].team;
      };
      const champM = natName('M');
      const champW = natName('W');
      const royM = slate.M && slate.M.runnerOfYear;
      const royW = slate.W && slate.W.runnerOfYear;
      const parts = [];
      parts.push(pick(rng, [
        `🎙️ And that's a wrap on the ${gameState.year} ${divLabel} season — what a ride.`,
        `🎙️ The ${gameState.year} ${divLabel} championships are in the books, and we've got hardware to hand out.`,
        `🎙️ Trophies are awarded, so let's break down the ${gameState.year} ${divLabel} season.`
      ]));
      if (champM && champW) {
        parts.push(pick(rng, [
          `${champM} took the men's national title and ${champW} ruled the women's race — championship programs, both.`,
          `Banner year: ${champM} on the men's side and ${champW} for the women both cut down the nets.`
        ]));
      } else if (champM) {
        parts.push(`${champM} claimed the men's national crown.`);
      } else if (champW) {
        parts.push(`${champW} claimed the women's national crown.`);
      }
      if (royM || royW) {
        const names = [royM && royM.name, royW && royW.name].filter(Boolean).join(' and ');
        parts.push(pick(rng, [
          `${names} ran away with Runner of the Year honors.`,
          `Individually, ${names} were simply the best in the sport this fall.`
        ]));
      }
      parts.push(pick(rng, [
        `Full award slate below — every conference honor and All-America team.`,
        `Dig into the honors below. On to next season.`,
        `The complete list is below. What a season it was.`
      ]));
      recap[division] = parts.join(' ');
    });
    gameState.history.awardsRecap = gameState.history.awardsRecap || {};
    gameState.history.awardsRecap[gameState.year] = recap;
    const yrs = Object.keys(gameState.history.awardsRecap).map(Number).sort((a, b) => a - b);
    while (yrs.length > 8) delete gameState.history.awardsRecap[yrs.shift()];
    return recap;
  }

  window.XCD.engine.Predictions = { generate, evaluate, awardsRecap };
})();
