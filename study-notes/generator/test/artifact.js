// Artifact build inside an iframe with a mocked window.claude runtime (db + user + downloads)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const art = fs.readFileSync(path.resolve(__dirname, '../dist/artifact.html'), 'utf8');
const wrapped = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + art + '</body></html>';
const inner = path.resolve(__dirname, 'shots/artifact-inner.html');
fs.writeFileSync(inner, wrapped);
const parent = path.resolve(__dirname, 'shots/artifact-parent.html');
fs.writeFileSync(parent, `<!doctype html><html><body style="margin:0"><iframe id="f" src="file://${inner}" style="width:1280px;height:860px;border:0"></iframe></body></html>`);
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }
const MOCK = `
(function(){
  if (window === window.top) return;
  const store = window.__store = {};
  const remote = { v:1, topic:'工业革命（技术的革新）', marks: { mcloud: { id:'mcloud', c:'r', segs:[{ b:'s2-1.2', s:0, e:0, t:'工业革命', pre:'', suf:'' }], n:'来自账户的标记', u: 5, ct: 5 } }, del:{}, mastered:{ 's1-1': { v:true, u:5 } }, reviews:{}, cards:{}, custom:{} };
  store['data/users/u1/irn-ir-p40-63'] = { state: JSON.stringify(remote) };
  window.__sets = 0;
  const db = { doc: function (p) { return { get: function () { return Promise.resolve({ exists: !!store[p], data: function () { return store[p]; }, metadata: {} }); }, set: function (d) { store[p] = d; window.__sets++; return Promise.resolve(); } }; } };
  const user = { id: function () { return Promise.resolve('u1'); } };
  const downloads = { save: function (o) { window.__dl = o.filename + ':' + o.data.length; return Promise.resolve({ status: 'saved' }); } };
  window.claude = { use: function (n) { return Promise.resolve({ db: db, user: user, downloads: downloads }[n] || null); } };
})();`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript({ content: MOCK });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.goto('file://' + parent);
  await p.waitForTimeout(1500);
  const f = p.frame({ url: /artifact-inner/ });
  ok(!!f, 'iframe 中加载');
  ok(await f.evaluate(() => !!document.querySelector('mark.hl[data-hl="mcloud"]')), '从账户数据库载入标记并显示');
  ok(await f.evaluate(() => /1 \//.test(document.querySelector('#prog-num').textContent)), '账户中的掌握进度合并');
  await f.click('.tools [data-act="settings"]');
  ok(await f.evaluate(() => /Claude 账户/.test(document.querySelector('#sync-status').textContent)), '设置里显示已同步到账户');
  ok(!(await f.isVisible('#modal [data-s="print"]')), '在线预览（iframe）中不显示打印按钮');
  ok(await f.isVisible('#modal [data-s="dl"]'), '有 downloads 能力时显示下载按钮');
  await f.click('#modal [data-s="dl"]');
  await p.waitForTimeout(300);
  const dl = await f.evaluate(() => window.__dl || '');
  ok(/\.html:\d+/.test(dl), '通过 downloads.save 交付带标记的网页（' + dl.slice(0, 40) + '…）');
  await f.click('#modal [data-close]');
  // a change syncs to the store
  const before = await f.evaluate(() => window.__sets);
  await f.evaluate(() => document.querySelector('#s2-2').scrollIntoView());
  await f.click('#s2-2 .uact [data-act="master"]');
  await p.waitForTimeout(2600);
  const after = await f.evaluate(() => window.__sets);
  ok(after > before, '修改后写入账户数据库（' + before + '→' + after + '）');
  const stored = await f.evaluate(() => JSON.parse(window.__store['data/users/u1/irn-ir-p40-63'].state).mastered['s2-2']);
  ok(stored && stored.v === true, '账户中的数据已更新');
  ok(errs.length === 0, '无脚本错误' + (errs.length ? '：' + errs.join('; ') : ''));
  await b.close();
  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})();
