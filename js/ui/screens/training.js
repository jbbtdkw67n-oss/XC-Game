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
    tempo: 'Threshold running — builds Lactate Threshold and Base (the sharpening ceiling). Stacks well: up to 3 a week.',
    double: 'Double Threshold: two threshold sessions in a day — roughly twice a tempo\'s benefit at interval-level fatigue. Excellent for advanced runners; stacking multiple in a week spikes injury risk.',
    hills: 'Hill repeats: VO₂ Max, Speed, Economy + hill toughness. High injury risk.',
    intervals: 'Track work: VO₂ Max and some Speed. The hardest day — sharpens fast, but builds little Base and goes stale if held for weeks.',
    speed: 'Sprint mechanics: Speed and Running Economy.',
    racesim: 'Full championship rehearsal: the biggest sharpness boost in the game and a confidence builder for fit runners — at heavy fatigue and injury cost. One per week, placed late in the season.'
  };

  // Form trade-off pips for a workout (Update 25): Base / Sharp / Stale.
  function formPips(key) {
    const w = D.WORKOUTS[key];
    if (!w || (!w.base && !w.sharp)) return '';
    const pips = (v, scale) => { const n = Math.max(0, Math.min(3, Math.round(v / scale))); return '▮'.repeat(n) + '▯'.repeat(3 - n); };
    return ` · Base ${pips(w.base, 0.42)} · Sharp ${pips(w.sharp, 0.8)} · Stale ${pips(w.stale, 0.33)}${w.stack ? ` · max ${w.stack}/wk` : ''}`;
  }
  const hintFor = (key) => WORKOUT_HINTS[key] + formPips(key);

  // What the player's squad races in a given week.
  function weekMeetLabel(game, w) {
    const CAL = D.CALENDAR;
    if (w === CAL.CONFERENCE_WEEK) return 'Conference Championship';
    if (w === CAL.REGIONAL_WEEK) return 'Regional Championship';
    if (w === CAL.NATIONAL_WEEK) return 'NCAA Championship';
    const s = game.season;
    const m = s && s.playerMeetByWeek[w] && s.meets[s.playerMeetByWeek[w]];
    return m ? m.name : 'no meet';
  }

  // Squad Form card (Update 25, Stage 3): Base, Sharpening vs its ceiling,
  // Staleness, the season's one peak, and a form-by-week chart.
  function squadFormHtml(game, school, gender) {
    const f = TE().squadForm(game, school, gender);
    if (!f) return '';
    const CAL = D.CALENDAR;
    const wk = game.week;
    const next = wk + 1;
    const pct = (v) => Math.max(0, Math.min(100, v));
    const sharpBar = `<div class="form-bar"><div class="form-fill" style="width:${pct(f.sharp)}%;"></div>
      <div class="form-ceiling" style="left:${pct(f.ceiling)}%;" title="Ceiling set by Base: ${Math.round(f.ceiling)}"></div></div>`;
    const staleWord = f.stale >= 20 ? 'High' : f.stale >= 9 ? 'Building' : 'Low';
    let taper;
    if (wk > CAL.NATIONAL_WEEK) taper = '🔋 The season is over — a fresh peak comes with next season.';
    else if (f.peaking) taper = `⚡ <strong>PEAKING</strong> — this week's race (${Utils.escapeHtml(weekMeetLabel(game, wk))}) gets the full peak. It fades fast after.`;
    else if (f.peakUsed) taper = `🪫 Peak spent this season${f.peakWeek ? ` (landed Week ${f.peakWeek})` : ''}. Another taper only sheds fatigue.`;
    else if (f.charge >= 0.99) taper = `🔋 <strong>Charged.</strong> To peak for <strong>Week ${next} — ${Utils.escapeHtml(weekMeetLabel(game, next))}</strong>, run the <em>Championship taper</em> miles THIS week with one quality session. One peak per season.`;
    else taper = `🔋 Charging ${Math.round(f.charge * 100)}% — a few more weeks of normal training before a full peak.`;
    let verdict;
    if (f.stale >= 20) verdict = 'Going stale — too much sharp work for too long. Back off intervals for a week or two.';
    else if (f.sharp >= f.ceiling - 3 && f.base < 65) verdict = 'Sharp, but the base is thin — this is about as good as it gets this season.';
    else if (f.sharp >= f.ceiling - 3) verdict = 'At the ceiling — more sharp work only adds staleness. Build Base or save it for the taper.';
    else if (f.base >= 70 && f.sharp < f.ceiling - 12) verdict = 'Big base, room to sharpen — intervals and racing will pay off now.';
    else verdict = 'Building — threshold work raises the ceiling, intervals sharpen into it.';
    // The absorption bank (user request): when there's real work waiting and
    // the squad is tired, a Down Week cashes it in without touching the peak.
    if (f.absorb >= 2 && f.fatigue >= 50 && wk <= CAL.NATIONAL_WEEK) verdict += ` ${f.absorb.toFixed(1)} training points are waiting to be absorbed — a 🛌 Down Week sheds fatigue and lands about half of them, without spending your peak.`;

    // Form-by-week chart (this season).
    const log = (school.formLog && school.formLog.year === game.year && school.formLog[gender]) || [];
    const W = 300, H = 74, maxW = CAL.NATIONAL_WEEK;
    const x = (w) => 8 + (w - 1) / (maxW - 1) * (W - 16);
    const y = (v) => H - 8 - (Math.max(30, Math.min(105, v)) - 30) / 75 * (H - 16); // 30-105 band shows the swings
    const line = (key) => log.map((r, i) => `${i ? 'L' : 'M'}${x(r.w).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');
    const marks = [[CAL.CONFERENCE_WEEK, 'C'], [CAL.REGIONAL_WEEK, 'R'], [CAL.NATIONAL_WEEK, 'N']]
      .map(([w, l]) => `<line x1="${x(w)}" x2="${x(w)}" y1="6" y2="${H - 6}" class="form-mark"/><text x="${x(w)}" y="${H}" class="form-mark-t">${l}</text>`).join('');
    const peaks = log.filter((r) => r.peak >= 4).map((r) => `<text x="${x(r.w)}" y="${y(r.form) - 4}" class="form-peak">⚡</text>`).join('');
    const chart = log.length >= 2 ? `
      <svg viewBox="0 0 ${W} ${H}" class="form-chart" role="img" aria-label="Squad form by week">
        ${marks}
        <path d="${line('base')}" class="form-line-base"/>
        <path d="${line('form')}" class="form-line-form"/>
        ${peaks}
      </svg>
      <div class="form-legend"><span class="lg-form">━ Race form</span> <span class="lg-base">━ Base</span> · C/R/N = Conference, Regional, Nationals</div>`
      : '<div style="color:var(--text-faint); font-size:12px;">The form chart fills in as the season goes.</div>';

    return `
      <div class="card squad-form" style="margin-bottom:16px;">
        <h2 style="margin:0 0 8px;">Squad Form — ${gender === 'M' ? "Men's" : "Women's"} Top 7</h2>
        <div class="form-grid">
          <div class="form-rows">
            <div class="form-row"><span class="k" title="Built by volume, threshold, and long runs. Slow to build, slow to fade. Sets the sharpening ceiling.">Base</span>${UI.meter(f.base)}<strong>${Math.round(f.base)}</strong></div>
            <div class="form-row"><span class="k" title="Race readiness from intervals, speed, race sims, and racing. Fast to build, fast to fade. Capped by Base.">Sharpening</span>${sharpBar}<strong>${Math.round(f.sharp)}<small> / ${Math.round(f.ceiling)}</small></strong></div>
            <div class="form-row"><span class="k" title="Sharp work held too long goes flat. Easy and recovery weeks clear it.">Staleness</span>${UI.meter(f.stale * 2.5, f.stale >= 20 ? 'red' : f.stale >= 9 ? 'yellow' : 'green')}<strong>${staleWord}</strong></div>
            <div class="form-row"><span class="k" title="Training waiting to be absorbed: above ~45 fatigue part of each week's gains is banked, and it lands as fatigue comes down — a little in a normal week, half in a recovery or Down Week. Left too long, it fades.">Absorbing</span>${UI.meter(Math.min(100, f.absorb * 25), f.absorb >= 2 ? 'yellow' : 'green')}<strong>${f.absorb.toFixed(1)}<small> pts</small></strong></div>
            <div class="form-taper">${taper}</div>
            <div class="form-verdict">${verdict}</div>
          </div>
          <div class="form-chart-wrap">${chart}</div>
        </div>
      </div>`;
  }

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
      <div class="screen-header">${UI.screenTitle('Training', 'Set by the head coach')}</div>
      <div class="card" style="border-left:3px solid var(--accent);">
        <h3>📋 Head Coach Controls Training</h3>
        <p style="color:var(--text-dim);">You are the <strong>recruiting coordinator</strong> at ${Utils.escapeHtml(school.name)}. Weekly training, workouts, mileage, race scheduling, and race strategy are set by head coach
        <strong>${head ? Utils.escapeHtml(head.fullName) : 'the staff'}</strong>${philo.label ? ` (${philo.icon || ''} ${Utils.escapeHtml(philo.label)} philosophy)` : ''}.
        Your job is to build the best recruiting classes in the country — do that well and you'll earn head-coaching offers of your own.</p>
        ${philo.label ? UI.philosophyTradeoffs(philo, { compact: true }) : ''}
      </div>
      <div class="grid cols-4" style="margin-top:14px;">
        <div class="stat-tile"><div class="label">Squad Base</div><div class="value">${avg((a) => a.fitness)}</div></div>
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
        ${UI.screenTitle('Training', `Weekly planner · Week ${game.week}`)}
        <div class="actions">
          <div class="pill-tabs">
            <button id="g-m" class="${activeGender === 'M' ? 'active' : ''}">Men</button>
            <button id="g-w" class="${activeGender === 'W' ? 'active' : ''}">Women</button>
          </div>
        </div>
      </div>

      ${UI.sectionLabel('Squad Status')}
      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Squad Base</div><div class="value">${avgFitness}</div>${UI.meter(avgFitness)}</div>
        <div class="stat-tile"><div class="label">Squad Fatigue</div><div class="value">${avgFatigue}</div>${UI.meter(avgFatigue, avgFatigue > 60 ? 'red' : avgFatigue > 40 ? 'yellow' : 'green')}</div>
        <div class="stat-tile"><div class="label">Race Readiness</div><div class="value">${avgReadiness}</div>${UI.meter(avgReadiness, 'green')}</div>
        <div class="stat-tile"><div class="label">Team Morale</div><div class="value">${school.teamMorale ?? '—'}</div><div class="sub">${(window.XCD.engine.Morale.label(school.teamMorale ?? 65)).text} · chem ${school.chemistry?.[activeGender] ?? '—'}</div></div>
      </div>

      ${squadFormHtml(game, school, activeGender)}

      ${UI.sectionLabel('Plan & Mileage')}
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <h2 style="margin:0;">This Week's Plan — ${activeGender === 'M' ? "Men's" : "Women's"} Squad</h2>
          <div style="display:flex; gap:8px;">
            <button class="btn small" id="btn-copy-plan">Copy to ${activeGender === 'M' ? 'Women' : 'Men'}</button>
            <button class="btn small" id="btn-balanced" title="Generate a smart default plan for the current periodization phase — you can still customize every day">Reset Ideal Training</button>
            <button class="btn small ${game.weeklyFlow?.trainingConfirmed ? '' : 'primary'}" id="btn-confirm-plan">
              ${game.weeklyFlow?.trainingConfirmed ? '✓ Plan Confirmed' : '✓ Confirm Weekly Plan'}
            </button>
          </div>
        </div>
        <div id="phase-banner" style="margin:8px 0 0; padding:8px 12px; background:var(--bg-tile, rgba(128,128,128,0.08)); border-radius:8px; font-size:13px; border-left:3px solid var(--warning);"></div>
        ${raceThisWeek ? `<div style="margin:8px 0 0; padding:8px 12px; background:var(--accent-soft); border-radius:8px; font-size:13px;">
          🏁 RACE WEEK — your runners race this week. This week's plan takes effect after the race, so a taper now peaks the squad for NEXT week.
        </div>` : ''}
        <div class="week-planner" id="week-planner">
          ${D.DAYS.map((day, i) => `
            <div class="day-slot">
              <div class="day-name">${day.slice(0, 3)}</div>
              <select data-day="${i}" class="day-select ${D.WORKOUTS[plan[i]].hard ? 'hard' : 'easy'}">${workoutOptions(plan[i])}</select>
              <div class="day-hint" id="hint-${i}">${hintFor(plan[i])}</div>
            </div>`).join('')}
        </div>
        <div id="plan-preview" style="font-size:13px; margin-top:10px;"></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <h2 style="margin:0;">Weekly Mileage — ${activeGender === 'M' ? "Men's" : "Women's"} Squad</h2>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${(() => {
              const dw = TE().downWeekStatus(game, activeGender);
              const tip = dw.active ? 'Down Week is ON for this week — click to cancel and restore everyone\'s mileage'
                : dw.available ? 'Shed fatigue WITHOUT tapering: every runner drops to ~75% of their recent load for one week (keep a quality session if you like), then their mileage comes back. Never spends your peak; lands banked training.'
                : `Available again in ${dw.weeksUntil} week${dw.weeksUntil === 1 ? '' : 's'} — down weeks work in a cycle, not back to back`;
              return `<button class="btn small ${dw.active ? 'primary' : ''}" id="preset-downweek" title="${tip}" ${dw.available ? '' : 'disabled'}>🛌 Down Week${dw.active ? ' ✓' : dw.available ? '' : ` (${dw.weeksUntil}w)`}</button>`;
            })()}
            <button class="btn small primary" id="preset-ideal" title="Set every runner to their own ideal mileage — the most their body can absorb right now, built up gradually (it never spends your peak; that's the Championship taper preset)">🎯 Ideal Mileage</button>
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

      ${UI.sectionLabel('Athletes')}
      <div class="card" style="margin-bottom:16px;">
        <h2>Squad Monitor</h2>
        ${UI.isMobile() ? `
        <div class="m-cards">
          ${roster.map((a) => {
            const override = game.training.overrides[a.id] || 'normal';
            const ready = TE().readiness(a);
            const progMiles = game.training.mileage[activeGender];
            const miOverride = game.training.mileageOverrides[a.id];
            const miles = miOverride !== undefined ? miOverride : progMiles;
            const safe = TE().safeMileage(a);
            const overVolume = miles > safe;
            const status = a.injury
              ? `<span style="color:var(--danger);">🩼 ${Utils.escapeHtml(a.injury.type)} (${a.injury.weeksRemaining}w)</span>`
              : a.health === 'Recovering'
                ? `<span style="color:var(--warning);">Recovering (${Math.max(1, a.recentInjuryWeeks || 1)}w)</span>`
                : '<span style="color:var(--success);">Healthy</span>';
            return `
            <div class="m-card">
              <div class="m-head clickable" data-ath="${a.id}">
                ${UI.avatar(a, { size: 40 })}
                <div class="m-title">${Utils.escapeHtml(a.fullName)}${a.isWalkOn ? ' <span style="color:var(--text-faint); font-size:10px;">WO</span>' : ''}${a.generational ? ' ⭐' : ''}
                  <div class="m-sub">${a.classYear} • Ready ${ready} • ${status}</div>
                </div>
                <div class="m-badge">${UI.ratingBadge(a.currentOverall)}
                  <div class="m-sub" style="color:${(a.seasonDev || 0) > 0 ? 'var(--success)' : 'var(--text-faint)'};">${(a.seasonDev || 0) > 0 ? '+' + a.seasonDev : 'Δ —'}</div>
                </div>
              </div>
              <div class="m-stats">
                <div class="m-stat"><div class="k">Base</div>${UI.meter(a.fitness)}</div>
                <div class="m-stat"><div class="k">Fatigue</div>${UI.meter(a.fatigue, a.fatigue > 70 ? 'red' : a.fatigue > 45 ? 'yellow' : 'green')}</div>
                <div class="m-stat"><div class="k">Morale</div>${UI.meter(a.morale, a.morale < 40 ? 'red' : a.morale < 65 ? 'yellow' : 'green')}</div>
              </div>
              <div class="m-actions" style="align-items:center;">
                <select data-load="${a.id}" class="search-input" style="flex:1; min-width:110px;" ${a.injury ? 'disabled title="Injured — rehabbing automatically"' : ''}>
                  <option value="normal" ${override === 'normal' ? 'selected' : ''}>Normal load</option>
                  <option value="reduced" ${override === 'reduced' ? 'selected' : ''}>Reduced load</option>
                  <option value="rest" ${override === 'rest' ? 'selected' : ''}>Rest</option>
                </select>
                <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-dim);">Mi/wk
                  <input type="number" inputmode="numeric" data-miles="${a.id}" min="${D.MILEAGE.MIN}" max="${D.MILEAGE.MAX}" value="${miles}"
                    class="search-input" style="width:74px; min-width:0; ${overVolume ? 'border-color:var(--danger); color:var(--danger);' : miOverride !== undefined ? 'border-color:var(--accent);' : ''}">
                </label>
              </div>
            </div>`;
          }).join('')}
        </div>` : `
        <div class="table-wrap"><table class="data squad-table">
          <thead><tr>
            <th class="col-grow">Name</th><th>Class</th><th class="num">OVR</th><th class="num" title="Overall gained this season">+Season</th>
            <th title="Base: built by volume and threshold work; sets the sharpening ceiling">Base</th><th>Fatigue</th><th class="num" title="Sharpening (⚡ = peaking, 🥱 = going stale)">Sharp</th><th class="num">Ready</th><th>Morale</th><th>Status</th><th>Load</th><th class="num">Mi/wk</th>
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
                <td class="clickable col-grow" data-ath="${a.id}" style="cursor:pointer;">${UI.avatar(a, { size: 22 })} <strong>${Utils.escapeHtml(a.fullName)}</strong>${a.isWalkOn ? ' <span style="color:var(--text-faint); font-size:10px;">WO</span>' : ''}${a.generational ? ' <span title="Generational Recruit">⭐</span>' : ''}</td>
                <td>${a.classYear}</td>
                <td class="num">${UI.ratingBadge(a.currentOverall)}</td>
                <td class="num" style="color:${(a.seasonDev || 0) > 0 ? 'var(--success)' : 'var(--text-faint)'};">${(a.seasonDev || 0) > 0 ? '+' + a.seasonDev : a.seasonDev || '—'}</td>
                <td class="meter-cell"><div style="min-width:52px;">${UI.meter(a.fitness)}</div></td>
                <td class="meter-cell"><div style="min-width:52px;">${UI.meter(a.fatigue, a.fatigue > 70 ? 'red' : a.fatigue > 45 ? 'yellow' : 'green')}</div></td>
                <td class="num" title="Ceiling ${TE().sharpCeiling(a)} · staleness ${Math.round(a.staleness || 0)}">${Math.round(a.sharpness ?? 55)}${a.peakBonus > 0 ? ' ⚡' : ''}${(a.staleness || 0) >= 20 ? ' 🥱' : ''}</td>
                <td class="num"><strong>${ready}</strong></td>
                <td class="meter-cell"><div style="min-width:46px;">${UI.meter(a.morale, a.morale < 40 ? 'red' : a.morale < 65 ? 'yellow' : 'green')}</div></td>
                <td>${a.injury
                  ? `<span style="color:var(--danger);">${Utils.escapeHtml(a.injury.type)} (${a.injury.weeksRemaining}w)</span>`
                  : a.health === 'Recovering'
                    ? `<span style="color:var(--warning);" title="Returning from injury — reduced training quality while rebuilding form">Recovering (${Math.max(1, a.recentInjuryWeeks || 1)}w)</span>`
                    : '<span style="color:var(--success);">Healthy</span>'}</td>
                <td>
                  <select data-load="${a.id}" class="search-input" style="min-width:84px; padding:4px 8px; font-size:12.5px;" ${a.injury ? 'disabled title="Injured — rehabbing automatically"' : ''}>
                    <option value="normal" ${override === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="reduced" ${override === 'reduced' ? 'selected' : ''}>Reduced</option>
                    <option value="rest" ${override === 'rest' ? 'selected' : ''}>Rest</option>
                  </select>
                </td>
                <td class="num">
                  <input type="number" data-miles="${a.id}" min="${D.MILEAGE.MIN}" max="${D.MILEAGE.MAX}" value="${miles}"
                    class="search-input" style="width:58px; padding:4px 6px; font-size:12.5px; text-align:right; ${overVolume ? 'border-color:var(--danger); color:var(--danger);' : miOverride !== undefined ? 'border-color:var(--accent);' : ''}"
                    title="${overVolume ? `Above what this body can absorb (~${safe} mi) — injury risk climbing fast` : `This runner safely handles ~${safe} mi/wk${miOverride !== undefined ? ' (individual override)' : ''}`}">
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`}
      </div>

      <div class="card">
        <h2>Injury Report — Whole Program</h2>
        ${injured.length ? injured.map((a) => `
          <div class="attr-row" style="padding:6px 0;">
            <span>${UI.personName(game, 'ath', a.id, a.fullName, { person: a, link: false })} <span style="color:var(--text-dim);">(${a.gender === 'M' ? 'M' : 'W'} • ${a.classYear})</span></span>
            <span style="color:var(--danger);">${Utils.escapeHtml(a.injury.type)}${TE().injuryDeficitOverall(a) >= 1 ? ` · −${Math.round(TE().injuryDeficitOverall(a))} OVR so far` : ''}</span>
            <span style="color:var(--text-dim);">${a.injury.weeksRemaining} of ${a.injury.totalWeeks} wk remaining</span>
          </div>`).join('') : '<div style="color:var(--text-dim);">No injuries. Keep managing those fatigue levels.</div>'}
        ${recovering.length ? `
          <h3 style="margin-top:12px;">Returning to Form</h3>
          ${recovering.map((a) => `
          <div class="attr-row" style="padding:6px 0;">
            <span>${UI.personName(game, 'ath', a.id, a.fullName, { person: a, link: false })} <span style="color:var(--text-dim);">(${a.gender === 'M' ? 'M' : 'W'} • ${a.classYear})</span></span>
            <span style="color:var(--warning);">Rebuilding fitness, sharpness & confidence${TE().injuryDeficitOverall(a) >= 1 ? ` · ${Math.round(TE().injuryDeficitOverall(a))} OVR to win back` : ''}</span>
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
        const planMeta = TE().planMetaFor(game.training[activeGender]);
        const dwOn = TE().downWeekStatus(game, activeGender).active;
        const realTaper = TE().isTaperWeek(miles, avgChronic, { ...planMeta, downWeek: dwOn });
        const sf = TE().squadForm(game, school, activeGender);
        const fragile = roster.filter((a) => !a.injury && miles > TE().safeMileage(a) &&
          game.training.mileageOverrides[a.id] === undefined).length;
        // Gendered volume bands (mileage rebalance): men typically absorb
        // 65-90 mpw, women 50-75 — the hint's thresholds shift accordingly.
        const women = activeGender === 'W';
        const heavyAt = women ? 85 : 95;
        const strongAt = women ? 66 : 78;
        const lowAt = women ? 44 : 50;
        let msg;
        if (dwOn) msg = `🛌 <strong>DOWN WEEK</strong>: each runner at ~75% of their recent load${planMeta.qualityDays >= 1 ? ', quality session kept' : ''} — extra fatigue and staleness shed, banked training lands, and your peak is saved. Everyone's own mileage comes back next week.`;
        else if (realTaper && game.week <= D.CALENDAR.NATIONAL_WEEK && sf && !sf.peakUsed) msg = `⚡ TAPER: ${miles} mi vs ~${avgChronic} mi recent load, with a quality session — this SPENDS your one peak of the season. Your squad peaks for <strong>Week ${game.week + 1} — ${Utils.escapeHtml(weekMeetLabel(game, game.week + 1))}</strong>, keeps a third of it the week after, then it's gone.`;
        else if (realTaper && sf && sf.peakUsed) msg = `📉 Taper miles: ${miles} mi vs ~${avgChronic} mi — your peak is already spent this season, so this only sheds fatigue (and Base fades).`;
        else if (taper && planMeta.qualityDays < 1) msg = `🛌 Recovery week: ${miles} mi with no quality session — fatigue sheds and your peak is saved for later.`;
        else if (taper) msg = `📉 Lighter week: ${miles} mi vs ~${avgChronic} mi recent load — fatigue sheds. (A real taper is about a 30% cut — the Championship taper preset.)`;
        else if (miles >= heavyAt) msg = `🔥 Heavy volume: maximum aerobic development, but fatigue and injury risk climb — only ${women ? 'exceptionally durable women survive weeks this big (the ceiling sits below the men\'s)' : `durable athletes survive ${miles} miles`}.`;
        else if (miles >= strongAt) msg = `Strong aerobic block: real Stamina/Threshold gains at a manageable cost.`;
        else if (miles <= lowAt) msg = `⚡ Low volume: fresh and sharp with better speed work — but endurance and long-term fitness will stagnate.`;
        else msg = `Moderate volume: balanced development and recovery.`;
        if (fragile > 0) msg += ` <span style="color:var(--danger);">⚠ ${fragile} runner${fragile > 1 ? 's' : ''} above their durable limit.</span>`;
        // Load spikes (Update 25): a jump well above a runner's recent load
        // raises injury risk — miles or quality work.
        const meta = TE().planMetaFor(game.training[activeGender]);
        const spiking = roster.filter((a) => {
          if (a.injury) return false;
          const m = game.training.mileageOverrides[a.id] ?? miles;
          return TE().loadSpike(m, a.chronicMileage, meta.intensity, a.chronicIntensity).mult > 1.05;
        }).length;
        if (spiking > 0) msg += ` <span style="color:var(--warning);">⚠ Load spike for ${spiking} runner${spiking > 1 ? 's' : ''}: this week jumps well above their recent miles or quality work — higher injury risk. Build up gradually (Ideal Mileage ramps for you).</span>`;
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
        if (p.filter === 'freshmen' && !isFrosh) return;
        let v;
        if (p.absolute !== undefined) v = p.absolute;
        else if (p.scale !== undefined) v = Math.round(prog * p.scale);
        else {
          // Delta presets (+10 / −10, freshmen) nudge each runner from their
          // CURRENT effective load, so quick ±10 taps stack and individual
          // overrides are adjusted rather than wiped.
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
    const dwBtn = container.querySelector('#preset-downweek');
    if (dwBtn) dwBtn.addEventListener('click', () => {
      const on = !TE().downWeekStatus(game, activeGender).active;
      const res = TE().setDownWeek(game, activeGender, on);
      if (!res.ok) UI.toast(res.reason, 'error');
      else UI.toast(on ? `🛌 Down Week: ${res.runners} runner${res.runners === 1 ? '' : 's'} cut to ~75% of their recent load — fatigue sheds, the peak is saved.` : 'Down Week cancelled — mileage restored.', 'success');
      render(container);
    });
    container.querySelector('#preset-ideal').addEventListener('click', () => {
      const n = TE().applyIdealMileage(game, activeGender);
      UI.toast(`🎯 Ideal mileage set for ${n} runner${n === 1 ? '' : 's'} — each at the most their body can absorb right now.`, 'success');
      render(container);
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
        if (hint) hint.textContent = hintFor(sel.value);
        refreshPhaseBanner();
        preview();
      });
    });

    container.querySelector('#btn-confirm-plan').addEventListener('click', () => {
      // Order-independent with Done Recruiting: if recruiting is already
      // wrapped, confirming training completes the week — no bouncing back.
      game.weeklyFlow = game.weeklyFlow || { trainingConfirmed: false, recruitingDone: false };
      game.weeklyFlow.trainingConfirmed = true;
      if (game.weeklyFlow.recruitingDone) {
        UI.toast('Training plan locked in. Ready to advance the week.', 'success');
        UI.renderShell();
        return;
      }
      UI.toast('Training plan locked in. Next: recruiting.', 'success');
      UI.navigate('recruiting');
    });

    container.querySelector('#btn-balanced').addEventListener('click', () => {
      game.training[activeGender] = TE().idealPlanForPhase(game);
      render(container);
      const phase = D.trainingPhaseForWeek(game.week);
      UI.toast(`Ideal training generated for the ${phase.label}. Customize any day you like.`);
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
