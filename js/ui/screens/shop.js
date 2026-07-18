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

  const SECTIONS = [
    {
      icon: '🎽',
      name: 'Team Identity',
      desc: 'Premium uniform sets, alternate colorways, and custom race-day looks for your program.'
    },
    {
      icon: '🏟️',
      name: 'Dynasty Packs',
      desc: 'Expansion content: historic scenarios, legendary recruiting classes, and new league formats.'
    },
    {
      icon: '⭐',
      name: 'Supporter',
      desc: 'Back the development of XC Dynasty and pick up an exclusive founder badge for your coach profile.'
    }
  ];

  function render(container) {
    const store = window.XCD.engine.Store;
    const catalog = store ? store.getCatalog() : [];

    container.innerHTML = `
      <div class="screen-header">
        <h1>Shop</h1>
      </div>
      <div class="shop-hero">
        <h2>The XC Dynasty Shop</h2>
        <p>Gear, expansions, and ways to support the game — all in one place. The shelves are being
           stocked: everything below arrives in a future update. No purchases are available yet.</p>
      </div>
      <div class="shop-grid">
        ${SECTIONS.map((s) => `
          <div class="shop-card">
            <span class="shop-soon">Coming Soon</span>
            <div class="shop-icon">${s.icon}</div>
            <div class="shop-name">${s.name}</div>
            <div class="shop-desc">${s.desc}</div>
          </div>`).join('')}
        ${catalog.map((item) => `
          <div class="shop-card">
            <div class="shop-icon">${item.icon || '🛒'}</div>
            <div class="shop-name">${item.name}</div>
            <div class="shop-desc">${item.desc || ''}</div>
          </div>`).join('')}
      </div>
      <div class="shop-footnote">
        Everything that affects competition — recruiting, training, racing — stays earned on the course,
        never bought. The Shop is for cosmetics, content, and supporting development.
      </div>`;
  }

  UI.screens.shop = { render };
})();
