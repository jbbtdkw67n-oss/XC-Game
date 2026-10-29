/*
 * Settings screen (Code Review Oct 2026 §4) — rendered straight from
 * Settings.SCHEMA: difficulty sliders with one-tap presets, and display
 * preferences (theme + text size).
 *
 * Difficulty sliders are multipliers read by the engine (1.0 = the game as
 * designed): recruitingCompetition (recruiting.js), injuryRate and
 * cpuDevelopment (training.js), hotSeatPatience (awards.js), and
 * prestigeVolatility (prestige.js). Display settings apply instantly via
 * UI.applyDisplaySettings and are mirrored to localStorage so the main menu
 * opens in the last theme used.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const S = () => window.XCD.engine.Settings;
  const PREF_KEY = 'xcd.displayPrefs';

  // What each difficulty slider does, in plain words, at its low and high end.
  const HINTS = {
    recruitingCompetition: { low: 'Rival staffs work fewer recruits', high: 'Rival staffs out-work you on the trail' },
    injuryRate: { low: 'Rare injuries (0 = none at all)', high: 'Bodies break down far more often' },
    hotSeatPatience: { low: 'Fired after 2 hot seasons', high: 'Up to 6 hot seasons of rope' },
    cpuDevelopment: { low: 'Rival athletes develop slower', high: 'Rival athletes develop faster' },
    prestigeVolatility: { low: 'Program prestige barely moves', high: 'Prestige swings hard on results' },
    transferPressure: { low: 'Your unhappy runners mostly stay', high: 'Benched, injured, or unhappy runners on your roster bolt for the portal' }
  };
  const GROUP_TITLES = {
    difficulty: { icon: '🎚', title: 'Difficulty', sub: '1.00× is the game as designed. Changes apply from the next week simmed.' },
    display: { icon: '🎨', title: 'Display', sub: 'How the game looks on this device.' }
  };

  /* ---------------- Display: theme + text size ---------------- */
  const systemQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  function resolveTheme(theme) {
    if (theme === 'system') return systemQuery && systemQuery.matches ? 'light' : 'dark';
    return theme === 'light' ? 'light' : 'dark';
  }
  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); } catch (e) { return null; }
  }
  function writePrefs(p) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* private mode: per-session only */ }
  }

  // Apply a dynasty's display settings (or the last-used ones on the menu).
  UI.applyDisplaySettings = function (game) {
    let theme = 'dark';
    let scale = 1;
    if (game && S()) {
      theme = S().get(game, 'theme');
      scale = S().get(game, 'textScale');
      writePrefs({ theme, textScale: scale });
    } else {
      const p = readPrefs();
      if (p) { theme = p.theme || 'dark'; scale = Number(p.textScale) || 1; }
    }
    const root = document.documentElement;
    const resolved = resolveTheme(theme);
    root.dataset.theme = resolved;
    root.style.setProperty('--ui-zoom', String(scale));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'light' ? '#f4f6fa' : '#0e1116');
  };
  if (systemQuery) {
    const flip = () => { if (S()) UI.applyDisplaySettings(UI.state.game); };
    if (systemQuery.addEventListener) systemQuery.addEventListener('change', flip);
    else if (systemQuery.addListener) systemQuery.addListener(flip);
  }
  // Before any dynasty loads, use the last-used look.
  UI.applyDisplaySettings(null);

  /* ---------------- Rendering ---------------- */
  function fmt(spec, v) {
    if (spec.key === 'textScale') return `${Math.round(v * 100)}%`;
    if (spec.key === 'hotSeatPatience') return `${v.toFixed(2)}× · ${Math.min(6, Math.max(2, Math.round(3 * v)))} seasons`;
    return `${v.toFixed(2)}×`;
  }
  function tone(spec, v) {
    if (spec.group !== 'difficulty' || v === spec.def) return '';
    // Is this setting making the game harder or easier for the player?
    const harder = spec.key === 'hotSeatPatience' ? v < spec.def : v > spec.def;
    return harder ? 'harder' : 'easier';
  }

  function sliderHtml(game, spec) {
    const v = S().get(game, spec.key);
    const pct = ((v - spec.min) / (spec.max - spec.min)) * 100;
    const defPct = ((spec.def - spec.min) / (spec.max - spec.min)) * 100;
    const h = HINTS[spec.key];
    return `<div class="set-row">
      <div class="set-row-head">
        <label for="set-${spec.key}">${Utils.escapeHtml(spec.label)}</label>
        <span class="set-value ${tone(spec, v)}" data-set-value="${spec.key}">${fmt(spec, v)}</span>
      </div>
      <div class="set-slider-wrap">
        <input type="range" class="set-slider" id="set-${spec.key}" data-set-key="${spec.key}"
          min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${v}" style="--fill:${pct}%">
        <span class="set-default-tick" style="left:${defPct}%" title="Default"></span>
      </div>
      ${h ? `<div class="set-hints"><span>${h.low}</span><span>${h.high}</span></div>` : ''}
    </div>`;
  }

  function render(container) {
    const game = UI.state.game;
    S().ensure(game);
    const schema = S().SCHEMA;
    const preset = S().currentPreset(game);
    const theme = S().get(game, 'theme');

    const difficulty = schema.filter((s) => s.group === 'difficulty');
    container.innerHTML = `
      <div class="screen-header">
        ${UI.screenTitle('Settings', 'Difficulty and display for this dynasty')}
        <div class="actions">
          <span class="phase-pill">${S().isDefault(game) ? 'All defaults' : preset ? `Difficulty: ${S().PRESETS[preset].label}` : 'Custom difficulty'}</span>
          <button class="btn" id="set-reset" ${S().isDefault(game) ? 'disabled' : ''}>↺ Reset all</button>
        </div>
      </div>
      <div class="set-grid">
        <div class="card set-card">
          ${groupHead('difficulty')}
          <div class="preset-row">
            ${Object.entries(S().PRESETS).map(([k, p]) => `<button class="preset ${preset === k ? 'active' : ''}" data-preset="${k}" title="${Utils.escapeHtml(p.desc)}">
              <span class="preset-icon">${p.icon}</span><span class="preset-label">${p.label}</span><span class="preset-desc">${Utils.escapeHtml(p.desc)}</span></button>`).join('')}
          </div>
          ${difficulty.map((s) => sliderHtml(game, s)).join('')}
        </div>
        <div class="set-side">
          <div class="card set-card">
            ${groupHead('display')}
            <div class="set-row">
              <div class="set-row-head"><label>Theme</label></div>
              <div class="theme-choices">
                ${[['dark', '🌙', 'Dark'], ['light', '☀️', 'Light'], ['system', '🖥', 'System']].map(([k, i, l]) => `
                  <button class="theme-choice ${theme === k ? 'active' : ''}" data-theme-choice="${k}">
                    <span class="theme-swatch ${k}"></span><span>${i} ${l}</span></button>`).join('')}
              </div>
            </div>
            ${sliderHtml(game, schema.find((s) => s.key === 'textScale'))}
            <div class="set-preview">Preview — <strong>Week ${game.week}</strong> · the quick brown fox runs 4:32 per mile.</div>
          </div>
        </div>
      </div>`;

    // Live slider feedback; commit on release.
    container.querySelectorAll('[data-set-key]').forEach((input) => {
      const key = input.dataset.setKey;
      const spec = schema.find((s) => s.key === key);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        input.style.setProperty('--fill', `${((v - spec.min) / (spec.max - spec.min)) * 100}%`);
        const out = container.querySelector(`[data-set-value="${key}"]`);
        if (out) { out.textContent = fmt(spec, v); out.className = `set-value ${tone(spec, v)}`; }
        if (key === 'textScale') { S().set(game, key, v); UI.applyDisplaySettings(game); }
      });
      input.addEventListener('change', () => {
        S().set(game, key, Number(input.value));
        UI.applyDisplaySettings(game);
        save(game);
        render(container);
      });
    });
    container.querySelectorAll('[data-preset]').forEach((b) => {
      b.addEventListener('click', () => {
        S().applyPreset(game, b.dataset.preset);
        UI.toast(`Difficulty set to ${S().PRESETS[b.dataset.preset].label}.`, 'success', 1800);
        save(game);
        render(container);
      });
    });
    container.querySelectorAll('[data-theme-choice]').forEach((b) => {
      b.addEventListener('click', () => {
        S().set(game, 'theme', b.dataset.themeChoice);
        UI.applyDisplaySettings(game);
        save(game);
        render(container);
      });
    });
    container.querySelector('#set-reset').addEventListener('click', () => {
      S().reset(game);
      UI.applyDisplaySettings(game);
      UI.toast('Every setting is back to its default.', 'success', 1800);
      save(game);
      render(container);
    });
  }

  function groupHead(group) {
    const g = GROUP_TITLES[group];
    return `<div class="set-group-head"><span class="set-group-icon">${g.icon}</span><div><h2>${g.title}</h2><div class="set-group-sub">${g.sub}</div></div></div>`;
  }

  async function save(game) {
    try { await window.XCD.engine.SaveManager.autoSave(game); } catch (e) { /* the next advance saves */ }
  }

  UI.screens.settings = { render };
})();
