// ============================================================
// ui/assign-stations.js — put a station against shifts already
// logged, in bulk.
//
// Thirty-odd shifts were recorded before stations existed, and
// the platform's payment statement never names the station, so
// some of them genuinely cannot be known. Guessing would be
// worse than leaving them: the station decides the mileage, so a
// wrong station is a wrong claim. Unknown stays unknown here,
// and is reported as unattributed rather than quietly filled in.
// ============================================================
import { el, fmtGBP, fmtMiles, fmtDate, taxYearFromLabel, inRange } from '../util.js';
import { earnings } from '../db.js';
import { getSettings, allStations, stationById, platformById } from '../store.js';
import { icon, toast, selectInput, confirmDialog } from './shared.js';
import { bus } from '../bus.js';

let onlyMissing = true;

export async function render() {
  const root = el('div');
  const s = getSettings();
  const stations = allStations();

  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 12px', text: 'Assign stations' }));

  if (!stations.length) {
    root.append(el('div', { class: 'callout callout--warn', html: `${icon('warn')}<div>Add your stations first, in Settings. Each one needs the distance from home before a shift can use it.</div>` }));
    const b = el('button', { class: 'btn btn--primary btn--block', type: 'button', text: 'Open Settings' });
    b.onclick = () => bus.navigate('settings');
    root.append(b);
    return root;
  }

  const ty = taxYearFromLabel(s.taxYear);
  const all = (await earnings.all()).filter(e => e && e.date && inRange(e.date, ty.start, ty.end));
  all.sort((a, b) => (a.date < b.date ? 1 : -1));

  root.append(el('div', { class: 'callout callout--info', html: `${icon('info')}<div>Set the station on shifts logged before you had them. If a statement never said which station a shift was from, leave it unset — the miles you already entered stay, and the report counts them as not attributed to a station rather than pretending otherwise.</div>` }));

  // ---- filter ----
  const chips = el('div', { class: 'chips', style: 'margin:12px 0' });
  const mk = (label, val) => {
    const c = el('button', { class: 'chip' + (onlyMissing === val ? ' is-active' : ''), type: 'button', text: label });
    c.onclick = () => { onlyMissing = val; bus.refresh(); };
    return c;
  };
  const missingCount = all.filter(e => !e.stationId).length;
  chips.append(mk(`Without a station (${missingCount})`, true), mk(`All ${all.length}`, false));
  root.append(chips);

  const rows = all.filter(e => (onlyMissing ? !e.stationId : true));
  if (!rows.length) {
    root.append(el('div', { class: 'empty' }, [
      el('div', { class: 'empty__title', text: onlyMissing ? 'Every shift has a station' : 'No shifts in this tax year' }),
    ]));
    return root;
  }

  // ---- bulk bar ----
  const picked = new Set();
  const bulkSel = selectInput([{ value: '', label: 'Choose a station…' }, ...stations.map(v => ({ value: v.id, label: v.label }))], '');
  const alsoMiles = el('input', { type: 'checkbox' });
  const bulkWrap = el('div', { class: 'card', style: 'margin-bottom:12px' });
  const applyBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:10px' });

  const milesRow = el('label', { class: 'switch-row' }, [
    el('span', { text: 'Also set the miles from that station' }),
    el('span', { class: 'switch' }, [alsoMiles, el('span', { class: 'track' })]),
  ]);
  const milesHint = el('div', { class: 'hint' });

  const syncBulk = () => {
    const st = stationById(bulkSel.value);
    const measured = st && st.typicalMiles > 0;
    alsoMiles.disabled = !measured;
    if (!measured) alsoMiles.checked = false;
    milesHint.textContent = !st
      ? 'Pick a station to enable this.'
      : (measured
        ? `Replaces the miles on the selected shifts with ${fmtMiles(st.typicalMiles)} miles each — what a block from ${st.label} measured. Leave it off to keep the miles you entered.`
        : `${st.label} has no measured block distance yet, so the miles you already entered are kept. Log one shift there by odometer to get a real figure.`);
    applyBtn.textContent = picked.size
      ? `Apply to ${picked.size} shift${picked.size === 1 ? '' : 's'}`
      : 'Select some shifts below';
    applyBtn.disabled = !picked.size || !bulkSel.value;
  };
  bulkSel.addEventListener('change', syncBulk);

  bulkWrap.append(
    el('div', { class: 'section-title', style: 'margin:0 0 8px', text: 'Set in bulk' }),
    bulkSel, milesRow, milesHint, applyBtn,
  );
  root.append(bulkWrap);

  applyBtn.onclick = async () => {
    const st = stationById(bulkSel.value);
    if (!st || !picked.size) return;
    const setMiles = alsoMiles.checked && st.typicalMiles > 0;
    const ok = await confirmDialog({
      title: `Set ${picked.size} shift${picked.size === 1 ? '' : 's'} to ${st.label}?`,
      message: setMiles
        ? `Their miles will be replaced with ${fmtMiles(st.typicalMiles)} each. Only do this where you are sure that is the station you worked from.`
        : 'The miles you already entered are kept. Only do this where you are sure that is the station you worked from.',
      confirmText: 'Set station',
    });
    if (!ok) return;
    let n = 0;
    for (const e of all) {
      if (!picked.has(e.id)) continue;
      const rec = { ...e, stationId: st.id };
      if (setMiles) rec.miles = st.typicalMiles;
      // Only the outbound leg is the part whose treatment is in question,
      // and only when the shift is at least that long.
      rec.milesBase = (Number(rec.miles) || 0) >= st.baseMiles ? st.baseMiles : null;
      await earnings.save(rec);
      n++;
    }
    toast(`${n} shift${n === 1 ? '' : 's'} updated`, 'ok');
    bus.refresh();
  };

  // ---- the list ----
  const list = el('div', { class: 'card card--flush' });
  rows.forEach((e) => {
    const p = platformById(e.platform);
    const cb = el('input', { type: 'checkbox' });
    cb.onchange = () => { if (cb.checked) picked.add(e.id); else picked.delete(e.id); syncBulk(); };

    const cur = e.stationId ? stationById(e.stationId) : null;
    const sel = selectInput([{ value: '', label: '— not set —' }, ...stations.map(v => ({ value: v.id, label: v.label }))], e.stationId || '');
    sel.addEventListener('change', async () => {
      const st = stationById(sel.value);
      const rec = { ...e, stationId: sel.value };
      rec.milesBase = st && (Number(rec.miles) || 0) >= st.baseMiles ? st.baseMiles : null;
      await earnings.save(rec);
      toast(st ? `Set to ${st.label}` : 'Station cleared', 'ok');
      bus.refresh();
    });

    const item = el('div', { class: 'item', style: 'align-items:flex-start' }, [
      el('label', { style: 'display:flex;align-items:center;padding:2px 10px 0 0' }, [cb]),
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: `${fmtDate(e.date, { weekday: true })} · ${p.name}` }),
        el('div', { class: 'item__sub' }, [
          el('span', { text: `${fmtGBP((e.amount || 0) + (e.tips || 0))}` }),
          document.createTextNode('  ·  '),
          el('span', { text: `${fmtMiles(e.miles || 0)} mi` }),
          ...(cur ? [document.createTextNode('  ·  '), el('span', { text: cur.label })] : []),
        ]),
        el('div', { style: 'margin-top:8px' }, [sel]),
      ]),
    ]);
    list.append(item);
  });
  root.append(list);
  syncBulk();
  return root;
}
