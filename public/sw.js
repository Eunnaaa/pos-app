const CACHE = "kasir-ku-shell-v2";
const SHELL = ["/", "/sign-in", "/offline", "/kasir-ku-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/dashboard/")) return;

  // Self-order dan kiosk route: aktifkan fallback offline ke cached shell.
  // Halaman publik bisa di-buka ulang saat offline (tampilan menu terakhir yang di-cache).
  const isSelfOrderRoute = url.pathname.startsWith("/order/") || url.pathname.startsWith("/kiosk/");

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match(isSelfOrderRoute ? "/offline" : "/offline")),
      ),
    );
    return;
  }

  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        }),
      ),
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "kasir-ku-sync") return;
  event.waitUntil(
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "SYNC_PENDING_TRANSACTIONS" }));
    }),
  );
});
