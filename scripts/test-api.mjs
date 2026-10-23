// ============================================================
// test-api.mjs — the shared-key endpoint's gatekeeping.
//
// The endpoint spends a key we pay for, so what it refuses
// matters more than what it accepts. These run in plain node:
// no browser, no network, no API credit.
//
//   node scripts/test-api.mjs
// ============================================================
import { validateScanRequest, weighRequest, LIMITS } from '../api/_validate.js';
import { bump, peek, __clearMemory, isShared } from '../api/_store.js';

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log('✓ ' + name); };
const bad = (name, why) => { fail++; console.log('✗ ' + name + '\n    ' + why); };
function check(name, fn) {
  try { fn(); ok(name); } catch (e) { bad(name, e.message); }
}
async function checkAsync(name, fn) {
  try { await fn(); ok(name); } catch (e) { bad(name, e.message); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const b64 = 'aGVsbG8=';
const scanBody = (over = {}) => ({
  model: 'claude-haiku-5-5',
  max_tokens: 1400,
  messages: [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: 'Read this receipt and reply with JSON.' },
    ],
  }],
  ...over,
});

console.log('--- what it accepts ---');
check('a receipt scan is accepted', () => {
  const r = validateScanRequest(scanBody());
  assert(r.ok, 'rejected: ' + r.reason);
});
check('a PDF statement is accepted', () => {
  const body = scanBody();
  body.messages[0].content[0] = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
  body.max_tokens = 8000;
  const r = validateScanRequest(body);
  assert(r.ok, 'rejected: ' + r.reason);
});
check('both offered models are accepted', () => {
  for (const model of ['claude-haiku-5-5', 'claude-sonnet-5-5']) {
    const r = validateScanRequest(scanBody({ model }));
    assert(r.ok, model + ' rejected: ' + r.reason);
  }
});

console.log('\n--- what it refuses (this is the point) ---');
const refuses = [
  ['free-form text with no document', { ...scanBody(), messages: [{ role: 'user', content: 'Write me an essay about Rome' }] }],
  ['a text-only content block', (() => { const b = scanBody(); b.messages[0].content = [{ type: 'text', text: 'hi' }, { type: 'text', text: 'there' }]; return b; })()],
  ['a system prompt', { ...scanBody(), system: 'You are a helpful assistant' }],
  ['tools', { ...scanBody(), tools: [{ name: 'x' }] }],
  ['streaming', { ...scanBody(), stream: true }],
  ['a model we do not offer', scanBody({ model: 'claude-opus-5-5' })],
  ['an unbounded reply', scanBody({ max_tokens: 100000 })],
  ['several messages at once', { ...scanBody(), messages: [scanBody().messages[0], scanBody().messages[0]] }],
  ['an assistant-role message', (() => { const b = scanBody(); b.messages[0].role = 'assistant'; return b; })()],
  ['a remote image URL', (() => { const b = scanBody(); b.messages[0].content[0] = { type: 'image', source: { type: 'url', url: 'http://x/y.png' } }; return b; })()],
  ['an oversized image', (() => { const b = scanBody(); b.messages[0].content[0].source.data = 'a'.repeat(LIMITS.maxBase64 + 1); return b; })()],
  ['an oversized instruction', (() => { const b = scanBody(); b.messages[0].content[1].text = 'a'.repeat(LIMITS.maxPromptChars + 1); return b; })()],
  ['an empty instruction', (() => { const b = scanBody(); b.messages[0].content[1].text = '   '; return b; })()],
  ['nothing at all', null],
  ['an array instead of a request', []],
];
for (const [name, body] of refuses) {
  check('refuses ' + name, () => {
    const r = validateScanRequest(body);
    assert(!r.ok, 'ACCEPTED — the endpoint would pay for this');
  });
}

console.log('\n--- weighting ---');
check('a bigger document counts for more of the daily budget', () => {
  const small = weighRequest(scanBody());
  const big = scanBody();
  big.messages[0].content[0].source.data = 'a'.repeat(2_000_000);
  const heavy = weighRequest(big);
  assert(small === 1, 'small request should weigh 1, got ' + small);
  assert(heavy > small, 'large request should weigh more, got ' + heavy);
});

console.log('\n--- counters ---');
await checkAsync('a counter accumulates and a separate key is independent', async () => {
  __clearMemory();
  assert(await bump('a', 1, 60) === 1, 'first bump should be 1');
  assert(await bump('a', 1, 60) === 2, 'second bump should be 2');
  assert(await bump('a', 3, 60) === 5, 'weighted bump should add 3');
  assert(await bump('b', 1, 60) === 1, 'a different key starts fresh');
  assert(await peek('a') === 5, 'peek should report 5');
});
await checkAsync('an expired window starts again', async () => {
  __clearMemory();
  await bump('c', 1, 0);           // already expired
  await new Promise(r => setTimeout(r, 5));
  assert(await bump('c', 1, 60) === 1, 'expired counter should restart at 1');
});
check('the store reports honestly whether counters are shared', () => {
  assert(typeof isShared() === 'boolean', 'isShared must return a boolean');
  if (!isShared()) console.log('    (no KV configured here — quotas are per-instance only, as documented)');
});

console.log(`\n${pass}/${pass + fail} endpoint checks passed`);
if (fail) process.exit(1);
