// Renders the app icons with headless Chromium so they use the app's own typeface.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const font = (await readFile(join(root, 'node_modules/@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2'))).toString('base64');

const page = (size, { radius, scale }) => `<!doctype html><html><head><style>
@font-face{font-family:A;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800}
html,body{margin:0;background:transparent}
.i{width:${size}px;height:${size}px;border-radius:${radius * size}px;background:#ffe14a;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:A}
.c{transform:scale(${scale});display:flex;flex-direction:column;align-items:center}
.t{font-weight:800;font-size:${size * 0.4}px;line-height:.9;letter-spacing:-.035em;color:#1d2127;margin-top:${size * 0.02}px}
.d{display:flex;gap:${size * 0.035}px;margin-top:${size * 0.075}px}
.d span{width:${size * 0.105}px;height:${size * 0.105}px;border-radius:50%;box-shadow:inset 0 -${size * 0.008}px 0 rgba(0,0,0,.2)}
</style></head><body><div class="i"><div class="c"><div class="t">WG</div><div class="d"><span style="background:#d14632"></span><span style="background:#2f6bd8"></span><span style="background:#19804f"></span></div></div></div></body></html>`;

const targets = [
  ['icon-192.png', 192, { radius: 0.22, scale: 1 }],
  ['icon-512.png', 512, { radius: 0.22, scale: 1 }],
  ['icon-maskable-512.png', 512, { radius: 0, scale: 0.78 }],
  ['apple-touch-icon.png', 180, { radius: 0, scale: 0.92 }],
  ['favicon-32.png', 32, { radius: 0.22, scale: 1.08 }],
];

const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
const tab = await browser.newPage();
for (const [name, size, opts] of targets) {
  await tab.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await tab.setContent(page(size, opts), { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: join(root, 'public/icons', name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}
await browser.close();
