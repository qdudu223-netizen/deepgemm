/* ===================================================================== UI shell */
var TOOLS = [
  { id: 'toc', icon: 'list', label: '目录', short: '目录', bottomOnly: true },
  { id: 'maskkw', icon: 'redact', label: '遮关键词', short: '遮词', toggle: true },
  { id: 'masknum', icon: 'hash', label: '遮年份数字', short: '遮数' , toggle: true },
  { id: 'pen', icon: 'pen', label: '荧光笔', short: '荧光' },
  { id: 'flash', icon: 'cards', label: '闪卡', short: '闪卡' },
  { id: 'focus', icon: 'focus', label: '专注模式', short: '专注', toggle: true },
  { id: 'pure', icon: 'doc', label: '纯原文', short: '原文', toggle: true },
  { id: 'settings', icon: 'gear', label: '设置', short: '设置' }
];
function buildTools() {
  var top = $('#tools-top'), bot = $('#bottombar');
  TOOLS.forEach(function (t) {
    [top, bot].forEach(function (host, i) {
      if (t.bottomOnly && i === 0) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tbtn'; b.setAttribute('data-tool', t.id);
      b.title = t.label; b.setAttribute('aria-label', t.label);
      if (t.toggle) b.setAttribute('aria-pressed', 'false');
      b.innerHTML = icon(t.icon) + '<span class="tl">' + (i === 0 ? t.label : t.short) + '</span>' + (i === 0 ? '<span class="tl-s">' + t.short + '</span>' : '') + '<span class="dot"></span>';
      host.appendChild(b);
    });
  });
  ROOT.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tool]'); if (!b) return;
    var id = b.getAttribute('data-tool');
    if (id === 'toc') return Side.toggle();
    if (id === 'maskkw') return Mask.toggle('kw');
    if (id === 'masknum') return Mask.toggle('num');
    if (id === 'pen') return HL.openPenMenu(b);
    if (id === 'flash') return FC.open();
    if (id === 'focus') return Modes.setFocus(!document.body.classList.contains('focus'));
    if (id === 'pure') return Modes.setPure(!S.set.pure);
    if (id === 'settings') return Settings.open(b);
  });
}
function setPressed(tool, on) { $$('[data-tool="' + tool + '"]').forEach(function (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }

/* ------------------------------------------------------------ sidebar */
var Side = {
  el: null,
  init: function () {
    this.el = $('#sidebar');
    var self = this;
    $('#btn-menu').addEventListener('click', function () { self.toggle(); });
    $('#side-close').addEventListener('click', function () { self.close(); });
    $('#scrim').addEventListener('click', function () { self.close(); });
    $$('.side-tab').forEach(function (b) { b.addEventListener('click', function () { self.tab(b.getAttribute('data-tab')); }); });
    window.addEventListener('resize', debounce(function () { self.syncInert(); }, 150));
    this.syncInert();
  },
  isDrawer: function () { return window.innerWidth < 1100; },
  /* a closed drawer is off-screen: keep it out of the Tab order */
  syncInert: function () {
    var off = this.isDrawer() && !this.el.classList.contains('open');
    if (off || modalStack.length) this.el.setAttribute('inert', ''); else this.el.removeAttribute('inert');
  },
  toggle: function () { if (this.el.classList.contains('open')) this.close(); else this.open(); },
  open: function (tab) {
    if (tab) this.tab(tab);
    if (!this.isDrawer()) return;
    this.el.classList.add('open'); $('#scrim').classList.add('open');
    this.syncInert();
    var t = $('.side-tab[aria-selected="true"]', this.el); if (t) setTimeout(function () { try { t.focus({ preventScroll: true }); } catch (e) {} }, 60);
  },
  close: function () {
    var was = this.el.classList.contains('open');
    this.el.classList.remove('open'); $('#scrim').classList.remove('open');
    this.syncInert();
    if (was && this.isDrawer()) { var m = $('#btn-menu'); if (m && m.offsetParent) m.focus({ preventScroll: true }); }
  },
  tab: function (name) {
    $$('.side-tab').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false'); });
    $$('.side-panel').forEach(function (p) { p.hidden = p.id !== 'panel-' + name; });
    if (name === 'hl') HL.renderList();
    if (name === 'key' || name === 'warn') Index.render(name);
  },
  afterNav: function () { if (this.isDrawer()) this.close(); }
};

/* ------------------------------------------------------------ navigation */
function openAncestors(el) {
  var f = el.closest('.folio'); if (f && f.classList.contains('is-folded')) Fold.set(f, false);
  var a = el.closest('.answer'); if (a && !a.classList.contains('open')) Answers.set(a, true);
  var m = el.closest('.mm-src-wrap'); if (m) m.classList.add('open');
}
/* smooth only for short hops; long jumps are instant so they always land */
function scrollMode(dy) { return (REDUCED || Math.abs(dy) > window.innerHeight * 2.5) ? 'auto' : 'smooth'; }
function goTo(el, opts) {
  if (!el) return;
  openAncestors(el);
  Side.afterNav();
  el.scrollIntoView({ block: (opts && opts.block) || 'start', behavior: scrollMode(el.getBoundingClientRect().top) });
  if (!(opts && opts.noFlash)) {
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    setTimeout(function () { el.classList.remove('flash'); }, 1700);
  }
}
DOC.addEventListener('click', function (e) {
  if (Mask.handleClick(e)) return;
  var a = e.target.closest('a[href^="#"]');
  if (a) {
    var id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (a.classList.contains('ref')) { e.preventDefault(); RefPop.show(a, id); return; }
    var t = document.getElementById(id);
    if (t) { e.preventDefault(); goTo(t); }
    return;
  }
  if (e.target.closest('a[href]')) return;
  HL.handleClick(e);
});
$('#doc').addEventListener('keydown', function (e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.sn-head')) { e.preventDefault(); e.target.click(); }
});

/* reference popover */
var RefPop = {
  cur: null,
  show: function (a, id) {
    var src = document.getElementById(id), pop = $('#ref-pop');
    if (!src) return;
    var clone = src.cloneNode(true);
    $$('mark.sh', clone).forEach(function (m) { m.replaceWith(document.createTextNode(m.textContent)); });
    $('#ref-body').innerHTML = clone.innerHTML;
    pop.hidden = false; this.cur = src;
    var r = a.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    var x = clamp(r.left, 12, window.innerWidth - w - 12), y = r.bottom + 8;
    if (y + h > window.innerHeight - 12) y = Math.max(12, r.top - h - 8);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  },
  hide: function () { $('#ref-pop').hidden = true; }
};
$('#ref-close').addEventListener('click', function () { RefPop.hide(); });
$('#ref-go').addEventListener('click', function () { var t = RefPop.cur; RefPop.hide(); if (t) goTo(t, { block: 'center' }); });

/* ------------------------------------------------------------ TOC + scrollspy */
var TOC = {
  folios: [], subs: [], links: {},
  build: function () {
    var host = $('#panel-toc');
    var html = '<div class="side-head"><div class="prog-row"><span>已掌握 <b id="prog-n">0</b> / <span id="prog-t"></span> 节</span><span id="prog-due"></span></div>' +
      '<div class="prog-bar"><i id="prog-bar"></i></div><div class="side-actions">' +
      '<button type="button" class="chip-btn" id="sa-fold">' + icon('fold') + '全部折叠</button>' +
      '<button type="button" class="chip-btn" id="sa-unfold">' + icon('unfold') + '全部展开</button>' +
      '<button type="button" class="chip-btn" id="sa-snc" aria-pressed="false">' + icon('note') + '收起补充解释</button>' +
      '<button type="button" class="chip-btn" id="sa-resume" hidden>' + icon('pin') + '回到上次位置</button></div></div>';
    var chapters = $$('#doc > .chapter, #doc > section.overview');
    chapters.forEach(function (ch) {
      if (ch.classList.contains('overview')) {
        html += '<div class="toc-chap toc-supp"><a href="#overview"><span class="tn">◇</span><span>学习概览（补充）</span></a></div>';
        return;
      }
      var h2 = $('h2', ch), num = ($('h2 .hnum', ch) || $('.chap-numeral', ch) || {}).textContent || '';
      var title = h2 ? txt(h2).replace(/^🔵\s*/, '').replace(/^§\d+\s*/, '') : '';
      html += '<div class="toc-chap"><a href="#' + ch.id + '"><span class="tn">' + esc(num) + '</span><span>' + esc(title) + '</span></a><ul class="toc-list">';
      $$('.folio', ch).forEach(function (f) {
        var h3 = $('h3', f);
        html += '<li class="toc-item" data-sec="' + f.id + '"><a href="#' + f.id + '"><span class="tick" aria-hidden="true"></span><span class="tt">' + esc(txt(h3)) + '</span><span class="toc-due" hidden>该复习了</span></a>';
        var h4s = $$('h4.sub-h', f);
        if (h4s.length) {
          html += '<ul class="toc-sub">' + h4s.map(function (h) { return '<li><a href="#' + h.id + '" data-sub="' + h.id + '">' + esc(txt(h)) + '</a></li>'; }).join('') + '</ul>';
        }
        html += '</li>';
      });
      html += '</ul></div>';
    });
    host.innerHTML = html;
    host.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]'); if (!a) return;
      e.preventDefault();
      goTo(document.getElementById(a.getAttribute('href').slice(1)), { noFlash: true });
    });
    $('#sa-fold').addEventListener('click', function () { Fold.all(true); });
    $('#sa-unfold').addEventListener('click', function () { Fold.all(false); });
    $('#sa-snc').addEventListener('click', function () { Modes.setSnc(!S.set.snc); });
    $('#sa-resume').addEventListener('click', function () { Resume.go(); });
    this.folios = $$('#doc .folio');
    this.subs = $$('#doc h4.sub-h');
    $('#prog-t').textContent = this.folios.length;
    var self = this;
    $$('.toc-item', host).forEach(function (li) { self.links[li.getAttribute('data-sec')] = li; });
    this.spy();
  },
  current: null,
  spy: function () {
    var self = this;
    var update = throttle(function () {
      var y = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-h')) || 58) + 30;
      var cur = null;
      for (var i = 0; i < self.folios.length; i++) {
        var r = self.folios[i].getBoundingClientRect();
        if (r.top <= y + 40) cur = self.folios[i]; else break;
      }
      if (!cur && self.folios.length) cur = null;
      var id = cur ? cur.id : null;
      if (id !== self.current) {
        if (self.current && self.links[self.current]) self.links[self.current].classList.remove('is-current');
        self.current = id;
        if (id && self.links[id]) {
          var li = self.links[id]; li.classList.add('is-current');
          var panel = $('#panel-toc');
          if (!panel.hidden) {
            var lr = li.getBoundingClientRect(), pr = panel.getBoundingClientRect();
            if (lr.top < pr.top + 40 || lr.bottom > pr.bottom - 40) panel.scrollTop += (lr.top - pr.top) - pr.height / 3;
          }
        }
      }
      if (cur) {
        var sub = null;
        $$('h4.sub-h', cur).forEach(function (h) { if (h.getBoundingClientRect().top <= y + 40) sub = h; });
        $$('.toc-sub a.is-current').forEach(function (a) { a.classList.remove('is-current'); });
        if (sub) { var a = $('.toc-sub a[data-sub="' + sub.id + '"]'); if (a) a.classList.add('is-current'); }
      }
      var h = document.documentElement.scrollHeight - window.innerHeight;
      $('#topline').style.width = (h > 0 ? clamp(window.scrollY / h * 100, 0, 100) : 0) + '%';
      Resume.track();
    }, 120);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }
};

