// ============================================================
// ui/report.js — a printable Self Assessment report for a tax
// year, built so you can file your own return without an
// accountant. It maps every figure to the exact SA103S box you
// type it into on HMRC, and (optionally) includes a full records
// pack — every income and expense line — for HMRC's 5-year
// record-keeping rule. Save as PDF from the Print dialog.
// ============================================================
import { el, fmtGBP, fmtNum, fmtPct, fmtDate, todayISO } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, availableYears, VEHICLE_LABELS, REGION_LABELS, EXPENSE_CATEGORIES } from '../store.js';
import { computeTaxYear } from '../tax.js';
import { icon, toast } from './shared.js';
import { printSheet } from '../pdf.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const [allE, allX] = await Promise.all([earnings.all(), expenses.all()]);
  const sum = computeTaxYear(allE, allX, s);
  const root = el('div');

  // toolbar (hidden when printing)
  const toolbar = el('div', { class: 'row row--between no-print', style: 'margin:4px 2px 14px' }, [
    el('h2', { style: 'font-size:22px', text: 'SA report' }),
    yearSelect(s),
  ]);
  root.append(toolbar);

  root.append(el('div', { class: 'callout callout--info no-print', html: `${icon('info')}<div>This is built so you can file your own Self Assessment. Each figure shows the <b>SA103S</b> box to type it into on HMRC. Save as a PDF from the <b>Print</b> dialog (choose “Save as PDF”). Always confirm figures on HMRC.</div>` }));

  // action buttons (hidden when printing)
  const btns = el('div', { class: 'btn-grid no-print', style: 'margin-bottom:14px' });
  const pdfBtn = el('button', { class: 'btn btn--primary', type: 'button' });
  pdfBtn.innerHTML = icon('download') + '<span>Save report (PDF)</span>';
  pdfBtn.onclick = () => printSheet(buildReportSheet(sum, s), { title: `Kerb SA report ${sum.taxYear.replace('/', '-')}` });
  const packBtn = el('button', { class: 'btn btn--sub', type: 'button' });
  packBtn.innerHTML = icon('note') + '<span>Save full records (PDF)</span>';
  packBtn.onclick = () => {
    if (!allE.length && !allX.length) { toast('No records to export yet', 'warn'); return; }
    printSheet(buildReportSheet(sum, s, { records: true, allE, allX }), { title: `Kerb records ${sum.taxYear.replace('/', '-')}` });
  };
  btns.append(pdfBtn, packBtn);
  root.append(btns);

  // the printable sheet (on-screen preview = the summary)
  root.append(buildReportSheet(sum, s));
  return root;
}

