// ============================================================
// ui/settings.js — everything configurable + Claude key + data.
// Most controls auto-save; calculations refresh where relevant.
// ============================================================
import { el, uid, todayISO, fmtGBP } from '../util.js';
import {
  getSettings, saveSettings, resetSettings, getConfig, availableYears,
  VEHICLE_LABELS, REGION_LABELS, DEFAULT_PLATFORMS, TAX_YEARS, allVehicles,
} from '../store.js';
import { importAll, wipeAll } from '../db.js';
import { ensurePersistentStorage, storageStatus, fmtBytes } from '../storage.js';
import { icon, field, selectInput, moneyInput, toast, confirmDialog, openSheet, closeSheet, downloadBackup } from './shared.js';
import { testKey } from '../claude.js';
import { setLang } from '../i18n.js';
import { lockConfigured, cryptoOk, openPinSetup, openPinVerify, disableLock } from '../lock.js';
import { bus } from '../bus.js';

const SL_PLANS = [
  { value: 'none', label: 'None' }, { value: 'plan1', label: 'Plan 1' }, { value: 'plan2', label: 'Plan 2' },
  { value: 'plan4', label: 'Plan 4 (Scotland)' }, { value: 'plan5', label: 'Plan 5' }, { value: 'postgrad', label: 'Postgraduate' },
];
const MODELS = [
  { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fast, cheapest)' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (most capable)' },
];

