/*
 * Store engine — the transaction layer behind the in-game Shop.
 *
 * This is groundwork, shipped deliberately empty: the Shop screen renders a
 * storefront, but the catalog has no purchasable items yet and no money can
 * move. When real products arrive (cosmetics, dynasty packs, supporter
 * upgrades), they plug into this API without touching the UI or the save
 * system:
 *
 *   - getCatalog()        → [] today; future items: { id, name, price, ... }
 *   - isAvailable()       → false until a payment provider is wired in. On
 *                           iOS that will be StoreKit via a Capacitor plugin;
 *                           on the web, a hosted checkout.
 *   - purchase(itemId)    → resolves { ok:false, reason:'unavailable' } until
 *                           then — nothing in the game may assume it succeeds.
 *   - ownedItems() / grant(itemId)
 *                         → entitlements, persisted per device in
 *                           localStorage under one namespaced key so they
 *                           survive app updates and are independent of any
 *                           single dynasty save.
 */
(function () {
  const Store = {};
  const LS_KEY = 'xcd-entitlements-v1';

  /* ---------------- Catalog ---------------- */
  // Future items register here. Empty by design — the Shop shows its
  // storefront shell until real products ship.
  const CATALOG = [];

  Store.getCatalog = function () { return CATALOG.slice(); };
  Store.getItem = function (itemId) { return CATALOG.find((i) => i.id === itemId) || null; };

  /* ---------------- Availability ---------------- */
  // False until a payment provider (StoreKit / web checkout) is connected.
  Store.isAvailable = function () { return false; };

  /* ---------------- Entitlements ---------------- */
  function readOwned() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }
  function writeOwned(list) {
    try {
      if (window.localStorage) window.localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch (e) { /* private-mode/quota failures must never break the game */ }
  }

  Store.ownedItems = function () { return readOwned(); };
  Store.owns = function (itemId) { return readOwned().includes(itemId); };
  Store.grant = function (itemId) {
    const owned = readOwned();
    if (!owned.includes(itemId)) { owned.push(itemId); writeOwned(owned); }
    return owned;
  };

  /* ---------------- Purchase ---------------- */
  // Async by contract: a real provider round-trips to a payment sheet.
  Store.purchase = async function (itemId) {
    if (!Store.isAvailable()) return { ok: false, reason: 'unavailable' };
    const item = Store.getItem(itemId);
    if (!item) return { ok: false, reason: 'unknown_item' };
    // Provider flow goes here; on success: Store.grant(itemId).
    return { ok: false, reason: 'unavailable' };
  };

  window.XCD.engine.Store = Store;
})();
