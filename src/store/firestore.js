// Firestore-backed store. Everything for one WG lives under wgs/{wgId}/{collection}/{doc}.
// Offline: writes apply to the local cache at once and sync later; commit() resolves only
// after the server confirmed, so the UI never waits on it.

import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, onSnapshot, query, where, orderBy, limit, writeBatch, increment, deleteField, getDocs,
  getDocsFromServer,
} from 'firebase/firestore';
import { mapOps } from './ops.js';
import { newId } from '../model.js';

export function createFirestoreStore(firebaseConfig, wgId) {
  const app = initializeApp(firebaseConfig);
  let db;
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: memoryLocalCache() });
  }

  const dref = (path) => doc(db, 'wgs', wgId, ...path.split('/'));
  const cref = (path) => collection(db, 'wgs', wgId, ...path.split('/'));
  const toFs = (data) => mapOps(data, { inc: (n) => increment(n), del: () => deleteField() });
  const metaOf = (snap) => ({ fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });

  function build(path, opts = {}) {
    const cs = [];
    for (const [f, op, v] of opts.where || []) cs.push(where(f, op, v));
    if (opts.orderBy) cs.push(orderBy(opts.orderBy[0], opts.orderBy[1] || 'asc'));
    if (opts.limit) cs.push(limit(opts.limit));
    return cs.length ? query(cref(path), ...cs) : cref(path);
  }

  return {
    kind: 'firestore',
    newId: () => newId(),

    watchCollection(path, opts, cb, onError) {
      return onSnapshot(
        build(path, opts),
        { includeMetadataChanges: true },
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })), metaOf(snap)),
        (err) => onError?.(err),
      );
    },

    watchDoc(path, cb, onError) {
      return onSnapshot(
        dref(path),
        { includeMetadataChanges: true },
        (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null, metaOf(snap)),
        (err) => onError?.(err),
      );
    },

    /** server: true refuses to answer from a possibly incomplete offline cache. */
    async getCollection(path, opts, { server = false } = {}) {
      const snap = await (server ? getDocsFromServer : getDocs)(build(path, opts));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    commit(ops) {
      const batch = writeBatch(db);
      for (const op of ops) {
        if (op.type === 'set') {
          if (op.merge) batch.set(dref(op.path), toFs(op.data), { merge: true });
          else batch.set(dref(op.path), toFs(op.data));
        } else if (op.type === 'delete') {
          batch.delete(dref(op.path));
        }
      }
      return batch.commit();
    },
  };
}
