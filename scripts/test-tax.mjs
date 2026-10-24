// Quick correctness checks for the tax engine (run with: node scripts/test-tax.mjs)
import { computeTaxYear, incomeTaxOn, class4On, mileageDeduction, studentLoanOn } from '../js/tax.js';
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


console.log('\n--- MTD quarterly summary ---');
const { quarterlySummary } = await import('../js/tax.js');
const sQ = { region:'ruk', vehicle:'car', expenseMethod:'mileage', taxYear:'2026/27', payeSalary:0,
  otherIncome:0, studentLoanPlan:'none', homeOfficeHoursPerMonth:0 };
const earnQ = [
  { id:'q1', date:'2026-05-01', platform:'amazonflex', amount:5000, tips:0, miles:6000 },  // Q1
  { id:'q2', date:'2026-08-01', platform:'amazonflex', amount:4000, tips:0, miles:6000 },  // Q2 crosses 10k
  { id:'q3', date:'2026-11-01', platform:'amazonflex', amount:3000, tips:0, miles:1000 },  // Q3 all at 25p
];
const q = quarterlySummary(earnQ, [], sQ);
eq('4 quarters', q.quarters.length, 4);
eq('Q1 income', q.quarters[0].income, 5000);
eq('Q1 mileage (6,000 @55p)', q.quarters[0].mileage, 6000*0.55);
// Q2: 4,000 miles finish the 10k band @55p, next 2,000 @25p
eq('Q2 mileage (rate steps mid-quarter)', q.quarters[1].mileage, 4000*0.55 + 2000*0.25);
eq('Q3 mileage (all @25p)', q.quarters[2].mileage, 1000*0.25);
eq('cumulative income to Q3', q.quarters[2].cumIncome, 12000);
eq('Q1 due date', q.quarters[0].due === '2026-08-07' ? 1 : 0, 1);
eq('Q4 due date', q.quarters[3].due === '2027-05-07' ? 1 : 0, 1);
// total mileage must equal the annual per-vehicle calculation
const ann = computeTaxYear(earnQ, [], sQ);
eq('quarters sum to the annual mileage claim',
   q.quarters.reduce((t,r)=>t+r.mileage,0), ann.mileageDed);


console.log('\n--- resilience: one bad record must not poison the year ---');
const sR = { region:'ruk', vehicle:'car', expenseMethod:'mileage', taxYear:'2026/27', payeSalary:0,
  otherIncome:0, studentLoanPlan:'none', homeOfficeHoursPerMonth:0 };
const good = { id:'g1', date:'2026-05-01', platform:'amazonflex', amount:100, tips:0, miles:50, hours:4 };
const clean = computeTaxYear([good], [], sR);
// the same year, with garbage records mixed in alongside the good one
const dirty = computeTaxYear([
  good,
  { id:'b1', date:'2026-05-02', platform:'amazonflex', amount:'abc', tips:0, miles:'x' },
  { id:'b2', date:'2026-05-03', platform:'amazonflex', amount:null, tips:undefined, miles:null },
  { id:'b3', date:'2026-05-04', platform:'amazonflex', amount:NaN, tips:NaN, miles:NaN },
], [{ id:'x1', date:'2026-05-01', category:'fuel', amount:'not a number', bizPct:'oops' }], sR);
eq('gross income survives bad rows', dirty.grossIncome, clean.grossIncome);
eq('miles survive bad rows', dirty.businessMiles, clean.businessMiles);
eq('mileage claim survives', dirty.mileageDed, clean.mileageDed);
eq('net profit survives', dirty.netProfit, clean.netProfit);
eq('every headline figure is finite',
   [dirty.grossIncome,dirty.businessMiles,dirty.mileageDed,dirty.netProfit,dirty.totalSETax,dirty.taxableProfit]
     .every(Number.isFinite) ? 1 : 0, 1);
// numeric strings are a legitimate shape from older backups and must still count
const stringy = computeTaxYear([{ id:'s1', date:'2026-05-01', platform:'amazonflex', amount:'100', tips:'0', miles:'50' }], [], sR);
eq('numeric strings are read, not discarded', stringy.grossIncome, 100);
eq('numeric string miles are read', stringy.businessMiles, 50);

