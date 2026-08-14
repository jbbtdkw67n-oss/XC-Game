/*
 * News screen: full news log for the dynasty.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  function render(container) {
    const game = UI.state.game;
    container.innerHTML = `
      <div class="screen-header"><h1>News</h1></div>
      <div class="card">
        ${game.newsLog.length
          ? game.newsLog.map((n) => `
              <div class="news-item">
                <span class="when">Wk ${n.week}, ${n.year}</span>${Utils.escapeHtml(n.text)}
              </div>`).join('')
          : '<div style="color:var(--text-dim);">Nothing has happened yet. Advance the week to get the season moving.</div>'}
      </div>`;
  }

  UI.screens.news = { render };
})();
