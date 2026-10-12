// Pure domain logic: money in integer cents, weeks, chore rotation, small text helpers.
// No DOM, no store access, so everything here is unit-tested in Node.

export const KASSE = 'kasse';

// ---------------------------------------------------------------- money

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const MINUS = '−';

/** 1240 -> "12,40 €"; signed: true adds "+" for positive values. */
export function formatMoney(cents, { signed = false } = {}) {
  const c = Math.round(cents || 0);
  const s = EUR.format(Math.abs(c) / 100);
  if (c < 0) return MINUS + s;
  if (signed && c > 0) return '+' + s;
  return s;
}

/**
 * Parses what people type into a money field, German first: "12", "12,4", "12,40 €", "1.234,56",
 * "1.234" (= 1234), "12.40", "-5". Returns integer cents, or null when the input is not a clear
 * amount (more than two decimals, odd digit groups), so typos are flagged instead of guessed.
 */
export function parseMoney(input) {
  if (input == null) return null;
  let s = String(input).trim().replace(/[€\s\u00a0]/g, '').replace(/eur$/i, '');
  if (!s) return null;
  let neg = false;
  if (/^[-\u2212]/.test(s)) { neg = true; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return null;
  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;
  let intPart = s;
  let frac = '';
  let group = null; // thousands separator, if any
  if (commas && dots) {
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    group = dec === ',' ? '.' : ',';
    if (s.split(dec).length !== 2) return null;
    [intPart, frac] = s.split(dec);
  } else if (commas === 1) {
    [intPart, frac] = s.split(',');
  } else if (dots === 1) {
    const [a, b] = s.split('.');
    if (b.length === 3 && a.length) {
      group = '.';
    } else {
      intPart = a;
      frac = b;
    }
  } else if (commas > 1 || dots > 1) {
    group = commas ? ',' : '.';
  }
  if (group) {
    const parts = intPart.split(group);
    if (parts.some((p, i) => (i === 0 ? !/^\d{1,3}$/.test(p) : !/^\d{3}$/.test(p)))) return null;
    intPart = parts.join('');
  }
  if (!/^\d*$/.test(intPart) || !/^\d{0,2}$/.test(frac)) return null;
  if (!intPart && !frac) return null;
  const cents = parseInt(intPart || '0', 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  return neg ? -cents : cents;
}

/** Splits an amount into equal integer shares; leftover cents go to the first ids (sorted). */
export function splitEvenly(amount, ids) {
  const uniq = [...new Set(ids || [])].sort();
  const out = {};
  if (!uniq.length) return out;
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(Math.round(amount));
  const base = Math.floor(abs / uniq.length);
  let rest = abs - base * uniq.length;
  for (const id of uniq) {
    out[id] = sign * (base + (rest > 0 ? 1 : 0));
    if (rest > 0) rest--;
  }
  return out;
}

/** Bump this when the shape of meta/summary changes; older summaries get rebuilt once. */
export const SUMMARY_VERSION = 2;

export function emptyEffect() {
  return { balances: {}, kasse: 0, contrib: {}, pairs: {} };
}

function bump(map, key, delta) {
  if (!key || !delta) return;
  map[key] = (map[key] || 0) + delta;
}

/** Debts between two people live under one key per pair: "a|b" (a < b), positive = a owes b. */
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Records that `debtor` owes `creditor` `amount` more (negative: less). */
function owe(pairs, debtor, creditor, amount) {
  if (!debtor || !creditor || debtor === creditor || !amount) return;
  bump(pairs, pairKey(debtor, creditor), debtor < creditor ? amount : -amount);
}

/** How much a owes b according to a pairs map (negative: b owes a). */
export function owes(pairs, a, b) {
  const v = (pairs || {})[pairKey(a, b)] || 0;
  return (a < b ? v : -v) || 0;
}

/** Every open debt as { from, to, amount } with amount > 0, biggest first. */
export function debtList(pairs) {
  const out = [];
  for (const [k, v] of Object.entries(pairs || {})) {
    if (!v) continue;
    const [a, b] = k.split('|');
    out.push(v > 0 ? { from: a, to: b, amount: v } : { from: b, to: a, amount: -v });
  }
  return out.sort((x, y) => y.amount - x.amount || (x.from + x.to < y.from + y.to ? -1 : 1));
}

function cleanEffect(e) {
  for (const k of Object.keys(e.balances)) if (!e.balances[k]) delete e.balances[k];
  for (const k of Object.keys(e.pairs)) if (!e.pairs[k]) delete e.pairs[k];
  for (const m of Object.keys(e.contrib)) {
    for (const k of Object.keys(e.contrib[m])) if (!e.contrib[m][k]) delete e.contrib[m][k];
    if (!Object.keys(e.contrib[m]).length) delete e.contrib[m];
  }
  e.kasse = e.kasse || 0;
  return e;
}

/** The money part of a meta/summary document, in the same shape computeSummary returns. */
export function summaryOf(doc) {
  return { balances: doc?.balances || {}, kasse: doc?.kasse || 0, contrib: doc?.contrib || {}, pairs: doc?.pairs || {} };
}

/**
 * What a transaction does to the books.
 * balances: positive = the WG owes this person money, negative = this person owes.
 * pairs: who owes whom, per pair of people (see pairKey). The pairs of a person always add up to their balance.
 * kasse: cash in the shared WG-Kasse. contrib: monthly Kasse contributions per member.
 *
 * expense  {amount, paidBy: memberId | 'kasse', split: [memberIds]}
 * deposit  {amount, member, month?}   member puts money into the Kasse
 * adjust   {amount (signed)}          correct the Kasse balance to match reality
 * transfer {amount, from, to}         "from" paid "to" back
 */
export function txEffect(tx) {
  const e = emptyEffect();
  const a = Math.round(tx?.amount || 0);
  switch (tx?.type) {
    case 'expense': {
      if (tx.paidBy === KASSE) {
        e.kasse -= a;
      } else {
        bump(e.balances, tx.paidBy, a);
        const split = tx.split && tx.split.length ? tx.split : [tx.paidBy];
        for (const [id, share] of Object.entries(splitEvenly(a, split))) {
          bump(e.balances, id, -share);
          owe(e.pairs, id, tx.paidBy, share);
        }
      }
      break;
    }
    case 'deposit':
      e.kasse += a;
      if (tx.member && tx.month) e.contrib[tx.month] = { [tx.member]: a };
      break;
    case 'adjust':
      e.kasse += a;
      break;
    case 'transfer':
      bump(e.balances, tx.from, a);
      bump(e.balances, tx.to, -a);
      owe(e.pairs, tx.from, tx.to, -a);
      break;
    default:
      break;
  }
  return cleanEffect(e);
}

export function addEffects(...effects) {
  const out = emptyEffect();
  for (const e of effects) {
    if (!e) continue;
    for (const [k, v] of Object.entries(e.balances || {})) bump(out.balances, k, v);
    for (const [k, v] of Object.entries(e.pairs || {})) bump(out.pairs, k, v);
    out.kasse += e.kasse || 0;
    for (const [m, per] of Object.entries(e.contrib || {})) {
      out.contrib[m] = out.contrib[m] || {};
      for (const [k, v] of Object.entries(per)) bump(out.contrib[m], k, v);
    }
  }
  return cleanEffect(out);
}

export function negateEffect(e) {
  const out = emptyEffect();
  for (const [k, v] of Object.entries(e.balances || {})) out.balances[k] = -v;
  for (const [k, v] of Object.entries(e.pairs || {})) out.pairs[k] = -v;
  out.kasse = -(e.kasse || 0);
  for (const [m, per] of Object.entries(e.contrib || {})) {
    out.contrib[m] = {};
    for (const [k, v] of Object.entries(per)) out.contrib[m][k] = -v;
  }
  return cleanEffect(out);
}

/** The change in the books when oldTx is replaced by newTx (either may be null). */
export function effectDiff(newTx, oldTx) {
  return addEffects(newTx ? txEffect(newTx) : null, oldTx ? negateEffect(txEffect(oldTx)) : null);
}

export function isEmptyEffect(e) {
  return !e.kasse && !Object.keys(e.balances).length && !Object.keys(e.contrib).length && !Object.keys(e.pairs || {}).length;
}

export function computeSummary(txs) {
  return addEffects(...(txs || []).map(txEffect));
}

export function summariesEqual(a, b) {
  return isEmptyEffect(addEffects(a || emptyEffect(), negateEffect(b || emptyEffect())));
}

/**
 * The open part of one debt, explained: the bookings that make up what a owes b right now.
 * Walks back from the newest booking until the pair was last even. txs: newest first (may be
 * only the most recent ones); complete: false means older bookings would be needed.
 */
export function debtReasons(txs, a, b, current) {
  const out = [];
  let rest = current;
  if (!rest) return { items: out, complete: true };
  for (const tx of txs || []) {
    const d = owes(txEffect(tx).pairs, a, b);
    if (!d) continue;
    out.push({ tx, delta: d });
    rest -= d;
    if (!rest) return { items: out, complete: true };
  }
  return { items: out, complete: false };
}

/** Who pays whom so that every balance ends at zero (greedy, at most n-1 transfers). */
export function settlePlan(balances) {
  const cred = [];
  const debt = [];
  for (const [id, v] of Object.entries(balances || {})) {
    if (v > 0) cred.push({ id, v });
    else if (v < 0) debt.push({ id, v: -v });
  }
  const order = (x, y) => y.v - x.v || (x.id < y.id ? -1 : 1);
  const out = [];
  for (;;) {
    cred.sort(order);
    debt.sort(order);
    const c = cred[0];
    const d = debt[0];
    if (!c || !d || c.v <= 0 || d.v <= 0) break;
    const x = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amount: x });
    c.v -= x;
    d.v -= x;
  }
  return out;
}

