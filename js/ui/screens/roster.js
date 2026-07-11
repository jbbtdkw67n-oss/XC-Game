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
        { key: 'vo2Max', label: 'VO₂', numeric: true, render: (a) => UI.ratingBadge(a.vo2Max) },
        { key: 'stamina', label: 'STA', numeric: true, render: (a) => UI.ratingBadge(a.stamina) },
        { key: 'speed', label: 'SPD', numeric: true, render: (a) => UI.ratingBadge(a.speed) },
        { key: 'fatigue', label: 'FTG', numeric: true, render: (a) => `<div style="min-width:60px;">${UI.meter(a.fatigue, a.fatigue > 70 ? 'red' : a.fatigue > 40 ? 'yellow' : 'green')}</div>` },
        { key: 'morale', label: 'MOR', numeric: true, render: (a) => `<div style="min-width:60px;">${UI.meter(a.morale, a.morale < 40 ? 'red' : a.morale < 65 ? 'yellow' : 'green')}</div>` },
        {
          key: 'health', label: 'Status',
          render: (a) => a.health === 'Healthy'
            ? '<span style="color:var(--success);">Healthy</span>'
            : `<span style="color:var(--danger);">${Utils.escapeHtml(a.injury ? a.injury.type : a.health)}</span>`
        },
        {
          key: 'captain', label: 'Capt',
          sortValue: (a) => UI.state.game.culture.captains[activeGender].includes(a.id) ? 1 : 0,
          render: (a) => {
            const isCapt = UI.state.game.culture.captains[activeGender].includes(a.id);
            const eligible = ['Junior', 'Senior', 'Graduate'].includes(a.classYear);
            if (isCapt) return `<button class="btn small" data-capt="${a.id}" style="border-color:var(--gold); color:var(--gold);">⭐ C</button>`;
            if (!eligible) return '<span style="color:var(--text-faint); font-size:11px;">—</span>';
            return `<button class="btn small" data-capt="${a.id}" title="Name captain (leadership ${a.leadership})">C?</button>`;
          }
        },
        {
          key: 'redshirt', label: 'Redshirt',
          sortValue: (a) => a.redshirt,
          render: (a) => {
            if (a.redshirt === 'True' || a.redshirt === 'Medical') {
              return `<button class="btn small" data-rs="${a.id}" ${a.redshirt === 'Medical' ? 'disabled title="Medical redshirt"' : ''} style="border-color:var(--warning); color:var(--warning);">${a.redshirt === 'Medical' ? 'Medical RS' : 'Redshirting ✕'}</button>`;
            }
            if (a.redshirt === 'Used') return '<span style="color:var(--text-faint); font-size:12px;">Used</span>';
            const chk = window.XCD.engine.Portal.canRedshirt(UI.state.game, a);
            return `<button class="btn small" data-rs="${a.id}" ${chk.ok ? '' : `disabled title="${chk.why}"`}>Redshirt</button>`;
          }
        }
      ]
    });

    // Capturing delegate: survives table re-sorts and beats the row-click
    // handler that would otherwise open the player card.
    container.querySelector('#roster-table').addEventListener('click', (e) => {
      const rsBtn = e.target.closest('[data-rs]');
      if (rsBtn && !rsBtn.disabled) {
        e.stopPropagation();
        const result = window.XCD.engine.Portal.toggleRedshirt(UI.state.game, rsBtn.dataset.rs);
        UI.toast(result.message, result.ok ? 'success' : 'error');
        if (result.ok) render(container);
        return;
      }
      const cBtn = e.target.closest('[data-capt]');
      if (cBtn) {
        e.stopPropagation();
        const game = UI.state.game;
        const captains = game.culture.captains[activeGender];
        const id = cBtn.dataset.capt;
        const a = game.getAthlete(id);
        if (captains.includes(id)) {
          captains.splice(captains.indexOf(id), 1);
          UI.toast(`${a.lastName} is no longer a captain.`);
        } else if (captains.length >= 2) {
          UI.toast('Only two captains per squad — remove one first.', 'error');
          return;
        } else {
          captains.push(id);
          UI.toast(`${a.fullName} named team captain.`, 'success');
        }
        render(container);
      }
    }, true);

    container.querySelector('#roster-search').addEventListener('input', (e) => table.setQuery(e.target.value));
    container.querySelector('#tab-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    container.querySelector('#tab-w').addEventListener('click', () => { activeGender = 'W'; render(container); });
  }

  UI.screens.roster = { render };
})();
