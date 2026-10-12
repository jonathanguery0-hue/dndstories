// Service worker : permet d'installer le jeu comme une application.
// Stratégie « réseau d'abord » : on récupère toujours la dernière version du jeu,
// et on se rabat sur la copie en cache seulement hors connexion.

const CACHE = "contes-dragons-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const cle of await caches.keys()) if (cle !== CACHE) await caches.delete(cle);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const reponse = await fetch(req);
      if (reponse.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, reponse.clone());
      }
      return reponse;
    } catch (err) {
      const enCache = await caches.match(req, { ignoreSearch: true });
      if (enCache) return enCache;
      throw err;
    }
  })());
});
