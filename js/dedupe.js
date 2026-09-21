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
