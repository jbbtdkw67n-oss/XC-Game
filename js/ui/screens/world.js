/*
 * World screen: browse all 350+ schools with search/filter/sort, view any
 * school's roster and coach.
 *
 * NOTE on the conference filter: WebKit (Safari) can crash if the <select>
 * element is destroyed synchronously while its native dropdown is still
 * dismissing. So a filter change must never rebuild the whole screen —
 * only the table body is redrawn, and only after the event unwinds.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  let conferenceFilter = 'All';
  let divisionFilter = 'All';

  function teamStrength(game, school, gender) {
    const roster = game.getRoster(school.id, gender)
      .sort((a, b) => b.currentOverall - a.currentOverall)
      .slice(0, 7);
    return roster.length ? Math.round(Utils.average(roster.map((a) => a.currentOverall))) : 0;
  }

  function showSchoolModal(game, school) {
    if (!school) return;
    const coach = game.getCoach(school.coachId);
    const rosterM = game.getRoster(school.id, 'M').sort((a, b) => b.currentOverall - a.currentOverall);
    const rosterW = game.getRoster(school.id, 'W').sort((a, b) => b.currentOverall - a.currentOverall);

    const rosterRows = (roster) => roster.slice(0, 10).map((a) => `
      <tr class="clickable" data-ath="${a.id}">
        <td>${Utils.escapeHtml(a.fullName)}</td>
        <td>${a.classYear}</td>
        <td class="num">${UI.ratingBadge(a.currentOverall)}</td>
      </tr>`).join('');

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <h2>${Utils.escapeHtml(school.name)}</h2>
      <div style="color:var(--text-dim); font-size:13px; margin-bottom:14px;">
        ${Utils.escapeHtml(school.conference)} • ${school.region} • ${(window.XCD.data.STATE_NAMES || {})[school.state] || school.state}
        • Prestige ${school.prestige} • Facilities ${school.facilitiesOverall} • Academics ${school.academics}
      </div>
      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Head Coach</h3>
        <div class="attr-row ${coach ? 'clickable' : ''}" ${coach ? 'id="school-coach-row" style="cursor:pointer;"' : ''}>
          <span>${coach ? Utils.escapeHtml(coach.fullName) : 'Vacant'}${coach ? ' <span style="color:var(--text-faint); font-size:11px;">(view profile)</span>' : ''}</span>
          <span class="attr-name">${coach ? `${Utils.escapeHtml(coach.archetype || coach.personality || '')} • OVR ${coach.overallRating} • Age ${coach.age}` : ''}</span>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="card" style="padding:12px;">
          <h3>Men's Top 10</h3>
          <div class="table-wrap"><table class="data"><tbody>${rosterRows(rosterM)}</tbody></table></div>
        </div>
        <div class="card" style="padding:12px;">
          <h3>Women's Top 10</h3>
          <div class="table-wrap"><table class="data"><tbody>${rosterRows(rosterW)}</tbody></table></div>
        </div>
      </div>
    `, (modal) => {
      modal.querySelectorAll('[data-ath]').forEach((tr) => {
        tr.addEventListener('click', () => {
          const a = game.getAthlete(tr.dataset.ath);
          if (a) UI.showPlayerCard(a, game);
        });
      });
      const coachRow = modal.querySelector('#school-coach-row');
      if (coachRow && coach) coachRow.addEventListener('click', () => UI.showCoachCard(coach, game));
    });
  }

  function buildRows(game, schools) {
    return schools
      .filter((s) => divisionFilter === 'All' || (s.division || 'DI') === divisionFilter)
      .filter((s) => conferenceFilter === 'All' || s.conference === conferenceFilter)
      .map((s) => ({
        school: s,
        name: s.name,
        conference: s.conference,
        division: s.division || 'DI',
        state: s.state,
        prestige: s.prestige,
        facilities: s.facilitiesOverall,
        strengthM: teamStrength(game, s, 'M'),
        strengthW: teamStrength(game, s, 'W'),
        coachName: game.getCoach(s.coachId)?.fullName || 'Vacant'
      }));
  }

  function render(container) {
    const game = UI.state.game;
    const schools = Object.values(game.world.schools);
    const conferences = ['All', ...[...new Set(schools.map((s) => s.conference))].sort()];
    if (!conferences.includes(conferenceFilter)) conferenceFilter = 'All';

    container.innerHTML = `
      <div class="screen-header">
        <h1>World — ${schools.length} Schools</h1>
        <div class="actions">
          <select class="search-input" id="div-filter" style="min-width:110px;">
            ${['All', 'DI', 'DII', 'DIII'].map((d) => `<option value="${d}" ${d === divisionFilter ? 'selected' : ''}>${d === 'All' ? 'All Divisions' : d}</option>`).join('')}
          </select>
          <select class="search-input" id="conf-filter" style="min-width:160px;">
            ${conferences.map((c) => `<option value="${Utils.escapeHtml(c)}" ${c === conferenceFilter ? 'selected' : ''}>${Utils.escapeHtml(c)}</option>`).join('')}
          </select>
          <input class="search-input" id="world-search" placeholder="Search schools...">
        </div>
      </div>
      <div class="card"><div id="world-table"></div></div>`;

    let query = '';

    // Draws (or redraws) only the table; the header + filter select stay put.
    function drawTable() {
      const tableEl = container.querySelector('#world-table');
      if (!tableEl) return; // navigated away
      const table = UI.renderSortableTable(tableEl, {
        rows: buildRows(game, schools),
        defaultSort: 'prestige',
        defaultDir: 'desc',
        searchKeys: ['name', 'conference', 'state', 'coachName'],
        onRowClick: (row) => (UI.showSchoolCard ? UI.showSchoolCard(row.school, game) : showSchoolModal(game, row.school)),
        columns: [
          {
            key: 'name', label: 'School',
            render: (r) => `<strong>${Utils.escapeHtml(r.name)}</strong>${r.school.id === game.playerSchoolId ? ' <span style="color:var(--accent);">★</span>' : ''}`
          },
          { key: 'division', label: 'Div' },
          { key: 'conference', label: 'Conference' },
          { key: 'state', label: 'State' },
          { key: 'prestige', label: 'Prestige', numeric: true, render: (r) => UI.ratingBadge(r.prestige) },
          { key: 'strengthM', label: "Men", numeric: true, render: (r) => UI.ratingBadge(r.strengthM) },
          { key: 'strengthW', label: "Women", numeric: true, render: (r) => UI.ratingBadge(r.strengthW) },
          { key: 'facilities', label: 'Facilities', numeric: true },
          { key: 'coachName', label: 'Head Coach' }
        ]
      });
      if (query) table.setQuery(query);
      return table;
    }

    let table = drawTable();

    container.querySelector('#world-search').addEventListener('input', (e) => {
      query = e.target.value;
      if (table) table.setQuery(query);
    });

    container.querySelector('#conf-filter').addEventListener('change', (e) => {
      conferenceFilter = e.target.value;
      // Defer the redraw so the select's native menu fully dismisses first
      // (synchronously touching the DOM here crashes Safari), and never
      // rebuild the select itself.
      setTimeout(() => { table = drawTable(); }, 0);
    });

    container.querySelector('#div-filter').addEventListener('change', (e) => {
      divisionFilter = e.target.value;
      setTimeout(() => { table = drawTable(); }, 0);
    });
  }

  UI.screens.world = { render };
})();
