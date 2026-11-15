/* ===================================================================== search */
var UNIT_SEL = 'h1, h2, h3, h4, p, li, td, th, pre, .dg-step, .dg-ev, .dg-card, .dg-layer, .dg-side h5, .dg-branch, .dg-from, .dg-node, .dg-bar, .dg-prow, .dg-phase, .dg-verdict, .mn-verse, .fig-title, .mn-title, .mm-node';
function ownText(el) {
  if (el.tagName !== 'LI') return el.textContent;
  var s = '';
  for (var c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) continue;
    s += c.textContent;
  }
  return s;
}
function pathOf(el) {
  var f = el.closest('.folio'), ch = el.closest('.chapter'), ov = el.closest('.overview');
  if (ov) return '学习概览（补充）';
  var parts = [];
  if (f) {
    parts.push(f.getAttribute('data-title') || '');
    var prevH4 = null;
    $$('h4.sub-h', f).forEach(function (h) { if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) prevH4 = h; });
    if (prevH4) parts.push(txt(prevH4));
  } else if (ch) { var h2 = $('h2', ch); if (h2) parts.push(txt(h2).replace(/^🔵\s*/, '')); }
  else parts.push('卷首');
  return parts.join(' › ');
}
var Search = {
  units: null, marks: [], cur: -1, q: '', terms: [],
  invalidate: function () { this.units = null; },
  index: function () {
    if (this.units) return this.units;
    var pure = document.body.classList.contains('pure');
    this.units = $$(UNIT_SEL, DOC).filter(function (el) {
      if (el.closest('.js-only, .answer-bar, .folio-foot, .mm-src')) return false;
      if (el.tagName === 'LI' && el.closest('.dg, .mindmap, .mn-keys')) return false;
      if (el.tagName === 'H5') return true;
      if (pure && el.closest('[data-supp]')) return false;
      return true;
    }).map(function (el) { return { el: el, t: ownText(el).toLowerCase() }; });
    return this.units;
  },
  parse: function (q) {
    var seen = {};
    return q.toLowerCase().split(/[\s　]+/).filter(function (w) { if (!w || seen[w]) return false; seen[w] = 1; return true; });
  },
  run: function (q) {
    this.clearMarks();
    this.q = q; this.terms = this.parse(q);
    var terms = this.terms;
    $('#q-clear').hidden = !q;
    if (!terms.length) { $('#q-count').textContent = ''; this.hidePanel(); return; }
    var hits = this.index().filter(function (u) { return terms.every(function (t) { return u.t.indexOf(t) >= 0; }); });
    var notes = HL.searchNotes(terms);
    var count = 0;
    var MAXMARK = 500;
    hits.slice(0, MAXMARK).forEach(function (u) { count += Search.markIn(u.el, terms); });
    this.marks = $$('mark.sh0', DOC);
    this.count = count;
    HL.dirty();
    $('#q-count').textContent = hits.length ? (count + ' 处') : '无结果';
    this.renderPanel(hits, notes);
    this.cur = -1;
  },
  /* match on the unit's joined text, so a hit may cross bold words, numbers or links */
  markIn: function (el, terms) {
    var re = new RegExp(terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'gi');
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        var lst = el.tagName === 'LI' ? p.closest('ul, ol') : null;
        if (lst && el.contains(lst)) return NodeFilter.FILTER_REJECT;
        if (p.closest('mark.sh, .js-only')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], starts = [], joined = '', n;
    while ((n = walker.nextNode())) { nodes.push(n); starts.push(joined.length); joined += n.nodeValue; }
    var low = joined.toLowerCase(), m, ranges = [];
    re.lastIndex = 0;
    while ((m = re.exec(low))) { if (!m[0]) { re.lastIndex++; continue; } ranges.push([m.index, m.index + m[0].length]); }
    /* wrap from the last match backwards so earlier offsets stay valid */
    for (var r = ranges.length - 1; r >= 0; r--) {
      var s0 = ranges[r][0], e0 = ranges[r][1], first = null;
      for (var i = nodes.length - 1; i >= 0; i--) {
        var tn = nodes[i], ns = starts[i], len = tn.nodeValue.length;
        if (ns >= e0 || ns + len <= s0) continue;
        var a = Math.max(0, s0 - ns), b = Math.min(len, e0 - ns);
        var target = tn;
        if (b < len) tn.splitText(b);
        if (a > 0) target = tn.splitText(a);
        var mk = document.createElement('mark'); mk.className = 'sh';
        target.parentNode.insertBefore(mk, target); mk.appendChild(target);
        first = mk;
      }
      if (first) first.classList.add('sh0');
    }
    return ranges.length;
  },
  clearMarks: function () {
    var parents = [];
    /* move children out (a highlight may sit inside a hit) instead of flattening to text */
    $$('mark.sh', DOC).forEach(function (m) { var p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); parents.push(p); });
    parents.forEach(function (p) { if (p.isConnected) p.normalize(); });
    this.marks = []; this.cur = -1; this.count = 0;
    HL.dirty();
  },
  renderPanel: function (hits, notes) {
    var list = $('#sp-list'), terms = this.terms;
    function hiText(s) {
      s = s.replace(/\s+/g, ' ').trim();
      var low = s.toLowerCase(), first = -1;
      terms.forEach(function (t) { var i = low.indexOf(t); if (i >= 0 && (first < 0 || i < first)) first = i; });
      var start = Math.max(0, first - 24), cut = s.slice(start, start + 120);
      var out = esc(cut);
      terms.forEach(function (t) { out = out.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), function (x) { return '<b>' + x + '</b>'; }); });
      return (start > 0 ? '…' : '') + out + (start + 120 < s.length ? '…' : '');
    }
    var html = '';
    notes.forEach(function (h) {
      html += '<button type="button" class="sp-item" data-hl="' + esc(h.id) + '"><span class="sp-path"><span class="sp-kind">批注</span>' + esc(HL.colorName(h.c)) + '</span>' + hiText((h.note || '') + ' ｜ ' + HL.textOf(h)) + '</button>';
    });
    hits.slice(0, 300).forEach(function (u, i) {
      var supp = u.el.closest('[data-supp]') ? '<span class="sp-kind">补充</span>' : '';
      html += '<button type="button" class="sp-item" data-i="' + i + '"><span class="sp-path">' + supp + esc(pathOf(u.el)) + '</span>' + hiText(u.el.textContent) + '</button>';
    });
    if (!html) html = '<div class="sp-empty">没有找到同时包含“' + esc(terms.join('”“')) + '”的段落。可以减少关键词，或换个说法。</div>';
    list.innerHTML = html;
    $('#sp-info').textContent = (terms.length > 1 ? '同时包含 ' + terms.length + ' 个词：' : '') + hits.length + ' 段' + (notes.length ? '，' + notes.length + ' 条批注' : '') + (hits.length > 300 ? '（列出前 300 段）' : '');
    this._hits = hits;
    $('#search-panel').hidden = false;
  },
  hidePanel: function () { $('#search-panel').hidden = true; },
  step: function (d) {
    if (!this.marks.length) return;
    $$('mark.sh.cur', DOC).forEach(function (x) { x.classList.remove('cur'); });
    this.cur = (this.cur + d + this.marks.length) % this.marks.length;
    var m = this.marks[this.cur];
    if (!m.isConnected) { this.marks = $$('mark.sh0', DOC); return this.step(0); }
    m.classList.add('cur');
    openAncestors(m);
    m.scrollIntoView({ block: 'center', behavior: scrollMode(m.getBoundingClientRect().top) });
    $('#q-count').textContent = (this.cur + 1) + ' / ' + this.marks.length;
  },
  bind: function () {
    var q = $('#q'), self = this;
    var run = debounce(function () { self.run(q.value.trim()); }, 220);
    q.addEventListener('input', run);
    q.addEventListener('focus', function () { if (self.terms.length) $('#search-panel').hidden = false; });
    q.addEventListener('click', function () { if (self.terms.length) $('#search-panel').hidden = false; });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var v = q.value.trim();
        if (v !== self.q) self.run(v);
        if (self.marks.length) { self.hidePanel(); self.step(e.shiftKey ? -1 : 1); }
      }
      if (e.key === 'Escape') { q.value = ''; self.run(''); q.blur(); }
    });
    $('#q-clear').addEventListener('click', function () { q.value = ''; self.run(''); q.focus(); });
    $('#sp-close').addEventListener('click', function () { self.hidePanel(); });
    $('#sp-next').addEventListener('click', function () { self.hidePanel(); self.step(1); });
    $('#sp-prev').addEventListener('click', function () { self.hidePanel(); self.step(-1); });
    $('#sp-list').addEventListener('click', function (e) {
      var b = e.target.closest('.sp-item'); if (!b) return;
      self.hidePanel();
      if (b.hasAttribute('data-hl')) { HL.jump(b.getAttribute('data-hl')); return; }
      var u = self._hits[+b.getAttribute('data-i')]; if (!u) return;
      var m = u.el.querySelector('mark.sh0');
      if (m) { var i = self.marks.indexOf(m); if (i >= 0) { self.cur = i - 1; self.step(1); return; } }
      goTo(u.el, { block: 'center' });
    });
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (e.key === '/' && tag !== 'input' && tag !== 'textarea') { e.preventDefault(); q.focus(); q.select(); }
    });
    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('#search-panel, .search-box')) self.hidePanel();
      if (!e.target.closest('#ref-pop, .ref')) RefPop.hide();
    });
    DOC.addEventListener('click', function (e) {
      var k = e.target.closest('.kw-chip'); if (!k) return;
      q.value = k.getAttribute('data-q'); self.run(q.value); window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }); q.focus({ preventScroll: true });
    });
  }
};

