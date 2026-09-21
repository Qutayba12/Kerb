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
  if (replace) { await Promise.all(STORES.map(clearStore)); }
  for (const o of (data.earnings || [])) await put('earnings', o);
  for (const o of (data.expenses || [])) await put('expenses', o);
  for (const o of (data.bills || [])) await put('bills', o);
  for (const o of (data.payslips || [])) await put('payslips', o);
  if (data.settings) {
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
  return true;
}

export async function wipeAll() {
  await Promise.all(STORES.map(clearStore));
}
