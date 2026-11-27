/* TravelPlans offline support v1. Registered by theme.js as sw.js?v=<build> (CI stamps the build id), so every
   deploy installs a fresh copy and drops the old cache.
   Network first: online readers always get the live site; when the network fails (airport, roaming, a flight),
   pages, styles, scripts and trip data come from the copy saved on the last visit. Same-origin GET only;
   Google Fonts and other hosts are left alone (the pages fall back to system fonts). */
var BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
var CACHE = 'travelplans-' + BUILD;
// Everything a reader needs offline. tools/check_site.py fails the deploy if any of these files is missing.
var PRECACHE = [
  './', 'index.html', 'winter-2027.html', 'planner.html', 'paperwork.html', 'visa-pack.html', 'changes.html', '404.html',
  'styles.css', 'theme.js', 'version.js', 'planner.js', 'paperwork.js', 'visapack.js',
  'data/winter-2027.json', 'data/visa-pack.json', 'icon.svg', 'icon-192.png', 'manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // cache: 'reload' skips the HTTP cache so the saved copy matches this build
    return Promise.all(PRECACHE.map(function (u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(u, r); });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('travelplans-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.searchParams.has('vcheck')) return; // version.js asks the network directly
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok && res.type === 'basic') {
      var copy = res.clone();
      // One saved copy per file: the key drops ?v=... so the next build's links still find it
      caches.open(CACHE).then(function (c) { c.put(url.origin + url.pathname, copy); });
    }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return c.match('index.html');
        return Response.error();
      });
    });
  }));
});
