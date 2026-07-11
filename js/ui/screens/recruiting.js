/*
 * Recruiting hub: board / national search / commitments / class rankings.
 * Ratings are hidden behind fog-of-war until the player scouts a recruit.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const D = window.XCD.data;
  const RE = () => window.XCD.engine.Recruiting;

  let activeTab = 'board';
  let activeGender = 'M';
  let starFilter = 0;
  let sourceFilter = 'All';

  /* ---------------- Fog of war helpers ---------------- */
  function fogRange(value, scout, spread = 30) {
    if (scout >= 95) return `${value}`;
    const u = Math.max(2, Math.round(((100 - scout) / 100) * spread / 2));
    return `${Math.max(1, value - u)}–${Math.min(99, value + u)}`;
  }

  function fogBadge(value, scout, spread = 30) {
    let cls = 'r-avg';
    if (scout >= 60) {
      cls = value >= 85 ? 'r-elite' : value >= 75 ? 'r-great' : value >= 62 ? 'r-good' : value >= 50 ? 'r-avg' : 'r-poor';
    }
    return `<span class="rating ${cls}">${fogRange(value, scout, spread)}</span>`;
  }

  function stars(n) {
    return `<span style="color:var(--gold); letter-spacing:1px;">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
  }

  /* ---------------- Commit probability for the player ---------------- */
  function commitProbability(game, rec) {
    const school = game.getPlayerSchool();
    const mine = rec.getSchoolState(school.id);
    if (!mine || !mine.offered) return null;
    const offers = Object.keys(rec.interests).filter((sid) => rec.interests[sid].offered);
    let total = 0;
    let mineScore = 0;
    offers.forEach((sid) => {
      const s = game.getSchool(sid);
      if (!s) return;
      const a = Math.pow(RE().appeal(game, s, rec), 3);
      total += a;
      if (sid === school.id) mineScore = a;
    });
    if (total === 0) return 0;
    return Math.round((mineScore / total) * 100);
  }

  function competingSchools(game, rec, limit = 4) {
    return Object.keys(rec.interests)
      .map((sid) => {
        const s = game.getSchool(sid);
        return s ? { school: s, appeal: Math.round(RE().appeal(game, s, rec)), st: rec.interests[sid] } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.appeal - a.appeal)
      .slice(0, limit);
  }

  /* ---------------- Recruit card modal ---------------- */
  function showRecruitCard(game, rec) {
    const school = game.getPlayerSchool();
    const st = rec.getSchoolState(school.id) || { relationship: 0, interest: 0, offered: false, visited: false, overnight: false };
    const know = rec.playerKnowledge;
    const scout = know.scout;
    const prob = commitProbability(game, rec);
    const rivals = competingSchools(game, rec);
    const dist = rec.hometownState === 'INT' ? null : RE().distanceMiles(rec.hometownState, school.state);
    const onBoard = game.recruiting.board[rec.gender].includes(rec.id);
    const signingOver = game.week > D.RECRUITING.SIGNING_WEEK;

    const motivationHtml = rec.motivations.map((key) => {
      const label = D.MOTIVATIONS.find((m) => m.key === key)?.label || key;
      return know.revealed.includes(key)
        ? `<div class="attr-row"><span>🔓 ${label}</span></div>`
        : `<div class="attr-row"><span style="color:var(--text-faint);">🔒 Unknown motivation</span></div>`;
    }).join('');

    const physical = [
      ['vo2Max', 'VO₂ Max'], ['runningEconomy', 'Economy'], ['stamina', 'Stamina'],
      ['lactateThreshold', 'Lactate Thr.'], ['speed', 'Speed'], ['injuryResistance', 'Injury Res.'],
      ['mentalToughness', 'Toughness'], ['raceIQ', 'Race IQ'], ['consistency', 'Consistency']
    ];

    const statusLine = rec.signed
      ? `<span style="color:var(--success);">SIGNED — ${Utils.escapeHtml(game.getSchool(rec.committedTo)?.name || '?')}</span>`
      : rec.committedTo
        ? `<span style="color:var(--warning);">Verbal — ${Utils.escapeHtml(game.getSchool(rec.committedTo)?.name || '?')}</span>`
        : '<span style="color:var(--text-dim);">Uncommitted</span>';

    const actionButtons = Object.entries(D.RECRUIT_ACTIONS).map(([key, a]) => {
      const R = game.recruiting;
      const used = R.actionsThisWeek[rec.id] || 0;
      let disabledReason = '';
      if (rec.signed || signingOver) disabledReason = 'Signing period over';
      else if (R.pointsLeft < a.points) disabledReason = 'Not enough points';
      else if (R.budgetLeft < a.cost) disabledReason = 'Budget exhausted';
      else if (used >= D.MAX_ACTIONS_PER_RECRUIT_WEEK) disabledReason = 'Contact limit reached this week';
      else if (key === 'offer' && st.offered) disabledReason = 'Already offered';
      else if (a.requires === 'interest30' && st.interest < 30) disabledReason = 'Needs 30 interest';
      else if (a.requires === 'visited' && !st.visited) disabledReason = 'Needs campus visit first';
      return `
        <button class="btn small" data-action="${key}" ${disabledReason ? `disabled title="${disabledReason}"` : ''}>
          ${a.label} <span style="color:var(--text-faint); font-weight:400;">(${a.points}pt${a.cost ? ` · $${a.cost}` : ''})</span>
        </button>`;
    }).join('');

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <div class="player-card-header">
        <div class="who">
          <h2>${stars(rec.starRating)} ${Utils.escapeHtml(rec.fullName)}</h2>
          <div class="sub">
            ${rec.gender === 'M' ? "Men's" : "Women's"} • ${rec.source}${rec.country !== 'USA' ? ` (${rec.country})` : ''} •
            ${Utils.escapeHtml(rec.hometownCity)}, ${rec.hometownState === 'INT' ? rec.country : rec.hometownState}
            ${dist !== null ? ` • ${dist} mi away` : ''}
          </div>
          <div class="sub">
            Natl #${rec.nationalRank} • ${rec.hometownState !== 'INT' ? `${rec.hometownState} #${rec.stateRank} • ` : ''}${Utils.escapeHtml(rec.region)} #${rec.regionalRank}
            • ${statusLine}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:26px; font-weight:800;">${fogRange(rec.currentOverall, scout)}</div>
          <div style="font-size:12px; color:var(--text-dim);">OVERALL • POT ${fogRange(rec.potential, scout, 44)}</div>
          <div style="font-size:12px; color:var(--text-faint); margin-top:2px;">Scouted ${scout}%</div>
        </div>
      </div>

      <div class="grid cols-3" style="margin-bottom:14px;">
        <div>
          <h3>Relationship — ${Math.round(st.relationship)}</h3>
          ${UI.meter(st.relationship)}
        </div>
        <div>
          <h3>Interest — ${Math.round(st.interest)}</h3>
          ${UI.meter(st.interest, 'green')}
        </div>
        <div>
          <h3>Commit Chance — ${prob === null ? 'no offer' : prob + '%'}</h3>
          ${UI.meter(prob || 0, 'yellow')}
        </div>
      </div>

      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Recruiting Actions ${st.offered ? '• <span style="color:var(--success);">Scholarship Offered</span>' : ''}</h3>
        <div style="display:flex; flex-wrap:wrap; gap:6px;" id="action-row">${actionButtons}</div>
        <div style="margin-top:8px; font-size:12px; color:var(--text-dim);">
          ${game.recruiting.pointsLeft} points left this week • $${game.recruiting.budgetLeft.toLocaleString()} budget left this year
        </div>
      </div>

      <div class="grid cols-2" style="margin-bottom:14px;">
        <div class="card" style="padding:12px;">
          <h3>Scouting Report</h3>
          <div class="attr-grid">
            ${physical.map(([k, label]) => `
              <div class="attr-row"><span class="attr-name">${label}</span>${fogBadge(rec[k], scout)}</div>`).join('')}
          </div>
        </div>
        <div class="card" style="padding:12px;">
          <h3>What Drives ${Utils.escapeHtml(rec.firstName)}</h3>
          ${motivationHtml}
          <h3 style="margin-top:10px;">Priorities</h3>
          ${['prestige', 'location', 'development', 'playingTime', 'academics', 'facilities', 'nil'].map((k) => `
            <div class="attr-row" style="margin-bottom:2px;">
              <span class="attr-name" style="min-width:90px; text-transform:capitalize;">${k === 'playingTime' ? 'Playing Time' : k === 'nil' ? 'NIL' : k}</span>
              <div style="flex:1; margin:0 8px;">${UI.meter(rec.importance[k])}</div>
            </div>`).join('')}
          <div class="attr-row" style="margin-top:6px;"><span class="attr-name">Parents' Influence</span><span>${rec.parentsInfluence >= 70 ? 'Heavy' : rec.parentsInfluence >= 40 ? 'Moderate' : 'Light'}</span></div>
          <div class="attr-row"><span class="attr-name">Academics</span>${UI.ratingBadge(rec.academics)}</div>
        </div>
      </div>

      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Competition</h3>
        ${rivals.length ? rivals.map((r) => `
          <div class="attr-row" style="margin-bottom:4px;">
            <span style="min-width:180px;">${Utils.escapeHtml(r.school.name)}${r.school.id === school.id ? ' <span style="color:var(--accent);">(You)</span>' : ''}${r.st.offered ? ' <span style="color:var(--success); font-size:11px;">OFFERED</span>' : ''}</span>
            <div style="flex:1; margin:0 8px;">${UI.meter(r.appeal, r.school.id === school.id ? '' : 'yellow')}</div>
            <span style="font-size:12px; font-weight:700;">${r.appeal}</span>
          </div>`).join('') : '<div style="color:var(--text-dim); font-size:13px;">No programs have made contact yet.</div>'}
      </div>

      <div style="display:flex; gap:8px;">
        <button class="btn ${onBoard ? 'danger' : 'primary'}" id="btn-board-toggle">
          ${onBoard ? 'Remove from Board' : '+ Add to Board'}
        </button>
      </div>
    `, (modal) => {
      modal.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const result = RE().doAction(game, rec.id, btn.dataset.action);
          UI.toast(result.message, result.ok ? 'success' : 'error');
          if (result.ok && !game.recruiting.board[rec.gender].includes(rec.id)) {
            game.recruiting.board[rec.gender].push(rec.id); // acting on a recruit tracks them
          }
          if (result.ok) showRecruitCard(game, rec); // refresh meters/buttons
        });
      });
      modal.querySelector('#btn-board-toggle').addEventListener('click', () => {
        const board = game.recruiting.board[rec.gender];
        const i = board.indexOf(rec.id);
        if (i >= 0) { board.splice(i, 1); UI.toast(`${rec.lastName} removed from your board.`); }
        else { board.push(rec.id); UI.toast(`${rec.lastName} added to your board.`, 'success'); }
        showRecruitCard(game, rec);
      });
    });
  }

  UI.showRecruitCard = showRecruitCard;

  /* ---------------- Tab renderers ---------------- */
  function rowsForBoard(game) {
    return game.recruiting.board[activeGender]
      .map((id) => game.world.recruits[id])
      .filter(Boolean);
  }

  function rowsForSearch(game) {
    return Object.values(game.world.recruits).filter((r) =>
      r.gender === activeGender &&
      (starFilter === 0 || r.starRating >= starFilter) &&
      (sourceFilter === 'All' || r.source === sourceFilter));
  }

  function recruitTable(game, container, rows, opts = {}) {
    const school = game.getPlayerSchool();
    return UI.renderSortableTable(container, {
      rows,
      defaultSort: opts.defaultSort || 'nationalRank',
      defaultDir: opts.defaultDir || 'asc',
      searchKeys: ['firstName', 'lastName', 'hometownState', 'region', 'source'],
      onRowClick: (r) => showRecruitCard(game, r),
      columns: [
        { key: 'starRating', label: 'Stars', numeric: true, render: (r) => stars(r.starRating) },
        { key: 'nationalRank', label: 'Natl', numeric: true, render: (r) => `#${r.nationalRank}` },
        { key: 'lastName', label: 'Name', render: (r) => `<strong>${Utils.escapeHtml(r.fullName)}</strong>${r.source !== 'HS' ? ` <span style="font-size:10px; color:var(--warning);">${r.source}</span>` : ''}` },
        { key: 'hometownState', label: 'From', render: (r) => r.hometownState === 'INT' ? Utils.escapeHtml(r.country) : `${Utils.escapeHtml(r.hometownCity)}, ${r.hometownState}` },
        {
          key: 'dist', label: 'Dist', numeric: true,
          sortValue: (r) => r.hometownState === 'INT' ? 9999 : RE().distanceMiles(r.hometownState, school.state),
          render: (r) => r.hometownState === 'INT' ? '—' : `${RE().distanceMiles(r.hometownState, school.state)} mi`
        },
        {
          key: 'currentOverall', label: 'OVR', numeric: true,
          render: (r) => fogBadge(r.currentOverall, r.playerKnowledge.scout)
        },
        {
          key: 'interest', label: 'Interest', numeric: true,
          sortValue: (r) => r.getSchoolState(school.id)?.interest || 0,
          render: (r) => {
            const st = r.getSchoolState(school.id);
            return `<div style="min-width:60px;">${UI.meter(st ? st.interest : 0, 'green')}</div>`;
          }
        },
        {
          key: 'status', label: 'Status',
          sortValue: (r) => r.signed ? 2 : r.committedTo ? 1 : 0,
          render: (r) => {
            if (r.signed) return `<span style="color:var(--success);">Signed: ${Utils.escapeHtml(game.getSchool(r.committedTo)?.name || '?')}</span>`;
            if (r.committedTo) return `<span style="color:var(--warning);">Verbal: ${Utils.escapeHtml(game.getSchool(r.committedTo)?.name || '?')}</span>`;
            const st = r.getSchoolState(school.id);
            return st && st.offered ? '<span style="color:var(--accent-hover);">Offered</span>' : '<span style="color:var(--text-faint);">Open</span>';
          }
        }
      ]
    });
  }

  function renderCommitments(game, el) {
    const school = game.getPlayerSchool();
    const myCommits = Object.values(game.world.recruits)
      .filter((r) => r.committedTo === school.id)
      .sort((a, b) => a.nationalRank - b.nationalRank);
    const national = Object.values(game.world.recruits)
      .filter((r) => r.committedTo && r.commitWeek !== null)
      .sort((a, b) => (b.commitWeek - a.commitWeek) || (a.nationalRank - b.nationalRank))
      .slice(0, 40);

    el.innerHTML = `
      <div class="grid cols-2">
        <div class="card">
          <h2>Your Class (${myCommits.length})</h2>
          ${myCommits.length ? myCommits.map((r) => `
            <div class="attr-row clickable" data-rec="${r.id}" style="cursor:pointer; padding:6px 0;">
              <span>${stars(r.starRating)} <strong>${Utils.escapeHtml(r.fullName)}</strong> <span style="color:var(--text-dim);">(${r.gender})</span></span>
              <span>${r.signed ? '<span style="color:var(--success);">Signed</span>' : '<span style="color:var(--warning);">Verbal</span>'}</span>
            </div>`).join('') : '<div style="color:var(--text-dim);">No commitments yet. Offer scholarships and build relationships.</div>'}
        </div>
        <div class="card">
          <h2>Recent National Commitments</h2>
          <div style="max-height:420px; overflow-y:auto;">
            ${national.map((r) => `
              <div class="attr-row clickable" data-rec="${r.id}" style="cursor:pointer; padding:5px 0;">
                <span>${stars(r.starRating)} ${Utils.escapeHtml(r.fullName)}</span>
                <span style="color:var(--text-dim); font-size:12px;">→ ${Utils.escapeHtml(game.getSchool(r.committedTo)?.name || '?')} (Wk ${r.commitWeek ?? '—'})</span>
              </div>`).join('') || '<div style="color:var(--text-dim);">Nobody has committed yet this cycle.</div>'}
          </div>
        </div>
      </div>`;

    el.querySelectorAll('[data-rec]').forEach((n) => {
      n.addEventListener('click', () => showRecruitCard(game, game.world.recruits[n.dataset.rec]));
    });
  }

  function renderClassRankings(game, el) {
    const years = Object.keys(game.history.recruitingClasses).sort((a, b) => b - a);
    if (!years.length) {
      el.innerHTML = `<div class="card" style="color:var(--text-dim);">
        Class rankings publish on Signing Day (Week ${D.RECRUITING.SIGNING_WEEK}).</div>`;
      return;
    }
    el.innerHTML = years.map((year) => `
      <div class="card">
        <h2>Class of ${Number(year) + 1} — Final Rankings</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Rank</th><th>School</th><th class="num">Signees</th><th class="num">Avg ★</th><th class="num">Score</th></tr></thead>
          <tbody>
            ${game.history.recruitingClasses[year].slice(0, 25).map((e) => `
              <tr ${e.schoolId === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : ''}>
                <td>#${e.rank}</td><td>${Utils.escapeHtml(e.schoolName)}</td>
                <td class="num">${e.count}</td><td class="num">${e.avgStars}</td><td class="num">${e.score}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`).join('');
  }

  /* ---------------- Main render ---------------- */
  function render(container) {
    const game = UI.state.game;
    const R = game.recruiting;
    const signingIn = D.RECRUITING.SIGNING_WEEK - game.week;

    container.innerHTML = `
      <div class="screen-header">
        <h1>Recruiting</h1>
        <div class="actions">
          <div class="pill-tabs">
            <button data-tab="board" class="${activeTab === 'board' ? 'active' : ''}">My Board</button>
            <button data-tab="search" class="${activeTab === 'search' ? 'active' : ''}">Search</button>
            <button data-tab="commits" class="${activeTab === 'commits' ? 'active' : ''}">Commitments</button>
            <button data-tab="rankings" class="${activeTab === 'rankings' ? 'active' : ''}">Class Rankings</button>
          </div>
          <button class="btn ${game.weeklyFlow?.recruitingDone ? '' : 'primary'}" id="btn-finish-recruiting">
            ${game.weeklyFlow?.recruitingDone ? '✓ Recruiting Done' : '✓ Done Recruiting'}
          </button>
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Points This Week</div><div class="value">${R.pointsLeft}</div><div class="sub">resets weekly</div></div>
        <div class="stat-tile"><div class="label">Budget Left</div><div class="value">$${(R.budgetLeft / 1000).toFixed(1)}k</div><div class="sub">of $${(game.getPlayerSchool().budget.recruiting / 1000).toFixed(0)}k yearly</div></div>
        <div class="stat-tile"><div class="label">Signing Day</div><div class="value">${signingIn >= 0 ? `${signingIn} wk` : 'Passed'}</div><div class="sub">Week ${D.RECRUITING.SIGNING_WEEK}</div></div>
        <div class="stat-tile"><div class="label">Class of</div><div class="value">${R.classYear || '—'}</div><div class="sub">${Object.keys(game.world.recruits || {}).length.toLocaleString()} recruits nationally</div></div>
      </div>

      <div id="tab-body"></div>`;

    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(container); });
    });

    container.querySelector('#btn-finish-recruiting').addEventListener('click', () => {
      game.weeklyFlow = game.weeklyFlow || { trainingConfirmed: false, recruitingDone: false };
      if (!game.weeklyFlow.trainingConfirmed) {
        UI.toast('Set your training plan first (Step 1).', 'error');
        UI.navigate('training');
        return;
      }
      game.weeklyFlow.recruitingDone = true;
      UI.toast(R.pointsLeft > 0
        ? `Recruiting wrapped with ${R.pointsLeft} point${R.pointsLeft > 1 ? 's' : ''} unspent. Ready to advance.`
        : 'Recruiting wrapped. Ready to advance the week.', 'success');
      UI.renderShell();
    });

    const body = container.querySelector('#tab-body');

    if (activeTab === 'commits') { renderCommitments(game, body); return; }
    if (activeTab === 'rankings') { renderClassRankings(game, body); return; }

    const isSearch = activeTab === 'search';
    body.innerHTML = `
      <div class="screen-header" style="margin-bottom:12px;">
        <div class="actions">
          <div class="pill-tabs">
            <button id="g-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="g-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
          ${isSearch ? `
            <select class="search-input" id="star-filter" style="min-width:120px;">
              ${[0, 2, 3, 4, 5].map((s) => `<option value="${s}" ${starFilter === s ? 'selected' : ''}>${s === 0 ? 'All Stars' : s + '★ +'}</option>`).join('')}
            </select>
            <select class="search-input" id="source-filter" style="min-width:110px;">
              ${['All', 'HS', 'JUCO', 'International'].map((s) => `<option ${sourceFilter === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>` : ''}
          <input class="search-input" id="rec-search" placeholder="Search recruits...">
        </div>
      </div>
      <div class="card"><div id="rec-table"></div>
        ${isSearch ? `<div style="color:var(--text-faint); font-size:12px; margin-top:8px;">Click any recruit to scout and recruit them. Sorted lists show the full class.</div>` : ''}
      </div>`;

    const rows = isSearch ? rowsForSearch(game) : rowsForBoard(game);
    if (!isSearch && rows.length === 0) {
      body.querySelector('#rec-table').innerHTML =
        '<div style="color:var(--text-dim); padding:8px;">Your board is empty. Find targets in the Search tab and add them.</div>';
    } else {
      const table = recruitTable(game, body.querySelector('#rec-table'), rows, {});
      body.querySelector('#rec-search').addEventListener('input', (e) => table.setQuery(e.target.value));
    }

    body.querySelector('#g-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    body.querySelector('#g-w').addEventListener('click', () => { activeGender = 'W'; render(container); });
    if (isSearch) {
      body.querySelector('#star-filter').addEventListener('change', (e) => { starFilter = Number(e.target.value); render(container); });
      body.querySelector('#source-filter').addEventListener('change', (e) => { sourceFilter = e.target.value; render(container); });
    }
  }

  UI.screens.recruiting = { render };
})();
