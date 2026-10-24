// ============================================================
// ui/review.js — "Check before you file": the review an accountant
// would do. It reads your records for the working tax year and
// flags what looks wrong, missing or worth a second look BEFORE
// the figures reach HMRC. Nothing here changes your data.
// ============================================================
import { el, fmtGBP, fmtNum, fmtMiles, fmtDate, todayISO, daysBetween, taxYearFromLabel } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, categoryById, platformById, allStations } from '../store.js';
import { computeTaxYear } from '../tax.js';
import { icon, downloadBackup } from './shared.js';
import { setPeriod as setIncomePeriod } from './income.js';
import { bus } from '../bus.js';
import { findPeriodTotals } from '../dedupe.js';

export async function render() {
  const s = getSettings();
  const [allE, allX] = await Promise.all([earnings.all(), expenses.all()]);
  const sum = computeTaxYear(allE, allX, s);
  const ty = taxYearFromLabel(s.taxYear);
  const E = allE.filter(e => e.date >= ty.start && e.date <= ty.end);
  const X = allX.filter(x => x.date >= ty.start && x.date <= ty.end);

  const root = el('div');
  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 4px', text: 'Check before you file' }));
  root.append(el('div', { class: 'tiny muted', style: 'margin:0 2px 14px', text: `A review of your ${s.taxYear} records — the things an accountant would look at.` }));

  const checks = buildChecks({ s, sum, ty, E, X, allE, allX });
  const problems = checks.filter(c => c.level === 'bad' || c.level === 'warn');
  const infos = checks.filter(c => c.level === 'info');
  const good = checks.filter(c => c.level === 'ok');

  // headline
  const clean = problems.length === 0;
  root.append(el('div', {
    class: 'callout callout--' + (clean ? 'brand' : problems.some(p => p.level === 'bad') ? 'warn' : 'warn'),
    html: `${icon(clean ? 'check' : 'warn')}<div>${clean
      ? `<b>Nothing looks wrong.</b> ${E.length} income ${E.length === 1 ? 'entry' : 'entries'} and ${X.length} ${X.length === 1 ? 'expense' : 'expenses'} recorded for ${s.taxYear}. Open your report when you're ready to file.`
      : `<b>${problems.length} thing${problems.length === 1 ? '' : 's'} to look at</b> before you file your ${s.taxYear} return.`}</div>`,
  }));

  if (problems.length) { root.append(sectionTitle('Worth fixing')); problems.forEach(c => root.append(checkCard(c))); }
  if (infos.length) { root.append(sectionTitle('Good to know')); infos.forEach(c => root.append(checkCard(c))); }
  if (good.length) { root.append(sectionTitle('Looks fine')); const ok = el('div', { class: 'card card--flush' }); good.forEach(c => ok.append(okRow(c))); root.append(ok); }

  const go = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:16px' });
  go.innerHTML = icon('note') + '<span>Open my Self Assessment report</span>';
  go.onclick = () => bus.navigate('report');
  root.append(go);
  root.append(el('div', { class: 'tiny faint center', style: 'margin-top:12px', text: 'This review looks for common mistakes. It cannot catch everything — you are responsible for the figures you file.' }));
  return root;
}

// ---------------- the checks ----------------
function buildChecks({ s, sum, ty, E, X, allE, allX }) {
  const out = [];
  const add = (level, title, detail, action) => out.push({ level, title, detail, action });

  // 1) entries dated outside the working tax year
  const outside = [...allE, ...allX].filter(r => r.date < ty.start || r.date > ty.end);
  if (outside.length) {
    add('bad', `${outside.length} entr${outside.length === 1 ? 'y is' : 'ies are'} dated outside ${s.taxYear}`,
      `They are excluded from this year's totals. The usual cause is the date picker landing on the wrong year. Check them and fix the date if needed.`,
      { label: 'Review all entries', run: () => { setIncomePeriod('all'); bus.navigate('income'); } });
  } else if (E.length) add('ok', 'All entries fall inside the tax year', '');

  // 2) nothing recorded at all
  if (!E.length) {
    add('bad', 'No income recorded for this tax year', 'There is nothing to file yet. Log your shifts, or import a statement.',
      { label: 'Add earnings', run: () => bus.navigate('income') });
    return out;
  }

  // 3) no expenses at all → likely missing claims
  if (!X.length) {
    add('warn', 'No expenses recorded', 'Almost every driver has costs — phone, insurance, repairs, parking, bags. Without them you may pay more tax than you need to.',
      { label: 'Add an expense', run: () => bus.navigate('expenses') });
  }

  // 4) mileage method with no miles
  if (s.expenseMethod === 'mileage' && sum.businessMiles <= 0) {
    add('bad', 'You claim mileage, but no business miles are logged',
      'Your biggest deduction is missing. Add the miles to each shift, or switch to the actual-costs method.',
      { label: 'Open Income', run: () => bus.navigate('income') });
  } else if (s.expenseMethod === 'mileage') {
    add('ok', `${fmtMiles(sum.businessMiles)} business miles claimed`, '');
  }

  // 5) likely duplicates
  const dupE = findDuplicates(E, e => `${e.date}|${e.platform}|${Math.round(((e.amount || 0) + (e.tips || 0)) * 100)}`);
  const dupX = findDuplicates(X, x => `${x.date}|${Math.round((x.amount || 0) * 100)}`);
  const dupN = dupE + dupX;
  if (dupN) {
    add('warn', `${dupN} possible duplicate ${dupN === 1 ? 'entry' : 'entries'}`,
      'Some entries share the same date and amount. If a payout was added twice, your figures will be overstated. Worth a quick look.',
      { label: 'Review entries', run: () => { setIncomePeriod('ty'); bus.navigate('income'); } });
  } else add('ok', 'No duplicate-looking entries', '');

  // 5a) shifts with no station, now that stations exist.
  const stationCount = (getSettings().stations || []).length;
  if (stationCount && s.expenseMethod === 'mileage') {
    const noStation = E.filter(e => !e.stationId).length;
    if (noStation) {
      add('info', `${noStation} shift${noStation === 1 ? '' : 's'} ${noStation === 1 ? 'has' : 'have'} no station set`,
        'Their miles still count in full. Setting the station records which pickup point each shift ran from, which is what shows the travel was between varying places rather than to one fixed base. Leave any you genuinely cannot work out — a guess here would change the mileage.',
        { label: 'Assign stations', run: () => bus.navigate('assignstations') });
    } else add('ok', 'Every shift has a station', '');
  }

  // 5b) the mileage claim rests entirely on figures that were typed in.
  //
  // Mileage is the largest number on most drivers' returns and the first one
  // HMRC asks the basis for. An estimate is allowed, but it is the weakest
  // kind of record — and the fix is cheap: one block driven with the odometer
  // read at both ends settles that station's distance for good, after which
  // Kerb offers the measured figure for every later block from the same
  // station. So this clears one station at a time, not all at once.
  //
  // Whether a station has ever been measured is asked of ALL earnings, not
  // just this year's: a distance established last year is still established.
  if (s.expenseMethod === 'mileage' && sum.businessMiles > 0) {
    const stations = allStations();
    const anyMeasured = allE.some(e => isMeasured(e) && numOf(e.miles) > 0);
    const unmeasured = stations.filter(st => !allE.some(e => isMeasured(e) && numOf(e.miles) > 0 && e.stationId === st.id));
    if (!anyMeasured) {
      // The station labels are the driver's own words, so they stay out of the
      // sentence: a translation key carrying user data never matches. Which
      // stations are unmeasured is already shown, per station, in Settings.
      add('warn', 'Your whole mileage claim is an estimate',
        `${fmtGBP(sum.mileageDed)} of this year's deduction rests on ${fmtMiles(sum.businessMiles)} miles that were all typed in — not one was read off an odometer or tracked. HMRC does accept a reasonable estimate, so this is not an error, but it is the thinnest record you can hold for your largest claim. ${stations.length
          ? 'Run one shift per station from the live tracker, reading the odometer at the start and at the end. Kerb then offers that measured figure for every later block from the same station, and this notice clears one station at a time.'
          : 'Run a shift from the live tracker, reading the odometer at the start and at the end, and Kerb works the miles out for you.'}`,
        { label: 'Start a tracked shift', run: () => bus.navigate('shift') });
    } else if (unmeasured.length) {
      add('info', `${unmeasured.length} of your ${stations.length} stations ${unmeasured.length === 1 ? 'has no measured block behind it' : 'have no measured block behind them'}`,
        'A distance with no reading behind it is an estimate, however carefully it was worked out. Settings marks which stations have never been measured — one tracked shift from each is all it takes.',
        { label: 'Start a tracked shift', run: () => bus.navigate('shift') });
    } else if (stations.length) {
      add('ok', 'Every station has a measured block behind its mileage', '');
    }
  }

  // 5d) simplified mileage on a vehicle whose purchase price was expensed.
  //
  // Kerb reports on the cash basis, and HMRC's own SA103F notes say flat-rate
  // mileage cannot be used for a vehicle whose cost was deducted as an expense
  // under it. Nothing in the records settles this — a car bought years ago may
  // have been claimed on a return Kerb never saw — so the question is asked in
  // Settings and only the driver's own answer is acted on. Silence here would
  // leave the largest deduction on the return resting on a condition nobody
  // checked.
  //
  // While the trading allowance beats the mileage, no mileage is being
  // claimed, so nothing is at risk yet — but it will be the moment the miles
  // overtake the allowance, which is a handful of shifts away for anyone
  // still driving. Saying "your claim may not be allowed" beside "the
  // allowance is being used" would be two screens contradicting each other,
  // so the same question is put as the future one it actually is.
  if (s.expenseMethod === 'mileage' && sum.businessMiles > 0) {
    const inUse = !sum.usedTradingAllowance;
    if (s.vehicleCostClaimed === 'yes') {
      add(inUse ? 'bad' : 'warn',
        inUse ? 'Your mileage claim may not be allowed' : 'Your mileage will not be claimable when it overtakes the allowance',
        'You have said you deducted a vehicle’s purchase price as an expense. Under the cash basis HMRC does not allow simplified mileage for that same vehicle — you claim one or the other. '
        + (inUse
          ? 'This is the biggest figure on your return, so settle it with an accountant before you file, or switch to the actual-costs method.'
          : 'The £1,000 trading allowance is still ahead of your mileage, so nothing is at risk this moment — but once your miles pass it, this becomes the largest figure on your return. Settle it with an accountant before then.'),
        { label: 'Open Settings', run: () => bus.navigate('settings') });
    } else if (!s.vehicleCostClaimed) {
      add(inUse ? 'warn' : 'info',
        inUse ? 'One question still decides whether your mileage claim stands' : 'One question will decide your mileage claim once it overtakes the allowance',
        'On the cash basis you cannot claim simplified mileage for a vehicle whose purchase price you already deducted as an expense. Kerb cannot tell from your records which it was. Answer it once in Settings and this goes.',
        { label: 'Answer it', run: () => bus.navigate('settings') });
    } else add('ok', 'No vehicle purchase was claimed against this mileage', '');
  }

  // 5c) a weekly payout recorded alongside the blocks it pays for.
  // The check above cannot see this one: the payout has its own date and a
  // different amount, so nothing matches. It only shows up as one entry that
  // equals the sum of several others.
  const rollups = findPeriodTotals(E, []).filter(f => f.looksLikeSummary);
  if (rollups.length) {
    const f = rollups[0];
    add('bad', `${rollups.length === 1 ? 'An entry adds' : rollups.length + ' entries add'} up to other entries you already have`,
      `${fmtGBP(f.total)} on ${fmtDate(f.to)} is exactly the total of ${f.covers} entries from ${fmtDate(f.from)} to ${fmtDate(f.to)}, and has no hours or miles of its own. That is the shape of a weekly payout recorded next to the blocks it pays for — which would declare the same money twice and tax you on income you never earned. Check it, and delete whichever one is the summary.`,
      { label: 'Review entries', run: () => { setIncomePeriod('ty'); bus.navigate('income'); } });
  }

  // 6) missing details needed on the report
  const missing = [];
  if (!s.traderName || !String(s.traderName).trim()) missing.push('your name');
  if (!s.utr || !String(s.utr).trim()) missing.push('your UTR');
  if (missing.length) {
    add('warn', `Your report is missing ${missing.join(' and ')}`,
      'These appear on the Self Assessment report. Add them so the document is complete.',
      { label: 'Open Settings', run: () => bus.navigate('settings') });
  }
  if (!s.seStartDate) {
    add('warn', 'No self-employment start date set',
      'Kerb uses it to work out your HMRC registration deadline and to date your first return correctly.',
      { label: 'Set it now', run: () => bus.navigate('settings') });
  }

  // 7) backup
  const days = s.lastBackupAt ? daysBetween(s.lastBackupAt.slice(0, 10), todayISO()) : Infinity;
  if (days >= 30) {
    add('warn', s.lastBackupAt ? 'Your last backup is over a month old' : 'You have never exported a backup',
      'Your records live only on this device, and HMRC expects you to keep them for 5 years after filing.',
      { label: 'Export a backup', run: () => downloadBackup().then(() => bus.refresh()) });
  } else add('ok', 'Records backed up recently', '');

  // 8) zero business-use expenses
  const zeroBiz = X.filter(x => (x.bizPct != null ? x.bizPct : categoryById(x.category).defaultBizPct) === 0);
  if (zeroBiz.length) {
    add('info', `${zeroBiz.length} expense${zeroBiz.length === 1 ? ' is' : 's are'} set to 0% business use`,
      'They are recorded but claim nothing. If any is genuinely a business cost, raise its business-use percentage.',
      { label: 'Open Expenses', run: () => bus.navigate('expenses') });
  }

  // 9) vehicle costs logged while on the mileage method
  if (s.expenseMethod === 'mileage') {
    const veh = X.filter(x => categoryById(x.category).vehicle);
    const vehTotal = veh.reduce((t, x) => t + (x.amount || 0), 0);
    if (veh.length) {
      add('info', `${fmtGBP(vehTotal)} of vehicle running costs are not separately claimed`,
        'That is correct while you use simplified mileage — the per-mile rate already covers fuel, insurance and repairs. They are kept for your cash records. Kerb checks the other method for you in Insights.');
    }
  }

  // 10) outliers worth double-checking
  const amounts = E.map(e => numOf(e.amount) + numOf(e.tips)).filter(n => n > 0);
  const med = typicalValue(amounts);
  const big = E.filter(e => med > 0 && ((e.amount || 0) + (e.tips || 0)) > med * 6);
  if (big.length) {
    const b = big[0];
    add('info', `${big.length} unusually large income ${big.length === 1 ? 'entry' : 'entries'}`,
      `For example ${fmtGBP(numOf(b.amount) + numOf(b.tips))} on ${fmtDate(b.date, { withYear: true })} (${platformById(b.platform).name}), against a typical ${fmtGBP(med)}. Might be a weekly total entered as one day — fine if so, worth checking if not.`,
      { label: 'Review entries', run: () => { setIncomePeriod('ty'); bus.navigate('income'); } });
  }

  // 11) trading allowance in play
  if (sum.usedTradingAllowance) {
    add('info', 'The £1,000 trading allowance is being used',
      'It beats your recorded expenses this year, so Kerb claims it instead. You cannot claim both — if you have costs you have not logged yet, add them and this may flip.');
  }

  // 12) losses
  if (sum.lossCarriedForward > 0) {
    add('info', `${fmtGBP(sum.lossCarriedForward)} of losses carried forward`,
      'Declare this in the losses section of your return so HMRC carries it into future years. If you miss it, you lose the relief.');
  }

  // 13) VAT threshold
  if (sum.grossIncome > sum.vat.threshold * 0.85) {
    const over = sum.grossIncome > sum.vat.threshold;
    add(over ? 'bad' : 'warn', over ? 'Your turnover is over the VAT threshold' : 'Your turnover is close to the VAT threshold',
      `Turnover is ${fmtGBP(sum.grossIncome)} against a ${fmtGBP(sum.vat.threshold)} threshold. ${over ? 'You are likely required to register for VAT — check this urgently.' : 'Keep an eye on it; registration becomes compulsory once you pass it.'}`);
  }

  // 14) filing window
  const d = sum.deadlines;
  const toDeadline = daysBetween(todayISO(), d.onlineFileAndPay);
  if (todayISO() <= ty.end) {
    add('info', 'This tax year has not ended yet', `It runs to ${fmtDate(ty.end, { withYear: true })}. You can file from 6 April, and the deadline is ${fmtDate(d.onlineFileAndPay, { withYear: true })}.`);
  } else if (toDeadline < 0) {
    add('bad', 'The filing deadline has passed', `It was ${fmtDate(d.onlineFileAndPay, { withYear: true })}. File as soon as you can — penalties and interest build up.`);
  } else {
    add(toDeadline <= 30 ? 'warn' : 'info', `${toDeadline} day${toDeadline === 1 ? '' : 's'} until the filing deadline`, `File and pay by ${fmtDate(d.onlineFileAndPay, { withYear: true })}.`);
  }

  return out;
}

