// ============================================================
// test-core.mjs — the four modules nothing else covered:
// live shifts, the PIN lock, reminders and printing.
//
// Each holds something worth protecting: shift miles feed the
// mileage claim, the lock holds the only credential in the app,
// reminders are what stop a missed 31 January, and printing is
// how the return actually gets filed.
//
//   node scripts/test-core.mjs
// ============================================================
import { launch } from './browser.mjs';

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
const near = (actual, expected, tol, what) => {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${what}: expected ~${expected} (±${tol}), got ${actual}`);
};

const run = async () => {
  const b = await launch();
  await b.open('/welcome/');
  await b.resetSW();
  await b.eval(`localStorage.setItem('kerb.settings.v1', JSON.stringify({
    onboarded: true, lang: 'en', taxYear: '2026/27', region: 'ruk', vehicle: 'car',
    expenseMethod: 'mileage', apiKey: '', seStartDate: '2026-04-10',
  })); return true;`);
  await b.open('/');
  await b.ready();

  // ================= live shift =================
  console.log('\n--- live shift ---');

  await check('shift — starting one persists it across a reload', async () => {
    await b.eval(`
      const sh = await import('/js/shift.js');
      sh.stopShift();
      sh.startShift({ platform: 'amazonflex', gps: false, milesMode: 'manual' });
      return true;`);
    await b.open('/');                       // a reload, as if the app were reopened
    await b.ready();
    const s = await b.eval(`
      const sh = await import('/js/shift.js');
      const s = sh.getActive();
      return s ? { active: sh.isActive(), platform: s.platform, miles: s.miles } : null;`);
    eq(s, { active: true, platform: 'amazonflex', miles: 0 }, 'resumed shift');
    return 'a shift survives closing the app';
  });

  await check('shift — the odometer wins over tracked miles', async () => {
    // Both can be present: GPS counts while you drive, and you read the
    // dashboard at each end. HMRC-wise the odometer is the better record,
    // so it must be the figure that gets claimed.
    const miles = await b.eval(`
      const sh = await import('/js/shift.js');
      sh.updateShift({ miles: 31.4, odoStart: 84000, odoEnd: 84052 });
      return sh.effectiveMiles();`);
    eq(miles, 52, 'claimed miles');
    return 'odometer 52 beats GPS 31.4';
  });

  await check('shift — tracked miles are used when there is no odometer', async () => {
    const miles = await b.eval(`
      const sh = await import('/js/shift.js');
      sh.updateShift({ miles: 31.4, odoStart: null, odoEnd: null });
      return sh.effectiveMiles();`);
    eq(miles, 31.4, 'claimed miles');
    return 'falls back to tracked miles';
  });

  await check('shift — an end reading below the start is refused, not claimed as negative', async () => {
    const miles = await b.eval(`
      const sh = await import('/js/shift.js');
      sh.updateShift({ miles: 12, odoStart: 84100, odoEnd: 84000 });
      return sh.effectiveMiles();`);
    if (miles < 0) throw new Error('negative mileage would be claimed: ' + miles);
    eq(miles, 12, 'falls back to tracked miles on a bad reading');
    return 'bad reading ignored, no negative claim';
  });

  await check('shift — stopping returns the shift and clears it', async () => {
    const out = await b.eval(`
      const sh = await import('/js/shift.js');
      const stopped = sh.stopShift();
      return { had: !!stopped, stillActive: sh.isActive(), inStorage: !!localStorage.getItem('kerb.shift.v1') };`);
    eq(out, { had: true, stillActive: false, inStorage: false }, 'after stopping');
    return 'cleared from storage';
  });

  await check('shift — distance between two points is right', async () => {
    // Trafalgar Square to Big Ben, about 0.7 miles.
    const d = await b.eval(`
      const sh = await import('/js/shift.js');
      return sh.haversineMiles(51.5080, -0.1281, 51.5007, -0.1246);`);
    near(d, 0.53, 0.15, 'london distance');
    const zero = await b.eval(`
      const sh = await import('/js/shift.js');
      return sh.haversineMiles(51.5, -0.12, 51.5, -0.12);`);
    eq(zero, 0, 'no movement');
    return `${d.toFixed(2)} mi, and 0 when standing still`;
  });

  await check('shift — elapsed time reads as hours and a clock', async () => {
    const out = await b.eval(`
      const sh = await import('/js/shift.js');
      const fake = { startedAt: Date.now() - (3 * 3600000 + 25 * 60000 + 9000) };
      return { clock: sh.fmtDuration(sh.elapsedMs(fake)), hours: sh.elapsedHours(fake) };`);
    eq(out.clock, '03:25:09', 'clock');
    near(out.hours, 3.419, 0.01, 'hours');
    return out.clock;
  });

  // ================= PIN lock =================
  console.log('\n--- PIN lock ---');

  await check('lock — a PIN is stored only as a salted hash', async () => {
    const out = await b.eval(`
      const lock = await import('/js/lock.js');
      await lock.setPin('4071');
      const raw = localStorage.getItem('kerb.settings.v1');
      const s = JSON.parse(raw);
      return { holdsPin: raw.includes('4071'), hashLen: (s.pinHash || '').length, saltLen: (s.pinSalt || '').length, configured: lock.lockConfigured(s) };`);
    if (out.holdsPin) throw new Error('the PIN itself is in storage');
    eq([out.hashLen, out.saltLen, out.configured], [64, 32, true], 'hash, salt, configured');
    return 'SHA-256 hash + 16-byte salt, no PIN';
  });

  await check('lock — the right PIN opens it and a wrong one does not', async () => {
    const out = await b.eval(`
      const lock = await import('/js/lock.js');
      return { right: await lock.verifyPin('4071'), wrong: await lock.verifyPin('4072'), empty: await lock.verifyPin(''), long: await lock.verifyPin('40710') };`);
    eq(out, { right: true, wrong: false, empty: false, long: false }, 'verification');
    return 'only the exact PIN';
  });

  await check('lock — the same PIN on two devices does not produce the same hash', async () => {
    // Without a per-device salt, one stolen hash would unlock every install
    // that happens to use the same four digits.
    const out = await b.eval(`
      const lock = await import('/js/lock.js');
      const st = await import('/js/store.js');
      await lock.setPin('1234');
      const a = { hash: st.getSettings().pinHash, salt: st.getSettings().pinSalt };
      await lock.setPin('1234');
      const c = { hash: st.getSettings().pinHash, salt: st.getSettings().pinSalt };
      return { sameSalt: a.salt === c.salt, sameHash: a.hash === c.hash };`);
    if (out.sameSalt) throw new Error('the salt is not random');
    if (out.sameHash) throw new Error('the same PIN produced the same hash — the salt is not being used');
    return 'salted per install';
  });

  await check('lock — a wrong PIN keeps the app behind the lock screen', async () => {
    await b.eval(`
      const lock = await import('/js/lock.js');
      await lock.setPin('4071');
      return true;`);
    await b.open('/');
    await new Promise(r => setTimeout(r, 1200));
    const out = await b.eval(`
      return { appHidden: document.getElementById('app').hidden,
               askedForPin: /PIN|locked/i.test(document.body.textContent) };`);
    if (!out.appHidden) throw new Error('the app was visible without the PIN');
    if (!out.askedForPin) throw new Error('no PIN prompt shown');
    return 'app held behind the lock';
  });

  await check('lock — turning the lock off clears the stored hash', async () => {
    const out = await b.eval(`
      const lock = await import('/js/lock.js');
      const st = await import('/js/store.js');
      lock.disableLock();
      const s = st.getSettings();
      return { enabled: s.lockEnabled, hash: s.pinHash, salt: s.pinSalt, configured: lock.lockConfigured(s), unlocked: lock.isUnlocked() };`);
    eq(out, { enabled: false, hash: '', salt: '', configured: false, unlocked: true }, 'after disabling');
    return 'nothing left behind';
  });

  await b.open('/');
  await b.ready();

  // ================= reminders =================
  console.log('\n--- reminders ---');

  await check('reminders — nothing is sent while they are switched off', async () => {
    const sent = await b.eval(`
      const n = await import('/js/notify.js');
      const st = await import('/js/store.js');
      st.saveSettings({ notifyEnabled: false });
      window.__notes = [];
      await n.runChecks();
      return window.__notes.length;`);
    eq(sent, 0, 'notifications sent');
    return 'silent when off';
  });

  await check('reminders — a deadline nudge is sent once, not on every run', async () => {
    // The whole design point: milestones fire once ever, so opening the app
    // ten times in a day does not produce ten identical warnings.
    const out = await b.eval(`
      const n = await import('/js/notify.js');
      const st = await import('/js/store.js');
      localStorage.removeItem('kerb.notifyLog');
      // 2025/26 puts the registration deadline just behind us, which is what
      // a reminder is for. On the current year nothing is due for months.
      st.saveSettings({ notifyEnabled: true, taxYear: '2025/26', seStartDate: '2025-06-01' });
      // Stand in for the real Notification API and record what would be shown.
      window.__notes = [];
      window.Notification = function (title, opts) { window.__notes.push({ title, body: opts && opts.body }); };
      window.Notification.permission = 'granted';
      window.Notification.requestPermission = async () => 'granted';
      if (navigator.serviceWorker) { try { const r = await navigator.serviceWorker.getRegistration(); if (r) r.showNotification = async (t, o) => { window.__notes.push({ title: t, body: o && o.body }); }; } catch {} }
      await n.runChecks();
      const first = window.__notes.length;
      await n.runChecks();
      await n.runChecks();
      return { first, afterThreeRuns: window.__notes.length };`);
    if (out.first < 1) throw new Error('no reminder was sent at all');
    eq(out.afterThreeRuns, out.first, 'repeat runs must add nothing');
    return `${out.first} sent, still ${out.afterThreeRuns} after three runs`;
  });

  await check('reminders — the log survives a reload so the nudge is not repeated tomorrow', async () => {
    const before = await b.eval(`Object.keys(JSON.parse(localStorage.getItem('kerb.notifyLog') || '{}')).length`);
    if (before < 1) throw new Error('nothing was recorded in the log');
    await b.open('/');
    await b.ready();
    const after = await b.eval(`Object.keys(JSON.parse(localStorage.getItem('kerb.notifyLog') || '{}')).length`);
    eq(after, before, 'log entries after a reload');
    return `${after} milestone(s) remembered`;
  });

  await check('reminders — support and permission are reported honestly', async () => {
    const out = await b.eval(`
      const n = await import('/js/notify.js');
      return { supported: n.notifySupported(), permission: n.notifyPermission(), can: n.canNotify() };`);
    if (typeof out.supported !== 'boolean') throw new Error('notifySupported must be a boolean');
    if (out.supported && out.permission === 'unsupported') throw new Error('contradicts itself');
    if (!out.supported && out.can) throw new Error('claims it can notify without support');
    return `supported=${out.supported}, permission=${out.permission}`;
  });

  // ================= printing =================
  console.log('\n--- printing (the PDF path) ---');

  await check('print — the sheet is isolated, then cleaned up', async () => {
    const out = await b.eval(`
      const pdf = await import('/js/pdf.js');
      const u = await import('/js/util.js');
      let printed = 0;
      window.print = () => { printed++; };
      const sheet = pdf.docSheet({ title: 'Self Assessment', subtitle: '2026/27' });
      sheet.append(pdf.docSection('Income'), pdf.dataTable(['Item', 'Amount'], [['Turnover', '£9,006.74']]), pdf.docFoot('Estimates only.'));
      const titleBefore = document.title;
      pdf.printSheet(sheet, { title: 'kerb-report' });
      const during = {
        containers: document.querySelectorAll('.print-doc').length,
        bodyFlag: document.body.classList.contains('is-printing'),
        title: document.title,
        inSheet: document.querySelector('.print-doc').textContent.includes('£9,006.74'),
      };
      await new Promise(r => setTimeout(r, 250));   // past the 80ms print delay
      window.dispatchEvent(new Event('afterprint'));
      await new Promise(r => setTimeout(r, 50));
      const after = {
        containers: document.querySelectorAll('.print-doc').length,
        bodyFlag: document.body.classList.contains('is-printing'),
        titleRestored: document.title === titleBefore,
      };
      return { during, after, printed };`);
    eq(out.during.containers, 1, 'one print container while printing');
    if (!out.during.bodyFlag) throw new Error('body was not put into printing mode');
    eq(out.during.title, 'kerb-report', 'document title drives the PDF file name');
    if (!out.during.inSheet) throw new Error('the figures did not reach the printed sheet');
    eq(out.printed, 1, 'print dialog opened once');
    eq(out.after, { containers: 0, bodyFlag: false, titleRestored: true }, 'after printing');
    return 'rendered, printed once, fully cleaned up';
  });

  await check('print — printing twice leaves only one sheet behind', async () => {
    const containers = await b.eval(`
      const pdf = await import('/js/pdf.js');
      window.print = () => {};
      pdf.printSheet(pdf.docSheet({ title: 'One' }), { title: 'one' });
      await new Promise(r => setTimeout(r, 150));
      pdf.printSheet(pdf.docSheet({ title: 'Two' }), { title: 'two' });
      await new Promise(r => setTimeout(r, 150));
      return document.querySelectorAll('.print-doc').length;`);
    eq(containers, 1, 'print containers after two runs');
    await b.eval(`window.dispatchEvent(new Event('afterprint')); return true;`);
    return 'a stale sheet is replaced, not stacked';
  });

  await check('print — a table renders every row and column', async () => {
    const out = await b.eval(`
      const pdf = await import('/js/pdf.js');
      const t = pdf.dataTable(['Date', 'Platform', 'Amount'], [
        ['12 Sep', 'Amazon Flex', '£62.50'],
        ['13 Sep', 'Uber Eats', '£41.20'],
      ]);
      document.body.append(t);
      const out = { headers: [...t.querySelectorAll('th')].map(x => x.textContent),
                    rows: [...t.querySelectorAll('tr')].filter(tr => tr.querySelector('td')).map(tr => [...tr.children].map(td => td.textContent)) };
      t.remove();
      return out;`);
    eq(out.headers, ['Date', 'Platform', 'Amount'], 'headers');
    eq(out.rows, [['12 Sep', 'Amazon Flex', '£62.50'], ['13 Sep', 'Uber Eats', '£41.20']], 'rows');
    return '2 rows x 3 columns';
  });

  // ================= double-counted payouts =================
  // A Flex earnings screen lists the blocks AND the week's payout together,
  // so one photo can carry both. The exact-match duplicate check cannot see
  // it: the payout has its own date and a different amount.
  console.log('\n--- weekly payout vs its blocks ---');

  const BLOCKS = `[
    { date:'2026-09-15', platform:'amazonflex', amount:75, tips:0, hours:4, miles:40 },
    { date:'2026-09-16', platform:'amazonflex', amount:75, tips:0, hours:4, miles:41 },
    { date:'2026-09-17', platform:'amazonflex', amount:75, tips:0, hours:4, miles:39 },
    { date:'2026-09-18', platform:'amazonflex', amount:75, tips:0, hours:4, miles:42 }]`;
  const PAYOUT = `{ date:'2026-09-18', platform:'amazonflex', amount:300, tips:0, hours:0, miles:0 }`;

  await check('payout — the old duplicate check cannot catch it (why this exists)', async () => {
    const caught = await b.eval(`
      const d = await import('/js/dedupe.js');
      const chk = d.makeDupChecker(${BLOCKS}, []);
      return chk.isDup('earning', ${PAYOUT});`);
    if (caught) throw new Error('the exact-match check caught it, so this feature would be redundant');
    return 'confirmed blind to it — different date, different amount';
  });

  await check('payout — flagged when both come from one scan', async () => {
    const out = await b.eval(`
      const d = await import('/js/dedupe.js');
      const r = d.findOverlaps([...${BLOCKS}, ${PAYOUT}], []);
      return { incoming: r.incoming.map(f => ({ t: f.total, covers: f.covers, summary: f.looksLikeSummary })), saved: r.saved.length };`);
    eq(out.incoming.length, 1, 'one roll-up flagged');
    eq(out.incoming[0], { t: 300, covers: 4, summary: true }, 'the payout, not a block');
    return '£300 flagged, the four £75 blocks left alone';
  });

  await check('payout — flagged when scanned after the blocks were saved', async () => {
    const out = await b.eval(`
      const d = await import('/js/dedupe.js');
      const r = d.findOverlaps([${PAYOUT}], ${BLOCKS});
      return { incoming: r.incoming.map(f => f.total), saved: r.saved.map(f => f.total) };`);
    eq(out, { incoming: [300], saved: [] }, 'direction: payout after blocks');
    return 'caught';
  });

  await check('payout — flagged when the blocks are scanned after the payout was saved', async () => {
    // The reverse order, which is just as easy to do and just as wrong.
    const out = await b.eval(`
      const d = await import('/js/dedupe.js');
      const r = d.findOverlaps(${BLOCKS}, [${PAYOUT}]);
      return { incoming: r.incoming.map(f => f.total), saved: r.saved.map(f => f.total) };`);
    eq(out, { incoming: [], saved: [300] }, 'direction: blocks after payout');
    return 'caught as an already-saved roll-up';
  });

  await check('payout — blocks on their own say nothing', async () => {
    const out = await b.eval(`
      const d = await import('/js/dedupe.js');
      const r = d.findOverlaps(${BLOCKS}, []);
      return r.incoming.length + r.saved.length;`);
    eq(out, 0, 'false positives on ordinary blocks');
    return 'silent on a normal week';
  });

  await check('payout — a different platform is not mistaken for one', async () => {
    const out = await b.eval(`
      const d = await import('/js/dedupe.js');
      const r = d.findOverlaps([{ ...${PAYOUT}, platform: 'ubereats' }], ${BLOCKS});
      return r.incoming.length + r.saved.length;`);
    eq(out, 0, 'cross-platform match');
    return 'platforms kept apart';
  });

  await check('payout — an overlap that was already there is not blamed on a new scan', async () => {
    const out = await b.eval(`
      const d = await import('/js/dedupe.js');
      const old = [
        { date:'2026-08-03', platform:'ubereats', amount:20 },
        { date:'2026-08-04', platform:'ubereats', amount:20 },
        { date:'2026-08-04', platform:'ubereats', amount:40 }];
      const r = d.findOverlaps(${BLOCKS}, old);
      return r.incoming.length + r.saved.length;`);
    eq(out, 0, 'pre-existing overlap attributed to this import');
    return 'only flags what this scan would cause';
  });

  await check('payout — a real day that happens to match is flagged more weakly', async () => {
    // £50, £50, then £100 is arithmetically identical to a payout. It cannot
    // be ruled out, so it is flagged — but without the no-hours signal, so
    // the wording can be softer rather than claiming certainty.
    const out = await b.eval(`
      const d = await import('/js/dedupe.js');
      const r = d.findOverlaps(
        [{ date:'2026-09-17', platform:'ubereats', amount:100, hours:5, miles:30 }],
        [{ date:'2026-09-15', platform:'ubereats', amount:50, hours:3, miles:12 },
         { date:'2026-09-16', platform:'ubereats', amount:50, hours:3, miles:14 }]);
      return r.incoming.map(f => f.looksLikeSummary);`);
    eq(out, [false], 'a worked day must not be marked as a summary');
    return 'flagged, but not called a payout';
  });

  await check('payout — the scanner is told not to return roll-up rows', async () => {
    const sent = await b.eval(`
      window.__sent = null;
      window.fetch = async (url, init) => {
        window.__sent = JSON.parse((init && init.body) || '{}');
        return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"entries":[]}' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      };
      const c = await import('/js/claude.js');
      const st = await import('/js/store.js');
      try { await c.extractEarnings({ kind: 'image', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
        { today: '2026-09-20', platforms: st.allPlatforms() }, { claudeModel: 'claude-haiku-5-5', apiKey: '' }); } catch (e) {}
      return window.__sent.messages[0].content[1].text;`);
    if (!/do NOT extract roll-up rows/i.test(sent)) throw new Error('the prompt does not warn against roll-ups');
    if (!/weekly or monthly payout/i.test(sent)) throw new Error('the prompt does not name the payout case');
    return 'instruction present in the request';
  });

  // ================= the Wednesday capture nudge =================
  console.log('\n--- capture nudge ---');

  const nudgeSetup = (opts) => `
    const n = await import('/js/notify.js');
    const st = await import('/js/store.js');
    const db = await import('/js/db.js');
    localStorage.removeItem('kerb.notifyLog');
    st.saveSettings({ notifyEnabled: true, taxYear: '2026/27', seStartDate: '2026-09-09', captureGapDays: 7 });
    await db.wipeAll();
    for (const e of ${opts.earnings}) await db.earnings.save({ id: 'x' + Math.random(), tips: 0, hours: 0, deliveries: 0, miles: 0, notes: '', ...e });
    window.__notes = [];
    window.Notification = function (t, o) { window.__notes.push({ title: t, body: o && o.body }); };
    window.Notification.permission = 'granted';
    if (navigator.serviceWorker) { try { const r = await navigator.serviceWorker.getRegistration(); if (r) r.showNotification = async (t, o) => { window.__notes.push({ title: t, body: o && o.body }); }; } catch {} }
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(${JSON.stringify(opts.now)}); }
      static now() { return new RealDate(${JSON.stringify(opts.now)}).getTime(); }
    };
    await n.runChecks();
    globalThis.Date = RealDate;
    return window.__notes.filter(x => /Capture your earnings/.test(x.title));`;

  await check('nudge — speaks on a Wednesday morning when nothing has been logged for a week', async () => {
    // 2026-09-23 is a Wednesday.
    const notes = await b.eval(nudgeSetup({ now: '2026-09-23T09:30:00', earnings: `[{ date: '2026-09-10', platform: 'amazonflex', amount: 60 }]` }));
    eq(notes.length, 1, 'notifications sent');
    if (!/13 days/.test(notes[0].body)) throw new Error('did not say how long it had been: ' + notes[0].body);
    return 'told the driver it had been 13 days';
  });

  await check('nudge — stays silent when the records are current', async () => {
    const notes = await b.eval(nudgeSetup({ now: '2026-09-23T09:30:00', earnings: `[{ date: '2026-09-22', platform: 'amazonflex', amount: 60 }]` }));
    eq(notes.length, 0, 'notifications sent');
    return 'nothing to say, so it said nothing';
  });

  await check('nudge — does not fire before Wednesday morning', async () => {
    const tue = await b.eval(nudgeSetup({ now: '2026-09-22T09:30:00', earnings: `[{ date: '2026-09-01', platform: 'amazonflex', amount: 60 }]` }));
    const early = await b.eval(nudgeSetup({ now: '2026-09-23T07:30:00', earnings: `[{ date: '2026-09-01', platform: 'amazonflex', amount: 60 }]` }));
    eq([tue.length, early.length], [0, 0], 'Tuesday and 7:30am Wednesday');
    return 'Wednesday from 9am only';
  });

  await check('nudge — fires once a week, not on every open', async () => {
    const out = await b.eval(`
      ${nudgeSetup({ now: '2026-09-23T09:30:00', earnings: `[{ date: '2026-09-01', platform: 'amazonflex', amount: 60 }]` }).replace('return window.__notes', 'const first = window.__notes')}
    `.replace('globalThis.Date = RealDate;', `
      await n.runChecks(); await n.runChecks();
      globalThis.Date = RealDate;`).replace(/const first = window\.__notes[\s\S]*$/, `
      return window.__notes.filter(x => /Capture your earnings/.test(x.title)).length;`));
    eq(out, 1, 'notifications after three runs in the same week');
    return 'one per week however often the app is opened';
  });

  await check('nudge — a brand new driver with nothing logged is still reminded', async () => {
    const notes = await b.eval(nudgeSetup({ now: '2026-09-23T09:30:00', earnings: `[]` }));
    eq(notes.length, 1, 'notifications sent');
    if (!/No earnings logged yet/.test(notes[0].body)) throw new Error('wrong wording for an empty account: ' + notes[0].body);
    return 'measured from the trading start date';
  });

  await check('nudge — arrives in Arabic when the app is in Arabic', async () => {
    // Notifications are built outside the document, so the DOM translator
    // never sees them. Without routing them through the dictionary they
    // would reach an Arabic user in English.
    await b.eval(`
      const raw = JSON.parse(localStorage.getItem('kerb.settings.v1'));
      raw.lang = 'ar';
      localStorage.setItem('kerb.settings.v1', JSON.stringify(raw));
      return true;`);
    await b.open('/');
    await b.ready();
    const notes = await b.eval(nudgeSetup({ now: '2026-09-23T09:30:00', earnings: `[{ date: '2026-09-10', platform: 'amazonflex', amount: 60 }]` })
      .replace('window.__notes.filter(x => /Capture your earnings/.test(x.title))', 'window.__notes'));
    if (!notes.length) throw new Error('no notification sent');
    const { title, body } = notes[0];
    if (/[A-Za-z]{4}/.test(title)) throw new Error('title still in English: ' + title);
    if (!/[؀-ۿ]/.test(body)) throw new Error('body not translated: ' + body);
    if (/\bdays\b/.test(body)) throw new Error('body partly English: ' + body);
    if (!/13/.test(body)) throw new Error('the day count was lost in translation: ' + body);
    await b.eval(`
      const raw = JSON.parse(localStorage.getItem('kerb.settings.v1'));
      raw.lang = 'en';
      localStorage.setItem('kerb.settings.v1', JSON.stringify(raw));
      return true;`);
    return 'title and body in Arabic, figures preserved';
  });

  await b.close();

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} core checks passed`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