// ---------------------------------------------------------------- dates & weeks

export const pad = (n) => String(n).padStart(2, '0');

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function parseDayKey(k) {
  const [y, m, d] = String(k).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function shiftMonth(mk, delta) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1, 12);
  return monthKey(d);
}

const MONTH_FMT = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const MONTH_ONLY = new Intl.DateTimeFormat('de-DE', { month: 'long' });
const DAY_MONTH = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
const FULL_DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });

export function monthLabel(mk, { withYear = true } = {}) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1, 1, 12);
  return (withYear ? MONTH_FMT : MONTH_ONLY).format(d);
}

export function dayLabel(dk, now = new Date()) {
  const d = parseDayKey(dk);
  if (dk === dayKey(now)) return 'Heute';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dk === dayKey(y)) return 'Gestern';
  return `${WEEKDAY.format(d)}, ${DAY_MONTH.format(d)}`;
}

/** dayLabel for the middle of a sentence: "heute", "gestern", "Mo, 12. Okt." */
export function dayLabelInline(dk, now = new Date()) {
  const l = dayLabel(dk, now);
  return l === 'Heute' || l === 'Gestern' ? l.toLowerCase() : l;
}

const EPOCH = new Date(2024, 0, 1, 12); // a Monday
const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Weeks since 2024-01-01 (Monday-based, local time). */
export function weekIndex(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Math.round((d - EPOCH) / WEEK_MS);
}

