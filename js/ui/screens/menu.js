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

  function renderCoachCreation(root, seed, world, prev = {}) {
    const D = window.XCD.data;
    let archetype = prev.archetype || null;
    let portrait = prev.portrait || D.COACH_PORTRAITS[0];
    let trainingPhilo = prev.trainingPhilosophy || 'balanced';
    let racePhilo = prev.racePhilosophy || 'even';
    let startRole = prev.startRole || 'Head';

    root.innerHTML = `
      <div id="menu-root">
        <div class="menu-panel" style="width:min(640px,94vw);">
          <h1 style="font-size:22px;">Create Your <span>Coach</span></h1>
          <p class="tagline">Step 1 of 2 — every dynasty starts with a coach. Who are you?</p>
          <div class="grid cols-2">
            <div class="field"><label>First Name</label><input id="coach-first" value="${Utils.escapeHtml(prev.first || 'Alex')}" maxlength="20"></div>
            <div class="field"><label>Last Name</label><input id="coach-last" value="${Utils.escapeHtml(prev.last || 'Carter')}" maxlength="20"></div>
          </div>
          <div class="field"><label>Dynasty Name</label><input id="dyn-name" value="${Utils.escapeHtml(prev.dynName || '')}" placeholder="e.g. The Carter Era" maxlength="40"></div>
          <div class="field">
            <label>Portrait</label>
            <div class="portrait-row">
              ${D.COACH_PORTRAITS.map((p) => `
                <button type="button" class="portrait-pick ${p === portrait ? 'selected' : ''}" data-portrait="${p}">${p}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>Starting Role <span style="color:var(--text-faint); font-weight:400;">— begin your career as a program's head coach, or work up from a recruiting-only assistant job</span></label>
            <div class="archetype-grid" id="role-grid">
              <div class="archetype-card ${startRole === 'Head' ? 'selected' : ''}" data-role="Head">
                <div class="arch-name">🎖 Head Coach</div>
                <div class="arch-desc">Full control: training, scheduling, race strategy, redshirts, and recruiting (manual or auto).</div>
              </div>
              <div class="archetype-card ${startRole === 'Assistant' ? 'selected' : ''}" data-role="Assistant">
                <div class="arch-name">📋 Assistant Coach</div>
                <div class="arch-desc">Run recruiting only under an established head coach. Build a recruiting reputation to earn head-coach offers.</div>
              </div>
            </div>
          </div>
          <div class="field">
            <label>Coaching Archetype</label>
            <div class="archetype-grid">
              ${D.COACH_ARCHETYPES.map((a) => `
                <div class="archetype-card ${archetype === a.key ? 'selected' : ''}" data-arch="${a.key}">
                  <div class="arch-name">${a.icon} ${a.key}</div>
                  <div class="arch-desc">${a.desc}</div>
                </div>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>Training Philosophy <span style="color:var(--text-faint); font-weight:400;">— permanent; its effectiveness scales with your Training rating</span></label>
            <div class="archetype-grid" id="tp-grid" style="max-height:190px; overflow-y:auto;">
              ${D.TRAINING_PHILOSOPHIES.map((tp) => `
                <div class="archetype-card ${trainingPhilo === tp.key ? 'selected' : ''}" data-tp="${tp.key}">
                  <div class="arch-name">${tp.icon} ${tp.label}</div>
                  <div class="arch-desc">${tp.desc}</div>
                </div>`).join('')}
            </div>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>Race Philosophy <span style="color:var(--text-faint); font-weight:400;">— can be changed anytime later</span></label>
            <div class="portrait-row" id="rp-row" style="flex-wrap:wrap;">
              ${D.RACE_PHILOSOPHIES.map((rp) => `
                <button type="button" class="portrait-pick ${racePhilo === rp.key ? 'selected' : ''}" data-rp="${rp.key}" title="${rp.desc.replace(/&amp;/g, '&')}" style="width:auto; padding:6px 12px; font-size:13px;">${rp.icon} ${rp.label}</button>`).join('')}
            </div>
          </div>
          <div style="display:flex; gap:10px; margin-top:14px;">
            <button class="btn" id="btn-back">← Back</button>
            <button class="btn primary" id="btn-next" style="flex:1;" disabled>Next: Choose Your School →</button>
          </div>
        </div>
      </div>`;

    const nextBtn = root.querySelector('#btn-next');
    const refresh = () => { nextBtn.disabled = !archetype; };
    refresh();

    root.querySelectorAll('[data-arch]').forEach((el) => {
      el.addEventListener('click', () => {
        archetype = el.dataset.arch;
        root.querySelectorAll('[data-arch]').forEach((n) => n.classList.toggle('selected', n.dataset.arch === archetype));
        refresh();
      });
    });
    root.querySelectorAll('[data-role]').forEach((el) => {
      el.addEventListener('click', () => {
        startRole = el.dataset.role;
        root.querySelectorAll('[data-role]').forEach((n) => n.classList.toggle('selected', n.dataset.role === startRole));
      });
    });
    root.querySelectorAll('[data-portrait]').forEach((el) => {
      el.addEventListener('click', () => {
        portrait = el.dataset.portrait;
        root.querySelectorAll('[data-portrait]').forEach((n) => n.classList.toggle('selected', n.dataset.portrait === portrait));
      });
    });
    root.querySelectorAll('[data-tp]').forEach((el) => {
      el.addEventListener('click', () => {
        trainingPhilo = el.dataset.tp;
        root.querySelectorAll('[data-tp]').forEach((n) => n.classList.toggle('selected', n.dataset.tp === trainingPhilo));
      });
    });
    root.querySelectorAll('[data-rp]').forEach((el) => {
      el.addEventListener('click', () => {
        racePhilo = el.dataset.rp;
        root.querySelectorAll('[data-rp]').forEach((n) => n.classList.toggle('selected', n.dataset.rp === racePhilo));
      });
    });

    root.querySelector('#btn-back').addEventListener('click', () => renderMainMenu(root));
    nextBtn.addEventListener('click', () => {
      const coach = {
        first: root.querySelector('#coach-first').value.trim() || 'Alex',
        last: root.querySelector('#coach-last').value.trim() || 'Carter',
        dynName: root.querySelector('#dyn-name').value.trim(),
        archetype,
        portrait,
        trainingPhilosophy: trainingPhilo,
        racePhilosophy: racePhilo,
        startRole
      };
      renderSchoolSelect(root, seed, world, coach);
    });
  }

  function renderSchoolSelect(root, seed, world, coach) {
    const D = window.XCD.data;
    const schools = Object.values(world.schools)
      .sort((a, b) => a.name.localeCompare(b.name));

    let selectedId = null;
    let divFilter = 'DI'; // most players start in the division they know

    const DIV_TABS = [['DI', 'Division I'], ['DII', 'Division II'], ['DIII', 'Division III']]
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
        trainingPhilosophy: coach.trainingPhilosophy,
        racePhilosophy: coach.racePhilosophy,
        startRole: coach.startRole,
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
