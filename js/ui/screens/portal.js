/*
 * Transfer Portal screen: browse entries, scout them, and pursue up to
 * three transfers per cycle. Also shows your own departures.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const Portal = () => window.XCD.engine.Portal;

  let activeGender = 'M';

  function render(container) {
    const game = UI.state.game;
    const portal = game.portal;

    if (!portal) {
      const lastSummary = game.history.portalSummaries &&
        game.history.portalSummaries[game.year - 1];
      const lastSummer = game.history.summerPortals &&
        (game.history.summerPortals[game.year] || game.history.summerPortals[game.year - 1]);
      container.innerHTML = `
        <div class="screen-header"><h1>Transfer Portal</h1></div>
        <div class="card" style="color:var(--text-dim);">
          The portal window opens after nationals (Week ${Portal().ENTRY_WEEK}) and closes at
          Week ${Portal().DECISION_WEEK}. ${lastSummary ? `Last cycle: ${lastSummary.entries} entries, ${lastSummary.moved} transfers.` : ''}
          <br><br>☀️ The <strong>summer window</strong> (Weeks 1-${Portal().SUMMER_FINAL_WEEK}) reopens the portal
          exclusively for Division II and III programs, stocked with Division I roster cuts.
          ${lastSummer ? `Last summer: ${lastSummer.entries} cuts entered, ${lastSummer.placed} continued their careers at DII/DIII programs.` : ''}
        </div>`;
      return;
    }
    const summer = !!portal.summer;

    const entries = portal.entries
      .map((e) => ({ e, a: game.getAthlete(e.athleteId) }))
      .filter((x) => x.a && x.a.gender === activeGender);

    const myOffers = portal.entries.filter((e) => !e.destination && e.offers.includes(game.playerSchoolId)).length;
    const myDepartures = portal.entries.filter((e) => e.fromSchoolId === game.playerSchoolId);

    container.innerHTML = `
      <div class="screen-header">
        <h1>${summer ? '☀️ Summer Transfer Window' : 'Transfer Portal'} — ${portal.open ? 'OPEN' : 'Closed'}</h1>
        <div class="actions">
          <span class="phase-pill" style="padding:5px 14px;">Pursuing ${myOffers}/${Portal().PLAYER_OFFER_LIMIT}</span>
          <div class="pill-tabs">
            <button id="g-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="g-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
          <input class="search-input" id="portal-search" placeholder="Search portal...">
        </div>
      </div>

      ${summer ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent); padding:10px 14px; font-size:13px;">
          ☀️ Division I roster cuts looking to continue their careers. This window is
          <strong>exclusive to Division II and III programs</strong>${(game.getPlayerSchool().division || 'DI') === 'DI'
            ? ' — as a Division I coach you can only watch the market move.'
            : ' — pursue up to ' + Portal().PLAYER_OFFER_LIMIT + ' before it closes at the end of Week ' + Portal().SUMMER_FINAL_WEEK + '.'}
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
        status: e.destination ? 2 : e.offers.includes(game.playerSchoolId) ? 1 : 0
      })),
      defaultSort: 'overall',
      defaultDir: 'desc',
      searchKeys: ['name', 'from', 'reason', 'classYear'],
      onRowClick: (row) => UI.showPlayerCard(row.a, game),
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
        { key: 'offers', label: 'Offers', numeric: true },
        {
          key: 'status', label: 'Status',
          render: (r) => {
            if (r.e.destination) {
              const to = game.getSchool(r.e.destination);
              const mine = r.e.destination === game.playerSchoolId;
              return `<span style="color:${mine ? 'var(--success)' : 'var(--text-dim)'};">→ ${Utils.escapeHtml(to?.name || '?')}</span>`;
            }
            if (r.e.fromSchoolId === game.playerSchoolId) return '<span style="color:var(--danger);">Your player</span>';
            if (!portal.open) return '<span style="color:var(--text-faint);">Stayed</span>';
            const offered = r.e.offers.includes(game.playerSchoolId);
            return `<button class="btn small ${offered ? 'danger' : 'primary'}" data-offer="${r.a.id}">${offered ? 'Withdraw' : 'Pursue'}</button>`;
          }
        }
      ]
    });

    container.querySelector('#portal-search').addEventListener('input', (e) => table.setQuery(e.target.value));
    container.querySelector('#portal-table').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-offer]');
      if (!btn) return;
      e.stopPropagation();
      const result = Portal().playerOffer(game, btn.dataset.offer);
      UI.toast(result.message, result.ok ? 'success' : 'error');
      if (result.ok) render(container);
    }, true);

    container.querySelector('#g-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    container.querySelector('#g-w').addEventListener('click', () => { activeGender = 'W'; render(container); });
  }

  UI.screens.portal = { render };
})();
