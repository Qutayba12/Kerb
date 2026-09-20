// ============================================================
// ui/onboarding.js — first-run welcome. Confirms the tax basis
// and captures PAYE salary + (optional) API key so the numbers
// are right from day one.
// ============================================================
import { el, todayISO } from '../util.js';
import { getSettings, saveSettings, REGION_LABELS, VEHICLE_LABELS } from '../store.js';
import { openSheet, closeSheet, field, moneyInput, selectInput, toast } from './shared.js';
import { bus } from '../bus.js';

export function maybeOnboard() {
  const s = getSettings();
  if (s.onboarded) return;
  openOnboarding();
}

export function openOnboarding() {
  const s = getSettings();
  const body = el('div');
  body.append(el('div', { class: 'callout callout--brand', html: `<div style="font-size:14px"><b>Welcome to Kerb 👋</b><br>Track every penny of your delivery income, expenses and tax — privately, on this device. Confirm a few details to get accurate numbers.</div>` }));

  const region = selectInput(Object.entries(REGION_LABELS).map(([v, l]) => ({ value: v, label: l })), s.region);
  const vehicle = selectInput(Object.entries(VEHICLE_LABELS).map(([v, l]) => ({ value: v, label: l })), s.vehicle);
  const method = selectInput([{ value: 'mileage', label: 'Simplified mileage (recommended)' }, { value: 'actual', label: 'Actual costs' }], s.expenseMethod);
  const paye = moneyInput({ value: s.payeSalary || '', placeholder: '0.00' });
  const start = el('input', { class: 'input', type: 'date', value: s.seStartDate || todayISO(), max: todayISO() });
  const key = el('input', { class: 'input', type: 'password', placeholder: 'sk-ant-…  (optional, for receipt scanning)', autocomplete: 'off' });
  if (s.apiKey) key.value = s.apiKey;

  body.append(
    field('Where do you pay tax?', region),
    field('Vehicle', vehicle),
    field('Expense method', method),
    field('PAYE salary (annual, gross)', paye, 'Your employed job\'s yearly pay. Leave 0 if delivery is your only income.'),
    field('When did you start delivering?', start),
    field('Anthropic API key (optional)', key, 'For scanning receipts with Claude. You can add this later in Settings.'),
  );

  const done = el('button', { class: 'btn btn--primary btn--block', type: 'button', text: 'Start using Kerb', style: 'margin-top:8px' });
  done.onclick = () => {
    saveSettings({
      region: region.value, vehicle: vehicle.value, expenseMethod: method.value,
      payeSalary: parseFloat(String(paye.input.value).replace(/[^0-9.\-]/g, '')) || 0,
      seStartDate: start.value, apiKey: key.value.trim(), onboarded: true,
    });
    closeSheet(); toast('All set — welcome!', 'ok'); bus.refresh();
  };
  body.append(done);
  body.append(el('button', { class: 'link tiny', type: 'button', text: 'Skip for now', style: 'display:block;margin:12px auto 0', onclick: () => { saveSettings({ onboarded: true }); closeSheet(); bus.refresh(); } }));

  openSheet({ title: 'Set up Kerb', node: body, onClose: () => { if (!getSettings().onboarded) saveSettings({ onboarded: true }); } });
}
