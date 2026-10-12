// Device-only store with the same interface as the Firestore store.
// Used for the demo and for tests. Tabs of the same browser stay in sync via BroadcastChannel.

import { applySet, clone, runQuery } from './ops.js';
import { newId } from '../model.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

export function safeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    const probe = '__wg_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryStorage();
  }
}

function splitPath(path) {
  const parts = path.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`bad document path: ${path}`);
  return parts;
}

export function createLocalStore(namespace, { storage = safeLocalStorage(), sync = true } = {}) {
  const key = `wgapp:${namespace}`;
  const listeners = new Set();
  const meta = { fromCache: false, pending: false };

  const load = () => {
    try {
      return JSON.parse(storage.getItem(key) || '{}') || {};
    } catch {
      return {};
    }
  };
  let state = load();

  const persist = () => {
    try {
      storage.setItem(key, JSON.stringify(state));
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  };

  let channel = null;
  if (sync && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(key);
    channel.onmessage = (e) => {
      state = load();
      notify(e.data?.colls ? new Set(e.data.colls) : null);
    };
  }

  const docsOf = (coll) => Object.entries(state[coll] || {}).map(([id, d]) => ({ id, ...clone(d) }));

  function deliver(l) {
    let value;
    if (l.kind === 'coll') value = runQuery(docsOf(l.coll), l.opts);
    else {
      const d = state[l.coll]?.[l.id];
      value = d ? { id: l.id, ...clone(d) } : null;
    }
    const sig = JSON.stringify(value);
    if (sig === l.last) return;
    l.last = sig;
    l.cb(value, meta);
  }

  function notify(colls) {
    for (const l of listeners) if (!colls || colls.has(l.coll)) Promise.resolve().then(() => l.active && deliver(l));
  }

  function listen(l) {
    l.active = true;
    listeners.add(l);
    Promise.resolve().then(() => l.active && deliver(l));
    return () => {
      l.active = false;
      listeners.delete(l);
    };
  }

  return {
    kind: 'local',
    newId: () => newId(),

    watchCollection(path, opts, cb) {
      return listen({ kind: 'coll', coll: path, opts: opts || {}, cb, last: undefined });
    },

    watchDoc(path, cb) {
      const [coll, id] = splitPath(path);
      return listen({ kind: 'doc', coll, id, cb, last: undefined });
    },

    async getCollection(path, opts) {
      return runQuery(docsOf(path), opts || {});
    },

    async commit(ops) {
      const next = { ...state };
      const touched = new Set();
      for (const op of ops) {
        const [coll, id] = splitPath(op.path);
        if (!touched.has(coll)) next[coll] = { ...(state[coll] || {}) };
        touched.add(coll);
        if (op.type === 'set') next[coll][id] = applySet(next[coll][id], op.data, !!op.merge);
        else if (op.type === 'delete') delete next[coll][id];
        else throw new Error(`unknown op ${op.type}`);
      }
      state = next;
      persist();
      channel?.postMessage({ colls: [...touched] });
      notify(touched);
    },

    /** Demo only: wipe everything on this device. */
    async reset() {
      state = {};
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
      channel?.postMessage({ colls: null });
      notify(null);
    },

    close() {
      channel?.close();
      listeners.clear();
    },
  };
}
