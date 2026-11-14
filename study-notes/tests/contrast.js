// Contrast audit: every visible text-bearing element in #doc and the app chrome, light and dark.
const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(__dirname, '../dist/法国大革命及其历史意义.html');
(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.goto(file); await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelectorAll('.answer').forEach(a => a.classList.add('open')));
    const res = await p.evaluate(() => {
      const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(',').map(x => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
      const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
      const bgOf = el => {
        const layers = [];
        for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
        let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
        for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);
        return base;
      };
      const out = {};
      const els = [...document.querySelectorAll('#doc *, #topbar *, #sidebar *, #bottombar *')];
      for (const el of els) {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        const own = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
        if (!own) continue;
        if (el.closest('mark.hl, .stamp, .mk, svg, .chap-numeral, .fc-card')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || +cs.opacity < 0.5) continue;
        const fg = parse(cs.color); if (!fg || fg.a === 0) continue;
        const bg = bgOf(el);
        const f2 = fg.a < 1 ? blend(fg, bg) : fg;
        const L1 = lum(f2), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (ratio < 4.5) {
          const key = (el.className && typeof el.className === 'string' ? el.tagName + '.' + el.className.split(' ')[0] : el.tagName) + ' ' + cs.color;
          if (!out[key]) out[key] = { n: 0, ratio: Math.round(ratio * 100) / 100, sample: el.textContent.trim().slice(0, 24) };
          out[key].n++;
        }
      }
      return out;
    });
    console.log('==', scheme, Object.keys(res).length ? res : 'all text ≥ 4.5:1');
    await ctx.close();
  }
  await browser.close();
})();
