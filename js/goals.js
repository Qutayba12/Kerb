// ============================================================
// goals.js — earnings goal maths: current-period progress,
// streaks and recent history, for a daily/weekly/monthly goal.
// ============================================================
import { toISO, parseISO, addDays, round2 } from './util.js';
import { summariseRange } from './tax.js';

// Start/end ISO dates for the period containing `ref` (default today).
export function periodRange(period, ref = new Date()) {
  const d = new Date(ref);
  if (period === 'day') {
    const s = toISO(d); return { start: s, end: s };
  }
  if (period === 'month') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: toISO(start), end: toISO(end) };
  }
  // week: Monday–Sunday
  const day = (d.getDay() + 6) % 7; // Mon=0
  const monday = new Date(d); monday.setDate(d.getDate() - day);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return { start: toISO(monday), end: toISO(sunday) };
}

// Shift a period range back by n periods.
function shiftPeriod(period, ref, n) {
  const d = new Date(ref);
  if (period === 'day') d.setDate(d.getDate() - n);
  else if (period === 'month') d.setMonth(d.getMonth() - n);
  else d.setDate(d.getDate() - n * 7);
  return d;
}

function valueFor(allE, allX, start, end, metric, settings) {
  const r = summariseRange(allE, allX, start, end, settings);
  if (metric === 'profit') return round2(Math.max(0, r.income - r.deductible - r.mileageDed));
  return r.income;
}

export function periodLabel(period, start) {
  const d = parseISO(start);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (period === 'day') return `${d.getDate()} ${MON[d.getMonth()]}`;
  if (period === 'month') return `${MON[d.getMonth()]} ${d.getFullYear()}`;
  return `wk ${d.getDate()} ${MON[d.getMonth()]}`;
}

export function computeGoal(allE, allX, settings) {
  const { goalPeriod: period, goalMetric: metric, goalAmount: amount } = settings;
  const cur = periodRange(period);
  const current = valueFor(allE, allX, cur.start, cur.end, metric, settings);
  const pct = amount > 0 ? Math.min(100, (current / amount) * 100) : 0;
  const met = amount > 0 && current >= amount;

  // history: previous periods (skip empty ones), newest first
  const history = [];
  let streak = 0, streakBroken = false;
  for (let i = 1; i <= 8; i++) {
    const ref = shiftPeriod(period, new Date(), i);
    const r = periodRange(period, ref);
    const val = valueFor(allE, allX, r.start, r.end, metric, settings);
    const hadActivity = val > 0;
    const hit = amount > 0 && val >= amount;
    if (i <= 6) history.push({ label: periodLabel(period, r.start), value: val, met: hit, empty: !hadActivity });
    if (!streakBroken) {
      if (hit) streak++;
      else if (hadActivity) streakBroken = true; // a worked period below goal breaks it
    }
  }
  // include current period in streak if already met
  if (met) streak += 1;

  return { enabled: settings.goalEnabled, period, metric, amount, current, pct, met, remaining: Math.max(0, round2(amount - current)), streak, range: cur, history };
}

export const PERIOD_LABELS = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
