import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../src/store/local.js';
import { createApi } from '../src/api.js';
import { KASSE, computeSummary, summariesEqual, weekIndex, choreAssignee, settlePlan } from '../src/model.js';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

async function fresh() {
  const store = createLocalStore('t' + Math.random(), { storage: memStorage(), sync: false });
  return { store, api: createApi(store) };
}

const all = (store, coll, opts) => store.getCollection(coll, opts);
async function summary(store) {
  return (await all(store, 'meta')).find((d) => d.id === 'summary');
}
const norm = (s) => ({ balances: s.balances || {}, kasse: s.kasse || 0, contrib: s.contrib || {} });
const nz = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== 0));

test('setup creates members and staggered chores', async () => {
  const { store, api } = await fresh();
  const { meId, memberIds, done } = api.setupWg({
    wgName: '  Kies 129 ', names: ['Yessu', 'Anna', ' Ben '], kasseMonthly: 1000,
    chores: [{ name: 'Bad', icon: '🚿' }, { name: 'Küche', icon: '🍳' }, { name: 'Müll', icon: '🗑️', everyWeeks: 2 }],
  });
  await done;
  const members = await all(store, 'members');
  assert.equal(members.length, 3);
  assert.equal(meId, memberIds[0]);
  assert.deepEqual(members.map((m) => m.name).sort(), ['Anna', 'Ben', 'Yessu']);
  const wg = (await all(store, 'meta')).find((d) => d.id === 'wg');
  assert.equal(wg.name, 'Kies 129');
  assert.equal(wg.kasseMonthly, 1000);
  const chores = await all(store, 'chores');
  const w = weekIndex();
  const assignees = chores.map((c) => choreAssignee(c, w)).sort();
  assert.deepEqual(assignees, [...memberIds].sort(), 'each chore starts with a different person');
});

test('shopping trip with Kasse and shared items updates the books atomically', async () => {
  const { store, api } = await fresh();
  const { meId: me, memberIds: ids, done } = api.setupWg({ wgName: 'X', names: ['A', 'B', 'C'] });
  await done;
  await api.addItem({ text: 'Klopapier', kasse: true, by: me });
  await api.addItem({ text: 'Milch', kasse: false, by: ids[1] });
  await api.addItem({ text: 'Brot', kasse: false, by: ids[2] });
  await api.addItem({ text: '   ', kasse: false, by: me }); // ignored
  let open = await all(store, 'items', { where: [['state', 'in', ['open', 'cart']]] });
  assert.equal(open.length, 3);
  await api.claimItem(open.find((i) => i.text === 'Milch').id, ids[1]);
  for (const it of open) await api.toggleCart(it, me);
  open = await all(store, 'items', { where: [['state', '==', 'cart']] });
  assert.equal(open.length, 3);
  const kasseItems = open.filter((i) => i.kasse);
  const shared = open.filter((i) => !i.kasse);
  await api.completeShopping({
    me, allIds: ids,
    groups: [
      { items: kasseItems, amount: 399, paidBy: KASSE },
      { items: shared, amount: 1200, paidBy: me, split: ids },
    ],
  });
  const items = await all(store, 'items');
  assert.ok(items.every((i) => i.state === 'bought' && i.boughtBy === me && !('cartBy' in i) && !('claimedBy' in i)));
  const txs = await all(store, 'tx');
  assert.equal(txs.length, 2);
  assert.ok(txs.some((t) => t.title === 'Milch, Brot' || t.title === 'Brot, Milch'));
  const s = await summary(store);
  assert.equal(s.kasse, -399);
  assert.deepEqual(s.balances, { [me]: 800, [ids[1]]: -400, [ids[2]]: -400 });
  assert.ok(summariesEqual(norm(s), computeSummary(txs)));
  const bought = await all(store, 'items', { orderBy: ['boughtAt', 'desc'], limit: 10 });
  assert.equal(bought.length, 3);
});

test('edit, delete and repair keep the running summary exact', async () => {
  const { store, api } = await fresh();
  const { meId: a, memberIds: ids, done } = api.setupWg({ wgName: 'X', names: ['A', 'B', 'C'], kasseMonthly: 1000 });
  await done;
  const [, b, c] = ids;
  await api.addTx({ type: 'deposit', amount: 1000, member: a, month: '2026-10', title: 'Beitrag' }, a);
  await api.addTx({ type: 'deposit', amount: 1000, member: b, month: '2026-10', title: 'Beitrag' }, b);
  await api.addTx({ type: 'expense', amount: 3000, paidBy: a, split: ids, title: 'Rewe' }, a);
  await api.addTx({ type: 'expense', amount: 1001, paidBy: c, split: [b, c], title: 'Pizza' }, c);
  await api.addTx({ type: 'expense', amount: 650, paidBy: KASSE, split: ids, title: 'Spüli' }, b);
  let txs = await all(store, 'tx');
  let s = await summary(store);
  assert.ok(summariesEqual(norm(s), computeSummary(txs)));
  assert.equal(s.kasse, 1350);
  assert.deepEqual(s.contrib, { '2026-10': { [a]: 1000, [b]: 1000 } });

  const rewe = txs.find((t) => t.title === 'Rewe');
  await api.updateTx(rewe, { amount: 2400, paidBy: b, split: [a, b] }, a);
  const pizza = txs.find((t) => t.title === 'Pizza');
  await api.deleteTx(pizza);
  txs = await all(store, 'tx');
  s = await summary(store);
  assert.equal(txs.length, 4);
  assert.ok(summariesEqual(norm(s), computeSummary(txs)));
  assert.deepEqual(nz(s.balances), { [a]: -1200, [b]: 1200 });

  // settle up via the suggested transfers
  for (const p of settlePlan(nz(s.balances))) await api.addTx({ type: 'transfer', ...p, title: 'Ausgleich' }, a);
  s = await summary(store);
  assert.deepEqual(nz(s.balances), {});

  // corrupt the summary, then repair it from the transactions
  await store.commit([{ type: 'set', path: 'meta/summary', data: { balances: { [a]: 999 }, kasse: 1 }, merge: true }]);
  const repaired = await api.recomputeSummary();
  s = await summary(store);
  assert.ok(summariesEqual(norm(s), repaired));
  assert.ok(summariesEqual(norm(s), computeSummary(await all(store, 'tx'))));
  // sortKey orders by date, then by creation time
  const ordered = await all(store, 'tx', { orderBy: ['sortKey', 'desc'] });
  assert.equal(ordered.length, 5); // 2 deposits, Rewe, Spüli, 1 settlement
});

