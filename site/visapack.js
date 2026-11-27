/* TravelPlans visa pack v1: document checklists for the Nigerian passport, one per visa, from data/visa-pack.json.
   Pick a visa, tick items off as they are gathered; ticks are remembered in this browser (travel.visapack).
   #p=<pack id> opens one pack directly (paperwork.html links here). Print gives a clean paper checklist. */
(function () {
  var root = document.getElementById('visapack');
  if (!root) return;
  var KEY = 'travel.visapack';
  var data = null, current = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } }
  function fromHash() { var m = /^#p=([a-z0-9-]+)$/.exec(location.hash); return m ? m[1] : null; }
  function byId(id) { for (var i = 0; i < data.packs.length; i++) if (data.packs[i].id === id) return data.packs[i]; return null; }
  function key(p, i) { return p.id + ':' + i + ':' + p.steps[i].slice(0, 24); } // a reworded step starts unticked

  function progress(p, ticks) {
    var done = p.steps.filter(function (s, i) { return ticks[key(p, i)]; }).length;
    return { done: done, total: p.steps.length };
  }

  function renderTabs() {
    var ticks = load(), nav = document.getElementById('vpTabs');
    nav.textContent = '';
    data.packs.forEach(function (p) {
      var b = el('button', 'btn vp-tab');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(p.id === current));
      var pr = progress(p, ticks);
      b.appendChild(el('span', null, p.short || p.title));
      b.appendChild(el('span', 'vp-count', pr.done ? pr.done + '/' + pr.total : ''));
      b.addEventListener('click', function () { show(p.id, true); });
      nav.appendChild(b);
    });
  }

  function renderPack() {
    var p = byId(current), ticks = load(), box = document.getElementById('vpPack');
    box.textContent = '';
    if (p.color) box.style.setProperty('--dest', p.color);
    box.appendChild(el('h3', 'vp-title', p.title));
    var facts = el('dl', 'vp-facts');
    [['Where', p.where], ['Fee', p.fee], ['Processing', p.time], ['Start by', p.startBy]].forEach(function (f) {
      if (!f[1]) return;
      facts.appendChild(el('dt', null, f[0])); facts.appendChild(el('dd', null, f[1]));
    });
    box.appendChild(facts);
    if (p.note) box.appendChild(el('p', 'small', p.note));
    var pr = progress(p, ticks);
    var bar = el('div', 'pick-bar vp-bar');
    bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', pr.done + ' of ' + pr.total + ' done');
    var fill = el('span'); fill.style.width = (pr.total ? 100 * pr.done / pr.total : 0) + '%'; bar.appendChild(fill);
    box.appendChild(bar);
    var status = el('p', 'small', pr.done + ' of ' + pr.total + ' done' + (pr.done === pr.total ? ': ready to apply.' : '.'));
    status.setAttribute('role', 'status');
    box.appendChild(status);
    var ol = el('ol', 'vp-steps');
    p.steps.forEach(function (s, i) {
      var li = el('li'), id = 'vp-' + p.id + '-' + i;
      var cb = el('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = !!ticks[key(p, i)];
      cb.addEventListener('change', function () {
        var t = load();
        if (cb.checked) t[key(p, i)] = 1; else delete t[key(p, i)];
        save(t); renderPack(); renderTabs();
        var again = document.getElementById(id); if (again) again.focus();
      });
      var lab = el('label', null, s); lab.htmlFor = id;
      li.appendChild(cb); li.appendChild(lab);
      if (cb.checked) li.className = 'done';
      ol.appendChild(li);
    });
    box.appendChild(ol);
    if (p.sources && p.sources.length) {
      var src = el('p', 'small vp-sources', 'Sources: ');
      p.sources.forEach(function (s, i) {
        if (i) src.appendChild(document.createTextNode(' · '));
        var a = el('a', null, s.label); a.href = s.url; a.rel = 'noopener'; src.appendChild(a);
      });
      box.appendChild(src);
    }
  }

  function show(id, push) {
    current = byId(id) ? id : data.packs[0].id;
    if (push) try { history.replaceState(null, '', '#p=' + current); } catch (e) { /* file:// */ }
    renderTabs(); renderPack();
  }

  fetch('data/visa-pack.json?v=dev').then(function (r) { return r.json(); }).then(function (j) {
    data = j;
    document.getElementById('vpChecked').textContent = j.checked || '';
    document.getElementById('vpPrint').addEventListener('click', function () { window.print(); });
    document.getElementById('vpReset').addEventListener('click', function () {
      var t = load(), p = byId(current);
      Object.keys(t).forEach(function (k) { if (k.indexOf(p.id + ':') === 0) delete t[k]; });
      save(t); renderPack(); renderTabs();
    });
    window.addEventListener('hashchange', function () { if (fromHash()) show(fromHash(), false); });
    document.getElementById('vpFallback').hidden = true;
    root.hidden = false;
    show(fromHash(), false);
  }).catch(function () {
    document.getElementById('vpFallback').textContent = 'The checklists could not load. The Winter 2027 page lists every visa rule.';
  });
})();
