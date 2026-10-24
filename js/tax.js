// ============================================================
// tax.js — the calculation engine (UK sole trader, Self Assessment).
//
// Income tax is charged on TOTAL income (PAYE + self-employment +
// other). The self-employment share is isolated by the marginal
// method: tax(base + profit) − tax(base). Class 4 NIC is charged on
// self-employment profit against its own thresholds.
// ============================================================
import { round2, clamp, taxYearFromLabel, taxYearFromStart, taxYearOf, inRange, todayISO, saDeadlines } from './util.js';
import { getConfig, categoryById, platformById } from './store.js';

// Read a record field as a number. Records can predate validation, come from a
// hand-edited backup, or carry an odd value from a scan; a single bad field
// must never make a whole year's totals NaN (which round2 would then silently
// turn into 0). Anything unusable reads as 0.
function num(v) {
  const x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(x) ? x : 0;
}

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

// Simplified mileage applied PER VEHICLE. HMRC gives every vehicle its own
// first-10,000-mile band, so two cars mean two 10,000-mile allowances. Entries
// without a vehicleId fall back to the driver's default vehicle.
// Resolve the driver's vehicles from the SETTINGS PASSED IN (never global
// state), so the engine stays pure and method comparisons stay honest.
function vehiclesFrom(settings) {
  const list = Array.isArray(settings.vehicles) ? settings.vehicles.filter(v => v && v.id) : [];
  if (list.length) return list.map(v => ({ id: v.id, label: v.label || 'Vehicle', type: v.type || 'car' }));
  return [{ id: 'default', label: 'Vehicle', type: settings.vehicle || 'car' }];
}

export function mileageByVehicle(E, settings, config) {
  const vehicles = vehiclesFrom(settings);
  const ids = new Set(vehicles.map(v => v.id));
  const miles = new Map();
  for (const e of E) {
    const m = num(e.miles);
    if (!m) continue;
    const id = (e.vehicleId && ids.has(e.vehicleId)) ? e.vehicleId : vehicles[0].id;
    miles.set(id, (miles.get(id) || 0) + m);
  }
  let total = 0;
  const rows = [];
  for (const [id, m] of miles) {
    const v = vehicles.find(x => x.id === id) || vehicles[0];
    const amount = round2(mileageDeduction(m, v.type, config));
    total += amount;
    rows.push({ id, label: v.label, type: v.type, miles: round2(m), amount });
  }
  return { total: round2(total), rows: rows.sort((a, b) => b.amount - a.amount) };
}

// The raw trading result (income − deductions) for one tax year; may be
// NEGATIVE (a loss). Used by the loss carry-forward walk, so it deliberately
// computes no tax and never calls computeTaxYear (no recursion).
function rawTradingResult(allEarnings, allExpenses, settings, yearLabel) {
  const config = getConfig(yearLabel);
  const ty = taxYearFromLabel(yearLabel);
  const E = allEarnings.filter(e => inRange(e.date, ty.start, ty.end));
  const X = allExpenses.filter(x => inRange(x.date, ty.start, ty.end));
  const gross = round2(E.reduce((t, e) => t + num(e.amount) + num(e.tips), 0));
  const method = settings.expenseMethod;
  const mileageDed = method === 'mileage' ? mileageByVehicle(E, settings, config).total : 0;
  const homeDed = round2(homeOfficeDeduction(settings.homeOfficeHoursPerMonth, config));
  let other = 0;
  for (const x of X) other += deductibleAmount(x, settings);
  const raw = round2(mileageDed + homeDed + round2(other));
  const ta = config.tradingAllowance;
  const usedTA = gross > 0 && ta > raw;
  const eff = usedTA ? Math.min(ta, gross) : raw;
  return round2(gross - eff);
}

// Unused trading losses carried INTO `yearLabel` from earlier years. Losses are
// set against the first available later profits of the same trade, so we walk
// the years in order, adding losses and consuming them against profits.
function lossBroughtForward(allEarnings, allExpenses, settings, yearLabel) {
  if (settings.lossRelief === false) return 0;
  const ty = taxYearFromLabel(yearLabel);
  const years = new Set();
  for (const r of [...allEarnings, ...allExpenses]) {
    if (!r || !r.date) continue;
    const y = taxYearOf(r.date);
    if (y.startYear < ty.startYear) years.add(y.startYear);
  }
  let pool = 0;
  for (const sy of Array.from(years).sort((a, b) => a - b)) {
    const result = rawTradingResult(allEarnings, allExpenses, settings, taxYearFromStart(sy).label);
    if (result < 0) pool += -result;
    else pool -= Math.min(pool, result);
  }
  return round2(pool);
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
  const income = round2(E.reduce((s, e) => s + num(e.amount) + num(e.tips), 0));
  const tips = round2(E.reduce((s, e) => s + num(e.tips), 0));
  const miles = round2(E.reduce((s, e) => s + num(e.miles), 0));
  const hours = round2(E.reduce((s, e) => s + num(e.hours), 0));
  const deliveries = E.reduce((s, e) => s + num(e.deliveries), 0);
  const expensesPaid = round2(X.reduce((s, x) => s + num(x.amount), 0));
  const deductible = round2(X.reduce((s, x) => s + deductibleAmount(x, settings), 0));
  const mileageDed = round2(mileageDeduction(miles, settings.vehicle, config));
  return { income, tips, miles, hours, deliveries, expensesPaid, deductible, mileageDed, count: E.length, expenseCount: X.length };
}

