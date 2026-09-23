// ============================================================
// ui/income.js — earnings list with period filter & totals.
// ============================================================
import { el, fmtGBP, fmtNum, todayISO, addDays, groupByDay, fmtDate, dowName } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, platformById } from '../store.js';
import { summariseRange } from '../tax.js';
import { taxYearFromLabel } from '../util.js';
import { icon, emptyState, searchBox } from './shared.js';
import { earningItem } from './items.js';
import { openEarningsForm } from './forms.js';
import { bus } from '../bus.js';

let period = '30d';

export async function render() {
  const s = getSettings();
  const allE = await earnings.all();
  const allX = await expenses.all();
  const root = el('div');

  root.append(header('Income', () => openEarningsForm()));
  root.append(periodChips(() => bus.refresh()));

  const { start, end, label } = rangeFor(period, s);
  const periodList = allE.filter(e => e.date >= start && e.date <= end);
  const sum = summariseRange(allE, allX, start, end, s);

  // summary tiles (reflect the whole period, not the search)
  root.append(el('div', { class: 'grid-3', style: 'margin-bottom:14px' }, [
    miniTile('Income', fmtGBP(sum.income), 'pos'),
    miniTile('Hours', fmtNum(sum.hours, sum.hours % 1 ? 1 : 0)),
    miniTile('Miles', fmtNum(sum.miles)),
    miniTile('£ / hour', sum.hours ? fmtGBP(sum.income / sum.hours) : '—'),
    miniTile('£ / mile', sum.miles ? fmtGBP(sum.income / sum.miles) : '—'),
    miniTile('Tips', fmtGBP(sum.tips)),
  ]));

  if (!periodList.length) {
    root.append(emptyState('route', 'No shifts logged', `Nothing recorded for ${label.toLowerCase()}.`));
    const add = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:10px' });
    add.innerHTML = icon('plus') + '<span>Add earnings</span>'; add.onclick = () => openEarningsForm();
    root.append(add);
    return root;
  }

  // live search (platform or note) — filters the list without losing focus
  const search = searchBox('Search platform or note…');
  root.append(search.wrap);
  const listWrap = el('div');
  root.append(listWrap);

  const hay = (e) => `${platformById(e.platform).name} ${e.notes || ''}`.toLowerCase();
  function renderList() {
    const q = search.input.value.trim().toLowerCase();
    const list = q ? periodList.filter(e => hay(e).includes(q)) : periodList;
    listWrap.replaceChildren();
    if (!list.length) {
      listWrap.append(el('div', { class: 'tiny muted center', style: 'padding:18px', text: `No shifts match “${search.input.value.trim()}”.` }));
      return;
    }
    for (const [day, items] of groupByDay(list)) {
      const dayTotal = items.reduce((t, e) => t + (e.amount || 0) + (e.tips || 0), 0);
      listWrap.append(el('div', { class: 'day-head' }, [
        el('span', { class: 'd', text: `${dowName(day)}, ${fmtDate(day, { withYear: true })}` }),
        el('span', { class: 't', text: '+' + fmtGBP(dayTotal) }),
      ]));
      const card = el('div', { class: 'card card--flush' });
      items.forEach(e => card.append(earningItem(e)));
      listWrap.append(card);
    }
  }
  search.input.addEventListener('input', renderList);
  renderList();
  return root;
}

// ---- shared bits (also used by expenses.js) ----
export function header(title, onAdd) {
  const add = el('button', { class: 'btn btn--primary btn--sm', type: 'button' });
  add.innerHTML = icon('plus') + '<span>Add</span>'; add.onclick = onAdd;
  return el('div', { class: 'row row--between', style: 'margin:4px 2px 12px' }, [
    el('h2', { style: 'font-size:22px', text: title }), add,
  ]);
}
export function periodChips(onChange) {
  const opts = [['7d', '7 days'], ['30d', '30 days'], ['ty', 'Tax year'], ['all', 'All']];
  const wrap = el('div', { class: 'chips', style: 'margin-bottom:14px' });
  opts.forEach(([v, lab]) => {
    const c = el('button', { class: 'chip' + (period === v ? ' is-active' : ''), type: 'button', text: lab });
    c.onclick = () => { period = v; onChange(); };
    wrap.append(c);
  });
  return wrap;
}
export const getPeriod = () => period;
export function setPeriod(p) { period = p; }
export function rangeFor(p, s) {
  const today = todayISO();
  if (p === '7d') return { start: addDays(today, -6), end: today, label: 'Last 7 days' };
  if (p === '30d') return { start: addDays(today, -29), end: today, label: 'Last 30 days' };
  if (p === 'ty') { const ty = taxYearFromLabel(s.taxYear); return { start: ty.start, end: ty.end, label: `Tax year ${ty.label}` }; }
  return { start: '0000-01-01', end: '9999-12-31', label: 'All time' };
}
export function miniTile(k, v, tone) {
  return el('div', { class: 'tile', style: 'padding:10px 11px' }, [
    el('div', { class: 'tile__k', style: 'font-size:11px', text: k }),
    el('div', { class: 'tile__v', style: 'font-size:17px;' + (tone === 'pos' ? 'color:var(--pos)' : tone === 'neg' ? 'color:var(--neg)' : ''), text: v }),
  ]);
}
