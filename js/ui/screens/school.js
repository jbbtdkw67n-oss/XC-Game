/*
 * My Program screen: school profile, coach card, facilities, budget, history.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  // Five facilities, each with a stated training implication (facilities
  // overhaul) — the tooltip tells the player exactly what the money buys.
  const FACILITY_LABELS = {
    trainingCenter: ['Training Center', 'Development speed: every athlete grows faster each week, and training fitness builds quicker.'],
    weightRoom: ['Weight Room', 'Injury prevention: strong bodies break down less under the same load.'],
    rehabCenter: ['Rehab Center', 'Recovery: faster weekly fatigue recovery, shorter injury layoffs, and less fitness lost while hurt.'],
    indoorTrack: ['Indoor Track', 'Sharpening: intervals, speed sessions, and race simulations pay out more, and Speed develops faster from speed work.'],
    alumniCenter: ['Alumni Center', 'Fundraising: bigger booster pushes and a faster-refilling facilities fund, scaled by program success and school size.'],
    travel: ['Travel Program', 'Travel budget: a bigger program means a bigger hard travel budget every season — more meets, farther away. Upgrades apply to this season too.']
  };
  const FACILITY_ICONS = {
    trainingCenter: '🏟', weightRoom: '🏋️', rehabCenter: '🩺', indoorTrack: '🏃', alumniCenter: '🎓', travel: '🚌'
  };
  const facilityLevel = (school, key) => key === 'travel'
    ? window.XCD.engine.MeetCalendar.travelRating(school) : school.facilities[key];

  const COACH_ATTRS = [
    ['recruiting', 'Recruiting', 'Recruiting effectiveness: weekly points and pull with prospects.'],
    ['training', 'Training', 'Athlete development speed, every single week.'],
    ['peaking', 'Peaking', 'Championship form at Conference, Regionals, and Nationals.'],
    ['culture', 'Culture', 'Morale, happiness, chemistry, and keeping runners out of the portal.']
  ];

  let activeTab = 'overview';
  let histSub = 'archive'; // Update 12: Archive · Records · Hall of Fame

  /* ---------------- History accessors (Update 12) -------------------- *
   * Reconstruct this program's complete historical archive from the
   * permanent, universe-wide ledgers. Everything here updates automatically
   * after every season because it reads straight from stored history.
   */
  function programHistory(game, school) {
    const H = game.history;
    const sid = school.id;
    const name = school.name;
    const teamNat = [];   // { year, gender, division, coach, teamOverall, teamScore }
    const indivNat = [];  // { year, gender, athlete, athleteId, coach, event }
    const confTeam = [];  // { year, gender, conf }
    const indivConf = []; // { year, gender, athlete, athleteId, coach }
    const regTeam = [];   // { year, gender, region }
    const indivReg = [];  // { year, gender, athlete, athleteId }

    (H.championTeams || []).forEach((t) => {
      if (t.schoolId !== sid) return;
      teamNat.push({ year: t.year, gender: t.gender, division: t.division, coach: t.coachName, teamOverall: t.teamOverall, teamScore: t.teamScore, roster: t.roster || [], rec: t });
    });

    const Legacy = window.XCD.engine.Legacy;
    // Championship History fix: the coach of record for every entry — the
    // name stamped on the record when available, otherwise resolved from the
    // permanent head-coaching ledger for that season.
    const coachOf = (year) => Legacy.coachForSchoolYear(game, sid, year) || '';

    Object.keys(H.nationalChampions || {}).forEach((year) => {
      const slate = H.nationalChampions[year];
      Object.keys(slate).forEach((key) => {
        const rec = slate[key];
        const g = key.endsWith('W') ? 'W' : 'M';
        if (rec.individualSchoolId === sid || rec.individualSchool === name) {
          indivNat.push({ year: Number(year), gender: g, athlete: rec.individual, athleteId: rec.individualId, coach: rec.individualCoach || coachOf(year), event: g === 'M' ? '10K' : '6K' });
        }
      });
    });

    Object.keys(H.conferenceChampions || {}).forEach((year) => {
      const slate = H.conferenceChampions[year];
      const meta = (H.confChampMeta || {})[year] || {};
      ['M', 'W'].forEach((g) => {
        Object.keys(slate).forEach((key) => {
          if (!key.endsWith('-' + g)) return;
          if (slate[key] === name) {
            confTeam.push({
              year: Number(year), gender: g, conf: key.slice(0, key.lastIndexOf('-')),
              coach: (meta[key] && meta[key].coach) || coachOf(year)
            });
          }
        });
      });
    });
    Object.keys(H.confIndivChampions || {}).forEach((year) => {
      const slate = H.confIndivChampions[year];
      Object.keys(slate).forEach((key) => {
        const rec = slate[key];
        if (rec.schoolId !== sid) return;
        indivConf.push({ year: Number(year), gender: key.endsWith('W') ? 'W' : 'M', athlete: rec.name, athleteId: rec.athleteId, coach: rec.coach });
      });
    });

    Object.keys(H.regionalChampions || {}).forEach((year) => {
      const slate = H.regionalChampions[year];
      const meta = (H.regChampMeta || {})[year] || {};
      Object.keys(slate).forEach((key) => {
        if (slate[key] === name) {
          const m = meta[`${school.division || 'DI'}:${key}`] || meta[key];
          regTeam.push({
            year: Number(year), gender: key.endsWith('W') ? 'W' : 'M',
            region: key.slice(0, key.lastIndexOf('-')),
            coach: (m && m.coach) || coachOf(year)
          });
        }
      });
    });
    Object.keys(H.regIndivChampions || {}).forEach((year) => {
      const slate = H.regIndivChampions[year];
      Object.keys(slate).forEach((key) => {
        const rec = slate[key];
        if (rec.schoolId !== sid) return;
        indivReg.push({ year: Number(year), gender: key.endsWith('W') ? 'W' : 'M', athlete: rec.name, athleteId: rec.athleteId });
      });
    });

    const byYearDesc = (a, b) => b.year - a.year;
    [teamNat, indivNat, confTeam, indivConf, regTeam, indivReg].forEach((l) => l.sort(byYearDesc));
    return { teamNat, indivNat, confTeam, indivConf, regTeam, indivReg };
  }

  // Longest run of consecutive years the program won its conference title
  // (either gender), reconstructed from permanent history.
  function longestConfStreak(game, school) {
    const H = game.history;
    const years = Object.keys(H.conferenceChampions || {}).map(Number).sort((a, b) => a - b);
    let best = 0, run = 0, prev = null;
    years.forEach((y) => {
      const slate = H.conferenceChampions[y];
      const won = Object.keys(slate).some((k) => slate[k] === school.name);
      if (won) { run = (prev !== null && y === prev + 1) ? run + 1 : 1; prev = y; best = Math.max(best, run); }
    });
    return best;
  }

  function render(container) {
    const game = UI.state.game;
    const school = game.getPlayerSchool();
    const coach = game.getPlayerCoach();

    container.innerHTML = `
      <div class="screen-header">
        ${UI.screenTitle('My Program', `<span style="display:inline-flex; align-items:center; gap:8px;">${UI.kitSwatch(school)}<strong style="color:var(--text);">${Utils.escapeHtml(school.name)}</strong> ${Utils.escapeHtml(school.mascot || '')}</span>`)}
        <div class="actions">
          <div class="pill-tabs">
            <button data-stab="overview" class="${activeTab === 'overview' ? 'active' : ''}">Overview</button>
            <button data-stab="staff" class="${activeTab === 'staff' ? 'active' : ''}">Staff</button>
            <button data-stab="history" class="${activeTab === 'history' ? 'active' : ''}">History</button>
          </div>
          <span style="color:var(--text-dim); font-size:13px;">
            ${window.XCD.data.divisionFor(school).label} • ${Utils.escapeHtml(school.conference)} • ${school.region} • ${Utils.escapeHtml(window.XCD.data.cityForSchool(school))}, ${window.XCD.data.STATE_NAMES[school.state] || school.state}
          </span>
        </div>
      </div>
      <div id="school-body"></div>`;

    const body = container.querySelector('#school-body');
    if (activeTab === 'history') renderHistoryTab(game, school, body);
    else if (activeTab === 'staff') renderStaffTab(game, school, coach, body, container);
    else renderOverview(game, school, coach, body, container);

    container.querySelectorAll('[data-stab]').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.stab; render(container); });
    });
  }

  /* ---------------- History tab: the permanent program archive ------- */
  function renderHistoryTab(game, school, body) {
    body.innerHTML = `
      <div class="pill-tabs" style="margin-bottom:14px;">
        <button data-hsub="archive" class="${histSub === 'archive' ? 'active' : ''}">📜 Archive</button>
        <button data-hsub="timeline" class="${histSub === 'timeline' ? 'active' : ''}">🕰 Timeline</button>
        <button data-hsub="records" class="${histSub === 'records' ? 'active' : ''}">📊 Records</button>
        <button data-hsub="stats" class="${histSub === 'stats' ? 'active' : ''}">📈 Statistics</button>
        <button data-hsub="hof" class="${histSub === 'hof' ? 'active' : ''}">🏛 Hall of Fame</button>
      </div>
      <div id="hist-sub-body"></div>`;
    const sub = body.querySelector('#hist-sub-body');
    ({ archive: renderArchive, timeline: renderTimeline, records: renderRecords, stats: renderStatistics, hof: renderSchoolHOF })[histSub](game, school, sub);
    body.querySelectorAll('[data-hsub]').forEach((btn) => {
      btn.addEventListener('click', () => { histSub = btn.dataset.hsub; renderHistoryTab(game, school, body); });
    });
  }

  // Shared: wire every [data-ath]/[data-school] name in a container to its
  // profile (Update 12, Phase 3 — no dead names on the program page).
  function wireProgramClicks(game, el) {
    el.querySelectorAll('[data-ath]').forEach((n) => {
      n.addEventListener('click', (e) => { e.stopPropagation(); UI.openAthlete(game, n.dataset.ath, n.dataset.athName || n.textContent.trim()); });
    });
    el.querySelectorAll('[data-coach]').forEach((n) => {
      n.addEventListener('click', (e) => { e.stopPropagation(); UI.openCoach(game, n.dataset.coach || null, n.dataset.coachName || n.textContent.trim()); });
    });
  }

  /* Phase 4 — Program History Expansion: a complete historical archive. */
  function renderArchive(game, school, body) {
    const Legacy = window.XCD.engine.Legacy;
    const prog = Legacy.program(game, school.id);
    const ph = school.prestigeHistory || [];
    const trend = ph.slice(-10).map((p) => p.prestige);
    const trendStr = trend.length >= 2 ? `${trend[0]} → ${trend[trend.length - 1]} over ${trend.length} yrs` : '—';
    const h = programHistory(game, school);
    const gTag = (g) => g === 'M' ? "Men's" : "Women's";
    const athLink = (name, id, gender) => UI.personName(game, 'ath', id, name, { extra: { gender, schoolId: school.id } });
    const coachLink = (name, coachId) => name ? UI.personName(game, 'coach', coachId, name) : '—';
    const sectionTable = (title, headers, rows, empty) => `
      <div class="card" style="margin-bottom:16px;">
        <h2>${title}</h2>
        ${rows.length ? `<div class="table-wrap"><table class="data">
          <thead><tr>${headers.map((hd) => `<th>${hd}</th>`).join('')}</tr></thead>
          <tbody>${rows.join('')}</tbody></table></div>`
        : `<div style="color:var(--text-dim); font-size:13px;">${empty}</div>`}
      </div>`;

    body.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Conference Titles</div><div class="value">${prog.confTitles || 0}</div><div class="sub">${prog.regionalTitles || 0} regional titles</div></div>
        <div class="stat-tile"><div class="label">National Titles</div><div class="value">${prog.natTitles}</div><div class="sub">${prog.natRunnerUp || 0} runner-up</div></div>
        <div class="stat-tile"><div class="label">Best NCAA Finish</div><div class="value">${prog.bestFinish ? Utils.ordinal(prog.bestFinish) : '—'}</div><div class="sub">${prog.podiums} podiums</div></div>
        <div class="stat-tile"><div class="label">Highest Ranking</div><div class="value">${prog.highestRank ? '#' + prog.highestRank : '—'}</div><div class="sub">prestige ${trendStr}</div></div>
      </div>

      ${sectionTable(':trophy-national: Team National Championships',
        ['Year', 'Squad', 'Coach', 'Team OVR', 'Score', 'Roster'],
        h.teamNat.map((t, ti) => `<tr>
          <td>${t.year}</td><td>${gTag(t.gender)}</td><td>${coachLink(t.coach)}</td>
          <td class="num">${t.teamOverall || '—'}</td><td class="num">${t.teamScore ?? '—'}</td>
          <td>${(t.roster && t.roster.length) ? `<span class="clickable" data-view-roster="${ti}" style="cursor:pointer; color:var(--accent-hover);">View ▸</span>` : '—'}</td>
        </tr>`),
        'No national team titles yet — the banner awaits.')}

      ${sectionTable('🥇 Individual National Champions',
        ['Year', 'Athlete', 'Coach', 'Event'],
        h.indivNat.map((t) => `<tr>
          <td>${t.year}</td><td>${gTag(t.gender)[0]} — ${athLink(t.athlete, t.athleteId, t.gender)}</td><td>${coachLink(t.coach)}</td><td>${t.event}</td>
        </tr>`),
        'No individual national champions yet.')}

      ${sectionTable(':trophy-conference: Conference Team Championships',
        ['Year', 'Squad', 'Conference', 'Coach'],
        h.confTeam.map((t) => `<tr><td>${t.year}</td><td>${gTag(t.gender)}</td><td>${Utils.escapeHtml(t.conf)}</td><td>${coachLink(t.coach)}</td></tr>`),
        'No conference team titles recorded yet.')}

      ${sectionTable('🥇 Individual Conference Champions',
        ['Year', 'Athlete', 'Coach'],
        h.indivConf.map((t) => `<tr><td>${t.year}</td><td>${gTag(t.gender)[0]} — ${athLink(t.athlete, t.athleteId, t.gender)}</td><td>${coachLink(t.coach)}</td></tr>`),
        'No individual conference champions yet.')}

      ${sectionTable(':trophy-regional: Regional Championships — Team & Individual',
        ['Year', 'Type', 'Detail', 'Coach'],
        [
          ...h.regTeam.map((t) => `<tr><td>${t.year}</td><td>Team (${gTag(t.gender)[0]})</td><td>${Utils.escapeHtml(t.region)} Regional Champions</td><td>${coachLink(t.coach)}</td></tr>`),
          ...h.indivReg.map((t) => `<tr><td>${t.year}</td><td>Individual (${gTag(t.gender)[0]})</td><td>${athLink(t.athlete, t.athleteId, t.gender)}</td><td>${coachLink(coachOfYear(game, school, t.year))}</td></tr>`)
        ].sort(),
        'No regional titles recorded yet.')}

      <div class="card" style="margin-bottom:16px;">
        <h2>🧢 Coach Timeline — the complete head-coaching history</h2>
        <div style="color:var(--text-dim); font-size:12px; margin-bottom:8px;">
          Every head coach the program has ever had, forever. Records and achievements shown are what
          each coach accomplished <strong>at this school</strong> — never at other stops (Phases 3 &amp; 8).
        </div>
        ${prog.coaches.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th class="col-grow">Coach</th><th>Years</th><th class="num">Titles Here</th><th class="num" title="Regional titles won here">Reg</th><th class="num">NCAA Trips</th><th>Coach of the Year</th><th class="num" title="Program prestige when the tenure ended (current prestige for the sitting coach)">Prestige Reached</th><th>Departure</th></tr></thead>
          <tbody>${prog.coaches.slice().reverse().map((c) => {
            const rec = resolveCoachRecord(game, c);
            const sr = rec ? window.XCD.engine.Legacy.coachSchoolRecord(game, rec, school.id)
              : { natTitles: 0, confTitles: 0, regTitles: 0, natApps: 0, natCOY: 0, confCOY: 0 };
            const coy = [];
            if (sr.natCOY) coy.push(`${sr.natCOY}× National`);
            if (sr.confCOY) coy.push(`${sr.confCOY}× Conference`);
            const depart = window.XCD.engine.Legacy.departureInfo(game, c, school.id);
            const prestigeReached = c.endYear ? (c.prestigeEnd ?? '—') : school.prestige;
            return `<tr>
              <td>${coachLink(c.name, c.coachId)}</td>
              <td style="color:var(--text-dim);">${c.startYear}–${c.endYear || 'present'}</td>
              <td class="num">${sr.natTitles}:trophy-national: ${sr.confTitles}:trophy-conference:</td>
              <td class="num">${sr.regTitles || '—'}</td>
              <td class="num">${sr.natApps || '—'}</td>
              <td style="font-size:12px; color:var(--text-dim);">${coy.join(' · ') || '—'}</td>
              <td class="num">${prestigeReached}</td>
              <td style="font-size:12px; color:${depart.current ? 'var(--success)' : 'var(--text-dim)'};">${Utils.escapeHtml(depart.label)}</td>
            </tr>`;
          }).join('')}</tbody></table></div>`
        : '<div style="color:var(--text-dim); font-size:13px;">Records begin with your arrival.</div>'}
        <h3 style="margin-top:14px;">Prestige Trajectory</h3>
        ${ph.length ? `<div style="display:flex; align-items:flex-end; gap:2px; height:52px;">
          ${ph.slice(-30).map((p) => `<div title="${p.year}: ${p.prestige}" style="flex:1; background:var(--accent); opacity:0.75; border-radius:2px 2px 0 0; height:${Math.max(6, p.prestige * 0.52)}px;"></div>`).join('')}
        </div>` : '<div style="color:var(--text-dim); font-size:13px;">Prestige history builds season by season.</div>'}
      </div>`;

    wireProgramClicks(game, body);
    // Roster link: the historical championship roster, exactly as it was
    // that season (History & Legacy update, Phase 10).
    body.querySelectorAll('[data-view-roster]').forEach((el) => {
      el.addEventListener('click', () => {
        const t = h.teamNat[Number(el.dataset.viewRoster)];
        if (t && t.rec) UI.showChampionTeamCard(game, t.rec);
      });
    });
  }

  // The head coach of record for one program-season (Championship History fix).
  function coachOfYear(game, school, year) {
    return window.XCD.engine.Legacy.coachForSchoolYear(game, school.id, year) || '';
  }

  // Resolve a program-ledger coach entry to a live coach or registry record.
  function resolveCoachRecord(game, entry) {
    if (entry.coachId) {
      const live = game.getCoach(entry.coachId);
      if (live) return live;
    }
    const reg = (game.history.coachRegistry || []).slice().reverse().find((r) => r.name === entry.name);
    if (reg) return reg;
    return Object.values(game.world.coaches).find((c) => c.fullName === entry.name) || null;
  }

  /*
   * Program Records (History & Legacy update, Phase 6): every record names
   * the person who achieved it — value, holder, and the years — and every
   * holder opens their full profile. Coach records are scoped to what each
   * coach did AT THIS SCHOOL (Phase 8); athlete records use the honors each
   * athlete earned while representing this program.
   */
  function renderRecords(game, school, body) {
    const Legacy = window.XCD.engine.Legacy;
    const GOAT = window.XCD.engine.GOAT;
    const prog = Legacy.program(game, school.id);
    const confStreak = longestConfStreak(game, school);
    const ft = window.XCD.engine.Races.formatTime;

    // Every head coach's school-scoped record, once.
    const coachRows = (prog.coaches || []).map((c) => {
      const rec = resolveCoachRecord(game, c);
      const sr = rec ? Legacy.coachSchoolRecord(game, rec, school.id) : null;
      if (!sr) return null;
      const tenure = `${c.startYear}–${c.endYear || 'present'}`;
      return { name: c.name, coachId: (rec && rec.id) || null, tenure, years: Math.max(1, (c.endYear || game.year) - c.startYear), sr };
    }).filter(Boolean);
    // The same coach may have multiple stints; merge by name.
    const coachByName = new Map();
    coachRows.forEach((r) => {
      const prev = coachByName.get(r.name);
      if (!prev) { coachByName.set(r.name, r); return; }
      prev.years += r.years;
      prev.tenure = `${prev.tenure.split('–')[0]}–${r.tenure.split('–')[1]}`;
    });
    const coaches = [...coachByName.values()];
    const bestCoachBy = (metric, min = -Infinity) => {
      let best = null;
      coaches.forEach((r) => {
        const v = metric(r);
        if (v > min && (!best || v > best.value)) best = { ...r, value: v };
      });
      return best;
    };

    // Program-scoped athlete rows (Phase 8).
    const athRows = GOAT.athletesForProgram(game, school.id);
    const bestAthBy = (metric) => {
      let best = null;
      athRows.forEach((r) => {
        const v = metric(r);
        if (v > 0 && (!best || v > best.value)) best = { ...r, value: v };
      });
      return best;
    };

    // A record row: value + who owns it + when — the holder opens a profile.
    const holderRec = (label, value, holder, kind) => `
      <div class="attr-row ${holder ? 'clickable' : ''}" style="align-items:flex-start; padding:6px 0; gap:10px; ${holder ? 'cursor:pointer;' : ''}"
        ${holder && kind === 'coach' ? `data-coach="${holder.coachId || ''}" data-coach-name="${Utils.escapeHtml(holder.name)}"` : ''}
        ${holder && kind === 'ath' ? `data-ath="${holder.athleteId || ''}" data-ath-name="${Utils.escapeHtml(holder.name)}"` : ''}>
        <span class="attr-name" style="flex:0 1 auto;">${label}</span>
        <span style="text-align:right; flex:1; min-width:0;">
          <strong>${value}</strong>
          ${holder ? `<div style="font-size:12px;">${UI.personName(game, kind === 'coach' ? 'coach' : 'ath', kind === 'coach' ? holder.coachId : holder.athleteId, holder.name, { link: false, prefix: holder.generational ? '⭐ ' : '', extra: { gender: holder.gender, schoolId: school.id } })}</div>
          <div style="font-size:11px; color:var(--text-faint);">${Utils.escapeHtml(holder.tenure || holder.years || '')}</div>` : ''}
        </span>
      </div>`;
    const rec = (label, value, sub) => `
      <div class="attr-row"><span class="attr-name">${label}</span><span style="text-align:right;"><strong>${value}</strong>${sub ? `<div style="font-size:11.5px; color:var(--text-faint);">${sub}</div>` : ''}</span></div>`;

    // Coach record holders (school-scoped).
    const cTenure = bestCoachBy((r) => r.years, 0);
    const cNat = bestCoachBy((r) => r.sr.natTitles, 0);
    const cConf = bestCoachBy((r) => r.sr.confTitles, 0);
    const cApps = bestCoachBy((r) => r.sr.natApps, 0);

    // Athlete record holders (program-scoped honors).
    const aWins = bestAthBy((r) => r.wins || 0);
    const aAA = bestAthBy((r) => r.allAmerican || 0);
    const aNat = bestAthBy((r) => r.natTitles || 0);
    const aConf = bestAthBy((r) => r.confChamps || 0);
    const fastest = (key, label) => {
      const r = (school.records || {})[key];
      if (!r) return holderRec(label, '—', null);
      return holderRec(label, ft(r.time), { name: r.name, athleteId: r.athleteId, tenure: String(r.year) }, 'ath');
    };

    body.innerHTML = `
      <div class="grid cols-2">
        <div class="card">
          <h2>🏃 Athlete Records</h2>
          ${fastest('M-8K', "Fastest 8K (Men)")}
          ${fastest('M-10K', "Fastest 10K (Men)")}
          ${fastest('W-6K', "Fastest 6K (Women)")}
          ${holderRec('Most Individual Wins', aWins ? `${aWins.value} wins` : '—', aWins && { ...aWins, tenure: aWins.years === 'active' ? 'active' : `Class of ${aWins.gradYear || '—'}` }, 'ath')}
          ${holderRec('Most All-America Honors', aAA ? `${aAA.value}× All-American` : '—', aAA && { ...aAA, tenure: aAA.years === 'active' ? 'active' : `Class of ${aAA.gradYear || '—'}` }, 'ath')}
          ${holderRec('Most Individual National Titles', aNat ? `${aNat.value} title${aNat.value > 1 ? 's' : ''}` : '—', aNat && { ...aNat, tenure: aNat.years === 'active' ? 'active' : `Class of ${aNat.gradYear || '—'}` }, 'ath')}
          ${holderRec('Most Conference Titles', aConf ? `${aConf.value} title${aConf.value > 1 ? 's' : ''}` : '—', aConf && { ...aConf, tenure: aConf.years === 'active' ? 'active' : `Class of ${aConf.gradYear || '—'}` }, 'ath')}
        </div>
        <div class="card">
          <h2>🧢 Coach Records <span style="font-size:11px; color:var(--text-faint); font-weight:400;">— earned at this school only</span></h2>
          ${holderRec('Longest Tenure', cTenure ? `${cTenure.value} season${cTenure.value > 1 ? 's' : ''}` : '—', cTenure, 'coach')}
          ${holderRec('Most National Titles', cNat ? `${cNat.value} title${cNat.value > 1 ? 's' : ''}` : '—', cNat, 'coach')}
          ${holderRec('Most Conference Titles', cConf ? `${cConf.value} title${cConf.value > 1 ? 's' : ''}` : '—', cConf, 'coach')}
          ${holderRec('Most NCAA Appearances', cApps ? `${cApps.value} trip${cApps.value > 1 ? 's' : ''}` : '—', cApps, 'coach')}
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:16px;">
        <div class="card">
          <h2>Championship Records</h2>
          ${rec('National Titles', prog.natTitles || 0)}
          ${rec('National Runner-Up Finishes', prog.natRunnerUp || 0)}
          ${rec('Conference Titles', prog.confTitles || 0)}
          ${rec('Regional Titles', prog.regionalTitles || 0)}
          ${rec('Individual National Champions', prog.indivNatChamps || 0)}
          ${rec('Individual Conference Champions', prog.indivConfChamps || 0)}
          ${rec('Longest Conference Title Streak', confStreak ? `${confStreak} yr${confStreak > 1 ? 's' : ''}` : '—')}
        </div>
        <div class="card">
          <h2>Program Records</h2>
          ${rec('NCAA Appearances', prog.ncaaAppearances || 0)}
          ${rec('Longest NCAA Appearance Streak', prog.ncaaStreakBest ? `${prog.ncaaStreakBest} yr${prog.ncaaStreakBest > 1 ? 's' : ''}` : '—')}
          ${rec('All-Americans', prog.allAmericans || 0)}
          ${rec('All-Conference Athletes', prog.allConference || 0)}
          ${rec('Highest Ranked Finish', prog.highestRank ? `#${prog.highestRank}` : '—')}
          ${rec('Top-25 Final Polls', prog.top25Finishes || 0)}
          ${(() => {
            // Course Records held (Course Records system): total set, currently
            // held, and the most held at any one time — another program legacy.
            const CR = window.XCD.engine.Courses;
            if (!CR) return '';
            const cs = CR.programStats(game, school.id);
            return rec('Course Records Held', cs.everSet, `${cs.current} current • peak ${cs.peak} at once`);
          })()}
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:16px;">
        <div class="card">
          <h2>🏅 Best Athlete in Program History</h2>
          <div style="color:var(--text-faint); font-size:11.5px; margin-bottom:6px;">Counting only accomplishments earned while representing ${Utils.escapeHtml(school.name)}.</div>
          ${athRows[0] ? `
            <div class="attr-row clickable" data-ath="${athRows[0].athleteId || ''}" data-ath-name="${Utils.escapeHtml(athRows[0].name)}" style="cursor:pointer;">
              <span>${UI.personName(game, 'ath', athRows[0].athleteId, athRows[0].name, { link: false, size: 24, prefix: athRows[0].generational ? '⭐ ' : '', extra: { gender: athRows[0].gender, schoolId: school.id } })}
                <div style="font-size:12px; color:var(--text-dim);">${athRows[0].natTitles} natl • ${athRows[0].allAmerican} AA • ${athRows[0].confChamps} conf • ${athRows[0].wins} wins</div></span>
              <span style="text-align:right;"><strong>${athRows[0].score}</strong><div style="font-size:11px; color:var(--text-faint);">legacy here</div></span>
            </div>` : '<div style="color:var(--text-dim); font-size:13px;">No decorated athletes yet.</div>'}
        </div>
        <div class="card">
          <h2>🧢 Best Coach in Program History</h2>
          <div style="color:var(--text-faint); font-size:11.5px; margin-bottom:6px;">Counting only accomplishments earned while coaching ${Utils.escapeHtml(school.name)}.</div>
          ${(() => {
            const scored = coaches.map((r) => ({
              ...r,
              score: r.sr.natTitles * 100 + r.sr.natCOY * 25 + r.sr.confTitles * 10 + r.sr.regTitles * 8 + r.sr.confCOY * 4 + r.years + r.sr.wins * 0.01
            })).sort((a, b) => b.score - a.score);
            const bc = scored[0];
            if (!bc || bc.score <= 1) return `<div style="color:var(--text-dim); font-size:13px;">The program's defining coach is yet to emerge.</div>`;
            return `
            <div class="attr-row clickable" data-coach="${bc.coachId || ''}" data-coach-name="${Utils.escapeHtml(bc.name)}" style="cursor:pointer;">
              <span>${UI.personName(game, 'coach', bc.coachId, bc.name, { link: false, size: 24 })}
                <div style="font-size:12px; color:var(--text-dim);">${bc.sr.natTitles} natl • ${bc.sr.confTitles} conf • ${bc.sr.natCOY + bc.sr.confCOY} CoY • ${bc.years} seasons here</div></span>
              <span style="text-align:right; color:var(--text-faint); font-size:11.5px;">${Utils.escapeHtml(bc.tenure)}</span>
            </div>`;
          })()}
        </div>
      </div>`;

    wireProgramClicks(game, body);
  }

  /*
   * Living Program History (History & Legacy update, Phase 11): the
   * automatically generated timeline of the program's defining moments —
   * championships, coaching hires and departures, legendary athletes,
   * milestones — growing forever as history unfolds.
   */
  function renderTimeline(game, school, body) {
    const events = window.XCD.engine.Legacy.programMilestones(game, school);
    const byYear = new Map();
    events.forEach((e) => {
      if (!byYear.has(e.year)) byYear.set(e.year, []);
      byYear.get(e.year).push(e);
    });
    const years = [...byYear.keys()].sort((a, b) => b - a);

    body.innerHTML = `
      <div class="card">
        <h2>🕰 The Story of ${Utils.escapeHtml(school.name)}</h2>
        <div style="color:var(--text-dim); font-size:12.5px; margin-bottom:12px;">
          Every defining moment in program history, recorded automatically as it happens — and
          preserved forever. Arrive at any school and understand its story at a glance.
        </div>
        ${years.length ? years.map((y) => `
          <div style="display:flex; gap:14px; padding:8px 0; border-bottom:1px solid rgba(42,51,65,0.5); align-items:flex-start;">
            <div style="flex:0 0 52px; font-weight:800; font-size:15px; color:var(--accent-hover);">${y}</div>
            <div style="flex:1; min-width:0;">
              ${byYear.get(y).map((e) => `<div style="font-size:13px; padding:2px 0; overflow-wrap:anywhere;">${e.icon} ${Utils.escapeHtml(e.text)}</div>`).join('')}
            </div>
          </div>`).join('')
        : '<div style="color:var(--text-dim); font-size:13px;">The story begins with the first season — every milestone will be written here.</div>'}
      </div>`;
  }

  /*
   * Program Statistics (History & Legacy update, Phase 7): the definitive
   * statistical history of the program — championships, conference and
   * athlete honors, coaching history, and the overall ledger.
   */
  function renderStatistics(game, school, body) {
    const Legacy = window.XCD.engine.Legacy;
    const prog = Legacy.program(game, school.id);
    const h = programHistory(game, school);
    const coachCount = new Set((prog.coaches || []).map((c) => c.name)).size;
    const avgTenure = (prog.coaches || []).length
      ? Math.round(((prog.coaches || []).reduce((s, c) => s + Math.max(1, (c.endYear || game.year) - c.startYear), 0) / (prog.coaches || []).length) * 10) / 10
      : 0;
    const row = (label, value, sub) => `
      <div class="attr-row"><span class="attr-name">${label}</span><span style="text-align:right;"><strong>${value}</strong>${sub ? `<div style="font-size:11.5px; color:var(--text-faint);">${sub}</div>` : ''}</span></div>`;

    body.innerHTML = `
      <div style="color:var(--text-dim); font-size:12.5px; margin-bottom:12px;">
        The definitive statistical history of ${Utils.escapeHtml(school.name)} — updated automatically after every season.
      </div>
      <div class="grid cols-2">
        <div class="card">
          <h2>:trophy-national: Championships</h2>
          ${row('National Titles', prog.natTitles || 0)}
          ${row('National Runner-Up Finishes', prog.natRunnerUp || 0)}
          ${row('Top-5 Finishes', prog.top5Finishes || 0, 'at the NCAA Championships')}
          ${row('Top-10 Finishes', prog.top10Finishes || 0, 'at the NCAA Championships')}
          ${row('NCAA Appearances', prog.ncaaAppearances || 0)}
          ${row('Best NCAA Finish', prog.bestFinish ? Utils.ordinal(prog.bestFinish) : '—')}
        </div>
        <div class="card">
          <h2>:trophy-conference: Conference</h2>
          ${row('Conference Titles', prog.confTitles || 0)}
          ${row('Conference Runner-Up Finishes', prog.confRunnerUp || 0)}
          ${row('Conference Championships Contested', prog.seasonsPlayed || 0, 'one per season, per squad')}
          ${row('Regional Titles', prog.regionalTitles || 0)}
        </div>
      </div>
      <div class="grid cols-2" style="margin-top:16px;">
        <div class="card">
          <h2>🏃 Athletes</h2>
          ${row('Individual National Champions', prog.indivNatChamps || 0)}
          ${row('All-Americans', prog.allAmericans || 0)}
          ${row('Individual Conference Champions', prog.indivConfChamps || 0)}
          ${row('Individual NCAA Qualifiers', prog.indivNcaaQualifiers || 0, 'qualified outside a team bid')}
          ${row('All-Conference Selections', prog.allConference || 0)}
          ${row('Hall of Fame Inductees', (game.history.hallOfFame || []).filter((x) => x.schoolId === school.id).length)}
        </div>
        <div class="card">
          <h2>🧢 Coaching</h2>
          ${row('Total Head Coaches', coachCount)}
          ${row('Average Coach Tenure', avgTenure ? `${avgTenure} yrs` : '—')}
          ${row('National Coach of the Year Awards', prog.natCoyAwards || 0)}
          ${row('Conference Coach of the Year Awards', prog.confCoyAwards || 0)}
        </div>
      </div>
      <div class="card" style="margin-top:16px;">
        <h2>📊 Overall</h2>
        <div class="grid cols-4" style="margin-top:8px;">
          <div class="stat-tile"><div class="label">Seasons Played</div><div class="value">${prog.seasonsPlayed || 0}</div></div>
          <div class="stat-tile"><div class="label">Conference Titles</div><div class="value">${prog.confTitles || 0}</div><div class="sub">${prog.confRunnerUp || 0} runner-up</div></div>
          <div class="stat-tile"><div class="label">NCAA Appearances</div><div class="value">${prog.ncaaAppearances || 0}</div><div class="sub">best finish: ${prog.bestFinish ? Utils.ordinal(prog.bestFinish) : '—'}</div></div>
          <div class="stat-tile"><div class="label">Current NCAA Streak</div><div class="value">${prog.ncaaStreak || 0}</div><div class="sub">longest: ${prog.ncaaStreakBest || 0} yr${(prog.ncaaStreakBest || 0) === 1 ? '' : 's'}</div></div>
        </div>
        <div style="margin-top:12px;">
          ${row('Team National Championships (list)', h.teamNat.length ? h.teamNat.map((t) => t.year).sort().join(' · ') : '—')}
          ${row('Conference Championships (list)', h.confTeam.length ? h.confTeam.map((t) => t.year).sort().join(' · ') : '—')}
          ${row('Top-25 Final Polls', prog.top25Finishes || 0)}
          ${row('Highest National Ranking', prog.highestRank ? `#${prog.highestRank}` : '—')}
        </div>
      </div>`;
  }

  /*
   * Program Hall of Fame (History & Legacy update, Phase 5): athletes,
   * coaches, AND historical championship teams — rebuilt live from the
   * permanent ledgers every time it renders, so it updates after every
   * season, entries never disappear, sorting works, and every plaque opens
   * the full profile.
   */
  let hofSort = 'legacy'; // legacy | year | name

  function renderSchoolHOF(game, school, body) {
    const Legacy = window.XCD.engine.Legacy;

    // Athlete wing: every Hall of Fame career made at this school.
    let athletes = (game.history.hallOfFame || []).filter((h) => h.schoolId === school.id);

    // Coach wing: the program's coaching greats, judged ONLY on what they
    // accomplished here (Phase 8) — recomputed each season automatically.
    const prog = Legacy.program(game, school.id);
    const seenCoach = new Set();
    let coaches = (prog.coaches || []).map((c) => {
      if (seenCoach.has(c.name)) return null;
      seenCoach.add(c.name);
      const rec = resolveCoachRecord(game, c);
      if (!rec) return null;
      const sr = Legacy.coachSchoolRecord(game, rec, school.id);
      const score = sr.natTitles * 100 + sr.natCOY * 25 + sr.confTitles * 12 + sr.regTitles * 8 + sr.confCOY * 5 + Math.max(0, sr.seasons - 5) * 2;
      // The plaque bar: a title, an award, sustained championships, or a
      // long winning tenure at THIS school.
      const worthy = sr.natTitles > 0 || sr.natCOY > 0 || sr.confTitles >= 2 ||
        (sr.seasons >= 10 && sr.winPct >= 55);
      if (!worthy) return null;
      return { name: c.name, coachId: rec.id || null, sr, score, year: sr.endYear || sr.startYear || c.startYear, tenure: `${c.startYear}–${c.endYear || 'present'}` };
    }).filter(Boolean);

    // Team wing: every national championship team, forever.
    let teams = (game.history.championTeams || []).filter((t) => t.schoolId === school.id);

    const sorters = {
      legacy: { ath: (a, b) => (b.legacyScore ?? b.score) - (a.legacyScore ?? a.score), coach: (a, b) => b.score - a.score, team: (a, b) => (b.teamOverall || 0) - (a.teamOverall || 0) },
      year: { ath: (a, b) => (b.inducted || 0) - (a.inducted || 0), coach: (a, b) => (b.year || 0) - (a.year || 0), team: (a, b) => b.year - a.year },
      name: { ath: (a, b) => a.name.localeCompare(b.name), coach: (a, b) => a.name.localeCompare(b.name), team: (a, b) => a.school.localeCompare(b.school) || a.year - b.year }
    };
    const s = sorters[hofSort] || sorters.legacy;
    athletes = athletes.slice().sort(s.ath);
    coaches = coaches.slice().sort(s.coach);
    teams = teams.slice().sort(s.team);

    body.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
        <h2 style="margin:0;">🏛 ${Utils.escapeHtml(school.name)} Hall of Fame — ${athletes.length + coaches.length + teams.length} plaques</h2>
        <div class="pill-tabs">
          <button data-hof-sort="legacy" class="${hofSort === 'legacy' ? 'active' : ''}">By Legacy</button>
          <button data-hof-sort="year" class="${hofSort === 'year' ? 'active' : ''}">By Year</button>
          <button data-hof-sort="name" class="${hofSort === 'name' ? 'active' : ''}">By Name</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h2>🏃 Athletes — ${athletes.length}</h2>
        ${athletes.length ? athletes.map((h, i) => `
          <div class="attr-row clickable" data-hof-ath="${i}" style="cursor:pointer; align-items:flex-start; padding:10px 0; gap:10px;">
            <span style="flex:0 0 auto;">${UI.avatar(h, { size: 36, outfit: 'jersey' })}</span>
            <span style="flex:1; min-width:0;">
              <span class="person-name">${Utils.escapeHtml(h.name)}</span>
              <span style="color:var(--text-faint); font-size:12px;"> (${h.gender}) • ${h.yearsCompeted || h.inducted} • inducted ${h.inducted}</span>
              <div style="font-size:12px; color:var(--text-dim); margin-top:2px; overflow-wrap:anywhere;">
                ${(h.badges || []).filter((b) => b.key !== 'generational').map((b) => `${b.icon} ${b.label}`).slice(0, 4).join(' · ') || 'A defining career'}
              </div>
              <div style="font-size:12px; color:var(--text-dim);">
                ${(h.stats || {}).wins || 0} wins • ${(h.stats || {}).top5 || 0} top-5s • ${(h.stats || {}).allAmerican || 0} All-Am • ${(h.stats || {}).natChamp || 0} natl titles
              </div>
            </span>
            <span style="text-align:right; flex:0 0 auto;"><strong style="font-size:18px;">${h.legacyScore ?? h.score}</strong><div style="font-size:11px; color:var(--text-faint);">legacy</div></span>
          </div>`).join('')
        : '<div style="color:var(--text-dim); font-size:13px;">No athletes enshrined yet — a legendary career earns the first plaque.</div>'}
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h2>🧢 Coaches — ${coaches.length}</h2>
        <div style="color:var(--text-faint); font-size:11.5px; margin-bottom:6px;">Enshrined for what they built at ${Utils.escapeHtml(school.name)} — titles, awards, and defining tenures here only.</div>
        ${coaches.length ? coaches.map((c, i) => `
          <div class="attr-row clickable" data-hof-coach="${i}" style="cursor:pointer; align-items:flex-start; padding:10px 0; gap:10px;">
            <span style="flex:0 0 auto;">${UI.avatar(UI.resolvePerson(game, 'coach', c.coachId, c.name), { size: 36, outfit: 'polo' })}</span>
            <span style="flex:1; min-width:0;">
              <span class="person-name">${Utils.escapeHtml(c.name)}</span>
              <span style="color:var(--text-faint); font-size:12px;"> • ${Utils.escapeHtml(c.tenure)}</span>
              <div style="font-size:12px; color:var(--text-dim);">
                ${c.sr.natTitles} natl • ${c.sr.confTitles} conf • ${c.sr.natCOY + c.sr.confCOY} Coach of the Year here
              </div>
            </span>
            <span style="text-align:right; flex:0 0 auto;"><strong style="font-size:18px;">${Math.round(c.score)}</strong><div style="font-size:11px; color:var(--text-faint);">legacy here</div></span>
          </div>`).join('')
        : '<div style="color:var(--text-dim); font-size:13px;">No coaches enshrined yet — win here, and history remembers.</div>'}
      </div>

      <div class="card">
        <h2>:trophy-national: Championship Teams — ${teams.length}</h2>
        ${teams.length ? teams.map((t, i) => `
          <div class="attr-row clickable" data-hof-team="${i}" style="cursor:pointer; align-items:flex-start; padding:10px 0; gap:10px;">
            <span style="font-size:24px; flex:0 0 auto;">:trophy-national:</span>
            <span style="flex:1; min-width:0;">
              <strong>${t.year} ${t.gender === 'M' ? "Men's" : "Women's"} National Champions</strong>
              <div style="font-size:12px; color:var(--text-dim);">
                Coach ${Utils.escapeHtml(t.coachName || '—')} • Team OVR ${t.teamOverall || '—'} • ${t.teamScore != null ? t.teamScore + ' pts' : ''}${t.margin != null ? ` • won by ${t.margin}` : ''}
              </div>
            </span>
            <span style="text-align:right; color:var(--accent-hover); font-size:12px; flex:0 0 auto;">View roster ▸</span>
          </div>`).join('')
        : '<div style="color:var(--text-dim); font-size:13px;">The first national title hangs the first team plaque.</div>'}
      </div>`;

    body.querySelectorAll('[data-hof-sort]').forEach((btn) => {
      btn.addEventListener('click', () => { hofSort = btn.dataset.hofSort; renderSchoolHOF(game, school, body); });
    });
    body.querySelectorAll('[data-hof-ath]').forEach((row) => {
      row.addEventListener('click', () => {
        const h = athletes[Number(row.dataset.hofAth)];
        UI.openAthlete(game, h.athleteId, h.name);
      });
    });
    body.querySelectorAll('[data-hof-coach]').forEach((row) => {
      row.addEventListener('click', () => {
        const c = coaches[Number(row.dataset.hofCoach)];
        UI.openCoach(game, c.coachId, c.name);
      });
    });
    body.querySelectorAll('[data-hof-team]').forEach((row) => {
      row.addEventListener('click', () => {
        UI.showChampionTeamCard(game, teams[Number(row.dataset.hofTeam)]);
      });
    });
  }

  /* ---------------- Overview tab ---------------- */
  // One staff member: avatar, role, name, a line of identity, and the OVR.
  function staffCard(c, role, you, actions) {
    return `
      <div class="staff-card ${you ? 'you' : ''}">
        <div class="staff-top">
          ${UI.avatar(c, { size: 52, outfit: 'suit' })}
          <div class="staff-id">
            <div class="staff-role">${role}${you ? ' · You' : ''}${c.interim ? ' · <span style="color:var(--warning);">Interim</span>' : ''}</div>
            <div class="staff-name ${you ? '' : 'clickable'}" ${you ? '' : 'id="btn-partner-coach"'}>${Utils.escapeHtml(c.fullName)}</div>
            <div class="staff-sub">${Utils.escapeHtml(c.archetype || '')} · Age ${c.age} · Year ${(c.yearsAtSchool || 0) + 1}</div>
          </div>
          <div class="staff-ovr">${UI.ratingBadge(c.overallRating)}<span>OVR</span></div>
        </div>
        ${actions ? `<div class="staff-actions">${actions}</div>` : ''}
      </div>`;
  }

  /* ================================================================ *
   * Staff tab: the staff you have and the market you can hire from.
   *   Your Staff    — head coach and assistant, and what the assistant adds
   *   Staff Market  — applicants, free agents, assistants on other staffs
   *                   and head coaches at smaller programs, with the
   *                   program's hiring reach and each coach's interest
   * ================================================================ */
  const STAFF_SOURCES = [
    ['all', 'All'],
    ['applicant', 'Applicants'],
    ['freeAgent', 'Free Agents'],
    ['assistant', 'Assistants'],
    ['head', 'Head Coaches']
  ];
  const SOURCE_LABEL = { applicant: 'Applicant', freeAgent: 'Free agent', assistant: 'Assistant', head: 'Head coach' };
  // The crafts an assistant brings, and what each one does for the program.
  const STAFF_CRAFTS = [
    ['recruiting', 'Rec', 'Recruiting: adds weekly recruiting points'],
    ['training', 'Dev', 'Development: multiplies weekly development'],
    ['peaking', 'Peak', 'Peaking: sharpens championship race day'],
    ['culture', 'Cul', 'Culture: feeds squad chemistry'],
    ['motivation', 'Mot', "Motivation: lifts struggling athletes' morale"],
    ['relationships', 'Com', 'Communication: bonds that keep athletes home'],
    ['talentEval', 'Eval', 'Evaluation: scouting accuracy']
  ];
  const staffView = { source: 'all', query: '', reachable: false };

  function interestChip(row) {
    if (row.locked) return `<span class="interest-chip locked" title="${Utils.escapeHtml(row.locked)}">🔒 ${/stature/.test(row.locked) ? 'Too prominent' : 'Out of reach'}</span>`;
    if (row.declined) return '<span class="interest-chip no" title="Turned the job down this offseason">Said no</span>';
    if (row.source === 'applicant') return '<span class="interest-chip yes" title="Applied for the job: a yes if you offer">Applied</span>';
    const tier = row.interest >= 70 ? 'yes' : row.interest >= 40 ? 'maybe' : 'low';
    return `<span class="interest-chip ${tier}" title="Interest: the chance this coach accepts your offer">${row.interest}%</span>`;
  }

  // Where a candidate is now: their job, or how they reached the market.
  function nowLine(row) {
    const c = row.coach;
    if (row.from) {
      return `${SOURCE_LABEL[row.source]} · <span class="clickable" data-school="${row.from.id}">${Utils.escapeHtml(row.from.name)}</span> <span style="color:var(--text-faint);">${row.from.prestige} prestige</span>`;
    }
    return Utils.escapeHtml(c.origin || SOURCE_LABEL[row.source]);
  }

  function renderStaffTab(game, school, coach, body, outerContainer) {
    const Coaching = window.XCD.engine.Coaching;
    const D = window.XCD.data;
    const isHead = coach.role !== 'Assistant';
    const partnerId = isHead ? school.assistantId : school.coachId;
    const partner = partnerId && partnerId !== coach.id ? game.getCoach(partnerId) : null;
    const assistant = isHead ? partner : coach;
    const market = isHead ? Coaching.staffMarket(game) : null;
    const rerender = () => render(outerContainer);

    const tile = (label, value, sub) => `<div class="stat-tile"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
    let tiles = '';
    if (market) {
      const r = market.reach;
      const gate = market.gate;
      const open = market.rows.filter((x) => !x.locked && !x.declined).length;
      tiles = `
        <div class="grid cols-4" style="margin-bottom:16px;">
          ${tile('Hiring Reach', r.cap, `highest reputation you can attract`)}
          ${tile('Staff Hire', gate.ok ? (gate.vacancy ? 'Vacancy' : 'Open') : (game.staffHiredYear === game.year ? 'Used' : 'Closed'),
            gate.ok ? (gate.vacancy ? 'fill the empty chair any time' : 'one hire this offseason') : (game.staffHiredYear === game.year ? 'one hire per offseason' : 'opens in the offseason'))}
          ${tile('Assistant', assistant ? UI.ratingBadge(assistant.overallRating) : '—',
            assistant ? `${Utils.escapeHtml(assistant.fullName)} · year ${(assistant.yearsAtSchool || 0) + 1}` : 'the chair is empty')}
          ${tile('On the Market', open, `${market.counts.applicant} applicants · ${market.counts.freeAgent} free agents · ${market.counts.assistant + market.counts.head} with jobs`)}
        </div>`;
    }

    // What the assistant adds, one craft per chip.
    const crafts = (c) => `<div class="craft-row">${STAFF_CRAFTS.map(([k, short, tip]) =>
      `<span class="craft" title="${tip}"><span class="k">${short}</span>${UI.ratingBadge(c[k] ?? 55)}</span>`).join('')}</div>`;
    const mine = staffCard(coach, isHead ? 'Head Coach' : 'Assistant Coach', true,
      '<button class="btn small" id="btn-coach-profile">Full Profile</button>');
    const other = partner
      ? staffCard(partner, partner.role === 'Assistant' ? 'Assistant Coach' : 'Head Coach', false,
        `<button class="btn small" id="btn-partner-profile">Profile</button>`) 
      : (isHead ? `
        <div class="staff-card vacant">
          <div class="staff-role">Assistant Coach</div>
          <div class="staff-name" style="color:var(--warning);">⚠️ Vacant</div>
          <div class="staff-sub">Recruiting, development and chemistry all lean on the staff. Hire from the market below.</div>
        </div>` : '');
    const asstRep = assistant ? (assistant.reputationLevel || {}) : {};
    const asstImpact = assistant ? `
      <div class="card" style="margin-top:12px;">
        <div class="cr-home-head">
          <div>
            <h3 style="margin:0;">What ${Utils.escapeHtml(assistant.fullName)} adds</h3>
            <div class="cr-home-sub">${asstRep.icon || ''} ${Utils.escapeHtml(asstRep.label || '')} · reputation ${Math.round(assistant.reputation || 0)}${assistant.origin ? ` · ${Utils.escapeHtml(assistant.origin)}` : ''}</div>
          </div>
        </div>
        ${crafts(assistant)}
        <div class="foot-note">Dev multiplies weekly development, Rec adds recruiting points, Cul feeds chemistry, Mot lifts struggling athletes, and Peak sharpens championship day.</div>
      </div>` : '';

    body.innerHTML = `
      ${tiles}
      ${UI.sectionLabel('Your Staff')}
      <div class="staff-grid">${mine}${other}</div>
      ${asstImpact}
      ${UI.sectionLabel('Staff Market')}
      <div id="staff-market"></div>`;

    const profileBtn = body.querySelector('#btn-coach-profile');
    if (profileBtn) profileBtn.addEventListener('click', () => UI.showCoachCard(coach, game));
    body.querySelectorAll('#btn-partner-profile, #btn-partner-coach').forEach((el) => {
      el.addEventListener('click', () => { if (partner) UI.showCoachCard(partner, game); });
    });

    const mEl = body.querySelector('#staff-market');
    if (!market) {
      mEl.innerHTML = `<div class="card" style="color:var(--text-dim); font-size:13px;">Only a head coach hires the staff. Earn a head-coaching job and the market opens here.</div>`;
      return;
    }

    const gate = market.gate;
    const r = market.reach;
    const count = (id) => id === 'all' ? market.rows.length : market.counts[id] || 0;
    mEl.innerHTML = `
      ${gate.ok ? '' : `<div class="card note-warn" style="margin-bottom:12px;">🔒 ${Utils.escapeHtml(gate.why)} You can still scout the market.</div>`}
      <div class="filter-bar">
        <div class="pill-tabs" id="staff-source">
          ${STAFF_SOURCES.map(([id, label]) => `<button data-staff-src="${id}" class="${staffView.source === id ? 'active' : ''}">${label} <span class="pill-count">${count(id)}</span></button>`).join('')}
        </div>
        <input type="text" id="staff-search" class="search-input" placeholder="Search coaches, schools…" value="${Utils.escapeHtml(staffView.query)}">
        <label class="check-pill"><input type="checkbox" id="staff-reachable" ${staffView.reachable ? 'checked' : ''}> Within reach</label>
        <span id="staff-count" class="count-note"></span>
      </div>
      <div id="staff-table"></div>
      <div class="foot-note" style="margin-top:10px;">
        <strong>Hiring reach ${r.cap}</strong> = program prestige (${r.parts.program}) + your reputation (${r.parts.name}) + Staff Management (${r.parts.staff >= 0 ? '+' : ''}${r.parts.staff}) + ${r.parts.base}. A coach whose reputation is above it will not take your assistant's chair, and no head coach (sitting or out of work) with a reputation of 75 or more takes an assistant's job anywhere.
        An assistant only leaves a job for a program at least ${Coaching.STAFF_STEP_UP} prestige bigger; a head coach gives up their own program only for one at least ${Coaching.STAFF_HEAD_GAP} bigger.
        Interest is the chance a coach says yes. A no keeps your hire open, and that coach will not reconsider this offseason.
      </div>`;

    const filtered = () => {
      const q = staffView.query.trim().toLowerCase();
      return market.rows.filter((row) => {
        if (staffView.source !== 'all' && row.source !== staffView.source) return false;
        if (staffView.reachable && (row.locked || row.declined)) return false;
        if (q && !(`${row.coach.fullName} ${row.from ? row.from.name : ''} ${row.coach.origin || ''} ${row.coach.archetype || ''}`.toLowerCase().includes(q))) return false;
        return true;
      });
    };
    const offerBtn = (row) => {
      const off = !gate.ok || row.locked || row.declined;
      const why = !gate.ok ? gate.why : row.locked || (row.declined ? 'Turned the job down this offseason' : '');
      return `<button class="btn small primary" data-hire="${row.key}" ${off ? `disabled title="${Utils.escapeHtml(why)}"` : ''}>${row.source === 'applicant' || row.source === 'freeAgent' ? 'Hire' : 'Offer'}</button>`;
    };
    const cell = (k) => ({ key: k[0], label: k[1], numeric: true, sortValue: (row) => row.coach[k[0]] ?? 55, render: (row) => UI.ratingBadge(row.coach[k[0]] ?? 55) });
    const columns = [
      { key: 'name', label: 'Coach', grow: true, sortValue: (row) => row.coach.lastName || row.coach.fullName, render: (row) => `
        <div class="coach-cell">${UI.avatar(row.coach, { size: 30, outfit: 'suit' })}
          <div><strong>${Utils.escapeHtml(row.coach.fullName)}</strong>
          <div class="coach-cell-sub">${nowLine(row)}</div></div></div>` },
      { key: 'age', label: 'Age', numeric: true, sortValue: (row) => row.coach.age, render: (row) => row.coach.age },
      { key: 'ovr', label: 'OVR', numeric: true, sortValue: (row) => row.coach.overallRating, render: (row) => UI.ratingBadge(row.coach.overallRating) },
      cell(STAFF_CRAFTS[0]), cell(STAFF_CRAFTS[1]), cell(STAFF_CRAFTS[2]), cell(STAFF_CRAFTS[3]),
      { key: 'rep', label: 'Rep', numeric: true, sortValue: (row) => row.coach.reputation || 0, render: (row) => Math.round(row.coach.reputation || 0) },
      { key: 'interest', label: 'Interest', numeric: true, sortValue: (row) => row.locked ? -2 : row.declined ? -1 : row.interest, render: (row) => interestChip(row) },
      { key: 'act', label: '', sortValue: () => 0, render: (row) => `<div class="row-actions">${offerBtn(row)}<button class="btn small" data-view-cand="${row.key}">Profile</button></div>` }
    ];
    const card = (row) => `
      <div class="m-head">
        <div class="m-title">${UI.avatar(row.coach, { size: 26, outfit: 'suit' })} ${Utils.escapeHtml(row.coach.fullName)}
          <div class="m-sub">${nowLine(row)} · age ${row.coach.age} · rep ${Math.round(row.coach.reputation || 0)}</div>
        </div>
        <div class="m-badge">${UI.ratingBadge(row.coach.overallRating)}</div>
      </div>
      ${`<div class="craft-row">${STAFF_CRAFTS.map(([k, short, tip]) => `<span class="craft" title="${tip}"><span class="k">${short}</span>${UI.ratingBadge(row.coach[k] ?? 55)}</span>`).join('')}</div>`}
      <div class="m-actions">${interestChip(row)}<span style="flex:1;"></span>${offerBtn(row)}<button class="btn small" data-view-cand="${row.key}">Profile</button></div>`;

    const tableEl = mEl.querySelector('#staff-table');
    const countEl = mEl.querySelector('#staff-count');
    let rows = filtered();
    const table = UI.renderSortableTable(tableEl, {
      columns, rows,
      defaultSort: 'ovr', defaultDir: 'desc',
      maxRows: 200,
      cardsOnDesktop: false,
      emptyMessage: 'No coaches match the current filters.',
      rowClass: (row) => row.locked || row.declined ? 'dimmed' : '',
      mobileCard: card
    });
    const apply = () => {
      rows = filtered();
      countEl.textContent = `${rows.length} of ${market.rows.length}`;
      table.setRows(rows);
    };
    countEl.textContent = `${rows.length} of ${market.rows.length}`;

    mEl.querySelectorAll('[data-staff-src]').forEach((btn) => {
      btn.addEventListener('click', () => {
        staffView.source = btn.dataset.staffSrc;
        mEl.querySelectorAll('[data-staff-src]').forEach((b) => b.classList.toggle('active', b === btn));
        apply();
      });
    });
    mEl.querySelector('#staff-search').addEventListener('input', (e) => { staffView.query = e.target.value; apply(); });
    mEl.querySelector('#staff-reachable').addEventListener('change', (e) => { staffView.reachable = e.target.checked; apply(); });

    // One listener for the whole market: profile, school, and the offer.
    const byKey = (key) => market.rows.find((row) => row.key === key);
    tableEl.addEventListener('click', (ev) => {
      const view = ev.target.closest('[data-view-cand]');
      if (view) { const row = byKey(view.dataset.viewCand); if (row) UI.showCoachCard(row.coach, game); return; }
      const sch = ev.target.closest('[data-school]');
      if (sch) { const s = game.getSchool(sch.dataset.school); if (s) UI.showSchoolCard(s, game); return; }
      const hire = ev.target.closest('[data-hire]');
      if (hire && !hire.disabled) { const row = byKey(hire.dataset.hire); if (row) confirmStaffOffer(game, school, assistant, row, rerender); }
    });
  }

  // The offer, laid out before it is made: the candidate against the coach
  // they would replace, what a yes costs, and what a no costs.
  function confirmStaffOffer(game, school, current, row, rerender) {
    const c = row.coach;
    const sure = row.source === 'applicant';
    const line = (k, short, tip) => {
      const a = Math.round(c[k] ?? 55);
      const b = current ? Math.round(current[k] ?? 55) : null;
      const d = b == null ? '' : a === b ? '<span class="delta flat">–</span>'
        : `<span class="delta ${a > b ? 'up' : 'down'}">${a > b ? '▲' : '▼'}${Math.abs(a - b)}</span>`;
      return `<tr title="${tip}"><td>${short}</td><td class="num">${UI.ratingBadge(a)}</td><td class="num">${b == null ? '—' : UI.ratingBadge(b)}</td><td class="num">${d}</td></tr>`;
    };
    const stakes = [];
    if (current) stakes.push(`<strong>${Utils.escapeHtml(current.fullName)}</strong> is let go to make room.`);
    if (row.source === 'head') stakes.push(`${Utils.escapeHtml(row.from.name)} loses its head coach and opens a search.`);
    if (row.source === 'assistant') stakes.push(`${Utils.escapeHtml(row.from.name)} has to replace its assistant.`);
    stakes.push(sure ? 'They applied for the job, so this is a yes.'
      : `Interest is <strong>${row.interest}%</strong>. If they say no, your hire stays open and they will not reconsider this offseason.`);
    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <h2 style="margin:0 0 2px;">${sure || row.source === 'freeAgent' ? 'Hire' : 'Make an offer to'} ${Utils.escapeHtml(c.fullName)}</h2>
      <div style="color:var(--text-dim); font-size:13px; margin-bottom:12px;">${nowLine(row)} · age ${c.age} · reputation ${Math.round(c.reputation || 0)}</div>
      <div class="pair-grid" style="margin-bottom:12px;">
        <div class="stat-tile"><div class="label">Candidate</div><div class="value">${UI.ratingBadge(c.overallRating)}</div><div class="sub">${Utils.escapeHtml(c.fullName)}</div></div>
        <div class="stat-tile"><div class="label">Current assistant</div><div class="value">${current ? UI.ratingBadge(current.overallRating) : '—'}</div><div class="sub">${current ? Utils.escapeHtml(current.fullName) : 'the chair is empty'}</div></div>
      </div>
      <div class="card" style="padding:12px; margin-bottom:12px;">
        <div class="table-wrap"><table class="data">
          <thead><tr><th class="col-grow">Craft</th><th class="num">Candidate</th><th class="num">Current</th><th class="num">Change</th></tr></thead>
          <tbody>${STAFF_CRAFTS.map(([k, short, tip]) => line(k, tip.split(':')[0], tip)).join('')}</tbody>
        </table></div>
      </div>
      <ul class="stakes">${stakes.map((t) => `<li>${t}</li>`).join('')}</ul>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
        <button class="btn" data-modal-close-2>Cancel</button>
        <button class="btn primary" id="btn-confirm-hire">${sure || row.source === 'freeAgent' ? 'Hire' : 'Make the offer'}</button>
      </div>
    `, (modal) => {
      modal.querySelector('[data-modal-close-2]').addEventListener('click', UI.closeModal);
      modal.querySelectorAll('[data-school]').forEach((el) => el.classList.remove('clickable'));
      modal.querySelector('#btn-confirm-hire').addEventListener('click', () => {
        const res = window.XCD.engine.Coaching.offerAssistantJob(game, row.key);
        UI.closeModal();
        UI.toast(res.message, res.ok ? 'success' : 'error');
        rerender();
      });
    });
  }

  function renderOverview(game, school, coach, container, outerContainer) {
    const b = school.budget;
    const h = school.historicalSuccess;
    const rivals = school.rivalries.map((id) => game.getSchool(id)).filter(Boolean);
    const repLevel = coach.reputationLevel || { label: 'Unknown', icon: '❔' };
    const tendencies = (coach.tendencies || [])
      .map((t) => (window.XCD.data.COACH_TENDENCIES.find((x) => x.key === t) || {}).label)
      .filter(Boolean);

    container.innerHTML = `
      ${UI.sectionLabel('At a Glance')}
      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Prestige</div><div class="value">${school.prestige}</div><div class="sub">${Utils.ratingGrade(school.prestige)} • ${(() => {
          const ph = school.prestigeHistory || [];
          if (ph.length < 2) return 'new era';
          const d = ph[ph.length - 1].prestige - ph[Math.max(0, ph.length - 4)].prestige;
          return d > 1 ? '📈 rising' : d < -1 ? '📉 falling' : 'steady';
        })()}</div></div>
        <div class="stat-tile"><div class="label">Coach Reputation</div><div class="value">${Math.round(coach.reputation || 0)}</div><div class="sub">${repLevel.icon} ${repLevel.label}</div></div>
        <div class="stat-tile"><div class="label">Academics</div><div class="value">${school.academics}</div><div class="sub">${Utils.ratingGrade(school.academics)}</div></div>
        <div class="stat-tile"><div class="label">Weather</div><div class="value">${school.weather.tempBase}°F</div><div class="sub">${school.weather.altitude === 'High' ? '⛰ ' : ''}${school.weather.altitude} altitude • ${school.weather.humidity} humidity</div></div>
      </div>
      ${school.weather.altitude !== 'Low' ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent);">
          <h3>⛰ ${school.weather.altitude === 'High' ? 'High-Altitude' : 'Moderate-Altitude'} Program</h3>
          <div style="color:var(--text-dim); font-size:13px;">Training at elevation builds bigger aerobic engines — a steady lift to <strong>Stamina</strong> and <strong>Lactate Threshold</strong>. The tradeoff: the thin air taxes recovery, so athletes fatigue faster and workload must be managed more carefully.</div>
        </div>` : ''}

      ${UI.sectionLabel('Coaching Staff')}
      ${(() => {
        // Staff cards: you and your counterpart, side by side.
        const partnerId = coach.role === 'Assistant' ? school.coachId : school.assistantId;
        const partner = partnerId && partnerId !== coach.id ? game.getCoach(partnerId) : null;
        const isHead = coach.role !== 'Assistant';
        const card = staffCard;
        const mine = card(coach, isHead ? 'Head Coach' : 'Assistant Coach', true, [
          '<button class="btn small" id="btn-coach-profile">Full Profile</button>',
          window.XCD.engine.Careers.canRetire(game) ? '<button class="btn small" id="btn-retire-coach" title="Retire this coach — the dynasty continues with a successor you create">🏁 Retire</button>' : ''
        ].join(''));
        // A head coach must ALWAYS be able to reach the staff panel — even
        // when the seat is empty — so a departed coordinator can never leave
        // the program stuck without an assistant (which blocks the season).
        const other = partner
          ? card(partner, partner.role === 'Assistant' ? 'Assistant Coach' : 'Head Coach', false,
              isHead ? '<button class="btn small" id="btn-manage-staff" title="Open the staff market: applicants, free agents, and coaches on other staffs">Staff Market</button>' : '')
          : (isHead ? `
            <div class="staff-card vacant">
              <div class="staff-role">Assistant Coach</div>
              <div class="staff-name" style="color:var(--warning);">⚠️ Vacant</div>
              <div class="staff-sub">Hire a coordinator — recruiting, development and chemistry all lean on the staff.</div>
              <div class="staff-actions"><button class="btn small primary" id="btn-manage-staff" title="Hire an assistant from the candidate pool">Hire Assistant</button></div>
            </div>` : '');
        return `<div class="staff-grid">${mine}${other}</div>`;
      })()}

      <div class="grid cols-2" style="margin-top:16px;">
        <div class="card">
          <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px;">
            <h2 style="margin:0;">Your Ratings</h2>
            <span class="pts-pill ${coach.upgradePoints ? 'has' : ''}" title="Dynasty Points — earned through success. Spend on coach ratings below, or on facility upgrades.">🏆 ${coach.upgradePoints || 0} dynasty point${coach.upgradePoints === 1 ? '' : 's'}</span>
          </div>
          <div class="rep-line" title="National reputation — separate from school prestige. Feeds recruiting, the portal, and job offers.">
            <span>${repLevel.icon} <strong>${repLevel.label}</strong></span>
            <span class="rep-num">${Math.round(coach.reputation || 0)}<small>/99 reputation</small></span>
          </div>
          ${tendencies.length || coach.careerRecord ? `<div class="chip-row">${tendencies.map((t) => `<span class="soft-chip">${Utils.escapeHtml(t)}</span>`).join('')}<span class="soft-chip">${coach.careerRecord.teamWins || 0} career team win${coach.careerRecord.teamWins === 1 ? '' : 's'}</span></div>` : ''}
          <div class="rating-list">
          ${COACH_ATTRS.map(([key, label, hint]) => `
            <div class="rating-row" title="${hint}">
              <span class="rating-name">${label}</span>
              <div class="rating-bar">${UI.meter(coach[key])}</div>
              ${UI.ratingBadge(coach[key])}
              <button class="btn small" data-coach-upg="${key}"
                ${(coach.upgradePoints || 0) > 0 && coach[key] < 99 ? '' : `disabled title="${coach[key] >= 99 ? 'Maxed out' : 'Earn dynasty points via titles, All-Americans, top classes, and beating expectations'}"`}>+1</button>
            </div>`).join('')}
          </div>
          <div class="fine-print">
            1 point = +1 rating · ${window.XCD.engine.Finances.FACILITY_POINT_COST} points = a facility upgrade. Earn them with titles, individual
            champions, All-Americans, top-10 recruiting classes, and beating preseason expectations.
          </div>
        </div>

        <div class="card">
          ${(() => {
            const D = window.XCD.data;
            const tp = D.trainingPhilosophy(coach.trainingPhilosophy);
            const rp = D.racePhilosophy(coach.racePhilosophy);
            // Choice pills shown ABOVE their strengths and weaknesses so the
            // trade-offs read as "what you just picked".
            const choices = (list, current, attr) => `
              <div class="philo-choices">
                ${list.map((x) => `
                  <button class="btn small ${current === x.key ? 'primary' : ''}" ${attr}="${x.key}"
                    title="${[x.desc].concat((x.pros || []).map((t) => '+ ' + t), (x.cons || []).map((t) => '− ' + t)).join('\n').replace(/&amp;/g, '&').replace(/"/g, '&quot;')}">${x.icon} ${x.label}</button>`).join('')}
              </div>`;
            return `
              <h2 style="margin:0 0 10px;">Philosophy</h2>
              <div class="philo-head"><span class="philo-kicker">Training</span><strong>${tp.icon} ${tp.label}</strong><span class="philo-note">scales with Training (${coach.training})</span></div>
              <div class="philo-desc">${tp.desc}</div>
              ${choices(D.TRAINING_PHILOSOPHIES, coach.trainingPhilosophy, 'data-train-philo')}
              ${UI.philosophyTradeoffs(tp)}
              <div class="philo-head" style="margin-top:16px;"><span class="philo-kicker">Race</span><strong>${rp.icon} ${rp.label}</strong></div>
              <div class="philo-desc">${rp.desc}</div>
              ${choices(D.RACE_PHILOSOPHIES, coach.racePhilosophy, 'data-race-philo')}
              ${UI.philosophyTradeoffs(rp)}`;
          })()}
        </div>
      </div>

      ${UI.sectionLabel('Facilities')}
      ${(() => {
        const F = window.XCD.engine.Finances;
        const ptCost = F.FACILITY_POINT_COST;
        const pts = coach.upgradePoints || 0;
        const tiles = Object.entries(FACILITY_LABELS).map(([key, [label, effect]]) => {
          const level = facilityLevel(school, key);
          const cost = F.upgradeCost(level);
          const afford = school.budget.facilitiesFund >= cost && level < 99;
          const canPts = pts >= ptCost && level < 99;
          const extra = key === 'travel' ? `<div class="fac-extra">This season: <strong>$${(school.budget.travel || 0).toLocaleString()}</strong> travel budget</div>` : '';
          return `
            <div class="fac-tile">
              <div class="fac-head">
                <span class="fac-icon">${FACILITY_ICONS[key] || '🏛'}</span>
                <span class="fac-name">${label}</span>
                <span class="fac-level ${level >= 85 ? 'elite' : level >= 65 ? 'good' : level >= 45 ? 'avg' : 'low'}">${level}</span>
              </div>
              ${UI.meter(level, level >= 65 ? 'green' : level >= 45 ? '' : 'yellow')}
              <div class="fac-effect">${effect}</div>
              ${extra}
              <div class="fac-actions">
                <button class="btn small" data-upg="${key}" ${afford ? '' : `disabled title="${level >= 99 ? 'World-class' : 'Costs $' + cost.toLocaleString()}"`}
                  title="Upgrade +${F.UPGRADE_STEP} for $${cost.toLocaleString()}">▲ $${Math.round(cost / 1000)}k</button>
                <button class="btn small" data-upg-pts="${key}" ${canPts ? '' : `disabled title="${level >= 99 ? 'World-class' : 'Needs ' + ptCost + ' dynasty points'}"`}
                  title="Upgrade +${F.UPGRADE_STEP} for ${ptCost} dynasty points">▲ ${ptCost} 🏆</button>
              </div>
            </div>`;
        }).join('');
        return `
          <div class="grid cols-3" style="margin-bottom:12px;">
            <div class="stat-tile"><div class="label">Facilities Overall</div><div class="value">${school.facilitiesOverall}</div><div class="sub">${Utils.ratingGrade(school.facilitiesOverall)} · ${F.schoolSizeLabel(school)}</div></div>
            <div class="stat-tile"><div class="label">Facilities Fund</div><div class="value">$${Math.round(school.budget.facilitiesFund / 1000)}k</div><div class="sub">$${school.budget.facilitiesFund.toLocaleString()} to spend</div></div>
            <div class="stat-tile fund-tile"><div class="label">Boosters</div>
              <button class="btn primary" id="btn-fundraise" ${game.fundraisedYear === game.year ? 'disabled title="Boosters already gave this year"' : ''}>💰 ${game.fundraisedYear === game.year ? 'Given this year' : 'Fundraise'}</button>
              <div class="sub">Once a year · scales with success</div></div>
          </div>
          <div class="fac-grid">${tiles}</div>
          <div class="fine-print" style="margin-top:8px;">
            Upgrade with booster money (<strong>$</strong>) or <strong>🏆 dynasty points</strong> — your choice; each step is +${F.UPGRADE_STEP}.
            Every facility has a real training implication. Fundraising scales with program success and school size
            (${F.schoolSizeLabel(school).toLowerCase()}), amplified by the Alumni Center, and the fund refills yearly — faster when you win.
          </div>`;
      })()}

      ${UI.sectionLabel('Budget & History')}
      <div class="grid cols-2">
        <div class="card">
          <h2>Budget — $${b.total.toLocaleString()}</h2>
          <div class="attr-row"><span class="attr-name">Recruiting</span><span>$${b.recruiting.toLocaleString()}</span></div>
          <div class="attr-row"><span class="attr-name">Travel (${game.year} hard budget)</span><span>$${b.travel.toLocaleString()}</span></div>
          <div class="attr-row"><span class="attr-name">Scholarships</span><span>$${b.scholarships.toLocaleString()}</span></div>
          <div class="attr-row"><span class="attr-name">NIL Fund</span><span>$${b.nil.toLocaleString()}</span></div>
          <div class="attr-row"><span class="attr-name">Facilities Fund</span><span>$${b.facilitiesFund.toLocaleString()}</span></div>
          <div class="attr-row" style="margin-top:8px; border-top:1px solid var(--border); padding-top:8px;">
            <span class="attr-name">Scholarships (M / W)</span>
            <span>${school.scholarshipsAvailableM} / ${school.scholarshipsAvailableW}</span>
          </div>
        </div>

        <div class="card">
          <h2>Program History</h2>
          <div class="attr-row"><span class="attr-name">Men's Conference Titles</span><span>${h.conferenceTitlesM}</span></div>
          <div class="attr-row"><span class="attr-name">Women's Conference Titles</span><span>${h.conferenceTitlesW}</span></div>
          <div class="attr-row"><span class="attr-name">Men's National Titles</span><span>${h.nationalTitlesM}</span></div>
          <div class="attr-row"><span class="attr-name">Women's National Titles</span><span>${h.nationalTitlesW}</span></div>
          <h3 style="margin-top:14px;">Rivalries</h3>
          ${rivals.length
            ? rivals.map((r) => `<div class="attr-row"><span>${Utils.escapeHtml(r.name)}</span><span class="attr-name">${Utils.escapeHtml(r.conference)}</span></div>`).join('')
            : '<div style="color:var(--text-dim); font-size:13px;">No established rivals.</div>'}
          <h3 style="margin-top:14px;">School Records</h3>
          ${school.records && Object.keys(school.records).length
            ? Object.entries(school.records).sort().map(([key, rec]) => `
                <div class="attr-row">
                  <span class="attr-name">${key.replace('M-', "Men's ").replace('W-', "Women's ")}</span>
                  <span>${window.XCD.engine.Races.formatTime(rec.time)} — ${Utils.escapeHtml(rec.name)} ('${String(rec.year).slice(2)})</span>
                </div>`).join('')
            : '<div style="color:var(--text-dim); font-size:13px;">No records on the books yet — race!</div>'}
        </div>
      </div>`;

    const profBtn = container.querySelector('#btn-coach-profile');
    if (profBtn) profBtn.addEventListener('click', () => UI.showCoachCard(coach, game));

    // Legacy Dynasty Mode (Update 6, Section 1): retirement never ends the
    // dynasty — it starts the next generation. Confirm, then run the
    // succession wizard; nothing changes until the final confirmation.
    const retireBtn = container.querySelector('#btn-retire-coach');
    if (retireBtn) retireBtn.addEventListener('click', () => {
      const cr = coach.careerRecord || {};
      UI.showModal(`
        <h2>🏁 Retire ${Utils.escapeHtml(coach.fullName)}?</h2>
        <p style="color:var(--text-dim); font-size:13.5px; line-height:1.5; margin:10px 0;">
          Retirement is permanent — this career (${cr.seasons || 0} seasons,
          ${cr.nationalTitles || 0} national titles, ${cr.conferenceTitles || 0} conference titles)
          is sealed into the record books forever. <strong>The dynasty does not end:</strong>
          the world, every program, every athlete, and all history continue. You will
          immediately create a brand-new coach and choose where the next era begins.
        </p>
        <p style="color:var(--text-faint); font-size:12.5px;">You can back out at any step of the succession wizard before the final confirmation.</p>
        <div style="display:flex; gap:10px; margin-top:14px;">
          <button class="btn" data-modal-close>Keep Coaching</button>
          <button class="btn primary" id="btn-retire-confirm" style="flex:1;">Begin Succession →</button>
        </div>
      `, (modal) => {
        modal.querySelector('#btn-retire-confirm').addEventListener('click', () => {
          UI.closeModal();
          UI.successionFlow(game);
        });
      });
    });

    const partnerBtn = container.querySelector('#btn-partner-coach');
    if (partnerBtn) partnerBtn.addEventListener('click', () => {
      const partnerId = coach.role === 'Assistant' ? school.coachId : school.assistantId;
      const partner = partnerId && game.getCoach(partnerId);
      if (partner) UI.showCoachCard(partner, game);
    });

    // Staff management lives on its own tab: the staff market.
    const staffBtn = container.querySelector('#btn-manage-staff');
    if (staffBtn) staffBtn.addEventListener('click', () => { activeTab = 'staff'; render(outerContainer); });

    container.querySelectorAll('[data-train-philo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.trainPhilo;
        if (coach.trainingPhilosophy === key) return;
        coach.trainingPhilosophy = key;
        UI.toast(`Training philosophy set: ${window.XCD.data.trainingPhilosophy(key).label}.`, 'success');
        render(outerContainer);
      });
    });

    container.querySelectorAll('[data-race-philo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.racePhilo;
        if (coach.racePhilosophy === key) return;
        coach.racePhilosophy = key;
        UI.toast(`Race philosophy set: ${window.XCD.data.racePhilosophy(key).label}.`, 'success');
        render(outerContainer);
      });
    });

    container.querySelectorAll('[data-coach-upg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.coachUpg;
        if ((coach.upgradePoints || 0) <= 0 || coach[key] >= 99) return;
        coach.upgradePoints -= 1;
        coach[key] = Math.min(99, coach[key] + 1);
        UI.toast(`${COACH_ATTRS.find(([k]) => k === key)[1]} improved to ${coach[key]}.`, 'success');
        render(outerContainer);
      });
    });

    container.querySelectorAll('[data-upg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = window.XCD.engine.Finances.upgradeFacility(game, school.id, btn.dataset.upg);
        UI.toast(result.message, result.ok ? 'success' : 'error');
        if (result.ok) render(outerContainer);
      });
    });

    container.querySelectorAll('[data-upg-pts]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = window.XCD.engine.Finances.upgradeFacilityWithPoints(game, school.id, btn.dataset.upgPts);
        UI.toast(result.message, result.ok ? 'success' : 'error');
        if (result.ok) render(outerContainer);
      });
    });
    const fundBtn = container.querySelector('#btn-fundraise');
    if (fundBtn) {
      fundBtn.addEventListener('click', () => {
        const result = window.XCD.engine.Finances.fundraise(game);
        UI.toast(result.message, result.ok ? 'success' : 'error');
        if (result.ok) render(outerContainer);
      });
    }
  }

  // Back to the screen's load-in defaults (tabs, sub-tabs, toggles, filters).
  // Called by the shell whenever the player navigates INTO this screen, so
  // leaving a tab and coming back always lands on its default view.
  function reset() {
    activeTab = 'overview';
    histSub = 'archive';
    hofSort = 'legacy';
    Object.assign(staffView, { source: 'all', query: '', reachable: false });
  }

  // Deep link: UI.navigate('school', 'staff' | 'history' | 'overview').
  function openTab(tab) {
    if (['overview', 'staff', 'history'].includes(tab)) activeTab = tab;
  }

  UI.screens.school = { render, reset, openTab };
})();
