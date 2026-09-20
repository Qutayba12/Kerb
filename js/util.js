// ============================================================
// util.js — formatting, dates, DOM helpers, UK tax-year math
// Money is stored as plain pounds (Number) and rounded to the
// penny at every boundary via round2() to stay penny-accurate.
// ============================================================

export const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export const GBP0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat('en-GB');

export function round2(n) {
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function fmtGBP(n, { round = false } = {}) {
  const v = Number(n) || 0;
  return round ? GBP0.format(Math.round(v)) : GBP.format(round2(v));
}
export function fmtNum(n, dp = 0) {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(Number(n) || 0);
}
export function fmtPct(n, dp = 1) {
  return (Number(n) || 0).toFixed(dp) + '%';
}
export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Parse a user-entered money string ("1,234.5", "£12.60") to a Number.
export function parseMoney(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const cleaned = String(str).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

// ---------- dates ----------
export function todayISO() { return toISO(new Date()); }
export function toISO(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(s, { withYear = false, weekday = false } = {}) {
  const d = parseISO(s);
  let out = `${d.getDate()} ${MON[d.getMonth()]}`;
  if (withYear) out += ` ${d.getFullYear()}`;
  if (weekday) out = `${DOW[d.getDay()]}, ` + out;
  return out;
}
export function dowName(s) { return DOW[parseISO(s).getDay()]; }
export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}
export function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); }
export function humanUntil(iso) {
  const d = daysBetween(todayISO(), iso);
  if (d < 0) return `${Math.abs(d)}d ago`;
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 31) return `in ${d}d`;
  const months = Math.round(d / 30);
  return `in ~${months}mo`;
}

// ---------- UK tax year (6 Apr – 5 Apr) ----------
export function taxYearOf(iso) {
  const d = parseISO(iso);
  const y = d.getFullYear();
  // April is month index 3; 6th is the boundary
  const beforeApr6 = (d.getMonth() < 3) || (d.getMonth() === 3 && d.getDate() < 6);
  const startYear = beforeApr6 ? y - 1 : y;
  return taxYearFromStart(startYear);
}
export function taxYearFromStart(startYear) {
  const start = `${startYear}-04-06`;
  const end = `${startYear + 1}-04-05`;
  const label = `${startYear}/${String(startYear + 1).slice(2)}`;
  return { startYear, start, end, label };
}
export function taxYearFromLabel(label) {
  const startYear = parseInt(String(label).split('/')[0], 10);
  return taxYearFromStart(startYear);
}
export function currentTaxYear() { return taxYearOf(todayISO()); }
export function inRange(iso, start, end) { return iso >= start && iso <= end; }
// Key Self Assessment deadlines for a given tax-year start year.
export function saDeadlines(startYear) {
  return {
    registerBy: `${startYear + 1}-10-05`,     // register with HMRC by 5 Oct after tax year
    paperFile: `${startYear + 1}-10-31`,      // paper return
    onlineFileAndPay: `${startYear + 2}-01-31`, // online file + balancing payment + 1st POA
    secondPOA: `${startYear + 2}-07-31`,      // 2nd payment on account
  };
}

// ---------- ids ----------
export function uid() {
  return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- DOM ----------
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== 'list') { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Group entries (with .date) by ISO day, newest first.
export function groupByDay(items) {
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.date)) map.set(it.date, []);
    map.get(it.date).push(it);
  }
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

// Read any File to base64 (no data: prefix) + its media type. Used for PDFs.
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      const comma = s.indexOf(',');
      resolve({ base64: comma >= 0 ? s.slice(comma + 1) : s, mediaType: file.type || 'application/octet-stream' });
    };
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

// Resize an image File to a JPEG data URL bounded by maxDim (keeps cost/storage low).
export function fileToResizedDataURL(file, maxDim = 1568, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}
