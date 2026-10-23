// ============================================================
// api/_store.js — counters for quotas and rate limits.
//
// Uses Upstash Redis over REST when the environment provides it
// (Vercel KV sets exactly these two variables), because counters
// must be shared across serverless instances to mean anything.
//
// Without it the counters fall back to process memory, which is
// per-instance and lost on every cold start. That is enough to
// slow a careless loop and nothing more — the honest reading is
// that quotas are OFF until a store is configured, which is why
// isShared() is surfaced and the handler reports it.
// ============================================================

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const isShared = () => !!(URL_ && TOKEN);

const mem = new Map();          // key -> { value, expires }
function memIncr(key, by, ttlSeconds) {
  const now = Date.now();
  const cur = mem.get(key);
  if (!cur || cur.expires <= now) {
    mem.set(key, { value: by, expires: now + ttlSeconds * 1000 });
    return by;
  }
  cur.value += by;
  return cur.value;
}
// Keep the fallback map from growing without bound on a long-lived instance.
function memSweep() {
  const now = Date.now();
  for (const [k, v] of mem) if (v.expires <= now) mem.delete(k);
}

async function redis(command) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  const json = await res.json();
  return json.result;
}

// Add `by` to a counter that expires after `ttlSeconds`, and return the new
// total. The TTL is only set when the key is created, so a window does not
// slide forward every time it is written to.
export async function bump(key, by, ttlSeconds) {
  if (!isShared()) { memSweep(); return memIncr(key, by, ttlSeconds); }
  const total = await redis(['INCRBY', key, String(by)]);
  if (Number(total) === by) await redis(['EXPIRE', key, String(ttlSeconds)]);
  return Number(total);
}

export async function peek(key) {
  if (!isShared()) {
    const cur = mem.get(key);
    return cur && cur.expires > Date.now() ? cur.value : 0;
  }
  const v = await redis(['GET', key]);
  return Number(v || 0);
}

// Reset for tests only.
export function __clearMemory() { mem.clear(); }
