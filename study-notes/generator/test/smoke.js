// node test/smoke.js  -> screenshots + console errors for the built page
const { chromium, devices } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '../dist/工业革命（技术的革新）.html');
const OUT = path.resolve(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const configs = [
    { name: 'desk-light', viewport: { width: 1440, height: 900 }, scheme: 'light' },
    { name: 'desk-dark', viewport: { width: 1440, height: 900 }, scheme: 'dark' },
    { name: 'ipad', device: devices['iPad (gen 7)'], scheme: 'light' },
    { name: 'phone', device: devices['iPhone 13'], scheme: 'light' },
    { name: 'phone-dark', device: devices['iPhone 13'], scheme: 'dark' },
  ];
  const only = process.argv[2];
  for (const c of configs) {
    if (only && !c.name.startsWith(only)) continue;
    const ctx = await b.newContext(Object.assign({}, c.device || { viewport: c.viewport, deviceScaleFactor: 1 }, { colorScheme: c.scheme }));
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.goto(FILE);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/${c.name}-top.png` });
    const overflow = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    for (const id of (process.argv[3] || 's2-3,s3-2-4').split(',')) {
      await p.evaluate(id => { const e = document.getElementById(id); if (e) e.scrollIntoView({ block: 'start' }); }, id);
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}/${c.name}-${id}.png` });
    }
    console.log(c.name, 'overflow', JSON.stringify(overflow), errs.length ? errs : 'no errors');
    await ctx.close();
  }
  await b.close();
})();
