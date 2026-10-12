// App state: one signal per live query, plus derived values. Components read signals directly.

import { signal, computed, effect } from '@preact/signals';
import { createLocalStore, safeLocalStorage } from './store/local.js';
import { createApi } from './api.js';
import { weekIndex, debtList, SUMMARY_VERSION } from './model.js';

export const TABS = ['liste', 'geld', 'putzen', 'pinnwand', 'wg'];

/** Non-reactive handles to the active store. */
export const ctx = { store: null, api: null, wgId: null, kind: null };

const storage = safeLocalStorage();
export const readLS = (k) => {
  try {
    return storage.getItem(k);
  } catch {
    return null;
  }
};
export const writeLS = (k, v) => {
  try {
    if (v == null) storage.removeItem(k);
    else storage.setItem(k, String(v));
  } catch {
    /* blocked storage: the app still works for this visit */
  }
};
const lsKey = (k) => `wgapp:${ctx.wgId}:${k}`;

// ---------------------------------------------------------------- raw data

export const needJoin = signal(false);
export const connected = signal(false);
export const route = signal('liste');
export const wg = signal(undefined); // undefined = loading, null = not set up yet
export const summary = signal(null);
export const members = signal([]);
export const membersReady = signal(false);
export const openItems = signal([]);
export const boughtItems = signal([]);
export const txs = signal([]);
export const txsReady = signal(false);
export const txLimit = signal(80);
export const boughtLimit = signal(60);
export const chores = signal([]);
export const choreLog = signal([]);
/** How many weeks of the chore log are loaded (history grows on demand). */
export const choreWeeks = signal(10);
/** Another tab asks Geld to open a form right away, e.g. { mode: 'expense' }. */
export const pendingForm = signal(null);
export const posts = signal([]);
export const pinnedPosts = signal([]);
export const meId = signal(null);
export const sync = signal({
  offline: typeof navigator !== 'undefined' && navigator.onLine === false,
  pending: false,
  fromCache: false,
  error: null,
});
export const clock = signal(Date.now());
export const seen = signal({});
export const visitSeen = signal({});
export const toasts = signal([]);
export const theme = signal(readLS('wgapp:theme') || 'light');
export const installPrompt = signal(null);

// ---------------------------------------------------------------- derived

const byJoined = (a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.name).localeCompare(String(b.name), 'de');

export const memberMap = computed(() => Object.fromEntries(members.value.map((m) => [m.id, m])));
export const activeMembers = computed(() => members.value.filter((m) => m.active !== false).sort(byJoined));
export const formerMembers = computed(() => members.value.filter((m) => m.active === false).sort(byJoined));
export const me = computed(() => memberMap.value[meId.value] || null);

/** One letter per person, two when first letters collide (Anna/Alex -> An/Al). */
export const initials = computed(() => {
  const list = members.value;
  const first = (m) => (String(m.name || '?').trim()[0] || '?').toUpperCase();
  const counts = {};
  for (const m of list) counts[first(m)] = (counts[first(m)] || 0) + 1;
  const out = {};
  for (const m of list) {
    const f = first(m);
    if (counts[f] < 2) out[m.id] = f;
    else {
      const parts = String(m.name).trim().split(/\s+/);
      out[m.id] = parts.length > 1 ? f + parts[1][0].toUpperCase() : f + (parts[0][1] || '').toLowerCase();
    }
  }
  return out;
});

export const balances = computed(() =>
  Object.fromEntries(Object.entries(summary.value?.balances || {}).filter(([, v]) => v)),
);
/** Who owes whom, straight from the purchases (no netting across people). */
export const debts = computed(() => debtList(summary.value?.pairs));
export const currentWeek = computed(() => weekIndex(new Date(clock.value)));

export const screen = computed(() => {
  if (needJoin.value) return 'join';
  if (!connected.value || wg.value === undefined) return 'loading';
  if (wg.value === null) return ctx.kind === 'local' ? 'demo' : 'setup';
  if (!membersReady.value) return 'loading';
  if (!me.value) return 'who';
  return 'app';
});

// ---------------------------------------------------------------- helpers

