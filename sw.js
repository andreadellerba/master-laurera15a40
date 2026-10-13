// Service worker minimo: serve solo a rendere l'app installabile (Chrome/Edge su PC
// e Android). Non mette niente in cache: ogni richiesta va sempre in rete, così
// dopo ogni push si vede subito la versione nuova.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
