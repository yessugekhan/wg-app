// Store-neutral write sentinels. The local store applies them itself,
// the Firestore store translates them to increment() / deleteField().

const TAG = '__wgop';

/** Atomic increment of a numeric field (missing fields count as 0). */
export const INC = (n) => ({ [TAG]: 'inc', n });
/** Remove a field (only valid in merge writes). */
export const DEL = () => ({ [TAG]: 'del' });

export const isOp = (v) => v !== null && typeof v === 'object' && TAG in v;
export const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !isOp(v) && Object.getPrototypeOf(v) === Object.prototype;

export function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** Firestore-style set: merge=true deep-merges plain objects, arrays and scalars replace. */
export function applySet(current, data, merge) {
  const base = merge && isPlainObject(current) ? clone(current) : {};
  return mergeInto(base, data, merge);
}

function mergeInto(target, data, merge) {
  for (const [k, v] of Object.entries(data)) {
    if (isOp(v)) {
      if (v[TAG] === 'inc') target[k] = (typeof target[k] === 'number' ? target[k] : 0) + v.n;
      else if (v[TAG] === 'del') delete target[k];
    } else if (isPlainObject(v)) {
      target[k] = mergeInto(merge && isPlainObject(target[k]) ? target[k] : {}, v, merge);
    } else if (v !== undefined) {
      target[k] = clone(v);
    }
  }
  return target;
}

/** Recursively replaces sentinels using the given factories (used by the Firestore adapter). */
export function mapOps(data, { inc, del }) {
  if (isOp(data)) return data[TAG] === 'inc' ? inc(data.n) : del();
  if (isPlainObject(data)) {
    const out = {};
    for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = mapOps(v, { inc, del });
    return out;
  }
  return data;
}

/** In-memory query evaluation with Firestore semantics (orderBy drops docs missing the field). */
export function runQuery(docs, { where = [], orderBy = null, limit = 0 } = {}) {
  let out = docs.filter((d) => where.every(([f, op, val]) => test(d[f], op, val)));
  if (orderBy) {
    const [f, dir = 'asc'] = orderBy;
    out = out.filter((d) => d[f] !== undefined);
    out.sort((a, b) => {
      const c = a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0;
      return (dir === 'desc' ? -c : c) || (a.id < b.id ? -1 : 1);
    });
  } else {
    out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  return limit ? out.slice(0, limit) : out;
}

function test(v, op, val) {
  switch (op) {
    case '==': return v === val;
    case '!=': return v !== undefined && v !== val;
    case '<': return v !== undefined && v < val;
    case '<=': return v !== undefined && v <= val;
    case '>': return v !== undefined && v > val;
    case '>=': return v !== undefined && v >= val;
    case 'in': return val.includes(v);
    case 'not-in': return v !== undefined && !val.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(val);
    default: throw new Error(`unsupported operator ${op}`);
  }
}
