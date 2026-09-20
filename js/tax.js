// ============================================================
// tax.js — the calculation engine (UK sole trader, Self Assessment).
//
// Income tax is charged on TOTAL income (PAYE + self-employment +
// other). The self-employment share is isolated by the marginal
// method: tax(base + profit) − tax(base). Class 4 NIC is charged on
// self-employment profit against its own thresholds.
// ============================================================
import { round2, clamp, taxYearFromLabel, inRange, saDeadlines } from './util.js';
import { getConfig, categoryById, platformById } from './store.js';

// Income tax on a total income figure, using cumulative taxable-income bands.
export function incomeTaxOn(total, config, region = 'ruk') {
  total = Math.max(0, total);
  let pa = config.personalAllowance;
  if (total > config.paTaper) pa = Math.max(0, pa - (total - config.paTaper) / 2); // £1 lost per £2
  let taxable = Math.max(0, total - pa);
  const bands = config.bands[region] || config.bands.ruk;
  let tax = 0, prev = 0;
  for (const band of bands) {
    if (taxable <= prev) break;
    const slice = Math.min(taxable, band.upTo) - prev;
    if (slice > 0) tax += slice * band.rate;
    prev = band.upTo;
  }
  return tax;
}

// Class 4 National Insurance on self-employment profit.
export function class4On(profit, config) {
  const { lpl, upl, mainRate, upperRate } = config.class4;
  if (profit <= lpl) return 0;
  const main = (Math.min(profit, upl) - lpl) * mainRate;
  const upper = profit > upl ? (profit - upl) * upperRate : 0;
  return main + upper;
}

// Student loan repayment on total income (9%/6% above the plan threshold).
export function studentLoanOn(income, plan, config) {
  const sl = (config.studentLoans || {})[plan];
  if (!sl || !isFinite(sl.threshold)) return 0;
  return income > sl.threshold ? (income - sl.threshold) * sl.rate : 0;
}

// Mileage (simplified) deduction for a vehicle type.
export function mileageDeduction(miles, vehicle, config) {
  const m = config.mileage[vehicle] || config.mileage.car;
  const first = Math.min(miles, m.firstLimit);
  const rest = Math.max(0, miles - m.firstLimit);
  return first * m.firstRate + rest * m.thenRate;
}

function homeOfficeDeduction(hoursPerMonth, config) {
  if (!hoursPerMonth || hoursPerMonth < 25) return 0;
  const tiers = config.homeOffice || [];
  let rate = 0;
  for (const t of tiers) if (hoursPerMonth >= t.minHours) rate = t.rate;
  return rate * 12; // annual
}

// Marginal rates on the next £1 of self-employment profit.
export function marginalRates(base, profit, config, region, plan) {
  const total = base + profit;
  const itMarg = (incomeTaxOn(total + 100, config, region) - incomeTaxOn(total, config, region)) / 100;
  const { lpl, upl, mainRate, upperRate } = config.class4;
  let c4 = 0;
  if (profit > upl) c4 = upperRate; else if (profit > lpl) c4 = mainRate;
  const sl = (config.studentLoans || {})[plan];
  const slMarg = (sl && isFinite(sl.threshold) && total > sl.threshold) ? sl.rate : 0;
  return { incomeTax: itMarg, class4: c4, studentLoan: slMarg, combined: itMarg + c4 + slMarg };
}

