// ============================================================
// ui/shift.js — the Live Shift screen. Start a shift, watch time
// and mileage tick up, log earnings/deliveries as you go, then
// stop to save it as a normal earnings entry.
// ============================================================
import { el, fmtGBP, fmtNum, todayISO, round2, parseMoney } from '../util.js';
import { earnings } from '../db.js';
import { getSettings, allPlatforms, platformById } from '../store.js';
import { icon, field, selectInput, moneyInput, toast, confirmDialog } from './shared.js';
import { getActive, startShift, updateShift, stopShift, elapsedMs, elapsedHours, fmtDuration } from '../shift.js';
import { bus } from '../bus.js';

export async function render(ctx = {}) {
  const active = getActive();
  return active ? livePanel(ctx) : startPanel();
}

// ---------------- start ----------------
function startPanel() {
  const s = getSettings();
  const root = el('div');
  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 14px', text: 'Live shift' }));
  root.append(el('div', { class: 'callout callout--brand', html: `${icon('spark')}<div>Start a shift and Kerb tracks your <b>time</b> and (optionally) <b>miles</b> automatically, showing your live £/hour. Stop it to save the shift.</div>` }));

  const platform = selectInput(allPlatforms().map(p => ({ value: p.id, label: p.name })), s.vehicle === 'bicycle' ? 'ubereats' : allPlatforms()[0].id);
  const gpsToggle = el('input', { type: 'checkbox' }); gpsToggle.checked = false;
  const gpsRow = el('label', { class: 'switch-row' }, [
    el('div', {}, [el('div', { style: 'font-weight:700', text: 'Track miles with GPS' }), el('div', { class: 'tiny faint', text: 'Optional. Keep the app open with the screen on for best accuracy. You can also just type miles at the end.' })]),
    el('span', { class: 'switch' }, [gpsToggle, el('span', { class: 'track' })]),
  ]);

  const card = el('div', { class: 'card' }, [field('Platform', platform), gpsRow]);
  root.append(card);

  const start = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:4px' });
  start.innerHTML = icon('clock') + '<span>Start shift</span>';
  start.onclick = () => {
    startShift({ platform: platform.value, gps: gpsToggle.checked });
    toast('Shift started — good luck!', 'ok');
    bus.refresh();
  };
  root.append(start);
  return root;
}

