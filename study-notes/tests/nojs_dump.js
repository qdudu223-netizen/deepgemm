// Render with JavaScript disabled; dump the original-text view and a screenshot.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const file = 'file://' + path.resolve(__dirname, '../dist/法国大革命及其历史意义.html');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 820, height: 1180 } });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(file);
  const info = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== 'none' && r.height > 0; };
    const banner = document.querySelector('.nojs-banner');
    const hiddenOriginal = [...document.querySelectorAll('#doc .answer-body, #doc .mm-src, #doc strong.cloze, #doc td.cloze-cell, #doc .folio-body')].filter(e => !vis(e)).length;
    const clone = document.getElementById('doc').cloneNode(true);
    clone.querySelectorAll('[data-supp], .js-only, .stamp, .folio-cote, .chap-numeral, .doc-kicker, .mindmap, .is-concl-label').forEach(e => e.remove());
    // remove CSS-generated labels: none are in DOM
    return { banner: banner && vis(banner) ? banner.textContent : null, hiddenOriginal, text: clone.textContent, links: [...document.querySelectorAll('#doc a.ext-link')].map(a => a.href) };
  });
  fs.writeFileSync(path.resolve(__dirname, 'out_nojs.json'), JSON.stringify(info));
  await page.screenshot({ path: '/tmp/claude-0/-home-user-deepgemm/6e1807bd-796a-562f-95f3-008ab9433b1b/scratchpad/nojs-ipad.png' });
  console.log('banner visible:', !!info.banner, '| hidden original blocks:', info.hiddenOriginal, '| links:', info.links.length, '| text chars:', info.text.length);
  await browser.close();
})();
