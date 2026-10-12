import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KASSE, parseMoney, formatMoney, splitEvenly, txEffect, computeSummary, effectDiff, settlePlan,
  summariesEqual, addEffects, negateEffect, weekIndex, weekMonday, isoWeekNumber, choreAssignee,
  choreDue, rebaseRotation, startRotationWith, nextDueWeek, guessKasse, suggest, shoppingTitle,
  relTime, dayKey, shiftMonth, monthLabel, owes, debtList, debtReasons, summaryOf, semesterWeek, weekInfo, relWeek,
  parseDayKey,
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

test('who owes whom: Simon buys oven gloves for the whole WG', () => {
  const wg = ['simon', 'yessu', 'felix', 'tauno', 'ernest'];
  const gloves = { type: 'expense', title: 'Ofenhandschuhe', amount: 1750, paidBy: 'simon', split: wg };
  const e = txEffect(gloves);
  for (const id of wg.slice(1)) assert.equal(owes(e.pairs, id, 'simon'), 350, id);
  assert.equal(owes(e.pairs, 'simon', 'yessu'), -350, 'seen from Simon it is negative');
  assert.equal(e.balances.simon, 1400);
  assert.deepEqual(debtList(e.pairs).map((d) => [d.from, d.to, d.amount]).sort(), wg.slice(1).map((id) => [id, 'simon', 350]).sort());
  // Yessu pays Simon back: only that pair is settled
  const after = computeSummary([gloves, { type: 'transfer', from: 'yessu', to: 'simon', amount: 350 }]);
  assert.equal(owes(after.pairs, 'yessu', 'simon'), 0);
  assert.equal(owes(after.pairs, 'felix', 'simon'), 350);
  assert.equal(debtList(after.pairs).length, 3);
});

test('debts between two people net out instead of piling up', () => {
  const s = computeSummary([
    { type: 'expense', amount: 1000, paidBy: 'a', split: ['a', 'b'] }, // b owes a 5
    { type: 'expense', amount: 600, paidBy: 'b', split: ['a', 'b'] }, // a owes b 3
  ]);
  assert.deepEqual(debtList(s.pairs), [{ from: 'b', to: 'a', amount: 200 }]);
});

test('per-person debts always add up to the balances', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  let r = 7;
  const rnd = (n) => ((r = (r * 1103515245 + 12345) % 2147483648) % n);
  const txs = [];
  for (let i = 0; i < 400; i++) {
    const k = rnd(12);
    if (k < 6) {
      const split = ids.filter(() => rnd(3) > 0);
      txs.push({ type: 'expense', amount: 1 + rnd(9000), paidBy: rnd(6) === 0 ? KASSE : ids[rnd(5)], split });
    } else if (k < 8) {
      txs.push({ type: 'transfer', amount: 1 + rnd(3000), from: ids[rnd(5)], to: ids[rnd(5)] });
    } else if (k < 9) {
      txs.push({ type: 'expense', amount: 1 + rnd(900), paidBy: KASSE, advancedBy: ids[rnd(5)], split: ids });
    } else if (k < 10) {
      txs.push({ type: 'transfer', amount: 1 + rnd(900), from: KASSE, to: ids[rnd(5)] });
    } else {
      txs.push({ type: 'deposit', amount: 1000, member: ids[rnd(5)], month: '2026-10' });
    }
  }
  const s = computeSummary(txs);
  for (const id of ids) {
    const fromPairs = [...ids, KASSE].reduce((sum, other) => sum - owes(s.pairs, id, other), 0);
    assert.equal(fromPairs, s.balances[id] || 0, id);
  }
  assert.ok(summariesEqual(summaryOf(s), computeSummary([...txs].reverse())));
});

