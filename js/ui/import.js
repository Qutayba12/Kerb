// ============================================================
// ui/import.js — import earnings/expenses from a platform CSV.
// Auto-detects columns, lets you remap, previews, then bulk-adds.
// ============================================================
import { el, uid, todayISO, fmtGBP, fmtNum } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, allPlatforms, platformById, EXPENSE_CATEGORIES } from '../store.js';
import { parseCSV, guessColumn, parseFlexDate, parseNum } from '../csv.js';
import { icon, field, selectInput, toast } from './shared.js';
import { bus } from '../bus.js';

let target = 'earnings';

export async function render() {
  const root = el('div');
  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 12px', text: 'Import CSV' }));
  root.append(el('div', { class: 'callout callout--info', html: `${icon('info')}<div>Export your weekly statement from Amazon Flex / Uber Eats (or any app) as CSV, then import it here. Kerb auto-detects the columns — you can adjust the mapping before importing.</div>` }));

  // target toggle
  const chips = el('div', { class: 'chips', style: 'margin-bottom:12px' });
  [['earnings', 'Earnings'], ['expenses', 'Expenses']].forEach(([v, l]) => {
    const c = el('button', { class: 'chip' + (target === v ? ' is-active' : ''), type: 'button', text: l });
    c.onclick = () => { target = v; if (parsed) renderMapping(); else bus.refresh(); chips.querySelectorAll('.chip').forEach(x => x.classList.toggle('is-active', x.textContent === l)); };
    chips.append(c);
  });
  root.append(el('div', {}, [el('div', { class: 'section-title', text: 'Import as' }), chips]));

  // file picker
  const fileInput = el('input', { type: 'file', accept: '.csv,text/csv', style: 'display:none' });
  const pick = el('button', { class: 'btn btn--primary btn--block', type: 'button' });
  pick.innerHTML = icon('upload') + '<span>Choose CSV file</span>';
  pick.onclick = () => fileInput.click();
  const out = el('div', { style: 'margin-top:14px' });
  root.append(pick, fileInput, out);

  let parsed = null;
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; if (!f) return;
    try {
      const text = await f.text();
      parsed = parseCSV(text);
      if (!parsed.headers.length || !parsed.rows.length) { toast('No rows found in that file', 'err'); parsed = null; return; }
      renderMapping();
    } catch (e) { toast('Could not read the file', 'err'); }
  });

  function renderMapping() {
    out.replaceChildren();
    const H = parsed.headers;
    const opts = [{ value: '-1', label: '— none —' }, ...H.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))];
    const sel = (keywords) => selectInput(opts, String(guessColumn(H, keywords)));

    const dateFmt = selectInput([{ value: 'auto', label: 'Auto-detect' }, { value: 'uk', label: 'UK (DD/MM/YYYY)' }, { value: 'us', label: 'US (MM/DD/YYYY)' }, { value: 'iso', label: 'ISO (YYYY-MM-DD)' }], 'auto');

    const map = {};
    const addMap = (key, label, keywords) => { const s = sel(keywords); map[key] = s; return field(label, s); };

    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'row row--between', style: 'margin-bottom:8px' }, [
      el('div', { style: 'font-weight:800', text: `${parsed.rows.length} rows found` }),
      el('span', { class: 'tiny faint', text: `${H.length} columns` }),
    ]));
    card.append(field('Date format', dateFmt));

    if (target === 'earnings') {
      const platformCol = sel(['platform', 'source', 'app', 'service']);
      map.platform = platformCol;
      const defPlatform = selectInput(allPlatforms().map(p => ({ value: p.id, label: p.name })), allPlatforms()[0].id);
      map._defPlatform = defPlatform;
      card.append(
        addMap('date', 'Date column', ['date', 'day', 'completed', 'week']),
        addMap('amount', 'Amount column', ['amount', 'earnings', 'pay', 'total', 'fare', 'net', 'gross', 'income', 'payout']),
        addMap('tips', 'Tips column', ['tip']),
        el('div', { class: 'grid-2' }, [addMap('hours', 'Hours column', ['hour', 'duration', 'online', 'engaged']), addMap('deliveries', 'Deliveries column', ['deliver', 'trip', 'order', 'drop', 'job'])]),
        addMap('miles', 'Miles column', ['mile', 'distance']),
        field('Platform column (optional)', platformCol),
        field('Default platform', defPlatform, 'Used when there is no platform column, or a row\'s platform is blank.'),
        addMap('notes', 'Notes column', ['note', 'description', 'memo']),
      );
    } else {
      const catCol = sel(['category', 'type']);
      map.category = catCol;
      const defCat = selectInput(EXPENSE_CATEGORIES.map(c => ({ value: c.id, label: c.label })), 'other');
      map._defCat = defCat;
      card.append(
        addMap('date', 'Date column', ['date', 'day']),
        addMap('amount', 'Amount column', ['amount', 'total', 'price', 'cost', 'paid']),
        addMap('vendor', 'Vendor column', ['vendor', 'merchant', 'supplier', 'payee', 'name', 'description']),
        field('Category column (optional)', catCol),
        field('Default category', defCat),
        addMap('notes', 'Notes column', ['note', 'memo']),
      );
    }
    out.append(card);

    // preview
    const preview = el('div');
    const renderPreview = () => {
      const recs = buildRecords(parsed, map, dateFmt.value, target, true);
      preview.replaceChildren();
      preview.append(el('div', { class: 'section-title', text: `Preview (first ${Math.min(3, recs.length)})` }));
      const pc = el('div', { class: 'card card--flush' });
      if (!recs.length) pc.append(el('div', { class: 'tiny muted', style: 'padding:12px', text: 'No valid rows with the current mapping — check the columns above.' }));
      recs.slice(0, 3).forEach(r => {
        pc.append(el('div', { class: 'item' }, [
          el('div', { class: 'item__main' }, [
            el('div', { class: 'item__title', text: target === 'earnings' ? platformById(r.platform).name : (r.vendor || 'Expense') }),
            el('div', { class: 'item__sub', text: [r.date || '(no date)', target === 'earnings' && r.miles ? `${fmtNum(r.miles)} mi` : '', target === 'earnings' && r.hours ? `${r.hours}h` : ''].filter(Boolean).join(' · ') }),
          ]),
          el('div', { class: 'item__amt', text: fmtGBP(r.amount + (r.tips || 0)) }),
        ]));
      });
      preview.append(pc);
    };
    [dateFmt, ...Object.values(map)].forEach(s => s.addEventListener && s.addEventListener('change', renderPreview));
    renderPreview();
    out.append(preview);

    // import button
    const go = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:12px' });
    go.innerHTML = icon('download') + `<span>Import ${target}</span>`;
    go.onclick = async () => {
      const recs = buildRecords(parsed, map, dateFmt.value, target, false);
      if (!recs.length) { toast('Nothing to import — check the mapping', 'err'); return; }
      go.disabled = true; go.querySelector('span').textContent = 'Importing…';
      const store = target === 'earnings' ? earnings : expenses;
      for (const r of recs) await store.save(r);
      toast(`Imported ${recs.length} ${target}`, 'ok');
      bus.navigate(target === 'earnings' ? 'income' : 'expenses');
    };
    out.append(go);
    out.append(el('div', { class: 'hint', style: 'margin-top:8px', text: 'Rows without a valid amount (or miles, for earnings) are skipped. Import again only if needed — duplicates are not auto-detected.' }));
  }

  return root;
}