/* ------------------------------------------------------------ progress, mastery, spaced review */
var INTERVALS = [1, 2, 4, 7, 15];
var Progress = {
  nextDue: function (sid) {
    var r = S.rev[sid]; if (!r || !r.d || !r.d.length) return null;
    var n = r.d.length, last = r.d[r.d.length - 1];
    return addDays(last, INTERVALS[Math.min(n, INTERVALS.length) - 1]);
  },
  isDue: function (sid) { var d = this.nextDue(sid); return !!d && d <= dayStr(); },
  render: function () {
    var total = TOC.folios.length, m = 0, due = 0;
    TOC.folios.forEach(function (f) {
      var sid = f.id, mastered = !!(S.mastered[sid] && S.mastered[sid].v);
      if (mastered) m++;
      f.classList.toggle('is-mastered', mastered);
      var cb = $('.ff-check[data-sec="' + sid + '"]'); if (cb) cb.checked = mastered;
      var li = TOC.links[sid];
      if (li) li.classList.toggle('is-mastered', mastered);
      var isDue = Progress.isDue(sid);
      if (isDue) due++;
      if (li) { var b = $('.toc-due', li); if (b) b.hidden = !isDue; }
      var info = $('.ff-due[data-sec="' + sid + '"]'), r = S.rev[sid];
      if (info) {
        if (r && r.d && r.d.length) {
          var nd = Progress.nextDue(sid);
          info.textContent = '已复习 ' + r.d.length + ' 次 · ' + (isDue ? '该复习了' : '下次 ' + shortDay(nd));
          info.classList.toggle('is-due', isDue);
        } else { info.textContent = ''; info.classList.remove('is-due'); }
      }
      var rb = $('.ff-review[data-sec="' + sid + '"]');
      if (rb) rb.textContent = (r && r.d && r.d[r.d.length - 1] === dayStr()) ? '今天已复习 ✓' : '复习完';
    });
    $('#prog-n').textContent = m;
    $('#prog-bar').style.width = (total ? m / total * 100 : 0) + '%';
    $('#prog-due').textContent = due ? ('待复习 ' + due + ' 节') : '';
  },
  bind: function () {
    DOC.addEventListener('change', function (e) {
      var cb = e.target.closest('.ff-check'); if (!cb) return;
      S.mastered[cb.getAttribute('data-sec')] = { v: cb.checked ? 1 : 0, u: now() };
      save(); Progress.render();
      if (cb.checked) toast('已盖章：本节已掌握');
    });
    DOC.addEventListener('click', function (e) {
      var b = e.target.closest('.ff-review'); if (!b) return;
      var sid = b.getAttribute('data-sec'), r = S.rev[sid] || { d: [] }, today = dayStr();
      if (r.d[r.d.length - 1] === today) { toast('今天已经记录过了；下次复习：' + shortDay(Progress.nextDue(sid))); return; }
      r.d = (r.d || []).concat([today]); r.u = now(); S.rev[sid] = r;
      save(); Progress.render();
      toast('第 ' + r.d.length + ' 次复习已记录，下次：' + shortDay(Progress.nextDue(sid)));
    });
  }
};

