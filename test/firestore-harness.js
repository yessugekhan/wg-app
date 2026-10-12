// Runs the real Firestore SDK in a browser without a backend. Writes then live only in the local
// cache (latency compensation), which still exercises every SDK call the app makes: batched
// set/merge, increment(), deleteField(), 'in' / '>=' / '==' filters, orderBy + limit.
import { createFirestoreStore } from '../src/store/firestore.js';
import { createApi } from '../src/api.js';
import { KASSE, weekIndex, computeSummary, summariesEqual, summaryOf, owes, SUMMARY_VERSION } from '../src/model.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

window.runHarness = async () => {
  const out = { checks: [], errors: [] };
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, detail });
  const store = createFirestoreStore(
    { apiKey: 'test-key', authDomain: 'demo-wg.firebaseapp.com', projectId: 'demo-wg-harness', appId: '1:1:web:1' },
    'HarnessWG0123456789abcd',
  );
  const api = createApi(store);
  const pending = [];
  const fire = (p) => pending.push(p.catch((e) => out.errors.push(`${e.code || e.message}`)));

  // live views, like the app keeps them
  const live = {};
  const errs = [];
  const watch = (key, path, opts) =>
    store.watchCollection(path, opts, (docs, m) => (live[key] = { docs, m }), (e) => errs.push(`${key}: ${e.code}`));
  const watchDoc = (key, path) => store.watchDoc(path, (d, m) => (live[key] = { d, m }), (e) => errs.push(`${key}: ${e.code}`));
  watch('members', 'members', {});
  watch('open', 'items', { where: [['state', 'in', ['open', 'cart']]] });
  watch('bought', 'items', { orderBy: ['boughtAt', 'desc'], limit: 60 });
  watch('tx', 'tx', { orderBy: ['sortKey', 'desc'], limit: 80 });
  watch('chores', 'chores', {});
  watch('log', 'choreLog', { where: [['week', '>=', weekIndex() - 9]] });
  watch('posts', 'posts', { orderBy: ['createdAt', 'desc'], limit: 60 });
  watch('pinned', 'posts', { where: [['pinned', '==', true]] });
  watchDoc('wg', 'meta/wg');
  watchDoc('summary', 'meta/summary');

  const setup = api.setupWg({ wgName: 'Harness', names: ['A', 'B', 'C'], kasseMonthly: 1000, chores: [{ name: 'Bad' }, { name: 'Küche' }] });
  fire(setup.done);
  const [a, b, c] = setup.memberIds;
  await wait(300);
  check('members visible from local cache', live.members?.docs.length === 3, live.members?.docs.length);
  check('wg doc', live.wg?.d?.name === 'Harness', live.wg?.d);
  check('snapshots flag pending writes', live.members?.m.pending === true, live.members?.m);

  fire(api.addItem({ text: 'Milch', by: a }));
  fire(api.addItem({ text: 'Klopapier', kasse: true, by: b }));
  fire(api.addItem({ text: 'Brot', by: c }));
  await wait(200);
  check("'in' query on items", live.open?.docs.length === 3, live.open?.docs.length);
  const [i1, i2] = live.open.docs;
  fire(api.claimItem(i1.id, b));
  fire(api.toggleCart(i1, a));
  fire(api.toggleCart(i2, a));
  await wait(200);
  const carted = live.open.docs.filter((d) => d.state === 'cart');
  check('cart via set-merge', carted.length === 2 && carted.every((d) => d.cartBy === a), carted);
  fire(api.toggleCart(carted[1], a));
  await wait(200);
  const back = live.open.docs.find((d) => d.id === carted[1].id);
  check('deleteField removes cart fields', back.state === 'open' && !('cartBy' in back) && !('cartAt' in back), back);

  const cart = live.open.docs.filter((d) => d.state === 'cart');
  fire(api.completeShopping({ me: a, allIds: [a, b, c], groups: [{ items: cart, amount: 900, paidBy: a, split: [a, b, c] }] }));
  await wait(250);
  check('bought items leave the open query', live.open.docs.length === 2, live.open.docs.map((d) => d.text));
  check('orderBy boughtAt + limit', live.bought?.docs.length === 1 && live.bought.docs[0].boughtBy === a && !('claimedBy' in live.bought.docs[0]), live.bought?.docs);
  check('increment() on nested summary', live.summary?.d?.balances?.[a] === 600 && live.summary.d.balances[b] === -300, live.summary?.d);
  check('per-person debts under "a|b" keys', owes(live.summary.d.pairs, b, a) === 300 && owes(live.summary.d.pairs, c, a) === 300 && live.summary.d.v === SUMMARY_VERSION, live.summary.d.pairs);

  fire(api.addTx({ type: 'deposit', amount: 1000, member: b, month: '2026-10', title: 'Beitrag' }, b));
  fire(api.addTx({ type: 'expense', amount: 450, paidBy: KASSE, split: [a, b, c], title: 'Spüli' }, c));
  fire(api.addTx({ type: 'transfer', amount: 300, from: b, to: a, title: 'Rückzahlung' }, b));
  await wait(250);
  const s1 = live.summary.d;
  check('summary after deposit, Kasse expense, transfer', s1.kasse === 550 && s1.balances[a] === 300 && s1.balances[b] === 0 && s1.contrib['2026-10'][b] === 1000, s1);
  check('paying back settles exactly that pair', owes(s1.pairs, b, a) === 0 && owes(s1.pairs, c, a) === 300, s1.pairs);
  const keys = live.tx.docs.map((t) => t.sortKey);
  check('tx ordered by sortKey desc', live.tx.docs.length === 4 && keys.every((k, i) => i === 0 || keys[i - 1] >= k), keys);
  const exp = live.tx.docs.find((t) => t.type === 'expense' && t.paidBy === a);
  fire(api.updateTx(exp, { amount: 1200 }, a));
  await wait(200);
  check('edit applies the difference', live.summary.d.balances[a] === 500, live.summary.d.balances);
  fire(api.deleteTx(live.tx.docs.find((t) => t.type === 'transfer')));
  await wait(200);
  const sNow = live.summary.d;
  check('running summary equals recomputed one', summariesEqual(summaryOf(sNow), computeSummary(live.tx.docs)), sNow);

  const [ch] = live.chores.docs;
  const w = weekIndex();
  fire(api.markChoreDone(ch, w, b));
  fire(api.setChoreOverride(ch, w + 1, c));
  await wait(200);
  check("'>=' query on chore log", live.log.docs.length === 2, live.log.docs);
  fire(api.undoChoreDone(ch, w));
  await wait(200);
  const lg = live.log.docs.find((d) => d.week === w);
  check('undo removes doneBy', lg && !('doneBy' in lg), lg);

  fire(api.addPost({ text: 'Hallo', pinned: true, author: a }));
  await wait(200);
  const post = live.posts.docs[0];
  fire(api.toggleAck(post, b));
  await wait(150);
  const acked = live.posts.docs[0];
  check('ack map', acked.acks?.[b] === true, acked);
  fire(api.toggleAck(acked, b));
  await wait(150);
  check('nested deleteField in ack map', live.posts.docs[0].acks && !(b in live.posts.docs[0].acks), live.posts.docs[0]);
  check("'==' query for pinned", live.pinned.docs.length === 1, live.pinned.docs.length);

  const { id: d, done } = api.addMember('D', { members: live.members.docs, chores: live.chores.docs });
  fire(done);
  await wait(200);
  check('new member joins rotations', live.chores.docs.every((x) => x.rotation.includes(d)), live.chores.docs.map((x) => x.rotation));

  out.listenerErrors = errs;
  out.pendingCommits = pending.length;
  return out;
};
