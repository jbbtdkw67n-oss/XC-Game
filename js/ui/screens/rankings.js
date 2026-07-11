/*
 * Rankings screen: national/regional/conference team polls, individual
 * rankings, and freshman rankings — per gender.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  let activeTab = 'national';
  let activeGender = 'M';

  function arrow(r) {
    if (!r.prevRank) return '<span style="color:var(--text-faint);">·</span>';
    const d = r.prevRank - r.rank;
    if (d > 0) return `<span style="color:var(--success);">▲${d}</span>`;
    if (d < 0) return `<span style="color:var(--danger);">▼${-d}</span>`;
    return '<span style="color:var(--text-faint);">—</span>';
  }

  function render(container) {
    const game = UI.state.game;
    const R = game.rankings;
    const school = game.getPlayerSchool();

    container.innerHTML = `
      <div class="screen-header">
        <h1>Rankings</h1>
        <div class="actions">
          <div class="pill-tabs">
            <button data-tab="national" class="${activeTab === 'national' ? 'active' : ''}">National</button>
            <button data-tab="region" class="${activeTab === 'region' ? 'active' : ''}">Region</button>
            <button data-tab="conference" class="${activeTab === 'conference' ? 'active' : ''}">Conference</button>
            <button data-tab="individual" class="${activeTab === 'individual' ? 'active' : ''}">Individuals</button>
            <button data-tab="freshman" class="${activeTab === 'freshman' ? 'active' : ''}">Freshmen</button>
            <button data-tab="coaches" class="${activeTab === 'coaches' ? 'active' : ''}">Coaches</button>
          </div>
          <div class="pill-tabs">
            <button id="g-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="g-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
        </div>
      </div>
      <div class="card" id="rank-body"></div>`;

    const body = container.querySelector('#rank-body');

    if (activeTab === 'coaches') {
      const all = window.XCD.engine.Careers.coachRankings(game);
      const rows = all.slice(0, 50);
      const me = all.find((r) => r.isPlayer);
      if (me && me.rank > 50) rows.push(me); // always show yourself
      body.innerHTML = `
        <h2>National Coach Rankings</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Rank</th><th>Coach</th><th>School</th><th>Style</th><th class="num">Natl Titles</th><th class="num">Conf Titles</th><th class="num">Best Poll</th><th class="num">Score</th></tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr ${r.isPlayer ? 'style="background:var(--accent-soft);"' : ''}>
                <td>#${r.rank}</td>
                <td><strong>${Utils.escapeHtml(r.name)}</strong>${r.isPlayer ? ' <span style="color:var(--accent);">(You)</span>' : ''}</td>
                <td>${Utils.escapeHtml(r.school)}</td>
                <td style="font-size:12px; color:var(--text-dim);">${Utils.escapeHtml(r.personality)}</td>
                <td class="num">${r.natTitles}</td>
                <td class="num">${r.confTitles}</td>
                <td class="num">${r.bestRank <= 354 ? '#' + r.bestRank : '—'}</td>
                <td class="num">${r.score}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>`;
    } else if (activeTab === 'individual' || activeTab === 'freshman') {
      const list = activeTab === 'individual' ? R.individuals[activeGender] : R.freshmen[activeGender];
      body.innerHTML = list.length ? `
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Rank</th><th>Runner</th><th>Class</th><th>School</th><th class="num">Best Pace/km</th><th class="num">Wins</th></tr></thead>
          <tbody>
            ${list.map((r) => `
              <tr ${r.schoolId === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : ''}>
                <td>#${r.rank}</td>
                <td><strong>${Utils.escapeHtml(r.name)}</strong></td>
                <td>${r.classYear}</td>
                <td>${Utils.escapeHtml(r.school)}</td>
                <td class="num">${window.XCD.engine.Races.formatTime(r.pace)}</td>
                <td class="num">${r.wins}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>`
        : '<div style="color:var(--text-dim);">No race results yet this season — rankings publish after the first meets.</div>';
    } else {
      let rows = R[activeGender];
      let heading = 'AP-Style National Poll';
      if (activeTab === 'region') {
        rows = rows.filter((r) => r.region === school.region);
        heading = `${school.region} Regional Rankings`;
      } else if (activeTab === 'conference') {
        rows = rows.filter((r) => r.conference === school.conference);
        heading = `${school.conference} Standings`;
      } else {
        rows = rows.slice(0, 40);
      }
      body.innerHTML = `
        <h2>${heading} — Week ${R.computedWeek}</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Rank</th><th></th><th>Team</th><th>Conference</th><th>Region</th><th class="num">Score</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr ${r.schoolId === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : ''}>
                <td>#${activeTab === 'national' ? r.rank : i + 1}${activeTab !== 'national' ? ` <span style="color:var(--text-faint); font-size:11px;">(natl #${r.rank})</span>` : ''}</td>
                <td>${arrow(r)}</td>
                <td><strong>${Utils.escapeHtml(r.name)}</strong></td>
                <td>${Utils.escapeHtml(r.conference)}</td>
                <td>${Utils.escapeHtml(r.region)}</td>
                <td class="num">${r.score}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>`;
    }

    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(container); });
    });
    container.querySelector('#g-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    container.querySelector('#g-w').addEventListener('click', () => { activeGender = 'W'; render(container); });
  }

  UI.screens.rankings = { render };
})();
