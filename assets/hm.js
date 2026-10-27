/* Hanmiro site runtime — renders the page template with its component state, binds events,
   handles reveal animations and the inquiry form. No dependencies. */
(function () {
  'use strict';
  var root = document.getElementById('root');
  var tpl = document.getElementById('hm-tpl');
  if (!root || !tpl || typeof window.HMComponent !== 'function') return;

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (o) {
    for (var k in o) this.state[k] = o[k];
    schedule();
  };
  var Component = window.HMComponent(DCLogic);
  var inst = new Component({});

  function look(sc, path) {
    return path.trim().split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, sc);
  }
  var RE = /\{\{\s*([\w.$]+)\s*\}\}/g;
  function fill(str, sc) {
    return str.replace(RE, function (m, k) {
      if (k === 'true') return 'true';
      if (k === 'false') return '';
      var v = look(sc, k);
      return v === undefined || v === null || typeof v === 'function' ? '' : String(v);
    });
  }
  function single(str, sc) {
    var m = str.match(/^\s*\{\{\s*([\w.$]+)\s*\}\}\s*$/);
    return m ? look(sc, m[1]) : undefined;
  }
  function rend(node, sc, parent) {
    if (node.nodeType === 3) { parent.appendChild(document.createTextNode(fill(node.textContent, sc))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase(), i;
    if (tag === 'sc-for') {
      var arr = single(node.getAttribute('list'), sc) || [];
      var as = node.getAttribute('as');
      arr.forEach(function (it, idx) {
        var s2 = Object.create(sc); s2[as] = it; s2.$index = idx;
        for (i = 0; i < node.childNodes.length; i++) rend(node.childNodes[i], s2, parent);
      });
      return;
    }
    if (tag === 'sc-if') {
      if (single(node.getAttribute('value'), sc)) for (i = 0; i < node.childNodes.length; i++) rend(node.childNodes[i], sc, parent);
      return;
    }
    var ns = node.namespaceURI;
    var el = (!ns || ns === 'http://www.w3.org/1999/xhtml') ? document.createElement(node.localName) : document.createElementNS(ns, node.localName);
    for (i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i];
      if (/^on[A-Z]/.test(a.name) || /^on[a-z]+$/.test(a.name)) {
        var fn = single(a.value, sc);
        if (typeof fn === 'function') el.addEventListener(a.name.slice(2).toLowerCase(), fn);
        continue;
      }
      if (a.name.indexOf('hint-') === 0) continue;
      el.setAttribute(a.name, fill(a.value, sc));
    }
    var kids = tag === 'template' ? node.content.childNodes : node.childNodes;
    for (i = 0; i < kids.length; i++) rend(kids[i], sc, el);
    parent.appendChild(el);
  }

  var firstRender = true, pending = false, io = null;
  function schedule() {
    if (pending) return; pending = true;
    (window.requestAnimationFrame || setTimeout)(function () { pending = false; render(); });
  }
  function keepForm() {
    var saved = {};
    root.querySelectorAll('input[id],textarea[id],select[id]').forEach(function (el) { saved[el.id] = el.value; });
    return saved;
  }
  function render() {
    var saved = firstRender ? {} : keepForm();
    var active = document.activeElement && document.activeElement.id;
    var vals = inst.renderVals();
    var frag = document.createDocumentFragment();
    var kids = tpl.content.childNodes;
    for (var i = 0; i < kids.length; i++) rend(kids[i], vals, frag);
    root.textContent = '';
    root.appendChild(frag);
    for (var id in saved) { var el = document.getElementById(id); if (el) el.value = saved[id]; }
    if (active) { var f = document.getElementById(active); if (f && f.focus) f.focus({ preventScroll: true }); }
    reveal();
    firstRender = false;
  }

  function reveal() {
    var els = root.querySelectorAll('[data-reveal]');
    if (!firstRender || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.remove('hide'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    var vh = window.innerHeight;
    els.forEach(function (el) {
      if (el.getBoundingClientRect().top > vh * 0.92) { el.classList.add('hide'); io.observe(el); }
    });
  }

  render();
  if (location.hash) {
    var t = document.getElementById(location.hash.slice(1));
    if (t) setTimeout(function () { t.scrollIntoView(); }, 30);
  }

  /* ---------- inquiry form ---------- */
  var cfg = window.HMForm;
  if (!cfg) return;
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('[data-hm-send]');
    if (!btn) return;
    ev.preventDefault();
    var fields = root.querySelectorAll('.field input[id], .field textarea[id]');
    var chip = root.querySelector('.chip.on');
    var note = document.getElementById('hm-form-note');
    if (!note) { note = document.createElement('div'); note.id = 'hm-form-note'; note.setAttribute('role', 'status'); note.style.cssText = 'font-size:14px;margin-top:4px'; btn.parentNode.parentNode.appendChild(note); }
    var body = { _template: 'table', _captcha: 'false' }, ok = true, kind = chip ? chip.textContent.trim() : '';
    if (kind) body[cfg.labels.kind] = kind;
    fields.forEach(function (el) {
      var lab = root.querySelector('label[for="' + el.id + '"]');
      var key = lab ? lab.textContent.replace('*', '').trim() : el.id;
      var val = el.value.trim();
      if (lab && lab.textContent.indexOf('*') >= 0 && !val) ok = false;
      if (el.type === 'email') { if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) ok = false; if (val) body.email = val; }
      else body[key] = val;
    });
    if (!ok) { note.style.color = 'var(--accent)'; note.textContent = cfg.msg.invalid; return; }
    body._subject = cfg.subject + (kind ? ' · ' + kind : '');
    body.page = location.href;
    btn.disabled = true; note.style.color = 'var(--sub)'; note.textContent = cfg.msg.sending;
    fetch('https://formsubmit.co/ajax/' + cfg.to, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success === 'false' || j.success === false) throw new Error(j.message || r.status); }); })
      .then(function () {
        note.style.color = 'var(--ink)'; note.textContent = cfg.msg.ok;
        if (typeof window.gtag === 'function') window.gtag('event', 'conversion', { send_to: 'AW-18505185169/ATSFCJjEh5odEJHv-vdE' });
        fields.forEach(function (el) { el.value = ''; });
      })
      .catch(function () { note.style.color = 'var(--accent)'; note.textContent = cfg.msg.fail; })
      .then(function () { btn.disabled = false; });
  });
})();
