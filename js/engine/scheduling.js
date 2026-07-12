/*
 * SchedulingEngine — Update 4 (Part 7): Custom Race Scheduling.
 *
 * A new preseason phase: the player chooses which regular-season meets to
 * attend, but eligibility is gated by team prestige. Elite invitationals only
 * open their doors to elite/high-prestige programs; a rebuilding low-prestige
 * program races regional invitationals until sustained success lifts it into
 * the stronger fields. This makes prestige genuinely meaningful.
 *
 * The season is still fully auto-built by the race engine, so AI programs and
 * the headless simulation are unaffected — this layer only lets the *player*
 * swap which meet they enter each regular-season week (championship weeks are
 * fixed: everyone competes). Defaults mirror the auto-assignment, so a player
 * who never opens the screen gets exactly today's behavior.
 */
(function () {
  const D = window.XCD.data;

  // Prestige a program needs to earn an invite to a given elite meet. Bigger,
  // more prestigious fields demand more; all scale off the meet's poll weight.
  function eliteRequirement(meet) {
    const w = meet.elite || 1;
    return Math.round(58 + (w - 1) * 45); // ~64 (weight 1.15) → ~78 (weight 1.45)
  }

  function playerMeetsThisWeek(gameState, week) {
    const season = gameState.season;
    return (season.byWeek[week] || [])
      .map((id) => season.meets[id])
      .filter((m) => m && m.type === 'invite' && !m.preNationals);
  }

  /*
   * Build the player's selectable options for every regular-season race week.
   * Each option is a meet the player may enter (or a Rest/Bye), tagged with a
   * prestige requirement and whether the player currently qualifies.
   */
  function buildOptions(gameState) {
    const season = gameState.season;
    if (!season) return null;
    const school = gameState.getPlayerSchool();
    const prestige = school ? school.prestige : 50;
    const pid = gameState.playerSchoolId;
    const weeks = [];

    (season.raceWeeks || []).forEach((week) => {
      const meetsThisWeek = playerMeetsThisWeek(gameState, week);
      const currentId = season.playerMeetByWeek[week] || null;
      const options = [];
      const seen = new Set();

      // Elite invitationals that week (gated by prestige).
      meetsThisWeek.filter((m) => m.elite).forEach((m) => {
        const req = eliteRequirement(m);
        options.push({
          meetId: m.id, label: m.name, tier: 'Elite',
          prestigeReq: req, eligible: prestige >= req,
          field: (m.schoolIds || []).length,
          host: (gameState.getSchool(m.hostId) || {}).name || ''
        });
        seen.add(m.id);
      });

      // The player's current (or a home-region) regional invitational —
      // always available, no prestige gate.
      let regional = currentId && season.meets[currentId] && !season.meets[currentId].elite
        ? season.meets[currentId] : null;
      if (!regional) regional = meetsThisWeek.find((m) => !m.elite && (m.schoolIds || []).includes(pid));
      if (!regional) regional = meetsThisWeek.find((m) => !m.elite && gameState.getSchool(m.hostId)?.region === school.region);
      if (regional && !seen.has(regional.id)) {
        options.push({
          meetId: regional.id, label: regional.name, tier: 'Regional',
          prestigeReq: 0, eligible: true, field: (regional.schoolIds || []).length,
          host: (gameState.getSchool(regional.hostId) || {}).name || ''
        });
        seen.add(regional.id);
      }

      // A couple of alternative non-elite invitationals (nearby regions),
      // sorted by field quality, so mid-tier programs can pick a step up.
      meetsThisWeek
        .filter((m) => !m.elite && !seen.has(m.id))
        .sort((a, b) => avgFieldPrestige(gameState, b) - avgFieldPrestige(gameState, a))
        .slice(0, 2)
        .forEach((m) => {
          const q = Math.round(avgFieldPrestige(gameState, m));
          // A "premier" (strong) invitational asks for mid prestige.
          const req = q >= 65 ? 55 : 0;
          options.push({
            meetId: m.id, label: m.name, tier: req ? 'Premier' : 'Invitational',
            prestigeReq: req, eligible: prestige >= req, field: (m.schoolIds || []).length,
            host: (gameState.getSchool(m.hostId) || {}).name || ''
          });
          seen.add(m.id);
        });

      // Rest / bye: skip racing this week and bank a training block.
      options.push({ meetId: null, label: 'Rest / Bye Week', tier: 'Rest', prestigeReq: 0, eligible: true, field: 0, host: '' });

      // Mark the current selection.
      options.forEach((o) => { o.selected = (o.meetId || null) === currentId; });
      if (!options.some((o) => o.selected)) {
        const rest = options.find((o) => o.meetId === null);
        if (rest && !currentId) rest.selected = true;
      }

      weeks.push({ week, locked: gameState.week > week, options });
    });

    season.playerSchedule = { weeks };
    return season.playerSchedule;
  }

  function avgFieldPrestige(gameState, meet) {
    const ids = meet.schoolIds || [];
    if (!ids.length) return 40;
    let sum = 0, n = 0;
    ids.forEach((id) => { const s = gameState.getSchool(id); if (s) { sum += s.prestige; n++; } });
    return n ? sum / n : 40;
  }

  /*
   * Select a meet (or Rest, meetId === null) for a given regular-season week.
   * Removes the player from every meet that week first, then enters the chosen
   * meet. Refuses ineligible elite meets and locked (already-run) weeks.
   */
  function select(gameState, week, meetId) {
    const season = gameState.season;
    if (!season) return { ok: false, message: 'No active season.' };
    if (gameState.week > week) return { ok: false, message: 'That week has already been raced.' };
    const pid = gameState.playerSchoolId;
    const school = gameState.getPlayerSchool();

    let target = null;
    if (meetId) {
      target = season.meets[meetId];
      if (!target) return { ok: false, message: 'That meet is not on the calendar.' };
      if (target.elite && school.prestige < eliteRequirement(target)) {
        return { ok: false, message: `${target.name} only invites programs with prestige ${eliteRequirement(target)}+. Build your program's standing first.` };
      }
    }

    // Remove the player from every invitational that week.
    playerMeetsThisWeek(gameState, week).forEach((m) => {
      m.schoolIds = (m.schoolIds || []).filter((id) => id !== pid);
    });
    delete season.playerMeetByWeek[week];

    if (target) {
      if (!target.schoolIds.includes(pid)) target.schoolIds.push(pid);
      season.playerMeetByWeek[week] = target.id;
    }

    buildOptions(gameState);
    return {
      ok: true,
      message: target ? `Entered ${target.name} (Week ${week}).` : `Resting Week ${week} — a training block instead of a meet.`
    };
  }

  window.XCD.engine.Scheduling = { buildOptions, select, eliteRequirement };
})();
