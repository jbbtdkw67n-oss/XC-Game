/*
 * Coach Creation Wizard (Update 6, Section 2).
 *
 * A guided, multi-step creation flow — used both when starting a brand-new
 * dynasty from the main menu and when a retired coach's successor is created
 * inside a living dynasty (Legacy Dynasty Mode, Section 1).
 *
 *   Step 1  Identity      — name, age, hometown, alma mater, starting position
 *   Step 2  Appearance    — portrait with live preview + randomize
 *   Step 3  Archetype     — the coach's defining strength
 *   Step 4  Training philosophy (permanent; strengths & weaknesses shown)
 *   Step 5  Race philosophy
 *   Step 6  Career summary — everything on one confirmation screen
 *
 * UI.coachWizard(root, opts, onComplete, onCancel)
 *   opts.mode     'new' (main menu) | 'succession' (retirement flow)
 *   opts.world    generated world (for alma-mater suggestions)
 *   opts.initial  prefilled spec (back-navigation from school select)
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  const STEPS = ['Identity', 'Appearance', 'Archetype', 'Training', 'Racing', 'Summary'];

  UI.coachWizard = function (root, opts, onComplete, onCancel) {
    const D = window.XCD.data;
    const mode = opts.mode || 'new';
    const world = opts.world || null;

    // The working spec — everything the wizard collects.
    const spec = Object.assign({
      first: 'Alex', last: 'Carter', dynName: '',
      age: 34, hometown: '', almaMater: '',
      startRole: 'Head',
      gender: 'M',
      portrait: D.COACH_PORTRAITS[0],
      // The human avatar (Update 12): built slider-by-slider on the
      // Appearance step and worn on every profile for the whole career.
      // `polo` (Update 13) is the coaching polo color the coach wears.
      appearance: { gender: 'M', skin: 2, hair: 5, hairStyle: 2, beard: 0, polo: 1 },
      archetype: null,
      trainingPhilosophy: 'balanced',
      racePhilosophy: 'even'
    }, opts.initial || {});
    if (!spec.appearance || spec.appearance.skin === undefined) {
      spec.appearance = { gender: spec.gender || 'M', skin: 2, hair: 5, hairStyle: 2, beard: 0, polo: 1 };
    }
    if (spec.appearance.polo === undefined) spec.appearance.polo = 1;

    let step = 0;

    const schoolNames = world
      ? Object.values(world.schools).map((s) => s.name)
      : [];
    const stateKeys = Object.keys(D.STATE_NAMES || {});
    const randomHometown = () => {
      const st = stateKeys[Math.floor(Math.random() * stateKeys.length)] || 'OR';
      const towns = (D.REAL_TOWNS && D.REAL_TOWNS[st]) || ['Portland'];
      return `${towns[Math.floor(Math.random() * towns.length)]}, ${st}`;
    };
    const randomAlma = () => schoolNames.length
      ? schoolNames[Math.floor(Math.random() * schoolNames.length)]
      : '';

    function stepDots() {
      return `<div class="wizard-steps">
        ${STEPS.map((s, i) => `
          <span class="wizard-step ${i === step ? 'active' : i < step ? 'done' : ''}">${i < step ? '✓' : i + 1}<em>${s}</em></span>`).join('')}
      </div>`;
    }

    function frame(title, tagline, bodyHtml, { nextLabel = 'Next →', nextDisabled = false } = {}) {
      return `
        <div id="menu-root">
          <div class="menu-panel" style="width:min(680px,94vw);">
            <h1 style="font-size:22px;">${title}</h1>
            <p class="tagline">${tagline}</p>
            ${stepDots()}
            ${bodyHtml}
            <div style="display:flex; gap:10px; margin-top:16px;">
              <button class="btn" id="btn-back">← Back</button>
              <button class="btn primary" id="btn-next" style="flex:1;" ${nextDisabled ? 'disabled' : ''}>${nextLabel}</button>
            </div>
          </div>
        </div>`;
    }

    function wireNav(collect) {
      root.querySelector('#btn-back').addEventListener('click', () => {
        if (collect) collect();
        if (step === 0) { if (onCancel) onCancel(); return; }
        step -= 1;
        render();
      });
      root.querySelector('#btn-next').addEventListener('click', () => {
        if (collect) collect();
        if (step === STEPS.length - 1) { onComplete(spec); return; }
        step += 1;
        render();
      });
    }

    /* ---------------- Step 1: Identity ---------------- */
    function renderIdentity() {
      const succession = mode === 'succession';
      root.innerHTML = frame(
        succession ? 'A New <span>Era</span> Begins' : 'Create Your <span>Coach</span>',
        succession
          ? 'Your predecessor is in the record books. Who picks up the whistle next?'
          : 'Every dynasty starts with a coach. Who are you?',
        `
        <div class="grid cols-2">
          <div class="field"><label>First Name</label><input id="coach-first" value="${Utils.escapeHtml(spec.first)}" maxlength="20"></div>
          <div class="field"><label>Last Name</label><input id="coach-last" value="${Utils.escapeHtml(spec.last)}" maxlength="20"></div>
        </div>
        ${succession ? '' : `<div class="field"><label>Dynasty Name</label><input id="dyn-name" value="${Utils.escapeHtml(spec.dynName)}" placeholder="e.g. The Carter Era" maxlength="40"></div>`}
        <div class="grid cols-2">
          <div class="field">
            <label>Age <span style="color:var(--text-faint); font-weight:400;">— 26-60. Younger coaches have longer careers; older ones start with a touch more respect.</span></label>
            <input id="coach-age" type="number" min="26" max="60" value="${Utils.clamp(Math.round(spec.age || 34), 26, 60)}">
          </div>
          <div class="field">
            <label>Hometown <button type="button" class="btn" id="rand-town" style="padding:1px 8px; font-size:11px;">🎲</button></label>
            <input id="coach-town" value="${Utils.escapeHtml(spec.hometown)}" placeholder="e.g. Riverdale, OR" maxlength="40">
          </div>
        </div>
        <div class="field">
          <label>Alma Mater <button type="button" class="btn" id="rand-alma" style="padding:1px 8px; font-size:11px;">🎲</button> <span style="color:var(--text-faint); font-weight:400;">— where you ran (or studied)</span></label>
          <input id="coach-alma" value="${Utils.escapeHtml(spec.almaMater)}" placeholder="e.g. Willamette State" maxlength="48">
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Starting Position</label>
          <div class="archetype-grid" id="role-grid">
            <div class="archetype-card ${spec.startRole === 'Head' ? 'selected' : ''}" data-role="Head">
              <div class="arch-name">🎖 Head Coach</div>
              <div class="arch-desc">Full control: training, scheduling, race strategy, redshirts, and recruiting (manual or auto).</div>
            </div>
            <div class="archetype-card ${spec.startRole === 'Assistant' ? 'selected' : ''}" data-role="Assistant">
              <div class="arch-name">📋 Assistant Coach</div>
              <div class="arch-desc">Run recruiting only under an established head coach. Build a recruiting reputation to earn head-coach offers.</div>
            </div>
          </div>
        </div>`,
        { nextLabel: 'Next: Appearance →' }
      );

      root.querySelectorAll('[data-role]').forEach((el) => {
        el.addEventListener('click', () => {
          spec.startRole = el.dataset.role;
          root.querySelectorAll('[data-role]').forEach((n) => n.classList.toggle('selected', n.dataset.role === spec.startRole));
        });
      });
      root.querySelector('#rand-town').addEventListener('click', () => {
        root.querySelector('#coach-town').value = randomHometown();
      });
      root.querySelector('#rand-alma').addEventListener('click', () => {
        const v = randomAlma();
        if (v) root.querySelector('#coach-alma').value = v;
      });

      wireNav(() => {
        spec.first = root.querySelector('#coach-first').value.trim() || 'Alex';
        spec.last = root.querySelector('#coach-last').value.trim() || 'Carter';
        const dyn = root.querySelector('#dyn-name');
        if (dyn) spec.dynName = dyn.value.trim();
        spec.age = Utils.clamp(parseInt(root.querySelector('#coach-age').value, 10) || 34, 26, 60);
        spec.hometown = root.querySelector('#coach-town').value.trim();
        spec.almaMater = root.querySelector('#coach-alma').value.trim();
      });
    }

    /* ---------------- Step 2: Appearance ---------------- *
     * A human avatar builder (Update 12): choose your gender, then shape
     * the person with sliders — skin color, hair color, hair style, beard
     * style, and coaching polo color (Update 13) — over a live preview.
     * This face follows the whole career, onto every historical profile.
     */
    function renderAppearance() {
      const AV = UI.AVATAR;
      const app = spec.appearance;
      app.gender = spec.gender;
      if (spec.gender === 'W') app.beard = 0;

      const slider = (key, label, max) => `
        <div class="avatar-slider" data-slider="${key}" ${key === 'beard' && spec.gender === 'W' ? 'style="display:none;"' : ''}>
          <input type="range" min="0" max="${max}" step="1" value="${app[key]}" data-app="${key}">
          <div class="avatar-slider-label">${label}</div>
        </div>`;

      root.innerHTML = frame(
        'Your <span>Look</span>',
        'Build your coach — this face follows your whole career, onto every historical profile.',
        `
        <div class="field" style="margin-bottom:12px;">
          <label>Coach</label>
          <div class="pill-tabs" id="gender-tabs">
            <button type="button" data-g="M" class="${spec.gender === 'M' ? 'active' : ''}">👔 Male Coach</button>
            <button type="button" data-g="W" class="${spec.gender === 'W' ? 'active' : ''}">👔 Female Coach</button>
          </div>
        </div>
        <div class="avatar-builder">
          <div style="text-align:center;">
            <div id="coach-avatar-preview">${UI.avatarSvg(app, { size: 132, outfit: 'polo' })}</div>
            <div style="font-weight:700; font-size:15px; margin-top:6px;">${Utils.escapeHtml(spec.first)} ${Utils.escapeHtml(spec.last)}</div>
            <div style="color:var(--text-dim); font-size:12.5px;">${spec.startRole === 'Assistant' ? 'Assistant Coach' : 'Head Coach'} • Age ${spec.age}${spec.hometown ? ' • ' + Utils.escapeHtml(spec.hometown) : ''}</div>
            <button type="button" class="btn" id="rand-avatar" style="margin-top:8px; padding:4px 12px; font-size:12px;">🎲 Randomize</button>
          </div>
          <div class="avatar-sliders">
            ${slider('skin', 'Skin Color', AV.SKIN_TONES.length - 1)}
            ${slider('hair', 'Hair Color', AV.HAIR_COLORS.length - 1)}
            ${slider('hairStyle', 'Hair Style', AV.HAIR_STYLE_COUNT - 1)}
            ${slider('beard', 'Beard Style', AV.BEARD_STYLE_COUNT - 1)}
            ${slider('polo', 'Polo Color', AV.POLO_COLORS.length - 1)}
          </div>
        </div>`,
        { nextLabel: 'Next: Archetype →' }
      );

      const redraw = () => {
        root.querySelector('#coach-avatar-preview').innerHTML = UI.avatarSvg(app, { size: 132, outfit: 'polo' });
      };
      root.querySelectorAll('[data-app]').forEach((inp) => {
        inp.addEventListener('input', () => {
          app[inp.dataset.app] = Number(inp.value);
          redraw();
        });
      });
      root.querySelectorAll('#gender-tabs [data-g]').forEach((btn) => {
        btn.addEventListener('click', () => {
          spec.gender = btn.dataset.g;
          renderAppearance(); // re-render: beard slider shows/hides with gender
        });
      });
      root.querySelector('#rand-avatar').addEventListener('click', () => {
        app.skin = Math.floor(Math.random() * AV.SKIN_TONES.length);
        app.hair = Math.floor(Math.random() * AV.HAIR_COLORS.length);
        app.hairStyle = Math.floor(Math.random() * AV.HAIR_STYLE_COUNT);
        app.beard = spec.gender === 'M' ? Math.floor(Math.random() * AV.BEARD_STYLE_COUNT) : 0;
        app.polo = Math.floor(Math.random() * AV.POLO_COLORS.length);
        root.querySelectorAll('[data-app]').forEach((inp) => { inp.value = app[inp.dataset.app]; });
        redraw();
      });

      wireNav(() => { app.gender = spec.gender; });
    }

    /* ---------------- Step 3: Archetype ---------------- */
    function renderArchetype() {
      root.innerHTML = frame(
        'Coaching <span>Archetype</span>',
        'Your defining strength. It sets your standout rating and shapes how the world sees you.',
        `
        <div class="field" style="margin-bottom:0;">
          <div class="archetype-grid">
            ${D.COACH_ARCHETYPES.map((a) => `
              <div class="archetype-card ${spec.archetype === a.key ? 'selected' : ''}" data-arch="${a.key}">
                <div class="arch-name">${a.icon} ${a.key}</div>
                <div class="arch-desc">${a.desc}</div>
              </div>`).join('')}
          </div>
        </div>`,
        { nextLabel: 'Next: Training Philosophy →', nextDisabled: !spec.archetype }
      );

      root.querySelectorAll('[data-arch]').forEach((el) => {
        el.addEventListener('click', () => {
          spec.archetype = el.dataset.arch;
          root.querySelectorAll('[data-arch]').forEach((n) => n.classList.toggle('selected', n.dataset.arch === spec.archetype));
          root.querySelector('#btn-next').disabled = false;
        });
      });

      wireNav(null);
    }

    /* ---------------- Step 4: Training philosophy ---------------- */
    function renderTraining() {
      root.innerHTML = frame(
        'Training <span>Philosophy</span>',
        'Permanent for this coach\'s career — its effectiveness scales with your Training rating. Every philosophy trades something away.',
        `
        <div class="field" style="margin-bottom:0;">
          <div class="archetype-grid" id="tp-grid">
            ${D.TRAINING_PHILOSOPHIES.map((tp) => `
              <div class="archetype-card ${spec.trainingPhilosophy === tp.key ? 'selected' : ''}" data-tp="${tp.key}">
                <div class="arch-name">${tp.icon} ${tp.label}</div>
                <div class="arch-desc">${tp.desc}</div>
              </div>`).join('')}
          </div>
        </div>`,
        { nextLabel: 'Next: Race Philosophy →' }
      );

      root.querySelectorAll('[data-tp]').forEach((el) => {
        el.addEventListener('click', () => {
          spec.trainingPhilosophy = el.dataset.tp;
          root.querySelectorAll('[data-tp]').forEach((n) => n.classList.toggle('selected', n.dataset.tp === spec.trainingPhilosophy));
        });
      });

      wireNav(null);
    }

    /* ---------------- Step 5: Race philosophy ---------------- */
    function renderRacing() {
      root.innerHTML = frame(
        'Race <span>Philosophy</span>',
        'How your teams run when the gun goes off. Unlike training philosophy, this can be changed later.',
        `
        <div class="field" style="margin-bottom:0;">
          <div class="archetype-grid" id="rp-grid">
            ${D.RACE_PHILOSOPHIES.map((rp) => `
              <div class="archetype-card ${spec.racePhilosophy === rp.key ? 'selected' : ''}" data-rp="${rp.key}">
                <div class="arch-name">${rp.icon} ${rp.label}</div>
                <div class="arch-desc">${rp.desc}</div>
              </div>`).join('')}
          </div>
        </div>`,
        { nextLabel: 'Next: Career Summary →' }
      );

      root.querySelectorAll('[data-rp]').forEach((el) => {
        el.addEventListener('click', () => {
          spec.racePhilosophy = el.dataset.rp;
          root.querySelectorAll('[data-rp]').forEach((n) => n.classList.toggle('selected', n.dataset.rp === spec.racePhilosophy));
        });
      });

      wireNav(null);
    }

    /* ---------------- Step 6: Summary ---------------- */
    function renderSummary() {
      const arch = D.COACH_ARCHETYPES.find((a) => a.key === spec.archetype) || {};
      const tp = D.trainingPhilosophy(spec.trainingPhilosophy) || {};
      const rp = D.racePhilosophy(spec.racePhilosophy) || {};
      const isAsst = spec.startRole === 'Assistant';
      // The four core ratings this coach will start with (mirrors GameState).
      const ratings = { recruiting: 50, training: 50, peaking: 50, culture: 50 };
      if (arch.rating) ratings[arch.rating] = 64;
      if (isAsst) ratings.recruiting = Math.max(ratings.recruiting, 58);
      const path = isAsst
        ? 'Build top recruiting classes to grow your reputation, field head-coach offers from real vacancies, and recruit your way into a program of your own.'
        : 'Win with what you inherit, develop your athletes, and climb: bigger jobs call when your reputation outgrows your program.';

      root.innerHTML = frame(
        'Career <span>Summary</span>',
        'One last look before it becomes official.',
        `
        <div class="wizard-preview">
          <div>${UI.avatarSvg(Object.assign({}, spec.appearance, { gender: spec.gender }), { size: 72, outfit: 'polo' })}</div>
          <div>
            <div style="font-weight:700; font-size:17px;">${Utils.escapeHtml(spec.first)} ${Utils.escapeHtml(spec.last)}</div>
            <div style="color:var(--text-dim); font-size:13px;">
              ${isAsst ? 'Assistant Coach (Recruiting Coordinator)' : 'Head Coach'} • Age ${spec.age}
            </div>
            <div style="color:var(--text-dim); font-size:13px;">
              ${spec.hometown ? 'From ' + Utils.escapeHtml(spec.hometown) : ''}${spec.hometown && spec.almaMater ? ' • ' : ''}${spec.almaMater ? Utils.escapeHtml(spec.almaMater) + ' alum' : ''}
            </div>
          </div>
        </div>
        <div class="grid cols-2" style="margin-top:8px;">
          <div class="wizard-summary-box">
            <div class="wizard-summary-title">Identity</div>
            <div>${arch.icon || ''} ${Utils.escapeHtml(spec.archetype || '—')} archetype</div>
            <div>${tp.icon || ''} ${Utils.escapeHtml(tp.label || 'Balanced')} training</div>
            <div>${rp.icon || ''} ${Utils.escapeHtml(rp.label || 'Even')} racing</div>
          </div>
          <div class="wizard-summary-box">
            <div class="wizard-summary-title">Starting Ratings</div>
            ${['recruiting', 'training', 'peaking', 'culture'].map((k) =>
              `<div style="display:flex; justify-content:space-between;"><span style="text-transform:capitalize;">${k}</span><b>${ratings[k]}</b></div>`).join('')}
          </div>
        </div>
        <div class="wizard-summary-box" style="margin-top:8px;">
          <div class="wizard-summary-title">Projected Path</div>
          <div style="color:var(--text-dim);">${path} Retirement never ends the dynasty — your career joins the record books and a successor carries the world forward.</div>
        </div>`,
        { nextLabel: mode === 'succession' ? 'Confirm: Choose Your Program →' : 'Confirm: Choose Your School →' }
      );

      wireNav(null);
    }

    const renderers = [renderIdentity, renderAppearance, renderArchetype, renderTraining, renderRacing, renderSummary];
    function render() {
      renderers[step]();
      // Each step starts at the top — #menu-root is the scroll surface
      // (the window itself never scrolls inside the app shell).
      const scroller = root.querySelector('#menu-root');
      if (scroller) scroller.scrollTop = 0;
      window.scrollTo(0, 0);
    }
    render();
  };

  /*
   * Legacy Dynasty Mode succession flow (Update 6, Section 1).
   *
   * Runs the wizard inside a living dynasty after the player chooses to
   * retire. Nothing changes until the very last confirmation — backing out
   * at any step returns to the game with the old coach still in charge.
   * On confirmation, Careers.retireAndSucceed seals the old career and
   * installs the successor atomically.
   */
  UI.successionFlow = function (game, initialSpec = {}) {
    const root = document.getElementById('root');
    const cancel = () => UI.renderShell();
    UI.coachWizard(root, { mode: 'succession', world: game.world, initial: initialSpec },
      (spec) => renderSuccessionSchoolPick(root, game, spec),
      cancel);
  };

  function renderSuccessionSchoolPick(root, game, spec) {
    const D = window.XCD.data;
    // A newly created coach may take ANY open program (Realism Update): the
    // artificial "entry-level only" restriction is gone, so an incoming coach
    // — including an elite one succeeding a legend — is eligible for every job
    // in the world, blue bloods included. Programs are listed strongest first.
    const schools = Object.values(game.world.schools)
      .sort((a, b) => (b.prestige || 0) - (a.prestige || 0) || a.name.localeCompare(b.name));
    const oldCoach = game.getPlayerCoach();
    let selectedId = game.playerSchoolId || null;
    let divFilter = (game.getPlayerSchool().division || 'DI');
    if (!schools.some((s) => (s.division || 'DI') === divFilter)) {
      divFilter = (schools[0] && (schools[0].division || 'DI')) || 'DI';
    }

    const DIV_TABS = ['DI', 'DII', 'DIII']
      .filter((k) => D.divisionFor(k).active)
      .map((k) => [k, D.divisionFor(k).label]);

    root.innerHTML = `
      <div id="menu-root">
        <div class="menu-panel" style="width:min(640px,94vw);">
          <h1 style="font-size:22px;">Choose Your <span>Program</span></h1>
          <p class="tagline">${spec.startRole === 'Assistant' ? 'Assistant' : 'Head'} Coach ${Utils.escapeHtml(spec.first)} ${Utils.escapeHtml(spec.last)} succeeds the retiring ${Utils.escapeHtml(oldCoach.fullName)}. Every program in the country is open — from a rebuilding small school to a national blue blood. Choose where the next era begins.</p>
          <div class="pill-tabs" id="div-tabs" style="margin-bottom:10px;">
            ${DIV_TABS.map(([k, label]) => `<button data-div="${k}" class="${divFilter === k ? 'active' : ''}">${label}</button>`).join('')}
          </div>
          <div class="field">
            <label>Search Schools</label>
            <input id="school-search" placeholder="Search by name, conference, or state...">
          </div>
          <div class="school-pick-list" id="school-list"></div>
          <div style="display:flex; gap:10px; margin-top:18px;">
            <button class="btn" id="btn-back">← Coach</button>
            <button class="btn primary" id="btn-start" style="flex:1;">🏁 Retire & Begin the New Era</button>
          </div>
        </div>
      </div>`;

    const listEl = root.querySelector('#school-list');
    const startBtn = root.querySelector('#btn-start');

    function drawList(query = '') {
      const q = query.toLowerCase();
      const filtered = schools.filter((s) =>
        (s.division || 'DI') === divFilter &&
        (!q || s.name.toLowerCase().includes(q) || s.conference.toLowerCase().includes(q) || s.state.toLowerCase().includes(q)));
      listEl.innerHTML = filtered.slice(0, 400).map((s) => `
        <div class="school-pick ${s.id === selectedId ? 'selected' : ''}" data-id="${s.id}">
          <div>
            <div class="name">${Utils.escapeHtml(s.name)}${s.id === game.playerSchoolId ? ' <span style="color:var(--accent); font-size:11px;">(your program)</span>' : ''}</div>
            <div class="meta">${Utils.escapeHtml(s.conference)} • ${s.state}</div>
          </div>
          <div style="text-align:right;">
            ${UI.ratingBadge(s.prestige)}
            <div class="meta">Prestige</div>
          </div>
        </div>`).join('') || '<div style="padding:14px;color:var(--text-dim);">No schools match.</div>';

      listEl.querySelectorAll('.school-pick').forEach((el) => {
        el.addEventListener('click', () => {
          selectedId = el.dataset.id;
          startBtn.disabled = false;
          listEl.querySelectorAll('.school-pick').forEach((n) => n.classList.toggle('selected', n.dataset.id === selectedId));
        });
      });
    }
    drawList();
    startBtn.disabled = !selectedId;

    root.querySelectorAll('[data-div]').forEach((btn) => {
      btn.addEventListener('click', () => {
        divFilter = btn.dataset.div;
        root.querySelectorAll('[data-div]').forEach((n) => n.classList.toggle('active', n.dataset.div === divFilter));
        drawList(root.querySelector('#school-search').value);
      });
    });
    root.querySelector('#school-search').addEventListener('input', (e) => drawList(e.target.value));
    root.querySelector('#btn-back').addEventListener('click', () => UI.successionFlow(game, spec));

    startBtn.addEventListener('click', async () => {
      if (!selectedId) return;
      const res = window.XCD.engine.Careers.retireAndSucceed(game, spec, selectedId);
      if (!res.ok) { UI.toast(res.message || 'Succession failed.', 'error'); UI.renderShell(); return; }
      UI.state.currentScreen = 'dashboard';
      try { await window.XCD.engine.SaveManager.autoSave(game); } catch (err) { /* best-effort */ }
      UI.renderShell();
      UI.toast(`${res.retired} retires into the record books. Welcome, Coach ${spec.last}!`, 'success', 4200);
    });
  }
})();
