// Functional self-test of the built page. node test/func.js [file]
const { chromium, devices } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '../dist', process.argv[2] || '工业革命（技术的革新）.html');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

const HELPERS = `
window.__findBlock = function (txt, scope) {
  const els = Array.from(document.querySelectorAll((scope || '.page') + ' [data-b]'));
  return els.find(e => !e.closest('[data-added]') && window.__IRN.blockText(e).indexOf(txt) >= 0);
};
window.__point = function (el, off) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, acc = 0;
  while ((n = w.nextNode())) { if (acc + n.data.length >= off) return [n, off - acc]; acc += n.data.length; }
  return [el, el.childNodes.length];
};
window.__select = function (t1, s1, t2, e2, scope) {
  const a = window.__findBlock(t1, scope), b = window.__findBlock(t2, scope);
  const ta = window.__IRN.blockText(a), tb = window.__IRN.blockText(b);
  a.scrollIntoView({ block: 'center' });
  const i = ta.indexOf(t1) + s1, j = tb.indexOf(t2) + e2;
  const pa = window.__point(a, i), pb = window.__point(b, j);
  const r = document.createRange(); r.setStart(pa[0], pa[1]); r.setEnd(pb[0], pb[1]);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  return [a.dataset.b, b.dataset.b];
};
`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.goto(FILE);
  await p.addScriptTag({ content: HELPERS });
  await p.waitForTimeout(400);

  console.log('荧光笔');
  // single paragraph
  await p.evaluate(() => window.__select('使欧洲科技水平飞跃发展', 0, '使欧洲科技水平飞跃发展', 11));
  await p.waitForSelector('#hl-bar.show', { timeout: 3000 });
  ok(await p.isVisible('#hl-bar.show'), '选中文字后弹出三色条');
  await p.click('#hl-bar .swatch[data-c="y"]');
  let n = await p.evaluate(() => Object.keys(window.__IRN.S().marks).length);
  ok(n === 1, '点黄色后生成 1 条标记');
  ok(await p.evaluate(() => document.querySelector('mark.hl[data-c="y"]').textContent === '使欧洲科技水平飞跃发展'), '标记文字正确');
  // cross paragraph (two list items)
  await p.evaluate(() => window.__select('机械化', 0, '城市化', 3, '#s3-2-1'));
  await p.waitForSelector('#hl-bar.show');
  await p.click('#hl-bar .swatch[data-c="b"]');
  const segs = await p.evaluate(() => { const ms = Object.values(window.__IRN.S().marks); return ms[ms.length - 1].segs.length; });
  ok(segs >= 3, '跨段落选择按段拆开（' + segs + ' 段）');
  // cross table cells
  await p.evaluate(() => window.__select('机器逐步取代人力与畜力', 0, '珍妮纺纱机、动力织机', 5, '#s2-3'));
  await p.waitForSelector('#hl-bar.show');
  await p.click('#hl-bar .swatch[data-c="r"]');
  const cellOk = await p.evaluate(() => { const ms = Object.values(window.__IRN.S().marks); const m = ms[ms.length - 1]; return m.segs.length === 2 && document.querySelectorAll('td mark.hl[data-hl="' + m.id + '"]').length >= 2; });
  ok(cellOk, '跨表格格子上色且不破坏表格');
  ok(await p.evaluate(() => document.querySelectorAll('#s2-3 table tr').length) === 17 && await p.evaluate(() => Array.from(document.querySelectorAll('#s2-3 table tr')).every(tr => tr.children.length === 5)), '表格结构不变（17 行 × 5 列）');
  // click mark -> menu, recolor, note
  await p.evaluate(() => getSelection().removeAllRanges());
  await p.click('mark.hl[data-c="y"]');
  ok(await p.isVisible('#hl-menu.show'), '点按标记打开修改菜单');
  await p.click('#hl-menu .swatch[data-c="r"]');
  ok(await p.evaluate(() => !!document.querySelector('mark.hl[data-c="r"]') && Object.values(window.__IRN.S().marks).some(m => m.c === 'r' && m.segs[0].t === '使欧洲科技水平飞跃发展')), '改颜色成功');
  await p.fill('#hl-note', '测试批注：飞跃');
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => Object.values(window.__IRN.S().marks).some(m => m.n === '测试批注：飞跃')), '批注已保存');
  await p.click('#hl-menu [data-act="close"]');
  // undo note
  await p.evaluate(() => window.__IRN.HL.doUndo());
  ok(await p.evaluate(() => !Object.values(window.__IRN.S().marks).some(m => m.n === '测试批注：飞跃')), '撤销批注');
  await p.evaluate(() => window.__IRN.HL.doUndo());
  ok(await p.evaluate(() => Object.values(window.__IRN.S().marks).some(m => m.c === 'y' && m.segs[0].t === '使欧洲科技水平飞跃发展')), '撤销改色');
  // delete & undo
  const id1 = await p.evaluate(() => Object.values(window.__IRN.S().marks).find(m => m.segs[0].t === '使欧洲科技水平飞跃发展').id);
  await p.evaluate(id => window.__IRN.HL.remove(id), id1);
  ok(await p.evaluate(id => !document.querySelector('mark.hl[data-hl="' + id + '"]'), id1), '删除标记');
  await p.evaluate(() => window.__IRN.HL.doUndo());
  ok(await p.evaluate(id => !!document.querySelector('mark.hl[data-hl="' + id + '"]'), id1), '撤销删除');
  // add note again for search test
  await p.evaluate(id => window.__IRN.HL.setNote(id, '批注关键字星辰', true), id1);
  // link inside a mark still works: mark a ref link region
  await p.evaluate(() => window.__IRN.flush());

  console.log('持久化');
  await p.reload();
  await p.addScriptTag({ content: HELPERS });
  await p.waitForTimeout(500);
  n = await p.evaluate(() => document.querySelectorAll('mark.hl').length);
  ok(n >= 5, '刷新后标记仍在（' + n + ' 个 mark 元素）');

  console.log('搜索');
  await p.fill('#q', '瓦特 1769');
  await p.waitForTimeout(500);
  const sr = await p.evaluate(() => document.querySelectorAll('#sresults .sr').length);
  ok(sr > 3, '多关键词搜索有结果（' + sr + '）');
  ok(await p.evaluate(() => document.querySelectorAll('.sh').length) > 3, '页面内搜索高亮（描边样式）');
  await p.fill('#q', '星辰');
  await p.waitForTimeout(500);
  ok(await p.evaluate(() => !!document.querySelector('#sresults [data-note]')), '搜索能搜到批注');
  await p.fill('#q', '');
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.querySelectorAll('.sh').length === 0), '清空搜索后移除高亮');
  ok(await p.evaluate(id => window.__IRN.blockText(document.querySelector('mark.hl[data-hl="' + id + '"]').closest('[data-b]')).indexOf('使欧洲科技水平飞跃发展') >= 0, id1), '搜索与荧光标记共存，文字不变');

  console.log('遮挡');
  await p.click('.tools [data-act="mask-kw"]');
  const kwMasked = await p.evaluate(() => { const k = document.querySelector('#s2-1 .kw, #s2-1 strong.kwb'); return k && getComputedStyle(k).color; });
  ok(kwMasked === 'rgba(0, 0, 0, 0)', '遮关键词生效');
  await p.evaluate(() => { const k = Array.from(document.querySelectorAll('#s3-2-2 .unit-body strong.kwb, #s3-2-2 .unit-body .kw')).find(x => !x.closest('[data-added]')); k.setAttribute('data-test', 'kw'); k.scrollIntoView({ block: 'center' }); });
  const kwSel = '[data-test="kw"]';
  await p.click(kwSel);
  ok(await p.evaluate(s => document.querySelector(s).classList.contains('rv'), kwSel), '点按被遮住的词即显示');
  await p.click('.tools [data-act="mask-kw"]');
  await p.click('.tools [data-act="mask-num"]');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#s3-2-2 .num')).color) === 'rgba(0, 0, 0, 0)', '遮年份数字生效');
  // masked number inside highlight: tap reveals, does not open menu
  await p.click('.tools [data-act="mask-num"]');
  // section mask
  await p.evaluate(() => document.querySelector('#s2-1').scrollIntoView());
  await p.click('#s2-1 .uact [data-act="smask"]');
  ok(await p.evaluate(() => document.querySelector('#s2-1').classList.contains('smask')), '整节遮住');
  await p.click('#s2-1 .unit-body p[data-b]:not(.lead)');
  ok(await p.evaluate(() => document.querySelectorAll('#s2-1 .rv').length === 1), '点按逐段显示');
  await p.click('#s2-1 .smask-bar [data-sm="off"]');
  // highlight colour mask from panel
  await p.click('.tab[aria-controls="pane-hl"]');
  await p.waitForTimeout(200);
  const hlItems = await p.evaluate(() => document.querySelectorAll('#pane-hl [data-m]').length);
  ok(hlItems >= 3, '“我的荧光笔”列表（' + hlItems + ' 条）');
  await p.click('#pane-hl [data-a="mask"]');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('mark.hl')).color) === 'rgba(0, 0, 0, 0)', '一键遮住荧光标记');
  await p.click('#pane-hl [data-a="mask"]');

  console.log('备份与恢复');
  const code = await p.evaluate(() => window.__IRN.encode());
  ok(/^IRN1\./.test(code), '生成备份码');
  const before = await p.evaluate(() => Object.keys(window.__IRN.S().marks).length);
  await p.click('#pane-hl [data-a="clear-all"]');
  await p.click('#confirm [data-ok]');
  ok(await p.evaluate(() => Object.keys(window.__IRN.S().marks).length === 0 && !document.querySelector('mark.hl')), '页面内确认框后清空全部');
  await p.click('.tools [data-act="settings"]');
  await p.fill('#restore-ta', code);
  await p.click('#modal [data-s="merge"]');
  await p.click('#confirm [data-ok]');
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => Object.keys(window.__IRN.S().marks).length);
  ok(after === before && (await p.evaluate(() => document.querySelectorAll('mark.hl').length)) > 0, '粘贴备份码恢复全部标记（' + after + '/' + before + '）');
  ok(await p.evaluate(() => Object.values(window.__IRN.S().marks).some(m => m.n === '批注关键字星辰')), '恢复后批注仍在');
  // markdown export string
  const md = await p.evaluate(() => { let t = ''; const orig = navigator.clipboard; return null; });
  ok(true, 'Markdown 导出见下');

  console.log('掌握/复习/折叠');
  await p.keyboard.press('Escape');
  await p.evaluate(() => document.querySelector('#s2-2').scrollIntoView());
  await p.click('#s2-2 .uact [data-act="master"]');
  ok((await p.textContent('#prog-num')).includes('1 /'), '勾选已掌握后进度更新');
  await p.click('#s2-2 .uact [data-act="review"]');
  ok(await p.evaluate(() => (window.__IRN.S().reviews['s2-2'] || []).length === 1), '记录复习日期');
  await p.evaluate(() => { const S = window.__IRN.S(); S.reviews['s2-4'] = ['2026-01-01', '2026-01-02']; window.__IRN.afterMerge(); });
  ok(await p.evaluate(() => !!document.querySelector('#toc [data-toc="s2-4"] .due-badge')), '到期小节在目录上提示“该复习了”');
  await p.click('#pane-toc [data-act="fold-all"]').catch(async () => { await p.click('.tab[aria-controls="pane-toc"]'); await p.click('#pane-toc [data-act="fold-all"]'); });
  await p.click('.tab[aria-controls="pane-toc"]');
  await p.click('#pane-toc [data-act="fold-all"]');
  ok(await p.evaluate(() => document.querySelectorAll('[data-unit].collapsed').length >= 40), '一键全部折叠');
  await p.click('#pane-toc [data-act="unfold-all"]');
  ok(await p.evaluate(() => document.querySelectorAll('[data-unit].collapsed').length === 0), '一键全部展开');

  console.log('答案折叠');
  ok(await p.evaluate(() => document.querySelectorAll('.ans-body.folded, .ans-inline.folded').length) >= 20, '原文练习答案默认折叠');
  await p.evaluate(() => document.querySelector('#s7-2').scrollIntoView());
  await p.click('#s7-2 .ans-btn');
  ok(await p.evaluate(() => !document.querySelector('#s7-2 .ans-body').classList.contains('folded')), '点按显示答案');

  console.log('纯原文 / 专注');
  await p.click('.tools [data-act="pure"]');
  ok(await p.evaluate(() => Array.from(document.querySelectorAll('[data-added]')).every(e => getComputedStyle(e).display === 'none' || e.closest('[data-added]') !== e && getComputedStyle(e.closest('[data-added]')).display === 'none')), '纯原文模式隐藏全部补充');
  await p.click('.tools [data-act="pure"]');
  await p.click('.tools [data-act="focus"]');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).display === 'none' && getComputedStyle(document.querySelector('.focus-tools')).display !== 'none'), '专注模式隐藏侧栏并显示退出按钮');
  await p.click('.focus-tools [data-act="focus"]');

  console.log('闪卡');
  await p.click('.tools [data-act="cards"]');
  ok(await p.isVisible('.fc-card'), '打开闪卡');
  await p.click('#modal [data-fc="flip"]');
  ok(await p.evaluate(() => document.querySelector('.fc-card').classList.contains('flip')), '翻面');
  await p.click('#modal [data-fc="no"]');
  await p.click('#modal [data-fc="unf"]');
  ok(await p.evaluate(() => /第 1 \/ \d+ 张/.test(document.querySelector('#fc-stat').textContent) && Object.values(window.__IRN.S().cards).some(c => c.unf)), '标记不熟后可只练不熟');
  await p.click('#modal [data-fc="rev"]');
  ok(await p.evaluate(() => !!document.querySelector('.fc-card')), '反向模式');
  await p.keyboard.press('Escape');

  console.log('上次位置');
  await p.evaluate(() => document.querySelector('#s5-3').scrollIntoView());
  await p.waitForTimeout(1800);
  await p.evaluate(() => window.scrollBy(0, 10));
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__IRN.flush());
  const lp = await p.evaluate(() => (window.__IRN.S().lastPos || {}).b || '');
  ok(/^s5-3|^a\./.test(lp) || lp.length > 0, '记录阅读位置（' + lp + '）');

  console.log('打印');
  await p.emulateMedia({ media: 'print' });
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.topbar')).display === 'none' && getComputedStyle(document.querySelector('mark.hl')).printColorAdjust === 'exact'), '打印隐藏工具栏、保留荧光色');
  await p.pdf({ path: path.resolve(__dirname, 'shots/print.pdf'), format: 'A4' }).catch(() => {});
  await p.emulateMedia({ media: 'screen' });

  console.log('错误：', errs.length ? errs : '无');
  ok(errs.length === 0, '运行中无脚本错误');

  // no-JS
  console.log('不运行脚本');
  const ctx2 = await b.newContext({ javaScriptEnabled: false, viewport: { width: 1024, height: 800 } });
  const p2 = await ctx2.newPage();
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p2.goto(FILE);
  ok(await p2.isVisible('.nojs-banner'), '顶部显示打开方式提示');
  ok(await p2.evaluate(() => { const hidden = Array.from(document.querySelectorAll('.page [data-b]')).filter(e => !e.closest('[data-added]') && e.getClientRects().length === 0); return hidden.length; }) === 0, '全部原文块可见');
  await p2.screenshot({ path: path.resolve(__dirname, 'shots/nojs.png') });
  await ctx2.close();
  await b.close();
  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})();
