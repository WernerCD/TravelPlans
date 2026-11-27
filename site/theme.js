/* TravelPlans theme toggle v2 (same pattern as the D&D Toolbox theme.js): one key, travel.theme.
   v2 also registers the offline service worker (sw.js) and shows a bar while the reader is offline. */
(function () {
  var KEY = 'travel.theme';
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  var t = get(KEY);
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  var btn = document.getElementById('themeBtn');
  if (btn) btn.addEventListener('click', function () {
    var cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    set(KEY, next);
  });

  // Offline support: sw.js keeps a copy of every page and the trip data for reading without a connection.
  // Registered next to this script (so it also works from 404.html); CI stamps ?v=dev with the build id.
  var me = document.currentScript && document.currentScript.src;
  if (me && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(new URL('sw.js?v=dev', me).href).catch(function () { /* not fatal */ });
    });
  }
  var bar = null;
  function offline(on) {
    if (on && !bar) {
      bar = document.createElement('div');
      bar.className = 'offline-bar';
      bar.setAttribute('role', 'status');
      bar.textContent = 'You are offline. Showing the copy saved on your last visit; prices and rules may have changed since.';
      document.body.insertBefore(bar, document.body.firstChild);
    } else if (!on && bar) { bar.remove(); bar = null; }
  }
  window.addEventListener('offline', function () { offline(true); });
  window.addEventListener('online', function () { offline(false); });
  if (navigator.onLine === false) offline(true);
})();
