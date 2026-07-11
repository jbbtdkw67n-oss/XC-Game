/*
 * Save / Load screen (in-game): manual save slots, export/import JSON,
 * return to main menu.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const SaveManager = () => window.XCD.engine.SaveManager;

  async function render(container) {
    const game = UI.state.game;
    let slots = [];
    try {
      slots = await SaveManager().listSlots();
    } catch (err) {
      UI.toast('Could not read save slots: ' + err.message, 'error');
    }

    container.innerHTML = `
      <div class="screen-header">
        <h1>Save / Load</h1>
        <div class="actions">
          <button class="btn primary" id="btn-save-new">💾 Save to New Slot</button>
          <button class="btn" id="btn-export">📤 Export JSON</button>
          <button class="btn" id="btn-import">📥 Import JSON</button>
          <button class="btn danger" id="btn-quit">Main Menu</button>
          <input type="file" id="import-file" accept=".json,application/json" style="display:none">
        </div>
      </div>

      <div class="card">
        <h2>Save Slots</h2>
        ${slots.length ? `
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Label</th><th>School</th><th>Coach</th><th>Date</th><th>Saved</th><th></th></tr></thead>
            <tbody>
              ${slots.map((s) => `
                <tr>
                  <td><strong>${Utils.escapeHtml(s.label)}</strong>${s.slotId === 'auto' ? ' <span style="color:var(--text-faint);font-size:11px;">(AUTO)</span>' : ''}</td>
                  <td>${Utils.escapeHtml(s.schoolName)}</td>
                  <td>${Utils.escapeHtml(s.coachName)}</td>
                  <td>Wk ${s.week}, ${s.year}</td>
                  <td>${new Date(s.savedAt).toLocaleString()}</td>
                  <td style="text-align:right; white-space:nowrap;">
                    <button class="btn small" data-load="${s.slotId}">Load</button>
                    <button class="btn small" data-overwrite="${s.slotId}">Overwrite</button>
                    <button class="btn small danger" data-del="${s.slotId}">Delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table></div>`
        : '<div style="color:var(--text-dim);">No save slots yet. Your game auto-saves each week; use “Save to New Slot” for a manual checkpoint.</div>'}
      </div>`;

    container.querySelector('#btn-save-new').addEventListener('click', async () => {
      const slotId = 'slot_' + Date.now();
      try {
        await SaveManager().save(slotId, game, `${game.dynastyName} — Wk ${game.week}, ${game.year}`);
        UI.toast('Game saved.', 'success');
        render(container);
      } catch (err) {
        UI.toast('Save failed: ' + err.message, 'error');
      }
    });

    container.querySelector('#btn-export').addEventListener('click', () => {
      SaveManager().exportToFile(game);
      UI.toast('Save file downloading...', 'success');
    });

    const fileInput = container.querySelector('#import-file');
    container.querySelector('#btn-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        UI.state.game = await SaveManager().importFromFile(file);
        UI.state.currentScreen = 'dashboard';
        UI.renderShell();
        UI.toast('Save imported.', 'success');
      } catch (err) {
        UI.toast('Import failed: ' + err.message, 'error');
      }
    });

    container.querySelector('#btn-quit').addEventListener('click', async () => {
      try { await SaveManager().autoSave(game); } catch (err) { /* best-effort */ }
      UI.state.game = null;
      UI.renderShell();
    });

    container.querySelectorAll('[data-load]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const loaded = await SaveManager().load(btn.dataset.load);
          if (!loaded) { UI.toast('Slot is empty.', 'error'); return; }
          UI.state.game = loaded;
          UI.state.currentScreen = 'dashboard';
          UI.renderShell();
          UI.toast('Dynasty loaded.', 'success');
        } catch (err) {
          UI.toast('Load failed: ' + err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-overwrite]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await SaveManager().save(btn.dataset.overwrite, game, `${game.dynastyName} — Wk ${game.week}, ${game.year}`);
          UI.toast('Slot overwritten.', 'success');
          render(container);
        } catch (err) {
          UI.toast('Save failed: ' + err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await SaveManager().deleteSlot(btn.dataset.del);
        UI.toast('Save deleted.');
        render(container);
      });
    });
  }

  UI.screens.saves = { render };
})();
