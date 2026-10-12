// End-to-end run in headless Chromium at phone size, against the built site in docs/ (demo mode).
// Usage: node test/e2e.mjs <screenshot-dir>
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import assert from 'node:assert/strict';
import { computeSummary, summariesEqual, summaryOf, formatMoney, debtList } from '../src/model.js';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const shots = process.argv[2] || join(root, 'shots');
await mkdir(shots, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
// The built site carries the real Firebase config; the walkthrough runs it in demo mode,
// except under /live/, which serves the real config to check the join and connect screens.
const DEMO_CONFIG = 'window.WG_CONFIG = { firebase: null };';
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const live = p.startsWith('/live/');
  if (live) p = p.slice(5);
  if (p === '/config.js' && !live) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(DEMO_CONFIG);
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(root, 'docs', p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/`;

// sparticuz's Lambda flags include --single-process and --disable-web-security; a normal multi-process browser is closer to a phone
const ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--no-zygote', '--disable-dev-shm-usage', '--font-render-hinting=none',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--in-process-gpu', '--headless=shell'];
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: ARGS, headless: true });
const problems = [];
const NBSP = ' ';
let step = 0;
const log = (m) => console.log(`${String(++step).padStart(2, '0')} ${m}`);

async function phone(ctx, { width = 390, height = 844, dark = false } = {}) {
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateTimezone('Europe/Berlin');
  if (dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
  return page;
}

const textOf = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/[ \t\n\r]+/g, ' ').trim());
async function byText(page, selector, text, { exact = false, timeout = 4000 } = {}) {
  const handle = await page.waitForFunction(
    (selector, text, exact) =>
      [...document.querySelectorAll(selector)].find((e) => {
        const t = e.textContent.replace(/\s+/g, ' ').trim();
        return (exact ? t === text : t.includes(text)) && e.offsetParent !== null;
      }),
    { timeout, polling: 100 },
    selector,
    text,
    exact,
  );
  return handle.asElement();
}
// center the element first: fixed bars (tab bar, sticky input) would otherwise catch the tap
async function tap(el) {
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }));
  await new Promise((r) => setTimeout(r, 60));
  await el.click();
}
const click = async (page, selector, text, opts) => tap(await byText(page, selector, text, opts));
const headline = (page) => textOf(page, '.headline h1');
async function waitHeadline(page, expected, timeout = 8000) {
  // interval polling: requestAnimationFrame is throttled in pages that are not in front
  await page.waitForFunction((t) => document.querySelector('.headline h1')?.textContent.includes(t), { timeout, polling: 100 }, expected).catch(async () => {
    throw new Error(`headline: expected "${expected}", got "${await headline(page).catch(() => '-')}"`);
  });
}
async function shot(page, name) {
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: join(shots, `${name}.png`) });
}
async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(o <= 0, `${label}: horizontal overflow ${o}px`);
}
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wgapp:demo') || '{}'));
// the Geld headline, worked out from the per-person debts the same way the app words it
function moneyHead(me, pairs, nameOf) {
  const list = debtList(pairs);
  const owe = list.filter((d) => d.from === me);
  const get = list.filter((d) => d.to === me);
  const sum = (l) => l.reduce((a, d) => a + d.amount, 0);
  if (owe.length === 1) return `Du schuldest ${nameOf(owe[0].to)} ${formatMoney(owe[0].amount)}.`;
  if (owe.length === 2) return `Du schuldest ${nameOf(owe[0].to)} ${formatMoney(owe[0].amount)} und ${nameOf(owe[1].to)} ${formatMoney(owe[1].amount)}.`;
  if (owe.length > 2) return `Du schuldest ${owe.length} Leuten zusammen ${formatMoney(sum(owe))}.`;
  if (get.length === 1) return `${nameOf(get[0].from)} schuldet dir ${formatMoney(get[0].amount)}.`;
  if (get.length > 1) return `Du bekommst ${formatMoney(sum(get))} von ${get.length} Leuten.`;
  return 'Du bist mit allen quitt.';
}
async function typeInto(page, selector, text) {
  const el = await page.waitForSelector(selector, { visible: true });
  await el.evaluate((e) => (e.focus(), e.select()));
  await el.type(text);
}

try {
  // ------------------------------------------------------------------ demo WG
  const ctx = await browser.createBrowserContext();
  const page = await phone(ctx);
  await page.goto(base, { waitUntil: 'networkidle0' });
  await waitHeadline(page, 'Probier die WG-App aus.');
  await shot(page, '01-start');
  await click(page, 'button', 'Beispiel-WG ansehen');
  await waitHeadline(page, 'Wer bist du?');
  const names = await page.$$eval('.who-btn', (els) => els.map((e) => e.textContent.trim()));
  assert.deepEqual(names, ['AAnna', 'BBen', 'CClara', 'DDeniz']);
  await shot(page, '02-who');
  await click(page, '.who-btn', 'Anna');
  await waitHeadline(page, '5 Sachen fehlen.');
  log('demo seeded, picked Anna, list shows 5 missing');
  await shot(page, '03-liste');
  await noOverflow(page, 'liste');

  // add an item, duplicate is refused, Kasse guess works
  await typeInto(page, '.adder input', 'Käse');
  assert.equal(await page.$eval('.kasse-toggle', (e) => e.getAttribute('aria-pressed')), 'false');
  await page.keyboard.press('Enter');
  await waitHeadline(page, '6 Sachen fehlen.');
  await typeInto(page, '.adder input', 'Müllbeutel');
  assert.equal(await page.$eval('.kasse-toggle', (e) => e.getAttribute('aria-pressed')), 'true', 'Kasse guessed');
  await page.keyboard.press('Enter');
  await waitHeadline(page, '7 Sachen fehlen.');
  await typeInto(page, '.adder input', 'klopapier');
  await page.keyboard.press('Enter');
  await byText(page, '.toast', 'steht schon auf der Liste');
  await waitHeadline(page, '7 Sachen fehlen.');
  log('adding items, Kasse guess and duplicate check work');

  // shopping: tick three items into the basket and finish the trip
  for (const t of ['Brot', 'Spülmittel', 'Käse']) await tap(await page.$(`button[aria-label="${t} abhaken"]`));
  await page.waitForSelector('.checkout-bar', { visible: true });
  await waitHeadline(page, '4 Sachen fehlen.');
  const sub = await textOf(page, '.headline__sub');
  assert.ok(sub.includes('Du hast 3 Sachen abgehakt.'), sub);
  assert.equal(await page.$$eval('.item.is-mine .strike', (e) => e.length), 3, 'crossed off in place');
  await shot(page, '04-korb');
  await click(page, 'button', 'Einkauf abschließen');
  await byText(page, '.sheet h2', 'Einkauf abschließen');
  const moneyInputs = await page.$$('.sheet .money input');
  assert.equal(moneyInputs.length, 2, 'Kasse group and shared group');
  await moneyInputs[0].type('2,49');
  await moneyInputs[1].type('7,30');
  await shot(page, '05-checkout');
  await click(page, '.sheet__foot button', 'Abschließen');
  await byText(page, '.toast', 'Einkauf abgeschlossen, 9,79');
  await waitHeadline(page, '4 Sachen fehlen.');
  // the purchase history shows the trip: who, when, what, how much
  const trip = await byText(page, '.buy', 'Käse');
  const tripText = await trip.evaluate((e) => e.textContent);
  for (const part of ['Brot', 'Spülmittel', 'Du, heute', `2,49${NBSP}€ aus der Kasse`, `7,30${NBSP}€`]) assert.ok(tripText.includes(part), `${part} in "${tripText}"`);
  assert.ok((await textOf(page, '.week__head')).startsWith('Diese Woche'), 'history starts with this week');
  // something bought without the list: straight into the expense form on the Geld tab
  await click(page, '.link-btn', 'Einkauf eintragen');
  await byText(page, '.sheet h2', 'Neue Buchung');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.sheet'), { timeout: 4000 });
  log('checkout created two bookings (Kasse 2,49 and shared 7,30), history lists the trip, "Einkauf eintragen" opens the form');

  let s = await state(page);
  const txList = () => Object.values(s.tx || {});
  assert.ok(summariesEqual(summaryOf(s.meta.summary), computeSummary(txList())), 'running summary equals recomputed one');
  const ids = Object.fromEntries(Object.entries(s.members).map(([id, m]) => [m.name, id]));
  const kasseBefore = 1250 - 685 + 3000;
  assert.equal(s.meta.summary.kasse, kasseBefore - 249, 'Kasse after checkout');

  // ------------------------------------------------------------------ money
  await click(page, '.tab', 'Geld');
  const nameOf = (id) => s.members[id].name;
  const debts = debtList(s.meta.summary.pairs);
  await waitHeadline(page, moneyHead(ids.Anna, s.meta.summary.pairs, nameOf));
  const kasseShown = await textOf(page, '.kasse__amount');
  assert.equal(kasseShown, formatMoney(kasseBefore - 249));
  const contribLine = await textOf(page, '.contrib__line');
  assert.ok(contribLine.includes('3 von 4'), contribLine);
  assert.equal(await page.$$eval('.debt', (r) => r.length), debts.length, 'one row per open debt');
  // Clara's oven gloves (demo): Anna's share shows up as the reason in the Clara row
  const claraRow = await byText(page, '.debt', 'Clara');
  log(`Geld headline "${await headline(page)}", ${debts.length} open debts, Kasse ${kasseShown}, 3 von 4 Beiträge`);
  await shot(page, '06-geld');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, '07-geld-verlauf');
  await page.evaluate(() => window.scrollTo(0, 0));
  await noOverflow(page, 'geld');

  // a debt explains itself: the bookings behind it add up to the open amount
  await tap(await claraRow.$('.debt__main'));
  await byText(page, '.sheet h2', 'Clara');
  const reasons = await page.$$eval('.sheet .reason__title', (e) => e.map((x) => x.textContent));
  assert.ok(reasons.includes('Ofenhandschuhe'), reasons.join(' | '));
  const claraDebt = debts.find((d) => (d.from === ids.Clara && d.to === ids.Anna) || (d.from === ids.Anna && d.to === ids.Clara));
  assert.equal(await textOf(page, '.sheet .reasons__total .amount'), formatMoney(claraDebt.amount));
  await shot(page, '07b-schuld');
  await page.keyboard.press('Escape');

  // settle every debt person to person; everything must reach zero
  for (let i = 0; i < 12 && (await page.$('.debt .btn')); i++) {
    const n = await page.$$eval('.debt .btn', (b) => b.length);
    await tap(await page.$('.debt .btn'));
    await page.waitForSelector('.sheet h2', { visible: true });
    await click(page, '.sheet__foot button', 'Eintragen');
    await page.waitForFunction((n) => document.querySelectorAll('.debt .btn').length < n, { timeout: 4000 }, n);
  }
  await waitHeadline(page, 'Du bist mit allen quitt.');
  s = await state(page);
  assert.ok(Object.values(s.meta.summary.balances).every((v) => v === 0), 'all balances zero after settling');
  assert.deepEqual(debtList(s.meta.summary.pairs), [], 'nobody owes anybody');
  assert.ok(debts.some((d) => d.from === 'kasse'), 'the demo has money laid out for the Kasse');
  log(`settled ${debts.length} debts person to person and from the Kasse, everyone at 0`);

  // manual expense with the FAB, split between two people
  await (await page.$('.fab')).click();
  await byText(page, '.sheet h2', 'Neue Buchung');
  await new Promise((r) => setTimeout(r, 300));
  await typeInto(page, '.sheet input.input[type=text]', 'Pizza');
  await (await page.$('.sheet .money input')).type('20');
  // "Für wen?": keep only Anna (Ich) and Ben
  for (const n of ['Clara', 'Deniz']) await click(page, '.sheet .field[aria-label="Für wen?"] .person', n);
  const hint = await textOf(page, '.sheet .field__hint');
  assert.equal(hint, `10,00${NBSP}€ pro Person`);
  const owesHint = await page.$$eval('.sheet .field__hint', (e) => e.map((x) => x.textContent));
  assert.ok(owesHint.includes(`Danach bekommst du von Ben 10,00${NBSP}€.`), owesHint.join(' | '));
  await click(page, '.sheet__foot button', 'Speichern');
  await waitHeadline(page, `Ben schuldet dir 10,00${NBSP}€.`);
  assert.equal(await textOf(page, '.debt__why'), 'für Pizza');
  log('manual expense: Ben owes Anna 10,00 € for Pizza');

  // deposit for the current month by Deniz -> 4 von 4
  await (await page.$('.fab')).click();
  await click(page, '.sheet .seg__opt', 'Einzahlung');
  await click(page, '.sheet .field[aria-label="Wer zahlt ein?"] .person', 'Deniz');
  assert.equal(await page.$eval('.sheet .money input', (e) => e.value), '10,00');
  await click(page, '.sheet__foot button', 'Speichern');
  await page.waitForFunction(() => document.querySelector('.contrib__line')?.textContent.includes('4 von 4'), { timeout: 4000 });
  const titles = await page.$$eval('.tx__title', (e) => e.map((x) => x.textContent));
  assert.ok(titles.filter((t) => /^Beitrag [A-Z][a-zä]+$/.test(t)).length >= 4, titles.join(' | '));
  log('deposit: all 4 paid this month, listed as "Beitrag <Monat>"');

  // open a booking, edit it, delete it
  const openTx = async (title) =>
    (await page.evaluateHandle((t) => [...document.querySelectorAll('.tx__title')].find((e) => e.textContent === t)?.closest('button'), title)).asElement().evaluate((e) => e.click());
  await openTx('Pizza');
  await byText(page, '.sheet .receipt__total', '20,00');
  await shot(page, '08-beleg');
  await click(page, '.sheet__foot button', 'Bearbeiten');
  await byText(page, '.sheet h2', 'Ausgabe bearbeiten');
  await new Promise((r) => setTimeout(r, 300)); // let the sheet's autofocus settle before typing
  const amt = await page.$('.sheet .money input');
  await amt.evaluate((e) => (e.focus(), e.select()));
  await amt.type('30');
  assert.equal(await amt.evaluate((e) => e.value), '30');
  await click(page, '.sheet__foot button', 'Speichern');
  await waitHeadline(page, `Ben schuldet dir 15,00${NBSP}€.`);
  await openTx('Pizza');
  await click(page, '.sheet__foot button', 'Löschen');
  await click(page, '.sheet__foot button', 'Löschen');
  await waitHeadline(page, 'Du bist mit allen quitt.');
  s = await state(page);
  assert.ok(summariesEqual(summaryOf(s.meta.summary), computeSummary(Object.values(s.tx))));
  log('edit and delete keep the books exact');

  // laid out for the Kasse: the Kasse (kept by Ben) owes Anna until Ben pays her back
  const kasseNow = (await state(page)).meta.summary.kasse;
  await (await page.$('.fab')).click();
  await byText(page, '.sheet h2', 'Neue Buchung');
  await new Promise((r) => setTimeout(r, 300));
  await typeInto(page, '.sheet input.input[type=text]', 'Spülmittel');
  await (await page.$('.sheet .money input')).type('2');
  await click(page, '.sheet .field[aria-label="Bezahlt von"] .person', 'Kasse');
  const advHint = await page.$$eval('.sheet .field__hint', (e) => e.map((x) => x.textContent));
  assert.ok(advHint.includes(`Die Kasse gibt dir 2,00${NBSP}€ zurück, Ben zahlt es aus.`), advHint.join(' | '));
  await shot(page, '08c-kasse-ausgelegt');
  await click(page, '.sheet__foot button', 'Speichern');
  await waitHeadline(page, `Die Kasse schuldet dir 2,00${NBSP}€.`);
  assert.equal(await textOf(page, '.debt__why'), 'für Spülmittel, Ben zahlt aus');
  assert.equal((await state(page)).meta.summary.kasse, kasseNow, 'nothing left the Kasse yet');
  await click(page, '.debt .btn', 'Erhalten');
  await byText(page, '.sheet h2', 'Erstattung aus der Kasse');
  assert.ok((await textOf(page, '.sheet .sheet__text')).startsWith(`Hat Ben dir 2,00${NBSP}€ aus der Kasse gegeben?`));
  await click(page, '.sheet__foot button', 'Eintragen');
  await waitHeadline(page, 'Du bist mit allen quitt.');
  s = await state(page);
  assert.equal(s.meta.summary.kasse, kasseNow - 200, 'paid out of the Kasse');
  assert.ok(summariesEqual(summaryOf(s.meta.summary), computeSummary(Object.values(s.tx))));
  log('laid out 2,00 € for the Kasse, Ben paid it back from the Kasse');

  // "everybody owes me 3,50": typed per person
  await (await page.$('.fab')).click();
  await byText(page, '.sheet h2', 'Neue Buchung');
  await new Promise((r) => setTimeout(r, 300));
  await typeInto(page, '.sheet input.input[type=text]', 'Ofenhandschuhe');
  await click(page, '.sheet .seg__opt', 'Pro Person');
  await (await page.$('.sheet .money input')).type('3,50');
  const hints = await page.$$eval('.sheet .field__hint', (e) => e.map((x) => x.textContent));
  assert.ok(hints.includes(`Zusammen 14,00${NBSP}€ für 4 Leute`), hints.join(' | '));
  assert.ok(hints.includes(`Danach bekommst du von allen anderen je 3,50${NBSP}€.`), hints.join(' | '));
  await shot(page, '08b-pro-person');
  await click(page, '.sheet__foot button', 'Speichern');
  await waitHeadline(page, `Du bekommst 10,50${NBSP}€ von 3 Leuten.`);
  s = await state(page);
  const gloves = Object.values(s.tx).find((t) => t.title === 'Ofenhandschuhe' && t.paidBy === ids.Anna);
  assert.equal(gloves.amount, 1400);
  assert.ok(summariesEqual(summaryOf(s.meta.summary), computeSummary(Object.values(s.tx))));
  log('per-person expense: 3,50 each, Anna gets 10,50 € from 3 people');

  // ------------------------------------------------------------------ chores
  await click(page, '.tab', 'Putzen');
  const h = await headline(page);
  assert.ok(/^(Deine Aufgabe|Deine Aufgaben|Diese Woche hast du frei|Du hast diese Woche alles erledigt)/.test(h), h);
  const sub2 = await textOf(page, '.headline__sub');
  assert.ok(/^(\d+\. Vorlesungswoche|Weihnachtspause|Semesterferien), \d+\. (\p{L}+ )?bis \d+\. \p{L}+\./u.test(sub2), sub2);
  assert.ok(sub2.includes('Müll & Pfand'), 'last week open item mentioned');
  const weekHeads = await page.$$eval('.week__head', (e) => e.map((x) => x.textContent));
  assert.ok(weekHeads[0].startsWith('Letzte Woche'), weekHeads.join(' | '));
  assert.ok((await page.$$('.hrow.is-done')).length > 3 && (await page.$$('.hrow.is-missed')).length >= 1, 'history shows done and missed chores');
  await shot(page, '09-putzen');
  await page.evaluate(() => window.scrollTo(0, 600));
  await shot(page, '10-putzen-plan');
  await page.evaluate(() => window.scrollTo(0, 0));
  await noOverflow(page, 'putzen');
  // mark the first open row done
  const before = await page.$$eval('.chore .done-mark', (e) => e.length);
  await click(page, '.chore .btn', 'Erledigt');
  await page.waitForFunction((n) => document.querySelectorAll('.chore .done-mark').length === n + 1, { timeout: 4000 }, before);
  // catch up last week
  await click(page, '.chore .btn', 'Nachtragen');
  await page.waitForFunction(() => !document.querySelector('.headline__sub').textContent.includes('letzter Woche'), { timeout: 4000 });
  // swap: give a chore this week to Deniz
  await click(page, '.chore__main', 'Bad');
  await byText(page, '.sheet h2', 'Bad');
  await click(page, '.sheet .person', 'Deniz');
  await byText(page, '.toast', 'Deniz übernimmt Bad');
  log('chores: done, caught up last week, swapped Bad to Deniz');

  // ------------------------------------------------------------------ pinboard
  await click(page, '.tab', 'Pinnwand');
  await waitHeadline(page, 'Nichts Neues.');
  await typeInto(page, '.composer textarea', 'Freitag WG-Abend?\nIch koche.');
  await click(page, '.composer button', 'Posten');
  await byText(page, '.post .rich', 'Ich koche.');
  await click(page, '.ack', 'Als gesehen markieren');
  await byText(page, '.ack.is-on', 'Gesehen');
  await shot(page, '11-pinnwand');
  log('pinboard: posted, acknowledged');
  await tap(await page.$('.sync'));
  await byText(page, '.toast', 'Grau: Das ist die Demo');
  log('the sync dot explains itself');

  // ------------------------------------------------------------------ second tab of the same device sees changes live
  const page2 = await phone(ctx);
  await page2.goto(`${base}#tab=liste`, { waitUntil: 'networkidle0' });
  await waitHeadline(page2, '4 Sachen fehlen.');
  await click(page, '.tab', 'Liste');
  await typeInto(page2, '.adder input', 'Zitronen');
  await page2.keyboard.press('Enter');
  await waitHeadline(page, '5 Sachen fehlen.');
  await byText(page, '.item__word', 'Zitronen');
  log('second tab added Zitronen, first tab updated live');
  await page2.close();

  // ------------------------------------------------------------------ settings
  await (await page.$('.topbar__me')).click();
  await waitHeadline(page, 'WG Martinsviertel');
  await byText(page, '.section__text', 'Demo-Modus');
  await shot(page, '12-wg');
  await noOverflow(page, 'wg');
  await click(page, '.seg__opt', 'Dunkel');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await click(page, '.tab', 'Geld');
  await shot(page, '13-geld-dunkel');
  await (await page.$('.topbar__me')).click();
  await click(page, '.seg__opt', 'Wie das Handy');
  log('settings: theme switch works');

  // someone moves out: gone from the plan, history kept, can come back
  await tap(await page.$('button[aria-label="Deniz bearbeiten"]'));
  await click(page, '.sheet .btn--danger', 'Deniz ist ausgezogen');
  await click(page, '.sheet__foot button', 'Als ausgezogen eintragen');
  await byText(page, '.history summary', 'Ehemalige (1)');
  s = await state(page);
  const deniz = Object.entries(s.members).find(([, m]) => m.name === 'Deniz')[0];
  assert.ok(Object.values(s.chores).every((c) => !c.rotation.includes(deniz)), 'Deniz left every rotation');
  await click(page, '.history summary', 'Ehemalige');
  await click(page, '.history .btn', 'Wieder eingezogen');
  await page.waitForFunction(() => !document.querySelector('.history summary')?.textContent.includes('Ehemalige'), { timeout: 4000 });
  s = await state(page);
  assert.ok(Object.values(s.chores).every((c) => c.rotation.includes(deniz)), 'Deniz back in every rotation');
  log('member moved out and back in, rotations follow');

  // ------------------------------------------------------------------ fresh WG via setup, small phone
  const ctx2 = await browser.createBrowserContext();
  const small = await phone(ctx2, { width: 320, height: 640 });
  await small.goto(base, { waitUntil: 'networkidle0' });
  await click(small, 'button', 'Eigene WG anlegen');
  await waitHeadline(small, 'Neue WG anlegen');
  await typeInto(small, 'input[placeholder="z. B. WG Martinsviertel"]', 'Kiesberg 7');
  await typeInto(small, 'input[aria-label="Dein Name"]', 'Yessu');
  await typeInto(small, 'input[aria-label="Mitbewohner 1"]', 'Lena');
  await click(small, 'button', 'Weitere Person');
  await typeInto(small, 'input[aria-label="Mitbewohner 2"]', 'Mehmet');
  await shot(small, '14-setup');
  await click(small, 'button', 'WG anlegen', { exact: true });
  await waitHeadline(small, 'Alles da.');
  await noOverflow(small, 'small liste');
  await click(small, '.tab', 'Putzen');
  const rows = await small.$$eval('.chore__name', (e) => e.map((x) => x.textContent));
  assert.deepEqual(rows, ['Bad', 'Küche', 'Müll & Pfand', 'Flur & Boden']);
  await shot(small, '15-small-putzen');
  await noOverflow(small, 'small putzen');
  await click(small, '.tab', 'Geld');
  await waitHeadline(small, 'Du bist mit allen quitt.');
  await noOverflow(small, 'small geld');
  log('setup on a 320px phone: WG created with 3 people and 4 chores, no overflow');

  // ------------------------------------------------------------------ dark mode first impression
  const ctx3 = await browser.createBrowserContext();
  const dark = await phone(ctx3, { dark: true });
  await dark.evaluateOnNewDocument(() => localStorage.setItem('wgapp:theme', 'dark'));
  await dark.goto(base, { waitUntil: 'networkidle0' });
  await click(dark, 'button', 'Beispiel-WG ansehen');
  await click(dark, '.who-btn', 'Ben');
  await waitHeadline(dark, 'Sachen fehlen');
  await shot(dark, '16-dark-liste');
  await click(dark, '.tab', 'Putzen');
  await shot(dark, '17-dark-putzen');

  const real = problems.filter((p) => !p.includes('favicon'));
  assert.deepEqual(real, [], 'no console errors or failed requests');
  log('no console errors, no failed requests');

  // ------------------------------------------------------------------ real config: join screen and connect screen
  const ctx4 = await browser.createBrowserContext();
  const live = await ctx4.newPage();
  const liveErrors = [];
  live.on('pageerror', (e) => liveErrors.push(e.message));
  await live.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await live.goto(`${base}live/`, { waitUntil: 'load' });
  await waitHeadline(live, 'Diese App gehört zu einer WG.');
  await typeInto(live, '.start input', 'kein link');
  await click(live, 'button', 'Beitreten');
  await byText(live, '.field__error', 'kein Einladungslink');
  // the invite link opened in the same tab is only a hash change: the app must restart on its own
  await live.evaluate(() => { location.hash = 'wg=HarnessWG0123456789abcd'; });
  await waitHeadline(live, 'Verbinde mit eurer WG');
  assert.deepEqual(liveErrors, [], 'real config boots without script errors');
  log('real config: join screen without code, connect screen with code (Firestore unreachable from here)');
  console.log('E2E OK');
} catch (e) {
  for (const p of await browser.pages()) {
    try {
      await p.screenshot({ path: join(shots, `FAIL-${Date.now()}.png`) });
      console.log('URL', p.url(), 'H1', await p.$eval('h1', (x) => x.textContent).catch(() => '-'));
      console.log('TOASTS', await p.$$eval('.toast', (x) => x.map((t) => t.textContent)).catch(() => '-'));
    } catch {}
  }
  console.log('PROBLEMS', problems);
  throw e;
} finally {
  await browser.close();
  server.close();
}
