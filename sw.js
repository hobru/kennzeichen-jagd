/* Kennzeichen-Jagd Service Worker – App-Shell offline verfügbar machen */
importScripts("./version.js");
const CACHE = "kj-shell-v" + self.APP_VERSION;
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.js",
  "./version.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Kennzeichen-Aktualisierung immer frisch aus dem Netz
  if (url.hostname === "raw.githubusercontent.com") return;
  // Kartenkacheln: Netz zuerst, kein Dauer-Cache (wird sonst riesig)
  if (url.hostname.endsWith("openstreetmap.org")) return;

  // Fonts & Shell: Cache zuerst, sonst Netz (und nachcachen)
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (
          res.ok &&
          (url.origin === self.location.origin ||
            url.hostname === "fonts.googleapis.com" ||
            url.hostname === "fonts.gstatic.com" ||
            url.hostname === "cdnjs.cloudflare.com")
        ) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
