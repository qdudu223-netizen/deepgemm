// Regression checks for QA round-2b findings.
const { chromium, devices } = require('playwright');
const path = require('path');
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ok -', m); };
const file = 'file://' + path.resolve(__dirname, '../dist/法国大革命及其历史意义.html');
const block = p => p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
async function sel(page, sc, a, b) {
  await page.evaluate(([sc, a, b]) => {
    const root = document.querySelector(sc); const nodes = [], starts = []; let j = '';
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { nodes.push(n); starts.push(j.length); j += n.nodeValue; }
    const at = pos => { let i = nodes.length - 1; while (i > 0 && starts[i] > pos) i--; return [nodes[i], pos - starts[i]]; };
    const i0 = j.indexOf(a), i1 = j.indexOf(b, i0) + b.length; const s = at(i0), e = at(i1 - 1);
    s[0].parentElement.scrollIntoView({ block: 'center' });
    const r = document.createRange(); r.setStart(s[0], s[1]); r.setEnd(e[0], e[1] + 1); getSelection().removeAllRanges(); getSelection().addRange(r);
  }, [sc, a, b]);
}
(async () => {
  const browser = await chromium.launch(); const errs = [];
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await block(p); await p.goto(file); await p.waitForTimeout(500);
    await sel(p, '#s3-1', '18世纪末', '工业革命'); await p.waitForTimeout(400); await p.tap('#hl-bar .pen.c-red'); await p.waitForTimeout(150);
    await sel(p, '#s3-1', '16世纪，法国', '宗教战争'); await p.waitForTimeout(400);
    const hit = await p.evaluate(() => { const b = document.querySelector('#hl-bar .pen.c-yellow').getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el && el.closest('#hl-bar') ? 'bar' : (el && el.id) || el.tagName; });
    assert(hit === 'bar', 'toast no longer covers the docked colour bar (' + hit + ')');
    await p.tap('#hl-bar .pen.c-yellow'); await p.waitForTimeout(150);
    assert(await p.evaluate(() => document.querySelectorAll('mark.hl.c-yellow').length > 0), 'second colour applied right after the first');
    await p.tap('#bottombar [data-tool="settings"]'); await p.tap('#st-font button[data-v="0"]');
    const fs0 = await p.evaluate(() => getComputedStyle(document.querySelector('#s3-1 li')).fontSize);
    await p.tap('#st-font button[data-v="1"]');
    const fs1 = await p.evaluate(() => getComputedStyle(document.querySelector('#s3-1 li')).fontSize);
    assert(parseFloat(fs0) < parseFloat(fs1), '较小 is smaller than 标准: ' + fs0 + ' < ' + fs1);
    await p.tap('#m-settings [data-close]');
    // undo after note + immediate close restores the note, not another mark
    await p.evaluate(() => document.querySelector('mark.hl.c-red').scrollIntoView({ block: 'center' }));
    await p.tap('mark.hl.c-red'); await p.fill('#hp-note', '财政'); await p.tap('#hp-close'); await p.waitForTimeout(100);
    const before = await p.evaluate(() => new Set([...document.querySelectorAll('mark.hl')].map(m => m.dataset.hid)).size);
    await p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })));
    await p.waitForTimeout(150);
    const after = await p.evaluate(() => ({ n: new Set([...document.querySelectorAll('mark.hl')].map(m => m.dataset.hid)).size, note: document.querySelectorAll('mark.hl.has-note').length }));
    assert(after.n === before && after.note === 0, 'undo reverts the note, keeps both marks: ' + JSON.stringify(after));
    // drawer open: page behind is inert
    await p.tap('#btn-menu'); await p.waitForTimeout(250);
    assert(await p.evaluate(() => ['main', 'topbar', 'bottombar'].every(id => document.getElementById(id).hasAttribute('inert'))), 'page behind open drawer is inert');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    assert(await p.evaluate(() => !document.getElementById('main').hasAttribute('inert')), 'inert removed after closing');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await block(p); await p.goto(file); await p.waitForTimeout(500);
    await p.click('#tools-top [data-tool="flash"]'); await p.waitForTimeout(150);
    await p.keyboard.press('Space'); await p.waitForTimeout(150);
    assert(await p.evaluate(() => !document.getElementById('m-flash').hidden && document.querySelector('.fc-card').classList.contains('flipped')), 'Space right after opening flips the card');
    await p.keyboard.press('2'); await p.keyboard.press('ArrowLeft');
    assert(/^1 \//.test(await p.textContent('#fc-stat')), 'keys keep working (2 then ←)');
    await p.click('#m-flash [data-close]');
    await p.fill('#q', '三级会议 投票'); await p.waitForTimeout(450);
    const items = await p.$$('#sp-list .sp-item');
    await items[0].click(); await p.waitForTimeout(200); await p.click('#q'); await p.waitForTimeout(100);
    assert(await p.isVisible('#search-panel'), 'tapping the focused search box reopens results');
    const items2 = await p.$$('#sp-list .sp-item'); await items2[3].click(); await p.waitForTimeout(200);
    assert(await p.evaluate(() => document.querySelectorAll('mark.sh.cur').length === 1), 'only one current search hit');
    const geo = await p.evaluate(() => { const tl = document.querySelector('.dg-timeline'); const line = parseFloat(getComputedStyle(tl, '::before').left) + tl.getBoundingClientRect().left; const ev = tl.querySelector('.dg-ev'); const dot = ev.getBoundingClientRect().left + parseFloat(getComputedStyle(ev, '::before').left) + 5; return Math.abs(line + 1 - dot); });
    assert(geo < 4, 'timeline dots sit on the line (off by ' + geo.toFixed(1) + 'px)');
    const chain = await p.evaluate(() => { const f = [...document.querySelectorAll('.fig')].find(x => x.textContent.includes('钻石项链事件怎样打击王室')); return getComputedStyle(f.querySelector('.dg-chain')).flexDirection; });
    assert(chain === 'column', '4-step chain stacks vertically');
    await ctx.close();
  }
  console.log('# page errors:', errs.length ? errs : 'none');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
