/*
 * History screen: the game remembers everything — champions, awards,
 * records, recruiting classes, the Hall of Fame, and your career.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  let activeTab = 'career';

  function render(container) {
    const game = UI.state.game;

    container.innerHTML = `
      <div class="screen-header">
        <h1>History</h1>
        <div class="actions">
          <div class="pill-tabs">
            <button data-tab="career" class="${activeTab === 'career' ? 'active' : ''}">My Career</button>
            <button data-tab="champions" class="${activeTab === 'champions' ? 'active' : ''}">Champions</button>
            <button data-tab="awards" class="${activeTab === 'awards' ? 'active' : ''}">Awards</button>
            <button data-tab="records" class="${activeTab === 'records' ? 'active' : ''}">Records</button>
            <button data-tab="hof" class="${activeTab === 'hof' ? 'active' : ''}">Hall of Fame</button>
          </div>
        </div>
      </div>
      <div id="hist-body"></div>`;

    const body = container.querySelector('#hist-body');
    ({ career, champions, awards, records, hof })[activeTab](game, body);

    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(container); });
    });
  }

  function career(game, el) {
    const c = game.career;
    const coach = game.getPlayerCoach();
    const school = game.getPlayerSchool();
    const summaries = game.history.seasonSummaries || {};
    const years = Object.keys(summaries).sort((a, b) => b - a);

    el.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Seasons</div><div class="value">${c.seasons}</div><div class="sub">at ${Utils.escapeHtml(school.name)}</div></div>
        <div class="stat-tile"><div class="label">Conference Titles</div><div class="value">${c.conferenceTitles}</div></div>
        <div class="stat-tile"><div class="label">National Titles</div><div class="value">${c.nationalTitles}</div><div class="sub">${c.podiums} podiums</div></div>
        <div class="stat-tile"><div class="label">Nationals Trips</div><div class="value">${c.nationalsAppearances}</div><div class="sub">best finish: ${c.bestFinish ? Utils.ordinal(c.bestFinish) : '—'}</div></div>
      </div>
      ${c.awards.length ? `
        <div class="card" style="margin-bottom:16px;">
          <h2>Personal Honors</h2>
          ${c.awards.map((a) => `<div class="attr-row"><span>🏅 ${Utils.escapeHtml(a)}</span></div>`).join('')}
        </div>` : ''}
      <div class="card">
        <h2>Season-by-Season</h2>
        ${years.length ? years.map((year) => {
          const rows = summaries[year];
          const champ = (game.history.nationalChampions || {})[year];
          return `
            <h3 style="margin-top:12px;">${year} ${champ ? `— Natl champs: ${Utils.escapeHtml(champ.M?.team || '?')} (M), ${Utils.escapeHtml(champ.W?.team || '?')} (W)` : ''}</h3>
            ${rows.length ? `<div class="table-wrap"><table class="data">
              <thead><tr><th>Wk</th><th>Meet</th><th></th><th class="num">Place</th><th class="num">Field</th></tr></thead>
              <tbody>${rows.map((r) => `
                <tr><td>${r.week}</td><td>${Utils.escapeHtml(r.meet)}</td><td>${r.gender}</td>
                <td class="num">${Utils.ordinal(r.place)}</td><td class="num">${r.teams}</td></tr>`).join('')}
              </tbody></table></div>` : '<div style="color:var(--text-dim);">No completed meets.</div>'}`;
        }).join('') : '<div style="color:var(--text-dim);">Complete a season and your résumé builds here.</div>'}
      </div>`;
  }

  function champions(game, el) {
    const natl = game.history.nationalChampions || {};
    const conf = game.history.conferenceChampions || {};
    const years = [...new Set([...Object.keys(natl), ...Object.keys(conf)])].sort((a, b) => b - a);
    const myConf = game.getPlayerSchool().conference;

    el.innerHTML = years.length ? years.map((year) => {
      const n = natl[year];
      const c = conf[year] || {};
      return `
        <div class="card" style="margin-bottom:16px;">
          <h2>${year}</h2>
          ${n ? ['M', 'W'].map((g) => n[g] ? `
            <div class="attr-row">
              <span>🏆 ${g === 'M' ? "Men's" : "Women's"} NCAA Champions: <strong>${Utils.escapeHtml(n[g].team)}</strong></span>
              <span style="color:var(--text-dim);">Individual: ${Utils.escapeHtml(n[g].individual)} (${Utils.escapeHtml(n[g].individualSchool)}) — ${window.XCD.engine.Races.formatTime(n[g].individualTime)}</span>
            </div>` : '').join('') : ''}
          ${c[`${myConf}-M`] || c[`${myConf}-W`] ? `
            <div class="attr-row" style="margin-top:6px;">
              <span>${Utils.escapeHtml(myConf)} champions:</span>
              <span>${c[`${myConf}-M`] ? 'M: ' + Utils.escapeHtml(c[`${myConf}-M`]) : ''} ${c[`${myConf}-W`] ? ' · W: ' + Utils.escapeHtml(c[`${myConf}-W`]) : ''}</span>
            </div>` : ''}
        </div>`;
    }).join('') : '<div class="card" style="color:var(--text-dim);">No championships have been decided yet.</div>';
  }

  function awards(game, el) {
    const A = game.history.awards || {};
    const years = Object.keys(A).sort((a, b) => b - a);
    el.innerHTML = years.length ? years.map((year) => {
      const y = A[year];
      const block = (gender) => {
        const g = y[gender];
        if (!g) return '';
        return `
          <h3 style="margin-top:10px;">${gender === 'M' ? "Men" : "Women"}</h3>
          ${g.runnerOfYear ? `<div class="attr-row"><span class="attr-name">Runner of the Year</span><span>${Utils.escapeHtml(g.runnerOfYear.name)} — ${Utils.escapeHtml(g.runnerOfYear.school)}</span></div>` : ''}
          ${g.freshmanOfYear ? `<div class="attr-row"><span class="attr-name">Freshman of the Year</span><span>${Utils.escapeHtml(g.freshmanOfYear.name)} — ${Utils.escapeHtml(g.freshmanOfYear.school)}</span></div>` : ''}
          ${g.coachOfYear ? `<div class="attr-row"><span class="attr-name">Coach of the Year</span><span>${Utils.escapeHtml(g.coachOfYear.name)} — ${Utils.escapeHtml(g.coachOfYear.school)}</span></div>` : ''}
          ${g.allAmericans ? `<div class="attr-row"><span class="attr-name">All-Americans</span><span style="font-size:12px; color:var(--text-dim);">${g.allAmericans.slice(0, 10).map((x) => Utils.escapeHtml(x.name)).join(', ')}…</span></div>` : ''}
          ${g.academicAllAmericans && g.academicAllAmericans.length ? `<div class="attr-row"><span class="attr-name">Academic All-Americans</span><span style="font-size:12px; color:var(--text-dim);">${g.academicAllAmericans.slice(0, 5).map((x) => Utils.escapeHtml(x.name)).join(', ')}</span></div>` : ''}`;
      };
      return `<div class="card" style="margin-bottom:16px;"><h2>${year} Awards</h2>${block('M')}${block('W')}</div>`;
    }).join('') : '<div class="card" style="color:var(--text-dim);">Awards are handed out after each NCAA Championships.</div>';
  }

  function records(game, el) {
    const R = game.history.records || {};
    const keys = Object.keys(R).sort();
    el.innerHTML = `
      <div class="card">
        <h2>All-Time National Records</h2>
        ${keys.length ? keys.map((k) => {
          const r = R[k];
          return `<div class="attr-row">
            <span class="attr-name">${k.replace('M-', "Men's ").replace('W-', "Women's ")}</span>
            <span><strong>${window.XCD.engine.Races.formatTime(r.time)}</strong> — ${Utils.escapeHtml(r.name)}, ${Utils.escapeHtml(r.school)} (${r.year})</span>
          </div>`;
        }).join('') : '<div style="color:var(--text-dim);">Records will be set once racing begins.</div>'}
      </div>`;
  }

  function hof(game, el) {
    const list = (game.history.hallOfFame || []).slice().sort((a, b) => b.score - a.score);
    el.innerHTML = `
      <div class="card">
        <h2>Hall of Fame — ${list.length} inductees</h2>
        ${list.length ? `
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Legend</th><th></th><th>School</th><th class="num">Wins</th><th class="num">Top-5s</th><th class="num">All-Am</th><th class="num">Natl Titles</th><th class="num">Inducted</th></tr></thead>
            <tbody>
              ${list.map((h) => `
                <tr ${h.schoolId === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : ''}>
                  <td><strong>🏛 ${Utils.escapeHtml(h.name)}</strong></td>
                  <td>${h.gender}</td>
                  <td>${Utils.escapeHtml(h.school)}</td>
                  <td class="num">${h.stats.wins}</td>
                  <td class="num">${h.stats.top5}</td>
                  <td class="num">${h.stats.allAmerican}</td>
                  <td class="num">${h.stats.natChamp}</td>
                  <td class="num">${h.inducted}</td>
                </tr>`).join('')}
            </tbody>
          </table></div>`
        : '<div style="color:var(--text-dim);">Legendary careers end up here. Nobody has earned a plaque yet.</div>'}
      </div>`;
  }

  UI.screens.history = { render };
})();
