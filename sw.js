// Service worker: cachea la app para que funcione offline durante el turno.
// Al cambiar cualquier archivo, subí V para que el celular baje la versión nueva.
const V = 1;
const CACHE = 'nc_v' + V;
const FILES = [
  './', './index.html', './style.css', './manifest.json', './brand.js', './jspdf.umd.min.js',
  './js/db.js', './js/fotos.js', './js/pdf.js', './js/backup.js', './js/app.js',
  './icon-192.png', './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
