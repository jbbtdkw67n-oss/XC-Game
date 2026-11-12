/*
 * Transfer Portal screen (Update 15): the Transfer Points system.
 * Browse entries, open a pursuit profile, and slide recruiting points onto
 * targets — your live commit percentage (and every rival school's) shows on
 * the profile. Also shows your own departures.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const Portal = () => window.XCD.engine.Portal;

  let activeGender = 'M';
  let statusFilter = 'all'; // all | open | mine | done

  // Is the player allowed to work the current window?
  function playerEligible(game) {
    const portal = game.portal;
    if (!portal || !portal.open) return false;
    if (portal.summer && (game.getPlayerSchool().division || 'DI') === 'DI') return false;
    return true;
  }

  /* ---------------- The pursuit profile (points slider) ---------------- */
  function showPursuit(game, entry, container) {
    const P = Portal();
    const a = game.getAthlete(entry.athleteId);
    if (!a) return;
    const school = game.getPlayerSchool();
    const pp = P.ensurePlayerPoints(game);
    const lock = P.pointsToLock(game, a, school, entry);
    const alloc = (pp.allocations && pp.allocations[a.id]) || 0;
    const spentElsewhere = P.transferPointsSpent(game) - alloc;
    const maxAlloc = Math.max(0, Math.min(lock, pp.budget - spentElsewhere));
    const prefs = P.transferPreferences(game, a, entry);
    const eligible = playerEligible(game) && entry.fromSchoolId !== game.playerSchoolId && !entry.destination;

    // Rival weights are stable for the window; the slider only moves YOUR share.
    const wp = P.winProbabilities(game, entry);
    const rivals = entry.offers
      .filter((sid) => sid !== game.playerSchoolId && game.getSchool(sid))
      .map((sid) => ({ sid, school: game.getSchool(sid), w: (entry.cpuPoints && entry.cpuPoints[sid]) || 1 }));
    const wsum = rivals.reduce((s, r) => s + r.w, 0);

    const pctFor = (points) => Math.min(1, lock > 0 ? points / lock : 0);
    const rivalRows = (p) => rivals
      .map((r) => ({ ...r, pct: wsum > 0 ? (1 - p) * (r.w / wsum) : 0 }))
      .sort((x, y) => y.pct - x.pct);

    const prefsHtml = prefs.map((pref) => {
      let matched = false;
      try { matched = !!pref.match(school); } catch (e) { matched = false; }
      return `<div class="attr-row">
        <span>${pref.icon} ${Utils.escapeHtml(pref.label)}</span>
        <span style="color:${matched ? 'var(--success)' : 'var(--text-faint)'}; font-weight:600;">${matched ? '✓ Your program fits' : 'Not a match'}</span>
      </div>`;
    }).join('');

    const fromSchool = game.getSchool(entry.fromSchoolId);
    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <div class="player-card-header">
        <div style="flex:0 0 auto; margin-right:14px;">${UI.avatar(a, { size: 64, outfit: 'jersey' })}</div>
        <div class="who">
          <h2>${Utils.escapeHtml(a.fullName)}</h2>
          <div class="sub">${a.classYear} • ${a.gender === 'M' ? "Men's" : "Women's"} • from ${Utils.escapeHtml(fromSchool?.name || '?')}</div>
          <div class="sub">In the portal: ${Utils.escapeHtml(entry.reason)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:26px; font-weight:800;">${Math.round(a.currentOverall)}</div>
          <div style="font-size:12px; color:var(--text-dim);">OVERALL • POT ${Math.round(a.potential)}</div>
        </div>
      </div>

      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>What ${Utils.escapeHtml(a.firstName)} Is Looking For</h3>
        ${prefsHtml}
        <div style="font-size:12px; color:var(--text-faint); margin-top:6px;">Each preference your program matches lowers the points needed to lock the commit.</div>
      </div>

      ${eligible ? `
      <div class="card" style="padding:12px; margin-bottom:14px; border-left:3px solid var(--accent);">
        <h3>Assign Transfer Points</h3>
        <div style="display:flex; align-items:center; gap:12px; margin:10px 0 4px;">
          <input type="range" id="tp-slider" min="0" max="${maxAlloc}" step="1" value="${alloc}" style="flex:1; min-height:28px;">
          <div style="text-align:right; min-width:96px;">
            <div id="tp-pts" style="font-weight:800; font-size:18px;">${alloc}</div>
            <div style="font-size:11px; color:var(--text-dim);">of ${lock} to lock</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="flex:1;">${UI.meter(pctFor(alloc) * 100, 'green')}</div>
          <div id="tp-pct" style="font-weight:800; font-size:16px; min-width:64px; text-align:right; color:${pctFor(alloc) >= 1 ? 'var(--success)' : 'var(--text)'};">
            ${pctFor(alloc) >= 1 ? 'LOCKED' : Math.round(pctFor(alloc) * 100) + '%'}
          </div>
        </div>
        <div style="font-size:12px; color:var(--text-dim); margin-top:6px;">
          <span id="tp-left">${P.transferPointsLeft(game)}</span> of ${pp.budget} points left this window
          ${maxAlloc < lock ? ' • <span style="color:var(--warning);">not enough points left to lock this athlete</span>' : ''}
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn primary" id="tp-save" style="flex:1;">💾 Set Points</button>
          ${alloc > 0 ? '<button class="btn danger" id="tp-withdraw">Withdraw</button>' : ''}
        </div>
      </div>` : entry.destination ? `
      <div class="card" style="padding:12px; margin-bottom:14px; color:var(--text-dim);">
        Committed to <strong>${Utils.escapeHtml(game.getSchool(entry.destination)?.name || '?')}</strong>.
      </div>` : ''}

      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>The Race — ${entry.offers.length} school${entry.offers.length === 1 ? '' : 's'} pursuing</h3>
        <div id="tp-race">
          ${entry.offers.includes(game.playerSchoolId) ? `
          <div class="attr-row" style="margin-bottom:4px;">
            <span style="min-width:170px;"><strong>${Utils.escapeHtml(school.name)}</strong> <span style="color:var(--accent);">(You)</span></span>
            <div style="flex:1; margin:0 8px;">${UI.meter(wp.pPlayer * 100)}</div>
            <span id="tp-race-you" style="font-size:12px; font-weight:700; min-width:38px; text-align:right;">${Math.round(wp.pPlayer * 100)}%</span>
          </div>` : ''}
          ${rivalRows(wp.pPlayer).map((r, i) => `
          <div class="attr-row" style="margin-bottom:4px;">
            <span style="min-width:170px;">${Utils.escapeHtml(r.school.name)}</span>
            <div style="flex:1; margin:0 8px;"><div class="meter yellow"><span data-rival-bar="${i}" style="width:${Math.round(r.pct * 100)}%"></span></div></div>
            <span data-rival-pct="${i}" style="font-size:12px; font-weight:700; min-width:38px; text-align:right;">${Math.round(r.pct * 100)}%</span>
          </div>`).join('') || '<div style="color:var(--text-dim); font-size:13px;">No other programs are pursuing yet.</div>'}
        </div>
        <div style="font-size:12px; color:var(--text-faint); margin-top:6px;">Percentages are live win odds. Lock at 100% and the commit is guaranteed; otherwise the athlete decides when the window closes.</div>
      </div>

      <div style="display:flex; gap:8px;">
        <button class="btn" id="tp-scout">📋 Full Scouting Report</button>
      </div>
    `, (modal) => {
      modal.querySelector('#tp-scout').addEventListener('click', () => UI.showPlayerCard(a, game));
      if (!eligible) return;
      const slider = modal.querySelector('#tp-slider');
      const update = () => {
        const v = Number(slider.value);
        const p = pctFor(v);
        modal.querySelector('#tp-pts').textContent = v;
        const pctEl = modal.querySelector('#tp-pct');
        pctEl.textContent = p >= 1 ? 'LOCKED' : Math.round(p * 100) + '%';
        pctEl.style.color = p >= 1 ? 'var(--success)' : 'var(--text)';
        const meter = pctEl.parentElement.querySelector('.meter span');
        if (meter) meter.style.width = (p * 100) + '%';
        modal.querySelector('#tp-left').textContent = Math.max(0, pp.budget - spentElsewhere - v);
        const you = modal.querySelector('#tp-race-you');
        if (you) you.textContent = Math.round(p * 100) + '%';
        rivalRows(p).forEach((r, i) => {
          const bar = modal.querySelector(`[data-rival-bar="${i}"]`);
          const pct = modal.querySelector(`[data-rival-pct="${i}"]`);
          if (bar) bar.style.width = Math.round(r.pct * 100) + '%';
          if (pct) pct.textContent = Math.round(r.pct * 100) + '%';
        });
      };
      slider.addEventListener('input', update);
      modal.querySelector('#tp-save').addEventListener('click', () => {
        const v = Number(slider.value);
        const result = v > 0
          ? Portal().setTransferPoints(game, a.id, v)
          : Portal().setTransferPoints(game, a.id, 0);
        UI.toast(result.message, result.ok ? 'success' : 'error');
        UI.closeModal();
        if (container) render(container);
      });
      const wd = modal.querySelector('#tp-withdraw');
      if (wd) wd.addEventListener('click', () => {
        const result = Portal().setTransferPoints(game, a.id, 0);
        UI.toast(result.message, result.ok ? 'success' : 'error');
        UI.closeModal();
        if (container) render(container);
      });
    });
  }

  /* ---------------- Closed window ----------------
   * Between windows the screen is a briefing: when the next window opens,
   * how the last one went for the country and for the player's program, who
   * on the roster might leave next, and how the two windows work.
   */
  function renderClosed(game, container) {
    const P = Portal();
    const school = game.getPlayerSchool();
    const last = (game.history.portalSummaries || {})[game.year - 1] || null;
    const summers = game.history.summerPortals || {};
    const lastSummer = summers[game.year] || summers[game.year - 1] || null;
    const haul = last && last.inBySchool && last.inBySchool[school.id];
    const lost = (last && last.outBySchool && last.outBySchool[school.id]) || 0;
    const weeksOut = P.ENTRY_WEEK - game.week;

    // Who might leave next: the roster's highest transfer risks.
    const risks = ['M', 'W'].flatMap((g) => game.getRoster(school.id, g))
      .map((a) => ({ a, r: P.transferRisk(game, a) }))
      .filter((x) => x.r && !x.r.graduating && (x.r.score || 0) > 0)
      .sort((x, y) => (y.r.score || 0) - (x.r.score || 0));
    const worried = risks.filter((x) => (x.r.score || 0) >= 35);
    const riskRows = (worried.length ? worried : risks).slice(0, 6).map(({ a, r }) => UI.listRow({
      badge: UI.avatar(a, { size: 40 }),
      title: Utils.escapeHtml(a.fullName),
      tag: `${a.gender === 'M' ? 'Men' : 'Women'} · ${a.classYear}`,
      sub: `${Math.round(a.currentOverall)} OVR${(r.reasons || []).length ? ` · ${Utils.escapeHtml(r.reasons[0].label || r.reasons[0])}` : ''}`,
      meta: `<div style="color:${r.level.color}; font-weight:700;">${r.level.label}</div><div class="small">transfer risk</div>`,
      attrs: { ath: a.id }
    }));

    const tile = (label, value, sub) => `<div class="stat-tile"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
    const how = (icon, title, text) => `<div class="card how-card"><h3>${icon} ${title}</h3><div class="note-card">${text}</div></div>`;
    container.innerHTML = `
      <div class="screen-header">${UI.screenTitle('Portal', 'Transfer portal · closed')}</div>
      <div class="grid cols-4" style="margin-bottom:16px;">
        ${tile('Window Opens', weeksOut > 0 ? `${weeksOut} wk` : `Week ${P.ENTRY_WEEK}`, weeksOut > 0 ? `Week ${P.ENTRY_WEEK}, after nationals` : 'after next season\'s nationals')}
        ${tile('Last Cycle', last ? last.moved : '—', last ? `transfers from ${last.entries} portal entries` : 'no window has closed yet')}
        ${tile(`${Utils.escapeHtml(school.name)} Landed`, haul ? haul.count : (last ? 0 : '—'), haul ? `best ${Math.round(haul.best)} OVR${haul.elite ? ` · ${haul.elite} elite` : ''}` : 'transfers in last cycle')}
        ${tile(`${Utils.escapeHtml(school.name)} Lost`, last ? lost : '—', 'transfers out last cycle')}
      </div>
      ${UI.sectionLabel('Who Might Leave')}
      ${riskRows.length
        ? `<div class="card">${UI.listGroup(riskRows, { scroll: false })}
            <div class="foot-note">Transfer risk builds from morale, playing time, development and the season the team had. Open a runner for the reasons, and what would keep them.</div></div>`
        : '<div class="card note-card">Nobody on the roster is thinking about leaving right now.</div>'}
      ${UI.sectionLabel('How the Portal Works')}
      <div class="grid cols-3">
        ${how('🎯', 'Transfer Points', `Each window your program earns a points budget from prestige and your recruiting skill. Slide points onto portal athletes: enough points locks a commit at 100%, or divide the budget to chase several at once. A national title raises the next budget; a poor season lowers it.`)}
        ${how('🍂', 'Fall Window', `Opens after nationals (Week ${P.ENTRY_WEEK}) and closes at Week ${P.DECISION_WEEK}. Every division can recruit it. A transfer costs the athlete a year of eligibility.`)}
        ${how('☀️', 'Summer Window', `Weeks 1-${P.SUMMER_FINAL_WEEK}, for Division II and III programs only, stocked with Division I roster cuts.${lastSummer ? ` Last summer ${lastSummer.entries} cuts entered and ${lastSummer.placed} found a new program.` : ''}`)}
      </div>`;
    container.querySelectorAll('[data-ath]').forEach((el) => {
      el.addEventListener('click', () => UI.openAthlete(game, el.dataset.ath));
    });
  }

  /* ---------------- Main render ---------------- */
  function render(container) {
    const game = UI.state.game;
    const portal = game.portal;
    const P = Portal();

    if (!portal) { renderClosed(game, container); return; }
    const summer = !!portal.summer;
    const eligible = playerEligible(game);
    const pp = eligible ? P.ensurePlayerPoints(game) : (portal.player || null);
    const ptsLeft = pp ? P.transferPointsLeft(game) : 0;

    const entries = portal.entries
      .map((e) => ({ e, a: game.getAthlete(e.athleteId) }))
      .filter((x) => x.a && x.a.gender === activeGender);

    const pursuing = portal.entries.filter((e) => !e.destination && e.offers.includes(game.playerSchoolId)).length;
    const myDepartures = portal.entries.filter((e) => e.fromSchoolId === game.playerSchoolId);
    // Status filter: everyone, still deciding, the player's targets, committed.
    const inStatus = (e, id) => id === 'all' ? true
      : id === 'open' ? !e.destination
      : id === 'mine' ? e.offers.includes(game.playerSchoolId) || e.destination === game.playerSchoolId
      : !!e.destination;
    const statusCount = (id) => entries.filter((x) => inStatus(x.e, id)).length;

    container.innerHTML = `
      <div class="screen-header">
        ${UI.screenTitle('Portal', `${summer ? 'Summer transfer window' : 'Transfer portal'} · ${portal.open ? '<strong style="color:var(--success);">Open</strong>' : 'closed'}`)}
        <div class="actions">
          <div class="pill-tabs">
            <button id="g-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="g-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
          <input class="search-input" id="portal-search" placeholder="Search portal...">
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:16px;">
        ${eligible && pp ? `
        <div class="stat-tile"><div class="label">Transfer Points</div><div class="value">${ptsLeft}</div>
          <div class="sub">of ${pp.budget} · ${pp.titleBonus ? `title boost +${pp.titleBonus}` : pp.seasonAdj ? `down season ${pp.seasonAdj}` : 'prestige + recruiting'}</div></div>
        <div class="stat-tile"><div class="label">Pursuing</div><div class="value">${pursuing}</div><div class="sub">of ${P.PLAYER_OFFER_LIMIT} max</div></div>` : `
        <div class="stat-tile"><div class="label">Window</div><div class="value">${portal.open ? 'Open' : 'Closed'}</div><div class="sub">${summer ? 'Division II and III only' : `decisions by Week ${P.DECISION_WEEK}`}</div></div>
        <div class="stat-tile"><div class="label">Committed</div><div class="value">${portal.entries.filter((e) => e.destination).length}</div><div class="sub">have picked a new program</div></div>`}
        <div class="stat-tile"><div class="label">In the Portal</div><div class="value">${portal.entries.length}</div>
          <div class="sub">${portal.entries.filter((e) => !e.destination).length} still deciding</div></div>
        <div class="stat-tile"><div class="label">Leaving You</div><div class="value">${myDepartures.length}</div>
          <div class="sub">${myDepartures.length ? `${myDepartures.filter((e) => e.destination).length} have committed elsewhere` : 'nobody from your roster'}</div></div>
      </div>

      ${summer ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent); padding:10px 14px; font-size:13px;">
          ☀️ Division I roster cuts looking to continue their careers. This window is
          <strong>exclusive to Division II and III programs</strong>${(game.getPlayerSchool().division || 'DI') === 'DI'
            ? ' — as a Division I coach you can only watch the market move.'
            : ' — spend your transfer points before it closes at the end of Week ' + P.SUMMER_FINAL_WEEK + '.'}
        </div>` : ''}
      ${UI.followersCard ? UI.followersCard(game) : ''}
      ${myDepartures.length ? `
        ${UI.sectionLabel('Leaving Your Program')}
        <div class="card" style="margin-bottom:4px;">
          ${UI.listGroup(myDepartures.map((e) => {
            const a = game.getAthlete(e.athleteId);
            if (!a) return '';
            const to = e.destination && game.getSchool(e.destination);
            return UI.listRow({
              badge: UI.avatar(a, { size: 40 }),
              title: Utils.escapeHtml(a.fullName),
              tag: `${a.gender === 'M' ? 'Men' : 'Women'} · ${a.classYear}`,
              sub: `${Math.round(a.currentOverall)} OVR · ${Utils.escapeHtml(e.reason)}`,
              meta: to ? `<div style="color:var(--danger); font-weight:700;">→ ${Utils.escapeHtml(to.name)}</div><div class="small">committed</div>`
                : `<div>${portal.open ? 'Deciding' : 'Staying'}</div><div class="small">${e.offers.length} school${e.offers.length === 1 ? '' : 's'} pursuing</div>`,
              attrs: { ath: a.id }
            });
          }), { scroll: false })}
        </div>` : ''}

      ${UI.sectionLabel(summer ? 'Division I Cuts' : 'The Portal')}
      <div class="filter-bar">
        <div class="pill-tabs" id="portal-status">
          ${[['all', 'All'], ['open', 'Deciding'], ['mine', 'My Targets'], ['done', 'Committed']].map(([id, label]) =>
            `<button data-pstatus="${id}" class="${statusFilter === id ? 'active' : ''}">${label} <span class="pill-count">${statusCount(id)}</span></button>`).join('')}
        </div>
        <span class="count-note">${entries.length} ${activeGender === 'M' ? 'men' : 'women'} in the portal</span>
      </div>
      <div class="card"><div id="portal-table"></div></div>
      <div class="foot-note">${eligible && pp ? 'Tap a runner to slide points onto them: enough points locks the commit at 100%, or divide the budget across several targets. ' : ''}A transfer costs a year of eligibility, so Elig is the seasons a runner would give your program. Matching a runner's preferences makes them cheaper to land.</div>`;

    // Eligibility a transfer will actually give the new program. Transferring
    // costs a year — the athlete ages a class at the rollover — so a fall
    // portal athlete brings (eligibilityRemaining − 1) seasons. Summer-window
    // athletes already aged this offseason (they were cut after the rollover),
    // so they bring their full remaining eligibility.
    const seasonsLeft = (a) => Math.max(0, (a.eligibilityRemaining || 0) - (summer ? 0 : 1));

    const yourPct = (e, a) => {
      if (!e.offers.includes(game.playerSchoolId) || e.destination) return null;
      const wp = P.winProbabilities(game, e);
      return Math.round(wp.pPlayer * 100);
    };

    const statusHtml = (r) => {
      if (r.e.destination) {
        const to = game.getSchool(r.e.destination);
        const mine = r.e.destination === game.playerSchoolId;
        return `<span style="color:${mine ? 'var(--success)' : 'var(--text-dim)'};">→ ${Utils.escapeHtml(to?.name || '?')}</span>`;
      }
      if (r.e.fromSchoolId === game.playerSchoolId) return '<span style="color:var(--danger);">Your player</span>';
      if (!portal.open) return '<span style="color:var(--text-faint);">Stayed</span>';
      if (!eligible) return '<span style="color:var(--text-faint);">—</span>';
      const pct = yourPct(r.e, r.a);
      if (pct !== null) {
        return `<button class="btn small ${pct >= 100 ? '' : 'primary'}" data-pursue="${r.a.id}" style="${pct >= 100 ? 'color:var(--success); font-weight:700;' : ''}">${pct >= 100 ? '🔒 100%' : pct + '% ▸'}</button>`;
      }
      return `<button class="btn small primary" data-pursue="${r.a.id}">🎯 Recruit</button>`;
    };

    const table = UI.renderSortableTable(container.querySelector('#portal-table'), {
      emptyMessage: 'Nobody in the portal matches this filter.',
      rows: entries.filter((x) => inStatus(x.e, statusFilter)).map(({ e, a }) => ({
        e, a,
        name: a.fullName,
        lastName: a.lastName,
        firstName: a.firstName,
        overall: a.currentOverall,
        potential: a.potential,
        classYear: a.classYear,
        eligLeft: seasonsLeft(a),
        from: game.getSchool(e.fromSchoolId)?.name || '?',
        reason: e.reason,
        offers: e.offers.length,
        myPct: yourPct(e, a) ?? -1,
        status: e.destination ? 2 : e.offers.includes(game.playerSchoolId) ? 1 : 0
      })),
      defaultSort: 'overall',
      defaultDir: 'desc',
      searchKeys: ['name', 'from', 'reason', 'classYear'],
      // Keep the classic wide desktop table (cards on phones only).
      cardsOnDesktop: false,
      onRowClick: (row) => showPursuit(game, row.e, container),
      // Phone view: portal entries as cards with the pursuit action right on
      // the card — tap anywhere to open the points slider.
      mobileCard: (r) => `
          <div class="m-head">
            ${UI.avatar(r.a, { size: 42 })}
            <div class="m-title">${Utils.escapeHtml(r.name)}
              <div class="m-sub">${r.classYear} • ${r.eligLeft > 0 ? r.eligLeft + ' yr' + (r.eligLeft === 1 ? '' : 's') + ' left' : 'final year'} • from ${Utils.escapeHtml(r.from)}</div>
              <div class="m-sub">${Utils.escapeHtml(r.reason)} • ${r.offers} school${r.offers === 1 ? '' : 's'} pursuing</div>
            </div>
            <div class="m-badge">${UI.ratingBadge(r.overall)}
              <div class="m-sub">POT ${Math.round(r.potential)}</div>
            </div>
          </div>
          <div class="m-actions">${statusHtml(r)}</div>`,
      columns: [
        { key: 'name', label: 'Runner', grow: true, sortValue: (r) => `${r.lastName} ${r.firstName}`, render: (r) => `<span class="name-cell">${UI.avatar(r.a, { size: 24 })} <strong>${Utils.escapeHtml(r.name)}</strong></span>` },
        { key: 'classYear', label: 'Class' },
        {
          key: 'eligLeft', label: 'Elig', numeric: true,
          title: 'Seasons of eligibility the athlete will give your program (transferring uses one year — they move up a class)',
          render: (r) => r.eligLeft > 0
            ? `${r.eligLeft} yr${r.eligLeft === 1 ? '' : 's'}`
            : '<span style="color:var(--text-faint);">final</span>'
        },
        { key: 'overall', label: 'OVR', numeric: true, render: (r) => UI.ratingBadge(r.overall) },
        { key: 'potential', label: 'POT', numeric: true, render: (r) => UI.ratingBadge(r.potential) },
        { key: 'from', label: 'From' },
        { key: 'reason', label: 'Why' },
        { key: 'offers', label: 'Schools', numeric: true },
        {
          key: 'myPct', label: 'Your %', numeric: true,
          render: (r) => r.myPct >= 0
            ? `<span style="font-weight:700; color:${r.myPct >= 100 ? 'var(--success)' : 'var(--text)'};">${r.myPct}%</span>`
            : '<span style="color:var(--text-faint);">—</span>'
        },
        { key: 'status', label: 'Status', render: statusHtml }
      ]
    });

    container.querySelector('#portal-search').addEventListener('input', (e) => table.setQuery(e.target.value));
    container.querySelector('#portal-table').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pursue]');
      if (!btn) return;
      e.stopPropagation();
      const entry = portal.entries.find((x) => x.athleteId === btn.dataset.pursue);
      if (entry) showPursuit(game, entry, container);
    }, true);

    container.querySelectorAll('[data-pstatus]').forEach((btn) => {
      btn.addEventListener('click', () => { statusFilter = btn.dataset.pstatus; render(container); });
    });
    container.querySelectorAll('.lrow[data-ath]').forEach((el) => {
      el.addEventListener('click', () => UI.openAthlete(game, el.dataset.ath));
    });
    container.querySelector('#g-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    container.querySelector('#g-w').addEventListener('click', () => { activeGender = 'W'; render(container); });
    const followersBtn = container.querySelector('[data-open-followers]');
    if (followersBtn) followersBtn.addEventListener('click', () => UI.showFollowersPopup(game));
  }

  // Back to the screen's load-in defaults (tabs, sub-tabs, toggles, filters).
  // Called by the shell whenever the player navigates INTO this screen, so
  // leaving a tab and coming back always lands on its default view.
  function reset() {
    activeGender = 'M';
    statusFilter = 'all';
  }

  UI.screens.portal = { render, reset };
})();