// ---------------- helpers ----------------
function findDuplicates(list, keyOf) {
  const seen = new Map();
  let n = 0;
  for (const r of list) {
    const k = keyOf(r);
    const c = (seen.get(k) || 0) + 1;
    seen.set(k, c);
    if (c > 1) n++;
  }
  return n;
}
// A "typical" entry, ignoring the top decile. A plain median is dragged up by
// the very outliers we are hunting for — one absurd row can hide itself — so
// the comparison baseline is taken from the lower 90% only.
function typicalValue(arr) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const lower = a.slice(0, Math.max(1, Math.floor(a.length * 0.9)));
  const m = Math.floor(lower.length / 2);
  return lower.length % 2 ? lower[m] : (lower[m - 1] + lower[m]) / 2;
}
// Miles we can stand behind: read off the dashboard, or tracked while driving.
// Anything typed in afterwards is an estimate, however carefully worked out.
function isMeasured(e) { return !!e && (e.milesSource === 'odometer' || e.milesSource === 'gps'); }
function numOf(v) { const x = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(x) ? x : 0; }
function sectionTitle(t) { return el('div', { class: 'section-title', text: t }); }
const TONE = { bad: 'neg', warn: 'warn', info: 'info', ok: 'pos' };
function checkCard(c) {
  const tone = TONE[c.level];
  const card = el('div', { class: 'card' }, [
    el('div', { class: 'row', style: 'gap:10px;align-items:flex-start' }, [
      el('div', { class: 'item__icon', style: `background:var(--${tone}-tint);color:var(--${tone});flex:none`, html: icon(c.level === 'bad' || c.level === 'warn' ? 'warn' : 'info') }),
      el('div', { style: 'min-width:0' }, [
        el('div', { style: 'font-weight:750', text: c.title }),
        c.detail ? el('div', { class: 'tiny muted', style: 'margin-top:4px;line-height:1.55', text: c.detail }) : null,
      ]),
    ]),
  ]);
  if (c.action) {
    const b = el('button', { class: 'btn btn--sub btn--block btn--sm', type: 'button', style: 'margin-top:10px', text: c.action.label });
    b.onclick = c.action.run;
    card.append(b);
  }
  return card;
}
function okRow(c) {
  return el('div', { class: 'item' }, [
    el('div', { class: 'item__icon', style: 'background:var(--pos-tint);color:var(--pos)', html: icon('check') }),
    el('div', { class: 'item__main' }, [el('div', { class: 'item__title', text: c.title })]),
  ]);
}
