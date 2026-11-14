(function () {
  'use strict';
  var D = document, W = window, ROOT = D.documentElement;
  var APP = D.getElementById('app');
  if (!APP) return;
  // Snapshot the untouched page before any script change (used for "download a copy with my marks").
  var PRISTINE_APP = APP.outerHTML;
  APP.classList.remove('no-js');
  APP.classList.add('js');

  var DATA = {};
  try { DATA = JSON.parse(D.getElementById('ir-data').textContent); } catch (e) { DATA = {}; }
  var TOPIC = DATA.topic || '工业革命（技术的革新）';
  var KEY = 'irn:v1:' + (DATA.slug || 'ir');
  var UNITS = DATA.units || [];
  var UNIT_BY_ID = {};
  UNITS.forEach(function (u) { UNIT_BY_ID[u.id] = u; });
  var CHAPTERS = DATA.chapters || [];
  var CH_BY_ID = {};
  CHAPTERS.forEach(function (c) { CH_BY_ID[c.id] = c; });
  var INTERVALS = [1, 2, 4, 7, 15];
  var COLORS = ['b', 'y', 'r'];
  var SW_CLASS = { b: 'sw-b', y: 'sw-y', r: 'sw-r' };

  /* ------------------------------------------------------------ utils */
  function $(s, r) { return (r || D).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
  function el(tag, attrs, html) {
    var x = D.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs[k] === null || attrs[k] === undefined) continue; if (k === 'class') x.className = attrs[k]; else if (k === 'text') x.textContent = attrs[k]; else x.setAttribute(k, attrs[k]); }
    if (html !== undefined) x.innerHTML = html;
    return x;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function now() { return Date.now(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(ds, n) { var p = ds.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function uid() { return 'm' + now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }
  var ICON = {};
  $$('#ir-icons symbol').forEach(function (s) { ICON[s.id.replace('i-', '')] = true; });
  function ico(name) { return '<svg aria-hidden="true" viewBox="0 0 24 24"><use href="#i-' + name + '"></use></svg>'; }
  var inFrame = (function () { try { return W.self !== W.top; } catch (e) { return true; } })();

  /* ------------------------------------------------------------ state & storage */
  function DEF() {
    return { v: 1, topic: TOPIC, marks: {}, del: {}, mastered: {}, reviews: {}, cards: {}, custom: {}, colorNames: { b: '要理解', y: '易错', r: '必背' }, colorNamesU: 0, settings: { fs: 17, theme: 'system', notes: true, pen: 'y', pure: false }, settingsU: 0, lastPos: null, updated: 0, resetAt: 0, reviewFloor: '', embSeen: {} };
  }
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  function num(v) { v = +v; return isFinite(v) && v > 0 ? v : 0; }
  function str(v) { return typeof v === 'string' ? v : ''; }
  function eachKey(o, fn) { if (o && typeof o === 'object' && !Array.isArray(o)) Object.keys(o).forEach(function (k) { fn(k, o[k]); }); }
  /* Every state that enters the page (local storage, backup code, account copy, downloaded copy) is rebuilt field by field. */
  function sanitize(s) {
    var o = DEF();
    if (!s || typeof s !== 'object' || Array.isArray(s) || (s.topic && s.topic !== TOPIC)) return o;
    o.updated = num(s.updated); o.resetAt = num(s.resetAt); o.reviewFloor = /^\d{4}-\d{2}-\d{2}$/.test(s.reviewFloor) ? s.reviewFloor : '';
    eachKey(s.marks, function (k, m) {
      if (!ID_RE.test(k) || !m || typeof m !== 'object' || COLORS.indexOf(m.c) < 0 || !Array.isArray(m.segs)) return;
      var segs = m.segs.filter(function (g) { return g && typeof g.b === 'string' && typeof g.t === 'string' && g.t.length > 0 && g.t.length < 6000; })
        .map(function (g) { return { b: g.b.slice(0, 80), s: num(g.s), e: num(g.e), t: g.t, pre: str(g.pre).slice(0, 30), suf: str(g.suf).slice(0, 30) }; });
      if (!segs.length) return;
      o.marks[k] = { id: k, c: m.c, segs: segs, n: str(m.n).slice(0, 4000), u: num(m.u), ct: num(m.ct), unit: str(m.unit).slice(0, 40) };
    });
    eachKey(s.del, function (k, v) { if (/^[A-Za-z0-9_-]{1,80}$/.test(k)) o.del[k] = num(v); });
    eachKey(s.mastered, function (k, v) { if (ID_RE.test(k) && v && typeof v === 'object') o.mastered[k] = { v: !!v.v, u: num(v.u) }; });
    eachKey(s.reviews, function (k, v) { if (ID_RE.test(k) && Array.isArray(v)) o.reviews[k] = v.filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); }).slice(-60); });
    eachKey(s.cards, function (k, v) { if (/^[A-Za-z0-9_-]{1,80}$/.test(k) && v && typeof v === 'object') o.cards[k] = { box: Math.min(5, num(v.box)), unf: !!v.unf, n: num(v.n), u: num(v.u) }; });
    eachKey(s.custom, function (k, v) {
      if (!/^hl-[A-Za-z0-9_-]{1,64}$/.test(k) || !v || typeof v !== 'object' || typeof v.q !== 'string') return;
      o.custom[k] = { id: k, deck: 'mine', mark: str(v.mark).slice(0, 64), unit: str(v.unit).slice(0, 40), q: v.q.slice(0, 800), a: str(v.a).slice(0, 4000), note: str(v.note).slice(0, 4000), src: str(v.src).slice(0, 200), u: num(v.u), gone: !!v.gone };
    });
    if (s.colorNames && typeof s.colorNames === 'object') COLORS.forEach(function (c) { var v = str(s.colorNames[c]).trim().slice(0, 8); if (v) o.colorNames[c] = v; });
    o.colorNamesU = num(s.colorNamesU);
    if (s.settings && typeof s.settings === 'object') {
      var st = s.settings;
      o.settings = { fs: Math.max(15, Math.min(22, num(st.fs) || 17)), theme: ['system', 'light', 'dark'].indexOf(st.theme) >= 0 ? st.theme : 'system', notes: st.notes !== false, pen: COLORS.indexOf(st.pen) >= 0 ? st.pen : 'y', pure: !!st.pure };
    }
    o.settingsU = num(s.settingsU);
    if (s.lastPos && typeof s.lastPos === 'object' && typeof s.lastPos.b === 'string') o.lastPos = { b: s.lastPos.b.slice(0, 80), u: num(s.lastPos.u) };
    eachKey(s.embSeen, function (k) { if (/^[a-z0-9]{1,16}$/.test(k)) o.embSeen[k] = 1; });
    return o;
  }
  function dayOf(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  /* nothing recorded before a reset may come back through a later merge */
  function dropBefore(a, t) {
    if (!t) return;
    var k, day = a.reviewFloor || '';
    for (k in a.marks) if ((a.marks[k].u || 0) < t) delete a.marks[k];
    for (k in a.custom) if ((a.custom[k].u || 0) < t) delete a.custom[k];
    for (k in a.mastered) if ((a.mastered[k].u || 0) < t) delete a.mastered[k];
    for (k in a.cards) if ((a.cards[k].u || 0) < t) delete a.cards[k];
    if (day) for (k in a.reviews) { a.reviews[k] = a.reviews[k].filter(function (d) { return d >= day; }); if (!a.reviews[k].length) delete a.reviews[k]; }
    if (a.lastPos && (a.lastPos.u || 0) < t) a.lastPos = null;
  }
  /* merge b into a. Last-writer-wins per item, tombstones for deletions, resets win over older snapshots. */
  function mergeState(a, b, restore) {
    b = sanitize(b);
    var k;
    if ((b.resetAt || 0) > (a.resetAt || 0)) a.resetAt = b.resetAt;
    if ((b.reviewFloor || '') > (a.reviewFloor || '')) a.reviewFloor = b.reviewFloor;
    for (k in b.del) if (!a.del[k] || a.del[k] < b.del[k]) a.del[k] = b.del[k];
    for (k in b.embSeen) a.embSeen[k] = 1;
    if (!restore && (b.updated || 0) < (a.resetAt || 0)) { dropBefore(a, a.resetAt); return a; }
    if (restore) {
      // an explicit restore brings back what the backup holds that is missing here; items edited here since stay newer
      var t = now();
      for (k in b.marks) if (!a.marks[k]) { delete a.del[k]; b.marks[k].u = t; }
      for (k in b.custom) if (!a.custom[k]) { delete a.del[k]; b.custom[k].u = t; }
      ['mastered', 'cards'].forEach(function (f) { for (k in b[f]) if (!a[f][k]) b[f][k].u = t; });
    }
    for (k in b.marks) { var x = b.marks[k], y = a.marks[k]; if (!y || (x.u || 0) > (y.u || 0)) a.marks[k] = x; }
    for (k in a.marks) if (a.del[k] && a.del[k] >= (a.marks[k].u || 0)) delete a.marks[k];
    for (k in b.mastered) { var mx = b.mastered[k], my = a.mastered[k]; if (!my || (mx.u || 0) > (my.u || 0)) a.mastered[k] = mx; }
    for (k in b.reviews) { var set = {}; (a.reviews[k] || []).concat(b.reviews[k] || []).forEach(function (d) { set[d] = 1; }); a.reviews[k] = Object.keys(set).sort(); }
    for (k in b.cards) { var cx = b.cards[k], cy = a.cards[k]; if (!cy || (cx.u || 0) > (cy.u || 0)) a.cards[k] = cx; }
    for (k in b.custom) { var ux = b.custom[k], uy = a.custom[k]; if (!uy || (ux.u || 0) > (uy.u || 0)) a.custom[k] = ux; }
    for (k in a.custom) if (a.del[k] && a.del[k] >= (a.custom[k].u || 0)) delete a.custom[k];
    if ((b.colorNamesU || 0) > (a.colorNamesU || 0)) { a.colorNames = b.colorNames; a.colorNamesU = b.colorNamesU; }
    if ((b.settingsU || 0) > (a.settingsU || 0)) { a.settings = b.settings; a.settingsU = b.settingsU; }
    if (b.lastPos && (!a.lastPos || (b.lastPos.u || 0) > (a.lastPos.u || 0))) a.lastPos = b.lastPos;
    if (!restore) dropBefore(a, a.resetAt);
    if ((b.updated || 0) > (a.updated || 0)) a.updated = b.updated;
    return a;
  }
  function sig(s) {
    var m = Object.keys(s.marks).sort().map(function (k) { var x = s.marks[k]; return k + x.u + x.c + (x.n || '').length; }).join();
    return [m, JSON.stringify(s.mastered), JSON.stringify(s.reviews), Object.keys(s.custom).length, JSON.stringify(s.colorNames), JSON.stringify(s.settings)].join('|');
  }
  /* bring another copy of the state in; re-render only if something visible changed */
  var booted = false;
  function absorb(other) {
    var before = sig(S);
    mergeState(S, other);
    if (booted && sig(S) !== before) afterMerge();
    return sig(S) !== before;
  }
  var localOK = true, lastWritten = 0;
  function readLocal() { try { var r = W.localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { localOK = false; return null; } }
  var S = sanitize(readLocal());
  lastWritten = S.updated;
  var saveT = null;
  function save(opts) {
    S.updated = now();
    clearTimeout(saveT);
    saveT = setTimeout(flush, 200);
    if (!(opts && opts.localOnly)) Cloud.schedule();
  }
  function flush() {
    clearTimeout(saveT);
    try {
      // another tab may have written since we last did: merge it in first instead of overwriting it
      var stored = readLocal();
      if (stored && num(stored.updated) !== lastWritten) absorb(stored);
      W.localStorage.setItem(KEY, JSON.stringify(S));
      lastWritten = S.updated;
      localOK = true;
    } catch (e) { localOK = false; }
  }
  W.addEventListener('pagehide', flush);
  W.addEventListener('storage', function (e) { if (e.key === KEY && e.newValue) { try { var o = JSON.parse(e.newValue); lastWritten = num(o.updated); absorb(o); } catch (er) { } } });
  D.addEventListener('visibilitychange', function () { if (D.visibilityState === 'hidden') { flush(); Cloud.pushNow(); } else Cloud.pull(); });
  function byteLen(t) { try { return new TextEncoder().encode(t).length; } catch (e) { return t.length * 3; } }

  /* Persistent per-person store on claude.ai (private subtree); local storage stays the fallback.
     Every write first reads the account copy and merges it, so a second device is never overwritten. */
  var Cloud = {
    ref: null, ready: false, busy: false, dirty: false, status: 'local', t: null, fails: 0,
    readRemote: function () {
      return this.ref.get().then(function (snap) {
        if (!snap || !snap.exists) return null;
        var body = snap.data();
        if (!body || typeof body.state !== 'string') return null;
        try { return JSON.parse(body.state); } catch (e) { return null; }
      });
    },
    init: function () {
      var self = this;
      if (!W.claude || typeof W.claude.use !== 'function') { renderSync(); return; }
      Promise.all([W.claude.use('db'), W.claude.use('user')]).then(function (r) {
        var db = r[0], user = r[1];
        if (!db || !user) return null;
        return user.id().then(function (id) {
          if (!id) return null;
          self.ref = db.doc('data/users/' + id + '/irn-' + (DATA.slug || 'ir'));
          return self.readRemote().then(function (remote) {
            self.ready = true; self.status = 'cloud';
            if (remote) { absorb(remote); if (sig(sanitize(remote)) !== sig(S)) { self.dirty = true; self.push(); } }
            else if (Object.keys(S.marks).length || Object.keys(S.mastered).length || Object.keys(S.reviews).length) { self.dirty = true; self.push(); }
          });
        });
      }).catch(function () { self.status = 'error'; }).then(renderSync);
    },
    pull: function () { var self = this; if (!this.ready || this.busy) return; this.readRemote().then(function (r) { if (r) absorb(r); }, function () { }); },
    schedule: function (delay) { if (!this.ready) return; this.dirty = true; var self = this; clearTimeout(this.t); this.t = setTimeout(function () { self.push(); }, delay || 1800); },
    pushNow: function () { if (this.ready && this.dirty && !this.busy) { clearTimeout(this.t); this.push(); } },
    push: function () {
      var self = this;
      if (!this.ready || this.busy || !this.dirty) return;
      this.busy = true; this.dirty = false;
      this.readRemote().then(function (remote) {
        if (remote) absorb(remote);
        var body = JSON.stringify(S);
        if (byteLen(JSON.stringify({ state: body, updated: 0 })) > 250000) throw { code: 'too_big' };
        return self.ref.set({ state: body, updated: now() });
      }).then(function () { self.status = 'cloud'; self.fails = 0; }, function (e) {
        var c = e && e.code;
        if (c === 'too_big') { self.status = 'big'; self.ready = false; }
        else if (c === 'quota_exceeded') { self.status = 'quota'; self.ready = false; }
        else if (c === 'invalid_argument' || c === 'revoked' || c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') { self.status = 'error'; self.ready = false; }
        else { self.status = 'error'; self.dirty = true; self.fails++; }
      }).then(function () {
        self.busy = false; renderSync();
        if (self.dirty && self.ready) self.schedule(self.fails ? Math.min(300000, 2000 * Math.pow(2, self.fails)) + Math.random() * 1500 : 1800);
      });
    }
  };
  function renderSync() {
    var x = $('#sync-status');
    if (!x) return;
    var msg = Cloud.status === 'cloud' ? '已保存到你的 Claude 账户（仅你可见），并在本机浏览器留有备份。' :
      Cloud.status === 'big' ? '学习记录过大，无法同步到账户；仍保存在本机浏览器。请定期复制备份码。' :
      Cloud.status === 'quota' ? '账户里的存储空间已满，无法再同步；记录仍保存在本机浏览器，请复制备份码。' :
      Cloud.status === 'error' ? '暂时无法同步到账户；记录仍保存在本机浏览器，稍后会自动再试。' :
      (localOK ? '学习记录保存在本机浏览器。浏览器数据可能被清除，请定期复制备份码。' : '当前环境不允许本地保存（例如无痕模式）。请用备份码保存学习记录。');
    x.textContent = msg;
    x.className = 'status' + (Cloud.status === 'cloud' ? ' ok' : '');
  }

  /* ------------------------------------------------------------ blocks & text model */
  var BLOCKS = [], BMAP = {}, TXT = new Map();
  function indexBlocks() {
    BLOCKS = $$('.page [data-b]');
    BMAP = {};
    BLOCKS.forEach(function (b, i) { BMAP[b.getAttribute('data-b')] = b; b._i = i; });
    TXT = new Map();
  }
  function isSkip(n, block) {
    return n !== block && n.nodeType === 1 && (n.hasAttribute('data-b') || n.hasAttribute('data-ui') || (n.hasAttribute('data-added') && !block.hasAttribute('data-added')) || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'svg');
  }
  function textNodes(block) {
    var out = [];
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) out.push(c);
        else if (c.nodeType === 1 && !isSkip(c, block)) walk(c);
      }
    })(block);
    return out;
  }
  function blockText(block) {
    var t = TXT.get(block);
    if (t === undefined) { t = textNodes(block).map(function (n) { return n.data; }).join(''); TXT.set(block, t); }
    return t;
  }
  function unitOf(node) {
    var u = node.closest ? node.closest('[data-unit]') : null;
    if (u) return u.getAttribute('data-unit');
    var ch = node.closest ? node.closest('.chapter') : null;
    if (ch) return ch.id;
    return node.closest && node.closest('#overview') ? 'overview' : 'top';
  }
  function chapterOf(uid) {
    if (uid === 'overview') return 'overview';
    var m = /^s(\d)/.exec(uid);
    if (m) return 'c' + m[1];
    return uid;
  }
  var BAD_PARENT = /^(UL|OL|TABLE|TBODY|THEAD|TR)$/;
  function wrapRange(block, s, e, make) {
    var nodes = textNodes(block), acc = 0, made = [];
    for (var i = 0; i < nodes.length; i++) {
      var tn = nodes[i], len = tn.data.length, ns = acc, ne = acc + len;
      acc = ne;
      if (ne <= s || ns >= e) continue;
      if (/^\s*$/.test(tn.data) && BAD_PARENT.test(tn.parentNode.nodeName)) continue;
      var a = Math.max(s, ns) - ns, b = Math.min(e, ne) - ns;
      var target = tn;
      if (b < len) target.splitText(b);
      if (a > 0) target = target.splitText(a);
      var w = make();
      target.parentNode.insertBefore(w, target);
      w.appendChild(target);
      made.push(w);
    }
    return made;
  }
  function unwrapAll(nodes) {
    var parents = [];
    nodes.forEach(function (m) {
      var p = m.parentNode;
      if (!p) return;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      parents.push(p);
    });
    parents.forEach(function (p) { if (p.isConnected) p.normalize(); });
  }
  function pointOffset(block, node, off) {
    var nodes = textNodes(block), acc = 0, i;
    if (node.nodeType === 3) {
      for (i = 0; i < nodes.length; i++) { if (nodes[i] === node) return acc + Math.min(off, node.data.length); acc += nodes[i].data.length; }
    }
    var r = D.createRange();
    try { r.setStart(node, off); } catch (e) { return 0; }
    acc = 0;
    for (i = 0; i < nodes.length; i++) {
      var c;
      try { c = r.comparePoint(nodes[i], 0); } catch (e2) { c = 1; }
      if (c >= 0) return acc;
      acc += nodes[i].data.length;
    }
    return acc;
  }

  /* ------------------------------------------------------------ highlighter (荧光笔) */
  var HL = {
    pending: null, undo: [], lastPen: null,
    segsFromSelection: function () {
      var sel = W.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
      var r = sel.getRangeAt(0);
      var host = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode;
      if (!host || !host.closest || !host.closest('.page')) return null;
      if (host.closest('[data-ui]') || host.closest('.dlg')) return null;
      var segs = [];
      for (var i = 0; i < BLOCKS.length; i++) {
        var b = BLOCKS[i];
        var hit;
        try { hit = r.intersectsNode(b); } catch (e) { hit = false; }
        if (!hit) continue;
        if (!b.getClientRects().length) continue;   // hidden: pure mode, collapsed notes, folded answers, closed source
        var t = blockText(b);
        var s = b.contains(r.startContainer) ? pointOffset(b, r.startContainer, r.startOffset) : 0;
        var e = b.contains(r.endContainer) ? pointOffset(b, r.endContainer, r.endOffset) : t.length;
        visiblePieces(b, s, e).forEach(function (pc) {
          var ps = pc[0], pe = pc[1];
          while (ps < pe && /\s/.test(t.charAt(ps))) ps++;
          while (pe > ps && /\s/.test(t.charAt(pe - 1))) pe--;
          if (pe <= ps) return;
          segs.push({ b: b.getAttribute('data-b'), s: ps, e: pe, t: t.slice(ps, pe), pre: t.slice(Math.max(0, ps - 14), ps), suf: t.slice(pe, pe + 14) });
        });
      }
      return segs.length ? segs : null;
    },
    /* find a stored segment again: by block id + offset when the text and its context still match,
       otherwise by the best match of text + surrounding text anywhere on the page (never a blind first hit) */
    locate: function (seg) {
      var orig = BMAP[seg.b], need = Math.min(4, (seg.pre || '').length + (seg.suf || '').length);
      if (orig) {
        var t0 = blockText(orig);
        if (t0.slice(seg.s, seg.e) === seg.t && ctxScore(t0, seg.s, seg) >= need) return { el: orig, s: seg.s, e: seg.e };
      }
      var best = null, bestScore = -1, bestRaw = -1, unitPrefix = seg.b.split('.')[0];
      for (var i = 0; i < BLOCKS.length; i++) {
        var b = BLOCKS[i], t = blockText(b), j = t.indexOf(seg.t);
        if (j < 0) continue;
        var bonus = (b === orig ? 2 : 0) + (b.getAttribute('data-b').split('.')[0] === unitPrefix ? 1 : 0) - (b.closest('[data-added]') && !orig ? 1 : 0);
        while (j >= 0) {
          var raw = ctxScore(t, j, seg), sc = raw * 2 + bonus;
          if (sc > bestScore) { bestScore = sc; bestRaw = raw; best = { el: b, s: j, e: j + seg.t.length }; }
          j = t.indexOf(seg.t, j + 1);
        }
      }
      if (!best) return null;
      if (bestRaw < need && seg.t.length < 12) return null;  // too ambiguous to place: keep it listed as “原位置已找不到”
      return best;
    },
    render: function (m) {
      var ok = 0;
      m.segs.forEach(function (seg) {
        var loc = null;
        try { loc = HL.locate(seg); } catch (e) { loc = null; }
        if (!loc) return;
        if (loc.el.getAttribute('data-b') !== seg.b || loc.s !== seg.s) { seg.b = loc.el.getAttribute('data-b'); seg.s = loc.s; seg.e = loc.e; }
        var first = true;
        wrapRange(loc.el, loc.s, loc.e, function () {
          var x = D.createElement('mark');
          x.className = 'hl' + (m.n ? ' has-note' : '');
          x.setAttribute('data-hl', m.id);
          x.setAttribute('data-c', m.c);
          if (first && ok === 0) { x.tabIndex = 0; first = false; }
          return x;
        });
        ok++;
      });
      m._orphan = ok === 0;
      return ok;
    },
    els: function (id) { return $$('mark.hl').filter(function (x) { return x.getAttribute('data-hl') === id; }); },
    unrender: function (id) { unwrapAll(HL.els(id)); },
    renderAll: function () {
      var list = Object.keys(S.marks).map(function (k) { return S.marks[k]; }).sort(function (a, b) { return (a.ct || 0) - (b.ct || 0); });
      list.forEach(function (m) { try { HL.render(m); } catch (e) { m._orphan = true; } });
    },
    /* same text again → recolour; a new stroke that fully covers older ones replaces them (undoable) */
    create: function (segs, c, opts) {
      if (!segs || !segs.length) return null;
      var key = function (g) { return g.b + ':' + g.s + ':' + g.e; };
      var newKeys = segs.map(key).sort().join('|');
      var ids = Object.keys(S.marks), i, same = null, covered = [];
      for (i = 0; i < ids.length; i++) {
        var om = S.marks[ids[i]];
        if (om.segs.map(key).sort().join('|') === newKeys) { same = om; break; }
        var inside = om.segs.every(function (og) { return segs.some(function (ng) { return ng.b === og.b && ng.s <= og.s && ng.e >= og.e; }); });
        if (inside) covered.push(om);
      }
      if (same) { if (same.c !== c) HL.recolor(same.id, c); return same; }
      var m = { id: uid(), c: c, segs: segs, n: '', u: now(), ct: now(), unit: unitOf(BMAP[segs[0].b] || ORIG) };
      covered.forEach(function (cm) { HL.unrender(cm.id); delete S.marks[cm.id]; S.del[cm.id] = now(); });
      if (covered.length === 1 && covered[0].n) m.n = covered[0].n;   // keep the note of the stroke being extended
      S.marks[m.id] = m;
      HL.render(m);
      if (!(opts && opts.noUndo)) HL.undo.push(covered.length ? { t: 'replace', id: m.id, old: covered } : { t: 'add', id: m.id });
      save();
      refreshHLPanel();
      return m;
    },
    remove: function (id, noUndo) {
      var m = S.marks[id];
      if (!m) return;
      HL.unrender(id);
      delete S.marks[id];
      S.del[id] = now();
      if (!noUndo) HL.undo.push({ t: 'del', m: m });
      save(); refreshHLPanel();
    },
    recolor: function (id, c) {
      var m = S.marks[id];
      if (!m || m.c === c) return;
      HL.undo.push({ t: 'color', id: id, prev: m.c });
      m.c = c; m.u = now();
      HL.els(id).forEach(function (x) { x.setAttribute('data-c', c); });
      save(); refreshHLPanel();
    },
    setNote: function (id, txt, pushUndo) {
      var m = S.marks[id];
      if (!m) return;
      if (pushUndo) HL.undo.push({ t: 'note', id: id, prev: m.n });
      m.n = txt; m.u = now();
      HL.els(id).forEach(function (x) { x.classList.toggle('has-note', !!txt); });
      save(); refreshHLPanel();
    },
    restoreMark: function (mm) { mm.u = now(); S.marks[mm.id] = mm; delete S.del[mm.id]; HL.render(mm); },
    /* apply the inverse of one recorded operation (deletions keep their tombstones so other copies do not revive them) */
    inverse: function (op) {
      if (op.t === 'add') { HL.remove(op.id, true); toast('已撤销上色'); }
      else if (op.t === 'replace') { HL.remove(op.id, true); op.old.forEach(HL.restoreMark); toast('已撤销，恢复原来的标记'); }
      else if (op.t === 'del') { HL.restoreMark(op.m); toast('已恢复标记'); }
      else if (op.t === 'color') { var m = S.marks[op.id]; if (m) { m.c = op.prev; m.u = now(); HL.els(op.id).forEach(function (x) { x.setAttribute('data-c', op.prev); }); } toast('已恢复原来的颜色'); }
      else if (op.t === 'note') { HL.setNote(op.id, op.prev, false); toast('已恢复原来的批注'); }
      else if (op.t === 'clear') { op.ms.forEach(HL.restoreMark); toast('已恢复 ' + op.ms.length + ' 条标记'); }
      save(); refreshHLPanel();
    },
    doUndo: function () {
      var op = HL.undo.pop();
      if (!op) { toast('没有可以撤销的操作'); return; }
      HL.inverse(op);
    },
    /* undo exactly this operation (used by the toast that announced it) */
    undoOp: function (op) {
      var i = HL.undo.lastIndexOf(op);
      if (i < 0) { toast('这一步已经撤销过了'); return; }
      HL.undo.splice(i, 1);
      HL.inverse(op);
    },
    /* undo the latest operation that concerns one mark (the menu's 撤销) */
    undoFor: function (id) {
      for (var i = HL.undo.length - 1; i >= 0; i--) {
        var op = HL.undo[i];
        if (op.id === id || (op.m && op.m.id === id)) { HL.undo.splice(i, 1); HL.inverse(op); return true; }
      }
      toast('这条标记没有可以撤销的修改');
      return false;
    },
    top: function () { return HL.undo[HL.undo.length - 1]; },
    clear: function (ids) {
      var ms = ids.map(function (i) { return S.marks[i]; }).filter(Boolean);
      if (!ms.length) return;
      ms.forEach(function (m) { HL.unrender(m.id); delete S.marks[m.id]; S.del[m.id] = now(); });
      var op = { t: 'clear', ms: ms };
      HL.undo.push(op);
      save(); refreshHLPanel();
      toast('已清除 ' + ms.length + ' 条标记', '撤销', function () { HL.undoOp(op); });
    },
    textOf: function (m) { return m.segs.map(function (s) { return s.t; }).join(' … '); }
  };
  function ctxScore(t, i, seg) {
    var pre = seg.pre || '', suf = seg.suf || '';
    return commonSuffix(t.slice(Math.max(0, i - pre.length), i), pre) + commonPrefix(t.slice(i + seg.t.length, i + seg.t.length + suf.length), suf);
  }
  /* split [s,e) of a block into the parts that are actually rendered (skips folded inline answers etc.) */
  function visiblePieces(block, s, e) {
    var nodes = textNodes(block), acc = 0, out = [], cur = null;
    for (var i = 0; i < nodes.length; i++) {
      var tn = nodes[i], ns = acc, ne = acc + tn.data.length;
      acc = ne;
      var a = Math.max(s, ns), b = Math.min(e, ne);
      if (b <= a) continue;
      var pe = tn.parentElement, vis = !pe || pe === block || pe.getClientRects().length > 0;
      if (vis) { if (cur && cur[1] === a) cur[1] = b; else { cur = [a, b]; out.push(cur); } }
      else cur = null;
    }
    return out;
  }
  function commonPrefix(a, b) { var n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; }
  function commonSuffix(a, b) { var n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; }

  /* selection -> colour bar */
  var bar = $('#hl-bar'), menu = $('#hl-menu');
  var touching = 0, selT = null;
  D.addEventListener('touchstart', function () { touching++; }, { passive: true });
  D.addEventListener('touchend', function () { touching = Math.max(0, touching - 1); }, { passive: true });
  D.addEventListener('touchcancel', function () { touching = 0; }, { passive: true });
  function hideBar() {
    bar.classList.remove('show'); HL.pending = null;
    if (!APP.classList.contains('pen-on') && !menu.classList.contains('show') && toastEl) toastEl.classList.remove('top');
  }
  function placeFloating(box, rect, below) {
    var vw = W.innerWidth, vh = W.innerHeight;
    box.style.left = '0px'; box.style.top = '0px';
    var bw = box.offsetWidth, bh = box.offsetHeight;
    var bottomUI = (W.matchMedia('(max-width: 899px)').matches && !APP.classList.contains('focus')) ? 70 : 12;
    var x = Math.min(Math.max(8, rect.left + rect.width / 2 - bw / 2), vw - bw - 8);
    var y = below ? rect.bottom + 10 : rect.top - bh - 10;
    if (y + bh > vh - bottomUI) y = rect.top - bh - 10;
    if (y < 70) y = Math.min(rect.bottom + 10, vh - bottomUI - bh);
    y = Math.min(Math.max(8, y), vh - bh - 8);
    box.style.left = Math.round(x) + 'px';
    box.style.top = Math.round(y) + 'px';
  }
  W.addEventListener('scroll', function () {
    if (bar.classList.contains('show')) positionBar();
    if (menu.classList.contains('show') && menuId) {
      if (D.activeElement && D.activeElement.id === 'hl-note') return;
      var mk = HL.els(menuId)[0];
      if (!mk) { closeMenu(); return; }
      var r = mk.getBoundingClientRect();
      if (r.bottom < 60 || r.top > W.innerHeight) closeMenu();
      else placeMenu(mk);
    }
  }, { passive: true });
  function positionBar() {
    var sel = W.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    var r = sel.getRangeAt(0), rects = r.getClientRects();
    var last = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
    var first = rects.length ? rects[0] : last;
    var rect = { left: Math.min(first.left, last.left), right: Math.max(first.right, last.right), top: first.top, bottom: last.bottom, width: 0 };
    rect.width = rect.right - rect.left;
    placeFloating(bar, rect, true);
  }
  function onSelChange() {
    var sel = W.getSelection();
    if (!sel || sel.isCollapsed) { if (!bar.matches(':hover')) hideBar(); return; }
    var segs = HL.segsFromSelection();
    if (!segs) { hideBar(); return; }
    HL.pending = segs;
    if (APP.classList.contains('pen-on')) {
      if (coarse && touching === 0) schedulePen();
      return;
    }
    closeMenu();
    bar.classList.add('show');
    toastEl.classList.add('top');
    positionBar();
  }
  var coarse = W.matchMedia && W.matchMedia('(pointer: coarse)').matches;
  D.addEventListener('selectionchange', debounce(onSelChange, coarse ? 250 : 120));
  function schedulePen() { clearTimeout(selT); selT = setTimeout(penApply, 900); }
  D.addEventListener('touchend', function () { if (APP.classList.contains('pen-on')) { var s = W.getSelection(); if (s && !s.isCollapsed) schedulePen(); } }, { passive: true });
  function penApply() {
    if (!APP.classList.contains('pen-on')) return;
    var segs = HL.segsFromSelection();
    if (!segs) return;
    // a stroke that grows over the one just made (long-press, then drag the handles on iPad) replaces it inside HL.create
    HL.create(segs, S.settings.pen || 'y');
    try { W.getSelection().removeAllRanges(); } catch (e) { }
    hideBar();
  }
  D.addEventListener('mouseup', function (e) { if (APP.classList.contains('pen-on') && !e.target.closest('[data-ui]') && e.button === 0) setTimeout(penApply, 10); });
  bar.addEventListener('pointerdown', function (e) { e.preventDefault(); });
  bar.addEventListener('mousedown', function (e) { e.preventDefault(); });
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var segs = HL.pending || HL.segsFromSelection();
    if (b.dataset.c) {
      var m = HL.create(segs, b.dataset.c);
      try { W.getSelection().removeAllRanges(); } catch (er) { }
      hideBar();
      if (m) { var op = HL.top(); toast('已标为“' + S.colorNames[m.c] + '”', '撤销', function () { HL.undoOp(op); }); }
    } else if (b.dataset.act === 'note') {
      var m2 = HL.create(segs, S.settings.pen || 'y');
      try { W.getSelection().removeAllRanges(); } catch (er2) { }
      hideBar();
      if (m2) setTimeout(function () { var mk = HL.els(m2.id)[0]; if (mk) openMenu(m2.id, mk, true); }, 30);
    } else if (b.dataset.act === 'close') { try { W.getSelection().removeAllRanges(); } catch (er3) { } hideBar(); }
  });

  /* mark menu */
  var menuId = null;
  function closeMenu() { if (menu.classList.contains('show')) { menu.classList.remove('show'); menuId = null; if (!APP.classList.contains('pen-on')) toastEl.classList.remove('top'); } }
  function swatchHtml(c, attr, cur, label) {
    return '<button class="swatch' + (cur ? ' cur' : '') + '" ' + attr + '="' + c + '" aria-label="' + esc(label) + '" title="' + esc(S.colorNames[c]) + '"><i></i><span class="sw-lab">' + esc(S.colorNames[c]) + '</span></button>';
  }
  function placeMenu(mk) {
    var rects = mk.getClientRects();
    var r = rects.length ? rects[rects.length - 1] : mk.getBoundingClientRect();
    placeFloating(menu, { left: r.left, right: r.right, top: (rects[0] || r).top, bottom: r.bottom, width: r.width }, true);
  }
  function openMenu(id, mk, focusNote) {
    var m = S.marks[id];
    if (!m) return;
    menuId = id;
    hideBar();
    toastEl.classList.remove('show');   // the menu has its own undo; a leftover toast would cover it on phones
    toastEl.classList.add('top');
    var sw = COLORS.map(function (c) { return swatchHtml(c, 'data-c', m.c === c, '改为' + S.colorNames[c]); }).join('');
    menu.innerHTML = '<div class="quote-ex">' + esc(HL.textOf(m).slice(0, 90)) + '</div>' +
      '<div class="row">' + sw + '<span style="flex:1"></span>' +
      '<button class="mini" data-act="card" title="加入闪卡">' + ico('cards') + '闪卡</button>' +
      '<button class="mini danger" data-act="del" title="删除标记">' + ico('trash') + '删除</button></div>' +
      '<label class="vh" for="hl-note">批注</label><textarea id="hl-note" placeholder="加一句批注（自动保存）">' + esc(m.n || '') + '</textarea>' +
      '<div class="row"><button class="mini" data-act="undo" title="撤销这条标记的上一步修改">' + ico('undo') + '撤销本条修改</button><span style="flex:1"></span><button class="mini" data-act="close">完成</button></div>';
    menu.classList.add('show');
    placeMenu(mk);
    var ta = $('#hl-note', menu), before = m.n || '', pushed = false;
    ta.addEventListener('input', debounce(function () { HL.setNote(id, ta.value.trim(), !pushed && ta.value.trim() !== before); pushed = true; }, 350));
    if (focusNote) ta.focus(); else { var f = $('.swatch', menu); if (f && !coarse) try { f.focus({ preventScroll: true }); } catch (e) { } }
  }
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || !menuId) return;
    var id = menuId;
    if (b.dataset.c) { HL.recolor(id, b.dataset.c); $$('.swatch', menu).forEach(function (s) { s.classList.toggle('cur', s.dataset.c === b.dataset.c); }); }
    else if (b.dataset.act === 'del') { closeMenu(); HL.remove(id); var op = HL.top(); toast('已删除标记', '撤销', function () { HL.undoOp(op); }); }
    else if (b.dataset.act === 'card') { addMarkCards([id]); }
    else if (b.dataset.act === 'undo') { closeMenu(); HL.undoFor(id); }
    else if (b.dataset.act === 'close') closeMenu();
  });

  /* click rules: reveal masked > follow links > open mark menu */
  function revealIfMasked(t) {
    var cl = APP.classList, x;
    if (t.closest('[data-ui]') || t.closest('.dlg') || t.closest('.hl-menu')) return false;
    var u = t.closest('.smask');
    if (u) {
      x = t.closest('.fig, .side, .lead, [data-b]');
      if (x && u.contains(x) && !x.classList.contains('rv') && !x.matches('h3,h4')) { x.classList.add('rv'); return true; }
    }
    var hits = [];
    if (cl.contains('mask-kw')) { x = t.closest('.kw:not(.rv), strong.kwb:not(.rv)'); while (x) { hits.push(x); x = x.parentElement && x.parentElement.closest('.kw:not(.rv), strong.kwb:not(.rv)'); } }
    if (cl.contains('mask-num')) { x = t.closest('.num:not(.rv)'); if (x) hits.push(x); }
    var hm = t.closest('mark.hl:not(.rv)');
    if (hm && (cl.contains('mask-hl-all') || cl.contains('mask-hl-' + hm.getAttribute('data-c')))) hits.push(hm);
    if (!hits.length) return false;
    hits.forEach(function (h) { h.classList.add('rv'); h.removeAttribute('tabindex'); h.removeAttribute('aria-label'); h.removeAttribute('role'); if (h.matches('mark.hl')) HL.els(h.getAttribute('data-hl')).forEach(function (z) { z.classList.add('rv'); }); });
    return true;
  }
  /* keyboard: masked words and numbers can be revealed with Enter/Space; a focused highlight opens its menu */
  D.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target;
    if (!(t instanceof Element) || t.closest('[data-ui]') || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)) return;
    if (revealIfMasked(t)) { e.preventDefault(); return; }
    if (t.matches('mark.hl')) { e.preventDefault(); openMenu(t.getAttribute('data-hl'), t); }
  });
  D.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (revealIfMasked(t)) { e.preventDefault(); e.stopPropagation(); return; }
    if (t.closest('a[href]')) return;
    if (!t.closest('#hl-menu') && !t.closest('#hl-bar')) closeMenu();
    var mk = t.closest('mark.hl');
    if (mk && !t.closest('[data-ui]')) {
      var sel = W.getSelection();
      if (!sel || sel.isCollapsed) { e.preventDefault(); openMenu(mk.getAttribute('data-hl'), mk); }
    }
  }, true);

  /* ------------------------------------------------------------ masks */
  var MASK_SEL = { 'mask-kw': '.page .kw, .page strong.kwb', 'mask-num': '.page .num' };
  function setMask(cls, on) {
    APP.classList.toggle(cls, on);
    if (on) $$('.rv').forEach(function (x) { if (!x.closest('.smask')) x.classList.remove('rv'); });
    // masked items become keyboard-focusable so they can be revealed one by one without a pointer
    $$(MASK_SEL[cls]).forEach(function (x) { if (on) { x.tabIndex = 0; x.setAttribute('role', 'button'); x.setAttribute('aria-label', '已遮住，按回车显示'); } else { x.removeAttribute('tabindex'); x.removeAttribute('role'); x.removeAttribute('aria-label'); } });
    syncToolButtons();
  }
  var HLMASK = null; // null | 'all' | 'b' | 'y' | 'r'
  function setHLMask(v) {
    ['all', 'b', 'y', 'r'].forEach(function (c) { APP.classList.remove('mask-hl-' + c); });
    HLMASK = v;
    if (v) { APP.classList.add('mask-hl-' + v); $$('mark.hl.rv').forEach(function (x) { x.classList.remove('rv'); }); }
    refreshHLPanel();
  }

  /* ------------------------------------------------------------ toast & confirm */
  var toastEl = $('#toast'), toastT = null;
  function toast(msg, act, fn, ms) {
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (act ? '<button type="button">' + esc(act) + '</button>' : '');
    // keep clear of the colour bar / mark menu / pen strip, which sit near the bottom on phones
    toastEl.classList.toggle('top', bar.classList.contains('show') || menu.classList.contains('show') || APP.classList.contains('pen-on'));
    toastEl.classList.add('show');
    var b = $('button', toastEl);
    if (b) b.onclick = function () { toastEl.classList.remove('show'); fn(); };
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, ms || (act ? 5200 : 2200));
  }
  var modal = $('#modal'), confirmEl = $('#confirm'), lastFocus = null;
  function trapFocus(container, e) {
    if (e.key !== 'Tab') return;
    var f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', container).filter(function (x) { return !x.disabled && x.getClientRects().length; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && D.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && D.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  var dlgN = 0;
  function openDialog(html, cls) {
    lastFocus = D.activeElement;
    var hid = 'dlg-h-' + (++dlgN);
    modal.innerHTML = '<div class="dlg ' + (cls || '') + '" role="dialog" aria-modal="true" aria-labelledby="' + hid + '">' + '<button class="x" data-close aria-label="关闭">' + ico('x') + '</button>' + html.replace('<h2>', '<h2 id="' + hid + '">') + '</div>';
    modal.classList.add('show');
    var f = $('.dlg [autofocus], .dlg button:not(.x), .dlg textarea', modal);
    setTimeout(function () { if (f) try { f.focus({ preventScroll: true }); } catch (e) { } }, 30);
    return $('.dlg', modal);
  }
  function closeDialog() { modal.classList.remove('show'); modal.innerHTML = ''; if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) { } FC.active = false; }
  modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('[data-close]')) closeDialog(); });
  modal.addEventListener('keydown', function (e) { trapFocus(modal, e); });
  /* a confirmation opens on its own layer, so cancelling never closes the dialog underneath (e.g. a pasted backup code stays) */
  function confirmBox(title, msg, ok, danger) {
    return new Promise(function (res) {
      var prev = D.activeElement;
      confirmEl.innerHTML = '<div class="dlg small" role="alertdialog" aria-modal="true" aria-labelledby="cf-h"><h2 id="cf-h">' + esc(title) + '</h2><p>' + esc(msg) + '</p><div class="btn-row"><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-ok>' + esc(ok || '确定') + '</button><button class="btn" data-no>取消</button></div></div>';
      confirmEl.classList.add('show');
      setTimeout(function () { var b = $('[data-no]', confirmEl); if (b) b.focus(); }, 30);
      var done = function (v) { confirmEl.classList.remove('show'); confirmEl.innerHTML = ''; confirmEl.onclick = null; confirmEl.onkeydown = null; if (prev && prev.focus) try { prev.focus({ preventScroll: true }); } catch (e) { } res(v); };
      confirmEl.onclick = function (e) { if (e.target.closest('[data-ok]')) done(true); else if (e.target.closest('[data-no]') || e.target === confirmEl) done(false); };
      confirmEl.onkeydown = function (e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } else trapFocus(confirmEl, e); };
    });
  }

  /* ------------------------------------------------------------ navigation helpers */
  var ORIG = D.getElementById('orig');
  function goTo(target, opts) {
    if (!target) return;
    if (APP.classList.contains('pure') && target.closest('[data-added]')) setPure(false);
    if (APP.classList.contains('notes-off') && target.closest('.side:not(.mn)')) { S.settings.notes = true; S.settingsU = now(); save(); applySettings(); toast('已展开补充解释'); }
    var c = target.closest('.collapsed');
    while (c) { setCollapsed(c, false); c = target.closest('.collapsed'); }
    var fold = target.closest('.ans-body.folded, .ans-inline.folded');
    if (fold) toggleAnswer(fold.id, true);
    var src = target.closest('.mermaid-src.closed');
    if (src) src.classList.remove('closed');
    closeDrawer();
    var far = Math.abs(target.getBoundingClientRect().top) > W.innerHeight * 3;
    target.scrollIntoView({ block: (opts && opts.block) || 'center', behavior: (far || matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth' });
    target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
    setTimeout(function () { target.classList.remove('flash'); }, 1700);
  }
  function closeDrawer() { APP.classList.remove('drawer-open'); }

  /* ------------------------------------------------------------ units: header actions, collapse, mastery, reviews */
  var UNIT_EL = $$('[data-unit]');
  function unitHead(u) { return u.matches('.chapter') ? $('.chap-head', u) : $('.sec-head', u); }
  function setCollapsed(u, on) {
    u.classList.toggle('collapsed', on);
    var b = $('[data-act="fold"]', u);
    if (b) { b.setAttribute('aria-expanded', on ? 'false' : 'true'); b.innerHTML = ico(on ? 'chev-down' : 'chev-up') + '<span class="lab">' + (on ? '展开' : '折叠') + '</span>'; }
  }
  function dueInfo(id) {
    var r = S.reviews[id] || [];
    if (!r.length) return { n: 0, due: false, next: null };
    var last = r[r.length - 1];
    var gap = INTERVALS[Math.min(r.length, INTERVALS.length) - 1];
    var next = addDays(last, gap);
    return { n: r.length, due: today() >= next, next: next, last: last };
  }
  function isMastered(id) { return !!(S.mastered[id] && S.mastered[id].v); }
  function renderUnitActions(u) {
    var id = u.getAttribute('data-unit');
    var box = $('.uact', u);
    var di = dueInfo(id);
    var revLab = di.n === 0 ? '复习完' : (di.due ? '该复习了' : '已复习' + di.n + '次');
    var revTitle = di.n === 0 ? '点一下记录今天复习了本节' : ('上次复习：' + di.last + '；下次：' + di.next + '。点一下记录今天再复习一次');
    box.innerHTML =
      '<button class="ubtn" data-act="smask" aria-pressed="' + (u.classList.contains('smask') ? 'true' : 'false') + '" title="整节遮住，先背再对照">' + ico('eye-off') + '<span class="lab">遮本节</span></button>' +
      '<button class="ubtn' + (di.due ? ' due' : (di.n ? ' done' : '')) + '" data-act="review" title="' + esc(revTitle) + '">' + ico('cal') + '<span class="lab">' + revLab + '</span></button>' +
      '<button class="ubtn' + (isMastered(id) ? ' done' : '') + '" data-act="master" aria-pressed="' + (isMastered(id) ? 'true' : 'false') + '" title="勾选表示本节已掌握">' + ico(isMastered(id) ? 'check-sq' : 'sq') + '<span class="lab">已掌握</span></button>' +
      '<button class="ubtn" data-act="fold" aria-expanded="' + (u.classList.contains('collapsed') ? 'false' : 'true') + '" title="折叠或展开本节">' + ico(u.classList.contains('collapsed') ? 'chev-down' : 'chev-up') + '<span class="lab">' + (u.classList.contains('collapsed') ? '展开' : '折叠') + '</span></button>';
  }
  UNIT_EL.forEach(function (u) {
    var h = unitHead(u);
    if (!h) return;
    var box = el('div', { class: 'uact', 'data-ui': '1' });
    h.appendChild(box);
    renderUnitActions(u);
  });
  APP.addEventListener('click', function (e) {
    var b = e.target.closest('.uact button');
    if (!b) return;
    var u = b.closest('[data-unit]'), id = u.getAttribute('data-unit');
    var act = b.getAttribute('data-act');
    if (act === 'fold') setCollapsed(u, !u.classList.contains('collapsed'));
    else if (act === 'master') {
      var on = !isMastered(id);
      S.mastered[id] = { v: on, u: now() };
      save(); renderUnitActions(u); refreshProgress(); refreshTOCState();
      if (on) toast('已标记“已掌握”');
    } else if (act === 'review') {
      var r = S.reviews[id] || (S.reviews[id] = []);
      var td = today();
      if (r[r.length - 1] === td) { toast('今天已记录过本节复习'); return; }
      r.push(td);
      save(); renderUnitActions(u); refreshTOCState(); refreshProgress();
      var di = dueInfo(id);
      toast('已记录第 ' + di.n + ' 次复习，下次：' + di.next);
    } else if (act === 'smask') toggleSectionMask(u);
    renderUnitActions(u);
  });
  function toggleSectionMask(u) {
    var on = !u.classList.contains('smask');
    u.classList.toggle('smask', on);
    var barx = $('.smask-bar', u);
    if (on) {
      if (u.classList.contains('collapsed')) setCollapsed(u, false);
      $$('.rv', u).forEach(function (x) { x.classList.remove('rv'); });
      if (!barx) {
        barx = el('div', { class: 'smask-bar', 'data-ui': '1' }, '<span>整节已遮住：先回想，再点按每段逐个显示。</span><span style="flex:1"></span><button class="chip" data-sm="all">全部显示</button><button class="chip" data-sm="again">重新遮住</button><button class="chip" data-sm="off">退出</button>');
        var body = $('.unit-body', u) || $('.chap-intro', u);
        body.parentNode.insertBefore(barx, body);
      }
    } else if (barx) barx.remove();
  }
  APP.addEventListener('click', function (e) {
    var b = e.target.closest('.smask-bar button');
    if (!b) return;
    var u = b.closest('[data-unit]');
    var a = b.getAttribute('data-sm');
    if (a === 'all') $$('.unit-body [data-b], .unit-body .side, .unit-body .lead, .unit-body .fig', u).forEach(function (x) { x.classList.add('rv'); });
    else if (a === 'again') $$('.rv', u).forEach(function (x) { x.classList.remove('rv'); });
    else { toggleSectionMask(u); renderUnitActions(u); }
  });

  /* ------------------------------------------------------------ answers & mermaid source folding (JS only) */
  function toggleAnswer(id, open) {
    var body = D.getElementById(id);
    if (!body) return;
    var willOpen = open === undefined ? body.classList.contains('folded') : open;
    body.classList.toggle('folded', !willOpen);
    $$('[data-ans-for="' + id + '"]').forEach(function (b) {
      b.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      if (b.classList.contains('ans-ph')) b.hidden = willOpen;
      else b.innerHTML = (willOpen ? '收起答案' : '显示答案') + ico('chev-down');
    });
  }
  $$('.ans-body, .ans-inline').forEach(function (body) {
    body.classList.add('folded');
    var id = body.id;
    var label = $('[data-ans="' + id + '"]');
    var btn = el('button', { class: 'ans-btn', type: 'button', 'data-ui': '1', 'data-ans-for': id, 'aria-expanded': 'false', 'aria-controls': id }, '显示答案' + ico('chev-down'));
    if (label) {
      if (body.classList.contains('ans-inline')) body.parentNode.insertBefore(btn, body);
      else label.appendChild(btn);
    } else {
      var ph = el('button', { class: 'ans-ph', type: 'button', 'data-ui': '1', 'data-ans-for': id, 'aria-expanded': 'false', 'aria-controls': id }, '这里是原文的“' + esc(body.getAttribute('data-ans-label') || '答案') + '”，先自己想一想，再点按显示');
      body.parentNode.insertBefore(ph, body);
      var close = el('button', { class: 'ans-btn', type: 'button', 'data-ui': '1', 'data-ans-for': id, 'aria-expanded': 'true' }, '收起答案' + ico('chev-down'));
      body.appendChild(close);
    }
  });
  APP.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ans-for]');
    if (b) { toggleAnswer(b.getAttribute('data-ans-for')); }
  });
  $$('.mermaid-src').forEach(function (m) {
    m.classList.add('closed');
    var b = el('button', { class: 'chip src-toggle', type: 'button', 'data-ui': '1' }, ico('code') + '查看 Mermaid 源代码（原文）');
    m.insertBefore(b, m.firstChild);
    b.addEventListener('click', function () { var c = m.classList.toggle('closed'); b.innerHTML = ico('code') + (c ? '查看 Mermaid 源代码（原文）' : '收起源代码'); });
  });

  /* ------------------------------------------------------------ sidebar: TOC, indexes */
  function tocLabel(u) { return u.title; }
  function buildTOC() {
    var ul = $('#toc');
    var h = '';
    UNITS.forEach(function (u) {
      if (u.id === 'top') return;
      var isUnit = !!D.querySelector('[data-unit="' + u.id + '"]');
      h += '<li class="l' + u.level + '" data-toc="' + u.id + '"><a href="#' + u.id + '">' + (isUnit ? '<span class="tick" aria-hidden="true"></span>' : '<span class="tick-sp"></span>') + '<span class="lbl">' + esc(tocLabel(u)) + '</span></a></li>';
    });
    ul.innerHTML = h;
  }
  function refreshTOCState() {
    var dueN = 0;
    $$('#toc li').forEach(function (li) {
      var id = li.getAttribute('data-toc');
      if (!D.querySelector('[data-unit="' + id + '"]')) return;
      li.classList.toggle('mastered', isMastered(id));
      var a = $('a', li), di = dueInfo(id);
      var badge = $('.due-badge', a);
      if (di.due) { dueN++; if (!badge) a.appendChild(el('span', { class: 'due-badge', text: '该复习了' })); }
      else if (badge) badge.remove();
    });
    var d = $('#due-count');
    if (d) { d.textContent = dueN ? ('今天有 ' + dueN + ' 节该复习了') : ''; d.hidden = !dueN; }
  }
  function refreshProgress() {
    var ids = UNIT_EL.map(function (u) { return u.getAttribute('data-unit'); });
    var n = ids.filter(isMastered).length;
    $('#prog-num').textContent = '已掌握 ' + n + ' / ' + ids.length + ' 节';
    $('#prog-bar').style.width = (ids.length ? (n / ids.length * 100) : 0) + '%';
  }
  $('#toc').addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    var t = D.getElementById(a.getAttribute('href').slice(1));
    if (t) { if (t.classList.contains('collapsed')) setCollapsed(t, false); closeDrawer(); t.scrollIntoView({ block: 'start' }); try { history.replaceState(null, '', '#' + t.id); } catch (er) { } }
  });
  // scroll spy
  var spyList = [];
  function spyCollect() { spyList = $$('#overview, #orig section[id], #orig .chapter').filter(function (x) { return D.querySelector('[data-toc="' + x.id + '"]') || x.id === 'overview'; }); }
  var curToc = null;
  function spy() {
    var cur = null;
    for (var i = 0; i < spyList.length; i++) { var r = spyList[i].getBoundingClientRect(); if (r.top <= 130) cur = spyList[i]; else if (r.top > 130) break; }
    var id = cur ? cur.id : null;
    if (id === curToc) return;
    curToc = id;
    $$('#toc a.cur').forEach(function (a) { a.classList.remove('cur'); });
    if (id) { var a = $('#toc [data-toc="' + id + '"] > a'); if (a) { a.classList.add('cur'); if (!$('#pane-toc').hidden) { var p = $('.panes'); var ar = a.getBoundingClientRect(), pr = p.getBoundingClientRect(); if (ar.top < pr.top + 40 || ar.bottom > pr.bottom - 40) p.scrollTop += ar.top - pr.top - pr.height / 3; } } }
  }
  var spyRaf = 0;
  W.addEventListener('scroll', function () { if (spyRaf) return; spyRaf = requestAnimationFrame(function () { spyRaf = 0; spy(); trackPos(); }); }, { passive: true });

  function excerpt(t, n) { t = t.replace(/^[\s🔴🟡🟢⚫🔵]+/, '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; }
  function pathOf(node) {
    var uidv = unitOf(node);
    var u = UNIT_BY_ID[uidv];
    var ch = CH_BY_ID[chapterOf(uidv)];
    var parts = [];
    if (ch && (!u || u.level !== 2)) parts.push(ch.short);
    if (u) parts.push(u.title);
    else if (uidv === 'overview') parts.push('学习概览（补充）');
    var mh = node._mh;
    if (mh) parts.push(mh);
    return parts.join(' › ');
  }
  function buildIndexes() {
    var key = [], err = [];
    $$('#orig .mk-red').forEach(function (x) { key.push({ el: x, t: blockText(x) }); });
    $$('#orig .mk-line.mk-red').forEach(function (x) { key.push({ el: x, t: blockText(x) }); });
    $$('#orig tr.row-red, #orig tr.row-key').filter(function (tr) { return !tr.closest('#c0'); }).forEach(function (tr) { key.push({ el: tr, t: $$('td', tr).map(function (td) { return td.textContent.trim(); }).filter(Boolean).slice(0, 2).join('：') }); });
    $$('#s6-2 tbody tr').forEach(function (tr) { key.push({ el: tr, t: $$('td', tr).map(function (td) { return td.textContent.trim(); }).join('：') }); });
    $$('#orig .concl').forEach(function (x) { key.push({ el: x, t: '原文结论 · ' + blockText(x) }); });
    $$('#orig .mk-yel').forEach(function (x) { err.push({ el: x, t: blockText(x) }); });
    $$('#orig .mk-line.mk-yel').forEach(function (x) { err.push({ el: x, t: blockText(x) }); });
    $$('#orig tr.row-yel').filter(function (tr) { return !tr.closest('#c0'); }).forEach(function (tr) { err.push({ el: tr, t: $$('td', tr).map(function (td) { return td.textContent.trim(); }).slice(0, 2).join('：') }); });
    $$('#orig td').forEach(function (td) { if (/^\s*🟡/.test(td.textContent) && !td.closest('#c0')) err.push({ el: td, t: (td.parentNode.cells[0] ? td.parentNode.cells[0].textContent.trim() + '：' : '') + td.textContent.trim() }); });
    $$('#s6-3 tbody tr').forEach(function (tr) { var c = tr.cells; err.push({ el: tr, t: '误答：' + c[1].textContent.trim() + ' → ' + c[3].textContent.trim() }); });
    function sortDoc(list) { return list.sort(function (a, b) { return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; }); }
    function render(list, pane, cls) {
      var h = '', lastCh = null;
      list.forEach(function (it, i) {
        var uidv = unitOf(it.el), ch = chapterOf(uidv);
        if (ch !== lastCh) { lastCh = ch; h += '<div class="ix-group">' + esc((CH_BY_ID[ch] || { title: '' }).title) + '</div>'; }
        h += '<button class="ix ' + cls + '" data-ix="' + i + '"><span class="ix-sec">' + esc((UNIT_BY_ID[uidv] || { title: '' }).title) + '</span>' + esc(excerpt(it.t, 64)) + '</button>';
      });
      pane.innerHTML = h || '<div class="ix-empty">暂无条目</div>';
      pane.onclick = function (e) { var b = e.target.closest('[data-ix]'); if (b) goTo(list[+b.getAttribute('data-ix')].el); };
    }
    key = sortDoc(key); err = sortDoc(err);
    render(key, $('#ix-key'), 'red');
    render(err, $('#ix-err'), 'yel');
    $('#cnt-key').textContent = key.length;
    $('#cnt-err').textContent = err.length;
  }
  // tabs
  $('.tabs').addEventListener('click', function (e) {
    var t = e.target.closest('.tab');
    if (!t) return;
    $$('.tab').forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
    $$('.pane').forEach(function (p) { p.hidden = p.id !== t.getAttribute('aria-controls'); });
    if (t.getAttribute('aria-controls') === 'pane-hl') refreshHLPanel();
  });

  /* ------------------------------------------------------------ highlight panel */
  var hlFilter = 'all';
  function markList() { return Object.keys(S.marks).map(function (k) { return S.marks[k]; }); }
  function markEl(m) { return HL.els(m.id)[0] || null; }
  function sortMarks(list) {
    return list.sort(function (a, b) {
      var ea = markEl(a), eb = markEl(b);
      if (ea && eb) return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      if (ea) return -1; if (eb) return 1; return (a.ct || 0) - (b.ct || 0);
    });
  }
  function refreshHLPanel() {
    var all = markList();
    $('#cnt-hl').textContent = all.length || '';
    var pane = $('#pane-hl');
    if (pane.hidden) return;
    var counts = { b: 0, y: 0, r: 0 };
    all.forEach(function (m) { counts[m.c]++; });
    var list = sortMarks(all.filter(function (m) { return hlFilter === 'all' || m.c === hlFilter; }));
    var h = '<div class="pane-tools">' +
      '<button class="chip" data-f="all" aria-pressed="' + (hlFilter === 'all') + '">全部 ' + all.length + '</button>' +
      COLORS.map(function (c) { return '<button class="chip" data-f="' + c + '" aria-pressed="' + (hlFilter === c) + '"><i class="sw ' + SW_CLASS[c] + '" style="display:inline-block;width:14px;height:10px;border-radius:4px"></i>' + esc(S.colorNames[c]) + ' ' + counts[c] + '</button>'; }).join('') +
      '</div><div class="pane-tools">' +
      '<button class="chip" data-a="mask" aria-pressed="' + (!!HLMASK) + '">' + ico('eye-off') + (HLMASK ? '取消遮住' : (hlFilter === 'all' ? '遮住全部标记' : '遮住“' + esc(S.colorNames[hlFilter]) + '”')) + '</button>' +
      '<button class="chip" data-a="cards">' + ico('cards') + '加入闪卡</button>' +
      '<button class="chip" data-a="md">' + ico('copy') + '复制 Markdown</button>' +
      '<button class="chip" data-a="undo">' + ico('undo') + '撤销</button>' +
      '<button class="chip" data-a="clear-unit">清空本节</button>' +
      '<button class="chip" data-a="clear-all">清空全部</button>' +
      '<button class="chip" data-a="names">' + ico('pen') + '改颜色名称</button>' +
      '</div>';
    if (!list.length) h += '<div class="ix-empty">' + (all.length ? '这个颜色还没有标记。' : '还没有荧光标记。选中正文里的任意文字，在弹出的三色条上点一下即可上色；也可以打开工具栏的“荧光笔”，选好颜色后选中文字一松手就上色。') + '</div>';
    var lastCh = null;
    list.forEach(function (m) {
      var e1 = markEl(m);
      var u = e1 ? unitOf(e1) : (m.unit || '');
      var ch = chapterOf(u);
      if (ch !== lastCh) { lastCh = ch; h += '<div class="ix-group">' + esc((CH_BY_ID[ch] || { title: ch === 'overview' ? '学习概览' : '其他' }).title) + '</div>'; }
      h += '<button class="ix" data-m="' + m.id + '"><span class="ix-sec">' + esc((UNIT_BY_ID[u] || { title: m._orphan ? '（原位置已找不到）' : '' }).title) + '</span><i class="sw ' + SW_CLASS[m.c] + '"></i>' + esc(excerpt(HL.textOf(m), 80)) + (m.n ? '<span class="ix-note">批注：' + esc(m.n) + '</span>' : '') + '</button>';
    });
    pane.innerHTML = h;
  }
  $('#pane-hl').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.f) { hlFilter = b.dataset.f; if (HLMASK) setHLMask(hlFilter); refreshHLPanel(); return; }
    if (b.dataset.m) {
      var mid = b.dataset.m, mks = HL.els(mid);
      if (mks.length) { goTo(mks[0]); mks.forEach(function (x) { x.classList.remove('pulse'); void x.offsetWidth; x.classList.add('pulse'); }); setTimeout(function () { var m0 = HL.els(mid)[0]; if (m0) openMenu(mid, m0); }, 450); }
      else toast('这条标记的原文位置已找不到');
      return;
    }
    var a = b.dataset.a;
    var filtered = markList().filter(function (m) { return hlFilter === 'all' || m.c === hlFilter; });
    if (a === 'mask') setHLMask(HLMASK ? null : hlFilter);
    else if (a === 'cards') { addMarkCards(filtered.map(function (m) { return m.id; })); }
    else if (a === 'md') copyText(marksMarkdown(), 'Markdown 清单');
    else if (a === 'undo') HL.doUndo();
    else if (a === 'clear-unit') {
      var u = currentUnit();
      var ids = markList().filter(function (m) { var e1 = markEl(m); return e1 && unitOf(e1) === u; }).map(function (m) { return m.id; });
      if (!ids.length) { toast('当前小节没有标记'); return; }
      confirmBox('清空本节标记？', '将删除“' + ((UNIT_BY_ID[u] || {}).title || u) + '”中的 ' + ids.length + ' 条荧光标记（含批注）。可以用“撤销”恢复。', '清空本节', true).then(function (ok) { if (ok) HL.clear(ids); });
    } else if (a === 'clear-all') {
      var all = markList().map(function (m) { return m.id; });
      if (!all.length) { toast('还没有标记'); return; }
      confirmBox('清空全部标记？', '将删除全部 ' + all.length + ' 条荧光标记（含批注）。建议先在“设置”里复制备份码。', '全部清空', true).then(function (ok) { if (ok) HL.clear(all); });
    } else if (a === 'names') openSettings('names');
  });
  function currentUnit() {
    var best = null;
    UNIT_EL.forEach(function (u) { var r = u.getBoundingClientRect(); if (r.top < W.innerHeight * 0.4 && r.bottom > 80) best = u; });
    return best ? best.getAttribute('data-unit') : null;
  }
  function marksMarkdown() {
    var list = sortMarks(markList());
    var out = ['# ' + TOPIC + '｜我的荧光笔', '', '> 导出日期：' + today() + '；颜色：' + COLORS.map(function (c) { return S.colorNames[c]; }).join('／'), ''];
    var byCh = {};
    var order = [];
    list.forEach(function (m) {
      var e1 = markEl(m), u = e1 ? unitOf(e1) : (m.unit || ''), ch = chapterOf(u);
      if (!byCh[ch]) { byCh[ch] = {}; order.push(ch); }
      (byCh[ch][u] = byCh[ch][u] || []).push(m);
    });
    order.forEach(function (ch) {
      out.push('## ' + ((CH_BY_ID[ch] || {}).title || (ch === 'overview' ? '学习概览（补充）' : '其他')), '');
      Object.keys(byCh[ch]).forEach(function (u) {
        out.push('### ' + ((UNIT_BY_ID[u] || {}).title || u), '');
        COLORS.forEach(function (c) {
          var ms = byCh[ch][u].filter(function (m) { return m.c === c; });
          if (!ms.length) return;
          out.push('**' + S.colorNames[c] + '**', '');
          ms.forEach(function (m) { out.push('- ==' + HL.textOf(m).replace(/\n+/g, ' ') + '=='); if (m.n) out.push('  - 批注：' + m.n.replace(/\n+/g, ' ')); });
          out.push('');
        });
      });
    });
    if (!list.length) out.push('（还没有标记）');
    return out.join('\n');
  }

  /* ------------------------------------------------------------ copy helper */
  function copyText(txt, what) {
    var done = function () { toast('已复制' + (what ? '：' + what : '')); };
    var fallback = function () {
      var d = openDialog('<h2>复制' + esc(what || '') + '</h2><p>当前环境不允许脚本写入剪贴板。文字已全选，请按“拷贝”（或 Ctrl/⌘+C）。</p><label class="vh" for="copy-ta">内容</label><textarea id="copy-ta" readonly style="min-height:220px">' + esc(txt) + '</textarea>', '');
      var ta = $('#copy-ta', d); ta.focus(); ta.select(); try { ta.setSelectionRange(0, txt.length); } catch (e) { }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  /* ------------------------------------------------------------ search */
  var SIDX = null;
  function buildSearchIndex() {
    SIDX = [];
    var curMh = {};
    BLOCKS.forEach(function (b) {
      if (b.closest('[data-ui]')) return;
      var u = unitOf(b);
      if (b.classList.contains('minihead')) curMh[u] = blockText(b).trim();
      else if (/^H[1-4]$/.test(b.tagName)) curMh[u] = null;
      b._mh = b.classList.contains('minihead') ? null : (curMh[u] || null);
      var t = blockText(b);
      if (!t.trim()) return;
      SIDX.push({ el: b, t: t, lt: t.toLowerCase(), added: !!b.closest('[data-added]') });
    });
  }
  var sInput = $('#q'), sBox = $('.search'), sRes = $('#sresults');
  var shNodes = [];
  function clearSH() { unwrapAll(shNodes); shNodes = []; }
  function doSearch(q) {
    clearSH();
    q = q.trim();
    sBox.classList.toggle('has-q', !!q);
    if (!q) { sBox.classList.remove('open'); sRes.innerHTML = ''; return; }
    if (!SIDX) buildSearchIndex();
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    var res = [];
    for (var i = 0; i < SIDX.length; i++) { var it = SIDX[i]; if (terms.every(function (t) { return it.lt.indexOf(t) >= 0; })) res.push(it); }
    var notes = markList().filter(function (m) { var hay = ((m.n || '') + ' ' + HL.textOf(m)).toLowerCase(); return m.n && terms.every(function (t) { return hay.indexOf(t) >= 0; }); });
    var h = '<div class="sr-meta">' + (res.length + notes.length ? ('找到 ' + res.length + ' 段' + (notes.length ? '、' + notes.length + ' 条批注' : '') + (terms.length > 1 ? '（同时包含 ' + terms.length + ' 个词）' : '')) : '没有找到同时包含这些词的段落') + '</div>';
    notes.forEach(function (m) { h += '<button class="sr" data-note="' + m.id + '"><span class="sr-path"><span class="sr-kind">批注</span>' + esc(S.colorNames[m.c]) + '</span><span class="sr-txt">' + hiTerms(esc(m.n), terms) + '<br>' + hiTerms(esc(excerpt(HL.textOf(m), 60)), terms) + '</span></button>'; });
    var LIM = 160;
    res.slice(0, LIM).forEach(function (it, i) {
      h += '<button class="sr" data-r="' + i + '"><span class="sr-path">' + (it.added ? '<span class="sr-kind">补充</span>' : '') + esc(pathOf(it.el)) + '</span><span class="sr-txt">' + hiTerms(esc(snippet(it.t, terms)), terms) + '</span></button>';
    });
    if (res.length > LIM) h += '<div class="sr-meta">只列出前 ' + LIM + ' 段，请再加一个关键词缩小范围。</div>';
    sRes.innerHTML = h;
    sRes._res = res;
    sBox.classList.add('open');
    // outline matches in the page (distinct from highlighter strokes)
    res.slice(0, 400).forEach(function (it) {
      var lt = it.lt;
      var ranges = [];
      terms.forEach(function (t) { var i2 = lt.indexOf(t); while (i2 >= 0) { ranges.push([i2, i2 + t.length]); i2 = lt.indexOf(t, i2 + t.length); } });
      ranges.sort(function (a, b) { return b[0] - a[0]; });
      ranges.forEach(function (rg) { shNodes = shNodes.concat(wrapRange(it.el, rg[0], rg[1], function () { return el('span', { class: 'sh' }); })); });
    });
  }
  function snippet(t, terms) {
    var lt = t.toLowerCase(), i = lt.indexOf(terms[0]);
    t = t.replace(/\s+/g, ' ');
    if (i < 0) return excerpt(t, 90);
    var a = Math.max(0, i - 28);
    return (a > 0 ? '…' : '') + t.slice(a, a + 96) + (a + 96 < t.length ? '…' : '');
  }
  function hiTerms(h, terms) {
    terms.forEach(function (t) { var et = esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); h = h.replace(new RegExp(et, 'gi'), function (m) { return '<b>' + m + '</b>'; }); });
    return h;
  }
  sInput.addEventListener('input', debounce(function () { doSearch(sInput.value); }, 220));
  sInput.addEventListener('focus', function () { if (sInput.value.trim()) sBox.classList.add('open'); });
  sInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { sInput.value = ''; doSearch(''); sInput.blur(); }
    if (e.key === 'Enter') { var f = $('.sr', sRes); if (f) f.click(); }
  });
  $('.search .clear').addEventListener('click', function () { sInput.value = ''; doSearch(''); sInput.focus(); });
  sRes.addEventListener('click', function (e) {
    var b = e.target.closest('.sr');
    if (!b) return;
    $$('.sr.active', sRes).forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active');
    if (b.dataset.note) { var mk = HL.els(b.dataset.note)[0]; if (mk) { sBox.classList.remove('open'); goTo(mk); } return; }
    var it = sRes._res[+b.dataset.r];
    $$('.sh-cur').forEach(function (x) { x.classList.remove('sh-cur'); });
    $$('.sh', it.el).forEach(function (x) { x.classList.add('sh-cur'); });
    sBox.classList.remove('open');
    goTo(it.el);
  });
  D.addEventListener('pointerdown', function (e) { if (!e.target.closest('.search')) sBox.classList.remove('open'); });

  /* ------------------------------------------------------------ flashcards */
  var FC = { deck: 'all', rev: false, shuf: true, unfOnly: false, queue: [], i: 0, flip: false, active: false };
  var BASE_CARDS = (DATA.cards || []).slice();
  var DECKS = DATA.decks || [];
  /* highlight cards are stored as plain text and only turned into HTML here, escaped; a card disappears with its highlight */
  function customCards() {
    return Object.keys(S.custom).map(function (k) { return S.custom[k]; }).filter(function (c) { return !c.gone && S.marks[c.mark]; }).map(function (c) {
      var f = esc(c.q).replace('［＿＿＿］', '<b>（＿＿＿）</b>');
      var b = '<div class="fc-part"><span class="fc-lab">答案</span>' + esc(c.a) + '</div>' + (c.note ? '<div class="fc-part"><span class="fc-lab">批注</span>' + esc(c.note) + '</div>' : '') + '<div class="fc-part"><span class="fc-lab">出处</span>' + esc(c.src) + '</div>';
      return { id: c.id, deck: 'mine', unit: c.unit, f: f, b: b, custom: true };
    });
  }
  function allCards() { return BASE_CARDS.concat(customCards()); }
  function addMarkCards(ids) {
    var n = 0;
    ids.forEach(function (id) {
      var m = S.marks[id];
      if (!m) return;
      var cid = 'hl-' + id;
      var seg = m.segs[0];
      var b = BMAP[seg.b], t = b ? blockText(b) : '';
      var s = seg.s, e = seg.e;
      if (!b || t.slice(s, e) !== seg.t) { t = seg.pre + seg.t + seg.suf; s = seg.pre.length; e = s + seg.t.length; }
      var q;
      if ((e - s) >= t.trim().length * 0.8 || (s < 4 && t.length - e < 4)) {
        // the whole passage is highlighted: ask for it by place and opening words instead of a bare blank
        var where = pathOf(b || ORIG);
        q = '【' + where + '】 ' + seg.t.slice(0, 8) + '……　［＿＿＿］（背出这一段）';
      } else {
        var a = Math.max(0, s - 40), z = Math.min(t.length, e + 40);
        q = (a > 0 ? '…' : '') + t.slice(a, s) + '［＿＿＿］' + t.slice(e, z) + (z < t.length ? '…' : '');
      }
      if (!S.custom[cid] || S.custom[cid].gone) n++;
      S.custom[cid] = { id: cid, deck: 'mine', mark: id, unit: m.unit, q: q, a: HL.textOf(m), note: m.n || '', src: pathOf(b || ORIG), u: now(), gone: false };
    });
    save();
    toast(n ? ('已把 ' + n + ' 条标记加入闪卡（“我的荧光笔”卡组）') : '这些标记已经在闪卡里了', '去练习', function () { openCards('mine'); });
  }
  function cardState(id) { return S.cards[id] || { box: 0, unf: false, n: 0 }; }
  function buildQueue() {
    var list = allCards().filter(function (c) { return FC.deck === 'all' || c.deck === FC.deck; });
    if (FC.unfOnly) list = list.filter(function (c) { var s = cardState(c.id); return s.unf; });
    if (FC.shuf) {
      // weighted shuffle: unfamiliar and low-box cards come up earlier and more often
      list = list.map(function (c) { var s = cardState(c.id); var w = s.unf ? 4 : (s.box <= 0 ? 2 : 1 / s.box); return { c: c, k: Math.pow(Math.random(), 1 / w) }; }).sort(function (a, b) { return b.k - a.k; }).map(function (x) { return x.c; });
      var extra = [];
      list.forEach(function (c, i) { if (cardState(c.id).unf && Math.random() < 0.6) extra.push({ c: c, at: Math.min(list.length, i + 4 + Math.floor(Math.random() * 6)) }); });
      extra.sort(function (a, b) { return b.at - a.at; }).forEach(function (x) { list.splice(x.at, 0, x.c); });
    }
    FC.queue = list; FC.i = 0; FC.flip = false;
  }
  function deckName(id) { var d = DECKS.filter(function (x) { return x.id === id; })[0]; return d ? d.name : (id === 'mine' ? '我的荧光笔' : id); }
  function openCards(deck) {
    if (deck) FC.deck = deck;
    var counts = {};
    allCards().forEach(function (c) { counts[c.deck] = (counts[c.deck] || 0) + 1; });
    var opts = '<option value="all">全部卡组（' + allCards().length + '）</option>' + DECKS.concat(customCards().length ? [{ id: 'mine', name: '我的荧光笔' }] : []).map(function (d) { return '<option value="' + d.id + '"' + (FC.deck === d.id ? ' selected' : '') + '>' + esc(d.name) + '（' + (counts[d.id] || 0) + '）</option>'; }).join('');
    var d = openDialog('<h2>闪卡自测</h2>' +
      '<div class="fc-top"><label class="vh" for="fc-deck">卡组</label><select id="fc-deck">' + opts + '</select>' +
      '<button class="chip" data-fc="rev" aria-pressed="' + FC.rev + '">' + ico('swap') + '反向</button>' +
      '<button class="chip" data-fc="shuf" aria-pressed="' + FC.shuf + '">' + ico('shuffle') + '打乱</button>' +
      '<button class="chip" data-fc="unf" aria-pressed="' + FC.unfOnly + '">' + ico('flag') + '只练不熟</button></div>' +
      '<div class="fc-stat" id="fc-stat"></div><div class="fc-stage" id="fc-stage"></div>' +
      '<div class="fc-ctl"><button class="btn" data-fc="prev" aria-label="上一张">' + ico('left') + '</button><button class="btn unf" data-fc="no">' + ico('flag') + '不熟</button><button class="btn primary" data-fc="flip">翻面</button><button class="btn fam" data-fc="yes">' + ico('check') + '熟悉</button><button class="btn" data-fc="next" aria-label="下一张">' + ico('right') + '</button></div>' +
      '<p class="fc-hint fc-keys">键盘：空格翻面，←／→ 切换，1 不熟，2 熟悉。</p><p class="fc-hint">标为“不熟”的卡会更频繁出现。</p>', 'cards');
    FC.active = true;
    $('#fc-deck', d).value = FC.deck;
    if ($('#fc-deck', d).value !== FC.deck) { FC.deck = 'all'; $('#fc-deck', d).value = 'all'; }
    $('#fc-deck', d).addEventListener('change', function (e) { FC.deck = e.target.value; buildQueue(); renderCard(); });
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fc]');
      if (!b) { if (e.target.closest('.fc-card')) { FC.flip = !FC.flip; renderCard(); } return; }
      var a = b.getAttribute('data-fc');
      if (a === 'rev') { FC.rev = !FC.rev; b.setAttribute('aria-pressed', FC.rev); FC.flip = false; renderCard(); }
      else if (a === 'shuf') { FC.shuf = !FC.shuf; b.setAttribute('aria-pressed', FC.shuf); buildQueue(); renderCard(); }
      else if (a === 'unf') { FC.unfOnly = !FC.unfOnly; b.setAttribute('aria-pressed', FC.unfOnly); buildQueue(); renderCard(); }
      else if (a === 'drop') { var cc = FC.queue[FC.i]; if (cc && S.custom[cc.id]) { S.custom[cc.id].gone = true; S.custom[cc.id].u = now(); save(); FC.queue = FC.queue.filter(function (x) { return x.id !== cc.id; }); renderCard(); toast('已移出“我的荧光笔”卡组'); } }
      else fcAct(a);
    });
    buildQueue(); renderCard();
  }
  function fcAct(a) {
    var c = FC.queue[FC.i];
    if (a === 'flip') { FC.flip = !FC.flip; renderCard(); return; }
    if (a === 'prev') { if (FC.i > 0) FC.i--; FC.flip = false; renderCard(); return; }
    if (a === 'next') { if (FC.i < FC.queue.length) FC.i++; FC.flip = false; renderCard(); return; }
    if (!c) return;
    var s = cardState(c.id);
    if (a === 'no') { s = { box: 0, unf: true, n: (s.n || 0) + 1, u: now() }; FC.queue.splice(Math.min(FC.queue.length, FC.i + 4), 0, c); }
    if (a === 'yes') { s = { box: Math.min(5, (s.box || 0) + 1), unf: false, n: (s.n || 0) + 1, u: now() }; }
    S.cards[c.id] = s; save();
    FC.i++; FC.flip = false; renderCard();
  }
  function renderCard() {
    var st = $('#fc-stage'), stat = $('#fc-stat');
    if (!st) return;
    var unfN = allCards().filter(function (c) { return (FC.deck === 'all' || c.deck === FC.deck) && cardState(c.id).unf; }).length;
    if (!FC.queue.length) { stat.textContent = ''; st.innerHTML = '<div class="fc-empty">' + (FC.unfOnly ? '这个卡组目前没有标为“不熟”的卡。' : '这个卡组还没有卡片。') + '</div>'; return; }
    if (FC.i >= FC.queue.length) { stat.textContent = '本轮完成 · 不熟 ' + unfN + ' 张'; st.innerHTML = '<div class="fc-empty">这一轮练完了。<br><br><button class="btn primary" id="fc-again">再来一轮</button></div>'; $('#fc-again').onclick = function () { buildQueue(); renderCard(); }; return; }
    var c = FC.queue[FC.i];
    var f = FC.rev ? c.b : c.f, b = FC.rev ? c.f : c.b;
    var cs = cardState(c.id);
    stat.textContent = '第 ' + (FC.i + 1) + ' / ' + FC.queue.length + ' 张 · ' + deckName(c.deck) + ' · 不熟 ' + unfN + ' 张' + (cs.unf ? ' · 这张标为不熟' : '');
    st.innerHTML = (c.custom ? '<div class="fc-drop"><button class="chip" data-fc="drop">' + ico('trash') + '移出卡组</button></div>' : '') + '<div class="fc-card' + (FC.flip ? ' flip' : '') + '" tabindex="0" aria-live="polite"><div class="fc-face fc-front"><div class="fc-kind">' + esc(deckName(c.deck)) + (c.qa ? ' · 补充出题' : '') + ' · 正面</div><div class="fc-main">' + f + '</div><div class="fc-hint">点按卡片翻面</div></div><div class="fc-face fc-back"><div class="fc-kind">背面' + (c.qa ? ' · 答案为原文' : '') + '</div><div class="fc-main">' + b + '</div></div></div>';
    // size the stage to the taller face
    var card = $('.fc-card', st), faces = $$('.fc-face', st);
    var h = 280;
    faces.forEach(function (fc) { fc.style.position = 'relative'; h = Math.max(h, fc.scrollHeight); fc.style.position = ''; });
    card.style.minHeight = Math.max(160, Math.min(h, W.innerHeight - 360, W.innerHeight * 0.6)) + 'px';
  }

  /* ------------------------------------------------------------ toolbar actions */
  function syncToolButtons() {
    var cl = APP.classList;
    $$('[data-act]').forEach(function (b) {
      var a = b.getAttribute('data-act');
      var on = a === 'mask-kw' ? cl.contains('mask-kw') : a === 'mask-num' ? cl.contains('mask-num') : a === 'pen' ? cl.contains('pen-on') : a === 'focus' ? cl.contains('focus') : a === 'pure' ? cl.contains('pure') : null;
      if (on !== null && b.closest('.tools, .bottombar, .focus-tools')) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('.pen-dot').forEach(function (d) { d.className = 'pen-dot ' + SW_CLASS[S.settings.pen || 'y']; });
  }
  function setPure(on) { APP.classList.toggle('pure', on); S.settings.pure = on; S.settingsU = now(); save(); syncToolButtons(); toast(on ? '纯原文模式：已隐藏全部补充内容' : '已恢复显示补充内容'); }
  function setPen(on) {
    APP.classList.toggle('pen-on', on);
    syncToolButtons();
    renderPenStrip();
    toastEl.classList.toggle('top', on);
    if (on) toast('荧光笔模式：选中文字，一松手就上色');
  }
  function renderPenStrip() {
    var p = $('#penstrip');
    p.innerHTML = '<span class="ps-lab">荧光笔</span>' + COLORS.map(function (c) { return swatchHtml(c, 'data-pc', S.settings.pen === c, '用' + S.colorNames[c] + '上色'); }).join('') + '<button class="tbtn" data-pa="undo" title="撤销" style="min-width:44px">' + ico('undo') + '</button><button class="tbtn" data-pa="off" title="关闭荧光笔模式" style="min-width:44px">' + ico('x') + '</button>';
  }
  $('#penstrip').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pc) { S.settings.pen = b.dataset.pc; S.settingsU = now(); save(); renderPenStrip(); syncToolButtons(); toast('当前颜色：' + S.colorNames[b.dataset.pc]); }
    else if (b.dataset.pa === 'undo') HL.doUndo();
    else if (b.dataset.pa === 'off') setPen(false);
  });
  $('#penstrip').addEventListener('mousedown', function (e) { e.preventDefault(); });
  APP.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || !b.closest('.tools, .bottombar, .topbar, .sidebar, .focus-tools')) return;
    var a = b.getAttribute('data-act');
    if (a === 'mask-kw') { setMask('mask-kw', !APP.classList.contains('mask-kw')); toast(APP.classList.contains('mask-kw') ? '已遮住关键词：点按逐个显示' : '已取消遮住关键词'); }
    else if (a === 'mask-num') { setMask('mask-num', !APP.classList.contains('mask-num')); toast(APP.classList.contains('mask-num') ? '已遮住年份和数字：点按逐个显示' : '已取消遮住年份和数字'); }
    else if (a === 'pen') setPen(!APP.classList.contains('pen-on'));
    else if (a === 'cards') openCards();
    else if (a === 'focus') { var on = !APP.classList.contains('focus'); APP.classList.toggle('focus', on); syncToolButtons(); }
    else if (a === 'pure') setPure(!APP.classList.contains('pure'));
    else if (a === 'settings') openSettings();
    else if (a === 'menu') APP.classList.toggle('drawer-open');
    else if (a === 'close-drawer') closeDrawer();
    else if (a === 'fold-all') UNIT_EL.forEach(function (u) { setCollapsed(u, true); });
    else if (a === 'unfold-all') UNIT_EL.forEach(function (u) { setCollapsed(u, false); });
    else if (a === 'notes') { var off = !APP.classList.contains('notes-off'); APP.classList.toggle('notes-off', off); S.settings.notes = !off; S.settingsU = now(); save(); b.setAttribute('aria-pressed', off ? 'false' : 'true'); toast(off ? '已收起全部补充解释' : '已展开补充解释'); }
    else if (a === 'answers') { var anyFolded = $$('.ans-body.folded, .ans-inline.folded').length > 0; $$('.ans-body, .ans-inline').forEach(function (x) { toggleAnswer(x.id, anyFolded); }); b.setAttribute('aria-pressed', anyFolded ? 'true' : 'false'); toast(anyFolded ? '已展开全部答案' : '已收起全部答案'); }
    else if (a === 'resume') resume();
  });
  $('.scrim').addEventListener('click', closeDrawer);

  /* ------------------------------------------------------------ settings, backup & restore */
  function encodeState() {
    var json = JSON.stringify(S);
    var b64 = btoa(unescape(encodeURIComponent(json)));
    return 'IRN1.' + b64;
  }
  function decodeState(code) {
    code = String(code || '').trim().replace(/\s+/g, '');
    if (!code) throw new Error('请先把备份码粘贴到上面的输入框。');
    var m = /^IRN1\.([A-Za-z0-9+/=_-]+)$/.exec(code);
    if (!m) throw new Error('这不是本网页的备份码：备份码应以 IRN1. 开头，请复制完整的一整段。');
    var o;
    try { o = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); }
    catch (e) { throw new Error('备份码不完整或已损坏，请回到原设备重新复制完整的一整段。'); }
    if (!o || typeof o !== 'object' || o.topic !== TOPIC) throw new Error('这个备份码属于另一个网页（课题不同），不能导入。');
    return sanitize(o);
  }
  var downloadsCap = null;
  function canDownload() { return !inFrame || !!downloadsCap; }
  function canPrint() { return !inFrame && typeof W.print === 'function'; }
  function openSettings(focus) {
    var fs = S.settings.fs || 17;
    var th = S.settings.theme || 'system';
    var h = '<h2>设置</h2>' +
      '<h3>字号</h3><div class="set-row"><label for="fs-range">正文 <b id="fs-val">' + fs + '</b> px</label><input id="fs-range" type="range" min="15" max="22" step="1" value="' + fs + '"></div>' +
      '<h3>外观</h3><div class="set-row"><div class="seg" role="group" aria-label="深浅色">' + [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(function (x) { return '<button data-theme="' + x[0] + '" aria-pressed="' + (th === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="set-row"><button class="chip" data-s="notes" aria-pressed="' + (S.settings.notes !== false) + '">补充解释：' + (S.settings.notes !== false ? '展开' : '收起') + '</button><button class="chip" data-s="pure" aria-pressed="' + !!S.settings.pure + '">纯原文模式：' + (S.settings.pure ? '开' : '关') + '</button></div>' +
      '<h3 id="set-names">荧光笔颜色名称</h3><div class="cname">' + COLORS.map(function (c) { return '<i class="' + SW_CLASS[c] + '"></i><label class="vh" for="cn-' + c + '">颜色名称</label><input type="text" id="cn-' + c + '" maxlength="8" value="' + esc(S.colorNames[c]) + '">'; }).join('') + '</div>' +
      '<h3>备份与恢复</h3><p id="sync-status" class="status"></p>' +
      '<p>备份码包含全部学习记录：荧光标记和批注、掌握进度、复习日期、闪卡熟练度、字号与颜色名称。换设备或浏览器数据被清除时，用它恢复。</p>' +
      '<div class="btn-row"><button class="btn primary" data-s="copy">' + ico('copy') + '复制备份码</button>' + (canDownload() ? '<button class="btn" data-s="dl">' + ico('download') + '下载带标记的网页</button>' : '') + (canPrint() ? '<button class="btn" data-s="print">' + ico('print') + '打印</button>' : '') + '</div>' +
      '<label class="vh" for="restore-ta">粘贴备份码</label><textarea id="restore-ta" placeholder="在这里粘贴备份码（以 IRN1. 开头），然后选择恢复方式" style="margin-top:12px"></textarea>' +
      '<div class="btn-row"><button class="btn" data-s="merge">合并恢复</button><button class="btn" data-s="replace">覆盖恢复</button></div>' +
      '<p class="status" id="restore-msg"></p>' +
      '<h3>重置</h3><div class="btn-row"><button class="btn danger" data-s="reset">清除本网页的全部学习记录</button></div>';
    var d = openDialog(h, '');
    renderSync();
    var rng = $('#fs-range', d);
    rng.addEventListener('input', function () { S.settings.fs = +rng.value; S.settingsU = now(); $('#fs-val', d).textContent = rng.value; applySettings(); save(); });
    COLORS.forEach(function (c) {
      $('#cn-' + c, d).addEventListener('input', debounce(function (e) { var v = e.target.value.trim(); if (!v) return; S.colorNames[c] = v; S.colorNamesU = now(); save(); renderPenStrip(); buildBarSwatches(); refreshHLPanel(); }, 300));
    });
    if (focus === 'names') setTimeout(function () { $('#set-names', d).scrollIntoView({ block: 'start' }); $('#cn-b', d).focus(); }, 60);
    d.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.theme) { S.settings.theme = b.dataset.theme; S.settingsU = now(); applySettings(); save(); $$('[data-theme]', d).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); return; }
      var s = b.dataset.s;
      if (s === 'notes') { var on = S.settings.notes === false; S.settings.notes = on; S.settingsU = now(); applySettings(); save(); b.textContent = '补充解释：' + (on ? '展开' : '收起'); b.setAttribute('aria-pressed', on); }
      else if (s === 'pure') { setPure(!APP.classList.contains('pure')); b.textContent = '纯原文模式：' + (S.settings.pure ? '开' : '关'); b.setAttribute('aria-pressed', !!S.settings.pure); }
      else if (s === 'copy') copyText(encodeState(), '备份码');
      else if (s === 'dl') downloadCopy();
      else if (s === 'print') { closeDialog(); setTimeout(function () { W.print(); }, 100); }
      else if (s === 'merge' || s === 'replace') {
        var msg = $('#restore-msg', d), st;
        try { st = decodeState($('#restore-ta', d).value); } catch (er) { msg.textContent = er.message || '无法读取备份码。请确认复制完整。'; msg.className = 'status'; return; }
        var n = Object.keys(st.marks || {}).length;
        var title = s === 'merge' ? '合并恢复？' : '覆盖恢复？';
        var text = s === 'merge' ? ('备份里有 ' + n + ' 条荧光标记。合并后，现有记录会保留，相同的标记不会重复。') : ('备份里有 ' + n + ' 条荧光标记。覆盖会用备份替换本网页现在的全部学习记录。');
        confirmBox(title, text, s === 'merge' ? '合并' : '覆盖', s !== 'merge').then(function (ok) {
          if (!ok) return;
          if (s === 'replace') {
            // the backup becomes the whole record; older copies elsewhere (account, other tabs, downloaded files) can no longer bring anything back
            var t = now(), fresh = sanitize(st), oldDel = S.del, oldEmb = S.embSeen;
            ['marks', 'custom', 'mastered', 'cards'].forEach(function (f) { Object.keys(fresh[f]).forEach(function (k) { fresh[f][k].u = t; }); });
            fresh.del = Object.assign({}, oldDel, fresh.del);
            Object.keys(S.marks).forEach(function (k) { if (!fresh.marks[k]) fresh.del[k] = t; });
            Object.keys(fresh.marks).forEach(function (k) { delete fresh.del[k]; });
            fresh.embSeen = Object.assign({}, oldEmb, fresh.embSeen);
            fresh.resetAt = t - 1; fresh.colorNamesU = t; fresh.settingsU = t; fresh.updated = t; fresh.reviewFloor = S.reviewFloor > fresh.reviewFloor ? S.reviewFloor : fresh.reviewFloor;
            S = fresh;
          }
          else mergeState(S, st, true);
          afterMerge(true); save();
          toast('恢复完成：现在共有 ' + Object.keys(S.marks).length + ' 条荧光标记');
        });
      } else if (s === 'reset') {
        confirmBox('清除全部学习记录？', '将删除本网页的荧光标记与批注、掌握进度、复习日期和闪卡熟练度。此操作不能撤销，建议先复制备份码。', '全部清除', true).then(function (ok) {
          if (!ok) return;
          var t = now(), del = S.del || {};
          Object.keys(S.marks).forEach(function (k) { del[k] = t; });
          Object.keys(S.custom).forEach(function (k) { del[k] = t; });
          var fresh = DEF(); fresh.del = del; fresh.settings = S.settings; fresh.settingsU = t; fresh.colorNamesU = t; fresh.embSeen = S.embSeen;
          fresh.resetAt = t; fresh.updated = t; fresh.reviewFloor = dayOf(t);   // anything recorded before this moment is ignored by later merges
          S = fresh; afterMerge(true); save();
          toast('已清除全部学习记录');
        });
      }
    });
  }
  function downloadCopy() {
    var css = D.getElementById('ir-css').textContent;
    var dataTxt = D.getElementById('ir-data').textContent;
    var appTxt = D.getElementById('ir-app').textContent;
    var fontHref = (D.getElementById('ir-fonts') || {}).href || '';
    var html = '<!doctype html>\n<html lang="zh-Hans">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>' + esc(D.title || TOPIC) + '</title>\n' +
      (fontHref ? '<link id="ir-fonts" rel="stylesheet" href="' + esc(fontHref) + '">\n' : '') +
      '<style id="ir-css">' + css + '</style>\n</head>\n<body>\n' + PRISTINE_APP +
      '\n<script type="application/json" id="ir-data">' + dataTxt + '<\/script>\n<script type="application/json" id="ir-embedded-state">' + JSON.stringify(S).replace(/</g, '\\u003c') + '<\/script>\n<script id="ir-app">' + appTxt + '<\/script>\n</body>\n</html>\n';
    var name = TOPIC + '（含我的标记 ' + today() + '）.html';
    if (downloadsCap) {
      downloadsCap.save({ filename: name, data: html }).then(function () { toast('已交给浏览器保存'); }, function (e) { toast(e && e.code === 'declined' ? '已取消下载' : '当前环境不能下载，请改用“复制备份码”'); });
      return;
    }
    try {
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var a = el('a', { href: URL.createObjectURL(blob), download: name });
      D.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      toast('已生成带标记的网页文件');
    } catch (e) { toast('当前环境不能下载，请改用“复制备份码”'); }
  }
  function applySettings() {
    ROOT.style.fontSize = (S.settings.fs || 17) + 'px';
    var th = S.settings.theme || 'system';
    if (th === 'system') ROOT.removeAttribute('data-ir-theme'); else ROOT.setAttribute('data-ir-theme', th);
    APP.classList.toggle('notes-off', S.settings.notes === false);
    APP.classList.toggle('pure', !!S.settings.pure);
    var nb = $('[data-act="notes"]'); if (nb) nb.setAttribute('aria-pressed', S.settings.notes === false ? 'false' : 'true');
    syncToolButtons();
  }
  function afterMerge(full) {
    // re-render everything that depends on stored state
    $$('mark.hl').forEach(function (m) { m.setAttribute('data-stale', '1'); });
    unwrapAll($$('mark.hl'));
    TXT = new Map();
    HL.renderAll();
    applySettings();
    UNIT_EL.forEach(renderUnitActions);
    refreshProgress(); refreshTOCState(); refreshHLPanel(); renderPenStrip(); buildBarSwatches();
  }
  function buildBarSwatches() {
    bar.innerHTML = COLORS.map(function (c) { return swatchHtml(c, 'data-c', false, '标为' + S.colorNames[c]); }).join('') + '<span class="sep"></span><button class="mini" data-act="note" title="上色并加批注">' + ico('note') + '批注</button><button class="mini" data-act="close" aria-label="关闭">' + ico('x') + '</button>';
  }

  /* ------------------------------------------------------------ reading position */
  var posT = 0;
  /* the block under a probe line just below the top bar is what the reader is looking at (hidden blocks can never be hit) */
  function trackPos() {
    if (now() - posT < 1500) return;
    posT = now();
    var page = $('.page');
    if (!page) return;
    var pr = page.getBoundingClientRect();
    var xs = [pr.left + Math.min(120, pr.width / 4), pr.left + pr.width / 3];
    var found = null;
    for (var yi = 0; yi < 6 && !found; yi++) {
      for (var xi = 0; xi < xs.length && !found; xi++) {
        var hit = D.elementFromPoint(xs[xi], 96 + yi * 36);
        var blk = hit && hit.closest && hit.closest('[data-b]');
        if (blk && blk.closest('.page') && !blk.closest('[data-ui]')) found = blk;
      }
    }
    if (!found) return;
    var b = found.getAttribute('data-b');
    if (!S.lastPos || S.lastPos.b !== b) { S.lastPos = { b: b, u: now() }; save({ localOnly: true }); }
  }
  function resume() {
    var p = S.lastPos && BMAP[S.lastPos.b];
    if (!p) { toast('还没有记录到上次读到的位置'); return; }
    goTo(p, { block: 'start' });
  }

  /* ------------------------------------------------------------ knowledge map & timeline links */
  function initKmap() {
    var km = $('.kmap');
    if (!km) return;
    var svg = $('svg', km), edges = [];
    try { edges = JSON.parse(km.getAttribute('data-edges') || '[]'); } catch (e) { }
    function draw() {
      var kr = km.getBoundingClientRect();
      var h = '';
      edges.forEach(function (ed, i) {
        var a = $('[data-node="' + ed.from + '"]', km), b = $('[data-node="' + ed.to + '"]', km);
        if (!a || !b) return;
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        var x1, y1, x2, y2;
        if (rb.left > ra.right) { x1 = ra.right - kr.left; x2 = rb.left - kr.left; }
        else if (ra.left > rb.right) { x1 = ra.left - kr.left; x2 = rb.right - kr.left; }
        else { x1 = ra.left + ra.width * 0.9 - kr.left; x2 = rb.left + rb.width * 0.9 - kr.left; }
        y1 = ra.top + ra.height / 2 - kr.top; y2 = rb.top + rb.height / 2 - kr.top;
        var mx = (x1 + x2) / 2;
        var d = (Math.abs(x2 - x1) < 20) ? 'M' + x1 + ' ' + y1 + ' C' + (x1 + 28) + ' ' + y1 + ' ' + (x2 + 28) + ' ' + y2 + ' ' + x2 + ' ' + y2 : 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2;
        h += '<path data-e="' + i + '" d="' + d + '"></path>';
      });
      svg.innerHTML = h;
    }
    draw();
    W.addEventListener('resize', debounce(draw, 150));
    // redraw whenever the map itself changes size: font size setting, leaving pure mode, web fonts arriving
    if (W.ResizeObserver) new ResizeObserver(debounce(draw, 60)).observe(km);
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(draw);
    var list = $('.kmap-edges');
    km.addEventListener('click', function (e) {
      var n = e.target.closest('[data-node]');
      if (!n) return;
      var id = n.getAttribute('data-node');
      var on = !n.classList.contains('on');
      $$('.kmap-node', km).forEach(function (x) { x.classList.remove('on', 'nb'); });
      $$('path', svg).forEach(function (p) { p.classList.remove('on'); });
      km.classList.toggle('has-on', on);
      if (!on) { list.innerHTML = '<li>点按任一方块，查看它与其他知识点的关系。</li>'; return; }
      n.classList.add('on');
      var items = [];
      edges.forEach(function (ed, i) {
        if (ed.from !== id && ed.to !== id) return;
        var other = ed.from === id ? ed.to : ed.from;
        var on2 = $('[data-node="' + other + '"]', km); if (on2) on2.classList.add('nb');
        var p = $('path[data-e="' + i + '"]', svg); if (p) p.classList.add('on');
        items.push('<li><b>' + esc(labelOf(ed.from)) + '</b> →（' + esc(ed.label) + '）→ <b>' + esc(labelOf(ed.to)) + '</b></li>');
      });
      var unit = n.getAttribute('data-u');
      list.innerHTML = items.join('') + (unit && D.getElementById(unit) ? '<li><a href="#' + unit + '" data-jump="' + unit + '">阅读相关小节：' + esc((UNIT_BY_ID[unit] || {}).title || unit) + '</a></li>' : '');
    });
    list.addEventListener('click', function (e) { var a = e.target.closest('[data-jump]'); if (a) { e.preventDefault(); goTo(D.getElementById(a.getAttribute('data-jump')), { block: 'start' }); } });
    function labelOf(id) { var x = $('[data-node="' + id + '"]', km); return x ? x.textContent.trim() : id; }
  }
  APP.addEventListener('click', function (e) {
    var g = e.target.closest('[data-goto-row]');
    if (!g) return;
    var row = $('#s3-3 tbody tr:nth-child(' + g.getAttribute('data-goto-row') + ')');
    if (row) goTo(row);
  });
  APP.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-goto-row]')) { e.preventDefault(); e.target.closest('[data-goto-row]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  APP.addEventListener('click', function (e) {
    var q = e.target.closest('[data-q]');
    if (q) { e.preventDefault(); sInput.value = q.getAttribute('data-q'); doSearch(sInput.value); if (!W.matchMedia('(max-width: 899px)').matches) sInput.focus({ preventScroll: true }); }
  });
  APP.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-jump]');
    if (a && !a.closest('.kmap-edges')) { e.preventDefault(); goTo(D.getElementById(a.getAttribute('data-jump')), { block: 'start' }); }
  });

  /* ------------------------------------------------------------ keyboard */
  D.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if (e.key === 'Escape') {
      // close only the topmost layer; leave focus mode only when nothing else was open
      if (confirmEl.classList.contains('show')) return;
      if (modal.classList.contains('show')) { closeDialog(); return; }
      if (menu.classList.contains('show')) { closeMenu(); return; }
      if (bar.classList.contains('show')) { hideBar(); try { W.getSelection().removeAllRanges(); } catch (er) { } return; }
      if (sBox.classList.contains('open')) { sBox.classList.remove('open'); return; }
      if (APP.classList.contains('drawer-open')) { closeDrawer(); return; }
      if (APP.classList.contains('focus')) { APP.classList.remove('focus'); syncToolButtons(); }
      return;
    }
    if (FC.active && !typing) {
      if (e.key === ' ') { e.preventDefault(); fcAct('flip'); }
      else if (e.key === 'ArrowRight') fcAct('next');
      else if (e.key === 'ArrowLeft') fcAct('prev');
      else if (e.key === '1') fcAct('no');
      else if (e.key === '2') fcAct('yes');
      return;
    }
    if (typing) return;
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); sInput.focus(); }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { if (HL.undo.length) { e.preventDefault(); HL.doUndo(); } }
  });

  /* ------------------------------------------------------------ boot */
  indexBlocks();
  // the state embedded in a downloaded copy is merged only the first time that copy is opened
  try {
    var emb = D.getElementById('ir-embedded-state');
    if (emb && emb.textContent.trim()) {
      var et = emb.textContent, hsh = 5381;
      for (var hi = 0; hi < et.length; hi++) hsh = ((hsh * 33) ^ et.charCodeAt(hi)) >>> 0;
      var hk = hsh.toString(36);
      if (!S.embSeen[hk]) { mergeState(S, JSON.parse(et)); S.embSeen[hk] = 1; save(); }
    }
  } catch (e) { }
  UNIT_EL.forEach(renderUnitActions);
  buildTOC();
  buildBarSwatches();
  renderPenStrip();
  HL.renderAll();
  applySettings();
  refreshProgress();
  refreshTOCState();
  buildIndexes();
  refreshHLPanel();
  spyCollect(); spy();
  initKmap();
  booted = true;
  /* wide tables use the whole card on large screens; anything that scrolls sideways says so above itself and fades at the cut edge */
  function markScrollTables() {
    var wideScreen = W.matchMedia('(min-width: 1280px)').matches;
    $$('.tbl-wrap').forEach(function (w) {
      if (!wideScreen) { w.classList.remove('expand'); return; }
      if (!w.classList.contains('expand') && w.scrollWidth > w.clientWidth + 4) w.classList.add('expand');
    });
    $$('.tbl-wrap, .fig-body, .mm-wrap, .kmap-wrap, pre.tree, pre.code').forEach(function (w) {
      var sc = w.scrollWidth > w.clientWidth + 4;
      w.classList.toggle('scrolls', sc);
      w.classList.toggle('at-end', !sc || w.scrollLeft + w.clientWidth >= w.scrollWidth - 4);
      var p = w.previousElementSibling;
      if (sc && !(p && p.classList.contains('tbl-hint'))) w.insertAdjacentElement('beforebegin', el('p', { class: 'tbl-hint', 'data-ui': '1' }, (w.classList.contains('tbl-wrap') ? '表格' : w.tagName === 'PRE' ? '内容' : '图') + '较宽，可左右滑动查看 →'));
      if (!sc && p && p.classList.contains('tbl-hint')) p.remove();
      if (!w._sl) { w._sl = 1; w.addEventListener('scroll', function () { w.classList.toggle('at-end', w.scrollLeft + w.clientWidth >= w.scrollWidth - 4); }, { passive: true }); }
    });
    layoutNotes();
  }
  /* margin notes only float when the card really has room for a full reading column beside them */
  function layoutNotes() {
    var body = $('.sec[data-unit] .unit-body');
    if (!body) return;
    var fs = parseFloat(getComputedStyle(ROOT).fontSize) || 17;
    var need = fs * 38 + 270 + 28;
    APP.classList.toggle('notes-inline', body.clientWidth < need);
  }
  markScrollTables();
  W.addEventListener('resize', debounce(function () { spyCollect(); markScrollTables(); }, 200));
  // never print a masked page: masks are lifted for printing and restored afterwards
  var printMasks = null;
  W.addEventListener('beforeprint', function () {
    printMasks = APP.className.split(/\s+/).filter(function (c) { return /^mask-/.test(c); });
    printMasks.forEach(function (c) { APP.classList.remove(c); });
    printMasks.smask = $$('.smask');
    printMasks.smask.forEach(function (u) { u.classList.remove('smask'); });
  });
  W.addEventListener('afterprint', function () {
    if (!printMasks) return;
    printMasks.forEach(function (c) { APP.classList.add(c); });
    printMasks.smask.forEach(function (u) { u.classList.add('smask'); });
    printMasks = null;
  });
  // in-page links (references [R#], overview tiles, keyword links) open collapsed or folded places too
  APP.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var a = e.target.closest('a[href^="#"]');
    if (!a || a.closest('#toc') || a.hasAttribute('data-jump') || a.hasAttribute('data-q')) return;
    var t = D.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
    if (!t) return;
    e.preventDefault();
    goTo(t, { block: 'start' });
    try { history.pushState(null, '', a.getAttribute('href')); } catch (er) { }
  });
  W.addEventListener('hashchange', function () { var t = D.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) goTo(t, { block: 'start' }); });
  if (canPrint()) $$('[data-needs="print"]').forEach(function (x) { x.hidden = false; });
  // resume prompt
  var bootPos = S.lastPos ? { b: S.lastPos.b } : null;
  setTimeout(function () {
    var p = bootPos && BMAP[bootPos.b];
    if (p && !location.hash && p.getBoundingClientRect().top > W.innerHeight) {
      var u = UNIT_BY_ID[unitOf(p)];
      toast('上次读到：' + (u ? u.title : '正文'), '回到那里', function () { goTo(p, { block: 'start' }); }, 9000);
    }
  }, 600);
  if (W.claude && typeof W.claude.use === 'function') {
    W.claude.use('downloads').then(function (x) { downloadsCap = x || null; }, function () { });
  }
  Cloud.init();
  // expose a tiny hook for automated self-tests
  W.__IRN = { S: function () { return S; }, HL: HL, encode: encodeState, decode: decodeState, merge: mergeState, flush: flush, blockText: blockText, BMAP: function () { return BMAP; }, afterMerge: afterMerge };
})();
