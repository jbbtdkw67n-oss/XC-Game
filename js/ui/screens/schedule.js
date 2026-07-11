/*
 * Schedule screen: the season at a glance — every meet the player's program
 * runs, results so far, upcoming fields, and full meet result pop-ups.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const Races = () => window.XCD.engine.Races;

  function meetResultModal(game, meet, gender) {
    const res = meet.results[gender];
    if (!res) { UI.toast('No results for that race yet.'); return; }
    const ft = Races().formatTime;

    const teamRows = res.teamScores.map((t) => {
      const school = game.getSchool(t.schoolId);
      const mine = t.schoolId === game.playerSchoolId;
      return `<tr ${mine ? 'style="background:var(--accent-soft);"' : ''}>
        <td>${t.place}</td>
        <td><strong>${Utils.escapeHtml(school ? school.name : '?')}</strong></td>
        <td class="num">${t.points}</td>
        <td style="color:var(--text-dim); font-size:12px;">${t.scorers.join(' + ')}</td>
      </tr>`;
    }).join('');

    const shown = res.finishers.slice(0, 30);
    const mineExtra = (res.finishers.length > 30)
      ? res.finishers.filter((f) => f.schoolId === game.playerSchoolId && f.place > 30)
      : [];
    const indivRows = shown.concat(mineExtra).map((f) => {
      const school = game.getSchool(f.schoolId);
      const mine = f.schoolId === game.playerSchoolId;
      return `<tr ${mine ? 'style="background:var(--accent-soft);"' : ''}>
        <td>${f.place}</td>
        <td>${Utils.escapeHtml(f.name)} <span style="color:var(--text-faint); font-size:11px;">${f.classYear || ''}</span></td>
        <td>${Utils.escapeHtml(school ? school.name : '?')}</td>
        <td class="num">${ft(f.time)}</td>
      </tr>`;
    }).join('');

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <h2>${Utils.escapeHtml(meet.name)} — ${gender === 'M' ? "Men's" : "Women's"} ${Races().distKey(res.distanceM)}</h2>
      <div style="color:var(--text-dim); font-size:13px; margin-bottom:14px;">
        Week ${meet.week} • ${meet.conditions.tempF}°F${meet.conditions.rain ? ' • Rain' : ''} •
        Hills ${meet.conditions.hilliness}/100 • ${meet.conditions.altitude} altitude
      </div>
      <div class="grid cols-2">
        <div class="card" style="padding:12px;">
          <h3>Team Scores</h3>
          <div class="table-wrap" style="max-height:340px; overflow-y:auto;">
            <table class="data"><thead><tr><th>Pl</th><th>Team</th><th class="num">Pts</th><th>Scorers</th></tr></thead>
            <tbody>${teamRows}</tbody></table>
          </div>
        </div>
        <div class="card" style="padding:12px;">
          <h3>Individuals${res.finisherCount > shown.length ? ` (top ${shown.length} of ${res.finisherCount})` : ''}</h3>
          <div class="table-wrap" style="max-height:340px; overflow-y:auto;">
            <table class="data"><thead><tr><th>Pl</th><th>Runner</th><th>School</th><th class="num">Time</th></tr></thead>
            <tbody>${indivRows}</tbody></table>
          </div>
        </div>
      </div>`);
  }

  UI.showMeetResults = meetResultModal;

  function render(container) {
    const game = UI.state.game;
    const season = game.season;
    const school = game.getPlayerSchool();
    const Rk = window.XCD.engine.Rankings;

    const typeLabel = { invite: 'Invitational', conference: 'Conference', regional: 'Regional', national: 'Nationals' };
    const weeks = [
      ...season.raceWeeks.map((w) => {
        const meet = season.playerMeetByWeek[w] && season.meets[season.playerMeetByWeek[w]];
        const label = meet
          ? (meet.elite ? '⭐ Elite Invitational' : typeLabel[meet.type] || 'Invitational')
          : 'Invitational';
        return { week: w, label };
      }),
      { week: season.conferenceWeek, label: 'Conference' },
      { week: season.regionalWeek, label: 'Regional' },
      { week: season.nationalWeek, label: 'Nationals' }
    ];

    const rows = weeks.map(({ week, label }) => {
      let meetId = season.playerMeetByWeek[week];
      let note = '';
      if (week === season.nationalWeek) {
        const inM = season.nationalsFieldIds.M?.includes(game.playerSchoolId);
        const inW = season.nationalsFieldIds.W?.includes(game.playerSchoolId);
        if (game.week > season.regionalWeek && !inM && !inW && season.nationalsFieldIds.M?.length) {
          note = 'Did not qualify';
          meetId = null;
        } else {
          meetId = season.nationalsMeetId;
          if (inM || inW) note = `Qualified (${[inM && 'M', inW && 'W'].filter(Boolean).join(' & ')})`;
          else note = 'Field set after regionals';
        }
      }
      const meet = meetId ? season.meets[meetId] : null;
      const done = meet && meet.results.M;

      let status;
      if (!meet) status = `<span style="color:var(--text-faint);">${note || '—'}</span>`;
      else if (done) {
        status = ['M', 'W'].map((g) => {
          const res = meet.results[g];
          if (!res) return '';
          const mine = res.teamScores.find((t) => t.schoolId === game.playerSchoolId);
          return mine
            ? `<span class="rating ${mine.place === 1 ? 'r-elite' : mine.place <= 3 ? 'r-great' : mine.place <= Math.ceil(res.teamScores.length / 2) ? 'r-good' : 'r-avg'}" style="margin-right:4px;">${g}: ${Utils.ordinal(mine.place)}</span>`
            : `<span style="color:var(--text-faint); margin-right:4px;">${g}: —</span>`;
        }).join('');
      } else if (week < game.week) status = '<span style="color:var(--text-faint);">Missed</span>';
      else if (week === game.week) status = '<span style="color:var(--warning); font-weight:700;">RACE WEEK — advance to run it</span>';
      else status = `<span style="color:var(--text-dim);">${note || 'Upcoming'}</span>`;

      const field = meet
        ? `${(meet.type === 'national' ? (meet.fieldByGender?.M || []) : meet.schoolIds).length || '~31'} teams`
        : '';
      const conditions = meet
        ? `${meet.conditions.tempF}°F${meet.conditions.rain ? ' 🌧' : ''} · hills ${meet.conditions.hilliness}`
        : '';

      return `<tr class="${meet && done ? 'clickable' : ''}" ${meet && done ? `data-meet="${meet.id}"` : ''}>
        <td>Wk ${week}</td>
        <td><strong>${meet ? Utils.escapeHtml(meet.name) : (note || 'No meet')}</strong>
          <span style="color:var(--text-faint); font-size:11px;"> ${label}</span></td>
        <td>${field}</td>
        <td style="font-size:12.5px; color:var(--text-dim);">${conditions}</td>
        <td>${status}</td>
      </tr>`;
    }).join('');

    const rankM = Rk.teamRank(game, school.id, 'M');
    const rankW = Rk.teamRank(game, school.id, 'W');

    // Upcoming meet field preview
    let previewHtml = '';
    const nextRaceWeek = weeks.map((w) => w.week).find((w) => w >= game.week && season.playerMeetByWeek[w]);
    if (nextRaceWeek) {
      const meet = season.meets[season.playerMeetByWeek[nextRaceWeek]];
      if (meet && !meet.results.M) {
        const fieldTeams = meet.schoolIds
          .map((id) => ({ school: game.getSchool(id), rank: Rk.teamRank(game, id, 'M') }))
          .filter((t) => t.school)
          .sort((a, b) => (a.rank || 999) - (b.rank || 999))
          .slice(0, 10);
        previewHtml = `
          <div class="card" style="margin-top:16px;">
            <h2>Next Up: ${Utils.escapeHtml(meet.name)} (Week ${meet.week})</h2>
            <div style="color:var(--text-dim); font-size:13px; margin-bottom:10px;">
              ${meet.conditions.tempF}°F${meet.conditions.rain ? ', rain likely' : ''} ·
              hills ${meet.conditions.hilliness}/100 · ${meet.conditions.altitude} altitude ·
              M ${Races().distKey(meet.distances.M)} / W ${Races().distKey(meet.distances.W)}
            </div>
            <h3>Field to Watch (men's poll)</h3>
            ${fieldTeams.map((t) => `
              <div class="attr-row">
                <span>${t.rank ? '#' + t.rank + ' ' : ''}${Utils.escapeHtml(t.school.name)}${t.school.id === game.playerSchoolId ? ' <span style="color:var(--accent);">(You)</span>' : ''}</span>
                <span style="color:var(--text-dim); font-size:12px;">${Utils.escapeHtml(t.school.conference)}</span>
              </div>`).join('')}
          </div>`;
      }
    }

    container.innerHTML = `
      <div class="screen-header">
        <h1>Season Schedule — ${season.year}</h1>
        <div class="actions">
          <span class="phase-pill" style="padding:5px 14px;">Men ${rankM ? '#' + rankM : '—'} · Women ${rankW ? '#' + rankW : '—'}</span>
          ${game.lastPlayerMeetId && game.season.meets[game.lastPlayerMeetId]?.results.M
            ? '<button class="btn primary" id="btn-race-center">📺 Race Center (last meet)</button>' : ''}
        </div>
      </div>
      <div class="card">
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Week</th><th>Meet</th><th>Field</th><th>Conditions</th><th>Result</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div style="color:var(--text-faint); font-size:12px; margin-top:8px;">Click a completed meet for full results.</div>
      </div>
      ${previewHtml}`;

    container.querySelectorAll('[data-meet]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const meet = season.meets[tr.dataset.meet];
        meetResultModal(game, meet, 'M');
      });
    });

    const rcBtn = container.querySelector('#btn-race-center');
    if (rcBtn) rcBtn.addEventListener('click', () => UI.navigate('racecenter'));
  }

  UI.screens.schedule = { render };
})();
