/*
 * Training screen: the weekly training planner. Assign one of the seven
 * workout types to each day (Mon-Sun) per squad; the weekly combination
 * drives fitness, fatigue, injury risk, and attribute growth.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const D = window.XCD.data;
  const TE = () => window.XCD.engine.Training;

  let activeGender = 'M';

  const WORKOUT_HINTS = {
    easy: 'Steady aerobic mileage. Small stamina gains, light load.',
    recovery: 'Very easy jogging. Sheds fatigue; tiny stamina gains.',
    long: 'The weekly cornerstone: big stamina, some VO₂ Max.',
    tempo: 'Threshold running — builds Lactate Threshold.',
    hills: 'Hill repeats: VO₂ Max, Speed, Economy + hill toughness. High injury risk.',
    intervals: 'Track work: VO₂ Max and some Speed. The hardest day.',
    speed: 'Sprint mechanics: Speed and Running Economy.'
  };

  const ATTR_LABELS = {
    vo2Max: 'VO₂ Max', runningEconomy: 'Economy', stamina: 'Stamina',
    lactateThreshold: 'Lact. Threshold', speed: 'Speed'
  };

  function render(container) {
    const game = UI.state.game;
    const school = game.getPlayerSchool();
    const plan = TE().normalizePlan(game.training[activeGender]);
    game.training[activeGender] = plan;
    const roster = game.getRoster(school.id, activeGender)
      .sort((a, b) => b.currentOverall - a.currentOverall);

    const avgFatigue = Math.round(Utils.average(roster.map((a) => a.fatigue)));
    const avgFitness = Math.round(Utils.average(roster.map((a) => a.fitness)));
    const avgReadiness = Math.round(Utils.average(roster.map((a) => TE().readiness(a))));
    const injured = game.getRoster(school.id, 'M').concat(game.getRoster(school.id, 'W'))
      .filter((a) => a.injury);

    const raceThisWeek = game.season && game.season.playerMeetByWeek[game.week];

    const workoutOptions = (selected) => Object.entries(D.WORKOUTS)
      .map(([k, w]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${w.label}</option>`).join('');

    container.innerHTML = `
      <div class="screen-header">
        <h1>Weekly Training Planner</h1>
        <div class="actions">
          <div class="pill-tabs">
            <button id="g-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="g-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Squad Fitness</div><div class="value">${avgFitness}</div>${UI.meter(avgFitness)}</div>
        <div class="stat-tile"><div class="label">Squad Fatigue</div><div class="value">${avgFatigue}</div>${UI.meter(avgFatigue, avgFatigue > 60 ? 'red' : avgFatigue > 40 ? 'yellow' : 'green')}</div>
        <div class="stat-tile"><div class="label">Race Readiness</div><div class="value">${avgReadiness}</div>${UI.meter(avgReadiness, 'green')}</div>
        <div class="stat-tile"><div class="label">Team Chemistry</div><div class="value">${school.chemistry?.[activeGender] ?? '—'}</div><div class="sub">${injured.length} injured</div></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <h2 style="margin:0;">This Week's Plan — ${activeGender === 'M' ? "Men's" : "Women's"} Squad</h2>
          <div style="display:flex; gap:8px;">
            <button class="btn small" id="btn-copy-plan">Copy to ${activeGender === 'M' ? 'Women' : 'Men'}</button>
            <button class="btn small" id="btn-balanced">Reset to Balanced Week</button>
            <button class="btn small ${game.weeklyFlow?.trainingConfirmed ? '' : 'primary'}" id="btn-confirm-plan">
              ${game.weeklyFlow?.trainingConfirmed ? '✓ Plan Confirmed' : '✓ Confirm Weekly Plan'}
            </button>
          </div>
        </div>
        ${raceThisWeek ? `<div style="margin:8px 0 0; padding:8px 12px; background:var(--accent-soft); border-radius:8px; font-size:13px;">
          🏁 RACE WEEK — your runners race this week. Fresh legs win races; consider tapering.
        </div>` : ''}
        <div class="week-planner" id="week-planner">
          ${D.DAYS.map((day, i) => `
            <div class="day-slot">
              <div class="day-name">${day.slice(0, 3)}</div>
              <select data-day="${i}" class="day-select ${D.WORKOUTS[plan[i]].hard ? 'hard' : 'easy'}">${workoutOptions(plan[i])}</select>
              <div class="day-hint" id="hint-${i}">${WORKOUT_HINTS[plan[i]]}</div>
            </div>`).join('')}
        </div>
        <div id="plan-preview" style="font-size:13px; margin-top:10px;"></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h2>Squad Monitor</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th>Name</th><th>Class</th><th class="num">OVR</th><th class="num">Δ Wk</th><th class="num">Δ Season</th>
            <th>Fitness</th><th>Fatigue</th><th class="num">Ready</th><th>Morale</th><th>Status</th><th>Load</th>
          </tr></thead>
          <tbody>
            ${roster.map((a) => {
              const override = game.training.overrides[a.id] || 'normal';
              const ready = TE().readiness(a);
              return `
              <tr>
                <td class="clickable" data-ath="${a.id}" style="cursor:pointer;"><strong>${Utils.escapeHtml(a.fullName)}</strong>${a.isWalkOn ? ' <span style="color:var(--text-faint); font-size:10px;">WO</span>' : ''}</td>
                <td>${a.classYear}</td>
                <td class="num">${UI.ratingBadge(a.currentOverall)}</td>
                <td class="num" style="color:${a.lastDelta > 0 ? 'var(--success)' : 'var(--text-faint)'};">${a.lastDelta > 0 ? '+' + a.lastDelta : a.lastDelta || '—'}</td>
                <td class="num" style="color:${(a.seasonDev || 0) > 0 ? 'var(--success)' : 'var(--text-faint)'};">${(a.seasonDev || 0) > 0 ? '+' + a.seasonDev : a.seasonDev || '—'}</td>
                <td><div style="min-width:56px;">${UI.meter(a.fitness)}</div></td>
                <td><div style="min-width:56px;">${UI.meter(a.fatigue, a.fatigue > 70 ? 'red' : a.fatigue > 45 ? 'yellow' : 'green')}</div></td>
                <td class="num"><strong>${ready}</strong></td>
                <td><div style="min-width:50px;">${UI.meter(a.morale, a.morale < 40 ? 'red' : a.morale < 65 ? 'yellow' : 'green')}</div></td>
                <td>${a.injury
                  ? `<span style="color:var(--danger);">${Utils.escapeHtml(a.injury.type)} (${a.injury.weeksRemaining}w)</span>`
                  : '<span style="color:var(--success);">Healthy</span>'}</td>
                <td>
                  <select data-load="${a.id}" class="search-input" style="min-width:98px; padding:4px 8px; font-size:12.5px;" ${a.injury ? 'disabled title="Injured — rehabbing automatically"' : ''}>
                    <option value="normal" ${override === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="reduced" ${override === 'reduced' ? 'selected' : ''}>Reduced</option>
                    <option value="rest" ${override === 'rest' ? 'selected' : ''}>Rest</option>
                  </select>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>

      <div class="card">
        <h2>Injury Report — Whole Program</h2>
        ${injured.length ? injured.map((a) => `
          <div class="attr-row" style="padding:6px 0;">
            <span><strong>${Utils.escapeHtml(a.fullName)}</strong> <span style="color:var(--text-dim);">(${a.gender === 'M' ? 'M' : 'W'} • ${a.classYear})</span></span>
            <span style="color:var(--danger);">${Utils.escapeHtml(a.injury.type)}</span>
            <span style="color:var(--text-dim);">${a.injury.weeksRemaining} of ${a.injury.totalWeeks} wk remaining</span>
          </div>`).join('') : '<div style="color:var(--text-dim);">No injuries. Keep managing those fatigue levels.</div>'}
      </div>`;

    // Plan preview: weekly load + development + quality verdict.
    const preview = () => {
      const meta = TE().planMetaFor(game.training[activeGender]);
      const toneColor = { good: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)' }[meta.quality.tone];
      const devAttrs = Object.entries(meta.attrWeights)
        .filter(([k]) => ATTR_LABELS[k])
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${ATTR_LABELS[k]} ${'▮'.repeat(Math.min(5, Math.ceil(v / 1.5)))}`)
        .join(' · ');
      container.querySelector('#plan-preview').innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:14px; align-items:center;">
          <strong style="color:${toneColor};">${meta.quality.label}</strong>
          <span>${meta.hardDays} quality day${meta.hardDays === 1 ? '' : 's'}${meta.hasLong ? ' + long run' : ''}</span>
          <span style="color:${meta.fatigue > 10 ? 'var(--danger)' : meta.fatigue > 4 ? 'var(--warning)' : 'var(--success)'};">
            ${meta.fatigue > 0 ? '+' : ''}${Math.round(meta.fatigue)} fatigue</span>
          <span>+${meta.fitness.toFixed(1)} fitness</span>
          <span>injury ×${meta.injuryMult.toFixed(2)}</span>
          <span>development ×${meta.devMult.toFixed(2)}</span>
        </div>
        <div style="color:var(--text-dim); margin-top:4px;">Develops: ${devAttrs || '—'}</div>`;
    };
    preview();

    // Day selects
    container.querySelectorAll('[data-day]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.day);
        game.training[activeGender][i] = sel.value;
        sel.classList.toggle('hard', !!D.WORKOUTS[sel.value].hard);
        sel.classList.toggle('easy', !D.WORKOUTS[sel.value].hard);
        const hint = container.querySelector(`#hint-${i}`);
        if (hint) hint.textContent = WORKOUT_HINTS[sel.value];
        preview();
      });
    });

    container.querySelector('#btn-confirm-plan').addEventListener('click', () => {
      game.weeklyFlow = game.weeklyFlow || { trainingConfirmed: false, recruitingDone: false };
      game.weeklyFlow.trainingConfirmed = true;
      UI.toast('Training plan locked in. Next: recruiting.', 'success');
      UI.navigate('recruiting');
    });

    container.querySelector('#btn-balanced').addEventListener('click', () => {
      game.training[activeGender] = TE().defaultPlan();
      render(container);
      UI.toast('Plan reset to a balanced training week.');
    });
    container.querySelector('#btn-copy-plan').addEventListener('click', () => {
      const other = activeGender === 'M' ? 'W' : 'M';
      game.training[other] = game.training[activeGender].slice();
      UI.toast(`Plan copied to the ${other === 'M' ? "men's" : "women's"} squad.`, 'success');
    });

    // Per-athlete load overrides
    container.querySelectorAll('[data-load]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const id = sel.dataset.load;
        if (sel.value === 'normal') delete game.training.overrides[id];
        else game.training.overrides[id] = sel.value;
        const a = game.getAthlete(id);
        UI.toast(`${a.lastName}: ${sel.value === 'normal' ? 'full training' : sel.value === 'reduced' ? 'reduced load' : 'resting this week'}.`);
      });
    });

    container.querySelectorAll('[data-ath]').forEach((el) => {
      el.addEventListener('click', () => UI.showPlayerCard(game.getAthlete(el.dataset.ath), game));
    });

    container.querySelector('#g-m').addEventListener('click', () => { activeGender = 'M'; render(container); });
    container.querySelector('#g-w').addEventListener('click', () => { activeGender = 'W'; render(container); });
  }

  UI.screens.training = { render };
})();
