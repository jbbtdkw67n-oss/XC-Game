/*
 * Service worker (Update 13 — iPhone groundwork): precaches the whole game
 * so it loads instantly and works fully offline once installed to a home
 * screen. The game is a static bundle with no backend, so cache-first is
 * always correct; bump CACHE_VERSION whenever shipped files change to make
 * installed players pick up a new build.
 */
const CACHE_VERSION = 'xcd-v3';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './js/core/namespace.js',
  './js/core/rng.js',
  './js/core/utils.js',
  './js/data/constants.js',
  './js/data/divisions.js',
  './js/data/names.js',
  './js/data/schools-data.js',
  './js/data/schools-lower.js',
  './js/data/schools-meta.js',
  './js/models/models.js',
  './js/engine/worldgen.js',
  './js/engine/recruiting.js',
  './js/engine/training.js',
  './js/engine/races.js',
  './js/engine/rankings.js',
  './js/engine/scheduling.js',
  './js/engine/portal.js',
  './js/engine/awards.js',
  './js/engine/newsengine.js',
  './js/engine/finances.js',
  './js/engine/legacy.js',
  './js/engine/goat.js',
  './js/engine/morale.js',
  './js/engine/coaching.js',
  './js/engine/prestige.js',
  './js/engine/careers.js',
  './js/engine/gamestate.js',
  './js/engine/savemanager.js',
  './js/engine/store.js',
  './js/ui/framework.js',
  './js/ui/avatar.js',
  './js/ui/coachwizard.js',
  './js/ui/screens/playercard.js',
  './js/ui/screens/coachcard.js',
  './js/ui/screens/schoolcard.js',
  './js/ui/screens/menu.js',
  './js/ui/screens/dashboard.js',
  './js/ui/screens/roster.js',
  './js/ui/screens/recruiting.js',
  './js/ui/screens/training.js',
  './js/ui/screens/schedule.js',
  './js/ui/screens/racecenter.js',
  './js/ui/screens/rankings.js',
  './js/ui/screens/portal.js',
  './js/ui/screens/history.js',
  './js/ui/screens/school.js',
  './js/ui/screens/world.js',
  './js/ui/screens/news.js',
  './js/ui/screens/shop.js',
  './js/ui/screens/saves.js',
  './js/main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request))
  );
});
