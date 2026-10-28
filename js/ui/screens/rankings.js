/*
 * Rankings screen: national/regional/conference team polls, individual
 * rankings, and freshman rankings — per gender.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  let activeTab = 'national';
  let activeGender = 'M';
  // Division filter (Rankings division filter): view D1 / D2 / D3 rankings.
  // null = default to the player's own division. Ranking pools are NEVER
  // combined across divisions — exactly one division is shown at a time.
  let activeDiv = null; // null | 'DI' | 'DII' | 'DIII'

  function arrow(r) {
    return UI.rankMove(r.rank, r.prevRank);
  }

  /*
   * NCAA Selection (Kolas). Once regionals are run this shows how the field
   * was built: the automatic qualifiers, each at-large pick in order with
   * its Kolas points (head-to-head wins over teams already in the field),
   * and the first teams out. Before that it is an At-Large Watch: every
   * contender's Kolas points against the projected field (the current poll).
   */
  function selectionHtml(game, division, gender) {
    const Races = window.XCD.engine.Races;
    const season = game.season;
    const champ = season && season.championships && season.championships[division];
    const sel = champ && champ.selection && champ.selection[gender];
    const name = (sid) => Utils.escapeHtml((game.getSchool(sid) || {}).name || '?');
    const mineStyle = (sid) => (sid === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : '');
    const g = gender === 'M' ? "Men's" : "Women's";
    const divLabel = window.XCD.data.divisionFor(division).label;
    const explainer = `<div class="kolas-explainer">
      <strong>How at-large bids work (the Kolas method).</strong> The top two teams in every regional qualify automatically.
      The remaining bids go one at a time: the best remaining team from <em>each</em> region is considered, and the one with the most
      <strong>Kolas points</strong> — wins this season over teams already in the field — gets the bid. The field grows, points are recounted,
      and the next team from that region steps up. Beat qualifiers early in the season and the points pile up.
      ${division === 'DI' ? '<br><strong>Individuals:</strong> the first 4 finishers from non-qualifying teams at each regional advance if they place in the top 25, and 2 more go as national at-large picks — the best regional placers who just missed (38 in all).' : ''}</div>`;

    if (sel) {
      const pts = (n) => `<span class="kolas-pts">${n}</span>`;
      const myAuto = sel.auto.find((p) => p.schoolId === game.playerSchoolId);
      const myAl = sel.atLarge.find((p) => p.schoolId === game.playerSchoolId);
      const myOut = sel.firstOut.find((p) => p.schoolId === game.playerSchoolId);
      const status = myAuto ? '<span class="sel-status in">✅ You qualified automatically</span>'
        : myAl ? `<span class="sel-status in">🎟 At-large bid #${myAl.pick} — ${myAl.points} Kolas pts</span>`
        : myOut ? `<span class="sel-status bubble">😬 First team out — ${myOut.points} Kolas pts</span>`
        : (game.getPlayerSchool().division || 'DI') === division ? '<span class="sel-status out">Not selected</span>' : '';
      const byRegion = {};
      sel.auto.forEach((p) => { (byRegion[p.region || '—'] = byRegion[p.region || '—'] || []).push(p); });
      return `
        <div class="sel-head">
          <h2 style="margin:0;">${divLabel} ${g} NCAA Field</h2>${status}
        </div>
        <div class="sel-tiles">
          <div class="sel-tile"><div class="v">${sel.auto.length}</div><div class="l">Automatic bids</div></div>
          <div class="sel-tile"><div class="v">${sel.atLarge.length}</div><div class="l">At-large bids</div></div>
          <div class="sel-tile"><div class="v">${sel.auto.length + sel.atLarge.length}</div><div class="l">Teams in the field</div></div>
        </div>
        <div class="grid cols-2" style="margin-top:12px;">
          <div>
            <h3>🎟 At-large picks, in order</h3>
            <div class="table-wrap"><table class="data">
              <thead><tr><th class="col-rank">Pick</th><th class="col-grow">Team</th><th class="hide-mobile">Regional</th><th class="num" title="Wins over teams already in the field">Kolas</th><th class="num" title="Losses to teams in the field">L</th></tr></thead>
              <tbody>${sel.atLarge.map((p) => `<tr class="clickable" data-school="${p.schoolId}" ${mineStyle(p.schoolId)}>
                <td>#${p.pick}</td><td><strong>${name(p.schoolId)}</strong></td>
                <td class="hide-mobile" style="color:var(--text-dim); font-size:12px;">${Utils.ordinal(p.regionalPlace)} · ${Utils.escapeHtml(p.region || '')}</td>
                <td class="num">${pts(p.points)}</td><td class="num">${p.losses}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--text-dim);">No at-large bids in this division.</td></tr>'}</tbody>
            </table></div>
            ${sel.firstOut.length ? `<h3 style="margin-top:14px;">😬 First teams out</h3>
            <div class="table-wrap"><table class="data">
              <thead><tr><th class="col-grow">Team</th><th class="hide-mobile">Regional</th><th class="num">Kolas</th><th class="num">L</th></tr></thead>
              <tbody>${sel.firstOut.map((p) => `<tr class="clickable" data-school="${p.schoolId}" ${mineStyle(p.schoolId)}>
                <td>${name(p.schoolId)}</td><td class="hide-mobile" style="color:var(--text-dim); font-size:12px;">${Utils.ordinal(p.regionalPlace)} · ${Utils.escapeHtml(p.region || '')}</td>
                <td class="num">${pts(p.points)}</td><td class="num">${p.losses}</td></tr>`).join('')}</tbody>
            </table></div>` : ''}
          </div>
          <div>
            <h3>✅ Automatic qualifiers</h3>
            <div class="sel-regions">${Object.entries(byRegion).map(([region, list]) => `
              <div class="sel-region"><div class="sel-region-name">${Utils.escapeHtml(region)}</div>
                ${list.map((p) => `<div class="sel-auto clickable" data-school="${p.schoolId}" ${mineStyle(p.schoolId)}><span>${p.regionalPlace ? Utils.ordinal(p.regionalPlace) : ''}</span> ${name(p.schoolId)}</div>`).join('')}
              </div>`).join('')}</div>
            ${sel.individuals ? (() => {
              const ind = sel.individuals;
              const athName = (id) => Utils.escapeHtml((game.getAthlete(id) || {}).fullName || '?');
              const row = (x, al) => `<div class="sel-indiv clickable" data-ath="${x.athleteId}" ${mineStyle(x.schoolId)}>
                <span class="sel-indiv-place">${Utils.ordinal(x.place)}</span>
                <span class="sel-indiv-name">${athName(x.athleteId)} <small>${name(x.schoolId)}</small></span>
                <span class="sel-indiv-reg">${Utils.escapeHtml(x.region || '')}${al ? ' · <strong>at-large</strong>' : ''}</span></div>`;
              return `<h3 style="margin-top:14px;">🏃 Individual qualifiers <span style="color:var(--text-faint); font-weight:500; font-size:12px;">${ind.auto.length + ind.atLarge.length} total</span></h3>
                <div style="color:var(--text-dim); font-size:12px; margin-bottom:6px;">First ${ind.perRegional} per regional from non-qualifying teams${ind.cutoff ? `, inside the top ${ind.cutoff}` : ''}${ind.atLarge.length ? `, plus ${ind.atLarge.length} national at-large` : ''}.</div>
                <div class="sel-indivs">${ind.atLarge.map((x) => row(x, true)).join('')}${ind.auto.map((x) => row(x, false)).join('')}</div>`;
            })() : ''}
          </div>
        </div>
        ${explainer}`;
    }

    // Before the field is set: the At-Large Watch.
    const board = Races.kolasBoard(game, gender, division, 50);
    if (!board.rows.length) return '<div style="color:var(--text-dim);">No poll yet — the At-Large Watch starts once teams have raced.</div>' + explainer;
    const me = board.rows.find((r) => r.schoolId === game.playerSchoolId);
    let resume = '';
    if ((game.getPlayerSchool().division || 'DI') === division) {
      const k = Races.kolasPoints(game, gender, game.playerSchoolId, board.field);
      const wins = k.vs.filter((x) => x.w).sort((a, b) => b.w - a.w);
      const losses = k.vs.filter((x) => x.l).sort((a, b) => b.l - a.l);
      resume = `<div class="kolas-resume">
        <div class="kolas-resume-head"><h3 style="margin:0;">Your Kolas résumé</h3>
          <span><span class="kolas-pts big">${k.points}</span> pts · ${k.losses} L vs the projected field</span></div>
        <div class="kolas-chips">${wins.map((x) => `<span class="kolas-chip win" data-school="${x.schoolId}">✔ ${name(x.schoolId)}${x.w > 1 ? ` ×${x.w}` : ''}</span>`).join('')}
          ${losses.map((x) => `<span class="kolas-chip loss" data-school="${x.schoolId}">✖ ${name(x.schoolId)}${x.l > 1 ? ` ×${x.l}` : ''}</span>`).join('')}
          ${!wins.length && !losses.length ? '<span style="color:var(--text-dim); font-size:12.5px;">No head-to-head meetings with projected qualifiers yet — race them to build points.</span>' : ''}</div>
      </div>`;
    }
    return `
      <div class="sel-head"><h2 style="margin:0;">${divLabel} ${g} At-Large Watch</h2>
        ${me ? `<span class="sel-status ${me.inField ? 'in' : 'bubble'}">${me.inField ? 'In the projected field' : 'Outside the projected field'} · #${me.rank}</span>` : ''}</div>
      <div style="color:var(--text-dim); font-size:12.5px; margin:6px 0 10px;">Projected field = the current poll's top ${board.size}. Kolas points = wins this season over those teams. Final bids are decided after regionals.</div>
      ${resume}
      <div class="table-wrap"><table class="data">
        <thead><tr><th class="col-rank">Poll</th><th class="col-grow">Team</th><th class="num" title="Wins over projected-field teams">Kolas</th><th class="num">L</th><th></th></tr></thead>
        <tbody>${board.rows.map((r) => `<tr class="clickable" data-school="${r.schoolId}" ${mineStyle(r.schoolId)}>
          <td>#${r.rank}</td><td><strong>${name(r.schoolId)}</strong></td>
          <td class="num"><span class="kolas-pts">${r.points}</span></td><td class="num">${r.losses}</td>
          <td>${r.inField ? '<span class="sel-in-tag">IN</span>' : ''}</td></tr>`).join('')}</tbody>
      </table></div>
      ${explainer}`;
  }

  function render(container) {
    const game = UI.state.game;
    const R = game.rankings;
    const school = game.getPlayerSchool();
    const playerDiv = school.division || 'DI';
    // The division currently being viewed (defaults to the player's).
    const viewDiv = activeDiv || playerDiv;
    const isCoaches = activeTab === 'coaches';

    container.innerHTML = `
      <div class="screen-header">
        ${UI.screenTitle('Rankings', `Week ${game.week}, ${game.year}`)}
        <div class="actions">
          <div class="pill-tabs">
            <button data-tab="national" class="${activeTab === 'national' ? 'active' : ''}">National</button>
            <button data-tab="region" class="${activeTab === 'region' ? 'active' : ''}">Region</button>
            <button data-tab="conference" class="${activeTab === 'conference' ? 'active' : ''}">Conference</button>
            <button data-tab="individual" class="${activeTab === 'individual' ? 'active' : ''}">Individuals</button>
            <button data-tab="freshman" class="${activeTab === 'freshman' ? 'active' : ''}">Freshmen</button>
            <button data-tab="coaches" class="${activeTab === 'coaches' ? 'active' : ''}">Coaches</button>
            <button data-tab="selection" class="${activeTab === 'selection' ? 'active' : ''}" title="NCAA at-large selection — Kolas points">🎟 Selection</button>
          </div>
          ${isCoaches ? '' : `<div class="pill-tabs">
            <button data-div="DI" class="${viewDiv === 'DI' ? 'active' : ''}">D1</button>
            <button data-div="DII" class="${viewDiv === 'DII' ? 'active' : ''}">D2</button>
            <button data-div="DIII" class="${viewDiv === 'DIII' ? 'active' : ''}">D3</button>
          </div>`}
          <div class="pill-tabs">
            <button id="g-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="g-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
        </div>
      </div>
      <div class="card" id="rank-body"></div>`;

    const body = container.querySelector('#rank-body');

    if (activeTab === 'selection') {
      body.innerHTML = selectionHtml(game, viewDiv, activeGender);
    } else if (activeTab === 'coaches') {
      const all = window.XCD.engine.Careers.coachRankings(game);
      const rows = all.slice(0, 50);
      const me = all.find((r) => r.isPlayer);
      if (me && me.rank > 50) rows.push(me); // always show yourself
      body.innerHTML = `
        <h2>National Coach Rankings</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th class="col-rank">Rank</th><th class="col-grow">Coach</th><th class="hide-mobile">School</th><th class="hide-mobile">Style</th><th class="num">Natl Titles</th><th class="num">Conf Titles</th><th class="num hide-mobile">Best Poll</th><th class="num">Score</th></tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr class="clickable" data-coach="${r.coachId}" ${r.isPlayer ? 'style="background:var(--accent-soft);"' : ''}>
                <td class="col-rank"><strong>#${r.rank}</strong></td>
                <td class="col-grow">${UI.avatar(game.getCoach(r.coachId) || { name: r.name }, { size: 22, outfit: 'suit' })} <strong>${Utils.escapeHtml(r.name)}</strong>${r.isPlayer ? ' <span style="color:var(--accent);">(You)</span>' : ''}</td>
                <td class="hide-mobile">${Utils.escapeHtml(r.school)}</td>
                <td class="hide-mobile" style="font-size:12px; color:var(--text-dim);">${Utils.escapeHtml(r.personality)}</td>
                <td class="num">${r.natTitles}</td>
                <td class="num">${r.confTitles}</td>
                <td class="num hide-mobile">${r.bestRank <= 354 ? '#' + r.bestRank : '—'}</td>
                <td class="num">${r.score}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>`;
    } else if (activeTab === 'individual' || activeTab === 'freshman') {
      const raw = activeTab === 'individual' ? R.individuals[activeGender] : R.freshmen[activeGender];
      // Scope to the SELECTED division (never combine divisions).
      let list = raw.filter((r) => (r.division || 'DI') === viewDiv);
      // Preseason fallback (Update 4, Part 9): before any results exist, show
      // the projected favorites driven by returning ability + development.
      let preseason = false;
      if (!list.length && game.season && game.season.preseasonIndividuals) {
        preseason = true;
        list = (game.season.preseasonIndividuals[activeGender] || [])
          .filter((r) => (r.division || 'DI') === playerDiv)
          .filter((r) => activeTab === 'individual' || r.classYear === 'Freshman')
          .slice(0, 100)
          .map((r, i) => ({ ...r, rank: i + 1 }));
      }
      body.innerHTML = list.length ? `
        ${preseason ? '<div style="color:var(--text-dim); font-size:12.5px; margin-bottom:10px;">📊 <strong>Preseason projections</strong> — favorites by returning ability, fitness, and expected development. Real rankings publish once racing begins.</div>' : ''}
        <div class="table-wrap"><table class="data">
          <thead><tr><th class="col-rank">Rank</th><th class="col-grow">Runner</th><th class="hide-mobile">Class</th><th>School</th><th class="num">${preseason ? 'Projection' : 'Best Pace/km'}</th><th class="num hide-mobile">${preseason ? '' : 'Wins'}</th></tr></thead>
          <tbody>
            ${list.map((r) => `
              <tr class="clickable" data-ath="${r.athleteId}" ${r.schoolId === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : ''}>
                <td class="col-rank"><strong>#${r.rank}</strong></td>
                <td class="col-grow">${UI.avatar(game.getAthlete(r.athleteId) || { name: r.name, gender: activeGender }, { size: 22 })} <strong>${r.generational ? '⭐ ' : ''}${Utils.escapeHtml(r.name)}</strong></td>
                <td class="hide-mobile">${r.classYear}</td>
                <td class="clickable-school" data-school="${r.schoolId}" style="cursor:pointer;">${Utils.escapeHtml(r.school)}</td>
                <td class="num">${preseason ? r.proj : window.XCD.engine.Races.formatTime(r.pace)}</td>
                <td class="num hide-mobile">${preseason ? '' : r.wins}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>`
        : '<div style="color:var(--text-dim);">No race results yet this season — rankings publish after the first meets.</div>';
    } else {
      const divLabel = window.XCD.data.divisionFor(viewDiv).label;
      // Every poll is scoped to the SELECTED division (never combined).
      let rows = R[activeGender].filter((r) => (r.division || 'DI') === viewDiv);
      let heading = `${divLabel} National Poll`;
      // Region/Conference tabs are inherently the PLAYER's own region/conference;
      // they only make sense within the player's division, so when the user is
      // browsing another division those tabs fall back to that division's
      // national poll (rankings pools are never mixed across divisions).
      const relative = viewDiv === playerDiv;
      if (activeTab === 'region' && relative) {
        const myRegion = window.XCD.data.ncaaRegionFor(school);
        rows = rows.filter((r) => (r.ncaaRegion || r.region) === myRegion);
        heading = `${divLabel} · ${myRegion} Regional Rankings`;
      } else if (activeTab === 'conference' && relative) {
        rows = rows.filter((r) => r.conference === school.conference);
        heading = `${school.conference} Standings`;
      } else {
        rows = rows.slice(0, 40);
        if (!relative && (activeTab === 'region' || activeTab === 'conference')) {
          heading = `${divLabel} National Poll`;
        }
      }
      body.innerHTML = `
        <h2>${heading} — Week ${R.computedWeek}</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th class="col-rank">Rank</th><th class="col-grow">Team</th><th class="hide-mobile">Conference</th><th class="hide-mobile">Region</th><th class="num">Score</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr class="clickable" data-school="${r.schoolId}" ${r.schoolId === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : ''}>
                <td class="col-rank"><strong>#${activeTab === 'national' ? r.rank : i + 1}</strong>${arrow(r)}${activeTab !== 'national' ? ` <span style="color:var(--text-faint); font-size:11px;">div #${r.rank}</span>` : ''}</td>
                <td class="col-grow"><strong>${Utils.escapeHtml(r.name)}</strong>${UI.isMobile() ? `<div style="font-size:11px; color:var(--text-faint); font-weight:400;">${Utils.escapeHtml(r.conference)}</div>` : ''}</td>
                <td class="hide-mobile">${Utils.escapeHtml(r.conference)}</td>
                <td class="hide-mobile">${Utils.escapeHtml(r.ncaaRegion || r.region)}</td>
                <td class="num">${r.score}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>`;
    }

    // Universal profile navigation (Update 4, Part 4): every row opens a profile.
    body.querySelectorAll('[data-school]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = game.getSchool(el.dataset.school);
        if (s && UI.showSchoolCard) UI.showSchoolCard(s, game);
      });
    });
    body.querySelectorAll('[data-ath]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.openAthlete(game, el.dataset.ath);
      });
    });
    body.querySelectorAll('[data-coach]').forEach((el) => {
      el.addEventListener('click', () => UI.openCoach(game, el.dataset.coach));
    });

    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(container); });
    });
    container.querySelectorAll('[data-div]').forEach((btn) => {
      btn.addEventListener('click', () => { activeDiv = btn.dataset.div; render(container); });
    });
    container.querySelector('#g-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    container.querySelector('#g-w').addEventListener('click', () => { activeGender = 'W'; render(container); });
  }

  // Deep link from the Inbox (e.g. Selection Day → the Selection tab).
  function openTab(tab) { activeTab = tab; activeDiv = null; }

  UI.screens.rankings = { render, openTab, selectionHtml };
})();
