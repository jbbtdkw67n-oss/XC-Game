/*
 * Shop screen — the XC Dynasty storefront.
 *
 * Lives in the main navigation alongside My Program and Race Center. Today
 * it presents the storefront shell (categories, branding, the promise);
 * purchasable items arrive in a future update through XCD.engine.Store,
 * which already carries the catalog/entitlement/purchase plumbing.
 */
(function () {
  const UI = window.XCD.ui;

  function render(container) {
    const store = window.XCD.engine.Store;
    const catalog = store ? store.getCatalog() : [];

    container.innerHTML = `
      <div class="screen-header">
        <h1>Shop</h1>
      </div>
      <div class="shop-hero">
        <h2>The XC Dynasty Shop</h2>
        <p>Gear, expansions, and ways to support the game — all in one place.</p>
      </div>
      ${catalog.length ? `
        <div class="shop-grid">
          ${catalog.map((item) => `
            <div class="shop-card">
              <div class="shop-icon">${item.icon || '🛒'}</div>
              <div class="shop-name">${item.name}</div>
              <div class="shop-desc">${item.desc || ''}</div>
            </div>`).join('')}
        </div>` : `
        <div class="shop-empty">
          <div class="shop-empty-icon">🛒</div>
          <div class="shop-empty-title">Nothing here yet</div>
          <div class="shop-empty-sub">The shelves are empty for now — check back in a future update.</div>
        </div>`}`;
  }

  UI.screens.shop = { render };
})();