export async function render() {
  const s = getSettings();
  const root = el('div');
  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 14px', text: 'Settings' }));

  // ---------- Getting started guide ----------
  const guideBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-bottom:14px' });
  guideBtn.innerHTML = icon('check') + '<span>Getting started guide & checklist</span>';
  guideBtn.onclick = () => bus.navigate('guide');
  root.append(guideBtn);

  // ---------- Tax basis ----------
  root.append(sec('Tax basis'));
  root.append(card([
    field('Region', bindSelect('region', Object.entries(REGION_LABELS).map(([v, l]) => ({ value: v, label: l })), true)),
    field('Vehicle', bindSelect('vehicle', Object.entries(VEHICLE_LABELS).map(([v, l]) => ({ value: v, label: l })), true)),
    field('Expense method', bindSelect('expenseMethod', [{ value: 'mileage', label: 'Simplified mileage' }, { value: 'actual', label: 'Actual costs' }], true),
      s.expenseMethod === 'mileage' ? 'Claim a flat rate per business mile.' : 'Claim the business share of real vehicle costs.'),
    field('Working tax year', bindSelect('taxYear', availableYears().map(y => ({ value: y, label: y })), true)),
    lossReliefRow(),
    field('Self-employment start date', bindDate('seStartDate'), 'Used for your HMRC registration reminder.'),
    field('Your name (for SA report)', bindText('traderName'), 'Optional — appears on the printable report.'),
    field('UTR (for SA report)', bindText('utr'), 'Optional Unique Taxpayer Reference.'),
  ]));

  // ---------- Vehicles ----------
  root.append(sec('Vehicles'));
  root.append(vehiclesCard());

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
  root.append(card([field('Theme', themeSel), field('Language', langSel, 'Arabic switches the interface to right-to-left.')]));

  // ---------- Privacy & security ----------
  root.append(sec('Privacy & security'));
  root.append(securityCard());

  // ---------- Data ----------
  root.append(sec('Your data'));
  root.append(dataCard());

  // ---------- About ----------
  root.append(el('div', { class: 'callout callout--brand', style: 'margin-top:16px', html: `${icon('info')}<div><b>Kerb</b> keeps everything on this device — your entries never leave it. Only a file you choose to scan is sent: straight to Anthropic when you have added your own key, otherwise via Kerb's endpoint using the free allowance. Figures are estimates to help you budget; confirm on your HMRC Self Assessment.</div>` }));
  const termsBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-top:10px' });
  termsBtn.innerHTML = icon('note') + '<span>Terms of use & privacy</span>';
  termsBtn.onclick = () => bus.navigate('terms');
  root.append(termsBtn);

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
  DEFAULT_PLATFORMS.forEach(p => list.append(el('span', { class: 'chip', style: `border-color:${p.color};color:var(--text)`, html: `<span style="width:9px;height:9px;border-radius:50%;background:${p.color};display:inline-block"></span>${p.name}` })));
  (s.customPlatforms || []).forEach(p => {
    const chip = el('span', { class: 'chip', style: `border-color:${p.color};color:var(--text)` });
    chip.append(document.createTextNode(p.name + '  '));
    const x = el('button', { class: 'link', type: 'button', text: '✕', style: 'color:inherit' });
    x.onclick = async () => {
      const cur = getSettings().customPlatforms.filter(cp => cp.id !== p.id);
      saveSettings({ customPlatforms: cur }); toast('Removed', 'ok'); bus.refresh();
    };
    chip.append(x); list.append(chip);
  });
  wrap.append(list);

  const name = el('input', { class: 'input', type: 'text', placeholder: 'Add platform (e.g. Stuart)', 'aria-label': 'New platform name' });
  const color = el('input', { type: 'color', value: '#0f8a74', 'aria-label': 'New platform colour', style: 'width:44px;height:44px;border:none;background:none;padding:0' });
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

// ---------------- Privacy & security ----------------
function securityCard() {
  const wrap = el('div', { class: 'card' });

  if (!cryptoOk()) {
    wrap.append(el('div', { class: 'callout callout--warn', style: 'margin:0', html: `${icon('info')}<div>The app lock needs a secure connection (https). Open Kerb from its installed icon or the https link to use it.</div>` }));
    return wrap;
  }

  const on = lockConfigured();
  wrap.append(el('div', { class: 'row row--between', style: 'margin-bottom:10px' }, [
    el('div', {}, [
      el('div', { style: 'font-weight:800', html: `${icon('shield')} App lock (PIN)` }),
      el('div', { class: 'tiny muted', text: on ? 'On — a PIN is required to open Kerb.' : 'Off — anyone with your phone can open Kerb.' }),
    ]),
    el('span', { class: `pill pill--${on ? 'ok' : 'warn'}`, text: on ? 'On' : 'Off' }),
  ]));

  if (!on) {
    const setBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button' });
    setBtn.innerHTML = icon('shield') + '<span>Set up a PIN</span>';
    setBtn.onclick = () => openPinSetup(() => bus.refresh());
    wrap.append(setBtn);
  } else {
    // auto-lock timing
    const opts = [
      { value: '0', label: 'Immediately' }, { value: '1', label: 'After 1 minute' },
      { value: '2', label: 'After 2 minutes' }, { value: '5', label: 'After 5 minutes' }, { value: '15', label: 'After 15 minutes' },
    ];
    const cur = String(getSettings().autoLockMins == null ? 2 : getSettings().autoLockMins);
    const sel = selectInput(opts, cur);
    sel.addEventListener('change', () => { saveSettings({ autoLockMins: parseInt(sel.value, 10) || 0 }); toast('Saved', 'ok'); });
    wrap.append(field('Lock when left in the background', sel));

    const changeBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-top:4px' });
    changeBtn.innerHTML = icon('edit') + '<span>Change PIN</span>';
    changeBtn.onclick = () => openPinVerify(() => openPinSetup(() => bus.refresh()));

    const offBtn = el('button', { class: 'btn btn--danger btn--block', type: 'button', style: 'margin-top:8px' });
    offBtn.innerHTML = icon('trash') + '<span>Turn off app lock</span>';
    offBtn.onclick = () => openPinVerify(() => { disableLock(); toast('App lock turned off', 'ok'); bus.refresh(); });

    wrap.append(changeBtn, offBtn);
  }

  wrap.append(el('div', { class: 'callout callout--info', style: 'margin:12px 0 0', html: `${icon('info')}<div>The PIN keeps casual snoopers out. Your data still lives <b>unencrypted</b> on this device, so keep your phone's own screen lock on and export a backup now and then. If you forget the PIN, you'll need to clear the app's data to get back in.</div>` }));
  return wrap;
}

// ---------------- Data ----------------
function dataCard() {
  const wrap = el('div', { class: 'card' });

  // Storage durability: show whether the browser will keep the data permanently.
  const storageRow = el('div', { style: 'margin-bottom:10px' });
  wrap.append(storageRow);
  (async () => {
    const st = await storageStatus();
    storageRow.replaceChildren();
    if (!st.supported) {
      storageRow.append(el('div', { class: 'callout callout--info', style: 'margin:0', html: `${icon('info')}<div>Your records are stored on this device. Export a backup now and then so nothing is lost.</div>` }));
      return;
    }
    const used = st.usage ? ` · ${fmtBytes(st.usage)} used` : '';
    if (st.persisted) {
      storageRow.append(el('div', { class: 'callout callout--brand', style: 'margin:0', html: `${icon('check')}<div><b>Storage is permanent.</b> Your records won't be auto-deleted by the browser${used}. Still export a backup occasionally — it's the only copy off this device.</div>` }));
    } else {
      const box = el('div', { class: 'callout callout--warn', style: 'margin:0', html: `${icon('warn')}<div><b>Make storage permanent.</b> The browser could clear this app's data under storage pressure${used}. Tap below to protect it — on iPhone, also add Kerb to your Home Screen.</div>` });
      const b = el('button', { class: 'btn btn--primary btn--sm', type: 'button', style: 'margin-top:10px', text: 'Protect my data' });
      b.onclick = async () => { const r = await ensurePersistentStorage(); toast(r === 'persisted' ? 'Storage is now permanent' : 'Add Kerb to your Home Screen, then try again', r === 'persisted' ? 'ok' : 'warn'); bus.refresh(); };
      box.append(b);
      storageRow.append(box);
    }
  })();

  const csvBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button' });
  csvBtn.innerHTML = icon('upload') + '<span>Import platform CSV</span>';
  csvBtn.onclick = () => bus.navigate('import');
  wrap.append(csvBtn, el('hr', { class: 'soft' }));
  const exportBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button' });
  exportBtn.innerHTML = icon('download') + '<span>Export backup (JSON)</span>';
  exportBtn.onclick = () => downloadBackup();

  const importInput = el('input', { type: 'file', accept: 'application/json,.json', 'aria-label': 'Choose a backup file to import', style: 'display:none' });
  const importBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-top:8px' });
  importBtn.innerHTML = icon('upload') + '<span>Import backup</span>';
  importBtn.onclick = () => importInput.click();
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0]; if (!file) return;
    const ok = await confirmDialog({ title: 'Import backup?', message: 'This replaces all current data on this device.', confirmText: 'Import', danger: true });
    if (!ok) return;
    try {
      const data = JSON.parse(await file.text());
      const r = await importAll(data, { replace: true });
      toast(r && r.skipped ? `Imported ${r.imported} records · ${r.skipped} unreadable skipped` : 'Backup imported', r && r.skipped ? 'warn' : 'ok');
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

// ---------------- Loss relief ----------------
function lossReliefRow() {
  const s = getSettings();
  const cb = el('input', { type: 'checkbox' }); cb.checked = s.lossRelief !== false;
  cb.addEventListener('change', () => { saveSettings({ lossRelief: cb.checked }); toast('Saved', 'ok'); bus.refresh(); });
  return el('label', { class: 'switch-row' }, [
    el('div', {}, [
      el('div', { style: 'font-weight:700', text: 'Carry losses forward' }),
      el('div', { class: 'tiny faint', text: 'A loss-making year is set against later profits of the same trade, cutting Income Tax and Class 4 NIC.' }),
    ]),
    el('span', { class: 'switch' }, [cb, el('span', { class: 'track' })]),
  ]);
}

// ---------------- Vehicles ----------------
function vehiclesCard() {
  const s = getSettings();
  const wrap = el('div', { class: 'card' });
  const list = allVehicles();
  const explicit = Array.isArray(s.vehicles) && s.vehicles.length > 0;

  wrap.append(el('div', { class: 'callout callout--info', style: 'margin:0 0 10px', html: `${icon('info')}<div>HMRC gives <b>each vehicle</b> its own first 10,000 business miles at the higher rate. Add a vehicle if you changed car or use more than one — then pick the vehicle when you log a shift.</div>` }));

  const rows = el('div', { class: 'card card--flush', style: 'margin:0 0 10px' });
  list.forEach(v => {
    const item = el('div', { class: 'item' }, [
      el('div', { class: 'item__icon', style: 'background:var(--brand-tint);color:var(--brand)', html: icon('route') }),
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: v.label }),
        el('div', { class: 'item__sub', text: VEHICLE_LABELS[v.type] || v.type }),
      ]),
    ]);
    if (explicit && list.length > 1) {
      const del = el('button', { class: 'link tiny', type: 'button', text: 'Remove' });
      del.onclick = async () => {
        const ok = await confirmDialog({ title: 'Remove vehicle?', message: 'Shifts logged against it will fall back to your first vehicle.', confirmText: 'Remove', danger: true });
        if (!ok) return;
        saveSettings({ vehicles: (getSettings().vehicles || []).filter(x => x.id !== v.id) });
        toast('Vehicle removed', 'ok'); bus.refresh();
      };
      item.append(del);
    }
    rows.append(item);
  });
  wrap.append(rows);

  const add = el('button', { class: 'btn btn--sub btn--block', type: 'button' });
  add.innerHTML = icon('plus') + '<span>Add a vehicle</span>';
  add.onclick = () => openVehicleForm();
  wrap.append(add);
  return wrap;
}

