const CACHE_NAME = "next-todo-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;
  if (request.url.includes("supabase.co") || request.url.startsWith("chrome-extension://")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(request) || Response.error())
    );
    return;
  }

  if (/\/_next\/static\//.test(request.url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetched = fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
        return cached || fetched;
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request) || Response.error())
  );
});
