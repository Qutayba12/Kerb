// ============================================================
// db.js — thin IndexedDB wrapper. Everything is stored locally
// on the device; nothing is ever sent to a server.
// Stores:
//   earnings : { id, date, platform, amount, tips, hours, deliveries, miles, notes }
//   expenses : { id, date, category, amount, vendor, bizPct, vat, notes, source, image }
//   bills    : { id, name, amount, freq, category, bizPct, business, nextDue }
//   payslips : { id, payDate, frequency, gross, net, incomeTax, ... employer/employee }
// ============================================================
const DB_NAME = 'kerb';
const DB_VERSION = 2;
const STORES = ['earnings', 'expenses', 'bills', 'payslips'];

let _dbP = null;
function open() {
  if (_dbP) return _dbP;
  _dbP = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const os = db.createObjectStore(name, { keyPath: 'id' });
          os.createIndex('date', 'date', { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbP;
}

function tx(store, mode = 'readonly') {
  return open().then(db => db.transaction(store, mode).objectStore(store));
}
function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const os = await tx(store);
  const items = await reqP(os.getAll());
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
export async function get(store, id) { return reqP((await tx(store)).get(id)); }
export async function put(store, obj) { await reqP((await tx(store, 'readwrite')).put(obj)); return obj; }
export async function del(store, id) { await reqP((await tx(store, 'readwrite')).delete(id)); }
export async function clearStore(store) { await reqP((await tx(store, 'readwrite')).clear()); }

// Convenience accessors
export const earnings = {
  all: () => getAll('earnings'),
  get: (id) => get('earnings', id),
  save: (o) => put('earnings', o),
  remove: (id) => del('earnings', id),
};
export const expenses = {
  all: () => getAll('expenses'),
  get: (id) => get('expenses', id),
  save: (o) => put('expenses', o),
  remove: (id) => del('expenses', id),
};
export const bills = {
  all: () => getAll('bills'),
  get: (id) => get('bills', id),
  save: (o) => put('bills', o),
  remove: (id) => del('bills', id),
};
export const payslips = {
  all: async () => (await getAll('payslips')).sort((a, b) => (a.payDate < b.payDate ? 1 : a.payDate > b.payDate ? -1 : 0)),
  get: (id) => get('payslips', id),
  save: (o) => put('payslips', o),
  remove: (id) => del('payslips', id),
};


// ---------- validation ----------
// Backups can be hand-edited, truncated, or written by an older version, and a
// scan can return an odd value. A single bad field must never poison the totals
// (a string amount once silently zeroed a whole tax year), so everything that
// reaches a store is coerced to a sane type first.
const MAX_MONEY = 1e9;
export function num(v) {
  const x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(x)) return 0;
  return Math.max(-MAX_MONEY, Math.min(MAX_MONEY, x));
}
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const str = (v, n = 200) => (v == null ? '' : String(v)).slice(0, n);
const newId = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pct = (v) => Math.max(0, Math.min(100, num(v)));

function cleanEarning(o) {
  if (!o || typeof o !== 'object' || !isDate(o.date)) return null;
  return { ...o, id: str(o.id, 60) || newId(), date: o.date,
    platform: str(o.platform, 40) || 'amazonflex', vehicleId: str(o.vehicleId, 60),
    amount: num(o.amount), tips: num(o.tips), hours: num(o.hours), miles: num(o.miles),
    deliveries: Math.round(num(o.deliveries)), notes: str(o.notes, 300) };
}
function cleanExpense(o) {
  if (!o || typeof o !== 'object' || !isDate(o.date)) return null;
  return { ...o, id: str(o.id, 60) || newId(), date: o.date,
    category: str(o.category, 40) || 'other', amount: num(o.amount), vat: num(o.vat),
    bizPct: o.bizPct == null ? null : pct(o.bizPct),
    vendor: str(o.vendor, 120), notes: str(o.notes, 300) };
}
function cleanBill(o) {
  if (!o || typeof o !== 'object') return null;
  return { ...o, id: str(o.id, 60) || newId(), name: str(o.name, 80) || 'Bill',
    amount: num(o.amount), bizPct: pct(o.bizPct),
    nextDue: isDate(o.nextDue) ? o.nextDue : new Date().toISOString().slice(0, 10) };
}
function cleanPayslip(o) {
  if (!o || typeof o !== 'object' || !isDate(o.payDate)) return null;
  const out = { ...o, id: str(o.id, 60) || newId(), payDate: o.payDate };
  for (const k of ['gross', 'net', 'incomeTax', 'nationalInsurance', 'pension', 'studentLoan',
    'otherDeductions', 'ytdGross', 'ytdTax', 'ytdNI', 'ytdPension', 'hours', 'hourlyRate', 'annualSalary']) out[k] = num(o[k]);
  return out;
}
const CLEANERS = { earnings: cleanEarning, expenses: cleanExpense, bills: cleanBill, payslips: cleanPayslip };

// ---------- backup / restore ----------
export async function exportAll() {
  const [e, x, b, ps] = await Promise.all([getAll('earnings'), getAll('expenses'), getAll('bills'), getAll('payslips')]);
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('kerb.settings.v1') || '{}'); } catch {}
  // Never include the API key or the device PIN in an exported backup file.
  settings = { ...settings, apiKey: '', pinHash: '', pinSalt: '', lockEnabled: false };
  return { app: 'kerb', version: 2, exportedAt: new Date().toISOString(), settings, earnings: e, expenses: x, bills: b, payslips: ps };
}

export async function importAll(data, { replace = true } = {}) {
  if (!data || data.app !== 'kerb') throw new Error('Not a Kerb backup file');
  const arr = (v) => (Array.isArray(v) ? v : []);

  // Validate and clean EVERYTHING first. Nothing on the device is touched until
  // the file is known to be usable — a bad import must never wipe real records
  // and leave nothing in their place.
  const clean = {};
  let offered = 0;
  for (const name of STORES) {
    const rows = arr(data[name]);
    offered += rows.length;
    clean[name] = rows.map(CLEANERS[name]).filter(Boolean);
  }
  const kept = STORES.reduce((t, n) => t + clean[n].length, 0);
  if (offered > 0 && kept === 0) throw new Error('No readable records in that file — nothing was changed.');

  if (replace) await Promise.all(STORES.map(clearStore));
  for (const name of STORES) for (const o of clean[name]) await put(name, o);

  if (data.settings && typeof data.settings === 'object') {
    // Preserve this device's own API key and PIN lock; backups never carry them.
    let cur = {};
    try { cur = JSON.parse(localStorage.getItem('kerb.settings.v1') || '{}'); } catch {}
    const merged = {
      ...data.settings,
      apiKey: cur.apiKey || '',
      pinHash: cur.pinHash || '', pinSalt: cur.pinSalt || '', lockEnabled: !!cur.lockEnabled,
      autoLockMins: cur.autoLockMins != null ? cur.autoLockMins : (data.settings.autoLockMins != null ? data.settings.autoLockMins : 2),
    };
    localStorage.setItem('kerb.settings.v1', JSON.stringify(merged));
  }
  return { imported: kept, skipped: offered - kept };
}

export async function wipeAll() {
  await Promise.all(STORES.map(clearStore));
}
