// ============================================================
// storage.js — make the device-local data durable. By default a
// browser MAY evict a site's IndexedDB/localStorage under storage
// pressure. Requesting "persistent" storage marks Kerb's data as
// protected so the browser won't silently delete your shifts,
// expenses, payslips or scanned receipts. Safe no-op where the
// API is unsupported.
// ============================================================

// Ask the browser to keep this origin's storage permanently.
// Returns 'persisted' | 'best-effort' | 'unsupported'.
export async function ensurePersistentStorage() {
  try {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') return 'unsupported';
    if (navigator.storage.persisted && await navigator.storage.persisted()) return 'persisted';
    const granted = await navigator.storage.persist();
    return granted ? 'persisted' : 'best-effort';
  } catch { return 'unsupported'; }
}

// Report whether storage is persisted plus rough usage/quota (bytes).
export async function storageStatus() {
  const out = { supported: false, persisted: false, usage: 0, quota: 0 };
  try {
    if (navigator.storage && navigator.storage.persisted) {
      out.supported = true;
      out.persisted = await navigator.storage.persisted();
    }
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      out.usage = e.usage || 0; out.quota = e.quota || 0;
    }
  } catch {}
  return out;
}

export function fmtBytes(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
