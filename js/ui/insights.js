// ============================================================
// ui/insights.js — analytics: monthly trend, £/hour, £/mile,
// best days, platform comparison and full-year projection.
// ============================================================
import { el, fmtGBP, fmtNum, fmtPct, taxYearFromLabel, parseISO, daysBetween, todayISO } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, saveSettings, categoryById, VEHICLE_LABELS } from '../store.js';
import { computeTaxYear, compareExpenseMethods } from '../tax.js';
import { groupedBars, barChart, PALETTE } from '../charts.js';
import { icon, emptyState, toast } from './shared.js';
import { miniTile } from './income.js';
import { bus } from '../bus.js';

const MON = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function render() {
  const s = getSettings();
  const [allE, allX] = await Promise.all([earnings.all(), expenses.all()]);
  const sum = computeTaxYear(allE, allX, s);
  const ty = taxYearFromLabel(s.taxYear);
  const root = el('div');

  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 14px', text: 'Insights' }));

  const yE = allE.filter(e => e.date >= ty.start && e.date <= ty.end);
  if (!yE.length) {
    root.append(emptyState('spark', 'No data yet', 'Log some shifts to see your insights.'));
    return root;
  }

  // ---- headline efficiency ----
  root.append(el('div', { class: 'grid-3', style: 'margin-bottom:14px' }, [
    miniTile('£ / hour', sum.totalHours ? fmtGBP(sum.grossIncome / sum.totalHours) : '—'),
    miniTile('£ / mile', sum.businessMiles ? fmtGBP(sum.grossIncome / sum.businessMiles) : '—'),
    miniTile('£ / drop', sum.totalDeliveries ? fmtGBP(sum.grossIncome / sum.totalDeliveries) : '—'),
    miniTile('Net £ / hr', sum.totalHours ? fmtGBP(sum.netTakeHome / sum.totalHours) : '—', 'pos'),
    miniTile('Total hours', fmtNum(sum.totalHours, 1)),
    miniTile('Total miles', fmtNum(sum.businessMiles)),
  ]));
  root.append(el('div', { class: 'callout callout--info', html: `${icon('info')}<div><b>Net £/hour</b> is what you actually keep after tax, NIC and mileage costs — the number that really matters when choosing shifts.</div>` }));

  // ---- expense method advisor (mileage vs actual costs) ----
  const advisor = methodAdvisorCard(allE, allX, s);
  if (advisor) root.append(advisor);

  // ---- monthly income / deductions / tax ----
  const months = monthlyBuckets(yE, allX, ty, s);
  root.append(el('div', { class: 'section-title', text: 'By month (tax year)' }));
  const card = el('div', { class: 'card' });
  card.innerHTML = groupedBars(months.labels, [
    { name: 'Income', color: PALETTE[0], values: months.income },
    { name: 'Deductions', color: PALETTE[1], values: months.deductions },
    { name: 'Est. tax', color: PALETTE[3], values: months.tax },
  ]);
  root.append(card);

  // ---- best day of week (avg £/hour) ----
  const dow = dowStats(yE);
  if (dow.some(d => d.income > 0)) {
    root.append(el('div', { class: 'section-title', text: 'Earnings by weekday' }));
    const c2 = el('div', { class: 'card' });
    c2.innerHTML = barChart(DOW.map((lab, i) => ({ label: lab, value: dow[i].income })), { valueFmt: v => fmtGBP(v, { round: true }) });
    const best = dow.map((d, i) => ({ i, rate: d.hours ? d.income / d.hours : 0 })).sort((a, b) => b.rate - a.rate)[0];
    if (best && best.rate > 0) c2.append(el('div', { class: 'tiny muted center', style: 'margin-top:6px', text: `Best rate: ${DOW[best.i]} at ${fmtGBP(best.rate)}/hour` }));
    root.append(c2);
  }

  // ---- platform comparison ----
  if (sum.byPlatform.length > 1) {
    root.append(el('div', { class: 'section-title', text: 'Platform comparison' }));
    const pc = el('div', { class: 'card card--flush' });
    sum.byPlatform.forEach(p => {
      const pe = yE.filter(e => e.platform === p.id);
      const hrs = pe.reduce((t, e) => t + (e.hours || 0), 0);
      const rate = hrs ? p.amount / hrs : 0;
      pc.append(el('div', { class: 'item' }, [
        el('div', { class: 'item__icon', style: `background:${p.color}22;color:${p.color}`, html: icon('route') }),
        el('div', { class: 'item__main' }, [
          el('div', { class: 'item__title', text: p.name }),
          el('div', { class: 'item__sub', text: `${fmtNum(hrs, 1)}h · ${rate ? fmtGBP(rate) + '/hr' : 'no hours logged'}` }),
        ]),
        el('div', { class: 'item__amt amt-pos', text: fmtGBP(p.amount) }),
      ]));
    });
    root.append(pc);
  }

  // ---- projection ----
  const elapsed = Math.max(1, daysBetween(ty.start, todayISO()) + 1);
  const frac = Math.min(1, elapsed / 365);
  if (frac < 0.95 && sum.grossIncome > 0) {
    const projIncome = sum.grossIncome / frac;
    const projProfit = sum.netProfit / frac;
    const projTax = sum.totalSETax / frac;
    root.append(el('div', { class: 'section-title', text: 'Full-year projection' }));
    root.append(el('div', { class: 'card' }, [
      el('div', { class: 'grid-3' }, [
        proj('Income', fmtGBP(projIncome, { round: true })),
        proj('Profit', fmtGBP(projProfit, { round: true })),
        proj('Tax', fmtGBP(projTax, { round: true })),
      ]),
      el('div', { class: 'tiny muted center', style: 'margin-top:10px', text: `Based on ${Math.round(frac * 100)}% of the tax year elapsed. Assumes a steady pace.` }),
    ]));
  }

  return root;
}

