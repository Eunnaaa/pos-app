/* Kedai-Ku production service worker.
 *
 * Business mutations are intentionally NOT intercepted here. They are queued by
 * lib/offline/queue.ts with their idempotency key and replayed by the page when
 * connectivity returns. This worker only makes the application shell resilient.
 */
const CACHE_VERSION = "kedai-ku-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/kedai-ku-icon.svg",
  "/kedai-ku-icon-maskable.svg",
  "/kedai-ku-icon-192.png",
  "/kedai-ku-icon-512.png",
  "/kedai-ku-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(async (cache) => {
        // One unavailable optional icon must not prevent worker installation.
        await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("kedai-ku-") && ![STATIC_CACHE, PAGE_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith("/_next/static/")
    || /\.(?:css|js|woff2?|png|jpe?g|webp|gif|ico|svg)$/.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    // Cache public pages only. Authenticated dashboard HTML can contain tenant
    // context and must never survive logout in a shared device cache.
    const url = new URL(request.url);
    const isPublicPage = !url.pathname.includes("/dashboard") && !url.pathname.includes("/onboarding");
    if (response.ok && response.type === "basic" && isPublicPage) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request))
      || (await caches.match(OFFLINE_URL))
      || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Authentication and API responses are never cached. This prevents stale
  // tenant data and session responses from leaking on shared POS hardware.
  if (
    url.origin !== self.location.origin
    || url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/api/auth/")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) event.respondWith(cacheFirst(request));
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: "SYNC_PENDING_TRANSACTIONS" });
}

self.addEventListener("sync", (event) => {
  if (event.tag === "kedai-ku-sync") event.waitUntil(notifyClientsToSync());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_APP_CACHES") {
    event.waitUntil(Promise.all([caches.delete(STATIC_CACHE), caches.delete(PAGE_CACHE)]));
  }
});
