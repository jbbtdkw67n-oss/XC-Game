/*
 * Schedule screen: the season at a glance — every meet the player's program
 * runs, results so far, upcoming fields, and full meet result pop-ups.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const Races = () => window.XCD.engine.Races;

  // "In the Field" browser state (Meet preview overhaul): the division/gender
  // filter the user picks. `ifDiv === null` means "default to my division".
  let ifDiv = null;   // null | 'all' | 'DI' | 'DII' | 'DIII'
  let ifGender = 'M'; // 'M' | 'W'

  // Division badge markup (D1/D2/D3), consistent across every meet card.
  function divBadge(div) {
    const short = (window.XCD.data.DIVISION_SHORT || {})[div] || 'D1';
    const bg = div === 'DI' ? 'var(--accent-soft)' : div === 'DII' ? 'rgba(180,140,60,0.18)' : 'rgba(80,150,110,0.18)';
    return `<span style="background:${bg}; border-radius:4px; padding:1px 6px; font-size:10.5px; font-weight:700; letter-spacing:.3px;">${short}</span>`;
  }

  /*
   * The "In the Field" panel: upcoming meets across ALL divisions, clearly
   * labeled D1/D2/D3 and Men/Women, filterable, each with an informed
   * projection (projected team finish + individual leader). The projection is
   * NOT the result — the race is simulated independently, so upsets happen.
   */
  function inTheFieldHtml(game) {
    const S = window.XCD.engine.Scheduling;
    const D = window.XCD.data;
    if (!S || !S.upcomingMeets) return '';
    const school = game.getPlayerSchool();
    const myDiv = (school && school.division) || 'DI';
    const div = ifDiv === null ? myDiv : ifDiv;
    const gender = ifGender;

    let meets = S.upcomingMeets(game, { maxWeeks: 3 });
    if (div !== 'all') meets = meets.filter((m) => S.meetDivision(game, m) === div);
    meets = meets.filter((m) => S.meetHasGender(m, gender));

    // Rank what to show: the player's own meets first, then elite/championship
    // fields, then the rest — capped so predictions stay cheap and the list
    // stays scannable.
    const notability = (m) => {
      let n = 0;
      if ((m.schoolIds || []).includes(game.playerSchoolId)) n += 100;
      if (m.type === 'national') n += 40; else if (m.type === 'regional') n += 22;
      else if (m.type === 'conference') n += 18; else if (m.elite) n += 10 + m.elite * 4;
      return n - m.week * 0.1;
    };
    meets = meets.sort((a, b) => notability(b) - notability(a)).slice(0, 10);

    const divBtn = (key, label) => `<button class="btn small ${((ifDiv === null ? myDiv : ifDiv) === key) ? 'primary' : ''}" data-if-div="${key}">${label}</button>`;
    const genBtn = (key, label) => `<button class="btn small ${ifGender === key ? 'primary' : ''}" data-if-gender="${key}">${label}</button>`;

    const cards = meets.map((m) => {
      const mdiv = S.meetDivision(game, m);
      const proj = S.projectMeet(game, m, gender);
      const ci = S.courseInfo(game, m);
      const dist = Races().distKey(m.distances[gender]);
      const isMine = (m.schoolIds || []).includes(game.playerSchoolId);
      const top = proj.teams.slice(0, 4).map((t, i) =>
        `<div class="attr-row clickable" data-school="${t.schoolId}" style="padding:2px 0; cursor:pointer;">
           <span>${i + 1}. ${Utils.escapeHtml(t.name)}${t.schoolId === game.playerSchoolId ? ' <span style="color:var(--accent);">(You)</span>' : ''}${t.complete ? '' : ' <span style="color:var(--text-faint); font-size:10px;">(short squad)</span>'}</span>
         </div>`).join('');
      const leader = proj.individuals[0];
      return `
        <div class="card" style="margin:0 0 10px; ${isMine ? 'border-left:3px solid var(--accent);' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
            <h3 style="margin:0;">${divBadge(mdiv)} ${Utils.escapeHtml(m.name)} <span style="color:var(--text-faint); font-weight:400; font-size:12px;">Wk ${m.week} · ${gender === 'M' ? "Men's" : "Women's"} ${dist}</span></h3>
            <span style="color:var(--text-faint); font-size:11.5px;">${Utils.escapeHtml(ci.location || '')} · ${ci.hillinessLabel} · ${window.XCD.data.altitudeClass(ci)} alt</span>
          </div>
          <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:6px;">
            <div style="flex:1; min-width:180px;">
              <div style="font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:.4px; margin-bottom:2px;">Projected Team Finish</div>
              ${top || '<div style="color:var(--text-faint); font-size:12px;">Field forming…</div>'}
            </div>
            <div style="min-width:150px;">
              <div style="font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:.4px; margin-bottom:2px;">Projected Leader</div>
              ${leader ? `<div class="clickable" data-ath="${leader.athleteId}" style="cursor:pointer;">${Utils.escapeHtml(leader.name)}<div style="color:var(--text-dim); font-size:11.5px;">${Utils.escapeHtml(leader.school)}</div></div>` : '<div style="color:var(--text-faint); font-size:12px;">—</div>'}
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="card" style="margin-top:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <h2 style="margin:0;">🔭 In the Field — Upcoming Meets</h2>
        </div>
        <div style="color:var(--text-faint); font-size:11.5px; margin:2px 0 8px;">
          Projections are informed forecasts from current form — not results. The races are simulated independently, so favorites can lose and underdogs can break through.
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
          <span style="font-size:11px; color:var(--text-faint);">Division</span>
          ${divBtn('all', 'All')}${divBtn('DI', 'D1')}${divBtn('DII', 'D2')}${divBtn('DIII', 'D3')}
          <span style="font-size:11px; color:var(--text-faint); margin-left:8px;">Gender</span>
          ${genBtn('M', 'Men')}${genBtn('W', 'Women')}
        </div>
        ${cards || '<div style="color:var(--text-dim); font-size:13px;">No upcoming meets match this filter.</div>'}
      </div>`;
  }

  // Meet results with Men/Women tabs (Update 13, Phase 9): both squads' full
  // results are viewable from the Schedule screen, not just the men's.
  function meetResultModal(game, meet, gender) {
    const ft = Races().formatTime;
    // Default to the requested gender, but fall back to whichever raced.
    let active = gender && meet.results[gender] ? gender
      : meet.results.M ? 'M' : meet.results.W ? 'W' : null;
    if (!active) { UI.toast('No results for that race yet.'); return; }

    // The full results body for one gender — rebuilt when a tab is clicked.
    function bodyFor(g) {
      const res = meet.results[g];
      if (!res) return '<div class="card" style="padding:16px; color:var(--text-dim);">No results recorded for this race.</div>';

      const teamRows = res.teamScores.map((t) => {
        const school = game.getSchool(t.schoolId);
        const mine = t.schoolId === game.playerSchoolId;
        return `<tr class="clickable" data-school="${t.schoolId}" ${mine ? 'style="background:var(--accent-soft);"' : ''}>
          <td>${t.place}</td>
          <td><strong>${Utils.escapeHtml(school ? school.name : '?')}</strong></td>
          <td class="num">${t.points}</td>
          <td style="color:var(--text-dim); font-size:12px;">${t.scorers.join(' + ')}</td>
        </tr>`;
      }).join('');

      // Full individual results (Update 12): every stored finisher is
      // published; championship honor earners are marked with the honor
      // emoji (Update 13: no gold highlighting — the symbol is the award).
      const honor = UI.meetHonorInfo(meet);
      const indivRows = res.finishers.map((f) => {
        const school = game.getSchool(f.schoolId);
        const mine = f.schoolId === game.playerSchoolId;
        const honored = honor && f.place <= honor.count;
        return `<tr class="clickable" data-ath="${f.athleteId}" ${mine ? 'style="background:var(--accent-soft);"' : ''}>
          <td>${f.place}</td>
          <td>${UI.avatar(game.getAthlete(f.athleteId) || { name: f.name, gender: g }, { size: 20 })} ${Utils.escapeHtml(f.name)}${honored ? ` <span title="${honor.label}">${honor.icon}</span>` : ''} <span style="color:var(--text-faint); font-size:11px;">${f.classYear || ''}</span></td>
          <td>${Utils.escapeHtml(school ? school.name : '?')}</td>
          <td class="num">${ft(f.time)}</td>
        </tr>`;
      }).join('') +
      // DNF runners (Update 18): listed at the bottom, no place, no time.
      (res.dnfs || []).map((d) => {
        const school = game.getSchool(d.schoolId);
        const mine = d.schoolId === game.playerSchoolId;
        return `<tr class="clickable" data-ath="${d.athleteId}" ${mine ? 'style="background:var(--accent-soft);"' : ''} style="color:var(--text-faint);">
          <td title="Did Not Finish">DNF</td>
          <td>${UI.avatar(game.getAthlete(d.athleteId) || { name: d.name, gender: g }, { size: 20 })} ${Utils.escapeHtml(d.name)} <span style="color:var(--text-faint); font-size:11px;">${d.classYear || ''}</span></td>
          <td>${Utils.escapeHtml(school ? school.name : '?')}</td>
          <td class="num" title="${d.reason === 'bonk' ? 'Ran out of energy' : 'Injury or mishap'}">DNF</td>
        </tr>`;
      }).join('');

      return `
        <h3 style="margin:0 0 10px;">${g === 'M' ? "Men's" : "Women's"} ${Races().distKey(res.distanceM)}</h3>
        ${honor ? `<div style="margin:0 0 10px; padding:7px 12px; border:1px solid var(--border); border-radius:8px; color:var(--text-dim); font-size:12.5px;">
          ${honor.icon} Championship race — the top ${honor.count} finishers earn <strong>${honor.label}</strong> honors, marked ${honor.icon}.
        </div>` : ''}
        <div class="grid cols-2">
          <div class="card" style="padding:12px;">
            <h3>Team Scores</h3>
            <div class="table-wrap" style="max-height:340px; overflow-y:auto;">
              <table class="data"><thead><tr><th>Pl</th><th>Team</th><th class="num">Pts</th><th>Scorers</th></tr></thead>
              <tbody>${teamRows}</tbody></table>
            </div>
          </div>
          <div class="card" style="padding:12px;">
            <h3>Individuals — ${res.finishers.length}${res.finisherCount > res.finishers.length ? ` of ${res.finisherCount} recorded` : ' finishers'}${res.dnfs && res.dnfs.length ? ` • ${res.dnfs.length} DNF` : ''}</h3>
            <div class="table-wrap" style="max-height:340px; overflow-y:auto;">
              <table class="data"><thead><tr><th>Pl</th><th>Runner</th><th>School</th><th class="num">Time</th></tr></thead>
              <tbody>${indivRows}</tbody></table>
            </div>
          </div>
        </div>`;
    }

    const tabBtn = (g, label) => `<button class="btn small ${g === active ? 'primary' : ''}" data-meet-gender="${g}"
      ${meet.results[g] ? '' : 'disabled title="Did not race"'}>${label}</button>`;

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <h2 style="margin:0 0 4px;">${Utils.escapeHtml(meet.name)}</h2>
      ${(() => {
        const hostHtml = window.XCD.engine.Scheduling.meetHostHtml
          ? window.XCD.engine.Scheduling.meetHostHtml(game, meet) : '';
        const altClass = window.XCD.data.altitudeClass(meet.courseMeta || meet.conditions);
        return hostHtml ? `<div style="color:var(--text-dim); font-size:12.5px; line-height:1.5;">${hostHtml}<div>⛰ ${altClass} altitude</div></div>` : '';
      })()}
      <div style="color:var(--text-dim); font-size:13px; margin-bottom:12px;">
        Week ${meet.week} • ${meet.conditions.tempF}°F${meet.conditions.rain ? ' • Rain' : ''} •
        Hills ${meet.conditions.hilliness}/100 (${window.XCD.data.hillinessLabel ? window.XCD.data.hillinessLabel(meet.conditions.hilliness) : ''}) • ${meet.conditions.altitude} altitude
      </div>
      <div class="pill-tabs" style="display:flex; gap:6px; margin-bottom:14px;">
        ${tabBtn('M', 'Men')}
        ${tabBtn('W', 'Women')}
      </div>
      <div id="meet-result-body">${bodyFor(active)}</div>`, (modal) => {
      // Universal profile navigation from meet results (Update 4, Part 4;
      // Update 12: graduated legends resolve too). Rewired on each tab switch.
      const wireRows = () => {
        modal.querySelectorAll('[data-ath]').forEach((tr) => {
          tr.addEventListener('click', () => UI.openAthlete(game, tr.dataset.ath));
        });
        modal.querySelectorAll('[data-school]').forEach((tr) => {
          tr.addEventListener('click', () => {
            const s = game.getSchool(tr.dataset.school);
            if (s && UI.showSchoolCard) UI.showSchoolCard(s, game);
          });
        });
      };
      wireRows();
      modal.querySelectorAll('[data-meet-gender]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          active = btn.dataset.meetGender;
          modal.querySelector('#meet-result-body').innerHTML = bodyFor(active);
          modal.querySelectorAll('[data-meet-gender]').forEach((b) =>
            b.classList.toggle('primary', b.dataset.meetGender === active));
          wireRows();
        });
      });
    });
  }

  UI.showMeetResults = meetResultModal;

  // One-line course summary for tooltips (Meet Database Expansion).
  function courseTip(ci) {
    if (!ci) return '';
    return [
      ci.location, ci.course,
      ci.hillinessLabel ? `${ci.hillinessLabel} (${ci.hilliness}/100)` : '',
      `${window.XCD.data.altitudeClass(ci)} altitude`,
      ci.prestige ? `Prestige: ${ci.prestige}` : ''
    ].filter(Boolean).join(' · ');
  }

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

    // One entry per season week — rendered as a table on desktop and as
    // meet cards on phones (Update 14), from the same data.
    const entries = weeks.map(({ week, label }) => {
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
      // Where the meet is held (Realism Update): host + real city (or, for the
      // national championship, the authentic venue).
      let where = '';
      if (meet) {
        const ci = window.XCD.engine.Scheduling.courseInfo(game, meet);
        where = meet.type === 'national'
          ? `📍 ${[ci.venue || ci.course, ci.location].filter(Boolean).join(' · ')}`
          : `📍 ${[ci.hostName, ci.location].filter(Boolean).join(' · ')}`;
      }
      return { week, label, meet, done, note, status, field, conditions, where };
    });

    const rows = entries.map((e) => `
      <tr class="${e.meet && e.done ? 'clickable' : ''}" ${e.meet && e.done ? `data-meet="${e.meet.id}"` : ''}>
        <td>Wk ${e.week}</td>
        <td><strong>${e.meet ? Utils.escapeHtml(e.meet.name) : (e.note || 'No meet')}</strong>
          <span style="color:var(--text-faint); font-size:11px;"> ${e.label}</span>
          ${e.where ? `<div style="color:var(--text-faint); font-size:11px;">${Utils.escapeHtml(e.where)}</div>` : ''}</td>
        <td>${e.field}</td>
        <td style="font-size:12.5px; color:var(--text-dim);">${e.conditions}</td>
        <td>${e.status}</td>
      </tr>`).join('');

    // Meet cards (phone): date, name, importance, conditions, and — after
    // the race — the result, with a big touch-friendly results button.
    const meetCards = entries.map((e) => {
      const importance = e.label === 'Nationals' ? '🏆 Nationals'
        : e.label === 'Regional' ? '🌍 Regional'
        : e.label === 'Conference' ? '🏅 Conference'
        : e.label;
      const thisWeek = e.week === game.week;
      return `
      <div class="m-card ${e.meet && e.done ? 'clickable' : ''}" ${e.meet && e.done ? `data-meet="${e.meet.id}"` : ''}
        ${thisWeek ? 'style="border-color:var(--warning);"' : ''}>
        <div class="m-head">
          <div class="m-title">${e.meet ? Utils.escapeHtml(e.meet.name) : (e.note || 'No meet')}
            <div class="m-sub">Week ${e.week} • ${importance}${e.field ? ' • ' + e.field : ''}</div>
            ${e.where ? `<div class="m-sub">${Utils.escapeHtml(e.where)}</div>` : ''}
            ${e.conditions ? `<div class="m-sub">${e.conditions}</div>` : ''}
          </div>
          <div class="m-badge" style="font-size:12.5px;">${e.status}</div>
        </div>
        ${e.meet && e.done ? '<div class="m-actions"><button class="btn small" style="pointer-events:none;">📊 View Full Results</button></div>' : ''}
      </div>`;
    }).join('');

    const rankM = Rk.teamRank(game, school.id, 'M');
    const rankW = Rk.teamRank(game, school.id, 'W');

    // Upcoming meet field preview → the filterable "In the Field" browser with
    // division/gender labels and pre-meet projections (Meet preview overhaul).
    const previewHtml = inTheFieldHtml(game);

    // Week 1 Administrative Phase (spec Part 2, Section 15): the schedule —
    // including the Pre-Nationals answer — is set during Week 1 and then
    // finalized for the season. After that, only the finalized table shows.
    const locked = game.scheduleLocked ? game.scheduleLocked() : game.week > 1;

    // Pre-Nationals invitation (Update 3): accept for the course preview and
    // ranking boost, or decline to rest / stay in a training block.
    let preNatsHtml = '';
    const pn = season.preNationals;
    if (pn && pn.playerInvited && game.week < pn.week) {
      const status = pn.playerAccepted
        ? `<span style="color:var(--success); font-weight:700;">✓ Accepted — racing Week ${pn.week} on the Championship course</span>`
        : `<span style="color:var(--warning); font-weight:700;">Declined — resting that week</span>`;
      preNatsHtml = `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent);">
          <h2>✉️ Pre-Nationals Invitation — Week ${pn.week}</h2>
          <div style="color:var(--text-dim); font-size:13px; margin-bottom:10px;">
            A Division I-only elite invitational on the NCAA Championship course. Accepting previews the terrain
            (a small familiarity edge at Nationals) and — with a strong run — boosts your national ranking, prestige,
            and recruiting visibility. Declining rests your athletes and protects a high-mileage block.
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span>${status}</span>
            ${locked
              ? '<span style="color:var(--text-faint); font-size:12px;">🔒 Locked with the finalized schedule</span>'
              : pn.playerAccepted
                ? '<button class="btn small" id="btn-pn-decline">Switch to Decline & Rest</button>'
                : '<button class="btn small primary" id="btn-pn-accept">Accept Invitation</button>'}
          </div>
        </div>`;
    }

    // Custom race scheduling (Update 4, Part 7 + Section 15): pick which
    // meets to attend during Week 1, gated by prestige — then finalize.
    let scheduleHtml = '';
    const Scheduling = window.XCD.engine.Scheduling;
    if (Scheduling && !locked) {
      Scheduling.buildOptions(game);
      const sched = season.playerSchedule;
      const editable = (sched.weeks || []).filter((w) => !w.locked);
      if (editable.length) {
        scheduleHtml = `
          <div class="card" style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
              <h2 style="margin:0;">🗓 Race Schedule Selection</h2>
              <span style="color:var(--text-dim); font-size:12.5px;">Prestige ${school.prestige} · ${window.XCD.data.divisionFor(school).label} — elite invitationals require a strong program.</span>
            </div>
            <div style="color:var(--text-faint); font-size:12px; margin:4px 0 12px;">
              Choose where your team races each regular-season week — then <strong>finalize</strong>.
              The schedule locks permanently once finalized (or when Week 1 ends). Elite fields only
              invite high-prestige programs; rest a week to bank a training block.
            </div>
            ${editable.map((w) => `
              <div style="margin-bottom:12px;">
                <div style="font-size:12.5px; color:var(--text-dim); margin-bottom:5px;">Week ${w.week}${w.week === game.week ? ' <span style="color:var(--warning);">(this week)</span>' : ''}</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  ${w.options.map((o, i) => `
                    <button class="btn small ${o.selected ? 'primary' : ''}" data-sched-week="${w.week}" data-sched-meet="${o.meetId || ''}"
                      ${o.eligible ? '' : 'disabled'}
                      title="${o.eligible ? Utils.escapeHtml([o.host ? 'Host: ' + o.host + ' · ' + o.field + ' teams' : '', courseTip(o.course)].filter(Boolean).join(' · ')) : 'Requires prestige ' + o.prestigeReq + '+ (or a top-25 ranking)'}"
                      style="${o.selected ? '' : o.eligible ? '' : 'opacity:0.55;'}">
                      ${o.tier === 'Elite' ? '⭐ ' : o.tier === 'Premier' ? '◆ ' : o.tier === 'Rest' ? '😴 ' : ''}${Utils.escapeHtml(o.label)}${!o.eligible ? ` 🔒${o.prestigeReq}` : ''}
                    </button>`).join('')}
                </div>
                ${(() => {
                  // Course information for the selected meet (Meet Database
                  // Expansion): location · course · hilliness · altitude · prestige.
                  const sel = w.options.find((o) => o.selected);
                  const ci = sel && sel.course;
                  if (!ci || !sel.meetId) return '';
                  return `<div style="font-size:11.5px; color:var(--text-faint); margin-top:4px;">
                    📍 ${Utils.escapeHtml(ci.location || '')}${ci.course ? ` · ${Utils.escapeHtml(ci.course)}` : ''}
                    · Hilliness: <strong>${ci.hillinessLabel}</strong> (${ci.hilliness}/100)
                    · Altitude: <strong>${window.XCD.data.altitudeClass(ci)}</strong>
                    · Prestige: <strong>${Utils.escapeHtml(ci.prestige)}</strong>
                  </div>`;
                })()}
              </div>`).join('')}
            <div style="border-top:1px solid var(--border); padding-top:10px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="color:var(--text-dim); font-size:12.5px;">Happy with the slate${pn && pn.playerInvited ? ' (and your Pre-Nationals answer)' : ''}? Finalizing locks it for the whole season.</span>
              <button class="btn primary" id="btn-finalize-schedule">🔒 Finalize Schedule</button>
            </div>
          </div>`;
      }
    } else if (locked) {
      scheduleHtml = `
        <div class="card" style="margin-bottom:16px;">
          <h2 style="margin:0 0 4px;">🔒 Schedule Finalized — ${season.year}</h2>
          <div style="color:var(--text-dim); font-size:12.5px;">The slate below is locked for the season. Meet selection reopens in Week 1 of next year.</div>
        </div>`;
    }

    // Assistant coaches don't set the schedule or answer invitations — those
    // are head-coach calls. Replace the editors with a read-only note.
    if (game.isAssistant && game.isAssistant()) {
      const head = game.getCoach(school.coachId);
      scheduleHtml = `<div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent);">
        <h2>🗓 Race Scheduling</h2>
        <div style="color:var(--text-dim); font-size:13px;">Head coach <strong>${head ? Utils.escapeHtml(head.fullName) : 'the staff'}</strong> sets the race schedule and answers invitations. As recruiting coordinator you'll see the season below, but scheduling isn't your call.</div>
      </div>`;
      preNatsHtml = '';
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
      ${preNatsHtml}
      ${scheduleHtml}
      <div class="card">
        <div class="table-wrap desktop-only"><table class="data">
          <thead><tr><th>Week</th><th>Meet</th><th>Field</th><th>Conditions</th><th>Result</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="card-list mobile-only">${meetCards}</div>
        <div style="color:var(--text-faint); font-size:12px; margin-top:8px;">Tap a completed meet for full results.</div>
      </div>
      ${previewHtml}`;

    container.querySelectorAll('[data-meet]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const meet = season.meets[tr.dataset.meet];
        meetResultModal(game, meet, 'M');
      });
    });
    container.querySelectorAll('[data-school]').forEach((el) => {
      el.addEventListener('click', () => {
        const s = game.getSchool(el.dataset.school);
        if (s && UI.showSchoolCard) UI.showSchoolCard(s, game);
      });
    });
    // "In the Field" projected-leader clicks + division/gender filter buttons.
    container.querySelectorAll('[data-ath]').forEach((el) => {
      el.addEventListener('click', () => { if (UI.openAthlete) UI.openAthlete(game, el.dataset.ath); });
    });
    container.querySelectorAll('[data-if-div]').forEach((btn) => {
      btn.addEventListener('click', () => { ifDiv = btn.dataset.ifDiv; render(container); });
    });
    container.querySelectorAll('[data-if-gender]').forEach((btn) => {
      btn.addEventListener('click', () => { ifGender = btn.dataset.ifGender; render(container); });
    });

    const rcBtn = container.querySelector('#btn-race-center');
    if (rcBtn) rcBtn.addEventListener('click', () => UI.navigate('racecenter'));

    container.querySelectorAll('[data-sched-week]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const wk = Number(btn.dataset.schedWeek);
        const meetId = btn.dataset.schedMeet || null;
        const r = window.XCD.engine.Scheduling.select(game, wk, meetId);
        UI.toast(r.message, r.ok ? 'success' : 'error');
        if (r.ok) render(container);
      });
    });

    const pnAccept = container.querySelector('#btn-pn-accept');
    const pnDecline = container.querySelector('#btn-pn-decline');
    const pnDecide = (accept) => {
      const r = Races().setPreNationalsDecision(game, accept);
      UI.toast(r.message, r.ok ? 'success' : 'error');
      if (r.ok) render(container);
    };
    if (pnAccept) pnAccept.addEventListener('click', () => pnDecide(true));
    if (pnDecline) pnDecline.addEventListener('click', () => pnDecide(false));

    // Finalize (Section 15): permanently lock the season's slate.
    const finalizeBtn = container.querySelector('#btn-finalize-schedule');
    if (finalizeBtn) finalizeBtn.addEventListener('click', () => {
      if (!game.controlsScheduling()) { UI.toast('Only the head coach finalizes the schedule.', 'error'); return; }
      game.week1 = game.week1 || window.XCD.engine.GameState.freshWeek1();
      game.week1.scheduleFinalized = true;
      UI.toast('Schedule finalized — the slate is locked for the season.', 'success');
      render(container);
    });
  }

  UI.screens.schedule = { render };
})();
