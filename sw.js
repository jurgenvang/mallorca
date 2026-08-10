/* Service worker: laat de reisplanner offline werken zonder de app
   vast te zetten op een oude versie.

   Regel: voor de app zelf gaat het netwerk voor, en dient de cache als
   vangnet. Alleen als er geen verbinding is, komt de bewaarde versie terug.
   Zo zie je na een nieuwe publicatie meteen de laatste versie.                */

const VERSIE = '2026.08.09-2';
const CACHE = 'canyamel-' + VERSIE;
const CORE = ['./', './index.html', './Mallorca_Canyamel_10-19_augustus_2026.pdf',
              './Boodschappen_Canyamel.pdf'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* De pagina kan vragen om onmiddellijk over te schakelen. */
self.addEventListener('message', e => {
  if (e.data === 'neem-over') self.skipWaiting();
});

function bewaar(req, res) {
  if (res && res.ok) {
    const kopie = res.clone();
    caches.open(CACHE).then(c => c.put(req, kopie));
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Serverfuncties nooit bewaren: die moeten altijd vers zijn. */
  if (url.pathname.includes('/functions/') || url.pathname.startsWith('/api/')) return;

  /* Weer- en treindata: netwerk eerst, laatst bekende versie als vangnet. */
  if (url.hostname.endsWith('open-meteo.com') || url.hostname.endsWith('irail.be')) {
    e.respondWith(
      fetch(req).then(res => bewaar(req, res)).catch(() => caches.match(req))
    );
    return;
  }

  /* De app zelf: netwerk eerst, cache als vangnet.
     Zo kan een nieuwe publicatie nooit blijven hangen achter een oude versie. */
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => bewaar(req, res))
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }
});
