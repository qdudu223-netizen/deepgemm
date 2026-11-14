// iPad emulation + download-with-marks round trip
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file://' + path.resolve(__dirname, '../dist/工业革命（技术的革新）.html');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }
const HELPERS = fs.readFileSync(path.resolve(__dirname, 'func.js'), 'utf8').split('const HELPERS = `')[1].split('`;')[0];
(async () => {
  const b = await chromium.launch();
  console.log('iPad（触屏）');
  const ctx = await b.newContext(Object.assign({}, devices['iPad Pro 11'], { acceptDownloads: true }));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.goto(FILE);
  await p.addScriptTag({ content: HELPERS });
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => matchMedia('(pointer: coarse)').matches), '触屏环境（pointer: coarse）');
  // tool buttons >= 44px
  const small = await p.evaluate(() => Array.from(document.querySelectorAll('.bottombar .tbtn, .tools .tbtn')).filter(x => x.offsetParent && (x.offsetWidth < 44 || x.offsetHeight < 44)).length);
  ok(small === 0, '工具按钮可点区域 ≥ 44×44');
  const vis = await p.evaluate(() => getComputedStyle(document.querySelector('.bottombar')).display !== 'none' ? 'bottom' : 'top');
  console.log('    工具栏位置：' + vis);
  // selection -> bar below selection and inside viewport
  await p.evaluate(() => window.__select('工业化讲经济结构', 0, '工业化讲经济结构', 8, '#s2-4'));
  await p.waitForSelector('#hl-bar.show', { timeout: 3000 });
  const geo = await p.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); const bb = document.querySelector('#hl-bar').getBoundingClientRect(); return { selBottom: r.bottom, barTop: bb.top, barBottom: bb.bottom, vh: innerHeight }; });
  ok(geo.barTop >= geo.selBottom && geo.barBottom <= geo.vh, '三色条在选区下方（不与系统“拷贝”菜单重叠）且在屏幕内');
  await p.tap('#hl-bar .swatch[data-c="b"]');
  ok(await p.evaluate(() => !!document.querySelector('mark.hl[data-c="b"]')), '点按色块上色');
  // pen mode: selection settles -> auto colour
  const toolSel = vis === 'bottom' ? '.bottombar' : '.tools';
  await p.tap(`${toolSel} [data-act="pen"]`);
  await p.tap('#penstrip .swatch[data-pc="r"]');
  await p.evaluate(() => window.__select('百分点', 0, '百分点', 3, '#s2-4'));
  await p.waitForTimeout(1500);
  ok(await p.evaluate(() => Array.from(document.querySelectorAll('mark.hl[data-c="r"]')).some(m => m.textContent === '百分点')), '荧光笔模式：选区停定后自动上色');
  await p.tap('#penstrip [data-pa="off"]');
  // tap rules: masked number inside a mark reveals first
  await p.evaluate(() => window.__select('煤炭比重由', 0, '煤炭比重由', 10, '#s2-4'));
  await p.waitForSelector('#hl-bar.show');
  await p.tap('#hl-bar .swatch[data-c="y"]');
  await p.tap(`${toolSel} [data-act="mask-num"]`);
  const numSel = await p.evaluate(() => { const n = document.querySelector('.num mark.hl[data-c="y"]').closest('.num'); n.setAttribute('data-t', 'n'); n.scrollIntoView({ block: 'center' }); return !!n; });
  await p.tap('[data-t="n"]');
  ok(await p.evaluate(() => document.querySelector('[data-t="n"]').classList.contains('rv') && !document.querySelector('#hl-menu.show')), '遮挡开启时，点按被遮内容＝显示（不打开标记菜单）');
  await p.tap('[data-t="n"]');
  ok(await p.evaluate(() => !!document.querySelector('#hl-menu.show')), '再点按荧光标记＝打开修改菜单');
  await p.tap('#hl-menu [data-act="close"]');
  await p.tap(`${toolSel} [data-act="mask-num"]`);
  // link inside a mark still opens (navigation to #ref)
  await p.evaluate(() => { const a = document.querySelector('#s2-3 a.ref'); a.scrollIntoView({ block: 'center' }); });
  const refHref = await p.evaluate(() => document.querySelector('#s2-3 a.ref').getAttribute('href'));
  await p.evaluate(() => window.__select('城市人口比例1801年约34.8%', 0, '城市人口比例1801年约34.8%', 10, '#s2-3'));
  await p.waitForSelector('#hl-bar.show');
  await p.tap('#hl-bar .swatch[data-c="b"]');
  // drawer on iPad portrait
  await p.tap('.menu-btn');
  ok(await p.evaluate(() => document.getElementById('app').classList.contains('drawer-open')), '小屏目录收进抽屉，可展开');
  await p.tap('.side-close');
  // download a copy with marks
  console.log('下载带标记的网页');
  await p.tap(`${toolSel} [data-act="settings"]`);
  const hasDl = await p.isVisible('#modal [data-s="dl"]');
  ok(hasDl, '本地文件打开时显示“下载带标记的网页”');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.tap('#modal [data-s="dl"]')]);
  const out = path.resolve(__dirname, 'shots/with-marks.html');
  await dl.saveAs(out);
  const nMarks = await p.evaluate(() => Object.keys(window.__IRN.S().marks).length);
  await ctx.close();
  // open downloaded copy in a fresh profile: marks must load from the embedded state
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errs.push('copy: ' + e.message));
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p2.goto('file://' + out);
  await p2.waitForTimeout(500);
  const n2 = await p2.evaluate(() => Object.keys(window.__IRN.S().marks).length);
  ok(n2 === nMarks && n2 > 0, `下载的文件打开后自动载入标记（${n2}/${nMarks}）`);
  ok(await p2.evaluate(() => document.querySelectorAll('mark.hl').length > 0), '标记在新文件中正确显示');
  await p2.reload(); await p2.waitForTimeout(400);
  ok(await p2.evaluate(() => Object.keys(window.__IRN.S().marks).length) === nMarks, '再次打开不重复');
  await ctx2.close();
  ok(errs.length === 0, '无脚本错误' + (errs.length ? ' ' + errs.join('; ') : ''));
  await b.close();
  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})();
