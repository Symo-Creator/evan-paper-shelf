/* Paper Shelf v2 — cache-first same-origin GET; precache shell + PDFs + pdf.js */
const CACHE = "paper-shelf-v2";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.webmanifest",
  "./catalog.json",
  "./icon-192.png",
  "./icon-512.png",
  "./vendor/pdfjs/pdf.min.js",
  "./vendor/pdfjs/pdf.worker.min.js",
  "./papers/Evan-Education-Money-Easy.pdf",
  "./papers/How-to-Play-VENOM.pdf",
  "./papers/Persuasion-Simple.pdf",
  "./papers/growth-sectors-whales-2026-2036-phone.pdf",
  "./papers/ilt-academy-interview-brief.pdf",
  "./papers/ilt-partner-edo-prospects.pdf",
  "./papers/isu-scholarships-research-report.pdf",
  "./papers/national-education-money-research-report.pdf",
  "./papers/people-profiling-research-paper.pdf",
  "./papers/website-agency-pipeline-playbook.pdf"
];

function tell(clients, msg) {
  return clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    list.forEach((c) => c.postMessage(msg));
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const total = PRECACHE.length;
    let done = 0;
    for (const url of PRECACHE) {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (!res.ok) throw new Error(String(res.status));
        await cache.put(url, res.clone());
      } catch (err) {
        await tell(self.clients, { type: "cache-error", url, error: String(err && err.message || err) });
        throw err;
      }
      done += 1;
      await tell(self.clients, { type: "cache-progress", done, total, url });
    }
    await tell(self.clients, { type: "cache-ready", done, total });
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    await tell(self.clients, { type: "cache-ready", done: PRECACHE.length, total: PRECACHE.length });
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "check-cache") {
    caches.open(CACHE).then(async (cache) => {
      let hit = 0;
      for (const url of PRECACHE) {
        if (await cache.match(url)) hit += 1;
      }
      const ready = hit >= PRECACHE.length;
      event.source && event.source.postMessage({
        type: ready ? "cache-ready" : "cache-progress",
        done: hit,
        total: PRECACHE.length,
        ready
      });
    });
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      if (cached) return cached;
      // SPA fallback
      const shell = await caches.match("./index.html");
      if (shell) return shell;
      throw err;
    }
  })());
});
