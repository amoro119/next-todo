// Service Worker for NEXT TODO PWA
// Enables installability and provides offline caching for app shell assets.

const CACHE_NAME = "next-todo-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/manifest.json",
  "/favicon.png",
];

// Install: cache app shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch: network-first with cache fallback for navigation, cache-first for assets
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET requests and Supabase/chrome-extension requests
  if (request.method !== "GET") return;
  if (request.url.includes("supabase.co") || request.url.startsWith("chrome-extension://")) return;

  // Navigation requests: network-first (app is CSR, needs fresh HTML)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match("/");
      })
    );
    return;
  }

  // Static assets: cache-first with network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      });
      return cached || fetched;
    })
  );
});
