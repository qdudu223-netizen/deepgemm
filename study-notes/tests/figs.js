// Screenshot every supplement figure at desktop and phone width; report horizontal overflow.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const file = 'file://' + path.resolve(__dirname, '../dist/法国大革命及其历史意义.html');
const SHOT = '/tmp/claude-0/-home-user-deepgemm/6e1807bd-796a-562f-95f3-008ab9433b1b/scratchpad/figs';
fs.mkdirSync(SHOT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const sizes = [['d', { width: 1280, height: 900 }], ['m', { width: 390, height: 844 }]];
  for (const [tag, vp] of sizes) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(file);
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('.answer').forEach(a => a.classList.add('open')));
    const figs = await page.$$('#doc figure.fig, #doc aside.mnemo');
    const report = [];
    for (let i = 0; i < figs.length; i++) {
      const f = figs[i];
      const info = await f.evaluate(el => {
        const body = el.querySelector('.fig-body') || el;
        return { title: (el.querySelector('.fig-title, .mn-title') || {}).textContent, sw: body.scrollWidth, cw: body.clientWidth };
      });
      report.push(info);
      if (tag === 'd' || info.sw > info.cw) await f.screenshot({ path: SHOT + '/' + tag + '-' + String(i).padStart(2, '0') + '.png' });
    }
    console.log(tag + ':\n' + report.map((r, i) => i + ' ' + r.title + ' [' + r.sw + '/' + r.cw + ']').join('\n'));
    await ctx.close();
  }
  await browser.close();
})();