function openVehicleForm() {
  const form = el('form', { class: 'kform', autocomplete: 'off' });
  const label = el('input', { class: 'input', type: 'text', placeholder: 'e.g. Corsa (AB12 CDE)' });
  const type = selectInput(Object.entries(VEHICLE_LABELS).map(([v, l]) => ({ value: v, label: l })), 'car');
  form.append(field('Name', label, 'Anything that helps you tell them apart.'), field('Type', type));
  const save = () => {
    const cur = getSettings();
    const list = Array.isArray(cur.vehicles) ? cur.vehicles.slice() : [];
    // The first explicit vehicle keeps the existing default as vehicle #1, so
    // shifts already logged stay attached to the same vehicle.
    if (!list.length) list.push({ id: 'default', label: VEHICLE_LABELS[cur.vehicle] || 'Vehicle', type: cur.vehicle || 'car' });
    list.push({ id: 'v' + Date.now().toString(36), label: label.value.trim() || (VEHICLE_LABELS[type.value] || 'Vehicle'), type: type.value });
    saveSettings({ vehicles: list });
    closeSheet(); toast('Vehicle added', 'ok'); bus.refresh();
  };
  form.append(el('div', { style: 'margin-top:16px' }, [el('button', { class: 'btn btn--primary btn--block', type: 'submit', text: 'Add vehicle' })]));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); save(); });
  openSheet({ title: 'Add a vehicle', node: form });
}

// ---------------- small helpers ----------------
function sec(t) { return el('div', { class: 'section-title', text: t }); }
function card(children) { return el('div', { class: 'card' }, children); }
