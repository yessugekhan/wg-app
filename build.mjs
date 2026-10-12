// Builds the GitHub Pages site into docs/ and a single-file demo into dist/preview.html.
// Usage: node build.mjs [--serve]

import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, copyFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = dirname(new URL(import.meta.url).pathname);
const out = join(root, 'docs');
const dist = join(root, 'dist');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const version = `${pkg.version}+${stamp}`;
const fs = (pkg, file) => join(root, 'node_modules/@fontsource', pkg, 'files', file);
const ah = (sub, w) => fs('atkinson-hyperlegible-next', `atkinson-hyperlegible-next-${sub}-${w}-normal.woff2`);
// key in styles.css (__FONT:key__) -> font file. Text: Atkinson Hyperlegible Next, headlines: Shantell Sans.
const FONTS = {
  hand: fs('shantell-sans', 'shantell-sans-latin-700-normal.woff2'),
  handx: fs('shantell-sans', 'shantell-sans-latin-ext-700-normal.woff2'),
  ui400: ah('latin', 400),
  ui400x: ah('latin-ext', 400),
  ui600: ah('latin', 600),
  ui600x: ah('latin-ext', 600),
  ui700: ah('latin', 700),
  ui700x: ah('latin-ext', 700),
};
const PRELOAD = ['hand', 'ui400'];
// key in styles.css (__IMG:key__) -> image file (drawn by tools/doodles.mjs)
const IMAGES = {
  'doodles-light': join(root, 'public/doodles-light.svg'),
  'doodles-dark': join(root, 'public/doodles-dark.svg'),
};
const fontName = (key) => FONTS[key].split('/').pop();
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

const common = {
  entryPoints: [join(root, 'src/main.jsx')],
  bundle: true,
  minify: true,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  target: ['es2020', 'safari15'],
  legalComments: 'none',
  logLevel: 'warning',
};

async function css(urlFor, imgFor) {
  let raw = await readFile(join(root, 'src/styles.css'), 'utf8');
  raw = raw.replace(/__FONT:([a-z0-9]+)__/g, (_, key) => {
    if (!FONTS[key]) throw new Error(`unknown font ${key}`);
    return urlFor(key);
  });
  raw = raw.replace(/__IMG:([a-z0-9-]+)__/g, (_, key) => {
    if (!IMAGES[key]) throw new Error(`unknown image ${key}`);
    return imgFor(key);
  });
  const { code } = await esbuild.transform(raw, { loader: 'css', minify: true, target: ['safari15', 'chrome100'] });
  return code;
}

async function buildSite() {
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, 'assets/fonts'), { recursive: true });
  await mkdir(join(out, 'icons'), { recursive: true });

  const result = await esbuild.build({
    ...common,
    format: 'esm',
    splitting: true,
    outdir: join(out, 'assets'),
    entryNames: '[name]-[hash]',
    chunkNames: 'chunk-[hash]',
    metafile: true,
    define: { __PREVIEW__: 'false', __VERSION__: JSON.stringify(version) },
  });
  const jsFiles = Object.keys(result.metafile.outputs).map((p) => p.replace(/^.*docs\//, ''));
  const entry = jsFiles.find((f) => /assets\/main-.*\.js$/.test(f));

  for (const key of Object.keys(FONTS)) await copyFile(FONTS[key], join(out, 'assets/fonts', fontName(key)));
  const images = {};
  for (const [key, file] of Object.entries(IMAGES)) {
    const buf = await readFile(file);
    images[key] = `${key}-${hash(buf)}.svg`;
    await writeFile(join(out, 'assets', images[key]), buf);
  }
  const cssCode = await css((key) => `./fonts/${fontName(key)}`, (key) => `./${images[key]}`);
  const cssName = `assets/app-${hash(cssCode)}.css`;
  await writeFile(join(out, cssName), cssCode);

  const icons = join(root, 'public/icons');
  for (const f of await readdir(icons)) await copyFile(join(icons, f), join(out, 'icons', f));
  for (const f of ['manifest.webmanifest', 'manifest-ios.webmanifest']) await copyFile(join(root, 'public', f), join(out, f));
  // config.js is the one file people edit by hand; keep theirs
  await copyFile(join(root, 'public/config.js'), join(out, 'config.js'));
  await writeFile(join(out, '.nojekyll'), '');

  const html = (await readFile(join(root, 'public/index.html'), 'utf8'))
    .replace('__CSS__', `./${cssName}`)
    .replace('__JS__', `./${entry}`)
    .replace('__FONT_PRELOAD_1__', `./assets/fonts/${fontName(PRELOAD[0])}`)
    .replace('__FONT_PRELOAD_2__', `./assets/fonts/${fontName(PRELOAD[1])}`)
    .replace('__VERSION__', version);
  await writeFile(join(out, 'index.html'), html);

  const precache = ['./', './index.html', './config.js', `./${cssName}`, ...jsFiles.filter((f) => f.endsWith('.js')).map((f) => `./${f}`),
    ...Object.keys(FONTS).map((key) => `./assets/fonts/${fontName(key)}`), ...Object.values(images).map((f) => `./assets/${f}`),
    './manifest.webmanifest', './icons/icon-192.png'];
  const sw = (await readFile(join(root, 'src/sw.js'), 'utf8'))
    .replace('__VERSION__', version)
    .replace('__PRECACHE__', JSON.stringify(precache));
  await writeFile(join(out, 'sw.js'), sw);

  const sizes = {};
  for (const f of jsFiles) sizes[f] = (await stat(join(out, f))).size;
  return { version, entry, cssName, sizes };
}

async function buildPreview() {
  await mkdir(dist, { recursive: true });
  const result = await esbuild.build({
    ...common,
    format: 'iife',
    write: false,
    define: { __PREVIEW__: 'true', __VERSION__: JSON.stringify(version) },
  });
  const js = result.outputFiles[0].text;
  if (js.includes('firestore.googleapis.com')) throw new Error('preview bundle must not contain Firebase');
  const b64 = {};
  for (const key of Object.keys(FONTS)) b64[key] = `data:font/woff2;base64,${(await readFile(FONTS[key])).toString('base64')}`;
  const img = {};
  for (const [key, file] of Object.entries(IMAGES)) img[key] = `data:image/svg+xml;base64,${(await readFile(file)).toString('base64')}`;
  // the artifact frame already pads the page by the safe areas, so the sticky bar must not add them again
  const frameCss = '.topbar{top:env(safe-area-inset-top,0px);padding-top:0}.app{min-height:100%}';
  const cssCode = (await css((key) => b64[key], (key) => img[key])) + frameCss;
  const page = `<title>WG-App Demo</title>
<meta name="description" content="Einkaufsliste, Geld, Putzplan und Pinnwand für eine WG, als Demo auf diesem Gerät.">
<style>${cssCode}</style>
<div id="app"></div>
<script>window.WG_CONFIG={firebase:null};</script>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
  await writeFile(join(dist, 'preview.html'), page);
  return { bytes: Buffer.byteLength(page) };
}

const site = await buildSite();
const preview = await buildPreview();
console.log(JSON.stringify({ site, preview }, null, 2));
