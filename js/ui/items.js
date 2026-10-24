// ============================================================
// ui/items.js — row renderers for earnings & expenses, reused by
// the dashboard, income and expenses screens. Tapping opens edit.
// ============================================================
import { el, fmtGBP, fmtDate, fmtNum, fmtMiles } from '../util.js';
import { platformById, categoryById, getSettings } from '../store.js';
import { icon } from './shared.js';
import { deductibleAmount } from '../tax.js';
import { openEarningsForm, openExpenseForm } from './forms.js';

export function earningItem(e) {
  const p = platformById(e.platform);
  const total = (e.amount || 0) + (e.tips || 0);
  const bits = [];
  // Booked, then what it took when that was longer. A block that runs over
  // is paid the same, so the gap is the part worth seeing at a glance.
  if (e.hours) {
    const over = Number(e.hoursActual) > Number(e.hours) + 0.05;
    bits.push(over
      ? `${fmtNum(e.hours, e.hours % 1 ? 1 : 0)}h booked · ${fmtNum(e.hoursActual, 1)}h actual`
      : `${fmtNum(e.hours, e.hours % 1 ? 1 : 0)}h`);
  }
  if (e.miles) bits.push(`${fmtMiles(e.miles)} mi`);
  if (e.deliveries) bits.push(`${e.deliveries} drops`);
  if (e.tips) bits.push(`${fmtGBP(e.tips)} tips`);
  const sub = subLine([fmtDate(e.date, { weekday: true }), ...bits]);
  const node = el('div', { class: 'item' }, [
    el('div', { class: 'item__icon', style: `background:${hex(p.color, .16)};color:${p.color}` , html: icon('route') }),
    el('div', { class: 'item__main' }, [
      el('div', { class: 'item__title', text: p.name }),
      el('div', { class: 'item__sub' }, sub),
    ]),
    el('div', { class: 'item__amt amt-pos', text: '+' + fmtGBP(total) }),
  ]);
  node.addEventListener('click', () => openEarningsForm(e));
  return node;
}

export function expenseItem(x) {
  const cat = categoryById(x.category);
  const s = getSettings();
  const ded = deductibleAmount(x, s);
  const nonDeductible = s.expenseMethod === 'mileage' && cat.vehicle;
  const subBits = [fmtDate(x.date, { weekday: true })];
  if (x.time) subBits[0] += ' ' + x.time;
  if (x.vendor) subBits.push(x.vendor);
  if (x.area) subBits.push(x.area);
  if (x.bizPct != null && x.bizPct < 100 && !nonDeductible) subBits.push(`${x.bizPct}% biz`);
  if (nonDeductible) subBits.push('not deductible');
  else if (ded < (x.amount || 0)) subBits.push(`${fmtGBP(ded)} claimable`);
  const node = el('div', { class: 'item' }, [
    el('div', { class: 'item__icon', style: `background:var(--neg-tint);color:var(--neg-text)`, html: icon(cat.icon) }),
    el('div', { class: 'item__main' }, [
      // The scanned-by-Claude marker is its own node: appended to the label it
      // would make the text 'Fuel  ✨', which matches no category name.
      el('div', { class: 'item__title' }, [
        el('span', { text: cat.label }),
        ...(x.source === 'claude' ? [el('span', { text: '  ✨' })] : []),
      ]),
      el('div', { class: 'item__sub' }, subLine(subBits)),
    ]),
    el('div', { class: 'item__amt amt-neg', text: '−' + fmtGBP(x.amount) }),
  ]);
  node.addEventListener('click', () => openExpenseForm(x));
  return node;
}

// Each piece of a sub-line gets its own span. The pieces mix UI wording
// ("not deductible", "9 drops") with the user's own data (a vendor, an area),
// and joining them into one string leaves nothing a translation can match
// without also matching whatever the user typed.
function subLine(bits) {
  const out = [];
  bits.filter(Boolean).forEach((b, i) => {
    if (i) out.push(document.createTextNode('  ·  '));
    out.push(el('span', { text: String(b) }));
  });
  return out;
}

// hex + alpha helper (accepts #rrggbb)
function hex(c, a = 1) {
  if (!/^#([0-9a-f]{6})$/i.test(c)) return c;
  const n = parseInt(c.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
