/*
 * Training screen: weekly plan editor per squad, per-athlete load control,
 * fitness/fatigue/readiness monitoring, and the injury report.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const D = window.XCD.data;
  const TE = () => window.XCD.engine.Training;

  let activeGender = 'M';

  const WORKOUT_HINTS = {
    mileage: 'Aerobic base: endurance & stamina. Heavy legs.',
    intervals: 'VO2 max & speed. The hardest week on the body.',
    tempo: 'Threshold & economy — race-pace strength.',
    longRun: 'Endurance & toughness for championship distances.',
    hills: 'Hill strength and power. Watch the injury risk.',
    strength: 'Weight room: durability & injury prevention.',
    cross: 'Low-impact volume. Protects fragile runners.',
    easy: 'Recovery-pace mileage. Keeps sharpness, sheds fatigue.',
    recovery: 'A planned down week. Fatigue melts away.',
    rest: 'Full rest. Use before big races or for worn-out squads.'
  };

  function render(container) {
    const game = UI.state.game;
    const school = game.getPlayerSchool();
    const plan = game.training[activeGender];
    const roster = game.getRoster(school.id, activeGender)
      .sort((a, b) => b.currentOverall - a.currentOverall);

    const avgFatigue = Math.round(Utils.average(roster.map((a) => a.fatigue)));
    const avgFitness = Math.round(Utils.average(roster.map((a) => a.fitness)));
    const avgReadiness = Math.round(Utils.average(roster.map((a) => TE().readiness(a))));
    const injured = game.getRoster(school.id, 'M').concat(game.getRoster(school.id, 'W'))
      .filter((a) => a.injury);

    const workoutOptions = (selected) => Object.entries(D.WORKOUTS)
      .map(([k, w]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${w.label}</option>`).join('');

    container.innerHTML = `
      <div class="screen-header">
        <h1>Training</h1>
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
        <div class="stat-tile"><div class="label">Injured (Team)</div><div class="value">${injured.length}</div><div class="sub">${game.seasonPhase}</div></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h2>Weekly Plan — ${activeGender === 'M' ? "Men's" : "Women's"} Squad</h2>
        <div class="grid cols-3">
          <div class="field">
            <label>Primary Emphasis (65%)</label>
            <select id="plan-primary">${workoutOptions(plan.primary)}</select>
            <div style="font-size:12px; color:var(--text-dim); margin-top:5px;" id="hint-primary">${WORKOUT_HINTS[plan.primary]}</div>
          </div>
          <div class="field">
            <label>Secondary Emphasis (35%)</label>
            <select id="plan-secondary">${workoutOptions(plan.secondary)}</select>
            <div style="font-size:12px; color:var(--text-dim); margin-top:5px;" id="hint-secondary">${WORKOUT_HINTS[plan.secondary]}</div>
          </div>
          <div class="field">
            <label>Intensity</label>
            <select id="plan-intensity">
              ${D.INTENSITIES.map((i) => `<option value="${i.value}" ${i.value === plan.intensity ? 'selected' : ''}>${i.label}</option>`).join('')}
            </select>
            <div style="font-size:12px; color:var(--text-dim); margin-top:5px;">
              Higher intensity = faster development, more fatigue, more injuries.
            </div>
          </div>
        </div>
        <div id="plan-preview" style="font-size:13px; color:var(--text-dim);"></div>
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
                <td class="clickable" data-ath="${a.id}" style="cursor:pointer;"><strong>${Utils.escapeHtml(a.fullName)}</strong></td>
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

    // Plan controls
    const preview = () => {
      const p = game.training[activeGender];
      const meta = TE().planMetaFor(p);
      container.querySelector('#plan-preview').innerHTML = `
        Weekly load preview: <strong style="color:${meta.fatigue > 12 ? 'var(--danger)' : meta.fatigue > 6 ? 'var(--warning)' : 'var(--success)'};">
        ${meta.fatigue > 0 ? '+' : ''}${Math.round(meta.fatigue)} fatigue</strong> ·
        <strong>+${meta.fitness.toFixed(1)} fitness</strong> ·
        injury risk ×${meta.injuryMult.toFixed(2)} ·
        development ×${meta.devMult.toFixed(2)}`;
    };
    preview();

    container.querySelector('#plan-primary').addEventListener('change', (e) => {
      plan.primary = e.target.value;
      container.querySelector('#hint-primary').textContent = WORKOUT_HINTS[plan.primary];
      preview();
      UI.toast(`Primary emphasis set to ${D.WORKOUTS[plan.primary].label}.`);
    });
    container.querySelector('#plan-secondary').addEventListener('change', (e) => {
      plan.secondary = e.target.value;
      container.querySelector('#hint-secondary').textContent = WORKOUT_HINTS[plan.secondary];
      preview();
      UI.toast(`Secondary emphasis set to ${D.WORKOUTS[plan.secondary].label}.`);
    });
    container.querySelector('#plan-intensity').addEventListener('change', (e) => {
      plan.intensity = Number(e.target.value);
      preview();
      UI.toast(`Intensity set to ${D.INTENSITIES.find((i) => i.value === plan.intensity).label}.`);
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
