// Quick correctness checks for the tax engine (run with: node scripts/test-tax.mjs)
import { computeTaxYear, incomeTaxOn, class4On } from '../js/tax.js';
import { getConfig } from '../js/store.js';

let pass = 0, fail = 0;
function eq(name, got, exp, tol = 0.01) {
  const ok = Math.abs(got - exp) <= tol;
  console.log(`${ok ? '✓' : '✗'} ${name}: got ${round(got)}  expected ${round(exp)}`);
  ok ? pass++ : fail++;
}
const round = n => Math.round(n * 100) / 100;

const cfg = getConfig('2026/27');
console.log('--- 2026/27 config sanity ---');
eq('PA', cfg.personalAllowance, 12570);
eq('mileage first rate (car)', cfg.mileage.car.firstRate, 0.55);
eq('class4 main rate', cfg.class4.mainRate, 0.06);

console.log('\n--- incomeTaxOn (ruk) ---');
eq('tax on 20000', incomeTaxOn(20000, cfg, 'ruk'), (20000 - 12570) * 0.20);
eq('tax on 60000', incomeTaxOn(60000, cfg, 'ruk'), 37700 * 0.20 + (60000 - 50270) * 0.40);
eq('tax on 12000 (under PA)', incomeTaxOn(12000, cfg, 'ruk'), 0);

console.log('\n--- class4On ---');
eq('class4 on 8700 (under LPL)', class4On(8700, cfg), 0);
eq('class4 on 33250', class4On(33250, cfg), (33250 - 12570) * 0.06);
eq('class4 on 60000', class4On(60000, cfg), (50270 - 12570) * 0.06 + (60000 - 50270) * 0.02);

console.log('\n--- Scenario A: PAYE 20k + delivery 15k, 12k miles, phone 600@50% ---');
const settingsA = { region: 'ruk', vehicle: 'car', expenseMethod: 'mileage', taxYear: '2026/27',
  payeSalary: 20000, otherIncome: 0, studentLoanPlan: 'none', taxPotMode: 'auto', homeOfficeHoursPerMonth: 0 };
const earnA = [{ id: '1', date: '2026-05-01', platform: 'amazonflex', amount: 15000, tips: 0, miles: 12000, hours: 400 }];
const expA = [{ id: 'e1', date: '2026-05-02', category: 'phone', amount: 600, bizPct: 50 }];
const a = computeTaxYear(earnA, expA, settingsA);
eq('A mileage deduction', a.mileageDed, 10000 * 0.55 + 2000 * 0.25); // 6000
eq('A other deductible', a.otherDeductible, 300);
eq('A net profit', a.netProfit, 15000 - 6300); // 8700
eq('A income tax (SE marginal)', a.incomeTaxSE, 8700 * 0.20); // 1740
eq('A class4', a.class4, 0); // profit under LPL
eq('A total SE tax', a.totalSETax, 1740);
eq('A net take-home', a.netTakeHome, 8700 - 1740); // 6960
eq('A effective rate %', a.effectiveSERate, 20);

console.log('\n--- Scenario B: no PAYE, delivery 40k, 15k miles ---');
const settingsB = { ...settingsA, payeSalary: 0 };
const earnB = [{ id: '2', date: '2026-06-01', platform: 'ubereats', amount: 40000, tips: 0, miles: 15000, hours: 1500 }];
const b = computeTaxYear(earnB, [], settingsB);
eq('B mileage deduction', b.mileageDed, 6750);
eq('B net profit', b.netProfit, 33250);
eq('B income tax', b.incomeTaxSE, (33250 - 12570) * 0.20); // 4136
eq('B class4', b.class4, (33250 - 12570) * 0.06); // 1240.8
eq('B total SE tax', b.totalSETax, 4136 + 1240.8);
eq('B net take-home', b.netTakeHome, 33250 - 5376.8);

console.log('\n--- Scenario C: trading allowance beats tiny expenses ---');
const earnC = [{ id: '3', date: '2026-07-01', platform: 'ubereats', amount: 900, tips: 50, miles: 100 }];
const c = computeTaxYear(earnC, [], settingsB);
// gross 950, mileage 100*0.55=55 -> rawDeductions 55 < 1000 -> use trading allowance
eq('C used trading allowance', c.usedTradingAllowance ? 1 : 0, 1);
eq('C net profit', c.netProfit, 0); // min(1000, 950) => profit 0

console.log('\n--- Scenario D: high earner POA ---');
const settingsD = { ...settingsA, payeSalary: 0 };
const earnD = [{ id: '4', date: '2026-06-01', platform: 'amazonflex', amount: 55000, miles: 20000 }];
const d = computeTaxYear(earnD, [], settingsD);
console.log('   D net profit', round(d.netProfit), '| SE tax', round(d.totalSETax), '| POA applies', d.poa.applies, '| each', round(d.poa.each));
eq('D POA applies', d.poa.applies ? 1 : 0, 1);


