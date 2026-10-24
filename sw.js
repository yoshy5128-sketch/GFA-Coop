const CACHE_NAME = 'gfa-coop-pwa-v18';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './style.css?v=20261024e',
  './character-models.js?v=20261024k',
  './script.js?v=20261024o',
  './coop/coop-bootstrap.js?v=20261024n',
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
    // Do not let the browser HTTP cache seed a new app cache with an older build.
    await Promise.all(CORE_ASSETS.map(async asset => {
      const request = new Request(asset, { cache: 'no-store' });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`Failed to cache ${asset}: ${response.status}`);
      await cache.put(asset, response);
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
    // Existing tabs can otherwise keep executing the previous JavaScript until
    // the user happens to reload them. Reload each same-origin app tab once when
    // this worker version activates.
    const openClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(openClients.map(client => client.navigate(client.url).catch(() => null)));
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
        const response = await fetch(request, { cache: 'no-store' });
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
        const response = await fetch(request, { cache: 'no-store' });
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
