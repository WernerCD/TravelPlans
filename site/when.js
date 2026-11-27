/* TravelPlans "When to go" v1: one row per destination, one column per possible first night (every Monday,
   January to March), from data/<trip>.json. A cell says whether that start still leaves time for both
   passports' paperwork (leadDays from today), and whether the stay hits a festival or a shutdown holiday.
   Picking a week shows the detail and links to the planner and the paperwork page with that date; the date
   is shared with them through travel.planner.<trip>. */
(function () {
  var root = document.getElementById('when');
  if (!root) return;
  var TRIP = root.dataset.trip;
  var KEY = 'travel.planner.' + TRIP;
  var DAY = 86400000;
  var FIRST = Date.UTC(2027, 0, 4), LAST = Date.UTC(2027, 2, 29); // Mondays from 4 Jan to 29 Mar 2027
  var DEF = { start: '2027-01-18', nights: 14, tier: 'mid', w: { cost: 3, weather: 3, visa: 4, travel: 2, variety: 3 } };
  var data = null, picked = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function utc(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function fmt(t) { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function todayUtc() { var n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); }
  function state() {
    var s = {}; try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* private mode */ }
    return { start: s.start || DEF.start, nights: s.nights || DEF.nights, tier: s.tier || DEF.tier, w: s.w || DEF.w };
  }
  function remember(start) {
    try { var s = JSON.parse(localStorage.getItem(KEY)) || {}; s.start = start; localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  function plannerLink(start) {
    var s = state(), w = s.w;
    return 'planner.html#s=' + start + ',' + s.nights + ',' + s.tier + ',' + [w.cost, w.weather, w.visa, w.travel, w.variety].join('');
  }

  // One cell: can this destination start on this date, given today and the stay length?
  function cell(d, start, nights, today) {
    var end = start + nights * DAY;
    var hits = (d.events || []).filter(function (ev) { return utc(ev.from) < end && utc(ev.to) >= start; });
    var out = { late: start - d.leadDays * DAY < today,
      bad: hits.filter(function (ev) { return ev.kind === 'bad'; }), good: hits.filter(function (ev) { return ev.kind === 'good'; }) };
    out.code = out.late ? 'late' : out.bad.length ? 'clash' : out.good.length ? 'good' : 'ok';
    return out;
  }
  var SYM = { late: ['✕', 'Too late for the paperwork'], clash: ['!', 'Possible, but clashes with a shutdown holiday'], good: ['★', 'Possible, with a festival in the dates'], ok: ['✓', 'Possible'] };

  function weeks() { var out = []; for (var t = FIRST; t <= LAST; t += 7 * DAY) out.push(t); return out; }

  function render() {
    var s = state(), nights = s.nights, today = todayUtc(), cols = weeks();
    document.getElementById('whNights').textContent = nights;
    var table = document.getElementById('whGrid');
    table.textContent = '';
    var thead = el('thead'), hr = el('tr');
    hr.appendChild(el('th', 'wh-dest', 'First night'));
    cols.forEach(function (t) {
      var th = el('th'); th.scope = 'col';
      var b = el('button', 'wh-col' + (t === picked ? ' on' : ''), fmt(t));
      b.type = 'button'; b.setAttribute('aria-pressed', String(t === picked));
      b.addEventListener('click', function () { picked = t; remember(iso(t)); render(); document.getElementById('whDetail').focus(); });
      th.appendChild(b); hr.appendChild(th);
    });
    hr.appendChild(el('th', 'wh-earliest', 'Earliest safe start'));
    thead.appendChild(hr); table.appendChild(thead);
    var tb = el('tbody');
    data.destinations.forEach(function (d) {
      var tr = el('tr'), th = el('th', 'wh-dest'); th.scope = 'row';
      if (d.more) { var a = el('a', null, d.name); a.href = d.more; th.appendChild(a); } else th.textContent = d.name;
      th.style.setProperty('--dest', d.color);
      tr.appendChild(th);
      cols.forEach(function (t) {
        var c = cell(d, t, nights, today), td = el('td', 'wh-c ' + c.code + (t === picked ? ' on' : ''));
        var label = d.name + ', first night ' + fmt(t) + ': ' + SYM[c.code][1] +
          (c.bad.length ? ' (' + c.bad[0].text + ')' : c.good.length ? ' (' + c.good[0].text + ')' : '');
        td.title = label;
        td.appendChild(el('span', null, SYM[c.code][0]));
        td.lastChild.setAttribute('aria-hidden', 'true');
        td.appendChild(el('span', 'sr', label));
        tr.appendChild(td);
      });
      var earliest = Math.max(today + d.leadDays * DAY, FIRST);
      tr.appendChild(el('td', 'wh-earliest', earliest > LAST ? 'After March' : fmt(earliest)));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    detail(s, today);
  }

  function detail(s, today) {
    var box = document.getElementById('whDetail');
    box.textContent = '';
    if (picked == null) { box.appendChild(el('p', 'small', 'Pick a week in the top row to see what it means.')); return; }
    var groups = { ok: [], good: [], clash: [], late: [] };
    data.destinations.forEach(function (d) { var c = cell(d, picked, s.nights, today); groups[c.code].push({ d: d, c: c }); });
    var possible = groups.ok.length + groups.good.length + groups.clash.length;
    box.appendChild(el('strong', null, 'First night ' + fmt(picked) + ', ' + s.nights + ' nights: ' + possible + ' of ' + data.destinations.length + ' places are possible.'));
    var ul = el('ul', 'small');
    function line(label, list, extra) {
      if (!list.length) return;
      var li = el('li'); li.appendChild(el('b', null, label + ': '));
      li.appendChild(document.createTextNode(list.map(function (x) { return x.d.name + (extra ? ' (' + extra(x) + ')' : ''); }).join(', ')));
      ul.appendChild(li);
    }
    line('With a festival', groups.good, function (x) { return x.c.good[0].text; });
    line('Fine', groups.ok);
    line('Clashes with a holiday', groups.clash, function (x) { return x.c.bad[0].text; });
    line('Too late for the paperwork', groups.late);
    box.appendChild(ul);
    var act = el('p', 'pick-actions');
    var a1 = el('a', 'btn', 'Rank these in the planner'); a1.href = plannerLink(iso(picked));
    var a2 = el('a', 'btn', 'Paperwork for this date'); a2.href = 'paperwork.html#d=' + iso(picked);
    act.appendChild(a1); act.appendChild(a2); box.appendChild(act);
  }

  fetch('data/' + TRIP + '.json?v=dev').then(function (r) { return r.json(); }).then(function (j) {
    data = j;
    var saved = utc(state().start), cols = weeks();
    // Preselect the week holding the saved start date, if it is in range
    cols.forEach(function (t) { if (saved >= t && saved < t + 7 * DAY) picked = t; });
    document.getElementById('whFallback').hidden = true;
    root.hidden = false;
    render();
  }).catch(function () {
    document.getElementById('whFallback').textContent = 'The date grid could not load. The Paperwork page works out one date at a time.';
  });
})();
