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

  // ---------------- add earnings / add expense ----------------
  // The most-used screens in the app, and the ones that put money into the
  // tax figures by hand.
  const openAdd = async (which) => {
    await b.goto('#/home');
    await b.eval(`const m = await import('/js/ui/forms.js'); m.${which}(); return true;`);
    await b.settled();
  };

  await check('add earnings — a shift entered by hand is stored exactly', async () => {
    await openAdd('openEarningsForm');
    b.clearErrors();
    await b.eval(fillByLabel('Date', '2026-09-20'));
    await b.eval(fillByLabel('Earnings (before tips)', '73.40'));
    await b.eval(fillByLabel('Tips', '6.10'));
    await b.eval(fillByLabel('Hours worked', '5'));
    await b.eval(fillByLabel('Deliveries', '14'));
    await b.eval(fillByLabel('Business miles driven', '52'));
    await b.eval(clickText('^\s*Save\s*$', '.sheet'));
    await b.settled();
    const rec = await b.eval(`
      const db = await import('/js/db.js');
      const all = await db.earnings.all();
      const hit = all.find(r => r.date === '2026-09-20');
      return hit ? { amount: hit.amount, tips: hit.tips, hours: hit.hours, deliveries: hit.deliveries, miles: hit.miles } : null;`);
    eq(rec, { amount: 73.4, tips: 6.1, hours: 5, deliveries: 14, miles: 52 }, 'saved shift');
    const errs = b.errors();
    if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
    return 'amount, tips, hours, drops and miles all round-trip';
  });

  await check('add earnings — an empty shift is refused', async () => {
    const before = await b.eval(countStore('earnings'));
    await openAdd('openEarningsForm');
    await b.eval(clickText('^\s*Save\s*$', '.sheet'));
    await b.settled();
    const after = await b.eval(countStore('earnings'));
    eq(after, before, 'nothing saved with no amount, tips or miles');
    const stillOpen = await b.eval(`!!document.querySelector('.sheet')`);
    if (!stillOpen) throw new Error('the form closed even though nothing was saved');
    await b.eval(`const m = await import('/js/ui/shared.js'); m.closeSheet(); return true;`);
    return 'refused and the form stayed open';
  });

  await check('add earnings — a miles-only entry is allowed', async () => {
    await openAdd('openEarningsForm');
    await b.eval(fillByLabel('Date', '2026-09-21'));
    await b.eval(fillByLabel('Business miles driven', '31'));
    await b.eval(clickText('^\s*Save\s*$', '.sheet'));
    await b.settled();
    const rec = await b.eval(`
      const db = await import('/js/db.js');
      const hit = (await db.earnings.all()).find(r => r.date === '2026-09-21');
      return hit ? { amount: hit.amount, miles: hit.miles } : null;`);
    eq(rec, { amount: 0, miles: 31 }, 'miles-only shift');
    return 'a mileage-only day is a valid record';
  });

  await check('add expense — stored with the category default for business use', async () => {
    await openAdd('openExpenseForm');
    b.clearErrors();
    await b.eval(fillByLabel('Date', '2026-09-20'));
    await b.eval(fillByLabel('Amount paid', '48.20'));
    await b.eval(fillByLabel('Vendor', 'BP'));
    await b.eval(clickText('^\s*Save\s*$', '.sheet'));
    await b.settled();
    const rec = await b.eval(`
      const db = await import('/js/db.js');
      const hit = (await db.expenses.all()).find(x => x.date === '2026-09-20' && x.vendor === 'BP');
      return hit ? { amount: hit.amount, category: hit.category, bizPct: hit.bizPct } : null;`);
    if (!rec) throw new Error('expense not saved');
    eq([rec.amount, rec.category], [48.2, 'fuel'], 'amount and default category');
    if (rec.bizPct !== 100) throw new Error('expected 100% business use for fuel, got ' + rec.bizPct);
    const errs = b.errors();
    if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
    return 'fuel expense at 100% business use';
  });

  await check('add expense — no amount is refused', async () => {
    const before = await b.eval(countStore('expenses'));
    await openAdd('openExpenseForm');
    await b.eval(fillByLabel('Vendor', 'Nothing'));
    await b.eval(clickText('^\s*Save\s*$', '.sheet'));
    await b.settled();
    eq(await b.eval(countStore('expenses')), before, 'nothing saved without an amount');
    await b.eval(`const m = await import('/js/ui/shared.js'); m.closeSheet(); return true;`);
    return 'refused';
  });

  await check('add expense — an impossible business use cannot be saved', async () => {
    // The field is a number input capped at 100 inside a submitting form, so
    // the browser refuses the save outright; the clamp in save() is the second
    // line of defence behind it.
    await openAdd('openExpenseForm');
    await b.eval(fillByLabel('Date', '2026-09-22'));
    await b.eval(fillByLabel('Amount paid', '20'));
    await b.eval(fillByLabel('Vendor', 'ClampTest'));
    await b.eval(fillByLabel('Business use %', '150'));
    await b.eval(clickText('^\s*Save\s*$', '.sheet'));
    await b.settled();
    const saved = await b.eval(`
      const db = await import('/js/db.js');
      return !!(await db.expenses.all()).find(x => x.vendor === 'ClampTest');`);
    if (saved) throw new Error('an expense with 150% business use was saved');
    // The same form saves happily once the figure is possible.
    await b.eval(fillByLabel('Business use %', '50'));
    await b.eval(clickText('^\s*Save\s*$', '.sheet'));
    await b.settled();
    const pct = await b.eval(`
      const db = await import('/js/db.js');
      const hit = (await db.expenses.all()).find(x => x.vendor === 'ClampTest');
      return hit ? hit.bizPct : null;`);
    eq(pct, 50, 'business use saved once in range');
    return '150% blocked by the form, 50% saved';
  });

  // ---------------- backup: the only copy off this device ----------------
  await check('backup — export carries the records but no secret values', async () => {
    const info = await b.eval(`
      const st = await import('/js/store.js');
      st.saveSettings({ apiKey: 'sk-ant-SHOULD-NOT-APPEAR', utr: '1234567890', pinHash: 'HASH-SHOULD-NOT-APPEAR', pinSalt: 'SALT-SHOULD-NOT-APPEAR', lockEnabled: true });
      const db = await import('/js/db.js');
      const data = await db.exportAll();
      const text = JSON.stringify(data);
      return {
        earnings: (data.earnings || []).length,
        expenses: (data.expenses || []).length,
        payslips: (data.payslips || []).length,
        leaks: ['sk-ant-SHOULD-NOT-APPEAR', 'HASH-SHOULD-NOT-APPEAR', 'SALT-SHOULD-NOT-APPEAR'].filter(v => text.includes(v)),
        blanked: { apiKey: data.settings.apiKey, pinHash: data.settings.pinHash, pinSalt: data.settings.pinSalt, lockEnabled: data.settings.lockEnabled },
        keepsUtr: text.includes('1234567890'),
      };`);
    if (info.leaks.length) throw new Error('secret values present in the backup: ' + info.leaks.join(', '));
    // The keys are written as empty rather than omitted, so importing a backup
    // clears any PIN on the receiving device instead of leaving a stale one.
    eq(info.blanked, { apiKey: '', pinHash: '', pinSalt: '', lockEnabled: false }, 'secret fields blanked');
    if (!info.earnings || !info.expenses) throw new Error('backup is missing records: ' + JSON.stringify(info));
    if (!info.keepsUtr) throw new Error('UTR missing — a backup should restore your own details');
    await b.eval(`const st = await import('/js/store.js'); st.saveSettings({ apiKey: '', pinHash: '', pinSalt: '', lockEnabled: false }); return true;`);
    return `${info.earnings} earnings, ${info.expenses} expenses, ${info.payslips} payslips; no key, no PIN, UTR kept`;
  });

  await check('backup — export, wipe, import restores every figure', async () => {
    const outcome = await b.eval(`
      const db = await import('/js/db.js');
      const before = {
        earnings: (await db.earnings.all()).length,
        expenses: (await db.expenses.all()).length,
        payslips: (await db.payslips.all()).length,
        income: (await db.earnings.all()).reduce((t, r) => t + (r.amount || 0) + (r.tips || 0), 0),
        spend: (await db.expenses.all()).reduce((t, r) => t + (r.amount || 0), 0),
      };
      const backup = JSON.parse(JSON.stringify(await db.exportAll()));
      await db.wipeAll();
      const emptied = (await db.earnings.all()).length;
      const res = await db.importAll(backup, { replace: true });
      const after = {
        earnings: (await db.earnings.all()).length,
        expenses: (await db.expenses.all()).length,
        payslips: (await db.payslips.all()).length,
        income: (await db.earnings.all()).reduce((t, r) => t + (r.amount || 0) + (r.tips || 0), 0),
        spend: (await db.expenses.all()).reduce((t, r) => t + (r.amount || 0), 0),
      };
      return { before, emptied, after, res };`);
    eq(outcome.emptied, 0, 'wipe actually emptied the store');
    eq(outcome.after, outcome.before, 'restored data must match what was exported');
    return `${outcome.after.earnings} earnings and ${outcome.after.expenses} expenses restored, totals identical`;
  });

  await check('backup — a corrupt file is rejected without destroying what is there', async () => {
    const outcome = await b.eval(`
      const db = await import('/js/db.js');
      const before = (await db.earnings.all()).length;
      let threw = false;
      try { await db.importAll({ earnings: 'not-an-array', expenses: 42 }, { replace: true }); }
      catch (e) { threw = true; }
      return { before, after: (await db.earnings.all()).length, threw };`);
    if (outcome.after !== outcome.before) {
      throw new Error(`records lost to a bad import: ${outcome.before} -> ${outcome.after}`);
    }
    return `kept all ${outcome.before} records (${outcome.threw ? 'rejected with an error' : 'ignored the bad fields'})`;
  });
  // ---------------- model generation ----------------
  await check('model — an old install is moved onto the current generation', async () => {
    // claude-haiku-4-5 costs ten times as much per scan as claude-haiku-5-5
    // for the same job, so an install left on it is quietly overcharged.
    const out = await b.eval(`
      const raw = JSON.parse(localStorage.getItem('kerb.settings.v1'));
      raw.claudeModel = 'claude-haiku-4-5';
      localStorage.setItem('kerb.settings.v1', JSON.stringify(raw));
      return true;`);
    await b.open('/');
    await b.ready();
    const after = await b.eval(`JSON.parse(localStorage.getItem('kerb.settings.v1')).claudeModel`);
    eq(after, 'claude-haiku-5-5', 'migrated model');
    const persisted = await b.eval(`
      const st = await import('/js/store.js');
      return { setting: st.getSettings().claudeModel, dflt: st.DEFAULT_MODEL };`);
    eq(persisted, { setting: 'claude-haiku-5-5', dflt: 'claude-haiku-5-5' }, 'migration persisted and default agrees');
    return 'claude-haiku-4-5 -> claude-haiku-5-5, written back to storage';
  });

  await check('model — a model the user deliberately chose is left alone', async () => {
    await b.eval(`
      const raw = JSON.parse(localStorage.getItem('kerb.settings.v1'));
      raw.claudeModel = 'claude-sonnet-5-5';
      localStorage.setItem('kerb.settings.v1', JSON.stringify(raw));
      return true;`);
    await b.open('/');
    await b.ready();
    const after = await b.eval(`JSON.parse(localStorage.getItem('kerb.settings.v1')).claudeModel`);
    eq(after, 'claude-sonnet-5-5', 'current-generation choice untouched');
    return 'a current model is not rewritten';
  });
  // ---------------- rates for a year HMRC has not published ----------------
  await check('tax year — carried-over rates are flagged, not passed off as this year\'s', async () => {
    const out = await b.eval(`
      const st = await import('/js/store.js');
      const known = Object.keys(st.TAX_YEARS);
      const latest = known.sort()[known.length - 1];
      const future = (parseInt(latest, 10) + 1) + '/' + String((parseInt(latest, 10) + 2) % 100).padStart(2, '0');
      const real = st.getConfig(latest), carried = st.getConfig(future);
      return { latest, future, realFlag: real.carriedFrom, carriedFlag: carried.carriedFrom,
               sameAllowance: real.personalAllowance === carried.personalAllowance };`);
    if (out.realFlag) throw new Error('a published year must not be marked as carried over');
    if (out.carriedFlag !== out.latest) throw new Error(`a future year must record where its rates came from, got ${JSON.stringify(out.carriedFlag)}`);
    if (!out.sameAllowance) throw new Error('the carried rates should be a copy of the latest known year');
    return `${out.future} marked as using ${out.carriedFlag} rates`;
  });

  await check('tax year — the Tax screen says so when the rates are a placeholder', async () => {
    await b.eval(`
      const st = await import('/js/store.js');
      const known = Object.keys(st.TAX_YEARS).sort();
      const latest = known[known.length - 1];
      const future = (parseInt(latest, 10) + 1) + '/' + String((parseInt(latest, 10) + 2) % 100).padStart(2, '0');
      st.saveSettings({ taxYear: future });
      return true;`);
    await b.goto('#/tax');
    const warned = await b.eval(`/rates\\./.test(document.getElementById('view').textContent) && /has not published/.test(document.getElementById('view').textContent)`);
    if (!warned) throw new Error('the Tax screen showed no warning for a year with no published rates');
    // And no warning on a year that does have real figures.
    await b.eval(`
      const st = await import('/js/store.js');
      const known = Object.keys(st.TAX_YEARS).sort();
      st.saveSettings({ taxYear: known[known.length - 1] });
      return true;`);
    await b.goto('#/tax');
    const quiet = await b.eval(`!/has not published/.test(document.getElementById('view').textContent)`);
    if (!quiet) throw new Error('warned about a year that does have published rates');
    return 'warns only when the figures are a placeholder';
  });

  // ---------------- the review screen catches a double-counted payout ----------------
  await check('review — a weekly payout sitting next to its blocks is flagged before filing', async () => {
    await b.eval(`
      const db = await import('/js/db.js');
      const st = await import('/js/store.js');
      await db.wipeAll();
      st.saveSettings({ taxYear: '2026/27', expenseMethod: 'mileage' });
      const mk = (date, amount, hours, miles) => ({ id: 'r' + date + amount, date, platform: 'amazonflex', amount, tips: 0, hours, deliveries: 0, miles, notes: '' });
      for (const e of [mk('2026-09-15', 75, 4, 40), mk('2026-09-16', 75, 4, 41), mk('2026-09-17', 75, 4, 39), mk('2026-09-18', 75, 4, 42)]) await db.earnings.save(e);
      await db.earnings.save(mk('2026-09-18', 300, 0, 0));   // the week's payout
      return true;`);
    await b.goto('#/review');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (!/adds? up to/i.test(txt)) throw new Error('the review screen did not flag the roll-up');
    if (!/£300/.test(txt)) throw new Error('the flagged amount is not shown: ' + txt.slice(0, 200));
    if (!/same money twice|income you never earned/i.test(txt)) throw new Error('does not explain the consequence');
    return 'flagged £300 as the total of its own blocks';
  });

  await check('review — an ordinary week is not flagged', async () => {
    await b.eval(`
      const db = await import('/js/db.js');
      await db.wipeAll();
      const mk = (date, amount) => ({ id: 'n' + date, date, platform: 'amazonflex', amount, tips: 0, hours: 4, deliveries: 0, miles: 40, notes: '' });
      for (const e of [mk('2026-09-15', 75), mk('2026-09-16', 82), mk('2026-09-17', 68), mk('2026-09-18', 91)]) await db.earnings.save(e);
      return true;`);
    await b.goto('#/review');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (/adds? up to other entries/i.test(txt)) throw new Error('false positive on a normal week');
    return 'silent';
  });

  // ---------------- assigning stations to shifts already logged ----------------
  const seedShifts = (n, withStation) => `
    const db = await import('/js/db.js');
    const st = await import('/js/store.js');
    await db.wipeAll();
    st.saveSettings({ taxYear: '2026/27', expenseMethod: 'mileage', lang: 'en', stations: [
      { id: 'sheff', label: 'Amazon Logistics (S4 8AL)', baseMiles: 2.3, typicalMiles: 19 },
      { id: 'donny', label: 'Amazon Logistics (DN11 0BF)', baseMiles: 21.5, typicalMiles: 0 },
    ] });
    for (let i = 0; i < ${n}; i++) {
      await db.earnings.save({ id: 'b' + i, date: '2026-09-' + String(10 + i).padStart(2, '0'),
        platform: 'amazonflex', amount: 70, tips: 0, hours: 4, deliveries: 0, miles: 40,
        stationId: ${JSON.stringify(withStation || '')}, notes: '' });
    }
    return true;`

  await check('assign — the screen lists every shift that has no station', async () => {
    await b.eval(seedShifts(12, ''));
    await b.goto('#/assignstations');
    const out = await b.eval(`
      const v = document.getElementById('view');
      // Plain includes, not a regex: a backslash escape inside a template
      // literal is consumed before the regex ever sees it.
      return { rows: v.querySelectorAll('.item').length, chipShows12: v.textContent.includes('Without a station (12)') };`);
    eq(out.rows, 12, 'rows listed');
    if (!out.chipShows12) throw new Error('the filter does not show how many are missing');
    return '12 shifts waiting for a station';
  });

  await check('assign — setting one shift saves the station and the outbound leg', async () => {
    const out = await b.eval(`
      const sel = document.querySelector('#view .item select');
      sel.value = 'donny';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const db = await import('/js/db.js');
      const hit = (await db.earnings.all()).find(e => e.stationId === 'donny');
      return hit ? { stationId: hit.stationId, milesBase: hit.milesBase, miles: hit.miles } : null;`);
    eq(out, { stationId: 'donny', milesBase: 21.5, miles: 40 }, 'one shift updated');
    return 'station set, miles untouched, outbound leg recorded';
  });

  await check('assign — a bulk apply needs both a station and a selection', async () => {
    await b.eval(seedShifts(6, ''));
    await b.goto('#/assignstations');
    const states = await b.eval(`
      const btn = [...document.querySelectorAll('#view button')].find(x => /Select some shifts|Apply to/.test(x.textContent));
      const before = { text: btn.textContent, disabled: btn.disabled };
      document.querySelectorAll('#view .item input[type=checkbox]')[0].click();
      document.querySelectorAll('#view .item input[type=checkbox]')[1].click();
      const picked = { text: btn.textContent, disabled: btn.disabled };
      const sel = document.querySelector('#view .card select');
      sel.value = 'sheff'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      const ready = { text: btn.textContent, disabled: btn.disabled };
      return { before, picked, ready };`);
    if (!states.before.disabled) throw new Error('apply was enabled with nothing selected');
    if (!states.picked.disabled) throw new Error('apply was enabled before a station was chosen');
    if (states.ready.disabled) throw new Error('apply stayed disabled when both were set');
    if (!/Apply to 2 shifts/.test(states.ready.text)) throw new Error('button does not say how many: ' + states.ready.text);
    return 'enabled only once both are set';
  });

  await check('assign — a bulk apply sets only the selected shifts', async () => {
    await b.eval(`
      const btn = [...document.querySelectorAll('#view button')].find(x => /Apply to/.test(x.textContent));
      btn.click();
      await new Promise(r => setTimeout(r, 200));
      const ok = [...document.querySelectorAll('.sheet button, .sheet .btn')].find(x => /Set station/i.test(x.textContent));
      if (ok) ok.click();
      await new Promise(r => setTimeout(r, 500));
      return true;`);
    const out = await b.eval(`
      const db = await import('/js/db.js');
      const all = await db.earnings.all();
      return { set: all.filter(e => e.stationId === 'sheff').length, untouched: all.filter(e => !e.stationId).length,
               miles: [...new Set(all.map(e => e.miles))].sort((a, b) => a - b) };`);
    eq(out.set, 2, 'shifts updated');
    eq(out.untouched, 4, 'the rest left alone');
    eq(out.miles, [40], 'miles kept, because the option was off');
    return '2 of 6 set, miles untouched';
  });

  await check('assign — the miles option is off unless that station has been measured', async () => {
    await b.goto('#/assignstations');
    const out = await b.eval(`
      const sel = document.querySelector('#view .card select');
      const cb = document.querySelector('#view .switch input[type=checkbox]');
      sel.value = 'donny';                      // no measured block distance
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const unmeasured = { disabled: cb.disabled, hint: document.querySelector('#view .card .hint').textContent };
      sel.value = 'sheff';                      // measured at 19 mi
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const measured = { disabled: cb.disabled, hint: document.querySelector('#view .card .hint').textContent };
      return { unmeasured, measured };`);
    if (!out.unmeasured.disabled) throw new Error('offered to overwrite miles from a station with no measurement');
    if (!/no measured block distance/i.test(out.unmeasured.hint)) throw new Error('does not explain why: ' + out.unmeasured.hint);
    if (out.measured.disabled) throw new Error('refused to offer it for a measured station');
    if (!/19 miles/.test(out.measured.hint)) throw new Error('does not say what it would set: ' + out.measured.hint);
    return 'only offered where there is a real figure behind it';
  });

  await check('assign — the review screen points at it, and stops once they are all set', async () => {
    await b.eval(seedShifts(3, ''));
    await b.goto('#/review');
    const before = await b.eval(`document.getElementById('view').textContent`);
    if (!/3 shifts have no station set/.test(before)) throw new Error('review did not flag the missing stations');
    if (!/a guess here would change the mileage/i.test(before)) throw new Error('review does not warn against guessing');
    await b.eval(seedShifts(3, 'sheff'));
    await b.goto('#/review');
    const after = await b.eval(`document.getElementById('view').textContent`);
    if (/have no station set/.test(after)) throw new Error('still flagged once every shift had one');
    if (!/Every shift has a station/.test(after)) throw new Error('no confirmation once done');
    return 'flags 3, then confirms when none are left';
  });

  // ---------------- what the report discloses about the mileage ----------------
  // The basis note states a method in the driver's own words. This states the
  // facts behind it, counted from the records, so it cannot claim more than
  // they hold — which is the point: it is the answer to the question that
  // follows "how did you work this out".
  const seedEvidence = (rows) => `
    const db = await import('/js/db.js');
    const st = await import('/js/store.js');
    await db.wipeAll();
    st.saveSettings({ taxYear: '2026/27', expenseMethod: 'mileage', lang: 'en', mileageBasis: '',
      stations: [{ id: 'sheff', label: 'Amazon Logistics (S4 8AL)', baseMiles: 2.3, typicalMiles: 0 }] });
    const rows = ${JSON.stringify(rows)};
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await db.earnings.save({ id: 'ev' + i, date: '2026-09-' + String(10 + i).padStart(2, '0'),
        platform: 'amazonflex', amount: 70, tips: 0, hours: 4, deliveries: 0,
        miles: r.miles, stationId: 'sheff', notes: '', ...(r.src ? { milesSource: r.src } : {}) });
    }
    return true;`;

  await check('report — says plainly when not one mile was measured', async () => {
    await b.eval(seedEvidence([{ miles: 40 }, { miles: 30, src: 'manual' }]));
    await b.goto('#/report');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (!/None of the 2 shifts claimed this year had its mileage read from an odometer or tracked/.test(txt)) {
      throw new Error('the report does not disclose that the claim is entirely estimated: ' + txt.slice(0, 300));
    }
    return 'discloses an entirely estimated claim';
  });

  await check('report — counts measured against estimated, and the miles with them', async () => {
    await b.eval(seedEvidence([{ miles: 40, src: 'odometer' }, { miles: 30, src: 'gps' }, { miles: 50, src: 'manual' }]));
    await b.goto('#/report');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (!/Of the 3 shifts claimed this year, 2 had their mileage read from an odometer or tracked at the time \(70 miles\); the remaining 50 miles are estimates/.test(txt)) {
      throw new Error('the split is not stated as counted: ' + txt.slice(0, 400));
    }
    return '2 of 3 measured, 70 mi against 50 mi';
  });

  await check('report — a typed-in figure is never disclosed as measured', async () => {
    // The disclosure is only worth having if it cannot overstate. 'manual' is
    // what the entry form records, however carefully the figure was worked out.
    await b.eval(seedEvidence([{ miles: 40, src: 'manual' }, { miles: 30, src: 'manual' }]));
    await b.goto('#/report');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (!/None of the 2 shifts/.test(txt)) throw new Error('a typed-in figure was disclosed as measured: ' + txt.slice(0, 300));
    return 'manual counts as an estimate on the document too';
  });

  await check('report — confirms it when every shift was measured', async () => {
    await b.eval(seedEvidence([{ miles: 40, src: 'odometer' }, { miles: 30, src: 'odometer' }]));
    await b.goto('#/report');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (!/All 2 shifts claimed this year had their mileage read from an odometer or tracked at the time/.test(txt)) {
      throw new Error('no confirmation when the whole claim is measured: ' + txt.slice(0, 300));
    }
    return 'states a fully measured claim';
  });

  await check('settings — a single reading is not offered as a typical distance', async () => {
    // One reading is one route. It then pre-fills every later block from that
    // station, so an unusually long day would quietly raise the claim on all
    // of them — the direction that creates a problem with HMRC.
    await b.eval(seedEvidence([{ miles: 19, src: 'odometer' }]));
    await b.goto('#/settings');
    const one = await b.eval(`
      await new Promise(r => setTimeout(r, 400));
      const v = document.getElementById('view');
      return { txt: v.textContent, warned: [...v.querySelectorAll('div')].some(d =>
        /one route rather than a typical distance/.test(d.textContent) && /warn/.test(d.style.color)) };`);
    if (!/Measured over 1 shift: 19 mi a block/.test(one.txt)) throw new Error('the measured figure is not shown');
    if (!one.warned) throw new Error('a sample of one is offered with no caution');
    // A second reading makes it a range, and the caution goes.
    await b.eval(`
      const db = await import('/js/db.js');
      await db.earnings.save({ id: 'ev1', date: '2026-09-11', platform: 'amazonflex', amount: 70, tips: 0,
        hours: 4, deliveries: 0, miles: 25, stationId: 'sheff', milesSource: 'odometer', notes: '' });
      return true;`);
    await b.goto('#/settings');
    const two = await b.eval(`
      await new Promise(r => setTimeout(r, 400));
      const v = document.getElementById('view');
      return { txt: v.textContent, warned: /one route rather than a typical distance/.test(v.textContent) };`);
    if (!/Measured over 2 shifts: 22 mi a block \(19–25\)/.test(two.txt)) throw new Error('the spread is not shown at two readings: ' + two.txt.slice(0, 300));
    if (two.warned) throw new Error('still cautioning once there is a spread to see');
    return 'cautioned at 1 reading, a range at 2';
  });

  await check('report — the basis label translates, the driver\'s words do not', async () => {
    // Label and note were one string, so the whole thing carried user text and
    // could never match a translation key: the label shipped in English in
    // every language. Split, the label translates and the note stays verbatim
    // — which it must, because HMRC reads it.
    await b.eval(seedEvidence([{ miles: 40, src: 'odometer' }]) + '');
    const NOTE = 'Measured postcode to postcode on Google Maps. These are estimates, not odometer readings.';
    await b.eval(`(await import('/js/store.js')).saveSettings({ mileageBasis: ${JSON.stringify(NOTE)}, lang: 'ar' }); return true;`);
    await b.goto('#/income');
    await b.goto('#/report');
    const out = await b.eval(`
      const v = document.getElementById('view');
      const note = v.querySelector('.report__verbatim');
      return { note: note && note.textContent, dir: note && note.getAttribute('dir'),
               labelInEnglish: /How the mileage was worked out/.test(v.textContent) };`);
    if (out.note !== NOTE) throw new Error('the note was not printed word for word: ' + JSON.stringify(out.note));
    if (out.dir !== 'auto') throw new Error('the note does not carry its own direction, so an English note on an Arabic report is mangled');
    if (out.labelInEnglish) throw new Error('the label is still English on an Arabic report');
    await b.eval(`(await import('/js/store.js')).saveSettings({ lang: 'en' }); return true;`);
    await b.goto('#/income');
    return 'label translated, note verbatim, direction its own';
  });

  await check('report — a negative amount keeps its minus on the left in Arabic', async () => {
    // The DOM is not the evidence here: it holds "−£1,000.00" either way. Left
    // to inherit the page's RTL direction the browser reorders the leading
    // minus past the digits, and the report shows "£1,000.00−" — on a document
    // being filed, a figure whose sign has moved. So measure where it is drawn.
    await b.eval(`
      const db = await import('/js/db.js'); const st = await import('/js/store.js');
      await db.wipeAll();
      st.saveSettings({ lang: 'ar', taxYear: '2026/27', expenseMethod: 'mileage', traderName: 'T' });
      await db.earnings.save({ id: 'n1', date: '2026-09-10', platform: 'amazonflex',
        amount: 1492.71, tips: 0, hours: 4, deliveries: 0, miles: 1536, notes: '' });
      return true;`);
    // The direction is set when the app boots, so Arabic needs a reload to
    // take hold — without it the page is still LTR and proves nothing.
    await b.open('/');
    await b.ready();
    await b.goto('#/report');
    const out = await b.eval(`
      const cells = [...document.querySelectorAll('#view td')].filter(td => /^[−-]/.test(td.textContent.trim()));
      if (!cells.length) return { error: 'no negative amount on the report to check' };
      const td = cells[0];
      const t = [...td.childNodes].find(n => n.nodeType === 3);
      const r = document.createRange();
      r.setStart(t, 0); r.setEnd(t, 1);
      const minus = r.getBoundingClientRect().left;
      r.setStart(t, t.nodeValue.length - 1); r.setEnd(t, t.nodeValue.length);
      const last = r.getBoundingClientRect().left;
      return { txt: td.textContent.trim(), rtlPage: document.documentElement.getAttribute('dir') === 'rtl',
               minusLeftOfDigits: minus < last };`);
    if (out.error) throw new Error(out.error);
    if (!out.rtlPage) throw new Error('the page is not RTL, so this proves nothing');
    if (!out.minusLeftOfDigits) throw new Error(`the minus is drawn to the right of the digits: ${out.txt} renders reversed`);
    await b.eval(`(await import('/js/store.js')).saveSettings({ lang: 'en' }); return true;`);
    await b.open('/');
    await b.ready();
    return 'the sign stays where it belongs on an RTL page';
  });

  // ---------------- a vehicle name is text, not markup ----------------
  await check('tax — a vehicle named with a tag is shown, not parsed', async () => {
    // The Tax screen writes this label as HTML because some labels carry
    // markup. A name is the driver's, and typed into Settings it never meets
    // the <> strip that only runs on an imported backup. Proven exploitable
    // before the fix: an <img onerror> element was built in the cell, and with
    // the page's CSP removed it executed. The DOM is the evidence here, not
    // the text: assert no element was created from the name.
    const PAYLOAD = '<img src="http://127.0.0.1:1/x.png" onerror="window.__xss=1">';
    await b.eval(`
      const db = await import('/js/db.js'); const st = await import('/js/store.js');
      await db.wipeAll();
      st.saveSettings({ lang: 'en', taxYear: '2026/27', expenseMethod: 'mileage', vehicleCostClaimed: 'no',
        vehicles: [{ id: 'default', label: 'Car', type: 'car' },
                   { id: 'v2', label: ${JSON.stringify(PAYLOAD)}, type: 'car' }] });
      await db.earnings.save({ id: 'x1', date: '2026-09-10', platform: 'amazonflex', amount: 9000,
        tips: 0, hours: 8, deliveries: 0, miles: 1200, vehicleId: 'default', notes: '' });
      await db.earnings.save({ id: 'x2', date: '2026-09-11', platform: 'amazonflex', amount: 9000,
        tips: 0, hours: 8, deliveries: 0, miles: 2000, vehicleId: 'v2', notes: '' });
      return true;`);
    await b.goto('#/tax');
    await b.eval('await new Promise(r => setTimeout(r, 400)); return true;');
    const out = await b.eval(`({
      injected: document.querySelectorAll('#view img[onerror], #view svg[onload]').length,
      executed: !!window.__xss,
      shownAsText: [...document.querySelectorAll('#view td')].some(t => t.textContent.includes('onerror=')) })`);
    if (out.injected) throw new Error('the name was parsed as markup — an element was built from it');
    if (out.executed) throw new Error('the name executed');
    if (!out.shownAsText) throw new Error('the name is not shown as text either — it vanished');
    return 'rendered as text, no element, nothing ran';
  });

  await check('settings — angle brackets are stripped from a vehicle name on the way in', async () => {
    await b.goto('#/settings');
    const stored = await b.eval(`
      const st = await import('/js/store.js');
      st.saveSettings({ vehicles: [] });
      const btn = [...document.querySelectorAll('#view button')].find(x => /Add a vehicle|Add vehicle/.test(x.textContent));
      btn.click();
      await new Promise(r => setTimeout(r, 250));
      const input = document.querySelector('.sheet input[type=text]');
      input.value = '<b>Corsa</b>';
      const form = input.closest('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 300));
      return (st.getSettings().vehicles || []).map(v => v.label);`);
    if (!stored.some(l => l === 'bCorsa/b')) throw new Error('brackets were not stripped at input: ' + JSON.stringify(stored));
    return 'stored as bCorsa/b — no markup kept';
  });

  // ---------------- the cash-basis vehicle question ----------------
  await check('review — asks the one question that decides the mileage claim', async () => {
    await b.eval(`
      const db = await import('/js/db.js'); const st = await import('/js/store.js');
      await db.wipeAll();
      st.saveSettings({ lang: 'en', taxYear: '2026/27', expenseMethod: 'mileage', vehicles: [],
        vehicleCostClaimed: '', stations: [] });
      await db.earnings.save({ id: 'c1', date: '2026-09-10', platform: 'amazonflex', amount: 9000,
        tips: 0, hours: 8, deliveries: 0, miles: 2000, notes: '' });
      return true;`);
    await b.goto('#/review');
    const unanswered = await b.eval(`document.getElementById('view').textContent`);
    if (!/One question still decides whether your mileage claim stands/.test(unanswered)) {
      throw new Error('the question is never asked');
    }
    await b.eval(`(await import('/js/store.js')).saveSettings({ vehicleCostClaimed: 'yes' }); return true;`);
    await b.goto('#/review');
    const yes = await b.eval(`document.getElementById('view').textContent`);
    if (!/Your mileage claim may not be allowed/.test(yes)) throw new Error('answering yes raises no warning');
    if (!/you claim one or the other/.test(yes)) throw new Error('does not say why');
    await b.eval(`(await import('/js/store.js')).saveSettings({ vehicleCostClaimed: 'no' }); return true;`);
    await b.goto('#/review');
    const no = await b.eval(`document.getElementById('view').textContent`);
    if (/may not be allowed|One question still decides/.test(no)) throw new Error('still flagged after answering no');
    if (!/No vehicle purchase was claimed against this mileage/.test(no)) throw new Error('no confirmation after answering no');
    return 'asked, then warns on yes and clears on no';
  });

  await check('review — the question is not asked on the actual-costs method', async () => {
    await b.eval(`(await import('/js/store.js')).saveSettings({ expenseMethod: 'actual', vehicleCostClaimed: '' }); return true;`);
    await b.goto('#/review');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (/One question still decides|mileage claim may not be allowed/.test(txt)) {
      throw new Error('asked about mileage while claiming actual costs');
    }
    await b.eval(`(await import('/js/store.js')).saveSettings({ expenseMethod: 'mileage', vehicleCostClaimed: 'no' }); return true;`);
    return 'irrelevant on actual costs, so silent';
  });

  // ---------------- the mileage-basis note ----------------
  // The note is the stated basis for the biggest deduction on the return, so
  // what the field accepts is a correctness question, not a cosmetic one: a
  // disclosure cut off mid-sentence is worse than none at all.
  await check('settings — the mileage note survives the Settings field intact', async () => {
    await b.goto('#/settings');
    const out = await b.eval(`
      const st = await import('/js/store.js');
      const note = "Distances from home to each collection station were measured postcode to postcode "
        + "on Google Maps and recorded once per station. Each block's mileage is the whole shift, home "
        + "to home; I travel nowhere other than work for its duration. These are reasonable estimates, "
        + "not odometer readings. The Amazon Flex payment statement does not name the station, so for "
        + "earlier blocks I identified it from the block's scheduled hours, and where I could not "
        + "identify it with confidence I assumed the nearest of my three stations. That under-states "
        + "rather than over-states the mileage claimed.";
      const ta = [...document.querySelectorAll('#view textarea')]
        .find(t => /measured each station on the map/.test(t.placeholder));
      if (!ta) return { error: 'the mileage note field is not on the Settings screen' };
      ta.value = note;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      const counter = ta.parentElement.parentElement.textContent.match(/\\d+\\s*\\/\\s*\\d+/);
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      const saved = st.getSettings().mileageBasis;
      return { len: note.length, savedLen: saved.length, intact: saved === note,
               maxLength: ta.maxLength, counter: counter && counter[0] };`);
    if (out.error) throw new Error(out.error);
    if (!out.intact) throw new Error(`the field cut the note to ${out.savedLen} of ${out.len} characters`);
    if (out.maxLength < out.len) throw new Error('maxLength would block typing it: ' + out.maxLength);
    if (!out.counter) throw new Error('no character count shown, so a cut would be silent');
    return `${out.len} characters saved whole, counter reads ${out.counter}`;
  });

  await check('settings — the note is bounded, and says so before it bites', async () => {
    await b.goto('#/settings');
    const out = await b.eval(`
      const st = await import('/js/store.js');
      const ta = [...document.querySelectorAll('#view textarea')]
        .find(t => /measured each station on the map/.test(t.placeholder));
      ta.value = 'y'.repeat(st.MILEAGE_BASIS_MAX + 500);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      // maxLength only governs typing, so a programmatic value gets past it.
      // The counter has to say so, and the save has to bound it either way.
      const el = [...ta.parentElement.parentElement.querySelectorAll('div')]
        .find(d => /^\\d+\\s*\\/\\s*\\d+$/.test(d.textContent.trim()));
      const over = { text: el && el.textContent.trim(), flagged: !!el && /warn/.test(el.style.color) };
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      return { saved: st.getSettings().mileageBasis.length, max: st.MILEAGE_BASIS_MAX, over };`);
    eq(out.saved, out.max, 'an over-long note is bounded');
    if (!out.over.text) throw new Error('no character count shown, so the cut would be silent');
    if (!out.over.text.endsWith('/ ' + out.max)) throw new Error('the counter does not name the limit: ' + out.over.text);
    if (!out.over.flagged) throw new Error('over the limit, but the counter is not flagged: ' + out.over.text);
    return `bounded at ${out.max}, counter reads ${out.over.text} and is flagged`;
  });

  // ---------------- an entirely estimated mileage claim ----------------
  // This is the one gap only the driver can close, so the review has to keep
  // saying so, and has to stop the moment a station gets its first reading.
  await check('review — a mileage claim with nothing measured behind it is flagged', async () => {
    await b.eval(seedShifts(4, 'sheff'));
    await b.goto('#/review');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (!/Your whole mileage claim is an estimate/.test(txt)) throw new Error('not flagged: every mile was typed in');
    if (!/not one was read off an odometer or tracked/.test(txt)) throw new Error('does not say why');
    if (!/not an error/.test(txt)) throw new Error('reads as a mistake rather than a weak record');
    const btn = await b.eval(`[...document.querySelectorAll('#view button')].some(x => /Start a tracked shift/.test(x.textContent))`);
    if (!btn) throw new Error('no way to act on it');
    return 'flagged, with the fix one tap away';
  });

  await check('review — one measured block clears that station and leaves the other', async () => {
    await b.eval(`
      const db = await import('/js/db.js');
      const all = await db.earnings.all();
      const hit = all.find(e => e.stationId === 'sheff');
      await db.earnings.save({ ...hit, miles: 19, milesSource: 'odometer' });
      return true;`);
    await b.goto('#/review');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (/Your whole mileage claim is an estimate/.test(txt)) throw new Error('still claims nothing is measured');
    if (!/1 of your 2 stations has no measured block behind it/.test(txt)) throw new Error('does not name what is left: ' + txt.slice(0, 400));
    if (!/Settings marks which stations have never been measured/.test(txt)) throw new Error('does not say where to look');
    return 'one down, one to go';
  });

  await check('review — a typed-in mileage is never accepted as a measurement', async () => {
    await b.eval(`
      const db = await import('/js/db.js');
      // 'manual' is what the entry form records: a figure worked out afterwards.
      await db.earnings.save({ id: 'donny-manual', date: '2026-09-20', platform: 'amazonflex',
        amount: 70, tips: 0, hours: 4, deliveries: 0, miles: 44, stationId: 'donny',
        milesSource: 'manual', notes: '' });
      return true;`);
    await b.goto('#/review');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (!/1 of your 2 stations has no measured block behind it/.test(txt)) throw new Error('a typed-in figure was counted as measured');
    return 'manual still counts as an estimate';
  });

  await check('review — confirms once every station has a reading behind it', async () => {
    await b.eval(`
      const db = await import('/js/db.js');
      const hit = (await db.earnings.all()).find(e => e.stationId === 'donny');
      await db.earnings.save({ ...hit, miles: 48, milesSource: 'odometer' });
      return true;`);
    await b.goto('#/review');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (/no measured block behind/.test(txt)) throw new Error('still flagged once both were measured');
    if (!/Every station has a measured block behind its mileage/.test(txt)) throw new Error('no confirmation once done');
    return 'silent, and says so';
  });

  await check('review — says nothing about measurement when not claiming mileage', async () => {
    await b.eval(`
      const st = await import('/js/store.js');
      st.saveSettings({ expenseMethod: 'actual' });
      return true;`);
    await b.goto('#/review');
    const txt = await b.eval(`document.getElementById('view').textContent`);
    if (/measured block behind|whole mileage claim is an estimate/.test(txt)) throw new Error('nagged about mileage on the actual-costs method');
    await b.eval(`(await import('/js/store.js')).saveSettings({ expenseMethod: 'mileage' }); return true;`);
    return 'irrelevant on actual costs, so silent';
  });

  await b.close();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} flow checks passed`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