/* ------------------------------------------------------------ folding */
var Fold = {
  set: function (f, on) {
    f.classList.toggle('is-folded', on);
    var b = $('.fold-btn', f); if (b) { b.setAttribute('aria-expanded', on ? 'false' : 'true'); b.setAttribute('aria-label', on ? '展开本节' : '折叠本节'); }
    var set = {}; (S.set.folded || []).forEach(function (x) { set[x] = 1; });
    if (on) set[f.id] = 1; else delete set[f.id];
    S.set.folded = Object.keys(set); save({ localOnly: true });
    Margin.soon();
  },
  all: function (on) { TOC.folios.forEach(function (f) { Fold.set(f, on); }); toast(on ? '已全部折叠，点标题右侧箭头可单独展开' : '已全部展开'); },
  restore: function () { (S.set.folded || []).forEach(function (id) { var f = document.getElementById(id); if (f) { f.classList.add('is-folded'); var b = $('.fold-btn', f); if (b) b.setAttribute('aria-expanded', 'false'); } }); },
  bind: function () {
    DOC.addEventListener('click', function (e) {
      var b = e.target.closest('.fold-btn'); if (!b) return;
      var f = b.closest('.folio'); Fold.set(f, !f.classList.contains('is-folded'));
    });
  }
};
var Answers = {
  set: function (a, open) {
    a.classList.toggle('open', open);
    var b = $('.ans-toggle', a); if (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.textContent = open ? '收起' : b.getAttribute('data-label'); }
    Margin.soon();
  },
  bind: function () {
    DOC.addEventListener('click', function (e) {
      var ca = e.target.closest('.cloze-all');
      if (ca) {
        var on = ca.getAttribute('aria-expanded') !== 'true', tw = ca.closest('.answer-bar').nextElementSibling;
        while (tw && !tw.querySelector('.cloze-cell')) tw = tw.nextElementSibling;
        if (tw) $$('.cloze-cell', tw).forEach(function (c) { c.classList.toggle('peek', on); });
        ca.setAttribute('aria-expanded', on ? 'true' : 'false'); ca.textContent = on ? '收起判断' : ca.getAttribute('data-label');
        return;
      }
      var b = e.target.closest('.ans-toggle');
      if (b) { var a = b.closest('.answer'); Answers.set(a, !a.classList.contains('open')); return; }
      var m = e.target.closest('.mm-src-toggle');
      if (m) { var w = m.closest('.mm-src-wrap'), o = !w.classList.contains('open'); w.classList.toggle('open', o); m.setAttribute('aria-expanded', o ? 'true' : 'false'); m.textContent = o ? '收起 Mermaid 源码' : '查看 Mermaid 源码（原文）'; }
    });
  }
};