function proj(k, v) { return el('div', { class: 'center' }, [el('div', { class: 'tile__v', style: 'font-size:18px', text: v }), el('div', { class: 'tiny faint', text: k })]); }

const METHOD_LABEL = { mileage: 'Simplified mileage', actual: 'Actual costs' };
function methodAdvisorCard(allE, allX, s) {
  const cmp = compareExpenseMethods(allE, allX, s);
  // Nothing to advise on until there are miles or vehicle costs to compare.
  if (cmp.businessMiles <= 0 && !cmp.hasVehicleCosts) return null;

  const wrap = el('div');
  wrap.append(el('div', { class: 'section-title', text: 'Expense method' }));
  const card = el('div', { class: 'card' });

  // side-by-side: mileage claim vs actual vehicle costs
  const col = (label, value, sub, active) => el('div', { class: 'center', style: `flex:1;padding:10px 6px;border-radius:12px;${active ? 'background:var(--brand-tint)' : ''}` }, [
    el('div', { class: 'tiny faint', text: label }),
    el('div', { class: 'tile__v', style: 'font-size:20px;' + (active ? 'color:var(--brand)' : ''), text: value }),
    el('div', { class: 'tiny muted', text: sub }),
  ]);
  card.append(el('div', { class: 'row', style: 'gap:8px;align-items:stretch' }, [
    col('Simplified mileage', fmtGBP(cmp.mileageClaim, { round: true }), `${fmtNum(cmp.businessMiles)} mi claim`, cmp.better === 'mileage'),
    el('div', { style: 'align-self:center;color:var(--faint);font-weight:800', text: 'vs' }),
    col('Actual costs', cmp.hasVehicleCosts ? fmtGBP(cmp.vehicleActual, { round: true }) : '—', 'fuel, insurance, repairs', cmp.better === 'actual'),
  ]));

  // verdict
  let msg, tone = 'brand';
  if (cmp.bothTradingAllowance) {
    msg = `Your <b>£1,000 trading allowance</b> is bigger than either deduction right now, so Kerb is using that. Revisit this once your costs grow.`;
    tone = 'info';
  } else if (!cmp.hasVehicleCosts) {
    msg = `Log your vehicle costs (fuel, insurance, repairs) to compare properly. On mileage alone you'd claim <b>${fmtGBP(cmp.mileageClaim, { round: true })}</b> this year.`;
    tone = 'info';
  } else if (cmp.better === cmp.current) {
    msg = cmp.taxSaving >= 1
      ? `You're on the better method — <b>${METHOD_LABEL[cmp.current]}</b> saves you about <b>${fmtGBP(cmp.taxSaving, { round: true })}/yr</b> vs the other.`
      : `Both methods work out about the same right now. You're on <b>${METHOD_LABEL[cmp.current]}</b>.`;
    tone = 'brand';
  } else {
    msg = `<b>${METHOD_LABEL[cmp.better]}</b> would cut your tax by about <b>${fmtGBP(cmp.taxSaving, { round: true })}/yr</b> vs your current <b>${METHOD_LABEL[cmp.current]}</b>.`;
    tone = 'warn';
  }
  card.append(el('div', { class: `callout callout--${tone}`, style: 'margin:12px 0 0', html: `${icon('info')}<div>${msg}</div>` }));

  // one-tap switch when the other method is better
  if (cmp.better !== cmp.current && !cmp.bothTradingAllowance && cmp.hasVehicleCosts && cmp.taxSaving >= 1) {
    const btn = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:10px' });
    btn.innerHTML = icon('check') + `<span>Switch to ${METHOD_LABEL[cmp.better]}</span>`;
    btn.onclick = () => { saveSettings({ expenseMethod: cmp.better }); toast(`Now using ${METHOD_LABEL[cmp.better]}`, 'ok'); bus.refresh(); };
    card.append(btn);
  }

  card.append(el('div', { class: 'tiny faint', style: 'margin-top:10px', text: `HMRC rule: once you claim simplified mileage for a ${(VEHICLE_LABELS[s.vehicle] || 'vehicle').toLowerCase()}, keep that method for it until you change vehicle.` }));
  wrap.append(card);
  return wrap;
}

