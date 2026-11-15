// Final visual spot check: phone section, timeline, flashcard dialog; desktop dark overview.
const { chromium, devices } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(__dirname, '../dist/法国大革命及其历史意义.html');
const SHOT = '/tmp/claude-0/-home-user-deepgemm/6e1807bd-796a-562f-95f3-008ab9433b1b/scratchpad/final';
require('fs').mkdirSync(SHOT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.goto(file); await p.waitForTimeout(500);
  await p.evaluate(() => { const f = [...document.querySelectorAll('.fig')].find(x => x.textContent.includes('革命下动荡的法国')); f.scrollIntoView(); window.scrollBy(0, -60); });
  await p.waitForTimeout(300); await p.screenshot({ path: SHOT + '/phone-timeline.png' });
  await p.tap('#bottombar [data-tool="flash"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: SHOT + '/phone-flash.png' });
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const q = await c2.newPage(); await q.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await q.goto(file); await q.waitForTimeout(500);
  await q.evaluate(() => { document.getElementById('overview').scrollIntoView(); window.scrollBy(0, -70); });
  await q.waitForTimeout(300); await q.screenshot({ path: SHOT + '/desk-dark-overview.png' });
  await browser.close();
})();