// ---------------- live ----------------
function livePanel(ctx) {
  const root = el('div');
  const s0 = getActive();
  const p = platformById(s0.platform);

  root.append(el('div', { class: 'row row--between', style: 'margin:4px 2px 12px' }, [
    el('h2', { style: 'font-size:22px', text: 'Live shift' }),
    el('span', { class: 'pill pill--neg live-pill', html: `<span class="live-dot"></span> LIVE` }),
  ]));

  // timer hero
  const timerEl = el('div', { class: 'hero__value', style: 'font-variant-numeric:tabular-nums', text: fmtDuration(elapsedMs(s0)) });
  const rateEl = el('div', { class: 'hero__sub', text: '—' });
  root.append(el('div', { class: 'hero' }, [
    el('div', { class: 'hero__label', html: `${p.name} · started ${new Date(s0.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` }),
    timerEl, rateEl,
  ]));

  // earnings + deliveries
  const earnInput = moneyInput({ value: s0.earnings || '', placeholder: '0.00' });
  earnInput.input.addEventListener('input', () => { updateShift({ earnings: parseMoney(earnInput.input.value) }); refreshRates(); });
  const tipsInput = moneyInput({ value: s0.tips || '', placeholder: '0.00' });
  tipsInput.input.addEventListener('input', () => updateShift({ tips: parseMoney(tipsInput.input.value) }));

  const delCount = el('div', { class: 'tile__v', style: 'text-align:center', text: String(s0.deliveries || 0) });
  const stepper = el('div', { class: 'row', style: 'gap:10px;justify-content:center;align-items:center' }, [
    stepBtn('−', () => bumpDeliveries(-1)),
    el('div', {}, [el('div', { class: 'tile__k', style: 'text-align:center', text: 'Deliveries' }), delCount]),
    stepBtn('+', () => bumpDeliveries(1)),
  ]);
  function bumpDeliveries(d) { const s = getActive(); if (!s) return; const n = Math.max(0, (s.deliveries || 0) + d); updateShift({ deliveries: n }); delCount.textContent = String(n); }

  root.append(el('div', { class: 'card' }, [
    el('div', { class: 'grid-2' }, [field('Earnings so far', earnInput), field('Tips', tipsInput)]),
    el('hr', { class: 'soft' }),
    stepper,
  ]));

  // miles + live stats
  const milesEl = el('div', { class: 'tile__v', text: s0.gps ? fmtNum(s0.miles, 1) : '—' });
  let manualMiles = null;
  const milesCard = el('div', { class: 'card' });
  if (s0.gps) {
    milesCard.append(el('div', { class: 'row row--between' }, [
      el('div', {}, [el('div', { class: 'tile__k', html: icon('route') + '<span>Miles (GPS)</span>' }), milesEl]),
      el('div', { id: 'gps-note', class: 'tiny faint', text: s0.gpsError || 'tracking…' }),
    ]));
  } else {
    manualMiles = el('input', { class: 'input', type: 'number', min: '0', step: '0.1', inputMode: 'decimal', value: s0.miles || '', placeholder: 'miles this shift' });
    manualMiles.addEventListener('input', () => { updateShift({ miles: parseFloat(manualMiles.value) || 0 }); refreshRates(); });
    milesCard.append(field('Business miles (enter at the end)', manualMiles));
  }
  root.append(milesCard);

  const perHr = el('div', { class: 'tile__v', style: 'color:var(--pos)', text: '—' });
  const perMi = el('div', { class: 'tile__v', text: '—' });
  root.append(el('div', { class: 'grid-2' }, [
    el('div', { class: 'tile' }, [el('div', { class: 'tile__k', text: '£ / hour (live)' }), perHr]),
    el('div', { class: 'tile' }, [el('div', { class: 'tile__k', text: '£ / mile' }), perMi]),
  ]));

  // actions
  const stopBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:6px' });
  stopBtn.innerHTML = icon('check') + '<span>Stop &amp; save shift</span>';
  stopBtn.onclick = () => stopAndSave();
  const discardBtn = el('button', { class: 'btn btn--danger btn--block', type: 'button', style: 'margin-top:8px' });
  discardBtn.innerHTML = icon('trash') + '<span>Discard shift</span>';
  discardBtn.onclick = async () => {
    const ok = await confirmDialog({ title: 'Discard this shift?', message: 'Time and miles tracked will be lost.', confirmText: 'Discard', danger: true });
    if (!ok) return; stopShift(); toast('Shift discarded'); bus.navigate('home');
  };
  root.append(stopBtn, discardBtn);

  // ---- live updates ----
  function refreshRates() {
    const s = getActive(); if (!s) return;
    const hrs = elapsedHours(s);
    perHr.textContent = hrs > 0.01 ? fmtGBP((s.earnings || 0) / hrs) : '—';
    perMi.textContent = s.miles > 0 ? fmtGBP((s.earnings || 0) / s.miles) : '—';
    rateEl.textContent = hrs > 0.01 && s.earnings ? `${fmtGBP((s.earnings || 0) / hrs)}/hour so far` : 'earnings update your live rate';
  }
  const tick = setInterval(() => {
    const s = getActive();
    if (!s) { clearInterval(tick); return; }
    timerEl.textContent = fmtDuration(elapsedMs(s));
    refreshRates();
  }, 1000);
  // GPS-driven miles updates
  const unsub = onActive((s) => {
    if (!s) return;
    if (s.gps) { milesEl.textContent = fmtNum(s.miles, 1); const n = document.getElementById('gps-note'); if (n) n.textContent = s.gpsError || 'tracking…'; }
    refreshRates();
  });
  refreshRates();
  if (ctx.registerCleanup) ctx.registerCleanup(() => { clearInterval(tick); unsub(); });

  async function stopAndSave() {
    const s = getActive(); if (!s) return;
    if (!s.earnings && !s.miles) { toast('Add earnings or miles first', 'err'); return; }
    const hrs = round2(elapsedHours(s));
    const rec = {
      id: s.id, date: todayISO(), platform: s.platform,
      amount: round2(s.earnings || 0), tips: round2(s.tips || 0),
      hours: hrs, deliveries: s.deliveries || 0, miles: round2(s.miles || 0),
      notes: 'Live shift',
    };
    await earnings.save(rec);
    stopShift();
    toast(`Shift saved · ${fmtDuration(elapsedMs({ startedAt: s.startedAt }))} · ${fmtGBP(rec.amount)}`, 'ok');
    bus.navigate('income');
  }

  return root;
}

function stepBtn(label, onClick) {
  const b = el('button', { class: 'btn btn--sub', type: 'button', style: 'width:52px;height:52px;border-radius:50%;font-size:24px;font-weight:800', text: label });
  b.onclick = onClick; return b;
}

// local import wrapper to avoid a name clash in the closure
import { onShiftChange as onActive } from '../shift.js';
