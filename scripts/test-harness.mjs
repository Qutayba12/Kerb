// ============================================================
// test-harness.mjs — the test harness testing itself.
//
// Every other suite trusts browser.mjs to hand it a page that
// stays put. One thing broke that promise: the app reloads
// itself when the service worker claims the page (app.js, on
// 'controllerchange'), and the worker only claims once it has
// cached every asset. On a busy machine that landed mid-suite,
// wiping whatever the running test had put on `window` — a
// stubbed fetch became the real one again and the request left
// the browser. It surfaced as a genuine 401 inside a test that
// had stubbed the network, on a different test each run, and
// only under load. Caught in the act: the page's sentinel went
// from present to gone exactly as the controller went from
// null to set.
//
// The real race is rare and resists forcing — throttling the
// page's network does not slow the worker's own fetches, which
// run on a target of their own. So ready()'s waiting is tested
// against a page whose controller is flipped on cue instead.
// That is a test of the wait, not of the browser: it pins the
// behaviour the suites depend on, and the old ready() fails it
// every time rather than one run in five.
//
//   node scripts/test-harness.mjs
// ============================================================
import { launch } from './browser.mjs';

const results = [];
async function check(name, fn) {
  try { const d = await fn(); results.push(true); console.log(`✓ ${name}${d ? '  ' + d : ''}`); }
  catch (e) { results.push(false); console.log(`✗ ${name}\n    ${(e && e.message || String(e)).slice(0, 400)}`); }
}

// Put the page back in the state the race leaves it in: a worker registered,
// nothing in control yet, and a claim still to come. `controller` is a getter
// on the prototype, so an own property shadows it. After `ms` the claim lands:
// the controller appears and the mark goes, which is what the reload does.
const stageClaim = (ms) => `
  let claimed = false;
  Object.defineProperty(navigator.serviceWorker, 'controller', {
    configurable: true, get: () => (claimed ? { scriptURL: 'service-worker.js' } : null),
  });
  navigator.serviceWorker.getRegistration = async () => ({ active: {} });
  window.__claimAt = Date.now() + ${ms};
  setTimeout(() => { claimed = true; delete window.__swMark; }, ${ms});
  return true;`;

const run = async () => {
  const b = await launch();
  try {
    await b.open('/welcome/');
    await b.resetSW();
    await b.eval(`localStorage.setItem('kerb.settings.v1', JSON.stringify({ onboarded: true, lang: 'en' })); return true;`);
    await b.open('/');
    await b.ready();

    await check('ready() waits for the worker to claim the page before returning', async () => {
      const DELAY = 2000;
      await b.eval(stageClaim(DELAY));
      const t0 = Date.now();
      await b.ready();
      const took = Date.now() - t0;
      const controlled = await b.eval('!!navigator.serviceWorker.controller');
      if (!controlled) throw new Error('returned on a page nothing had claimed');
      // Comfortably under the delay means it did not wait, which is the bug:
      // the claim (and the reload it triggers) would land mid-test instead.
      if (took < DELAY * 0.75) throw new Error(`returned after ${took}ms, before the ${DELAY}ms claim — it did not wait`);
      return `waited ${took}ms for a claim ${DELAY}ms out`;
    });

    await check('ready() falls straight through when nothing can claim the page', async () => {
      // A page with no registration must not sit here burning the timeout.
      await b.eval(`
        Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, get: () => null });
        navigator.serviceWorker.getRegistration = async () => undefined;
        return true;`);
      const t0 = Date.now();
      await b.ready();
      const took = Date.now() - t0;
      if (took > 12000) throw new Error(`waited ${took}ms for a worker that was never coming`);
      return `returned in ${took}ms`;
    });

    await check('eval returns the value of an expression that awaits', async () => {
      // This is how the wait above polls for a registration. A plain-Function
      // parse rejects `await`, which used to route the expression down the
      // statement-body path, where nothing returns it: the caller got
      // undefined for a value that was plainly there, with no error raised
      // anywhere, so a poll on it could never come true.
      const v = await b.eval('await Promise.resolve(41) + 1');
      if (v !== 42) throw new Error(`expected 42, got ${JSON.stringify(v)}`);
      const truthy = await b.eval('!!(await Promise.resolve({ ok: 1 }))');
      if (truthy !== true) throw new Error(`a truthy awaited value read as ${JSON.stringify(truthy)}`);
      // The statement-body path must still work, and still not be mistaken
      // for an expression just because it mentions the word.
      const body = await b.eval('const s = "return x"; return s.length;');
      if (body !== 8) throw new Error(`statement body broke: ${JSON.stringify(body)}`);
      return 'awaited expressions, and bodies, both read back';
    });

    await check('a stub survives on a page ready() has settled', async () => {
      // What the suites actually depend on: what a test puts on `window` is
      // still there when the next eval runs. The failure this guards against
      // reached them as a real network call from a stubbed test.
      await b.eval(`
        delete navigator.serviceWorker.controller;        // drop the stand-in
        delete navigator.serviceWorker.getRegistration;
        window.__native = window.fetch;
        window.fetch = async () => new Response('{}', { status: 200 });
        return true;`);
      for (let i = 0; i < 30; i++) {
        const ok = await b.eval('!!window.__native && window.fetch !== window.__native');
        if (!ok) throw new Error(`the stub was gone after ${i * 100}ms — something reloaded the page`);
        await new Promise((r) => setTimeout(r, 100));
      }
      return 'stub intact for 3s';
    });
  } finally { await b.close(); }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} harness checks passed`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
