// ============================================================
// test-i18n.mjs — runtime check that the Arabic layer actually
// reaches the rendered UI. Static dictionary coverage is not
// proof: translate() only walks text nodes it is given, so a
// screen can be fully "in the dictionary" and still render in
// English. This drives a real browser and reads the DOM.
//
//   node scripts/test-i18n.mjs            # report
//   node scripts/test-i18n.mjs --strict   # non-zero exit on leaks
// ============================================================
import { readFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const ROUTES = ['home', 'income', 'expenses', 'tax', 'pots', 'insights', 'goals',
  'report', 'review', 'guide', 'terms', 'settings', 'payslips', 'import',
  'bankimport', 'scanearn', 'assistant', 'shift', 'assignstations'];

// Latin text that is legitimately untranslated: brands, currency/format codes,
// tax-regime terms HMRC itself uses in English, and anything numeric.
const ALLOW = [
  /^[\s\d.,:;%£$+\-–—·()/\[\]×−]*$/,                 // pure numbers & punctuation
  /^(Kerb|English|Claude|Anthropic|HMRC|PAYE|VAT|NIC|UTR|GPS|PDF|CSV|JSON|API|MTD|SA|SA103S|SA102|P45|P60|ISO|UK|US|PIN)$/i,
  /^(Amazon Flex|Uber Eats|Deliveroo|Just Eat|Stuart|Evri|Yodel|Shell|BP|Esso|Tesco|EE|NCP|Regatta|Amazon|Visa)$/i,
  /^(Class [24]|Plan [1245]|Haiku|Sonnet|Opus)/,
  /^(sk-ant|YYYY|DD|MM|AB12)/,
  /^[a-z0-9.-]+\.(com|co\.uk|org|net|gov\.uk)$/,            // domain names stay as-is
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/,
  // Platform brands keep their names, with or without a trailing total.
  /^(Amazon Flex|Uber Eats|Deliveroo|Just Eat|Stuart|Evri|Yodel)(\s*·.*)?$/,
  // Text the user typed themselves (a bill name, a vendor) is never translated.
  /^(Phone contract|Car insurance \(courier\))$/,
  /^Amazon Logistics \(/,                                     // a station the user named
];

const run = async () => {
  const b = await launch();

  // Seed records, then switch the app to Arabic before it boots.
  await b.open('/welcome/');    // a page that does not hold the DB open
  await b.resetSW();
  const seed = readFileSync(new URL('./seed-data.js', import.meta.url), 'utf8');
  const seeded = await b.eval(seed);
  await b.eval(`
    const s = JSON.parse(localStorage.getItem('kerb.settings.v1') || '{}');
    s.lang = 'ar'; s.onboarded = true;
    // Some screens only show their real content once configured; without
    // this the sweep walks an empty-state page and reports it clean.
    s.stations = [{ id: 'sheff', label: 'Amazon Logistics (S4 8AL)', baseMiles: 2.3, typicalMiles: 19 }];
    localStorage.setItem('kerb.settings.v1', JSON.stringify(s)); 1`);

  await b.open('/');
  await b.ready();

  const dir = await b.eval('document.documentElement.getAttribute("dir")');
  const results = [];
  let totalLeaks = 0, totalErrors = 0;

  for (const route of ROUTES) {
    b.clearErrors();
    let leaks = [];
    try {
      await b.goto('#/' + route);
      leaks = await b.eval(`
        const out = [];
        const w = document.createTreeWalker(document.getElementById('view'), NodeFilter.SHOW_TEXT, null);
        while (w.nextNode()) {
          const t = w.currentNode.nodeValue.trim();
          if (!t) continue;
          if (/[\\u0600-\\u06FF]/.test(t)) continue;         // has Arabic: translated
          if (!/[A-Za-z]{2}/.test(t)) continue;              // no real word
          const st = w.currentNode.parentElement && getComputedStyle(w.currentNode.parentElement);
          if (st && (st.display === 'none' || st.visibility === 'hidden')) continue;
          out.push(t);
        }
        return [...new Set(out)];
      `);
    } catch (e) {
      results.push({ route, status: 'RENDER FAIL', detail: e.message });
      totalErrors++;
      continue;
    }
    const real = leaks.filter((t) => !ALLOW.some((re) => re.test(t)));
    const errs = b.errors();
    totalLeaks += real.length;
    totalErrors += errs.length;
    results.push({ route, status: real.length || errs.length ? 'LEAK' : 'ok', leaks: real, errs });
  }

  // --- the review screen's branching states ---
  // A single pass over the routes only ever renders one branch of a check.
  // The mileage-evidence check has three, and the one the default seed shows
  // is the "nothing measured" warning — so the other two would ship in
  // English without anyone noticing. Re-render review under each state.
  const sweepView = `
    const out = [];
    const w = document.createTreeWalker(document.getElementById('view'), NodeFilter.SHOW_TEXT, null);
    while (w.nextNode()) {
      const t = w.currentNode.nodeValue.trim();
      if (!t || /[\\u0600-\\u06FF]/.test(t) || !/[A-Za-z]{2}/.test(t)) continue;
      const st = w.currentNode.parentElement && getComputedStyle(w.currentNode.parentElement);
      if (st && (st.display === 'none' || st.visibility === 'hidden')) continue;
      out.push(t);
    }
    return [...new Set(out)];`;
  const TWO = `[{ id: 'sheff', label: 'Amazon Logistics (S4 8AL)', baseMiles: 2.3, typicalMiles: 19 },
               { id: 'donny', label: 'Amazon Logistics (DN11 0BF)', baseMiles: 21.5, typicalMiles: 0 }]`;
  const VARIANTS = [
    ['review · no stations set up', `
      const st = await import('/js/store.js');
      st.saveSettings({ stations: [] }); return true;`],
    ['review · one of two measured', `
      const db = await import('/js/db.js'); const st = await import('/js/store.js');
      st.saveSettings({ stations: ${TWO} });
      const all = await db.earnings.all();
      await db.earnings.save({ ...all[0], stationId: 'sheff', miles: 19, milesSource: 'odometer' });
      await db.earnings.save({ ...all[1], stationId: 'donny' });
      return true;`],
    ['review · every station measured', `
      const db = await import('/js/db.js');
      const all = await db.earnings.all();
      await db.earnings.save({ ...all[1], stationId: 'donny', miles: 48, milesSource: 'odometer' });
      return true;`],
  ];
  for (const [name, setup] of VARIANTS) {
    b.clearErrors();
    await b.eval(setup);
    await b.goto('#/income');          // force a real re-render of review
    await b.goto('#/review');
    const leaks = (await b.eval(sweepView)).filter((t) => !ALLOW.some((re) => re.test(t)));
    const errs = b.errors();
    totalLeaks += leaks.length;
    totalErrors += errs.length;
    results.push({ route: name, status: leaks.length || errs.length ? 'LEAK' : 'ok', leaks, errs });
  }
  // Put the seed back the way the rest of the run expects it.
  await b.eval(`(await import('/js/store.js')).saveSettings({ stations: ${TWO} }); return true;`);

  // --- English must be untouched by all of this ---
  // The Arabic layer rewrites text nodes and innerHTML, so a bug there could
  // leak Arabic (or a literal {0}) into the English UI. Check both.
  await b.eval(`
    const s = JSON.parse(localStorage.getItem('kerb.settings.v1') || '{}');
    s.lang = 'en';
    localStorage.setItem('kerb.settings.v1', JSON.stringify(s)); 1`);
  await b.open('/');
  await b.ready();
  const enBleed = [];
  for (const route of ROUTES) {
    await b.goto('#/' + route);
    const found = await b.eval(`
      const out = [];
      const w = document.createTreeWalker(document.getElementById('view'), NodeFilter.SHOW_TEXT, null);
      while (w.nextNode()) {
        const t = w.currentNode.nodeValue;
        // The language picker names each language in its own script, so Arabic
        // inside it is correct even while the UI is English.
        const inPicker = w.currentNode.parentElement
          && w.currentNode.parentElement.closest('select, .lang-picker, [data-lang-picker]');
        if (/[\\u0600-\\u06FF]/.test(t) && !inPicker) out.push('arabic: ' + t.trim());
        if (/\\{\\d\\}/.test(t)) out.push('unfilled slot: ' + t.trim());
      }
      return [...new Set(out)];
    `);
    found.forEach((f) => enBleed.push(route + ' — ' + f));
  }
  // An unfilled slot would also show up in Arabic; check that too.
  await b.eval(`
    const s = JSON.parse(localStorage.getItem('kerb.settings.v1') || '{}');
    s.lang = 'ar';
    localStorage.setItem('kerb.settings.v1', JSON.stringify(s)); 1`);
  await b.open('/');
  await b.ready();
  const arSlots = [];
  for (const route of ROUTES) {
    await b.goto('#/' + route);
    const found = await b.eval(`
      const out = [];
      const w = document.createTreeWalker(document.getElementById('view'), NodeFilter.SHOW_TEXT, null);
      while (w.nextNode()) if (/\\{\\d\\}/.test(w.currentNode.nodeValue)) out.push(w.currentNode.nodeValue.trim());
      return [...new Set(out)];
    `);
    found.forEach((f) => arSlots.push(route + ' — ' + f));
  }

  await b.close();

  console.log(`dir="${dir}"   ${seeded}\n`);
  for (const r of results) {
    const tag = r.status === 'ok' ? '✓' : '✗';
    console.log(`${tag} ${r.route.padEnd(11)} ${r.status}${r.detail ? '  ' + r.detail : ''}`);
    (r.leaks || []).forEach((t) => console.log('      EN: ' + JSON.stringify(t.slice(0, 90))));
    (r.errs || []).forEach((t) => console.log('      ERR: ' + String(t).slice(0, 140)));
  }
  console.log(`\n${results.filter((r) => r.status === 'ok').length}/${results.length} screens clean`
    + `   ${totalLeaks} untranslated strings   ${totalErrors} errors`);
  console.log(`english unaffected: ${enBleed.length === 0 ? 'yes' : 'NO'}`
    + `   unfilled slots in arabic: ${arSlots.length}`);
  enBleed.slice(0, 10).forEach((t) => console.log('  EN BLEED: ' + t.slice(0, 120)));
  arSlots.slice(0, 10).forEach((t) => console.log('  AR SLOT:  ' + t.slice(0, 120)));
  if (enBleed.length || arSlots.length) process.exit(1);

  if (dir !== 'rtl') { console.log('\nFAIL: document is not RTL'); process.exit(1); }
  if (process.argv.includes('--strict') && (totalLeaks || totalErrors)) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
