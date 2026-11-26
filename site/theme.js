/* TravelPlans theme toggle v1 (same pattern as the D&D Toolbox theme.js): one key, travel.theme. */
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
})();
