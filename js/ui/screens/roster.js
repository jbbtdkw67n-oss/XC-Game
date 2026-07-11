/*
 * Roster screen: sortable, searchable roster tables for men's and women's
 * squads with click-through player cards.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  let activeGender = 'M';

  function render(container) {
    const game = UI.state.game;
    const school = game.getPlayerSchool();

    container.innerHTML = `
      <div class="screen-header">
        <h1>Roster</h1>
        <div class="actions">
          <div class="pill-tabs">
            <button id="tab-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="tab-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
          <input class="search-input" id="roster-search" placeholder="Search runners...">
        </div>
      </div>
      <div class="card">
        <div id="roster-table"></div>
      </div>`;

    const roster = game.getRoster(school.id, activeGender);

    const table = UI.renderSortableTable(container.querySelector('#roster-table'), {
      rows: roster,
      defaultSort: 'currentOverall',
      defaultDir: 'desc',
      searchKeys: ['firstName', 'lastName', 'classYear', 'hometownState', 'personality'],
      onRowClick: (a) => UI.showPlayerCard(a, game),
      columns: [
        { key: 'lastName', label: 'Name', render: (a) => `<strong>${Utils.escapeHtml(a.fullName)}</strong>` },
        { key: 'classYear', label: 'Class', sortValue: (a) => window.XCD.data.CLASS_YEARS.indexOf(a.classYear) },
        { key: 'hometownState', label: 'From', render: (a) => `${Utils.escapeHtml(a.hometownCity)}, ${a.hometownState}` },
        { key: 'currentOverall', label: 'OVR', numeric: true, render: (a) => UI.ratingBadge(a.currentOverall) },
        { key: 'potential', label: 'POT', numeric: true, render: (a) => UI.ratingBadge(a.potential) },
        { key: 'endurance', label: 'END', numeric: true, render: (a) => UI.ratingBadge(a.endurance) },
        { key: 'rawSpeed', label: 'SPD', numeric: true, render: (a) => UI.ratingBadge(a.rawSpeed) },
        { key: 'kickSpeed', label: 'KICK', numeric: true, render: (a) => UI.ratingBadge(a.kickSpeed) },
        { key: 'fatigue', label: 'FTG', numeric: true, render: (a) => `<div style="min-width:60px;">${UI.meter(a.fatigue, a.fatigue > 70 ? 'red' : a.fatigue > 40 ? 'yellow' : 'green')}</div>` },
        { key: 'morale', label: 'MOR', numeric: true, render: (a) => `<div style="min-width:60px;">${UI.meter(a.morale, a.morale < 40 ? 'red' : a.morale < 65 ? 'yellow' : 'green')}</div>` },
        {
          key: 'health', label: 'Status',
          render: (a) => a.health === 'Healthy'
            ? '<span style="color:var(--success);">Healthy</span>'
            : `<span style="color:var(--danger);">${Utils.escapeHtml(a.injury ? a.injury.type : a.health)}</span>`
        }
      ]
    });

    container.querySelector('#roster-search').addEventListener('input', (e) => table.setQuery(e.target.value));
    container.querySelector('#tab-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    container.querySelector('#tab-w').addEventListener('click', () => { activeGender = 'W'; render(container); });
  }

  UI.screens.roster = { render };
})();
