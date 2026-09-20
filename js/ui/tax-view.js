// ============================================================
// ui/tax-view.js — full Self Assessment breakdown for the year.
// ============================================================
import { el, fmtGBP, fmtNum, fmtPct, fmtDate, humanUntil, todayISO, daysBetween } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, saveSettings, availableYears, VEHICLE_LABELS, REGION_LABELS } from '../store.js';
import { computeTaxYear } from '../tax.js';
import { icon } from './shared.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const [allE, allX] = await Promise.all([earnings.all(), expenses.all()]);
  const sum = computeTaxYear(allE, allX, s);
  const root = el('div');

  root.append(el('div', { class: 'row row--between', style: 'margin:4px 2px 12px' }, [
    el('h2', { style: 'font-size:22px', text: 'Tax' }),
    el('span', { class: 'pill pill--brand', text: `${REGION_LABELS[s.region]}` }),
  ]));

  // year switcher
  const years = availableYears();
  const chips = el('div', { class: 'chips', style: 'margin-bottom:14px' });
  years.forEach(y => {
    const c = el('button', { class: 'chip' + (y === s.taxYear ? ' is-active' : ''), type: 'button', text: y });
    c.onclick = () => { saveSettings({ taxYear: y }); bus.refresh(); };
    chips.append(c);
  });
  root.append(chips);

  // headline
  const saBill = sum.totalSETax;
  root.append(el('div', { class: 'hero', style: 'background:linear-gradient(155deg,var(--warn),#b5710c)' }, [
    el('div', { class: 'hero__label', text: `Set aside for HMRC · ${sum.taxYear}` }),
    el('div', { class: 'hero__value', text: fmtGBP(saBill) }),
    el('div', { class: 'hero__sub', text: `Income tax ${fmtGBP(sum.incomeTaxSE)} + Class 4 NIC ${fmtGBP(sum.class4)}${sum.studentLoanSE ? ' + Student loan ' + fmtGBP(sum.studentLoanSE) : ''}` }),
    el('div', { class: 'hero__split' }, [
      cell('Net profit', fmtGBP(sum.netProfit, { round: true })),
      cell('Effective rate', fmtPct(sum.effectiveSERate)),
      cell('Take-home', fmtGBP(Math.max(0, sum.netTakeHome), { round: true })),
    ]),
  ]));

  // breakdown table
  const t = el('table', { class: 'brk' });
  const trow = (label, value, cls = '') => { const tr = el('tr', { class: cls }); tr.append(el('td', { html: label }), el('td', { text: value })); t.append(tr); };

  trow('Self-employment income', fmtGBP(sum.grossIncome));
  if (sum.tips) trow('<span class="indent-label">incl. tips</span>', fmtGBP(sum.tips), 'sub indent');

  if (sum.usedTradingAllowance) {
    trow('Less: £1,000 trading allowance', '−' + fmtGBP(sum.effectiveDeduction));
  } else {
    if (sum.mileageDed) trow(`Less: mileage (${fmtNum(sum.businessMiles)} mi)`, '−' + fmtGBP(sum.mileageDed));
    if (sum.otherDeductible) trow('Less: allowable expenses', '−' + fmtGBP(sum.otherDeductible));
    if (sum.homeDed) trow('Less: use of home', '−' + fmtGBP(sum.homeDed));
  }
  trow('Taxable profit', fmtGBP(sum.netProfit), 'total');

  if (sum.base > 0) {
    trow('Other income (PAYE etc.)', fmtGBP(sum.base), 'sub');
    trow('Total income', fmtGBP(sum.totalIncome), 'sub');
  }
  t.append(spacer());

  trow('Income tax on profit', fmtGBP(sum.incomeTaxSE));
  trow('Class 4 NIC', fmtGBP(sum.class4));
  trow(`Class 2 NIC`, sum.class2.credited ? '£0.00' : '—', 'sub');
  if (sum.studentLoanSE) trow('Student loan', fmtGBP(sum.studentLoanSE));
  trow('Total to set aside', fmtGBP(saBill), 'total');

  root.append(el('div', { class: 'card' }, [t]));

  // class 2 note
  root.append(el('div', { class: 'callout callout--info', html: `${icon('info')}<div><b>Class 2 NIC:</b> ${sum.class2.status}. ${sum.class2.credited ? 'Your profit is above the Small Profits Threshold, so you get National Insurance credits toward your State Pension at no cost.' : `You can pay voluntarily (£${sum.class2.voluntaryWeekly.toFixed(2)}/week) to protect your State Pension.`}</div>` }));

  // Payments on account
  root.append(sectionTitle('Payments on account'));
  const poaCard = el('div', { class: 'card' });
  if (sum.poa.applies) {
    poaCard.append(
      el('div', { class: 'row row--between' }, [
        el('div', {}, [el('div', { class: 'tile__k', text: 'Each instalment (×2)' }), el('div', { class: 'tile__v', text: fmtGBP(sum.poa.each) })]),
        el('div', { html: '<span class="pill pill--warn">Applies</span>' }),
      ]),
      el('div', { class: 'callout callout--warn', style: 'margin:12px 0 0', html: `${icon('warn')}<div>${sum.poa.note} On top of your balancing payment, budget ~<b>${fmtGBP(sum.poa.each)}</b> on 31 Jan and again on 31 Jul.</div>` }),
    );
  } else {
    poaCard.append(el('div', { class: 'row', style: 'gap:10px' }, [
      el('div', { class: 'item__icon', style: 'background:var(--pos-tint);color:var(--pos)', html: icon('check') }),
      el('div', {}, [el('div', { style: 'font-weight:700', text: 'Likely none this year' }), el('div', { class: 'tiny muted', text: sum.poa.note })]),
    ]));
  }
  root.append(poaCard);

  // Deadlines
  root.append(sectionTitle('Key dates'));
  const d = sum.deadlines;
  const dl = el('div', { class: 'card card--flush' });
  const dline = (label, date, only = true) => {
    if (!only) return;
    const days = daysBetween(todayISO(), date);
    const past = days < 0;
    const near = !past && days < 45;
    dl.append(el('div', { class: 'item' }, [
      el('div', { class: 'item__icon', style: `background:${past ? 'var(--surface-2)' : near ? 'var(--warn-tint)' : 'var(--info-tint)'};color:${past ? 'var(--faint)' : near ? 'var(--warn)' : 'var(--info)'}`, html: icon('calendar') }),
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: label }),
        el('div', { class: 'item__sub', text: fmtDate(date, { withYear: true }) }),
      ]),
      el('div', { html: `<span class="pill pill--${past ? 'info' : near ? 'warn' : 'info'}">${humanUntil(date)}</span>` }),
    ]));
  };
  dline('Register with HMRC', d.registerBy);
  dline('Online return & balancing payment', d.onlineFileAndPay);
  dline('1st payment on account', d.onlineFileAndPay, sum.poa.applies);
  dline('2nd payment on account', d.secondPOA, sum.poa.applies);
  root.append(dl);

  // VAT status
  const vatPct = Math.round(sum.vat.ratio * 100);
  root.append(el('div', { class: 'callout ' + (sum.vat.near ? 'callout--warn' : 'callout--info'), style: 'margin-top:14px', html: `${icon(sum.vat.near ? 'warn' : 'info')}<div><b>VAT:</b> you register only if turnover passes <b>${fmtGBP(sum.vat.threshold, { round: true })}</b>/year. You're at ${fmtGBP(sum.grossIncome, { round: true })} (${vatPct}%).</div>` }));

  // export
  root.append(sectionTitle('Export'));
  const exp = el('div', { class: 'btn-grid' });
  const csvBtn = el('button', { class: 'btn btn--sub', type: 'button' }); csvBtn.innerHTML = icon('download') + '<span>Summary (CSV)</span>';
  csvBtn.onclick = () => exportSummaryCSV(sum, s);
  const txnBtn = el('button', { class: 'btn btn--sub', type: 'button' }); txnBtn.innerHTML = icon('download') + '<span>Transactions (CSV)</span>';
  txnBtn.onclick = () => exportTransactionsCSV(allE, allX, sum, s);
  exp.append(csvBtn, txnBtn);
  root.append(exp);

  const reportBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:10px' });
  reportBtn.innerHTML = icon('note') + '<span>Self Assessment report (print / PDF)</span>';
  reportBtn.onclick = () => bus.navigate('report');
  root.append(reportBtn);

  root.append(el('div', { class: 'callout callout--brand', style: 'margin-top:14px', html: `${icon('info')}<div>Estimates for guidance using ${sum.taxYear} rates (${VEHICLE_LABELS[s.vehicle]}, ${s.expenseMethod === 'mileage' ? 'simplified mileage' : 'actual costs'}). Always confirm figures on your HMRC Self Assessment. Adjust rates or your PAYE salary in Settings.</div>` }));

  return root;
}