export function name(id, { cap = false } = {}) {
  if (id === meId.value) return cap ? 'Du' : 'du';
  return memberMap.value[id]?.name || 'Jemand';
}
/** Dative and accusative forms: "von dir", "für dich". */
export const nameDat = (id) => (id === meId.value ? 'dir' : memberMap.value[id]?.name || 'jemandem');
export const nameAcc = (id) => (id === meId.value ? 'dich' : memberMap.value[id]?.name || 'jemanden');

/** "Anna", "Anna und Ben", "Anna, Ben und Clara". */
export function joinNames(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}`;
}

/** One message at a time: a newer toast replaces the older one instead of stacking over the UI. */
export function toast(text, { action, onAction, ms = action ? 5000 : 3200 } = {}) {
  const id = Math.random().toString(36).slice(2);
  toasts.value = [{ id, text, action, onAction }];
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

/** Fire-and-forget writes: the UI never waits (offline writes resolve only after sync). */
export function run(promise, what = 'Speichern') {
  promise?.catch?.((e) => {
    console.error(e);
    const reason = e?.code === 'permission-denied' ? 'kein Zugriff' : e?.code || e?.message || 'unbekannter Fehler';
    toast(`${what} fehlgeschlagen (${reason}).`);
  });
  return promise;
}

export function selectMe(id) {
  // a new device starts with nothing marked as "neu"
  const now = Date.now();
  const s = { ...seen.peek() };
  for (const t of TABS) if (!s[t]) s[t] = now;
  seen.value = s;
  writeLS(lsKey('seen'), JSON.stringify(s));
  writeLS(lsKey('me'), id);
  meId.value = id;
}

export function forgetMe() {
  meId.value = null;
  writeLS(lsKey('me'), null);
}

export function inviteLink() {
  const base = location.href.split('#')[0];
  return ctx.kind === 'firestore' ? `${base}#wg=${ctx.wgId}` : base;
}

// ---------------------------------------------------------------- routing

function parseHash() {
  const p = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  return { wg: p.get('wg'), tab: p.get('tab') };
}

function writeHash(tab) {
  const p = new URLSearchParams();
  if (ctx.kind === 'firestore' && ctx.wgId) p.set('wg', ctx.wgId); // keeps "Add to Home Screen" pointing at this WG
  p.set('tab', tab);
  try {
    history.replaceState(null, '', `#${p.toString()}`);
  } catch {
    /* sandboxed frames */
  }
}

export function go(tab) {
  if (!TABS.includes(tab)) tab = 'liste';
  route.value = tab;
  writeHash(tab);
  window.scrollTo?.({ top: 0 });
}

// "neu" markers: remember when each tab was last opened on this device
effect(() => {
  const tab = route.value;
  const id = meId.value;
  if (!ctx.wgId || !id) return;
  const prev = seen.peek()[tab] || 0;
  visitSeen.value = { ...visitSeen.peek(), [tab]: prev };
  const next = { ...seen.peek(), [tab]: Date.now() };
  seen.value = next;
  writeLS(lsKey('seen'), JSON.stringify(next));
});

effect(() => {
  const t = theme.value;
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = t;
  writeLS('wgapp:theme', t === 'light' ? null : t);
});

// ---------------------------------------------------------------- boot

export async function boot(config) {
  const h = parseHash();
  route.value = TABS.includes(h.tab) ? h.tab : 'liste';
  setInterval(() => (clock.value = Date.now()), 30000);
  window.addEventListener('online', () => (sync.value = { ...sync.value, offline: false }));
  window.addEventListener('offline', () => (sync.value = { ...sync.value, offline: true }));
  window.addEventListener('hashchange', () => {
    const p = parseHash();
    // an invite link opened in a tab that already shows the app (join screen or another WG) needs a fresh start
    if (p.wg && (needJoin.peek() || (ctx.kind === 'firestore' && p.wg !== ctx.wgId))) location.reload();
    else if (p.tab && TABS.includes(p.tab) && p.tab !== route.value) route.value = p.tab;
  });

  // __PREVIEW__ is a build-time constant: the demo build drops Firebase entirely
  if (!__PREVIEW__ && config?.firebase) {
    const wgId = h.wg || readLS('wgapp:wgId');
    if (!wgId) {
      needJoin.value = true;
      return;
    }
    writeLS('wgapp:wgId', wgId);
    const { createFirestoreStore } = await import('./store/firestore.js');
    connect(createFirestoreStore(config.firebase, wgId), 'firestore', wgId);
  } else {
    connect(createLocalStore('demo'), 'local', 'demo');
  }
  writeHash(route.value);
}

