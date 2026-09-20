// ============================================================
// notify.js — local reminders. Kerb has no server, so these are
// on-device notifications: they fire while the app is open (and,
// where supported, via periodic background sync). Honest scope.
// ============================================================
import { getSettings } from './store.js';
import { earnings, expenses } from './db.js';
import { computeTaxYear } from './tax.js';
import { computeGoal, PERIOD_LABELS } from './goals.js';
import { daysBetween, todayISO, fmtGBP, fmtDate } from './util.js';

const LOG_KEY = 'kerb.notifyLog';

export function notifySupported() { return 'Notification' in window; }
export function notifyPermission() { return notifySupported() ? Notification.permission : 'unsupported'; }
export async function requestNotifyPermission() {
  if (!notifySupported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}
export function canNotify() { return notifySupported() && Notification.permission === 'granted'; }

function log() { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}'); } catch { return {}; } }
function saveLog(l) { try { localStorage.setItem(LOG_KEY, JSON.stringify(l)); } catch {} }
// Only fire a given notification key once per day.
function onceToday(key) {
  const l = log(); const today = todayISO();
  if (l[key] === today) return false;
  l[key] = today; saveLog(l); return true;
}

export async function showNotification(title, body, tag = 'kerb') {
  if (!canNotify()) return false;
  const opts = { body, tag, icon: 'icons/icon.svg', badge: 'icons/icon.svg', renotify: false };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(title, opts); return true; }
    }
    new Notification(title, opts); return true;
  } catch { return false; }
}

// Check deadlines + goal and fire at most one useful reminder per day each.
export async function runChecks() {
  const s = getSettings();
  if (!s.notifyEnabled || !canNotify()) return;
  const [allE, allX] = await Promise.all([earnings.all(), expenses.all()]);

  // 1) HMRC deadline approaching (within 30 days)
  const sum = computeTaxYear(allE, allX, s);
  const d = sum.deadlines;
  const candidates = [
    ['register', 'Register with HMRC as self-employed', d.registerBy],
    ['file', 'File & pay your Self Assessment', d.onlineFileAndPay],
    ['poa2', '2nd payment on account due', d.secondPOA, sum.poa.applies],
  ];
  for (const [key, label, date, only] of candidates) {
    if (only === false) continue;
    const days = daysBetween(todayISO(), date);
    if (days >= 0 && days <= 30 && onceToday('deadline-' + key + '-' + date)) {
      await showNotification('Kerb reminder', `${label} — due ${fmtDate(date, { withYear: true })} (${days}d left).`, 'kerb-deadline');
      break; // one deadline reminder a day is enough
    }
  }

  // 2) Goal nudge near the end of the period if not yet met
  if (s.goalEnabled && s.goalAmount > 0) {
    const g = computeGoal(allE, allX, s);
    const endDays = daysBetween(todayISO(), g.range.end);
    if (!g.met && g.current > 0 && endDays >= 0 && endDays <= 1 && onceToday('goal-' + g.range.end)) {
      await showNotification('Almost there', `${fmtGBP(g.remaining)} to go to hit your ${PERIOD_LABELS[g.period].toLowerCase()} goal.`, 'kerb-goal');
    }
  }
}

// Best-effort background nudges on Android installed PWAs. Registered only
// when reminders are enabled; unregistered when turned off.
export async function registerPeriodicSync() {
  try {
    if (!getSettings().notifyEnabled || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => ({ state: 'denied' }));
      if (status.state === 'granted') {
        await reg.periodicSync.register('kerb-daily', { minInterval: 24 * 60 * 60 * 1000 });
      }
    }
  } catch {}
}
export async function unregisterPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && 'periodicSync' in reg) await reg.periodicSync.unregister('kerb-daily');
  } catch {}
}
