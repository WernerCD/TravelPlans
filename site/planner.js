/* TravelPlans trip planner v2: ranks destinations from data/<trip>.json by the reader's own weights,
   and works out cost for the chosen nights, the paperwork start date, and events that fall in the dates.
   Settings are remembered per browser under travel.planner.<trip>; a #s=... link carries them to someone else
   (the link wins over saved settings). */
(function () {
  var root = document.getElementById('picker');
  if (!root) return;
  var TRIP = root.dataset.trip;
  var KEY = 'travel.planner.' + TRIP;
  var DEFAULTS = { start: '2027-01-18', nights: 14, tier: 'mid', w: { cost: 3, weather: 3, visa: 4, travel: 2, variety: 3 } };
  var TIERS = { budget: 0.6, mid: 1, upscale: 2 };
  var LABELS = { cost: 'Low cost', weather: 'Warm, dry weather', visa: 'Easy visas', travel: 'Short travel', variety: 'Lots to do' };
  var DAY = 86400000;
  var data = null;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
    // A shared link in the address bar follows the settings, so a reload never brings back stale ones
    if (/^#s=/.test(location.hash)) try { history.replaceState(null, '', toHash(s)); } catch (e) { /* file:// */ }
  }
  // Link format: #s=<start>,<nights>,<tier>,<cost><weather><visa><travel><variety>  e.g. #s=2027-01-18,14,mid,33423
  function fromHash() {
    var m = /^#s=(\d{4}-\d{2}-\d{2}),(\d{1,2}),(budget|mid|upscale),([0-5]{5})$/.exec(location.hash);
    if (!m) return null;
    var n = Math.min(21, Math.max(7, +m[2])), w = {};
    Object.keys(DEFAULTS.w).forEach(function (k, i) { w[k] = +m[4].charAt(i); });
    return { start: m[1], nights: n, tier: m[3], w: w };
  }
  function toHash(s) { return '#s=' + s.start + ',' + s.nights + ',' + s.tier + ',' + Object.keys(DEFAULTS.w).map(function (k) { return s.w[k]; }).join(''); }
  var linked = fromHash();
  var state = Object.assign({}, DEFAULTS, linked || load() || {});
  state.w = Object.assign({}, DEFAULTS.w, state.w || {});
  if (linked) save(state);

  function utc(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmt(t) { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function money(n) { return '$' + (Math.round(n / 100) * 100).toLocaleString('en-US'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function cost(d, nights, tier) {
    var m = TIERS[tier] || 1, lo = 0, hi = 0;
    var paid = d.package ? Math.max(0, nights - d.package.nights) : nights;
    function add(r, k) { if (r) { lo += r[0] * (k || 1); hi += r[1] * (k || 1); } }
    add(d.flightUS); add(d.flightNG); add(d.extras); add(d.visa);
    add(d.hotel, paid * m); add(d.daily, paid);
    if (d.package) add(d.package.cost, tier === 'budget' ? 0.8 : tier === 'upscale' ? 1.6 : 1);
    return [lo, hi];
  }

  function render() {
    var list = document.getElementById('pickResults');
    list.textContent = '';
    var start = utc(state.start), end = start + state.nights * DAY;
    var today = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    var rows = data.destinations.map(function (d) { var c = cost(d, state.nights, state.tier); return { d: d, c: c, mid: (c[0] + c[1]) / 2 }; });
    var mids = rows.map(function (r) { return r.mid; });
    var min = Math.min.apply(null, mids), max = Math.max.apply(null, mids);
    var wsum = 0; Object.keys(state.w).forEach(function (k) { wsum += +state.w[k]; });
    rows.forEach(function (r) {
      var s = Object.assign({ cost: max === min ? 5 : 5 - 4 * (r.mid - min) / (max - min) }, r.d.scores), tot = 0;
      Object.keys(state.w).forEach(function (k) { tot += state.w[k] * s[k]; });
      r.score = wsum ? Math.round(((tot / wsum) - 1) / 4 * 100) : 0;
      // Real-world blockers outweigh preferences: paperwork that can't finish in time, or a shutdown holiday in the dates
      if (start - r.d.leadDays * DAY < today) r.score -= 30;
      (r.d.events || []).forEach(function (ev) { if (ev.kind === 'bad' && utc(ev.from) < end && utc(ev.to) >= start) r.score -= 15; });
      r.score = Math.max(0, r.score);
    });
    rows.sort(function (a, b) { return b.score - a.score || a.mid - b.mid; });

    rows.forEach(function (r, i) {
      var d = r.d, li = el('li', 'pick');
      li.style.setProperty('--dest', d.color);
      var head = el('div', 'pick-head');
      head.appendChild(el('span', 'pick-rank', String(i + 1)));
      var name = el('strong', 'pick-name');
      if (d.more) { var a = el('a', null, d.name); a.href = d.more; name.appendChild(a); } else name.textContent = d.name;
      head.appendChild(name);
      head.appendChild(el('span', 'pick-total', money(r.c[0]) + ' to ' + money(r.c[1]) + (d.flightNG ? '' : ' + Air Peace')));
      li.appendChild(head);
      var bar = el('div', 'pick-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', 'Match ' + r.score + ' out of 100');
      var fill = el('span'); fill.style.width = Math.max(4, r.score) + '%'; bar.appendChild(fill);
      li.appendChild(bar);
      var meta = el('div', 'pick-meta');
      meta.appendChild(el('span', 'small', 'Match ' + r.score + '/100'));
      var applyBy = start - d.leadDays * DAY, chip;
      if (applyBy < today) chip = el('span', 'chip b', 'Paperwork: too late to be safe for these dates');
      else if (applyBy - today < 7 * DAY) chip = el('span', 'chip w', 'Paperwork: start now (by ' + fmt(applyBy) + ')');
      else chip = el('span', 'chip g', 'Paperwork: start by ' + fmt(applyBy));
      chip.title = d.leadWhy;
      meta.appendChild(chip);
      (d.events || []).forEach(function (ev) {
        if (utc(ev.from) < end && utc(ev.to) >= start) meta.appendChild(el('span', 'chip ' + (ev.kind === 'good' ? 'g' : ev.kind === 'bad' ? 'b' : 'w'), ev.text));
      });
      (d.flags || []).forEach(function (f) { meta.appendChild(el('span', 'chip w', f)); });
      li.appendChild(meta);
      list.appendChild(li);
    });
    document.getElementById('pickDates').textContent = fmt(start) + ' to ' + fmt(end) + ', ' + new Date(end).getUTCFullYear();
  }

  var sliders = {};
  function sync() {
    var f = document.getElementById('pickForm');
    f.querySelector('#pStart').value = state.start;
    f.querySelector('#pNights').value = state.nights;
    f.querySelector('#pNightsOut').textContent = state.nights;
    f.querySelector('#pTier').value = state.tier;
    Object.keys(sliders).forEach(function (k) {
      sliders[k].inp.value = state.w[k]; sliders[k].out.textContent = state.w[k];
      sliders[k].inp.setAttribute('aria-valuetext', state.w[k] + ' of 5');
    });
  }

  function build() {
    var f = document.getElementById('pickForm');
    var wbox = f.querySelector('#pWeights');
    Object.keys(LABELS).forEach(function (k) {
      var lab = el('label', 'weight'), id = 'w-' + k;
      lab.setAttribute('for', id);
      lab.appendChild(el('span', null, LABELS[k]));
      var inp = document.createElement('input');
      inp.type = 'range'; inp.min = 0; inp.max = 5; inp.step = 1; inp.id = id;
      var out = el('output');
      inp.addEventListener('input', function () { state.w[k] = +inp.value; out.textContent = inp.value; inp.setAttribute('aria-valuetext', inp.value + ' of 5'); save(state); render(); });
      lab.appendChild(inp); lab.appendChild(out);
      wbox.appendChild(lab);
      sliders[k] = { inp: inp, out: out };
    });
    f.querySelector('#pStart').addEventListener('change', function (e) { if (e.target.value) { state.start = e.target.value; save(state); render(); } });
    f.querySelector('#pNights').addEventListener('input', function (e) { state.nights = +e.target.value; f.querySelector('#pNightsOut').textContent = e.target.value; save(state); render(); });
    f.querySelector('#pTier').addEventListener('change', function (e) { state.tier = e.target.value; save(state); render(); });
    document.getElementById('pReset').addEventListener('click', function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      state = JSON.parse(JSON.stringify(DEFAULTS));
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file:// */ }
      document.getElementById('pShareOut').textContent = '';
      sync(); render();
    });
    document.getElementById('pShare').addEventListener('click', function () {
      var url = location.href.split('#')[0] + toHash(state), out = document.getElementById('pShareOut');
      history.replaceState(null, '', toHash(state));
      function done(msg) { out.textContent = msg; }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(function () { done('Link copied.'); }, function () { done(url); });
      else done(url);
    });
    f.addEventListener('submit', function (e) { e.preventDefault(); });
    sync();
  }

  fetch('data/' + TRIP + '.json?v=dev').then(function (r) { return r.json(); }).then(function (j) {
    data = j; root.hidden = false; document.getElementById('pickFallback').hidden = true; build(); render();
  }).catch(function (err) {
    if (window.console) console.error('trip picker:', err);
    root.hidden = true; document.getElementById('pickFallback').hidden = false;
    document.getElementById('pickFallback').textContent = 'The trip planner could not load its data. The Winter 2027 page has the same numbers.'; });
})();
