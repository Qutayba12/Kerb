// ============================================================
// ui/forms.js — add/edit sheets for earnings, expenses, bills.
// Shared by the Add screen and the list edit actions.
// ============================================================
import { el, todayISO, parseMoney, uid, fileToResizedDataURL, fmtGBP, fmtNum, taxYearFromLabel } from '../util.js';
import { earnings, expenses, bills } from '../db.js';
import { getSettings, allPlatforms, EXPENSE_CATEGORIES, categoryById } from '../store.js';
import { openSheet, closeSheet, field, moneyInput, selectInput, toast, icon, confirmDialog } from './shared.js';
import { extractReceipt, hasApiKey, estimateScanCost } from '../claude.js';
import { bus } from '../bus.js';

// ---------------- Earnings ----------------
export function openEarningsForm(existing = null, opts = {}) {
  const s = getSettings();
  const isEdit = !!existing && !opts.asNew;
  const b = existing || {};
  const e = {
    id: isEdit ? b.id : uid(), date: b.date || todayISO(), platform: b.platform || allPlatforms()[0].id,
    amount: b.amount ?? '', tips: b.tips ?? '', hours: b.hours ?? '', deliveries: b.deliveries ?? '', miles: b.miles ?? '', notes: b.notes || '',
  };
  const form = el('form', { class: 'kform', autocomplete: 'off' });

  const dateInput = el('input', { class: 'input', type: 'date', value: e.date, max: todayISO() });
  const platformSel = selectInput(allPlatforms().map(p => ({ value: p.id, label: p.name })), e.platform);
  const amount = moneyInput({ value: e.amount, placeholder: '0.00' });
  const tips = moneyInput({ value: e.tips, placeholder: '0.00' });
  const hours = el('input', { class: 'input', type: 'number', step: '0.25', min: '0', inputMode: 'decimal', value: e.hours, placeholder: 'e.g. 4' });
  const deliveries = el('input', { class: 'input', type: 'number', step: '1', min: '0', inputMode: 'numeric', value: e.deliveries, placeholder: 'e.g. 12' });
  const miles = el('input', { class: 'input', type: 'number', step: '0.1', min: '0', inputMode: 'decimal', value: e.miles, placeholder: 'business miles' });
  const notes = el('input', { class: 'input', type: 'text', value: e.notes, placeholder: 'optional' });

  form.append(
    dateFieldWithYearCheck('Date', dateInput),
    field('Platform', platformSel),
    field('Earnings (before tips)', amount, 'What the app/platform paid you for the work.'),
    field('Tips', tips, 'Tips are taxable income — kept separate for your records.'),
    el('div', { class: 'grid-2' }, [field('Hours worked', hours), field('Deliveries', deliveries)]),
    field('Business miles driven', miles, s.expenseMethod === 'mileage'
      ? `Claimed at your mileage rate (car: 55p/mile up to 10k, then 25p).`
      : `Tracked for your records (you use the actual-costs method).`),
    field('Note', notes),
  );

  const save = async () => {
    const rec = {
      id: e.id, date: dateInput.value || todayISO(), platform: platformSel.value,
      amount: parseMoney(amount.input.value), tips: parseMoney(tips.input.value),
      hours: parseFloat(hours.value) || 0, deliveries: parseInt(deliveries.value) || 0,
      miles: parseFloat(miles.value) || 0, notes: notes.value.trim(),
    };
    if (!rec.amount && !rec.tips && !rec.miles) { toast('Enter earnings, tips or miles', 'err'); return; }
    await earnings.save(rec);
    closeSheet(); toast(isEdit ? 'Shift updated' : 'Shift added', 'ok'); bus.refresh();
  };

  form.append(footer(save, isEdit ? () => removeEntry('earnings', e.id, 'Shift') : null));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); save(); });
  openSheet({ title: isEdit ? 'Edit shift' : 'Add earnings', node: form });
  setTimeout(() => amount.input.focus(), 150);
}

