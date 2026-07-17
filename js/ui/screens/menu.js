/*
 * Main menu: new dynasty (with school picker), load dynasty, import save.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  function renderMainMenu(root) {
    root.innerHTML = `
      <div id="menu-root">
        <div class="menu-panel">
          <h1>Cross Country <span>Dynasty</span></h1>
          <p class="tagline">Build a small program into the greatest dynasty in NXCA history.</p>
          <div class="menu-buttons">
            <button class="btn primary" id="btn-new">🏁 New Dynasty</button>
            <button class="btn" id="btn-load">💾 Load Dynasty</button>
            <button class="btn" id="btn-import">📂 Import Save File</button>
            <button class="btn" id="btn-customworld">🌍 Custom World</button>
          </div>
          <div id="customworld-panel" style="display:none; margin-top:12px; text-align:left; background:var(--card,#161b22); border:1px solid var(--border,#2a3341); border-radius:10px; padding:12px;">
            <div style="font-size:12.5px; color:var(--text-dim); margin-bottom:8px;">
              Load a custom universe (schools, conferences, mascots, meets, awards, division names, colors)
              from a URL or a JSON file. It applies to your <strong>next New Dynasty</strong> and is saved with it.
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px;">
              <input class="search-input" id="customworld-url" placeholder="https://…/my-world.json" style="flex:1;">
              <button class="btn small primary" id="btn-cw-url">Load URL</button>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn small" id="btn-cw-file">📄 Choose File…</button>
              <span id="customworld-status" style="font-size:12px; color:var(--text-faint);"></span>
            </div>
            <input type="file" id="customworld-file" accept=".json,application/json" style="display:none">
          </div>
          <input type="file" id="import-file" accept=".json,application/json" style="display:none">
        </div>
      </div>`;

    root.querySelector('#btn-new').addEventListener('click', () => renderNewGame(root));
    root.querySelector('#btn-load').addEventListener('click', () => renderLoadMenu(root));
    wireCustomWorld(root);

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

  // Custom-world loader on the main menu. Applies a player-supplied universe
  // (from a URL or JSON file) to the World Database so the next New Dynasty is
  // built from it. The applied config rides along in the save.
  function wireCustomWorld(root) {
    const D = window.XCD.data;
    const panel = root.querySelector('#customworld-panel');
    const status = root.querySelector('#customworld-status');
    const fileInput = root.querySelector('#customworld-file');
    const setStatus = (msg, ok) => { status.textContent = msg; status.style.color = ok ? 'var(--success,#34c98e)' : 'var(--danger,#e5534b)'; };
    if (D.CUSTOM_WORLD) setStatus('✓ Custom world active.', true);

    root.querySelector('#btn-customworld').addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    root.querySelector('#btn-cw-url').addEventListener('click', async () => {
      const url = root.querySelector('#customworld-url').value.trim();
      if (!url) { setStatus('Enter a URL first.', false); return; }
      setStatus('Loading…', true);
      try {
        const r = await D.loadCustomWorldFromUrl(url);
        setStatus(`✓ Loaded${r.schools ? ` (${r.schools} schools)` : ''}. Start a New Dynasty.`, true);
      } catch (e) { setStatus('Failed: ' + (e.message || e), false); }
    });
    root.querySelector('#btn-cw-file').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const cfg = JSON.parse(reader.result);
          const r = D.applyCustomWorld(cfg);
          if (r.ok) setStatus(`✓ Loaded${r.schools ? ` (${r.schools} schools)` : ''}. Start a New Dynasty.`, true);
          else setStatus('Failed: ' + r.error, false);
        } catch (e) { setStatus('Invalid JSON: ' + (e.message || e), false); }
      };
      reader.readAsText(file);
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
    const world = window.XCD.engine.WorldGenerator.generate(seed);
    renderCoachCreation(root, seed, world);
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
    let divFilter = 'DA'; // most players start in the division they know

    const DIV_TABS = [['DA', 'Division A'], ['DB', 'Division B'], ['DC', 'Division C']]
      .filter(([k]) => D.divisionFor(k).active);

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
        (s.division || 'DA') === divFilter &&
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
        world // reuse the previewed world so selected ids stay valid
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
