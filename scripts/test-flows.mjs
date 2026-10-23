// ============================================================
// test-flows.mjs — end-to-end checks for the screens that were
// never exercised in a browser: CSV import, payslips, goals,
// pots, and the Claude-backed capture screens.
//
// These flows own real money: a bad import double-counts income,
// a bad payslip overstates tax. Unit tests cover the arithmetic;
// this covers the screens that feed it.
//
//   node scripts/test-flows.mjs
// ============================================================
import { readFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const results = [];
const ok = (name, detail = '') => { results.push({ name, pass: true, detail }); console.log(`✓ ${name}${detail ? '  ' + detail : ''}`); };
const fail = (name, detail) => { results.push({ name, pass: false, detail }); console.log(`✗ ${name}\n    ${detail}`); };
async function check(name, fn) {
  try { const d = await fn(); ok(name, d || ''); }
  catch (e) { fail(name, (e && e.message || String(e)).slice(0, 400)); }
}
const eq = (actual, expected, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

// Put a file into a hidden <input type=file> the way the picker would.
const putFile = (selector, name, text, type) => `
  const inp = document.querySelector(${JSON.stringify(selector)});
  if (!inp) throw new Error('no file input: ' + ${JSON.stringify(selector)});
  const dt = new DataTransfer();
  dt.items.add(new File([${JSON.stringify(text)}], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));
  inp.files = dt.files;
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return true;`;

const countStore = (store) => `
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('kerb', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return await new Promise((res, rej) => {
    const tx = db.transaction([${JSON.stringify(store)}], 'readonly').objectStore(${JSON.stringify(store)}).count();
    tx.onsuccess = () => res(tx.result); tx.onerror = () => rej(tx.error);
  });`;

// Fill a form control by its visible label. field() ties the label to the
// control with htmlFor, so this follows the same link a user's tap would.
const fillByLabel = (label, value) => `
  const lab = [...document.querySelectorAll('label')].find(l => l.textContent.trim().replace(/\\s+/g, ' ').startsWith(${JSON.stringify(label)}));
  if (!lab) throw new Error('no label: ' + ${JSON.stringify(label)});
  const ctl = document.getElementById(lab.htmlFor);
  if (!ctl) throw new Error('label not wired to a control: ' + ${JSON.stringify(label)});
  ctl.value = ${JSON.stringify(String(value))};
  ctl.dispatchEvent(new Event('input', { bubbles: true }));
  ctl.dispatchEvent(new Event('change', { bubbles: true }));
  return true;`;

const clickText = (re, scope = '#view') => `
  const el = [...document.querySelectorAll(${JSON.stringify(scope)} + ' button, ' + ${JSON.stringify(scope)} + ' .chip, .sheet button')]
    .find(x => new RegExp(${JSON.stringify(re)}, 'i').test(x.textContent));
  if (!el) throw new Error('no control matching ' + ${JSON.stringify(re)});
  el.click();
  return true;`;

const EARNINGS_CSV = [
  'Date,Platform,Earnings,Tips,Hours,Deliveries,Miles',
  '12/09/2026,Amazon Flex,62.50,0,4,0,48',
  '13/09/2026,Uber Eats,41.20,5.50,3,11,24',
  '14/09/2026,Amazon Flex,58.00,0,3.5,0,41',
  ',,,,,,',                       // blank row: must be skipped
  '15/09/2026,Uber Eats,0,0,0,0,0',   // nothing to record: must be skipped
].join('\n');

const EXPENSES_CSV = [
  'Date,Merchant,Amount,Category',
  '12/09/2026,Shell,61.40,fuel',
  '13/09/2026,NCP,4.50,parking',
].join('\n');

const run = async () => {
  const b = await launch();
  await b.open('/welcome/');
  await b.resetSW();
  // Start from a clean, onboarded account with no records at all, so every
  // count below is caused by the flow under test.
  await b.eval(`
    const settings = {
      region: 'ruk', vehicle: 'car', expenseMethod: 'mileage', taxYear: '2026/27',
      payeSalary: 0, payeTaxPaid: 0, otherIncome: 0, studentLoanPlan: 'none',
      taxPotMode: 'auto', vehiclePotPerWeek: 30, savingsGoalPerWeek: 25,
      potTaxSaved: 0, potVehicleSaved: 0, potSavingsSaved: 0,
      seStartDate: '2026-04-10', apiKey: '', claudeModel: 'claude-haiku-4-5',
      lang: 'en', onboarded: true, customPlatforms: [], rateOverrides: {},
      payeSource: 'payslips',
    };
    localStorage.setItem('kerb.settings.v1', JSON.stringify(settings));
    await new Promise((res, rej) => { const d = indexedDB.deleteDatabase('kerb'); d.onsuccess = res; d.onerror = res; d.onblocked = res; });
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('kerb', 3);
      r.onupgradeneeded = () => { const x = r.result;
        for (const n of ['earnings','expenses','bills','payslips']) if (!x.objectStoreNames.contains(n)) { const os = x.createObjectStore(n, { keyPath: 'id' }); os.createIndex('date','date'); }
        if (!x.objectStoreNames.contains('images')) x.createObjectStore('images', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    db.close();
    return true;`);
  await b.open('/');
  await b.ready();

  // ---------------- CSV import: earnings ----------------
  await check('csv import — earnings: parses, maps and saves', async () => {
    await b.goto('#/import');
    b.clearErrors();
    await b.eval(putFile('#view input[type=file]', 'flex.csv', EARNINGS_CSV, 'text/csv'));
    await b.settled();
    const rowsFound = await b.eval(`document.querySelector('#view .row--between div')?.textContent || ''`);
    if (!/\d+ rows found/.test(rowsFound)) throw new Error('mapping card did not appear: ' + JSON.stringify(rowsFound));
    const previewCount = await b.eval(`document.querySelectorAll('#view .card--flush .item').length`);
    if (previewCount < 1) throw new Error('no preview rows rendered');
    await b.eval(`[...document.querySelectorAll('#view button')].find(x => /Import earnings/i.test(x.textContent)).click(); return true;`);
    await b.settled();
    const n = await b.eval(countStore('earnings'));
    eq(n, 3, 'earnings saved (blank and zero rows must be skipped)');
    const errs = b.errors();
    if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
    return `3 of 5 rows imported, 2 skipped`;
  });

  await check('csv import — figures survive the round trip', async () => {
    const recs = await b.eval(`
      const db = await new Promise((res) => { const r = indexedDB.open('kerb', 3); r.onsuccess = () => res(r.result); });
      const all = await new Promise((res) => { const q = db.transaction(['earnings'],'readonly').objectStore('earnings').getAll(); q.onsuccess = () => res(q.result); });
      return all.map(r => ({ date: r.date, amount: r.amount, tips: r.tips, hours: r.hours, miles: r.miles, platform: r.platform })).sort((a,b) => a.date < b.date ? -1 : 1);`);
    eq(recs.length, 3, 'record count');
    eq(recs[0], { date: '2026-09-12', amount: 62.5, tips: 0, hours: 4, miles: 48, platform: 'amazonflex' }, 'row 1');
    eq(recs[1], { date: '2026-09-13', amount: 41.2, tips: 5.5, hours: 3, miles: 24, platform: 'ubereats' }, 'row 2');
    return 'dates parsed as UK, amounts/tips/platform correct';
  });

  // ---------------- CSV import: duplicate protection ----------------
  await check('csv import — re-importing the same file adds nothing', async () => {
    await b.goto('#/import');
    b.clearErrors();
    await b.eval(putFile('#view input[type=file]', 'flex.csv', EARNINGS_CSV, 'text/csv'));
    await b.settled();
    const warned = await b.eval(`/match entries you already have/.test(document.getElementById('view').textContent)`);
    if (!warned) throw new Error('no duplicate warning shown');
    await b.eval(`[...document.querySelectorAll('#view button')].find(x => /Import earnings/i.test(x.textContent)).click(); return true;`);
    await b.settled();
    const n = await b.eval(countStore('earnings'));
    eq(n, 3, 'earnings after re-import (must not double-count)');
    return 'all 3 rows detected as duplicates and skipped';
  });

  // ---------------- CSV import: expenses ----------------
  await check('csv import — expenses', async () => {
    await b.goto('#/import');
    await b.eval(`[...document.querySelectorAll('#view .chip')].find(x => x.textContent.trim() === 'Expenses').click(); return true;`);
    await b.settled();
    await b.eval(putFile('#view input[type=file]', 'bank.csv', EXPENSES_CSV, 'text/csv'));
    await b.settled();
    await b.eval(`[...document.querySelectorAll('#view button')].find(x => /Import expenses/i.test(x.textContent)).click(); return true;`);
    await b.settled();
    const n = await b.eval(countStore('expenses'));
    eq(n, 2, 'expenses saved');
    const cats = await b.eval(`
      const db = await new Promise((res) => { const r = indexedDB.open('kerb', 3); r.onsuccess = () => res(r.result); });
      const all = await new Promise((res) => { const q = db.transaction(['expenses'],'readonly').objectStore('expenses').getAll(); q.onsuccess = () => res(q.result); });
      return all.map(x => x.category).sort();`);
    eq(cats, ['fuel', 'parking'], 'categories matched from the CSV column');
    return '2 expenses, categories matched';
  });

  // ---------------- CSV import: rubbish file ----------------
  await check('csv import — a file with no rows is refused, not crashed', async () => {
    await b.goto('#/import');
    b.clearErrors();
    const before = await b.eval(countStore('earnings'));
    await b.eval(putFile('#view input[type=file]', 'empty.csv', 'not,a,real,csv', 'text/csv'));
    await b.settled();
    const after = await b.eval(countStore('earnings'));
    eq(after, before, 'nothing imported from a header-only file');
    const errs = b.errors();
    if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
    return 'handled without saving anything or throwing';
  });

  // ---------------- payslips ----------------
  await check('payslips — manual entry saves and feeds the tax engine', async () => {
    await b.goto('#/payslips');
    b.clearErrors();
    await b.eval(clickText('Enter manually|Add a payslip'));
    await b.settled();
    await b.eval(fillByLabel('Pay date', '2026-08-28'));
    await b.eval(fillByLabel('Gross (this pay)', '2000'));
    await b.eval(fillByLabel('Income tax', '250'));
    await b.eval(fillByLabel('National Insurance', '120'));
    await b.eval(clickText('^\\s*Save\\s*$', '.sheet'));
    await b.settled();
    const n = await b.eval(countStore('payslips'));
    eq(n, 1, 'payslips saved');
    const errs = b.errors();
    if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
    return 'one payslip stored';
  });

  await check('payslips — an ongoing job is annualised', async () => {
    const d = await b.eval(`
      const m = await import('/js/payslips.js');
      const db = await import('/js/db.js');
      const st = await import('/js/store.js');
      st.saveSettings({ payeFinished: false });
      return m.derivePaye(await db.payslips.all(), '2026/27');`);
    eq(d.annualSalary, 24000, 'annual salary (2000 x 12)');
    eq(d.annualTax, 3000, 'annual tax (250 x 12)');
    return '£2,000/month projected to £24,000';
  });

  await check('payslips — a finished job uses the real total, not a projection', async () => {
    const d = await b.eval(`
      const m = await import('/js/payslips.js');
      const db = await import('/js/db.js');
      const st = await import('/js/store.js');
      st.saveSettings({ payeFinished: true });
      return m.derivePaye(await db.payslips.all(), '2026/27');`);
    eq(d.annualSalary, 2000, 'annual salary must be the actual total once the job ended');
    eq(d.annualTax, 250, 'annual tax must be the actual total once the job ended');
    await b.eval(`const st = await import('/js/store.js'); st.saveSettings({ payeFinished: false }); return true;`);
    return 'uses £2,000 actual, not £24,000 projected';
  });

  // ---------------- goals ----------------
  await check('goals — setting a goal persists it', async () => {
    await b.goto('#/goals');
    b.clearErrors();
    await b.eval(fillByLabel('Target amount', '450'));
    await b.eval(clickText('Set goal|Update goal'));
    await b.settled();
    const g = await b.eval(`const s = JSON.parse(localStorage.getItem('kerb.settings.v1')); return { amount: s.goalAmount, on: s.goalOn !== false, period: s.goalPeriod };`);
    if (!(Number(g.amount) === 450)) throw new Error('goal amount not saved: ' + JSON.stringify(g));
    const errs = b.errors();
    if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
    return `saved ${g.amount} per ${g.period || 'week'}`;
  });

  await check('goals — an empty target is refused', async () => {
    await b.goto('#/goals');
    await b.eval(fillByLabel('Target amount', ''));
    await b.eval(clickText('Set goal|Update goal'));
    await b.settled();
    const amount = await b.eval(`Number(JSON.parse(localStorage.getItem('kerb.settings.v1')).goalAmount)`);
    eq(amount, 450, 'previous goal kept when the field is blank');
    return 'blank target rejected, previous goal intact';
  });

  // ---------------- pots ----------------
  await check('pots — editing the saved amount persists it', async () => {
    await b.goto('#/pots');
    b.clearErrors();
    await b.eval(clickText('Update', '#view'));
    await b.settled();
    await b.eval(`
      const inp = document.querySelector('.sheet input');
      if (!inp) throw new Error('no input in the pot sheet');
      inp.value = '1250'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      return true;`);
    await b.eval(clickText('^\\s*Save\\s*$', '.sheet'));
    await b.settled();
    const saved = await b.eval(`const s = JSON.parse(localStorage.getItem('kerb.settings.v1')); return [s.potTaxSaved, s.potVehicleSaved, s.potSavingsSaved];`);
    if (!saved.includes(1250)) throw new Error('pot amount not saved: ' + JSON.stringify(saved));
    const errs = b.errors();
    if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
    return 'pot balance stored as 1250';
  });

  // ---------------- Claude-backed screens without a key ----------------
  for (const [route, name] of [['assistant', 'assistant'], ['scanearn', 'scan earnings'], ['bankimport', 'bank import']]) {
    await check(`${name} — explains the missing API key instead of failing`, async () => {
      await b.goto('#/' + route);
      b.clearErrors();
      const txt = await b.eval(`document.getElementById('view').textContent`);
      if (!/API key/i.test(txt)) throw new Error('no mention of the API key on a keyless account');
      const errs = b.errors();
      if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
      return 'prompts for a key, no errors';
    });
  }

  await b.close();

  await b.close();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} flow checks passed`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
