import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KASSE, parseMoney, formatMoney, splitEvenly, txEffect, computeSummary, effectDiff, settlePlan,
  summariesEqual, addEffects, negateEffect, weekIndex, weekMonday, isoWeekNumber, choreAssignee,
  choreDue, rebaseRotation, startRotationWith, nextDueWeek, guessKasse, suggest, shoppingTitle,
  relTime, dayKey, shiftMonth, monthLabel,
} from '../src/model.js';

const NBSP = ' ';

test('parseMoney understands German and English input', () => {
  assert.equal(parseMoney('12'), 1200);
  assert.equal(parseMoney('12,4'), 1240);
  assert.equal(parseMoney('12,40'), 1240);
  assert.equal(parseMoney('12.40'), 1240);
  assert.equal(parseMoney('12.4'), 1240);
  assert.equal(parseMoney(' 12,40 € '), 1240);
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('1,234.56'), 123456);
  assert.equal(parseMoney('1.234'), 123400, 'German thousands separator');
  assert.equal(parseMoney('12.345.678'), 1234567800);
  assert.equal(parseMoney('0,05'), 5);
  assert.equal(parseMoney(',5'), 50);
  assert.equal(parseMoney('12,'), 1200);
  assert.equal(parseMoney('-5'), -500);
  assert.equal(parseMoney('\u22125,50'), -550);
});

test('parseMoney flags typos instead of guessing', () => {
  for (const bad of ['', 'abc', '12,4a', '2,345', '20,0030', '1.23.4', '1,2,3', '12..5', '.', ',', '1.234.5', null]) {
    assert.equal(parseMoney(bad), null, String(bad));
  }
});

test('formatMoney uses German format and a real minus sign', () => {
  assert.equal(formatMoney(1240), `12,40${NBSP}€`);
  assert.equal(formatMoney(-1240), `−12,40${NBSP}€`);
  assert.equal(formatMoney(1240, { signed: true }), `+12,40${NBSP}€`);
  assert.equal(formatMoney(0, { signed: true }), `0,00${NBSP}€`);
  assert.equal(formatMoney(123456), `1.234,56${NBSP}€`);
});

test('splitEvenly keeps every cent', () => {
  const s = splitEvenly(1000, ['c', 'a', 'b']);
  assert.deepEqual(s, { a: 334, b: 333, c: 333 });
  assert.equal(Object.values(s).reduce((x, y) => x + y, 0), 1000);
  assert.deepEqual(splitEvenly(1, ['a', 'b']), { a: 1, b: 0 });
  assert.deepEqual(splitEvenly(500, ['a', 'a']), { a: 500 });
  assert.deepEqual(splitEvenly(500, []), {});
});

test('expense paid by a member creates balanced debts', () => {
  const e = txEffect({ type: 'expense', amount: 3000, paidBy: 'a', split: ['a', 'b', 'c'] });
  assert.deepEqual(e.balances, { a: 2000, b: -1000, c: -1000 });
  assert.equal(e.kasse, 0);
  assert.equal(Object.values(e.balances).reduce((x, y) => x + y, 0), 0);
});

test('expense for others only (payer not in split)', () => {
  const e = txEffect({ type: 'expense', amount: 1000, paidBy: 'a', split: ['b', 'c'] });
  assert.deepEqual(e.balances, { a: 1000, b: -500, c: -500 });
});

test('expense with empty split counts as private (no debts)', () => {
  const e = txEffect({ type: 'expense', amount: 1000, paidBy: 'a', split: [] });
  assert.deepEqual(e.balances, {});
});

test('expense from the Kasse only reduces the Kasse', () => {
  const e = txEffect({ type: 'expense', amount: 899, paidBy: KASSE, split: ['a', 'b'] });
  assert.deepEqual(e.balances, {});
  assert.equal(e.kasse, -899);
});

test('deposits fill the Kasse and count as monthly contribution', () => {
  const e = txEffect({ type: 'deposit', amount: 1000, member: 'a', month: '2026-10' });
  assert.equal(e.kasse, 1000);
  assert.deepEqual(e.contrib, { '2026-10': { a: 1000 } });
  const other = txEffect({ type: 'deposit', amount: 500, member: 'a' });
  assert.deepEqual(other.contrib, {});
  assert.equal(txEffect({ type: 'adjust', amount: -250 }).kasse, -250);
});