test('members joining and moving out keep the chore plan stable', async () => {
  const { store, api } = await fresh();
  const { memberIds: ids, done } = api.setupWg({ wgName: 'X', names: ['A', 'B', 'C'], chores: [{ name: 'Bad' }] });
  await done;
  const w = weekIndex();
  let [chore] = await all(store, 'chores');
  const before = choreAssignee(chore, w);
  let members = await all(store, 'members');
  const { id: d, done: d2 } = api.addMember('Deniz', { members, chores: [chore] });
  await d2;
  [chore] = await all(store, 'chores');
  assert.equal(chore.rotation.length, 4);
  assert.ok(chore.rotation.includes(d));
  assert.equal(choreAssignee(chore, w), before, 'current turn unchanged');
  members = await all(store, 'members');
  assert.equal(new Set(members.map((m) => m.color)).size, 4, 'distinct colors');

  const leaving = members.find((m) => m.id === before);
  await api.setMemberActive(leaving, false, { chores: [chore] });
  [chore] = await all(store, 'chores');
  assert.equal(chore.rotation.length, 3);
  assert.ok(!chore.rotation.includes(before));
  assert.ok(choreAssignee(chore, w));
  assert.equal((await all(store, 'members')).find((m) => m.id === before).active, false);
});

test('chore log: done, undo, swap', async () => {
  const { store, api } = await fresh();
  const { memberIds: ids, done } = api.setupWg({ wgName: 'X', names: ['A', 'B'], chores: [{ name: 'Bad' }] });
  await done;
  const [chore] = await all(store, 'chores');
  const w = weekIndex();
  await api.markChoreDone(chore, w, ids[1]);
  let [log] = await all(store, 'choreLog');
  assert.equal(log.id, `${chore.id}_${w}`);
  assert.equal(log.doneBy, ids[1]);
  await api.undoChoreDone(chore, w);
  [log] = await all(store, 'choreLog');
  assert.equal(log.doneBy, undefined);
  await api.setChoreOverride(chore, w, ids[0]);
  [log] = await all(store, 'choreLog');
  assert.equal(log.assignee, ids[0]);
  await api.setChoreOverride(chore, w, null);
  [log] = await all(store, 'choreLog');
  assert.equal(log.assignee, undefined);
  const recent = await all(store, 'choreLog', { where: [['week', '>=', w - 8]] });
  assert.equal(recent.length, 1);
});

test('pinboard: post, pin, ack toggles', async () => {
  const { store, api } = await fresh();
  const { meId: me, memberIds: ids, done } = api.setupWg({ wgName: 'X', names: ['A', 'B'] });
  await done;
  await api.addPost({ text: '  Handwerker kommt Samstag  ', pinned: false, author: me });
  let [p] = await all(store, 'posts');
  assert.equal(p.text, 'Handwerker kommt Samstag');
  await api.setPinned(p.id, true);
  await api.toggleAck(p, ids[1]);
  [p] = await all(store, 'posts');
  assert.equal(p.pinned, true);
  assert.deepEqual(p.acks, { [ids[1]]: true });
  await api.toggleAck(p, ids[1]);
  [p] = await all(store, 'posts');
  assert.deepEqual(p.acks, {});
  const pinned = await all(store, 'posts', { where: [['pinned', '==', true]] });
  assert.equal(pinned.length, 1);
});

test('local store notifies watchers once per real change', async () => {
  const { store, api } = await fresh();
  const seen = [];
  const stop = store.watchCollection('items', { where: [['state', 'in', ['open', 'cart']]] }, (docs) => seen.push(docs.length));
  await new Promise((r) => setTimeout(r, 5));
  await api.addItem({ text: 'Milch', by: 'x' });
  await api.addItem({ text: 'Brot', by: 'x' });
  await api.updateWg({ name: 'Y' }); // other collection: no callback
  await new Promise((r) => setTimeout(r, 5));
  stop();
  await api.addItem({ text: 'Eier', by: 'x' });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(seen, [0, 1, 2]);
});