// ---------------- Expenses ----------------
export function openExpenseForm(existing = null, opts = {}) {
  const s = getSettings();
  const isEdit = !!existing && !opts.asNew;
  const b = existing || {};
  const x = {
    id: isEdit ? b.id : uid(), date: b.date || todayISO(), category: b.category || 'fuel',
    amount: b.amount ?? '', vendor: b.vendor || '', bizPct: b.bizPct ?? null, vat: b.vat ?? '', notes: b.notes || '',
    image: b.image || '', source: b.source || 'manual',
    time: b.time || '', address: b.address || '', area: b.area || '', postcode: b.postcode || '',
    paymentMethod: b.paymentMethod || '', receiptNo: b.receiptNo || '', vatNumber: b.vatNumber || '',
    subtotal: b.subtotal ?? '', items: b.items || '', lineItems: Array.isArray(b.lineItems) ? b.lineItems : [],
  };
  const form = el('form', { class: 'kform', autocomplete: 'off' });

  // ---- scan area ----
  const fileInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
  const scanBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button' });
  scanBtn.innerHTML = icon('camera') + '<span>Scan receipt with Claude</span>';
  const scanStatus = el('div', { class: 'scan-status', hidden: true });
  const preview = el('img', { class: 'scan-preview', hidden: true, alt: 'receipt' });
  if (x.image) { preview.src = x.image; preview.hidden = false; }

  const dateInput = el('input', { class: 'input', type: 'date', value: x.date, max: todayISO() });
  const catSel = selectInput(EXPENSE_CATEGORIES.map(c => ({ value: c.id, label: c.label })), x.category);
  const amount = moneyInput({ value: x.amount, placeholder: '0.00' });
  const vendor = el('input', { class: 'input', type: 'text', value: x.vendor, placeholder: 'e.g. Shell, EE' });
  const bizPct = el('input', { class: 'input', type: 'number', min: '0', max: '100', step: '1', inputMode: 'numeric', value: x.bizPct != null ? x.bizPct : categoryById(x.category).defaultBizPct });
  const vat = moneyInput({ value: x.vat, placeholder: '0.00' });
  const notes = el('input', { class: 'input', type: 'text', value: x.notes, placeholder: 'optional' });

  // full-detail fields (captured by the scanner; also editable)
  const time = el('input', { class: 'input', type: 'time', value: x.time });
  const subtotal = moneyInput({ value: x.subtotal, placeholder: '0.00' });
  const address = el('input', { class: 'input', type: 'text', value: x.address, placeholder: 'street address' });
  const area = el('input', { class: 'input', type: 'text', value: x.area, placeholder: 'town / city / area' });
  const postcode = el('input', { class: 'input', type: 'text', value: x.postcode, placeholder: 'postcode', autocapitalize: 'characters' });
  const paymentMethod = el('input', { class: 'input', type: 'text', value: x.paymentMethod, placeholder: 'e.g. Visa ****1234' });
  const receiptNo = el('input', { class: 'input', type: 'text', value: x.receiptNo, placeholder: 'receipt / invoice no.' });
  const vatNumber = el('input', { class: 'input', type: 'text', value: x.vatNumber, placeholder: 'VAT reg no.' });
  const items = el('input', { class: 'input', type: 'text', value: x.items, placeholder: 'items summary' });
  const lineItemsBox = el('div', { class: 'lineitems' });
  const renderLineItems = () => {
    lineItemsBox.replaceChildren();
    const lis = x.lineItems || [];
    if (!lis.length) return;
    lineItemsBox.append(el('div', { class: 'field > label', style: 'font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:6px', text: `Itemised lines (${lis.length})` }));
    const listEl = el('div', { class: 'card card--flush', style: 'margin:0' });
    lis.forEach(li => listEl.append(el('div', { class: 'lineitem' }, [
      el('span', { class: 'lineitem__name', text: (li.qty && li.qty !== 1 ? `${fmtNum(li.qty, li.qty % 1 ? 2 : 0)}× ` : '') + (li.name || 'Item') }),
      el('span', { class: 'lineitem__price', text: fmtGBP(li.price) }),
    ])));
    lineItemsBox.append(listEl);
  };
  const detailsWrap = el('details', { class: 'kdetails' }, [
    el('summary', { text: 'Full details' }),
    el('div', { class: 'grid-2' }, [field('Time', time), field('Subtotal (before VAT)', subtotal)]),
    field('Address', address),
    el('div', { class: 'grid-2' }, [field('Area / town', area), field('Postcode', postcode)]),
    field('Items', items),
    lineItemsBox,
    el('div', { class: 'grid-2' }, [field('Payment method', paymentMethod), field('Receipt no.', receiptNo)]),
    field('VAT reg number', vatNumber),
  ]);
  renderLineItems();

  // note about vehicle costs under mileage method
  const vehNote = el('div', { class: 'hint' });
  const updateVehNote = () => {
    const cat = categoryById(catSel.value);
    if (s.expenseMethod === 'mileage' && cat.vehicle) {
      vehNote.innerHTML = `<span style="color:var(--warn)">⚠ Covered by the mileage rate — not separately deductible. Tracked for your cash records only.</span>`;
    } else vehNote.textContent = 'Deductible business expense.';
  };
  catSel.addEventListener('change', () => { bizPct.value = categoryById(catSel.value).defaultBizPct; updateVehNote(); });
  updateVehNote();

  // scan handlers
  scanBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]; if (!file) return;
    let dataUrl;
    try { dataUrl = await fileToResizedDataURL(file); } catch { toast('Could not read image', 'err'); return; }
    preview.src = dataUrl; preview.hidden = false; x.image = dataUrl;
    if (!hasApiKey(s)) {
      toast('Add your API key in Settings to auto-read receipts', 'warn');
      scanStatus.hidden = true;
      return;
    }
    scanStatus.hidden = false;
    scanStatus.innerHTML = `<span class="splash__spin"></span> Claude is reading the receipt…`;
    scanBtn.disabled = true;
    try {
      const r = await extractReceipt(dataUrl, s);
      if (r.amount) amount.input.value = r.amount.toFixed(2);
      if (r.date) dateInput.value = r.date;
      if (r.vendor) vendor.value = r.vendor;
      if (r.category) { catSel.value = r.category; bizPct.value = categoryById(r.category).defaultBizPct; updateVehNote(); }
      if (r.vat) vat.input.value = r.vat.toFixed(2);
      if (r.notes) notes.value = r.notes;
      if (r.time) time.value = r.time;
      if (r.subtotal) subtotal.input.value = r.subtotal.toFixed(2);
      if (r.address) address.value = r.address;
      if (r.area) area.value = r.area;
      if (r.postcode) postcode.value = r.postcode;
      if (r.paymentMethod) paymentMethod.value = r.paymentMethod;
      if (r.receiptNo) receiptNo.value = r.receiptNo;
      if (r.vatNumber) vatNumber.value = r.vatNumber;
      if (r.items) items.value = r.items;
      if (r.lineItems && r.lineItems.length) { x.lineItems = r.lineItems; renderLineItems(); }
      if (r.address || r.postcode || r.time || r.items || (r.lineItems && r.lineItems.length)) detailsWrap.open = true;
      x.source = 'claude';
      const conf = Math.round((r.confidence || 0) * 100);
      scanStatus.innerHTML = `${icon('check')} Read it${conf ? ` (${conf}% confident)` : ''} — please double-check the amount.`;
      scanStatus.style.color = 'var(--pos)';
    } catch (err) {
      scanStatus.innerHTML = `${icon('warn')} ${err.message}`;
      scanStatus.style.color = 'var(--neg)';
    } finally { scanBtn.disabled = false; }
  });

  const scanWrap = el('div', {}, [scanBtn, fileInput, scanStatus, preview]);
  if (!hasApiKey(s)) scanWrap.append(el('div', { class: 'hint', html: `Tip: add your Anthropic API key in Settings — scanning costs ${estimateScanCost()}.` }));

  form.append(
    scanWrap,
    el('hr', { class: 'soft' }),
    dateFieldWithYearCheck('Date', dateInput),
    field('Category', catSel, undefined),
    (() => { const f = field('', vehNote); f.style.marginTop = '-8px'; return f; })(),
    field('Amount paid (inc. VAT)', amount),
    field('Vendor', vendor),
    el('div', { class: 'grid-2' }, [
      field('Business use %', bizPct, 'e.g. phone 50%'),
      field('VAT (optional)', vat),
    ]),
    field('Note', notes),
    detailsWrap,
  );

  const save = async () => {
    const rec = {
      id: x.id, date: dateInput.value || todayISO(), category: catSel.value,
      amount: parseMoney(amount.input.value), vendor: vendor.value.trim(),
      bizPct: Math.max(0, Math.min(100, parseInt(bizPct.value) || 0)),
      vat: parseMoney(vat.input.value), notes: notes.value.trim(),
      image: x.image || '', source: x.source || 'manual',
      time: time.value || '', subtotal: parseMoney(subtotal.input.value),
      address: address.value.trim(), area: area.value.trim(), postcode: postcode.value.trim().toUpperCase(),
      paymentMethod: paymentMethod.value.trim(), receiptNo: receiptNo.value.trim(), vatNumber: vatNumber.value.trim(),
      items: items.value.trim(), lineItems: x.lineItems || [],
    };
    if (!rec.amount) { toast('Enter the amount', 'err'); return; }
    await expenses.save(rec);
    closeSheet(); toast(isEdit ? 'Expense updated' : 'Expense added', 'ok'); bus.refresh();
  };

  form.append(footer(save, isEdit ? () => removeEntry('expenses', x.id, 'Expense') : null));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); save(); });
  openSheet({ title: isEdit ? 'Edit expense' : 'Add expense', node: form });
}

