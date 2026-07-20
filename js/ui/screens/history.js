/*
 * History screen: the game remembers everything — champions, awards,
 * records, the GOAT lists, legacy leaderboards, the Hall of Fame, and
 * your career. Update 12 (Living History): every major table is
 * searchable, filterable, and sortable, and every name opens a profile.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  let activeTab = 'career';
  let champDiv = 'DI';  // Champions page division filter (Update 4, Part 5)
  let champYear = '';   // Champions page year filter (Update 12, Phase 8)
  let awardDiv = 'DI';  // Awards page division filter (Update 4, Part 6)
  let awardYear = '';   // Awards page year filter
  let goatSub = 'athletes';   // GOAT Lists sub-page
  const goatFilters = { query: '', division: '', gender: '', status: '' }; // Update 12: GOAT list filters
  let boardSub = 'programs';  // Leaderboards sub-page
  const boardFilters = { query: '', division: '', conference: '' };
  const DIV_LABELS = { DI: 'D1', DII: 'D2', DIII: 'D3' };

  // Map every conference to the division it belongs to (from the world).
  function confDivisions(game) {
    const map = {};
    Object.values(game.world.schools).forEach((s) => { map[s.conference] = s.division || 'DI'; });
    return map;
  }

  // National-champions key for a division/gender (DI keeps legacy M/W keys).
  function natKey(division, gender) {
    return division === 'DI' ? gender : `${division}-${gender}`;
  }

  function render(container) {
    const game = UI.state.game;

    container.innerHTML = `
      <div class="screen-header">
        <h1>History</h1>
        <div class="actions">
          <div class="pill-tabs">
            <button data-tab="career" class="${activeTab === 'career' ? 'active' : ''}">My Career</button>
            <button data-tab="goat" class="${activeTab === 'goat' ? 'active' : ''}">🐐 GOAT Lists</button>
            <button data-tab="boards" class="${activeTab === 'boards' ? 'active' : ''}">Leaderboards</button>
            <button data-tab="champions" class="${activeTab === 'champions' ? 'active' : ''}">Champions</button>
            <button data-tab="awards" class="${activeTab === 'awards' ? 'active' : ''}">Awards</button>
            <button data-tab="records" class="${activeTab === 'records' ? 'active' : ''}">Records</button>
            <button data-tab="legends" class="${activeTab === 'legends' ? 'active' : ''}">Legends</button>
            <button data-tab="hof" class="${activeTab === 'hof' ? 'active' : ''}">Hall of Fame</button>
          </div>
        </div>
      </div>
      <div id="hist-body"></div>`;

    const body = container.querySelector('#hist-body');
    ({ career, goat, boards, champions, awards, records, legends, hof })[activeTab](game, body);

    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(container); });
    });
  }

  function career(game, el) {
    const c = game.career;
    const coach = game.getPlayerCoach();
    const school = game.getPlayerSchool();
    const summaries = game.history.seasonSummaries || {};
    const years = Object.keys(summaries).sort((a, b) => b - a);

    el.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Seasons</div><div class="value">${c.seasons}</div><div class="sub">at ${Utils.escapeHtml(school.name)}</div></div>
        <div class="stat-tile"><div class="label">Conference Titles</div><div class="value">${c.conferenceTitles}</div></div>
        <div class="stat-tile"><div class="label">National Titles</div><div class="value">${c.nationalTitles}</div><div class="sub">${c.podiums} podiums</div></div>
        <div class="stat-tile"><div class="label">Nationals Trips</div><div class="value">${c.nationalsAppearances}</div><div class="sub">best finish: ${c.bestFinish ? Utils.ordinal(c.bestFinish) : '—'}</div></div>
      </div>
      ${(game.history.playerCareers || []).length ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--gold, #d4a017);">
          <h2>🏛 Dynasty Lineage — ${game.history.playerCareers.length + 1} coach${game.history.playerCareers.length ? 'es' : ''}</h2>
          <div style="color:var(--text-dim); font-size:12.5px; margin-bottom:8px;">
            Every coach who has led this dynasty. Retired careers are sealed in the record books forever.
          </div>
          ${game.history.playerCareers.map((p, i) => `
            <div class="attr-row clickable" data-lineage="${i}" style="cursor:pointer;">
              <span>${UI.avatar(p, { size: 24, outfit: 'suit' })} <strong>${Utils.escapeHtml(p.name)}</strong>
                <span style="color:var(--text-faint); font-size:12px;">retired ${p.retiredYear}</span></span>
              <span style="color:var(--text-dim); font-size:12.5px;">
                ${(p.careerRecord || {}).seasons || 0} szn • ${(p.careerRecord || {}).nationalTitles || 0} natl • ${(p.careerRecord || {}).conferenceTitles || 0} conf • ${p.winPct || 0}%
              </span>
            </div>`).join('')}
          <div class="attr-row" style="background:var(--accent-soft); border-radius:6px; padding:6px 8px;">
            <span>${UI.avatar(coach, { size: 24, outfit: 'suit' })} <strong>${Utils.escapeHtml(coach.fullName)}</strong> <span style="color:var(--accent); font-size:12px;">(current)</span></span>
            <span style="color:var(--text-dim); font-size:12.5px;">${c.seasons} szn • ${c.nationalTitles} natl • ${c.conferenceTitles} conf</span>
          </div>
        </div>` : ''}
      ${(c.stops || []).length ? `
        <div class="card" style="margin-bottom:16px;">
          <h2>Coaching Stops</h2>
          ${c.stops.map((s, i) => `
            <div class="attr-row">
              <span>${i + 1}. ${Utils.escapeHtml(s.school)}</span>
              <span style="color:var(--text-dim);">${s.startYear}${i < c.stops.length - 1 ? '–' + (c.stops[i + 1].startYear - 1) : '–present'}</span>
            </div>`).join('')}
        </div>` : ''}
      ${c.awards.length ? `
        <div class="card" style="margin-bottom:16px;">
          <h2>Personal Honors</h2>
          ${c.awards.map((a) => `<div class="attr-row"><span>🏅 ${Utils.escapeHtml(a)}</span></div>`).join('')}
        </div>` : ''}
      <div class="card">
        <h2>Season-by-Season</h2>
        ${years.length ? years.map((year) => {
          const rows = summaries[year];
          const champ = (game.history.nationalChampions || {})[year];
          return `
            <h3 style="margin-top:12px;">${year} ${champ ? `— Natl champs: ${Utils.escapeHtml(champ.M?.team || '?')} (M), ${Utils.escapeHtml(champ.W?.team || '?')} (W)` : ''}</h3>
            ${rows.length ? `<div class="table-wrap"><table class="data">
              <thead><tr><th>Wk</th><th>Meet</th><th></th><th class="num">Place</th><th class="num">Field</th></tr></thead>
              <tbody>${rows.map((r) => `
                <tr><td>${r.week}</td><td>${Utils.escapeHtml(r.meet)}</td><td>${r.gender}</td>
                <td class="num">${Utils.ordinal(r.place)}</td><td class="num">${r.teams}</td></tr>`).join('')}
              </tbody></table></div>` : '<div style="color:var(--text-dim);">No completed meets.</div>'}`;
        }).join('') : '<div style="color:var(--text-dim);">Complete a season and your résumé builds here.</div>'}
      </div>`;

    // A retired predecessor's full historical profile, forever.
    el.querySelectorAll('[data-lineage]').forEach((row) => {
      row.addEventListener('click', () => {
        const rec = (game.history.playerCareers || [])[Number(row.dataset.lineage)];
        if (rec) UI.showCoachCard(rec, game, { retired: true });
      });
    });
  }

  /* ================================================================ *
   * GOAT Lists (Update 12, Phase 1): the all-time greats, recalculated
   * every offseason. Top 40 per list. The Coaches page also carries the
   * live national coach rankings and the permanent registry (moved here
   * from the old Coaches tab).
   * ================================================================ */
  function goat(game, el) {
    const GOAT = window.XCD.engine.GOAT;
    const f = goatFilters;

    // Which filters make sense for the current sub-list.
    const hasGender = goatSub === 'athletes' || goatSub === 'teams';
    const hasStatus = goatSub === 'athletes' || goatSub === 'coaches';

    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
        <div class="pill-tabs">
          <button data-goat="athletes" class="${goatSub === 'athletes' ? 'active' : ''}">🏃 Greatest Athletes</button>
          <button data-goat="coaches" class="${goatSub === 'coaches' ? 'active' : ''}">🧢 Greatest Coaches</button>
          <button data-goat="programs" class="${goatSub === 'programs' ? 'active' : ''}">🏫 Greatest Programs</button>
          <button data-goat="teams" class="${goatSub === 'teams' ? 'active' : ''}">🏆 Greatest Teams</button>
        </div>
        <span style="color:var(--text-faint); font-size:12px;">Weighted legacy scores • through ${game.year}</span>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:14px;">
        <input type="text" id="goat-search" class="search-input" placeholder="Search names, schools…" value="${Utils.escapeHtml(f.query)}" style="max-width:210px;">
        <select id="goat-div" class="search-input" style="padding:6px 10px;">
          <option value="">All Divisions</option>
          ${['DI', 'DII', 'DIII'].map((d) => `<option value="${d}" ${f.division === d ? 'selected' : ''}>${DIV_LABELS[d]}</option>`).join('')}
        </select>
        ${hasGender ? `
        <select id="goat-gender" class="search-input" style="padding:6px 10px;">
          <option value="">Men &amp; Women</option>
          <option value="M" ${f.gender === 'M' ? 'selected' : ''}>Men</option>
          <option value="W" ${f.gender === 'W' ? 'selected' : ''}>Women</option>
        </select>` : ''}
        ${hasStatus ? `
        <select id="goat-status" class="search-input" style="padding:6px 10px;">
          <option value="">Active &amp; Retired</option>
          <option value="active" ${f.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="retired" ${f.status === 'retired' ? 'selected' : ''}>Retired</option>
        </select>` : ''}
        ${(f.query || f.division || f.gender || f.status) ? '<button class="btn small" id="goat-clear">✕ Clear Filters</button>' : ''}
      </div>
      <div id="goat-body"></div>`;

    const body = el.querySelector('#goat-body');

    // Filters recompute the ranking live over the FULL historical universe
    // (not just the stored top 40), so "Greatest DIII Women" is a real list.
    const drawBody = () => {
      const q = f.query.trim().toLowerCase();
      const matches = (r, keys) => !q || keys.some((k) => String(r[k] || '').toLowerCase().includes(q));
      const divOk = (r) => !f.division || (r.division || 'DI') === f.division;
      let rows;
      if (goatSub === 'athletes') {
        rows = GOAT.athletes(game).filter((r) => divOk(r) &&
          (!f.gender || r.gender === f.gender) &&
          (!f.status || (f.status === 'active') === (r.kind === 'active')) &&
          matches(r, ['name', 'school']));
        goatAthletes(game, body, rows.slice(0, GOAT.LIST_SIZE));
      } else if (goatSub === 'coaches') {
        rows = GOAT.coaches(game).filter((r) => divOk(r) &&
          (!f.status || (f.status === 'active') === (r.kind === 'active')) &&
          matches(r, ['name', 'school']));
        goatCoaches(game, body, rows.slice(0, GOAT.LIST_SIZE));
      } else if (goatSub === 'programs') {
        rows = GOAT.programs(game).filter((r) => divOk(r) && matches(r, ['name', 'conference']));
        goatPrograms(game, body, rows.slice(0, GOAT.LIST_SIZE));
      } else {
        rows = GOAT.teams(game).filter((r) => divOk(r) &&
          (!f.gender || r.gender === f.gender) &&
          matches(r, ['school', 'coachName']));
        goatTeams(game, body, rows.slice(0, GOAT.LIST_SIZE));
      }
    };
    drawBody();

    el.querySelector('#goat-search').addEventListener('input', (e) => { f.query = e.target.value; drawBody(); });
    el.querySelector('#goat-div').addEventListener('change', (e) => { f.division = e.target.value; drawBody(); });
    const gSel = el.querySelector('#goat-gender');
    if (gSel) gSel.addEventListener('change', (e) => { f.gender = e.target.value; drawBody(); });
    const sSel = el.querySelector('#goat-status');
    if (sSel) sSel.addEventListener('change', (e) => { f.status = e.target.value; drawBody(); });
    const clearBtn = el.querySelector('#goat-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      f.query = ''; f.division = ''; f.gender = ''; f.status = '';
      goat(game, el);
    });

    el.querySelectorAll('[data-goat]').forEach((btn) => {
      btn.addEventListener('click', () => { goatSub = btn.dataset.goat; goat(game, el); });
    });
  }

  function goatAthletes(game, el, rows) {
    el.innerHTML = `
      <div class="card">
        <h2>🐐 Greatest Athletes of All Time</h2>
        <div style="color:var(--text-dim); font-size:12.5px; margin-bottom:8px;">
          National championships dwarf everything else; All-America honors, conference and regional titles,
          meet wins, and longevity fill out the résumé. Active careers keep climbing.
        </div>
        ${rows.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>Athlete</th><th></th><th>School</th><th class="num" title="Individual national titles">NC</th><th class="num" title="Athlete of the Year awards">AoY</th><th class="num" title="All-American selections">AA</th><th class="num" title="Conference titles">Conf</th><th class="num" title="Career meet wins">Wins</th><th class="num">Legacy</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr class="clickable" data-gath="${i}" ${r.schoolId === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : ''}>
                <td>${i + 1}</td>
                <td>${UI.avatar(r, { size: 22 })} <strong>${r.generational ? '⭐ ' : ''}${Utils.escapeHtml(r.name)}</strong> <span style="color:var(--text-faint); font-size:11px;">${r.years === 'active' ? '● active' : Utils.escapeHtml(r.years || '')}</span></td>
                <td>${r.gender}</td>
                <td>${Utils.escapeHtml(r.school)}</td>
                <td class="num">${r.natTitles}</td>
                <td class="num">${r.aoyAwards}</td>
                <td class="num">${r.allAmerican}</td>
                <td class="num">${r.confChamps}</td>
                <td class="num">${r.wins}</td>
                <td class="num"><strong>${r.score}</strong></td>
              </tr>`).join('')}
          </tbody></table></div>`
        : '<div style="color:var(--text-dim);">No careers match the current filters — the first legends appear after a season or two.</div>'}
      </div>`;
    el.querySelectorAll('[data-gath]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const r = rows[Number(tr.dataset.gath)];
        UI.openAthlete(game, r.athleteId, r.name);
      });
    });
  }

  function goatCoaches(game, el, rows) {
    const active = window.XCD.engine.Careers.coachRankings(game).slice(0, 40);
    const registry = (game.history.coachRegistry || []).slice().reverse();

    el.innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        <h2>🐐 Greatest Coaches of All Time</h2>
        <div style="color:var(--text-dim); font-size:12.5px; margin-bottom:8px;">
          National titles are by far the strongest factor — then runner-up finishes, Coach of the Year
          awards, regional and conference titles, top-25 seasons, and career longevity.
        </div>
        ${rows.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>Coach</th><th>School</th><th class="num" title="National titles">NC</th><th class="num" title="National runner-up">RU</th><th class="num" title="Coach of the Year awards">CoY</th><th class="num" title="Conference titles">Conf</th><th class="num" title="Regional titles">Reg</th><th class="num" title="Career winning pct">Win%</th><th class="num">Szn</th><th class="num">Legacy</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr class="clickable" data-gcoach="${i}" ${r.isPlayer ? 'style="background:var(--accent-soft);"' : ''}>
                <td>${i + 1}</td>
                <td>${UI.avatar(r.coachId ? game.getCoach(r.coachId) || r : (r.record || r), { size: 22, outfit: 'suit' })} <strong>${Utils.escapeHtml(r.name)}</strong>${r.isPlayer ? ' (You)' : ''} <span style="color:var(--text-faint); font-size:11px;">${r.years === 'active' ? '● active' : Utils.escapeHtml(r.years || '')}</span></td>
                <td>${Utils.escapeHtml(r.school)}</td>
                <td class="num">${r.natTitles}</td>
                <td class="num">${r.natRunnerUp}</td>
                <td class="num">${r.coy}</td>
                <td class="num">${r.confTitles}</td>
                <td class="num">${r.regTitles}</td>
                <td class="num">${r.winPct}%</td>
                <td class="num">${r.seasons}</td>
                <td class="num"><strong>${r.score}</strong></td>
              </tr>`).join('')}
          </tbody></table></div>`
        : '<div style="color:var(--text-dim);">No coaching careers match the current filters.</div>'}
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h2>National Coach Rankings — Active</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>Coach</th><th>Reputation</th><th>School</th><th class="num">Natl</th><th class="num">Conf</th><th class="num">Best Poll</th></tr></thead>
          <tbody>
            ${active.map((r) => `
              <tr class="clickable" data-coach="${r.coachId}" ${r.isPlayer ? 'style="background:var(--accent-soft);"' : ''}>
                <td>${r.rank}</td>
                <td><strong>${Utils.escapeHtml(r.name)}</strong>${r.isPlayer ? ' (You)' : ''}</td>
                <td>${r.reputation} <span style="color:var(--text-dim); font-size:11.5px;">${Utils.escapeHtml(r.repLabel)}</span></td>
                <td>${Utils.escapeHtml(r.school)}</td>
                <td class="num">${r.natTitles}</td>
                <td class="num">${r.confTitles}</td>
                <td class="num">${r.bestRank < 900 ? '#' + r.bestRank : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>

      <div class="card">
        <h2>Coach Registry — ${registry.length} archived</h2>
        <div style="color:var(--text-dim); font-size:12px; margin-bottom:8px;">
          The permanent record of every coaching career. No coach ever disappears from history —
          every profile, record, and timeline is preserved for as long as the dynasty runs.
        </div>
        <input type="text" id="coach-search" class="search-input" placeholder="Search retired coaches…" style="margin-bottom:10px; max-width:280px;">
        <div id="registry-list">
          ${registry.length ? '' : '<div style="color:var(--text-dim); font-size:13px;">Careers end here — no coach has retired yet.</div>'}
        </div>
      </div>`;

    el.querySelectorAll('[data-gcoach]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const r = rows[Number(tr.dataset.gcoach)];
        if (r.record) UI.showCoachCard(r.record, game, { retired: true });
        else UI.openCoach(game, r.coachId, r.name);
      });
    });
    el.querySelectorAll('[data-coach]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const c = game.getCoach(tr.dataset.coach);
        if (c) UI.showCoachCard(c, game);
      });
    });

    const list = el.querySelector('#registry-list');
    const draw = (q) => {
      const filtered = registry.filter((c) => !q || c.name.toLowerCase().includes(q));
      list.innerHTML = filtered.slice(0, 40).map((c, i) => `
        <div class="attr-row clickable" data-reg="${i}" style="padding:8px 0; align-items:flex-start; cursor:pointer;">
          <span style="min-width:220px;">${UI.avatar(c, { size: 24, outfit: 'suit' })} <strong>${Utils.escapeHtml(c.name)}</strong>${c.isPlayer ? ' (You)' : ''}
            <div style="color:var(--text-dim); font-size:12px;">${Utils.escapeHtml(c.reputationLabel || '')} • ${c.reason === 'retired' ? `retired ${c.year}, age ${c.age}` : `left the profession ${c.year}`}</div>
          </span>
          <span style="font-size:12.5px; color:var(--text-dim); text-align:right;">
            ${c.careerRecord.wins}-${c.careerRecord.losses} (${c.winPct}%) • ${c.careerRecord.nationalTitles} natl • ${c.careerRecord.conferenceTitles} conf • ${c.careerRecord.allAmericans || 0} AAs
            <div>${(c.stints || []).map((s) => `${Utils.escapeHtml(s.school)} '${String(s.startYear).slice(2)}–'${String(s.endYear).slice(2)}`).join(' → ')}</div>
          </span>
        </div>`).join('') || '<div style="color:var(--text-dim); font-size:13px;">No matches.</div>';
      list.querySelectorAll('[data-reg]').forEach((row) => {
        row.addEventListener('click', () => UI.showCoachCard(filtered[Number(row.dataset.reg)], game, { retired: true }));
      });
    };
    draw('');
    el.querySelector('#coach-search').addEventListener('input', (e) => draw(e.target.value.toLowerCase()));
  }

  function goatPrograms(game, el, rows) {
    el.innerHTML = `
      <div class="card">
        <h2>🐐 Greatest Programs of All Time</h2>
        <div style="color:var(--text-dim); font-size:12.5px; margin-bottom:8px;">
          Historical prestige: national championships and runner-up finishes lead, then top-25 seasons,
          conference and regional titles, NCAA appearances, winning percentage, and longevity.
          Programs rise and fall throughout history.
        </div>
        ${rows.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>Program</th><th>Conference</th><th>Div</th><th class="num" title="National titles">NC</th><th class="num" title="National runner-up">RU</th><th class="num" title="Conference titles">Conf</th><th class="num" title="Top-25 final polls">Top25</th><th class="num" title="NCAA appearances">Apps</th><th class="num">Win%</th><th class="num">Legacy</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr class="clickable" data-gprog="${i}" ${r.schoolId === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : ''}>
                <td>${i + 1}</td>
                <td><strong>${Utils.escapeHtml(r.name)}</strong></td>
                <td>${Utils.escapeHtml(r.conference)}</td>
                <td>${DIV_LABELS[r.division] || r.division}</td>
                <td class="num">${r.natTitles}</td>
                <td class="num">${r.natRunnerUp}</td>
                <td class="num">${r.confTitles}</td>
                <td class="num">${r.top25}</td>
                <td class="num">${r.natApps}</td>
                <td class="num">${r.winPct}%</td>
                <td class="num"><strong>${r.score}</strong></td>
              </tr>`).join('')}
          </tbody></table></div>`
        : '<div style="color:var(--text-dim);">No programs match the current filters.</div>'}
      </div>`;
    el.querySelectorAll('[data-gprog]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const s = game.getSchool(rows[Number(tr.dataset.gprog)].schoolId);
        if (s) UI.showSchoolCard(s, game);
      });
    });
  }

  function goatTeams(game, el, rows) {
    el.innerHTML = `
      <div class="card">
        <h2>🐐 Greatest Teams of All Time</h2>
        <div style="color:var(--text-dim); font-size:12.5px; margin-bottom:8px;">
          Only national champions qualify — then dominance decides: team rating, race performance,
          margin of victory, team score, and the strength of the field they beat. Legendary teams,
          not just legendary programs.
        </div>
        ${rows.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>Team</th><th></th><th>Div</th><th>Coach</th><th class="num" title="Average overall of the scoring five">OVR</th><th class="num" title="How the five actually raced">Perf</th><th class="num" title="Margin of victory (points)">Margin</th><th class="num" title="Winning team score">Score</th><th class="num" title="Strength of field">SoS</th><th class="num">Legacy</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr class="clickable" data-gteam="${i}" ${r.schoolId === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : ''}>
                <td>${i + 1}</td>
                <td><strong>${r.year} ${Utils.escapeHtml(r.school)}</strong></td>
                <td>${r.gender}</td>
                <td>${DIV_LABELS[r.division] || r.division}</td>
                <td><span class="clickable" data-team-coach="${i}" style="color:var(--accent-hover);">${Utils.escapeHtml(r.coachName || '—')}</span></td>
                <td class="num">${r.teamOverall}</td>
                <td class="num">${r.teamPerformance}</td>
                <td class="num">${r.margin ?? '—'}</td>
                <td class="num">${r.teamScore ?? '—'}</td>
                <td class="num">${r.sos}</td>
                <td class="num"><strong>${r.score}</strong></td>
              </tr>`).join('')}
          </tbody></table></div>`
        : '<div style="color:var(--text-dim);">No championship teams match the current filters — the first title team starts the list.</div>'}
      </div>`;
    // A historical team opens the roster that ACTUALLY won that season —
    // preserved as it was, never the current roster (Phase 10).
    el.querySelectorAll('[data-gteam]').forEach((tr) => {
      tr.addEventListener('click', () => {
        UI.showChampionTeamCard(game, rows[Number(tr.dataset.gteam)]);
      });
    });
    el.querySelectorAll('[data-team-coach]').forEach((sp) => {
      sp.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = rows[Number(sp.dataset.teamCoach)];
        UI.openCoach(game, r.coachId, r.coachName);
      });
    });
  }

  /* ================================================================ *
   * Legacy Leaderboards (Update 12, Phase 2): every historical measure,
   * sortable by every column, with search + division + conference filters.
   * ================================================================ */
  function boards(game, el) {
    const GOAT = window.XCD.engine.GOAT;
    const confDiv = confDivisions(game);
    const conferences = Object.keys(confDiv).sort();

    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
        <div class="pill-tabs">
          <button data-board="programs" class="${boardSub === 'programs' ? 'active' : ''}">Programs</button>
          <button data-board="coaches" class="${boardSub === 'coaches' ? 'active' : ''}">Coaches</button>
          <button data-board="athletes" class="${boardSub === 'athletes' ? 'active' : ''}">Athletes</button>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input type="text" id="board-search" class="search-input" placeholder="Search…" value="${Utils.escapeHtml(boardFilters.query)}" style="max-width:190px;">
          <select id="board-div" class="search-input" style="padding:6px 10px;">
            <option value="">All Divisions</option>
            ${['DI', 'DII', 'DIII'].map((d) => `<option value="${d}" ${boardFilters.division === d ? 'selected' : ''}>${DIV_LABELS[d]}</option>`).join('')}
          </select>
          <select id="board-conf" class="search-input" style="padding:6px 10px; max-width:190px;">
            <option value="">All Conferences</option>
            ${conferences.map((c) => `<option value="${Utils.escapeHtml(c)}" ${boardFilters.conference === c ? 'selected' : ''}>${Utils.escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card">
        <h2 style="margin-bottom:8px;">${{ programs: '🏫 Program', coaches: '🧢 Coach', athletes: '🏃 Athlete' }[boardSub]} Leaderboard — All Time</h2>
        <div style="color:var(--text-faint); font-size:11.5px; margin-bottom:8px;">Click any column to sort • click any row to open the profile</div>
        <div id="board-table"></div>
      </div>`;

    const tableEl = el.querySelector('#board-table');

    // Build the full row set once; the filter bar narrows it in place.
    let allRows, config;
    if (boardSub === 'programs') {
      allRows = GOAT.programs(game);
      config = {
        columns: [
          { key: 'name', label: 'Program' },
          { key: 'conference', label: 'Conference' },
          { key: 'division', label: 'Div' },
          { key: 'natTitles', label: 'NC', numeric: true },
          { key: 'natRunnerUp', label: 'RU', numeric: true },
          { key: 'confTitles', label: 'Conf', numeric: true },
          { key: 'regTitles', label: 'Reg', numeric: true },
          { key: 'winPct', label: 'Win%', numeric: true, render: (r) => `${r.winPct}%` },
          { key: 'wins', label: 'Wins', numeric: true },
          { key: 'top25', label: 'Top25', numeric: true },
          { key: 'natApps', label: 'Apps', numeric: true },
          { key: 'streak', label: 'Streak', numeric: true },
          { key: 'seasons', label: 'Szn', numeric: true },
          { key: 'score', label: 'Legacy', numeric: true, render: (r) => `<strong>${r.score}</strong>` }
        ],
        rows: allRows, defaultSort: 'score', defaultDir: 'desc',
        searchKeys: ['name', 'conference'],
        onRowClick: (r) => { const s = game.getSchool(r.schoolId); if (s) UI.showSchoolCard(s, game); }
      };
    } else if (boardSub === 'coaches') {
      allRows = GOAT.coaches(game).map((r) => ({
        ...r,
        division: r.record
          ? ((r.record.stints || []).length ? (r.record.stints[r.record.stints.length - 1].division || 'DI') : 'DI')
          : ((game.getSchool(r.schoolId) || {}).division || 'DI'),
        conference: (game.getSchool(r.schoolId) || {}).conference || ''
      }));
      config = {
        columns: [
          { key: 'name', label: 'Coach', render: (r) => `<strong>${Utils.escapeHtml(r.name)}</strong>${r.isPlayer ? ' (You)' : ''} <span style="color:var(--text-faint); font-size:11px;">${r.years === 'active' ? '●' : Utils.escapeHtml(r.years)}</span>` },
          { key: 'school', label: 'School' },
          { key: 'natTitles', label: 'NC', numeric: true },
          { key: 'natRunnerUp', label: 'RU', numeric: true },
          { key: 'coy', label: 'CoY', numeric: true },
          { key: 'confTitles', label: 'Conf', numeric: true },
          { key: 'regTitles', label: 'Reg', numeric: true },
          { key: 'top25', label: 'Top25', numeric: true },
          { key: 'natApps', label: 'Apps', numeric: true },
          { key: 'winPct', label: 'Win%', numeric: true, render: (r) => `${r.winPct}%` },
          { key: 'wins', label: 'Wins', numeric: true },
          { key: 'seasons', label: 'Szn', numeric: true },
          { key: 'score', label: 'Legacy', numeric: true, render: (r) => `<strong>${r.score}</strong>` }
        ],
        rows: allRows, defaultSort: 'score', defaultDir: 'desc',
        searchKeys: ['name', 'school'],
        onRowClick: (r) => {
          if (r.record) UI.showCoachCard(r.record, game, { retired: true });
          else UI.openCoach(game, r.coachId, r.name);
        }
      };
    } else {
      allRows = GOAT.athletes(game);
      config = {
        columns: [
          { key: 'name', label: 'Athlete', render: (r) => `<strong>${r.generational ? '⭐ ' : ''}${Utils.escapeHtml(r.name)}</strong> <span style="color:var(--text-faint); font-size:11px;">${r.years === 'active' ? '●' : Utils.escapeHtml(r.years || '')}</span>` },
          { key: 'gender', label: '' },
          { key: 'school', label: 'School' },
          { key: 'natTitles', label: 'NC', numeric: true },
          { key: 'natRunnerUp', label: 'RU', numeric: true },
          { key: 'aoyAwards', label: 'AoY', numeric: true },
          { key: 'allAmerican', label: 'AA', numeric: true },
          { key: 'confChamps', label: 'Conf', numeric: true },
          { key: 'regChamps', label: 'Reg', numeric: true },
          { key: 'allConference', label: 'AllC', numeric: true },
          { key: 'wins', label: 'Wins', numeric: true },
          { key: 'winPct', label: 'Win%', numeric: true, render: (r) => `${r.winPct}%` },
          { key: 'seasons', label: 'Szn', numeric: true },
          { key: 'score', label: 'Legacy', numeric: true, render: (r) => `<strong>${r.score}</strong>` }
        ],
        rows: allRows, defaultSort: 'score', defaultDir: 'desc',
        searchKeys: ['name', 'school'],
        onRowClick: (r) => UI.openAthlete(game, r.athleteId, r.name)
      };
    }

    const applyFilters = () => allRows.filter((r) => {
      if (boardFilters.division && (r.division || 'DI') !== boardFilters.division) return false;
      if (boardFilters.conference && (r.conference || '') !== boardFilters.conference) return false;
      return true;
    });
    config.rows = applyFilters();
    const table = UI.renderSortableTable(tableEl, config);
    if (boardFilters.query) table.setQuery(boardFilters.query);

    el.querySelector('#board-search').addEventListener('input', (e) => {
      boardFilters.query = e.target.value;
      table.setQuery(boardFilters.query);
    });
    el.querySelector('#board-div').addEventListener('change', (e) => {
      boardFilters.division = e.target.value;
      table.setRows(applyFilters());
    });
    el.querySelector('#board-conf').addEventListener('change', (e) => {
      boardFilters.conference = e.target.value;
      table.setRows(applyFilters());
    });
    el.querySelectorAll('[data-board]').forEach((btn) => {
      btn.addEventListener('click', () => { boardSub = btn.dataset.board; boards(game, el); });
    });
  }

  /*
   * Champions (Update 4, Part 5): national team + individual champions for
   * D1/D2/D3, plus conference champions grouped by division → conference.
   * A division filter keeps the page readable; conference lists collapse.
   * Update 12: a year filter jumps straight to any season in history.
   */
  function champions(game, el) {
    const natl = game.history.nationalChampions || {};
    const conf = game.history.conferenceChampions || {};
    const confIndiv = game.history.confIndivChampions || {};
    const confMeta = game.history.confChampMeta || {};
    const regional = game.history.regionalChampions || {};
    const regMeta = game.history.regChampMeta || {};
    const regIndiv = game.history.regIndivChampions || {};
    const confDiv = confDivisions(game);
    // Every school name → division, so old regional ledgers (which carry only
    // the champion's name) still land in the right division's archive.
    const schoolDiv = {};
    Object.values(game.world.schools).forEach((s) => { schoolDiv[s.name] = s.division || 'DI'; });
    const Legacy = window.XCD.engine.Legacy;
    // The coach responsible for a championship entry: the stamped name when
    // recorded, otherwise resolved from the program's head-coaching ledger.
    const coachFor = (schoolName, year, stamped, schoolId) => {
      if (stamped) return stamped;
      const sid = schoolId || (Object.values(game.world.schools).find((s) => s.name === schoolName) || {}).id;
      return sid ? Legacy.coachForSchoolYear(game, sid, year) : '';
    };
    const coachTag = (name) => name
      ? ` <span style="color:var(--text-faint); font-size:11.5px;">🧢 <span class="clickable" data-coach="" data-coach-name="${Utils.escapeHtml(name)}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(name)}</span></span>`
      : '';
    let years = [...new Set([...Object.keys(natl), ...Object.keys(conf), ...Object.keys(regional)])].sort((a, b) => b - a);
    if (champYear) years = years.filter((y) => String(y).includes(champYear));
    const ft = window.XCD.engine.Races.formatTime;

    const filterBar = `
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
        <div class="pill-tabs">
          ${['DI', 'DII', 'DIII'].map((d) => `<button data-champ-div="${d}" class="${champDiv === d ? 'active' : ''}">${DIV_LABELS[d]}</button>`).join('')}
        </div>
        <input type="text" id="champ-year" class="search-input" placeholder="Filter year… e.g. 2031" value="${Utils.escapeHtml(champYear)}" style="max-width:170px;">
      </div>`;

    const body = !years.length ? '<div class="card" style="color:var(--text-dim);">No championships match the current filters.</div>'
      : years.slice(0, 60).map((year) => {
        const n = natl[year] || {};
        // National team + individual champions for the selected division.
        const natBlock = ['M', 'W'].map((g) => {
          const rec = n[natKey(champDiv, g)];
          if (!rec) return '';
          const teamCoach = coachFor(rec.team, year, rec.coach, rec.teamId);
          const indivCoach = coachFor(rec.individualSchool, year, rec.individualCoach, rec.individualSchoolId);
          return `
            <div class="attr-row">
              <span>🏆 ${g === 'M' ? "Men's" : "Women's"} National Champions:
                <strong class="clickable-school" data-school="${rec.teamId || ''}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(rec.team)}</strong>${coachTag(teamCoach)}</span>
              <span style="color:var(--text-dim);">🥇 <span class="${rec.individualId ? 'clickable' : ''}" ${rec.individualId ? `data-ath="${rec.individualId}" data-ath-name="${Utils.escapeHtml(rec.individual)}" style="cursor:pointer; color:var(--accent-hover);"` : ''}>${Utils.escapeHtml(rec.individual)}</span> (<span class="${rec.individualSchoolId ? 'clickable' : ''}" ${rec.individualSchoolId ? `data-school="${rec.individualSchoolId}" style="cursor:pointer;"` : ''}>${Utils.escapeHtml(rec.individualSchool)}</span>)${rec.individualTime ? ' — ' + ft(rec.individualTime) : ''}${coachTag(indivCoach)}</span>
            </div>`;
        }).join('');

        // Regional champions in this division (Archive fix): every region's
        // team champion — with the coach responsible — plus the individual
        // regional champions, right alongside conference and national titles.
        const r = regional[year] || {};
        const rm = regMeta[year] || {};
        const ri = regIndiv[year] || {};
        const regionNames = [...new Set(Object.keys(r).map((k) => k.slice(0, k.lastIndexOf('-'))))]
          .filter((rg) => ['M', 'W'].some((g) => {
            const m = rm[`${champDiv}:${rg}-${g}`];
            if (m) return true;
            return (schoolDiv[r[`${rg}-${g}`]] || 'DI') === champDiv;
          }))
          .sort();
        const regBlock = regionNames.length ? `
          <details style="margin-top:10px;">
            <summary style="cursor:pointer; color:var(--text-dim); font-size:13px;">Regional Champions (${regionNames.length} regions)</summary>
            <div style="margin-top:8px;">
              ${regionNames.map((rg) => {
                const teamLine = (g) => {
                  const m = rm[`${champDiv}:${rg}-${g}`];
                  const nameOnly = r[`${rg}-${g}`];
                  const champName = m ? m.school : nameOnly;
                  if (!champName) return '';
                  if (!m && (schoolDiv[champName] || 'DI') !== champDiv) return '';
                  const coach = coachFor(champName, year, m && m.coach, m && m.schoolId);
                  return `<div style="font-size:12.5px;">${g}: <strong>${Utils.escapeHtml(champName)}</strong>${coachTag(coach)}</div>`;
                };
                const indivLine = (g) => {
                  const rec = ri[`${rg}-${g}`];
                  if (!rec) return '';
                  if ((schoolDiv[rec.school] || 'DI') !== champDiv) return '';
                  return `<div style="color:var(--text-faint); font-size:11.5px;">🥇${g}: <span class="clickable" data-ath="${rec.athleteId}" data-ath-name="${Utils.escapeHtml(rec.name)}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(rec.name)}</span> (${Utils.escapeHtml(rec.school)})${rec.coach ? ` — 🧢 ${Utils.escapeHtml(rec.coach)}` : ''}</div>`;
                };
                return `
                <div class="attr-row" style="align-items:flex-start;">
                  <span class="attr-name">🗺 ${Utils.escapeHtml(rg)}</span>
                  <span style="text-align:right;">${teamLine('M')}${teamLine('W')}${indivLine('M')}${indivLine('W')}</span>
                </div>`;
              }).join('')}
            </div>
          </details>` : '';

        // Conference champions in this division, grouped by conference.
        const c = conf[year] || {};
        const ci = confIndiv[year] || {};
        const cm = confMeta[year] || {};
        const confNames = [...new Set(Object.keys(c).map((k) => k.slice(0, k.lastIndexOf('-'))))]
          .filter((name) => (confDiv[name] || 'DI') === champDiv)
          .sort();
        const confBlock = confNames.length ? `
          <details style="margin-top:10px;">
            <summary style="cursor:pointer; color:var(--text-dim); font-size:13px;">Conference Champions (${confNames.length})</summary>
            <div style="margin-top:8px;">
              ${confNames.map((name) => {
                const teamBit = (g) => {
                  const champName = c[`${name}-${g}`];
                  if (!champName) return '';
                  const m = cm[`${name}-${g}`];
                  const coach = coachFor(champName, year, m && m.coach, m && m.schoolId);
                  return `${g === 'W' ? ' · ' : ''}${g}: ${Utils.escapeHtml(champName)}${coachTag(coach)}`;
                };
                const indivLine = (g) => {
                  const rec = ci[`${name}-${g}`];
                  if (!rec) return '';
                  return ` <span style="color:var(--text-faint); font-size:11.5px;">🥇${g}: <span class="clickable" data-ath="${rec.athleteId}" data-ath-name="${Utils.escapeHtml(rec.name)}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(rec.name)}</span></span>`;
                };
                return `
                <div class="attr-row">
                  <span class="attr-name">${Utils.escapeHtml(name)}</span>
                  <span style="font-size:12.5px;">${teamBit('M')}${teamBit('W')}${indivLine('M')}${indivLine('W')}</span>
                </div>`;
              }).join('')}
            </div>
          </details>` : '';

        if (!natBlock && !confBlock && !regBlock) return '';
        return `<div class="card" style="margin-bottom:16px;"><h2>${year} — ${window.XCD.data.divisionFor(champDiv).label}</h2>${natBlock}${regBlock}${confBlock}</div>`;
      }).join('') || '<div class="card" style="color:var(--text-dim);">No championships in this division yet.</div>';

    el.innerHTML = filterBar + body;

    el.querySelectorAll('[data-champ-div]').forEach((btn) => {
      btn.addEventListener('click', () => { champDiv = btn.dataset.champDiv; champions(game, el); });
    });
    const yearInput = el.querySelector('#champ-year');
    yearInput.addEventListener('change', () => { champYear = yearInput.value.trim(); champions(game, el); });
    wireProfileClicks(game, el);
  }

  // Shared click wiring for champions/awards profile navigation. Every name
  // resolves — live athletes open the player card, graduated legends open
  // the legend card, coaches fall through to the registry (Phase 3).
  function wireProfileClicks(game, el) {
    el.querySelectorAll('[data-school]').forEach((n) => {
      if (!n.dataset.school) return;
      n.addEventListener('click', (e) => { e.stopPropagation(); const s = game.getSchool(n.dataset.school); if (s && UI.showSchoolCard) UI.showSchoolCard(s, game); });
    });
    el.querySelectorAll('[data-ath]').forEach((n) => {
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.openAthlete(game, n.dataset.ath, n.dataset.athName || n.textContent.trim());
      });
    });
    el.querySelectorAll('[data-coach]').forEach((n) => {
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.openCoach(game, n.dataset.coach, n.dataset.coachName || n.textContent.trim());
      });
    });
  }

  /*
   * Awards (Update 4, Part 6): national awards for D1/D2/D3 and conference
   * awards for every conference. Division + year filters keep it browsable.
   */
  function awards(game, el) {
    const A = game.history.awards || {};
    let years = Object.keys(A).sort((a, b) => b - a);
    if (awardYear) years = years.filter((y) => String(y).includes(awardYear));

    const filterBar = `
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
        <div class="pill-tabs">
          ${['DI', 'DII', 'DIII'].map((d) => `<button data-award-div="${d}" class="${awardDiv === d ? 'active' : ''}">${DIV_LABELS[d]}</button>`).join('')}
        </div>
        <input type="text" id="award-year" class="search-input" placeholder="Filter year…" value="${Utils.escapeHtml(awardYear)}" style="max-width:170px;">
      </div>`;

    const nameSpan = (x) => x ? `<span class="${x.athleteId ? 'clickable' : ''}" ${x.athleteId ? `data-ath="${x.athleteId}" data-ath-name="${Utils.escapeHtml(x.name)}" style="cursor:pointer; color:var(--accent-hover);"` : ''}>${Utils.escapeHtml(x.name)}</span> — ${Utils.escapeHtml(x.school)}` : '';
    const coachSpan = (x) => x ? `<span class="clickable" ${x.coachId ? `data-coach="${x.coachId}"` : 'data-coach=""'} data-coach-name="${Utils.escapeHtml(x.name)}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(x.name)}</span> — ${Utils.escapeHtml(x.school)}` : '';

    const body = !years.length ? '<div class="card" style="color:var(--text-dim);">Awards are handed out after each NCAA Championships.</div>'
      : years.slice(0, 60).map((year) => {
        // Prefer the per-division slate; fall back to legacy top-level M/W.
        const slate = ((A[year].divisions || {})[awardDiv]) || (awardDiv === 'DI' ? A[year] : null);
        if (!slate) return '';
        const natBlock = (gender) => {
          const g = slate[gender];
          if (!g) return '';
          return `
            <h3 style="margin-top:10px;">${gender === 'M' ? 'Men' : 'Women'}</h3>
            ${g.runnerOfYear ? `<div class="attr-row"><span class="attr-name">Runner of the Year</span><span>${nameSpan(g.runnerOfYear)}</span></div>` : ''}
            ${g.freshmanOfYear ? `<div class="attr-row"><span class="attr-name">Freshman of the Year</span><span>${nameSpan(g.freshmanOfYear)}</span></div>` : ''}
            ${g.coachOfYear ? `<div class="attr-row"><span class="attr-name">Coach of the Year</span><span>${coachSpan(g.coachOfYear)}</span></div>` : ''}
            ${g.allAmericans && g.allAmericans.length ? `<div class="attr-row"><span class="attr-name">All-Americans</span><span style="font-size:12px; color:var(--text-dim);">${g.allAmericans.slice(0, 10).map((x) => `<span class="clickable" data-ath="${x.athleteId || ''}" data-ath-name="${Utils.escapeHtml(x.name)}" style="cursor:pointer;">${Utils.escapeHtml(x.name)}</span>`).join(', ')}${g.allAmericans.length > 10 ? '…' : ''}</span></div>` : ''}
            ${g.academicAllAmericans && g.academicAllAmericans.length ? `<div class="attr-row"><span class="attr-name">Academic All-Americans</span><span style="font-size:12px; color:var(--text-dim);">${g.academicAllAmericans.slice(0, 5).map((x) => `<span class="clickable" data-ath="${x.athleteId || ''}" data-ath-name="${Utils.escapeHtml(x.name)}" style="cursor:pointer;">${Utils.escapeHtml(x.name)}</span>`).join(', ')}</span></div>` : ''}`;
        };

        // Conference awards for every conference in this division.
        const confs = slate.conferences || {};
        const confNames = Object.keys(confs).sort();
        const confBlock = confNames.length ? `
          <details style="margin-top:12px;">
            <summary style="cursor:pointer; color:var(--text-dim); font-size:13px;">Conference Awards (${confNames.length})</summary>
            <div style="margin-top:8px;">
              ${confNames.map((conf) => {
                const cb = confs[conf];
                const line = (gender) => {
                  const g = cb[gender]; if (!g) return '';
                  const bits = [];
                  if (g.runnerOfYear) bits.push(`RoY: ${nameSpan(g.runnerOfYear)}`);
                  if (g.freshmanOfYear) bits.push(`FoY: ${nameSpan(g.freshmanOfYear)}`);
                  if (g.coachOfYear) bits.push(`CoY: ${coachSpan(g.coachOfYear)}`);
                  return bits.length ? `<div style="font-size:12px; color:var(--text-dim); margin-left:8px;">${gender}: ${bits.join(' &nbsp;·&nbsp; ')}</div>` : '';
                };
                return `<div style="margin-bottom:8px;"><strong style="font-size:12.5px;">${Utils.escapeHtml(conf)}</strong>${line('M')}${line('W')}</div>`;
              }).join('')}
            </div>
          </details>` : '';

        if (!slate.M && !slate.W && !confNames.length) return '';
        return `<div class="card" style="margin-bottom:16px;"><h2>${year} Awards — ${window.XCD.data.divisionFor(awardDiv).label}</h2>${natBlock('M')}${natBlock('W')}${confBlock}</div>`;
      }).join('') || '<div class="card" style="color:var(--text-dim);">No awards recorded for this division yet.</div>';

    el.innerHTML = filterBar + body;

    el.querySelectorAll('[data-award-div]').forEach((btn) => {
      btn.addEventListener('click', () => { awardDiv = btn.dataset.awardDiv; awards(game, el); });
    });
    const yearInput = el.querySelector('#award-year');
    yearInput.addEventListener('change', () => { awardYear = yearInput.value.trim(); awards(game, el); });
    wireProfileClicks(game, el);
  }

  function records(game, el) {
    const R = game.history.records || {};
    const keys = Object.keys(R).sort();
    el.innerHTML = `
      <div class="card">
        <h2>All-Time National Records</h2>
        ${keys.length ? keys.map((k) => {
          const r = R[k];
          return `<div class="attr-row">
            <span class="attr-name">${k.replace('M-', "Men's ").replace('W-', "Women's ")}</span>
            <span><strong>${window.XCD.engine.Races.formatTime(r.time)}</strong> —
              <span class="clickable" data-ath="${r.athleteId || ''}" data-ath-name="${Utils.escapeHtml(r.name)}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(r.name)}</span>,
              <span class="${r.schoolId ? 'clickable' : ''}" ${r.schoolId ? `data-school="${r.schoolId}" style="cursor:pointer;"` : ''}>${Utils.escapeHtml(r.school)}</span> (${r.year})</span>
          </div>`;
        }).join('') : '<div style="color:var(--text-dim);">Records will be set once racing begins.</div>'}
      </div>`;
    wireProfileClicks(game, el);
  }

  /*
   * Legends (Parts 10 & 12.5): generational talents and decorated alumni,
   * badges intact, forever. Every name opens the full legend profile.
   */
  function legends(game, el) {
    const gens = (game.history.generational || []).slice().reverse();
    const alumni = (game.history.alumni || []).slice().reverse();

    el.innerHTML = `
      ${gens.length ? `
      <div class="card" style="margin-bottom:16px;">
        <h2>⭐ Generational Talents</h2>
        <div style="color:var(--text-dim); font-size:12.5px; margin-bottom:8px;">
          Once-in-a-decade prospects whose recruitments stopped the sport.
        </div>
        ${gens.map((g, gi) => {
          const active = game.world.athletes[g.athleteId];
          const alum = alumni.find((a) => a.generational && a.name === g.name);
          const badges = active
            ? window.XCD.engine.Legacy.badgesFor(active)
            : (alum ? alum.badges : []);
          return `
          <div class="attr-row clickable" data-gen="${gi}" style="padding:8px 0; align-items:flex-start; cursor:pointer;">
            <span><strong>⭐ ${Utils.escapeHtml(g.name)}</strong> <span style="color:var(--text-dim); font-size:12px;">(${g.gender}) ${Utils.escapeHtml(g.school)} • Class of ${g.classYear}${active ? ' • active' : ''}</span></span>
            <span style="font-size:12px; color:var(--text-dim);">${badges.filter((b) => b.key !== 'generational').map((b) => `${b.icon}×${b.years.length}`).join(' ') || 'the story is still being written'}</span>
          </div>`;
        }).join('')}
      </div>` : ''}

      <div class="card">
        <h2>Decorated Alumni — ${alumni.length}</h2>
        <input type="text" id="alum-search" class="search-input" placeholder="Search alumni…" style="margin-bottom:10px; max-width:280px;">
        <div id="alum-list"></div>
      </div>`;

    el.querySelectorAll('[data-gen]').forEach((row) => {
      row.addEventListener('click', () => {
        const g = gens[Number(row.dataset.gen)];
        UI.openAthlete(game, g.athleteId, g.name);
      });
    });

    const list = el.querySelector('#alum-list');
    const draw = (q) => {
      const filtered = alumni.filter((a) => !q || a.name.toLowerCase().includes(q) || (a.school || '').toLowerCase().includes(q));
      list.innerHTML = filtered.slice(0, 50).map((a, i) => `
        <div class="attr-row clickable" data-alum="${i}" style="padding:7px 0; cursor:pointer;">
          <span><strong>${a.generational ? '⭐ ' : ''}${Utils.escapeHtml(a.name)}</strong>
            <span style="color:var(--text-dim); font-size:12px;">(${a.gender}) ${Utils.escapeHtml(a.school)} '${String(a.gradYear).slice(2)}</span></span>
          <span style="font-size:12.5px;">${a.badges.filter((b) => b.key !== 'generational').map((b) => `<span title="${b.label}: ${b.years.join(', ')}">${b.icon} ${b.years.join(' ')}</span>`).join(' &nbsp; ') || '<span style="color:var(--text-dim);">career winner</span>'}</span>
        </div>`).join('') || '<div style="color:var(--text-dim); font-size:13px;">Decorated careers will be remembered here.</div>';
      list.querySelectorAll('[data-alum]').forEach((row) => {
        row.addEventListener('click', () => UI.showLegendCard(filtered[Number(row.dataset.alum)], game));
      });
    };
    draw('');
    el.querySelector('#alum-search').addEventListener('input', (e) => draw(e.target.value.toLowerCase()));
  }

  function hof(game, el) {
    const list = (game.history.hallOfFame || []).slice().sort((a, b) => b.score - a.score);
    el.innerHTML = `
      <div class="card">
        <h2>Hall of Fame — ${list.length} inductees</h2>
        <input type="text" id="hof-search" class="search-input" placeholder="Search legends or schools…" style="margin-bottom:10px; max-width:280px;">
        <div id="hof-table"></div>
      </div>`;

    const tableEl = el.querySelector('#hof-table');
    if (!list.length) {
      tableEl.innerHTML = '<div style="color:var(--text-dim);">Legendary careers end up here. Nobody has earned a plaque yet.</div>';
      return;
    }
    const table = UI.renderSortableTable(tableEl, {
      columns: [
        { key: 'name', label: 'Legend', render: (r) => `${UI.avatar(r, { size: 24, outfit: 'jersey' })} <strong>${r.generational ? '⭐ ' : ''}${Utils.escapeHtml(r.name)}</strong>` },
        { key: 'gender', label: '' },
        { key: 'school', label: 'School' },
        { key: 'wins', label: 'Wins', numeric: true, sortValue: (r) => r.stats.wins, render: (r) => r.stats.wins },
        { key: 'top5', label: 'Top-5s', numeric: true, sortValue: (r) => r.stats.top5, render: (r) => r.stats.top5 },
        { key: 'allAmerican', label: 'All-Am', numeric: true, sortValue: (r) => r.stats.allAmerican, render: (r) => r.stats.allAmerican },
        { key: 'natChamp', label: 'Natl Titles', numeric: true, sortValue: (r) => r.stats.natChamp, render: (r) => r.stats.natChamp },
        { key: 'legacyScore', label: 'Legacy', numeric: true, sortValue: (r) => r.legacyScore ?? r.score, render: (r) => `<strong>${r.legacyScore ?? r.score}</strong>` },
        { key: 'inducted', label: 'Inducted', numeric: true }
      ],
      rows: list, defaultSort: 'legacyScore', defaultDir: 'desc',
      searchKeys: ['name', 'school'],
      onRowClick: (r) => UI.openAthlete(game, r.athleteId, r.name)
    });
    el.querySelector('#hof-search').addEventListener('input', (e) => table.setQuery(e.target.value));
  }

  UI.screens.history = { render };
})();