test('transfer settles a debt', () => {
  const e = txEffect({ type: 'transfer', amount: 1000, from: 'b', to: 'a' });
  assert.deepEqual(e.balances, { b: 1000, a: -1000 });
});

test('summary of a realistic month and settling it to zero', () => {
  const txs = [
    { type: 'deposit', amount: 1000, member: 'a', month: '2026-10' },
    { type: 'deposit', amount: 1000, member: 'b', month: '2026-10' },
    { type: 'expense', amount: 1299, paidBy: KASSE, split: ['a', 'b', 'c'] },
    { type: 'expense', amount: 4520, paidBy: 'a', split: ['a', 'b', 'c'] },
    { type: 'expense', amount: 1800, paidBy: 'c', split: ['b', 'c'] },
  ];
  const s = computeSummary(txs);
  assert.equal(s.kasse, 2000 - 1299);
  assert.deepEqual(s.contrib, { '2026-10': { a: 1000, b: 1000 } });
  // a paid 45.20 for three (shares 15.07/15.07/15.06), c paid 18.00 for b and c
  assert.deepEqual(s.balances, { a: 3013, b: -2407, c: -606 });
  assert.equal(Object.values(s.balances).reduce((x, y) => x + y, 0), 0);
  const plan = settlePlan(s.balances);
  assert.deepEqual(plan, [
    { from: 'b', to: 'a', amount: 2407 },
    { from: 'c', to: 'a', amount: 606 },
  ]);
  const after = computeSummary([...txs, ...plan.map((p) => ({ type: 'transfer', ...p }))]);
  assert.deepEqual(after.balances, {});
});

test('settlePlan needs at most n-1 transfers and zeroes everything', () => {
  const balances = { a: 5000, b: -1234, c: -2766, d: 1500, e: -2500 };
  const plan = settlePlan(balances);
  assert.ok(plan.length <= 4);
  const rest = { ...balances };
  for (const p of plan) { rest[p.from] += p.amount; rest[p.to] -= p.amount; }
  assert.ok(Object.values(rest).every((v) => v === 0));
  assert.deepEqual(settlePlan({}), []);
  assert.deepEqual(settlePlan({ a: 0, b: 0 }), []);
});

test('editing a transaction changes the books by exactly the difference', () => {
  const oldTx = { type: 'expense', amount: 3000, paidBy: 'a', split: ['a', 'b', 'c'] };
  const newTx = { type: 'expense', amount: 2000, paidBy: KASSE, split: ['a', 'b'] };
  const before = computeSummary([oldTx]);
  const after = addEffects(before, effectDiff(newTx, oldTx));
  assert.ok(summariesEqual(after, computeSummary([newTx])));
  const deleted = addEffects(before, effectDiff(null, oldTx));
  assert.ok(summariesEqual(deleted, computeSummary([])));
  assert.ok(summariesEqual(negateEffect(negateEffect(before)), before));
});

test('weeks are Monday-based and stable across DST', () => {
  assert.equal(weekIndex(new Date(2024, 0, 1)), 0);
  assert.equal(weekIndex(new Date(2024, 0, 7, 23, 59)), 0); // Sunday
  assert.equal(weekIndex(new Date(2024, 0, 8, 0, 1)), 1);
  const w = weekIndex(new Date(2026, 9, 11)); // Sunday 11 Oct 2026
  assert.equal(weekMonday(w).getDate(), 5);
  assert.equal(weekIndex(new Date(2026, 9, 12)), w + 1);
  // DST change in Germany: 29 March 2026 and 25 October 2026
  assert.equal(weekIndex(new Date(2026, 2, 30)) - weekIndex(new Date(2026, 2, 23)), 1);
  assert.equal(weekIndex(new Date(2026, 9, 26)) - weekIndex(new Date(2026, 9, 19)), 1);
  assert.equal(isoWeekNumber(new Date(2026, 9, 12)), 42);
  assert.equal(isoWeekNumber(new Date(2026, 0, 1)), 1);
  assert.equal(isoWeekNumber(new Date(2027, 0, 1)), 53);
});

