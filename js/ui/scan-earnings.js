// ============================================================
// ui/scan-earnings.js — scan a photo or upload a PDF of a
// platform earnings statement (Amazon Flex, Uber Eats, …);
// Claude extracts the shifts and you bulk-add them.
// ============================================================
import { el, uid, todayISO, fmtGBP, fmtNum, fmtDate, fileToResizedDataURL, fileToBase64 } from '../util.js';
import { earnings } from '../db.js';
import { getSettings, allPlatforms, platformById } from '../store.js';
import { extractEarnings, hasApiKey } from '../claude.js';
import { icon, toast } from './shared.js';
import { makeDupChecker } from '../dedupe.js';
import { bus } from '../bus.js';

let extracted = null; // array of entries pending confirmation

export async function render() {
  const s = getSettings();
  extracted = null; // fresh each visit
  const root = el('div');
  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 12px', text: 'Scan earnings' }));
  root.append(el('div', { class: 'callout callout--brand', html: `${icon('spark')}<div>Scan a photo or upload the <b>PDF</b> of your Amazon Flex / Uber Eats (or any) earnings statement — Claude reads each shift (date, pay, tips, hours, miles) so you can add them all at once.</div>` }));

  if (!hasApiKey(s)) {
    root.append(el('div', { class: 'callout callout--warn', html: `${icon('info')}<div>Add your Anthropic API key in Settings to scan statements. You can still add earnings manually or import a CSV.</div>` }));
    const b = el('button', { class: 'btn btn--primary btn--block', type: 'button', text: 'Open Settings' }); b.onclick = () => bus.navigate('settings');
    root.append(b);
    return root;
  }

  // Flag shifts that match ones already saved, so an overlapping statement
  // (e.g. re-importing last week) doesn't double-count income.
  const existingE = await earnings.all();
  const dupChecker = makeDupChecker(existingE, []);

  const photoInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
  const fileInput = el('input', { type: 'file', accept: 'application/pdf,image/*', style: 'display:none' });
  const status = el('div', { class: 'scan-status', hidden: true });
  const photoBtn = el('button', { class: 'btn btn--primary', type: 'button' }); photoBtn.innerHTML = icon('camera') + '<span>Scan photo</span>';
  const pdfBtn = el('button', { class: 'btn btn--sub', type: 'button' }); pdfBtn.innerHTML = icon('note') + '<span>Upload PDF / file</span>';
  photoBtn.onclick = () => photoInput.click();
  pdfBtn.onclick = () => fileInput.click();
  const preview = el('div', { style: 'margin-top:14px' });

  async function handle(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    status.hidden = false; status.style.color = 'var(--muted)';
    status.innerHTML = `<span class="splash__spin"></span> Claude is reading the statement…`;
    photoBtn.disabled = pdfBtn.disabled = true; preview.replaceChildren();
    try {
      let source;
      if (isPdf) { const { base64 } = await fileToBase64(file); source = { kind: 'pdf', base64 }; }
      else { source = { kind: 'image', dataUrl: await fileToResizedDataURL(file, 1600, 0.85) }; }
      const context = { today: todayISO(), platforms: allPlatforms().map(p => ({ id: p.id, name: p.name })) };
      const rows = await extractEarnings(source, context, getSettings());
      status.hidden = true;
      if (!rows.length) { toast('No shifts found in that statement', 'warn'); return; }
      extracted = rows.map(r => ({ ...r, id: uid() }));
      renderPreview();
    } catch (e) { status.innerHTML = `${icon('warn')} ${e.message}`; status.style.color = 'var(--neg)'; }
    finally { photoBtn.disabled = pdfBtn.disabled = false; photoInput.value = ''; fileInput.value = ''; }
  }
  photoInput.addEventListener('change', () => handle(photoInput.files[0]));
  fileInput.addEventListener('change', () => handle(fileInput.files[0]));

  function renderPreview() {
    preview.replaceChildren();
    if (!extracted || !extracted.length) return;
    // Flag likely duplicates once; a duplicate is excluded by default.
    extracted.forEach(e => { if (e._dup === undefined) { e._dup = dupChecker.isDup('earning', e); e._skip = e._dup; } });

    const included = () => extracted.filter(e => !e._skip);
    const total = included().reduce((t, e) => t + e.amount + e.tips, 0);
    const dupCount = extracted.filter(e => e._dup).length;

    const summaryRow = el('div', { class: 'row row--between', style: 'margin:2px 2px 8px' });
    preview.append(summaryRow);
    const add = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:12px' });

    const refresh = () => {
      const inc = included();
      summaryRow.replaceChildren(
        el('div', { class: 'section-title', style: 'margin:0', text: `Found ${extracted.length} shift${extracted.length === 1 ? '' : 's'}${inc.length !== extracted.length ? ` · adding ${inc.length}` : ''}` }),
        el('div', { style: 'font-weight:800', text: fmtGBP(inc.reduce((t, e) => t + e.amount + e.tips, 0)) }),
      );
      add.innerHTML = icon('check') + `<span>Add ${inc.length} shift${inc.length === 1 ? '' : 's'}</span>`;
      add.disabled = inc.length === 0;
    };

    if (dupCount) {
      preview.append(el('div', { class: 'callout callout--warn', html: `${icon('info')}<div><b>${dupCount}</b> shift${dupCount === 1 ? '' : 's'} look like ${dupCount === 1 ? 'one' : 'ones'} you've already logged — ${dupCount === 1 ? "it's" : "they're"} unticked below. Tick to add anyway.</div>` }));
    }

    const listEl = el('div', { class: 'card card--flush' });
    extracted.forEach(e => {
      const p = platformById(e.platform);
      const bits = [fmtDate(e.date, { weekday: true })];
      if (e.hours) bits.push(`${fmtNum(e.hours, e.hours % 1 ? 1 : 0)}h`);
      if (e.miles) bits.push(`${fmtNum(e.miles)} mi`);
      if (e.deliveries) bits.push(`${e.deliveries} drops`);
      if (e.tips) bits.push(`${fmtGBP(e.tips)} tips`);
      const sub = el('div', { class: 'item__sub', text: bits.join(' · ') });
      if (e._dup) sub.append(el('span', { class: 'pill pill--warn', style: 'margin-inline-start:6px', text: 'Already logged' }));

      const row = el('div', { class: 'item' + (e._skip ? ' is-skipped' : '') }, [
        el('div', { class: 'item__icon', style: `background:${p.color}22;color:${p.color}`, html: icon('route') }),
        el('div', { class: 'item__main' }, [el('div', { class: 'item__title', text: p.name }), sub]),
        el('div', { class: 'item__amt amt-pos', text: '+' + fmtGBP(e.amount + e.tips) }),
      ]);
      // Duplicates get an include checkbox; everything else keeps the remove ×.
      if (e._dup) {
        const cb = el('input', { type: 'checkbox', title: 'Add anyway', style: 'width:20px;height:20px;flex:none' });
        cb.checked = !e._skip;
        cb.onchange = () => { e._skip = !cb.checked; row.classList.toggle('is-skipped', e._skip); refresh(); };
        row.append(cb);
      } else {
        row.append(el('button', { class: 'sheet__close', type: 'button', html: '&times;', style: 'width:30px;height:30px;font-size:18px', onclick: () => { extracted = extracted.filter(x => x.id !== e.id); renderPreview(); } }));
      }
      listEl.append(row);
    });
    preview.append(listEl);

    add.onclick = async () => {
      add.disabled = true;
      const inc = included();
      for (const e of inc) {
        await earnings.save({ id: e.id, date: e.date, platform: e.platform, amount: e.amount, tips: e.tips, hours: e.hours, deliveries: e.deliveries, miles: e.miles, notes: e.notes || 'Scanned statement', source: 'scan' });
      }
      extracted = null;
      toast(`Added ${inc.length} shift${inc.length === 1 ? '' : 's'}`, 'ok'); bus.navigate('income');
    };
    preview.append(add);
    preview.append(el('div', { class: 'hint', style: 'margin-top:8px', text: 'Review the rows, remove any that are wrong, then add. You can edit each shift afterwards in Income.' }));
    refresh();
  }

  root.append(el('div', { class: 'card' }, [el('div', { class: 'btn-grid' }, [photoBtn, pdfBtn]), photoInput, fileInput, status]));
  root.append(preview);
  return root;
}
