// Service worker: rende l'app installabile e riceve le notifiche sul telefono (anche ad app chiusa).
// Non mette niente in cache: ogni richiesta va sempre in rete, così dopo ogni push si vede subito la versione nuova.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// notifica in arrivo dal "postino" (GitHub Actions): {title, body, url, tag}
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Laurera 15·40', {
    body: d.body || '',
    icon: 'icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || './' }
  }));
});

// tocco sulla notifica: apre l'app (o la porta davanti) sulla partita o sulla scheda giusta
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        c.postMessage({ laureraApri: url });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
