// Bundles test/firestore-harness.js with the real Firebase SDK and runs it in headless Chromium.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import * as esbuild from 'esbuild';
import http from 'node:http';
import { join, dirname } from 'node:path';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const { outputFiles } = await esbuild.build({
  entryPoints: [join(root, 'test/firestore-harness.js')], bundle: true, write: false, format: 'iife', target: 'es2020',
});
const js = outputFiles[0].text;
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/h.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js); }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><meta charset=utf-8><script src="/h.js"></script>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--no-zygote', '--disable-dev-shm-usage', '--headless=shell'],
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: 'load' });
const out = await page.evaluate(() => window.runHarness());
await browser.close();
server.close();
let failed = 0;
for (const c of out.checks) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.ok ? '' : `  -> ${JSON.stringify(c.detail)}`}`);
  if (!c.ok) failed++;
}
console.log('rejected commits:', out.errors, 'listener errors:', out.listenerErrors, 'page errors:', consoleErrors);
console.log(failed ? `${failed} FAILED` : `ALL ${out.checks.length} FIRESTORE CHECKS OK (offline, local cache)`);
process.exit(failed ? 1 : 0);
