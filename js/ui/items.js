// ============================================================
// ui/items.js — row renderers for earnings & expenses, reused by
// the dashboard, income and expenses screens. Tapping opens edit.
// ============================================================
import { el, fmtGBP, fmtDate, fmtNum } from '../util.js';
import { platformById, categoryById, getSettings } from '../store.js';
import { icon } from './shared.js';
import { deductibleAmount } from '../tax.js';
import { openEarningsForm, openExpenseForm } from './forms.js';

export function earningItem(e) {
  const p = platformById(e.platform);
  const total = (e.amount || 0) + (e.tips || 0);
  const bits = [];
  if (e.hours) bits.push(`${fmtNum(e.hours, e.hours % 1 ? 1 : 0)}h`);
  if (e.miles) bits.push(`${fmtNum(e.miles)} mi`);
  if (e.deliveries) bits.push(`${e.deliveries} drops`);
  if (e.tips) bits.push(`${fmtGBP(e.tips)} tips`);
  const sub = [fmtDate(e.date, { weekday: true }), bits.join(' · ')].filter(Boolean).join('  ·  ');
  const node = el('div', { class: 'item' }, [
    el('div', { class: 'item__icon', style: `background:${hex(p.color, .16)};color:${p.color}` , html: icon('route') }),
    el('div', { class: 'item__main' }, [
      el('div', { class: 'item__title', text: p.name }),
      el('div', { class: 'item__sub', text: sub }),
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
  if (x.vendor) subBits.push(x.vendor);
  if (x.bizPct != null && x.bizPct < 100 && !nonDeductible) subBits.push(`${x.bizPct}% biz`);
  if (nonDeductible) subBits.push('not deductible');
  else if (ded < (x.amount || 0)) subBits.push(`${fmtGBP(ded)} claimable`);
  const node = el('div', { class: 'item' }, [
    el('div', { class: 'item__icon', style: `background:var(--neg-tint);color:var(--neg)`, html: icon(cat.icon) }),
    el('div', { class: 'item__main' }, [
      el('div', { class: 'item__title', text: cat.label + (x.source === 'claude' ? '  ✨' : '') }),
      el('div', { class: 'item__sub', text: subBits.join('  ·  ') }),
    ]),
    el('div', { class: 'item__amt amt-neg', text: '−' + fmtGBP(x.amount) }),
  ]);
  node.addEventListener('click', () => openExpenseForm(x));
  return node;
}

// hex + alpha helper (accepts #rrggbb)
function hex(c, a = 1) {
  if (!/^#([0-9a-f]{6})$/i.test(c)) return c;
  const n = parseInt(c.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
