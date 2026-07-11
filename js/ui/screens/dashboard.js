/*
 * Dashboard v2: program pulse — polls with movement, career trophies,
 * next race, squad health warnings, top runners, latest news.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  function rankTile(game, gender) {
    const list = game.rankings && game.rankings[gender];
    if (!list) return { rank: '—', move: '' };
    const row = list.find((r) => r.schoolId === game.playerSchoolId);
    if (!row) return { rank: '—', move: '' };
    let move = '';
    if (row.prevRank) {
      const d = row.prevRank - row.rank;
      if (d > 0) move = `<span style="color:var(--success); font-size:13px;">▲${d}</span>`;
      else if (d < 0) move = `<span style="color:var(--danger); font-size:13px;">▼${-d}</span>`;
    }
    return { rank: `#${row.rank}`, move };
  }

  function render(container) {
    const game = UI.state.game;
    const school = game.getPlayerSchool();
    const coach = game.getPlayerCoach();
    const season = game.season;
    const TE = window.XCD.engine.Training;

    const rosterM = game.getRoster(school.id, 'M').sort((a, b) => b.currentOverall - a.currentOverall);
    const rosterW = game.getRoster(school.id, 'W').sort((a, b) => b.currentOverall - a.currentOverall);
    const everyone = rosterM.concat(rosterW);

    const rm = rankTile(game, 'M');
    const rw = rankTile(game, 'W');

    // Next race
    const raceWeeks = [...season.raceWeeks, season.conferenceWeek, season.regionalWeek, season.nationalWeek];
    const nextWeek = raceWeeks.find((w) => w >= game.week &&
      (season.playerMeetByWeek[w] || (w === season.nationalWeek)));
    const nextMeet = nextWeek
      ? (season.playerMeetByWeek[nextWeek] ? season.meets[season.playerMeetByWeek[nextWeek]]
        : (nextWeek === season.nationalWeek ? season.meets[season.nationalsMeetId] : null))
      : null;

    // Health warnings
    const injured = everyone.filter((a) => a.injury);
    const gassed = everyone.filter((a) => !a.injury && a.fatigue > 70);
    const unhappy = everyone.filter((a) => a.morale < 45);
    const warnings = [];
    if (injured.length) warnings.push(`🩼 ${injured.length} injured (${injured.slice(0, 3).map((a) => a.lastName).join(', ')}${injured.length > 3 ? '…' : ''})`);
    if (gassed.length >= 3) warnings.push(`🥵 ${gassed.length} runners over 70 fatigue — consider a recovery week`);
    if (unhappy.length >= 2) warnings.push(`😟 ${unhappy.length} runners with low morale`);
    if (game.portal && game.portal.open) {
      const leaving = game.portal.entries.filter((e) => e.fromSchoolId === school.id && !e.destination).length;
      if (leaving) warnings.push(`🔄 ${leaving} of your athletes are in the transfer portal`);
    }

    const topRunnersHtml = (roster, label) => `
      <div class="card">
        <h2>${label} — Top 7</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>Name</th><th>Class</th><th class="num">OVR</th><th class="num">Δ</th><th class="num">Ready</th></tr></thead>
          <tbody>
            ${roster.slice(0, 7).map((a, i) => `
              <tr class="clickable" data-ath="${a.id}">
                <td>${i + 1}</td>
                <td>${Utils.escapeHtml(a.fullName)}${a.redshirt === 'True' || a.redshirt === 'Medical' ? ' <span style="color:var(--warning); font-size:10px;">RS</span>' : ''}${a.injury ? ' <span style="color:var(--danger); font-size:10px;">INJ</span>' : ''}</td>
                <td>${a.classYear}</td>
                <td class="num">${UI.ratingBadge(a.currentOverall)}</td>
                <td class="num" style="color:${(a.seasonDev || 0) > 0 ? 'var(--success)' : 'var(--text-faint)'};">${(a.seasonDev || 0) > 0 ? '+' + a.seasonDev : '—'}</td>
                <td class="num">${TE.readiness(a)}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;

    container.innerHTML = `
      <div class="screen-header">
        <h1>${Utils.escapeHtml(school.name)} Cross Country</h1>
        <div class="actions">
          <span class="phase-pill" style="padding:5px 14px;">
            Coach ${Utils.escapeHtml(coach.fullName)} — Season ${game.career.seasons + 1}
          </span>
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile">
          <div class="label">Men's Poll</div>
          <div class="value">${rm.rank} ${rm.move}</div>
          <div class="sub">squad ${rosterM.length ? Math.round(Utils.average(rosterM.slice(0, 7).map((a) => a.currentOverall))) : '—'} OVR</div>
        </div>
        <div class="stat-tile">
          <div class="label">Women's Poll</div>
          <div class="value">${rw.rank} ${rw.move}</div>
          <div class="sub">squad ${rosterW.length ? Math.round(Utils.average(rosterW.slice(0, 7).map((a) => a.currentOverall))) : '—'} OVR</div>
        </div>
        <div class="stat-tile">
          <div class="label">Prestige</div>
          <div class="value">${school.prestige}</div>
          <div class="sub">${Utils.escapeHtml(school.conference)}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Trophy Case</div>
          <div class="value">${game.career.nationalTitles}🏆 ${game.career.conferenceTitles}🏅</div>
          <div class="sub">${game.career.nationalsAppearances} nationals trips</div>
        </div>
      </div>

      ${game.jobOffers && game.jobOffers.offers.length ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent);">
          <h2>📞 Athletic Directors Are Calling</h2>
          <div style="color:var(--text-dim); font-size:13px; margin-bottom:10px;">
            Offers expire Week ${game.jobOffers.expiresWeek}. Leaving resets your recruiting board relationships and team culture.
          </div>
          ${game.jobOffers.offers.map((o) => `
            <div class="attr-row" style="padding:6px 0;">
              <span>${o.kind === 'Dream job' ? '🌟 ' : ''}<strong>${Utils.escapeHtml(o.schoolName)}</strong>
                <span style="color:var(--text-dim);">(${Utils.escapeHtml(o.conference)} • prestige ${o.prestige})</span>
                ${o.kind ? `<span class="rating ${o.kind === 'Dream job' ? 'r-elite' : o.kind === 'Step up' ? 'r-great' : o.kind === 'Lateral move' ? 'r-avg' : 'r-poor'}" style="margin-left:6px;">${o.kind}</span>` : ''}</span>
              <button class="btn small primary" data-accept="${o.schoolId}">Accept Job</button>
            </div>`).join('')}
          <div style="margin-top:8px;"><button class="btn small danger" id="btn-decline-offers">Stay Loyal</button></div>
        </div>` : ''}

      ${nextMeet ? `
        <div class="card" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h2 style="margin-bottom:4px;">🏁 Next: ${Utils.escapeHtml(nextMeet.name)} — Week ${nextMeet.week}${nextMeet.week === game.week ? ' (THIS WEEK)' : ''}</h2>
            <span style="color:var(--text-dim); font-size:13px;">
              ${nextMeet.conditions.tempF}°F${nextMeet.conditions.rain ? ' · rain' : ''} · hills ${nextMeet.conditions.hilliness}/100 · ${nextMeet.conditions.altitude} altitude
            </span>
          </div>
          <button class="btn" id="btn-to-schedule">View Schedule →</button>
        </div>` : ''}

      ${warnings.length ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--warning);">
          <h2>Coach's Desk</h2>
          ${warnings.map((w) => `<div class="attr-row"><span>${w}</span></div>`).join('')}
        </div>` : ''}

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
      tr.addEventListener('click', () => UI.showPlayerCard(game.getAthlete(tr.dataset.ath), game));
    });
    const schedBtn = container.querySelector('#btn-to-schedule');
    if (schedBtn) schedBtn.addEventListener('click', () => UI.navigate('schedule'));

    container.querySelectorAll('[data-accept]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = game.getSchool(btn.dataset.accept);
        UI.showModal(`
          <h2>Take the ${Utils.escapeHtml(target.name)} job?</h2>
          <p style="color:var(--text-dim); margin-bottom:16px;">
            You'll leave ${Utils.escapeHtml(game.getPlayerSchool().name)} immediately. Your career record
            travels with you; your roster, recruits, and captains stay behind.
          </p>
          <div style="display:flex; gap:10px;">
            <button class="btn primary" id="confirm-move">Accept — Let's Build</button>
            <button class="btn" data-modal-close>Cancel</button>
          </div>
        `, (modal) => {
          modal.querySelector('#confirm-move').addEventListener('click', () => {
            const result = window.XCD.engine.Careers.acceptOffer(game, btn.dataset.accept);
            UI.closeModal();
            UI.toast(result.message, result.ok ? 'success' : 'error');
            if (result.ok) UI.renderShell();
          });
        });
      });
    });
    const declineBtn = container.querySelector('#btn-decline-offers');
    if (declineBtn) declineBtn.addEventListener('click', () => {
      window.XCD.engine.Careers.declineOffers(game);
      UI.toast('You recommit to the program.', 'success');
      render(container);
    });
  }

  UI.screens.dashboard = { render };
})();
