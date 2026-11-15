/* ===================================================================== highlighter */
var HL_EXCLUDE = '.js-only, .answer-bar, .folio-foot, .fold-btn, .stamp, .folio-cote, .chap-numeral, .mm-src-toggle, .doc-kicker, script, style';
var HL_BLOCK = 'p, li, td, th, pre, h1, h2, h3, h4, h5, figcaption, blockquote, .dg-step, .dg-ev, .dg-card, .dg-layer, .dg-branch, .dg-from, .dg-node, .dg-bar, .dg-prow, .dg-verdict, .sn, .mn-verse, .mm-node, .ov-line, .ov-q';
var CTX_N = 24;
var COLORS = ['blue', 'yellow', 'red'];
function commonSuffix(a, b) { var n = 0; while (n < a.length && n < b.length && a.charAt(a.length - 1 - n) === b.charAt(b.length - 1 - n)) n++; return n; }
function commonPrefix(a, b) { var n = 0; while (n < a.length && n < b.length && a.charAt(n) === b.charAt(n)) n++; return n; }
function upperBound(arr, v) { var lo = 0, hi = arr.length; while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] <= v) lo = mid + 1; else hi = mid; } return lo; }

var HL = {
  ti: null, isDirty: true, undoStack: [], mode: '', pending: null, filter: 'all', maskState: '', orphans: {},
  colorName: function (c) { return (S.set.names && S.set.names[c]) || DEFAULT_NAMES[c]; },
  colorOf: function (m) { for (var i = 0; i < 3; i++) if (m.classList.contains('c-' + COLORS[i])) return COLORS[i]; return 'blue'; },
  dirty: function () { this.isDirty = true; },
  active: function () { var out = []; for (var id in S.hl) { var r = S.hl[id]; if (r && !r.del && r.segs && r.segs.length) out.push(r); } return out; },
  textOf: function (r) { return (r.segs || []).map(function (s) { return s.t; }).join(' … '); },

  /* ---------- text index over the document (UI controls excluded) */
  index: function () {
    if (!this.isDirty && this.ti) return this.ti;
    var nodes = [], starts = [], text = '', map = new Map();
    var w = document.createTreeWalker(DOC, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { var p = n.parentNode; return (p && p.closest(HL_EXCLUDE)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    var n;
    while ((n = w.nextNode())) { map.set(n, nodes.length); nodes.push(n); starts.push(text.length); text += n.nodeValue; }
    this.ti = { nodes: nodes, starts: starts, text: text, map: map };
    this.isDirty = false;
    return this.ti;
  },
  rangeOfEl: function (el) {
    var ti = this.index(), first = -1, last = -1;
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) { var i = ti.map.get(n); if (i !== undefined) { if (first < 0) first = i; last = i; } }
    if (first < 0) return null;
    return { s: ti.starts[first], e: ti.starts[last] + ti.nodes[last].nodeValue.length };
  },
  rangeToGlobal: function (r) {
    var ti = this.index(), s = -1, e = -1, i0 = 0;
    if (r.startContainer.nodeType === 3 && ti.map.has(r.startContainer)) i0 = ti.map.get(r.startContainer);
    for (var i = i0; i < ti.nodes.length; i++) {
      var n = ti.nodes[i];
      if (!r.intersectsNode(n)) { if (s >= 0) break; continue; }
      var a = 0, b = n.nodeValue.length;
      if (n === r.startContainer) a = r.startOffset;
      if (n === r.endContainer) b = r.endOffset;
      if (b <= a) continue;
      if (s < 0) s = ti.starts[i] + a;
      e = ti.starts[i] + b;
    }
    return s < 0 ? null : { s: s, e: e };
  },
  segmentsOf: function (s, e) {
    var ti = this.index(), segs = [], cur = null;
    var i = Math.max(0, upperBound(ti.starts, s) - 1);
    var nodeAt = function (pos) { return ti.nodes[Math.max(0, upperBound(ti.starts, pos) - 1)]; };
    var sa = nodeAt(s).parentNode.closest('[data-supp]'), sb = nodeAt(Math.max(s, e - 1)).parentNode.closest('[data-supp]');
    var inOneSupp = sa && sa === sb;
    for (; i < ti.nodes.length && ti.starts[i] < e; i++) {
      var n = ti.nodes[i], ns = ti.starts[i], len = n.nodeValue.length;
      var a = Math.max(s, ns), b = Math.min(e, ns + len);
      if (b <= a) continue;
      if (!inOneSupp && n.parentNode.closest('[data-supp]')) continue;
      var blk = n.parentNode.closest(HL_BLOCK);
      if (!blk) { if (!n.nodeValue.trim()) continue; blk = n.parentNode; }
      if (cur && cur.blk === blk) cur.e = b;
      else { cur = { blk: blk, s: a, e: b }; segs.push(cur); }
    }
    var T = ti.text;
    return segs.map(function (g) {
      while (g.s < g.e && /\s/.test(T.charAt(g.s))) g.s++;
      while (g.e > g.s && /\s/.test(T.charAt(g.e - 1))) g.e--;
      return g;
    }).filter(function (g) { return g.e > g.s; });
  },
  locate: function (seg, hint) {
    var T = this.index().text, full = seg.pre + seg.t + seg.suf, i = T.indexOf(full);
    if (i >= 0 && T.indexOf(full, i + 1) < 0) return [i + seg.pre.length, i + seg.pre.length + seg.t.length];
    var best = -1, bestScore = -1, from = 0, guard = 0;
    while ((i = T.indexOf(seg.t, from)) >= 0 && guard++ < 4000) {
      var sc = commonSuffix(T.slice(Math.max(0, i - seg.pre.length), i), seg.pre) + commonPrefix(T.slice(i + seg.t.length, i + seg.t.length + seg.suf.length), seg.suf);
      if (hint && i >= hint.s && i < hint.e) sc += 6;
      if (sc > bestScore) { bestScore = sc; best = i; }
      from = i + 1;
    }
    return best >= 0 ? [best, best + seg.t.length] : null;
  },
  wrap: function (s, e, r) {
    var ti = this.ti, first = null, last = null;
    var i = Math.max(0, upperBound(ti.starts, s) - 1);
    for (; i < ti.nodes.length && ti.starts[i] < e; i++) {
      var n = ti.nodes[i], ns = ti.starts[i], len = n.nodeValue.length;
      var a = Math.max(0, s - ns), b = Math.min(len, e - ns);
      if (b <= a) continue;
      if (!n.parentNode) continue;
      if (/^(UL|OL|TABLE|TBODY|THEAD|TR|SECTION|ARTICLE|DIV|HEADER|FOOTER|FIGURE|ASIDE)$/.test(n.parentNode.tagName) && !n.nodeValue.slice(a, b).trim()) continue;
      var target = n;
      if (b < len) n.splitText(b);
      if (a > 0) target = n.splitText(a);
      var mk = document.createElement('mark');
      mk.className = 'hl c-' + r.c + (r.note ? ' has-note' : '');
      mk.setAttribute('data-hid', r.id);
      target.parentNode.insertBefore(mk, target);
      mk.appendChild(target);
      if (!first) first = mk;
      last = mk;
    }
    if (first) first.classList.add('hl-s');
    if (last) last.classList.add('hl-e');
  },
  /* place a list of {s,e,r}; descending order keeps earlier offsets valid */
  place: function (items) {
    items.sort(function (x, y) { return y.s - x.s; });
    this.index();
    var minStart = Infinity;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      if (it.e > minStart) { this.isDirty = true; this.index(); }
      this.wrap(it.s, it.e, it.r);
      minStart = Math.min(minStart, it.s);
    }
    this.isDirty = true;
  },
  rangesFor: function (r) {
    var hint = null, out = [], self = this;
    if (r.sid) { var f = document.getElementById(r.sid); if (f) hint = this.rangeOfEl(f); }
    r.segs.forEach(function (seg) { var g = self.locate(seg, hint); if (g) out.push({ s: g[0], e: g[1], r: r }); });
    return out;
  },
  unwrapAll: function () {
    var parents = [];
    $$('mark.hl', DOC).forEach(function (m) { var p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); parents.push(p); });
    parents.forEach(function (p) { if (p.isConnected) p.normalize(); });
    this.isDirty = true;
  },
  unwrap: function (id) {
    var parents = [];
    $$('mark.hl[data-hid="' + id + '"]', DOC).forEach(function (m) { var p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); parents.push(p); });
    parents.forEach(function (p) { if (p.isConnected) p.normalize(); });
    this.isDirty = true;
  },
  renderAll: function () {
    var hadSearch = Search.terms.length;
    if (hadSearch) Search.clearMarks();
    this.unwrapAll();
    var self = this, items = [];
    this.orphans = {};
    this.index();
    this.active().forEach(function (r) { var rs = self.rangesFor(r); if (!rs.length) self.orphans[r.id] = 1; items = items.concat(rs); });
    this.place(items);
    if (hadSearch) Search.run(Search.q);
    this.renderList();
  },
  renderOne: function (r) {
    var rs = this.rangesFor(r);
    if (!rs.length) { this.orphans[r.id] = 1; return; }
    delete this.orphans[r.id];
    this.place(rs);
  },

  /* ---------- creating */
  currentRange: function () {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    var r = sel.getRangeAt(0);
    if (!DOC.contains(r.commonAncestorContainer)) return null;
    var a = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    if (a && a.closest && a.closest('input, textarea, .js-only')) return null;
    if (!String(sel).trim()) return null;
    return r;
  },
  apply: function (color, range) {
    range = range || this.currentRange() || this.pending;
    if (!range) { toast('请先选中要标记的文字'); return; }
    var g = this.rangeToGlobal(range);
    if (!g) { toast('这段文字不能标记，请选择正文'); return; }
    var segs = this.segmentsOf(g.s, g.e);
    if (!segs.length) return;
    var T = this.ti.text;
    var first = this.ti.nodes[Math.max(0, upperBound(this.ti.starts, segs[0].s) - 1)];
    var f = first && first.parentNode.closest('.folio');
    var r = {
      id: uid(), c: color, sid: f ? f.id : '', note: '', card: 0, ct: now(), u: now(),
      segs: segs.map(function (g2) { return { t: T.slice(g2.s, g2.e), pre: T.slice(Math.max(0, g2.s - CTX_N), g2.s), suf: T.slice(g2.e, g2.e + CTX_N) }; })
    };
    S.hl[r.id] = r;
    this.place(segs.map(function (g2) { return { s: g2.s, e: g2.e, r: r }; }));
    save();
    this.push({ t: 'add', id: r.id });
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    this.pending = null; this.hideBar();
    this.renderList();
    toast('已标为“' + this.colorName(color) + '”', '撤销', function () { HL.undo(); });
  },

  /* ---------- editing */
  push: function (op) { this.undoStack.push(op); if (this.undoStack.length > 60) this.undoStack.shift(); this.syncUndo(); },
  syncUndo: function () { var dis = !this.undoStack.length; $$('#hb-undo, .hl-undo').forEach(function (b) { b.disabled = dis; }); },
  update: function (id, patch, noUndo) {
    var r = S.hl[id]; if (!r) return;
    if (!noUndo) this.push({ t: 'upd', id: id, before: { c: r.c, note: r.note, card: r.card } });
    for (var k in patch) r[k] = patch[k];
    r.u = now(); save();
    $$('mark.hl[data-hid="' + id + '"]', DOC).forEach(function (m) {
      COLORS.forEach(function (c) { m.classList.toggle('c-' + c, c === r.c); });
      m.classList.toggle('has-note', !!r.note);
    });
    this.renderListSoon();
  },
  remove: function (id, noUndo) {
    var r = S.hl[id]; if (!r || r.del) return;
    if (!noUndo) this.push({ t: 'del', recs: [r] });
    S.hl[id] = { id: id, del: 1, u: now() };
    this.unwrap(id); delete this.orphans[id];
    save(); this.renderListSoon();
  },
  removeMany: function (ids) {
    var self = this, recs = [];
    ids.forEach(function (id) { var r = S.hl[id]; if (r && !r.del) { recs.push(r); S.hl[id] = { id: id, del: 1, u: now() }; self.unwrap(id); delete self.orphans[id]; } });
    if (recs.length) this.push({ t: 'del', recs: recs });
    save(); this.renderList();
    return recs.length;
  },
  undo: function () {
    var op = this.undoStack.pop(); this.syncUndo();
    if (!op) { toast('没有可以撤销的操作'); return; }
    var self = this;
    if (op.t === 'add') { var r = S.hl[op.id]; if (r && !r.del) { S.hl[op.id] = { id: op.id, del: 1, u: now() }; this.unwrap(op.id); } toast('已撤销标记'); }
    else if (op.t === 'del') {
      var items = [];
      this.index();
      op.recs.forEach(function (rec) { var c = Object.assign({}, rec, { u: now() }); delete c.del; S.hl[c.id] = c; var rs = self.rangesFor(c); if (rs.length) { delete self.orphans[c.id]; items = items.concat(rs); } else self.orphans[c.id] = 1; });
      this.place(items);
      toast('已恢复 ' + op.recs.length + ' 条标记');
    }
    else if (op.t === 'upd') { this.update(op.id, op.before, true); toast('已撤销修改'); }
    save(); this.closePop(); this.renderList();
  },
  clearAll: function () {
    var ids = this.active().map(function (r) { return r.id; });
    if (!ids.length) { toast('还没有荧光标记'); return; }
    var self = this;
    confirmBox('确定要清空全部 ' + ids.length + ' 条荧光标记（含批注）吗？清空后可以马上点“撤销”恢复。', '清空全部').then(function (ok) {
      if (!ok) return; var n = self.removeMany(ids);
      toast('已清空 ' + n + ' 条标记', '撤销', function () { self.undo(); });
    });
  },
  clearSection: function (sid) {
    var f = document.getElementById(sid), set = {};
    $$('mark.hl', f).forEach(function (m) { set[m.getAttribute('data-hid')] = 1; });
    this.active().forEach(function (r) { if (r.sid === sid && HL.orphans[r.id]) set[r.id] = 1; });
    var ids = Object.keys(set);
    if (!ids.length) { toast('本节还没有荧光标记'); return; }
    var self = this, title = f.getAttribute('data-title') || '';
    confirmBox('确定要清空“' + title + '”里的 ' + ids.length + ' 条荧光标记吗？', '清空本节').then(function (ok) {
      if (!ok) return; var n = self.removeMany(ids);
      toast('已清空本节 ' + n + ' 条标记', '撤销', function () { self.undo(); });
    });
  },

  /* ---------- selection bar */
  showBar: function (range) {
    var bar = $('#hl-bar');
    $$('.pen', bar).forEach(function (p) { var c = p.getAttribute('data-color'); p.setAttribute('aria-pressed', HL.mode === c ? 'true' : 'false'); p.title = '标为“' + HL.colorName(c) + '”'; p.setAttribute('aria-label', p.title); });
    bar.hidden = false;
    var docked = COARSE || window.innerWidth < 700;
    bar.classList.toggle('docked', docked);
    if (docked) {
      bar.style.left = ''; bar.style.top = '';
      bar.classList.remove('docked-top');
      var br = bar.getBoundingClientRect(), sr = range.getBoundingClientRect();
      if (sr.bottom > br.top - 12) bar.classList.add('docked-top');
      document.body.classList.toggle('hlbar-up', !bar.classList.contains('docked-top'));
      return;
    }
    var rc = range.getBoundingClientRect(), w = bar.offsetWidth, h = bar.offsetHeight;
    var top = rc.top - h - 10;
    if (top < 70) top = rc.bottom + 10;
    bar.style.left = clamp(rc.left + rc.width / 2 - w / 2, 8, window.innerWidth - w - 8) + 'px';
    bar.style.top = clamp(top, 8, window.innerHeight - h - 8) + 'px';
  },
  hideBar: function () { $('#hl-bar').hidden = true; document.body.classList.remove('hlbar-up'); },
  autoT: null, touching: false,
  onSelection: function () {
    var r = this.currentRange();
    if (!r) { if (!$('#hl-bar').matches(':hover')) { this.pending = null; this.hideBar(); } return; }
    this.pending = r.cloneRange();
    this.showBar(r);
    if (this.mode && COARSE && !this.touching) this.scheduleAuto(900);
  },
  scheduleAuto: function (ms) {
    var self = this;
    clearTimeout(this.autoT);
    this.autoT = setTimeout(function () { if (self.mode && self.currentRange() && !self.touching) self.apply(self.mode); }, ms);
  },
  openPenMenu: function (btn) {
    var menu = $('#pen-menu');
    if (!menu) {
      menu = document.createElement('div'); menu.id = 'pen-menu'; menu.className = 'hl-pop'; menu.setAttribute('role', 'menu');
      ROOT.appendChild(menu);
      menu.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mode]');
        if (b) { HL.setMode(b.getAttribute('data-mode')); menu.hidden = true; return; }
        if (e.target.closest('[data-act="list"]')) { menu.hidden = true; Side.open('hl'); Side.tab('hl'); }
      });
      document.addEventListener('pointerdown', function (e) { if (!e.target.closest('#pen-menu, [data-tool="pen"]')) menu.hidden = true; });
    }
    var self = this;
    menu.innerHTML = '<p class="excerpt" style="max-height:none">选中任意文字即可上色。开启“荧光笔模式”后，选好颜色，之后选中文字松手就自动上色。</p>' +
      '<div class="row" style="gap:6px">' + ['', 'blue', 'yellow', 'red'].map(function (c) {
        var on = self.mode === c;
        return c ? '<button type="button" class="btn" data-mode="' + c + '" aria-pressed="' + on + '" style="' + (on ? 'border-color:var(--ink)' : '') + '"><span class="pen c-' + c + '" style="width:26px;height:26px;display:inline-grid"><i style="width:20px;height:12px"></i></span>' + esc(self.colorName(c)) + '</button>'
          : '<button type="button" class="btn" data-mode="" aria-pressed="' + on + '">' + (on ? '✓ ' : '') + '关闭模式</button>';
      }).join('') + '</div><div class="actions"><button type="button" class="btn" data-act="list">' + icon('list') + '我的荧光笔</button></div>';
    menu.hidden = false;
    var rc = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    var top = rc.bottom + 8; if (top + h > window.innerHeight - 8) top = rc.top - h - 8;
    menu.style.left = clamp(rc.left + rc.width / 2 - w / 2, 8, window.innerWidth - w - 8) + 'px';
    menu.style.top = clamp(top, 8, window.innerHeight - h - 8) + 'px';
  },
  setMode: function (c) {
    this.mode = c || '';
    $$('[data-tool="pen"]').forEach(function (b) { if (c) b.setAttribute('data-hlmode', c); else b.removeAttribute('data-hlmode'); b.setAttribute('aria-pressed', c ? 'true' : 'false'); });
    toast(c ? '荧光笔模式：选中文字松手即标为“' + this.colorName(c) + '”' : '已关闭荧光笔模式（仍可选中文字后点颜色上色）');
  },

  /* ---------- edit popover */
  popId: null,
  handleClick: function (e) {
    var m = e.target.closest('mark.hl'); if (!m) return;
    if (window.getSelection && String(window.getSelection()).trim()) return;
    this.openPop(m.getAttribute('data-hid'), m);
  },
  openPop: function (id, anchorEl) {
    var r = S.hl[id]; if (!r || r.del) return;
    this.closePop();
    this.popId = id;
    $$('mark.hl[data-hid="' + id + '"]').forEach(function (m) { m.classList.add('is-active'); });
    var pop = $('#hl-pop');
    var t = this.textOf(r);
    $('#hp-excerpt').textContent = '“' + (t.length > 80 ? t.slice(0, 80) + '…' : t) + '”';
    $$('#hp-colors .pen').forEach(function (p) { var c = p.getAttribute('data-color'); p.setAttribute('aria-pressed', r.c === c ? 'true' : 'false'); p.title = HL.colorName(c); p.setAttribute('aria-label', '改为“' + HL.colorName(c) + '”'); });
    $('#hp-note').value = r.note || '';
    $('#hp-card').lastChild.textContent = r.card ? '移出闪卡' : '加入闪卡';
    pop.hidden = false;
    var rc = (anchorEl || $('mark.hl[data-hid="' + id + '"]')).getBoundingClientRect();
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var top = rc.bottom + 8; if (top + h > window.innerHeight - 70) top = rc.top - h - 8;
    pop.style.left = clamp(rc.left, 10, window.innerWidth - w - 10) + 'px';
    pop.style.top = clamp(top, 10, window.innerHeight - h - 10) + 'px';
  },
  closePop: function () {
    var pop = $('#hl-pop'); if (pop.hidden) return;
    var v = $('#hp-note').value.trim();
    if (this.popId && S.hl[this.popId]) {
      var r0 = S.hl[this.popId], nb = this.noteBefore && this.noteBefore.id === this.popId ? this.noteBefore : null;
      var orig = nb ? nb.note : (r0.note || '');
      if (orig !== v) this.push({ t: 'upd', id: this.popId, before: { c: r0.c, note: orig, card: r0.card } });
      this.noteBefore = null;
      if ((r0.note || '') !== v) this.update(this.popId, { note: v }, true);
    }
    pop.hidden = true;
    $$('mark.hl.is-active').forEach(function (m) { m.classList.remove('is-active'); });
    this.popId = null;
  },
  noteBefore: null,
  bindPop: function () {
    var self = this;
    $('#hp-colors').addEventListener('click', function (e) {
      var p = e.target.closest('.pen'); if (!p || !self.popId) return;
      var c = p.getAttribute('data-color');
      self.update(self.popId, { c: c });
      $$('#hp-colors .pen').forEach(function (x) { x.setAttribute('aria-pressed', x === p ? 'true' : 'false'); });
      toast('已改为“' + self.colorName(c) + '”', '撤销', function () { self.undo(); });
    });
    $('#hp-close').addEventListener('click', function () { self.closePop(); });
    var note = $('#hp-note');
    note.addEventListener('focus', function () { if (self.popId) self.noteBefore = { id: self.popId, note: S.hl[self.popId].note || '' }; });
    var noteSave = debounce(function (id, v) { if (S.hl[id] && !S.hl[id].del && (S.hl[id].note || '') !== v) self.update(id, { note: v }, true); }, 350);
    note.addEventListener('input', function () { if (self.popId) noteSave(self.popId, note.value.trim()); });
    note.addEventListener('blur', function () {
      var nb = self.noteBefore; self.noteBefore = null;
      if (nb && S.hl[nb.id] && (S.hl[nb.id].note || '') !== nb.note) {
        if (S.hl[nb.id].note !== note.value.trim() && self.popId === nb.id) self.update(nb.id, { note: note.value.trim() }, true);
        var r = S.hl[nb.id]; self.push({ t: 'upd', id: nb.id, before: { c: r.c, note: nb.note, card: r.card } });
      }
    });
    $('#hp-card').addEventListener('click', function () {
      if (!self.popId) return; var r = S.hl[self.popId];
      self.update(self.popId, { card: r.card ? 0 : 1 });
      $('#hp-card').lastChild.textContent = r.card ? '移出闪卡' : '加入闪卡';
      toast(r.card ? '已加入闪卡（“我的荧光笔”卡组）' : '已移出闪卡');
    });
    $('#hp-del').addEventListener('click', function () {
      if (!self.popId) return; var id = self.popId; self.closePop(); self.remove(id);
      toast('已删除标记', '撤销', function () { self.undo(); });
    });
    document.addEventListener('pointerdown', function (e) {
      if (!$('#hl-pop').hidden && !e.target.closest('#hl-pop, mark.hl')) self.closePop();
    });
  },

  /* ---------- side panel: 我的荧光笔 */
  renderListSoon: debounce(function () { HL.renderList(); }, 200),
  renderList: function () {
    var host = $('#panel-hl'); if (!host || host.hidden) { this._listStale = true; return; }
    this._listStale = false;
    var self = this, all = this.active();
    var counts = { all: all.length, blue: 0, yellow: 0, red: 0 };
    all.forEach(function (r) { counts[r.c] = (counts[r.c] || 0) + 1; });
    var f = this.filter;
    var list = all.filter(function (r) { return f === 'all' || r.c === f; });
    var pos = {};
    list.forEach(function (r) { var m = DOC.querySelector('mark.hl[data-hid="' + r.id + '"]'); pos[r.id] = m; });
    list.sort(function (a, b) {
      var ma = pos[a.id], mb = pos[b.id];
      if (ma && mb) return ma.compareDocumentPosition(mb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      return ma ? -1 : mb ? 1 : a.ct - b.ct;
    });
    var maskOn = this.maskState && (this.maskState === f || (this.maskState === 'all' && f === 'all'));
    var html = '<div class="side-head"><div class="hl-filter">' + ['all', 'blue', 'yellow', 'red'].map(function (c) {
      return '<button type="button" class="chip-btn" data-f="' + c + '" aria-pressed="' + (f === c) + '">' + (c === 'all' ? '全部' : '<span class="pen c-' + c + '" style="width:16px;height:16px;display:inline-grid"><i style="width:14px;height:9px"></i></span>' + esc(self.colorName(c))) + ' ' + (counts[c] || 0) + '</button>';
    }).join('') + '</div><div class="side-actions">' +
      '<button type="button" class="chip-btn" data-a="mask" aria-pressed="' + (maskOn ? 'true' : 'false') + '">' + icon('redact') + (maskOn ? '取消遮挡' : '遮住' + (f === 'all' ? '全部' : '“' + esc(self.colorName(f)) + '”') + '来背') + '</button>' +
      '<button type="button" class="chip-btn" data-a="md">' + icon('md') + '复制为 Markdown</button>' +
      '<button type="button" class="chip-btn" data-a="cards">' + icon('cards') + '全部加入闪卡</button>' +
      '<button type="button" class="chip-btn hl-undo" data-a="undo">' + icon('undo') + '撤销</button>' +
      '<button type="button" class="chip-btn" data-a="clear">' + icon('trash') + '清空全部</button>' +
      '</div><textarea class="md-out" hidden readonly style="width:100%;min-height:120px;font-size:.8em"></textarea>' +
      '<p class="idx-empty" style="padding:0 2px;margin:0">选中文字即可上色（可跨段落、跨表格格子）；点按已有标记可改色、批注、删除。</p></div>';
    if (!list.length) html += '<div class="idx-empty">' + (all.length ? '这个颜色还没有标记。' : '还没有荧光标记。在正文里选中文字，点颜色就能标记。') + '</div>';
    var lastSec = null;
    list.forEach(function (r) {
      var orphan = !pos[r.id];
      var sec = orphan ? '未能在当前页面定位' : HL.groupLabel(pos[r.id]);
      if (sec !== lastSec) { html += '<div class="idx-group"><h4>' + esc(sec) + '</h4></div>'; lastSec = sec; }
      var t = self.textOf(r);
      html += '<button type="button" class="hl-item c-' + r.c + (orphan ? ' orphan' : '') + '" data-id="' + r.id + '">' + esc(t.length > 110 ? t.slice(0, 110) + '…' : t) +
        (r.note ? '<span class="hn">批注：' + esc(r.note) + '</span>' : '') + (r.card ? '<small style="display:block;color:var(--ink-3)">已加入闪卡</small>' : '') + '</button>';
    });
    host.innerHTML = html;
    this.syncUndo();
  },
  bindList: function () {
    var self = this, host = $('#panel-hl');
    host.addEventListener('click', function (e) {
      var fb = e.target.closest('[data-f]');
      if (fb) { self.filter = fb.getAttribute('data-f'); self.renderList(); return; }
      var ab = e.target.closest('[data-a]');
      if (ab) {
        var a = ab.getAttribute('data-a');
        if (a === 'mask') self.toggleMask(self.filter);
        if (a === 'md') self.copyMarkdown(host);
        if (a === 'cards') { var n = 0; self.active().forEach(function (r) { if ((self.filter === 'all' || r.c === self.filter) && !r.card) { r.card = 1; r.u = now(); n++; } }); save(); self.renderList(); toast(n ? '已把 ' + n + ' 条标记加入闪卡（“我的荧光笔”卡组）' : '这些标记都已在闪卡里'); }
        if (a === 'undo') self.undo();
        if (a === 'clear') self.clearAll();
        return;
      }
      var it = e.target.closest('.hl-item');
      if (it && !it.classList.contains('orphan')) self.jump(it.getAttribute('data-id'));
    });
  },
  jump: function (id) {
    var m = DOC.querySelector('mark.hl[data-hid="' + id + '"]');
    if (!m) { toast('这条标记在当前页面中找不到原文位置'); return; }
    goTo(m, { block: 'center' });
    setTimeout(function () { HL.openPop(id, m); }, REDUCED ? 30 : 450);
  },
  toggleMask: function (f) {
    var b = document.body.classList;
    ['all', 'blue', 'yellow', 'red'].forEach(function (c) { b.remove('hlmask-' + c); });
    $$('mark.hl.peek').forEach(function (m) { m.classList.remove('peek'); });
    if (this.maskState === f) { this.maskState = ''; toast('已取消荧光标记遮挡'); }
    else { this.maskState = f; b.add('hlmask-' + f); toast('已遮住' + (f === 'all' ? '全部' : '“' + this.colorName(f) + '”') + '标记：点按逐个显示'); }
    this.renderList();
  },
  markdown: function () {
    var self = this, groups = [], bySec = {};
    var all = this.active();
    all.forEach(function (r) {
      var m = DOC.querySelector('mark.hl[data-hid="' + r.id + '"]');
      var host = m || (r.sid ? document.getElementById(r.sid) : null);
      var key = host ? HL.groupLabel(host) : '未能在当前页面定位';
      if (!bySec[key]) { bySec[key] = { title: key, el: host, items: [] }; groups.push(bySec[key]); }
      bySec[key].items.push({ r: r, m: m });
    });
    groups.sort(function (a, b) { if (a.el && b.el) return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; return a.el ? -1 : 1; });
    var out = '# ' + (META.title || '') + ' · 我的荧光笔\n\n> 导出日期：' + dayStr() + '；共 ' + all.length + ' 条。\n';
    groups.forEach(function (g) {
      out += '\n## ' + g.title + '\n';
      COLORS.forEach(function (c) {
        var items = g.items.filter(function (x) { return x.r.c === c; });
        items.sort(function (x, y) { if (x.m && y.m) return x.m.compareDocumentPosition(y.m) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; return x.m ? -1 : 1; });
        if (!items.length) return;
        out += '\n### ' + self.colorName(c) + '（' + { blue: '蓝', yellow: '黄', red: '红' }[c] + '）\n\n';
        items.forEach(function (x) { out += '- ' + self.textOf(x.r).replace(/\s+/g, ' ') + '\n'; if (x.r.note) out += '  - 批注：' + x.r.note.replace(/\s+/g, ' ') + '\n'; });
      });
    });
    return out;
  },
  copyMarkdown: function (host) {
    var md = this.markdown(), ta = $('.md-out', host);
    var fallback = function () { ta.hidden = false; ta.value = md; ta.focus(); ta.select(); toast('没能自动复制：内容已选中，请按“拷贝”'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(md).then(function () { toast('已复制 Markdown 清单，可粘贴到 Obsidian 等笔记软件'); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  },
  groupLabel: function (el) {
    var fo = el.closest('.folio');
    if (fo) return fo.getAttribute('data-title');
    var ch = el.closest('.chapter');
    if (ch && ch.id !== 'c-front') { var h2 = $('h2', ch); if (h2) return txt(h2).replace(/^🔵\s*/, ''); }
    return '卷首与概览';
  },
  refreshNames: function () { this.renderList(); if (Settings) Settings.sync(); },
  searchNotes: function (terms) {
    var self = this;
    return this.active().filter(function (r) {
      if (!r.note) return false;
      var n = r.note.toLowerCase(), all = (n + ' ' + self.textOf(r).toLowerCase());
      return terms.every(function (t) { return all.indexOf(t) >= 0; }) && terms.some(function (t) { return n.indexOf(t) >= 0; });
    });
  },
  cards: function () {
    var self = this;
    return this.active().filter(function (r) { return r.card; }).map(function (r) {
      var clean = function (t) { return t.replace(/\s*\n[\s\S]*$/, '').replace(/\s+/g, ' '); };
      var pre = r.segs[0].pre, suf = r.segs[r.segs.length - 1].suf;
      pre = pre.replace(/^[\s\S]*\n/, '').replace(/\s+/g, ' ').slice(-16);
      suf = clean(suf).slice(0, 16);
      var front = (pre ? '…' + pre : '') + '［　　］' + (suf ? suf + '…' : '');
      if (!pre && !suf) { var fo = r.sid && document.getElementById(r.sid); front = '［　　］\n（出自：' + (fo ? fo.getAttribute('data-title') : '本页') + (r.note ? '；批注：' + r.note : '') + '）'; }
      return { id: 'hl:' + r.id, deck: '我的荧光笔', f: front, b: self.textOf(r) + (r.note ? '\n批注：' + r.note : ''), s: r.sid, hid: r.id };
    });
  },

  bind: function () {
    var self = this;
    var onSel = debounce(function () { self.onSelection(); }, 140);
    document.addEventListener('selectionchange', onSel);
    var bar = $('#hl-bar');
    bar.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    bar.addEventListener('mousedown', function (e) { e.preventDefault(); });
    bar.addEventListener('click', function (e) {
      var p = e.target.closest('.pen');
      if (p) { self.apply(p.getAttribute('data-color'), self.currentRange() || self.pending); return; }
      if (e.target.closest('#hb-undo')) { self.undo(); return; }
      if (e.target.closest('#hb-close')) { self.hideBar(); try { window.getSelection().removeAllRanges(); } catch (er) {} }
    });
    document.addEventListener('touchstart', function () { self.touching = true; clearTimeout(self.autoT); }, { passive: true });
    document.addEventListener('touchend', function () { self.touching = false; if (self.mode && self.currentRange()) self.scheduleAuto(650); }, { passive: true });
    document.addEventListener('mouseup', function (e) {
      if (!self.mode || COARSE || e.target.closest('#hl-bar, #hl-pop, .topbar, .sidebar, .modal')) return;
      setTimeout(function () { if (self.currentRange()) self.apply(self.mode); }, 10);
    });
    DOC.addEventListener('click', function (e) {
      var b = e.target.closest('.ff-clearhl'); if (b) self.clearSection(b.getAttribute('data-sec'));
    });
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && tag !== 'input' && tag !== 'textarea') { e.preventDefault(); self.undo(); }
      if (e.key === 'Escape') { if ($('#sidebar').classList.contains('open') && !modalStack.length) Side.close(); self.closePop(); self.hideBar(); RefPop.hide(); var m = $('#pen-menu'); if (m) m.hidden = true; if (modalStack.length) closeModal(modalStack[modalStack.length - 1].m.id); else if (document.body.classList.contains('focus')) Modes.setFocus(false); }
    });
    this.bindPop(); this.bindList(); this.syncUndo();
  }
};