// ---------------- Recurring bills ----------------
const FREQS = [
  { value: 'weekly', label: 'Weekly' }, { value: 'fourweekly', label: 'Every 4 weeks' },
  { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'annual', label: 'Annual' },
];
export function openBillForm(existing = null) {
  const b = existing || { id: uid(), name: '', amount: '', freq: 'monthly', category: 'phone', business: true, bizPct: 50, nextDue: todayISO() };
  const form = el('form', { class: 'kform', autocomplete: 'off' });
  const name = el('input', { class: 'input', type: 'text', value: b.name, placeholder: 'e.g. Phone contract' });
  const amount = moneyInput({ value: b.amount, placeholder: '0.00' });
  const freq = selectInput(FREQS, b.freq);
  const catSel = selectInput(EXPENSE_CATEGORIES.map(c => ({ value: c.id, label: c.label })), b.category);
  const nextDue = el('input', { class: 'input', type: 'date', value: b.nextDue });
  const bizToggle = el('input', { type: 'checkbox' }); bizToggle.checked = !!b.business;
  const bizPct = el('input', { class: 'input', type: 'number', min: '0', max: '100', value: b.bizPct });

  const bizRow = el('label', { class: 'switch-row' }, [
    el('span', { text: 'Business expense (deductible)' }),
    el('span', { class: 'switch' }, [bizToggle, el('span', { class: 'track' })]),
  ]);

  form.append(
    field('Name', name),
    el('div', { class: 'grid-2' }, [field('Amount', amount), field('Frequency', freq)]),
    field('Category', catSel),
    field('Next due', nextDue),
    bizRow,
    field('Business use %', bizPct),
  );
  const save = async () => {
    const rec = {
      id: b.id, name: name.value.trim() || 'Bill', amount: parseMoney(amount.input.value),
      freq: freq.value, category: catSel.value, nextDue: nextDue.value || todayISO(),
      business: bizToggle.checked, bizPct: Math.max(0, Math.min(100, parseInt(bizPct.value) || 0)),
    };
    if (!rec.amount) { toast('Enter the amount', 'err'); return; }
    await bills.save(rec);
    closeSheet(); toast(existing ? 'Bill updated' : 'Bill added', 'ok'); bus.refresh();
  };
  form.append(footer(save, existing ? () => removeEntry('bills', b.id, 'Bill') : null));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); save(); });
  openSheet({ title: existing ? 'Edit bill' : 'Add recurring bill', node: form });
}