test('debtReasons explains the open part of a debt, newest first', () => {
  const tx = (id, data) => ({ id, ...data });
  const newestFirst = [
    tx('t5', { type: 'expense', title: 'Ofenhandschuhe', amount: 700, paidBy: 's', split: ['s', 'y'] }),
    tx('t4', { type: 'expense', title: 'Pizza', amount: 1000, paidBy: 's', split: ['s', 'y'] }),
    tx('t3', { type: 'transfer', amount: 200, from: 'y', to: 's' }),
    tx('t2', { type: 'expense', title: 'Kino', amount: 400, paidBy: 's', split: ['s', 'y'] }), // was settled by t3
    tx('t1', { type: 'expense', title: 'Brot', amount: 300, paidBy: 'y', split: ['f'] }), // not between y and s
  ];
  const current = owes(computeSummary(newestFirst).pairs, 'y', 's');
  assert.equal(current, 850);
  const { items, complete } = debtReasons(newestFirst, 'y', 's', current);
  assert.equal(complete, true);
  assert.deepEqual(items.map((i) => [i.tx.id, i.delta]), [['t5', 350], ['t4', 500]]);
  // only part of the history loaded: says so
  const partial = debtReasons(newestFirst.slice(0, 1), 'y', 's', current);
  assert.equal(partial.complete, false);
  assert.deepEqual(debtReasons(newestFirst, 'y', 's', 0), { items: [], complete: true });
});

test('weeks are named like at TU Darmstadt: Vorlesungswoche, Weihnachtspause, Semesterferien', () => {
  const w = (k) => weekIndex(parseDayKey(k));
  assert.deepEqual(semesterWeek(w('2026-10-12')), { kind: 'lecture', n: 1, semester: 'Wintersemester 2026/27' });
  assert.equal(semesterWeek(w('2026-10-18')).n, 1, 'Sunday still belongs to the week');
  assert.equal(semesterWeek(w('2026-12-14')).n, 10);
  assert.equal(semesterWeek(w('2026-12-21')).kind, 'break');
  assert.equal(semesterWeek(w('2027-01-08')).kind, 'break');
  assert.equal(semesterWeek(w('2027-01-11')).n, 11, 'counting goes on after the break');
  assert.equal(semesterWeek(w('2027-02-12')).n, 15);
  assert.equal(semesterWeek(w('2027-02-15')).kind, 'free');
  assert.equal(semesterWeek(w('2026-10-05')).kind, 'free');
  assert.equal(semesterWeek(w('2027-04-12')).n, 1, 'summer semester starts at 1 again');
  assert.equal(semesterWeek(w('2028-04-18')).n, 1, 'a Tuesday start still makes that week the first');

  const now = weekInfo(w('2026-10-14'));
  assert.equal(now.title, '1. Vorlesungswoche');
  assert.equal(now.short, 'Woche 1');
  assert.equal(now.range, '12. bis 18. Oktober');
  assert.equal(now.dates, '12.10.–18.10.');
  assert.equal(now.from, '12. Okt.');
  const xmas = weekInfo(w('2026-12-28'));
  assert.equal(xmas.title, 'Weihnachtspause');
  assert.equal(xmas.range, '28. Dezember bis 3. Januar');
  assert.equal(weekInfo(w('2026-09-30')).title, 'Semesterferien');
  assert.equal(relWeek(w('2026-10-05'), w('2026-10-12')), 'letzte Woche');
  assert.equal(relWeek(w('2026-10-26'), w('2026-10-12')), '3. Vorlesungswoche');
});

test('paid out of pocket for the Kasse: the Kasse owes you until it pays you back', () => {
  const soap = { type: 'expense', title: 'Spülmittel', amount: 200, paidBy: KASSE, advancedBy: 'yessu', split: ['yessu', 'felix'] };
  const e = txEffect(soap);
  assert.equal(e.kasse, 0, 'the cash is still in the Kasse');
  assert.equal(owes(e.pairs, KASSE, 'yessu'), 200);
  assert.deepEqual(e.balances, { yessu: 200 });
  assert.deepEqual(debtList(e.pairs), [{ from: KASSE, to: 'yessu', amount: 200 }]);
  const after = computeSummary([soap, { type: 'transfer', title: 'Erstattung aus der Kasse', amount: 200, from: KASSE, to: 'yessu' }]);
  assert.equal(after.kasse, -200, 'now it left the Kasse');
  assert.deepEqual(debtList(after.pairs), []);
  assert.deepEqual(after.balances, {});
  // paid straight from the Kasse: no debt at all
  const direct = txEffect({ type: 'expense', amount: 200, paidBy: KASSE, advancedBy: null, split: ['yessu'] });
  assert.equal(direct.kasse, -200);
  assert.deepEqual(direct.pairs, {});
});
