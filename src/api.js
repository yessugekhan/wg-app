// Every write the app makes, as atomic batches. Money writes always update the
// running summary (meta/summary) in the same batch, so balances never need a full re-read.

import { INC, DEL } from './store/ops.js';
import {
  KASSE, txEffect, effectDiff, negateEffect, addEffects, computeSummary, isEmptyEffect, normalizeText,
  shoppingTitle, dayKey, weekIndex, rebaseRotation, startRotationWith, choreLogId, SUMMARY_VERSION,
} from './model.js';

export const MEMBER_COLORS = 10;

const mapValues = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
const setOp = (path, data, merge = true) => ({ type: 'set', path, data, merge });
const delOp = (path) => ({ type: 'delete', path });
const stripId = ({ id, ...rest }) => rest;

export function nextColor(members) {
  const used = new Set(members.map((m) => m.color));
  for (let i = 0; i < MEMBER_COLORS; i++) if (!used.has(i)) return i;
  return members.length % MEMBER_COLORS;
}

export function sortKey(date, createdAt) {
  return `${date}|${String(createdAt).padStart(13, '0')}`;
}

export function createApi(store) {
  const now = () => Date.now();
  const commit = (ops) => store.commit(ops.filter(Boolean));

  function summaryOp(effect) {
    if (!effect || isEmptyEffect(effect)) return null;
    const data = { updatedAt: now() };
    if (Object.keys(effect.balances).length) data.balances = mapValues(effect.balances, INC);
    if (Object.keys(effect.pairs).length) data.pairs = mapValues(effect.pairs, INC);
    if (effect.kasse) data.kasse = INC(effect.kasse);
    if (Object.keys(effect.contrib).length) data.contrib = mapValues(effect.contrib, (per) => mapValues(per, INC));
    return setOp('meta/summary', data);
  }

  return {
    // ------------------------------------------------------------ WG & people

    /** Creates the WG with all flatmates and starter chores. Returns ids right away (works offline). */
    setupWg({ wgName, names, meIndex = 0, kasseMonthly = 0, chores = [] }) {
      const ts = now();
      const week = weekIndex();
      const members = names
        .map(normalizeText)
        .filter(Boolean)
        .map((name, i) => ({ id: store.newId(), name, color: i % MEMBER_COLORS }));
      const ids = members.map((m) => m.id);
      const ops = [
        setOp('meta/wg', { name: normalizeText(wgName) || 'Unsere WG', kasseMonthly, createdAt: ts, version: 1 }),
        setOp('meta/summary', { createdAt: ts, v: SUMMARY_VERSION }),
        // createdAt + i keeps the order people were entered in
        ...members.map((m, i) => setOp(`members/${m.id}`, { name: m.name, color: m.color, active: true, createdAt: ts + i }, false)),
      ];
      chores.forEach((c, i) => {
        ops.push(
          setOp(
            `chores/${store.newId()}`,
            {
              name: normalizeText(c.name),
              icon: c.icon || '🧽',
              everyWeeks: c.everyWeeks || 1,
              ...startRotationWith(ids, ids[i % ids.length], week),
              active: true,
              createdAt: ts + i,
            },
            false,
          ),
        );
      });
      return { meId: ids[meIndex] ?? ids[0], memberIds: ids, done: commit(ops) };
    },

    updateWg(patch) {
      return commit([setOp('meta/wg', patch)]);
    },

    /** New flatmate; they queue at the end of every chore rotation. */
    addMember(name, { members, chores }) {
      const id = store.newId();
      const week = weekIndex();
      const ops = [
        setOp(`members/${id}`, { name: normalizeText(name), color: nextColor(members), active: true, createdAt: now() }, false),
      ];
      for (const c of chores) ops.push(setOp(`chores/${c.id}`, rebaseRotation(c, [...(c.rotation || []), id], week)));
      return { id, done: commit(ops) };
    },

    renameMember(id, name) {
      return commit([setOp(`members/${id}`, { name: normalizeText(name) })]);
    },

    /** Moving out keeps the history but takes the person out of chore rotations. */
    setMemberActive(member, active, { chores }) {
      const week = weekIndex();
      const ops = [setOp(`members/${member.id}`, { active })];
      for (const c of chores) {
        const rot = c.rotation || [];
        const next = active
          ? rot.includes(member.id) ? rot : [...rot, member.id]
          : rot.filter((x) => x !== member.id);
        if (next.length !== rot.length) ops.push(setOp(`chores/${c.id}`, rebaseRotation(c, next, week)));
      }
      return commit(ops);
    },

    // ------------------------------------------------------------ shopping list

    addItem({ text, kasse, by, at }) {
      const t = normalizeText(text);
      if (!t) return Promise.resolve();
      return commit([
        setOp(`items/${store.newId()}`, { text: t, kasse: !!kasse, addedBy: by, addedAt: at || now(), state: 'open' }, false),
      ]);
    },

    editItem(id, { text, kasse }) {
      const data = {};
      if (text !== undefined) data.text = normalizeText(text);
      if (kasse !== undefined) data.kasse = !!kasse;
      return commit([setOp(`items/${id}`, data)]);
    },

    deleteItem(id) {
      return commit([delOp(`items/${id}`)]);
    },

    restoreItem(item) {
      return commit([setOp(`items/${item.id}`, stripId(item), false)]);
    },

    claimItem(id, memberId) {
      return commit([setOp(`items/${id}`, { claimedBy: memberId || DEL() })]);
    },

    /** Ticking an item while shopping puts it into "my basket"; ticking again takes it out. */
    toggleCart(item, me) {
      const data = item.state === 'cart'
        ? { state: 'open', cartBy: DEL(), cartAt: DEL() }
        : { state: 'cart', cartBy: me, cartAt: now() };
      return commit([setOp(`items/${item.id}`, data)]);
    },

    /**
     * Finishes a shopping trip. groups: [{ items, amount (cents or null), paidBy, split }].
     * A group with an amount becomes one expense; items are marked bought either way.
     */
    completeShopping({ me, groups, allIds }) {
      const ts = now();
      const date = dayKey();
      const ops = [];
      const effects = [];
      for (const g of groups) {
        if (!g.items.length) continue;
        let txId = null;
        if (g.amount > 0) {
          txId = store.newId();
          const paidBy = g.paidBy || me;
          const tx = {
            type: 'expense',
            kind: 'shopping',
            title: shoppingTitle(g.items.map((i) => i.text)),
            amount: g.amount,
            paidBy,
            ...(paidBy === KASSE && g.advancedBy ? { advancedBy: g.advancedBy } : {}),
            split: paidBy === KASSE || !g.split?.length ? allIds : g.split,
            date,
            createdBy: me,
            createdAt: ts,
            sortKey: sortKey(date, ts),
            itemIds: g.items.map((i) => i.id),
          };
          ops.push(setOp(`tx/${txId}`, tx, false));
          effects.push(txEffect(tx));
        }
        for (const it of g.items) {
          ops.push(
            setOp(`items/${it.id}`, {
              state: 'bought',
              boughtBy: me,
              boughtAt: ts,
              txId: txId || DEL(),
              cartBy: DEL(),
              cartAt: DEL(),
              claimedBy: DEL(),
            }),
          );
        }
      }
      ops.push(summaryOp(addEffects(...effects)));
      return commit(ops);
    },

    // ------------------------------------------------------------ money

    addTx(tx, me) {
      const ts = tx.createdAt || now();
      const date = tx.date || dayKey();
      const data = { ...tx, date, createdBy: me, createdAt: ts, sortKey: sortKey(date, ts) };
      return commit([setOp(`tx/${store.newId()}`, data, false), summaryOp(txEffect(data))]);
    },

    updateTx(oldTx, patch, me) {
      const base = stripId(oldTx);
      const date = patch.date || base.date;
      const next = { ...base, ...patch, date, sortKey: sortKey(date, base.createdAt), updatedAt: now(), updatedBy: me };
      return commit([setOp(`tx/${oldTx.id}`, next, false), summaryOp(effectDiff(next, base))]);
    },

    deleteTx(tx) {
      return commit([delOp(`tx/${tx.id}`), summaryOp(negateEffect(txEffect(stripId(tx))))]);
    },

    /** Rebuilds all totals from every transaction (repair tool, and upgrade of older summaries). Needs a live connection. */
    async recomputeSummary() {
      const txs = await store.getCollection('tx', {}, { server: true });
      const s = computeSummary(txs);
      const ts = now();
      await commit([
        setOp(
          'meta/summary',
          { balances: s.balances, pairs: s.pairs, kasse: s.kasse, contrib: s.contrib, v: SUMMARY_VERSION, updatedAt: ts, recomputedAt: ts },
          false,
        ),
      ]);
      return s;
    },

    // ------------------------------------------------------------ chores

    addChore({ name, icon, everyWeeks, rotation, startWith }) {
      const week = weekIndex();
      return commit([
        setOp(
          `chores/${store.newId()}`,
          {
            name: normalizeText(name),
            icon: icon || '🧽',
            everyWeeks: everyWeeks || 1,
            ...startRotationWith(rotation, startWith || rotation[0], week),
            active: true,
            createdAt: now(),
          },
          false,
        ),
      ]);
    },

    /** reschedule: rotation, start person or interval changed -> anchor at this week. */
    updateChore(chore, { name, icon, everyWeeks, rotation, startWith, reschedule }) {
      const data = { name: normalizeText(name), icon: icon || chore.icon, everyWeeks: everyWeeks || 1 };
      if (reschedule) Object.assign(data, startRotationWith(rotation, startWith || rotation[0], weekIndex()));
      return commit([setOp(`chores/${chore.id}`, data)]);
    },

    deleteChore(id) {
      return commit([delOp(`chores/${id}`)]);
    },

    markChoreDone(chore, week, me) {
      return commit([
        setOp(`choreLog/${choreLogId(chore.id, week)}`, { choreId: chore.id, week, doneBy: me, doneAt: now() }),
      ]);
    },

    undoChoreDone(chore, week) {
      return commit([
        setOp(`choreLog/${choreLogId(chore.id, week)}`, { choreId: chore.id, week, doneBy: DEL(), doneAt: DEL() }),
      ]);
    },

    /** Someone else takes over this week's turn (swap). memberId null restores the rotation. */
    setChoreOverride(chore, week, memberId) {
      return commit([
        setOp(`choreLog/${choreLogId(chore.id, week)}`, { choreId: chore.id, week, assignee: memberId || DEL() }),
      ]);
    },

    // ------------------------------------------------------------ pinboard

    addPost({ text, pinned, author, at }) {
      const t = String(text || '').trim();
      if (!t) return Promise.resolve();
      return commit([
        setOp(`posts/${store.newId()}`, { text: t, pinned: !!pinned, author, createdAt: at || now() }, false),
      ]);
    },

    editPost(id, text) {
      return commit([setOp(`posts/${id}`, { text: String(text || '').trim(), editedAt: now() })]);
    },

    setPinned(id, pinned) {
      return commit([setOp(`posts/${id}`, { pinned: !!pinned })]);
    },

    toggleAck(post, me) {
      return commit([setOp(`posts/${post.id}`, { acks: { [me]: post.acks?.[me] ? DEL() : true } })]);
    },

    deletePost(id) {
      return commit([delOp(`posts/${id}`)]);
    },
  };
}
