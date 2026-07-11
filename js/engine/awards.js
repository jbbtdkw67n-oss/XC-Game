/*
 * AwardsEngine — Phase 5: end-of-season honors, coach firings, and the
 * Hall of Fame.
 */
(function () {
  const Utils = window.XCD.core.Utils;

  function addHonor(gameState, athleteId, honor) {
    const a = gameState.world.athletes[athleteId];
    if (!a) return;
    a.honors = a.honors || { allAmerican: 0, natChamp: 0, confChamp: 0, awards: [] };
    if (honor === 'allAmerican') a.honors.allAmerican += 1;
    else if (honor === 'natChamp') a.honors.natChamp += 1;
    else if (honor === 'confChamp') a.honors.confChamp += 1;
    else a.honors.awards.push(`${honor} (${gameState.year})`);
  }

  /*
   * Runs at week 22, right after nationals. Awards, All-Americans,
   * coach hot seats/firings, and the player's career ledger.
   */
  function processPostNationals(gameState, rng) {
    const season = gameState.season;
    const natMeet = season && season.meets[season.nationalsMeetId];
    if (!natMeet || !natMeet.results.M) return;

    const yearAwards = { M: {}, W: {} };

    ['M', 'W'].forEach((gender) => {
      const res = natMeet.results[gender];
      if (!res) return;
      const label = gender === 'M' ? "men's" : "women's";

      // Runner of the Year: the national champion.
      const champ = res.finishers[0];
      if (champ) {
        yearAwards[gender].runnerOfYear = { name: champ.name, school: gameState.getSchool(champ.schoolId)?.name || '?' };
        addHonor(gameState, champ.athleteId, 'natChamp');
        addHonor(gameState, champ.athleteId, 'Runner of the Year');
        gameState.logNews(`🏅 ${champ.name} (${yearAwards[gender].runnerOfYear.school}) is the ${label} National Runner of the Year.`);
      }

      // Freshman of the Year: top frosh at nationals, else the frosh poll leader.
      const frosh = res.finishers.find((f) => f.classYear === 'Freshman') ||
        (gameState.rankings.freshmen[gender][0] || null);
      if (frosh) {
        const name = frosh.name;
        const schoolName = frosh.schoolId ? (gameState.getSchool(frosh.schoolId)?.name || '?') : frosh.school;
        yearAwards[gender].freshmanOfYear = { name, school: schoolName };
        if (frosh.athleteId) addHonor(gameState, frosh.athleteId, 'Freshman of the Year');
      }

      // All-Americans: top 40 at nationals.
      const allAmericans = res.finishers.slice(0, 40);
      yearAwards[gender].allAmericans = allAmericans.map((f) => ({
        place: f.place, name: f.name, school: gameState.getSchool(f.schoolId)?.name || '?'
      }));
      allAmericans.forEach((f) => addHonor(gameState, f.athleteId, 'allAmerican'));
      const mine = allAmericans.filter((f) => f.schoolId === gameState.playerSchoolId);
      if (mine.length) {
        gameState.logNews(`${mine.length} of your ${label} runners earn All-America honors: ${mine.map((f) => f.name).join(', ')}.`);
      }

      // Coach of the Year: biggest climb from preseason to final poll.
      const pre = season.preseasonRanks && season.preseasonRanks[gender];
      if (pre) {
        let best = null;
        gameState.rankings[gender].slice(0, 40).forEach((r) => {
          const preRank = pre[r.schoolId] || 200;
          const climb = preRank - r.rank;
          if (!best || climb > best.climb) best = { schoolId: r.schoolId, climb, finalRank: r.rank };
        });
        if (best) {
          const school = gameState.getSchool(best.schoolId);
          const coach = gameState.getCoach(school.coachId);
          yearAwards[gender].coachOfYear = { name: coach ? coach.fullName : '?', school: school.name };
          if (coach && coach.isPlayer) {
            gameState.logNews(`🏅 YOU are the ${label} National Coach of the Year (preseason #${(pre[best.schoolId] || '—')} → final #${best.finalRank})!`);
            gameState.career.awards.push(`${label} Coach of the Year (${gameState.year})`);
          }
        }
      }

      // Conference Runners of the Year + champs honors
      (season.byWeek[season.conferenceWeek] || []).forEach((meetId) => {
        const meet = season.meets[meetId];
        const cres = meet && meet.results[gender];
        if (!cres || !cres.finishers[0]) return;
        addHonor(gameState, cres.finishers[0].athleteId, 'confChamp');
      });

      // Academic All-Americans: best students among the top 100 runners.
      const scholars = gameState.rankings.individuals[gender]
        .map((r) => ({ r, a: gameState.world.athletes[r.athleteId] }))
        .filter((x) => x.a && x.a.academics >= 80)
        .slice(0, 10);
      yearAwards[gender].academicAllAmericans = scholars.map((x) => ({ name: x.r.name, school: x.r.school }));
    });

    gameState.history.awards = gameState.history.awards || {};
    gameState.history.awards[gameState.year] = yearAwards;

    updatePlayerCareer(gameState);
    awardCoachUpgradePoints(gameState, rng);
    coachFirings(gameState, rng);
  }

  /*
   * Coach progression: career success earns upgrade points, spendable on
   * the four coach ratings (Recruiting / Training / Peaking / Culture).
   * AI coaches earn a smaller trickle and auto-spend on their archetype.
   */
  function awardCoachUpgradePoints(gameState, rng) {
    const season = gameState.season;
    const coach = gameState.getPlayerCoach();
    const natMeet = season.meets[season.nationalsMeetId];
    let pts = 0;
    const why = [];

    ['M', 'W'].forEach((gender) => {
      const label = gender === 'M' ? "men's" : "women's";

      // Conference title
      (season.byWeek[season.conferenceWeek] || []).forEach((meetId) => {
        const res = season.meets[meetId] && season.meets[meetId].results[gender];
        if (res && res.teamScores[0] && res.teamScores[0].schoolId === gameState.playerSchoolId) {
          pts += 1; why.push(`${label} conference title (+1)`);
        }
      });
      // Regional title
      (season.byWeek[season.regionalWeek] || []).forEach((meetId) => {
        const res = season.meets[meetId] && season.meets[meetId].results[gender];
        if (res && res.teamScores[0] && res.teamScores[0].schoolId === gameState.playerSchoolId) {
          pts += 1; why.push(`${label} regional title (+1)`);
        }
      });

      const res = natMeet && natMeet.results[gender];
      if (res) {
        // National title
        if (res.teamScores[0] && res.teamScores[0].schoolId === gameState.playerSchoolId) {
          pts += 3; why.push(`${label} NATIONAL TITLE (+3)`);
        }
        // Individual national champion
        if (res.finishers[0] && res.finishers[0].schoolId === gameState.playerSchoolId) {
          pts += 2; why.push(`${label} individual national champion (+2)`);
        }
        // All-Americans (top 40): 1 point per two
        const aas = res.finishers.slice(0, 40).filter((f) => f.schoolId === gameState.playerSchoolId).length;
        if (aas) { const p = Math.ceil(aas / 2); pts += p; why.push(`${aas} ${label} All-American${aas > 1 ? 's' : ''} (+${p})`); }
      }

      // Beat preseason expectations by 15+ poll spots
      const pre = season.preseasonRanks && season.preseasonRanks[gender];
      const finalRow = gameState.rankings[gender].find((r) => r.schoolId === gameState.playerSchoolId);
      if (pre && finalRow) {
        const preRank = pre[gameState.playerSchoolId] || 200;
        if (preRank - finalRow.rank >= 15) { pts += 1; why.push(`${label} squad beat preseason expectations (+1)`); }
      }
    });

    if (pts > 0 && coach) {
      coach.upgradePoints = (coach.upgradePoints || 0) + pts;
      gameState.logNews(`📋 COACHING RÉSUMÉ: you earn ${pts} upgrade point${pts > 1 ? 's' : ''} — ${why.join(', ')}. Spend them on My Program.`);
    }

    // AI coaches: a light version — titles improve their signature rating.
    const D = window.XCD.data;
    Object.values(gameState.world.schools).forEach((school) => {
      const c = gameState.getCoach(school.coachId);
      if (!c || c.isPlayer) return;
      const yr = gameState.year;
      let aiPts = 0;
      const conf = (gameState.history.conferenceChampions || {})[yr] || {};
      if (conf[`${school.conference}-M`] === school.name) aiPts++;
      if (conf[`${school.conference}-W`] === school.name) aiPts++;
      const nat = (gameState.history.nationalChampions || {})[yr] || {};
      if (nat.M && nat.M.teamId === school.id) aiPts += 2;
      if (nat.W && nat.W.teamId === school.id) aiPts += 2;
      if (!aiPts) return;
      const arch = (D.COACH_ARCHETYPES || []).find((a) => a.key === c.archetype);
      const target = arch && rng.bool(0.6) ? arch.rating
        : ['recruiting', 'training', 'peaking', 'culture'].sort((x, y) => c[x] - c[y])[0];
      c[target] = Utils.clamp(c[target] + aiPts * 2, 20, 99);
    });
  }

  /* Player career ledger */
  function updatePlayerCareer(gameState) {
    const c = gameState.career;
    const season = gameState.season;
    c.seasons += 1;
    ['M', 'W'].forEach((gender) => {
      const natMeet = season.meets[season.nationalsMeetId];
      const res = natMeet && natMeet.results[gender];
      if (res) {
        const mine = res.teamScores.find((t) => t.schoolId === gameState.playerSchoolId);
        if (mine) {
          c.nationalsAppearances += 1;
          if (mine.place === 1) c.nationalTitles += 1;
          if (mine.place <= 4) c.podiums += 1;
          if (!c.bestFinish || mine.place < c.bestFinish) c.bestFinish = mine.place;
        }
      }
      (season.byWeek[season.conferenceWeek] || []).forEach((meetId) => {
        const meet = season.meets[meetId];
        const cres = meet && meet.results[gender];
        if (cres && cres.teamScores[0] && cres.teamScores[0].schoolId === gameState.playerSchoolId) {
          c.conferenceTitles += 1;
        }
      });
    });
  }

  /* AI coach hot seats: underperform your prestige for too long and you're out. */
  function coachFirings(gameState, rng) {
    const rankIndex = { M: {}, W: {} };
    ['M', 'W'].forEach((g) => gameState.rankings[g].forEach((r) => { rankIndex[g][r.schoolId] = r.rank; }));
    const total = gameState.rankings.M.length;
    let fired = 0;

    Object.values(gameState.world.schools).forEach((school) => {
      const coach = gameState.getCoach(school.coachId);
      if (!coach || coach.isPlayer) return;

      // Expectation: your poll position should roughly match your prestige position.
      const expectedPct = 1 - school.prestige / 100;
      const actualPct = ((rankIndex.M[school.id] || total) + (rankIndex.W[school.id] || total)) / (2 * total);
      const underperformance = actualPct - expectedPct; // positive = worse than expected

      coach.hotSeat = Utils.clamp(coach.hotSeat + Math.round(underperformance * 55), 0, 100);
      if (underperformance < -0.08) coach.hotSeat = Math.max(0, coach.hotSeat - 18);

      if (coach.hotSeat >= 60 && coach.yearsAtSchool >= 3 && rng.bool(0.45) && fired < 20) {
        fired++;
        gameState.history.firings = (gameState.history.firings || 0) + 1;
        delete gameState.world.coaches[coach.id];
        const replacement = window.XCD.engine.WorldGenerator.buildReplacementCoach(rng, school);
        gameState.world.coaches[replacement.id] = replacement;
        school.coachId = replacement.id;
        school.coachChangedYear = gameState.year;
        gameState.logNews(`FIRED: ${school.name} lets ${coach.fullName} go after ${coach.yearsAtSchool} seasons. ${replacement.fullName} takes over.`);
      }
    });
  }

  /* Hall of Fame: evaluated as athletes graduate. */
  function considerHallOfFame(gameState, athlete) {
    const h = athlete.honors || { allAmerican: 0, natChamp: 0, confChamp: 0, awards: [] };
    const score = athlete.careerStats.wins * 3 + athlete.careerStats.top5 +
      h.allAmerican * 8 + h.natChamp * 20 + h.confChamp * 4;
    // High bar: roughly multi-time All-Americans / champions only (~2-4 per class).
    if (score < 70) return false;
    const school = gameState.getSchool(athlete.schoolId);
    gameState.history.hallOfFame = gameState.history.hallOfFame || [];
    gameState.history.hallOfFame.push({
      name: athlete.fullName,
      gender: athlete.gender,
      school: school ? school.name : '?',
      schoolId: athlete.schoolId,
      inducted: gameState.year,
      stats: {
        races: athlete.careerStats.races,
        wins: athlete.careerStats.wins,
        top5: athlete.careerStats.top5,
        allAmerican: h.allAmerican,
        natChamp: h.natChamp,
        prs: athlete.careerStats.personalBests
      },
      score: Math.round(score)
    });
    if (athlete.schoolId === gameState.playerSchoolId) {
      gameState.logNews(`🏛 ${athlete.fullName} graduates as a legend and enters the Hall of Fame.`);
    }
    return true;
  }

  window.XCD.engine.Awards = { processPostNationals, considerHallOfFame, addHonor };
})();
