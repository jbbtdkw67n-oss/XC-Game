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
            <span style="color:var(--text-faint); font-size:11.5px;">${Utils.escapeHtml(ci.location || '')} · ${ci.hillinessLabel} · ${window.XCD.data.altitudeClass(ci)} alt · ${UI.meetSpeedTag(m)}</span>
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

    // Regional-meet qualification badges (Update 20): a completed regional
    // shows which teams punched a ticket to Nationals (automatic vs at-large)
    // and which runners qualified as individuals.
    const isRegional = meet.type === 'regional';
    const teamBidBadge = (t) => {
      if (!isRegional || !t.nationalsBid) return '';
      return t.nationalsBid === 'auto'
        ? ' <span title="Qualified for Nationals — automatic bid" style="color:var(--success); font-weight:700; font-size:10.5px; white-space:nowrap;">🎟 NQ</span>'
        : ' <span title="Qualified for Nationals — at-large bid" style="color:var(--accent); font-weight:700; font-size:10.5px; white-space:nowrap;">🎟 AL</span>';
    };
    const indivQualBadge = (f) => (isRegional && f.nationalsIndividual && !f.nationalsTeamQualifier)
      ? (f.nationalsIndividualAtLarge ? ' <span title="Qualified for Nationals as a national at-large individual" style="color:var(--accent); font-weight:700; font-size:10.5px; white-space:nowrap;">🎟 IQ·AL</span>' : '') || ' <span title="Qualified for Nationals as an individual (a top-10 regional finish)" style="color:var(--accent); font-weight:700; font-size:10.5px; white-space:nowrap;">🎟 IQ</span>'
      : '';

    // The full results body for one gender — rebuilt when a tab is clicked.
    function bodyFor(g) {
      const res = meet.results[g];
      if (!res) return '<div class="card" style="padding:16px; color:var(--text-dim);">No results recorded for this race.</div>';

      const teamRows = res.teamScores.map((t) => {
        const school = game.getSchool(t.schoolId);
        const mine = t.schoolId === game.playerSchoolId;
        return `<tr class="clickable" data-school="${t.schoolId}" ${mine ? 'style="background:var(--accent-soft);"' : ''}>
          <td>${t.place}</td>
          <td><strong>${Utils.escapeHtml(school ? school.name : '?')}</strong>${teamBidBadge(t)}</td>
          <td class="num">${t.points}</td>
          <td style="color:var(--text-dim); font-size:12px;">${t.scorers.join(' + ')}</td>
          <td class="num">${typeof t.gap === 'number' ? `<span class="pack-gap-chip ${UI.screens.racecenter.gapTone(t.gap, res)}">${Races().formatGap(t.gap)}</span>` : '—'}</td>
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
          <td>${UI.avatar(game.getAthlete(f.athleteId) || { name: f.name, gender: g }, { size: 20 })} ${Utils.escapeHtml(f.name)}${honored ? ` <span title="${honor.label}">${honor.icon}</span>` : ''}${indivQualBadge(f)} <span style="color:var(--text-faint); font-size:11px;">${f.classYear || ''}</span></td>
          <td>${Utils.escapeHtml(school ? school.name : '?')}</td>
          <td class="num">${ft(f.time)}${UI.crTag ? UI.crTag(f) : ''}${UI.nrTag ? UI.nrTag(f) : ''}</td>
        </tr>`;
      }).join('') +
      // DNF runners (Update 19): listed at the bottom, no place, no time.
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

      const pack = UI.screens.racecenter.packReportHtml(game, res);
      const anyCr = res.finishers.some((f) => f.cr);
      const anyNr = res.finishers.some((f) => f.nr);
      return `
        <h3 style="margin:0 0 10px;">${g === 'M' ? "Men's" : "Women's"} ${Races().distKey(res.distanceM)}</h3>
        ${honor ? `<div style="margin:0 0 10px; padding:7px 12px; border:1px solid var(--border); border-radius:8px; color:var(--text-dim); font-size:12.5px;">
          ${honor.icon} Championship race — the top ${honor.count} finishers earn <strong>${honor.label}</strong> honors, marked ${honor.icon}.
        </div>` : ''}
        ${isRegional ? `<div style="margin:0 0 10px; padding:7px 12px; border:1px solid var(--border); border-radius:8px; color:var(--text-dim); font-size:12.5px;">
          🎟 Nationals qualifiers — <strong style="color:var(--success);">NQ</strong> automatic team bid · <strong style="color:var(--accent);">AL</strong> at-large team bid · <strong style="color:var(--accent);">IQ</strong> individual qualifier. These teams and runners advance to the NCAA Championships.
        </div>` : ''}
        ${(anyCr || anyNr) ? `<div style="color:var(--text-faint); font-size:11.5px; margin:0 0 8px;">${anyCr ? '<span class="cr-badge">CR</span> Course Record' : ''}${anyNr ? `${anyCr ? ' · ' : ''}<span class="cr-badge nr">NR</span> National Record` : ''}</div>` : ''}
        ${pack ? `<div class="card" style="padding:12px; margin-bottom:12px;">${pack}</div>` : ''}
        <div class="grid cols-2">
          <div class="card" style="padding:12px;">
            <h3>Team Scores</h3>
            <div class="table-wrap" style="max-height:340px; overflow-y:auto;">
              <table class="data"><thead><tr><th class="col-rank">Pl</th><th class="col-grow">Team</th><th class="num">Pts</th><th>Scorers</th><th class="num" title="1–5 gap: the time between a team's 1st and 5th scorer">1–5 Gap</th></tr></thead>
              <tbody>${teamRows}</tbody></table>
            </div>
          </div>
          <div class="card" style="padding:12px;">
            <h3>Individuals — ${res.finishers.length}${res.finisherCount > res.finishers.length ? ` of ${res.finisherCount} recorded` : ' finishers'}${res.dnfs && res.dnfs.length ? ` • ${res.dnfs.length} DNF` : ''}</h3>
            <div class="table-wrap" style="max-height:340px; overflow-y:auto;">
              <table class="data"><thead><tr><th class="col-rank">Pl</th><th class="col-grow">Runner</th><th>School</th><th class="num">Time</th></tr></thead>
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
      <div style="color:var(--text-dim); font-size:13px; margin-bottom:10px;">
        Week ${meet.week} • ${UI.weatherText(meet.conditions)} •
        Hills ${meet.conditions.hilliness}/100 (${window.XCD.data.hillinessLabel ? window.XCD.data.hillinessLabel(meet.conditions.hilliness) : ''}) • ${meet.conditions.altitude} altitude • ${UI.meetSpeedTag(meet)}
      </div>
      ${UI.meetCourseRecordLine ? UI.meetCourseRecordLine(game, meet) : ''}
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
      if (UI.wireCourseRecordLines) UI.wireCourseRecordLines(modal, game);
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

  /* ================================================================ *
   * Schedule Builder (Real Schedules): per-week drop-downs, a hard
   * travel budget, and a meet browser to chase ranked teams and
   * conference rivals across every division.
   * ================================================================ */
  let sbWeek = null;        // meet browser: selected week
  let sbDiv = 'all';        // 'all' | 'DI' | 'DII' | 'DIII'
  let sbRankedOnly = false;
  let sbRivalsOnly = false;
  let sbSort = 'strength';  // 'strength' | 'cost' | 'size'

  const money = (n) => '$' + Math.round(n).toLocaleString();
  const MC = () => window.XCD.engine.MeetCalendar;

  // { schoolId: { div, M, W, best } } for teams ranked in their division's top 25.
  function rankMap(game) {
    const out = {};
    const r = game.rankings;
    if (!r) return out;
    ['M', 'W'].forEach((g) => (r[g] || []).forEach((row) => {
      if (row.rank > 25) return;
      const o = out[row.schoolId] = out[row.schoolId] || { div: row.division || 'DI' };
      o[g] = row.rank;
      o.best = Math.min(o.best || 99, row.rank);
    }));
    return out;
  }
  const DIV_SHORT = (d) => (window.XCD.data.DIVISION_SHORT || {})[d] || d;

  function rankChip(game, sid, ranks, mine) {
    const s = game.getSchool(sid);
    if (!s) return '';
    const rk = ranks[sid];
    const rival = mine && s.conference === mine.conference && sid !== mine.id;
    const rankTxt = rk ? [rk.M && `M#${rk.M}`, rk.W && `W#${rk.W}`].filter(Boolean).join(' ') : '';
    return `<span class="sb-chip ${rk ? 'ranked' : ''} ${rival ? 'rival' : ''} div-${(s.division || 'DI').toLowerCase()}" data-school="${sid}"
      title="${Utils.escapeHtml(s.name)} · ${Utils.escapeHtml(s.conference)}${rival ? ' (conference rival)' : ''}">
      <b>${DIV_SHORT(s.division || 'DI')}</b> ${Utils.escapeHtml(s.name)}${rankTxt ? ` <em>${rankTxt}</em>` : ''}${rival ? ' ⚔️' : ''}</span>`;
  }

  function travelText(cost) {
    if (cost.mode === 'home') return '🏠 Home meet · free';
    return `${cost.mode === 'flight' ? '✈️ Flight' : '🚌 Bus'} · ${cost.miles.toLocaleString()} mi · ${money(cost.total)}`;
  }

  function fieldStats(game, meet, ranks, mine) {
    const ids = meet.schoolIds || [];
    let ranked = 0, rivals = 0, power = 0;
    ids.forEach((id) => {
      if (ranks[id]) ranked++;
      const s = game.getSchool(id);
      if (s && mine && s.conference === mine.conference && id !== mine.id) rivals++;
      power += MC().powerOf(game, id);
    });
    return { ranked, rivals, avgPower: ids.length ? Math.round(power / ids.length) : 0 };
  }

  // The option list for one week's drop-down.
  function weekOptions(game, week, sp) {
    const season = game.season;
    const school = game.getPlayerSchool();
    const curId = season.playerMeetByWeek[week] || null;
    const cur = curId && season.meets[curId];
    const curCost = cur ? MC().meetCost(game, school, cur).total : 0;
    const opts = (season.byWeek[week] || []).map((id) => season.meets[id])
      .filter((m) => m && m.type === 'invite')
      .map((m) => {
        const d = MC().describeMeet(game, m, school);
        let block = '';
        if (!d.mine) {
          if (!d.access.ok) block = '🔒 ' + d.access.reason;
          else if (!d.room) block = 'Full';
          else if (d.cost.total > sp.left + curCost) block = '💸 Over budget';
          else if (!cur && sp.count >= MC().CFG.MAX_MEETS) block = `Max ${MC().CFG.MAX_MEETS} meets`;
        }
        return { d, block };
      })
      .sort((a, b) => (!!a.block - !!b.block) || (a.d.cost.total - b.d.cost.total));
    return { opts, curId };
  }

  function optionLabel(d, block) {
    const c = d.cost;
    const trip = c.mode === 'home' ? 'Home · free' : `${c.mode === 'flight' ? '✈️' : '🚌'} ${c.miles} mi · ${money(c.total)}`;
    return `${d.tierIcon ? d.tierIcon + ' ' : ''}${d.meet.name} — ${trip} · ${d.speed.icon ? d.speed.icon + ' ' : ''}${d.speed.label} · ${d.field}/${d.cap} teams${block ? ' · ' + block : ''}`;
  }

  function budgetCard(game, sp, editable) {
    const school = game.getPlayerSchool();
    const tb = school.travelBudget || {};
    const pct = sp.budget ? Math.round((sp.spent / sp.budget) * 100) : 0;
    const mom = tb.momentum || 0;
    const why = [
      `Program base (prestige ${school.prestige}, ${Utils.escapeHtml(window.XCD.data.divisionFor(school).label)}): <strong>${money(tb.base || 0)}</strong>`,
      `Travel Program ${tb.rating || MC().travelRating(school)}: <strong>×${(tb.ratingMult || 1).toFixed(2)}</strong> <span style="color:var(--text-faint);">(upgrade it on My Program)</span>`,
      `Last season: <strong>${mom >= 0 ? '+' : ''}${Math.round(mom * 100)}%</strong>${(tb.notes || []).length ? ' — ' + tb.notes.map(Utils.escapeHtml).join(' · ') : ''}`,
      tb.floor && tb.floor >= (tb.total || 0) ? 'The athletic department guarantees enough for a three-meet local schedule.' : ''
    ].filter(Boolean);
    return `
      <div class="sb-budget">
        <div class="sb-budget-nums">
          <div><span>Travel budget</span><strong>${money(sp.budget)}</strong></div>
          <div><span>Planned</span><strong>${money(sp.spent)}</strong></div>
          <div><span>Left</span><strong style="color:${sp.left < 0 ? 'var(--danger)' : 'var(--success)'};">${money(sp.left)}</strong></div>
          <div><span>Meets</span><strong style="color:${sp.count < MC().CFG.MIN_MEETS ? 'var(--warning)' : 'var(--text)'};">${sp.count} <small>of ${MC().CFG.MIN_MEETS}–${MC().CFG.MAX_MEETS}</small></strong></div>
        </div>
        ${UI.meter(pct, pct > 100 ? 'red' : pct > 85 ? 'yellow' : 'green')}
        <details class="sb-why"><summary>Why this budget?</summary>${why.map((w) => `<div>${w}</div>`).join('')}
          <div style="color:var(--text-faint);">Trips are priced by distance: a bus ride (up to 500 miles) is cheap, a flight is not. Hosting is free. ${editable ? 'The budget is a hard cap.' : ''}</div>
        </details>
      </div>`;
  }

  function builderHtml(game, editable) {
    const season = game.season;
    const school = game.getPlayerSchool();
    const sp = MC().playerSpend(game);
    const ranks = rankMap(game);
    const rows = MC().WEEKS.map((week) => {
      const { opts, curId } = weekOptions(game, week, sp);
      const cur = curId && season.meets[curId];
      const d = cur ? MC().describeMeet(game, cur, school) : null;
      const st = cur ? fieldStats(game, cur, ranks, school) : null;
      const past = game.week > week;
      const select = `
        <select class="sb-select" data-sb-week="${week}" ${editable && !past ? '' : 'disabled'} aria-label="Week ${week} meet">
          <option value="" ${curId ? '' : 'selected'}>😴 Off week — training block</option>
          ${opts.map(({ d: o, block }) => `<option value="${o.meet.id}" ${o.meet.id === curId ? 'selected' : ''} ${block ? 'disabled' : ''}>${Utils.escapeHtml(optionLabel(o, block))}</option>`).join('')}
        </select>`;
      const meta = d ? `
        <div class="sb-meta">
          <span class="sb-tier t-${cur.tier}">${d.tierIcon ? d.tierIcon + ' ' : ''}${d.tierLabel}</span>
          <span>${travelText(d.cost)}</span>
          ${UI.meetSpeedTag(cur)}
          <span>📍 ${Utils.escapeHtml(d.course.location || '')}</span>
          <span>${d.field}/${d.cap} teams${st.ranked ? ` · <strong>${st.ranked} ranked</strong>` : ''}${st.rivals ? ` · ⚔️ ${st.rivals} conference` : ''}</span>
          <button class="btn small" data-sb-browse="${week}">Field ▸</button>
        </div>` : `<div class="sb-meta" style="color:var(--text-faint);">${opts.length} meet${opts.length === 1 ? '' : 's'} this weekend <button class="btn small" data-sb-browse="${week}">Browse ▸</button></div>`;
      return `<div class="sb-week ${cur ? 'racing' : ''}"><div class="sb-wk">Wk ${week}</div><div class="sb-body">${select}${meta}</div></div>`;
    }).join('');
    return `
      <div class="card" id="schedule-builder" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <h2 style="margin:0;">🗓 Schedule Builder</h2>
          <span style="color:var(--text-dim); font-size:12.5px;">Team Power <strong>${MC().powerOf(game, school.id)}</strong> · Weeks 4–12</span>
        </div>
        <div style="color:var(--text-faint); font-size:12px; margin:4px 0 10px;">
          Pick ${MC().CFG.MIN_MEETS}–${MC().CFG.MAX_MEETS} meets within your travel budget, then <strong>finalize</strong> — it locks after Week 1.
        </div>
        ${budgetCard(game, sp, editable)}
        <div class="sb-weeks">${rows}</div>
        ${editable ? `
        <div style="border-top:1px solid var(--border); padding-top:10px; margin-top:6px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="color:var(--text-dim); font-size:12.5px;">Off weeks bank a training block. Finalizing locks the slate for the season.</span>
          <button class="btn primary" id="btn-finalize-schedule">🔒 Finalize Schedule</button>
        </div>` : ''}
      </div>`;
  }

  // Short trip text for the browser: "🚌 240 mi · $1,200" or "🏠 Home".
  function tripShort(cost) {
    if (cost.mode === 'home') return '🏠 Home';
    return `${cost.mode === 'flight' ? '✈️' : '🚌'} ${cost.miles.toLocaleString()} mi · ${money(cost.total)}`;
  }

  /*
   * The Meet Browser: one compact card per meet — name, where, the trip,
   * course speed, field size — plus the ranked teams and conference rivals
   * entered. Everyone else is one tap away. Shown only while the schedule
   * is still being built.
   */
  function browserHtml(game, editable) {
    const season = game.season;
    const school = game.getPlayerSchool();
    const ranks = rankMap(game);
    const weeks = MC().WEEKS.filter((w) => (season.byWeek[w] || []).length);
    if (!weeks.length) return '';
    if (!weeks.includes(sbWeek)) sbWeek = weeks.find((w) => w >= game.week) || weeks[0];
    const sp = MC().playerSpend(game);
    const curId = season.playerMeetByWeek[sbWeek] || null;
    const curCost = curId ? MC().meetCost(game, school, season.meets[curId]).total : 0;
    const inDiv = (id) => sbDiv === 'all' || (game.getSchool(id) || {}).division === sbDiv;
    let list = (season.byWeek[sbWeek] || []).map((id) => season.meets[id]).filter((m) => m && m.type === 'invite')
      .map((m) => ({ m, d: MC().describeMeet(game, m, school), st: fieldStats(game, m, ranks, school) }));
    if (sbDiv !== 'all') list = list.filter((x) => x.m.schoolIds.some(inDiv));
    if (sbRankedOnly) list = list.filter((x) => x.st.ranked > 0);
    if (sbRivalsOnly) list = list.filter((x) => x.st.rivals > 0);
    list.sort((a, b) => sbSort === 'cost' ? a.d.cost.total - b.d.cost.total
      : sbSort === 'size' ? b.d.field - a.d.field
      : (b.st.ranked * 10 + b.st.avgPower) - (a.st.ranked * 10 + a.st.avgPower));
    const CHIPS = 6;
    const cards = list.map(({ m, d }) => {
      const ids = m.schoolIds.filter(inDiv).sort((a, b) => ((ranks[a] || {}).best || 99) - ((ranks[b] || {}).best || 99) ||
        MC().powerOf(game, b) - MC().powerOf(game, a));
      const notable = ids.filter((id) => ranks[id] || (game.getSchool(id) || {}).conference === school.conference);
      let action = '';
      if (d.mine) action = '<span class="sb-on">✓ Entered</span>';
      else if (editable && game.week <= m.week) {
        const block = !d.access.ok ? '🔒 ' + d.access.reason : !d.room ? 'Full'
          : d.cost.total > sp.left + curCost ? '💸 Over budget' : (!curId && sp.count >= MC().CFG.MAX_MEETS) ? `Max ${MC().CFG.MAX_MEETS} meets` : '';
        action = block ? `<span class="sb-block">${Utils.escapeHtml(block)}</span>`
          : `<button class="btn small primary" data-sb-enter="${m.id}" data-sb-enter-week="${m.week}">${curId ? 'Switch' : 'Enter'}</button>`;
      }
      const more = ids.length - Math.min(notable.length, CHIPS);
      return `
        <div class="sb-meet ${d.mine ? 'mine' : ''}">
          <div class="sb-meet-head">
            <div class="sb-meet-main">
              <div class="sb-meet-name">${d.tierIcon ? d.tierIcon + ' ' : ''}${Utils.escapeHtml(m.name)}</div>
              <div class="sb-meet-sub">${Utils.escapeHtml(d.course.location || '')} · ${tripShort(d.cost)} · ${UI.meetSpeedTag(m)} · ${d.field}/${d.cap} teams</div>
            </div>
            <div class="sb-meet-act">${action}</div>
          </div>
          ${ids.length ? `<div class="sb-chips">${notable.slice(0, CHIPS).map((id) => rankChip(game, id, ranks, school)).join('')}${more > 0 ? `
            <details class="sb-field"><summary>${notable.length ? `+${more} more` : `${ids.length} team${ids.length === 1 ? '' : 's'}`}</summary>
              <div class="sb-chips">${ids.map((id) => rankChip(game, id, ranks, school)).join('')}</div>
            </details>` : ''}</div>` : ''}
        </div>`;
    }).join('');
    return `
      <div class="card" id="meet-browser" style="margin-bottom:16px;">
        <h2 style="margin:0 0 8px;">🔎 Meet Browser</h2>
        <div class="pill-tabs" style="margin-bottom:8px;">${weeks.map((w) => `<button data-sb-week-tab="${w}" class="${w === sbWeek ? 'active' : ''}">Wk ${w}${season.playerMeetByWeek[w] ? ' •' : ''}</button>`).join('')}</div>
        <div class="sb-filters">
          <div class="pill-tabs">${['all', 'DI', 'DII', 'DIII'].map((dv) => `<button data-sb-div="${dv}" class="${dv === sbDiv ? 'active' : ''}">${dv === 'all' ? 'All' : DIV_SHORT(dv)}</button>`).join('')}</div>
          <label class="sb-toggle"><input type="checkbox" id="sb-ranked" ${sbRankedOnly ? 'checked' : ''}> Ranked</label>
          <label class="sb-toggle"><input type="checkbox" id="sb-rivals" ${sbRivalsOnly ? 'checked' : ''}> Rivals</label>
          <select id="sb-sort" class="sb-sort" aria-label="Sort meets">
            <option value="strength" ${sbSort === 'strength' ? 'selected' : ''}>Strongest</option>
            <option value="cost" ${sbSort === 'cost' ? 'selected' : ''}>Cheapest</option>
            <option value="size" ${sbSort === 'size' ? 'selected' : ''}>Biggest</option>
          </select>
        </div>
        <div class="sb-meets">${cards || '<div style="color:var(--text-dim); font-size:13px; padding:8px 0;">No meets match these filters this weekend.</div>'}</div>
      </div>`;
  }

  function wireBuilder(game, container, rerender) {
    container.querySelectorAll('[data-sb-week]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const r = MC().selectMeet(game, Number(sel.dataset.sbWeek), sel.value || null);
        UI.toast(r.message, r.ok ? 'success' : 'error');
        rerender();
      });
    });
    container.querySelectorAll('[data-sb-browse]').forEach((b) => b.addEventListener('click', () => {
      sbWeek = Number(b.dataset.sbBrowse);
      rerender();
      const el = document.getElementById('meet-browser');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }));
    container.querySelectorAll('[data-sb-week-tab]').forEach((b) => b.addEventListener('click', () => { sbWeek = Number(b.dataset.sbWeekTab); rerender(); }));
    container.querySelectorAll('[data-sb-div]').forEach((b) => b.addEventListener('click', () => { sbDiv = b.dataset.sbDiv; rerender(); }));
    const rk = container.querySelector('#sb-ranked');
    if (rk) rk.addEventListener('change', () => { sbRankedOnly = rk.checked; rerender(); });
    const rv = container.querySelector('#sb-rivals');
    if (rv) rv.addEventListener('change', () => { sbRivalsOnly = rv.checked; rerender(); });
    const so = container.querySelector('#sb-sort');
    if (so) so.addEventListener('change', () => { sbSort = so.value; rerender(); });
    container.querySelectorAll('[data-sb-enter]').forEach((b) => b.addEventListener('click', () => {
      const r = MC().selectMeet(game, Number(b.dataset.sbEnterWeek), b.dataset.sbEnter);
      UI.toast(r.message, r.ok ? 'success' : 'error');
      rerender();
    }));
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
          ? (meet.preNationals ? '🏆 Pre-Nationals' : meet.elite ? '⭐ Elite Invitational' : typeLabel[meet.type] || 'Invitational')
          : (season.calendarVersion ? 'Off week' : 'Invitational');
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
      if (!meet && label === 'Off week') {
        note = '😴 Off week';
        status = '<span style="color:var(--text-faint);">Training block</span>';
      } else if (!meet) status = `<span style="color:var(--text-faint);">${note || '—'}</span>`;
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
      // The course is always known; race-day weather only once it's
      // forecast (race week and the week before) or the race is run.
      const conditions = meet
        ? `${UI.meetSpeedTag(meet)}${UI.weatherKnown(game, meet) ? ` ${meet.conditions.tempF}°F${meet.conditions.snow ? ' ❄️' : meet.conditions.rain ? ' 🌧' : ''}${meet.conditions.ground === 'Muddy' ? ' mud' : ''}` : ''}`
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
          ${e.meet ? `<span style="color:var(--text-faint); font-size:11px;"> ${e.label}</span>` : ''}
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

    // Week 1 Administrative Phase (spec Part 2, Section 15): the schedule is
    // set during Week 1 and then finalized for the season. After that, only
    // the finalized table shows. Pre-Nationals (Update 20) is no longer a
    // separate accept/decline invitation — it is a normal Week 10 elite meet
    // option in the schedule selector below.
    const locked = game.scheduleLocked ? game.scheduleLocked() : game.week > 1;

    // Upcoming meet field preview → the filterable "In the Field" browser with
    // division/gender labels and pre-meet projections (Meet preview overhaul).
    // Like the Meet Browser, it's for planning, so it goes once locked.
    const previewHtml = locked ? '' : inTheFieldHtml(game);

    // Custom race scheduling (Update 4, Part 7 + Section 15): pick which
    // meets to attend during Week 1, gated by prestige — then finalize.
    let scheduleHtml = '';
    let browserCard = '';
    const Scheduling = window.XCD.engine.Scheduling;
    const realSchedule = !!(season.calendarVersion && MC());
    if (realSchedule) {
      const editable = !locked && game.controlsScheduling();
      // Once locked, the clean season schedule moves to the top and the
      // builder and Meet Browser go away until next Week 1.
      if (!locked) {
        scheduleHtml = editable ? builderHtml(game, true) : '';
        browserCard = browserHtml(game, editable);
      }
    } else if (Scheduling && !locked) {
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
              <span style="color:var(--text-dim); font-size:12.5px;">Happy with the slate? Finalizing locks it for the whole season.</span>
              <button class="btn primary" id="btn-finalize-schedule">🔒 Finalize Schedule</button>
            </div>
          </div>`;
      }
    }

    // Assistant coaches don't set the schedule or answer invitations — those
    // are head-coach calls. Replace the editors with a read-only note.
    if (!locked && game.isAssistant && game.isAssistant()) {
      const head = game.getCoach(school.coachId);
      scheduleHtml = `<div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent);">
        <h2>🗓 Race Scheduling</h2>
        <div style="color:var(--text-dim); font-size:13px;">Head coach <strong>${head ? Utils.escapeHtml(head.fullName) : 'the staff'}</strong> sets the race schedule. As recruiting coordinator you'll see the season below, but scheduling isn't your call.</div>
      </div>`;
    }

    container.innerHTML = `
      <div class="screen-header">
        ${UI.screenTitle('Schedule', `${season.year} season · Men ${rankM ? '#' + rankM : '—'} · Women ${rankW ? '#' + rankW : '—'}`)}
        <div class="actions">
          ${game.lastPlayerMeetId && game.season.meets[game.lastPlayerMeetId]?.results.M
            ? '<button class="btn primary" id="btn-race-center">📺 Race Center (last meet)</button>' : ''}
        </div>
      </div>
      ${UI.sectionLabel('Your Season')}
      ${scheduleHtml}
      ${browserCard}
      <div class="card" id="season-schedule">
        ${locked ? `<div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <h2 style="margin:0;">${season.year} Schedule Finalized</h2>
          ${realSchedule ? (() => {
            const sp = MC().playerSpend(game);
            return `<span style="color:var(--text-dim); font-size:12.5px;">${sp.count} meets · ${money(sp.spent)} of ${money(sp.budget)} travel</span>`;
          })() : ''}
        </div>` : `<h2 style="margin:0 0 8px;">📅 Season at a Glance</h2>`}
        <div class="table-wrap desktop-only"><table class="data">
          <thead><tr><th class="col-rank">Week</th><th class="col-grow">Meet</th><th>Field</th><th>Course</th><th>Result</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="card-list mobile-only">${meetCards}</div>
        <div style="color:var(--text-faint); font-size:12px; margin-top:8px;">Tap a completed meet for full results.</div>
      </div>
      ${previewHtml ? UI.sectionLabel('Around the Nation') + previewHtml : ''}`;

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

    if (realSchedule) wireBuilder(game, container, () => render(container));

    // Finalize (Section 15): permanently lock the season's slate.
    const finalizeBtn = container.querySelector('#btn-finalize-schedule');
    if (finalizeBtn) finalizeBtn.addEventListener('click', () => {
      if (!game.controlsScheduling()) { UI.toast('Only the head coach finalizes the schedule.', 'error'); return; }
      if (realSchedule) {
        const v = MC().validatePlayerSchedule(game);
        if (!v.ok) { UI.toast(v.message, 'error'); return; }
      }
      game.week1 = game.week1 || window.XCD.engine.GameState.freshWeek1();
      game.week1.scheduleFinalized = true;
      UI.toast('Schedule finalized — the slate is locked for the season.', 'success');
      render(container);
    });
  }

  UI.screens.schedule = { render };
})();
