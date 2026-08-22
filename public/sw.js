self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => {
        if (self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1") {
          return self.registration.unregister();
        }
      })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
