/* TravelPlans paperwork deadlines v1.1 (links each visa to its visa-pack.html checklist via entry.<passport>.pack): for one first-night date, lists what each passport must do before
   flying to every destination in data/<trip>.json (entry.us / entry.ng), the date to start it, and whether
   that is still safe from today. Shares the planner's saved start date (travel.planner.<trip>); a #d=YYYY-MM-DD
   link carries the date to someone else. Calendar download builds an .ics of every deadline in the browser. */
(function () {
  var root = document.getElementById('paperwork');
  if (!root) return;
  var TRIP = root.dataset.trip;
  var KEY = 'travel.planner.' + TRIP;
  var DAY = 86400000;
  var DEFAULT_START = '2027-01-18';
  var KIND = { none: ['g', 'Nothing before you fly'], arrival: ['g', 'At the airport'], online: ['w', 'Online'], consulate: ['b', 'Embassy or consulate'] };
  var WHO = { us: 'US passport (St. Louis)', ng: 'Nigerian passport (Port Harcourt)' };
  var data = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function utc(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function fmt(t, year) { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: year ? 'numeric' : undefined, timeZone: 'UTC' }); }
  function todayUtc() { var n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); }

  function saved() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function fromHash() { var m = /^#d=(\d{4}-\d{2}-\d{2})$/.exec(location.hash); return m ? m[1] : null; }
  function remember(start) {
    try { var s = saved(); s.start = start; localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
    if (/^#d=/.test(location.hash)) try { history.replaceState(null, '', '#d=' + start); } catch (e) { /* file:// */ }
  }

  // One action per passport per destination; status compares its start-by date with today
  function actions(d, start, today) {
    return ['us', 'ng'].map(function (p) {
      var e = (d.entry || {})[p] || { kind: 'none', days: 0, need: '' };
      var by = start - e.days * DAY, left = Math.round((by - today) / DAY), status;
      if (e.kind === 'none' || e.kind === 'arrival') status = 'free';
      else if (left < 0) status = 'late';
      else if (left < 14) status = 'soon';
      else status = 'ok';
      return { p: p, e: e, by: by, left: left, status: status };
    });
  }
  var RANK = { late: 0, soon: 1, ok: 2, free: 3 };
  // The action that decides a destination: the worst status, and on a tie the earlier start-by date
  function worst(acts) {
    return acts.reduce(function (a, b) { return RANK[b.status] < RANK[a.status] || (RANK[b.status] === RANK[a.status] && b.by < a.by) ? b : a; });
  }
  function statusChip(a) {
    if (a.status === 'free') return el('span', 'chip g', a.e.kind === 'arrival' ? 'Done at arrival' : 'Nothing needed');
    if (a.status === 'late') return el('span', 'chip b', 'Too late to be safe (was ' + fmt(a.by) + ')');
    if (a.status === 'soon') return el('span', 'chip w', a.left === 0 ? 'Start today' : 'Start within ' + a.left + ' day' + (a.left === 1 ? '' : 's'));
    return el('span', 'chip g', 'Start by ' + fmt(a.by) + ' (' + a.left + ' days)');
  }

  function icsText(v) { return String(v).replace(/[\\;,]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); }
  function ics(rows, start) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TravelPlans//Paperwork//EN', 'CALSCALE:GREGORIAN'];
    rows.forEach(function (r) {
      r.acts.forEach(function (a) {
        if (a.status === 'free') return;
        var t = Math.max(a.by, todayUtc()); // a late deadline lands on today, not in the past
        lines.push('BEGIN:VEVENT', 'UID:' + TRIP + '-pw-' + r.d.id + '-' + a.p + '-' + iso(start) + '@wernercd.github.io', 'DTSTAMP:' + stamp,
          'DTSTART;VALUE=DATE:' + iso(t).replace(/-/g, ''), 'DTEND;VALUE=DATE:' + iso(t + DAY).replace(/-/g, ''),
          'SUMMARY:' + icsText('Start ' + r.d.name + ' paperwork (' + (a.p === 'us' ? 'US' : 'Nigerian') + ' passport)'),
          'DESCRIPTION:' + icsText(a.e.need + (a.e.link ? ' ' + a.e.link : '') + ' Trip starts ' + fmt(start, true) + '.'), 'END:VEVENT');
      });
    });
    lines.push('END:VCALENDAR');
    return lines.map(function (l) {
      var o = l.slice(0, 75);
      for (var i = 75; i < l.length; i += 74) o += '\r\n ' + l.slice(i, i + 74);
      return o;
    }).join('\r\n') + '\r\n';
  }

  function render() {
    var input = document.getElementById('pwStart');
    if (!input.value) return;
    var start = utc(input.value), today = todayUtc(), hide = document.getElementById('pwHide').checked;
    remember(input.value);
    var rows = data.destinations.map(function (d) { var acts = actions(d, start, today); return { d: d, acts: acts, worst: worst(acts) }; });
    rows.sort(function (a, b) {
      return RANK[a.worst.status] - RANK[b.worst.status] || a.worst.by - b.worst.by || a.d.name.localeCompare(b.d.name);
    });
    // Summary: how many places are still safe for both passports, and the next action due
    var safe = rows.filter(function (r) { return r.worst.status !== 'late'; });
    var pending = [];
    rows.forEach(function (r) { r.acts.forEach(function (a) { if (a.status === 'ok' || a.status === 'soon') pending.push({ r: r, a: a }); }); });
    pending.sort(function (x, y) { return x.a.by - y.a.by; });
    var sum = document.getElementById('pwSummary');
    sum.textContent = '';
    sum.appendChild(el('strong', null, 'First night ' + fmt(start, true) + ': ' + safe.length + ' of ' + rows.length + ' places are still safe for both passports.'));
    if (pending.length) {
      var n = pending[0];
      sum.appendChild(el('p', 'small', 'Next deadline: ' + n.r.d.name + ', ' + (n.a.p === 'us' ? 'US' : 'Nigerian') + ' passport, start by ' + fmt(n.a.by, true) + '.'));
    } else sum.appendChild(el('p', 'small', 'No paperwork is still open for these dates.'));

    var list = document.getElementById('pwList');
    list.textContent = '';
    var shown = [];
    rows.forEach(function (r) {
      if (hide && r.worst.status === 'late') return;
      shown.push(r);
      var li = el('li', 'pick pw');
      li.style.setProperty('--dest', r.d.color);
      var head = el('div', 'pick-head');
      var name = el('span', 'pick-name');
      if (r.d.more) { var a = el('a', null, r.d.name); a.href = r.d.more; name.appendChild(a); } else name.textContent = r.d.name;
      head.appendChild(name);
      head.appendChild(el('span', 'pw-overall ' + r.worst.status, r.worst.status === 'late' ? 'Not safe for these dates' : r.worst.status === 'free' ? 'No paperwork' : 'Possible'));
      li.appendChild(head);
      r.acts.forEach(function (a) {
        var row = el('div', 'pw-row');
        var who = el('div', 'pw-who');
        who.appendChild(el('b', null, WHO[a.p]));
        var k = KIND[a.e.kind] || KIND.none;
        who.appendChild(el('span', 'chip ' + k[0], k[1]));
        row.appendChild(who);
        var what = el('div', 'pw-what');
        what.appendChild(el('span', null, a.e.need + ' '));
        if (a.e.link) { var l = el('a', null, 'Official site'); l.href = a.e.link; l.rel = 'noopener'; what.appendChild(l); }
        if (a.e.pack) { what.appendChild(document.createTextNode(' · ')); var c = el('a', null, 'Document checklist'); c.href = 'visa-pack.html#p=' + a.e.pack; what.appendChild(c); }
        row.appendChild(what);
        var when = el('div', 'pw-when');
        when.appendChild(statusChip(a));
        row.appendChild(when);
        li.appendChild(row);
      });
      list.appendChild(li);
    });
    if (!shown.length) list.appendChild(el('li', 'small', 'Every destination is too late for these dates. Pick a later first night.'));
    var btn = document.getElementById('pwIcs');
    var open = shown.some(function (r) { return r.acts.some(function (a) { return a.status !== 'free'; }); });
    btn.disabled = !open;
    btn.onclick = function () {
      var blob = new Blob([ics(shown, start)], { type: 'text/calendar' });
      var u = URL.createObjectURL(blob), dl = document.createElement('a');
      dl.href = u; dl.download = TRIP + '-paperwork-' + iso(start) + '.ics';
      document.body.appendChild(dl); dl.click(); dl.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
    };
  }

  fetch('data/' + TRIP + '.json?v=dev').then(function (r) { return r.json(); }).then(function (j) {
    data = j;
    var input = document.getElementById('pwStart');
    input.value = fromHash() || saved().start || DEFAULT_START;
    if (data.visaChecked) document.getElementById('pwChecked').textContent = fmt(utc(data.visaChecked), true);
    input.addEventListener('change', render);
    document.getElementById('pwHide').addEventListener('change', render);
    document.getElementById('pwShare').addEventListener('click', function () {
      var url = location.href.split('#')[0] + '#d=' + input.value, out = document.getElementById('pwShareOut');
      try { history.replaceState(null, '', '#d=' + input.value); } catch (e) { /* file:// */ }
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { out.textContent = 'Link copied.'; },
        function () { out.textContent = url; });
    });
    document.getElementById('pwFallback').hidden = true;
    root.hidden = false;
    render();
  }).catch(function () {
    document.getElementById('pwFallback').textContent = 'The deadlines could not load. The Winter 2027 page lists every visa rule.';
  });
})();
