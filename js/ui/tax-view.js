// ============================================================
// ui/tax-view.js — full Self Assessment breakdown for the year.
// ============================================================
import { el, fmtGBP, fmtNum, fmtPct, fmtDate, humanUntil, todayISO, daysBetween, registrationDeadline, round2, uid, parseMoney, fmtMiles } from '../util.js';
import { earnings, expenses, payslips } from '../db.js';
import { getSettings, saveSettings, availableYears, VEHICLE_LABELS, REGION_LABELS } from '../store.js';
import { computeTaxYear, quarterlySummary } from '../tax.js';
import { derivePaye } from '../payslips.js';
import { icon, openSheet, closeSheet, field, moneyInput, toast, confirmDialog } from './shared.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const [allE, allX, allPS] = await Promise.all([earnings.all(), expenses.all(), payslips.all()]);
  const sum = computeTaxYear(allE, allX, s);
  const paye = derivePaye(allPS, s.taxYear);
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
    // With more than one vehicle, show each one — each has its own 10k band.
    if (sum.mileageDed && (sum.mileageRows || []).length > 1) {
      sum.mileageRows.forEach(r => trow(`Less: mileage — ${r.label} (${fmtMiles(r.miles)} mi)`, '−' + fmtGBP(r.amount)));
    } else if (sum.mileageDed) {
      trow(`Less: mileage (${fmtNum(sum.businessMiles)} mi)`, '−' + fmtGBP(sum.mileageDed));
    }
    if (sum.otherDeductible) trow('Less: allowable expenses', '−' + fmtGBP(sum.otherDeductible));
    if (sum.homeDed) trow('Less: use of home', '−' + fmtGBP(sum.homeDed));
  }
  if (sum.lossBroughtForward > 0) {
    trow('Net profit', fmtGBP(sum.netProfit), 'total');
    trow('Less: loss brought forward', '−' + fmtGBP(sum.lossUsed));
    trow('Taxable profit', fmtGBP(sum.taxableProfit), 'total');
  } else if (sum.lossThisYear > 0) {
    trow('Loss this year', '−' + fmtGBP(sum.lossThisYear), 'total');
    trow('Taxable profit', fmtGBP(0), 'total');
  } else {
    trow('Taxable profit', fmtGBP(sum.netProfit), 'total');
  }
  t.append(spacer());

  trow('Income tax on profit', fmtGBP(sum.incomeTaxSE));
  trow('Class 4 NIC', fmtGBP(sum.class4));
  trow(`Class 2 NIC`, sum.class2.credited ? '£0.00' : '—', 'sub');
  if (sum.studentLoanSE) trow('Student loan', fmtGBP(sum.studentLoanSE));
  trow('Total to set aside', fmtGBP(saBill), 'total');

  root.append(sectionTitle('① Self-employment (delivery)'));
  root.append(el('div', { class: 'card' }, [t]));

  // class 2 note
  root.append(el('div', { class: 'callout callout--info', html: `${icon('info')}<div><b>Class 2 NIC:</b> ${sum.class2.status}. ${sum.class2.credited ? 'Your profit is above the Small Profits Threshold, so you get National Insurance credits toward your State Pension at no cost.' : `You can pay voluntarily (£${sum.class2.voluntaryWeekly.toFixed(2)}/week) to protect your State Pension.`}</div>` }));

  // ---- Losses ----
  if (sum.lossCarriedForward > 0 || sum.lossUsed > 0) {
    const bits = [];
    if (sum.lossUsed > 0) bits.push(`<b>${fmtGBP(sum.lossUsed)}</b> of earlier losses has been set against this year's profit, cutting your Income Tax and Class 4 NIC.`);
    if (sum.lossThisYear > 0) bits.push(`This year made a loss of <b>${fmtGBP(sum.lossThisYear)}</b>, so there is no tax to pay on self-employment.`);
    if (sum.lossCarriedForward > 0) bits.push(`<b>${fmtGBP(sum.lossCarriedForward)}</b> is left to carry forward to future years.`);
    root.append(el('div', { class: 'callout callout--info', html: `${icon('info')}<div><b>Trading losses:</b> ${bits.join(' ')} Declare these in the losses section of your SA103S.</div>` }));
  }

  // ---- Employment (PAYE) — kept clearly separate from self-employment ----
  const hasPaye = sum.base > 0 || paye.count > 0;
  if (hasPaye) {
    root.append(sectionTitle('② Employment (PAYE) — deducted at source'));
    const usingPayslips = s.payeSource === 'payslips' && paye.count > 0;
    // Show the figure the tax engine actually used: the final year total when
    // the job has ended, otherwise the salary received so far (with the
    // projected annual figure as a sub-line).
    const empGross = usingPayslips ? (paye.final ? paye.annualSalary : paye.sumGross) : sum.base;
    const empTax = usingPayslips ? (paye.final ? paye.annualTax : paye.sumTax) : sum.incomeTaxBase;
    const empNI = usingPayslips ? paye.sumNI : 0;
    const et = el('table', { class: 'brk' });
    const erow = (l, v, cls = '') => { const tr = el('tr', { class: cls }); tr.append(el('td', { html: l }), el('td', { text: v })); et.append(tr); };
    erow(usingPayslips ? (paye.final ? `Salary this year — final (${paye.count} payslip${paye.count === 1 ? '' : 's'})` : `Salary received (${paye.count} payslip${paye.count === 1 ? '' : 's'})`) : 'Annual salary', fmtGBP(empGross));
    erow('Income tax deducted', fmtGBP(empTax));
    if (empNI) erow('National Insurance deducted', fmtGBP(empNI));
    if (usingPayslips && !paye.final) erow('Annualised salary', fmtGBP(paye.annualSalary), 'sub');
    root.append(el('div', { class: 'card' }, [et]));
    root.append(el('div', { class: 'callout callout--brand', html: `${icon('check')}<div>Your employer already deducts this tax &amp; NI from each payslip — <b>you don't set anything aside for it</b>. It only matters here because your salary uses your Personal Allowance, which is why your delivery profit is taxed from the first £.</div>` }));

    // ---- Combined position ----
    root.append(sectionTitle('③ Combined this tax year'));
    const ct = el('table', { class: 'brk' });
    const crow = (l, v, cls = '') => { const tr = el('tr', { class: cls }); tr.append(el('td', { html: l }), el('td', { text: v })); ct.append(tr); };
    crow('Employment income (PAYE)', fmtGBP(empGross));
    crow('Self-employment profit', fmtGBP(sum.netProfit));
    crow('Total income', fmtGBP(round2(empGross + Math.max(0, sum.netProfit))), 'total');
    crow('Income tax — deducted via PAYE', fmtGBP(empTax), 'sub');
    crow('Income tax — to pay on self-employment', fmtGBP(sum.incomeTaxSE), 'sub');
    crow('Class 4 NIC — to pay', fmtGBP(sum.class4), 'sub');
    crow('You still owe (Self Assessment)', fmtGBP(sum.totalSETax), 'total');
    root.append(el('div', { class: 'card' }, [ct]));
  }

  // ---- Quarterly updates (Making Tax Digital) ----
  const q = quarterlySummary(allE, allX, s);
  root.append(sectionTitle('Quarterly updates (MTD-ready)'));
  const qCard = el('div', { class: 'card card--flush' });
  q.quarters.forEach(r => {
    const tone = r.status === 'done' ? 'info' : r.status === 'current' ? 'warn' : 'info';
    const faded = r.status === 'future';
    const row = el('div', { class: 'item', style: faded ? 'opacity:.55' : '' }, [
      el('div', { class: 'item__icon', style: `background:var(--${tone}-tint);color:var(--${tone})`, html: icon('calendar') }),
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: `Q${r.n} · ${fmtDate(r.start)} – ${fmtDate(r.end, { withYear: true })}` }),
        el('div', { class: 'item__sub', text: `Income ${fmtGBP(r.income)} · Expenses ${fmtGBP(r.expenses)} · due ${fmtDate(r.due, { withYear: true })}` }),
      ]),
      el('div', { style: 'text-align:right' }, [
        el('div', { class: 'item__amt', text: fmtGBP(r.profit) }),
        el('div', { class: 'tiny faint', text: r.status === 'current' ? 'in progress' : r.status === 'done' ? 'complete' : 'upcoming' }),
      ]),
    ]);
    qCard.append(row);
  });
  root.append(qCard);
  root.append(el('div', { class: 'callout callout--info', html: `${icon('info')}<div>These are the four standard MTD periods. If you become required to send quarterly updates, these are the <b>income and expense totals</b> each update needs (reported cumulatively). Kerb prepares them — it cannot submit them.</div>` }));

  // ---- What you've actually paid HMRC ----
  root.append(sectionTitle('Paid to HMRC'));
  const payments = (s.hmrcPayments || []).filter(p => p.taxYear === s.taxYear).sort((a, b) => (a.date < b.date ? 1 : -1));
  const paid = round2(payments.reduce((t, p) => t + (p.amount || 0), 0));
  const outstanding = round2(Math.max(0, sum.totalSETax - paid));
  const payCard = el('div', { class: 'card' });
  payCard.append(el('div', { class: 'row row--between' }, [
    el('div', {}, [el('div', { class: 'tile__k', text: 'Paid so far' }), el('div', { class: 'tile__v', style: 'color:var(--pos)', text: fmtGBP(paid) })]),
    el('div', { style: 'text-align:right' }, [el('div', { class: 'tile__k', text: 'Still to pay (est.)' }), el('div', { class: 'tile__v', style: 'color:var(--warn-text)', text: fmtGBP(outstanding) })]),
  ]));
  if (payments.length) {
    const list = el('div', { class: 'card card--flush', style: 'margin:12px 0 0' });
    payments.forEach(p => {
      const it = el('div', { class: 'item' }, [
        el('div', { class: 'item__icon', style: 'background:var(--pos-tint);color:var(--pos)', html: icon('check') }),
        el('div', { class: 'item__main' }, [
          el('div', { class: 'item__title', text: p.note || 'Payment to HMRC' }),
          el('div', { class: 'item__sub', text: fmtDate(p.date, { withYear: true }) }),
        ]),
        el('div', { class: 'item__amt', text: fmtGBP(p.amount) }),
      ]);
      it.style.cursor = 'pointer';
      it.onclick = async () => {
        const ok = await confirmDialog({ title: 'Remove this payment?', message: 'It will no longer count towards what you have paid.', confirmText: 'Remove', danger: true });
        if (!ok) return;
        saveSettings({ hmrcPayments: (getSettings().hmrcPayments || []).filter(x => x.id !== p.id) });
        toast('Payment removed', 'ok'); bus.refresh();
      };
      list.append(it);
    });
    payCard.append(list);
  }
  const addPay = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-top:12px' });
  addPay.innerHTML = icon('plus') + '<span>Record a payment to HMRC</span>';
  addPay.onclick = () => openPaymentForm(s.taxYear);
  payCard.append(addPay);
  root.append(payCard);

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
  dline('Register with HMRC', registrationDeadline(s.seStartDate) || d.registerBy);
  dline('Online return & balancing payment', d.onlineFileAndPay);
  dline('1st payment on account', d.onlineFileAndPay, sum.poa.applies);
  dline('2nd payment on account', d.secondPOA, sum.poa.applies);
  root.append(dl);

  // VAT status
  const vatPct = Math.round(sum.vat.ratio * 100);
  root.append(el('div', { class: 'callout ' + (sum.vat.near ? 'callout--warn' : 'callout--info'), style: 'margin-top:14px', html: `${icon(sum.vat.near ? 'warn' : 'info')}<div><b>VAT:</b> you register only if turnover passes <b>${fmtGBP(sum.vat.threshold, { round: true })}</b>/year. You're at ${fmtGBP(sum.grossIncome, { round: true })} (${vatPct}%).</div>` }));

  // Making Tax Digital heads-up (threshold is on self-employment TURNOVER, before expenses)
  if (sum.grossIncome > 45000) {
    const over = sum.grossIncome >= 50000;
    root.append(el('div', { class: 'callout ' + (over ? 'callout--warn' : 'callout--info'), html: `${icon(over ? 'warn' : 'info')}<div><b>Making Tax Digital for Income Tax:</b> from 6 Apr 2026 you must keep digital records and send <b>quarterly updates</b> to HMRC if your self-employment <b>turnover (before expenses)</b> is over <b>£50,000</b>/year — this excludes your PAYE salary (£30k threshold from Apr 2027, £20k from Apr 2028). You're at ${fmtGBP(sum.grossIncome, { round: true })}${over ? ' — you likely qualify.' : '.'}<br><span class="tiny">Kerb keeps your records digital and export-ready, but it is not HMRC-recognised filing software — you'll submit through recognised software or an accountant.</span></div>` }));
  }

  // export
  root.append(sectionTitle('Export'));
  const exp = el('div', { class: 'btn-grid' });
  const csvBtn = el('button', { class: 'btn btn--sub', type: 'button' }); csvBtn.innerHTML = icon('download') + '<span>Summary (CSV)</span>';
  csvBtn.onclick = () => exportSummaryCSV(sum, s);
  const txnBtn = el('button', { class: 'btn btn--sub', type: 'button' }); txnBtn.innerHTML = icon('download') + '<span>Transactions (CSV)</span>';
  txnBtn.onclick = () => exportTransactionsCSV(allE, allX, sum, s);
  exp.append(csvBtn, txnBtn);
  root.append(exp);

  const reviewBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-top:10px' });
  reviewBtn.innerHTML = icon('check') + '<span>Check before you file</span>';
  reviewBtn.onclick = () => bus.navigate('review');
  root.append(reviewBtn);

  const reportBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:10px' });
  reportBtn.innerHTML = icon('note') + '<span>Self Assessment report (print / PDF)</span>';
  reportBtn.onclick = () => bus.navigate('report');
  root.append(reportBtn);

  // Travel between home and a pickup station is the one part of the claim
  // whose deductibility depends on facts the app cannot settle. Show what it
  // is worth so the driver knows the size of the question, not just that one
  // exists.
  if (sum.baseLeg && sum.baseLeg.amount > 0) {
    const b = sum.baseLeg;
    root.append(el('div', { class: 'callout callout--info', style: 'margin-top:14px', html: `${icon('info')}<div><b>${fmtGBP(b.amount)} of your mileage claim is the drive out to a station</b> (${fmtMiles(b.miles)} of ${fmtNum(sum.businessMiles)} miles).${b.unsplitMiles > 0 ? ` Another ${fmtMiles(b.unsplitMiles)} miles are logged without a station, so are not counted here.` : ''} The way home is not included: it starts at your last drop, which is a work location. Whether the outbound leg counts as business travel depends on whether HMRC treats your pickup points as a fixed base — working from several stations at different distances points away from that. Worth confirming once with an accountant.</div>` }));
  }

  // HMRC publishes each year's rates in advance; until they exist for this
  // year the engine carries the previous year's forward. Say so, rather than
  // presenting last year's allowances under this year's name.
  if (sum.config && sum.config.carriedFrom) {
    root.append(el('div', { class: 'callout callout--warn', style: 'margin-top:14px', html: `${icon('warn')}<div><b>These use ${sum.config.carriedFrom} rates.</b> HMRC has not published the ${sum.taxYear} figures in Kerb yet, so the previous year's allowances and thresholds are being used as a placeholder. Treat the result as a rough guide and check back once the new rates are in.</div>` }));
  }
  root.append(el('div', { class: 'callout callout--brand', style: 'margin-top:14px', html: `${icon('info')}<div>Estimates for guidance using ${sum.taxYear} rates (${VEHICLE_LABELS[s.vehicle]}, ${s.expenseMethod === 'mileage' ? 'simplified mileage' : 'actual costs'}). Always confirm figures on your HMRC Self Assessment. Adjust rates or your PAYE salary in Settings.</div>` }));

  return root;
}

