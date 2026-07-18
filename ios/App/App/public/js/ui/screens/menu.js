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

  function renderMainMenu(root) {
    root.innerHTML = `
      <div id="menu-root" class="menu-home">
        <div class="menu-hero">
          <div class="hero-crest">🏃</div>
          <div class="hero-badge">Collegiate Cross Country</div>
          <h1 class="hero-wordmark"><span class="wm-top">XC</span><span class="wm-main">Dynasty</span></h1>
          <div class="hero-rule"></div>
          <p class="hero-tagline">Recruit. Train. Race. Build the greatest program in NCAA history.</p>
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
