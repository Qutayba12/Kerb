// ============================================================
// ui/goals.js — set an earnings goal and track progress, streaks
// and history; manage local reminders.
// ============================================================
import { el, fmtGBP, fmtPct, fmtDate } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, saveSettings } from '../store.js';
import { computeGoal, PERIOD_LABELS, periodLabel } from '../goals.js';
import { progressRing } from '../charts.js';
import { icon, field, selectInput, moneyInput, toast } from './shared.js';
import { notifySupported, notifyPermission, requestNotifyPermission, canNotify, showNotification, registerPeriodicSync, unregisterPeriodicSync } from '../notify.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const [allE, allX] = await Promise.all([earnings.all(), expenses.all()]);
  const root = el('div');
  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 14px', text: 'Goals' }));

  if (!s.goalEnabled) {
    root.append(el('div', { class: 'callout callout--brand', html: `${icon('target')}<div>Set an earnings goal to stay motivated — Kerb tracks your progress and streak.</div>` }));
    root.append(goalForm(s, false));
    root.append(reminderCard(s));
    return root;
  }

  const g = computeGoal(allE, allX, s);

  // progress ring
  const ringCard = el('div', { class: 'card center' });
  ringCard.innerHTML = progressRing(g.pct, {
    size: 150, thickness: 14, color: g.met ? 'var(--pos)' : 'var(--brand)',
    label: fmtPct(g.pct, 0), sub: `${PERIOD_LABELS[g.period]} goal`,
  });
  ringCard.append(
    el('div', { style: 'font-size:22px;font-weight:800;margin-top:6px', text: `${fmtGBP(g.current)} / ${fmtGBP(g.amount)}` }),
    el('div', { class: 'tiny muted', text: `${s.goalMetric === 'profit' ? 'Profit' : 'Income'} · ${fmtDate(g.range.start)} – ${fmtDate(g.range.end)}` }),
    g.met
      ? el('div', { class: 'pill pill--ok', style: 'margin-top:10px', html: `${icon('check')} Goal met — great work!` })
      : el('div', { style: 'margin-top:10px;font-weight:700;color:var(--brand)', text: `${fmtGBP(g.remaining)} to go` }),
  );
  root.append(ringCard);

  // streak
  root.append(el('div', { class: 'grid-2' }, [
    tile('🔥 Streak', `${g.streak}`, `${PERIOD_LABELS[g.period].toLowerCase()} in a row`),
    tile('Target', fmtGBP(g.amount), `per ${g.period}`),
  ]));

  // history
  root.append(el('div', { class: 'section-title', text: 'Recent periods' }));
  const hist = el('div', { class: 'card' });
  const max = Math.max(g.amount, ...g.history.map(h => h.value), 1);
  if (!g.history.length) hist.append(el('div', { class: 'tiny muted center', text: 'No history yet.' }));
  g.history.forEach(h => {
    const row = el('div', { style: 'margin-bottom:10px' }, [
      el('div', { class: 'row row--between', style: 'margin-bottom:4px' }, [
        el('span', { class: 'tiny', text: h.label + (h.empty ? ' · off' : '') }),
        el('span', { class: 'tiny', style: 'font-weight:700;font-variant-numeric:tabular-nums', text: fmtGBP(h.value) }),
      ]),
      (() => { const b = el('div', { class: 'bar' }); b.append(el('div', { class: 'bar__fill' + (h.met ? '' : ' bar__fill--warn'), style: `width:${Math.min(100, h.value / max * 100)}%` })); return b; })(),
    ]);
    hist.append(row);
  });
  root.append(hist);

  // edit + reminders
  root.append(el('div', { class: 'section-title', text: 'Your goal' }));
  root.append(goalForm(s, true));
  root.append(reminderCard(s));
  return root;
}

