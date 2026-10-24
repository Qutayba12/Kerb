// ============================================================
// test-claude.mjs — the scanning paths, with Anthropic stubbed.
//
// These are the only places where numbers enter your tax figures
// without you typing them: a scanned receipt, an earnings
// statement, a bank statement, a payslip. They had never been
// run. Stubbing fetch exercises the whole parse-and-clean path
// deterministically, and costs nothing in API credit.
//
//   node scripts/test-claude.mjs
// ============================================================
import { launch } from './browser.mjs';
import { validateScanRequest } from '../api/_validate.js';

const results = [];
async function check(name, fn) {
  try { const d = await fn(); results.push(true); console.log(`✓ ${name}${d ? '  ' + d : ''}`); }
  catch (e) { results.push(false); console.log(`✗ ${name}\n    ${(e && e.message || String(e)).slice(0, 400)}`); }
}
const eq = (actual, expected, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

// Make the next Anthropic call return `text` as the model's reply.
const reply = (text, extra = {}) => `
  window.fetch = async () => new Response(JSON.stringify({
    content: [{ type: 'text', text: ${JSON.stringify(text)} }],
    usage: { input_tokens: 10, output_tokens: 20 },
    stop_reason: ${JSON.stringify(extra.stop_reason || 'end_turn')},
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  return true;`;

// Make the next Anthropic call fail with an HTTP status.
const failWith = (status, body = {}) => `
  window.fetch = async () => new Response(JSON.stringify(${JSON.stringify(body)}), { status: ${status}, headers: { 'content-type': 'application/json' } });
  return true;`;

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

// Record the outgoing request so the app's real body can be checked against
// the endpoint's real validator.
const captureNext = (text) => `
  window.__sent = null;
  window.fetch = async (url, init) => {
    window.__sent = { url: String(url), headers: (init && init.headers) || {}, body: JSON.parse((init && init.body) || '{}') };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: ${JSON.stringify('{}')} }], usage: {}, stop_reason: 'end_turn' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return true;`;

const run = async () => {
  const b = await launch();
  await b.open('/welcome/');
  await b.resetSW();
  await b.eval(`localStorage.setItem('kerb.settings.v1', JSON.stringify({
    onboarded: true, lang: 'en', taxYear: '2026/27', region: 'ruk', vehicle: 'car',
    expenseMethod: 'mileage', apiKey: 'sk-ant-test-key', claudeModel: 'claude-haiku-4-5',
    customPlatforms: [], rateOverrides: {},
  })); return true;`);
  await b.open('/');
  await b.ready();

  const settings = `(await import('/js/store.js')).getSettings()`;

  // ---------------- receipts ----------------
  await check('receipt — a clean reply maps to the expense fields', async () => {
    await b.eval(reply(JSON.stringify({
      amount: 48.2, subtotal: 40.17, vat: 8.03, vatRate: 20, date: '2026-09-14', time: '14:32',
      vendor: 'Shell Finchley', address: '12 High Rd', area: 'London', postcode: 'n12 8aa',
      category: 'fuel', paymentMethod: 'Visa ****1234', receiptNo: 'A-4471', vatNumber: 'GB123456789',
      items: 'Unleaded 32.1L', confidence: 0.96,
    })));
    const r = await b.eval(`
      const c = await import('/js/claude.js');
      const r = await c.extractReceipt(${JSON.stringify(PNG)}, ${settings});
      return { amount: r.amount, vat: r.vat, date: r.date, vendor: r.vendor, category: r.category, postcode: r.postcode, confidence: r.confidence };`);
    eq(r, { amount: 48.2, vat: 8.03, date: '2026-09-14', vendor: 'Shell Finchley', category: 'fuel', postcode: 'N12 8AA', confidence: 0.96 }, 'parsed receipt');
    return 'amounts, date, vendor and postcode normalised';
  });

  await check('receipt — a reply wrapped in code fences is still read', async () => {
    await b.eval(reply('```json\n' + JSON.stringify({ amount: 12.5, vendor: 'NCP', category: 'parking', date: '2026-09-15' }) + '\n```'));
    const r = await b.eval(`
      const c = await import('/js/claude.js');
      const r = await c.extractReceipt(${JSON.stringify(PNG)}, ${settings});
      return { amount: r.amount, vendor: r.vendor, category: r.category };`);
    eq(r, { amount: 12.5, vendor: 'NCP', category: 'parking' }, 'fenced reply');
    return 'markdown fences stripped';
  });

  await check('receipt — money written as text still becomes a number', async () => {
    await b.eval(reply(JSON.stringify({ amount: '£62.50', vat: '10.42', date: '2026-09-16', vendor: 'BP', category: 'fuel' })));
    const r = await b.eval(`
      const c = await import('/js/claude.js');
      const r = await c.extractReceipt(${JSON.stringify(PNG)}, ${settings});
      return { amount: r.amount, vat: r.vat, types: [typeof r.amount, typeof r.vat] };`);
    eq(r, { amount: 62.5, vat: 10.42, types: ['number', 'number'] }, 'coerced amounts');
    return '"£62.50" -> 62.5 as a number';
  });

  await check('receipt — an unknown category falls back instead of being stored raw', async () => {
    await b.eval(reply(JSON.stringify({ amount: 9.99, category: 'spaceship fuel', date: '2026-09-17' })));
    const cat = await b.eval(`
      const c = await import('/js/claude.js');
      return (await c.extractReceipt(${JSON.stringify(PNG)}, ${settings})).category;`);
    eq(cat, 'other', 'unknown category');
    return "'spaceship fuel' -> 'other'";
  });

  await check('receipt — a nonsense date is dropped, not half-saved', async () => {
    await b.eval(reply(JSON.stringify({ amount: 5, date: 'last Tuesday', category: 'fuel' })));
    const d = await b.eval(`
      const c = await import('/js/claude.js');
      return (await c.extractReceipt(${JSON.stringify(PNG)}, ${settings})).date;`);
    eq(d, '', 'unparseable date');
    return "'last Tuesday' -> empty, so the form asks you";
  });

  await check('receipt — prose instead of JSON gives an actionable error', async () => {
    await b.eval(reply("I'm sorry, I can't read this image clearly."));
    const msg = await b.eval(`
      const c = await import('/js/claude.js');
      try { await c.extractReceipt(${JSON.stringify(PNG)}, ${settings}); return 'NO ERROR THROWN'; }
      catch (e) { return e.message; }`);
    if (!/could not read the receipt/i.test(msg)) throw new Error('unhelpful error: ' + msg);
    return 'tells you to retake the photo';
  });

  // ---------------- earnings statements ----------------
  await check('earnings — rows are mapped and empty ones dropped', async () => {
    await b.eval(reply(JSON.stringify({ entries: [
      { date: '2026-09-12', platform: 'amazonflex', amount: 62.5, tips: 0, hours: 4, deliveries: 0, miles: 48 },
      { date: '2026-09-13', platform: 'ubereats', amount: 41.2, tips: 5.5, hours: 3, deliveries: 11, miles: 24 },
      { date: '2026-09-14', platform: 'ubereats', amount: 0, tips: 0, hours: 0, deliveries: 0, miles: 0 },
    ] })));
    const rows = await b.eval(`
      const c = await import('/js/claude.js');
      const st = await import('/js/store.js');
      const rows = await c.extractEarnings({ kind: 'image', dataUrl: ${JSON.stringify(PNG)} },
        { today: '2026-09-20', platforms: st.allPlatforms() }, ${settings});
      return rows.map(r => ({ date: r.date, platform: r.platform, amount: r.amount, tips: r.tips, miles: r.miles }));`);
    eq(rows.length, 2, 'rows kept (the all-zero row must be dropped)');
    eq(rows[0], { date: '2026-09-12', platform: 'amazonflex', amount: 62.5, tips: 0, miles: 48 }, 'row 1');
    eq(rows[1], { date: '2026-09-13', platform: 'ubereats', amount: 41.2, tips: 5.5, miles: 24 }, 'row 2');
    return '2 of 3 rows kept';
  });

  await check('earnings — an invented platform falls back to a known one', async () => {
    await b.eval(reply(JSON.stringify({ entries: [{ date: '2026-09-12', platform: 'definitely-not-real', amount: 20, miles: 5 }] })));
    const p = await b.eval(`
      const c = await import('/js/claude.js');
      const st = await import('/js/store.js');
      const rows = await c.extractEarnings({ kind: 'image', dataUrl: ${JSON.stringify(PNG)} },
        { today: '2026-09-20', platforms: st.allPlatforms() }, ${settings});
      return { platform: rows[0].platform, known: st.allPlatforms().some(x => x.id === rows[0].platform) };`);
    if (!p.known) throw new Error('stored an unknown platform id: ' + p.platform);
    return `fell back to '${p.platform}'`;
  });

  await check('earnings — a reply cut off mid-array still yields the complete rows', async () => {
    // What a truncated response actually looks like: valid rows, then a row
    // that stops mid-object and no closing brackets.
    const truncated = '{"entries": ['
      + JSON.stringify({ date: '2026-09-12', platform: 'amazonflex', amount: 62.5, miles: 48 }) + ','
      + JSON.stringify({ date: '2026-09-13', platform: 'ubereats', amount: 41.2, miles: 24 }) + ','
      + '{"date": "2026-09-14", "platform": "ubereats", "amo';
    await b.eval(reply(truncated, { stop_reason: 'max_tokens' }));
    const rows = await b.eval(`
      const c = await import('/js/claude.js');
      const st = await import('/js/store.js');
      const rows = await c.extractEarnings({ kind: 'image', dataUrl: ${JSON.stringify(PNG)} },
        { today: '2026-09-20', platforms: st.allPlatforms() }, ${settings});
      return rows.map(r => r.amount);`);
    eq(rows, [62.5, 41.2], 'complete rows recovered, the half row dropped');
    return 'salvaged 2 rows from a truncated reply';
  });

  // ---------------- bank statements ----------------
  const bankRows = (txs) => `
    const c = await import('/js/claude.js');
    const st = await import('/js/store.js');
    const r = await c.extractBankTransactions({ kind: 'image', dataUrl: ${JSON.stringify(PNG)} },
      { today: '2026-09-20', platforms: st.allPlatforms(), categories: st.EXPENSE_CATEGORIES.map(x => x.id) }, ${settings});
    return r.transactions.map(t => ({ d: t.description, s: t.suggestion, a: t.amount, p: t.platform, c: t.category }));`;

  await check('bank statement — transactions come back classified', async () => {
    await b.eval(reply(JSON.stringify({ account: 'Current ****1234', transactions: [
      { date: '2026-09-12', description: 'AMAZON FLEX PAYMENT', amount: 182.4, direction: 'in', suggestion: 'income', platform: 'amazonflex' },
      { date: '2026-09-13', description: 'SHELL FINCHLEY', amount: -48.2, direction: 'out', suggestion: 'expense', category: 'fuel' },
      { date: '2026-09-14', description: 'TESCO GROCERIES', amount: -62.1, direction: 'out', suggestion: 'ignore' },
    ] })));
    const rows = await b.eval(bankRows());
    eq(rows.length, 3, 'transaction count');
    eq(rows.map(r => r.s), ['income', 'expense', 'ignore'], 'classifications');
    eq(rows[0].a, 182.4, 'credit amount');
    eq(rows[1].a, 48.2, 'debit stored as a positive amount');
    eq(rows[1].c, 'fuel', 'expense category');
    return 'delivery pay as income, fuel as an expense, groceries ignored';
  });

  await check('bank statement — a wage is kept out of self-employment income', async () => {
    // The dangerous case: a credit the model labels "income" that is really a
    // PAYE wage. Counting it as self-employment would overstate the tax owed
    // and the Class 4 NIC, so it must land as salary instead.
    await b.eval(reply(JSON.stringify({ transactions: [
      { date: '2026-09-12', description: 'ACME MANUFACTURING LTD SALARY', amount: 1630, direction: 'in', suggestion: 'income', platform: 'amazonflex' },
    ] })));
    const rows = await b.eval(bankRows());
    eq(rows[0].s, 'salary', 'a non-gig payer must not be self-employment income');
    return 'an employer credit is salary, not delivery income';
  });

  await check('bank statement — money out can never be income', async () => {
    await b.eval(reply(JSON.stringify({ transactions: [
      { date: '2026-09-12', description: 'AMAZON FLEX PAYMENT', amount: -50, direction: 'out', suggestion: 'income', platform: 'amazonflex' },
    ] })));
    const rows = await b.eval(bankRows());
    eq(rows[0].s, 'ignore', 'a debit labelled income must be rejected');
    return 'a debit cannot be counted as earnings';
  });

  await check('bank statement — an empty reply is reported, not treated as "no transactions"', async () => {
    await b.eval(reply(''));
    const msg = await b.eval(`
      const c = await import('/js/claude.js');
      const st = await import('/js/store.js');
      try {
        await c.extractBankTransactions({ kind: 'image', dataUrl: ${JSON.stringify(PNG)} },
          { today: '2026-09-20', platforms: st.allPlatforms(), categories: [] }, ${settings});
        return 'NO ERROR THROWN';
      } catch (e) { return e.message; }`);
    if (msg === 'NO ERROR THROWN') throw new Error('an empty reply silently produced no transactions');
    if (!/empty reply/i.test(msg)) throw new Error('error does not say what happened: ' + msg);
    return 'says the reply was empty';
  });

  // ---------------- payslips ----------------
  await check('payslip — fields are read into the record', async () => {
    await b.eval(reply(JSON.stringify({
      payDate: '2026-08-28', frequency: 'monthly', gross: 2000, net: 1630,
      incomeTax: 250, nationalInsurance: 120, pension: 0,
      ytdGross: 10000, ytdTax: 1250, employerName: 'Acme Ltd', taxCode: '1257L',
    })));
    const r = await b.eval(`
      const c = await import('/js/claude.js');
      const r = await c.extractPayslip({ kind: 'image', dataUrl: ${JSON.stringify(PNG)} }, ${settings});
      return { payDate: r.payDate, gross: r.gross, incomeTax: r.incomeTax, ni: r.nationalInsurance, ytdGross: r.ytdGross, employer: r.employerName, freq: r.frequency };`);
    eq(r, { payDate: '2026-08-28', gross: 2000, incomeTax: 250, ni: 120, ytdGross: 10000, employer: 'Acme Ltd', freq: 'monthly' }, 'parsed payslip');
    return 'pay, tax, NI and year-to-date all read';
  });

  // ---------------- failures the user will actually hit ----------------
  const errorCases = [
    [401, {}, /invalid api key/i, 'a wrong key'],
    [429, {}, /rate limit/i, 'rate limiting'],
    [500, {}, /anthropic is having trouble/i, 'an Anthropic outage'],
    [400, { error: { message: 'Your credit balance is too low' } }, /needs credit/i, 'an empty balance'],
  ];
  for (const [status, body, expected, label] of errorCases) {
    await check(`error handling — ${label} (${status}) is explained in plain words`, async () => {
      await b.eval(failWith(status, body));
      const msg = await b.eval(`
        const c = await import('/js/claude.js');
        try { await c.extractReceipt(${JSON.stringify(PNG)}, ${settings}); return 'NO ERROR THROWN'; }
        catch (e) { return e.message; }`);
      if (!expected.test(msg)) throw new Error(`message does not explain it: ${JSON.stringify(msg)}`);
      return JSON.stringify(msg.slice(0, 60));
    });
  }

  await check('error handling — being offline says so without calling out', async () => {
    const msg = await b.eval(`
      const c = await import('/js/claude.js');
      // Shadow the prototype getter on the instance, and delete the shadow
      // afterwards — restoring onto the prototype would leave the instance
      // property in place and every later test would still look offline.
      Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
      let called = false;
      window.fetch = async () => { called = true; throw new Error('should not be reached'); };
      let message;
      try { await c.extractReceipt(${JSON.stringify(PNG)}, ${settings}); message = 'NO ERROR THROWN'; }
      catch (e) { message = e.message; }
      delete navigator.onLine;
      if (navigator.onLine !== true) throw new Error('failed to restore navigator.onLine');
      return { message, called };`);
    if (msg.called) throw new Error('it tried the network while offline');
    if (!/offline/i.test(msg.message)) throw new Error('unclear offline message: ' + msg.message);
    return 'fails fast with an offline message';
  });

  await check('no key at all — scanning still works, through the shared endpoint', async () => {
    // The point of the whole change: someone who has never heard of Anthropic
    // can scan a receipt. Previously this threw before any request was made.
    await b.eval(reply(JSON.stringify({ amount: 31.5, vendor: 'Esso', category: 'fuel', date: '2026-09-18' })));
    const r = await b.eval(`
      const c = await import('/js/claude.js');
      const r = await c.extractReceipt(${JSON.stringify(PNG)}, { claudeModel: 'claude-haiku-5-5', apiKey: '' });
      return { amount: r.amount, vendor: r.vendor };`);
    eq(r, { amount: 31.5, vendor: 'Esso' }, 'scan result with no key configured');
    return 'a receipt was read on an account with no API key';
  });

  // ---------------- routing: own key vs the shared endpoint ----------------
  await check('routing — with your own key the request goes straight to Anthropic', async () => {
    await b.eval(captureNext());
    await b.eval(`
      const c = await import('/js/claude.js');
      try { await c.extractReceipt(${JSON.stringify(PNG)}, ${settings}); } catch (e) {}
      return true;`);
    const sent = await b.eval(`window.__sent`);
    if (!/api\.anthropic\.com/.test(sent.url)) throw new Error('did not go to Anthropic: ' + sent.url);
    if (!sent.headers['x-api-key']) throw new Error('own key not sent');
    if (sent.headers['x-kerb-device']) throw new Error('device header leaked to Anthropic');
    return 'direct to Anthropic, no device id attached';
  });

  await check('routing — with no key it goes to the shared endpoint, and the key is never in the browser', async () => {
    await b.eval(captureNext());
    await b.eval(`
      const c = await import('/js/claude.js');
      try { await c.extractReceipt(${JSON.stringify(PNG)}, { claudeModel: 'claude-haiku-5-5', apiKey: '' }); } catch (e) {}
      return true;`);
    const sent = await b.eval(`window.__sent`);
    if (!/\/api\/scan$/.test(sent.url)) throw new Error('did not go to the shared endpoint: ' + sent.url);
    if (sent.headers['x-api-key']) throw new Error('an API key was sent from the browser');
    if (!/^[0-9a-f]{32}$/.test(sent.headers['x-kerb-device'] || '')) throw new Error('bad device id: ' + sent.headers['x-kerb-device']);
    return 'proxied, no key client-side';
  });

  await check('routing — the device id is stable across scans', async () => {
    const first = await b.eval(`const c = await import('/js/claude.js'); return c.deviceId();`);
    const second = await b.eval(`const c = await import('/js/claude.js'); return c.deviceId();`);
    eq(first, second, 'device id must not change between scans');
    return 'one id per device';
  });

  // The app and the endpoint must agree on the shape, or scanning breaks for
  // everyone without their own key. Check the real body against the real validator.
  for (const [name, call] of [
    ['receipt', `c.extractReceipt(${JSON.stringify(PNG)}, s)`],
    ['payslip', `c.extractPayslip({ kind: 'image', dataUrl: ${JSON.stringify(PNG)} }, s)`],
    ['earnings statement', `c.extractEarnings({ kind: 'image', dataUrl: ${JSON.stringify(PNG)} }, { today: '2026-09-20', platforms: st.allPlatforms() }, s)`],
    ['bank statement', `c.extractBankTransactions({ kind: 'image', dataUrl: ${JSON.stringify(PNG)} }, { today: '2026-09-20', platforms: st.allPlatforms(), categories: [] }, s)`],
  ]) {
    await check(`shape — a real ${name} request is accepted by the endpoint`, async () => {
      await b.eval(captureNext());
      await b.eval(`
        const c = await import('/js/claude.js');
        const st = await import('/js/store.js');
        const s = { claudeModel: 'claude-haiku-5-5', apiKey: '' };
        try { await ${call}; } catch (e) {}
        return true;`);
      const sent = await b.eval(`window.__sent`);
      const verdict = validateScanRequest(sent.body);
      if (!verdict.ok) throw new Error(`the endpoint would reject the app's own request: ${verdict.reason}`);
      return `model ${sent.body.model}, max_tokens ${sent.body.max_tokens}`;
    });
  }

  await check('shape — a PDF statement is also accepted', async () => {
    await b.eval(captureNext());
    await b.eval(`
      const c = await import('/js/claude.js');
      const st = await import('/js/store.js');
      try { await c.extractEarnings({ kind: 'pdf', base64: 'JVBERi0xLjQK' },
        { today: '2026-09-20', platforms: st.allPlatforms() }, { claudeModel: 'claude-haiku-5-5', apiKey: '' }); } catch (e) {}
      return true;`);
    const verdict = validateScanRequest(await b.eval(`window.__sent.body`));
    if (!verdict.ok) throw new Error('PDF path rejected: ' + verdict.reason);
    return 'document block accepted';
  });

  // ---------------- the endpoint's own refusals reach the user ----------------
  for (const [status, code, msg, label] of [
    [402, 'quota_exhausted', 'You have used your 50 free scans this month. Add your own Anthropic API key in Settings to keep scanning.', 'the free allowance running out'],
    [429, 'daily_cap', 'Shared scanning has reached its daily limit. Try again tomorrow, or add your own Anthropic API key in Settings.', 'the daily cap'],
    [503, 'not_configured', 'Shared scanning is not set up on this deployment. Add your own Anthropic API key in Settings.', 'scanning not being configured'],
  ]) {
    await check(`shared endpoint — ${label} is explained in its own words`, async () => {
      await b.eval(`
        window.fetch = async () => new Response(JSON.stringify({ error: { code: ${JSON.stringify(code)}, message: ${JSON.stringify(msg)} } }), { status: ${status}, headers: { 'content-type': 'application/json' } });
        return true;`);
      const shown = await b.eval(`
        const c = await import('/js/claude.js');
        try { await c.extractReceipt(${JSON.stringify(PNG)}, { claudeModel: 'claude-haiku-5-5', apiKey: '' }); return 'NO ERROR THROWN'; }
        catch (e) { return e.message; }`);
      eq(shown, msg, 'the endpoint message must reach the user unchanged');
      return 'passed through verbatim';
    });
  }

  await check('text features still ask for your own key', async () => {
    // The shared endpoint reads documents only; free-form text would make it a
    // general-purpose model on a key we pay for.
    let called = false;
    const shown = await b.eval(`
      const c = await import('/js/claude.js');
      window.fetch = async () => { window.__called = true; throw new Error('should not be reached'); };
      window.__called = false;
      try { await c.claudeText({ user: 'hello', settings: { apiKey: '' } }); return { msg: 'NO ERROR THROWN', called: window.__called }; }
      catch (e) { return { msg: e.message, called: window.__called }; }`);
    if (shown.called) throw new Error('a text request was sent to the shared endpoint');
    if (!/own Anthropic API key/i.test(shown.msg)) throw new Error('unclear message: ' + shown.msg);
    if (!/scanning .*works without/i.test(shown.msg)) throw new Error('does not say scanning still works: ' + shown.msg);
    return 'refused locally, and says scanning still works';
  });
  await check('shared endpoint — a non-JSON reply is explained, not thrown raw', async () => {
    // What a misrouted endpoint looks like: a 200 serving the function's own
    // source, or a captive portal's login page.
    await b.eval(`
      window.fetch = async () => new Response('export default function handler() {}', { status: 200, headers: { 'content-type': 'application/javascript' } });
      return true;`);
    const msg = await b.eval(`
      const c = await import('/js/claude.js');
      try { await c.extractReceipt(${JSON.stringify(PNG)}, { claudeModel: 'claude-haiku-5-5', apiKey: '' }); return 'NO ERROR THROWN'; }
      catch (e) { return e.message; }`);
    if (/JSON|SyntaxError|Unexpected token/i.test(msg)) throw new Error('raw parser error surfaced: ' + msg);
    if (!/not available on this deployment/i.test(msg)) throw new Error('unhelpful message: ' + msg);
    return 'points at adding your own key';
  });


  // ---------------- the quota signal the app never read ----------------
  // The shared endpoint reports whether its counters are backed by a shared
  // store. Without one they live in a serverless instance's memory and are
  // lost on every cold start, so the allowance and the rate limits are not
  // loose but absent, and the deployment's key pays for whatever is sent.
  // The header was always there; nothing looked at it.
  const replyWithQuota = (shared) => `
    window.fetch = async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: '{}' }], usage: {}, stop_reason: 'end_turn' }),
      { status: 200, headers: { 'content-type': 'application/json', 'x-kerb-quota-shared': '${shared}' } });
    return true;`;

  await check('shared endpoint — an unenforced quota is recorded, not ignored', async () => {
    await b.eval(`(await import('/js/store.js')).saveSettings({ apiKey: '', sharedQuotaOff: false }); return true;`);
    await b.eval(replyWithQuota('0'));
    await b.eval(`
      const c = await import('/js/claude.js');
      try { await c.extractReceipt(${JSON.stringify(PNG)}, (await import('/js/store.js')).getSettings()); } catch {}
      return true;`);
    const off = await b.eval(`(await import('/js/store.js')).getSettings().sharedQuotaOff`);
    if (off !== true) throw new Error('the endpoint said its limits are off and nothing recorded it');
    // And it clears again when a deployment is configured properly.
    await b.eval(replyWithQuota('1'));
    await b.eval(`
      const c = await import('/js/claude.js');
      try { await c.extractReceipt(${JSON.stringify(PNG)}, (await import('/js/store.js')).getSettings()); } catch {}
      return true;`);
    const on = await b.eval(`(await import('/js/store.js')).getSettings().sharedQuotaOff`);
    if (on !== false) throw new Error('a working store did not clear the warning');
    return 'recorded when off, cleared when on';
  });

  await check('shared endpoint — scanning with your own key records nothing', async () => {
    // The header only describes the shared endpoint. A driver using their own
    // key never touches it, so their setting must not be moved by a reply.
    await b.eval(`(await import('/js/store.js')).saveSettings({ apiKey: 'sk-ant-test-key', sharedQuotaOff: false }); return true;`);
    await b.eval(replyWithQuota('0'));
    await b.eval(`
      const c = await import('/js/claude.js');
      try { await c.extractReceipt(${JSON.stringify(PNG)}, (await import('/js/store.js')).getSettings()); } catch {}
      return true;`);
    const off = await b.eval(`(await import('/js/store.js')).getSettings().sharedQuotaOff`);
    if (off !== false) throw new Error('a direct Anthropic reply moved the shared-endpoint setting');
    return 'own key, own path, setting untouched';
  });

  await b.close();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} scanning checks passed`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
