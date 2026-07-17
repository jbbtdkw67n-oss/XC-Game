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

    // Week 1 roster crunch (spec Part 2, Section 15): Division A carries at
    // most 14 per squad. Over the limit, the head coach must cut before the
    // season can begin — cut athletes move on through the portal.
    const rl = game.rosterLimitStatus();
    const canManage = game.controlsTraining();
    const squadSize = activeGender === 'M' ? rl.M : rl.W;
    const cutMode = canManage && game.week === 1 && rl.limit !== Infinity && squadSize > rl.limit;

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
      ${cutMode ? `
      <div class="card" style="margin-bottom:14px; border-left:3px solid var(--danger);">
        <h3 style="margin:0 0 4px;">✂️ Roster over the Division A limit — ${squadSize}/${rl.limit}</h3>
        <div style="color:var(--text-dim); font-size:12.5px;">
          Cut ${squadSize - rl.limit} athlete${squadSize - rl.limit > 1 ? 's' : ''} to finalize the roster (Week 1 checklist).
          Weigh overall, potential, class, development, work ethic, injury history, and transfer risk —
          open any profile for the full picture. Cut athletes enter the portal and land elsewhere.
        </div>
      </div>` : ''}
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
        { key: 'lastName', label: 'Name', render: (a) => `${UI.avatar(a, { size: 24 })} <strong>${Utils.escapeHtml(a.fullName)}</strong>${a.isWalkOn ? ' <span style="color:var(--text-faint); font-size:10px;" title="Walk-on">WO</span>' : ''}` },
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
          key: 'transferRisk', label: 'Risk',
          sortValue: (a) => {
            const r = window.XCD.engine.Portal.transferRisk(UI.state.game, a);
            return r && !r.graduating ? r.score : -1;
          },
          render: (a) => {
            const r = window.XCD.engine.Portal.transferRisk(UI.state.game, a);
            if (!r || r.graduating) return '<span style="color:var(--text-faint);">—</span>';
            const hint = (r.reasons.length ? r.reasons : r.anchors).slice(0, 3).join(' • ');
            return `<span style="color:${r.level.color}; font-size:12px;" title="Transfer risk: ${r.level.label}${hint ? ' — ' + hint : ''} (open the profile for details)">${r.level.label}</span>`;
          }
        },
        {
          key: 'health', label: 'Status',
          render: (a) => a.health === 'Healthy'
            ? '<span style="color:var(--success);">Healthy</span>'
            : a.health === 'Recovering'
              ? `<span style="color:var(--warning);" title="Returning from injury — rebuilding fitness, sharpness, and confidence (~${Math.max(1, a.recentInjuryWeeks || 1)} wk)">Recovering</span>`
              : `<span style="color:var(--danger);">${Utils.escapeHtml(a.injury ? a.injury.type : a.health)}</span>`
        },
        canManage && {
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
        canManage && {
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
        },
        cutMode && {
          key: 'cut', label: 'Cut',
          render: (a) => `<button class="btn small danger" data-cut="${a.id}" title="Release ${Utils.escapeHtml(a.fullName)} — they enter the portal">✂️ Cut</button>`
        }
      ].filter(Boolean)
    });

    // Capturing delegate: survives table re-sorts and beats the row-click
    // handler that would otherwise open the player card.
    container.querySelector('#roster-table').addEventListener('click', (e) => {
      const cutBtn = e.target.closest('[data-cut]');
      if (cutBtn) {
        e.stopPropagation();
        const game = UI.state.game;
        const a = game.getAthlete(cutBtn.dataset.cut);
        if (!a) return;
        UI.showModal(`
          <h2>✂️ Cut ${Utils.escapeHtml(a.fullName)}?</h2>
          <p style="color:var(--text-dim); font-size:13px;">
            ${a.classYear} • ${a.currentOverall} OVR (POT ${a.potential}) • Work Ethic ${a.workEthic} •
            ${(a.careerInjuries || []).length} career injur${(a.careerInjuries || []).length === 1 ? 'y' : 'ies'} •
            ${a.careerStats.races} races. This is permanent — released athletes enter the portal and sign elsewhere.
          </p>
          <div style="display:flex; gap:8px; margin-top:12px;">
            <button class="btn danger" id="cut-yes">✂️ Release ${Utils.escapeHtml(a.lastName)}</button>
            <button class="btn" data-modal-close>Keep on Roster</button>
          </div>`, (modal) => {
          modal.querySelector('#cut-yes').addEventListener('click', () => {
            const r = window.XCD.engine.Portal.cutAthlete(game, a.id);
            UI.toast(r.message, r.ok ? 'success' : 'error');
            UI.closeModal();
            if (r.ok) render(container);
          });
        });
        return;
      }
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
