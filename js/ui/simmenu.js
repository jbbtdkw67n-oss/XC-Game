/*
 * Sim to a date (Code Review Oct 2026 §4) — the ⏩ menu in the top bar.
 *
 * Every target in Sim.TARGETS is one tap away: the next race, Conference,
 * Regionals, Nationals, the awards week, Signing Day, or next season. The
 * sim stops at the START of the target week (so the player still sets the
 * lineup or makes the signing call) and stops early whenever something
 * needs the player: a long injury, the job market opening, a firing, an
 * assistant leaving. A Sim Report then lists what happened on the way —
 * the stop reason, the decisions waiting, and every race the team ran.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  const ICONS = {
    nextRace: '🏃', conference: '🏟', regionals: '🗺', nationals: '🏆',
    offseason: '🎖', signingDay: '✍️', nextSeason: '📅'
  };
  const ORDER = ['nextRace', 'conference', 'regionals', 'nationals', 'offseason', 'signingDay', 'nextSeason'];

  const Sim = () => window.XCD.engine.Sim;
  const Events = () => window.XCD.engine.Events;

  function closeMenu() {
    const m = document.getElementById('sim-menu');
    if (m) m.remove();
    document.removeEventListener('click', outsideClick, true);
  }
  function outsideClick(e) {
    const m = document.getElementById('sim-menu');
    if (m && !m.querySelector('.sim-menu-panel').contains(e.target) && !e.target.closest('#btn-sim-menu')) closeMenu();
  }
  UI.closeSimMenu = closeMenu;

  // One menu row per target: label, the week it lands on, and how far away.
  function rowHtml(game, key) {
    const S = Sim();
    const t = S.TARGETS[key];
    const info = S.describeTarget(game, key);
    const disabled = !info.available;
    const when = info.available
      ? (info.weeks === 0 ? 'this week' : `in ${info.weeks} week${info.weeks === 1 ? '' : 's'}`)
      : info.why;
    return `<button class="sim-opt${disabled ? ' disabled' : ''}" data-sim-target="${key}" ${disabled ? 'disabled' : ''}>
      <span class="sim-opt-icon">${ICONS[key] || '⏩'}</span>
      <span class="sim-opt-body">
        <span class="sim-opt-label">${Utils.escapeHtml(t.label)}</span>
        <span class="sim-opt-sub">${info.weekLabel ? `${Utils.escapeHtml(info.weekLabel)} · ` : ''}${Utils.escapeHtml(when)}</span>
      </span>
      ${disabled ? '' : '<span class="sim-opt-go">▸</span>'}
    </button>`;
  }

  UI.toggleSimMenu = function (game, anchor) {
    if (document.getElementById('sim-menu')) { closeMenu(); return; }
    const stopsOn = UI.state.simStops !== false;
    const menu = document.createElement('div');
    menu.id = 'sim-menu';
    menu.innerHTML = `
      <div class="sim-menu-panel" role="menu">
        <div class="sheet-grip"></div>
        <div class="sim-menu-head">
          <div class="sim-menu-title">⏩ Sim to…</div>
          <div class="sim-menu-sub">Stops at the start of the week, so you still make the call.</div>
        </div>
        <div class="sim-opts">${ORDER.map((k) => rowHtml(game, k)).join('')}</div>
        <label class="sim-stop-toggle">
          <input type="checkbox" id="sim-stop-check" ${stopsOn ? 'checked' : ''}>
          <span><strong>Stop when something needs me</strong>
            <small>A 4+ week injury, the job market opening, a firing, or your assistant leaving.</small></span>
        </label>
      </div>`;
    document.body.appendChild(menu);
    // Desktop: a dropdown under the button. Phones: CSS turns it into a sheet.
    if (!UI.isMobile() && anchor) {
      const r = anchor.getBoundingClientRect();
      const panel = menu.querySelector('.sim-menu-panel');
      panel.style.top = `${Math.round(r.bottom + 6)}px`;
      panel.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
    }
    menu.addEventListener('click', (e) => { if (e.target === menu) closeMenu(); });
    menu.querySelector('#sim-stop-check').addEventListener('change', (e) => { UI.state.simStops = e.target.checked; });
    menu.querySelectorAll('[data-sim-target]').forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.simTarget;
        closeMenu();
        UI.simTo(game, key, { stopOn: UI.state.simStops === false ? [] : undefined });
      });
    });
    setTimeout(() => document.addEventListener('click', outsideClick, true), 0);
  };

  /*
   * Run a sim and present the outcome. opts:
   *   runRace — when the sim lands on a race week, run that race too and cut
   *             to the broadcast (the ⏩ Sim to Race button)
   *   stopOn  — passed to Sim.advanceUntil (undefined = default stop rules)
   */
  UI.simTo = async function (game, target, opts) {
    const o = opts || {};
    if (game.week1Complete && !game.week1Complete()) {
      UI.toast('Week 1 is the season-setup phase — complete the checklist on the Dashboard first.', 'error');
      UI.navigate('dashboard');
      return null;
    }
    const startYear = game.year;
    const startWeek = game.week;
    const mark = Events().mark(game);
    const result = Sim().advanceUntil(game, target, { stopOn: o.stopOn });
    let raced = false;
    if (o.runRace && result.reason === 'target' && Sim().playerRacesThisWeek(game)) {
      const wk = game.week;
      game.advanceWeek();
      result.weeks += 1;
      const meet = game.lastPlayerMeetId && game.season && game.season.meets[game.lastPlayerMeetId];
      raced = !!(meet && meet.week === wk && meet.results.M);
    }
    const all = Events().since(game, mark);
    const rolledOver = game.year > startYear;
    if (raced) UI.state.currentScreen = 'racecenter';
    if (rolledOver) UI.state.currentScreen = 'dashboard'; // new seasons start at home
    UI.renderShell();

    const jobsNow = UI.offerJobsAfter ? UI.offerJobsAfter(game, raced) : false;
    if (!raced && !jobsNow) {
      showReport(game, target, result, all, { startWeek, startYear });
    } else {
      UI.toast(`Simulated ahead to ${Utils.formatDate(game.week, game.year)}`, 'success', 2200);
    }
    try {
      await window.XCD.engine.SaveManager.autoSave(game);
    } catch (err) {
      UI.toast('Autosave failed: ' + err.message, 'error');
    }
    return result;
  };

  function reasonHtml(game, target, result) {
    const t = Sim().TARGETS[target] || { label: `Week ${target}` };
    if (result.reason === 'target') {
      const tip = target === 'signingDay' ? 'Lock in your final offers before the class signs.'
        : target === 'nextSeason' ? 'Complete the Week 1 checklist to start the season.'
        : target === 'offseason' ? 'Awards are in and the coaching market is moving.'
        : Sim().playerRacesThisWeek(game) ? 'Race week — set your lineup, then Race & Advance.'
        : 'You are here — make this week\'s calls, then advance.';
      return { tone: 'good', icon: '✅', title: `Arrived: ${t.label}`, body: tip };
    }
    if (result.reason === 'event') {
      return { tone: 'warn', icon: '✋', title: 'Stopped early — something needs you', body: `The sim paused before ${t.label}. Handle it, then sim again.` };
    }
    if (result.reason === 'seasonSetup') {
      return { tone: 'accent', icon: '📅', title: `A new season: ${game.year}`, body: 'The sim never skips Week 1 — complete the season-setup checklist on the Dashboard.' };
    }
    return { tone: 'muted', icon: '⏸', title: 'Paused', body: 'Reached the sim limit for one run.' };
  }

  function showReport(game, target, result, all, start) {
    const rules = Events().INBOX_RULES;
    const stops = result.events || [];
    const races = all.filter((e) => e.type === 'race:completed');
    const injuries = all.filter((e) => e.type === 'athlete:injured');
    const commits = all.filter((e) => e.type === 'recruit:committed');
    const r = reasonHtml(game, target, result);
    const ord = (n) => (n ? Utils.ordinal(n) : '—');
    const placeTone = (n) => (!n ? 'muted' : n === 1 ? 'gold' : n <= 3 ? 'good' : 'accent');

    const stopRows = stops.map((e) => {
      const it = rules[e.type] ? rules[e.type](e.payload) : { title: e.type, body: '' };
      return UI.listRow({
        badge: it.priority >= 3 ? '❗' : '•', tone: it.priority >= 3 ? 'bad' : 'warn',
        title: Utils.escapeHtml(it.title), sub: Utils.escapeHtml(it.body || ''),
        meta: it.screen ? `<button class="btn small" data-report-go="${it.screen}">Open ▸</button>` : '',
        clickable: false
      });
    });
    const raceRows = races.map((e) => UI.listRow({
      badge: '🏁', tone: placeTone(Math.min(e.payload.places.M || 99, e.payload.places.W || 99)),
      title: Utils.escapeHtml(e.payload.name), sub: `Week ${e.week}`,
      meta: `<span class="sim-places"><span>M ${ord(e.payload.places.M)}</span><span>W ${ord(e.payload.places.W)}</span></span>`,
      clickable: false
    }));

    const fyi = [];
    if (injuries.length) fyi.push(`🩹 ${injuries.length} injur${injuries.length === 1 ? 'y' : 'ies'} on your roster`);
    if (commits.length) fyi.push(`✍️ ${commits.length} new commit${commits.length === 1 ? '' : 's'}`);

    UI.showModal(`
      <div class="sim-report">
        <div class="sim-report-head">
          <h2>⏩ Simulated ${result.weeks} week${result.weeks === 1 ? '' : 's'}</h2>
          <div class="sim-report-span">Week ${start.startWeek}, ${start.startYear} → <strong>${Utils.formatDate(game.week, game.year)}</strong> · ${Utils.escapeHtml(game.seasonPhase)}</div>
        </div>
        <div class="sim-reason t-${r.tone}">
          <span class="sim-reason-icon">${r.icon}</span>
          <div><div class="sim-reason-title">${Utils.escapeHtml(r.title)}</div><div class="sim-reason-body">${Utils.escapeHtml(r.body)}</div></div>
        </div>
        ${stopRows.length ? `<h3 class="sim-report-h">Needs you</h3>${UI.listGroup(stopRows, { scroll: false })}` : ''}
        ${raceRows.length ? `<h3 class="sim-report-h">Your races</h3>${UI.listGroup(raceRows)}` : ''}
        ${fyi.length ? `<div class="sim-fyi">${fyi.map((t) => `<span>${t}</span>`).join('')}</div>` : ''}
        <div class="sim-report-foot">
          <button class="btn" data-report-go="inbox">📥 Open Inbox</button>
          ${races.length && game.lastPlayerMeetId ? '<button class="btn" data-report-go="racecenter">📺 Last race</button>' : ''}
          <button class="btn primary" data-modal-close>Continue</button>
        </div>
      </div>`, (modal) => {
      modal.querySelectorAll('[data-report-go]').forEach((b) => {
        b.addEventListener('click', () => { UI.closeModal(); UI.navigate(b.dataset.reportGo); });
      });
    });
  }
  UI.showSimReport = showReport;
})();