function cell(k, v) { return el('div', { class: 'hero__cell' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })]); }
function sectionTitle(t) { return el('div', { class: 'section-title', text: t }); }
function spacer() { const tr = el('tr'); tr.append(el('td', { html: '&nbsp;', colspan: 2, style: 'border:none;padding:4px' })); return tr; }

// ---- CSV export ----
function download(filename, text, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportSummaryCSV(sum, s) {
  const rows = [
    ['Kerb tax summary', sum.taxYear],
    ['Region', s.region], ['Vehicle', s.vehicle], ['Expense method', s.expenseMethod],
    [],
    ['Self-employment income', sum.grossIncome.toFixed(2)],
    ['Tips (incl. above)', sum.tips.toFixed(2)],
    ['Business miles', sum.businessMiles],
    ['Mileage deduction', sum.mileageDed.toFixed(2)],
    ['Other allowable expenses', sum.otherDeductible.toFixed(2)],
    ['Trading allowance used', sum.usedTradingAllowance ? 'yes' : 'no'],
    ['Taxable profit', sum.netProfit.toFixed(2)],
    ['Other income (PAYE etc.)', sum.base.toFixed(2)],
    ['Income tax on profit', sum.incomeTaxSE.toFixed(2)],
    ['Class 4 NIC', sum.class4.toFixed(2)],
    ['Student loan', sum.studentLoanSE.toFixed(2)],
    ['Total to set aside', sum.totalSETax.toFixed(2)],
    ['Net take-home', sum.netTakeHome.toFixed(2)],
    ['Effective rate %', sum.effectiveSERate.toFixed(1)],
    ['Payments on account apply', sum.poa.applies ? 'yes' : 'no'],
    ['Each payment on account', sum.poa.each.toFixed(2)],
  ];
  download(`kerb-tax-summary-${sum.taxYear.replace('/', '-')}.csv`, rows.map(r => r.join(',')).join('\n'));
}
function exportTransactionsCSV(allE, allX, sum, s) {
  const inRange = (dt) => dt >= sum.ty.start && dt <= sum.ty.end;
  const lines = [['Type', 'Date', 'Platform/Category', 'Amount', 'Tips', 'Hours', 'Miles', 'Deliveries', 'Vendor', 'Note'].join(',')];
  allE.filter(e => inRange(e.date)).forEach(e => lines.push(['Income', e.date, e.platform, (e.amount || 0).toFixed(2), (e.tips || 0).toFixed(2), e.hours || 0, e.miles || 0, e.deliveries || 0, '', csv(e.notes)].join(',')));
  allX.filter(x => inRange(x.date)).forEach(x => lines.push(['Expense', x.date, x.category, (x.amount || 0).toFixed(2), '', '', '', '', csv(x.vendor), csv(x.notes)].join(',')));
  download(`kerb-transactions-${sum.taxYear.replace('/', '-')}.csv`, lines.join('\n'));
}
function csv(v) { const s = String(v || ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
