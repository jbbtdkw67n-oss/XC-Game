/*
 * Boot: render the main menu (or restore nothing — loading is explicit
 * from the menu so the player always chooses their dynasty).
 *
 * Before the menu paints, best-effort load a custom world from a
 * ?world=<url> query param so a single shared link can carry an entire
 * custom universe (schools, conferences, mascots, awards, divisions,
 * meets, colors). A missing or broken link never blocks the game.
 */
(function () {
  document.addEventListener('DOMContentLoaded', async () => {
    const D = window.XCD.data;
    if (D && D.autoloadCustomWorld) {
      try { await D.autoloadCustomWorld(); } catch (e) { /* ignore */ }
    }
    window.XCD.ui.renderShell();
  });
})();