// The deductible portion of one expense, respecting the vehicle-cost rule
// under the simplified mileage method.
export function deductibleAmount(x, settings) {
  const cat = categoryById(x.category);
  const bizPct = num(x.bizPct != null ? x.bizPct : cat.defaultBizPct) / 100;
  if (settings.expenseMethod === 'mileage' && cat.vehicle) return 0; // covered by the mileage rate
  return num(x.amount) * bizPct;
}

// Full tax-year computation. Measured at ~1.7ms for 2,100 records, so it is
// deliberately NOT cached: a cache key built from the records costs as much as
// the calculation, and any key that misses a field would serve stale tax
// figures — a correctness risk this app should never take for no gain.
export function computeTaxYear(allEarnings, allExpenses, settings, yearLabel = settings.taxYear) {
  const config = getConfig(yearLabel);
  const ty = taxYearFromLabel(yearLabel);
  const E = allEarnings.filter(e => inRange(e.date, ty.start, ty.end));
  const X = allExpenses.filter(x => inRange(x.date, ty.start, ty.end));

  // ---- income ----
  const grossIncome = round2(E.reduce((s, e) => s + num(e.amount) + num(e.tips), 0));
  const tips = round2(E.reduce((s, e) => s + num(e.tips), 0));
  const businessMiles = round2(E.reduce((s, e) => s + num(e.miles), 0));
  const totalHours = round2(E.reduce((s, e) => s + num(e.hours), 0));
  const totalDeliveries = E.reduce((s, e) => s + num(e.deliveries), 0);

  const byPlatformMap = new Map();
  for (const e of E) {
    const amt = num(e.amount) + num(e.tips);
    byPlatformMap.set(e.platform, (byPlatformMap.get(e.platform) || 0) + amt);
  }
  const byPlatform = Array.from(byPlatformMap.entries())
    .map(([id, amount]) => ({ id, amount: round2(amount), ...platformById(id) }))
    .sort((a, b) => b.amount - a.amount);

  // ---- expenses / deductions ----
  const method = settings.expenseMethod;
  const expensesPaidTotal = round2(X.reduce((s, x) => s + num(x.amount), 0));
  const mileageSplit = mileageByVehicle(E, settings, config);
  const mileageDed = method === 'mileage' ? mileageSplit.total : 0;
  // How much of the claim is travel between home and a pickup station.
  // Whether that leg is deductible turns on where HMRC considers the base of
  // operations to be — a question of fact, not a fixed rule — so the figure
  // is surfaced rather than decided here. Only shifts logged against a
  // station carry the split; the rest are unknown and counted as such.
  const baseLegMiles = round2(E.reduce((t, e) => t + (Number(e.milesBase) > 0 ? num(e.milesBase) : 0), 0));
  const splitKnownMiles = round2(E.reduce((t, e) => t + (Number(e.milesBase) > 0 ? num(e.miles) : 0), 0));
  const baseLeg = {
    miles: baseLegMiles,
    unsplitMiles: round2(businessMiles - splitKnownMiles),
    // Valued at the marginal rate the claim actually sits at, so removing it
    // shows the real change rather than a headline rate.
    amount: method === 'mileage' && businessMiles > 0
      ? round2(mileageDed - mileageByVehicle(E.map(e => (Number(e.milesBase) > 0
        ? { ...e, miles: round2(num(e.miles) - num(e.milesBase)) } : e)), settings, config).total)
      : 0,
  };
  // How much of the mileage claim is a reading and how much is a figure the
  // driver worked out. HMRC accepts a reasonable estimate, so this decides
  // nothing — but it is the first thing asked after "how did you arrive at
  // this", and a count taken from the records answers it better than prose
  // can. Only the live tracker sets milesSource, so anything typed into the
  // form afterwards is an estimate however carefully it was worked out.
  const withMiles = E.filter(e => num(e.miles) > 0);
  const measuredShifts = withMiles.filter(e => e.milesSource === 'odometer' || e.milesSource === 'gps');
  const evidence = {
    shifts: withMiles.length,
    measuredShifts: measuredShifts.length,
    measuredMiles: round2(measuredShifts.reduce((t, e) => t + num(e.miles), 0)),
    estimatedMiles: round2(withMiles.reduce((t, e) => t + num(e.miles), 0)
      - measuredShifts.reduce((t, e) => t + num(e.miles), 0)),
  };

  const homeDed = round2(homeOfficeDeduction(settings.homeOfficeHoursPerMonth, config));
  let otherDeductible = 0, vehicleTracked = 0;
  for (const x of X) {
    const cat = categoryById(x.category);
    const ded = deductibleAmount(x, settings);
    otherDeductible += ded;
    if (method === 'mileage' && cat.vehicle) vehicleTracked += num(x.amount);
  }
  otherDeductible = round2(otherDeductible);
  vehicleTracked = round2(vehicleTracked);

  const rawDeductions = round2(mileageDed + homeDed + otherDeductible);
  // Trading allowance: use £1,000 instead of expenses if it's more generous.
  const tradingAllowance = config.tradingAllowance;
  const usedTradingAllowance = grossIncome > 0 && tradingAllowance > rawDeductions;
  const effectiveDeduction = usedTradingAllowance ? Math.min(tradingAllowance, grossIncome) : rawDeductions;
  const netProfit = round2(Math.max(usedTradingAllowance ? 0 : -Infinity, grossIncome - effectiveDeduction));

  // ---- losses carried forward ----
  // A trading loss is set against the first available profits of the same
  // trade in later years, reducing both Income Tax and Class 4 NIC.
  const lossThisYear = netProfit < 0 ? round2(-netProfit) : 0;
  const profitThisYear = round2(Math.max(0, netProfit));
  const lossBF = lossBroughtForward(allEarnings, allExpenses, settings, yearLabel);
  const lossUsed = round2(Math.min(lossBF, profitThisYear));
  const taxableProfit = round2(profitThisYear - lossUsed);
  const lossCF = round2(lossBF - lossUsed + lossThisYear);

  // ---- tax ----
  const region = settings.region;
  const base = round2((settings.payeSalary || 0) + (settings.otherIncome || 0));
  const totalIncome = round2(base + taxableProfit);

  const incomeTaxBase = round2(incomeTaxOn(base, config, region));
  const incomeTaxTotal = round2(incomeTaxOn(totalIncome, config, region));
  const incomeTaxSE = round2(Math.max(0, incomeTaxTotal - incomeTaxBase));

  const class4 = round2(class4On(taxableProfit, config));
  const class2Credited = taxableProfit >= config.class2.spt;
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

  const marginal = marginalRates(base, taxableProfit, config, region, settings.studentLoanPlan);

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
    taxableProfit, lossThisYear, lossBroughtForward: lossBF, lossUsed, lossCarriedForward: lossCF,
    mileageRows: mileageSplit.rows, baseLeg, evidence,
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

// ---------------------------------------------------------------
// Making Tax Digital: the four standard quarterly update periods.
// MTD for Income Tax reports income and expenses for each quarter
// (cumulatively from 6 April), with the update due on the 7th of
// the month after the quarter ends. Kerb cannot submit these, but
// it produces exactly the figures each update needs.
// ---------------------------------------------------------------
export function quarterlySummary(allEarnings, allExpenses, settings, yearLabel = settings.taxYear) {
  const config = getConfig(yearLabel);
  const ty = taxYearFromLabel(yearLabel);
  const Y = ty.startYear;
  const periods = [
    { n: 1, start: `${Y}-04-06`, end: `${Y}-07-05`, due: `${Y}-08-07` },
    { n: 2, start: `${Y}-07-06`, end: `${Y}-10-05`, due: `${Y}-11-07` },
    { n: 3, start: `${Y}-10-06`, end: `${Y + 1}-01-05`, due: `${Y + 1}-02-07` },
    { n: 4, start: `${Y + 1}-01-06`, end: `${Y + 1}-04-05`, due: `${Y + 1}-05-07` },
  ];
  const E = allEarnings.filter(e => inRange(e.date, ty.start, ty.end)).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const X = allExpenses.filter(x => inRange(x.date, ty.start, ty.end));
  const useMileage = settings.expenseMethod === 'mileage';

  // Work out each shift's mileage claim in DATE ORDER, tracking every vehicle's
  // running total, so the rate steps from 55p to 25p at the right point in the
  // year rather than being averaged across quarters.
  const vehicles = vehiclesFrom(settings);
  const ids = new Set(vehicles.map(v => v.id));
  const running = new Map();
  const claimFor = new Map();
  if (useMileage) {
    for (const e of E) {
      const m = num(e.miles);
      if (!m) continue;
      const id = (e.vehicleId && ids.has(e.vehicleId)) ? e.vehicleId : vehicles[0].id;
      const v = vehicles.find(x => x.id === id) || vehicles[0];
      const before = running.get(id) || 0;
      const after = before + m;
      claimFor.set(e, round2(mileageDeduction(after, v.type, config) - mileageDeduction(before, v.type, config)));
      running.set(id, after);
    }
  }

  const today = todayISO();
  const rows = periods.map(q => {
    const qe = E.filter(e => inRange(e.date, q.start, q.end));
    const qx = X.filter(x => inRange(x.date, q.start, q.end));
    const income = round2(qe.reduce((t, e) => t + num(e.amount) + num(e.tips), 0));
    const miles = round2(qe.reduce((t, e) => t + num(e.miles), 0));
    const mileage = useMileage ? round2(qe.reduce((t, e) => t + (claimFor.get(e) || 0), 0)) : 0;
    const other = round2(qx.reduce((t, x) => t + deductibleAmount(x, settings), 0));
    const expenses = round2(mileage + other);
    const status = today > q.end ? 'done' : (today >= q.start ? 'current' : 'future');
    return { ...q, status, income, miles, mileage, otherExpenses: other, expenses,
      profit: round2(income - expenses), entries: qe.length + qx.length };
  });

  // MTD updates are year-to-date, so carry the running totals too.
  let ci = 0, cx = 0;
  for (const r of rows) {
    ci = round2(ci + r.income); cx = round2(cx + r.expenses);
    r.cumIncome = ci; r.cumExpenses = cx; r.cumProfit = round2(ci - cx);
  }
  const totalIncome = ci;
  return {
    yearLabel: ty.label, quarters: rows, totalIncome, totalExpenses: cx,
    current: rows.find(r => r.status === 'current') || null,
    nextDue: rows.find(r => r.status !== 'done') || null,
  };
}

// Compare the two expense methods (simplified mileage vs actual costs) and say
// which leaves a lower tax bill. Both are run through the full engine so the
// trading allowance, PAYE interaction and NIC are all handled correctly.
export function compareExpenseMethods(allEarnings, allExpenses, settings, yearLabel = settings.taxYear) {
  const config = getConfig(yearLabel);
  const mileageSum = computeTaxYear(allEarnings, allExpenses, { ...settings, expenseMethod: 'mileage' }, yearLabel);
  const actualSum = computeTaxYear(allEarnings, allExpenses, { ...settings, expenseMethod: 'actual' }, yearLabel);

  // The only figures that differ between methods: the mileage claim (mileage
  // method) vs the actual deductible vehicle running costs (actual method).
  const ty = taxYearFromLabel(yearLabel);
  const X = allExpenses.filter(x => inRange(x.date, ty.start, ty.end));
  let vehicleActual = 0;
  for (const x of X) {
    const cat = categoryById(x.category);
    if (cat.vehicle) {
      const bizPct = num(x.bizPct != null ? x.bizPct : cat.defaultBizPct) / 100;
      vehicleActual += num(x.amount) * bizPct;
    }
  }
  vehicleActual = round2(vehicleActual);
  const mileageClaim = mileageSum.mileageDed;

  const taxDiff = round2(mileageSum.totalSETax - actualSum.totalSETax); // >0 → actual saves tax
  let better = 'equal';
  if (Math.abs(taxDiff) >= 0.5) better = taxDiff > 0 ? 'actual' : 'mileage';
  else if (Math.abs(mileageClaim - vehicleActual) >= 0.5) better = mileageClaim > vehicleActual ? 'mileage' : 'actual';

  return {
    current: settings.expenseMethod,
    better,
    taxSaving: round2(Math.abs(taxDiff)),
    businessMiles: mileageSum.businessMiles,
    mileageClaim,
    vehicleActual,
    bothTradingAllowance: mileageSum.usedTradingAllowance && actualSum.usedTradingAllowance,
    hasVehicleCosts: vehicleActual > 0,
    mileage: { netProfit: mileageSum.netProfit, totalSETax: mileageSum.totalSETax, netTakeHome: mileageSum.netTakeHome, effectiveDeduction: mileageSum.effectiveDeduction },
    actual: { netProfit: actualSum.netProfit, totalSETax: actualSum.totalSETax, netTakeHome: actualSum.netTakeHome, effectiveDeduction: actualSum.effectiveDeduction },
    vehicleFlatRate: (config.mileage[settings.vehicle] || config.mileage.car).firstRate,
  };
}

// The tax to reserve right now, given the pot mode.
export function taxReserve(summary, settings) {
  if (settings.taxPotMode === 'manual') {
    return round2(Math.max(0, summary.netProfit) * (settings.taxPotManualPct || 0) / 100);
  }
  return summary.totalSETax; // live, exact estimate
}
