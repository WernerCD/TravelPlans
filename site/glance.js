/* TravelPlans at-a-glance tables v1: every destination in data/<trip>.json as one row, in three compact views
   (visas and season, costs for two, getting there), sortable and filterable. Built from the same JSON as the
   planner, so it can't drift from it: costs use the planner's arithmetic at 14 nights, mid-range hotels. */
(function () {
  var root = document.getElementById('glance');
  if (!root) return;
  var TRIP = root.dataset.trip, NIGHTS = 14;
  var MARK = { none: ['g', '✓'], arrival: ['g', '✓'], online: ['w', '⚠'], consulate: ['b', '✕'] };
  var EASE = { none: 0, arrival: 0, online: 1, consulate: 3 };
  var VIEWS = {
    visas: { label: 'Visas and season', cols: ['US passport', 'Nigerian passport', 'Jan / Feb', 'Rough total (estimate)'] },
    costs: { label: 'Costs for 2', cols: ['From St. Louis', 'From Port Harcourt', 'Stay, 14 nights', 'Extras and visas', 'Rough total (estimate)'] },
    route: { label: 'Getting there', cols: ['Getting there', 'Start paperwork', 'In the dates', 'Watch out'] }
  };
  var data = null, view = 'visas', sort = 'cost', hideEmbassy = false;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function round(v) { return v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 100) * 100; }
  function money(r) { return r ? '$' + round(r[0]).toLocaleString('en-US') + ' to $' + round(r[1]).toLocaleString('en-US') : null; }
  function add(a, b) { return b ? [a[0] + b[0], a[1] + b[1]] : a; }
  // Same sums as planner.js cost() and check_site.py figures() at mid-range
  function costs(d) {
    var pkg = d.package, paid = NIGHTS - (pkg ? pkg.nights : 0);
    var stay = [(d.hotel[0] + d.daily[0]) * paid, (d.hotel[1] + d.daily[1]) * paid];
    if (pkg) stay = add(stay, pkg.cost);
    var extras = add(add([0, 0], d.extras), d.visa);
    var total = add(add(add(stay, extras), d.flightUS), d.flightNG);
    return { us: d.flightUS, ng: d.flightNG, stay: stay, extras: extras, total: total };
  }
  function rank(e) { return /^No visa/.test(e.short) ? 0 : EASE[e.kind]; }
  function ease(d) { return rank(d.entry.us) + rank(d.entry.ng); }
  function visaCell(e) {
    // A free arrival form or tax isn't a visa: "No visa ..." gets the tick even when something is filed online
    var td = el('td'), m = /^No visa/.test(e.short) ? MARK.none : MARK[e.kind] || MARK.none;
    var chip = el('span', 'chip ' + m[0], m[1]); chip.setAttribute('aria-hidden', 'true');
    td.appendChild(chip); td.appendChild(document.createTextNode(e.short));
    return td;
  }
  function textCell(t, strong) { var td = el('td'); if (strong) td.appendChild(el('b', null, t)); else td.textContent = t; return td; }

  function rows() {
    var list = data.destinations.filter(function (d) { return !hideEmbassy || (d.entry.us.kind !== 'consulate' && d.entry.ng.kind !== 'consulate'); });
    return list.sort(function (a, b) {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'visa') return ease(a) - ease(b) || costs(a).total[0] - costs(b).total[0];
      return costs(a).total[0] - costs(b).total[0] || a.name.localeCompare(b.name);
    });
  }

  function render() {
    var v = VIEWS[view], table = document.getElementById('glTable');
    table.textContent = '';
    table.appendChild(el('caption', 'sr', v.label + ' for each destination, 14 nights, 2 people'));
    var hr = el('tr'); hr.appendChild(el('th', null, '14 nights, 2 people'));
    v.cols.forEach(function (c) { var th = el('th', null, c); th.scope = 'col'; hr.appendChild(th); });
    var thead = el('thead'); thead.appendChild(hr); table.appendChild(thead);
    var tb = el('tbody'), list = rows();
    list.forEach(function (d) {
      var tr = el('tr'), th = el('th'); th.scope = 'row';
      th.style.setProperty('--dest', d.color);
      var a = el('a', null, d.name); a.href = d.more || '#'; th.appendChild(a);
      tr.appendChild(th);
      var c = costs(d), total = money(c.total) + (d.flightNG ? '' : ' + Air Peace fare');
      var cells;
      if (view === 'visas') cells = [visaCell(d.entry.us), visaCell(d.entry.ng), textCell(d.season), textCell(total, true)];
      else if (view === 'costs') cells = [textCell(money(c.us)), textCell(money(c.ng) || 'Air Peace fare not published'),
        textCell(money(c.stay) + (d.package ? ' (incl. ' + d.package.what.split(',')[0].toLowerCase() + ')' : '')), textCell(money(c.extras)), textCell(total, true)];
      else {
        var evs = (d.events || []).map(function (e) { return e.text; }).join('; ');
        var n = d.leadDays, lead = n <= 3 ? 'A few days before' : 'About ' + (n >= 60 ? Math.round(n / 30) + ' months' : n >= 14 ? Math.round(n / 7) + ' weeks' : n + ' days') + ' before';
        cells = [textCell(d.route), textCell(lead),
          textCell(evs || 'Nothing special'), textCell((d.flags || []).join('; ') || '-')];
      }
      cells.forEach(function (td, i) { td.setAttribute('data-label', v.cols[i]); tr.appendChild(td); });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    document.getElementById('glCount').textContent = list.length + ' of ' + data.destinations.length + ' destinations';
    [].forEach.call(document.querySelectorAll('#glViews button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === view)); });
  }

  fetch('data/' + TRIP + '.json?v=dev').then(function (r) { return r.json(); }).then(function (j) {
    data = j;
    var views = document.getElementById('glViews');
    Object.keys(VIEWS).forEach(function (k) {
      var b = el('button', 'btn vp-tab', VIEWS[k].label); b.type = 'button'; b.dataset.view = k;
      b.addEventListener('click', function () { view = k; render(); });
      views.appendChild(b);
    });
    document.getElementById('glSort').addEventListener('change', function (e) { sort = e.target.value; render(); });
    document.getElementById('glHide').addEventListener('change', function (e) { hideEmbassy = e.target.checked; render(); });
    document.getElementById('glFallback').hidden = true;
    root.hidden = false;
    render();
  }).catch(function () {
    document.getElementById('glFallback').textContent = 'The summary tables could not load; the detailed tables below have the same information.';
  });
})();
