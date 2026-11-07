// BNSF Asset Readiness — keeps the app itself on the phone so it opens with no
// signal (Cody 2026-11-07).
//  - Our own page + files: network first (always the newest build when there
//    is signal), the saved copy when there isn't or the reply is too slow.
//  - ArcGIS JS 4.29 files: saved the first time they're used (that version
//    never changes).
// Data, sign-in and map tiles are NOT handled here: the page keeps its own data
// copy in IndexedDB, and edits (POST) never touch this worker.
const SHELL_CACHE = "ar-shell-v4";
const LIB_CACHE = "ar-arcgis-4.29";
const SHELL = ["./", "bnsf-hazmat-logo.png", "favicon.png", "instructions.html", "manifest.webmanifest",
               "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== SHELL_CACHE && k !== LIB_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("slow")), ms))]);
const scopePath = new URL("./", self.location).pathname;

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);

  if (u.origin === self.location.origin && u.pathname.startsWith(scopePath) && !u.pathname.endsWith("/sw.js")) {
    const isPage = req.mode === "navigate";
    const key = isPage ? "./" : u.pathname;
    e.respondWith((async () => {
      const c = await caches.open(SHELL_CACHE);
      try {
        const r = await within(fetch(req), isPage ? 6000 : 10000);
        if (r.ok) c.put(key, r.clone());
        return r;
      } catch (err) {
        const hit = await c.match(key, { ignoreSearch: true });
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  if (u.hostname === "js.arcgis.com" && u.pathname.startsWith("/4.29/")) {
    e.respondWith((async () => {
      const c = await caches.open(LIB_CACHE);
      const hit = await c.match(req.url);
      if (hit) return hit;
      let r;
      try { r = await fetch(new Request(req.url, { mode: "cors", credentials: "omit" })); }
      catch (err) { r = await fetch(req); }
      if (r && (r.ok || r.type === "opaque")) c.put(req.url, r.clone());
      return r;
    })());
  }
});
