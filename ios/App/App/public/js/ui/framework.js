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

  /* ---------------- Mobile detection ----------------
   * One breakpoint, shared with css/main.css: at or under 760px the game
   * wears its phone shell (bottom tab bar, card lists, bottom sheets).
   */
  const mobileQuery = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
  UI.isMobile = function () { return !!(mobileQuery && mobileQuery.matches); };
  if (mobileQuery) {
    // Crossing the breakpoint re-renders the shell so tables/cards and the
    // navigation swap to the right form factor (e.g. iPad rotation).
    const onFlip = () => { if (UI.state.game) UI.renderShell(); };
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', onFlip);
    else if (mobileQuery.addListener) mobileQuery.addListener(onFlip);
  }

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

  /* ---------------- Modern list row (UI overhaul) ----------------
   * One clean, scrollable list idiom used everywhere athletes, coaches and
   * programs are listed, and inside every profile: a leading colored status
   * circle, a bold title with a dimmed subtitle, and a trailing value.
   *
   * opts: {
   *   badge:  emoji / short text / avatar HTML for the leading circle,
   *   tone:   'gold' | 'accent' | 'good' | 'warn' | 'bad' | 'muted',
   *   title:  main line (may contain safe HTML), tag: faint suffix on the title,
   *   sub:    subtitle line (may contain safe HTML),
   *   meta:   trailing value (may contain safe HTML),
   *   mine:   highlight as the player's own,
   *   attrs:  { key: value } → data-key="value" for click delegation,
   *   clickable: adds the clickable affordance (default: true when attrs given)
   * }
   */
  UI.listRow = function (opts) {
    const o = opts || {};
    const tone = o.tone ? ` t-${o.tone}` : '';
    const attrs = o.attrs
      ? Object.entries(o.attrs).map(([k, v]) => `data-${k}="${String(v == null ? '' : v).replace(/"/g, '&quot;')}"`).join(' ')
      : '';
    const clickable = o.clickable != null ? o.clickable : !!o.attrs;
    const badge = o.badge != null && o.badge !== '' ? `<div class="lrow-badge${tone}">${o.badge}</div>` : '';
    const tag = o.tag ? ` <span class="tag">${o.tag}</span>` : '';
    const sub = o.sub ? `<div class="lrow-sub">${o.sub}</div>` : '';
    const meta = o.meta != null && o.meta !== '' ? `<div class="lrow-meta">${o.meta}</div>` : '';
    return `<div class="lrow${clickable ? ' clickable' : ''}${o.mine ? ' mine' : ''}" ${attrs}>
      ${badge}
      <div class="lrow-body"><div class="lrow-title">${o.title || ''}${tag}</div>${sub}</div>
      ${meta}
    </div>`;
  };

  // Wrap a set of list-row HTML strings in a scrollable list container.
  // scroll:true (default) caps the height so long histories scroll cleanly.
  UI.listGroup = function (rowsHtml, { scroll = true } = {}) {
    const rows = Array.isArray(rowsHtml) ? rowsHtml.join('') : (rowsHtml || '');
    return `<div class="lrow-list${scroll ? ' lrow-scroll' : ''}">${rows}</div>`;
  };

  // Wire a profile's tab bar: buttons carry data-pctab, panes carry
  // data-pcpane with matching values. Every pane stays in the DOM (only
  // hidden) so text search and deep links keep working.
  UI.wireProfileTabs = function (root) {
    const tabs = root.querySelectorAll('[data-pctab]');
    const panes = root.querySelectorAll('[data-pcpane]');
    if (!tabs.length) return;
    tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.pctab;
        tabs.forEach((b) => b.classList.toggle('active', b === btn));
        panes.forEach((p) => { p.hidden = p.dataset.pcpane !== key; });
      });
    });
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

  /*
   * Course-record mark for a race result (Course Records): always shown as a
   * single CR badge — a run that set or equaled the standing course record.
   * A newly-set record ('NCR' internally, so the "New Course Record" banner can
   * still headline it) simply reads CR in a brighter accent; a tie reads CR in
   * the muted accent. The mark rides on the finisher object (set by the race
   * engine) so it shows anywhere results are displayed.
   */
  UI.crTag = function (f) {
    if (!f || !f.cr) return '';
    const isNew = f.cr === 'NCR';
    return ` <span class="cr-badge${isNew ? ' ncr' : ''}" title="${isNew ? 'New Course Record' : 'Course Record'}">CR</span>`;
  };

  /*
   * National-record mark for a race result: NR is stamped on the finisher who
   * broke the all-time national record for the raced distance (set by the race
   * engine). Shown wherever course-record badges are, alongside any CR badge.
   */
  UI.nrTag = function (f) {
    if (!f || !f.nr) return '';
    return ` <span class="cr-badge nr" title="National Record">NR</span>`;
  };

  // A compact, clickable line of the current course records for a meet's
  // course (the record for each raced distance), for meet/course profiles.
  UI.meetCourseRecordLine = function (game, meet) {
    const Courses = window.XCD.engine.Courses;
    if (!Courses || !meet || !meet.distances) return '';
    const info = Courses.entryForMeet(game, meet);
    if (!info || !info.desc) return '';
    const key = info.desc.key;
    const ft = window.XCD.engine.Races.formatTime;
    const parts = [];
    ['M', 'W'].forEach((g) => {
      if (!meet.distances[g]) return;
      const rec = Courses.recordFor(game, key, g, meet.distances[g]);
      if (rec) {
        const who = rec.seeded ? '' : ` <span style="color:var(--text-faint);">${Utils.escapeHtml(rec.name)}</span>`;
        parts.push(`${g === 'M' ? "M" : "W"} ${rec.distanceKey}: <strong>${ft(rec.time)}</strong>${who}`);
      }
    });
    if (!parts.length) return '';
    return `<div class="course-record-line" data-course-key="${key}" title="Open the course record book" style="cursor:pointer; color:var(--text-dim); font-size:12.5px; margin-bottom:10px;">
      🏁 <strong style="color:var(--text);">Course Records</strong> — ${parts.join(' · ')} <span style="color:var(--accent-hover); font-size:11px;">▸ record book</span></div>`;
  };

  // Wire any rendered course-record lines to open the course profile.
  UI.wireCourseRecordLines = function (root, game) {
    root.querySelectorAll('[data-course-key]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (UI.showCourseCard) UI.showCourseCard(game, el.dataset.courseKey);
      });
    });
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

      // Card lists are now the format on EVERY screen size (UI overhaul):
      // whenever a screen supplies a card renderer we render clean cards, on
      // desktop flowing into a responsive grid. Screens without a card
      // renderer still fall back to the sortable table.
      const cardRenderer = config.mobileCard || config.card;
      const mobile = UI.isMobile();
      const useCards = !!cardRenderer;

      // Very large datasets (e.g. the national recruit pool) are capped per
      // view; sorting/searching still operates over the full set. Phones cap
      // lower — hundreds of card nodes is what makes mobile Safari stutter.
      const totalRows = rows.length;
      const cap = (useCards && mobile) ? Math.min(config.maxRows || 400, 120) : (config.maxRows || 400);
      const truncated = totalRows > cap;
      if (truncated) rows = rows.slice(0, cap);

      /* Card rendering: a sort bar + one tappable card per row instead of a
       * wide table. The same rows, sorting, search, and row-click behavior.
       * On desktop the cards flow into a responsive grid (.as-grid). */
      if (useCards) {
        const sortable = config.columns.filter((c) => c.label);
        const gridCls = (config.cardGrid !== false && !mobile) ? ' as-grid' : '';
        container.innerHTML = `
          <div class="sort-bar">
            <select class="search-input" data-sort-select aria-label="Sort by">
              ${sortable.map((c) => `<option value="${c.key}" ${c.key === state.sortKey ? 'selected' : ''}>Sort: ${c.label}</option>`).join('')}
            </select>
            <button class="btn sort-dir" data-sort-dir title="Toggle sort direction">${state.sortDir === 'asc' ? '↑' : '↓'}</button>
          </div>
          <div class="m-cards${gridCls}">
            ${rows.length
              ? rows.map((row, i) => `<div class="m-card ${config.onRowClick ? 'clickable' : ''}" data-row="${i}">${cardRenderer(row, i)}</div>`).join('')
              : `<div class="m-empty">${config.emptyMessage || 'No results match the current filters.'}</div>`}
          </div>
          ${truncated ? `<div style="color:var(--text-faint); font-size:12px; padding:8px 2px 0;">Showing ${cap} of ${totalRows.toLocaleString()} — narrow with search or sorting.</div>` : ''}`;

        const sel = container.querySelector('[data-sort-select]');
        sel.addEventListener('change', () => {
          state.sortKey = sel.value;
          const newCol = config.columns.find((c) => c.key === state.sortKey);
          state.sortDir = newCol && newCol.numeric ? 'desc' : 'asc';
          draw();
        });
        container.querySelector('[data-sort-dir]').addEventListener('click', () => {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          draw();
        });
        if (config.onRowClick) {
          container.querySelectorAll('.m-card[data-row]').forEach((el) => {
            el.addEventListener('click', (e) => {
              if (e.target.closest('button, select, input, a')) return; // in-card actions win
              config.onRowClick(rows[Number(el.dataset.row)]);
            });
          });
        }
        return;
      }

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

  /* ---------------- Screen routing ----------------
   * `mobile` marks the screens pinned to the phone's bottom tab bar (the
   * weekly rhythm: home → team → training → recruiting); everything else
   * lives one tap away in the "More" sheet. `short` is the tab-bar label.
   */
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠', mobile: true, short: 'Home' },
    { id: 'schedule', label: 'Schedule', icon: '📅' },
    { id: 'racecenter', label: 'Race Center', icon: '📺' },
    { id: 'rankings', label: 'Rankings', icon: '🏅' },
    { id: 'roster', label: 'Roster', icon: '👟', mobile: true, short: 'Team' },
    { id: 'training', label: 'Training', icon: '📋', mobile: true, short: 'Train' },
    { id: 'recruiting', label: 'Recruiting', icon: '🎯', mobile: true, short: 'Recruit' },
    { id: 'portal', label: 'Portal', icon: '🔄' },
    { id: 'school', label: 'My Program', icon: '🏫' },
    { id: 'history', label: 'History', icon: '🏛' },
    { id: 'courses', label: 'Course Records', icon: '🏁' },
    { id: 'world', label: 'World', icon: '🌎' },
    { id: 'news', label: 'News', icon: '📰' },
    { id: 'shop', label: 'Shop', icon: '🛒' },
    { id: 'saves', label: 'Save / Load', icon: '💾' }
  ];

  UI.navigate = function (screenId) {
    UI.state.currentScreen = screenId;
    UI.renderShell();
  };

  UI.renderShell = function () {
    const game = UI.state.game;
    const root = document.getElementById('root');
    const staleSheet = document.getElementById('more-sheet');
    if (staleSheet) staleSheet.remove(); // sheets never outlive a navigation
    UI.closeModal(); // modals belong to the screen that opened them
    if (!game) {
      UI.screens.menu.render(root);
      return;
    }

    const school = game.getPlayerSchool();
    const mobile = UI.isMobile();
    const primaryNav = NAV_ITEMS.filter((n) => n.mobile);
    const moreNav = NAV_ITEMS.filter((n) => !n.mobile);
    const inMore = moreNav.some((n) => n.id === UI.state.currentScreen);
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
        <nav id="bottombar" aria-label="Main navigation">
          <div class="bnav-row">
            ${primaryNav.map((n) => `
              <button class="bnav-item ${UI.state.currentScreen === n.id ? 'active' : ''}" data-nav="${n.id}">
                <span class="icon">${n.icon}</span>${n.short || n.label}
              </button>`).join('')}
            <button class="bnav-item ${inMore ? 'active' : ''}" data-more-toggle>
              <span class="icon">☰</span>More
            </button>
          </div>
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
              const trainingLabel = mobile ? 'Training' : (asst ? 'Training (Head Coach)' : 'Training Plan');
              return `<div class="flow-steps" title="The weekly coaching rhythm: ${asst ? 'the head coach runs training — you recruit, then advance.' : 'plan training, then recruit, then advance.'}">
                <button class="${cls(1, f.trainingConfirmed)}" data-flow-nav="training" style="cursor:pointer;">${f.trainingConfirmed ? '✓' : '1'} ${trainingLabel}</button>
                <span style="color:var(--text-faint);">→</span>
                <button class="${cls(2, f.recruitingDone)}" data-flow-nav="recruiting" style="cursor:pointer;">${f.recruitingDone ? '✓' : '2'} Recruiting</button>
                <span style="color:var(--text-faint);">→</span>
                <button class="${cls(3, false)}" data-flow-advance style="cursor:pointer;" title="Advance the week once training and recruiting are wrapped">3 Advance</button>
              </div>`;
            })()}
            <div class="topbar-actions">
              ${(() => {
                const s = game.season;
                const racingNow = s && (s.playerMeetByWeek[game.week] ||
                  (game.week === s.nationalWeek && (s.nationalsFieldIds.M?.includes(game.playerSchoolId) || s.nationalsFieldIds.W?.includes(game.playerSchoolId))));
                return racingNow ? '' : `<button class="btn" id="btn-sim-race" title="Simulate weeks until your next race day" aria-label="Sim to race">⏩${mobile ? '' : ' Sim to Race'}</button>`;
              })()}
              <button class="btn primary" id="btn-advance-week">${(() => {
                const s = game.season;
                if (!s) return mobile ? 'Advance ▸' : 'Advance Week ▸';
                const racing = s.playerMeetByWeek[game.week] ||
                  (game.week === s.nationalWeek && (s.nationalsFieldIds.M?.includes(game.playerSchoolId) || s.nationalsFieldIds.W?.includes(game.playerSchoolId)));
                return racing ? (mobile ? '🏁 Race ▸' : '🏁 Race & Advance ▸') : (mobile ? 'Advance ▸' : 'Advance Week ▸');
              })()}</button>
            </div>
          </div>
          <div id="screen-container"></div>
        </div>
      </div>`;

    root.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => UI.navigate(btn.dataset.nav));
    });

    // "More" bottom sheet (mobile): every secondary screen, one tap away.
    const moreToggle = root.querySelector('[data-more-toggle]');
    if (moreToggle) {
      moreToggle.addEventListener('click', () => {
        const existing = document.getElementById('more-sheet');
        if (existing) { existing.remove(); return; }
        const sheet = document.createElement('div');
        sheet.id = 'more-sheet';
        sheet.innerHTML = `
          <div class="sheet-panel">
            <div class="sheet-grip"></div>
            <div class="sheet-title">All Screens</div>
            <div class="sheet-grid">
              ${moreNav.map((n) => `
                <button class="sheet-item ${UI.state.currentScreen === n.id ? 'active' : ''}" data-sheet-nav="${n.id}">
                  <span class="icon">${n.icon}</span>${n.label}
                </button>`).join('')}
            </div>
          </div>`;
        sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.remove(); });
        sheet.querySelectorAll('[data-sheet-nav]').forEach((b) => {
          b.addEventListener('click', () => { sheet.remove(); UI.navigate(b.dataset.sheetNav); });
        });
        document.body.appendChild(sheet);
      });
    }

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

    // First-season tutorial (Update 15): the intro story for a brand-new
    // dynasty, then one-time tip banners per screen for season one only.
    if (UI.tutorial) UI.tutorial.onShellRender(game, wrapper);
  };
})();
