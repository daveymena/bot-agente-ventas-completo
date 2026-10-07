/* VentasPro SW v1: shell offline + push del negocio.
   Instalable como APK vía TWA (Bubblewrap) apuntando a https://ventasproia.com */

const CACHE = "ventaspro-shell-v1";
const SHELL = ["/", "/manifest.json", "/favicon.svg", "/icono-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Solo cacheamos lo nuestro; API y externos siempre a red.
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok && (url.pathname.match(/\.(js|css|png|svg|jpg|webp|woff2?)$/))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match("/"))),
  );
});

// ── Push (Web Push VAPID, sin Firebase) ──
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { cuerpo: event.data ? event.data.text() : "" }; }
  const titulo = d.titulo || "VentasPro";
  const cuerpo = d.cuerpo || "Tienes una novedad en tu negocio.";
  const url = d.url || "/conversaciones";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: "/icono-192.png",
      badge: "/favicon.svg",
      tag: d.tag || "ventaspro",
      renotify: true,
      data: { url },
      actions: d.accion ? [{ action: "abrir", title: d.accion }] : [{ action: "abrir", title: "Abrir" }],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/conversaciones";
  const full = new URL(url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === full || (url.startsWith("/") && w.url.startsWith(self.location.origin + url))) {
          return w.focus();
        }
      }
      return self.clients.openWindow(full);
    }),
  );
});