// ============================================================
// Boundary exactness — every threshold AT the line, and either side.
// An off-by-one here is a wrong tax bill, so these are permanent.
// ============================================================
const bcfg = getConfig('2026/27');
const BS={region:'ruk',vehicle:'car',expenseMethod:'actual',taxYear:'2026/27',payeSalary:0,otherIncome:0,studentLoanPlan:'none',homeOfficeHoursPerMonth:0};
const bearn=(amount,date='2026-06-01',extra={})=>[{id:'e',date,platform:'amazonflex',amount,tips:0,miles:0,hours:0,...extra}];

console.log('\n--- Personal allowance edge ---');
eq('income tax at exactly £12,570', incomeTaxOn(12570,bcfg,'ruk'), 0);
eq('income tax at £12,570.01', incomeTaxOn(12570.01,bcfg,'ruk'), 0.01*0.20);
eq('income tax at £12,571', incomeTaxOn(12571,bcfg,'ruk'), 0.20);

console.log('\n--- Basic/higher boundary (£50,270) ---');
eq('tax at exactly £50,270', incomeTaxOn(50270,bcfg,'ruk'), 37700*0.20);
eq('tax at £50,271', incomeTaxOn(50271,bcfg,'ruk'), 37700*0.20+0.40);

console.log('\n--- Personal allowance taper ---');
eq('no taper at exactly £100,000', incomeTaxOn(100000,bcfg,'ruk'), 37700*0.20+(100000-50270)*0.40);
eq('taper removes £1 per £2 at £100,002', incomeTaxOn(100002,bcfg,'ruk'), incomeTaxOn(100000,bcfg,'ruk')+2*0.40+1*0.40);
eq('allowance gone at £125,140: nothing at 45% yet', incomeTaxOn(125140,bcfg,'ruk'), 37700*0.20+(125140-37700)*0.40);
eq('£150,000 matches the published figure', incomeTaxOn(150000,bcfg,'ruk'), 37700*0.20+(125140-37700)*0.40+(150000-125140)*0.45);

console.log('\n--- Class 4 NIC thresholds ---');
eq('class4 at exactly £12,570 (LPL)', class4On(12570,bcfg), 0);
eq('class4 at £12,570.01', class4On(12570.01,bcfg), 0.01*0.06);
eq('class4 at exactly £50,270 (UPL)', class4On(50270,bcfg), (50270-12570)*0.06);
eq('class4 at £50,271', class4On(50271,bcfg), (50270-12570)*0.06+1*0.02);

console.log('\n--- Class 2 Small Profits Threshold (£7,105) ---');
const exp2k=[{id:'x',date:'2026-06-01',category:'phone',amount:2000,bizPct:100}];
const justUnder=computeTaxYear(bearn(9104.99),exp2k,BS), atSpt=computeTaxYear(bearn(9105),exp2k,BS);
eq('(profit is exactly the SPT)', atSpt.netProfit, 7105);
eq('below SPT -> not credited', justUnder.class2.credited?1:0, 0);
eq('exactly at SPT -> credited', atSpt.class2.credited?1:0, 1);

console.log('\n--- Mileage band (10,000 miles) ---');
eq('exactly 10,000 miles', mileageDeduction(10000,'car',bcfg), 10000*0.55);
eq('10,001 miles', mileageDeduction(10001,'car',bcfg), 10000*0.55+1*0.25);
eq('9,999.9 miles', mileageDeduction(9999.9,'car',bcfg), 9999.9*0.55);

console.log('\n--- Trading allowance vs expenses at exactly £1,000 ---');
const ta=computeTaxYear(bearn(5000),[{id:'x',date:'2026-06-01',category:'phone',amount:1000,bizPct:100}],BS);
eq('£1,000 of expenses: profit is the same either way', ta.netProfit, 4000);

console.log('\n--- Tax-year boundaries (6 Apr – 5 Apr) ---');
const y=(d)=>computeTaxYear(bearn(1000,d),[],{...BS,taxYear:'2026/27'}).grossIncome;
eq('5 Apr 2026 is the PREVIOUS year', y('2026-04-05'), 0);
eq('6 Apr 2026 is the first day', y('2026-04-06'), 1000);
eq('5 Apr 2027 is the last day', y('2027-04-05'), 1000);
eq('6 Apr 2027 is the NEXT year', y('2027-04-06'), 0);
eq('29 Feb 2028 counts in 2027/28', computeTaxYear(bearn(1000,'2028-02-29'),[],{...BS,taxYear:'2027/28'}).grossIncome, 1000);

