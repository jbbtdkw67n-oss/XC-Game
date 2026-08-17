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
    indoorTrack: ['Indoor Track', 'Sharpness: speed sessions and race simulations pay out more, and Speed develops faster from speed work.'],
    alumniCenter: ['Alumni Center', 'Fundraising: bigger booster pushes and a faster-refilling facilities fund, scaled by program success and school size.']
  };

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
        <div>
          <h1 style="margin-bottom:2px;">${Utils.escapeHtml(school.name)}</h1>
          <div style="display:flex; align-items:center; gap:8px; font-size:13.5px;">
            ${UI.kitSwatch(school)}
            <span style="font-weight:600; color:var(--text);">${Utils.escapeHtml(school.mascot || '')}</span>
          </div>
        </div>
        <div class="actions">
          <div class="pill-tabs">
            <button data-stab="overview" class="${activeTab === 'overview' ? 'active' : ''}">Overview</button>
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
    const winPct = Legacy.programWinPct(prog);
    const ph = school.prestigeHistory || [];
    const trend = ph.slice(-10).map((p) => p.prestige);
    const trendStr = trend.length >= 2 ? `${trend[0]} → ${trend[trend.length - 1]} over ${trend.length} yrs` : '—';
    const h = programHistory(game, school);
    const gTag = (g) => g === 'M' ? "Men's" : "Women's";
    const athLink = (name, id) => `<span class="clickable" data-ath="${id || ''}" data-ath-name="${Utils.escapeHtml(name)}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(name)}</span>`;
    const coachLink = (name, coachId) => name ? `<span class="clickable" data-coach="${coachId || ''}" data-coach-name="${Utils.escapeHtml(name)}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(name)}</span>` : '—';
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
        <div class="stat-tile"><div class="label">All-Time Record</div><div class="value">${prog.wins}-${prog.losses}</div><div class="sub">${winPct}% winning pct</div></div>
        <div class="stat-tile"><div class="label">National Titles</div><div class="value">${prog.natTitles}</div><div class="sub">${prog.natRunnerUp || 0} runner-up</div></div>
        <div class="stat-tile"><div class="label">Best NCAA Finish</div><div class="value">${prog.bestFinish ? Utils.ordinal(prog.bestFinish) : '—'}</div><div class="sub">${prog.podiums} podiums</div></div>
        <div class="stat-tile"><div class="label">Highest Ranking</div><div class="value">${prog.highestRank ? '#' + prog.highestRank : '—'}</div><div class="sub">prestige ${trendStr}</div></div>
      </div>

      ${sectionTable('🏆 Team National Championships',
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
          <td>${t.year}</td><td>${gTag(t.gender)[0]} — ${athLink(t.athlete, t.athleteId)}</td><td>${coachLink(t.coach)}</td><td>${t.event}</td>
        </tr>`),
        'No individual national champions yet.')}

      ${sectionTable('🏅 Conference Team Championships',
        ['Year', 'Squad', 'Conference', 'Coach'],
        h.confTeam.map((t) => `<tr><td>${t.year}</td><td>${gTag(t.gender)}</td><td>${Utils.escapeHtml(t.conf)}</td><td>${coachLink(t.coach)}</td></tr>`),
        'No conference team titles recorded yet.')}

      ${sectionTable('🥇 Individual Conference Champions',
        ['Year', 'Athlete', 'Coach'],
        h.indivConf.map((t) => `<tr><td>${t.year}</td><td>${gTag(t.gender)[0]} — ${athLink(t.athlete, t.athleteId)}</td><td>${coachLink(t.coach)}</td></tr>`),
        'No individual conference champions yet.')}

      ${sectionTable('🗺 Regional Championships — Team & Individual',
        ['Year', 'Type', 'Detail', 'Coach'],
        [
          ...h.regTeam.map((t) => `<tr><td>${t.year}</td><td>Team (${gTag(t.gender)[0]})</td><td>${Utils.escapeHtml(t.region)} Regional Champions</td><td>${coachLink(t.coach)}</td></tr>`),
          ...h.indivReg.map((t) => `<tr><td>${t.year}</td><td>Individual (${gTag(t.gender)[0]})</td><td>${athLink(t.athlete, t.athleteId)}</td><td>${coachLink(coachOfYear(game, school, t.year))}</td></tr>`)
        ].sort(),
        'No regional titles recorded yet.')}

      <div class="card" style="margin-bottom:16px;">
        <h2>🧢 Coach Timeline — the complete head-coaching history</h2>
        <div style="color:var(--text-dim); font-size:12px; margin-bottom:8px;">
          Every head coach the program has ever had, forever. Records and achievements shown are what
          each coach accomplished <strong>at this school</strong> — never at other stops (Phases 3 &amp; 8).
        </div>
        ${prog.coaches.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>Coach</th><th>Years</th><th class="num">Record Here</th><th class="num">Win%</th><th class="num">Titles Here</th><th class="num" title="Regional titles won here">Reg</th><th class="num">NCAA Trips</th><th>Coach of the Year</th><th class="num" title="Program prestige when the tenure ended (current prestige for the sitting coach)">Prestige Reached</th><th>Departure</th></tr></thead>
          <tbody>${prog.coaches.slice().reverse().map((c) => {
            const rec = resolveCoachRecord(game, c);
            const sr = rec ? window.XCD.engine.Legacy.coachSchoolRecord(game, rec, school.id)
              : { wins: 0, losses: 0, natTitles: 0, confTitles: 0, regTitles: 0, natApps: 0, natCOY: 0, confCOY: 0, winPct: 0 };
            const wl = (sr.wins || sr.losses) ? `${sr.wins}-${sr.losses}` : '—';
            const coy = [];
            if (sr.natCOY) coy.push(`${sr.natCOY}× National`);
            if (sr.confCOY) coy.push(`${sr.confCOY}× Conference`);
            const depart = window.XCD.engine.Legacy.departureInfo(game, c, school.id);
            const prestigeReached = c.endYear ? (c.prestigeEnd ?? '—') : school.prestige;
            return `<tr>
              <td>${coachLink(c.name, c.coachId)}</td>
              <td style="color:var(--text-dim);">${c.startYear}–${c.endYear || 'present'}</td>
              <td class="num">${wl}</td>
              <td class="num">${(sr.wins || sr.losses) ? sr.winPct + '%' : '—'}</td>
              <td class="num">${sr.natTitles}🏆 ${sr.confTitles}🥇</td>
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
    const winPct = Legacy.programWinPct(prog);
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
          ${holder ? `<div style="font-size:12px; color:var(--accent-hover);">${holder.generational ? '⭐ ' : ''}${Utils.escapeHtml(holder.name)}</div>
          <div style="font-size:11px; color:var(--text-faint);">${Utils.escapeHtml(holder.tenure || holder.years || '')}</div>` : ''}
        </span>
      </div>`;
    const rec = (label, value, sub) => `
      <div class="attr-row"><span class="attr-name">${label}</span><span style="text-align:right;"><strong>${value}</strong>${sub ? `<div style="font-size:11.5px; color:var(--text-faint);">${sub}</div>` : ''}</span></div>`;

    // Coach record holders (school-scoped).
    const cMostWins = bestCoachBy((r) => r.sr.wins || 0, 0);
    const cWinPct = bestCoachBy((r) => (r.sr.wins + r.sr.losses) >= 30 ? r.sr.winPct : -1, 0);
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
          ${holderRec('Most Wins', cMostWins ? `${cMostWins.value} wins` : '—', cMostWins, 'coach')}
          ${holderRec('Highest Winning %', cWinPct ? `${cWinPct.value}%` : '—', cWinPct, 'coach')}
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
          ${rec('All-Time Wins', prog.wins || 0, `${prog.wins}-${prog.losses} • ${winPct}%`)}
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
              <span><strong>${athRows[0].generational ? '⭐ ' : ''}${Utils.escapeHtml(athRows[0].name)}</strong>
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
              <span><strong>${Utils.escapeHtml(bc.name)}</strong>
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
    const winPct = Legacy.programWinPct(prog);
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
          <h2>🏆 Championships</h2>
          ${row('National Titles', prog.natTitles || 0)}
          ${row('National Runner-Up Finishes', prog.natRunnerUp || 0)}
          ${row('Top-5 Finishes', prog.top5Finishes || 0, 'at the NCAA Championships')}
          ${row('Top-10 Finishes', prog.top10Finishes || 0, 'at the NCAA Championships')}
          ${row('NCAA Appearances', prog.ncaaAppearances || 0)}
          ${row('Best NCAA Finish', prog.bestFinish ? Utils.ordinal(prog.bestFinish) : '—')}
        </div>
        <div class="card">
          <h2>🏅 Conference</h2>
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
          ${row('All-Time Winning Percentage', `${winPct}%`)}
          ${row('National Coach of the Year Awards', prog.natCoyAwards || 0)}
          ${row('Conference Coach of the Year Awards', prog.confCoyAwards || 0)}
        </div>
      </div>
      <div class="card" style="margin-top:16px;">
        <h2>📊 Overall</h2>
        <div class="grid cols-4" style="margin-top:8px;">
          <div class="stat-tile"><div class="label">Seasons Played</div><div class="value">${prog.seasonsPlayed || 0}</div></div>
          <div class="stat-tile"><div class="label">Dual Meet Record</div><div class="value">${prog.wins || 0}-${prog.losses || 0}</div><div class="sub">${winPct}% all-time</div></div>
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
            <span style="font-size:24px; flex:0 0 auto;">${h.portrait || '🏛'}</span>
            <span style="flex:1; min-width:0;">
              <strong>${Utils.escapeHtml(h.name)}</strong>
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
            <span style="font-size:24px; flex:0 0 auto;">🧢</span>
            <span style="flex:1; min-width:0;">
              <strong>${Utils.escapeHtml(c.name)}</strong>
              <span style="color:var(--text-faint); font-size:12px;"> • ${Utils.escapeHtml(c.tenure)}</span>
              <div style="font-size:12px; color:var(--text-dim);">
                ${c.sr.natTitles} natl • ${c.sr.confTitles} conf • ${c.sr.natCOY + c.sr.confCOY} Coach of the Year • ${c.sr.wins}-${c.sr.losses}${(c.sr.wins || c.sr.losses) ? ` (${c.sr.winPct}%)` : ''} here
              </div>
            </span>
            <span style="text-align:right; flex:0 0 auto;"><strong style="font-size:18px;">${Math.round(c.score)}</strong><div style="font-size:11px; color:var(--text-faint);">legacy here</div></span>
          </div>`).join('')
        : '<div style="color:var(--text-dim); font-size:13px;">No coaches enshrined yet — win here, and history remembers.</div>'}
      </div>

      <div class="card">
        <h2>🏆 Championship Teams — ${teams.length}</h2>
        ${teams.length ? teams.map((t, i) => `
          <div class="attr-row clickable" data-hof-team="${i}" style="cursor:pointer; align-items:flex-start; padding:10px 0; gap:10px;">
            <span style="font-size:24px; flex:0 0 auto;">🏆</span>
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
  function renderOverview(game, school, coach, container, outerContainer) {
    const b = school.budget;
    const h = school.historicalSuccess;
    const rivals = school.rivalries.map((id) => game.getSchool(id)).filter(Boolean);
    const repLevel = coach.reputationLevel || { label: 'Unknown', icon: '❔' };
    const tendencies = (coach.tendencies || [])
      .map((t) => (window.XCD.data.COACH_TENDENCIES.find((x) => x.key === t) || {}).label)
      .filter(Boolean);

    container.innerHTML = `
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

      <div class="grid cols-2">
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <h2 style="margin:0;">${UI.avatar(coach, { size: 30, outfit: 'suit' })} ${coach.role === 'Assistant' ? 'Assistant Coach' : 'Head Coach'} — ${Utils.escapeHtml(coach.fullName)}</h2>
            <div style="display:flex; gap:6px;">
              ${window.XCD.engine.Careers.canRetire(game) ? '<button class="btn small" id="btn-retire-coach" title="Retire this coach — the dynasty continues with a successor you create">🏁 Retire</button>' : ''}
              <button class="btn small" id="btn-coach-profile">Full Profile</button>
            </div>
          </div>
          <div style="color:var(--text-dim); font-size:13px; margin:6px 0;">
            Age ${coach.age} • ${Utils.escapeHtml(coach.archetype || '')} • Year ${coach.yearsAtSchool + 1} at ${Utils.escapeHtml(school.name)} • Overall ${coach.overallRating}
          </div>
          ${(() => {
            // Show the counterpart on the staff: the head coach you serve under
            // as an assistant, or your recruiting coordinator as a head coach.
            const partnerId = coach.role === 'Assistant' ? school.coachId : school.assistantId;
            const partner = partnerId && partnerId !== coach.id ? game.getCoach(partnerId) : null;
            const isHead = coach.role !== 'Assistant';
            // Assistant-coach vacancy fix: a head coach must ALWAYS be able to
            // reach the staff panel — even when the seat is empty — so a
            // departed coordinator can never leave the program permanently
            // stuck without an assistant (which would block the season).
            if (!partner) {
              if (!isHead) return '';
              return `<div style="font-size:12.5px; margin:0 0 10px; color:var(--warning);">
                ⚠️ Assistant Coach: <strong>Vacant</strong>
                <button class="btn small primary" id="btn-manage-staff" style="margin-left:6px;" title="Hire an assistant from the candidate pool">Hire Assistant</button>
              </div>`;
            }
            const partnerRole = partner.role === 'Assistant' ? 'Assistant Coach' : 'Head Coach';
            return `<div style="font-size:12.5px; margin:0 0 10px;">
              ${partnerRole}: <span class="clickable" id="btn-partner-coach" style="cursor:pointer; color:var(--accent-hover);">${UI.avatar(partner, { size: 22, outfit: 'suit' })} ${Utils.escapeHtml(partner.fullName)}</span>
              <span style="color:var(--text-faint);"> • ${Utils.escapeHtml(partner.archetype || '')} • Overall ${partner.overallRating}${partner.interim ? ' • <span style="color:var(--warning);">interim</span>' : ''}</span>
              ${isHead ? ' <button class="btn small" id="btn-manage-staff" style="margin-left:6px;" title="Compare assistant candidates and reshape your staff">Manage Staff</button>' : ''}
            </div>`;
          })()}
          <div style="font-size:12.5px; margin-bottom:12px;">
            <span title="National reputation — separate from school prestige. Feeds recruiting, the portal, and job offers.">${repLevel.icon} <strong>${repLevel.label}</strong> (${Math.round(coach.reputation || 0)}/99)</span>
            ${tendencies.length ? `<span style="color:var(--text-dim);"> • ${tendencies.join(' • ')}</span>` : ''}
            <span style="color:var(--text-dim);"> • Career ${coach.careerRecord.wins}-${coach.careerRecord.losses} (${coach.winPct}%)</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:13px;" title="Dynasty Points — earned through success. Spend on coach ratings below, or on facility upgrades.">🏆 Dynasty Points: <strong style="color:${coach.upgradePoints ? 'var(--gold)' : 'var(--text-dim)'};">${coach.upgradePoints || 0}</strong></span>
            <span style="font-size:11.5px; color:var(--text-faint);">1 pt = +1 rating · ${window.XCD.engine.Finances.FACILITY_POINT_COST} pts = a facility upgrade</span>
          </div>
          ${COACH_ATTRS.map(([key, label, hint]) => `
            <div class="attr-row" style="margin-bottom:6px;" title="${hint}">
              <span class="attr-name" style="min-width:90px;">${label}</span>
              <div style="flex:1; margin:0 10px;">${UI.meter(coach[key])}</div>
              ${UI.ratingBadge(coach[key])}
              <button class="btn small" data-coach-upg="${key}" style="margin-left:8px;"
                ${(coach.upgradePoints || 0) > 0 && coach[key] < 99 ? '' : `disabled title="${coach[key] >= 99 ? 'Maxed out' : 'Earn dynasty points via titles, All-Americans, top classes, and beating expectations'}"`}>+1</button>
            </div>`).join('')}
          <div style="font-size:12px; color:var(--text-faint); margin-top:6px;">
            Earn dynasty points with conference/regional/national titles, individual champions,
            All-Americans, top-10 recruiting classes, and beating preseason expectations. Spend them
            on these ratings or on facility upgrades (right).
          </div>
          ${(() => {
            const D = window.XCD.data;
            const tp = D.trainingPhilosophy(coach.trainingPhilosophy);
            const rp = D.racePhilosophy(coach.racePhilosophy);
            return `
            <div style="margin-top:12px; border-top:1px solid var(--border); padding-top:10px;">
              <div style="font-size:12.5px;"><strong>${tp.icon} Training Philosophy:</strong> ${tp.label}
                <span style="color:var(--text-faint);"> • permanent, scales with Training (${coach.training})</span></div>
              <div style="font-size:12px; color:var(--text-dim); margin:3px 0 10px;">${tp.desc}</div>
              <div style="font-size:12.5px; margin-bottom:5px;"><strong>Race Philosophy:</strong> <span style="color:var(--text-dim);">${rp.desc}</span></div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${D.RACE_PHILOSOPHIES.map((x) => `
                  <button class="btn small ${coach.racePhilosophy === x.key ? 'primary' : ''}" data-race-philo="${x.key}"
                    title="${x.desc.replace(/&amp;/g, '&').replace(/"/g, '&quot;')}">${x.icon} ${x.label}</button>`).join('')}
              </div>
            </div>`;
          })()}
        </div>

        <div class="card">
          <h2>Facilities — Overall ${school.facilitiesOverall}</h2>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:13px; color:var(--text-dim);">Facilities Fund: <strong style="color:var(--text);">$${school.budget.facilitiesFund.toLocaleString()}</strong></span>
            <button class="btn small primary" id="btn-fundraise" ${game.fundraisedYear === game.year ? 'disabled title="Boosters already gave this year"' : ''}>💰 Fundraise</button>
          </div>
          ${(() => {
            const ptCost = window.XCD.engine.Finances.FACILITY_POINT_COST;
            const pts = coach.upgradePoints || 0;
            return Object.entries(FACILITY_LABELS).map(([key, [label, effect]]) => {
              const level = school.facilities[key];
              const cost = window.XCD.engine.Finances.upgradeCost(level);
              const afford = school.budget.facilitiesFund >= cost && level < 99;
              const canPts = pts >= ptCost && level < 99;
              return `
              <div class="attr-row" style="margin-bottom:6px;" title="${effect}">
                <span class="attr-name" style="min-width:110px; cursor:help;">${label}</span>
                <div style="flex:1; margin:0 8px;">${UI.meter(level)}</div>
                <span style="font-weight:700; font-size:12.5px; min-width:22px;">${level}</span>
                <button class="btn small" data-upg="${key}" ${afford ? '' : `disabled title="${level >= 99 ? 'World-class' : 'Costs $' + cost.toLocaleString()}"`}
                  style="margin-left:8px;" title="Upgrade +${window.XCD.engine.Finances.UPGRADE_STEP} for $${cost.toLocaleString()} — ${effect}">▲ $${Math.round(cost / 1000)}k</button>
                <button class="btn small" data-upg-pts="${key}" ${canPts ? '' : `disabled title="${level >= 99 ? 'World-class' : 'Needs ' + ptCost + ' dynasty points'}"`}
                  style="margin-left:4px;" title="Upgrade +${window.XCD.engine.Finances.UPGRADE_STEP} for ${ptCost} dynasty points — ${effect}">▲ ${ptCost}🏆</button>
              </div>`;
            }).join('');
          })()}
          <div style="font-size:12px; color:var(--text-faint); margin-top:6px;">
            Upgrade with booster money (<strong>$</strong>) or with <strong>🏆 dynasty points</strong> — your choice.
            Every facility has a real training implication (hover a name). Fundraising scales with
            program success and school size (${window.XCD.engine.Finances.schoolSizeLabel(school).toLowerCase()}),
            amplified by the Alumni Center. The fund also refills yearly — faster when you win.
          </div>
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:16px;">
        <div class="card">
          <h2>Budget — $${b.total.toLocaleString()}</h2>
          <div class="attr-row"><span class="attr-name">Recruiting</span><span>$${b.recruiting.toLocaleString()}</span></div>
          <div class="attr-row"><span class="attr-name">Travel</span><span>$${b.travel.toLocaleString()}</span></div>
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

    // Staff management (Update 6, Section 9): compare candidates, hire, and
    // let the incumbent go — head coaches only, and never an empty seat.
    const staffBtn = container.querySelector('#btn-manage-staff');
    if (staffBtn) staffBtn.addEventListener('click', () => {
      const Coaching = window.XCD.engine.Coaching;
      const current = school.assistantId && game.getCoach(school.assistantId);
      const candidates = Coaching.assistantCandidates(game);
      // Full comparison profiles (spec Part 2, Section 12): philosophy,
      // every craft that feeds gameplay, experience, career record, and
      // reputation — enough to genuinely weigh candidates.
      const row = (c, tag, btnHtml) => {
        const cr = c.careerRecord || {};
        const seasons = cr.seasons || 0;
        const veteran = !!window.XCD.ui.state.game.world.coaches[c.id];
        const rp = (window.XCD.data.racePhilosophy(c.racePhilosophy) || {});
        return `
        <div class="attr-row" style="align-items:flex-start; padding:8px 0;">
          <div style="flex:1;">
            <div><strong>${UI.avatar(c, { size: 22, outfit: 'suit' })} ${Utils.escapeHtml(c.fullName)}</strong>
              <span style="color:var(--text-faint); font-size:11.5px;"> ${tag}</span>
              ${c.origin && !tag ? `<span class="rating r-good" style="font-size:10px;" title="Where this candidate comes from — every hire is a real career, not a generic name">${Utils.escapeHtml(c.origin)}</span>` : (veteran && !tag ? '<span class="rating r-good" style="font-size:10px;" title="A real free agent from the coaching pool — career history and all">Free Agent</span>' : '')}</div>
            <div style="color:var(--text-dim); font-size:12px; margin-top:2px;">
              Age ${c.age} • ${Utils.escapeHtml(c.archetype || '')} •
              ${Utils.escapeHtml((window.XCD.data.trainingPhilosophy(c.trainingPhilosophy) || {}).label || '')}${rp.label ? ` / ${Utils.escapeHtml(rp.label)}` : ''}
              ${seasons ? ` • ${seasons} season${seasons > 1 ? 's' : ''} coached${cr.wins || cr.losses ? ` (${cr.wins || 0}-${cr.losses || 0})` : ''}${cr.nationalTitles ? ` • ${cr.nationalTitles}🏆` : ''}` : ' • First job'}
              • Rep ${Math.round(c.reputation || 0)}
            </div>
            <div style="font-size:12px; margin-top:3px;">
              <span title="Recruiting pull — adds weekly recruiting points">Rec <strong>${c.recruiting}</strong></span> •
              <span title="Development — multiplies every athlete's weekly growth">Dev <strong>${c.training}</strong></span> •
              <span title="Peaking — sharpens championship race day">Peak <strong>${c.peaking}</strong></span> •
              <span title="Culture — feeds squad chemistry">Cul <strong>${c.culture}</strong></span> •
              <span title="Motivation — lifts struggling athletes' morale">Mot <strong>${c.motivation ?? 55}</strong></span> •
              <span title="Communication — bonds that keep athletes home">Com <strong>${c.relationships ?? 55}</strong></span> •
              <span title="Scouting accuracy">Eval <strong>${c.talentEval}</strong></span>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">${btnHtml}</div>
        </div>`;
      };
      const gate = Coaching.canHireAssistant(game);
      UI.showModal(`
        <button class="btn small modal-close" data-modal-close>✕ Close</button>
        <h2>👥 Assistant Staff</h2>
        <p style="color:var(--text-dim); font-size:12.5px; margin:6px 0 10px;">
          Better Staff Management attracts stronger applicants. Hiring replaces your
          current assistant, and a program makes <strong>one staff hire per offseason</strong> —
          coaches finish the season they signed on for.
        </p>
        ${gate.ok ? '' : `<div style="color:var(--warning); font-size:12.5px; margin:0 0 10px;">🔒 ${gate.why}</div>`}
        <h3>Current</h3>
        ${current ? row(current, `• Year ${(current.yearsAtSchool || 0) + 1} on staff`, `<button class="btn small" id="btn-view-current">Profile</button>`) : '<div style="color:var(--text-dim); font-size:13px;">Vacant (a hire below fills it).</div>'}
        <h3 style="margin-top:12px;">Candidates This Week</h3>
        ${candidates.map((c, i) => row(c, '', `
          <button class="btn small primary" data-hire="${i}" ${gate.ok ? '' : `disabled title="${gate.why}"`}>Hire</button>
          <button class="btn small" data-view-cand="${i}">Profile</button>`)).join('')}
        <div style="color:var(--text-faint); font-size:11.5px; margin-top:8px;">
          A strong assistant genuinely matters: Dev multiplies weekly development, Rec adds recruiting
          points, Cul feeds chemistry, Mot lifts struggling athletes, and Peak sharpens championship day.
        </div>
      `, (modal) => {
        const viewBtn = modal.querySelector('#btn-view-current');
        if (viewBtn) viewBtn.addEventListener('click', () => UI.showCoachCard(current, game));
        modal.querySelectorAll('[data-view-cand]').forEach((btn) => {
          btn.addEventListener('click', () => UI.showCoachCard(candidates[Number(btn.dataset.viewCand)], game));
        });
        modal.querySelectorAll('[data-hire]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const cand = candidates[Number(btn.dataset.hire)];
            const res = window.XCD.engine.Coaching.hireAssistant(game, cand);
            UI.toast(res.message, res.ok ? 'success' : 'error');
            UI.closeModal();
            if (res.ok) render(outerContainer);
          });
        });
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

  UI.screens.school = { render };
})();
