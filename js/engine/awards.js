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
    // Permanent year-stamped badges (Part 10).
    if (honor === 'allAmerican' || honor === 'natChamp' || honor === 'confChamp') {
      window.XCD.engine.Legacy.athleteHonor(gameState, a, honor);
    }
  }

  /*
   * Runs at awards week, right after nationals. Every division's championship
   * hands out its own honors (Update 3) — runner/freshman/coach of the year,
   * All-Americans, academic All-Americans — so all three divisions build
   * decades of history independently. The player's division is mirrored to
   * the top-level M/W keys for the awards screen.
   */
  function processPostNationals(gameState, rng) {
    const season = gameState.season;
    if (!season) return;
    const natWeek = window.XCD.engine.Races.NATIONAL_WEEK;
    const natMeetIds = (season.byWeek[natWeek] || [])
      .filter((id) => { const m = season.meets[id]; return m && m.type === 'national' && m.results.M; });
    if (!natMeetIds.length) return;

    const playerDivision = (gameState.getPlayerSchool() && gameState.getPlayerSchool().division) || 'DI';
    const byDivision = {};
    natMeetIds.forEach((id) => {
      const natMeet = season.meets[id];
      const division = natMeet.division || 'DI';
      byDivision[division] = computeDivisionAwards(gameState, season, natMeet, division);
    });

    // Top-level M/W = the player's division (backward-compatible UI);
    // `divisions` holds every division's full award slate.
    const playerAwards = byDivision[playerDivision] || byDivision.DI || { M: {}, W: {} };
    gameState.history.awards = gameState.history.awards || {};
    gameState.history.awards[gameState.year] = Object.assign({}, playerAwards, { divisions: byDivision });

    updatePlayerCareer(gameState);
    awardCoachUpgradePoints(gameState, rng);
    coachFirings(gameState, rng);
  }

  function computeDivisionAwards(gameState, season, natMeet, division) {
    const yearAwards = { M: {}, W: {}, division };
    const divRankings = (gender) => (gameState.rankings[gender] || []).filter(
      (r) => ((gameState.getSchool(r.schoolId) || {}).division || 'DI') === division);

    ['M', 'W'].forEach((gender) => {
      const res = natMeet.results[gender];
      if (!res) return;
      const label = gender === 'M' ? "men's" : "women's";
      const divLabel = window.XCD.data.divisionFor(division).label;

      const Legacy = window.XCD.engine.Legacy;

      // Runner of the Year: the national champion.
      const champ = res.finishers[0];
      if (champ) {
        yearAwards[gender].runnerOfYear = { name: champ.name, school: gameState.getSchool(champ.schoolId)?.name || '?', athleteId: champ.athleteId };
        addHonor(gameState, champ.athleteId, 'natChamp');
        addHonor(gameState, champ.athleteId, 'Runner of the Year');
        if (division === (gameState.getPlayerSchool().division || 'DI')) {
          gameState.logNews(`🏅 ${champ.name} (${yearAwards[gender].runnerOfYear.school}) is the ${label} ${divLabel} Runner of the Year.`);
        }
      }

      // Freshman of the Year: top frosh at nationals, else the division's frosh poll leader.
      const frosh = res.finishers.find((f) => f.classYear === 'Freshman') ||
        ((gameState.rankings.freshmen[gender] || []).find((r) => ((gameState.getSchool(r.schoolId) || {}).division || 'DI') === division) || null);
      if (frosh) {
        const name = frosh.name;
        const schoolName = frosh.schoolId ? (gameState.getSchool(frosh.schoolId)?.name || '?') : frosh.school;
        yearAwards[gender].freshmanOfYear = { name, school: schoolName, athleteId: frosh.athleteId };
        if (frosh.athleteId) {
          addHonor(gameState, frosh.athleteId, 'Freshman of the Year');
          Legacy.recordAccolade(gameState.world.athletes[frosh.athleteId], { year: gameState.year, division, type: 'freshmanOfYear', label: 'Freshman of the Year' });
        }
      }

      // All-Americans: the division's count (DI: top 40 at nationals).
      const aaCount = window.XCD.data.divisionFor(division).championship.allAmericans;
      const allAmericans = res.finishers.slice(0, aaCount);
      yearAwards[gender].allAmericans = allAmericans.map((f) => ({
        place: f.place, name: f.name, school: gameState.getSchool(f.schoolId)?.name || '?', athleteId: f.athleteId
      }));
      allAmericans.forEach((f) => {
        addHonor(gameState, f.athleteId, 'allAmerican');
        Legacy.recordAccolade(gameState.world.athletes[f.athleteId], { year: gameState.year, division, type: 'allAmerican', label: 'First Team All-American' });
        window.XCD.engine.Legacy.program(gameState, f.schoolId).allAmericans += 1;
        const c = gameState.getCoach(gameState.getSchool(f.schoolId)?.coachId);
        if (c) c.careerRecord.allAmericans = (c.careerRecord.allAmericans || 0) + 1;
      });
      const mine = allAmericans.filter((f) => f.schoolId === gameState.playerSchoolId);
      if (mine.length) {
        gameState.logNews(`${mine.length} of your ${label} runners earn All-America honors: ${mine.map((f) => f.name).join(', ')}.`);
      }

      // Coach of the Year: biggest climb from preseason to final poll, within division.
      const pre = season.preseasonRanks && season.preseasonRanks[gender];
      if (pre) {
        let best = null;
        divRankings(gender).slice(0, 40).forEach((r) => {
          const preRank = pre[r.schoolId] || 200;
          const climb = preRank - r.rank;
          if (!best || climb > best.climb) best = { schoolId: r.schoolId, climb, finalRank: r.rank };
        });
        if (best) {
          const school = gameState.getSchool(best.schoolId);
          const coach = gameState.getCoach(school.coachId);
          yearAwards[gender].coachOfYear = { name: coach ? coach.fullName : '?', school: school.name, coachId: coach ? coach.id : null };
          if (coach) {
            coach.careerRecord.natCOY = (coach.careerRecord.natCOY || 0) + 1;
            Legacy.recordCoachAccolade(coach, { year: gameState.year, division, type: 'natCOY', label: `${divLabel} Coach of the Year (${label})` });
          }
          if (coach && coach.isPlayer) {
            gameState.logNews(`🏅 YOU are the ${label} ${divLabel} Coach of the Year (preseason #${(pre[best.schoolId] || '—')} → final #${best.finalRank})!`);
            gameState.career.awards.push(`${label} ${divLabel} Coach of the Year (${gameState.year})`);
          }
        }
      }

      // --- Conference awards (Update 4, Part 6): every conference in this
      // division hands out a Runner of the Year, Freshman of the Year, and
      // Coach of the Year, all stamped into permanent history. ---
      yearAwards.conferences = yearAwards.conferences || {};
      const confIndiv = {};   // conf -> best individual row
      const confFrosh = {};   // conf -> best freshman row
      (gameState.rankings.individuals[gender] || [])
        .filter((r) => ((gameState.getSchool(r.schoolId) || {}).division || 'DI') === division)
        .forEach((r) => {
          const s = gameState.getSchool(r.schoolId);
          if (!s) return;
          if (!confIndiv[s.conference] || r.rank < confIndiv[s.conference].rank) confIndiv[s.conference] = r;
          if (r.classYear === 'Freshman' && (!confFrosh[s.conference] || r.rank < confFrosh[s.conference].rank)) confFrosh[s.conference] = r;
        });

      // Conference Coach of the Year: biggest preseason→final climb within
      // each conference in this division (all conferences, every year).
      const confCoach = {};
      if (pre) {
        divRankings(gender).forEach((r) => {
          const s = gameState.getSchool(r.schoolId);
          if (!s) return;
          const climb = (pre[r.schoolId] || 200) - r.rank;
          const cur = confCoach[s.conference];
          if (!cur || climb > cur.climb) confCoach[s.conference] = { schoolId: r.schoolId, climb };
        });
      }

      const allConfs = new Set([...Object.keys(confIndiv), ...Object.keys(confCoach)]);
      allConfs.forEach((conf) => {
        const bucket = (yearAwards.conferences[conf] = yearAwards.conferences[conf] || {});
        const g = (bucket[gender] = bucket[gender] || {});
        const roy = confIndiv[conf];
        if (roy) {
          g.runnerOfYear = { name: roy.name, school: roy.school, athleteId: roy.athleteId };
          Legacy.recordAccolade(gameState.world.athletes[roy.athleteId], { year: gameState.year, division, conference: conf, type: 'confRunnerOfYear', label: 'Runner of the Year' });
        }
        const foy = confFrosh[conf];
        if (foy) {
          g.freshmanOfYear = { name: foy.name, school: foy.school, athleteId: foy.athleteId };
          Legacy.recordAccolade(gameState.world.athletes[foy.athleteId], { year: gameState.year, division, conference: conf, type: 'confFreshmanOfYear', label: 'Freshman of the Year' });
        }
        const cc = confCoach[conf];
        if (cc) {
          const c = gameState.getCoach(gameState.getSchool(cc.schoolId)?.coachId);
          if (c) {
            c.careerRecord.confCOY = (c.careerRecord.confCOY || 0) + 1;
            Legacy.recordCoachAccolade(c, { year: gameState.year, division, conference: conf, type: 'confCOY', label: 'Coach of the Year' });
            g.coachOfYear = { name: c.fullName, school: gameState.getSchool(cc.schoolId).name, coachId: c.id };
            if (c.isPlayer) gameState.career.awards.push(`${conf} Coach of the Year (${gameState.year})`);
          }
        }
      });

      // Academic All-Americans: best students among the division's top runners.
      const scholars = divRankings(gender)
        .map((r) => ({ r, a: gameState.world.athletes[r.athleteId] }))
        .filter((x) => x.a && x.a.academics >= 80)
        .slice(0, 10);
      yearAwards[gender].academicAllAmericans = scholars.map((x) => ({ name: x.r.name, school: x.r.school, athleteId: x.r.athleteId }));
      scholars.forEach((x) => Legacy.recordAccolade(x.a, { year: gameState.year, division, type: 'academicAllAmerican', label: 'Academic All-American' }));
    });
    return yearAwards;
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

  /*
   * AI coach hot seats: underperform your prestige for too long and you're
   * out. Fired coaches hit the free-agent pool (they may resurface at
   * another program); the chair stays open until the offseason carousel
   * fills it — schools only hire on genuine vacancies (Part 11).
   */
  function coachFirings(gameState, rng) {
    const rankIndex = { M: {}, W: {} };
    ['M', 'W'].forEach((g) => gameState.rankings[g].forEach((r) => { rankIndex[g][r.schoolId] = r.rank; }));
    const divSize = (d) => window.XCD.engine.Coaching.divisionSize(gameState, d);
    let fired = 0;

    Object.values(gameState.world.schools).forEach((school) => {
      const coach = gameState.getCoach(school.coachId);
      if (!coach) return;

      // Expectation scales with the division's pressure and the school's
      // prestige, measured against the school's own division field.
      const total = divSize(school.division);
      const pressure = window.XCD.data.divisionFor(school).expectations || 1;
      const expectedPct = 1 - school.prestige / 100;
      // Program Expectations (spec Part 2): schools recognize success in
      // EITHER program. The better squad carries most of the evaluation, so
      // a nationally competitive men's OR women's team keeps the seat cool;
      // real pressure only builds when both consistently underperform.
      const mPct = (rankIndex.M[school.id] || total) / total;
      const wPct = (rankIndex.W[school.id] || total) / total;
      const actualPct = Math.min(mPct, wPct) * 0.7 + Math.max(mPct, wPct) * 0.3;
      const underperformance = (actualPct - expectedPct) * pressure; // positive = worse than expected

      coach.hotSeat = Utils.clamp(coach.hotSeat + Math.round(underperformance * 55), 0, 100);
      if (underperformance < -0.08) coach.hotSeat = Math.max(0, coach.hotSeat - 18);
      // A top-15% squad in either gender actively cools the chair.
      if (Math.min(mPct, wPct) <= 0.15) coach.hotSeat = Math.max(0, coach.hotSeat - 25);

      // The player's seat heats up too (Update 5, Part 5) so the job-security
      // label means something — but the player is never auto-fired here; their
      // dynasty continues, with warnings, until they choose to move on.
      if (coach.isPlayer) {
        if (coach.hotSeat >= 60 && coach.yearsAtSchool >= 3) {
          gameState.logNews(`🔥 HOT SEAT: The ${school.name} administration expected more — another poor season could cost you the job.`);
        } else if (coach.hotSeat >= 34 && coach.hotSeat < 60) {
          gameState.logNews(`🟠 Warm seat: results are trailing expectations at ${school.name}. Boosters are restless.`);
        }
        return;
      }

      if (coach.hotSeat >= 60 && coach.yearsAtSchool >= 3 && rng.bool(0.45) && fired < 20) {
        fired++;
        gameState.history.firings = (gameState.history.firings || 0) + 1;
        window.XCD.engine.Legacy.closeStint(gameState, coach, school, gameState.year);
        coach.schoolId = null;   // into the free-agent pool
        coach.hotSeat = 0;
        coach.poolYears = 0;
        coach.reputation = Utils.clamp((coach.reputation || 25) - 6, 1, 99); // firings sting
        school.coachId = null;   // the chair sits open until the carousel
        school.coachChangedYear = gameState.year;
        gameState.logNews(`FIRED: ${school.name} lets ${coach.fullName} go after ${coach.yearsAtSchool} seasons. The search for a successor begins.`);
      }
    });
  }

  /* Hall of Fame: evaluated as athletes graduate. */
  function considerHallOfFame(gameState, athlete) {
    const h = athlete.honors || { allAmerican: 0, natChamp: 0, confChamp: 0, awards: [] };
    const score = athlete.careerStats.wins * 3 + athlete.careerStats.top5 +
      h.allAmerican * 8 + h.natChamp * 20 + h.confChamp * 4 +
      (athlete.generational ? 10 : 0); // legends get remembered
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

  /*
   * Nike Cross Nationals (NXN) — Update 5, Part 9. The high-school national
   * championship, contested the same week as NCAA Nationals over the current
   * recruiting class. Top prep athletes earn NXN Champion and NXN
   * All-American honors that live on their profile forever — carried into
   * college when they enroll, so recruiting has richer stories.
   */
  function runNXN(gameState, rng) {
    const recruits = Object.values(gameState.world.recruits || {});
    if (!recruits.length || !gameState.season) return;
    const Legacy = window.XCD.engine.Legacy;
    const year = gameState.year;
    const AA_PER_GENDER = 15; // champion + All-Americans
    const result = { M: [], W: [], year };

    ['M', 'W'].forEach((gender) => {
      // Domestic high-schoolers contest NXN.
      const field = recruits.filter((r) => r.gender === gender && r.source === 'HS');
      if (field.length < 10) return;
      // A race score: ability plus genuine race-day variance so upsets happen
      // and it isn't simply the highest-rated recruit every time.
      const scored = field.map((r) => ({
        r,
        score: (r.currentOverall * 0.6 + r.potential * 0.4) + rng.gaussian(0, 6) +
               ((r.mentalToughness || 60) - 60) * 0.05
      })).sort((a, b) => b.score - a.score);

      const top = scored.slice(0, 30);
      top.forEach((entry, i) => {
        result[gender].push({ recruitId: entry.r.id, name: entry.r.fullName, place: i + 1, state: entry.r.hometownState });
      });

      top.slice(0, AA_PER_GENDER).forEach((entry, i) => {
        const rec = entry.r;
        const isChamp = i === 0;
        const key = isChamp ? 'nxnChampion' : 'nxnAllAmerican';
        Legacy.athleteHonor(gameState, rec, key);
        Legacy.recordAccolade(rec, {
          year, division: null, conference: null,
          type: key, label: isChamp ? 'NXN Champion' : 'NXN All-American'
        });
        rec.nxn = rec.nxn || {};
        if (isChamp) rec.nxn.champion = year;
        else rec.nxn.allAmerican = year;
      });

      const champ = top[0].r;
      gameState.logNews(`👟 NIKE CROSS NATIONALS: ${champ.fullName} (${champ.hometownState === 'INT' ? champ.country : champ.hometownState}) wins the ${gender === 'M' ? "boys'" : "girls'"} NXN title — an instant recruiting prize.`);
      // Call out any NXN standouts the player is already recruiting.
      top.slice(0, AA_PER_GENDER).forEach((entry) => {
        const st = entry.r.interests && entry.r.interests[gameState.playerSchoolId];
        if (st && (st.offered || st.interest > 40) && entry.r.id !== champ.id) {
          gameState.logNews(`👟 NXN All-American ${entry.r.fullName} — on your recruiting board — turns heads at Nike Cross Nationals.`);
        }
      });
    });

    gameState.season.nxn = result;
  }

  window.XCD.engine.Awards = { processPostNationals, considerHallOfFame, addHonor, runNXN, coachFirings };
})();
