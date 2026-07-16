/*
 * FinancesEngine — Phase 6: facility upgrades, fundraising, and yearly
 * budget refresh with booster money that follows success. All schools
 * actively improve, not just the player's.
 */
(function () {
  const Utils = window.XCD.core.Utils;

  const UPGRADE_STEP = 4; // rating points per upgrade

  function upgradeCost(level) {
    return 12000 + level * 1000;
  }

  function upgradeFacility(gameState, schoolId, facilityKey) {
    const school = gameState.getSchool(schoolId);
    if (!school || !(facilityKey in school.facilities)) return { ok: false, message: 'Unknown facility.' };
    const level = school.facilities[facilityKey];
    if (level >= 99) return { ok: false, message: 'Already world-class.' };
    const cost = upgradeCost(level);
    if (school.budget.facilitiesFund < cost) {
      return { ok: false, message: `Not enough in the facilities fund ($${cost.toLocaleString()} needed).` };
    }
    school.budget.facilitiesFund -= cost;
    school.facilities[facilityKey] = Utils.clamp(level + UPGRADE_STEP, 0, 99);
    return { ok: true, message: `Upgrade complete (+${UPGRADE_STEP}) — $${cost.toLocaleString()} spent.`, cost };
  }

  /*
   * School size (facilities overhaul): in this world a program's size IS its
   * division and conference tier — a power-conference DI school is a huge
   * state university with a giant alumni base; a DIII program is a small
   * college. Size scales how much money a fundraising push can move.
   */
  function schoolSizeFactor(school) {
    const div = school.division || 'DI';
    if (div === 'DII') return 0.55;
    if (div === 'DIII') return 0.4;
    return ({ 1: 1.5, 2: 1.15, 3: 0.9 }[school.conferenceTier] || 0.9);
  }

  function schoolSizeLabel(school) {
    const f = schoolSizeFactor(school);
    return f >= 1.4 ? 'Large university' : f >= 0.9 ? 'Mid-size university' : f >= 0.55 ? 'Small university' : 'Small college';
  }

  /*
   * How successful is this program RIGHT NOW in its donors' eyes? Current
   * poll standing, hardware in the trophy case, and prestige trajectory.
   */
  function programSuccessScore(gameState, school) {
    let best = 999;
    if (gameState.rankings) {
      ['M', 'W'].forEach((g) => {
        const row = gameState.rankings[g].find((r) => r.schoolId === school.id);
        if (row) best = Math.min(best, row.rank);
      });
    }
    const rankMoney = best <= 5 ? 14000 : best <= 15 ? 9000 : best <= 40 ? 4500 : best <= 100 ? 1500 : 0;
    const hs = school.historicalSuccess || {};
    const hardware = Math.min(12000,
      ((hs.nationalTitlesM || 0) + (hs.nationalTitlesW || 0)) * 2500 +
      ((hs.conferenceTitlesM || 0) + (hs.conferenceTitlesW || 0)) * 350);
    const momentum = Utils.clamp((school.prestigeMomentum || 0) * 900, -3000, 4500);
    return rankMoney + hardware + momentum;
  }

  /*
   * Once-a-year booster push (facilities overhaul): what a program can
   * raise is driven by how successful it is (poll standing, titles,
   * trajectory) and how big the school is — amplified by the Alumni
   * Center, the facility built to keep donors close.
   */
  function fundraise(gameState) {
    if (gameState.fundraisedYear === gameState.year) {
      return { ok: false, message: 'The boosters already gave this year.' };
    }
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    const base = 5000 + school.prestige * 180 + coach.culture * 120;
    const success = programSuccessScore(gameState, school);
    const alumniMult = 0.7 + (school.facilities.alumniCenter || 35) / 110; // ~0.75–1.6
    const amount = Math.round((base + success) * schoolSizeFactor(school) * alumniMult / 100) * 100;
    school.budget.facilitiesFund += amount;
    gameState.fundraisedYear = gameState.year;
    gameState.logNews(`Fundraiser: boosters commit $${amount.toLocaleString()} to the facilities fund (${schoolSizeLabel(school).toLowerCase()}, alumni network ${school.facilities.alumniCenter}).`);
    return { ok: true, message: `Boosters commit $${amount.toLocaleString()}!`, amount };
  }

  /*
   * Yearly refresh at rollover: booster support follows success, budgets
   * regrow, and AI programs spend on their weakest facilities.
   */
  function yearlyRefresh(gameState, rng) {
    const lastYear = gameState.year - 1;
    const champs = (gameState.history.nationalChampions || {})[lastYear] || {};
    const confChamps = (gameState.history.conferenceChampions || {})[lastYear] || {};

    Object.values(gameState.world.schools).forEach((school) => {
      // Success money
      let bonus = 0;
      ['M', 'W'].forEach((g) => {
        if (champs[g] && champs[g].teamId === school.id) bonus += 60000;
        if (confChamps[`${school.conference}-${g}`] === school.name) bonus += 15000;
      });

      // Budgets track prestige slowly (booster enthusiasm), scaled by the
      // school's division (Part 13): DII/DIII operate on far less money.
      const division = window.XCD.data.divisionFor(school);
      const tierScale = ({ 1: 1.0, 2: 0.65, 3: 0.4, 4: 0.22 }[school.conferenceTier] || 0.4) * division.budgetScale;
      const target = Math.round((300000 + school.prestige * 4000) * tierScale);
      school.budget.total = Math.round(school.budget.total * 0.85 + target * 0.15) + bonus;
      school.budget.recruiting = Math.round(school.budget.total * 0.16);
      school.budget.travel = Math.round(school.budget.total * 0.22);
      school.budget.scholarships = division.scholarshipModel === 'none' ? 0 : Math.round(school.budget.total * 0.42);
      school.budget.nil = division.nil ? Math.round(school.budget.total * 0.08 * (school.conferenceTier === 1 ? 2 : 1)) : 0;
      // The alumni center quietly compounds: a strong donor network tops up
      // the facilities fund a little faster every year.
      const alumniTopUp = 1 + ((school.facilities.alumniCenter || 35) - 35) / 220;
      school.budget.facilitiesFund = Math.min(
        school.budget.facilitiesFund + Math.round(school.budget.total * 0.12 * alumniTopUp) + bonus,
        Math.round(school.budget.total * 0.5)
      );

      // Facility maintenance decay (Update 13, Phase 3): buildings age. Every
      // facility slowly loses a very small amount of quality — a single point
      // once every few years, on average — so a program that never reinvests
      // gradually slips. Upgrades (+4/step) and the AI's yearly projects
      // comfortably outpace it, and a generous floor means no program is ever
      // punished into ruin simply for existing. Decay is applied BEFORE the AI
      // reinvests below, so smart programs stay ahead of the wear.
      const DECAY_FLOOR = 25;
      Object.keys(school.facilities).forEach((key) => {
        const level = school.facilities[key];
        if (level <= DECAY_FLOOR) return; // never grind a program down to nothing
        // Higher-end facilities cost a touch more to keep pristine; roughly a
        // 1-point loss every three years at a typical level.
        const wearChance = 0.24 + Math.max(0, level - 70) / 260; // ~0.24–0.35
        if (rng.bool(wearChance)) {
          school.facilities[key] = Math.max(DECAY_FLOOR, level - 1);
        }
      });

      // AI schools invest in their weakest facilities (max 2 projects/year).
      if (school.id !== gameState.playerSchoolId) {
        for (let i = 0; i < 2; i++) {
          const weakest = Object.entries(school.facilities).sort((a, b) => a[1] - b[1])[0];
          if (!weakest) break;
          const cost = upgradeCost(weakest[1]);
          if (school.budget.facilitiesFund < cost) break;
          school.budget.facilitiesFund -= cost;
          school.facilities[weakest[0]] = Utils.clamp(weakest[1] + UPGRADE_STEP, 0, 99);
        }
      }

      // (Facilities-driven prestige movement now lives in the dynamic
      // PrestigeEngine — Part 3 — alongside every other prestige input.)
    });
  }

  window.XCD.engine.Finances = {
    upgradeFacility, fundraise, yearlyRefresh, upgradeCost,
    schoolSizeFactor, schoolSizeLabel, programSuccessScore, UPGRADE_STEP
  };
})();
