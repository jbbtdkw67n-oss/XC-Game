/*
 * "Bring Your Runners" popup: after the player leaves one head job for
 * another, up to three athletes from the old roster can be pitched on
 * following the coach. Every candidate shows their live chance of saying
 * yes — built from their bond with the coach and how they'd fit at the new
 * program — and the pitch is decided once, with a reveal of who's coming.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const F = () => window.XCD.engine.Followers;

  let genderFilter = 'all'; // all | M | W

  function chanceColor(p) {
    return p >= 60 ? 'var(--success)' : p >= 30 ? 'var(--warning)' : 'var(--danger)';
  }

  // A conic-gradient percent ring.
  function ring(pct, size, extraClass) {
    return `<div class="fol-ring${extraClass ? ' ' + extraClass : ''}" style="--p:${pct}; --c:${chanceColor(pct)}; width:${size}px; height:${size}px;">
      <span><strong>${pct}</strong><small>%</small></span>
    </div>`;
  }

  function candidateCard(game, c, picked, full) {
    const a = c.athlete;
    const bond = F().bondLabel(c.rel);
    const shown = c.fit.factors.slice(0, 3);
    const disabled = !picked && full;
    return `
      <button class="fol-card${picked ? ' picked' : ''}${disabled ? ' dim' : ''}" data-fol-pick="${a.id}" aria-pressed="${picked}">
        <div class="fol-card-top">
          ${UI.avatar(a, { size: 40, outfit: 'jersey' })}
          <div class="fol-who">
            <div class="fol-name">${Utils.escapeHtml(a.fullName)}</div>
            <div class="fol-sub">${a.gender === 'M' ? "Men's" : "Women's"} · ${Utils.escapeHtml(a.classYear)} · <span class="nowrap"><strong>${a.currentOverall}</strong> OVR</span></div>
          </div>
          ${ring(c.pct, 54)}
        </div>
        <div class="fol-bond">
          <span class="fol-bond-label">Bond with you</span>
          <div class="fol-bond-bar"><span style="width:${Utils.clamp(c.rel, 0, 100)}%; background:${bond.color};"></span></div>
          <span class="fol-bond-val" style="color:${bond.color};">${bond.label} · ${c.rel}</span>
        </div>
        <div class="fol-factors">
          ${shown.map((f) => `<span class="fol-chip ${f.tone}">${f.icon} ${Utils.escapeHtml(f.label)}</span>`).join('')}
          ${c.inPortal ? '<span class="fol-chip warn">🚪 In the portal</span>' : ''}
        </div>
        <span class="fol-check">${picked ? '✓' : '+'}</span>
      </button>`;
  }

  function render(game) {
    const cf = F().pending(game);
    if (!cf) return false;
    const from = game.getSchool(cf.fromSchoolId);
    const to = game.getSchool(cf.toSchoolId);
    const all = F().candidates(game);
    const list = all.filter((c) => genderFilter === 'all' || c.athlete.gender === genderFilter);
    const max = F().MAX_PICKS;
    const picks = cf.picks.map((id) => all.find((c) => c.athlete.id === id)).filter(Boolean);
    const full = picks.length >= max;

    const slots = Array.from({ length: max }, (_, i) => {
      const c = picks[i];
      if (!c) return '<div class="fol-slot empty"><span>Open spot</span></div>';
      return `<div class="fol-slot">
        ${UI.avatar(c.athlete, { size: 30, outfit: 'jersey' })}
        <div class="fol-slot-name">${Utils.escapeHtml(c.athlete.lastName)}<small>${c.athlete.currentOverall} OVR</small></div>
        <span class="fol-slot-pct" style="color:${chanceColor(c.pct)};">${c.pct}%</span>
        <button class="fol-slot-x" data-fol-pick="${c.athlete.id}" title="Remove">✕</button>
      </div>`;
    }).join('');
    const expected = picks.reduce((s, c) => s + c.pct / 100, 0);

    UI.showModal(`
      <div class="fol-modal">
        <div class="fol-head">
          <div class="fol-route">
            ${UI.schoolCrest(from, 40)}
            <span class="fol-path"><span class="fol-dots"></span><span class="fol-bag">🧳</span><span class="fol-dots"></span></span>
            ${UI.schoolCrest(to, 40)}
          </div>
          <h2>Bring Your Runners</h2>
          <p>You're leaving <strong>${Utils.escapeHtml(from.name)}</strong> for <strong>${Utils.escapeHtml(to.name)}</strong>.
            Pick up to ${max} athletes to pitch on following you. It's their call: the bond they built with you
            and how they'd fit at ${Utils.escapeHtml(to.name)} set the odds, and nobody's a sure thing.</p>
        </div>

        <div class="fol-slots">${slots}</div>
        <div class="fol-actions">
          <button class="btn primary" id="fol-pitch" ${picks.length ? '' : 'disabled'}>Make Your Pitch${picks.length ? ` (${picks.length})` : ''}</button>
          <span class="fol-expect">${picks.length ? `Expect about <strong>${expected.toFixed(1)}</strong> to come` : 'Tap athletes below to add them'}</span>
        </div>

        <div class="fol-toolbar">
          <div class="pill-tabs">
            <button data-fol-g="all" class="${genderFilter === 'all' ? 'active' : ''}">All</button>
            <button data-fol-g="M" class="${genderFilter === 'M' ? 'active' : ''}">Men</button>
            <button data-fol-g="W" class="${genderFilter === 'W' ? 'active' : ''}">Women</button>
          </div>
          <span class="fol-count">${list.length} eligible</span>
        </div>
        <div class="fol-grid">
          ${list.length ? list.map((c) => candidateCard(game, c, cf.picks.includes(c.athlete.id), full)).join('')
            : '<div class="fol-empty">No eligible athletes in this squad.</div>'}
        </div>

        <div class="fol-foot">
          <button class="btn" id="fol-later">Decide Later</button>
          <button class="btn" id="fol-none">Don't Bring Anyone</button>
        </div>
      </div>`, (modal) => {
      modal.classList.add('fol-wide');
      modal.querySelectorAll('[data-fol-pick]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const r = F().togglePick(game, el.dataset.folPick);
          if (!r.ok) UI.toast(r.message, 'error');
          render(game);
        });
      });
      modal.querySelectorAll('[data-fol-g]').forEach((el) => {
        el.addEventListener('click', () => { genderFilter = el.dataset.folG; render(game); });
      });
      modal.querySelector('#fol-pitch').addEventListener('click', () => {
        const res = F().pitch(game);
        if (!res.ok) { UI.toast(res.message, 'error'); return; }
        showResults(game, cf, res.results);
      });
      modal.querySelector('#fol-later').addEventListener('click', () => {
        UI.closeModal();
        UI.toast('Your runners are waiting to hear from you — find them on the Dashboard or Portal before the window closes.', 'info');
      });
      modal.querySelector('#fol-none').addEventListener('click', () => {
        F().decline(game);
        UI.closeModal();
        UI.renderShell();
      });
    });
    return true;
  }

  // The reveal: each decision lands in turn.
  function showResults(game, cf, results) {
    const from = game.getSchool(cf.fromSchoolId);
    const to = game.getSchool(cf.toSchoolId);
    const coming = results.filter((r) => r.came).length;
    const cards = results.map((r, i) => {
      const a = game.getAthlete(r.athleteId);
      return `
        <div class="fol-result ${r.came ? 'yes' : 'no'}" style="--d:${i * 0.7}s;">
          ${ring(r.pct, 64, 'fill')}
          ${a ? UI.avatar(a, { size: 44, outfit: 'jersey' }) : ''}
          <div class="fol-result-name">${Utils.escapeHtml(r.name)}<small>${r.overall} OVR · ${r.gender === 'M' ? "Men's" : "Women's"}</small></div>
          <div class="fol-stamp">${r.came ? `✓ Coming to ${Utils.escapeHtml(to.name)}` : `Staying at ${Utils.escapeHtml(from.name)}`}</div>
        </div>`;
    }).join('');
    const headline = coming === results.length
      ? (coming === 1 ? 'They\'re in.' : 'Everyone said yes.')
      : coming === 0 ? 'No takers this time.' : `${coming} of ${results.length} ${coming === 1 ? 'is' : 'are'} coming.`;
    UI.showModal(`
      <div class="fol-modal">
        <div class="fol-head">
          <div class="fol-route">
            ${UI.schoolCrest(from, 40)}
            <span class="fol-path"><span class="fol-dots"></span><span class="fol-bag">🧳</span><span class="fol-dots"></span></span>
            ${UI.schoolCrest(to, 40)}
          </div>
          <h2 class="fol-headline" style="--d:${results.length * 0.7}s;">${headline}</h2>
          <p>Followers join ${Utils.escapeHtml(to.name)} with the rest of the transfer class at the start of next season, and bring their bond with you.</p>
        </div>
        <div class="fol-results">${cards}</div>
        <div class="fol-foot"><button class="btn primary" id="fol-done">Continue</button></div>
      </div>`, (modal) => {
      modal.classList.add('fol-wide');
      modal.querySelector('#fol-done').addEventListener('click', () => { UI.closeModal(); UI.renderShell(); });
    });
  }

  /* Public */
  UI.showFollowersPopup = function (game) {
    if (!F() || !F().pending(game)) return false;
    genderFilter = 'all';
    return render(game);
  };

  // A reminder card (Dashboard, Portal) while the pitch is still open.
  UI.followersCard = function (game) {
    const cf = F() && F().pending(game);
    if (!cf) return '';
    const from = game.getSchool(cf.fromSchoolId);
    const top = F().candidates(game).slice(0, 4);
    return `
      <div class="card fol-reminder" style="margin-bottom:16px;">
        <div class="fol-reminder-row">
          <div>
            <h2 style="margin:0 0 4px;">🧳 Bring Your Runners</h2>
            <div style="color:var(--text-dim); font-size:13px; line-height:1.5;">
              Athletes from ${Utils.escapeHtml(from ? from.name : 'your old program')} are waiting to hear whether you want them to follow you.
              Pitch up to ${F().MAX_PICKS} before the transfer window closes.
            </div>
          </div>
          <div class="fol-reminder-faces">
            ${top.map((c) => `<span class="fol-face" title="${Utils.escapeHtml(c.athlete.fullName)} — ${c.pct}%">${UI.avatar(c.athlete, { size: 30, outfit: 'jersey' })}<em style="background:${chanceColor(c.pct)};">${c.pct}</em></span>`).join('')}
          </div>
        </div>
        <button class="btn small primary" data-open-followers style="margin-top:10px;">Choose Who to Bring →</button>
      </div>`;
  };
})();
