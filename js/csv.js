// ============================================================
// csv.js — a small, dependency-free CSV parser + helpers for
// importing platform earnings/expenses statements.
// ============================================================

// Parse CSV text into { headers, rows }. Handles quotes, escaped
// quotes (""), commas and newlines inside quoted fields, and BOM.
export function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const all = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') { inQ = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); all.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); all.push(row); }
  const clean = all.filter(r => r.some(x => String(x).trim() !== ''));
  const headers = clean.length ? clean[0].map(h => h.trim()) : [];
  return { headers, rows: clean.slice(1) };
}

// Guess which column index best matches a set of keywords.
export function guessColumn(headers, keywords) {
  const low = headers.map(h => h.toLowerCase());
  for (const kw of keywords) {
    const i = low.findIndex(h => h.includes(kw));
    if (i >= 0) return i;
  }
  return -1;
}

// Parse a flexible date string to YYYY-MM-DD. fmt: 'auto' | 'uk' | 'us' | 'iso'.
export function parseFlexDate(str, fmt = 'auto') {
  let s = String(str || '').trim();
  if (!s) return '';
  s = s.split(/[ T]/)[0]; // drop time part
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
    return `${m[1]}-${pad(m[2])}-${pad(m[3])}`; // ISO-ish
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    let day, mon;
    if (fmt === 'uk') { day = a; mon = b; }
    else if (fmt === 'us') { mon = a; day = b; }
    else { // auto
      if (a > 12) { day = a; mon = b; }
      else if (b > 12) { mon = a; day = b; }
      else { day = a; mon = b; } // UK default for the ambiguous case
    }
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return '';
    return `${y}-${pad(mon)}-${pad(day)}`;
  }
  // fallback: let Date try
  const d = new Date(s);
  if (!isNaN(d)) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return '';
}
function pad(n) { return String(n).padStart(2, '0'); }

export function parseNum(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}