// ---------------- helpers ----------------
// A date field that warns when the chosen date falls outside the working tax
// year — those entries won't appear in the current totals, which surprises people.
function dateFieldWithYearCheck(label, dateInput) {
  const warn = el('div', { class: 'hint', style: 'color:var(--warn);margin-top:6px', hidden: true });
  const f = field(label, dateInput);
  f.append(warn);
  const check = () => {
    const yr = getSettings().taxYear;
    const ty = taxYearFromLabel(yr);
    const d = dateInput.value;
    const out = d && (d < ty.start || d > ty.end);
    warn.hidden = !out;
    if (out) warn.innerHTML = `⚠ This date is in another tax year — it won't show in your <b>${yr}</b> totals.`;
  };
  dateInput.addEventListener('change', check);
  check();
  return f;
}
function footer(onSave, onDelete) {
  const wrap = el('div', { style: 'margin-top:16px' });
  const saveBtn = el('button', { class: 'btn btn--primary btn--block', type: 'submit', text: 'Save' });
  wrap.append(saveBtn);
  if (onDelete) {
    const delBtn = el('button', { class: 'btn btn--danger btn--block', type: 'button', style: 'margin-top:8px' });
    delBtn.innerHTML = icon('trash') + '<span>Delete</span>';
    delBtn.addEventListener('click', onDelete);
    wrap.append(delBtn);
  }
  return wrap;
}
async function removeEntry(store, id, label) {
  const ok = await confirmDialog({ title: `Delete ${label.toLowerCase()}?`, message: 'This cannot be undone.', confirmText: 'Delete', danger: true });
  if (!ok) return;
  const map = { earnings, expenses, bills };
  await map[store].remove(id);
  closeSheet(); toast(`${label} deleted`, 'ok'); bus.refresh();
}
