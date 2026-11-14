/* ===================================================================== start */
var Render = {
  all: function () {
    Modes.applyAll();
    $$('#doc .folio.is-folded').forEach(function (f) { f.classList.remove('is-folded'); });
    Fold.restore();
    HL.renderAll();
    Progress.render();
    Settings.sync();
    Margin.soon();
  }
};
function init() {
  fillIcons(ROOT);
  loadState();
  buildTools();
  fillIcons(ROOT);
  $$('#doc .kw-chip').forEach(function (k) { k.setAttribute('role', 'button'); k.tabIndex = 0; k.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); k.click(); } }); });
  $$('#doc .sn-head').forEach(function (h) { h.setAttribute('tabindex', '0'); });
  Side.init();
  TOC.build();
  Fold.restore(); Fold.bind(); Answers.bind(); Progress.bind(); Mask.bindSections();
  Search.bind(); Settings.bind(); HL.bind(); FC.bind();
  Modes.applyAll();
  HL.renderAll();
  Progress.render();
  Margin.layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { Margin.soon(); });
  setTimeout(function () { Margin.soon(); }, 900);
  Resume.offer();
  var h = location.hash && location.hash.slice(1);
  if (h) { var t = document.getElementById(h); if (t) setTimeout(function () { goTo(t, { noFlash: true }); }, 60); }
  window.addEventListener('hashchange', function () { var t = document.getElementById(location.hash.slice(1)); if (t) goTo(t); });
  Cloud.init().then(function (changed) {
    if (changed) { lsSet(JSON.stringify(S)); Render.all(); toast('已从 Claude 云端载入你的学习记录'); }
    Settings.sync();
  });
  ROOT.setAttribute('data-ready', '1');
}
try { init(); }
catch (err) {
  /* if anything goes wrong, fall back to the fully visible static page */
  document.documentElement.classList.remove('js');
  var b = document.querySelector('.nojs-banner');
  if (b) b.textContent = '互动功能加载失败，已显示完整原文。可刷新重试，或用在线版 / Microsoft Edge 打开。';
  if (window.console) console.error(err);
}
})();
