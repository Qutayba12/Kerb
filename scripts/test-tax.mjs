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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
