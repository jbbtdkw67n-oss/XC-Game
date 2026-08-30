/*
 * Shared Program profile modal (Update 4, Part 4): a rich, universally
 * accessible program page. Opens from anywhere a program is shown — rankings,
 * standings, champions, awards, meet results, the world table, schedules.
 *
 * Shows prestige, coach, conference, division, current roster, team ratings,
 * season schedule, current-season results, and historical achievements.
 * Fails gracefully when data is missing rather than crashing.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const D = window.XCD.data;

  function teamStrength(game, school, gender) {
    const roster = game.getRoster(school.id, gender)
      .sort((a, b) => b.currentOverall - a.currentOverall).slice(0, 7);
    return roster.length ? Math.round(Utils.average(roster.map((a) => a.currentOverall))) : 0;
  }

  UI.showSchoolCard = function (school, game) {
    if (!school) { UI.toast('Program data unavailable.', 'error'); return; }
    try {
      renderCard(school, game);
    } catch (err) {
      UI.toast('Could not open that program profile.', 'error');
    }
  };

  function renderCard(school, game) {
    const coach = game.getCoach(school.coachId);
    const assistant = school.assistantId ? game.getCoach(school.assistantId) : null;
    const Legacy = window.XCD.engine.Legacy;
    const Rk = window.XCD.engine.Rankings;
    const prog = Legacy ? Legacy.program(game, school.id) : {};
    const divLabel = D.divisionFor(school).label;
    const rankM = Rk ? Rk.teamRank(game, school.id, 'M') : null;
    const rankW = Rk ? Rk.teamRank(game, school.id, 'W') : null;

    const rosterM = game.getRoster(school.id, 'M').sort((a, b) => b.currentOverall - a.currentOverall);
    const rosterW = game.getRoster(school.id, 'W').sort((a, b) => b.currentOverall - a.currentOverall);

    const rosterRows = (roster) => roster.slice(0, 10).map((a) => `
      <tr class="clickable" data-ath="${a.id}">
        <td>${UI.avatar(a, { size: 22 })} ${a.generational ? '⭐ ' : ''}${Utils.escapeHtml(a.fullName)}</td>
        <td>${a.classYear}</td>
        <td class="num">${UI.ratingBadge(a.currentOverall)}</td>
      </tr>`).join('') || '<tr><td colspan="3" style="color:var(--text-dim);">No roster.</td></tr>';

    // Current-season schedule + results for this program.
    const season = game.season;
    let scheduleRows = '';
    if (season) {
      const weeks = [...(season.raceWeeks || []), season.conferenceWeek, season.regionalWeek, season.nationalWeek];
      const seen = new Set();
      weeks.forEach((wk) => {
        (season.byWeek[wk] || []).forEach((mid) => {
          const m = season.meets[mid];
          if (!m || seen.has(mid)) return;
          const inField = (m.schoolIds || []).includes(school.id) ||
            (m.type === 'national' && ['M', 'W'].some((g) => (m.fieldByGender?.[g] || []).includes(school.id)));
          if (!inField) return;
          seen.add(mid);
          const done = m.results && m.results.M;
          const place = (g) => {
            const res = m.results[g];
            if (!res) return '';
            const t = res.teamScores.find((x) => x.schoolId === school.id);
            return t ? `${g}:${Utils.ordinal(t.place)}` : '';
          };
          scheduleRows += `<tr class="${done ? 'clickable' : ''}" ${done ? `data-meet="${m.id}"` : ''}>
            <td>Wk ${m.week}</td>
            <td>${Utils.escapeHtml(m.name)}</td>
            <td style="color:var(--text-dim); font-size:12px;">${done ? [place('M'), place('W')].filter(Boolean).join(' · ') : (m.week >= game.week ? 'Upcoming' : '—')}</td>
          </tr>`;
        });
      });
    }

    const hs = school.historicalSuccess || {};
    const row = (label, value) => `<div class="attr-row"><span class="attr-name">${label}</span><span><strong>${value}</strong></span></div>`;

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <div class="player-card-header">
        <div class="who">
          <h2>${Utils.escapeHtml(school.name)}${school.id === game.playerSchoolId ? ' <span style="color:var(--accent);">★ (You)</span>' : ''}</h2>
          <div class="sub" style="display:flex; align-items:center; gap:7px;">${UI.kitSwatch(school, 15)}<span style="font-weight:600; color:var(--text);">${Utils.escapeHtml(school.mascot || '')}</span></div>
          <div class="sub">${divLabel} • ${Utils.escapeHtml(school.conference)} • ${school.region} • ${Utils.escapeHtml(D.cityForSchool(school))}, ${(D.STATE_NAMES || {})[school.state] || school.state}</div>
          <div class="sub">
            Head Coach:
            ${coach ? `<span class="clickable" id="sc-coach" style="cursor:pointer; color:var(--accent-hover);">${UI.avatar(coach, { size: 20, outfit: 'suit' })} ${Utils.escapeHtml(coach.fullName)}</span> — ${Utils.escapeHtml(coach.archetype || '')}` : 'Vacant'}
            ${coach ? (() => {
              const st = D.seatStatus(coach.hotSeat || 0);
              const color = st.key === 'hot' ? 'var(--danger)' : st.key === 'warm' ? 'var(--warning)' : 'var(--success)';
              return ` <span title="${st.desc}" style="color:${color}; font-size:12px;">${st.icon} ${st.label}</span>`;
            })() : ''}
          </div>
          <div class="sub">
            Assistant:
            ${assistant ? `<span class="clickable" id="sc-assistant" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(assistant.fullName)}</span> — ${Utils.escapeHtml(assistant.archetype || '')}` : '—'}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:30px; font-weight:800;">${school.prestige}</div>
          <div style="font-size:12px; color:var(--text-dim);">PRESTIGE${school.heritage >= 55 ? ' 🏛' : ''}</div>
          <div style="font-size:12px; color:var(--text-faint); margin-top:2px;">M ${rankM ? '#' + rankM : '—'} · W ${rankW ? '#' + rankW : '—'}</div>
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:14px;">
        <div class="stat-tile"><div class="label">Team Rating M/W</div><div class="value">${teamStrength(game, school, 'M')}/${teamStrength(game, school, 'W')}</div></div>
        <div class="stat-tile"><div class="label">Facilities</div><div class="value">${school.facilitiesOverall}</div></div>
        <div class="stat-tile"><div class="label">Academics</div><div class="value">${school.academics}</div></div>
        <div class="stat-tile"><div class="label">Team Morale</div><div class="value">${school.teamMorale ?? '—'}</div></div>
      </div>

      <div class="grid cols-2" style="margin-bottom:14px;">
        <div class="card" style="padding:12px;">
          <h3>Men's Roster</h3>
          <div class="table-wrap" style="max-height:230px; overflow-y:auto;"><table class="data"><tbody>${rosterRows(rosterM)}</tbody></table></div>
        </div>
        <div class="card" style="padding:12px;">
          <h3>Women's Roster</h3>
          <div class="table-wrap" style="max-height:230px; overflow-y:auto;"><table class="data"><tbody>${rosterRows(rosterW)}</tbody></table></div>
        </div>
      </div>

      <div class="grid cols-2">
        <div class="card" style="padding:12px;">
          <h3>${season ? season.year : ''} Season</h3>
          <div class="table-wrap" style="max-height:230px; overflow-y:auto;"><table class="data"><tbody>${scheduleRows || '<tr><td style="color:var(--text-dim);">No meets scheduled.</td></tr>'}</tbody></table></div>
        </div>
        <div class="card" style="padding:12px;">
          <h3>Historical Achievements</h3>
          ${row('National Championships', prog.natTitles || 0)}
          ${row('Conference Championships', prog.confTitles || 0)}
          ${row('NCAA Appearances', prog.ncaaAppearances || 0)}
          ${row('Best NCAA Finish', prog.bestFinish ? Utils.ordinal(prog.bestFinish) : '—')}
          ${row('All-Americans', prog.allAmericans || 0)}
          ${row('All-Time Record', `${prog.wins || 0}-${prog.losses || 0}`)}
          ${row('Program Titles (M/W)', `${(hs.nationalTitlesM || 0) + (hs.conferenceTitlesM || 0)} / ${(hs.nationalTitlesW || 0) + (hs.conferenceTitlesW || 0)}`)}
          ${(() => {
            // Course Records (Program History): total set, currently held, and
            // the most held at any one time — another achievement to build.
            const CR = window.XCD.engine.Courses;
            if (!CR) return '';
            const cs = CR.programStats(game, school.id);
            if (!cs.everSet && !cs.current) return '';
            return row('Course Records Held', cs.everSet) +
              row('Current Course Records', cs.current) +
              row('Most Held at One Time', cs.peak);
          })()}
        </div>
      </div>
    `, (modal) => {
      modal.querySelectorAll('[data-ath]').forEach((tr) => {
        tr.addEventListener('click', () => {
          const a = game.getAthlete(tr.dataset.ath);
          if (a) UI.showPlayerCard(a, game);
        });
      });
      modal.querySelectorAll('[data-meet]').forEach((tr) => {
        tr.addEventListener('click', () => {
          const m = season.meets[tr.dataset.meet];
          if (m && UI.showMeetResults) UI.showMeetResults(game, m, 'M');
        });
      });
      const coachEl = modal.querySelector('#sc-coach');
      if (coachEl && coach) coachEl.addEventListener('click', () => UI.showCoachCard(coach, game));
      const asstEl = modal.querySelector('#sc-assistant');
      if (asstEl && assistant) asstEl.addEventListener('click', () => UI.showCoachCard(assistant, game));
    });
  }
})();
