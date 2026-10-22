// ============================================================
// db.js — thin IndexedDB wrapper. Everything is stored locally
// on the device; nothing is ever sent to a server.
// Stores:
//   earnings : { id, date, platform, amount, tips, hours, deliveries, miles, notes }
//   expenses : { id, date, category, amount, vendor, bizPct, vat, notes, source, image }
//   bills    : { id, name, amount, freq, category, bizPct, business, nextDue }
//   payslips : { id, payDate, frequency, gross, net, incomeTax, ... employer/employee }
// ============================================================
import { sanitiseSettings } from './store.js';

const DB_NAME = 'kerb';
const DB_VERSION = 3;
const STORES = ['earnings', 'expenses', 'bills', 'payslips'];
// Receipt and payslip photos live in their own store, keyed by the record id.
// Keeping them inside the records meant every screen that asked for expenses
// pulled tens of megabytes of base64 it never looked at (150 receipts =
// ~44MB per call, a 136MB JS heap). Only the edit forms need the picture, so
// it is fetched on demand.
const IMAGES = 'images';
const IMAGE_OWNERS = ['expenses', 'payslips'];
const ALL_STORES = [...STORES, IMAGES];

let _dbP = null;
function open() {
  if (_dbP) return _dbP;
  _dbP = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const upgradeTx = req.transaction;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const os = db.createObjectStore(name, { keyPath: 'id' });
          os.createIndex('date', 'date', { unique: false });
        }
      }
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES, { keyPath: 'id' });

      // v2 -> v3: lift any photo already stored inside a record into the new
      // image store, so existing installs get the speed-up without losing a
      // single receipt.
      if (ev.oldVersion > 0 && ev.oldVersion < 3 && upgradeTx) {
        const imgs = upgradeTx.objectStore(IMAGES);
        for (const name of IMAGE_OWNERS) {
          if (!db.objectStoreNames.contains(name)) continue;
          upgradeTx.objectStore(name).openCursor().onsuccess = (e) => {
            const cur = e.target.result;
            if (!cur) return;
            const rec = cur.value;
            if (rec && typeof rec.image === 'string' && rec.image.length) {
              imgs.put({ id: rec.id, data: rec.image });
              const { image, ...rest } = rec;
              cur.update({ ...rest, hasImage: true });
            }
            cur.continue();
          };
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

// ---------- photos (loaded only when a form actually shows one) ----------
export async function getImage(id) {
  if (!id) return '';
  const r = await reqP((await tx(IMAGES)).get(id));
  return (r && r.data) || '';
}
export async function putImage(id, data) {
  if (!id) return;
  if (!data) return delImage(id);
  await reqP((await tx(IMAGES, 'readwrite')).put({ id, data }));
}
export async function delImage(id) {
  if (!id) return;
  await reqP((await tx(IMAGES, 'readwrite')).delete(id));
}

// Save a record that may carry a photo. `image` is only acted on when the
// caller actually provides it, so editing a record without touching its
// picture never silently drops the picture.
async function saveWithImage(store, obj) {
  const rec = { ...obj };
  if ('image' in rec) {
    const img = rec.image;
    delete rec.image;
    if (typeof img === 'string' && img) { await putImage(rec.id, img); rec.hasImage = true; }
    else { await delImage(rec.id); rec.hasImage = false; }
  }
  await put(store, rec);
  return rec;
}
async function removeWithImage(store, id) {
  await del(store, id);
  await delImage(id);
}

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
  save: (o) => saveWithImage('expenses', o),
  remove: (id) => removeWithImage('expenses', id),
  image: (id) => getImage(id),
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
  save: (o) => saveWithImage('payslips', o),
  remove: (id) => removeWithImage('payslips', id),
  image: (id) => getImage(id),
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
  let [e, x, b, ps] = await Promise.all([getAll('earnings'), getAll('expenses'), getAll('bills'), getAll('payslips')]);
  // Photos live apart at rest, but a backup must still be a complete copy, so
  // re-attach them here. The file format is unchanged.
  const imgRows = await reqP((await tx(IMAGES)).getAll());
  const imgs = new Map((imgRows || []).map(r => [r.id, r.data]));
  const attach = (rows) => rows.map(r => (imgs.has(r.id) ? { ...r, image: imgs.get(r.id) } : r));
  x = attach(x); ps = attach(ps);
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

  if (replace) await Promise.all(ALL_STORES.map(clearStore));
  for (const name of STORES) {
    for (const o of clean[name]) {
      const rec = { ...o };
      const img = rec.image;
      delete rec.image;
      if (IMAGE_OWNERS.includes(name) && typeof img === 'string' && img) {
        await putImage(rec.id, img);
        rec.hasImage = true;
      }
      await put(name, rec);
    }
  }

  if (data.settings && typeof data.settings === 'object') {
    // Preserve this device's own API key and PIN lock; backups never carry them.
    let cur = {};
    try { cur = JSON.parse(localStorage.getItem('kerb.settings.v1') || '{}'); } catch {}
    const merged = {
      ...sanitiseSettings(data.settings),
      apiKey: cur.apiKey || '',
      pinHash: cur.pinHash || '', pinSalt: cur.pinSalt || '', lockEnabled: !!cur.lockEnabled,
      autoLockMins: cur.autoLockMins != null ? cur.autoLockMins : (data.settings.autoLockMins != null ? data.settings.autoLockMins : 2),
    };
    localStorage.setItem('kerb.settings.v1', JSON.stringify(merged));
  }
  return { imported: kept, skipped: offered - kept };
}

export async function wipeAll() {
  await Promise.all(ALL_STORES.map(clearStore));
}
