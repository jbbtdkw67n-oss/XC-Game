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
          <p class="tagline">Build a small program into the greatest dynasty in NCAA history.</p>
          <div class="menu-buttons">
            <button class="btn primary" id="btn-new">🏁 New Dynasty</button>
            <button class="btn" id="btn-load">💾 Load Dynasty</button>
            <button class="btn" id="btn-import">📂 Import Save File</button>
          </div>
          <input type="file" id="import-file" accept=".json,application/json" style="display:none">
        </div>
      </div>`;

    root.querySelector('#btn-new').addEventListener('click', () => renderNewGame(root));
    root.querySelector('#btn-load').addEventListener('click', () => renderLoadMenu(root));

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

  function renderNewGame(root) {
    // Generate a preview world so the school list shows real prestige values.
    const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    const world = window.XCD.engine.WorldGenerator.generate(seed);
    const schools = Object.values(world.schools)
      .sort((a, b) => a.name.localeCompare(b.name));

    let selectedId = null;

    root.innerHTML = `
      <div id="menu-root">
        <div class="menu-panel" style="width:min(640px,94vw);">
          <h1 style="font-size:22px;">Start a New <span>Dynasty</span></h1>
          <p class="tagline">Choose your identity and your first school. Smaller programs mean a harder, longer climb.</p>
          <div class="grid cols-2">
            <div class="field"><label>Coach First Name</label><input id="coach-first" value="Alex" maxlength="20"></div>
            <div class="field"><label>Coach Last Name</label><input id="coach-last" value="Carter" maxlength="20"></div>
          </div>
          <div class="field"><label>Dynasty Name</label><input id="dyn-name" placeholder="e.g. The Carter Era" maxlength="40"></div>
          <div class="field">
            <label>Search Schools</label>
            <input id="school-search" placeholder="Search by name, conference, or state...">
          </div>
          <div class="school-pick-list" id="school-list"></div>
          <div style="display:flex; gap:10px; margin-top:18px;">
            <button class="btn" id="btn-back">← Back</button>
            <button class="btn primary" id="btn-start" style="flex:1;" disabled>Start Dynasty</button>
          </div>
        </div>
      </div>`;

    const listEl = root.querySelector('#school-list');
    const startBtn = root.querySelector('#btn-start');

    function drawList(query = '') {
      const q = query.toLowerCase();
      const filtered = schools.filter((s) =>
        !q || s.name.toLowerCase().includes(q) || s.conference.toLowerCase().includes(q) || s.state.toLowerCase().includes(q));
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

    root.querySelector('#school-search').addEventListener('input', (e) => drawList(e.target.value));
    root.querySelector('#btn-back').addEventListener('click', () => renderMainMenu(root));

    startBtn.addEventListener('click', async () => {
      const first = root.querySelector('#coach-first').value.trim() || 'Alex';
      const last = root.querySelector('#coach-last').value.trim() || 'Carter';
      const dynName = root.querySelector('#dyn-name').value.trim() || `The ${last} Era`;

      const game = window.XCD.engine.GameState.newGame({
        schoolId: selectedId,
        dynastyName: dynName,
        coachFirstName: first,
        coachLastName: last,
        seed,
        world // reuse the previewed world so selected ids stay valid
      });
      UI.state.game = game;
      UI.state.currentScreen = 'dashboard';
      try {
        await window.XCD.engine.SaveManager.autoSave(game);
      } catch (err) { /* autosave best-effort at creation */ }
      UI.renderShell();
      UI.toast(`Welcome to ${game.getPlayerSchool().name}, Coach ${last}!`, 'success');
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
        <div class="menu-panel">
          <h1 style="font-size:22px;">Load <span>Dynasty</span></h1>
          <p class="tagline">${slots.length ? 'Select a saved dynasty to continue.' : 'No saved dynasties found yet.'}</p>
          <div class="menu-buttons" id="slot-list">
            ${slots.map((s) => `
              <div style="display:flex; gap:8px;">
                <button class="btn" data-load="${s.slotId}" style="flex:1; justify-content:space-between;">
                  <span>${Utils.escapeHtml(s.label)}</span>
                  <span style="color:var(--text-dim); font-size:12px;">
                    ${Utils.escapeHtml(s.schoolName)} — Wk ${s.week}, ${s.year}
                  </span>
                </button>
                <button class="btn danger" data-del="${s.slotId}" title="Delete save">✕</button>
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
          if (!game) { UI.toast('Save slot was empty.', 'error'); return; }
          UI.state.game = game;
          UI.state.currentScreen = 'dashboard';
          UI.renderShell();
          UI.toast('Dynasty loaded.', 'success');
        } catch (err) {
          UI.toast('Load failed: ' + err.message, 'error');
        }
      });
    });

    root.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await window.XCD.engine.SaveManager.deleteSlot(btn.dataset.del);
        renderLoadMenu(root);
        UI.toast('Save deleted.');
      });
    });
  }

  UI.screens.menu = { render: renderMainMenu };
})();