// Record money actually sent to HMRC, so the Tax screen can show what is
// genuinely left to pay rather than only the full estimated bill.
function openPaymentForm(taxYear) {
  const form = el('form', { class: 'kform', autocomplete: 'off' });
  const amount = moneyInput({ value: '', placeholder: '0.00' });
  const date = el('input', { class: 'input', type: 'date', value: todayISO(), max: todayISO() });
  const note = el('input', { class: 'input', type: 'text', placeholder: 'e.g. Balancing payment, 1st payment on account' });
  form.append(
    field('Amount paid', amount),
    field('Date paid', date),
    field('What was it for?', note, 'Optional — helps you match it to your HMRC statement.'),
  );
  const save = () => {
    const amt = parseMoney(amount.input.value);
    if (!amt) { toast('Enter the amount', 'err'); return; }
    const cur = getSettings();
    const list = Array.isArray(cur.hmrcPayments) ? cur.hmrcPayments.slice() : [];
    list.push({ id: uid(), taxYear, date: date.value || todayISO(), amount: amt, note: note.value.trim() });
    saveSettings({ hmrcPayments: list });
    closeSheet(); toast('Payment recorded', 'ok'); bus.refresh();
  };
  form.append(el('div', { style: 'margin-top:16px' }, [el('button', { class: 'btn btn--primary btn--block', type: 'submit', text: 'Save payment' })]));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); save(); });
  openSheet({ title: `Payment to HMRC · ${taxYear}`, node: form });
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
  download(`kerb-tax-summary-${sum.taxYear.replace('/', '-')}.csv`, rows.map(r => r.map(csv).join(',')).join('\n'));
}
function exportTransactionsCSV(allE, allX, sum, s) {
  const inRange = (dt) => dt >= sum.ty.start && dt <= sum.ty.end;
  const lines = [['Type', 'Date', 'Platform/Category', 'Amount', 'Tips', 'Hours', 'Miles', 'Deliveries', 'Vendor', 'Note'].join(',')];
  allE.filter(e => inRange(e.date)).forEach(e => lines.push(['Income', e.date, e.platform, (e.amount || 0).toFixed(2), (e.tips || 0).toFixed(2), e.hours || 0, e.miles || 0, e.deliveries || 0, '', csv(e.notes)].join(',')));
  allX.filter(x => inRange(x.date)).forEach(x => lines.push(['Expense', x.date, x.category, (x.amount || 0).toFixed(2), '', '', '', '', csv(x.vendor), csv(x.notes)].join(',')));
  download(`kerb-transactions-${sum.taxYear.replace('/', '-')}.csv`, lines.join('\n'));
}
// A CSV cell. Besides quoting, a value that begins with =, +, -, @, tab or CR
// is prefixed with an apostrophe: spreadsheets treat those as FORMULAS, and
// these cells carry vendor names and notes that came from a scanned receipt
// or an imported backup. Without this, opening the export in Excel could run
// something like =HYPERLINK(...) and leak the row.
function csv(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r']/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
