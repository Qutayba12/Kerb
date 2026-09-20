// ============================================================
// ui/settings.js — everything configurable + Claude key + data.
// Most controls auto-save; calculations refresh where relevant.
// ============================================================
import { el, uid, todayISO, fmtGBP } from '../util.js';
import {
  getSettings, saveSettings, resetSettings, getConfig, availableYears,
  VEHICLE_LABELS, REGION_LABELS, DEFAULT_PLATFORMS, TAX_YEARS,
} from '../store.js';
import { exportAll, importAll, wipeAll } from '../db.js';
import { icon, field, selectInput, moneyInput, toast, confirmDialog, openSheet, closeSheet } from './shared.js';
import { testKey } from '../claude.js';
import { setLang } from '../i18n.js';
import { bus } from '../bus.js';

const SL_PLANS = [
  { value: 'none', label: 'None' }, { value: 'plan1', label: 'Plan 1' }, { value: 'plan2', label: 'Plan 2' },
  { value: 'plan4', label: 'Plan 4 (Scotland)' }, { value: 'plan5', label: 'Plan 5' }, { value: 'postgrad', label: 'Postgraduate' },
];
const MODELS = [
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast, cheapest)' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (most capable)' },
];

export async function render() {
  const s = getSettings();
  const root = el('div');
  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 14px', text: 'Settings' }));

  // ---------- Tax basis ----------
  root.append(sec('Tax basis'));
  root.append(card([
    field('Region', bindSelect('region', Object.entries(REGION_LABELS).map(([v, l]) => ({ value: v, label: l })), true)),
    field('Vehicle', bindSelect('vehicle', Object.entries(VEHICLE_LABELS).map(([v, l]) => ({ value: v, label: l })), true)),
    field('Expense method', bindSelect('expenseMethod', [{ value: 'mileage', label: 'Simplified mileage' }, { value: 'actual', label: 'Actual costs' }], true),
      s.expenseMethod === 'mileage' ? 'Claim a flat rate per business mile.' : 'Claim the business share of real vehicle costs.'),
    field('Working tax year', bindSelect('taxYear', availableYears().map(y => ({ value: y, label: y })), true)),
    field('Self-employment start date', bindDate('seStartDate'), 'Used for your HMRC registration reminder.'),
    field('Your name (for SA report)', bindText('traderName'), 'Optional — appears on the printable report.'),
    field('UTR (for SA report)', bindText('utr'), 'Optional Unique Taxpayer Reference.'),
  ]));

  // ---------- Income context ----------
  root.append(sec('Your income context'));
  const payslipsBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-bottom:6px' });
  payslipsBtn.innerHTML = icon('note') + '<span>Manage payslips (scan / PDF)</span>';
  payslipsBtn.onclick = () => bus.navigate('payslips');
  root.append(card([
    field('PAYE figures from', bindSelect('payeSource', [{ value: 'manual', label: 'A manual salary' }, { value: 'payslips', label: 'My scanned payslips' }], true), 'Choose “scanned payslips” to auto-fill your PAYE salary & tax from uploaded payslips.'),
    payslipsBtn,
    field(s.payeSource === 'payslips' ? 'PAYE salary (auto from payslips)' : 'PAYE salary (annual, gross)', bindMoney('payeSalary', true), s.payeSource === 'payslips' ? 'Derived from your payslips — edit them to change this.' : 'Your employed job\'s yearly pay before tax. Delivery profit is taxed on top of this.'),
    field('Income tax already paid via PAYE', bindMoney('payeTaxPaid', true), 'Optional — improves the payments-on-account estimate.'),
    field('Other taxable income (annual)', bindMoney('otherIncome', true), 'Rent, other self-employment, etc.'),
    field('Student loan plan', bindSelect('studentLoanPlan', SL_PLANS, true)),
    field('Use of home (hours/month)', bindNumber('homeOfficeHoursPerMonth', true, { min: 0, max: 744, step: 1 }), 'Simplified flat-rate relief if you do admin from home (25h+/month).'),
  ]));

  // ---------- Money pots ----------
  root.append(sec('Money pots'));
  const potMode = bindSelect('taxPotMode', [{ value: 'auto', label: 'Auto — live estimate' }, { value: 'manual', label: 'Manual — fixed %' }], true);
  const manualWrap = field('Manual tax %', bindNumber('taxPotManualPct', true, { min: 0, max: 60, step: 1 }));
  const syncManual = () => { manualWrap.style.display = getSettings().taxPotMode === 'manual' ? '' : 'none'; };
  potMode.addEventListener('change', syncManual);
  root.append(card([
    field('Tax pot mode', potMode),
    manualWrap,
    field('Vehicle pot (£/week)', bindMoney('vehiclePotPerWeek', true), 'Set aside weekly for fuel, servicing, insurance renewal.'),
    field('Savings goal (£/week)', bindMoney('savingsGoalPerWeek', true)),
  ]));
  syncManual();

  // ---------- Claude ----------
  root.append(sec('Receipt scanning (Claude)'));
  root.append(claudeCard(s));

  // ---------- Platforms ----------
  root.append(sec('Platforms'));
  root.append(platformsCard());

  // ---------- Advanced: tax rates ----------
  root.append(sec('Tax rates (advanced)'));
  root.append(ratesCard());

  // ---------- Appearance ----------
  root.append(sec('Appearance'));
  const themeSel = selectInput([{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], s.theme);
  themeSel.addEventListener('change', () => { saveSettings({ theme: themeSel.value }); bus.applyTheme(); });
  const langSel = selectInput([{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }], s.lang || 'en');
  langSel.addEventListener('change', () => { if (langSel.value !== (getSettings().lang || 'en')) setLang(langSel.value); });
  root.append(card([field('Theme', themeSel), field('Language', langSel, 'العربية تبدّل الواجهة إلى اليمين-لليسار.')]));

  // ---------- Data ----------
  root.append(sec('Your data'));
  root.append(dataCard());

  // ---------- About ----------
  root.append(el('div', { class: 'callout callout--brand', style: 'margin-top:16px', html: `${icon('info')}<div><b>Kerb</b> keeps everything on this device — your entries never leave it, except a receipt image you choose to scan, which goes only to Anthropic via your own key. Figures are estimates to help you budget; confirm on your HMRC Self Assessment.</div>` }));

  return root;
}

// ---------------- binders (auto-save) ----------------
function bindSelect(key, options, refresh) {
  const s = getSettings();
  const sel = selectInput(options, s[key]);
  sel.addEventListener('change', () => { saveSettings({ [key]: sel.value }); if (refresh) bus.refresh(); else toast('Saved', 'ok'); });
  return sel;
}
function bindMoney(key, refresh) {
  const s = getSettings();
  const m = moneyInput({ value: s[key] || '' });
  m.input.addEventListener('change', () => { saveSettings({ [key]: parseFloat(String(m.input.value).replace(/[^0-9.\-]/g, '')) || 0 }); if (refresh) bus.refresh(); });
  return m;
}
function bindNumber(key, refresh, { min, max, step } = {}) {
  const s = getSettings();
  const inp = el('input', { class: 'input', type: 'number', value: s[key] ?? '', inputMode: 'decimal' });
  if (min != null) inp.min = min; if (max != null) inp.max = max; if (step != null) inp.step = step;
  inp.addEventListener('change', () => { saveSettings({ [key]: parseFloat(inp.value) || 0 }); if (refresh) bus.refresh(); });
  return inp;
}
function bindText(key) {
  const s = getSettings();
  const inp = el('input', { class: 'input', type: 'text', value: s[key] || '', autocomplete: 'off' });
  inp.addEventListener('change', () => saveSettings({ [key]: inp.value.trim() }));
  return inp;
}
function bindDate(key) {
  const s = getSettings();
  const inp = el('input', { class: 'input', type: 'date', value: s[key] || '', max: todayISO() });
  inp.addEventListener('change', () => { saveSettings({ [key]: inp.value }); });
  return inp;
}

// ---------------- Claude card ----------------
function claudeCard(s) {
  const keyInput = el('input', { class: 'input', type: 'password', value: s.apiKey || '', placeholder: 'sk-ant-…', autocomplete: 'off' });
  const show = el('button', { class: 'btn btn--sm btn--sub', type: 'button', text: 'Show' });
  show.onclick = () => { keyInput.type = keyInput.type === 'password' ? 'text' : 'password'; show.textContent = keyInput.type === 'password' ? 'Show' : 'Hide'; };
  const saveBtn = el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Save key' });
  const testBtn = el('button', { class: 'btn btn--sub btn--sm', type: 'button', text: 'Test' });
  const clearBtn = el('button', { class: 'btn btn--sub btn--sm', type: 'button', text: 'Clear' });
  const status = el('div', { class: 'tiny', style: 'margin-top:8px' });

  saveBtn.onclick = () => { saveSettings({ apiKey: keyInput.value.trim() }); status.textContent = 'Key saved on this device.'; status.style.color = 'var(--pos)'; toast('Key saved', 'ok'); };
  clearBtn.onclick = () => { keyInput.value = ''; saveSettings({ apiKey: '' }); status.textContent = 'Key removed.'; status.style.color = 'var(--muted)'; };
  testBtn.onclick = async () => {
    saveSettings({ apiKey: keyInput.value.trim() });
    status.textContent = 'Testing…'; status.style.color = 'var(--muted)';
    try { await testKey(getSettings()); status.textContent = '✓ Key works.'; status.style.color = 'var(--pos)'; }
    catch (e) { status.textContent = '✗ ' + e.message; status.style.color = 'var(--neg)'; }
  };

  const modelSel = selectInput(MODELS, s.claudeModel);
  modelSel.addEventListener('change', () => saveSettings({ claudeModel: modelSel.value }));

  return card([
    field('Anthropic API key', el('div', {}, [keyInput, el('div', { class: 'row', style: 'gap:8px;margin-top:8px' }, [saveBtn, testBtn, clearBtn, show])]),
      'Get a key at <b>console.anthropic.com</b> → API keys, and add a little credit. Stored only on this device; sent only to Anthropic.'),
    status,
    field('Model', modelSel, 'Haiku 4.5 is plenty for receipts and the cheapest.'),
  ]);
}

// ---------------- Platforms ----------------
function platformsCard() {
  const s = getSettings();
  const wrap = el('div', { class: 'card' });
  const list = el('div', { class: 'chips', style: 'margin-bottom:12px' });
  DEFAULT_PLATFORMS.forEach(p => list.append(el('span', { class: 'chip', style: `border-color:${p.color};color:${p.color}`, text: p.name })));
  (s.customPlatforms || []).forEach(p => {
    const chip = el('span', { class: 'chip', style: `border-color:${p.color};color:${p.color}` });
    chip.append(document.createTextNode(p.name + '  '));
    const x = el('button', { class: 'link', type: 'button', text: '✕', style: 'color:inherit' });
    x.onclick = async () => {
      const cur = getSettings().customPlatforms.filter(cp => cp.id !== p.id);
      saveSettings({ customPlatforms: cur }); toast('Removed', 'ok'); bus.refresh();
    };
    chip.append(x); list.append(chip);
  });
  wrap.append(list);

  const name = el('input', { class: 'input', type: 'text', placeholder: 'Add platform (e.g. Stuart)' });
  const color = el('input', { type: 'color', value: '#0f8a74', style: 'width:44px;height:44px;border:none;background:none;padding:0' });
  const add = el('button', { class: 'btn btn--sm btn--primary', type: 'button', text: 'Add' });
  add.onclick = () => {
    const nm = name.value.trim(); if (!nm) return;
    const p = { id: 'c' + uid(), name: nm, color: color.value, kind: 'other' };
    saveSettings({ customPlatforms: [...(getSettings().customPlatforms || []), p] });
    name.value = ''; toast('Platform added', 'ok'); bus.refresh();
  };
  wrap.append(el('div', { class: 'row', style: 'gap:8px' }, [name, color, add]));
  return wrap;
}

// ---------------- Tax rates editor ----------------
function ratesCard() {
  const s = getSettings();
  const year = s.taxYear;
  const cfg = getConfig(year);
  const wrap = el('div', { class: 'card' });
  wrap.append(el('div', { class: 'tiny muted', style: 'margin-bottom:10px', text: `Editing ${year}. Changes are saved as overrides for this year only.` }));

  const rows = [
    ['personalAllowance', 'Personal allowance (£)', cfg.personalAllowance],
    ['mileageFirst', 'Mileage rate — first 10k (£/mile)', cfg.mileage.car.firstRate],
    ['mileageThen', 'Mileage rate — over 10k (£/mile)', cfg.mileage.car.thenRate],
    ['class4Main', 'Class 4 NIC main rate (0–1)', cfg.class4.mainRate],
    ['class4Upper', 'Class 4 NIC upper rate (0–1)', cfg.class4.upperRate],
    ['tradingAllowance', 'Trading allowance (£)', cfg.tradingAllowance],
  ];
  const inputs = {};
  rows.forEach(([k, label, val]) => {
    const inp = el('input', { class: 'input', type: 'number', step: 'any', value: val });
    inputs[k] = inp;
    wrap.append(field(label, inp));
  });

  const saveBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button', text: 'Save rate overrides' });
  saveBtn.onclick = () => {
    const override = {
      personalAllowance: num(inputs.personalAllowance.value),
      tradingAllowance: num(inputs.tradingAllowance.value),
      class4: { mainRate: num(inputs.class4Main.value), upperRate: num(inputs.class4Upper.value) },
      mileage: { car: { firstRate: num(inputs.mileageFirst.value), thenRate: num(inputs.mileageThen.value) } },
    };
    const all = { ...(getSettings().rateOverrides || {}) };
    all[year] = override;
    saveSettings({ rateOverrides: all });
    toast('Rates updated', 'ok'); bus.refresh();
  };
  const resetBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button', text: 'Reset this year to defaults', style: 'margin-top:8px' });
  resetBtn.onclick = () => {
    const all = { ...(getSettings().rateOverrides || {}) }; delete all[year];
    saveSettings({ rateOverrides: all }); toast('Reset to defaults', 'ok'); bus.refresh();
  };
  wrap.append(saveBtn, resetBtn);
  return wrap;
}
function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }

