// ============================================================
// ui/shared.js — reusable UI primitives: toast, bottom sheet,
// confirm dialog, icons, and small builders.
// ============================================================
import { el, todayISO } from '../util.js';
import { translate, isRTL } from '../i18n.js';
import { exportAll } from '../db.js';
import { saveSettings } from '../store.js';

// ---------- icons (inline SVG path data) ----------
const ICONS = {
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  bag: '<path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 16V8h4a2.5 2.5 0 0 1 0 5H9"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="1.6"/><circle cx="16.5" cy="16.5" r="1.6"/>',
  shirt: '<path d="M8 3 4 6l2 3 2-1v10h8V8l2 1 2-3-4-3-2 2H10L8 3Z"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01M8 19h6"/>',
  note: '<path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/>',
  fuel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M4 21h12"/><path d="M15 9h2a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0 2-2V8l-3-3"/>',
  shield: '<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z"/>',
  wrench: '<path d="M14 7a4 4 0 0 1-5 5l-5 5 3 3 5-5a4 4 0 0 0 5-5l-2 2-3-1-1-3 2-2Z"/>',
  road: '<path d="M6 3 3 21M18 3l3 18M12 4v2M12 10v2M12 16v2"/>',
  spray: '<path d="M9 11h7v9H9z"/><path d="M9 11V6h3V3"/><path d="M16 6h1M19 5h1M18 8h1"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  car: '<path d="M5 16 6 9h12l1 7"/><path d="M3 16h18v3h-2v-2M5 19H3v-3"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="M14 6l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
  check: '<path d="M5 12l5 5L20 6"/>',
  download: '<path d="M12 3v12M7 11l5 4 5-4"/><path d="M4 20h16"/>',
  upload: '<path d="M12 21V9M7 13l5-4 5 4"/><path d="M4 4h16"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8 16 16 8"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M16 12h3"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};
export function icon(name, cls = '') {
  // width/height default to 1em for inline use; CSS rules (.btn svg, .tile svg…) override where set.
  return `<svg class="${cls}" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;flex:none">${ICONS[name] || ICONS.dots}</svg>`;
}

// ---------- toast ----------
export function toast(msg, type = '') {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: 'toast ' + (type ? 'toast--' + type : '') });
  if (type === 'ok') t.innerHTML = icon('check');
  else if (type === 'err') t.innerHTML = icon('warn');
  t.append(document.createTextNode(msg));
  if (isRTL()) translate(t);
  root.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, type === 'err' ? 3800 : 2400);
}

// ---------- bottom sheet ----------
let activeSheet = null;
export function openSheet({ title, node, onClose, wide = false } = {}) {
  closeSheet();
  const root = document.getElementById('sheet-root');
  const backdrop = el('div', { class: 'sheet-backdrop' });
  const sheet = el('div', { class: 'sheet' });
  const head = el('div', { class: 'sheet__head' }, [
    el('div', { class: 'sheet__title', text: title || '' }),
    el('button', { class: 'sheet__close', type: 'button', html: '&times;', onclick: () => closeSheet() }),
  ]);
  sheet.append(el('div', { class: 'sheet__grip' }), head);
  if (node) sheet.append(node);
  backdrop.append(sheet);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });
  if (isRTL()) translate(sheet);
  root.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('is-open'));
  activeSheet = { backdrop, onClose };
  document.body.style.overflow = 'hidden';
  return { close: closeSheet, sheet };
}
export function closeSheet() {
  if (!activeSheet) return;
  const { backdrop, onClose } = activeSheet;
  activeSheet = null;
  document.body.style.overflow = '';
  backdrop.classList.remove('is-open');
  setTimeout(() => backdrop.remove(), 260);
  if (typeof onClose === 'function') onClose();
}

// ---------- confirm ----------
export function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    // Guard against double-resolve: closing the sheet also fires onClose,
    // so whichever settles first wins and the rest are ignored.
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const body = el('div');
    if (message) body.append(el('p', { class: 'muted', text: message, style: 'margin-top:0' }));
    const btns = el('div', { class: 'btn-grid', style: 'margin-top:8px' }, [
      el('button', { class: 'btn btn--sub', type: 'button', text: 'Cancel', onclick: () => { finish(false); closeSheet(); } }),
      el('button', { class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary'), type: 'button', text: confirmText, onclick: () => { finish(true); closeSheet(); } }),
    ]);
    body.append(btns);
    openSheet({ title, node: body, onClose: () => finish(false) });
  });
}

// ---------- builders ----------
export function field(labelText, control, hint) {
  const f = el('div', { class: 'field' });
  if (labelText) f.append(el('label', { text: labelText }));
  f.append(control);
  if (hint) f.append(el('div', { class: 'hint', html: hint }));
  return f;
}
export function moneyInput(attrs = {}) {
  const wrap = el('div', { class: 'input-prefix' }, [
    el('span', { text: '£' }),
    el('input', { class: 'input input--money', type: 'text', inputMode: 'decimal', autocomplete: 'off', ...attrs }),
  ]);
  wrap.input = wrap.querySelector('input');
  return wrap;
}
export function selectInput(options, value, attrs = {}) {
  const sel = el('select', { class: 'select', ...attrs });
  for (const o of options) {
    const opt = el('option', { value: o.value, text: o.label });
    if (String(o.value) === String(value)) opt.selected = true;
    sel.append(opt);
  }
  return sel;
}
export function emptyState(iconName, title, sub) {
  return el('div', { class: 'empty' }, [
    el('div', { html: icon(iconName) }),
    el('h3', { text: title }),
    el('div', { class: 'tiny', text: sub || '' }),
  ]);
}
export function pill(text, kind = 'brand') { return `<span class="pill pill--${kind}">${text}</span>`; }

// Export all data to a JSON file and record when — used by Settings and the
// Home backup reminder so a backup is always one tap away. The API key and PIN
// are never included (db.exportAll strips them).
export async function downloadBackup() {
  try {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `kerb-backup-${todayISO()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    saveSettings({ lastBackupAt: new Date().toISOString() });
    toast('Backup downloaded', 'ok');
    return true;
  } catch (e) { toast('Could not export backup', 'err'); return false; }
}