// Sum raw income/expense figures for a date range (used by dashboard/insights).
export function summariseRange(allEarnings, allExpenses, start, end, settings) {
  const config = getConfig(settings.taxYear);
  const E = allEarnings.filter(e => inRange(e.date, start, end));
  const X = allExpenses.filter(x => inRange(x.date, start, end));
  const income = round2(E.reduce((s, e) => s + (e.amount || 0) + (e.tips || 0), 0));
  const tips = round2(E.reduce((s, e) => s + (e.tips || 0), 0));
  const miles = round2(E.reduce((s, e) => s + (e.miles || 0), 0));
  const hours = round2(E.reduce((s, e) => s + (e.hours || 0), 0));
  const deliveries = E.reduce((s, e) => s + (e.deliveries || 0), 0);
  const expensesPaid = round2(X.reduce((s, x) => s + (x.amount || 0), 0));
  const deductible = round2(X.reduce((s, x) => s + deductibleAmount(x, settings), 0));
  const mileageDed = round2(mileageDeduction(miles, settings.vehicle, config));
  return { income, tips, miles, hours, deliveries, expensesPaid, deductible, mileageDed, count: E.length, expenseCount: X.length };
}

// The deductible portion of one expense, respecting the vehicle-cost rule
// under the simplified mileage method.
export function deductibleAmount(x, settings) {
  const cat = categoryById(x.category);
  const bizPct = (x.bizPct != null ? x.bizPct : cat.defaultBizPct) / 100;
  if (settings.expenseMethod === 'mileage' && cat.vehicle) return 0; // covered by the mileage rate
  return (x.amount || 0) * bizPct;
}

