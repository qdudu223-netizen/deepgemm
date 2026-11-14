// usage: node harness.js D5   -> renders figs/D5.html at 720px & 390px, light & dark, into figs/shots/
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const id = process.argv[2];
const dir = __dirname;
const css = fs.readFileSync(path.join(dir, '../tpl/tokens.css'), 'utf8') + fs.readFileSync(path.join(dir, '../tpl/diagram.css'), 'utf8');
const frag = fs.readFileSync(path.join(dir, id + '.html'), 'utf8');
const page = (theme) => `<!doctype html><html lang="zh-Hans" data-ir-theme="${theme}"><head><meta charset="utf-8"><style>${css}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--f-sans);font-size:17px;line-height:1.75}
.col{max-width:680px;margin:0 auto;padding:16px}</style></head><body><div class="col">${frag}</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const theme of ['light', 'dark']) for (const w of [720, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.setContent(page(theme));
    const out = path.join(dir, 'shots', `${id}-${theme}-${w}.png`);
    await p.screenshot({ path: out, fullPage: true });
    // detect svg text overflowing the viewBox
    const info = await p.evaluate(() => {
      const res = [];
      document.querySelectorAll('svg.dg').forEach(svg => {
        const vb = svg.viewBox.baseVal;
        svg.querySelectorAll('text').forEach(t => { const bb = t.getBBox(); if (bb.x < vb.x - 1 || bb.y < vb.y - 1 || bb.x + bb.width > vb.x + vb.width + 1 || bb.y + bb.height > vb.y + vb.height + 1) res.push('text outside viewBox: ' + t.textContent.slice(0, 30)); });
      });
      return res;
    });
    info.forEach(x => errs.push(`[${theme} ${w}] ${x}`));
    console.log('wrote', out);
    await p.close();
  }
  await b.close();
  if (errs.length) { console.log('PROBLEMS:'); errs.forEach(e => console.log('  ' + e)); } else console.log('no problems detected');
})();
