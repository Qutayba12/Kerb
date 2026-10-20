// ============================================================
// ui/expenses.js — expenses list with period filter & totals,
// plus a claimable-vs-paid summary.
// ============================================================
import { el, fmtGBP, fmtNum, groupByDay, fmtDate, dowName, todayISO } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, categoryById } from '../store.js';
import { deductibleAmount } from '../tax.js';
import { icon, emptyState, searchBox, toast } from './shared.js';
import { expenseItem } from './items.js';
import { openExpenseForm } from './forms.js';
import { header, periodChips, rangeFor, miniTile, getPeriod, pdfButton } from './income.js';
import { printSheet, docSheet, docSection, dataTable, docFoot } from '../pdf.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const allX = await expenses.all();
  const root = el('div');

  const { start, end, label } = rangeFor(getPeriod(), s);
  const periodList = allX.filter(x => x.date >= start && x.date <= end);

  root.append(header('Expenses', () => openExpenseForm(), pdfButton(() => {
    if (!periodList.length) { toast('Nothing to export for this period', 'warn'); return; }
    exportExpensesPdf(periodList, label, s);
  })));
  root.append(periodChips(() => bus.refresh()));

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

// Export the given expense list as a clean PDF (print dialog → Save as PDF).
function exportExpensesPdf(list, label, s) {
  const rows = list.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map(x => {
    const cat = categoryById(x.category);
    const bizPct = (x.bizPct != null ? x.bizPct : cat.defaultBizPct);
    const covered = s.expenseMethod === 'mileage' && cat.vehicle;
    const claim = deductibleAmount(x, s);
    return [fmtDate(x.date, { withYear: true }), cat.label, (x.vendor || '').slice(0, 22), fmtGBP(x.amount || 0), bizPct + '%', covered ? '— mileage' : fmtGBP(claim)];
  });
  let paid = 0, claim = 0;
  list.forEach(x => { paid += x.amount || 0; claim += deductibleAmount(x, s); });
  rows.push(['Total', '', '', fmtGBP(paid), '', fmtGBP(claim)]);
  const sheet = docSheet({ title: 'Expenses', subtitle: `${label} · ${s.expenseMethod === 'mileage' ? 'simplified mileage' : 'actual costs'} · prepared ${fmtDate(todayISO(), { withYear: true })}` });
  sheet.append(docSection(`Expenses — ${list.length} entr${list.length === 1 ? 'y' : 'ies'}`));
  sheet.append(dataTable(['Date', 'Category', 'Vendor', 'Paid', 'Biz%', 'Claimable'], rows, { lastStrong: true }));
  if (s.expenseMethod === 'mileage') sheet.append(docFoot('Vehicle running costs show “— mileage” because you claim the simplified per-mile rate instead. Kept here for your cash records. Keep for at least 5 years.'));
  else sheet.append(docFoot('Claimable is the business-use share of each cost. Keep records for at least 5 years after the filing deadline.'));
  printSheet(sheet, { title: `Kerb expenses ${label}` });
}