/* ------------------------------------------------------------ modes */
var Modes = {
  setPure: function (on) {
    S.set.pure = on ? 1 : 0; S.set.u = now(); save();
    document.body.classList.toggle('pure', !!on); setPressed('pure', on);
    Margin.soon(); Search.invalidate();
    toast(on ? '纯原文模式：已隐藏全部补充内容（图解、总纲、补充解释、口诀、概览）' : '已显示补充内容');
    Settings.sync();
  },
  setSnc: function (on) {
    S.set.snc = on ? 1 : 0; S.set.u = now(); save();
    document.body.classList.toggle('sn-collapsed', !!on);
    var b = $('#sa-snc'); if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.lastChild.textContent = on ? '展开补充解释' : '收起补充解释'; }
    $$('.sn.open').forEach(function (s) { s.classList.remove('open'); });
    Margin.soon(); Settings.sync();
  },
  setFocus: function (on) {
    document.body.classList.toggle('focus', !!on); setPressed('focus', on);
    $('#focus-exit').hidden = !on;
    Side.close(); Search.hidePanel();
    Margin.soon();
  },
  applyAll: function () {
    document.body.classList.toggle('pure', !!S.set.pure); setPressed('pure', !!S.set.pure);
    document.body.classList.toggle('sn-collapsed', !!S.set.snc);
    var b = $('#sa-snc'); if (b) { b.setAttribute('aria-pressed', S.set.snc ? 'true' : 'false'); b.lastChild.textContent = S.set.snc ? '展开补充解释' : '收起补充解释'; }
    Theme.apply(); FontSize.apply();
  }
};
$('#focus-exit').addEventListener('click', function () { Modes.setFocus(false); });
DOC.addEventListener('click', function (e) {
  var h = e.target.closest('.sn-head');
  if (h && document.body.classList.contains('sn-collapsed')) { h.closest('.sn').classList.toggle('open'); Margin.soon(); }
});

