const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs');
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ok -', m); };
const file = 'file://' + path.resolve(__dirname, '../dist/法国大革命及其历史意义.html');
const SHOT = '/tmp/claude-0/-home-user-deepgemm/6e1807bd-796a-562f-95f3-008ab9433b1b/scratchpad';
(async () => {
  const browser = await chromium.launch();
  // --- due reviews + resume position
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.close();
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
      const k = 'studynotes::fr1789-d5::v1';
      const d = new Date(); const ds = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
      localStorage.setItem(k, JSON.stringify({ rev: { 's3-2': { d: [ds(3)], u: 1 }, 's3-3': { d: [ds(10), ds(9), ds(1)], u: 1 } }, pos: { u: Date.now(), sid: 's4-4', off: 40, y: 50000 } }));
    });
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.goto(file); await p.waitForTimeout(500);
    const due = await p.evaluate(() => ({ a: !document.querySelector('.toc-item[data-sec="s3-2"] .toc-due').hidden, b: document.querySelector('.toc-item[data-sec="s3-3"] .toc-due').hidden, txt: document.getElementById('prog-due').textContent, info: document.querySelector('.ff-due[data-sec="s3-3"]').textContent }));
    assert(due.a, '§3.2 reviewed once 3 days ago → due (interval 1 day)');
    assert(due.b, '§3.3 reviewed 3 times, last yesterday → not due yet (interval 4 days): ' + due.info);
    assert(await p.isVisible('#resume'), 'resume chip offered: ' + await p.textContent('#resume-text'));
    await p.click('#resume-go'); await p.waitForTimeout(900);
    const top = await p.evaluate(() => document.getElementById('s4-4').getBoundingClientRect().top);
    assert(Math.abs(top + 40) < 30, 'jumped back to §4.4 (top ' + Math.round(top) + ')');
    // download with marks
    await p.evaluate(() => { const sel = getSelection(); const t = document.querySelector('#s4-4 p'); const r = document.createRange(); r.selectNodeContents(t); sel.removeAllRanges(); sel.addRange(r); });
    await p.waitForTimeout(300); await p.click('#hl-bar .pen.c-red'); await p.waitForTimeout(200);
    await p.click('#tools-top [data-tool="settings"]');
    assert(await p.isVisible('#bk-download'), 'download button shown in standalone file');
    assert(await p.isVisible('#bk-print'), 'print button shown in standalone file');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bk-download')]);
    const out = path.join(SHOT, 'dl.html'); await dl.saveAs(out);
    const html = fs.readFileSync(out, 'utf8');
    assert(html.startsWith('<!doctype html>') && html.includes('fr-embedded-state">{'), 'downloaded file contains embedded state (' + Math.round(html.length / 1024) + ' KB)');
    // open the downloaded file in a fresh profile: marks load
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p2 = await ctx2.newPage(); p2.on('pageerror', e => errs.push('dl:' + e.message));
    await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p2.goto('file://' + out); await p2.waitForTimeout(500);
    const n = await p2.evaluate(() => document.querySelectorAll('#s4-4 mark.hl.c-red').length);
    assert(n > 0, 'downloaded copy shows the marks on first open');
    await p2.reload(); await p2.waitForTimeout(400);
    const n2 = await p2.evaluate(() => new Set([...document.querySelectorAll('mark.hl')].map(m => m.dataset.hid)).size);
    assert(n2 === 1, 'reopening merges without duplicates (' + n2 + ')');
    await ctx2.close();
    // print
    await p.click('#m-settings [data-close]');
    await p.emulateMedia({ media: 'print' });
    const pr = await p.evaluate(() => ({ top: getComputedStyle(document.getElementById('topbar')).display, side: getComputedStyle(document.getElementById('sidebar')).display, hl: getComputedStyle(document.querySelector('mark.hl')).printColorAdjust || getComputedStyle(document.querySelector('mark.hl')).webkitPrintColorAdjust, bg: getComputedStyle(document.querySelector('mark.hl')).backgroundImage.slice(0, 30), ans: getComputedStyle(document.querySelector('#s6-4 .answer-body')).display }));
    assert(pr.top === 'none' && pr.side === 'none', 'print hides toolbars and sidebar');
    assert(pr.hl === 'exact' && pr.bg.startsWith('linear-gradient'), 'print keeps highlighter colour (print-color-adjust: ' + pr.hl + ')');
    assert(pr.ans !== 'none', 'print shows folded answers');
    await p.pdf({ path: path.join(SHOT, 'print.pdf'), format: 'A4', printBackground: false, pageRanges: '1-3' });
    console.log('  errors:', errs.length ? errs : 'none');
    await ctx.close();
  }
  // --- iPad touch: docked colour bar, highlighter mode auto-apply
  {
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(file); await page.waitForTimeout(500);
    await page.evaluate(() => { const t = document.querySelector('#s3-1 li'); t.scrollIntoView({ block: 'center' }); const r = document.createRange(); const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && n.nodeValue.length < 14); r.setStart(n, 0); r.setEnd(n, 12); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await page.waitForTimeout(400);
    const bar = await page.evaluate(() => { const b = document.getElementById('hl-bar'); const r = b.getBoundingClientRect(); return { docked: b.classList.contains('docked'), bottom: innerHeight - r.bottom, h: r.height, w: r.width }; });
    assert(bar.docked && bar.bottom > 50, 'touch: colour bar docked near bottom, clear of the iOS copy menu (' + JSON.stringify(bar) + ')');
    await page.tap('#hl-bar .pen.c-yellow'); await page.waitForTimeout(200);
    assert(await page.evaluate(() => document.querySelectorAll('mark.hl.c-yellow').length > 0), 'touch: tap colour applies highlight');
    // highlighter mode auto-apply after selection settles
    await page.tap('#bottombar [data-tool="pen"]');
    await page.tap('#pen-menu [data-mode="blue"]');
    await page.evaluate(() => { const t = document.querySelectorAll('#s3-1 li')[1]; const r = document.createRange(); const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && n.nodeValue.length < 14); r.setStart(n, 0); r.setEnd(n, 10); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await page.waitForTimeout(1400);
    assert(await page.evaluate(() => document.querySelectorAll('mark.hl.c-blue').length > 0), 'touch: highlighter mode auto-applies after selection settles');
    const sizes = await page.evaluate(() => [...document.querySelectorAll('#bottombar .tbtn')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    assert(sizes.every(([w, h]) => w >= 44 && h >= 44), 'bottom bar buttons ≥44×44: ' + JSON.stringify(sizes));
    const small = await page.evaluate(() => [...document.querySelectorAll('button, [role=button], a.secref, .ff-master')].filter(b => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (b.matches('button') ) && (r.height < 36 || r.width < 36) && !b.closest('.hl-pop, .modal, .search-panel'); }).map(b => (b.className || b.tagName) + ':' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)).slice(0, 12));
    console.log('  small visible buttons:', small);
    await page.screenshot({ path: path.join(SHOT, 'ipad-hl.png') });
    console.log('  errors:', errs.length ? errs : 'none');
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
