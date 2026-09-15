// Service Worker de Metrics Performance — versión con auto-actualización.
//
// EL PROBLEMA QUE ESTO ARREGLA: un Service Worker "cachea" los archivos de la app para que funcione
// offline/instalada. Por diseño estándar, cuando subís una versión nueva del código, el navegador la
// descarga en segundo plano pero la deja "esperando" — sigue usando la vieja hasta que cerrás TODAS las
// pestañas/la app por completo. Eso es justo lo que te obligaba a borrar la app del celular y reinstalarla
// cada vez que subíamos un cambio.
//
// La solución tiene dos partes:
// 1) CACHE_VERSION: cambiar este número (o cualquier parte del string) en cada actualización real que
//    subas fuerza a que el navegador vea el archivo como "distinto" y dispare la actualización.
// 2) skipWaiting() + clients.claim(): hacen que la versión nueva tome el control DE INMEDIATO, sin esperar
//    a que cierres la app — el próximo `fetch` ya la usa.
// 3) Estrategia "network-first": para los archivos del propio dashboard (HTML/CSS/JS), siempre intenta
//    bajar la versión más nueva de internet primero, y solo usa la copia guardada si no hay conexión.
//    Así, con internet, jamás ves una versión vieja aunque el Service Worker no se haya "actualizado" del
//    todo — el offline sigue funcionando igual de bien como respaldo.
const CACHE_VERSION = 'metrics-performance-v2';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './i18n.js',
  './metrics.js',
  './gk-metrics.js',
  './calculations.js',
  './csv-parsing.js',
  './auth.js',
  './club-settings.js',
  './mode-views.js',
  './roster-admin.js',
  './club-admin.js',
  './pending-requests.js',
  './notifications.js',
  './gk-admin.js',
  './gk-data.js',
  './gk-player-view.js',
  './home-dashboard.js',
  './microcycle-table.js',
  './selection-render.js',
  './player-risk.js',
  './player-detail.js',
  './acwr-panel.js',
  './evolution-charts.js',
  './compare.js',
  './matches.js',
  './efficiency.js',
  './wellness-rpe.js',
  './download-image.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.warn('SW: no se pudo precachear el app shell completo', err))
  );
  self.skipWaiting(); // no esperar a que se cierren las pestañas — activar esta versión ya mismo
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION) // borra cachés de versiones anteriores
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim()) // toma control de las pestañas ya abiertas, sin recargar
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // no interceptar POST/PUT (llamadas a Supabase, etc.)

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        // con internet: siempre la versión más nueva, y de paso actualiza la copia guardada
        const copy = networkResponse.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        return networkResponse;
      })
      .catch(() =>
        // sin internet: recién ahí cae a la copia guardada
        caches.match(req).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
