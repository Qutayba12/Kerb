// ============================================================
// ui/report.js — a printable Self Assessment summary for a tax
// year. Use the browser's Print dialog to save it as a PDF.
// Box references are a guide to the SA103S self-employment pages.
// ============================================================
import { el, fmtGBP, fmtNum, fmtPct, fmtDate, todayISO } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, availableYears, VEHICLE_LABELS, REGION_LABELS } from '../store.js';
import { computeTaxYear } from '../tax.js';
import { icon } from './shared.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const [allE, allX] = await Promise.all([earnings.all(), expenses.all()]);
  const sum = computeTaxYear(allE, allX, s);
  const root = el('div');

  // toolbar (hidden when printing)
  const toolbar = el('div', { class: 'row row--between no-print', style: 'margin:4px 2px 14px' }, [
    el('h2', { style: 'font-size:22px', text: 'SA report' }),
    el('div', { class: 'row', style: 'gap:8px' }, [
      yearSelect(s),
      (() => { const b = el('button', { class: 'btn btn--primary btn--sm', type: 'button' }); b.innerHTML = icon('download') + '<span>Print / PDF</span>'; b.onclick = () => window.print(); return b; })(),
    ]),
  ]);
  root.append(toolbar);

  root.append(el('div', { class: 'callout callout--info no-print', html: `${icon('info')}<div>Save this as a PDF from your browser's <b>Print</b> dialog (choose “Save as PDF”). Box numbers are a guide to the <b>SA103S</b> self-employment pages — always confirm on HMRC.</div>` }));

  // the printable sheet
  const sheet = el('div', { class: 'report card' });

  // header
  sheet.append(el('div', { class: 'report__head' }, [
    el('div', {}, [
      el('div', { class: 'report__title', text: 'Self Assessment Summary' }),
      el('div', { class: 'report__sub', text: `Tax year ${sum.taxYear} (6 Apr ${sum.ty.startYear} – 5 Apr ${sum.ty.startYear + 1})` }),
    ]),
    el('div', { class: 'report__brand' }, [el('img', { src: 'icons/icon.svg', width: 34, height: 34, alt: '' }), el('span', { text: 'Kerb' })]),
  ]));

  // who / basis
  const details = [
    ['Name', s.traderName || '—'],
    ['UTR', s.utr || '—'],
    ['Business', 'Self-employed delivery driver'],
    ['Region', REGION_LABELS[s.region]],
    ['Accounting basis', 'Cash basis'],
    ['Vehicle', VEHICLE_LABELS[s.vehicle]],
    ['Expense method', s.expenseMethod === 'mileage' ? 'Simplified (mileage)' : 'Actual costs'],
    ['Prepared', fmtDate(todayISO(), { withYear: true })],
  ];
  sheet.append(grid2(details));

  // income & expenses
  sheet.append(section('Income & expenses'));
  const t1 = table();
  addRow(t1, 'Turnover (all delivery income incl. tips)', fmtGBP(sum.grossIncome), 'Box 9');
  if (sum.usedTradingAllowance) {
    addRow(t1, 'Trading income allowance', '−' + fmtGBP(sum.effectiveDeduction), 'Box 10.1');
  } else {
    if (sum.mileageDed) addRow(t1, `Business mileage (${fmtNum(sum.businessMiles)} miles)`, '−' + fmtGBP(sum.mileageDed), 'in Box 20');
    if (sum.otherDeductible) addRow(t1, 'Other allowable expenses', '−' + fmtGBP(sum.otherDeductible), 'Box 20');
    if (sum.homeDed) addRow(t1, 'Use of home (simplified)', '−' + fmtGBP(sum.homeDed), 'in Box 20');
    addRow(t1, 'Total allowable expenses', '−' + fmtGBP(sum.rawDeductions), 'Box 20', true);
  }
  addRow(t1, 'Net profit (taxable)', fmtGBP(sum.netProfit), 'Box 21 / 31', true);
  sheet.append(t1);

  // expense breakdown by category (if actual or for records)
  const catRows = expenseByCategory(allX, sum, s);
  if (catRows.length) {
    sheet.append(section('Expense breakdown (for your records)'));
    const t2 = table();
    catRows.forEach(([label, val, note]) => addRow(t2, label, fmtGBP(val), note));
    sheet.append(t2);
  }

  // tax computation
  sheet.append(section('Tax & National Insurance'));
  const t3 = table();
  if (sum.base > 0) {
    addRow(t3, 'Other income (PAYE etc.)', fmtGBP(sum.base));
    addRow(t3, 'Total income', fmtGBP(sum.totalIncome));
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
  }

  // key dates
  sheet.append(section('Key dates'));
  const t5 = table();
  addRow(t5, 'Register with HMRC by', fmtDate(sum.deadlines.registerBy, { withYear: true }));
  addRow(t5, 'File online & pay by', fmtDate(sum.deadlines.onlineFileAndPay, { withYear: true }));
  sheet.append(t5);

  sheet.append(el('div', { class: 'report__foot', text: 'Estimates generated by Kerb to help you prepare. Not tax advice — confirm all figures with HMRC or an accountant.' }));

  root.append(sheet);
  return root;
}

// ---- helpers ----
function yearSelect(s) {
  const sel = el('select', { class: 'select', style: 'min-height:36px;padding:6px 30px 6px 10px;font-size:13px' });
  availableYears().forEach(y => { const o = el('option', { value: y, text: y }); if (y === s.taxYear) o.selected = true; sel.append(o); });
  sel.onchange = () => { import('../store.js').then(m => { m.saveSettings({ taxYear: sel.value }); bus.refresh(); }); };
  return sel;
}
function section(title) { return el('div', { class: 'report__section', text: title }); }
function grid2(pairs) {
  const g = el('div', { class: 'report__meta' });
  pairs.forEach(([k, v]) => g.append(el('div', { class: 'report__metaItem' }, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })])));
  return g;
}
function table() { return el('table', { class: 'brk report__table' }); }
function addRow(t, label, value, note = '', strong = false) {
  const tr = el('tr', { class: strong ? 'total' : '' });
  tr.append(el('td', { html: label + (note ? ` <span class="report__box">${note}</span>` : '') }), el('td', { text: value }));
  t.append(tr);
}
function expenseByCategory(allX, sum, s) {
  const inTy = allX.filter(x => x.date >= sum.ty.start && x.date <= sum.ty.end);
  const map = new Map();
  for (const x of inTy) map.set(x.category, (map.get(x.category) || 0) + (x.amount || 0));
  return Array.from(map.entries())
    .map(([id, val]) => {
      const cat = catLabel(id);
      const vehicle = catIsVehicle(id);
      const note = (s.expenseMethod === 'mileage' && vehicle) ? 'covered by mileage' : '';
      return [cat, val, note];
    })
    .sort((a, b) => b[1] - a[1]);
}
// tiny local category helpers to avoid extra imports churn
import { EXPENSE_CATEGORIES } from '../store.js';
function catLabel(id) { const c = EXPENSE_CATEGORIES.find(c => c.id === id); return c ? c.label : id; }
function catIsVehicle(id) { const c = EXPENSE_CATEGORIES.find(c => c.id === id); return c ? c.vehicle : false; }