export function joinWith(code) {
  const m = String(code || '').match(/wg=([A-Za-z0-9]{12,})/) || String(code || '').trim().match(/^([A-Za-z0-9]{12,})$/);
  if (!m) return false;
  writeLS('wgapp:wgId', m[1]);
  location.hash = `wg=${m[1]}`;
  location.reload();
  return true;
}

function connect(store, kind, wgId) {
  Object.assign(ctx, { store, api: createApi(store), kind, wgId });
  try {
    seen.value = JSON.parse(readLS(lsKey('seen')) || '{}') || {};
  } catch {
    seen.value = {};
  }
  meId.value = readLS(lsKey('me'));

  const metas = new Map();
  const track = (key, m) => {
    metas.set(key, m);
    const all = [...metas.values()];
    const pending = all.some((x) => x.pending);
    const fromCache = all.some((x) => x.fromCache);
    const cur = sync.peek();
    if (cur.pending !== pending || cur.fromCache !== fromCache) sync.value = { ...cur, pending, fromCache };
  };
  const fail = (key) => (err) => {
    console.error(key, err);
    sync.value = { ...sync.peek(), error: err?.code || 'unknown' };
  };
  const watch = (key, path, opts, assign) =>
    store.watchCollection(path, opts, (docs, m) => {
      track(key, m);
      assign(docs, m);
    }, fail(key));

  store.watchDoc('meta/wg', (d, m) => {
    track('wg', m);
    if (d || !m.fromCache) wg.value = d;
  }, fail('wg'));
  // summaries written by an older app version lack the per-person debts: rebuild them once from all bookings
  let lastUpgrade = 0;
  store.watchDoc('meta/summary', (d, m) => {
    track('summary', m);
    summary.value = d;
    if (d && !m.fromCache && (d.v || 0) < SUMMARY_VERSION && Date.now() - lastUpgrade > 60000) {
      lastUpgrade = Date.now();
      ctx.api.recomputeSummary().catch((e) => console.warn('summary upgrade failed', e));
    }
  }, fail('summary'));
  watch('members', 'members', {}, (docs, m) => {
    if (docs.length || !m.fromCache) {
      members.value = docs;
      membersReady.value = true;
    }
  });
  watch('open', 'items', { where: [['state', 'in', ['open', 'cart']]] }, (docs) => (openItems.value = docs));
  watch('chores', 'chores', {}, (docs) => (chores.value = docs));
  watch('posts', 'posts', { orderBy: ['createdAt', 'desc'], limit: 60 }, (docs) => (posts.value = docs));
  watch('pinned', 'posts', { where: [['pinned', '==', true]] }, (docs) => (pinnedPosts.value = docs));

  // windows that grow when someone scrolls back in a history: re-subscribe when the limit changes
  const growing = (make) => {
    let stop = null;
    effect(() => {
      const next = make();
      stop?.();
      stop = next;
    });
  };
  growing(() =>
    watch('tx', 'tx', { orderBy: ['sortKey', 'desc'], limit: txLimit.value }, (docs) => {
      txs.value = docs;
      txsReady.value = true;
    }),
  );
  growing(() =>
    watch('bought', 'items', { orderBy: ['boughtAt', 'desc'], limit: boughtLimit.value }, (docs) => (boughtItems.value = docs)),
  );
  growing(() =>
    watch('choreLog', 'choreLog', { where: [['week', '>=', weekIndex() - (choreWeeks.value - 1)]] }, (docs) => (choreLog.value = docs)),
  );

  connected.value = true;
}
