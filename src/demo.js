// Example WG for the demo: realistic enough to show every screen with content.

import { KASSE, dayKey, monthKey, weekIndex, choreAssignee, choreDue, choreLogId } from './model.js';

export async function seedDemo(api, store) {
  const now = Date.now();
  const MIN = 60e3;
  const H = 60 * MIN;
  const D = 24 * H;
  const ago = (ms) => now - ms;
  const day = (ms) => dayKey(new Date(now - ms));
  const set = (path, data, merge = false) => ({ type: 'set', path, data, merge });

  const { memberIds, done } = api.setupWg({
    wgName: 'WG Martinsviertel',
    names: ['Anna', 'Ben', 'Clara', 'Deniz'],
    kasseMonthly: 1000,
    chores: [
      { name: 'Bad', icon: '🚿' },
      { name: 'Küche', icon: '🍳' },
      { name: 'Müll & Pfand', icon: '🗑️' },
      { name: 'Flur & Boden', icon: '🧹', everyWeeks: 2 },
    ],
  });
  await done;
  const [anna, ben, clara, deniz] = memberIds;

  // The WG exists for a while already
  const chores = await store.getCollection('chores');
  const order = ['Bad', 'Küche', 'Müll & Pfand', 'Flur & Boden'];
  await store.commit(chores.map((c) => set(`chores/${c.id}`, { createdAt: ago(40 * D) + order.indexOf(c.name) }, true)));
  await store.commit(memberIds.map((id, i) => set(`members/${id}`, { createdAt: ago(60 * D) + i }, true)));
  await store.commit([set('meta/wg', { createdAt: ago(60 * D) }, true)]);

  // Shopping list
  const open = [
    ['Hafermilch', false, ben, 5 * H],
    ['Klopapier', true, clara, 26 * H],
    ['Spülmittel', true, anna, 3 * H],
    ['Tomaten', false, deniz, 50 * MIN],
    ['Brot', false, anna, 20 * MIN],
  ];
  for (const [text, kasse, by, t] of open) await api.addItem({ text, kasse, by, at: ago(t) });
  const items = await store.getCollection('items');
  const tomaten = items.find((i) => i.text === 'Tomaten');
  await api.claimItem(tomaten.id, ben);

  const bought = [
    ['Milch', false, anna, 1 * D],
    ['Haferflocken', false, ben, 2 * D],
    ['Eier', false, deniz, 3 * D],
    ['Müllbeutel', true, clara, 4 * D],
    ['Kaffee', false, anna, 5 * D],
    ['Nudeln', false, clara, 6 * D],
    ['Milch', false, ben, 6 * D + 2 * H],
    ['Klopapier', true, ben, 9 * D],
    ['Kaffee', false, deniz, 13 * D],
    ['Spülmittel', true, anna, 15 * D],
    ['Reis', false, clara, 16 * D],
  ];
  await store.commit(
    bought.map(([text, kasse, by, t]) =>
      set(`items/${store.newId()}`, { text, kasse, addedBy: by, addedAt: ago(t + 6 * H), state: 'bought', boughtBy: by, boughtAt: ago(t) }),
    ),
  );

  // Money: always through the API so the running totals stay exact
  const mk = monthKey(new Date(now));
  const all = memberIds;
  const tx = (data, by, t) => api.addTx({ ...data, date: day(t), createdAt: ago(t) }, by);
  await tx({ type: 'adjust', amount: 1250, title: 'Startbestand' }, anna, 20 * D);
  await tx({ type: 'expense', title: 'Internet Oktober', amount: 3999, paidBy: deniz, split: all, kind: 'manual' }, deniz, 8 * D);
  await tx({ type: 'deposit', title: 'Beitrag', amount: 1000, member: anna, month: mk }, anna, 6 * D);
  await tx({ type: 'deposit', title: 'Beitrag', amount: 1000, member: ben, month: mk }, ben, 5 * D);
  await tx({ type: 'expense', title: 'Müllbeutel, Spülmaschinentabs', amount: 685, paidBy: KASSE, split: all, kind: 'shopping' }, clara, 4 * D);
  await tx({ type: 'expense', title: 'Wocheneinkauf', amount: 3420, paidBy: anna, split: all, kind: 'shopping' }, anna, 3 * D);
  await tx({ type: 'deposit', title: 'Beitrag', amount: 1000, member: clara, month: mk }, clara, 2 * D);
  await tx({ type: 'expense', title: 'Pizza-Abend', amount: 2400, paidBy: ben, split: [ben, clara, deniz], kind: 'manual' }, ben, 1 * D);
  await tx({ type: 'transfer', title: 'Rückzahlung', amount: 500, from: clara, to: anna }, clara, 1 * D - 3 * H);
  await tx({ type: 'expense', title: 'Ofenhandschuhe', amount: 1400, paidBy: clara, split: all, kind: 'manual' }, clara, 7 * H);
  await tx({ type: 'expense', title: 'Glühbirnen', amount: 399, paidBy: KASSE, advancedBy: deniz, split: all, kind: 'manual' }, deniz, 2 * D);
  await api.updateWg({ kasseHolder: ben });

  // Chores: last week mostly done, one thing left open; this week the kitchen is done
  const w = weekIndex(new Date(now));
  const fresh = await store.getCollection('chores');
  const log = [];
  for (const c of fresh) {
    const lastWho = choreDue(c, w - 1) ? choreAssignee(c, w - 1) : null;
    if (lastWho && c.name !== 'Müll & Pfand') {
      log.push(set(`choreLog/${choreLogId(c.id, w - 1)}`, { choreId: c.id, week: w - 1, doneBy: lastWho, doneAt: ago(4 * D) }));
    }
    for (let k = 2; k <= 6; k++) {
      const who = choreDue(c, w - k) ? choreAssignee(c, w - k) : null;
      if (who && (k + c.name.length) % 5) {
        log.push(set(`choreLog/${choreLogId(c.id, w - k)}`, { choreId: c.id, week: w - k, doneBy: who, doneAt: ago(k * 7 * D) }));
      }
    }
    if (c.name === 'Küche' && choreDue(c, w)) {
      log.push(set(`choreLog/${choreLogId(c.id, w)}`, { choreId: c.id, week: w, doneBy: choreAssignee(c, w), doneAt: ago(5 * H) }));
    }
  }
  if (log.length) await store.commit(log);

  // Pinboard
  const post = (text, author, t, pinned = false, acks = []) =>
    set(`posts/${store.newId()}`, { text, author, createdAt: ago(t), pinned, acks: Object.fromEntries(acks.map((id) => [id, true])) });
  await store.commit([
    post('Das WLAN-Passwort hängt innen an der Kühlschranktür. Bitte nicht in den Gruppenchat posten.', clara, 20 * D, true, [anna, ben, deniz]),
    post('Müllabfuhr: Restmüll dienstags, Bio und Gelber Sack donnerstags. Papier alle zwei Wochen freitags.', anna, 9 * D, true, [ben, clara]),
    post('Wer hat meinen großen Topf? Er steht nicht mehr im Schrank 🙃', ben, 1 * D, false, [clara]),
    post('Samstag zwischen 10 und 12 kommt der Handwerker wegen der Heizung im Bad. Kann jemand aufmachen?', deniz, 2 * H, false, [ben]),
  ]);
}
