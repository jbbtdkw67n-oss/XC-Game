/*
 * Settings engine — per-dynasty difficulty sliders, feature flags, and
 * presentation preferences (groundwork, Code Review Oct 2026 §4).
 *
 * Shipped deliberately inert: every slider defaults to 1.0 and every flag to
 * off, and no engine system reads them yet, so a dynasty plays exactly as it
 * did before. Future work plugs in without touching the save format:
 *
 *   - Settings.get(game, key)      → the current value (default if unset)
 *   - Settings.mult(game, key)     → a slider as a multiplier (1.0 = default)
 *   - Settings.set(game, key, v)   → validated + clamped; returns the value
 *   - Settings.reset(game)         → everything back to defaults
 *   - Settings.isDefault(game)     → true when nothing was changed
 *
 * Planned hook points (multiply the existing number by Settings.mult):
 *   recruitingCompetition → CPU board strength (recruiting.js, processWeek)
 *   injuryRate            → injury roll chance (training.js, rollInjury)
 *   hotSeatPatience       → divides hot-seat gain + podium streak length
 *                           (awards.js coachFirings, predictions.js evaluate)
 *   cpuDevelopment        → CPU weekly dev points (training.js, devPoints)
 *   prestigeVolatility    → the yearly prestige delta (prestige.js)
 *
 * Settings live on gameState.settings and round-trip with the save; saves
 * from before this module simply load with the defaults.
 */
(function () {
  const Settings = {};

  // type: 'slider' (number in [min, max]) | 'flag' (boolean) | 'choice' (one of options)
  const SCHEMA = [
    { key: 'recruitingCompetition', type: 'slider', group: 'difficulty', label: 'CPU recruiting strength', min: 0.5, max: 1.5, step: 0.05, def: 1 },
    { key: 'injuryRate',            type: 'slider', group: 'difficulty', label: 'Injury frequency',        min: 0,   max: 2,   step: 0.05, def: 1 },
    { key: 'hotSeatPatience',       type: 'slider', group: 'difficulty', label: 'Hot Seat patience',       min: 0.5, max: 2,   step: 0.05, def: 1 },
    { key: 'cpuDevelopment',        type: 'slider', group: 'difficulty', label: 'CPU athlete development', min: 0.5, max: 1.5, step: 0.05, def: 1 },
    { key: 'prestigeVolatility',    type: 'slider', group: 'difficulty', label: 'Prestige volatility',     min: 0.5, max: 1.5, step: 0.05, def: 1 },
    { key: 'godMode',               type: 'flag',   group: 'sandbox',    label: 'God Mode (edit anything)', def: false },
    { key: 'theme',                 type: 'choice', group: 'display',    label: 'Theme', options: ['dark', 'light', 'system'], def: 'dark' },
    { key: 'textScale',             type: 'slider', group: 'display',    label: 'Text size',               min: 0.85, max: 1.3, step: 0.05, def: 1 }
  ];
  const BY_KEY = {};
  SCHEMA.forEach((s) => { BY_KEY[s.key] = s; });

  Settings.SCHEMA = SCHEMA;

  Settings.defaults = function () {
    const out = {};
    SCHEMA.forEach((s) => { out[s.key] = s.def; });
    return out;
  };

  // Coerce a stored value into the schema's domain (old/edited saves included).
  function normalize(spec, value) {
    if (spec.type === 'flag') return value === true;
    if (spec.type === 'choice') return spec.options.includes(value) ? value : spec.def;
    const n = Number(value);
    if (!Number.isFinite(n)) return spec.def;
    // Snap to the slider's step, then clamp (so 1.0000001 stores as 1).
    const snapped = +(Math.round(n / spec.step) * spec.step).toFixed(2);
    return Math.min(spec.max, Math.max(spec.min, snapped));
  }

  // Make sure gameState.settings exists and every known key is valid.
  // Unknown keys (from a newer build) are kept untouched.
  Settings.ensure = function (gameState) {
    const cur = (gameState.settings && typeof gameState.settings === 'object') ? gameState.settings : {};
    SCHEMA.forEach((s) => { cur[s.key] = s.key in cur ? normalize(s, cur[s.key]) : s.def; });
    gameState.settings = cur;
    return cur;
  };

  Settings.get = function (gameState, key) {
    const spec = BY_KEY[key];
    if (!spec) return undefined;
    const v = gameState && gameState.settings ? gameState.settings[key] : undefined;
    return v === undefined ? spec.def : v;
  };

  Settings.mult = function (gameState, key) {
    const spec = BY_KEY[key];
    if (!spec || spec.type !== 'slider') return 1;
    return Settings.get(gameState, key);
  };

  Settings.set = function (gameState, key, value) {
    const spec = BY_KEY[key];
    if (!spec) throw new Error('Unknown setting: ' + key);
    Settings.ensure(gameState);
    gameState.settings[key] = normalize(spec, value);
    return gameState.settings[key];
  };

  Settings.reset = function (gameState) {
    gameState.settings = Settings.defaults();
    return gameState.settings;
  };

  Settings.isDefault = function (gameState) {
    return SCHEMA.every((s) => Settings.get(gameState, s.key) === s.def);
  };

  window.XCD.engine.Settings = Settings;
})();
