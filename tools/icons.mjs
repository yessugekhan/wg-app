// Renders the app icons with headless Chromium so they use the app's own marker font.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const font = (await readFile(join(root, 'node_modules/@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2'))).toString('base64');

// white paper, a strip of black gaffer tape, "WG" in marker, underlined with the red marker
const page = (size, { radius, scale }) => `<!doctype html><html><head><style>
@font-face{font-family:PM;src:url(data:font/woff2;base64,${font}) format('woff2')}
html,body{margin:0;background:transparent}
.i{position:relative;width:${size}px;height:${size}px;border-radius:${radius * size}px;overflow:hidden;background:#fff}
.c{position:absolute;inset:0;transform:scale(${scale})}
.tape{position:absolute;left:-6%;top:9%;width:62%;height:17%;background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,0) 45%),#26262a;transform:rotate(-14deg);clip-path:polygon(0 8%,4% 0,96% 6%,100% 0,97% 52%,100% 100%,4% 94%,0 100%,3% 50%)}
.t{position:absolute;left:0;right:0;top:27%;text-align:center;font-family:PM;font-size:${size * 0.44}px;line-height:1;color:#17171b;transform:rotate(-4deg)}
svg{position:absolute;left:16%;top:69%;width:68%;height:14%;overflow:visible}
</style></head><body><div class="i"><div class="c"><div class="tape"></div><div class="t">WG</div>
<svg viewBox="0 0 200 40" preserveAspectRatio="none" fill="none"><path d="M4 26 C 50 12, 100 30, 140 18 S 186 20, 196 14" stroke="#d62a1e" stroke-width="10" stroke-linecap="round"/></svg>
</div></div></body></html>`;

const targets = [
  ['icon-192.png', 192, { radius: 0.22, scale: 1 }],
  ['icon-512.png', 512, { radius: 0.22, scale: 1 }],
  ['icon-maskable-512.png', 512, { radius: 0, scale: 0.8 }],
  ['apple-touch-icon.png', 180, { radius: 0, scale: 0.94 }],
  ['favicon-32.png', 32, { radius: 0.18, scale: 1.1 }],
];

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--no-zygote', '--headless=shell'],
});
const tab = await browser.newPage();
for (const [name, size, opts] of targets) {
  await tab.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await tab.setContent(page(size, opts), { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: join(root, 'public/icons', name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}
await browser.close();
