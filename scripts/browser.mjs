// ============================================================
// browser.mjs — a tiny CDP driver so the UI can be exercised for
// real (no dependencies). Launches headless Chromium, serves the
// app, and evaluates expressions in the page.
//
//   const b = await launch();
//   await b.goto('#/tax');
//   const n = await b.eval('document.querySelectorAll(".card").length');
//   await b.close();
// ============================================================
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';

const CHROME_DIRS = ['/opt/pw-browsers'];
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of CHROME_DIRS) {
    if (!existsSync(root)) continue;
    // Prefer the full browser over the headless shell, and never return a
    // directory (the browser root holds dot-dirs like .links that are not
    // executables and fail with EACCES when spawned).
    for (const d of readdirSync(root).filter((n) => !n.startsWith('.')).sort()) {
      for (const leaf of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const p = `${root}/${d}/${leaf}`;
        try { if (statSync(p).isFile()) return p; } catch {}
      }
    }
  }
  throw new Error('Chromium not found under ' + CHROME_DIRS.join(', '));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(fn, { tries = 100, every = 100, what = 'condition' } = {}) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v; } catch {}
    await wait(every);
  }
  throw new Error('timed out waiting for ' + what);
}

// Fixed ports make two runs collide: the second finds the first run's stale
// devtools and hangs. Pick free ones instead.
async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => res(port)); });
  });
}

export async function launch({ port, cdp, headless = true } = {}) {
  port = port || await freePort();
  cdp = cdp || await freePort();
  // --- static server (the app's own) ---
  const server = spawn(process.execPath, ['scripts/serve.mjs', String(port)], {
    cwd: new URL('..', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const origin = `http://127.0.0.1:${port}`;
  await poll(async () => (await fetch(origin + '/index.html')).ok, { what: 'static server' });

  // --- browser ---
  const chrome = spawn(findChrome(), [
    headless ? '--headless=new' : '',
    `--remote-debugging-port=${cdp}`,
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check',
    '--window-size=412,915',                       // a phone-sized viewport
    'about:blank',
  ].filter(Boolean), { stdio: ['ignore', 'pipe', 'pipe'] });

  let chromeErr = '';
  chrome.stderr.on('data', (d) => { chromeErr += d.toString(); });
  chrome.on('exit', (code) => { if (code) chromeErr += `\n(chromium exited ${code})`; });
  const list = await poll(async () => {
    const r = await fetch(`http://127.0.0.1:${cdp}/json/list`);
    const j = await r.json();
    return j.find((t) => t.type === 'page') || null;
  }, { what: 'devtools on ' + cdp + (chromeErr ? '\n' + chromeErr.slice(-600) : '') })
    .catch((e) => { chrome.kill('SIGKILL'); server.kill('SIGKILL'); throw e; });

  const ws = new WebSocket(list.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const myId = ++id;
    pending.set(myId, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: myId, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Runtime.addBinding', { name: '__report' }).catch(() => {});

  const api = {
    origin, events,
    // Page errors and console errors seen so far.
    errors: () => events
      .filter((e) => e.method === 'Runtime.exceptionThrown'
        || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
        || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
      .map((e) => e.method === 'Runtime.exceptionThrown'
        ? (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)
        : (e.params.entry?.text || e.params.args?.map((a) => a.value ?? a.description).join(' '))),
    clearErrors: () => { events.length = 0; },

    // `expr` may be a single expression ('document.title') or a statement
    // body ('const x = 1; return x'). Which one it is is decided by parsing,
    // not by looking for the word 'return' — a string containing 'return'
    // would otherwise be misread, and a body wrapped as an expression is a
    // SyntaxError thrown inside the page rather than a useful failure.
    async eval(expr, { awaitPromise = true } = {}) {
      let isExpression = true;
      try { new Function('return (' + expr + '\n)'); } catch { isExpression = false; }
      const body = isExpression ? 'return (' + expr + '\n)' : expr;
      const r = await send('Runtime.evaluate', {
        expression: `(async () => { ${body} })()`,
        returnByValue: true, awaitPromise,
      });
      if (r.exceptionDetails) {
        throw new Error('page eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      }
      return r.result.value;
    },

    async open(path = '/') {
      await send('Page.navigate', { url: origin + path });
      await poll(() => api.eval('document.readyState === "complete"'), { what: 'load ' + path });
    },

    // Wait until #view stops growing. Several screens finish rendering after an
    // await (a DB read, a storage check), so "has children" is not "is done":
    // sampling too early reads a half-built screen and reports it as clean.
    async settled({ tries = 80, every = 50, needed = 3 } = {}) {
      let last = -1, same = 0;
      for (let i = 0; i < tries; i++) {
        const n = await api.eval('document.getElementById("view").querySelectorAll("*").length');
        if (n > 0 && n === last) { if (++same >= needed) return n; } else { same = 0; last = n; }
        await wait(every);
      }
      return last;
    },

    // Navigate inside the SPA and wait for the view to be rendered.
    async goto(hash) {
      // Assigning the hash it already has fires no hashchange, so the app never
      // re-renders and we would inspect whatever the previous route left behind.
      // Bouncing through a throwaway route guarantees a fresh render.
      const current = await api.eval('location.hash');
      if (current === hash) await api.eval(`location.hash = '#/__force_nav'; 1`);
      await api.eval(`location.hash = ${JSON.stringify(hash)}; 1`);
      await poll(() => api.eval('!document.getElementById("view").hasAttribute("aria-busy") && document.getElementById("view").children.length > 0'),
        { what: 'route ' + hash });
      await api.settled();
      return api;
    },

    // Drop the service worker and its caches. Without this a test reads the
    // PREVIOUS build's JS (the SW serves assets stale-while-revalidate), which
    // looks exactly like the change under test not working.
    async resetSW() {
      await api.eval(`
        if (navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        return true;
      `);
      return api;
    },

    // Wait until the app has booted past the splash and the first screen is done.
    async ready() {
      await poll(() => api.eval('!document.getElementById("app").hidden'), { what: 'app boot' });
      await poll(() => api.eval('document.getElementById("view").children.length > 0'), { what: 'first render' });
      await api.settled();
      return api;
    },

    async screenshot() {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data, 'base64');
    },

    async close() {
      try { ws.close(); } catch {}
      chrome.kill('SIGKILL'); server.kill('SIGKILL');
      await wait(100);
    },
  };
  return api;
}
