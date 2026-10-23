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
import { t } from './i18n.js';

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
// Fire a given notification key at most once ever (for deadline milestones).
// ISO-ish week stamp, so a weekly nudge fires at most once per week even if
// the app is opened every day.
function weekStamp(d = new Date()) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7));     // back to Monday
  return t.toISOString().slice(0, 10);
}
function onceThisWeek(key) {
  const l = log(); const w = weekStamp();
  if (l[key] === w) return false;
  l[key] = w; saveLog(l); return true;
}
function onceEver(key) {
  const l = log();
  if (l[key]) return false;
  l[key] = 1; saveLog(l); return true;
}

export async function showNotification(title, body, tag = 'kerb') {
  if (!canNotify()) return false;
  // A notification is built outside the document, so the DOM translator never
  // sees it. Put both strings through the dictionary here instead.
  title = t(title); body = t(body);
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
function lastEarningDate(allE) {
  let best = '';
  for (const e of allE || []) if (e && e.date && e.date > best) best = e.date;
  return best || null;
}
// Days since the last recorded earning. Before anything is logged, measure
// from the day trading started instead, so a new driver is still reminded.
function daysSinceLastEarning(allE, s) {
  const last = lastEarningDate(allE) || s.seStartDate;
  if (!last) return null;
  const d = daysBetween(last, todayISO());
  return d >= 0 ? d : null;
}

export async function runChecks() {
  const s = getSettings();
  if (!s.notifyEnabled || !canNotify()) return;
  const [allE, allX] = await Promise.all([earnings.all(), expenses.all()]);

  // 1) HMRC deadlines — nudge once at each milestone (≈2 months, 1 month,
  //    2 weeks, 1 week, 3 days, 1 day, due day), then once if it slips overdue.
  //    Each milestone fires only once ever, so no daily nagging.
  const sum = computeTaxYear(allE, allX, s);
  const d = sum.deadlines;
  const BUCKETS = [0, 1, 3, 7, 14, 30, 60];
  const candidates = [
    ['register', 'Register with HMRC as self-employed', d.registerBy],
    ['file', 'File & pay your Self Assessment', d.onlineFileAndPay],
    ['poa2', '2nd payment on account due', d.secondPOA, sum.poa.applies],
  ];
  for (const [key, label, date, only] of candidates) {
    if (only === false) continue;
    const days = daysBetween(todayISO(), date);
    if (days < 0) {
      // Overdue — one nudge in the first 45 days past the deadline.
      if (days >= -45 && onceEver('deadline-overdue-' + key + '-' + date)) {
        await showNotification('Kerb — action needed', `${label} is overdue (was ${fmtDate(date, { withYear: true })}). File as soon as you can to limit penalties.`, 'kerb-deadline');
        break;
      }
      continue;
    }
    const bucket = BUCKETS.find(b => days <= b); // tightest milestone still ahead
    if (bucket != null && onceEver('deadline-' + key + '-' + date + '-' + bucket)) {
      const when = days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} left`;
      await showNotification('Kerb reminder', `${label} — due ${fmtDate(date, { withYear: true })} (${when}).`, 'kerb-deadline');
      break; // one deadline reminder per run is enough
    }
  }

  // 2) Capture nudge — Wednesday mornings, and only when there is a gap.
  // The platforms show earnings on screen with no download and trim their
  // history, so what is not captured is eventually unrecoverable. A nudge
  // that fires whether or not anything is missing gets ignored within a
  // month, and is then silent in the week it actually matters — so this
  // stays quiet while the records are current.
  const now = new Date();
  const isWednesdayMorning = now.getDay() === 3 && now.getHours() >= 9;
  if (isWednesdayMorning) {
    const since = daysSinceLastEarning(allE, s);
    if (since != null && since >= (s.captureGapDays || 7) && onceThisWeek('capture-nudge')) {
      const last = lastEarningDate(allE);
      await showNotification(
        'Capture your earnings',
        last
          ? `Nothing logged since ${fmtDate(last, { withYear: true })} — ${since} days. Your platform only keeps recent history and you cannot download it, so capture it before it goes.`
          : `No earnings logged yet. Your platform only keeps recent history and you cannot download it, so capture it before it goes.`,
        'kerb-capture');
    }
  }

  // 3) Goal nudge near the end of the period if not yet met
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
