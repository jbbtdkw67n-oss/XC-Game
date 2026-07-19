/*
 * Cross Country Dynasty
 * Global namespace. All modules attach to window.XCD to avoid needing
 * ES module loading (so the game can be opened directly from disk via
 * file:// without CORS issues, or served from any static host).
 */
window.XCD = window.XCD || {
  core: {},
  data: {},
  models: {},
  engine: {},
  ui: { screens: {} },
  VERSION: '12.2.0'
};