// ============================================================
// Scotland bands, per-vehicle mileage and loss carry-forward
// ============================================================
const scot26 = getConfig('2026/27');
const scot25 = getConfig('2025/26');
console.log('\n--- Scottish bands 2026/27 (cumulative taxable thresholds) ---');
eq('starter ends', scot26.bands.scotland[0].upTo, 3967);
eq('basic ends', scot26.bands.scotland[1].upTo, 16956);
eq('intermediate ends', scot26.bands.scotland[2].upTo, 31092);
eq('higher rate', scot26.bands.scotland[3].rate, 0.42);
eq('top rate', scot26.bands.scotland[5].rate, 0.48);
eq('2025/26 differs from 2026/27 (starter)', scot25.bands.scotland[0].upTo, 2827);
// £30,000 salary in Scotland: 19% on first 3,967, 20% to 16,956, 21% on the rest
eq('scot tax on 30000', incomeTaxOn(30000, scot26, 'scotland'),
  3967 * 0.19 + (16956 - 3967) * 0.20 + ((30000 - 12570) - 16956) * 0.21);

console.log('\n--- student loan thresholds are per-year ---');
eq('plan2 2026/27', scot26.studentLoans.plan2.threshold, 29385);
eq('plan2 2025/26', scot25.studentLoans.plan2.threshold, 28470);
eq('plan4 2026/27', scot26.studentLoans.plan4.threshold, 33795);

console.log('\n--- per-vehicle mileage: two cars get two 10k bands ---');
const sV = { region: 'ruk', expenseMethod: 'mileage', taxYear: '2026/27', payeSalary: 0, otherIncome: 0,
  studentLoanPlan: 'none', homeOfficeHoursPerMonth: 0,
  vehicles: [{ id: 'c1', label: 'Car 1', type: 'car' }, { id: 'c2', label: 'Car 2', type: 'car' }] };
const earnV = [
  { id: 'v1', date: '2026-06-01', platform: 'amazonflex', amount: 20000, tips: 0, miles: 10000, vehicleId: 'c1' },
  { id: 'v2', date: '2026-06-02', platform: 'amazonflex', amount: 0, tips: 0, miles: 10000, vehicleId: 'c2' },
];
const v = computeTaxYear(earnV, [], sV);
// Each vehicle: 10,000 miles @ 55p = £5,500 → £11,000 total (NOT 10k@55p + 10k@25p)
eq('two vehicles × 10k miles', v.mileageDed, 11000);
eq('mileage rows', v.mileageRows.length, 2);
// Same 20,000 miles on ONE vehicle is capped: 10k@55p + 10k@25p = £8,000
const sOne = { ...sV, vehicles: [{ id: 'c1', label: 'Car 1', type: 'car' }] };
const one = computeTaxYear(earnV, [], sOne);
eq('one vehicle × 20k miles', one.mileageDed, 10000 * 0.55 + 10000 * 0.25);

console.log('\n--- loss carry-forward ---');
const sL = { region: 'ruk', vehicle: 'car', expenseMethod: 'actual', taxYear: '2026/27', payeSalary: 0,
  otherIncome: 0, studentLoanPlan: 'none', homeOfficeHoursPerMonth: 0, lossRelief: true };
// 2025/26: £2,000 income, £7,000 costs -> £5,000 loss.
// 2026/27: £30,000 income, £2,000 costs -> £28,000 profit (expenses beat the
// £1,000 trading allowance, so the allowance stays out of the way here).
const earnL = [
  { id: 'l1', date: '2025-06-01', platform: 'amazonflex', amount: 2000, tips: 0, miles: 0 },
  { id: 'l2', date: '2026-06-01', platform: 'amazonflex', amount: 30000, tips: 0, miles: 0 },
];
const expL = [
  { id: 'x1', date: '2025-06-02', category: 'repairs', amount: 7000, bizPct: 100 },
  { id: 'x2', date: '2026-06-02', category: 'repairs', amount: 2000, bizPct: 100 },
];
const L = computeTaxYear(earnL, expL, sL);
eq('net profit before loss relief', L.netProfit, 28000);
eq('loss brought forward', L.lossBroughtForward, 5000);
eq('loss used this year', L.lossUsed, 5000);
eq('taxable profit after loss', L.taxableProfit, 23000);
eq('loss carried forward', L.lossCarriedForward, 0);
eq('class4 on taxable profit', L.class4, (23000 - 12570) * 0.06);
eq('income tax on taxable profit', L.incomeTaxSE, (23000 - 12570) * 0.20);
// the loss year itself reports the loss and nothing taxable
const Lyr = computeTaxYear(earnL, expL, { ...sL, taxYear: '2025/26' });
eq('loss year: loss recorded', Lyr.lossThisYear, 5000);
eq('loss year: taxable profit 0', Lyr.taxableProfit, 0);
eq('loss year: no tax', Lyr.totalSETax, 0);
// relief off -> the pool is ignored and the whole profit is taxed
const Loff = computeTaxYear(earnL, expL, { ...sL, lossRelief: false });
eq('relief off: no loss used', Loff.lossUsed, 0);
eq('relief off: full profit taxed', Loff.taxableProfit, 28000);
// a loss bigger than the later profit carries the remainder onward
// keep the 2026/27 expense so the trading allowance stays out of the way
const bigLoss = [
  { id: 'b1', date: '2025-06-02', category: 'repairs', amount: 40000, bizPct: 100 },
  { id: 'x2', date: '2026-06-02', category: 'repairs', amount: 2000, bizPct: 100 },
];
const Lbig = computeTaxYear(earnL, bigLoss, sL);
eq('big loss: all profit covered', Lbig.taxableProfit, 0);
eq('big loss: remainder carried on', Lbig.lossCarriedForward, 38000 - 28000);

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
