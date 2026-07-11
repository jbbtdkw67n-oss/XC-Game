/*
 * Boot: render the main menu (or restore nothing — loading is explicit
 * from the menu so the player always chooses their dynasty).
 */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    window.XCD.ui.renderShell();
  });
})();
