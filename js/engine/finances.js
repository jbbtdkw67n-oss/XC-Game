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

  // Once-a-year booster push driven by prestige and the coach's culture.
  function fundraise(gameState) {
    if (gameState.fundraisedYear === gameState.year) {
      return { ok: false, message: 'The boosters already gave this year.' };
    }
    const school = gameState.getPlayerSchool();
    const coach = gameState.getPlayerCoach();
    // Boosters give to winners with strong programs — and coaches whose
    // culture makes people want to be part of it.
    const amount = Math.round((school.prestige * 320 + coach.culture * 260 + 8000) / 100) * 100;
    school.budget.facilitiesFund += amount;
    gameState.fundraisedYear = gameState.year;
    gameState.logNews(`Fundraiser: boosters commit $${amount.toLocaleString()} to the facilities fund.`);
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

      // Budgets track prestige slowly (booster enthusiasm).
      const tierScale = { 1: 1.0, 2: 0.65, 3: 0.4, 4: 0.22 }[school.conferenceTier] || 0.4;
      const target = Math.round((300000 + school.prestige * 4000) * tierScale);
      school.budget.total = Math.round(school.budget.total * 0.85 + target * 0.15) + bonus;
      school.budget.recruiting = Math.round(school.budget.total * 0.16);
      school.budget.travel = Math.round(school.budget.total * 0.22);
      school.budget.scholarships = Math.round(school.budget.total * 0.42);
      school.budget.nil = Math.round(school.budget.total * 0.08 * (school.conferenceTier === 1 ? 2 : 1));
      school.budget.facilitiesFund = Math.min(
        school.budget.facilitiesFund + Math.round(school.budget.total * 0.12) + bonus,
        Math.round(school.budget.total * 0.5)
      );

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
    });
  }

  window.XCD.engine.Finances = { upgradeFacility, fundraise, yearlyRefresh, upgradeCost, UPGRADE_STEP };
})();
