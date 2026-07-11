/*
 * Dashboard: program overview, top runners, latest news.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  function render(container) {
    const game = UI.state.game;
    const school = game.getPlayerSchool();
    const coach = game.getPlayerCoach();
    const rosterM = game.getRoster(school.id, 'M').sort((a, b) => b.currentOverall - a.currentOverall);
    const rosterW = game.getRoster(school.id, 'W').sort((a, b) => b.currentOverall - a.currentOverall);

    const teamAvg = (roster) => roster.length
      ? Math.round(Utils.average(roster.slice(0, 7).map((a) => a.currentOverall)))
      : 0;

    const topRunnersHtml = (roster, label) => `
      <div class="card">
        <h2>${label} — Top 7</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>Name</th><th>Class</th><th class="num">OVR</th><th class="num">POT</th></tr></thead>
          <tbody>
            ${roster.slice(0, 7).map((a, i) => `
              <tr class="clickable" data-ath="${a.id}">
                <td>${i + 1}</td>
                <td>${Utils.escapeHtml(a.fullName)}</td>
                <td>${a.classYear}</td>
                <td class="num">${UI.ratingBadge(a.currentOverall)}</td>
                <td class="num">${UI.ratingBadge(a.potential)}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;

    container.innerHTML = `
      <div class="screen-header">
        <h1>${Utils.escapeHtml(school.name)} Cross Country</h1>
        <div class="actions">
          <span class="phase-pill" style="background:var(--accent-soft); color:var(--accent-hover); padding:5px 14px; border-radius:999px; font-size:13px;">
            Coach ${Utils.escapeHtml(coach.fullName)} — Year ${coach.yearsAtSchool + 1}
          </span>
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile">
          <div class="label">Prestige</div>
          <div class="value">${school.prestige}</div>
          <div class="sub">${Utils.ratingGrade(school.prestige)} — ${Utils.escapeHtml(school.conference)}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Men's Team</div>
          <div class="value">${teamAvg(rosterM)}</div>
          <div class="sub">${rosterM.length} runners</div>
        </div>
        <div class="stat-tile">
          <div class="label">Women's Team</div>
          <div class="value">${teamAvg(rosterW)}</div>
          <div class="sub">${rosterW.length} runners</div>
        </div>
        <div class="stat-tile">
          <div class="label">Facilities</div>
          <div class="value">${school.facilitiesOverall}</div>
          <div class="sub">Budget $${(school.budget.total / 1000).toFixed(0)}k</div>
        </div>
      </div>

      <div class="grid cols-2">
        ${topRunnersHtml(rosterM, "Men's Team")}
        ${topRunnersHtml(rosterW, "Women's Team")}
      </div>

      <div class="card" style="margin-top:16px;">
        <h2>Latest News</h2>
        ${game.newsLog.slice(0, 8).map((n) => `
          <div class="news-item">
            <span class="when">Wk ${n.week}, ${n.year}</span>${Utils.escapeHtml(n.text)}
          </div>`).join('') || '<div style="color:var(--text-dim);">No news yet.</div>'}
      </div>`;

    container.querySelectorAll('[data-ath]').forEach((tr) => {
      tr.addEventListener('click', () => {
        UI.showPlayerCard(game.getAthlete(tr.dataset.ath), game);
      });
    });
  }

  UI.screens.dashboard = { render };
})();