function monthlyBuckets(yE, allX, ty, s) {
  const labels = MON.slice();
  const income = new Array(12).fill(0), deductions = new Array(12).fill(0), tax = new Array(12).fill(0);
  const idx = (iso) => { const d = parseISO(iso); return (d.getMonth() + 12 - 3) % 12; }; // Apr=0
  yE.forEach(e => { income[idx(e.date)] += (e.amount || 0) + (e.tips || 0); });
  const useMileage = s.expenseMethod === 'mileage';
  // Approximate monthly deduction = that month's mileage (at the first-band rate,
  // for the visual only) + that month's deductible expenses.
  if (useMileage) yE.forEach(e => { deductions[idx(e.date)] += (e.miles || 0) * 0.55; });
  allX.filter(x => x.date >= ty.start && x.date <= ty.end).forEach(x => {
    deductions[idx(x.date)] += deductibleForMonthly(x, s);
  });
  // approximate tax per month = income share × effective rate
  const totalIncome = income.reduce((a, b) => a + b, 0) || 1;
  const eff = computeEff(yE, allX, s);
  income.forEach((v, i) => { tax[i] = (v / totalIncome) * eff.totalSETax; });
  return { labels, income: income.map(r2), deductions: deductions.map(r2), tax: tax.map(r2) };
}
function deductibleForMonthly(x, s) {
  const cat = categoryById(x.category);
  const bizPct = (x.bizPct != null ? x.bizPct : cat.defaultBizPct) / 100;
  if (s.expenseMethod === 'mileage' && cat.vehicle) return 0;
  return (x.amount || 0) * bizPct;
}
function computeEff(yE, allX, s) { return computeTaxYear(yE, allX, s); }
function dowStats(yE) {
  const arr = Array.from({ length: 7 }, () => ({ income: 0, hours: 0 }));
  yE.forEach(e => {
    const jsDay = parseISO(e.date).getDay(); // 0=Sun
    const i = (jsDay + 6) % 7; // Mon=0
    arr[i].income += (e.amount || 0) + (e.tips || 0);
    arr[i].hours += (e.hours || 0);
  });
  return arr;
}
function r2(n) { return Math.round(n * 100) / 100; }