export function weekMonday(index) {
  const d = new Date(EPOCH);
  d.setDate(d.getDate() + index * 7);
  return d;
}

export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Lecture periods of TU Darmstadt (tu-darmstadt.de, Semestertermine), so weeks can be counted the way
 * the university does: 1. Vorlesungswoche, 2. Vorlesungswoche … Breaks inside a semester do not count.
 */
export const SEMESTERS = [
  { name: 'Wintersemester 2026/27', start: '2026-10-12', end: '2027-02-12', breaks: [['2026-12-21', '2027-01-08', 'Weihnachtspause']] },
  { name: 'Sommersemester 2027', start: '2027-04-12', end: '2027-07-16', breaks: [] },
  { name: 'Wintersemester 2027/28', start: '2027-10-11', end: '2028-02-11', breaks: [['2027-12-20', '2028-01-07', 'Weihnachtspause']] },
  { name: 'Sommersemester 2028', start: '2028-04-18', end: '2028-07-21', breaks: [] },
  { name: 'Wintersemester 2028/29', start: '2028-10-16', end: '2029-02-16', breaks: [['2028-12-25', '2029-01-12', 'Weihnachtspause']] },
  { name: 'Sommersemester 2029', start: '2029-04-16', end: '2029-07-20', breaks: [] },
  { name: 'Wintersemester 2029/30', start: '2029-10-15', end: '2030-02-15', breaks: [['2029-12-24', '2030-01-11', 'Weihnachtspause']] },
  { name: 'Sommersemester 2030', start: '2030-04-23', end: '2030-07-26', breaks: [] },
  { name: 'Wintersemester 2030/31', start: '2030-10-14', end: '2031-02-14', breaks: [['2030-12-23', '2031-01-10', 'Weihnachtspause']] },
];

