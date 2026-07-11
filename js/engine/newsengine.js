/*
 * NewsEngine — Phase 5: stories generated from what actually happened.
 * Upsets, poll movement, milestone watch, and championship previews.
 * (Recruiting, portal, injury, and award stories are emitted at their
 * sources; this pass covers the racing world.)
 */
(function () {
  function processWeek(gameState, rng) {
    const justRaced = gameState.week - 1; // advanceWeek already incremented
    const season = gameState.season;
    if (!season) return;

    raceStories(gameState, justRaced, rng);
    pollStories(gameState);
    previewStories(gameState);
  }

  function raceStories(gameState, week, rng) {
    const season = gameState.season;
    const meetIds = season.byWeek[week];
    if (!meetIds || !meetIds.length) return;
    const ranks = { M: {}, W: {} };
    ['M', 'W'].forEach((g) => (gameState.rankings[g] || []).forEach((r) => { ranks[g][r.schoolId] = r.rank; }));

    let stories = 0;
    for (const meetId of meetIds) {
      if (stories >= 3) break;
      const meet = season.meets[meetId];
      if (!meet || meet.type === 'national') continue;
      ['M', 'W'].forEach((gender) => {
        if (stories >= 3) return;
        const res = meet.results[gender];
        if (!res || res.teamScores.length < 3) return;
        const winner = res.teamScores[0];
        const winnerRank = ranks[gender][winner.schoolId] || 300;
        // Upset: winner beat a team ranked 12+ spots higher.
        const bigDog = res.teamScores.slice(1).find((t) => (ranks[gender][t.schoolId] || 300) <= winnerRank - 12 && (ranks[gender][t.schoolId] || 300) <= 30);
        if (bigDog) {
          const w = gameState.getSchool(winner.schoolId);
          const b = gameState.getSchool(bigDog.schoolId);
          gameState.logNews(`UPSET at the ${meet.name}: ${w.name} (#${winnerRank}) takes down #${ranks[gender][bigDog.schoolId]} ${b.name} in the ${gender === 'M' ? "men's" : "women's"} race.`);
          stories++;
        }
      });
    }

    // Milestone watch: career win counts hitting round numbers this week.
    for (const meetId of meetIds) {
      const meet = season.meets[meetId];
      ['M', 'W'].forEach((gender) => {
        const res = meet && meet.results[gender];
        if (!res || !res.finishers[0]) return;
        const w = gameState.world.athletes[res.finishers[0].athleteId];
        if (w && [5, 10, 15, 20].includes(w.careerStats.wins)) {
          gameState.logNews(`${w.fullName} claims career win #${w.careerStats.wins} at the ${meet.name}.`);
        }
      });
    }
  }

  function pollStories(gameState) {
    const R = gameState.rankings;
    if (!R || R.computedWeek !== gameState.week - 1 && R.computedWeek !== gameState.week) return;
    ['M', 'W'].forEach((gender) => {
      const label = gender === 'M' ? "men's" : "women's";
      const top = R[gender][0];
      if (top && top.prevRank && top.prevRank !== 1) {
        gameState.logNews(`New ${label} #1: ${top.name} takes over the top spot in the national poll.`);
      }
      const surger = R[gender].slice(0, 25).find((r) => r.prevRank && r.prevRank - r.rank >= 8);
      if (surger) {
        gameState.logNews(`Poll surge: ${surger.name} jumps ${surger.prevRank - surger.rank} spots to #${surger.rank} in the ${label} rankings.`);
      }
      const mine = R[gender].find((r) => r.schoolId === gameState.playerSchoolId);
      if (mine && mine.prevRank && mine.prevRank - mine.rank >= 5) {
        gameState.logNews(`Your ${label} squad climbs to #${mine.rank} nationally — up ${mine.prevRank - mine.rank} this week.`);
      }
    });
  }

  function previewStories(gameState) {
    const season = gameState.season;
    const week = gameState.week;
    if (week === season.conferenceWeek - 1) {
      gameState.logNews(`Championship season begins: conference titles are decided next week.`);
    } else if (week === season.regionalWeek - 1) {
      gameState.logNews(`Regionals next week — the top 2 teams in each region punch automatic tickets to the NCAA Championships.`);
    } else if (week === season.nationalWeek - 1) {
      const favM = gameState.rankings.M[0];
      const favW = gameState.rankings.W[0];
      gameState.logNews(`NCAA CHAMPIONSHIP PREVIEW: ${favM ? favM.name : '?'} leads the men's field; ${favW ? favW.name : '?'} is the women's favorite.`);
    }
  }

  window.XCD.engine.News = { processWeek };
})();
