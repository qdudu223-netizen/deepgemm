// Functional checks for the study page. Usage: node func.js
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { if (!c) { throw new Error('FAIL: ' + m); } console.log('  ok -', m); };
const file = 'file://' + path.resolve(__dirname, '../dist/法国大革命及其历史意义.html');
const SHOT = '/tmp/claude-0/-home-user-deepgemm/6e1807bd-796a-562f-95f3-008ab9433b1b/scratchpad';
async function selectText(page, startSel, startText, endSel, endText) {
  return page.evaluate(([a, at, b, bt]) => {
    function find(sel, t) {
      const el = document.querySelector(sel);
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const i = n.nodeValue.indexOf(t); if (i >= 0) return [n, i]; }
      return null;
    }
    const s = find(a, at), e = find(b, bt);
    const r = document.createRange(); r.setStart(s[0], s[1]); r.setEnd(e[0], e[1] + bt.length);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    return String(sel);
  }, [startSel, startText, endSel, endText]);
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(file); await page.waitForTimeout(500);
  console.log('# basic');
  assert(await page.evaluate(() => document.documentElement.classList.contains('js')), 'js class on');
  assert(await page.isHidden('.nojs-banner'), 'no-js banner hidden when script runs');
  const tocItems = await page.$$eval('#panel-toc .toc-item', a => a.length);
  assert(tocItems === 48, 'TOC lists 48 sections (' + tocItems + ')');

  console.log('# search');
  await page.fill('#q', '三级会议 投票');
  await page.waitForTimeout(500);
  const sp = await page.evaluate(() => ({ info: document.getElementById('sp-info').textContent, n: document.querySelectorAll('#sp-list .sp-item').length, marks: document.querySelectorAll('mark.sh').length }));
  assert(sp.n > 3 && sp.marks > 3, 'multi-keyword search finds paragraphs (' + sp.info + ', marks ' + sp.marks + ')');
  const allAnd = await page.evaluate(() => { const items = window.__x; return true; });
  await page.click('#sp-list .sp-item');
  await page.waitForTimeout(400);
  assert(await page.evaluate(() => !!document.querySelector('mark.sh.cur')), 'clicking a result focuses a hit');
  await page.fill('#q', ''); await page.waitForTimeout(400);
  assert(await page.evaluate(() => document.querySelectorAll('mark.sh').length === 0), 'clearing search removes hit marks');

  console.log('# masks');
  await page.click('#tools-top [data-tool="maskkw"]');
  const kwColor = await page.evaluate(() => getComputedStyle(document.querySelector('#s3-3 .folio-body strong')).color);
  assert(kwColor === 'rgba(0, 0, 0, 0)', 'keywords masked (color ' + kwColor + ')');
  await page.evaluate(() => document.querySelector('#s3-3 .folio-body strong').scrollIntoView({ block: 'center' }));
  await page.click('#s3-3 .folio-body strong');
  assert(await page.evaluate(() => document.querySelector('#s3-3 .folio-body strong').classList.contains('peek')), 'tap reveals one keyword');
  await page.click('#tools-top [data-tool="maskkw"]');
  await page.click('#tools-top [data-tool="masknum"]');
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('#s3-3 .num')).color === 'rgba(0, 0, 0, 0)'), 'numbers masked');
  await page.click('#tools-top [data-tool="masknum"]');
  await page.evaluate(() => document.querySelector('.ff-mask[data-sec="s3-1"]').scrollIntoView({ block: 'center' }));
  await page.click('.ff-mask[data-sec="s3-1"]');
  assert(await page.evaluate(() => document.getElementById('s3-1').classList.contains('is-masked')), 'section mask on');
  await page.evaluate(() => document.querySelector('#s3-1 .mb').scrollIntoView({ block: 'center' }));
  await page.click('#s3-1 .mb');
  assert(await page.evaluate(() => document.querySelector('#s3-1 .mb').classList.contains('peek')), 'tap reveals masked block');
  await page.evaluate(() => document.querySelector('.ff-mask[data-sec="s3-1"]').scrollIntoView({ block: 'center' }));
  await page.click('.ff-mask[data-sec="s3-1"]');

  console.log('# answers & cloze');
  const ansHidden = await page.evaluate(() => { const b = document.querySelector('#s6-4 .answer .answer-body'); return getComputedStyle(b).display; });
  assert(ansHidden === 'none', 'exercise answers folded by default');
  await page.evaluate(() => document.querySelector('#s6-4 .ans-toggle').scrollIntoView({ block: 'center' }));
  await page.click('#s6-4 .ans-toggle');
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('#s6-4 .answer .answer-body')).display !== 'none'), 'tap shows answer');

  console.log('# highlighter');
  let s = await selectText(page, '#s3-2-4 + p, #s3-2', '路易十六统治时期', '#s3-2', '军费开支极为庞大');
  await page.waitForTimeout(400);
  assert(await page.isVisible('#hl-bar'), 'colour bar appears on selection (' + s.slice(0, 20) + '…)');
  await page.click('#hl-bar .pen.c-red');
  await page.waitForTimeout(200);
  let marks = await page.$$eval('mark.hl.c-red', m => m.length);
  assert(marks >= 1, 'red highlight applied (' + marks + ' marks)');
  // cross-paragraph / cross-cell
  s = await selectText(page, '#s3-3', '天灾令法国农作物', '#s3-3', '面包是今日法国人');
  await page.waitForTimeout(300);
  await page.click('#hl-bar .pen.c-blue');
  await page.waitForTimeout(200);
  const ids = await page.evaluate(() => [...new Set([...document.querySelectorAll('mark.hl')].map(m => m.dataset.hid))]);
  assert(ids.length === 2, 'two highlights stored');
  // cross-table-cells
  s = await selectText(page, '#s3-3 table', '303', '#s3-3 table', '282');
  await page.waitForTimeout(300);
  await page.click('#hl-bar .pen.c-yellow');
  await page.waitForTimeout(200);
  const cellMarks = await page.evaluate(() => [...document.querySelectorAll('#s3-3 table mark.hl.c-yellow')].map(m => m.closest('td').cellIndex));
  assert(cellMarks.length >= 2, 'cross-cell selection wrapped per cell (' + cellMarks.join(',') + ')');
  const tableOk = await page.evaluate(() => document.querySelector('#s3-3 table').rows.length);
  assert(tableOk === 4, 'table structure intact');
  // click to edit
  await page.evaluate(() => getSelection().removeAllRanges());
  await page.evaluate(() => document.querySelector('mark.hl.c-red').scrollIntoView({ block: 'center' }));
  await page.click('mark.hl.c-red');
  await page.waitForTimeout(200);
  assert(await page.isVisible('#hl-pop'), 'tapping a highlight opens edit menu');
  await page.click('#hp-colors .pen.c-yellow');
  assert(await page.evaluate(() => document.querySelectorAll('mark.hl.c-red').length === 0), 'recolour red→yellow');
  await page.fill('#hp-note', '财政危机主因是债务');
  await page.waitForTimeout(500);
  await page.click('#hp-close');
  const hasNote = await page.evaluate(() => document.querySelectorAll('mark.hl.has-note').length);
  assert(hasNote > 0, 'note saved and marked');
  // undo recolour? undo stack: add,add,add,upd(color) -> undo should restore red
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.querySelector('#hb-undo') && 0; });
  // search finds notes
  await page.fill('#q', '主因是债务'); await page.waitForTimeout(500);
  assert(await page.evaluate(() => [...document.querySelectorAll('#sp-list .sp-item')].some(b => b.hasAttribute('data-hl'))), 'search finds annotation');
  await page.fill('#q', ''); await page.waitForTimeout(300);
  // persistence
  await page.waitForTimeout(600);
  await page.reload(); await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({ n: new Set([...document.querySelectorAll('mark.hl')].map(m => m.dataset.hid)).size, note: document.querySelectorAll('mark.hl.has-note').length }));
  assert(after.n === 3 && after.note > 0, 'highlights + note survive reload (' + after.n + ')');
  // delete + undo
  await page.evaluate(() => document.querySelector('mark.hl.c-blue').scrollIntoView({ block: 'center' }));
  await page.click('mark.hl.c-blue');
  await page.click('#hp-del');
  assert(await page.evaluate(() => document.querySelectorAll('mark.hl.c-blue').length === 0), 'delete highlight');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.querySelectorAll('mark.hl.c-blue').length > 0), 'undo restores deleted highlight');
  // mask highlights from panel
  await page.click('.side-tab[data-tab="hl"]');
  await page.waitForTimeout(200);
  const listN = await page.$$eval('#panel-hl .hl-item', a => a.length);
  assert(listN === 3, 'my-highlighter list shows 3 items');
  await page.click('#panel-hl [data-a="mask"]');
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('mark.hl')).color === 'rgba(0, 0, 0, 0)'), 'mask all highlights');
  await page.evaluate(() => document.querySelector('mark.hl').scrollIntoView({ block: 'center' }));
  await page.click('mark.hl');
  assert(await page.evaluate(() => document.querySelector('mark.hl').classList.contains('peek')) && await page.isHidden('#hl-pop'), 'tap on masked highlight reveals instead of menu');
  await page.click('#panel-hl [data-a="mask"]');
  // markdown

  // backup roundtrip
  console.log('# backup');
  await page.click('#tools-top [data-tool="settings"]');
  await page.click('#bk-make');
  await page.waitForTimeout(200);
  const code = await page.inputValue('#bk-out');
  assert(code.startsWith('FRD5-') && code.length > 200, 'backup code generated (' + code.length + ' chars)');
  await page.click('#m-settings [data-close]');
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p2 = await ctx2.newPage();
    await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p2.goto(file); await p2.waitForTimeout(500);
    assert(await p2.evaluate(() => document.querySelectorAll('mark.hl').length === 0), 'fresh device → no marks');
    await p2.click('#tools-top [data-tool="settings"]');
    await p2.fill('#bk-in', code);
    await p2.click('#bk-restore');
    await p2.waitForTimeout(400);
    const restored = await p2.evaluate(() => ({ n: new Set([...document.querySelectorAll('mark.hl')].map(m => m.dataset.hid)).size, note: document.querySelectorAll('mark.hl.has-note').length }));
    assert(restored.n === 3 && restored.note > 0, 'paste-restore on another device brings back all highlights + note');
    await p2.click('#bk-restore');
    await p2.fill('#bk-in', code); await p2.click('#bk-restore'); await p2.waitForTimeout(300);
    const again = await p2.evaluate(() => new Set([...document.querySelectorAll('mark.hl')].map(m => m.dataset.hid)).size);
    assert(again === 3, 'restoring twice does not duplicate');
    await ctx2.close();
  }
  console.log('# progress & review');
  await page.evaluate(() => document.querySelector('.ff-check[data-sec="s3-1"]').scrollIntoView({ block: 'center' }));
  await page.click('.ff-check[data-sec="s3-1"]');
  assert(await page.evaluate(() => document.getElementById('s3-1').classList.contains('is-mastered') && document.getElementById('prog-n').textContent === '1'), 'mastered stamp + progress 1');
  await page.click('.ff-review[data-sec="s3-1"]');
  const due = await page.textContent('.ff-due[data-sec="s3-1"]');
  assert(/已复习 1 次/.test(due), 'review recorded: ' + due);
  // simulate a past review to test due badge
  await page.evaluate(() => { const k = Object.keys(localStorage).find(k => k.startsWith('studynotes::')); });

  console.log('# flashcards');
  await page.click('#tools-top [data-tool="flash"]');
  await page.waitForTimeout(200);
  const fcStat = await page.textContent('#fc-stat');
  assert(/1 \/ \d+/.test(fcStat), 'flashcards open on default deck: ' + fcStat);
  await page.click('#fc-stage .fc-card');
  assert(await page.evaluate(() => document.querySelector('.fc-card').classList.contains('flipped')), 'card flips');
  await page.click('#fc-bad');
  await page.click('#fc-weak');
  const weakStat = await page.textContent('#fc-stat');
  assert(/1 \/ 1/.test(weakStat), 'only-weak mode shows the 1 weak card: ' + weakStat);
  await page.click('#fc-weak');
  await page.click('#fc-reverse');
  await page.click('#m-flash [data-close]');

  console.log('# modes');
  await page.click('#tools-top [data-tool="pure"]');
  assert(await page.evaluate(() => [...document.querySelectorAll('[data-supp]')].every(e => getComputedStyle(e).display === 'none')), 'pure-original mode hides all supplements');
  await page.click('#tools-top [data-tool="pure"]');
  await page.click('#tools-top [data-tool="focus"]');
  assert(await page.isHidden('#topbar') && await page.isVisible('#focus-exit'), 'focus mode hides chrome, keeps exit button');
  await page.click('#focus-exit');
  await page.click('.side-tab[data-tab="toc"]');
  await page.click('#sa-fold');
  assert(await page.evaluate(() => [...document.querySelectorAll('.folio')].every(f => f.classList.contains('is-folded'))), 'fold all');
  await page.click('#sa-unfold');
  await page.click('#sa-snc');
  assert(await page.evaluate(() => document.body.classList.contains('sn-collapsed')), 'collapse explanations');
  await page.click('#sa-snc');

  console.log('# errors:', errs.length ? errs : 'none');
  await page.screenshot({ path: SHOT + '/func-end.png' });
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