function goalForm(s, editing) {
  const metric = selectInput([{ value: 'income', label: 'Income (turnover)' }, { value: 'profit', label: 'Net profit' }], s.goalMetric);
  const period = selectInput([{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }], s.goalPeriod);
  const amount = moneyInput({ value: s.goalAmount || '', placeholder: '0.00' });
  const card = el('div', { class: 'card' }, [
    el('div', { class: 'grid-2' }, [field('Measure', metric), field('Period', period)]),
    field('Target amount', amount),
  ]);
  const save = el('button', { class: 'btn btn--primary btn--block', type: 'button', text: editing ? 'Update goal' : 'Set goal' });
  save.onclick = () => {
    const amt = parseFloat(String(amount.input.value).replace(/[^0-9.\-]/g, '')) || 0;
    if (!amt) { toast('Enter a target amount', 'err'); return; }
    saveSettings({ goalEnabled: true, goalMetric: metric.value, goalPeriod: period.value, goalAmount: amt });
    toast('Goal saved', 'ok'); bus.refresh();
  };
  card.append(save);
  if (editing) {
    const off = el('button', { class: 'link tiny', type: 'button', text: 'Turn off goal', style: 'display:block;margin:10px auto 0' });
    off.onclick = () => { saveSettings({ goalEnabled: false }); toast('Goal turned off'); bus.refresh(); };
    card.append(off);
  }
  return card;
}

function reminderCard(s) {
  const card = el('div', { class: 'card' });
  card.append(el('div', { class: 'row row--between', style: 'margin-bottom:6px' }, [
    el('div', {}, [el('div', { style: 'font-weight:800', html: icon('clock') + ' Reminders' }), el('div', { class: 'tiny faint', text: 'Deadline & goal nudges on this device.' })]),
  ]));

  if (!notifySupported()) {
    card.append(el('div', { class: 'tiny muted', text: 'Notifications are not supported on this browser.' }));
    return card;
  }

  const perm = notifyPermission();
  const toggle = el('input', { type: 'checkbox' }); toggle.checked = !!s.notifyEnabled && canNotify();
  const row = el('label', { class: 'switch-row' }, [
    el('span', { text: 'Enable reminders' }),
    el('span', { class: 'switch' }, [toggle, el('span', { class: 'track' })]),
  ]);
  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      const res = await requestNotifyPermission();
      if (res !== 'granted') { toggle.checked = false; saveSettings({ notifyEnabled: false }); toast('Permission not granted', 'warn'); return; }
      saveSettings({ notifyEnabled: true }); registerPeriodicSync(); toast('Reminders on', 'ok');
    } else { saveSettings({ notifyEnabled: false }); unregisterPeriodicSync(); toast('Reminders off'); }
  });
  card.append(row);

  if (perm === 'denied') {
    card.append(el('div', { class: 'tiny', style: 'color:var(--warn)', text: 'Notifications are blocked in your browser settings — allow them for Kerb to enable reminders.' }));
  }
  const test = el('button', { class: 'btn btn--sub btn--sm', type: 'button', text: 'Send test notification', style: 'margin-top:8px' });
  test.onclick = async () => {
    if (!canNotify()) { const r = await requestNotifyPermission(); if (r !== 'granted') { toast('Allow notifications first', 'warn'); return; } }
    const ok = await showNotification('Kerb', 'Reminders are working 🎉', 'kerb-test');
    toast(ok ? 'Sent' : 'Could not send', ok ? 'ok' : 'err');
  };
  card.append(test);
  card.append(el('div', { class: 'hint', style: 'margin-top:8px', text: 'Reminders appear when you open Kerb; on installed Android apps they can also appear in the background. Full server push isn\'t used — your data stays on device.' }));
  return card;
}

function tile(k, v, sub) {
  return el('div', { class: 'tile' }, [
    el('div', { class: 'tile__k', text: k }),
    el('div', { class: 'tile__v', text: v }),
    el('div', { class: 'tile__s', text: sub }),
  ]);
}
