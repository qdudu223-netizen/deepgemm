// Visual spot checks after the QA fixes.
const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(__dirname, '../dist/法国大革命及其历史意义.html');
const SHOT = '/tmp/claude-0/-home-user-deepgemm/6e1807bd-796a-562f-95f3-008ab9433b1b/scratchpad/v2';
require('fs').mkdirSync(SHOT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const shots = [
    [1920, 1080, 'light', 's3-8-1', 'w1920-table'],
    [1440, 900, 'light', 's3-3', 'w1440-s33'],
    [1180, 820, 'light', 'c3', 'w1180-chap'],
    [1440, 900, 'dark', 's3-1', 'w1440-dark-hl'],
    [390, 844, 'light', 's4-5', 'w390-table'],
  ];
  for (const [w, h, scheme, target, name] of shots) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.goto(file); await p.waitForTimeout(500);
    if (name.includes('hl')) {
      for (const [c, a, b] of [['blue', '18世纪末', '政治革命则在法国爆发'], ['yellow', '16世纪，法国曾爆发', '巩固王权'], ['red', '到路易十六在位', '社会矛盾积压已久']]) {
        await p.evaluate(([a, b]) => {
          const root = document.getElementById('s3-1'); const nodes = [], starts = []; let j = ''; const wk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
          while ((n = wk.nextNode())) { nodes.push(n); starts.push(j.length); j += n.nodeValue; }
          const at = pos => { let i = nodes.length - 1; while (i > 0 && starts[i] > pos) i--; return [nodes[i], pos - starts[i]]; };
          const i0 = j.indexOf(a), i1 = j.indexOf(b, i0) + b.length; const s = at(i0), e = at(i1 - 1);
          const r = document.createRange(); r.setStart(s[0], s[1]); r.setEnd(e[0], e[1] + 1); getSelection().removeAllRanges(); getSelection().addRange(r);
        }, [a, b]);
        await p.waitForTimeout(250); await p.click('#hl-bar .pen.c-' + c); await p.waitForTimeout(150);
      }
    }
    await p.evaluate(t => { const el = document.getElementById(t); el.scrollIntoView(); window.scrollBy(0, -70); }, target);
    await p.waitForTimeout(400);
    await p.screenshot({ path: SHOT + '/' + name + '.png' });
    await ctx.close();
  }
  await browser.close();
})();