var Theme = {
  apply: function () {
    var t = S.set.theme || 'auto', r = document.documentElement;
    if (t === 'auto') { if (Theme._own) { r.removeAttribute('data-theme'); Theme._own = false; } }
    else { r.setAttribute('data-theme', t); Theme._own = true; }
  }, _own: false
};
var FS_STEPS = [0.9, 1, 1.1, 1.2, 1.35];
var FontSize = {
  apply: function () { var i = clamp(+S.set.fs || 1, 0, FS_STEPS.length - 1); ROOT.style.setProperty('--fs-scale', FS_STEPS[i]); Margin.soon(); }
};

/* ------------------------------------------------------------ sidenotes in the margin (wide screens) */
var Margin = {
  layout: function () {
    var focus = document.body.classList.contains('focus');
    var wide = focus ? window.innerWidth >= 1120 : window.innerWidth >= 1400;
    var notes = $$('#doc .sn').filter(function (n) { return !n.closest('td, th, .table-wrap, blockquote, .answer-body, .dg, .fig, .gist'); });
    document.body.classList.toggle('sn-margin', wide);
    notes.forEach(function (n) { n.classList.remove('in-margin'); n.style.top = n.style.left = ''; });
    if (!wide) return;
    var vis = notes.filter(function (n) { return n.offsetParent !== null; });
    vis.forEach(function (n) { n.classList.add('in-margin'); });
    var docR = DOC.getBoundingClientRect();
    var lastBottom = -1e9;
    vis.forEach(function (n) {
      var hostTop = n.parentElement.getBoundingClientRect().top - docR.top;
      var top = Math.max(hostTop, lastBottom + 10);
      var cb = n.offsetParent.getBoundingClientRect();
      n.style.top = (docR.top + top - cb.top) + 'px';
      n.style.left = (docR.right + 30 - cb.left) + 'px';
      lastBottom = top + n.offsetHeight;
    });
  },
  soon: debounce(function () { Margin.layout(); }, 120)
};
window.addEventListener('resize', function () { Margin.soon(); });