// ---------------- Data ----------------
function dataCard() {
  const wrap = el('div', { class: 'card' });
  const csvBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button' });
  csvBtn.innerHTML = icon('upload') + '<span>Import platform CSV</span>';
  csvBtn.onclick = () => bus.navigate('import');
  wrap.append(csvBtn, el('hr', { class: 'soft' }));
  const exportBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button' });
  exportBtn.innerHTML = icon('download') + '<span>Export backup (JSON)</span>';
  exportBtn.onclick = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `kerb-backup-${todayISO()}.json` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup downloaded', 'ok');
  };

  const importInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  const importBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-top:8px' });
  importBtn.innerHTML = icon('upload') + '<span>Import backup</span>';
  importBtn.onclick = () => importInput.click();
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0]; if (!file) return;
    const ok = await confirmDialog({ title: 'Import backup?', message: 'This replaces all current data on this device.', confirmText: 'Import', danger: true });
    if (!ok) return;
    try {
      const data = JSON.parse(await file.text());
      await importAll(data, { replace: true });
      toast('Backup imported', 'ok');
      // reload so imported settings (held in memory) take effect cleanly
      setTimeout(() => location.reload(), 600);
    } catch (e) { toast('Import failed: ' + e.message, 'err'); }
  });

  const wipeBtn = el('button', { class: 'btn btn--danger btn--block', type: 'button', style: 'margin-top:8px' });
  wipeBtn.innerHTML = icon('trash') + '<span>Delete all data</span>';
  wipeBtn.onclick = async () => {
    const ok = await confirmDialog({ title: 'Delete everything?', message: 'All shifts, expenses and bills will be permanently removed from this device. Settings are kept.', confirmText: 'Delete all', danger: true });
    if (!ok) return;
    await wipeAll(); toast('All data deleted', 'ok'); bus.refresh();
  };

  wrap.append(exportBtn, importInput, importBtn, wipeBtn);
  return wrap;
}

// ---------------- small helpers ----------------
function sec(t) { return el('div', { class: 'section-title', text: t }); }
function card(children) { return el('div', { class: 'card' }, children); }
