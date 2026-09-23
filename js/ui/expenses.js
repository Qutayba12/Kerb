// ============================================================
// ui/expenses.js — expenses list with period filter & totals,
// plus a claimable-vs-paid summary.
// ============================================================
import { el, fmtGBP, groupByDay, fmtDate, dowName } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, categoryById } from '../store.js';
import { deductibleAmount } from '../tax.js';
import { icon, emptyState, searchBox } from './shared.js';
import { expenseItem } from './items.js';
import { openExpenseForm } from './forms.js';
import { header, periodChips, rangeFor, miniTile, getPeriod } from './income.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const allX = await expenses.all();
  const root = el('div');

  root.append(header('Expenses', () => openExpenseForm()));
  root.append(periodChips(() => bus.refresh()));

  const { start, end, label } = rangeFor(getPeriod(), s);
  const periodList = allX.filter(x => x.date >= start && x.date <= end);

  const paid = periodList.reduce((t, x) => t + (x.amount || 0), 0);
  const claimable = periodList.reduce((t, x) => t + deductibleAmount(x, s), 0);
  const notDeduct = paid - claimable;

  root.append(el('div', { class: 'grid-3', style: 'margin-bottom:12px' }, [
    miniTile('Paid out', fmtGBP(paid), 'neg'),
    miniTile('Claimable', fmtGBP(claimable)),
    miniTile('Not deductible', fmtGBP(notDeduct)),
  ]));

  if (s.expenseMethod === 'mileage' && notDeduct > 0) {
    root.append(el('div', { class: 'callout callout--info', html: `${icon('info')}<div>You use the <b>simplified mileage</b> method, so vehicle running costs (fuel, insurance, repairs) aren't claimed separately — they're covered by your per-mile rate. They're kept here for your cash records.</div>` }));
  }

  if (!periodList.length) {
    root.append(emptyState('note', 'No expenses yet', `Nothing recorded for ${label.toLowerCase()}.`));
    const add = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:10px' });
    add.innerHTML = icon('camera') + '<span>Scan a receipt</span>'; add.onclick = () => openExpenseForm();
    root.append(add);
    return root;
  }

  // live search (vendor, category or note)
  const search = searchBox('Search vendor, category or note…');
  root.append(search.wrap);
  const listWrap = el('div');
  root.append(listWrap);

  const hay = (x) => `${categoryById(x.category).label} ${x.vendor || ''} ${x.area || ''} ${x.notes || ''}`.toLowerCase();
  function renderList() {
    const q = search.input.value.trim().toLowerCase();
    const list = q ? periodList.filter(x => hay(x).includes(q)) : periodList;
    listWrap.replaceChildren();
    if (!list.length) {
      listWrap.append(el('div', { class: 'tiny muted center', style: 'padding:18px', text: `No expenses match “${search.input.value.trim()}”.` }));
      return;
    }
    for (const [day, items] of groupByDay(list)) {
      const dayTotal = items.reduce((t, x) => t + (x.amount || 0), 0);
      listWrap.append(el('div', { class: 'day-head' }, [
        el('span', { class: 'd', text: `${dowName(day)}, ${fmtDate(day, { withYear: true })}` }),
        el('span', { class: 't', text: '−' + fmtGBP(dayTotal) }),
      ]));
      const card = el('div', { class: 'card card--flush' });
      items.forEach(x => card.append(expenseItem(x)));
      listWrap.append(card);
    }
  }
  search.input.addEventListener('input', renderList);
  renderList();
  return root;
}
