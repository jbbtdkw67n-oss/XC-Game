/*
 * Inbox — every decision in one place (Code Review Oct 2026 §4).
 *
 * Two layers:
 *   1. "Needs you now" — live decisions computed from the game state every
 *      render (training not confirmed, recruiting open, the Week 1 checklist,
 *      job offers waiting, an empty assistant chair, a roster over the limit,
 *      Signing Day). They disappear the moment they're handled.
 *   2. The saved Inbox (game.inbox) — items filled by the event bus
 *      (engine/events.js INBOX_RULES): injuries, commits and decommits, race
 *      results, the portal, Selection Day, the job market, the Hot Seat.
 *      Filterable, mark-read, clearable (one item, the read ones, or every
 *      notification the current filter shows), and each one jumps to the
 *      screen it's about.
 *
 * The Dashboard shows a compact version (UI.inboxDashboardCard) and the top
 * bar / sidebar carry the unread count.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const Inbox = () => window.XCD.engine.Inbox;

  let filter = 'all'; // all | action | unread | team | recruiting | career | results

  const CATEGORY = {
    'athlete:injured': 'team', 'staff:assistantLeft': 'career', 'season:started': 'team', 'portal:opened': 'team',
    'recruit:committed': 'recruiting', 'recruit:decommitted': 'recruiting', 'recruit:signingDay': 'recruiting',
    'jobs:marketOpened': 'career', 'jobs:newOpening': 'career', 'career:hotSeat': 'career', 'career:fired': 'career',
    'race:completed': 'results', 'nationals:selection': 'results'
  };
  const FILTERS = [
    { key: 'all', label: 'All' }, { key: 'action', label: 'Needs action' }, { key: 'unread', label: 'Unread' },
    { key: 'team', label: '👟 Team' }, { key: 'recruiting', label: '🎯 Recruiting' },
    { key: 'career', label: '💼 Career' }, { key: 'results', label: '🏁 Results' }
  ];
  const PRIORITY = {
    3: { tone: 'bad', label: 'Decision' },
    2: { tone: 'warn', label: 'Important' },
    1: { tone: 'muted', label: 'FYI' }
  };

  /* ---------------- Live decisions ---------------- */
  // Each: { key, icon, title, body, go, cta }. `go` is a screen id, or
  // 'jobs' for the Available Jobs picker.
  function decisions(game) {
    const out = [];
    const school = game.getPlayerSchool();
    const f = game.weeklyFlow || {};
    if (game.week === 1 && game.week1Complete && !game.week1Complete()) {
      out.push({ key: 'week1', icon: '📋', title: 'Finish the Week 1 season setup', body: 'Week 2 stays locked until the checklist on the Dashboard is complete.', go: 'dashboard', cta: 'Checklist' });
    }
    if (game.controlsTraining() && !f.trainingConfirmed) {
      out.push({ key: 'training', icon: '📋', title: "Confirm this week's training plan", body: 'Step 1 of the weekly rhythm.', go: 'training', cta: 'Training' });
    }
    if (!f.recruitingDone && game.week <= window.XCD.data.RECRUITING.SIGNING_WEEK) {
      const pts = (game.recruiting && game.recruiting.pointsLeft) || 0;
      out.push({ key: 'recruiting', icon: '🎯', title: game.week === window.XCD.data.RECRUITING.SIGNING_WEEK ? 'Signing Day — final recruiting calls' : 'Work your recruiting board',
        body: `${pts} recruiting point${pts === 1 ? '' : 's'} left this week.`, go: 'recruiting', cta: 'Recruiting' });
    }
    if (UI.jobOffersPending && game.seasonPhase === 'Offseason' && game.jobOffers &&
        (game.jobOffers.offers || []).some((o) => !o.rejected) && game.jobSearchClosedYear !== game.year) {
      const n = game.jobOffers.offers.filter((o) => !o.rejected).length;
      out.push({ key: 'jobs', icon: '📞', title: `${n} job${n === 1 ? '' : 's'} on the table`, body: `Take one, apply, or turn them all down. Offers hold until Week ${game.jobOffers.expiresWeek}.`, go: 'jobs', cta: 'View jobs' });
    }
    const C = window.XCD.engine.Coaching;
    if (!game.isAssistant() && C && C.assistantSeatVacant && C.assistantSeatVacant(game)) {
      out.push({ key: 'asst', icon: '🧑‍🏫', title: 'Your assistant chair is empty', body: game.assistantDeparture ? `${game.assistantDeparture.coachName} left — hire a replacement from the pool.` : 'Hire a coordinator from the pool.', go: 'school', cta: 'My Program' });
    }
    if (game.week === 1 && !game.isAssistant() && game.rosterLimitStatus) {
      const rl = game.rosterLimitStatus();
      if (rl.over) out.push({ key: 'roster', icon: '✂️', title: `Roster over the ${rl.limit}-athlete limit`, body: `Men ${rl.M} · Women ${rl.W}. Make your cuts on the Roster screen.`, go: 'roster', cta: 'Roster' });
    }
    if (game.week1NeedsReport && game.week1NeedsReport() && game.week === 1 && game.week1 && !game.week1.progressionReviewed) {
      out.push({ key: 'report', icon: '📈', title: 'Review the offseason progression report', body: 'See how every returner developed over the summer.', go: 'dashboard', cta: 'Dashboard' });
    }
    if (school && game.portal && game.portal.open) {
      const leaving = game.portal.entries.filter((e) => e.fromSchoolId === school.id && !e.destination).length;
      if (leaving) out.push({ key: 'portal', icon: '🔄', title: `${leaving} of your athletes are in the portal`, body: 'Make your pitch to keep them, or reload from other programs.', go: 'portal', cta: 'Portal' });
    }
    return out;
  }
  UI.inboxDecisions = decisions;

  /* ---------------- Navigation from an item ---------------- */
  function go(game, target) {
    if (!target) return;
    if (target === 'jobs') {
      if (UI.showJobOffersPopup && UI.showJobOffersPopup(game)) return;
      UI.navigate('dashboard');
      return;
    }
    const [screen, tab] = String(target).split(':');
    if (tab && UI.screens[screen] && UI.screens[screen].openTab) UI.screens[screen].openTab(tab);
    UI.navigate(UI.screens[screen] ? screen : 'dashboard');
  }
  UI.inboxGo = go;

  function when(game, it) {
    if (it.year === game.year && it.week === game.week) return 'This week';
    if (it.year === game.year) return `Week ${it.week}`;
    return `Wk ${it.week}, ${it.year}`;
  }

  function decisionHtml(d) {
    return `<div class="inbox-decision">
      <span class="inbox-decision-icon">${d.icon}</span>
      <div class="inbox-decision-body"><div class="inbox-decision-title">${Utils.escapeHtml(d.title)}</div>
        <div class="inbox-decision-sub">${Utils.escapeHtml(d.body)}</div></div>
      <button class="btn primary small" data-inbox-go="${d.go}">${Utils.escapeHtml(d.cta)} ▸</button>
    </div>`;
  }

  function itemHtml(game, it) {
    const p = PRIORITY[it.priority] || PRIORITY[1];
    return `<div class="inbox-item p${it.priority || 1}${it.read ? ' read' : ''}" data-inbox-item="${it.id}">
      <span class="inbox-item-icon t-${p.tone}">${it.icon || '•'}</span>
      <div class="inbox-item-body">
        <div class="inbox-item-title">${it.read ? '' : '<span class="unread-dot" aria-label="Unread"></span>'}${Utils.escapeHtml(it.title)}</div>
        ${it.body ? `<div class="inbox-item-sub">${Utils.escapeHtml(it.body)}</div>` : ''}
        <div class="inbox-item-meta"><span class="inbox-pri t-${p.tone}">${p.label}</span> · ${when(game, it)}</div>
      </div>
      <div class="inbox-item-actions">
        ${it.screen ? `<button class="btn small" data-inbox-open="${it.id}">Open ▸</button>` : ''}
        ${it.read ? '' : `<button class="btn small ghost" data-inbox-read="${it.id}" title="Mark read" aria-label="Mark read">✓</button>`}
        <button class="btn small ghost inbox-dismiss" data-inbox-dismiss="${it.id}" title="Clear this notification" aria-label="Clear this notification">✕</button>
      </div>
    </div>`;
  }

  function filtered(game) {
    const items = Inbox().items(game);
    if (filter === 'all') return items;
    if (filter === 'unread') return items.filter((i) => !i.read);
    if (filter === 'action') return items.filter((i) => !i.read && (i.priority || 1) >= 3);
    return items.filter((i) => CATEGORY[i.eventType] === filter);
  }

  function render(container) {
    const game = UI.state.game;
    const items = Inbox().items(game);
    const unread = Inbox().unread(game).length;
    const live = decisions(game);
    const list = filtered(game);
    const counts = {};
    FILTERS.forEach((f) => {
      const save = filter; filter = f.key; counts[f.key] = filtered(game).length; filter = save;
    });

    // Group by recency: this week, earlier this season, previous seasons.
    const groups = [
      { label: 'This week', rows: list.filter((i) => i.year === game.year && i.week === game.week) },
      { label: 'Earlier this season', rows: list.filter((i) => i.year === game.year && i.week !== game.week) },
      { label: 'Previous seasons', rows: list.filter((i) => i.year !== game.year) }
    ].filter((g) => g.rows.length);

    container.innerHTML = `
      <div class="screen-header">
        <h1>📥 Inbox</h1>
        <div class="actions">
          <span class="phase-pill">${unread} unread · ${items.length} total</span>
          <button class="btn" id="inbox-read-all" ${unread ? '' : 'disabled'}>✓ Mark all read</button>
          <button class="btn" id="inbox-clear" ${items.some((i) => i.read) ? '' : 'disabled'} title="Remove every read item">🧹 Clear read</button>
          <button class="btn danger" id="inbox-clear-all" ${list.length ? '' : 'disabled'} title="${filter === 'all' ? 'Remove every notification' : 'Remove every notification this filter shows'}">🗑 ${filter === 'all' ? 'Clear all' : 'Clear shown'}</button>
        </div>
      </div>
      <div class="card inbox-now ${live.length ? '' : 'calm'}">
        <h2>${live.length ? `⚡ Needs you now <span class="count-badge static">${live.length}</span>` : '✅ Nothing needs you right now'}</h2>
        ${live.length ? `<div class="inbox-decisions">${live.map(decisionHtml).join('')}</div>`
          : '<div class="inbox-empty-sub">Every decision for this week is handled. Advance, or sim ahead — the sim stops when something comes up.</div>'}
      </div>
      <div class="inbox-filters pill-tabs" role="tablist">
        ${FILTERS.map((f) => `<button data-inbox-filter="${f.key}" class="${filter === f.key ? 'active' : ''}">${f.label}${counts[f.key] ? ` <span class="pill-count">${counts[f.key]}</span>` : ''}</button>`).join('')}
      </div>
      <div class="card inbox-list">
        ${groups.length ? groups.map((g) => `
          <div class="inbox-group-label">${g.label}</div>
          ${g.rows.map((it) => itemHtml(game, it)).join('')}`).join('')
          : `<div class="m-empty">${items.length ? 'Nothing matches this filter.' : 'Your inbox is empty. Injuries, commitments, race results, the portal, Selection Day and job offers will land here as the season unfolds.'}</div>`}
      </div>`;

    container.querySelectorAll('[data-inbox-filter]').forEach((b) => {
      b.addEventListener('click', () => { filter = b.dataset.inboxFilter; render(container); });
    });
    const readAll = container.querySelector('#inbox-read-all');
    if (readAll) readAll.addEventListener('click', () => { Inbox().markAllRead(game); UI.renderShell(); });
    const clear = container.querySelector('#inbox-clear');
    if (clear) clear.addEventListener('click', () => { Inbox().clearRead(game); UI.renderShell(); });
    const clearAll = container.querySelector('#inbox-clear-all');
    if (clearAll) clearAll.addEventListener('click', () => confirmClear(game, list.length));
    wireCommon(container, game, () => UI.renderShell());
  }

  // Clear every notification the current filter shows (all of them on the
  // All filter) after a quick confirm. The "Needs you now" list is live game
  // state, so it is never cleared — only handled.
  function confirmClear(game, count) {
    const scope = filter === 'all' ? null : FILTERS.find((f) => f.key === filter);
    const ids = new Set(filtered(game).map((i) => i.id));
    UI.showModal(`
      <h2>🗑 Clear ${scope ? `${Utils.escapeHtml(scope.label)} notifications` : 'your Inbox'}?</h2>
      <p style="color:var(--text-dim); font-size:13.5px; line-height:1.5;">
        ${count} notification${count === 1 ? '' : 's'} will be removed${scope ? ' from this filter' : ''}. Anything under
        <strong>Needs you now</strong> stays until you handle it.
      </p>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
        <button class="btn" data-modal-close>Cancel</button>
        <button class="btn danger" id="inbox-clear-confirm">Clear ${count}</button>
      </div>`, (modal) => {
      modal.querySelector('#inbox-clear-confirm').addEventListener('click', () => {
        const n = Inbox().clearAll(game, scope ? (i) => ids.has(i.id) : null);
        UI.closeModal();
        UI.renderShell();
        UI.toast(`Cleared ${n} notification${n === 1 ? '' : 's'}.`);
      });
    });
  }

  // Shared wiring for the full screen and the Dashboard card.
  function wireCommon(root, game, refresh) {
    root.querySelectorAll('[data-inbox-go]').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); go(game, b.dataset.inboxGo); });
    });
    root.querySelectorAll('[data-inbox-read]').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); Inbox().markRead(game, b.dataset.inboxRead); refresh(); });
    });
    root.querySelectorAll('[data-inbox-dismiss]').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); Inbox().remove(game, b.dataset.inboxDismiss); refresh(); });
    });
    const open = (id) => {
      const it = Inbox().items(game).find((x) => x.id === id);
      if (!it) return;
      it.read = true;
      if (it.screen) go(game, it.screen); else refresh();
    };
    root.querySelectorAll('[data-inbox-open]').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); open(b.dataset.inboxOpen); });
    });
    root.querySelectorAll('[data-inbox-item]').forEach((row) => {
      row.addEventListener('click', (e) => { if (!e.target.closest('button')) open(row.dataset.inboxItem); });
    });
  }

  /* ---------------- Dashboard card ---------------- */
  UI.inboxDashboardCard = function (game) {
    if (!Inbox()) return '';
    const live = decisions(game).filter((d) => d.key !== 'training' && d.key !== 'recruiting');
    const unread = Inbox().unread(game);
    if (!live.length && !unread.length) return '';
    const top = unread.slice().sort((a, b) => (b.priority || 1) - (a.priority || 1)).slice(0, 3);
    return `
      <div class="card inbox-card" style="margin-bottom:16px;">
        <div class="inbox-card-head">
          <h2 style="margin:0;">📥 Inbox${unread.length ? ` <span class="count-badge static">${unread.length}</span>` : ''}</h2>
          <div style="display:flex; gap:6px;">
            ${unread.length ? '<button class="btn small ghost" data-inbox-card-clear title="Clear every unread notification shown here">🗑 Clear</button>' : ''}
            <button class="btn small" data-inbox-go="inbox">Open Inbox ▸</button>
          </div>
        </div>
        ${live.length ? `<div class="inbox-decisions">${live.slice(0, 3).map(decisionHtml).join('')}</div>` : ''}
        ${top.length ? `<div class="inbox-mini">${top.map((it) => itemHtml(game, it)).join('')}</div>` : ''}
      </div>`;
  };
  UI.wireInboxCard = function (root, game) {
    const card = root.querySelector('.inbox-card');
    if (!card) return;
    wireCommon(card, game, () => UI.renderShell());
    const clear = card.querySelector('[data-inbox-card-clear]');
    if (clear) clear.addEventListener('click', () => { Inbox().clearAll(game, (i) => !i.read); UI.renderShell(); });
  };

  UI.screens.inbox = { render, decisions };
})();
