const CACHE_NAME = 'gfa-coop-pwa-v5';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './style.css?v=20261024b',
  './character-models.js?v=20260924c',
  './script.js?v=20261024b',
  './coop/coop-bootstrap.js?v=20261024d',
  './coop/net/peer-transport.js',
  './coop/net/protocol.js',
  './vendor/three-r128.min.js',
  './vendor/nipplejs-0.8.4.js',
  './vendor/tween-18.6.4.umd.js',
  './vendor/helvetiker_regular.typeface.json',
  './icon.png',
  './icon-192.png',
  './icon-512.png',
  './logo.png',
  './back.jpg',
  './barrel_hazard.png',
  './door.png',
  './window.png',
  './opm.mp3',
  './bgm/tracklist.json'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', response.clone());
        return response;
      } catch (error) {
        return (await caches.match(request)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  const isCode = request.destination === 'script' || request.destination === 'style';
  if (url.origin === self.location.origin && isCode) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return caches.match(request);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  })());
});
