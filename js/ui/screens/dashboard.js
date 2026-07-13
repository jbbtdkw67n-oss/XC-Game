/*
 * Dashboard v2: program pulse — polls with movement, career trophies,
 * next race, squad health warnings, top runners, latest news.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  /*
   * Annual program expectations (Update 5, Part 5): what the athletic
   * department expects this season, scaled by prestige, division pressure,
   * budget, program history, and conference strength. Elite programs are
   * expected to contend for trophies; rebuilds are asked to improve.
   */
  function expectationsFor(school) {
    const D = window.XCD.data;
    const div = D.divisionFor(school);
    const p = school.prestige || 50;
    const hs = school.historicalSuccess || {};
    const pedigree = (hs.nationalTitlesM || 0) + (hs.nationalTitlesW || 0) + (hs.conferenceTitlesM || 0) + (hs.conferenceTitlesW || 0);
    const strongConf = (school.conferenceTier || 3) <= 1;
    const goals = [];
    if (p >= 82) {
      goals.push('contend for a national trophy', 'a top-10 national finish', 'win the conference');
    } else if (p >= 66) {
      goals.push('qualify for Nationals', 'finish top-3 in a strong conference' , 'earn All-America honors');
    } else if (p >= 48) {
      goals.push('reach the NCAA Regional podium picture', 'a top-half conference finish', 'develop All-Conference runners');
    } else {
      goals.push('show clear, steady improvement', 'be competitive in-conference', 'build the roster through recruiting');
    }
    const tierLabel = p >= 82 ? 'Elite program' : p >= 66 ? 'Established program' : p >= 48 ? 'Middle-tier program' : 'Rebuilding program';
    const budgetNote = school.budget && school.budget.total >= 400000 ? ' Resources are strong, so patience is short.'
      : (school.budget && school.budget.total < 180000 ? ' Modest resources temper the demands.' : '');
    const histNote = pedigree >= 6 ? ' A proud history raises the bar.' : '';
    const confNote = strongConf ? ' The conference is a gauntlet.' : '';
    return `${tierLabel} · ${div.label}. Expected to ${goals.join(', ')}.${budgetNote}${histNote}${confNote}`;
  }

  // Season W/L from the player's completed meets (dual-meet-style ledger).
  function seasonRecord(game) {
    const s = game.season;
    let w = 0, l = 0;
    if (!s) return { w, l };
    Object.values(s.meets).forEach((meet) => {
      if (!meet.results) return;
      ['M', 'W'].forEach((g) => {
        const res = meet.results[g];
        if (!res || !res.teamScores) return;
        const mine = res.teamScores.find((t) => t.schoolId === game.playerSchoolId);
        if (!mine) return;
        w += res.teamScores.length - mine.place;
        l += mine.place - 1;
      });
    });
    return { w, l };
  }

  // Where the player sits among same-conference programs in the poll.
  function confStanding(game, gender) {
    const list = game.rankings && game.rankings[gender];
    if (!list) return null;
    const school = game.getPlayerSchool();
    const conf = list
      .filter((r) => { const s = game.getSchool(r.schoolId); return s && s.conference === school.conference; })
      .sort((a, b) => a.rank - b.rank);
    const idx = conf.findIndex((r) => r.schoolId === game.playerSchoolId);
    return idx >= 0 ? { pos: idx + 1, of: conf.length } : null;
  }

  // Ordered list of the player's meets this season (regular + championships).
  function playerMeets(game) {
    const s = game.season;
    if (!s) return [];
    const weeks = Object.keys(s.playerMeetByWeek).map(Number).sort((a, b) => a - b);
    const meets = weeks.map((w) => s.meets[s.playerMeetByWeek[w]]).filter(Boolean);
    // Nationals: included when the player qualified.
    const natId = s.nationalsMeetId;
    if (natId && s.meets[natId] && !meets.some((m) => m.id === natId)) {
      const inField = (s.nationalsFieldIds && (
        (s.nationalsFieldIds.M || []).includes(game.playerSchoolId) ||
        (s.nationalsFieldIds.W || []).includes(game.playerSchoolId)));
      if (inField) meets.push(s.meets[natId]);
    }
    return meets.sort((a, b) => a.week - b.week);
  }

  function playerPlace(game, meet) {
    if (!meet.results) return null;
    const places = ['M', 'W'].map((g) => {
      const res = meet.results[g];
      const mine = res && res.teamScores && res.teamScores.find((t) => t.schoolId === game.playerSchoolId);
      return mine ? mine.place : null;
    }).filter((p) => p != null);
    return places.length ? Math.min(...places) : null;
  }

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
    const recovering = everyone.filter((a) => !a.injury && a.health === 'Recovering');
    if (recovering.length) warnings.push(`🔶 ${recovering.length} returning from injury — rebuilding race form (${recovering.slice(0, 3).map((a) => a.lastName).join(', ')}${recovering.length > 3 ? '…' : ''})`);
    if (gassed.length >= 3) warnings.push(`🥵 ${gassed.length} runners over 70 fatigue — consider a recovery week`);
    if (unhappy.length >= 2) warnings.push(`😟 ${unhappy.length} runners with low morale`);
    if ((school.teamMorale ?? 65) < 45) warnings.push(`💬 Team morale is ${(window.XCD.engine.Morale.label(school.teamMorale)).text.toLowerCase()} (${school.teamMorale}) — belief is wavering; results vs expectations will decide the turnaround`);
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
                <td>${Utils.escapeHtml(a.fullName)}${a.redshirt === 'True' || a.redshirt === 'Medical' ? ' <span style="color:var(--warning); font-size:10px;">RS</span>' : ''}${a.injury ? ' <span style="color:var(--danger); font-size:10px;">INJ</span>' : a.health === 'Recovering' ? ' <span style="color:var(--warning); font-size:10px;" title="Returning from injury">REC</span>' : ''}</td>
                <td>${a.classYear}</td>
                <td class="num">${UI.ratingBadge(a.currentOverall)}</td>
                <td class="num" style="color:${(a.seasonDev || 0) > 0 ? 'var(--success)' : 'var(--text-faint)'};">${(a.seasonDev || 0) > 0 ? '+' + a.seasonDev : '—'}</td>
                <td class="num">${TE.readiness(a)}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;

    // Season overview widget data (Update 5, Part 13).
    const meets = playerMeets(game);
    const completed = meets.filter((m) => playerPlace(game, m) != null);
    const upcoming = meets.filter((m) => playerPlace(game, m) == null && m.week >= game.week);
    const recent = completed.slice(-3).reverse();
    const rec = seasonRecord(game);
    const csM = confStanding(game, 'M');
    const csW = confStanding(game, 'W');
    // Next opponent: the strongest OTHER program in the next meet's field.
    let nextOpponent = null;
    const nextField = upcoming[0];
    if (nextField && nextField.schoolIds) {
      const rankOf = (sid) => {
        const m = game.rankings && game.rankings.M.find((r) => r.schoolId === sid);
        const w = game.rankings && game.rankings.W.find((r) => r.schoolId === sid);
        return Math.min(m ? m.rank : 999, w ? w.rank : 999);
      };
      const rivals = nextField.schoolIds
        .filter((sid) => sid !== game.playerSchoolId)
        .map((sid) => ({ sid, school: game.getSchool(sid), rank: rankOf(sid) }))
        .filter((x) => x.school)
        .sort((a, b) => a.rank - b.rank);
      nextOpponent = rivals[0] || null;
    }

    // Program expectations & the player's job security (Update 5, Part 5).
    const expectations = expectationsFor(school);
    const seat = window.XCD.data.seatStatus(coach.hotSeat || 0);
    const seatColor = seat.key === 'hot' ? 'var(--danger)' : seat.key === 'warm' ? 'var(--warning)' : 'var(--success)';
    const isAsst = game.isAssistant();

    container.innerHTML = `
      <div class="screen-header">
        <h1>${Utils.escapeHtml(school.name)} Cross Country</h1>
        <div class="actions">
          <span class="phase-pill" style="padding:5px 14px;">
            ${isAsst ? '📋 Asst.' : 'Coach'} ${Utils.escapeHtml(coach.fullName)} — Season ${game.career.seasons + 1}
          </span>
          ${isAsst
            ? `<span class="phase-pill" style="padding:5px 14px;" title="Build top recruiting classes to earn head-coach offers.">📈 Reputation ${Math.round(coach.reputation || 0)}</span>`
            : `<span class="phase-pill" style="padding:5px 14px; color:${seatColor};" title="${seat.desc}">${seat.icon} ${seat.label}</span>`}
        </div>
      </div>
      <div class="card" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <h3 style="margin:0 0 2px;">🎯 ${game.year} Program Expectations</h3>
          <div style="color:var(--text-dim); font-size:13px;">${expectations}</div>
        </div>
        <div style="text-align:right; font-size:12px; color:var(--text-faint);">
          ${isAsst
            ? 'As recruiting coordinator, your classes build your reputation toward a head-coaching job.'
            : `Job security: <span style="color:${seatColor}; font-weight:600;">${seat.label}</span> — sustained misses put you on the hot seat.`}
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
          <div class="label">Prestige · Morale</div>
          <div class="value">${school.prestige} · ${school.teamMorale ?? '—'}</div>
          <div class="sub">${window.XCD.data.divisionFor(school).label} · ${(window.XCD.engine.Morale.label(school.teamMorale ?? 65)).text}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Trophy Case</div>
          <div class="value">${game.career.nationalTitles}🏆 ${game.career.conferenceTitles}🏅</div>
          <div class="sub">${game.career.nationalsAppearances} nationals trips</div>
        </div>
      </div>

      ${game.jobOffers && game.jobOffers.offers.length ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent);">
          <h2>${game.jobOffers.promotion ? '🎉 Head-Coaching Offers — Your Promotion Awaits' : '📞 Job Offers — the Offseason Carousel'}</h2>
          <div style="color:var(--text-dim); font-size:13px; margin-bottom:10px;">
            ${game.jobOffers.promotion
              ? `Your recruiting has earned you head-coaching offers. Accept one to run your own program — you'll take full control of training, scheduling, and race strategy — stay an assistant, or wait (offers hold until Week ${game.jobOffers.expiresWeek}).`
              : `Multiple programs want you. Accept one, stay loyal, or wait and decide later (offers hold until Week ${game.jobOffers.expiresWeek}). Leaving resets your recruiting board and team culture; your career record travels with you.`}
          </div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>School</th><th>Div</th><th>Conf</th><th class="num">Prestige</th><th class="num">Budget</th><th class="num">Facilities</th><th class="num">Recent</th><th class="num">Titles</th><th>Fit</th><th></th></tr></thead>
            <tbody>
              ${game.jobOffers.offers.map((o) => `
                <tr>
                  <td>${o.kind === 'Dream job' ? '🌟 ' : ''}<strong>${Utils.escapeHtml(o.schoolName)}</strong>
                    <div><span class="rating ${o.kind === 'Dream job' || o.kind === 'Jump to DI' || o.kind === 'Elite assistant post' ? 'r-elite' : o.kind === 'Step up' ? 'r-great' : o.kind === 'Lateral move' ? 'r-avg' : 'r-poor'}" style="font-size:10px;">${o.kind}</span></div></td>
                  <td>${o.division}</td>
                  <td style="font-size:12px;">${Utils.escapeHtml(o.conference)}</td>
                  <td class="num">${o.prestige}</td>
                  <td class="num">$${o.budget ? (o.budget / 1000).toFixed(0) + 'k' : '—'}</td>
                  <td class="num">${o.facilities ?? '—'}</td>
                  <td class="num">${o.bestRank ? '#' + o.bestRank : '—'}</td>
                  <td class="num">${o.natTitles || 0}🏆</td>
                  <td>${UI.meter(o.repFit ?? 50, o.repFit >= 60 ? 'green' : o.repFit >= 40 ? 'yellow' : 'red')}</td>
                  <td><button class="btn small primary" data-accept="${o.schoolId}">Accept</button></td>
                </tr>`).join('')}
            </tbody>
          </table></div>
          <div style="margin-top:10px; display:flex; gap:8px;">
            <button class="btn small danger" id="btn-decline-offers">Stay Loyal (Decline All)</button>
            <button class="btn small" id="btn-wait-offers">Wait — Decide Later</button>
          </div>
        </div>` : ''}

      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <h2 style="margin:0;">📅 Season Overview — ${game.year}</h2>
          <button class="btn small" id="btn-to-schedule">Full Schedule →</button>
        </div>
        <div class="grid cols-4" style="margin-bottom:12px;">
          <div class="stat-tile"><div class="label">Record (W–L)</div><div class="value">${rec.w}–${rec.l}</div><div class="sub">${completed.length} meet${completed.length === 1 ? '' : 's'} raced</div></div>
          <div class="stat-tile"><div class="label">National Rank</div><div class="value">${rm.rank}<span style="font-size:13px; color:var(--text-faint);"> M</span> · ${rw.rank}<span style="font-size:13px; color:var(--text-faint);"> W</span></div><div class="sub">${window.XCD.data.divisionFor(school).label}</div></div>
          <div class="stat-tile"><div class="label">Conf. Standing</div><div class="value">${csM ? '#' + csM.pos : '—'}<span style="font-size:13px; color:var(--text-faint);"> M</span> · ${csW ? '#' + csW.pos : '—'}<span style="font-size:13px; color:var(--text-faint);"> W</span></div><div class="sub">${Utils.escapeHtml(school.conference)}</div></div>
          <div class="stat-tile"><div class="label">Next Opponent</div><div class="value" style="font-size:15px;">${nextOpponent ? (nextOpponent.rank < 999 ? '#' + nextOpponent.rank + ' ' : '') + Utils.escapeHtml(nextOpponent.school.name) : '—'}</div><div class="sub">${nextField ? 'Wk ' + nextField.week + ' field' : 'season complete'}</div></div>
        </div>
        <div class="grid cols-2">
          <div>
            <h3>Upcoming Meets</h3>
            ${upcoming.length ? upcoming.slice(0, 4).map((m) => `
              <div class="attr-row" style="cursor:pointer;" data-meet-nav="1">
                <span><strong>Wk ${m.week}</strong> ${Utils.escapeHtml(m.name)}${m.week === game.week ? ' <span style="color:var(--warning); font-size:11px;">THIS WEEK</span>' : ''}</span>
                <span style="color:var(--text-faint); font-size:12px;">${m.conditions.tempF}°F${m.conditions.rain ? ' · rain' : ''} · hills ${m.conditions.hilliness}</span>
              </div>`).join('') : '<div style="color:var(--text-dim); font-size:13px;">No meets remaining — the regular season is done.</div>'}
          </div>
          <div>
            <h3>Recent Results</h3>
            ${recent.length ? recent.map((m) => {
              const p = playerPlace(game, m);
              const color = p === 1 ? 'var(--gold)' : p <= 3 ? 'var(--success)' : 'var(--text-dim)';
              return `<div class="attr-row" data-meet="${m.id}" style="cursor:pointer;">
                <span><strong>Wk ${m.week}</strong> ${Utils.escapeHtml(m.name)}</span>
                <span style="color:${color}; font-weight:600;">${p === 1 ? '🥇 1st' : p ? p + (p === 2 ? 'nd' : p === 3 ? 'rd' : 'th') : '—'}</span>
              </div>`;
            }).join('') : '<div style="color:var(--text-dim); font-size:13px;">No results yet this season.</div>'}
          </div>
        </div>
      </div>

      ${nextMeet ? `
        <div class="card" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h2 style="margin-bottom:4px;">🏁 Next: ${Utils.escapeHtml(nextMeet.name)} — Week ${nextMeet.week}${nextMeet.week === game.week ? ' (THIS WEEK)' : ''}</h2>
            <span style="color:var(--text-dim); font-size:13px;">
              ${nextMeet.conditions.tempF}°F${nextMeet.conditions.rain ? ' · rain' : ''} · hills ${nextMeet.conditions.hilliness}/100 · ${nextMeet.conditions.altitude} altitude
            </span>
          </div>
          <button class="btn" id="btn-to-schedule-2">View Schedule →</button>
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
    container.querySelectorAll('#btn-to-schedule, #btn-to-schedule-2, [data-meet], [data-meet-nav]').forEach((el) => {
      el.addEventListener('click', () => UI.navigate('schedule'));
    });

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
    const waitBtn = container.querySelector('#btn-wait-offers');
    if (waitBtn) waitBtn.addEventListener('click', () => {
      UI.toast(`Offers stay open until Week ${game.jobOffers.expiresWeek}. Take your time.`, 'info');
    });
  }

  UI.screens.dashboard = { render };
})();
