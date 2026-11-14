const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(__dirname, '../dist/法国大革命及其历史意义.html');
const out = process.argv[2] || '/tmp/claude-0/-home-user-deepgemm/6e1807bd-796a-562f-95f3-008ab9433b1b/scratchpad';
(async () => {
  const browser = await chromium.launch();
  for (const [name, vp, scheme] of [['desk', { width: 1440, height: 900 }, 'light'], ['desk-dark', { width: 1440, height: 900 }, 'dark'], ['ipad', { width: 820, height: 1180 }, 'light'], ['phone', { width: 390, height: 844 }, 'light']]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(file);
    await page.waitForTimeout(800);
    const ready = await page.evaluate(() => document.getElementById('fr-root').getAttribute('data-ready'));
    await page.screenshot({ path: `${out}/${name}-top.png` });
    await page.evaluate(() => document.getElementById('s3-3').scrollIntoView());
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}-s33.png` });
    console.log(name, 'ready=', ready, 'errors:', errs.length ? errs : 'none');
    await ctx.close();
  }
  await browser.close();
})();