/* ------------------------------------------------------------ reading position */
var Resume = {
  saved: null,
  track: debounce(function () {
    var y = window.scrollY; if (y < 200) return;
    var f = TOC.current ? document.getElementById(TOC.current) : null;
    S.pos = { u: now(), sid: f ? f.id : '', off: f ? Math.round(y - (f.getBoundingClientRect().top + y)) : 0, y: Math.round(y) };
    save({ localOnly: true });
  }, 900),
  offer: function () {
    var p = S.pos; if (!p || !p.sid || (p.y || 0) < 400) return;
    var f = document.getElementById(p.sid); if (!f) return;
    this.saved = p;
    var title = f.getAttribute('data-title') || '';
    $('#resume-text').textContent = '上次读到：' + title;
    $('#resume').hidden = false;
    var b = $('#sa-resume'); if (b) b.hidden = false;
    setTimeout(function () { $('#resume').hidden = true; }, 15000);
  },
  go: function () {
    var p = this.saved || S.pos; if (!p || !p.sid) { toast('还没有记录阅读位置：往下读一会儿，下次打开就能回到这里'); return; }
    var f = document.getElementById(p.sid); if (!f) return;
    openAncestors(f); Side.afterNav();
    var y = f.getBoundingClientRect().top + window.scrollY + (p.off || 0);
    window.scrollTo({ top: Math.max(0, y), behavior: scrollMode(y - window.scrollY) });
    $('#resume').hidden = true;
  }
};
$('#resume-go').addEventListener('click', function () { Resume.go(); });
$('#resume-x').addEventListener('click', function () { $('#resume').hidden = true; });
