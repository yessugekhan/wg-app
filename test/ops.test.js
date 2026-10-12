import test from 'node:test';
import assert from 'node:assert/strict';
import { INC, DEL, mapOps, applySet, runQuery } from '../src/store/ops.js';

test('mapOps turns sentinels into store values, deep and without undefined', () => {
  const out = mapOps(
    { a: INC(5), b: { c: INC(-2), d: DEL(), e: [1, 2] }, f: undefined, g: null, h: 'x' },
    { inc: (n) => ['inc', n], del: () => 'DEL' },
  );
  assert.deepEqual(out, { a: ['inc', 5], b: { c: ['inc', -2], d: 'DEL', e: [1, 2] }, g: null, h: 'x' });
});

test('applySet merge semantics match Firestore', () => {
  const cur = { n: 1, m: { x: 1, y: 2 }, arr: [1, 2], keep: true };
  assert.deepEqual(applySet(cur, { n: INC(2), m: { y: DEL(), z: 3 }, arr: [9] }, true),
    { n: 3, m: { x: 1, z: 3 }, arr: [9], keep: true });
  assert.deepEqual(applySet(cur, { n: INC(2) }, false), { n: 2 });
  assert.deepEqual(cur, { n: 1, m: { x: 1, y: 2 }, arr: [1, 2], keep: true }, 'input untouched');
});

test('runQuery drops docs without the orderBy field, like Firestore', () => {
  const docs = [{ id: 'a', t: 2 }, { id: 'b' }, { id: 'c', t: 5 }, { id: 'd', t: 1 }];
  assert.deepEqual(runQuery(docs, { orderBy: ['t', 'desc'], limit: 2 }).map((d) => d.id), ['c', 'a']);
  assert.deepEqual(runQuery(docs, { where: [['t', '>=', 2]] }).map((d) => d.id), ['a', 'c']);
  assert.deepEqual(runQuery(docs, { where: [['t', 'in', [1, 5]]] }).map((d) => d.id), ['c', 'd']);
});