test('weekly chore rotation cycles through everybody', () => {
  const chore = { rotation: ['a', 'b', 'c'], anchorWeek: 100, everyWeeks: 1 };
  assert.deepEqual([100, 101, 102, 103, 99].map((w) => choreAssignee(chore, w)), ['a', 'b', 'c', 'a', 'c']);
});

test('chores every two weeks are only due every second week', () => {
  const chore = { rotation: ['a', 'b'], anchorWeek: 10, everyWeeks: 2 };
  assert.equal(choreDue(chore, 10), true);
  assert.equal(choreDue(chore, 11), false);
  assert.equal(choreAssignee(chore, 11), null);
  assert.equal(choreAssignee(chore, 12), 'b');
  assert.equal(choreAssignee(chore, 14), 'a');
  assert.equal(nextDueWeek(chore, 11), 12);
});

test('adding a flatmate keeps the current turn', () => {
  const chore = { rotation: ['a', 'b', 'c'], anchorWeek: 0, everyWeeks: 1 };
  const now = 4; // b's turn
  assert.equal(choreAssignee(chore, now), 'b');
  const next = { ...chore, ...rebaseRotation(chore, ['a', 'b', 'c', 'd'], now) };
  assert.deepEqual([4, 5, 6, 7, 8].map((w) => choreAssignee(next, w)), ['b', 'c', 'd', 'a', 'b']);
});

test('removing the person whose turn it is hands it to the next one', () => {
  const chore = { rotation: ['a', 'b', 'c'], anchorWeek: 0, everyWeeks: 1 };
  const next = { ...chore, ...rebaseRotation(chore, ['a', 'c'], 4) };
  assert.deepEqual([4, 5, 6].map((w) => choreAssignee(next, w)), ['c', 'a', 'c']);
});

test('startRotationWith makes someone start this week', () => {
  const chore = { everyWeeks: 1, ...startRotationWith(['a', 'b', 'c'], 'c', 50) };
  assert.deepEqual([50, 51, 52].map((w) => choreAssignee(chore, w)), ['c', 'a', 'b']);
});

test('guessKasse spots shared household items, not snacks', () => {
  for (const t of ['Klopapier', 'klopapier 3-lagig', 'Spülmittel', 'Müllbeutel 35l', 'Salz', 'Olivenöl', 'Schwämme', 'Küchenrollen', 'WC-Reiniger'])
    assert.equal(guessKasse(t), true, t);
  for (const t of ['Milch', 'Salzstangen', 'Ölsardinen', 'Brot', 'Pfefferminztee', ''])
    assert.equal(guessKasse(t), false, t);
});

test('suggest ranks prefix matches and frequency', () => {
  const hist = ['Milch', 'Brot', 'Milch', 'Hafermilch', 'Mehl', 'Milchreis', 'Milch'];
  assert.deepEqual(suggest('mil', hist), ['Milch', 'Milchreis', 'Hafermilch']);
  assert.deepEqual(suggest('', hist, ['brot']), ['Milch', 'Hafermilch', 'Mehl', 'Milchreis']);
  assert.deepEqual(suggest('milch', ['Milch']), []);
});

test('shoppingTitle', () => {
  assert.equal(shoppingTitle(['Milch', 'Brot']), 'Milch, Brot');
  assert.equal(shoppingTitle(['A', 'B', 'C', 'D', 'E']), 'A, B, C +2');
  assert.equal(shoppingTitle([]), 'Einkauf');
});

test('relTime and month helpers in German', () => {
  const now = new Date(2026, 9, 11, 20, 0).getTime();
  assert.equal(relTime(now - 20 * 1000, now), 'gerade eben');
  assert.equal(relTime(now - 5 * 60000, now), 'vor 5 Min.');
  assert.equal(relTime(now - 3 * 3600000, now), 'vor 3 Std.');
  assert.equal(relTime(new Date(2026, 9, 10, 23, 0).getTime(), now), 'gestern');
  assert.equal(relTime(new Date(2026, 9, 7, 9, 0).getTime(), now), 'vor 4 Tagen');
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(monthLabel('2026-10'), 'Oktober 2026');
});
