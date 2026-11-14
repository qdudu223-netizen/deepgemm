/* ===================================================================== flashcards */
var FC = {
  sel: null, reverse: false, shuffle: false, weakOnly: false,
  queue: [], pos: 0, flipped: false, stats: { good: 0, bad: 0 },
  all: function () { return CARDS.concat(HL.cards()); },
  deckList: function () {
    var order = [], counts = {}, weak = {};
    this.all().forEach(function (c) {
      if (!(c.deck in counts)) { order.push(c.deck); counts[c.deck] = 0; weak[c.deck] = 0; }
      counts[c.deck]++;
      if (S.fc[c.id] && S.fc[c.id].w) weak[c.deck]++;
    });
    return order.map(function (d) { return { name: d, n: counts[d], weak: weak[d] }; });
  },
  open: function () {
    if (!this.sel) {
      var saved = S.set.fcDecks;
      this.sel = {};
      if (Array.isArray(saved) && saved.length) saved.forEach(function (d) { FC.sel[d] = 1; });
      else this.sel['考点卡'] = 1;
    }
    this.renderDecks();
    this.build();
    openModal('m-flash');
  },
  onClose: function () { S.set.fcDecks = Object.keys(this.sel || {}); save({ localOnly: true }); },
  renderDecks: function () {
    var self = this;
    var html = this.deckList().map(function (d) {
      return '<button type="button" class="deck-chip" data-deck="' + esc(d.name) + '" aria-pressed="' + (self.sel[d.name] ? 'true' : 'false') + '">' + esc(d.name) + '<small>' + d.n + (d.weak ? ' · 不熟 ' + d.weak : '') + '</small></button>';
    }).join('');
    $('#fc-decks').innerHTML = '<button type="button" class="deck-chip" data-deck="*">全选 / 全不选</button>' + html;
    $('#fc-reverse').setAttribute('aria-pressed', this.reverse ? 'true' : 'false');
    $('#fc-shuffle').setAttribute('aria-pressed', this.shuffle ? 'true' : 'false');
    $('#fc-weak').setAttribute('aria-pressed', this.weakOnly ? 'true' : 'false');
  },
  build: function () {
    var self = this;
    var cards = this.all().filter(function (c) { return self.sel[c.deck]; });
    if (this.weakOnly) cards = cards.filter(function (c) { return S.fc[c.id] && S.fc[c.id].w; });
    if (this.shuffle) for (var i = cards.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = cards[i]; cards[i] = cards[j]; cards[j] = t; }
    /* cards marked 不熟 come round more often: each gets a second showing later in the round */
    if (!this.weakOnly) {
      var extra = cards.filter(function (c) { return S.fc[c.id] && S.fc[c.id].w; });
      extra.forEach(function (c) {
        var at = cards.indexOf(c);
        var to = Math.min(cards.length, at + 5 + Math.floor(Math.random() * 6));
        cards.splice(to, 0, c);
      });
    }
    this.queue = cards; this.pos = 0; this.flipped = false; this.stats = { good: 0, bad: 0 };
    this.render();
  },
  render: function () {
    var stage = $('#fc-stage');
    var total = this.queue.length;
    $('#fc-prog').style.width = (total ? Math.min(this.pos, total) / total * 100 : 0) + '%';
    var anyDeck = Object.keys(this.sel).length;
    ['#fc-prev', '#fc-src', '#fc-bad', '#fc-good'].forEach(function (s) { $(s).disabled = !total || FC.pos >= total; });
    $('#fc-prev').disabled = this.pos === 0;
    if (!total) {
      stage.innerHTML = '<div class="fc-empty">' + (!anyDeck ? '先在上面选一个或几个卡组。' : this.weakOnly ? '所选卡组里还没有标记“不熟”的卡。关闭“只练不熟”即可练全部。' : '所选卡组暂时没有卡片。') + '</div>';
      $('#fc-stat').textContent = '';
      return;
    }
    if (this.pos >= total) {
      stage.innerHTML = '<div class="fc-empty"><p style="font-family:var(--f-serif);font-size:1.2em;color:var(--ink)">本轮完成</p><p>记住了 ' + this.stats.good + ' 张，不熟 ' + this.stats.bad + ' 张。</p>' +
        '<p><button type="button" class="btn primary" id="fc-again">再来一轮</button> <button type="button" class="btn" id="fc-again-weak">只练不熟</button></p></div>';
      $('#fc-stat').textContent = '';
      return;
    }
    var c = this.queue[this.pos], st = S.fc[c.id] || {};
    var front = this.reverse ? c.b : c.f, back = this.reverse ? c.f : c.b;
    stage.innerHTML = '<div class="fc-card" tabindex="0" role="button" aria-label="点按翻面">' +
      '<div class="fc-face front"><div class="fc-deck"><span></span><span class="fc-weak-tag"></span></div><div class="fc-text"></div><div class="fc-deck"><span>点按翻面</span><span></span></div></div>' +
      '<div class="fc-face back"><div class="fc-deck"><span></span><span></span></div><div class="fc-text"></div></div></div>';
    var faces = $$('.fc-face', stage);
    faces[0].querySelector('.fc-deck span').textContent = c.deck + (this.reverse ? ' · 反向' : '');
    faces[0].querySelector('.fc-weak-tag').textContent = st.w ? '不熟' : '';
    faces[0].querySelector('.fc-text').textContent = front;
    faces[1].querySelector('.fc-deck span').textContent = c.deck + ' · 答案';
    faces[1].querySelector('.fc-text').textContent = back;
    this.flipped = false;
    $('#fc-stat').textContent = (this.pos + 1) + ' / ' + total;
    if (!$('#m-flash').hidden) { var cardEl = $('.fc-card', stage); if (cardEl) try { cardEl.focus({ preventScroll: true }); } catch (e) {} }
  },
  flip: function () { var card = $('#fc-stage .fc-card'); if (!card) return; this.flipped = !this.flipped; card.classList.toggle('flipped', this.flipped); },
  mark: function (good) {
    var c = this.queue[this.pos]; if (!c) return;
    var st = S.fc[c.id] || { n: 0 };
    S.fc[c.id] = { w: good ? 0 : 1, n: (st.n || 0) + 1, u: now() };
    save();
    if (good) this.stats.good++; else {
      this.stats.bad++;
      var rest = this.queue.slice(this.pos + 1, this.pos + 6);
      if (rest.indexOf(c) < 0) this.queue.splice(Math.min(this.queue.length, this.pos + 4), 0, c);
    }
    this.pos++; this.render();
  },
  bind: function () {
    var self = this;
    $('#fc-decks').addEventListener('click', function (e) {
      var b = e.target.closest('.deck-chip'); if (!b) return;
      var d = b.getAttribute('data-deck');
      if (d === '*') { var all = self.deckList(), on = Object.keys(self.sel).length < all.length; self.sel = {}; if (on) all.forEach(function (x) { self.sel[x.name] = 1; }); }
      else if (self.sel[d]) delete self.sel[d]; else self.sel[d] = 1;
      self.renderDecks(); self.build();
    });
    $('#fc-reverse').addEventListener('click', function () { self.reverse = !self.reverse; self.renderDecks(); self.render(); });
    $('#fc-shuffle').addEventListener('click', function () { self.shuffle = !self.shuffle; self.renderDecks(); self.build(); });
    $('#fc-weak').addEventListener('click', function () { self.weakOnly = !self.weakOnly; self.renderDecks(); self.build(); });
    $('#fc-stage').addEventListener('click', function (e) {
      if (e.target.id === 'fc-again') { self.build(); return; }
      if (e.target.id === 'fc-again-weak') { self.weakOnly = true; self.renderDecks(); self.build(); return; }
      if (e.target.closest('.fc-card')) self.flip();
    });
    $('#fc-good').addEventListener('click', function () { self.mark(true); });
    $('#fc-bad').addEventListener('click', function () { self.mark(false); });
    $('#fc-prev').addEventListener('click', function () { if (self.pos > 0) { self.pos--; self.render(); } });
    $('#fc-src').addEventListener('click', function () {
      var c = self.queue[self.pos]; if (!c) return;
      closeModal('m-flash');
      if (c.hid) { HL.jump(c.hid); return; }
      var t = document.getElementById(c.s); if (t) goTo(t);
    });
    document.addEventListener('keydown', function (e) {
      if ($('#m-flash').hidden || !$('#m-confirm').hidden) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      var onCard = e.target.closest && e.target.closest('.fc-card');
      if ((e.key === ' ' || e.key === 'Enter') && (onCard || tag === 'body')) { e.preventDefault(); self.flip(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (self.pos > 0) { self.pos--; self.render(); } }
      else if (e.key === '1') self.mark(false);
      else if (e.key === '2' || e.key === 'ArrowRight') { e.preventDefault(); self.mark(true); }
    });
  }
};
