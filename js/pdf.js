// ============================================================
// pdf.js — save any built document as a clean PDF, fully offline
// and with NO third-party libraries. The node is rendered in a
// dedicated print container and the browser's Print dialog is
// opened ("Save as PDF"). This works inside an installed PWA,
// where opening a new window is blocked.
// ============================================================
import { el } from './util.js';

// Print (→ Save as PDF) a built sheet node. `title` becomes the
// default PDF file name in the browser's save dialog.
export function printSheet(sheetNode, { title = 'Kerb' } = {}) {
  // Clear any stale container from a previous run.
  document.querySelectorAll('.print-doc').forEach(n => n.remove());

  const holder = el('div', { class: 'print-doc' }, [sheetNode]);
  document.body.append(holder);

  const prevTitle = document.title;
  document.title = title;                 // default PDF file name
  document.body.classList.add('is-printing');

  let done = false;
  const cleanup = () => {
    if (done) return; done = true;
    document.body.classList.remove('is-printing');
    holder.remove();
    document.title = prevTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  // Let layout settle, open the dialog, and guarantee cleanup even
  // if `afterprint` never fires (some mobile browsers).
  setTimeout(() => {
    try { window.print(); } catch {}
    setTimeout(cleanup, 60000);
  }, 80);
}

// ---------- reusable document builders ----------
// A branded A4-style sheet shell with a title + subtitle.
export function docSheet({ title = 'Kerb', subtitle = '' } = {}) {
  const sheet = el('div', { class: 'report card' });
  sheet.append(el('div', { class: 'report__head' }, [
    el('div', {}, [
      el('div', { class: 'report__title', text: title }),
      subtitle ? el('div', { class: 'report__sub', text: subtitle }) : null,
    ]),
    el('div', { class: 'report__brand' }, [el('img', { src: 'icons/icon.svg', width: 34, height: 34, alt: '' }), el('span', { text: 'Kerb' })]),
  ]));
  return sheet;
}

export function docSection(title) { return el('div', { class: 'report__section', text: title }); }

// A multi-column data table. `headers` is a string[]; `rows` is an
// array of string[] (first column left-aligned, the rest right).
export function dataTable(headers, rows, { lastStrong = false } = {}) {
  const t = el('table', { class: 'brk report__table report__data' });
  if (headers && headers.length) {
    const tr = el('tr', { class: 'report__dhead' });
    headers.forEach((h, i) => tr.append(el('th', { text: h, style: i ? 'text-align:right' : '' })));
    t.append(tr);
  }
  rows.forEach((r, ri) => {
    const strong = lastStrong && ri === rows.length - 1;
    const tr = el('tr', { class: strong ? 'total' : '' });
    r.forEach((c, i) => tr.append(el('td', { text: String(c), style: i ? 'text-align:right;white-space:nowrap' : '' })));
    t.append(tr);
  });
  return t;
}

export function docFoot(text) { return el('div', { class: 'report__foot', text }); }
