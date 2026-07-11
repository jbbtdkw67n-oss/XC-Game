/*
 * World screen: browse all 350+ schools with search/filter/sort, view any
 * school's roster and coach.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  let conferenceFilter = 'All';

  function teamStrength(game, school, gender) {
    const roster = game.getRoster(school.id, gender)
      .sort((a, b) => b.currentOverall - a.currentOverall)
      .slice(0, 7);
    return roster.length ? Math.round(Utils.average(roster.map((a) => a.currentOverall))) : 0;
  }

  function showSchoolModal(game, school) {
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
        ${Utils.escapeHtml(school.conference)} • ${school.region} • ${window.XCD.data.STATE_NAMES[school.state] || school.state}
        • Prestige ${school.prestige} • Facilities ${school.facilitiesOverall} • Academics ${school.academics}
      </div>
      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Head Coach</h3>
        <div class="attr-row">
          <span>${coach ? Utils.escapeHtml(coach.fullName) : 'Vacant'}</span>
          <span class="attr-name">${coach ? `${Utils.escapeHtml(coach.personality)} • OVR ${coach.overallRating} • Age ${coach.age}` : ''}</span>
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
        tr.addEventListener('click', () => UI.showPlayerCard(game.getAthlete(tr.dataset.ath), game));
      });
    });
  }

  function render(container) {
    const game = UI.state.game;
    const schools = Object.values(game.world.schools);
    const conferences = ['All', ...Object.keys(window.XCD.data.CONFERENCES)
      .filter((c) => schools.some((s) => s.conference === c))
      .sort()];

    // Precompute display rows (strength computation is per-render, cached in row objects).
    const rows = schools
      .filter((s) => conferenceFilter === 'All' || s.conference === conferenceFilter)
      .map((s) => ({
        school: s,
        name: s.name,
        conference: s.conference,
        state: s.state,
        prestige: s.prestige,
        facilities: s.facilitiesOverall,
        strengthM: teamStrength(game, s, 'M'),
        strengthW: teamStrength(game, s, 'W'),
        coachName: game.getCoach(s.coachId)?.fullName || 'Vacant'
      }));

    container.innerHTML = `
      <div class="screen-header">
        <h1>World — ${schools.length} Schools</h1>
        <div class="actions">
          <select class="search-input" id="conf-filter" style="min-width:160px;">
            ${conferences.map((c) => `<option value="${c}" ${c === conferenceFilter ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <input class="search-input" id="world-search" placeholder="Search schools...">
        </div>
      </div>
      <div class="card"><div id="world-table"></div></div>`;

    const table = UI.renderSortableTable(container.querySelector('#world-table'), {
      rows,
      defaultSort: 'prestige',
      defaultDir: 'desc',
      searchKeys: ['name', 'conference', 'state', 'coachName'],
      onRowClick: (row) => showSchoolModal(game, row.school),
      columns: [
        {
          key: 'name', label: 'School',
          render: (r) => `<strong>${Utils.escapeHtml(r.name)}</strong>${r.school.id === game.playerSchoolId ? ' <span style="color:var(--accent);">★</span>' : ''}`
        },
        { key: 'conference', label: 'Conference' },
        { key: 'state', label: 'State' },
        { key: 'prestige', label: 'Prestige', numeric: true, render: (r) => UI.ratingBadge(r.prestige) },
        { key: 'strengthM', label: "Men", numeric: true, render: (r) => UI.ratingBadge(r.strengthM) },
        { key: 'strengthW', label: "Women", numeric: true, render: (r) => UI.ratingBadge(r.strengthW) },
        { key: 'facilities', label: 'Facilities', numeric: true },
        { key: 'coachName', label: 'Head Coach' }
      ]
    });

    container.querySelector('#world-search').addEventListener('input', (e) => table.setQuery(e.target.value));
    container.querySelector('#conf-filter').addEventListener('change', (e) => {
      conferenceFilter = e.target.value;
      render(container);
    });
  }

  UI.screens.world = { render };
})();
