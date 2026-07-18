/*
 * Main menu: new dynasty (with school picker), load dynasty, import save.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  // The custom-league spec loaded for the next New Dynasty (Update 13). Held
  // at module scope so it survives navigation between menu screens, and is
  // applied to the previewed world + carried into the game on start.
  let customLeagueSpec = null;

  /*
   * The title-page mascot: a flat-vector runner in the game's avatar style,
   * in full side-profile stride — arms pumping, back heel kicked up. Kit from
   * the reference photo: light blue singlet with gold trim, black shorts,
   * blond hair, deliberately no bib. Gently animated via .hero-crest CSS.
   */
  function heroRunnerSvg() {
    const skin = '#F0C8A6', skinD = '#DDB28D';
    const hair = '#E7CE8C', hairD = '#CBA45D';
    const kit = '#7FB9E8', trim = '#D9BC6A';
    const shorts = '#262B33';
    const shoe = '#F2F5F8', sole = '#9AA5B4';
    return `<svg viewBox="0 0 76 76" width="88" height="88" aria-hidden="true">
      <!-- far-side limbs first (behind the torso) -->
      <g stroke="${skinD}" stroke-width="4.8" stroke-linecap="round" fill="none">
        <path d="M42 26 L34 31.5 L26.5 28.5"/>   <!-- far arm, swinging back -->
        <path d="M37 43 L28.5 50.5 L21 46.5"/>   <!-- far leg, heel kicked up -->
      </g>
      <path fill="${shoe}" d="M20.9 41.5 Q17.4 44.6 18.3 49.4 L21.3 50 L23.9 43.7 Z" transform="rotate(64 21 46)"/>
      <!-- torso: forward lean, singlet with gold trim -->
      <path fill="${kit}" d="M46.5 21.5 C41 22.5 37.5 26.5 36.6 31.5 C35.9 35.6 36.1 39.8 37.2 44.5 L47.5 45.5 C49.9 39 51 32 50.8 25 C49.6 23.2 48.2 22 46.5 21.5 Z"/>
      <path fill="${trim}" d="M46.5 21.5 C44.9 21.8 43.5 22.5 42.3 23.5 C43.9 25.9 46.4 27.4 49.5 27.9 C50 26.9 50.4 25.9 50.8 25 C49.6 23.2 48.2 22 46.5 21.5 Z" opacity="0.9"/>
      <path fill="${trim}" d="M37.2 44.5 L47.5 45.5 C47.8 44.7 48.1 43.9 48.4 43 L36.8 42 C36.9 42.8 37 43.7 37.2 44.5 Z"/>
      <!-- shorts: hip wrap + both thighs -->
      <path fill="${shorts}" d="M36.8 41.5 C35.5 45.5 34 48.5 31.5 51.5 L38.5 56.5 C41.5 53.5 44.5 50.5 48.5 48.5 L48.2 43 Z"/>
      <!-- near leg: driving forward, knee high -->
      <g stroke="${skin}" stroke-width="5.2" stroke-linecap="round" fill="none">
        <path d="M43 47 L52.5 54.5 L51.5 65.5"/>
      </g>
      <path fill="${shoe}" d="M48.7 66.8 Q52.7 63.6 57.4 65.4 L57.6 68.4 L49.3 69.4 Z" transform="rotate(8 53 67)"/>
      <rect x="49" y="68.3" width="8.4" height="1.7" rx="0.85" fill="${sole}" transform="rotate(8 53 67)"/>
      <!-- near arm: pumping forward at ~90°, hand loose -->
      <g stroke="${skin}" stroke-width="4.8" stroke-linecap="round" fill="none">
        <path d="M47 26.5 L44.5 34.5 L53.5 36.5"/>
      </g>
      <circle cx="54.5" cy="36.8" r="2.5" fill="${skin}"/>
      <!-- neck + head, facing right -->
      <path fill="${skinD}" d="M46 18 L50.5 16.5 L52.5 22.5 C52.8 24 47.5 25.6 47 24 Z"/>
      <circle cx="51" cy="12" r="7.2" fill="${skin}"/>
      <ellipse cx="44.6" cy="12.8" rx="1.3" ry="1.8" fill="${skin}"/>
      <!-- blond hair: hugs the crown, swept back off the forehead -->
      <path fill="${hair}" d="M57.6 8.4 C56.4 5.6 54 4.3 51 4.3 C46.7 4.3 43.6 7.4 43.7 11.8 C43.7 13.9 44.3 15.6 45.3 16.8 C44.9 13.3 45.8 10.8 48 9.7 C51 8.2 55 8 57.6 8.4 Z"/>
      <path fill="${hair}" d="M44.4 12.2 C42.8 12.4 41.6 13.2 41 14.5 C42.4 14.9 43.8 14.5 44.9 13.5 Z"/>
      <path fill="${hairD}" opacity="0.35" d="M48 9.7 C51 8.2 55 8 57.6 8.4 C57.2 9.4 56.6 10 55.6 10 C53 9.7 50.2 9.9 48.6 10.9 C46.8 12 46 13.9 45.3 16.8 C44.9 13.3 45.8 10.8 48 9.7 Z"/>
    </svg>`;
  }

  function renderMainMenu(root) {
    root.innerHTML = `
      <div id="menu-root" class="menu-home">
        <div class="menu-hero">
          <div class="hero-crest">${heroRunnerSvg()}</div>
          <div class="hero-badge">Collegiate Cross Country</div>
          <h1 class="hero-wordmark"><span class="wm-top">XC</span><span class="wm-main">Dynasty</span></h1>
          <div class="hero-rule"></div>
          <p class="hero-tagline">Recruit. Train. Race. Build the greatest program in collegiate history.</p>
          <div class="menu-buttons">
            <button class="btn primary" id="btn-new">New Dynasty</button>
            <button class="btn" id="btn-load">Load Dynasty</button>
            <button class="btn" id="btn-import">Import Save File</button>
            <button class="btn" id="btn-custom">Custom League${customLeagueSpec ? ' <span style="color:var(--success);">•</span>' : ''}</button>
          </div>
          ${customLeagueSpec ? `<div class="hero-note">Custom league ready — ${(customLeagueSpec.teams || []).length} custom team${(customLeagueSpec.teams || []).length === 1 ? '' : 's'}. Your next New Dynasty uses it.</div>` : ''}
          <input type="file" id="import-file" accept=".json,application/json" style="display:none">
          <div class="hero-footer">XC Dynasty · v${window.XCD.VERSION}</div>
        </div>
      </div>`;

    root.querySelector('#btn-new').addEventListener('click', () => renderNewGame(root));
    root.querySelector('#btn-load').addEventListener('click', () => renderLoadMenu(root));
    root.querySelector('#btn-custom').addEventListener('click', () => renderCustomLeague(root));

    const fileInput = root.querySelector('#import-file');
    root.querySelector('#btn-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const game = await window.XCD.engine.SaveManager.importFromFile(file);
        UI.state.game = game;
        UI.state.currentScreen = 'dashboard';
        UI.renderShell();
        UI.toast('Save imported successfully.', 'success');
      } catch (err) {
        UI.toast('Import failed: ' + err.message, 'error');
      }
    });
  }

  /*
   * New dynasty flow — no dynasty begins until a coach has been created:
   *   Step 1: Coach Creation (name, portrait, archetype)
   *   Step 2: Choose your school
   */
  function renderNewGame(root) {
    // Generate a preview world so the school list shows real prestige values.
    const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    // Custom League (Update 13): apply the imported spec's global name
    // overrides (division labels, conferences, meet/award names) and its team,
    // mascot, color, and roster overrides to the previewed world — so the
    // school picker and the started game both reflect the custom league.
    window.XCD.data.applyCustomLeague(customLeagueSpec);
    const world = window.XCD.engine.WorldGenerator.generate(seed);
    if (customLeagueSpec) window.XCD.engine.WorldGenerator.applyCustomLeague(world, customLeagueSpec, seed);
    renderCoachCreation(root, seed, world);
  }

  /*
   * Custom League editor (Update 13). Paste or import a JSON spec that
   * renames divisions, adds conferences, sets meet & award names, and defines
   * custom teams (name, mascot, colors, conference, division) with optional
   * custom rosters. Teams override an existing program by name/`match`, or add
   * a brand-new one — the full NCAA world stays intact so the sim never breaks.
   */
  function renderCustomLeague(root) {
    const template = {
      divisionNames: { DI: 'Premier Division', DII: 'Second Division', DIII: 'Club Division' },
      conferences: [{ name: 'Coastal League', tier: 1 }],
      meetNames: ['Autumn Classic', 'Harvest Invitational', 'Founders Cup'],
      awardNames: { runnerOfYear: 'Golden Spikes', coachOfYear: 'Bench Boss of the Year' },
      teams: [
        {
          match: 'Oregon', name: 'Cascadia', mascot: 'Fighting Firs',
          colors: ['#0b5d3b', '#f4c20d'], conference: 'Coastal League', division: 'DI',
          roster: { M: ['Sam Rivera', 'Theo Blake'], W: ['Nina Cole', 'Priya Shah'] }
        },
        {
          name: 'Harbor State', mascot: 'Anchormen',
          colors: ['#002b5c', '#c0c0c0'], state: 'CA', conference: 'Coastal League', division: 'DI'
        }
      ]
    };
    const current = customLeagueSpec ? JSON.stringify(customLeagueSpec, null, 2) : '';

    root.innerHTML = `
      <div id="menu-root">
        <div class="menu-panel" style="width:min(720px,95vw);">
          <h1 style="font-size:22px;">Custom <span>League</span></h1>
          <p class="tagline">Shape your own world. Paste or import a JSON spec — rename divisions, add
            conferences, set meet & award names, and define custom teams with mascots, colors, and rosters.
            Teams override an existing program (by <code>match</code>) or add a new one; the rest of the NCAA stays intact.</p>
          <div class="field">
            <label>League JSON</label>
            <textarea id="custom-json" spellcheck="false" style="width:100%; min-height:230px; font-family:monospace; font-size:12px; resize:vertical;" placeholder="Paste your league JSON here, or load the template below…">${Utils.escapeHtml(current)}</textarea>
          </div>
          <div class="field">
            <label>Load from URL</label>
            <div style="display:flex; gap:8px;">
              <input type="url" id="custom-url" placeholder="https://example.com/my-league.json" style="flex:1; min-width:0;" inputmode="url" autocapitalize="off" autocorrect="off">
              <button class="btn" id="btn-url">🌐 Load</button>
            </div>
          </div>
          <div id="custom-msg" style="min-height:18px; font-size:12.5px; margin-bottom:8px;"></div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn" id="btn-template">📋 Load Template</button>
            <button class="btn" id="btn-file">📂 Import File</button>
            <button class="btn" id="btn-clear">🗑 Clear</button>
          </div>
          <input type="file" id="custom-file" accept=".json,application/json" style="display:none">
          <div style="display:flex; gap:10px; margin-top:18px;">
            <button class="btn" id="btn-back">← Back</button>
            <button class="btn primary" id="btn-save" style="flex:1;">Save Custom League</button>
          </div>
        </div>
      </div>`;

    const ta = root.querySelector('#custom-json');
    const msg = root.querySelector('#custom-msg');
    const setMsg = (text, ok) => { msg.textContent = text; msg.style.color = ok ? 'var(--success)' : 'var(--danger)'; };

    root.querySelector('#btn-template').addEventListener('click', () => {
      ta.value = JSON.stringify(template, null, 2);
      setMsg('Template loaded — edit it, then Save.', true);
    });
    root.querySelector('#btn-clear').addEventListener('click', () => {
      ta.value = '';
      customLeagueSpec = null;
      setMsg('Custom league cleared. New dynasties will use the standard NCAA world.', true);
    });
    // Load a league spec straight from a URL (Update 14): fetch the JSON,
    // drop it into the editor, and validate on Save like any other source.
    const urlInput = root.querySelector('#custom-url');
    const urlBtn = root.querySelector('#btn-url');
    urlBtn.addEventListener('click', async () => {
      const url = (urlInput.value || '').trim();
      if (!url) { setMsg('Enter a URL first (a link to a raw .json file).', false); return; }
      if (!/^https?:\/\//i.test(url)) { setMsg('The URL must start with http:// or https://.', false); return; }
      urlBtn.disabled = true;
      urlBtn.textContent = '⏳ Loading…';
      try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        JSON.parse(text); // fail fast on non-JSON responses (e.g. HTML pages)
        ta.value = text;
        setMsg('Loaded from URL — review it, then Save.', true);
      } catch (err) {
        setMsg(`Could not load that URL (${err.message}). It must be a public link to raw JSON — e.g. a GitHub "raw" link.`, false);
      } finally {
        urlBtn.disabled = false;
        urlBtn.textContent = '🌐 Load';
      }
    });
    const fileInput = root.querySelector('#custom-file');
    root.querySelector('#btn-file').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { ta.value = String(reader.result || ''); setMsg('File loaded — review it, then Save.', true); };
      reader.onerror = () => setMsg('Could not read that file.', false);
      reader.readAsText(file);
    });
    root.querySelector('#btn-back').addEventListener('click', () => renderMainMenu(root));
    root.querySelector('#btn-save').addEventListener('click', () => {
      const raw = ta.value.trim();
      if (!raw) { customLeagueSpec = null; renderMainMenu(root); return; }
      const parsed = validateCustomLeague(raw);
      if (!parsed.ok) { setMsg(parsed.error, false); return; }
      customLeagueSpec = parsed.spec;
      UI.toast('Custom league saved — start a New Dynasty to use it.', 'success');
      renderMainMenu(root);
    });
  }

  // Parse + lightly validate a custom-league JSON string. Returns
  // { ok, spec } or { ok:false, error }. Deliberately permissive: every field
  // is optional, so a spec with only a couple of teams (or only division
  // names) is valid.
  function validateCustomLeague(raw) {
    let spec;
    try { spec = JSON.parse(raw); }
    catch (e) { return { ok: false, error: 'Invalid JSON: ' + e.message }; }
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      return { ok: false, error: 'The league spec must be a JSON object.' };
    }
    if (spec.teams !== undefined && !Array.isArray(spec.teams)) {
      return { ok: false, error: '"teams" must be an array.' };
    }
    if (Array.isArray(spec.teams)) {
      for (const t of spec.teams) {
        if (!t || typeof t !== 'object') return { ok: false, error: 'Each team must be an object.' };
        if (!t.name && !t.match) return { ok: false, error: 'Each team needs a "name" (or a "match" to override one).' };
        if (t.colors !== undefined && (!Array.isArray(t.colors) || t.colors.length < 2)) {
          return { ok: false, error: `Team "${t.name || t.match}" colors must be an array of two hex strings.` };
        }
        if (t.division && !window.XCD.data.DIVISIONS[t.division]) {
          return { ok: false, error: `Team "${t.name || t.match}" has unknown division "${t.division}" (use DI, DII, or DIII).` };
        }
      }
    }
    return { ok: true, spec };
  }

  // Coach creation is the guided multi-step wizard (Update 6, Section 2).
  function renderCoachCreation(root, seed, world, prev = {}) {
    UI.coachWizard(root, { mode: 'new', world, initial: prev },
      (spec) => renderSchoolSelect(root, seed, world, spec),
      () => renderMainMenu(root));
  }

  function renderSchoolSelect(root, seed, world, coach) {
    const D = window.XCD.data;
    const schools = Object.values(world.schools)
      .sort((a, b) => a.name.localeCompare(b.name));

    let selectedId = null;
    let divFilter = 'DI'; // most players start in the division they know

    const DIV_TABS = ['DI', 'DII', 'DIII']
      .filter((k) => D.divisionFor(k).active)
      .map((k) => [k, D.divisionFor(k).label]);

    root.innerHTML = `
      <div id="menu-root">
        <div class="menu-panel" style="width:min(640px,94vw);">
          <h1 style="font-size:22px;">Choose Your <span>School</span></h1>
          <p class="tagline">Step 2 of 2 — ${coach.startRole === 'Assistant' ? 'Assistant' : 'Head'} Coach ${Utils.escapeHtml(coach.first)} ${Utils.escapeHtml(coach.last)} (${Utils.escapeHtml(coach.archetype)}). ${coach.startRole === 'Assistant' ? 'Pick the program whose staff you will join as recruiting coordinator.' : 'Coach in any of the three divisions — smaller programs mean a harder, longer climb.'}</p>
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
            <button class="btn primary" id="btn-start" style="flex:1;" disabled>Start Dynasty</button>
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
            <div class="name">${Utils.escapeHtml(s.name)}</div>
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

    root.querySelectorAll('[data-div]').forEach((btn) => {
      btn.addEventListener('click', () => {
        divFilter = btn.dataset.div;
        root.querySelectorAll('[data-div]').forEach((n) => n.classList.toggle('active', n.dataset.div === divFilter));
        drawList(root.querySelector('#school-search').value);
      });
    });
    root.querySelector('#school-search').addEventListener('input', (e) => drawList(e.target.value));
    root.querySelector('#btn-back').addEventListener('click', () => renderCoachCreation(root, seed, world, coach));

    startBtn.addEventListener('click', async () => {
      const dynName = coach.dynName || `The ${coach.last} Era`;
      const game = window.XCD.engine.GameState.newGame({
        schoolId: selectedId,
        dynastyName: dynName,
        coachFirstName: coach.first,
        coachLastName: coach.last,
        archetype: coach.archetype,
        portrait: coach.portrait,
        gender: coach.gender,
        appearance: coach.appearance,
        trainingPhilosophy: coach.trainingPhilosophy,
        racePhilosophy: coach.racePhilosophy,
        startRole: coach.startRole,
        age: coach.age,
        hometown: coach.hometown,
        almaMater: coach.almaMater,
        seed,
        world, // reuse the previewed world so selected ids stay valid
        customLeague: customLeagueSpec // Update 13: carried into the save
      });
      UI.state.game = game;
      UI.state.currentScreen = 'dashboard';
      try {
        await window.XCD.engine.SaveManager.autoSave(game);
      } catch (err) { /* autosave best-effort at creation */ }
      UI.renderShell();
      UI.toast(`Welcome to ${game.getPlayerSchool().name}, Coach ${coach.last}!`, 'success');
    });
  }

  async function renderLoadMenu(root) {
    let slots = [];
    try {
      slots = await window.XCD.engine.SaveManager.listSlots();
    } catch (err) {
      UI.toast('Could not read saves: ' + err.message, 'error');
    }

    root.innerHTML = `
      <div id="menu-root">
        <div class="menu-panel" style="width:min(620px,94vw);">
          <h1 style="font-size:22px;">Load <span>Dynasty</span></h1>
          <p class="tagline">${slots.length ? 'Each dynasty is saved independently. Select one to continue.' : 'No saved dynasties found yet.'}</p>
          <div class="menu-buttons" id="slot-list">
            ${slots.map((s) => `
              <div style="display:flex; gap:8px; align-items:stretch;">
                <button class="btn" data-load="${s.dynastyId}" style="flex:1; text-align:left; display:block; padding:10px 14px;">
                  <div style="display:flex; justify-content:space-between; gap:8px;">
                    <span style="font-weight:600;">${Utils.escapeHtml(s.dynastyName)}</span>
                    <span style="color:var(--text-dim); font-size:12px;">${Utils.escapeHtml(s.record || '0-0')}</span>
                  </div>
                  <div style="color:var(--text-dim); font-size:12px; margin-top:2px;">
                    ${Utils.escapeHtml(s.schoolName)} · ${Utils.escapeHtml(s.coachName)} · Wk ${s.week}, ${s.year}
                  </div>
                  <div style="color:var(--text-faint); font-size:11px; margin-top:1px;">
                    Last saved ${new Date(s.savedAt).toLocaleString()}${s.isAuto ? ' (auto)' : ''}
                  </div>
                </button>
                <div style="display:flex; flex-direction:column; gap:4px;">
                  <button class="btn" data-rename="${s.dynastyId}" title="Rename dynasty" style="padding:4px 8px;">✎</button>
                  <button class="btn danger" data-del="${s.dynastyId}" title="Delete dynasty" style="padding:4px 8px;">✕</button>
                </div>
              </div>`).join('')}
          </div>
          <div style="margin-top:18px;">
            <button class="btn" id="btn-back">← Back</button>
          </div>
        </div>
      </div>`;

    root.querySelector('#btn-back').addEventListener('click', () => renderMainMenu(root));

    root.querySelectorAll('[data-load]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const game = await window.XCD.engine.SaveManager.load(btn.dataset.load);
          if (!game) { UI.toast('That dynasty could not be loaded.', 'error'); return; }
          UI.state.game = game;
          UI.state.currentScreen = 'dashboard';
          UI.renderShell();
          UI.toast('Dynasty loaded.', 'success');
        } catch (err) {
          UI.toast('Load failed: ' + err.message, 'error');
        }
      });
    });

    root.querySelectorAll('[data-rename]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const dynId = btn.dataset.rename;
        const current = slots.find((s) => s.dynastyId === dynId);
        const name = window.prompt('Rename dynasty:', (current && current.dynastyName) || '');
        if (name === null) return;
        try {
          await window.XCD.engine.SaveManager.renameDynasty(dynId, name);
          UI.toast('Dynasty renamed.', 'success');
        } catch (err) {
          UI.toast('Rename failed: ' + err.message, 'error');
        }
        renderLoadMenu(root);
      });
    });

    root.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const dynId = btn.dataset.del;
        const current = slots.find((s) => s.dynastyId === dynId);
        const label = (current && current.dynastyName) || 'this dynasty';
        if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
        try {
          await window.XCD.engine.SaveManager.deleteDynasty(dynId);
          UI.toast('Dynasty deleted.');
        } catch (err) {
          UI.toast('Delete failed: ' + err.message, 'error');
        }
        renderLoadMenu(root);
      });
    });
  }

  UI.screens.menu = { render: renderMainMenu };
})();