const weekOfDay = (k) => weekIndex(parseDayKey(k));

/** { kind: 'lecture', n, semester } | { kind: 'break', label, semester } | { kind: 'free' } */
export function semesterWeek(index, semesters = SEMESTERS) {
  for (const s of semesters) {
    const first = weekOfDay(s.start);
    if (index < first || index > weekOfDay(s.end)) continue;
    const brk = (w) => s.breaks.find(([a, b]) => weekOfDay(a) <= w && w <= weekOfDay(b));
    const b = brk(index);
    if (b) return { kind: 'break', label: b[2] || 'Pause', semester: s.name };
    let n = 0;
    for (let w = first; w <= index; w++) if (!brk(w)) n++;
    return { kind: 'lecture', n, semester: s.name };
  }
  return { kind: 'free' };
}

/**
 * Everything needed to name a week without calendar-week numbers:
 * title "3. Vorlesungswoche" | "Weihnachtspause" | "Semesterferien", short "Woche 3" | "Pause" | "Ferien",
 * range "26. Oktober bis 1. November", dates "26.10.–1.11.", from "26. Okt."
 */
export function weekInfo(index) {
  const mon = weekMonday(index);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const month = (d) => MONTH_ONLY.format(d);
  const range = mon.getMonth() === sun.getMonth()
    ? `${mon.getDate()}. bis ${sun.getDate()}. ${month(sun)}`
    : `${mon.getDate()}. ${month(mon)} bis ${sun.getDate()}. ${month(sun)}`;
  const dates = `${mon.getDate()}.${mon.getMonth() + 1}.–${sun.getDate()}.${sun.getMonth() + 1}.`;
  const from = DAY_MONTH.format(mon);
  const sem = semesterWeek(index);
  let title;
  let short;
  if (sem.kind === 'lecture') {
    title = `${sem.n}. Vorlesungswoche`;
    short = `Woche ${sem.n}`;
  } else if (sem.kind === 'break') {
    title = sem.label;
    short = 'Pause';
  } else {
    title = 'Semesterferien';
    short = 'Ferien';
  }
  return { index, kw: isoWeekNumber(mon), range, dates, from, title, short, sem };
}

/** "diese Woche", "letzte Woche", "nächste Woche", else the week's title. */
export function relWeek(index, current) {
  if (index === current) return 'diese Woche';
  if (index === current - 1) return 'letzte Woche';
  if (index === current + 1) return 'nächste Woche';
  return weekInfo(index).title;
}

/** "gerade eben", "vor 5 Min.", "vor 2 Std.", "gestern", "vor 3 Tagen", "12. Okt." */
export function relTime(ts, now = Date.now()) {
  if (!ts) return '';
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const nowD = new Date(now);
  const then = new Date(ts);
  if (dayKey(nowD) === dayKey(then)) return `vor ${Math.floor(min / 60)} Std.`;
  const y = new Date(nowD);
  y.setDate(y.getDate() - 1);
  if (dayKey(y) === dayKey(then)) return 'gestern';
  const days = Math.round((parseDayKey(dayKey(nowD)) - parseDayKey(dayKey(then))) / 86400000);
  if (days < 7) return `vor ${days} Tagen`;
  return then.getFullYear() === nowD.getFullYear() ? DAY_MONTH.format(then) : FULL_DATE.format(then);
}

// ---------------------------------------------------------------- chores

const mod = (a, n) => ((a % n) + n) % n;
const every = (c) => Math.max(1, Math.floor(c?.everyWeeks || 1));

export function choreDue(chore, week) {
  return mod(week - (chore.anchorWeek || 0), every(chore)) === 0;
}

/** Whose turn it is in a given week by rotation alone (overrides live in the chore log). */
export function choreAssignee(chore, week) {
  const rot = chore?.rotation || [];
  if (!rot.length || !choreDue(chore, week)) return null;
  const k = Math.floor((week - (chore.anchorWeek || 0)) / every(chore));
  return rot[mod(k, rot.length)];
}

export function nextDueWeek(chore, fromWeek) {
  for (let w = fromWeek; w < fromWeek + 104; w++) if (choreDue(chore, w)) return w;
  return fromWeek;
}

/**
 * Changes who takes part in a rotation without reshuffling everybody:
 * whoever is due next keeps their turn, the order of newRotation is kept, newcomers queue at the end.
 */