// Full tax-year computation.
export function computeTaxYear(allEarnings, allExpenses, settings, yearLabel = settings.taxYear) {
  const config = getConfig(yearLabel);
  const ty = taxYearFromLabel(yearLabel);
  const E = allEarnings.filter(e => inRange(e.date, ty.start, ty.end));
  const X = allExpenses.filter(x => inRange(x.date, ty.start, ty.end));

  // ---- income ----
  const grossIncome = round2(E.reduce((s, e) => s + (e.amount || 0) + (e.tips || 0), 0));
  const tips = round2(E.reduce((s, e) => s + (e.tips || 0), 0));
  const businessMiles = round2(E.reduce((s, e) => s + (e.miles || 0), 0));
  const totalHours = round2(E.reduce((s, e) => s + (e.hours || 0), 0));
  const totalDeliveries = E.reduce((s, e) => s + (e.deliveries || 0), 0);

  const byPlatformMap = new Map();
  for (const e of E) {
    const amt = (e.amount || 0) + (e.tips || 0);
    byPlatformMap.set(e.platform, (byPlatformMap.get(e.platform) || 0) + amt);
  }
  const byPlatform = Array.from(byPlatformMap.entries())
    .map(([id, amount]) => ({ id, amount: round2(amount), ...platformById(id) }))
    .sort((a, b) => b.amount - a.amount);

  // ---- expenses / deductions ----
  const method = settings.expenseMethod;
  const expensesPaidTotal = round2(X.reduce((s, x) => s + (x.amount || 0), 0));
  const mileageDed = method === 'mileage' ? round2(mileageDeduction(businessMiles, settings.vehicle, config)) : 0;
  const homeDed = round2(homeOfficeDeduction(settings.homeOfficeHoursPerMonth, config));
  let otherDeductible = 0, vehicleTracked = 0;
  for (const x of X) {
    const cat = categoryById(x.category);
    const ded = deductibleAmount(x, settings);
    otherDeductible += ded;
    if (method === 'mileage' && cat.vehicle) vehicleTracked += (x.amount || 0);
  }
  otherDeductible = round2(otherDeductible);
  vehicleTracked = round2(vehicleTracked);

  const rawDeductions = round2(mileageDed + homeDed + otherDeductible);
  // Trading allowance: use £1,000 instead of expenses if it's more generous.
  const tradingAllowance = config.tradingAllowance;
  const usedTradingAllowance = grossIncome > 0 && tradingAllowance > rawDeductions;
  const effectiveDeduction = usedTradingAllowance ? Math.min(tradingAllowance, grossIncome) : rawDeductions;
  const netProfit = round2(Math.max(usedTradingAllowance ? 0 : -Infinity, grossIncome - effectiveDeduction));

  // ---- tax ----
  const region = settings.region;
  const base = round2((settings.payeSalary || 0) + (settings.otherIncome || 0));
  const totalIncome = round2(base + Math.max(0, netProfit));

  const incomeTaxBase = round2(incomeTaxOn(base, config, region));
  const incomeTaxTotal = round2(incomeTaxOn(totalIncome, config, region));
  const incomeTaxSE = round2(Math.max(0, incomeTaxTotal - incomeTaxBase));

  const class4 = round2(class4On(Math.max(0, netProfit), config));
  const class2Credited = netProfit >= config.class2.spt;
  const class2 = {
    credited: class2Credited,
    due: 0, // auto-credited above SPT; voluntary below (not auto-charged)
    voluntaryWeekly: config.class2.weekly,
    status: class2Credited ? 'Auto-credited (nothing to pay)' : 'Below threshold — voluntary only',
    spt: config.class2.spt,
  };

  const slBase = round2(studentLoanOn(base, settings.studentLoanPlan, config));
  const slTotal = round2(studentLoanOn(totalIncome, settings.studentLoanPlan, config));
  const studentLoanSE = round2(Math.max(0, slTotal - slBase));

  const totalSETax = round2(incomeTaxSE + class4 + studentLoanSE);
  const netTakeHome = round2(netProfit - totalSETax);
  const effectiveSERate = netProfit > 0 ? (totalSETax / netProfit) * 100 : 0;

  const marginal = marginalRates(base, Math.max(0, netProfit), config, region, settings.studentLoanPlan);

  // ---- payments on account (estimate) ----
  const poaBase = round2(incomeTaxSE + class4); // POA excludes Class 2 & student loan
  const taxAtSource = round2((settings.payeTaxPaid || 0) > 0 ? settings.payeTaxPaid : incomeTaxBase);
  const totalTaxForTest = round2(taxAtSource + poaBase);
  const atSourceRatio = totalTaxForTest > 0 ? taxAtSource / totalTaxForTest : 1;
  const poaApplies = poaBase > 1000 && atSourceRatio < 0.80;
  const poa = {
    applies: poaApplies,
    base: poaBase,
    each: round2(poaBase / 2),
    atSourceRatio: round2(atSourceRatio * 100),
    note: poaApplies
      ? 'Your SA bill exceeds £1,000 and under 80% is collected at source, so HMRC will ask for two advance payments.'
      : (poaBase <= 1000 ? 'SA bill is £1,000 or less — no payments on account.' : 'Over 80% of your tax is collected via PAYE — likely no payments on account.'),
  };

  const deadlines = saDeadlines(ty.startYear);

  return {
    taxYear: ty.label, ty, region, config,
    grossIncome, tips, businessMiles, totalHours, totalDeliveries, byPlatform,
    method, expensesPaidTotal, mileageDed, homeDed, otherDeductible, vehicleTracked,
    rawDeductions, tradingAllowance, usedTradingAllowance, effectiveDeduction, netProfit,
    base, payeSalary: settings.payeSalary || 0, otherIncome: settings.otherIncome || 0, totalIncome,
    personalAllowance: config.personalAllowance,
    incomeTaxBase, incomeTaxTotal, incomeTaxSE,
    class4, class2, studentLoanSE,
    totalSETax, netTakeHome, effectiveSERate, marginal,
    poa, deadlines,
    vat: { threshold: config.vatThreshold, ratio: config.vatThreshold ? grossIncome / config.vatThreshold : 0, near: grossIncome > config.vatThreshold * 0.85 },
    counts: { shifts: E.length, expenseEntries: X.length },
  };
}

// The tax to reserve right now, given the pot mode.
export function taxReserve(summary, settings) {
  if (settings.taxPotMode === 'manual') {
    return round2(Math.max(0, summary.netProfit) * (settings.taxPotManualPct || 0) / 100);
  }
  return summary.totalSETax; // live, exact estimate
}
