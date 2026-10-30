/*
 * World screen: browse every school, athlete, and coach in the game. Schools
 * list by division and, within each division, by poll rank; athletes and
 * coaches are searchable by name, school, conference, or hometown.
 *
 * NOTE on the filters: WebKit (Safari) can crash if the <select> element is
 * destroyed synchronously while its native dropdown is still dismissing. So a
 * filter change must never rebuild the whole screen — only the table body is
 * redrawn, and only after the event unwinds. (Switching views rebuilds the
 * screen, but that's a button tap, never a select.)
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const D = window.XCD.data;

  const VIEWS = [['schools', 'Schools'], ['athletes', 'Athletes'], ['coaches', 'Coaches']];
  const DIV_ORDER = { DI: 0, DII: 1, DIII: 2 };

  let view = 'schools';
  let conferenceFilter = 'All';
  let divisionFilter = 'All';
  let genderFilter = 'All'; // athletes view only

  function teamStrength(game, school, gender) {
    const roster = game.getRoster(school.id, gender)
      .sort((a, b) => b.currentOverall - a.currentOverall)
      .slice(0, 7);
    return roster.length ? Math.round(Utils.average(roster.map((a) => a.currentOverall))) : 0;
  }

  // Division first, then poll rank within it — unranked programs follow the
  // ranked ones, strongest squad first.
  const rankKey = (rank, strength) => rank || (200 - strength);
  const divIdx = (div) => DIV_ORDER[div] ?? 9;

  const passesFilters = (s) =>
    (divisionFilter === 'All' || (s.division || 'DI') === divisionFilter) &&
    (conferenceFilter === 'All' || s.conference === conferenceFilter);

  // A school's name with its kit colors — used by every view.
  const schoolCell = (school, game, sub) => school ? `
    <span class="school-cell">${UI.kitSwatch(school, 18)}
      <span><span class="sc-name">${Utils.escapeHtml(school.name)}</span>${school.id === game.playerSchoolId ? ' <span style="color:var(--accent);">★</span>' : ''}${sub ? `<div class="sc-sub">${sub}</div>` : ''}</span>
    </span>` : '<span style="color:var(--text-faint);">—</span>';

  const rankTitle = (row, label) => row
    ? `${label} poll: #${row.rank} of ${row.divisionSize}${row.prevRank ? ` (last poll #${row.prevRank})` : ''}`
    : `${label} poll: unranked`;

  /* ---------------- Schools ---------------- */
  function schoolRows(game, schools) {
    return schools.filter(passesFilters).map((s) => {
      const division = s.division || 'DI';
      const pollM = UI.pollRow(game, s.id, 'M');
      const pollW = UI.pollRow(game, s.id, 'W');
      const strengthM = teamStrength(game, s, 'M');
      const strengthW = teamStrength(game, s, 'W');
      return {
        school: s,
        name: s.name,
        mascot: s.mascot || '',
        conference: s.conference,
        division,
        state: s.state,
        prestige: s.prestige,
        facilities: s.facilitiesOverall,
        strengthM,
        strengthW,
        pollM,
        pollW,
        rankM: pollM ? pollM.rank : null,
        rankW: pollW ? pollW.rank : null,
        keyM: divIdx(division) * 1000 + rankKey(pollM && pollM.rank, strengthM),
        keyW: divIdx(division) * 1000 + rankKey(pollW && pollW.rank, strengthW),
        coachName: game.getCoach(s.coachId)?.fullName || 'Vacant'
      };
    });
  }

  function schoolTable(game, el, rows) {
    return UI.renderSortableTable(el, {
      rows,
      cardsOnDesktop: false,
      defaultSort: 'division',
      defaultDir: 'asc',
      searchKeys: ['name', 'mascot', 'conference', 'state', 'coachName'],
      rowClass: (r) => (r.school.id === game.playerSchoolId ? 'mine' : ''),
      onRowClick: (row) => UI.showSchoolCard(row.school, game),
      emptyMessage: 'No schools match these filters.',
      mobileCard: (r) => `
        <div class="m-head">
          ${UI.kitSwatch(r.school, 26)}
          <div class="m-title">${Utils.escapeHtml(r.name)}${r.school.id === game.playerSchoolId ? ' <span style="color:var(--accent);">★</span>' : ''}
            <div class="m-sub">${r.division} • ${Utils.escapeHtml(r.conference)} • ${r.state}</div>
          </div>
          <div class="m-badge">${UI.ratingBadge(r.prestige)}<div class="m-sub">Prestige</div></div>
        </div>
        <div class="m-stats">
          <div class="m-stat"><div class="k">Men</div><div class="v">${UI.rankChip(r.rankM)} ${UI.ratingBadge(r.strengthM)}</div></div>
          <div class="m-stat"><div class="k">Women</div><div class="v">${UI.rankChip(r.rankW)} ${UI.ratingBadge(r.strengthW)}</div></div>
          <div class="m-stat"><div class="k">Coach</div><div class="v" style="font-size:12px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${Utils.escapeHtml(r.coachName)}</div></div>
        </div>`,
      columns: [
        // Div sorts by division, then the men's poll, then the women's.
        { key: 'division', label: 'Div', sortValue: (r) => r.keyM * 1000 + (r.keyW % 1000), render: (r) => `<span class="div-chip">${r.division}</span>` },
        { key: 'rankM', label: 'M Rank', align: 'center', sortValue: (r) => r.keyM, render: (r) => UI.rankChip(r.rankM, { title: rankTitle(r.pollM, "Men's") }) },
        { key: 'rankW', label: 'W Rank', align: 'center', sortValue: (r) => r.keyW, render: (r) => UI.rankChip(r.rankW, { title: rankTitle(r.pollW, "Women's") }) },
        { key: 'name', label: 'School', grow: true, render: (r) => schoolCell(r.school, game, Utils.escapeHtml(r.mascot)) },
        { key: 'conference', label: 'Conference' },
        { key: 'state', label: 'State' },
        { key: 'prestige', label: 'Prestige', numeric: true, render: (r) => UI.ratingBadge(r.prestige) },
        { key: 'strengthM', label: 'Men OVR', numeric: true, render: (r) => UI.ratingBadge(r.strengthM) },
        { key: 'strengthW', label: 'Women OVR', numeric: true, render: (r) => UI.ratingBadge(r.strengthW) },
        { key: 'facilities', label: 'Facilities', numeric: true },
        { key: 'coachName', label: 'Head Coach' }
      ]
    });
  }

  /* ---------------- Athletes ---------------- */
  function athleteRows(game, schools) {
    const rows = [];
    schools.filter(passesFilters).forEach((s) => {
      ['M', 'W'].forEach((g) => {
        if (genderFilter !== 'All' && genderFilter !== g) return;
        game.getRoster(s.id, g).forEach((a) => {
          rows.push({
            a,
            school: s,
            fullName: a.fullName,
            schoolName: s.name,
            conference: s.conference,
            division: s.division || 'DI',
            gender: g,
            classYear: a.classYear,
            hometown: `${a.hometownCity || ''}, ${a.hometownState || ''}`,
            currentOverall: a.currentOverall
          });
        });
      });
    });
    return rows;
  }

  function athleteTable(game, el, rows) {
    return UI.renderSortableTable(el, {
      rows,
      cardsOnDesktop: false,
      maxRows: 200,
      defaultSort: 'currentOverall',
      defaultDir: 'desc',
      searchKeys: ['fullName', 'schoolName', 'conference', 'hometown'],
      rowClass: (r) => (r.school.id === game.playerSchoolId ? 'mine' : ''),
      onRowClick: (r) => UI.showPlayerCard(r.a, game),
      emptyMessage: 'No athletes match — try another name, school, or filter.',
      mobileCard: (r) => `
        <div class="m-head">
          ${UI.avatar(r.a, { size: 42 })}
          <div class="m-title">${r.a.generational ? '⭐ ' : ''}${Utils.escapeHtml(r.fullName)}
            <div class="m-sub">${UI.kitSwatch(r.school, 13)} ${Utils.escapeHtml(r.schoolName)} • ${r.gender === 'M' ? 'Men' : 'Women'} • ${r.classYear}</div>
          </div>
          <div class="m-badge">${UI.ratingBadge(r.currentOverall)}<div class="m-sub">OVR</div></div>
        </div>`,
      columns: [
        { key: 'fullName', label: 'Athlete', grow: true, sortValue: (r) => `${r.a.lastName} ${r.a.firstName}`, render: (r) => `<span class="name-cell">${UI.avatar(r.a, { size: 24 })} ${r.a.generational ? '<span title="Generational talent">⭐</span> ' : ''}<strong>${Utils.escapeHtml(r.fullName)}</strong></span>` },
        { key: 'schoolName', label: 'School', render: (r) => schoolCell(r.school, game) },
        { key: 'division', label: 'Div', sortValue: (r) => divIdx(r.division), render: (r) => `<span class="div-chip">${r.division}</span>` },
        { key: 'gender', label: 'Squad', render: (r) => (r.gender === 'M' ? 'Men' : 'Women') },
        { key: 'classYear', label: 'Class', sortValue: (r) => D.CLASS_YEARS.indexOf(r.classYear) },
        { key: 'hometown', label: 'From', render: (r) => Utils.escapeHtml(r.hometown) },
        { key: 'currentOverall', label: 'OVR', numeric: true, render: (r) => UI.ratingBadge(r.currentOverall) }
      ]
    });
  }

  /* ---------------- Coaches ---------------- */
  function coachRows(game, schools) {
    const rows = [];
    schools.filter(passesFilters).forEach((s) => {
      [[s.coachId, 'Head Coach'], [s.assistantId, 'Assistant']].forEach(([id, role]) => {
        const c = id && game.getCoach(id);
        if (!c) return;
        const cr = c.careerRecord || {};
        rows.push({
          c,
          school: s,
          fullName: c.fullName,
          schoolName: s.name,
          conference: s.conference,
          division: s.division || 'DI',
          role,
          archetype: c.archetype || '',
          overall: c.overallRating,
          age: c.age,
          reputation: Math.round(c.reputation || 0),
          natTitles: cr.nationalTitles || 0
        });
      });
    });
    return rows;
  }

  function coachTable(game, el, rows) {
    return UI.renderSortableTable(el, {
      rows,
      cardsOnDesktop: false,
      maxRows: 200,
      defaultSort: 'reputation',
      defaultDir: 'desc',
      searchKeys: ['fullName', 'schoolName', 'conference', 'archetype', 'role'],
      rowClass: (r) => (r.school.id === game.playerSchoolId ? 'mine' : ''),
      onRowClick: (r) => UI.showCoachCard(r.c, game),
      emptyMessage: 'No coaches match — try another name, school, or filter.',
      mobileCard: (r) => `
        <div class="m-head">
          ${UI.avatar(r.c, { size: 42, outfit: 'suit' })}
          <div class="m-title">${Utils.escapeHtml(r.fullName)}${r.c.isPlayer ? ' <span style="color:var(--accent);">(You)</span>' : ''}
            <div class="m-sub">${UI.kitSwatch(r.school, 13)} ${Utils.escapeHtml(r.schoolName)} • ${r.role} • ${Utils.escapeHtml(r.archetype)}</div>
          </div>
          <div class="m-badge">${UI.ratingBadge(r.overall)}<div class="m-sub">Age ${r.age}</div></div>
        </div>`,
      columns: [
        { key: 'fullName', label: 'Coach', grow: true, sortValue: (r) => `${r.c.lastName} ${r.c.firstName}`, render: (r) => `<span class="name-cell">${UI.avatar(r.c, { size: 24, outfit: 'suit' })} <strong>${Utils.escapeHtml(r.fullName)}</strong>${r.c.isPlayer ? ' <span style="color:var(--accent);">(You)</span>' : ''}</span>` },
        { key: 'role', label: 'Role' },
        { key: 'schoolName', label: 'School', render: (r) => schoolCell(r.school, game) },
        { key: 'division', label: 'Div', sortValue: (r) => divIdx(r.division), render: (r) => `<span class="div-chip">${r.division}</span>` },
        { key: 'archetype', label: 'Style' },
        { key: 'overall', label: 'OVR', numeric: true, render: (r) => UI.ratingBadge(r.overall) },
        { key: 'age', label: 'Age', numeric: true },
        { key: 'reputation', label: 'Prestige', numeric: true },
        { key: 'natTitles', label: 'Natl Titles', numeric: true }
      ]
    });
  }

  const VIEW_IMPL = {
    schools: { rows: schoolRows, table: schoolTable, placeholder: 'Search schools, conferences, coaches...' },
    athletes: { rows: athleteRows, table: athleteTable, placeholder: 'Search athletes by name, school, hometown...' },
    coaches: { rows: coachRows, table: coachTable, placeholder: 'Search coaches by name, school, style...' }
  };

  function render(container) {
    const game = UI.state.game;
    if (!VIEW_IMPL[view]) view = 'schools';
    if (!['All', 'M', 'W'].includes(genderFilter)) genderFilter = 'All';
    const schools = Object.values(game.world.schools);
    const conferences = ['All', ...[...new Set(schools.map((s) => s.conference))].sort()];
    if (!conferences.includes(conferenceFilter)) conferenceFilter = 'All';
    const impl = VIEW_IMPL[view];

    const athleteCount = schools.reduce((n, s) => n + s.rosterM.length + s.rosterW.length, 0);
    const coachCount = schools.reduce((n, s) => n + (s.coachId ? 1 : 0) + (s.assistantId ? 1 : 0), 0);
    const subtitle = view === 'athletes' ? `${athleteCount.toLocaleString()} athletes`
      : view === 'coaches' ? `${coachCount.toLocaleString()} coaches`
        : `${schools.length} schools`;

    container.innerHTML = `
      <div class="screen-header">
        ${UI.screenTitle('World', subtitle)}
        <div class="actions">
          <select class="search-input" id="div-filter" style="min-width:110px;">
            ${['All', 'DI', 'DII', 'DIII'].map((d) => `<option value="${d}" ${d === divisionFilter ? 'selected' : ''}>${d === 'All' ? 'All Divisions' : d}</option>`).join('')}
          </select>
          <select class="search-input" id="conf-filter" style="min-width:160px;">
            ${conferences.map((c) => `<option value="${Utils.escapeHtml(c)}" ${c === conferenceFilter ? 'selected' : ''}>${c === 'All' ? 'All Conferences' : Utils.escapeHtml(c)}</option>`).join('')}
          </select>
          ${view === 'athletes' ? `
          <select class="search-input" id="gender-filter" style="min-width:110px;">
            ${[['All', 'Men & Women'], ['M', 'Men'], ['W', 'Women']].map(([k, l]) => `<option value="${k}" ${k === genderFilter ? 'selected' : ''}>${l}</option>`).join('')}
          </select>` : ''}
          <input class="search-input" id="world-search" placeholder="${impl.placeholder}">
        </div>
      </div>
      <div class="pill-tabs world-views" id="world-views">
        ${VIEWS.map(([k, label]) => `<button data-view="${k}" class="${view === k ? 'active' : ''}">${label}</button>`).join('')}
      </div>
      <div class="card"><div id="world-table"></div>
        ${view === 'schools' ? `<div style="color:var(--text-faint); font-size:12px; margin-top:8px;">Ranked by division, then each squad's current poll. Click a column to re-sort; click a school for its program profile.</div>` : ''}
      </div>`;

    let query = '';

    // Draws (or redraws) only the table; the header + filter selects stay put.
    function drawTable() {
      const tableEl = container.querySelector('#world-table');
      if (!tableEl) return null; // navigated away
      const table = impl.table(game, tableEl, impl.rows(game, schools));
      if (query) table.setQuery(query);
      return table;
    }

    let table = drawTable();

    container.querySelector('#world-search').addEventListener('input', (e) => {
      query = e.target.value;
      if (table) table.setQuery(query);
    });

    // Defer each redraw so the select's native menu fully dismisses first
    // (synchronously touching the DOM here crashes Safari), and never
    // rebuild the select itself.
    const onFilter = (id, set) => {
      const el = container.querySelector(id);
      if (el) el.addEventListener('change', (e) => { set(e.target.value); setTimeout(() => { table = drawTable(); }, 0); });
    };
    onFilter('#conf-filter', (v) => { conferenceFilter = v; });
    onFilter('#div-filter', (v) => { divisionFilter = v; });
    onFilter('#gender-filter', (v) => { genderFilter = v; });

    container.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (view === btn.dataset.view) return;
        view = btn.dataset.view;
        render(container);
      });
    });
  }

  UI.screens.world = { render };
})();