export function rebaseRotation(chore, newRotation, currentWeek) {
  const due = nextDueWeek(chore, currentWeek);
  if (!newRotation.length) return { rotation: [], anchorWeek: due };
  const old = chore.rotation || [];
  let start = null;
  if (old.length) {
    const cur = choreAssignee(chore, due);
    const i0 = Math.max(0, old.indexOf(cur));
    for (let k = 0; k < old.length; k++) {
      const c = old[mod(i0 + k, old.length)];
      if (newRotation.includes(c)) { start = c; break; }
    }
  }
  const i = start ? newRotation.indexOf(start) : 0;
  return { rotation: [...newRotation.slice(i), ...newRotation.slice(0, i)], anchorWeek: due };
}

/** Rotation in the given order, starting with memberId in `week`. */
export function startRotationWith(rotation, memberId, week) {
  const i = Math.max(0, rotation.indexOf(memberId));
  return { rotation: [...rotation.slice(i), ...rotation.slice(0, i)], anchorWeek: week };
}

export function choreLogId(choreId, week) {
  return `${choreId}_${week}`;
}

// ---------------------------------------------------------------- shopping helpers

const KASSE_WORDS = [
  'klopapier', 'toilettenpapier', 'klorolle', 'küchenrolle', 'küchenpapier', 'zewa',
  'spülmittel', 'spüli', 'pril', 'spülmaschinentabs', 'spültabs', 'geschirrspültabs', 'tabs',
  'klarspüler', 'spülmaschinensalz', 'regeneriersalz', 'müllbeutel', 'müllsack', 'müllsäcke', 'mülltüte',
  'putzmittel', 'reiniger', 'allzweckreiniger', 'badreiniger', 'wc-reiniger', 'glasreiniger',
  'entkalker', 'scheuermilch', 'schwamm', 'schwämme', 'spülschwamm', 'lappen', 'putzlappen',
  'spültuch', 'spültücher', 'handseife', 'seife', 'flüssigseife', 'alufolie', 'frischhaltefolie',
  'backpapier', 'gefrierbeutel', 'salz', 'pfeffer', 'öl', 'olivenöl', 'rapsöl', 'sonnenblumenöl',
  'essig', 'glühbirne', 'batterien', 'streichhölzer', 'feuerzeug',
];
const KASSE_RE = new RegExp(
  `(^|[^a-zäöüß])(${KASSE_WORDS.map((w) => w.replace(/[-]/g, '\\-')).join('|')})(n|en|s|e|er)?([^a-zäöüß]|$)`,
);

/** Typical shared household stuff that a WG-Kasse usually pays for. */
export function guessKasse(text) {
  return KASSE_RE.test(String(text || '').toLowerCase());
}

export function normalizeText(t) {
  return String(t || '').replace(/\s+/g, ' ').trim();
}

/** Short receipt title from item names: "Milch, Brot, Eier +2". */
export function shoppingTitle(texts, max = 3) {
  const list = texts.map(normalizeText).filter(Boolean);
  if (!list.length) return 'Einkauf';
  const head = list.slice(0, max).join(', ');
  return list.length > max ? `${head} +${list.length - max}` : head;
}

/** Item names from history that fit what is being typed, most frequent first. */
export function suggest(input, history, exclude = [], max = 5) {
  const q = normalizeText(input).toLowerCase();
  const ex = new Set(exclude.map((t) => normalizeText(t).toLowerCase()));
  const counts = new Map();
  for (const h of history) {
    const t = normalizeText(h);
    const k = t.toLowerCase();
    if (!t || ex.has(k)) continue;
    const e = counts.get(k) || { text: t, n: 0, first: counts.size };
    e.n++;
    counts.set(k, e);
  }
  let list = [...counts.values()];
  if (q) {
    list = list.filter((e) => e.text.toLowerCase().includes(q) && e.text.toLowerCase() !== q);
    list.sort((a, b) => {
      const ap = a.text.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.text.toLowerCase().startsWith(q) ? 0 : 1;
      return ap - bp || b.n - a.n || a.first - b.first;
    });
  } else {
    list.sort((a, b) => b.n - a.n || a.first - b.first);
  }
  return list.slice(0, max).map((e) => e.text);
}

// ---------------------------------------------------------------- ids

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function newId(len = 20) {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}
