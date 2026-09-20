// Screenshot each route via the Chrome DevTools Protocol (real timing).
// Requires a headless Chrome already running with --remote-debugging-port=9222.
import { writeFileSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8087';
const DBG = process.env.DBG || 'http://localhost:9222';
const OUT = '/tmp';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function pageTarget() {
  for (let i = 0; i < 20; i++) {
    try {
      const list = await (await fetch(`${DBG}/json`)).json();
      const page = list.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error('No debuggable page target found');
}

function cdp(ws) {
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, (m) => m.error ? reject(new Error(m.error.message)) : resolve(m.result));
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

const SEED = readFileSync(new URL('./seed-data.js', import.meta.url), 'utf8');

async function main() {
  const wsUrl = await pageTarget();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = cdp(ws);
  await send('Page.enable');
  await send('Runtime.enable');

  // 1) load base origin
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(1200);
  // 2) seed localStorage + IndexedDB (real time)
  const seedRes = await send('Runtime.evaluate', { expression: SEED, awaitPromise: true, returnByValue: true });
  console.log('seed:', JSON.stringify(seedRes.result?.value));
  // 3) reload so the app boots with seeded settings + data
  await send('Page.reload', {});
  await sleep(1600);

  const routes = ['home', 'tax', 'pots', 'insights', 'income', 'expenses', 'settings'];
  for (const r of routes) {
    await send('Runtime.evaluate', { expression: `location.hash='#/${r}'`, returnByValue: true });
    await sleep(900);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(`${OUT}/kerb-${r}.png`, Buffer.from(data, 'base64'));
    console.log('shot', r, `${OUT}/kerb-${r}.png`);
  }
  ws.close();
}
main().catch(e => { console.error('ERROR', e); process.exit(1); });
