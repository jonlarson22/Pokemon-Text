const CACHE_NAME = 'Pokémon_Text-v0.1';

// List every file your game needs to run offline
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './favicon.ico',
  './manifest.json',
  // JS Files
  './js/app.js',
  './js/battle.js',
  './js/captures.js',
  './js/facilities.js',
  './js/growth.js',
  './js/interactions.js',
  './js/pokemon_factory.js',
  './js/storage.js',
  './js/ui.js',
  // JSON Data Files
  './data/gyms.json',
  './data/items.json',
  './data/moves.json',
  './data/npcs.json',
  './data/pokemon.json',
  './data/routes.json',
  './data/shops.json',
  './data/trainers.json',
  './data/type_chart.json'
];

// Install Event: Cache all critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean up old caches if you update the game version
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clientsClaim();
});

// Fetch Event: Serve cached files when offline, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // Optional: You can return a fallback offline page/message here if a new network request fails
      });
    })
  );
});