console.log('\n--- Student loan threshold (Plan 2, £29,385) ---');
eq('at exactly the threshold', studentLoanOn(29385,'plan2',bcfg), 0);
eq('one pound over', studentLoanOn(29386,'plan2',bcfg), 0.09);

console.log('\n--- Scottish band edges ---');
eq('scot at exactly £12,570', incomeTaxOn(12570,bcfg,'scotland'), 0);
eq('scot starter->basic at £16,537', incomeTaxOn(16537,bcfg,'scotland'), 3967*0.19);
eq('scot basic->intermediate at £29,526', incomeTaxOn(29526,bcfg,'scotland'), 3967*0.19+(16956-3967)*0.20);

console.log('\n--- Penny accuracy over a full year of small amounts ---');
const many=Array.from({length:1000},(_,i)=>({id:'m'+i,date:'2026-06-01',platform:'amazonflex',amount:12.34,tips:0.07,miles:0}));
const m=computeTaxYear(many,[],BS);
eq('1,000 × £12.34 + £0.07 sums exactly', m.grossIncome, 12410);
const pennies=Array.from({length:777},(_,i)=>({id:'p'+i,date:'2026-06-01',platform:'amazonflex',amount:0.01,tips:0,miles:0}));
eq('777 × 1p sums exactly', computeTaxYear(pennies,[],BS).grossIncome, 7.77);


// The census printed on the report: how much of the claim is a reading and
// how much the driver worked out. Only the live tracker sets milesSource, so
// a figure typed into the form afterwards must never be counted as measured —
// the whole point of the disclosure is that it cannot claim more than is true.
console.log('\n--- Mileage evidence census ---');
const EVS = { region: 'ruk', vehicle: 'car', expenseMethod: 'mileage', taxYear: '2026/27',
  payeSalary: 0, otherIncome: 0, studentLoanPlan: 'none', taxPotMode: 'auto', homeOfficeHoursPerMonth: 0 };
const mk = (id, miles, src) => ({ id, date: '2026-06-01', platform: 'amazonflex', amount: 70, tips: 0,
  hours: 4, miles, ...(src ? { milesSource: src } : {}) });
const evMixed = computeTaxYear([
  mk('1', 40, 'odometer'), mk('2', 30, 'gps'),
  mk('3', 50, 'manual'), mk('4', 20),              // typed in, and a legacy row with no source
  mk('5', 0, 'odometer'),                           // no miles: not part of a mileage claim
], [], EVS).evidence;
eq('shifts with miles claimed', evMixed.shifts, 4);
eq('of those, measured', evMixed.measuredShifts, 2);
eq('measured miles', evMixed.measuredMiles, 70);
eq('estimated miles', evMixed.estimatedMiles, 70);
eq('census covers every claimed mile', evMixed.measuredMiles + evMixed.estimatedMiles,
   computeTaxYear([mk('1', 40, 'odometer'), mk('2', 30, 'gps'), mk('3', 50, 'manual'), mk('4', 20)], [], EVS).businessMiles);

const evNone = computeTaxYear([mk('1', 40, 'manual'), mk('2', 30)], [], EVS).evidence;
eq('nothing measured: count', evNone.measuredShifts, 0);
eq('nothing measured: miles', evNone.measuredMiles, 0);
eq('nothing measured: all estimated', evNone.estimatedMiles, 70);

const evAll = computeTaxYear([mk('1', 40, 'odometer'), mk('2', 30, 'odometer')], [], EVS).evidence;
eq('all measured: count', evAll.measuredShifts, 2);
eq('all measured: nothing estimated', evAll.estimatedMiles, 0);

// Out-of-year shifts must not inflate the count on this year's report.
const evYear = computeTaxYear([
  mk('1', 40, 'odometer'),
  { id: '2', date: '2025-06-01', platform: 'amazonflex', amount: 70, tips: 0, hours: 4, miles: 99, milesSource: 'odometer' },
], [], EVS).evidence;
eq('last year is not counted', evYear.measuredShifts, 1);
eq('last year does not add miles', evYear.measuredMiles, 40);

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
