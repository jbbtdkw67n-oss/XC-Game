/*
 * Race Center: animated replay of the player's most recent meet.
 * Races are simulated instantly during Advance Week; this screen plays
 * back the stored splits as a live broadcast — progress bars, a rolling
 * leaderboard, live team scores, then final results.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const Races = () => window.XCD.engine.Races;

  let activeGender = 'M';
  let anim = null; // { raf, start, speed, duration }

  function stopAnim() {
    if (anim && anim.raf) cancelAnimationFrame(anim.raf);
    anim = null;
  }

  function render(container) {
    stopAnim();
    const game = UI.state.game;
    const meet = game.lastPlayerMeetId && game.season.meets[game.lastPlayerMeetId];

    // If only one gender raced (e.g. a single squad made nationals), show it.
    if (meet && !meet.results[activeGender]) {
      const other = activeGender === 'M' ? 'W' : 'M';
      if (meet.results[other]) activeGender = other;
    }

    if (!meet || !meet.results[activeGender]) {
      container.innerHTML = `
        <div class="screen-header"><h1>Race Center</h1></div>
        <div class="card" style="color:var(--text-dim);">
          No race footage yet. Advance to a race week — your meet will be
          broadcast here after it runs.
        </div>`;
      return;
    }

    const res = meet.results[activeGender];
    const ft = Races().formatTime;
    const hasSplits = res.splits && Object.keys(res.splits).length;

    container.innerHTML = `
      <div class="screen-header">
        <h1>📺 ${Utils.escapeHtml(meet.name)}</h1>
        <div class="actions">
          <div class="pill-tabs">
            <button id="g-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="g-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
          ${hasSplits ? `
            <button class="btn" id="btn-replay">▶ Replay</button>
            <button class="btn" id="btn-speed">2×</button>
            <button class="btn" id="btn-skip">⏭ Final</button>` : ''}
        </div>
      </div>
      ${(() => {
        const hostHtml = window.XCD.engine.Scheduling.meetHostHtml
          ? window.XCD.engine.Scheduling.meetHostHtml(game, meet) : '';
        return hostHtml
          ? `<div style="color:var(--text-dim); font-size:13px; margin-bottom:8px; line-height:1.5;">${hostHtml}</div>`
          : '';
      })()}
      <div style="color:var(--text-dim); font-size:13px; margin-bottom:14px;">
        ${gDist(meet, activeGender)} • ${meet.conditions.tempF}°F${meet.conditions.rain ? ' • Rain' : ''} •
        Hills ${meet.conditions.hilliness}/100 • ${meet.conditions.altitude} altitude • Week ${meet.week}, ${game.season.year}
      </div>
      <div class="race-layout">
        <div class="card" id="race-track" style="min-height:300px;"></div>
        <div>
          <div class="card" id="live-board" style="margin-bottom:16px;"></div>
          <div class="card" id="live-teams" style="margin-bottom:16px;"></div>
          <div class="card" id="live-ticker"></div>
        </div>
      </div>`;

    container.querySelector('#g-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    container.querySelector('#g-w').addEventListener('click', () => { activeGender = 'W'; render(container); });

    if (!hasSplits) {
      showFinal(game, meet, container);
      return;
    }

    const replayBtn = container.querySelector('#btn-replay');
    const speedBtn = container.querySelector('#btn-speed');
    const skipBtn = container.querySelector('#btn-skip');
    replayBtn.addEventListener('click', () => startReplay(game, meet, container));
    speedBtn.addEventListener('click', () => {
      if (!anim) return;
      anim.speed = anim.speed === 1 ? 2 : anim.speed === 2 ? 4 : 1;
      speedBtn.textContent = `${anim.speed === 1 ? 2 : anim.speed === 2 ? 4 : 1}×`;
    });
    skipBtn.addEventListener('click', () => { stopAnim(); showFinal(game, meet, container); });

    startReplay(game, meet, container);
  }

  function gDist(meet, gender) {
    return `${gender === 'M' ? "Men's" : "Women's"} ${Races().distKey(meet.distances[gender])}`;
  }

  /*
   * Build replay dataset: for each shown runner, cumulative split times.
   * Progress at race-time t = fraction of the course covered.
   */
  function buildReplay(game, meet) {
    const res = meet.results[activeGender];
    const splits = res.splits;
    const finishers = res.finishers;
    const shown = [];
    const playerIds = new Set();
    finishers.forEach((f) => { if (f.schoolId === game.playerSchoolId) playerIds.add(f.athleteId); });
    // Show top 25 + all player runners
    finishers.forEach((f, i) => {
      if (i < 25 || playerIds.has(f.athleteId)) {
        shown.push({ ...f, splits: splits[f.athleteId], mine: playerIds.has(f.athleteId) });
      }
    });
    const lastFinish = Math.max(...shown.map((r) => r.time));
    return { shown, lastFinish };
  }

  const EVENT_TEXT = {
    surge: (e) => `⚡ ${e.name} throws in a surge!`,
    fade: (e) => `🥵 ${e.name} is tying up — the tank is empty.`,
    kick: (e) => `🚀 ${e.name} unleashes a huge finishing kick!`,
    lead: (e) => `🔥 ${e.name} takes the lead!`
  };

  function startReplay(game, meet, container) {
    stopAnim();
    const { shown, lastFinish } = buildReplay(game, meet);
    const res = meet.results[activeGender];
    const track = container.querySelector('#race-track');
    const ticker = container.querySelector('#live-ticker');
    const board = container.querySelector('#live-board');
    const teams = container.querySelector('#live-teams');
    const S = Races().SEGMENTS;

    // Broadcast events (from the sim) get timestamped by segment so the
    // ticker fires as the replay reaches them.
    const avgSeg = lastFinish / S;
    const raceEvents = (res.events || []).map((e) => ({ ...e, at: (e.seg + 0.5) * avgSeg }));
    let nextEvent = 0;
    const prevPos = new Map(); // athlete order snapshot for movement arrows

    track.innerHTML = `<h2 id="race-clock">0:00</h2>` + shown.map((r, i) => `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
        <div class="race-runner-name" style="width:150px; font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${r.mine ? 'color:var(--accent-hover); font-weight:700;' : 'color:var(--text-dim);'}">
          ${Utils.escapeHtml(r.name)}
        </div>
        <div class="meter" style="flex:1; height:9px;"><span id="bar-${i}" style="width:0%; ${r.mine ? '' : 'background:#5a6b85;'}"></span></div>
        <div style="width:52px; text-align:right; font-size:11px; color:var(--text-faint);" id="pos-${i}"></div>
      </div>`).join('');

    ticker.innerHTML = `<h3>📡 Race Feed</h3><div class="race-ticker"><div class="tick">The gun goes off — ${shown.length} runners shown of ${res.finisherCount}.</div></div>`;

    const playedSeconds = 48; // broadcast length at 1×
    anim = { speed: 1, elapsed: 0, last: performance.now(), raf: null, lastSnap: 0 };

    function progressAt(r, t) {
      // t = race seconds; splits are cumulative per segment (equal distance)
      const sp = r.splits;
      if (!sp) return t >= r.time ? 1 : t / r.time;
      if (t >= r.time) return 1;
      let seg = 0;
      while (seg < S && sp[seg] < t) seg++;
      const segStart = seg === 0 ? 0 : sp[seg - 1];
      const segEnd = sp[Math.min(seg, S - 1)];
      const within = segEnd > segStart ? (t - segStart) / (segEnd - segStart) : 0;
      return Utils.clamp((seg + within) / S, 0, 1);
    }

    function frame(now) {
      if (!anim) return;
      anim.elapsed += ((now - anim.last) / 1000) * anim.speed;
      anim.last = now;
      const raceT = (anim.elapsed / playedSeconds) * lastFinish;

      const clock = document.getElementById('race-clock');
      if (!clock) { stopAnim(); return; } // navigated away
      clock.textContent = `⏱ ${Races().formatTime(Math.min(raceT, lastFinish))}`;

      const standings = shown
        .map((r, i) => ({ r, i, p: progressAt(r, raceT) }))
        .sort((a, b) => (b.p - a.p) || (a.r.time - b.r.time));

      standings.forEach((s, pos) => {
        const bar = document.getElementById(`bar-${s.i}`);
        const posEl = document.getElementById(`pos-${s.i}`);
        if (bar) bar.style.width = `${(s.p * 100).toFixed(1)}%`;
        if (posEl) posEl.textContent = s.p >= 1 ? `✓ ${Races().formatTime(s.r.time)}` : Utils.ordinal(pos + 1);
      });

      // Broadcast ticker: fire events as the race reaches them.
      while (nextEvent < raceEvents.length && raceEvents[nextEvent].at <= raceT) {
        const e = raceEvents[nextEvent++];
        const text = (EVENT_TEXT[e.type] || ((x) => x.type))(e);
        const mine = e.schoolId === UI.state.game.playerSchoolId;
        const div = document.createElement('div');
        div.className = `tick ${e.type === 'lead' || e.type === 'kick' ? 'hot' : ''} ${mine ? 'mine' : ''}`;
        div.textContent = `${Races().formatTime(e.at)} — ${text}`;
        const feed = ticker.querySelector('.race-ticker');
        if (feed) {
          feed.prepend(div);
          while (feed.children.length > 24) feed.lastChild.remove();
        }
      }

      // Live leaderboard with position-movement arrows (vs ~a second ago).
      board.innerHTML = `<h3>Live Leaders</h3>` + standings.slice(0, 10).map((s, pos) => {
        const prev = prevPos.get(s.r.athleteId);
        let move = '<span class="pos-move"> </span>';
        if (prev !== undefined && prev !== pos + 1) {
          move = prev > pos + 1
            ? `<span class="pos-move up">▲${prev - pos - 1}</span>`
            : `<span class="pos-move down">▼${pos + 1 - prev}</span>`;
        }
        return `
        <div class="attr-row" style="padding:2.5px 0;">
          <span style="${s.r.mine ? 'color:var(--accent-hover); font-weight:700;' : ''}">${pos + 1}. ${move}${Utils.escapeHtml(s.r.name)}</span>
          <span style="color:var(--text-faint); font-size:11.5px;">${Utils.escapeHtml(UI.state.game.getSchool(s.r.schoolId)?.name || '')}</span>
        </div>`;
      }).join('');
      if (anim && (!anim.lastSnap || now - anim.lastSnap > 900)) {
        anim.lastSnap = now;
        standings.forEach((s, pos) => prevPos.set(s.r.athleteId, pos + 1));
      }

      // Live team score projection (Section 17): recomputed every frame from
      // the current position of every runner in the field. Leads change,
      // surges and fades move the score, and the board only locks once every
      // counted runner has crossed the line.
      const live = projectedScore(res, raceT);
      const prevTeamPos = anim.prevTeamPos || (anim.prevTeamPos = new Map());
      teams.innerHTML = `<h3>${live.locked ? '🔒 Final Team Score' : '📊 Projected Team Score'}</h3>` +
        live.teams.slice(0, 8).map((t, i) => {
          const prev = prevTeamPos.get(t.schoolId);
          let move = '<span class="pos-move"> </span>';
          if (prev !== undefined && prev !== i + 1) {
            move = prev > i + 1
              ? `<span class="pos-move up">▲</span>`
              : `<span class="pos-move down">▼</span>`;
          }
          return `
          <div class="attr-row" style="padding:2.5px 0;">
            <span style="${t.schoolId === UI.state.game.playerSchoolId ? 'color:var(--accent-hover); font-weight:700;' : ''}">${i + 1}. ${move}${Utils.escapeHtml(UI.state.game.getSchool(t.schoolId)?.name || '?')}</span>
            <span>${t.points}${i > 0 ? ` <span style="color:var(--text-faint); font-size:10.5px;">+${t.points - live.teams[0].points}</span>` : ''}</span>
          </div>`;
        }).join('') +
        playerTeamPanel(UI.state.game, live.teams, live.entries, live.locked);
      if (anim && (!anim.lastTeamSnap || now - anim.lastTeamSnap > 900)) {
        anim.lastTeamSnap = now;
        live.teams.forEach((t, i) => prevTeamPos.set(t.schoolId, i + 1));
      }

      if (raceT >= lastFinish) {
        stopAnim();
        showFinal(UI.state.game, meet, document.getElementById('screen-container'));
        return;
      }
      anim.raf = requestAnimationFrame(frame);
    }
    anim.raf = requestAnimationFrame(frame);
  }

  /*
   * Live Team Score Projection (spec Part 2, Section 17). The projection is
   * computed from the CURRENT position of every runner in the field — the
   * live order blends finished runners (by time) with in-progress runners
   * (by distance covered from their real splits) — so team standings surge,
   * fade, and trade the lead naturally until the last scorer crosses.
   */
  function liveOrderAt(res, raceT) {
    const S = Races().SEGMENTS;
    const splits = res.splits || {};
    return res.finishers
      .map((f) => {
        const done = raceT >= f.time;
        let p = 1;
        if (!done) {
          const sp = splits[f.athleteId];
          if (!sp) p = raceT / f.time;
          else {
            let seg = 0;
            while (seg < S && sp[seg] < raceT) seg++;
            const segStart = seg === 0 ? 0 : sp[seg - 1];
            const segEnd = sp[Math.min(seg, S - 1)];
            const within = segEnd > segStart ? (raceT - segStart) / (segEnd - segStart) : 0;
            p = Utils.clamp((seg + within) / S, 0, 0.9999);
          }
        }
        return { f, p, done };
      })
      .sort((a, b) => (b.p - a.p) || (a.f.time - b.f.time));
  }

  // Project team scores from live positions. Once every counted runner
  // (top 7 of each scoring team) has finished, the score is locked final.
  function projectedScore(res, raceT) {
    const order = liveOrderAt(res, raceT);
    const entries = order.map((x) => ({ ...x.f, done: x.done }));
    const teams = Races().scoreRace(entries);
    const counted = entries.filter((e) => e.scoringPlace);
    const locked = counted.length > 0 && counted.every((e) => e.done);
    return { teams, entries, locked };
  }

  // The player's live scoring detail: who scores right now, displacement,
  // and the point gaps to the leader and the team chasing them.
  function playerTeamPanel(game, teams, entries, locked) {
    const mine = teams.find((t) => t.schoolId === game.playerSchoolId);
    if (!mine) return '';
    const idx = teams.indexOf(mine);
    const leader = teams[0];
    const behind = teams[idx + 1];
    const squad = entries.filter((e) => e.scoringPlace && e.schoolId === game.playerSchoolId);
    const scorers = squad.slice(0, 5);
    const displacers = squad.slice(5, 7);
    return `
      <div style="border-top:1px solid var(--border); margin-top:8px; padding-top:8px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-dim);">
          <span>${locked ? 'Final' : 'Projected'}: <strong style="color:var(--text);">${Utils.ordinal(mine.place)} — ${mine.points} pts</strong></span>
          <span>${mine.place === 1
            ? (teams[1] ? `Lead: ${teams[1].points - mine.points} pts` : '')
            : `Leader: +${mine.points - leader.points}`}${behind && mine.place !== 1 ? ` • Chaser: −${behind.points - mine.points}` : ''}</span>
        </div>
        <div style="font-size:11.5px; color:var(--text-faint); margin-top:4px;">
          Scoring: ${scorers.map((s) => `${Utils.escapeHtml(s.name.split(' ').pop())} (${s.scoringPlace}${s.done ? '' : '·live'})`).join(', ') || '—'}
        </div>
        ${displacers.length ? `<div style="font-size:11.5px; color:var(--text-faint);">Displacing: ${displacers.map((s) => `${Utils.escapeHtml(s.name.split(' ').pop())} (${s.scoringPlace})`).join(', ')}</div>` : ''}
      </div>`;
  }

  function showFinal(game, meet, container) {
    const res = meet.results[activeGender];
    const track = container.querySelector('#race-track');
    const board = container.querySelector('#live-board');
    const teams = container.querySelector('#live-teams');
    if (!track) return;
    const ft = Races().formatTime;

    const winner = res.finishers[0];
    // Full individual results (Update 12): every finisher is published, and
    // at championship races the honor earners — All-Americans at nationals,
    // All-Conference at the conference meet — are marked with the honor
    // emoji (Update 13: no gold highlighting — the symbol is the award).
    const honor = UI.meetHonorInfo(meet);
    track.innerHTML = `
      <h2>Final — ${gDist(meet, activeGender)}</h2>
      <div style="margin:10px 0 14px; padding:12px; background:var(--accent-soft); border-radius:8px;">
        🥇 <strong class="clickable" data-ath="${winner.athleteId}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(winner.name)}</strong> (<span class="clickable" data-school="${winner.schoolId}" style="cursor:pointer;">${Utils.escapeHtml(game.getSchool(winner.schoolId)?.name || '?')}</span>)
        — ${ft(winner.time)}
      </div>
      ${honor ? `<div style="margin:0 0 10px; padding:8px 12px; border:1px solid var(--border); border-radius:8px; color:var(--text-dim); font-size:12.5px;">
        ${honor.icon} Championship race — the top ${honor.count} finishers earn <strong>${honor.label}</strong> honors, marked ${honor.icon} below.
      </div>` : ''}
      <h3 style="margin-bottom:6px;">Full Results — ${res.finishers.length} finishers</h3>
      <div class="table-wrap" style="max-height:420px; overflow-y:auto;">
        <table class="data">
          <thead><tr><th>Pl</th><th>Runner</th><th>School</th><th class="num">Time</th></tr></thead>
          <tbody>
            ${res.finishers.map((f) => {
              const honored = honor && f.place <= honor.count;
              const mine = f.schoolId === game.playerSchoolId;
              return `
              <tr ${mine ? 'style="background:var(--accent-soft);"' : ''}>
                <td>${f.place}</td>
                <td class="clickable" data-ath="${f.athleteId}" style="cursor:pointer; color:var(--accent-hover);">${UI.avatar(game.getAthlete(f.athleteId) || { name: f.name, gender: activeGender }, { size: 20 })} ${Utils.escapeHtml(f.name)}${honored ? ` <span title="${honor.label}">${honor.icon}</span>` : ''}</td>
                <td class="clickable" data-school="${f.schoolId}" style="font-size:12px; cursor:pointer;">${Utils.escapeHtml(game.getSchool(f.schoolId)?.name || '?')}</td>
                <td class="num">${ft(f.time)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    board.innerHTML = `<h3>Final Team Scores</h3>` + res.teamScores.slice(0, 15).map((t) => `
      <div class="attr-row clickable" data-school="${t.schoolId}" style="padding:3px 0; cursor:pointer;">
        <span style="${t.schoolId === game.playerSchoolId ? 'color:var(--accent-hover); font-weight:700;' : ''}">${t.place}. ${Utils.escapeHtml(game.getSchool(t.schoolId)?.name || '?')}</span>
        <span>${t.points}</span>
      </div>`).join('');

    // Every runner and team on the results board opens a profile (Phase 3).
    const wire = (root) => {
      root.querySelectorAll('[data-ath]').forEach((el) => {
        el.addEventListener('click', (e) => { e.stopPropagation(); UI.openAthlete(game, el.dataset.ath); });
      });
      root.querySelectorAll('[data-school]').forEach((el) => {
        el.addEventListener('click', (e) => { e.stopPropagation(); const s = game.getSchool(el.dataset.school); if (s) UI.showSchoolCard(s, game); });
      });
    };
    wire(track); wire(board);

    const mySplits = res.splits && res.finishers.filter((f) => f.schoolId === game.playerSchoolId).slice(0, 7);
    teams.innerHTML = mySplits && mySplits.length ? `<h3>Your Splits (per ${(res.distanceM / 1000 / Races().SEGMENTS).toFixed(2)}km leg)</h3>` +
      mySplits.map((f) => {
        const sp = res.splits[f.athleteId];
        if (!sp) return '';
        const legs = sp.map((c, i) => i === 0 ? c : c - sp[i - 1]);
        return `<div style="margin-bottom:8px;">
          <div style="font-size:12.5px; font-weight:600;">${Utils.escapeHtml(f.name)} — ${ft(f.time)} (${Utils.ordinal(f.place)})</div>
          <div style="font-size:11px; color:var(--text-faint);">${legs.map((l) => ft(l)).join(' · ')}</div>
        </div>`;
      }).join('') : '<h3>Team Scores Locked</h3>';
  }

  UI.screens.racecenter = { render, projectedScore, liveOrderAt, playerTeamPanel };
})();
