/* TravelPlans trip planner v3: ranks destinations from data/<trip>.json by the reader's own weights,
   and works out cost for the chosen nights, the paperwork start date, and events that fall in the dates.
   Settings are remembered per browser under travel.planner.<trip>; a #s=... link carries them to someone else
   (the link wins over saved settings). Each result has a "Plan this trip" panel: itemised cost with each
   traveller's share, dated steps, and an .ics calendar download. */
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
  var openId = null; // which result's "Plan this trip" panel is open, kept across re-ranks

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
  function money(n) { var step = n < 1000 ? 10 : 100; return '$' + (Math.round(n / step) * step).toLocaleString('en-US'); }
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

  // Itemised cost for the chosen nights and tier, plus each traveller's share.
  // Flights belong to whoever flies them; everything else is split evenly (visa fees too, though the US passport often pays none).
  function breakdown(d, nights, tier) {
    var m = TIERS[tier] || 1, paid = d.package ? Math.max(0, nights - d.package.nights) : nights, rows = [];
    function row(label, r, k, who) { if (r && (r[0] || r[1])) rows.push({ label: label, lo: r[0] * (k || 1), hi: r[1] * (k || 1), who: who || 'both' }); }
    row('Flight from St. Louis (round trip)', d.flightUS, 1, 'us');
    if (d.flightNG) row('Flight from Port Harcourt (round trip)', d.flightNG, 1, 'ng');
    if (d.package) row(d.package.nights + '-night package (safari)', d.package.cost, tier === 'budget' ? 0.8 : tier === 'upscale' ? 1.6 : 1);
    row('Hotel, ' + paid + ' nights', d.hotel, paid * m);
    row('Food and local transport, ' + paid + ' days', d.daily, paid);
    row('Trains, domestic flights, extras', d.extras);
    row('Visas and entry fees', d.visa);
    var us = [0, 0], ng = [0, 0];
    rows.forEach(function (r) {
      var f = r.who === 'both' ? 0.5 : 1;
      if (r.who !== 'ng') { us[0] += r.lo * f; us[1] += r.hi * f; }
      if (r.who !== 'us') { ng[0] += r.lo * f; ng[1] += r.hi * f; }
    });
    return { rows: rows, us: us, ng: ng };
  }

  // Dated steps for one destination. BOOK_DAYS is a rule of thumb for long-haul fares, labelled as such on the page.
  var BOOK_DAYS = 60;
  function steps(d, start, end, today) {
    var out = [], applyBy = start - d.leadDays * DAY, book = start - BOOK_DAYS * DAY;
    out.push({ t: Math.max(today, applyBy), title: (applyBy < today ? 'Start paperwork now (target date passed)' : 'Start paperwork') + ': ' + d.name, why: d.leadWhy });
    out.push({ t: Math.max(today, book), title: 'Book flights' + (book < today ? ' now' : '') + ': ' + d.name,
      why: (d.leadDays >= 14 ? 'Pick refundable fares, or book once the visa is approved. ' : '') +
        'Rule of thumb: about ' + (BOOK_DAYS / 30) + ' months ahead for long-haul fares.' +
        (d.flightNG ? '' : ' Check the Air Peace schedule first: it flies Lagos to Barbados only once or twice a month.') });
    (d.events || []).forEach(function (ev) {
      var a = utc(ev.from), b = utc(ev.to);
      if (a < end && b >= start) out.push({ t: a, t2: b, title: ev.text, why: ev.kind === 'bad' ? 'Many places close and transport is packed.' : ev.kind === 'warn' ? 'Book early.' : 'Inside your dates.' });
    });
    out.push({ t: start, first: 1, title: 'Trip starts: ' + d.name, why: 'Both travellers meet at the destination.' });
    out.push({ t: end, title: 'Trip ends: fly home', why: '' });
    return out.sort(function (a, b) { return a.t - b.t || (b.first || 0) - (a.first || 0); });
  }

  function icsDate(t) { return new Date(t).toISOString().slice(0, 10).replace(/-/g, ''); }
  function icsText(v) { return String(v).replace(/[\\;,]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); }
  function ics(d, list) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TravelPlans//Trip Planner//EN', 'CALSCALE:GREGORIAN'];
    list.forEach(function (s, i) {
      lines.push('BEGIN:VEVENT', 'UID:' + TRIP + '-' + d.id + '-' + i + '-' + icsDate(s.t) + '@wernercd.github.io', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + icsDate(s.t), 'DTEND;VALUE=DATE:' + icsDate((s.t2 || s.t) + DAY),
        'SUMMARY:' + icsText(s.title), 'DESCRIPTION:' + icsText((s.why ? s.why + ' ' : '') + location.href.split('#')[0] + toHash(state)), 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    // RFC 5545: fold lines longer than 75 characters (continuation lines start with a space)
    return lines.map(function (l) {
      var o = l.slice(0, 75);
      for (var i = 75; i < l.length; i += 74) o += '\r\n ' + l.slice(i, i + 74);
      return o;
    }).join('\r\n') + '\r\n';
  }

  function panel(d, start, end, today) {
    var det = el('details', 'pick-more');
    det.open = openId === d.id;
    det.addEventListener('toggle', function () { if (det.open) openId = d.id; else if (openId === d.id) openId = null; });
    det.appendChild(el('summary', null, 'Plan this trip'));
    var body = el('div', 'pick-plan');
    var b = breakdown(d, state.nights, state.tier);
    var tw = el('div', 'tablewrap'), tb = el('table', 'mini'), tbody = el('tbody');
    tb.appendChild(el('caption', 'small', 'Cost for both travellers (estimates)'));
    function range(lo, hi) { return money(lo) === money(hi) ? money(lo) : money(lo) + ' to ' + money(hi); }
    function line(label, val, who) {
      var tr = el('tr'); tr.appendChild(el('th', null, label)); tr.appendChild(el('td', null, val)); tr.appendChild(el('td', 'small', who)); tbody.appendChild(tr);
    }
    b.rows.forEach(function (r) {
      line(r.label, range(r.lo, r.hi), r.who === 'us' ? 'St. Louis traveller' : r.who === 'ng' ? 'Port Harcourt traveller' : 'shared');
    });
    if (!d.flightNG) line('Flight from Port Harcourt (Air Peace)', 'fare not published', 'Port Harcourt traveller');
    tb.appendChild(tbody); tw.appendChild(tb); body.appendChild(tw);
    var share = el('p', 'pick-share');
    share.appendChild(el('span', null, 'St. Louis traveller: ')); share.appendChild(el('b', null, money(b.us[0]) + ' to ' + money(b.us[1])));
    share.appendChild(el('span', null, ' · Port Harcourt traveller: ')); share.appendChild(el('b', null, money(b.ng[0]) + ' to ' + money(b.ng[1]) + (d.flightNG ? '' : ' + Air Peace')));
    body.appendChild(share);
    body.appendChild(el('p', 'small', 'Each pays their own flight; everything else is split evenly.'));
    var list = steps(d, start, end, today), ol = el('ol', 'pick-steps');
    list.forEach(function (s) {
      var li = el('li'); li.appendChild(el('time', null, fmt(s.t) + (s.t2 && s.t2 !== s.t ? ' to ' + fmt(s.t2) : '')));
      var txt = el('div'); txt.appendChild(el('strong', null, s.title)); if (s.why) txt.appendChild(el('span', 'small', s.why));
      li.appendChild(txt); ol.appendChild(li);
    });
    body.appendChild(el('h3', 'pick-sub', 'Steps and dates'));
    body.appendChild(ol);
    var acts = el('div', 'pick-actions');
    var cal = el('button', 'btn', 'Add these dates to my calendar (.ics)'); cal.type = 'button';
    cal.addEventListener('click', function () {
      var blob = new Blob([ics(d, list)], { type: 'text/calendar' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = TRIP + '-' + d.id + '.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    acts.appendChild(cal);
    if (d.more) { var more = el('a', null, 'Full ' + d.name + ' plan'); more.href = d.more; acts.appendChild(more); }
    body.appendChild(acts);
    det.appendChild(body);
    return det;
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
      li.appendChild(panel(d, start, end, today));
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
