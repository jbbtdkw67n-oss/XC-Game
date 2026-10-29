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

    // Week 1 roster crunch (spec Part 2, Section 15): Division I carries at
    // most 14 per squad. Over the limit, the head coach must cut before the
    // season can begin — cut athletes move on through the portal.
    const rl = game.rosterLimitStatus();
    const canManage = game.controlsTraining();
    const squadSize = activeGender === 'M' ? rl.M : rl.W;
    const cutMode = canManage && game.week === 1 && rl.limit !== Infinity && squadSize > rl.limit;

    // Captain leadership (the squad's two captains, averaged) and what it buys.
    const captIds = (game.culture && game.culture.captains[activeGender]) || [];
    const capts = captIds.map((id) => game.getAthlete(id)).filter((a) => a && a.schoolId === school.id);
    const lead = capts.length ? Math.round(capts.reduce((t, a) => t + (a.leadership || 0), 0) / capts.length) : null;
    const leadPerks = lead == null ? 'Name up to two captains (juniors and older) — strong leaders lift the whole squad.'
      : [
        'Team chemistry',
        lead > 65 ? `underclassmen develop faster (+${Math.round(Math.min(1, (lead - 65) / 30) * 10)}% freshmen)` : '',
        lead >= 75 ? 'picks up struggling teammates' : '',
        lead > 70 ? `race-day edge (bigger in the postseason)` : ''
      ].filter(Boolean).join(' · ');

    // Race-day Top 7 (Update 24): the Highest Overall preset or the coach's
    // own picks — the seven who race every meet.
    const Races = window.XCD.engine.Races;
    const lineup = Races.playerLineup(game, activeGender);
    const custom = lineup.mode === 'custom';
    const lineupChips = lineup.ids.map((id) => {
      const a = game.getAthlete(id);
      if (!a) return '';
      const auto = lineup.filled.has(id);
      return `<span class="lineup-chip${auto ? ' auto' : ''}" title="${auto ? 'Open spot — filled by the best healthy runner by overall' : 'In the Top 7'}">${Utils.escapeHtml(a.lastName)} <b>${Math.round(a.currentOverall)}</b></span>`;
    }).join('');

    container.innerHTML = `
      <div class="screen-header">
        ${UI.screenTitle('Roster', `${Utils.escapeHtml(game.getPlayerSchool().name)} · ${game.year} season`)}
        <div class="actions">
          <div class="pill-tabs">
            <button id="tab-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="tab-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
          <input class="search-input" id="roster-search" placeholder="Search runners...">
          ${canManage ? `<button class="btn" id="btn-ideal-mileage" title="Set every runner on both squads to their own ideal weekly mileage — the most their body can absorb right now, built up gradually. Fine-tune any runner on the Training screen.">🎯 Ideal Mileage</button>` : ''}
        </div>
      </div>
      <div class="card lead-card" style="margin-bottom:14px;">
        <div class="lead-score ${lead >= 75 ? 'strong' : lead >= 60 ? 'ok' : 'weak'}">${lead == null ? '—' : lead}</div>
        <div>
          <div class="lead-title">Captain Leadership${capts.length ? ' — ' + capts.map((a) => Utils.escapeHtml(a.lastName)).join(' & ') : ''}</div>
          <div class="lead-sub">${leadPerks}</div>
        </div>
      </div>
      <div class="card lineup-card" style="margin-bottom:14px;">
        <div class="lineup-head">
          <div>
            <div class="lead-title">🏃 Race-Day Top 7</div>
            <div class="lead-sub">${custom
              ? 'Your picks race every meet. Tap Top 7 on any runner to swap them in or out — an injured pick is covered by the best healthy runner until they\'re back.'
              : 'The seven best healthy runners by overall race every meet. Pick Custom, or tap Top 7 on any runner, to choose your own.'}</div>
          </div>
          ${canManage ? `
          <div class="pill-tabs lineup-modes">
            <button id="lineup-overall" class="${custom ? '' : 'active'}" title="Race the seven best healthy runners by overall">Highest Overall</button>
            <button id="lineup-custom" class="${custom ? 'active' : ''}" title="Choose your own seven">Custom</button>
          </div>` : ''}
        </div>
        <div class="lineup-chips">${lineupChips || '<span style="color:var(--text-faint); font-size:12px;">No healthy runners available.</span>'}</div>
      </div>
      ${cutMode ? `
      <div class="card" style="margin-bottom:14px; border-left:3px solid var(--danger);">
        <h3 style="margin:0 0 4px;">✂️ Roster over the Division I limit — ${squadSize}/${rl.limit}</h3>
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

    // The Top 7 toggle: in the lineup (✓), an auto fill-in for an open
    // custom spot, an injured pick, or out (+).
    const pickedIds = (game.training.lineup && game.training.lineup[activeGender] && game.training.lineup[activeGender].ids) || [];
    const lineupButton = (a, long) => {
      const inSeven = lineup.ids.includes(a.id);
      const injuredPick = custom && pickedIds.includes(a.id) && !inSeven;
      if (injuredPick) {
        return `<button class="btn small" data-lineup="${a.id}" style="border-color:var(--warning); color:var(--warning);" title="Picked, but injured — the best healthy runner races in their place. Tap to remove.">🩼 ${long ? 'Top 7 (injured)' : '7'}</button>`;
      }
      if (inSeven) {
        const auto = lineup.filled.has(a.id);
        return `<button class="btn small lineup-in${auto ? ' auto' : ''}" data-lineup="${a.id}" title="${auto ? 'Filling an open Top 7 spot by overall — tap to lock them in' : 'Racing in the Top 7 — tap to take them out'}">${auto ? (long ? 'Top 7 (auto)' : 'auto') : (long ? '✓ Top 7' : '✓ 7')}</button>`;
      }
      return `<button class="btn small" data-lineup="${a.id}" title="Put ${Utils.escapeHtml(a.fullName)} in the Top 7">${long ? '+ Top 7' : '+'}</button>`;
    };

    // Phone view (Update 14): each athlete is a tappable card — identity,
    // ratings, and the three health meters at a glance; management actions
    // (captain / cut) ride along in the card footer.
    const mobileCard = (a) => {
      const isCapt = game.culture.captains[activeGender].includes(a.id);
      const status = a.injury
        ? `<span style="color:var(--danger);">🩼 ${Utils.escapeHtml(a.injury.type)}</span>`
        : a.health === 'Recovering'
          ? '<span style="color:var(--warning);">Recovering</span>'
          : '<span style="color:var(--success);">Healthy</span>';
      const risk = window.XCD.engine.Portal.transferRisk(game, a);
      const riskTag = (risk && !risk.graduating)
        ? ` • <span style="color:${risk.level.color};" title="Transfer risk — open the profile for details">Risk: ${risk.level.label}</span>`
        : '';
      const actions = [];
      if (canManage) {
        if (isCapt) actions.push(`<button class="btn small" data-capt="${a.id}" style="border-color:var(--gold); color:var(--gold);">⭐ Captain</button>`);
        else if (['Junior', 'Senior', 'Graduate'].includes(a.classYear)) actions.push(`<button class="btn small" data-capt="${a.id}">Make Captain</button>`);
      }
      if (canManage) actions.push(lineupButton(a, true));
      if (cutMode) actions.push(`<button class="btn small danger" data-cut="${a.id}">✂️ Cut</button>`);
      return `
        <div class="m-head">
          ${UI.avatar(a, { size: 42 })}
          <div class="m-title">${isCapt ? '⭐ ' : ''}${Utils.escapeHtml(a.fullName)}${a.isWalkOn ? ' <span style="color:var(--text-faint); font-size:10px;">WO</span>' : ''}
            <div class="m-sub">${a.classYear} • ${Utils.escapeHtml(a.hometownCity)}, ${a.hometownState} • ${status}${riskTag}</div>
          </div>
          <div class="m-badge">${UI.ratingBadge(a.currentOverall)}
            <div class="m-sub">POT ${Math.round(a.potential)}</div>
          </div>
        </div>
        <div class="m-stats">
          <div class="m-stat"><div class="k">Fitness</div>${UI.meter(a.fitness)}</div>
          <div class="m-stat"><div class="k">Fatigue</div>${UI.meter(a.fatigue, a.fatigue > 70 ? 'red' : a.fatigue > 40 ? 'yellow' : 'green')}</div>
          <div class="m-stat"><div class="k">Morale</div>${UI.meter(a.morale, a.morale < 40 ? 'red' : a.morale < 65 ? 'yellow' : 'green')}</div>
        </div>
        ${actions.length ? `<div class="m-actions">${actions.join('')}</div>` : ''}`;
    };

    const table = UI.renderSortableTable(container.querySelector('#roster-table'), {
      rows: roster,
      defaultSort: 'currentOverall',
      defaultDir: 'desc',
      searchKeys: ['firstName', 'lastName', 'classYear', 'hometownState', 'personality'],
      onRowClick: (a) => UI.showPlayerCard(a, game),
      mobileCard,
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
          key: 'lineup', label: 'Top 7',
          sortValue: (a) => (lineup.ids.includes(a.id) ? 2 : 0) + (lineup.filled.has(a.id) ? -1 : 0),
          render: (a) => lineupButton(a, false)
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
      const lBtn = e.target.closest('[data-lineup]');
      if (lBtn) {
        e.stopPropagation();
        const game = UI.state.game;
        // Tapping an auto fill-in locks them in as one of the coach's picks.
        const r = Races.toggleLineup(game, activeGender, lBtn.dataset.lineup);
        UI.toast(r.message, r.ok ? 'success' : 'error');
        if (r.ok) render(container);
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
    const idealBtn = container.querySelector('#btn-ideal-mileage');
    if (idealBtn) {
      idealBtn.addEventListener('click', () => {
        const n = window.XCD.engine.Training.applyIdealMileage(game);
        UI.toast(`🎯 Ideal mileage set for all ${n} runners — each at the most their body can absorb right now. Fine-tune on Training.`, 'success');
      });
    }
    const setMode = (mode) => {
      Races.setLineupMode(game, activeGender, mode);
      UI.toast(mode === 'custom'
        ? 'Custom Top 7 — tap Top 7 on any runner to swap them in or out.'
        : 'Top 7 set to the seven highest-overall healthy runners.', 'success');
      render(container);
    };
    const luOverall = container.querySelector('#lineup-overall');
    if (luOverall) luOverall.addEventListener('click', () => setMode('overall'));
    const luCustom = container.querySelector('#lineup-custom');
    if (luCustom) luCustom.addEventListener('click', () => setMode('custom'));
    container.querySelector('#tab-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    container.querySelector('#tab-w').addEventListener('click', () => { activeGender = 'W'; render(container); });
  }

  UI.screens.roster = { render };
})();
