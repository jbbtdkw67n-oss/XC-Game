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
  // Eased (Elite Invitational Qualification): the bar sits a notch lower so
  // emerging top-25-caliber programs can get into the big fields sooner —
  // blue bloods still walk in automatically.
  function eliteRequirement(meet) {
    const w = meet.elite || 1;
    return Math.round(52 + (w - 1) * 40); // ~54 (weight 1.05) → ~70 (weight 1.45)
  }

  /*
   * Does this program qualify for an elite invitational? Prestige is the
   * classic route — but a rapidly improving program ranked inside the top 25
   * of its poll has EARNED an invitation regardless of its brand (Elite
   * Invitational Qualification), so hot teams break into the big meets years
   * before their prestige catches up.
   */
  function qualifiesForElite(gameState, school, meet) {
    if (school.prestige >= eliteRequirement(meet)) return true;
    const r = gameState.rankings;
    if (!r) return false;
    const best = Math.min(
      (r.M.find((x) => x.schoolId === school.id) || {}).rank || 999,
      (r.W.find((x) => x.schoolId === school.id) || {}).rank || 999);
    return best <= 25;
  }

  // Course information for a meet (Course Information display): location,
  // course name, hilliness profile, altitude, and prestige tier.
  function courseInfo(gameState, meet) {
    const D_ = window.XCD.data;
    const cm = meet.courseMeta || {};
    const host = gameState.getSchool(meet.hostId);
    const hilliness = (meet.conditions && meet.conditions.hilliness) ?? cm.hilliness ?? 50;
    const altitude = (meet.conditions && meet.conditions.altitude) ||
      (cm.altitudeFt !== undefined ? D_.altitudeCategory(cm.altitudeFt) : (host && host.weather.altitude)) || 'Low';
    const stateName = (D_.STATE_NAMES || {})[cm.state || (host && host.state)] || cm.state || (host && host.state) || '';
    // The host city is a REAL town (Realism Update): the venue's own city for a
    // famous course, otherwise the host program's real campus city.
    const hostCity = cm.city || (host ? D_.cityForSchool(host) : '');
    return {
      hostName: host ? host.name : '',
      venue: meet.venue || cm.course || '',
      city: hostCity,
      state: stateName,
      location: hostCity ? `${hostCity}, ${stateName}` : (host ? `${host.name} campus` : ''),
      course: cm.course || (host ? `${host.name} Cross Country Course` : ''),
      altitudeFt: cm.altitudeFt,
      altitude,
      hilliness,
      hillinessLabel: D_.hillinessLabel ? D_.hillinessLabel(hilliness) : '',
      prestige: cm.prestige || (meet.elite ? (meet.elite >= 1.25 ? 'Elite' : 'High') : 'Standard')
    };
  }

  /*
   * Host information for a meet, ready to drop into any screen (Race Center,
   * Schedule): who hosts it and where. Invitationals, conference meets, and
   * regionals read "Hosted by {school}"; the national championship reads
   * "Hosted at {venue}" — always with the real city and course.
   */
  function meetHostHtml(gameState, meet) {
    if (!meet) return '';
    const esc = window.XCD.core.Utils.escapeHtml;
    const ci = courseInfo(gameState, meet);
    const cm = meet.courseMeta || {};
    const namedCourse = meet.venue || cm.course || '';
    const rows = [];
    if (meet.type === 'national') {
      if (namedCourse) rows.push(`<span style="color:var(--text-faint);">Hosted at</span> <strong>${esc(namedCourse)}</strong>`);
      if (ci.location) rows.push(`📍 ${esc(ci.location)}`);
    } else {
      if (ci.hostName) rows.push(`<span style="color:var(--text-faint);">Hosted by</span> <strong>${esc(ci.hostName)}</strong>`);
      const locBits = [ci.location, namedCourse].filter(Boolean).join(' • ');
      if (locBits) rows.push(`📍 ${esc(locBits)}`);
    }
    return rows.length ? rows.map((r) => `<div>${r}</div>`).join('') : '';
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

      // Elite invitationals that week (gated by prestige OR a top-25 poll
      // ranking — hot programs earn their way into the big fields).
      meetsThisWeek.filter((m) => m.elite).forEach((m) => {
        const req = eliteRequirement(m);
        options.push({
          meetId: m.id, label: m.name, tier: 'Elite',
          prestigeReq: req, eligible: qualifiesForElite(gameState, school, m),
          field: (m.schoolIds || []).length,
          host: (gameState.getSchool(m.hostId) || {}).name || '',
          course: courseInfo(gameState, m)
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
          host: (gameState.getSchool(regional.hostId) || {}).name || '',
          course: courseInfo(gameState, regional)
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
            host: (gameState.getSchool(m.hostId) || {}).name || '',
            course: courseInfo(gameState, m)
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
    // Week 1 Administrative Phase (spec Part 2, Section 15): the schedule is
    // set during Week 1 and then finalized for the season — permanently.
    if (gameState.scheduleLocked && gameState.scheduleLocked()) {
      return { ok: false, message: 'The schedule is finalized — meets lock for the season after Week 1.' };
    }
    if (gameState.week > week) return { ok: false, message: 'That week has already been raced.' };
    const pid = gameState.playerSchoolId;
    const school = gameState.getPlayerSchool();

    let target = null;
    if (meetId) {
      target = season.meets[meetId];
      if (!target) return { ok: false, message: 'That meet is not on the calendar.' };
      if (target.elite && !qualifiesForElite(gameState, school, target)) {
        return { ok: false, message: `${target.name} only invites programs with prestige ${eliteRequirement(target)}+ (or a top-25 ranking). Build your program's standing first.` };
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

  window.XCD.engine.Scheduling = { buildOptions, select, eliteRequirement, qualifiesForElite, courseInfo, meetHostHtml };
})();
