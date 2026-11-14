// Regression checks for the QA round-1 findings. Usage: node regress.js
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs');
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ok -', m); };
const STANDALONE = path.resolve(__dirname, '../dist/法国大革命及其历史意义.html');
const file = 'file://' + STANDALONE;
const SCR = '/tmp/claude-0/-home-user-deepgemm/6e1807bd-796a-562f-95f3-008ab9433b1b/scratchpad';
const block = p => p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
async function sel(page, scopeSel, startText, endText) {
  return page.evaluate(([sc, a, b]) => {
    const root = document.querySelector(sc);
    const nodes = [], starts = []; let joined = '';
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { nodes.push(n); starts.push(joined.length); joined += n.nodeValue; }
    const at = pos => { let i = nodes.length - 1; while (i > 0 && starts[i] > pos) i--; return [nodes[i], pos - starts[i]]; };
    const i0 = joined.indexOf(a), i1 = joined.indexOf(b, i0) + b.length;
    const s = at(i0), e = at(i1 - 1);
    const r = document.createRange(); r.setStart(s[0], s[1]); r.setEnd(e[0], e[1] + 1);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    s[0].parentElement.scrollIntoView({ block: 'center' });
    return String(getSelection());
  }, [scopeSel, startText, endText]);
}
const marks = page => page.evaluate(() => new Set([...document.querySelectorAll('mark.hl')].map(m => m.dataset.hid)).size);
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const newPage = async (ctx, url = file) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await block(p); await p.goto(url); await p.waitForTimeout(450); return p; };

  console.log('# hidden buttons (iframe) and fresh page');
  {
    const host = path.join(SCR, 'iframe-host.html');
    fs.writeFileSync(host, '<!doctype html><meta charset="utf-8"><iframe id="f" sandbox="allow-scripts allow-same-origin" style="width:1280px;height:860px;border:0" src="' + file + '"></iframe>');
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 880 } });
    const p = await newPage(ctx, 'file://' + host);
    await p.waitForTimeout(600);
    const f = p.frames().find(x => x.url().startsWith('file://') && x !== p.mainFrame());
    await f.click('#tools-top [data-tool="settings"]');
    const vis = await f.evaluate(() => ['bk-download', 'bk-print'].map(id => getComputedStyle(document.getElementById(id)).display));
    assert(vis.every(d => d === 'none'), 'download/print hidden in a sandboxed frame: ' + vis);
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await newPage(ctx2);
    assert(await p2.isHidden('#sa-resume'), '“回到上次位置” hidden on a first visit');
    console.log('# font size works on desktop');
    const before = await p2.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#s3-2 .folio-body p')).fontSize));
    await p2.click('#tools-top [data-tool="settings"]');
    await p2.click('#st-font button[data-v="3"]');
    const after = await p2.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#s3-2 .folio-body p')).fontSize));
    assert(after > before * 1.15, 'font size 大: ' + before + 'px → ' + after + 'px');
    await p2.click('#st-font button[data-v="1"]');
    await p2.click('#m-settings [data-close]');

    console.log('# highlight made during a search survives the search changing');
    await p2.fill('#q', '路易十六'); await p2.waitForTimeout(450);
    await sel(p2, '#s3-2', '路易十六昏庸无能', '疏于朝政');
    await p2.waitForTimeout(300); await p2.click('#hl-bar .pen.c-red'); await p2.waitForTimeout(150);
    await p2.fill('#q', '路易十六 王后'); await p2.waitForTimeout(450);
    await p2.fill('#q', ''); await p2.waitForTimeout(450);
    const txt = await p2.evaluate(() => [...document.querySelectorAll('mark.hl.c-red')].map(m => m.textContent).join(''));
    assert(txt.includes('昏庸无能') && txt.includes('疏于朝政'), 'mark text intact after search change/clear: ' + txt);

    console.log('# search across bold / numbers; Enter steps forward');
    await p2.fill('#q', '1788年天灾'); await p2.waitForTimeout(450);
    const c1 = await p2.evaluate(() => document.querySelectorAll('mark.sh0').length);
    assert(c1 >= 1, 'query crossing a number span is highlighted (' + c1 + ')');
    await p2.fill('#q', '巴士底'); await p2.waitForTimeout(450);
    await p2.focus('#q'); await p2.keyboard.press('Enter'); await p2.waitForTimeout(150);
    await p2.focus('#q'); await p2.keyboard.press('Enter'); await p2.waitForTimeout(150);
    const qc = await p2.textContent('#q-count');
    assert(/^2 \//.test(qc), 'second Enter goes to hit 2: ' + qc);
    await p2.fill('#q', ''); await p2.waitForTimeout(300);

    console.log('# backup restore brings deleted highlights back');
    await p2.click('#tools-top [data-tool="settings"]');
    await p2.click('#bk-make'); const code = await p2.inputValue('#bk-out');
    await p2.click('#st-clear-hl'); await p2.click('#cf-yes'); await p2.waitForTimeout(200);
    assert(await marks(p2) === 0, 'clear all removed marks');
    await p2.fill('#bk-in', code); await p2.click('#bk-restore'); await p2.waitForTimeout(300);
    assert(await marks(p2) === 1, 'restore after clear-all revives the highlight');
    await p2.click('#m-settings [data-close]');

    console.log('# note saved even when the menu closes at once');
    await p2.evaluate(() => document.querySelector('mark.hl').scrollIntoView({ block: 'center' }));
    await p2.click('mark.hl'); await p2.type('#hp-note', 'q1'); await p2.click('#hp-close');
    await p2.waitForTimeout(100);
    const note = await p2.evaluate(() => { const s = JSON.parse(localStorage.getItem('studynotes::fr1789-d5::v1') || '{}'); return Object.values(s.hl || {}).map(h => h.note).join('|'); });
    const live = await p2.evaluate(() => document.querySelectorAll('mark.hl.has-note').length);
    assert(live > 0, 'note kept after immediate close (stored: ' + note + ')');

    console.log('# undo after clear-all is fast with 50 marks');
    await p2.evaluate(() => {
      const ps = [...document.querySelectorAll('#doc .folio-body p.mb')].slice(0, 50);
      window.__ps = ps;
    });
    for (let i = 0; i < 50; i++) {
      await p2.evaluate(i => { const p = window.__ps[i]; const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && n.nodeValue.trim().length < 6); if (!n) return; const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.min(5, n.nodeValue.length)); getSelection().removeAllRanges(); getSelection().addRange(r); }, i);
      await p2.evaluate(() => HL_TEST_APPLY && 0).catch(() => {});
      await p2.waitForTimeout(170);
      if (await p2.isVisible('#hl-bar')) await p2.click('#hl-bar .pen.c-blue');
    }
    const n50 = await marks(p2);
    await p2.click('.side-tab[data-tab="hl"]');
    await p2.click('#panel-hl [data-a="clear"]'); await p2.click('#cf-yes'); await p2.waitForTimeout(150);
    const t0 = Date.now();
    await p2.click('#panel-hl [data-a="undo"]');
    const dt = Date.now() - t0;
    assert(await marks(p2) === n50 && dt < 600, 'undo restored ' + n50 + ' marks in ' + dt + ' ms');
    await ctx2.close();
  }

  console.log('# two tabs do not overwrite each other');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const a = await newPage(ctx), b = await newPage(ctx);
    await sel(a, '#s3-1', '18世纪末', '工业革命在英国展开'); await a.waitForTimeout(300); await a.click('#hl-bar .pen.c-yellow'); await a.waitForTimeout(600);
    await b.evaluate(() => document.querySelector('.ff-check[data-sec="s4-1"]').scrollIntoView({ block: 'center' }));
    await b.click('.ff-check[data-sec="s4-1"]'); await b.waitForTimeout(700);
    await a.reload(); await a.waitForTimeout(600);
    const st = await a.evaluate(() => ({ hl: new Set([...document.querySelectorAll('mark.hl')].map(m => m.dataset.hid)).size, m: document.getElementById('s4-1').classList.contains('is-mastered') }));
    assert(st.hl === 1 && st.m, 'tab A keeps its highlight and sees tab B’s mastered section: ' + JSON.stringify(st));
    await ctx.close();
  }

  console.log('# phone/iPad: drawer close button + Esc; focus exit; masks in diagrams; tap targets');
  {
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'] });
    const p = await newPage(ctx);
    await p.tap('#btn-menu'); await p.waitForTimeout(300);
    assert(await p.isVisible('#side-close'), 'drawer has a visible close button');
    await p.tap('#side-close'); await p.waitForTimeout(300);
    assert(!(await p.evaluate(() => document.getElementById('sidebar').classList.contains('open'))), 'close button closes drawer');
    await p.tap('#btn-menu'); await p.waitForTimeout(250); await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    assert(!(await p.evaluate(() => document.getElementById('sidebar').classList.contains('open'))), 'Escape closes drawer');
    await p.tap('#bottombar [data-tool="masknum"]');
    const unmasked = await p.evaluate(() => [...document.querySelectorAll('#doc .dg .num, #doc .gist .num')].filter(n => getComputedStyle(n).color !== 'rgba(0, 0, 0, 0)').length);
    const inDg = await p.evaluate(() => document.querySelectorAll('#doc .dg .num').length);
    assert(inDg > 50 && unmasked === 0, 'numbers in diagrams/gists masked too (' + inDg + ' in diagrams)');
    await p.tap('#bottombar [data-tool="masknum"]');
    await p.tap('#bottombar [data-tool="focus"]');
    const fe = await p.evaluate(() => { const r = document.getElementById('focus-exit').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    assert(fe[1] <= 50 && fe[0] >= 90, 'focus exit is a single-line pill: ' + fe);
    await p.tap('#focus-exit');
    const small = await p.evaluate(() => [...document.querySelectorAll('#doc button, #sidebar button, #sidebar a, .ff-master')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5 && b.offsetParent; }).map(b => (b.className || b.tagName) + ' ' + Math.round(b.getBoundingClientRect().height)).slice(0, 8));
    assert(small.length === 0, 'touch targets ≥44px: ' + JSON.stringify(small));
    await ctx.close();
  }

  console.log('# §6.4 ⑥ statements visible; answers per cell; index text clean');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await newPage(ctx);
    const vis = await p.evaluate(() => { const t = [...document.querySelectorAll('#s6-4 table')].find(t => t.rows[0].cells[0].textContent.trim() === '陈述'); const r = t.getBoundingClientRect(); return { h: r.height, hidden: getComputedStyle(t.rows[1].cells[1]).color }; });
    assert(vis.h > 50 && vis.hidden === 'rgba(0, 0, 0, 0)', 'statement table visible, judgement cells hidden');
    await p.evaluate(() => document.querySelector('.cloze-all').scrollIntoView({ block: 'center' }));
    await p.click('.cloze-all');
    assert(await p.evaluate(() => [...document.querySelectorAll('#s6-4 td.cloze-cell')].every(c => c.classList.contains('peek'))), '“显示全部判断” reveals all four');
    await p.click('.side-tab[data-tab="warn"]');
    const idx = await p.evaluate(() => [...document.querySelectorAll('#panel-warn .idx-item')].map(b => b.childNodes[0].textContent));
    assert(!idx.some(t => t.includes('补充解释')), 'index entries contain no supplement text');
    assert(!idx.some(t => /^核查[（(]?[^：]*$/.test(t) && t.length < 30), 'no bare “核查” entries (' + idx.length + ' entries)');
    await ctx.close();
  }

  console.log('# fonts request hanging does not block the page');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await ctx.newPage();
    await p.route(/fonts\.(googleapis|gstatic)\.com/, () => { /* never answer */ });
    const t0 = Date.now();
    await p.goto(file, { waitUntil: 'commit' });
    await p.waitForFunction(() => document.getElementById('fr-root') && document.getElementById('fr-root').getAttribute('data-ready') === '1', null, { timeout: 8000 });
    assert(Date.now() - t0 < 4000, 'ready in ' + (Date.now() - t0) + ' ms while fonts hang');
    await ctx.close();
  }

  console.log('# cloud: merges remote changes, tombstones stay, reset sticks');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(() => {
      const store = window.__store = { doc: null, listeners: [], writes: 0 };
      const ref = { get: async () => ({ exists: !!store.doc, data: () => store.doc }), set: async d => { store.writes++; store.doc = d; }, onSnapshot: (fn) => { store.listeners.push(fn); return () => {}; } };
      window.__push = d => { store.doc = d; store.listeners.forEach(fn => fn({ exists: true, data: () => d, metadata: { hasPendingWrites: false } })); };
      window.claude = { use: async n => n === 'db' ? { doc: () => ref } : n === 'user' ? { id: async () => 'u1' } : null };
    });
    const p = await newPage(ctx);
    await p.waitForTimeout(3200);
    const remote = { app: 'fr1789-d5', v: 1, hl: {}, mastered: { 's7-1': { v: 1, u: Date.now() - 1000 } }, rev: {}, fc: {}, set: { u: 0 }, pos: { u: 0 } };
    await p.evaluate(r => window.__push({ json: JSON.stringify(r), u: Date.now() }), remote);
    await p.waitForTimeout(600);
    assert(await p.evaluate(() => document.getElementById('s7-1').classList.contains('is-mastered')), 'a change from another device appears live');
    await p.click('#tools-top [data-tool="settings"]');
    await p.click('#st-reset'); await p.click('#cf-yes'); await p.waitForTimeout(300);
    await p.evaluate(r => window.__push({ json: JSON.stringify(r), u: Date.now() }), Object.assign({}, remote, { mastered: { 's7-1': { v: 1, u: 5 } } }));
    await p.waitForTimeout(600);
    assert(!(await p.evaluate(() => document.getElementById('s7-1').classList.contains('is-mastered'))), 'reset is not undone by an older copy from another device');
    await ctx.close();
  }
  console.log('# page errors:', errs.length ? errs : 'none');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
