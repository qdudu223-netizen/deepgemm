// Regression tests for the findings of the independent review
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const FILE = 'file://' + path.resolve(__dirname, '../dist/工业革命（技术的革新）.html');
const HELPERS = fs.readFileSync(path.resolve(__dirname, 'func.js'), 'utf8').split('const HELPERS = `')[1].split('`;')[0];
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }
async function open(ctx, opts) {
  const p = await ctx.newPage();
  p._errs = [];
  p.on('pageerror', e => p._errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.goto((opts && opts.url) || FILE);
  await p.addScriptTag({ content: HELPERS });
  await p.waitForTimeout(350);
  return p;
}
const marks = p => p.evaluate(() => Object.values(window.__IRN.S().marks).map(m => m.c + ':' + window.__IRN.HL.textOf(m)));
async function colour(p, t1, s1, t2, e2, scope, c) {
  await p.evaluate(a => window.__select(a[0], a[1], a[2], a[3], a[4]), [t1, s1, t2, e2, scope]);
  await p.waitForSelector('#hl-bar.show', { timeout: 3000 });
  await p.click(`#hl-bar .swatch[data-c="${c}"]`);
  await p.waitForTimeout(120);
}
(async () => {
  const b = await chromium.launch();
  const errs = [];

  console.log('两个标签页同时打开');
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const A = await open(ctx), B = await open(ctx);
    await colour(A, '使欧洲科技水平飞跃发展', 0, '使欧洲科技水平飞跃发展', 6, '#s2-1', 'y');
    await A.evaluate(() => window.__IRN.flush());
    await B.evaluate(() => { window.scrollBy(0, 2000); });
    await B.waitForTimeout(1700);
    await B.evaluate(() => { window.scrollBy(0, 300); });
    await B.waitForTimeout(600);
    await B.evaluate(() => window.__IRN.flush());
    const C = await open(ctx);
    ok((await marks(C)).length === 1, '旧标签页保存后，另一页新加的标记仍在（' + (await marks(C)).length + '）');
    ok(await B.evaluate(() => !!document.querySelector('mark.hl')), '另一标签页自动显示新标记（storage 事件）');
    errs.push(...A._errs, ...B._errs, ...C._errs);
    await ctx.close();
  }

  console.log('荧光笔模式');
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await open(ctx);
    await p.click('.tools [data-act="pen"]');
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('#penstrip .swatch[data-pc="y"] i')).backgroundColor !== 'rgba(0, 0, 0, 0)'), '荧光笔色条的颜色块可见');
    ok(await p.evaluate(() => /易错/.test(document.querySelector('#penstrip').textContent)), '色条上显示颜色名称');
    const sel = (a, s, e) => p.evaluate(x => window.__select(x[0], x[1], x[0], x[2], '#s2-1'), [a, s, e]);
    await sel('使欧洲科技水平飞跃发展', 0, 4); await p.mouse.move(5, 5); await p.dispatchEvent('body', 'mouseup'); await p.waitForTimeout(150);
    await sel('使欧洲科技水平飞跃发展', 4, 8); await p.dispatchEvent('body', 'mouseup'); await p.waitForTimeout(150);
    let m = await marks(p);
    ok(m.length === 2, '相邻两笔都保留（' + m.join(' | ') + '）');
    await p.evaluate(() => window.__IRN.HL.doUndo());
    m = await marks(p);
    ok(m.length === 1 && m[0] === 'y:使欧洲科', '撤销只撤掉最后一笔');
    await sel('使欧洲科技水平飞跃发展', 0, 11); await p.dispatchEvent('body', 'mouseup'); await p.waitForTimeout(150);
    m = await marks(p);
    ok(m.length === 1 && m[0] === 'y:使欧洲科技水平飞跃发展', '把一笔拉长＝替换为一条标记（' + m.join(' | ') + '）');
    await p.evaluate(() => window.__IRN.HL.doUndo());
    m = await marks(p);
    ok(m.length === 1 && m[0] === 'y:使欧洲科', '撤销后恢复原来那一笔');
    ok(await p.evaluate(() => Object.keys(window.__IRN.S().del).length >= 1), '被替换／撤销的标记留有删除记录');
    await p.click('#penstrip [data-pa="off"]');
    errs.push(...p._errs);
    await ctx.close();
  }

  console.log('重复上色与覆盖');
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await open(ctx);
    await colour(p, '使欧洲科技水平飞跃发展', 0, '使欧洲科技水平飞跃发展', 11, '#s2-1', 'y');
    await colour(p, '使欧洲科技水平飞跃发展', 0, '使欧洲科技水平飞跃发展', 11, '#s2-1', 'r');
    let m = await marks(p);
    ok(m.length === 1 && m[0].startsWith('r:'), '同一段再选色＝改色，不叠加（' + m.join(' | ') + '）');
    await colour(p, '使欧洲科技水平飞跃发展', 2, '使欧洲科技水平飞跃发展', 6, '#s2-1', 'b');
    m = await marks(p);
    ok(m.length === 2, '在标记内部再标一小段，两条都在');
    await p.click('.tab[aria-controls="pane-hl"]');
    await p.waitForTimeout(150);
    const ids = await p.evaluate(() => Array.from(document.querySelectorAll('#pane-hl [data-m]')).map(x => x.dataset.m));
    await p.click(`#pane-hl [data-m="${ids[ids.length - 1]}"]`);
    await p.waitForTimeout(700);
    ok(await p.isVisible('#hl-menu.show'), '“我的荧光笔”列表点条目会打开修改菜单（被盖住的标记也能改）');
    await p.keyboard.press('Escape');
    // toast undo bound to its own operation
    await p.evaluate(() => { const ms = Object.values(window.__IRN.S().marks); window.__IRN.HL.remove(ms[0].id); });
    await colour(p, '工业革命是约18世纪中叶起', 0, '工业革命是约18世纪中叶起', 4, '#s2-1', 'y');
    const before = (await marks(p)).length;
    await p.evaluate(() => { const ms = Object.values(window.__IRN.S().marks); });
    // simulate the earlier toast for the deletion: undo op of type del via undoOp
    const ok2 = await p.evaluate(() => { const H = window.__IRN.HL; const op = H.undo.find(o => o.t === 'del'); H.undoOp(op); return Object.keys(window.__IRN.S().marks).length; });
    ok(ok2 === before + 1, '提示条上的“撤销”只撤销它显示的那一步');
    errs.push(...p._errs);
    await ctx.close();
  }

  console.log('隐藏内容不被上色');
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await open(ctx);
    await p.click('.tools [data-act="pure"]');
    await p.evaluate(() => window.__select('使欧洲科技水平飞跃发展', 0, '定义陷阱', 2, '#s2-1'));
    await p.waitForSelector('#hl-bar.show');
    await p.click('#hl-bar .swatch[data-c="y"]');
    ok(await p.evaluate(() => Object.values(window.__IRN.S().marks).every(m => m.segs.every(g => !g.b.startsWith('a.')))), '纯原文模式下跨段选择，不会给隐藏的补充上色');
    await p.click('.tools [data-act="pure"]');
    // across a folded inline answer (s3-2-6 资料分析参考答案)
    await p.evaluate(() => window.__select('资料分析', 0, '出处', 2, '#s3-2-6'));
    await p.waitForSelector('#hl-bar.show');
    await p.click('#hl-bar .swatch[data-c="b"]');
    const leak = await p.evaluate(() => Object.values(window.__IRN.S().marks).some(m => m.segs.some(g => /漫画讽刺/.test(g.t))));
    ok(!leak, '跨过折叠的答案选择，答案文字不被上色、不进列表');
    errs.push(...p._errs);
    await ctx.close();
  }

  console.log('按文字＋前后文重新定位');
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await open(ctx);
    await p.evaluate(() => window.__select('而蒸汽机令其在1750年后加速', 1, '而蒸汽机令其在1750年后加速', 4, '#s5-5'));
    await p.waitForSelector('#hl-bar.show');
    await p.click('#hl-bar .swatch[data-c="r"]');
    await p.evaluate(() => { const S = window.__IRN.S(); const m = Object.values(S.marks)[0]; m.segs[0].b = 's1-2.17'; m.segs[0].s = 3; m.segs[0].e = 6; window.__IRN.flush(); });
    await p.reload(); await p.waitForTimeout(400);
    const where = await p.evaluate(() => { const mk = document.querySelector('mark.hl'); return mk ? mk.closest('[data-b]').getAttribute('data-b') + '|' + mk.parentElement.closest('[data-b]').textContent.slice(0, 30) : 'none'; });
    ok(where.startsWith('s5-5.'), '块编号变了也按前后文找回原位置（' + where.slice(0, 20) + '）');
    errs.push(...p._errs);
    await ctx.close();
  }

  console.log('上次位置');
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await open(ctx);
    let bad = 0, tried = 0;
    for (const id of ['s6-4', 's6-5-1', 's6-5-2', 's6-5-3', 's6-5-5', 's7-2', 's3-2-6']) {
      await p.evaluate(id => document.getElementById(id).scrollIntoView({ block: 'start' }), id);
      await p.waitForTimeout(1700);
      await p.evaluate(() => window.scrollBy(0, 40));
      await p.waitForTimeout(300);
      const r = await p.evaluate(() => { const b = window.__IRN.BMAP()[(window.__IRN.S().lastPos || {}).b]; if (!b) return 99999; return Math.round(b.getBoundingClientRect().top); });
      tried++; if (r < -400 || r > 600) bad++;
    }
    ok(bad === 0, `记录的位置都在当前屏幕附近（${tried - bad}/${tried}）`);
    errs.push(...p._errs);
    await ctx.close();
  }

  console.log('恢复、重置与下载副本');
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    const p = await open(ctx);
    await colour(p, '使欧洲科技水平飞跃发展', 0, '使欧洲科技水平飞跃发展', 11, '#s2-1', 'y');
    const code = await p.evaluate(() => window.__IRN.encode());
    await p.evaluate(() => { const m = Object.values(window.__IRN.S().marks)[0]; window.__IRN.HL.setNote(m.id, '后来写的批注', true); window.__IRN.HL.recolor(m.id, 'r'); });
    await p.click('.tools [data-act="settings"]');
    await p.fill('#restore-ta', code);
    await p.click('#modal [data-s="merge"]');
    await p.click('#confirm [data-no]');
    ok(await p.evaluate(() => !!document.querySelector('#restore-ta') && document.querySelector('#restore-ta').value.startsWith('IRN1.')), '确认框点“取消”后设置仍开着，粘贴的备份码还在');
    await p.click('#modal [data-s="merge"]');
    await p.click('#confirm [data-ok]');
    await p.waitForTimeout(200);
    const m = await p.evaluate(() => Object.values(window.__IRN.S().marks)[0]);
    ok(m.c === 'r' && m.n === '后来写的批注', '合并恢复不会用旧备份覆盖之后的修改');
    await p.fill('#restore-ta', code.slice(0, Math.floor(code.length * 0.6)));
    await p.click('#modal [data-s="merge"]');
    ok(/不完整或已损坏/.test(await p.textContent('#restore-msg')), '残缺备份码给出中文提示');
    const bad = 'IRN1.' + Buffer.from(JSON.stringify({ topic: '工业革命（技术的革新）', marks: [1, 2], custom: { 'hl-x': { q: '<img src=x onerror=alert(1)>', a: 'a' } } })).toString('base64');
    await p.fill('#restore-ta', bad);
    await p.click('#modal [data-s="merge"]');
    await p.click('#confirm [data-ok]');
    await p.waitForTimeout(200);
    ok(p._errs.length === 0, '结构错误的备份码不会导致脚本出错');
    // download a copy, reset inside it, reopen: nothing comes back
    await p.evaluate(() => { const S = window.__IRN.S(); S.reviews['s2-2'] = ['2026-11-10']; });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#modal [data-s="dl"]')]);
    const out = path.resolve(__dirname, 'shots/regress-copy.html');
    await dl.saveAs(out);
    await ctx.close();
    const ctx2 = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const q = await open(ctx2, { url: 'file://' + out });
    ok((await marks(q)).length === 1, '下载副本首次打开载入标记');
    ok(await q.evaluate(() => document.querySelector('#s2-2 .uact [data-act="review"]').textContent.includes('复习')), '副本首次打开时小节按钮状态与数据一致');
    await q.click('.tools [data-act="settings"]');
    await q.click('#modal [data-s="reset"]');
    await q.click('#confirm [data-ok]');
    await q.waitForTimeout(300);
    await q.reload(); await q.waitForTimeout(400);
    const st = await q.evaluate(() => { const S = window.__IRN.S(); return Object.keys(S.marks).length + Object.keys(S.reviews).length; });
    ok(st === 0, '在副本里“清除全部学习记录”后重新打开，不会再回来');
    errs.push(...q._errs);
    await ctx2.close();
  }

  console.log('界面细节');
  {
    const ctx = await b.newContext(Object.assign({}, devices['iPhone 13']));
    const p = await open(ctx);
    await colour(p, '使欧洲科技水平飞跃发展', 0, '使欧洲科技水平飞跃发展', 6, '#s2-1', 'y');
    await p.evaluate(() => window.__select('工业革命是约18世纪中叶起', 0, '工业革命是约18世纪中叶起', 6, '#s2-1'));
    await p.waitForSelector('#hl-bar.show');
    const ov = await p.evaluate(() => { const a = document.querySelector('#toast').getBoundingClientRect(), b = document.querySelector('#hl-bar').getBoundingClientRect(); const shown = document.querySelector('#toast').classList.contains('show'); return shown && !(a.bottom < b.top || a.top > b.bottom); });
    ok(!ov, '手机上提示条不压住三色条');
    await p.tap('#hl-bar [data-act="close"]');
    // Esc closes only the top layer (desktop check below)
    await ctx.close();
    const ctx2 = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const d = await open(ctx2);
    await d.click('.tools [data-act="focus"]');
    await d.evaluate(() => window.__select('使欧洲科技水平飞跃发展', 0, '使欧洲科技水平飞跃发展', 6, '#s2-1'));
    await d.waitForSelector('#hl-bar.show');
    await d.keyboard.press('Escape');
    ok(await d.evaluate(() => document.getElementById('app').classList.contains('focus')), 'Esc 只关闭三色条，不退出专注模式');
    ok(await d.isVisible('.focus-tools [data-act="pen"]'), '专注模式下也能打开荧光笔');
    await d.keyboard.press('Escape');
    // [R#] links reach references even when 7.4 is folded
    await d.click('.tab[aria-controls="pane-toc"]').catch(() => {});
    await d.evaluate(() => { document.querySelectorAll('[data-unit]').forEach(u => { if (u.id === 's7-4') u.querySelector('.uact [data-act="fold"]').click(); }); });
    await d.evaluate(() => document.querySelector('#s2-3 a.ref').scrollIntoView({ block: 'center' }));
    await d.click('#s2-3 a.ref');
    await d.waitForTimeout(700);
    ok(await d.evaluate(() => { const t = document.querySelector(document.querySelector('#s2-3 a.ref').getAttribute('href')); const r = t.getBoundingClientRect(); return t.getClientRects().length > 0 && r.top > -10 && r.top < 900; }), '参考资料折叠时点 [R#] 也能展开并跳到条目');
    // notes-off then jump to a note from search
    await d.click('#pane-toc [data-act="notes"]');
    await d.fill('#q', '往复运动是活塞');
    await d.waitForTimeout(500);
    await d.click('#sresults .sr');
    await d.waitForTimeout(700);
    ok(await d.evaluate(() => !document.getElementById('app').classList.contains('notes-off') && !document.querySelector('.search').classList.contains('open')), '补充解释收起时跳到补充注释会自动展开，并关闭搜索下拉');
    // indexes do not start with the legend
    ok(await d.evaluate(() => !/必须掌握的考点、关键词、答题关键/.test(document.querySelector('#ix-key .ix').textContent)), '“重点”索引不再以图例行开头');
    // section mask: nested list items can be revealed
    await d.evaluate(() => document.querySelector('#s3-2-1').scrollIntoView());
    await d.click('#s3-2-1 .uact [data-act="smask"]');
    const nested = await d.evaluate(() => { const li = document.querySelector('#s3-2-1 li li[data-b]'); li.setAttribute('data-t', 'n'); return !!li; });
    await d.click('[data-t="n"]');
    await d.click('[data-t="n"]').catch(() => {});
    ok(nested && await d.evaluate(() => { const li = document.querySelector('[data-t="n"]'); return getComputedStyle(li).color !== 'rgba(0, 0, 0, 0)'; }), '整节遮住时，嵌套列表的子项也能点开');
    // printing with masks lifts them
    await d.click('.tools [data-act="mask-kw"]');
    await d.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    ok(await d.evaluate(() => !document.getElementById('app').classList.contains('mask-kw') && !document.querySelector('.smask')), '打印前自动取消遮挡');
    await d.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    ok(await d.evaluate(() => document.getElementById('app').classList.contains('mask-kw')), '打印后恢复遮挡');
    errs.push(...d._errs);
    await ctx2.close();
  }

  console.log('云端：两台设备');
  {
    const store = {};
    const ctxA = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const ctxB = await b.newContext({ viewport: { width: 1280, height: 860 } });
    for (const ctx of [ctxA, ctxB]) {
      await ctx.exposeFunction('__dbGet', k => store[k] || null);
      await ctx.exposeFunction('__dbSet', (k, v) => { store[k] = v; return true; });
      await ctx.addInitScript(() => {
        const db = { doc: p => ({ get: () => window.__dbGet(p).then(v => ({ exists: !!v, data: () => v, metadata: {} })), set: d => window.__dbSet(p, d).then(() => undefined) }) };
        const user = { id: () => Promise.resolve('u1') };
        window.claude = { use: n => Promise.resolve({ db, user }[n] || null) };
      });
    }
    const A = await open(ctxA), B = await open(ctxB);
    await A.waitForTimeout(500); await B.waitForTimeout(500);
    await colour(A, '使欧洲科技水平飞跃发展', 0, '使欧洲科技水平飞跃发展', 4, '#s2-1', 'y');
    await A.waitForTimeout(2600);
    await colour(B, '工业革命是约18世纪中叶起', 0, '工业革命是约18世纪中叶起', 4, '#s2-1', 'r');
    await B.waitForTimeout(2600);
    const keys = Object.keys(store);
    const st = keys.length ? JSON.parse(store[keys[0]].state) : { marks: {} };
    ok(Object.keys(st.marks).length === 2, '另一台设备写入时先合并，账户里两条标记都在（' + Object.keys(st.marks).length + '）');
    errs.push(...A._errs, ...B._errs);
    await ctxA.close(); await ctxB.close();
  }

  ok(errs.length === 0, '运行中无脚本错误' + (errs.length ? '：' + errs.slice(0, 3).join('; ') : ''));
  await b.close();
  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})();