// ---------------------------------------------------------------
// Build the full printable report sheet. With { records, allE, allX }
// it also appends a complete income & expense record pack.
// ---------------------------------------------------------------
export function buildReportSheet(sum, s, { records = false, allE = [], allX = [] } = {}) {
  const sheet = el('div', { class: 'report card' });

  // header
  sheet.append(el('div', { class: 'report__head' }, [
    el('div', {}, [
      el('div', { class: 'report__title', text: 'Self Assessment Report' }),
      el('div', { class: 'report__sub', text: `Tax year ${sum.taxYear} (6 Apr ${sum.ty.startYear} – 5 Apr ${sum.ty.startYear + 1})` }),
    ]),
    el('div', { class: 'report__brand' }, [el('img', { src: 'icons/icon.svg', width: 34, height: 34, alt: '' }), el('span', { text: 'Kerb' })]),
  ]));

  // who / basis
  sheet.append(grid2([
    ['Name', s.traderName || '—'],
    ['UTR', s.utr || '—'],
    ['Business', 'Self-employed delivery driver'],
    ['Region', REGION_LABELS[s.region]],
    ['Accounting basis', 'Cash basis'],
    ['Vehicle', VEHICLE_LABELS[s.vehicle]],
    ['Expense method', s.expenseMethod === 'mileage' ? 'Simplified (mileage)' : 'Actual costs'],
    ['Prepared', fmtDate(todayISO(), { withYear: true })],
  ]));

  // ---- What to enter on your return (the key numbers, with boxes) ----
  sheet.append(section('What to enter on your SA103S'));
  const tEnter = table();
  addRow(tEnter, 'Your turnover — total takings', fmtGBP(sum.grossIncome), 'Box 9', true);
  if (sum.usedTradingAllowance) {
    addRow(tEnter, 'Trading income allowance (instead of expenses)', fmtGBP(sum.effectiveDeduction), 'Box 10.1');
  } else {
    addRow(tEnter, 'Total allowable business expenses', fmtGBP(sum.rawDeductions), 'Box 20');
  }
  addRow(tEnter, 'Net profit', fmtGBP(sum.netProfit), 'Box 21', true);
  addRow(tEnter, 'Taxable profit', fmtGBP(sum.netProfit), 'Box 31');
  addRow(tEnter, sum.class2.credited ? 'Class 2 NIC — profits above Small Profits Threshold' : 'Class 2 NIC', sum.class2.credited ? 'Treated as paid' : 'Voluntary', 'Box 36');
  sheet.append(tEnter);
  sheet.append(el('div', { class: 'report__note', text: sum.usedTradingAllowance
    ? 'Your takings are low enough that the £1,000 trading allowance beats your actual expenses, so claim the allowance in box 10.1 (you then do not deduct expenses).'
    : 'Turnover is your total takings before any costs. Put the single total of your allowable expenses in box 20 (the short form does not need them itemised while turnover is under £90,000).' }));

  // ---- Income & expenses detail ----
  sheet.append(section('How the profit is worked out'));
  const t1 = table();
  addRow(t1, 'Turnover (all delivery income incl. tips)', fmtGBP(sum.grossIncome), 'Box 9');
  if (sum.usedTradingAllowance) {
    addRow(t1, 'Trading income allowance', '−' + fmtGBP(sum.effectiveDeduction), 'Box 10.1');
  } else {
    if (sum.mileageDed) addRow(t1, `Business mileage (${fmtNum(sum.businessMiles)} miles)`, '−' + fmtGBP(sum.mileageDed), 'in Box 20');
    if (sum.otherDeductible) addRow(t1, 'Other allowable expenses', '−' + fmtGBP(sum.otherDeductible), 'in Box 20');
    if (sum.homeDed) addRow(t1, 'Use of home (simplified)', '−' + fmtGBP(sum.homeDed), 'in Box 20');
    addRow(t1, 'Total allowable expenses', '−' + fmtGBP(sum.rawDeductions), 'Box 20', true);
  }
  addRow(t1, 'Net profit (taxable)', fmtGBP(sum.netProfit), 'Box 21 / 31', true);
  sheet.append(t1);
  if (s.expenseMethod === 'mileage') {
    sheet.append(el('div', { class: 'report__note', text: `Mileage is claimed at HMRC's simplified rate for a ${(VEHICLE_LABELS[s.vehicle] || 'vehicle').toLowerCase()}. For a car that is 55p/mile for the first 10,000 business miles and 25p after. When you claim mileage you cannot also claim fuel, insurance or repairs for the same vehicle.` }));
  }

  // expense breakdown by category (for records / to justify box 20)
  const catRows = expenseByCategory(allX.length ? allX : [], sum, s);
  if (catRows.length) {
    sheet.append(section('Expense breakdown (supports box 20)'));
    const t2 = table();
    catRows.forEach(([label, val, note]) => addRow(t2, label + (note ? ` — ${note}` : ''), fmtGBP(val)));
    sheet.append(t2);
  }

  // ---- Employment (PAYE), if any — for the SA102 employment page ----
  if (sum.base > 0) {
    sheet.append(section('Employment (PAYE) — SA102'));
    const tE = table();
    addRow(tE, 'Pay from employment (from your P60/P45)', fmtGBP(sum.base), 'SA102 box 1');
    addRow(tE, 'Tax taken off that pay', fmtGBP(sum.incomeTaxBase), 'SA102 box 2');
    sheet.append(tE);
    sheet.append(el('div', { class: 'report__note', text: 'Your employer already deducted this tax. It is entered on the employment page so your Personal Allowance is shared correctly across both incomes — it is not extra tax to pay.' }));
  }

  // tax computation
  sheet.append(section('Your tax & National Insurance'));
  const t3 = table();
  if (sum.base > 0) {
    addRow(t3, 'Employment income (PAYE)', fmtGBP(sum.base));
    addRow(t3, 'Self-employment profit', fmtGBP(Math.max(0, sum.netProfit)));
    addRow(t3, 'Total income', fmtGBP(sum.totalIncome), '', true);
  }
  addRow(t3, 'Personal allowance', fmtGBP(sum.personalAllowance));
  addRow(t3, 'Income tax on self-employment', fmtGBP(sum.incomeTaxSE));
  addRow(t3, 'Class 4 NIC', fmtGBP(sum.class4));
  addRow(t3, 'Class 2 NIC', sum.class2.credited ? '£0.00 (auto-credited)' : 'Voluntary');
  if (sum.studentLoanSE) addRow(t3, 'Student loan', fmtGBP(sum.studentLoanSE));
  addRow(t3, 'Total to set aside for HMRC', fmtGBP(sum.totalSETax), '', true);
  addRow(t3, 'Estimated take-home', fmtGBP(Math.max(0, sum.netTakeHome)));
  addRow(t3, 'Effective rate on profit', fmtPct(sum.effectiveSERate));
  sheet.append(t3);

  // payments on account
  if (sum.poa.applies) {
    sheet.append(section('Payments on account'));
    const t4 = table();
    addRow(t4, `1st payment on account — by ${fmtDate(sum.deadlines.onlineFileAndPay, { withYear: true })}`, fmtGBP(sum.poa.each));
    addRow(t4, `2nd payment on account — by ${fmtDate(sum.deadlines.secondPOA, { withYear: true })}`, fmtGBP(sum.poa.each));
    sheet.append(t4);
    sheet.append(el('div', { class: 'report__note', text: 'Because your bill is over £1,000 and little tax is collected at source, HMRC asks for two advance payments towards next year on top of this year’s bill.' }));
  }

  // key dates
  sheet.append(section('Key dates'));
  const t5 = table();
  addRow(t5, 'Register with HMRC by', fmtDate(sum.deadlines.registerBy, { withYear: true }));
  addRow(t5, 'File online & pay by', fmtDate(sum.deadlines.onlineFileAndPay, { withYear: true }));
  if (sum.poa.applies) addRow(t5, '2nd payment on account by', fmtDate(sum.deadlines.secondPOA, { withYear: true }));
  sheet.append(t5);
  sheet.append(el('div', { class: 'report__note', text: 'Keep this report and your records for at least 5 years after the 31 January filing deadline, in case HMRC asks to see them.' }));

  // ---- full records pack (every line) ----
  if (records) {
    const inTy = (d) => d >= sum.ty.start && d <= sum.ty.end;
    const incRows = allE.filter(e => inTy(e.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const expRows = allX.filter(x => inTy(x.date)).sort((a, b) => (a.date < b.date ? -1 : 1));

    sheet.append(pageBreak());
    sheet.append(section(`Income records — ${incRows.length} entr${incRows.length === 1 ? 'y' : 'ies'}`));
    if (incRows.length) {
      const ti = recordTable(['Date', 'Platform', 'Earnings', 'Tips', 'Miles']);
      let iAmt = 0, iTips = 0, iMiles = 0;
      incRows.forEach(e => {
        iAmt += (e.amount || 0); iTips += (e.tips || 0); iMiles += (e.miles || 0);
        recRow(ti, [fmtDate(e.date, { withYear: true }), platformName(e.platform), fmtGBP(e.amount || 0), fmtGBP(e.tips || 0), fmtNum(e.miles || 0)]);
      });
      recRow(ti, ['Total', '', fmtGBP(iAmt), fmtGBP(iTips), fmtNum(iMiles)], true);
      sheet.append(ti);
    } else sheet.append(el('div', { class: 'report__note', text: 'No income recorded in this tax year.' }));

    sheet.append(section(`Expense records — ${expRows.length} entr${expRows.length === 1 ? 'y' : 'ies'}`));
    if (expRows.length) {
      const te = recordTable(['Date', 'Category', 'Vendor', 'Paid', 'Biz%', 'Claimable']);
      let ePaid = 0, eClaim = 0;
      expRows.forEach(x => {
        const cat = EXPENSE_CATEGORIES.find(c => c.id === x.category);
        const vehicle = cat ? cat.vehicle : false;
        const bizPct = (x.bizPct != null ? x.bizPct : (cat ? cat.defaultBizPct : 100));
        const claim = (s.expenseMethod === 'mileage' && vehicle) ? 0 : (x.amount || 0) * bizPct / 100;
        ePaid += (x.amount || 0); eClaim += claim;
        recRow(te, [fmtDate(x.date, { withYear: true }), cat ? cat.label : x.category, (x.vendor || '').slice(0, 22), fmtGBP(x.amount || 0), bizPct + '%', (s.expenseMethod === 'mileage' && vehicle) ? '— mileage' : fmtGBP(claim)]);
      });
      recRow(te, ['Total', '', '', fmtGBP(ePaid), '', fmtGBP(eClaim)], true);
      sheet.append(te);
    } else sheet.append(el('div', { class: 'report__note', text: 'No expenses recorded in this tax year.' }));
  }

  sheet.append(el('div', { class: 'report__foot', text: 'Estimates generated by Kerb to help you prepare and file. Not formal tax advice — confirm all figures on your HMRC Self Assessment. Kerb keeps your records digital and export-ready but is not HMRC-recognised filing software.' }));
  return sheet;
}

// ---- helpers ----
function yearSelect(s) {
  const sel = el('select', { class: 'select', style: 'min-height:36px;padding:6px 30px 6px 10px;font-size:13px' });
  availableYears().forEach(y => { const o = el('option', { value: y, text: y }); if (y === s.taxYear) o.selected = true; sel.append(o); });
  sel.onchange = () => { import('../store.js').then(m => { m.saveSettings({ taxYear: sel.value }); bus.refresh(); }); };
  return sel;
}
function section(title) { return el('div', { class: 'report__section', text: title }); }
function pageBreak() { return el('div', { class: 'report__break' }); }
function grid2(pairs) {
  const g = el('div', { class: 'report__meta' });
  pairs.forEach(([k, v]) => g.append(el('div', { class: 'report__metaItem' }, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })])));
  return g;
}
function table() { return el('table', { class: 'brk report__table' }); }
function addRow(t, label, value, note = '', strong = false) {
  const tr = el('tr', { class: strong ? 'total' : '' });
  tr.append(el('td', { html: escapeText(label) + (note ? ` <span class="report__box">${escapeText(note)}</span>` : '') }), el('td', { text: value }));
  t.append(tr);
}
function recordTable(headers) {
  const t = el('table', { class: 'brk report__table report__data' });
  const tr = el('tr', { class: 'report__dhead' });
  headers.forEach((h, i) => tr.append(el('th', { text: h, style: i ? 'text-align:right' : '' })));
  t.append(tr);
  return t;
}
function recRow(t, cells, strong = false) {
  const tr = el('tr', { class: strong ? 'total' : '' });
  cells.forEach((c, i) => tr.append(el('td', { text: String(c), style: i ? 'text-align:right;white-space:nowrap' : '' })));
  t.append(tr);
}
function escapeText(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function platformName(id) { const p = ({ amazonflex: 'Amazon Flex', ubereats: 'Uber Eats', deliveroo: 'Deliveroo', justeat: 'Just Eat' })[id]; return p || id; }
function expenseByCategory(allX, sum, s) {
  const inTy = allX.filter(x => x.date >= sum.ty.start && x.date <= sum.ty.end);
  const map = new Map();
  for (const x of inTy) map.set(x.category, (map.get(x.category) || 0) + (x.amount || 0));
  return Array.from(map.entries())
    .map(([id, val]) => {
      const cat = EXPENSE_CATEGORIES.find(c => c.id === id);
      const vehicle = cat ? cat.vehicle : false;
      const note = (s.expenseMethod === 'mileage' && vehicle) ? 'covered by mileage' : '';
      return [cat ? cat.label : id, val, note];
    })
    .sort((a, b) => b[1] - a[1]);
}
