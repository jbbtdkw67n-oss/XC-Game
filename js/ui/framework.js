/*
 * UI framework: screen registry/routing, toasts, modals, and a reusable
 * sortable/searchable table renderer. Screens register themselves in
 * XCD.ui.screens and implement render(container).
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  UI.state = {
    currentScreen: 'dashboard',
    game: null // active GameState
  };

  /* ---------------- Toasts ---------------- */
  UI.toast = function (message, type = 'info', duration = 3200) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 320);
    }, duration);
  };

  /* ---------------- Modals ---------------- */
  UI.showModal = function (contentHtml, onMount) {
    UI.closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'active-modal';
    backdrop.innerHTML = `<div class="modal">${contentHtml}</div>`;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) UI.closeModal();
    });
    document.body.appendChild(backdrop);
    const closeBtn = backdrop.querySelector('[data-modal-close]');
    if (closeBtn) closeBtn.addEventListener('click', UI.closeModal);
    if (onMount) onMount(backdrop.querySelector('.modal'));
  };

  UI.closeModal = function () {
    const existing = document.getElementById('active-modal');
    if (existing) existing.remove();
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') UI.closeModal();
  });

  /* ---------------- Rating badge helper ---------------- */
  UI.ratingBadge = function (value) {
    // Attributes are stored as fractional values internally (for simulation
    // precision) but always shown as whole numbers.
    const v = Math.round(value || 0);
    let cls = 'r-poor';
    if (v >= 85) cls = 'r-elite';
    else if (v >= 75) cls = 'r-great';
    else if (v >= 62) cls = 'r-good';
    else if (v >= 50) cls = 'r-avg';
    return `<span class="rating ${cls}">${v}</span>`;
  };

  UI.meter = function (value, colorClass = '') {
    return `<div class="meter ${colorClass}"><span style="width:${Utils.clamp(value, 0, 100)}%"></span></div>`;
  };

  /*
   * Championship honor window for a meet (Update 12): at nationals the top
   * N finishers earn All-America honors; at a conference championship the
   * top N earn All-Conference — N comes from the division's rules. Result
   * tables mark those finishers with the honor emoji. Null for every other meet.
   */
  UI.meetHonorInfo = function (meet) {
    if (!meet) return null;
    const D = window.XCD.data;
    const champ = (D.divisionFor(meet.division || 'DI') || {}).championship;
    if (!champ) return null;
    if (meet.type === 'national') return { count: champ.allAmericans, label: 'All-American', icon: '🇺🇸' };
    if (meet.type === 'conference') return { count: champ.allConference, label: 'All-Conference', icon: '🏅' };
    return null;
  };

  /* ---------------- Sortable table ----------------
   * config: {
   *   columns: [{ key, label, numeric?, render?(row) -> html, sortValue?(row) }],
   *   rows: [...], defaultSort: key, defaultDir: 'asc'|'desc',
   *   onRowClick?(row), searchKeys?: [key,...]
   * }
   */
  UI.renderSortableTable = function (container, config) {
    const state = {
      sortKey: config.defaultSort || config.columns[0].key,
      sortDir: config.defaultDir || 'desc',
      query: ''
    };

    function getSortValue(row, col) {
      if (col.sortValue) return col.sortValue(row);
      return row[col.key];
    }

    function draw() {
      const col = config.columns.find((c) => c.key === state.sortKey) || config.columns[0];
      let rows = (config.rows || []).slice();

      if (state.query && config.searchKeys) {
        const q = state.query.toLowerCase();
        rows = rows.filter((r) =>
          config.searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
      }

      rows.sort((a, b) => {
        const va = getSortValue(a, col);
        const vb = getSortValue(b, col);
        let cmp;
        if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
        else cmp = String(va ?? '').localeCompare(String(vb ?? ''));
        return state.sortDir === 'asc' ? cmp : -cmp;
      });

      // Very large datasets (e.g. the national recruit pool) are capped per
      // view; sorting/searching still operates over the full set.
      const totalRows = rows.length;
      const cap = config.maxRows || 400;
      const truncated = totalRows > cap;
      if (truncated) rows = rows.slice(0, cap);

      const thead = config.columns.map((c) => {
        const sorted = c.key === state.sortKey ? ` sorted-${state.sortDir}` : '';
        return `<th class="${c.numeric ? 'num' : ''}${sorted}" data-col="${c.key}">${c.label}</th>`;
      }).join('');

      const tbody = rows.length ? rows.map((row, i) => {
        const tds = config.columns.map((c) => {
          const content = c.render ? c.render(row, i) : Utils.escapeHtml(row[c.key]);
          return `<td class="${c.numeric ? 'num' : ''}">${content}</td>`;
        }).join('');
        return `<tr class="${config.onRowClick ? 'clickable' : ''}" data-row="${i}">${tds}</tr>`;
      }).join('') : `<tr><td colspan="${config.columns.length}" style="color:var(--text-dim); padding:14px; text-align:center;">${config.emptyMessage || 'No results match the current filters.'}</td></tr>`;

      container.innerHTML = `
        <div class="table-wrap">
          <table class="data">
            <thead><tr>${thead}</tr></thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
        ${truncated ? `<div style="color:var(--text-faint); font-size:12px; padding:8px 2px 0;">Showing ${cap} of ${totalRows.toLocaleString()} — narrow with search or sorting.</div>` : ''}`;

      container.querySelectorAll('th').forEach((th) => {
        th.addEventListener('click', () => {
          const key = th.dataset.col;
          if (state.sortKey === key) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            state.sortKey = key;
            const newCol = config.columns.find((c) => c.key === key);
            state.sortDir = newCol && newCol.numeric ? 'desc' : 'asc';
          }
          draw();
        });
      });

      if (config.onRowClick) {
        container.querySelectorAll('tbody tr').forEach((tr) => {
          tr.addEventListener('click', () => config.onRowClick(rows[Number(tr.dataset.row)]));
        });
      }
    }

    draw();
    return {
      setQuery(q) { state.query = q; draw(); },
      // Swap the underlying dataset in place (filters, live updates) —
      // sort order and search query survive; no screen re-render needed.
      setRows(rows) { config.rows = rows || []; draw(); },
      refresh: draw
    };
  };

  /* ---------------- Screen routing ---------------- */
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'schedule', label: 'Schedule', icon: '📅' },
    { id: 'racecenter', label: 'Race Center', icon: '📺' },
    { id: 'rankings', label: 'Rankings', icon: '🏅' },
    { id: 'roster', label: 'Roster', icon: '👟' },
    { id: 'training', label: 'Training', icon: '📋' },
    { id: 'recruiting', label: 'Recruiting', icon: '🎯' },
    { id: 'portal', label: 'Portal', icon: '🔄' },
    { id: 'school', label: 'My Program', icon: '🏫' },
    { id: 'history', label: 'History', icon: '🏛' },
    { id: 'world', label: 'World', icon: '🌎' },
    { id: 'news', label: 'News', icon: '📰' },
    { id: 'saves', label: 'Save / Load', icon: '💾' }
  ];

  UI.navigate = function (screenId) {
    UI.state.currentScreen = screenId;
    UI.renderShell();
  };

  UI.renderShell = function () {
    const game = UI.state.game;
    const root = document.getElementById('root');
    if (!game) {
      UI.screens.menu.render(root);
      return;
    }

    const school = game.getPlayerSchool();
    root.innerHTML = `
      <div id="app">
        <nav id="sidebar">
          <div class="brand">XC <span>Dynasty</span></div>
          <div class="school-tag">${Utils.escapeHtml(school.name)} • ${Utils.escapeHtml(school.conference)}</div>
          ${NAV_ITEMS.map((n) => `
            <button class="nav-item ${UI.state.currentScreen === n.id ? 'active' : ''}" data-nav="${n.id}">
              <span class="icon">${n.icon}</span>${n.label}
            </button>`).join('')}
          <div class="sidebar-footer">v${window.XCD.VERSION}</div>
        </nav>
        <div id="main">
          <div id="topbar">
            <div class="date-chip">
              <strong>${Utils.formatDate(game.week, game.year)}</strong>
              <span class="phase-pill">${game.seasonPhase}</span>
            </div>
            ${(() => {
              const f = game.weeklyFlow || { trainingConfirmed: false, recruitingDone: false };
              const step = !f.trainingConfirmed ? 1 : !f.recruitingDone ? 2 : 3;
              const cls = (n, done) => `flow-step ${done ? 'done' : step === n ? 'current' : ''}`;
              const asst = game.isAssistant && game.isAssistant();
              const trainingLabel = asst ? 'Training (Head Coach)' : 'Training Plan';
              return `<div class="flow-steps" title="The weekly coaching rhythm: ${asst ? 'the head coach runs training — you recruit, then advance.' : 'plan training, then recruit, then advance.'}">
                <button class="${cls(1, f.trainingConfirmed)}" data-flow-nav="training" style="cursor:pointer;">${f.trainingConfirmed ? '✓' : '1'} ${trainingLabel}</button>
                <span style="color:var(--text-faint);">→</span>
                <button class="${cls(2, f.recruitingDone)}" data-flow-nav="recruiting" style="cursor:pointer;">${f.recruitingDone ? '✓' : '2'} Recruiting</button>
                <span style="color:var(--text-faint);">→</span>
                <button class="${cls(3, false)}" data-flow-advance style="cursor:pointer;" title="Advance the week once training and recruiting are wrapped">3 Advance</button>
              </div>`;
            })()}
            <div style="display:flex; gap:8px;">
              ${(() => {
                const s = game.season;
                const racingNow = s && (s.playerMeetByWeek[game.week] ||
                  (game.week === s.nationalWeek && (s.nationalsFieldIds.M?.includes(game.playerSchoolId) || s.nationalsFieldIds.W?.includes(game.playerSchoolId))));
                return racingNow ? '' : '<button class="btn" id="btn-sim-race" title="Simulate weeks until your next race day">⏩ Sim to Race</button>';
              })()}
              <button class="btn primary" id="btn-advance-week">${(() => {
                const s = game.season;
                if (!s) return 'Advance Week ▸';
                const racing = s.playerMeetByWeek[game.week] ||
                  (game.week === s.nationalWeek && (s.nationalsFieldIds.M?.includes(game.playerSchoolId) || s.nationalsFieldIds.W?.includes(game.playerSchoolId)));
                return racing ? '🏁 Race & Advance ▸' : 'Advance Week ▸';
              })()}</button>
            </div>
          </div>
          <div id="screen-container"></div>
        </div>
      </div>`;

    root.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => UI.navigate(btn.dataset.nav));
    });

    root.querySelectorAll('[data-flow-nav]').forEach((btn) => {
      btn.addEventListener('click', () => UI.navigate(btn.dataset.flowNav));
    });
    // Step 3 in the flow strip is the same action as the Advance button.
    root.querySelectorAll('[data-flow-advance]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const adv = document.getElementById('btn-advance-week');
        if (adv) adv.click();
      });
    });

    document.getElementById('btn-advance-week').addEventListener('click', async () => {
      // The weekly rhythm is mandatory: training plan, then recruiting,
      // then the week advances.
      const flow = game.weeklyFlow || (game.weeklyFlow = { trainingConfirmed: false, recruitingDone: false });
      if (!flow.trainingConfirmed) {
        UI.toast('Step 1: set and confirm this week\'s training plan first.', 'error');
        UI.navigate('training');
        return;
      }
      if (!flow.recruitingDone) {
        UI.toast('Step 2: wrap up recruiting before advancing.', 'error');
        UI.navigate('recruiting');
        return;
      }
      // Week 1 Administrative Phase (spec Part 2, Section 15): Week 2 stays
      // locked until the season-setup checklist is complete.
      if (game.week1Complete && !game.week1Complete()) {
        UI.toast('Week 1 is the season-setup phase — complete the checklist on the Dashboard to unlock Week 2.', 'error');
        UI.navigate('dashboard');
        return;
      }
      const weekBefore = game.week;
      game.advanceWeek();
      try {
        await window.XCD.engine.SaveManager.autoSave(game);
      } catch (err) {
        UI.toast('Autosave failed: ' + err.message, 'error');
      }
      // If our team just raced, cut straight to the broadcast.
      const meet = game.lastPlayerMeetId && game.season && game.season.meets[game.lastPlayerMeetId];
      if (meet && meet.week === weekBefore && meet.results.M) {
        UI.state.currentScreen = 'racecenter';
      }
      // A new season always starts on the Dashboard.
      if (game.week < weekBefore) {
        UI.state.currentScreen = 'dashboard';
        UI.toast(`Welcome to the ${game.year} season!`, 'success', 2600);
      }
      UI.renderShell();
      UI.toast(`Advanced to ${Utils.formatDate(game.week, game.year)}`, 'success', 1800);
    });

    const simBtn = document.getElementById('btn-sim-race');
    if (simBtn) {
      simBtn.addEventListener('click', async () => {
        // The Week 1 checklist gates simming forward too (Section 15).
        if (game.week1Complete && !game.week1Complete()) {
          UI.toast('Week 1 is the season-setup phase — complete the checklist on the Dashboard first.', 'error');
          UI.navigate('dashboard');
          return;
        }
        // Advance until a week in which our team raced (guard: ~1.2 years),
        // stopping at a new season's Week 1 for the administrative phase.
        let raced = false;
        let rolledOver = false;
        for (let i = 0; i < 26 && !raced && !rolledOver; i++) {
          const wk = game.week;
          const s = game.season;
          const hadMeet = s && (s.playerMeetByWeek[wk] ||
            (wk === s.nationalWeek && (s.nationalsFieldIds.M?.includes(game.playerSchoolId) || s.nationalsFieldIds.W?.includes(game.playerSchoolId))));
          game.advanceWeek();
          if (game.week < wk) rolledOver = true;
          if (hadMeet) raced = true;
        }
        try {
          await window.XCD.engine.SaveManager.autoSave(game);
        } catch (err) {
          UI.toast('Autosave failed: ' + err.message, 'error');
        }
        if (raced) UI.state.currentScreen = 'racecenter';
        if (rolledOver) UI.state.currentScreen = 'dashboard'; // new seasons start at home
        UI.renderShell();
        UI.toast(`Simulated ahead to ${Utils.formatDate(game.week, game.year)}`, 'success', 2200);
      });
    }

    const container = document.getElementById('screen-container');
    const screen = UI.screens[UI.state.currentScreen] || UI.screens.dashboard;
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'screen';
    container.appendChild(wrapper);
    screen.render(wrapper);
  };
})();
