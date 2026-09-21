// ============================================================
// lock.js — optional PIN lock for the app.
// The PIN is never stored in plain text: we keep a SHA-256 hash
// of (salt + PIN) plus a random salt, both on this device only.
// This gates casual access (someone picking up your phone); it is
// NOT full encryption of the data at rest — that's made clear in
// the Settings copy.
// ============================================================
import { el } from './util.js';
import { getSettings, saveSettings } from './store.js';
import { openSheet, closeSheet, toast } from './ui/shared.js';
import { translate, isRTL } from './i18n.js';

const PIN_LEN = 4;
let unlocked = false;
let hiddenAt = 0;
let overlay = null; // active full-screen lock element

export function cryptoOk() { return !!(window.crypto && crypto.subtle && crypto.getRandomValues); }
export function lockConfigured(s = getSettings()) { return !!(s.lockEnabled && s.pinHash && s.pinSalt); }
export function isUnlocked() { return unlocked || !lockConfigured(); }

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomSalt() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
// constant-time-ish string compare
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function setPin(pin) {
  const salt = randomSalt();
  const hash = await sha256Hex(salt + ':' + pin);
  saveSettings({ lockEnabled: true, pinHash: hash, pinSalt: salt });
  unlocked = true;
}
export async function verifyPin(pin, s = getSettings()) {
  if (!s.pinSalt || !s.pinHash) return false;
  return safeEqual(await sha256Hex(s.pinSalt + ':' + pin), s.pinHash);
}
export function disableLock() {
  saveSettings({ lockEnabled: false, pinHash: '', pinSalt: '' });
  unlocked = true;
}

// ---------- PIN pad component ----------
// onComplete(value, api) — api.reset(), api.message(text, isError), api.disable(bool)
function pinPad({ title, sub, onComplete, onBack }) {
  let entered = '';
  let locked = false;
  const dots = el('div', { class: 'pin-dots' });
  const msg = el('div', { class: 'pin-msg tiny' });
  const renderDots = () => dots.replaceChildren(
    ...Array.from({ length: PIN_LEN }, (_, i) => el('span', { class: 'pin-dot' + (i < entered.length ? ' is-on' : '') })),
  );
  const api = {
    reset: () => { entered = ''; renderDots(); },
    message: (t, err) => { msg.textContent = t || ''; msg.style.color = err ? 'var(--neg)' : 'var(--muted)'; },
    disable: (v) => { locked = v; },
  };
  const press = (d) => {
    if (locked || entered.length >= PIN_LEN) return;
    entered += d; renderDots(); api.message('');
    if (entered.length === PIN_LEN) { const v = entered; setTimeout(() => onComplete(v, api), 120); }
  };
  const del = () => { if (locked) return; entered = entered.slice(0, -1); renderDots(); };
  const keyBtn = (label, fn, cls = '') => {
    const b = el('button', { class: 'pin-key ' + cls, type: 'button', text: label });
    b.onclick = fn; return b;
  };
  const pad = el('div', { class: 'pin-pad' });
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(d => pad.append(keyBtn(d, () => press(d))));
  pad.append(onBack ? keyBtn('‹', onBack, 'pin-key--fn') : el('span'));
  pad.append(keyBtn('0', () => press('0')));
  pad.append(keyBtn('⌫', del, 'pin-key--fn'));

  const wrap = el('div', { class: 'pin' }, [
    el('div', { class: 'pin-title', text: title || 'Enter PIN' }),
    sub ? el('div', { class: 'pin-sub tiny muted', text: sub }) : null,
    dots, msg, pad,
  ]);
  renderDots();
  return { wrap, api };
}

// ---------- unlock gate (called on boot / after auto-lock) ----------
export function ensureUnlocked() {
  return new Promise((resolve) => {
    // Fail open if Web Crypto is unavailable (e.g. insecure context) so a PIN
    // set earlier can never permanently lock the user out.
    if (isUnlocked() || !cryptoOk()) { unlocked = true; resolve(); return; }
    if (overlay) return; // already showing (shouldn't happen)
    let attempts = 0;
    const { wrap, api } = pinPad({
      title: 'Enter your PIN',
      sub: 'Kerb is locked',
      onComplete: async (v) => {
        if (await verifyPin(v)) {
          unlocked = true; hiddenAt = 0;
          if (overlay) { overlay.remove(); overlay = null; }
          document.body.style.overflow = '';
          resolve();
        } else {
          attempts++; api.reset();
          if (attempts >= 5) {
            api.disable(true); api.message('Too many tries — wait a few seconds.', true);
            setTimeout(() => { api.disable(false); api.message('Try again.', false); }, 4000);
          } else {
            api.message('Wrong PIN — try again.', true);
          }
        }
      },
    });
    overlay = el('div', { class: 'lockscreen' }, [wrap]);
    document.body.append(overlay);
    document.body.style.overflow = 'hidden';
    if (isRTL()) translate(overlay);
  });
}

// Re-lock now (used by auto-lock).
export function relock() {
  if (!lockConfigured()) return;
  unlocked = false;
}

// Lock again after the app has been in the background long enough.
export function installAutoLock(onRelocked) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    const s = getSettings();
    if (!lockConfigured(s) || !unlocked) return;
    const mins = s.autoLockMins == null ? 2 : s.autoLockMins;
    if (hiddenAt && Date.now() - hiddenAt >= mins * 60000) {
      unlocked = false;
      ensureUnlocked().then(() => { if (typeof onRelocked === 'function') onRelocked(); });
    }
  });
}

// ---------- Settings flows ----------
// Set a brand-new PIN (enter, then confirm).
export function openPinSetup(onDone) {
  const mount = el('div');
  let first = null;
  let queuedMsg = '';
  function go(mode) {
    const { wrap, api } = pinPad({
      title: mode === 'set' ? 'Choose a 4-digit PIN' : 'Confirm your PIN',
      sub: mode === 'set' ? 'You\'ll enter this to open Kerb' : 'Enter it again',
      onComplete: async (v) => {
        if (mode === 'set') { first = v; go('confirm'); }
        else if (safeEqual(v, first)) { await setPin(v); closeSheet(); toast('PIN set — Kerb now locks when opened', 'ok'); if (onDone) onDone(); }
        else { first = null; queuedMsg = 'PINs didn\'t match — start again.'; go('set'); }
      },
      onBack: mode === 'confirm' ? () => { first = null; go('set'); } : null,
    });
    mount.replaceChildren(wrap);
    if (queuedMsg) { api.message(queuedMsg, true); queuedMsg = ''; }
    if (isRTL()) translate(mount);
  }
  go('set');
  openSheet({ title: 'Set a PIN', node: mount });
}

// Verify the current PIN, then run onOk (used before disabling or changing).
export function openPinVerify(onOk, { title = 'Enter your current PIN' } = {}) {
  const mount = el('div');
  let attempts = 0;
  const { wrap, api } = pinPad({
    title,
    onComplete: async (v) => {
      if (await verifyPin(v)) { closeSheet(); onOk(); }
      else { attempts++; api.reset(); api.message(attempts >= 5 ? 'Too many tries.' : 'Wrong PIN.', true); }
    },
  });
  mount.append(wrap);
  if (isRTL()) translate(mount);
  openSheet({ title: 'Confirm PIN', node: mount });
}
