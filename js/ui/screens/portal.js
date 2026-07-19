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

  /* ---------------- Main render ---------------- */
  function render(container) {
    const game = UI.state.game;
    const portal = game.portal;
    const P = Portal();

    if (!portal) {
      const lastSummary = game.history.portalSummaries &&
        game.history.portalSummaries[game.year - 1];
      const lastSummer = game.history.summerPortals &&
        (game.history.summerPortals[game.year] || game.history.summerPortals[game.year - 1]);
      container.innerHTML = `
        <div class="screen-header"><h1>Transfer Portal</h1></div>
        <div class="card" style="color:var(--text-dim);">
          The portal window opens after nationals (Week ${P.ENTRY_WEEK}) and closes at
          Week ${P.DECISION_WEEK}. ${lastSummary ? `Last cycle: ${lastSummary.entries} entries, ${lastSummary.moved} transfers.` : ''}
          <br><br>🎯 <strong>Transfer Points:</strong> each window your program earns a points budget from
          prestige and your recruiting skill. Slide points onto portal athletes — enough points locks a
          commit at 100%, or divide the budget to chase several at once. Winning a national title raises
          next window's budget; a poor season lowers it.
          <br><br>☀️ The <strong>summer window</strong> (Weeks 1-${P.SUMMER_FINAL_WEEK}) reopens the portal
          exclusively for Division II and III programs, stocked with Division I roster cuts.
          ${lastSummer ? `Last summer: ${lastSummer.entries} cuts entered, ${lastSummer.placed} continued their careers at DII/DIII programs.` : ''}
        </div>`;
      return;
    }
    const summer = !!portal.summer;
    const eligible = playerEligible(game);
    const pp = eligible ? P.ensurePlayerPoints(game) : (portal.player || null);
    const ptsLeft = pp ? P.transferPointsLeft(game) : 0;

    const entries = portal.entries
      .map((e) => ({ e, a: game.getAthlete(e.athleteId) }))
      .filter((x) => x.a && x.a.gender === activeGender);

    const pursuing = portal.entries.filter((e) => !e.destination && e.offers.includes(game.playerSchoolId)).length;
    const myDepartures = portal.entries.filter((e) => e.fromSchoolId === game.playerSchoolId);

    container.innerHTML = `
      <div class="screen-header">
        <h1>${summer ? '☀️ Summer Transfer Window' : 'Transfer Portal'} — ${portal.open ? 'OPEN' : 'Closed'}</h1>
        <div class="actions">
          <div class="pill-tabs">
            <button id="g-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="g-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
          <input class="search-input" id="portal-search" placeholder="Search portal...">
        </div>
      </div>

      ${eligible && pp ? `
      <div class="grid cols-3" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Transfer Points</div><div class="value">${ptsLeft}</div><div class="sub">of ${pp.budget} this window</div></div>
        <div class="stat-tile"><div class="label">Pursuing</div><div class="value">${pursuing}</div><div class="sub">of ${P.PLAYER_OFFER_LIMIT} max</div></div>
        <div class="stat-tile"><div class="label">Budget Source</div>
          <div class="value" style="font-size:15px;">${pp.titleBonus ? '🏆 Title boost' : pp.seasonAdj ? '📉 Down season' : '📊 Standard'}</div>
          <div class="sub">prestige + recruiting${pp.titleBonus ? ` +${pp.titleBonus}` : ''}${pp.seasonAdj ? ` ${pp.seasonAdj}` : ''}</div></div>
      </div>
      <div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent); padding:10px 14px; font-size:13px;">
        🎯 Tap an athlete to open their pursuit profile, then slide points onto them.
        Enough points <strong>locks the commit at 100%</strong> — or divide the budget across several targets
        and take your chances when the window closes. Matching an athlete's preferences makes them cheaper to land.
      </div>` : ''}

      ${summer ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent); padding:10px 14px; font-size:13px;">
          ☀️ Division I roster cuts looking to continue their careers. This window is
          <strong>exclusive to Division II and III programs</strong>${(game.getPlayerSchool().division || 'DI') === 'DI'
            ? ' — as a Division I coach you can only watch the market move.'
            : ' — spend your transfer points before it closes at the end of Week ' + P.SUMMER_FINAL_WEEK + '.'}
        </div>` : ''}
      ${myDepartures.length ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--danger);">
          <h2>Leaving Your Program</h2>
          ${myDepartures.map((e) => {
            const a = game.getAthlete(e.athleteId);
            if (!a) return '';
            return `<div class="attr-row"><span><strong>${Utils.escapeHtml(a.fullName)}</strong> (${a.currentOverall} OVR, ${a.classYear})</span>
              <span style="color:var(--text-dim);">${Utils.escapeHtml(e.reason)}</span>
              <span>${e.destination ? '→ ' + Utils.escapeHtml(game.getSchool(e.destination)?.name || '?') : (portal.open ? 'Deciding...' : 'Staying')}</span></div>`;
          }).join('')}
        </div>` : ''}

      <div class="card"><div id="portal-table"></div></div>`;

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
      rows: entries.map(({ e, a }) => ({
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
        { key: 'name', label: 'Runner', render: (r) => `${UI.avatar(r.a, { size: 24 })} <strong>${Utils.escapeHtml(r.name)}</strong>` },
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

    container.querySelector('#g-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    container.querySelector('#g-w').addEventListener('click', () => { activeGender = 'W'; render(container); });
  }

  UI.screens.portal = { render };
})();