function colVal(row, sel) { const i = parseInt(sel.value, 10); return i >= 0 ? (row[i] ?? '') : ''; }

function buildRecords(parsed, map, dateFmt, target, previewOnly) {
  const s = getSettings();
  const recs = [];
  const knownPlatforms = allPlatforms();
  for (const row of parsed.rows) {
    const date = parseFlexDate(colVal(row, map.date), dateFmt) || (previewOnly ? '' : todayISO());
    const amount = parseNum(colVal(row, map.amount));
    if (target === 'earnings') {
      const miles = map.miles ? parseNum(colVal(row, map.miles)) : 0;
      if (amount <= 0 && miles <= 0) continue;
      let platform = map._defPlatform.value;
      const pv = (colVal(row, map.platform) || '').toString().toLowerCase().trim();
      if (pv) { const hit = knownPlatforms.find(p => pv.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(pv)); if (hit) platform = hit.id; }
      recs.push({
        id: uid(), date: date || todayISO(), platform,
        amount, tips: map.tips ? parseNum(colVal(row, map.tips)) : 0,
        hours: map.hours ? parseNum(colVal(row, map.hours)) : 0,
        deliveries: map.deliveries ? Math.round(parseNum(colVal(row, map.deliveries))) : 0,
        miles, notes: (map.notes ? colVal(row, map.notes) : '').toString().slice(0, 120) || 'Imported',
      });
    } else {
      if (amount <= 0) continue;
      let category = map._defCat.value;
      const cv = (colVal(row, map.category) || '').toString().toLowerCase().trim();
      if (cv) { const hit = EXPENSE_CATEGORIES.find(c => cv.includes(c.id) || c.label.toLowerCase().includes(cv)); if (hit) category = hit.id; }
      recs.push({
        id: uid(), date: date || todayISO(), category, amount,
        vendor: (map.vendor ? colVal(row, map.vendor) : '').toString().slice(0, 80),
        bizPct: null, vat: 0, notes: (map.notes ? colVal(row, map.notes) : '').toString().slice(0, 120) || 'Imported',
        image: '', source: 'import',
      });
    }
  }
  return recs;
}