/* ===================================================================== key / pitfall indexes */
var Index = {
  built: {},
  clean: function (el) {
    var c = el.cloneNode(true);
    $$('[data-supp], .supp, .sn, .js-only', c).forEach(function (x) { x.remove(); });
    return txt(c);
  },
  collect: function (kind) {
    var items = [], self = this;
    var tone = kind === 'key' ? 't-key' : 't-warn';
    $$('#doc .' + tone).forEach(function (el) {
      if (el.closest('[data-supp], #s-legend')) return;
      if (!/^(P|LI|TD)$/.test(el.tagName)) return;
      var label = '', text = self.clean(el).replace(/^(?:🔴|🟡)\s*/, '');
      if (el.tagName === 'TD') {
        var tr = el.closest('tr');
        label = self.clean(tr.cells[0]) + ' — ';
        if (/^见上|^见 ?§/.test(text) && tr.cells[2]) text = self.clean(tr.cells[2]) + '（' + text + '）';
      }
      /* a bare “核查” header: index the corrections listed under it instead */
      if (el.tagName === 'P' && /^核查/.test(text) && text.length < 40) {
        var list = el.nextElementSibling;
        if (list && /^(UL|OL)$/.test(list.tagName)) {
          $$(':scope > li', list).forEach(function (li) { items.push({ el: li, text: '核查：' + self.clean(li), path: pathOf(li) }); });
          return;
        }
      }
      items.push({ el: el, text: label + text, path: pathOf(el) });
    });
    if (kind === 'key') {
      $$('#doc .folio.folio-key').forEach(function (f) { items.push({ el: f, text: '整节：' + (f.getAttribute('data-title') || ''), path: '核心考点整节' }); });
      $$('#doc tr.star').forEach(function (tr) { var t0 = self.clean(tr.cells[0]); items.push({ el: tr.cells[0], text: (t0.indexOf('⭐') === 0 ? '' : '⭐ ') + t0 + '：' + self.clean(tr.cells[1]), path: pathOf(tr) }); });
    } else {
      $$('#doc .table-wrap table').forEach(function (t) {
        var h = t.rows[0] && t.rows[0].cells[0];
        if (h && txt(h) === '易混点') {
          for (var i = 1; i < t.rows.length; i++) items.push({ el: t.rows[i].cells[0], text: self.clean(t.rows[i].cells[0]) + '：' + self.clean(t.rows[i].cells[1]), path: pathOf(t) });
        }
      });
    }
    items.sort(function (a, b) { return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
    return items;
  },
  render: function (kind) {
    if (this.built[kind]) return;
    var items = this.collect(kind), host = $('#panel-' + kind);
    var intro = kind === 'key'
      ? '原文标 🔴 的核心考点、⭐ 关键转折和整节考点卡，按出现顺序排列。点按跳到原文。'
      : '原文标 🟡 的易混易错、核查更正与“易错辨析”表，按出现顺序排列。点按跳到原文。';
    var html = '<p class="idx-empty" style="padding:2px 6px 8px">' + intro + '（共 ' + items.length + ' 条）</p>';
    var lastChap = '';
    items.forEach(function (it, i) {
      var ch = it.el.closest('.chapter');
      var chT = ch ? txt($('h2', ch)).replace(/^🔵\s*/, '') : '';
      if (chT !== lastChap) { html += '<div class="idx-group"><h4>' + esc(chT) + '</h4></div>'; lastChap = chT; }
      var t = it.text.length > 90 ? it.text.slice(0, 90) + '…' : it.text;
      html += '<button type="button" class="idx-item ' + (kind === 'key' ? 'k' : 'w') + '" data-i="' + i + '">' + esc(t) + '<small>' + esc(it.path) + '</small></button>';
    });
    host.innerHTML = html;
    host.addEventListener('click', function (e) {
      var b = e.target.closest('.idx-item'); if (!b) return;
      var el = items[+b.getAttribute('data-i')].el;
      goTo(el, { block: el.classList.contains('folio') ? 'start' : 'center' });
    });
    this.built[kind] = true;
  }
};

/* ===================================================================== recitation masks */
var Mask = {
  kw: false, num: false,
  toggle: function (kind) {
    this[kind] = !this[kind];
    document.body.classList.toggle('mask-' + kind, this[kind]);
    setPressed('mask' + kind, this[kind]);
    if (!this[kind]) $$(kind === 'kw' ? '#doc strong.peek' : '#doc .num.peek').forEach(function (e) { if (!e.classList.contains('cloze')) e.classList.remove('peek'); });
    toast(this[kind] ? (kind === 'kw' ? '已遮住加粗关键词：点按逐个显示' : '已遮住年份和数字：点按逐个显示') : '已取消遮挡');
  },
  maskedHl: function (m) {
    var b = document.body.classList;
    return !m.classList.contains('peek') && (b.contains('hlmask-all') || (b.contains('hlmask-' + HL.colorOf(m))));
  },
  handleClick: function (e) {
    var t = e.target;
    if (window.getSelection && String(window.getSelection()).length > 0) return false;
    var f = t.closest('.folio.is-masked');
    if (f) {
      var outer = null, el = t;
      while (el && el !== f) { if (el.classList && el.classList.contains('mb') && !el.classList.contains('peek')) outer = el; el = el.parentElement; }
      if (outer && !t.closest('.sn, .supp')) { outer.classList.add('peek'); e.preventDefault(); return true; }
    }
    var m = t.closest('mark.hl');
    if (m && this.maskedHl(m)) { $$('mark.hl[data-hid="' + m.getAttribute('data-hid') + '"]').forEach(function (x) { x.classList.add('peek'); }); e.preventDefault(); return true; }
    if (this.kw) { var s = t.closest('.folio-body strong:not(.peek), .doc-meta strong:not(.peek)'); if (s && !s.closest('.sn, h1, h2, h3, h4')) { s.classList.add('peek'); e.preventDefault(); return true; } }
    if (this.num) { var n = t.closest('.num:not(.peek)'); if (n) { n.classList.add('peek'); e.preventDefault(); return true; } }
    var c = t.closest('strong.cloze:not(.peek), td.cloze-cell:not(.peek)');
    if (c) { c.classList.add('peek'); e.preventDefault(); return true; }
    return false;
  },
  bindSections: function () {
    DOC.addEventListener('click', function (e) {
      var b = e.target.closest('.ff-mask'); if (!b) return;
      var f = document.getElementById(b.getAttribute('data-sec'));
      var on = !f.classList.contains('is-masked');
      f.classList.toggle('is-masked', on);
      if (!on) $$('.mb.peek', f).forEach(function (x) { x.classList.remove('peek'); });
      b.textContent = on ? '取消遮挡' : '遮住本节'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) { toast('本节已整节遮住：先背，再点按每段对照'); f.scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' }); }
    });
  }
};

/* ===================================================================== settings, backup, download */
var FS_LABELS = ['较小', '标准', '较大', '大', '特大'];
var Settings = {
  dl: null,
  open: function (opener) { this.sync(); openModal('m-settings', opener); },
  sync: function () {
    var fs = $('#st-font');
    if (!fs.firstChild) fs.innerHTML = FS_LABELS.map(function (l, i) { return '<button type="button" data-v="' + i + '">' + l + '</button>'; }).join('');
    $$('button', fs).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-v') === (+S.set.fs) ? 'true' : 'false'); });
    $$('#st-theme button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === (S.set.theme || 'auto') ? 'true' : 'false'); });
    var v = $('#st-view');
    v.innerHTML = '<button type="button" class="chip-btn" data-act="pure" aria-pressed="' + (S.set.pure ? 'true' : 'false') + '">纯原文模式</button>' +
      '<button type="button" class="chip-btn" data-act="snc" aria-pressed="' + (S.set.snc ? 'true' : 'false') + '">收起补充解释</button>' +
      '<button type="button" class="chip-btn" data-act="focus">专注模式</button>' +
      '<button type="button" class="chip-btn" data-act="fold">全部折叠</button>' +
      '<button type="button" class="chip-btn" data-act="unfold">全部展开</button>' +
      '<button type="button" class="chip-btn" data-act="answers">展开全部答案</button>';
    ['blue', 'yellow', 'red'].forEach(function (c) { var i = $('#cn-' + c); if (document.activeElement !== i) i.value = S.set.names[c] || DEFAULT_NAMES[c]; });
    var where = [];
    where.push(STORAGE_OK ? '<span class="ok">本机浏览器 ✓</span>' : '本机浏览器（当前不可用，关闭页面后记录会丢失，请用备份码）');
    if (Cloud.status === 'on') where.push('<span class="ok">Claude 云端（随账号保存）✓</span>');
    else if (Cloud.status === 'connecting') where.push('Claude 云端连接中…');
    else if (Cloud.status === 'readonly') where.push('Claude 云端：当前账号只读');
    else if (Cloud.status === 'toolarge') where.push('Claude 云端空间已满（标记太多），请定期用备份码保存');
    var hlN = Object.keys(S.hl).filter(function (k) { return !S.hl[k].del; }).length;
    $('#st-status').innerHTML = '保存位置：' + where.join('；') + '。当前有 ' + hlN + ' 条荧光标记。';
    $('#bk-download').hidden = !(this.dl || !FRAMED);
    $('#bk-print').hidden = FRAMED || typeof window.print !== 'function';
  },
  bind: function () {
    var self = this;
    $('#st-font').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; S.set.fs = +b.getAttribute('data-v'); S.set.u = now(); save(); FontSize.apply(); self.sync(); });
    $('#st-theme').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; S.set.theme = b.getAttribute('data-v'); S.set.u = now(); save(); Theme.apply(); self.sync(); });
    $('#st-view').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'pure') Modes.setPure(!S.set.pure);
      if (a === 'snc') Modes.setSnc(!S.set.snc);
      if (a === 'focus') { closeModal('m-settings'); Modes.setFocus(true); }
      if (a === 'fold') Fold.all(true);
      if (a === 'unfold') Fold.all(false);
      if (a === 'answers') { $$('#doc .answer').forEach(function (x) { Answers.set(x, true); }); $$('#doc .cloze, #doc .cloze-cell').forEach(function (x) { x.classList.add('peek'); }); toast('已展开全部答案'); }
      self.sync();
    });
    var saveNames = debounce(function () {
      ['blue', 'yellow', 'red'].forEach(function (c) { var v = $('#cn-' + c).value.trim(); S.set.names[c] = v || DEFAULT_NAMES[c]; });
      S.set.u = now(); save(); HL.refreshNames();
    }, 300);
    ['blue', 'yellow', 'red'].forEach(function (c) { $('#cn-' + c).addEventListener('input', saveNames); });
    $('#bk-make').addEventListener('click', function () { Backup.copy(); });
    $('#bk-restore').addEventListener('click', function () { Backup.restore($('#bk-in').value); });
    $('#bk-download').addEventListener('click', function () { Backup.download(); });
    $('#bk-print').addEventListener('click', function () { closeModal('m-settings'); setTimeout(function () { try { window.print(); } catch (e) { toast('当前环境不支持打印，请用浏览器菜单打印'); } }, 200); });
    $('#st-clear-hl').addEventListener('click', function () { HL.clearAll(); });
    $('#st-reset').addEventListener('click', function () {
      confirmBox('确定要重置全部学习记录吗？荧光标记、批注、掌握进度、复习日期、闪卡熟练度和设置都会清除。建议先生成备份码。', '全部重置').then(function (ok) {
        if (!ok) return;
        var old = S, t = now(); S = blankState();
        for (var id in old.hl) S.hl[id] = { id: id, del: 1, u: t };
        for (var m in old.mastered) S.mastered[m] = { v: 0, u: t };
        for (var f in old.fc) S.fc[f] = { w: 0, n: 0, u: t };
        for (var r in old.rev) S.rev[r] = { d: [], u: t, clr: 1 };
        S.set.u = t;
        save(); Render.all(); toast('已重置全部学习记录'); Settings.sync();
      });
    });
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then(function (d) { self.dl = d || null; self.sync(); }).catch(function () {});
    }
  }
};
var B64P = 'FRD5-';
var Backup = {
  code: function () {
    var json = JSON.stringify({ app: APP, at: dayStr(), state: S });
    var b64 = btoa(unescape(encodeURIComponent(json)));
    return B64P + b64;
  },
  copy: function () {
    var c = this.code(), ta = $('#bk-out');
    ta.hidden = false; ta.value = c;
    var done = function () { toast('备份码已复制（' + Math.round(c.length / 1024) + ' KB），请粘贴到备忘录或笔记软件保存'); };
    var fallback = function () { ta.focus(); ta.select(); try { ta.setSelectionRange(0, c.length); } catch (e) {} toast('没能自动复制：备份码已全部选中，请按“拷贝”'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(done, fallback);
      else fallback();
    } catch (e) { fallback(); }
  },
  restore: function (raw) {
    raw = (raw || '').trim().replace(/\s+/g, '');
    if (!raw) { toast('请先把备份码粘贴到输入框'); return; }
    var data = null;
    try {
      if (raw.indexOf(B64P) === 0) raw = raw.slice(B64P.length);
      if (raw.charAt(0) === '{') data = JSON.parse(raw);
      else data = JSON.parse(decodeURIComponent(escape(atob(raw))));
    } catch (e) { toast('备份码无法识别：请确认复制完整（以 ' + B64P + ' 开头）'); return; }
    var st = data && data.state ? data.state : data;
    var go = function () {
      var before = JSON.stringify(S);
      mergeState(st, { revive: true }); save(); Render.all();
      var n = mergeState.revived || 0;
      toast(JSON.stringify(S) === before ? '备份中的记录与当前一致，无需更新' : ('已恢复并合并备份中的记录' + (n ? '（恢复 ' + n + ' 条荧光标记）' : '')));
      $('#bk-in').value = ''; Settings.sync();
    };
    if (data && data.app && data.app !== APP) {
      confirmBox('这个备份码来自另一个学习网页（' + data.app + '），仍要合并到本页吗？', '仍要合并').then(function (ok) { if (ok) go(); });
    } else go();
  },
  html: function () {
    var st = JSON.stringify(S).replace(/</g, '\\u003c');
    var close = '<' + '/script>';
    var root = PRISTINE.replace(new RegExp('(<script type="application/json" id="fr-embedded-state">)[\\s\\S]*?(' + close + ')'), function (m0, a, b) { return a + st + b; });
    var title = '<title>' + esc(document.title || META.title) + '</title>';
    var style = (document.getElementById('fr-style') || { outerHTML: '' }).outerHTML;
    var earlyEl = document.getElementById('fr-early');
    var early = '<script id="fr-early">' + (earlyEl ? earlyEl.textContent : "document.documentElement.classList.add('js');") + close;
    return '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
      title + '\n' + early + '\n' + style + '\n</head>\n<body>\n' + root + '\n</body>\n</html>\n';
  },
  download: function () {
    var name = (META.title || '学习笔记') + '（含我的标记 ' + dayStr() + '）.html';
    var data = this.html();
    if (Settings.dl) {
      Settings.dl.save({ filename: name, data: data }).then(function () { toast('已交给下载：' + name); }).catch(function (e) {
        if (e && e.code === 'declined') return;
        toast('这里无法下载文件，请改用“生成并复制备份码”');
      });
      return;
    }
    if (FRAMED) { toast('这里无法下载文件，请改用“生成并复制备份码”'); return; }
    try {
      var blob = new Blob([data], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
      toast('已开始下载：' + name);
    } catch (e) { toast('这里无法下载文件，请改用“生成并复制备份码”'); }
  }
};
