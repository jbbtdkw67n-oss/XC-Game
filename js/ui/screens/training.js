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
    rest: 'Complete rest. Sheds fatigue, cuts injury risk, sharpens the legs — but too many rest days stall development.',
    easy: 'Genuinely easy running. Sheds fatigue, keeps the aerobic system ticking — the recovery currency of every good week.',
    long: 'The weekly cornerstone: big stamina, some VO₂ Max.',
    tempo: 'Threshold running — builds Lactate Threshold.',
    hills: 'Hill repeats: VO₂ Max, Speed, Economy + hill toughness. High injury risk.',
    intervals: 'Track work: VO₂ Max and some Speed. The hardest day.',
    speed: 'Sprint mechanics: Speed and Running Economy.',
    racesim: 'Full championship rehearsal: the biggest sharpness boost in the game and a confidence builder for fit runners — at heavy fatigue and injury cost. One per week, placed late in the season.'
  };

  const ATTR_LABELS = {
    vo2Max: 'VO₂ Max', runningEconomy: 'Economy', stamina: 'Stamina',
    lactateThreshold: 'Lact. Threshold', speed: 'Speed'
  };

  // Read-only training overview shown to a player who is an assistant coach:
  // the head coach owns the plan; the assistant just runs recruiting.
  function renderAssistantView(container, game, school) {
    const head = game.getCoach(school.coachId);
    const philo = head ? (D.trainingPhilosophy(head.trainingPhilosophy) || {}) : {};
    const bothRosters = game.getRoster(school.id, 'M').concat(game.getRoster(school.id, 'W'));
    const avg = (fn) => bothRosters.length ? Math.round(Utils.average(bothRosters.map(fn))) : 0;
    const injured = bothRosters.filter((a) => a.injury);
    container.innerHTML = `
      <div class="screen-header"><h1>Training</h1></div>
      <div class="card" style="border-left:3px solid var(--accent);">
        <h3>📋 Head Coach Controls Training</h3>
        <p style="color:var(--text-dim);">You are the <strong>recruiting coordinator</strong> at ${Utils.escapeHtml(school.name)}. Weekly training, workouts, mileage, race scheduling, and race strategy are set by head coach
        <strong>${head ? Utils.escapeHtml(head.fullName) : 'the staff'}</strong>${philo.label ? ` (${philo.icon || ''} ${Utils.escapeHtml(philo.label)} philosophy)` : ''}.
        Your job is to build the best recruiting classes in the country — do that well and you'll earn head-coaching offers of your own.</p>
      </div>
      <div class="grid cols-4" style="margin-top:14px;">
        <div class="stat-tile"><div class="label">Squad Fitness</div><div class="value">${avg((a) => a.fitness)}</div></div>
        <div class="stat-tile"><div class="label">Squad Fatigue</div><div class="value">${avg((a) => a.fatigue)}</div></div>
        <div class="stat-tile"><div class="label">Readiness</div><div class="value">${avg((a) => TE().readiness(a))}</div></div>
        <div class="stat-tile"><div class="label">Injured</div><div class="value">${injured.length}</div></div>
      </div>
      <p style="color:var(--text-faint); margin-top:14px;">Head to <strong>🎯 Recruiting</strong> to work your board — that's where you make your name.</p>`;
  }

  function render(container) {
    const game = UI.state.game;
    const school = game.getPlayerSchool();

    // Assistant coaches don't design training — the head coach does. Show a
    // read-only overview of the program's state instead of the plan editor.
    if (game.isAssistant && game.isAssistant()) {
      renderAssistantView(container, game, school);
      return;
    }

    const plan = TE().normalizePlan(game.training[activeGender]);
    game.training[activeGender] = plan;
    const roster = game.getRoster(school.id, activeGender)
      .sort((a, b) => b.currentOverall - a.currentOverall);

    const avgFatigue = Math.round(Utils.average(roster.map((a) => a.fatigue)));
    const avgFitness = Math.round(Utils.average(roster.map((a) => a.fitness)));
    const avgReadiness = Math.round(Utils.average(roster.map((a) => TE().readiness(a))));
    const wholeProgram = game.getRoster(school.id, 'M').concat(game.getRoster(school.id, 'W'));
    const injured = wholeProgram.filter((a) => a.injury);
    const recovering = wholeProgram.filter((a) => !a.injury && a.health === 'Recovering');

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
        <div class="stat-tile"><div class="label">Team Morale</div><div class="value">${school.teamMorale ?? '—'}</div><div class="sub">${(window.XCD.engine.Morale.label(school.teamMorale ?? 65)).text} · chem ${school.chemistry?.[activeGender] ?? '—'}</div></div>
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
        <div id="phase-banner" style="margin:8px 0 0; padding:8px 12px; background:var(--bg-tile, rgba(128,128,128,0.08)); border-radius:8px; font-size:13px; border-left:3px solid var(--warning);"></div>
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
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <h2 style="margin:0;">Weekly Mileage — ${activeGender === 'M' ? "Men's" : "Women's"} Squad</h2>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn small" id="preset-all" title="Clear every individual override — the whole squad runs the program mileage">Quick Set All</button>
            ${D.MILEAGE.PRESETS.map((p) => `
              <button class="btn small" data-preset="${p.key}" title="${p.desc}">${p.label}</button>`).join('')}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:14px; margin:12px 0 4px; flex-wrap:wrap;">
          <span style="font-size:13px; color:var(--text-dim); min-width:130px;">Program mileage</span>
          <input type="range" id="prog-mileage" min="${D.MILEAGE.MIN}" max="${D.MILEAGE.MAX}" step="1"
            value="${game.training.mileage[activeGender]}" style="flex:1; min-width:180px;">
          <strong id="prog-mileage-val" style="min-width:88px;">${game.training.mileage[activeGender]} mi/wk</strong>
        </div>
        <div id="mileage-hint" style="font-size:12.5px; color:var(--text-dim);"></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h2>Squad Monitor</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th>Name</th><th>Class</th><th class="num">OVR</th><th class="num">Δ Season</th>
            <th>Fitness</th><th>Fatigue</th><th class="num">Sharp</th><th class="num">Ready</th><th>Morale</th><th>Status</th><th>Load</th><th class="num">Mi/wk</th>
          </tr></thead>
          <tbody>
            ${roster.map((a) => {
              const override = game.training.overrides[a.id] || 'normal';
              const ready = TE().readiness(a);
              const progMiles = game.training.mileage[activeGender];
              const miOverride = game.training.mileageOverrides[a.id];
              const miles = miOverride !== undefined ? miOverride : progMiles;
              const safe = TE().safeMileage(a);
              const overVolume = miles > safe;
              return `
              <tr>
                <td class="clickable" data-ath="${a.id}" style="cursor:pointer;"><strong>${Utils.escapeHtml(a.fullName)}</strong>${a.isWalkOn ? ' <span style="color:var(--text-faint); font-size:10px;">WO</span>' : ''}${a.generational ? ' <span title="Generational Recruit">⭐</span>' : ''}</td>
                <td>${a.classYear}</td>
                <td class="num">${UI.ratingBadge(a.currentOverall)}</td>
                <td class="num" style="color:${(a.seasonDev || 0) > 0 ? 'var(--success)' : 'var(--text-faint)'};">${(a.seasonDev || 0) > 0 ? '+' + a.seasonDev : a.seasonDev || '—'}</td>
                <td><div style="min-width:52px;">${UI.meter(a.fitness)}</div></td>
                <td><div style="min-width:52px;">${UI.meter(a.fatigue, a.fatigue > 70 ? 'red' : a.fatigue > 45 ? 'yellow' : 'green')}</div></td>
                <td class="num">${Math.round(a.sharpness ?? 55)}</td>
                <td class="num"><strong>${ready}</strong></td>
                <td><div style="min-width:46px;">${UI.meter(a.morale, a.morale < 40 ? 'red' : a.morale < 65 ? 'yellow' : 'green')}</div></td>
                <td>${a.injury
                  ? `<span style="color:var(--danger);">${Utils.escapeHtml(a.injury.type)} (${a.injury.weeksRemaining}w)</span>`
                  : a.health === 'Recovering'
                    ? `<span style="color:var(--warning);" title="Returning from injury — reduced training quality while rebuilding form">Recovering (${Math.max(1, a.recentInjuryWeeks || 1)}w)</span>`
                    : '<span style="color:var(--success);">Healthy</span>'}</td>
                <td>
                  <select data-load="${a.id}" class="search-input" style="min-width:92px; padding:4px 8px; font-size:12.5px;" ${a.injury ? 'disabled title="Injured — rehabbing automatically"' : ''}>
                    <option value="normal" ${override === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="reduced" ${override === 'reduced' ? 'selected' : ''}>Reduced</option>
                    <option value="rest" ${override === 'rest' ? 'selected' : ''}>Rest</option>
                  </select>
                </td>
                <td class="num">
                  <input type="number" data-miles="${a.id}" min="${D.MILEAGE.MIN}" max="${D.MILEAGE.MAX}" value="${miles}"
                    class="search-input" style="width:64px; padding:4px 6px; font-size:12.5px; ${overVolume ? 'border-color:var(--danger); color:var(--danger);' : miOverride !== undefined ? 'border-color:var(--accent);' : ''}"
                    title="${overVolume ? `Above what this body can absorb (~${safe} mi) — injury risk climbing fast` : `This runner safely handles ~${safe} mi/wk${miOverride !== undefined ? ' (individual override)' : ''}`}">
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
        ${recovering.length ? `
          <h3 style="margin-top:12px;">Returning to Form</h3>
          ${recovering.map((a) => `
          <div class="attr-row" style="padding:6px 0;">
            <span><strong>${Utils.escapeHtml(a.fullName)}</strong> <span style="color:var(--text-dim);">(${a.gender === 'M' ? 'M' : 'W'} • ${a.classYear})</span></span>
            <span style="color:var(--warning);">Rebuilding fitness, sharpness & confidence</span>
            <span style="color:var(--text-dim);">~${Math.max(1, a.recentInjuryWeeks || 1)} wk to full strength</span>
          </div>`).join('')}` : ''}
      </div>`;

    // Plan preview: weekly load + development + quality verdict,
    // combined with the squad's program mileage (Part 6).
    const preview = () => {
      const meta = TE().planMetaFor(game.training[activeGender]);
      const miles = game.training.mileage[activeGender];
      const mMeta = TE().mileageMeta(miles);
      const toneColor = { good: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)' }[meta.quality.tone];
      const devAttrs = Object.entries(meta.attrWeights)
        .filter(([k]) => ATTR_LABELS[k])
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${ATTR_LABELS[k]} ${'▮'.repeat(Math.min(5, Math.ceil(v / 1.5)))}`)
        .join(' · ');
      const totalFatigue = meta.fatigue + mMeta.fatigueAdd;
      const injury = meta.injuryMult * mMeta.injuryMult;
      container.querySelector('#plan-preview').innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:14px; align-items:center;">
          <strong style="color:${toneColor};">${meta.quality.label}</strong>
          <span>${meta.hardDays} quality day${meta.hardDays === 1 ? '' : 's'}${meta.hasLong ? ' + long run' : ''}</span>
          <span style="color:${totalFatigue > 10 ? 'var(--danger)' : totalFatigue > 4 ? 'var(--warning)' : 'var(--success)'};">
            ${totalFatigue > 0 ? '+' : ''}${Math.round(totalFatigue)} fatigue</span>
          <span>+${(meta.fitness * mMeta.fitnessMult).toFixed(1)} fitness</span>
          <span>injury ×${injury.toFixed(2)}</span>
          <span>development ×${(meta.devMult * mMeta.devMult).toFixed(2)}</span>
        </div>
        <div style="color:var(--text-dim); margin-top:4px;">Develops: ${devAttrs || '—'}</div>`;

      // Mileage hint: what this volume does, and whether it's a taper.
      const hint = container.querySelector('#mileage-hint');
      if (hint) {
        const avgChronic = Math.round(Utils.average(roster.map((a) => a.chronicMileage || miles)));
        const taper = miles <= avgChronic - 15;
        const fragile = roster.filter((a) => !a.injury && miles > TE().safeMileage(a) &&
          game.training.mileageOverrides[a.id] === undefined).length;
        let msg;
        if (taper) msg = `📉 TAPER: ${miles} mi vs ~${avgChronic} mi chronic load — fatigue sheds, sharpness spikes. Time it for championships; hold it too long and fitness fades.`;
        else if (miles >= 95) msg = `🔥 Heavy volume: maximum aerobic development, but fatigue and injury risk climb — only durable athletes survive ${miles} miles.`;
        else if (miles >= 78) msg = `Strong aerobic block: real Stamina/Threshold gains at a manageable cost.`;
        else if (miles <= 50) msg = `⚡ Low volume: fresh and sharp with better speed work — but endurance and long-term fitness will stagnate.`;
        else msg = `Moderate volume: balanced development and recovery.`;
        if (fragile > 0) msg += ` <span style="color:var(--danger);">⚠ ${fragile} runner${fragile > 1 ? 's' : ''} above their durable limit.</span>`;
        hint.innerHTML = msg;
      }
    };
    preview();

    // Program mileage slider
    const slider = container.querySelector('#prog-mileage');
    slider.addEventListener('input', () => {
      game.training.mileage[activeGender] = Number(slider.value);
      container.querySelector('#prog-mileage-val').textContent = `${slider.value} mi/wk`;
      preview();
    });

    // Individual mileage overrides
    container.querySelectorAll('[data-miles]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const id = inp.dataset.miles;
        const v = Utils.clamp(Math.round(Number(inp.value) || D.MILEAGE.DEFAULT[activeGender]), D.MILEAGE.MIN, D.MILEAGE.MAX);
        inp.value = v;
        if (v === game.training.mileage[activeGender]) delete game.training.mileageOverrides[id];
        else game.training.mileageOverrides[id] = v;
        const a = game.getAthlete(id);
        UI.toast(`${a.lastName}: ${v} miles/week${v > TE().safeMileage(a) ? ' — above their durable limit!' : ''}`,
          v > TE().safeMileage(a) ? 'error' : 'info');
        preview();
      });
    });

    // Presets
    const applyPreset = (p) => {
      const prog = game.training.mileage[activeGender];
      let touched = 0;
      roster.forEach((a) => {
        const isFrosh = a.classYear === 'Freshman';
        const isRS = a.redshirt === 'True' || a.redshirt === 'Medical';
        if (p.filter === 'freshmen' && !isFrosh) return;
        if (p.filter === 'redshirts' && !isRS) return;
        let v;
        if (p.absolute !== undefined) v = p.absolute;
        else if (p.scale !== undefined) v = Math.round(prog * p.scale);
        else {
          // Delta presets (+10 / −10, freshmen, redshirt) nudge each runner
          // from their CURRENT effective load, so quick ±10 taps stack and
          // individual overrides are adjusted rather than wiped.
          const current = game.training.mileageOverrides[a.id] !== undefined
            ? game.training.mileageOverrides[a.id]
            : prog;
          v = current + (p.delta || 0);
        }
        v = Utils.clamp(v, D.MILEAGE.MIN, D.MILEAGE.MAX);
        if (v === prog) delete game.training.mileageOverrides[a.id];
        else game.training.mileageOverrides[a.id] = v;
        touched++;
      });
      UI.toast(`${p.label}: applied to ${touched} runner${touched === 1 ? '' : 's'}.`, 'success');
      render(container);
    };
    container.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyPreset(D.MILEAGE.PRESETS.find((p) => p.key === btn.dataset.preset));
      });
    });
    container.querySelector('#preset-all').addEventListener('click', () => {
      roster.forEach((a) => delete game.training.mileageOverrides[a.id]);
      UI.toast('All individual mileage overrides cleared — squad runs the program volume.', 'success');
      render(container);
    });

    // Periodization banner (Update 6, Section 4): the current phase and
    // whether the plan fits it — refreshed live as days change.
    const refreshPhaseBanner = () => {
      const el = container.querySelector('#phase-banner');
      if (!el) return;
      const phase = D.trainingPhaseForWeek(game.week);
      const meta = TE().planMetaFor(game.training[activeGender]);
      const fit = !!(phase.fit && phase.fit(meta));
      el.style.borderLeftColor = fit ? 'var(--success)' : 'var(--warning)';
      el.innerHTML = `${phase.icon} <strong>${phase.label}</strong> — ${phase.ideal}
        <span style="color:${fit ? 'var(--success)' : 'var(--warning)'}; font-weight:600;">${fit ? '✓ Plan fits the phase (+dev)' : '✗ Plan fights the phase'}</span>`;
    };
    refreshPhaseBanner();

    // Day selects
    container.querySelectorAll('[data-day]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.day);
        game.training[activeGender][i] = sel.value;
        sel.classList.toggle('hard', !!D.WORKOUTS[sel.value].hard);
        sel.classList.toggle('easy', !D.WORKOUTS[sel.value].hard);
        const hint = container.querySelector(`#hint-${i}`);
        if (hint) hint.textContent = WORKOUT_HINTS[sel.value];
        refreshPhaseBanner();
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
