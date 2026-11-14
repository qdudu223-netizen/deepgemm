(function () {
'use strict';
/* =====================================================================
   Study page runtime. Everything degrades: if this script fails or never
   runs, the whole original text is still visible (folds/masks are CSS
   scoped under html.js and only switched on here).
   ===================================================================== */
var ROOT = document.getElementById('fr-root');
var DOC = document.getElementById('doc');
if (!ROOT || !DOC) return;
/* keep an untouched copy of the page for "download with marks" before we change the DOM */
var PRISTINE = ROOT.outerHTML;
var META = {};
try { META = JSON.parse(document.getElementById('fr-meta').textContent); } catch (e) { META = { appId: 'fr1789', title: document.title }; }
var CARDS = [];
try { CARDS = JSON.parse(document.getElementById('fr-cards').textContent) || []; } catch (e) { CARDS = []; }
var APP = META.appId || 'fr1789';
var FRAMED = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
var COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------ helpers */
function $(s, el) { return (el || document).querySelector(s); }
function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function debounce(fn, ms) { var t; return function () { var a = arguments, me = this; clearTimeout(t); t = setTimeout(function () { fn.apply(me, a); }, ms); }; }
function throttle(fn, ms) { var last = 0, t; return function () { var now = Date.now(), a = arguments; if (now - last >= ms) { last = now; fn.apply(null, a); } else { clearTimeout(t); t = setTimeout(function () { last = Date.now(); fn.apply(null, a); }, ms - (now - last)); } }; }
function now() { return Date.now(); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function dayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseDay(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addDays(s, n) { var d = parseDay(s); d.setDate(d.getDate() + n); return dayStr(d); }
function shortDay(s) { var p = String(s).split('-'); return (+p[1]) + '月' + (+p[2]) + '日'; }
function uid() { return 'h' + now().toString(36) + Math.random().toString(36).slice(2, 7); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function txt(el) { return (el && el.textContent || '').replace(/\s+/g, ' ').trim(); }

var ICONS = {
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', left: '<path d="m15 6-6 6 6 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  cards: '<rect x="3" y="7" width="14" height="13" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v11"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="6"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  shuffle: '<path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.6 3.8-3.6M13.2 9.6C14.2 8 15.4 7 17 7h3M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  exit: '<path d="M9 4H5v16h4M15 8l4 4-4 4M19 12H9"/>',
  redact: '<path d="M4 6h16M4 18h9"/><rect x="4" y="9.5" width="16" height="5" rx="1.2" fill="currentColor" stroke="none" opacity=".75"/>',
  hash: '<path d="M10 4 8 20M16 4l-2 16M5 9h15M4 15h15"/>',
  pen: '<path d="m14.5 4.5 5 5L10 19H5v-5z"/><path d="M12 7l5 5"/><path d="M3 21h8" opacity=".55"/>',
  focus: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5 19.8 7"/>',
  fold: '<path d="m7 15 5-5 5 5M7 20l5-5 5 5" opacity=".9"/>', unfold: '<path d="m7 4 5 5 5-5M7 10l5 5 5-5"/>',
  note: '<path d="M5 5h14v10H9l-4 4z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
  pin: '<path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2"/>',
  md: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15V9l2.5 3L12 9v6M16 9v6M14 13l2 2 2-2"/>'
};
function icon(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>'; }
function fillIcons(scope) { $$('.ic[data-i]', scope).forEach(function (el) { if (!el.firstChild) el.outerHTML = icon(el.getAttribute('data-i')); }); }

/* ------------------------------------------------------------ toast, confirm, modals */
var toastT;
function toast(msg, actLabel, actFn, ms) {
  var el = $('#toast'), b = $('#toast-act');
  $('#toast-text').textContent = msg;
  if (actLabel) { b.hidden = false; b.textContent = actLabel; b.onclick = function () { el.hidden = true; actFn(); }; } else { b.hidden = true; b.onclick = null; }
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(function () { el.hidden = true; }, ms || (actLabel ? 5200 : 2600));
}
var modalStack = [];
function openModal(id, opener) {
  var m = document.getElementById(id); if (!m) return;
  m.hidden = false; modalStack.push({ m: m, opener: opener || document.activeElement });
  setBackgroundInert(true);
  var f = m.querySelector('[data-autofocus]') || m.querySelector('button, input, textarea');
  if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
}
function closeModal(id) {
  var m = document.getElementById(id); if (!m || m.hidden) return;
  m.hidden = true;
  for (var i = modalStack.length - 1; i >= 0; i--) if (modalStack[i].m === m) { var o = modalStack[i].opener; modalStack.splice(i, 1); if (o && o.focus) try { o.focus({ preventScroll: true }); } catch (e) {} break; }
  if (!modalStack.length) setBackgroundInert(false);
  if (id === 'm-flash' && FC.onClose) FC.onClose();
}
function setBackgroundInert(on) {
  ['topbar', 'sidebar', 'main', 'bottombar', 'scrim'].forEach(function (id) { var el = document.getElementById(id); if (el) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); } });
  if (!on && typeof Side !== 'undefined' && Side.el) Side.syncInert();
}
function confirmBox(text, okLabel) {
  return new Promise(function (res) {
    $('#cf-text').textContent = text;
    var yes = $('#cf-yes'), no = $('#cf-no');
    yes.textContent = okLabel || '确定';
    function done(v) { yes.onclick = no.onclick = null; closeModal('m-confirm'); res(v); }
    yes.onclick = function () { done(true); }; no.onclick = function () { done(false); };
    openModal('m-confirm');
    setTimeout(function () { no.focus(); }, 40);
  });
}
document.addEventListener('click', function (e) {
  var c = e.target.closest('[data-close]');
  if (c) { var m = c.closest('.modal'); if (m) closeModal(m.id); return; }
  var md = e.target.classList && e.target.classList.contains('modal') ? e.target : null;
  if (md && md.id !== 'm-confirm') closeModal(md.id);
});

/* ------------------------------------------------------------ state & persistence */
var KEY = 'studynotes::' + APP + '::v1';
var DEFAULT_NAMES = { blue: '要理解', yellow: '易错', red: '必背' };
function blankState() {
  return { v: 1, app: APP, hl: {}, mastered: {}, rev: {}, fc: {}, set: { u: 0, theme: 'auto', fs: 1, names: { blue: DEFAULT_NAMES.blue, yellow: DEFAULT_NAMES.yellow, red: DEFAULT_NAMES.red }, pure: 0, snc: 0, folded: [] }, pos: { u: 0 } };
}
var S = blankState();
var STORAGE_OK = false;
function lsGet() { try { var r = window.localStorage.getItem(KEY); STORAGE_OK = true; return r; } catch (e) { STORAGE_OK = false; return null; } }
function lsSet(v) { try { window.localStorage.setItem(KEY, v); STORAGE_OK = true; return true; } catch (e) { STORAGE_OK = false; return false; } }
function normalize(st) {
  var b = blankState();
  if (!st || typeof st !== 'object') return b;
  ['hl', 'mastered', 'rev', 'fc'].forEach(function (k) { if (st[k] && typeof st[k] === 'object') b[k] = st[k]; });
  if (st.set && typeof st.set === 'object') { for (var k in st.set) b.set[k] = st.set[k]; b.set.names = Object.assign({}, DEFAULT_NAMES, st.set.names || {}); if (!Array.isArray(b.set.folded)) b.set.folded = []; }
  if (st.pos && typeof st.pos === 'object') b.pos = st.pos;
  return b;
}
/* merge `inc` into S; newest `u` wins per record; review dates are unioned unless a reset cleared them.
   opts.revive: an explicitly pasted backup brings back highlights that were deleted here. */
function mergeState(inc, opts) {
  inc = normalize(inc);
  var changed = false, revived = 0;
  ['hl', 'mastered', 'fc'].forEach(function (k) {
    var src = inc[k], dst = S[k];
    for (var id in src) {
      var a = dst[id], b = src[id];
      if (!b) continue;
      if (k === 'hl' && opts && opts.revive && a && a.del && !b.del && b.segs) {
        dst[id] = Object.assign({}, b, { u: now() }); delete dst[id].del; changed = true; revived++; continue;
      }
      if (!a || (b.u || 0) > (a.u || 0)) { dst[id] = b; changed = true; if (k === 'hl' && !b.del && (!a || a.del)) revived++; }
    }
  });
  for (var sid in inc.rev) {
    var a = S.rev[sid], b = inc.rev[sid];
    if (!b || !Array.isArray(b.d)) continue;
    if (!a) { S.rev[sid] = b; changed = true; continue; }
    if (a.clr || b.clr) { if ((b.u || 0) > (a.u || 0)) { S.rev[sid] = b; changed = true; } continue; }
    var set = {}; (a.d || []).concat(b.d).forEach(function (d) { set[d] = 1; });
    var merged = Object.keys(set).sort();
    if (merged.length !== (a.d || []).length) { a.d = merged; a.u = Math.max(a.u || 0, b.u || 0); changed = true; }
  }
  if ((inc.set.u || 0) > (S.set.u || 0)) { S.set = inc.set; changed = true; }
  if ((inc.pos.u || 0) > (S.pos.u || 0)) { S.pos = inc.pos; }
  mergeState.revived = revived;
  return changed;
}
/* write local storage, first folding in whatever another tab saved meanwhile */
function syncLocal() {
  var raw = lsGet();
  if (raw) { try { if (mergeState(JSON.parse(raw)) && typeof Render !== 'undefined') Render.soon(); } catch (e) {} }
  lsSet(JSON.stringify(S));
}
var saveLocalSoon = debounce(syncLocal, 350);
function save(opts) {
  saveLocalSoon();
  if (!(opts && opts.localOnly)) Cloud.saveSoon();
}
function flush() { syncLocal(); Cloud.flush(); }
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', flush);
window.addEventListener('storage', function (e) {
  if (e.key !== KEY || !e.newValue) return;
  try { if (mergeState(JSON.parse(e.newValue)) && typeof Render !== 'undefined') Render.soon(); } catch (er) {}
});
function byteSize(s) { try { return new Blob([s]).size; } catch (e) { return s.length * 3; } }

/* Claude artifact database (long-term storage when the page runs as a published artifact) */
var Cloud = {
  ref: null, ready: false, busy: false, dirty: false, status: 'off', lastBody: '',
  init: function () {
    var self = this;
    if (!window.claude || typeof window.claude.use !== 'function') return Promise.resolve(false);
    self.status = 'connecting';
    return Promise.all([window.claude.use('db'), window.claude.use('user')]).then(function (r) {
      var db = r[0], user = r[1];
      if (!db || !user) { self.status = 'off'; return false; }
      return user.id().then(function (id) {
        if (!id) { self.status = 'off'; return false; }
        self.ref = db.doc('data/users/' + id + '/' + APP);
        return self.ref.get().then(function (snap) {
          var changed = false, cloudBody = '';
          if (snap && snap.exists) {
            var d = snap.data() || {};
            cloudBody = d.json || '';
            try { changed = mergeState(JSON.parse(cloudBody || '{}')); } catch (e) {}
          }
          self.ready = true; self.status = 'on';
          if (JSON.stringify(S) !== cloudBody) self.saveSoon();
          self.watch();
          return changed;
        });
      });
    }).catch(function () { self.status = 'error'; return false; });
  },
  /* another device or tab saved: fold its records in */
  watch: function () {
    var self = this;
    try {
      self.ref.onSnapshot(function (snap) {
        if (!snap || !snap.exists || (snap.metadata && snap.metadata.hasPendingWrites)) return;
        var d = snap.data() || {};
        if (!d.json || d.json === self.lastBody) return;
        try { if (mergeState(JSON.parse(d.json))) { lsSet(JSON.stringify(S)); if (typeof Render !== 'undefined') Render.soon(); } } catch (e) {}
      }, function () {});
    } catch (e) {}
  },
  write: function () {
    var self = this;
    if (!self.ready || !self.ref) return;
    if (self.busy) { self.dirty = true; return; }
    var body = JSON.stringify(S);
    if (byteSize(body) > 250000) {
      var slim = JSON.parse(body); slim.pos = { u: 0 };
      for (var id in slim.hl) { var h = slim.hl[id]; if (h && h.segs) h.segs.forEach(function (sg) { sg.pre = sg.pre.slice(-10); sg.suf = sg.suf.slice(0, 10); }); }
      body = JSON.stringify(slim);
      if (byteSize(body) > 250000) { self.status = 'toolarge'; return; }
    }
    if (body === self.lastBody) return;
    self.busy = true; self.dirty = false;
    self.ref.set({ json: body, u: now(), app: APP }).then(function () { self.status = 'on'; self.lastBody = body; }).catch(function (e) {
      self.status = (e && e.code === 'invalid_argument') ? 'readonly' : (e && e.code === 'quota_exceeded') ? 'toolarge' : 'error';
    }).then(function () { self.busy = false; if (self.dirty) self.write(); });
  },
  saveSoon: debounce(function () { Cloud.write(); }, 2500),
  flush: function () { if (this.ready) this.write(); }
};

function loadState() {
  var raw = lsGet();
  if (raw) { try { S = normalize(JSON.parse(raw)); } catch (e) { S = blankState(); } }
  /* state embedded in a downloaded copy of this page */
  var emb = document.getElementById('fr-embedded-state');
  if (emb && emb.textContent.trim()) {
    try { if (mergeState(JSON.parse(emb.textContent))) save(); } catch (e) {}
  }
}
