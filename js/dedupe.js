// ============================================================
// dedupe.js — "likely duplicate" detection for imports.
// The same money can arrive from two sources (e.g. a Flex payout
// shows up in both an earnings statement AND a bank statement),
// which would double-count income and throw off the tax figures.
// These helpers flag a candidate row that matches something the
// user has ALREADY saved, so imports stay penny-accurate.
//
// Matching is deliberately loose to catch cross-source overlaps:
//   earnings : same date + platform + total (amount + tips)
//   expenses : same date + total amount
// Vendor/category text is ignored because it is formatted
// differently by receipts, banks and CSVs. A match is only ever a
// soft warning the user can override — never an automatic delete.
// ============================================================
import { round2 } from './util.js';

function money(n) { return round2(Number(n) || 0).toFixed(2); }

export function earningKey(r) {
  const total = money((Number(r.amount) || 0) + (Number(r.tips) || 0));
  return `E|${r.date || ''}|${r.platform || ''}|${total}`;
}
export function expenseKey(r) {
  return `X|${r.date || ''}|${money(r.amount)}`;
}

// Build a checker from the records already saved on the device.
// isDup('earning'|'expense', rec) -> true when rec matches a saved row.
export function makeDupChecker(existingEarnings = [], existingExpenses = []) {
  const seen = new Set();
  for (const r of existingEarnings) seen.add(earningKey(r));
  for (const r of existingExpenses) seen.add(expenseKey(r));
  return {
    isDup(kind, rec) {
      if (!rec) return false;
      const k = kind === 'earning' ? earningKey(rec) : expenseKey(rec);
      return seen.has(k);
    },
  };
}

// ---------------- period-total overlap ----------------
// A Flex earnings screen shows the individual blocks AND the weekly payment
// together, so one screenshot can yield both — four blocks at £75 and a £300
// payout for the same week. The exact-match check above cannot see it: the
// date and the amount both differ. Double-counted income means tax paid on
// money never earned.
//
// So: flag an entry whose total equals the sum of several OTHER entries for
// the same platform in the days up to and including its own date.
//
// Arithmetic alone cannot be certain — earning £50, £50 and then £100 looks
// identical — so this is always a question put to the user, never an
// automatic removal. The evidence is returned with the flag so they can judge.
const DAY = 86400000;
const toMs = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1).getTime(); };
const totalOf = (r) => round2((Number(r.amount) || 0) + (Number(r.tips) || 0));

export function findPeriodTotals(rows = [], existing = [], { windowDays = 7, tolerance = 0.02 } = {}) {
  const pool = [...rows, ...existing].filter(r => r && r.date);
  const out = [];
  for (const r of rows) {
    if (!r || !r.date) continue;
    const total = totalOf(r);
    if (total <= 0) continue;
    const end = toMs(r.date);
    const start = end - (windowDays - 1) * DAY;
    const covered = pool.filter(o => o !== r
      && (o.platform || '') === (r.platform || '')
      && toMs(o.date) >= start && toMs(o.date) <= end);
    if (covered.length < 2) continue;          // a payout summarises several blocks
    const sum = round2(covered.reduce((t, o) => t + totalOf(o), 0));
    if (Math.abs(sum - total) > Math.max(1, total * tolerance)) continue;
    out.push({
      row: r,
      total,
      covers: covered.length,
      coveredBy: covered,
      from: covered.map(o => o.date).sort()[0],
      to: r.date,
      // A payment summary carries no hours or miles; a worked block normally
      // does. Not proof, but it separates the likely case from the coincidence.
      looksLikeSummary: !(Number(r.hours) > 0) && !(Number(r.miles) > 0),
    });
  }
  return out;
}

// Both directions of the same mistake:
//   incoming — a new row that totals up rows already saved (or other new rows)
//   saved    — a row already saved that the NEW rows add up to, which happens
//              when the weekly payout was recorded before its blocks
// A saved row only counts when the new rows are part of what covers it;
// otherwise an overlap that was already there would be blamed on this import.
export function findOverlaps(rows = [], existing = [], opts = {}) {
  const incoming = findPeriodTotals(rows, existing, opts);
  const fresh = new Set(rows);
  const saved = findPeriodTotals(existing, rows, opts)
    .filter(f => f.coveredBy.some(o => fresh.has(o)));
  return { incoming, saved };
}
