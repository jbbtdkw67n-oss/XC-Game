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
      <div style="color:var(--text-dim); font-size:13px; margin-bottom:14px;">
        ${gDist(meet, activeGender)} • ${meet.conditions.tempF}°F${meet.conditions.rain ? ' • Rain' : ''} •
        Hills ${meet.conditions.hilliness}/100 • ${meet.conditions.altitude} altitude • Week ${meet.week}, ${game.season.year}
      </div>
      <div class="grid" style="grid-template-columns: 1.5fr 1fr; gap:16px;">
        <div class="card" id="race-track" style="min-height:300px;"></div>
        <div>
          <div class="card" id="live-ticker" style="margin-bottom:16px;"></div>
          <div class="card" id="live-board" style="margin-bottom:16px;"></div>
          <div class="card" id="live-teams"></div>
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
        <div style="width:150px; font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${r.mine ? 'color:var(--accent-hover); font-weight:700;' : 'color:var(--text-dim);'}">
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

      // Live team score projection from current positions of ALL finishers
      const liveScore = projectedScore(res, raceT);
      teams.innerHTML = `<h3>Projected Team Score</h3>` + liveScore.slice(0, 8).map((t, i) => `
        <div class="attr-row" style="padding:2.5px 0;">
          <span style="${t.schoolId === UI.state.game.playerSchoolId ? 'color:var(--accent-hover); font-weight:700;' : ''}">${i + 1}. ${Utils.escapeHtml(UI.state.game.getSchool(t.schoolId)?.name || '?')}</span>
          <span>${t.points}</span>
        </div>`).join('');

      if (raceT >= lastFinish) {
        stopAnim();
        showFinal(UI.state.game, meet, document.getElementById('screen-container'));
        return;
      }
      anim.raf = requestAnimationFrame(frame);
    }
    anim.raf = requestAnimationFrame(frame);
  }

  // Approximate live team scores using final order truncated at current race time.
  function projectedScore(res, raceT) {
    const finished = res.finishers.filter((f) => f.time <= raceT);
    const source = finished.length >= 25 ? finished : res.finishers; // early race: use eventual order
    return Races().scoreRace(source.map((f) => ({ ...f })));
  }

  function showFinal(game, meet, container) {
    const res = meet.results[activeGender];
    const track = container.querySelector('#race-track');
    const board = container.querySelector('#live-board');
    const teams = container.querySelector('#live-teams');
    if (!track) return;
    const ft = Races().formatTime;

    const winner = res.finishers[0];
    track.innerHTML = `
      <h2>Final — ${gDist(meet, activeGender)}</h2>
      <div style="margin:10px 0 14px; padding:12px; background:var(--accent-soft); border-radius:8px;">
        🥇 <strong>${Utils.escapeHtml(winner.name)}</strong> (${Utils.escapeHtml(game.getSchool(winner.schoolId)?.name || '?')})
        — ${ft(winner.time)}
      </div>
      <div class="table-wrap" style="max-height:420px; overflow-y:auto;">
        <table class="data">
          <thead><tr><th>Pl</th><th>Runner</th><th>School</th><th class="num">Time</th></tr></thead>
          <tbody>
            ${res.finishers.slice(0, 40).map((f) => `
              <tr ${f.schoolId === game.playerSchoolId ? 'style="background:var(--accent-soft);"' : ''}>
                <td>${f.place}</td><td>${Utils.escapeHtml(f.name)}</td>
                <td style="font-size:12px;">${Utils.escapeHtml(game.getSchool(f.schoolId)?.name || '?')}</td>
                <td class="num">${ft(f.time)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    board.innerHTML = `<h3>Final Team Scores</h3>` + res.teamScores.slice(0, 15).map((t) => `
      <div class="attr-row" style="padding:3px 0;">
        <span style="${t.schoolId === game.playerSchoolId ? 'color:var(--accent-hover); font-weight:700;' : ''}">${t.place}. ${Utils.escapeHtml(game.getSchool(t.schoolId)?.name || '?')}</span>
        <span>${t.points}</span>
      </div>`).join('');

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

  UI.screens.racecenter = { render };
})();
