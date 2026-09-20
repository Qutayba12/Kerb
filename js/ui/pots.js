// ============================================================
// ui/pots.js — "Pots": how much to keep for tax, vehicle and
// savings, how much is safe to spend, and simple saved trackers.
// ============================================================
import { el, fmtGBP, fmtPct, fmtNum, todayISO, addDays, daysBetween, taxYearFromLabel } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, saveSettings } from '../store.js';
import { computeTaxYear, summariseRange, taxReserve } from '../tax.js';
import { icon, openSheet, closeSheet, field, moneyInput, toast } from './shared.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const [allE, allX] = await Promise.all([earnings.all(), expenses.all()]);
  const sum = computeTaxYear(allE, allX, s);
  const root = el('div');

  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 14px', text: 'Pots' }));

  // ---- weekly money plan (based on last 4 weeks average) ----
  const wk = summariseRange(allE, allX, addDays(todayISO(), -27), todayISO(), s);
  const avgWeeklyIncome = wk.income / 4;
  const marginPct = sum.marginal.combined; // fraction
  const weeklyTax = avgWeeklyIncome * (s.taxPotMode === 'manual' ? s.taxPotManualPct / 100 : marginPct);
  const weeklyVehicle = s.vehiclePotPerWeek || 0;
  const weeklySavings = s.savingsGoalPerWeek || 0;
  const weeklySpend = Math.max(0, avgWeeklyIncome - weeklyTax - weeklyVehicle - weeklySavings);

  root.append(el('div', { class: 'section-title', text: 'Your weekly plan' }));
  const planCard = el('div', { class: 'card' }, [
    el('div', { class: 'row row--between' }, [
      el('div', { class: 'tile__k', text: 'Avg income / week (last 4 wks)' }),
      el('div', { style: 'font-weight:800', text: fmtGBP(avgWeeklyIncome) }),
    ]),
    splitBar([
      { label: 'Tax', value: weeklyTax, color: 'var(--warn)' },
      { label: 'Vehicle', value: weeklyVehicle, color: 'var(--info)' },
      { label: 'Savings', value: weeklySavings, color: 'var(--gold)' },
      { label: 'Spend', value: weeklySpend, color: 'var(--pos)' },
    ]),
  ]);
  root.append(planCard);
  root.append(el('div', { class: 'callout callout--brand', html: `${icon('info')}<div>From each week's pay, keep about <b>${fmtGBP(weeklyTax)}</b> for tax${weeklyVehicle ? `, <b>${fmtGBP(weeklyVehicle)}</b> for the vehicle` : ''}${weeklySavings ? `, <b>${fmtGBP(weeklySavings)}</b> to savings` : ''} — leaving about <b>${fmtGBP(weeklySpend)}</b> to spend.</div>` }));

  // ---- tax pot ----
  const reserve = taxReserve(sum, s);
  root.append(el('div', { class: 'section-title', text: 'Tax pot' }));
  root.append(potCard({
    title: 'Tax & NIC reserve', tone: 'warn', icon: 'wallet',
    target: reserve, saved: s.potTaxSaved || 0,
    hint: `Recommended reserve for ${sum.taxYear}. ${s.taxPotMode === 'manual' ? `Manual ${s.taxPotManualPct}% of profit.` : `Live estimate (${fmtPct(sum.effectiveSERate)} of profit).`}`,
    onEdit: () => editSaved('potTaxSaved', 'Tax pot', s.potTaxSaved || 0),
  }));

  // ---- vehicle pot ----
  const ty = taxYearFromLabel(s.taxYear);
  const weeksElapsed = Math.max(1, Math.min(52, Math.ceil((daysBetween(ty.start, todayISO()) + 1) / 7)));
  if (s.vehiclePotPerWeek > 0) {
    root.append(el('div', { class: 'section-title', text: 'Vehicle & maintenance pot' }));
    root.append(potCard({
      title: 'Vehicle pot', tone: 'info', icon: 'car',
      target: (s.vehiclePotPerWeek || 0) * weeksElapsed, saved: s.potVehicleSaved || 0,
      hint: `${fmtGBP(s.vehiclePotPerWeek)}/week × ${weeksElapsed} weeks this tax year.`,
      onEdit: () => editSaved('potVehicleSaved', 'Vehicle pot', s.potVehicleSaved || 0),
    }));
  }
  if (s.savingsGoalPerWeek > 0) {
    root.append(el('div', { class: 'section-title', text: 'Savings pot' }));
    root.append(potCard({
      title: 'Savings', tone: 'gold', icon: 'target',
      target: (s.savingsGoalPerWeek || 0) * weeksElapsed, saved: s.potSavingsSaved || 0,
      hint: `${fmtGBP(s.savingsGoalPerWeek)}/week × ${weeksElapsed} weeks.`,
      onEdit: () => editSaved('potSavingsSaved', 'Savings pot', s.potSavingsSaved || 0),
    }));
  }

  // ---- configure ----
  const cfgBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-top:8px' });
  cfgBtn.innerHTML = icon('edit') + '<span>Set weekly targets & tax mode</span>';
  cfgBtn.onclick = () => bus.navigate('settings');
  root.append(cfgBtn);

  return root;
}

function potCard({ title, tone, icon: ic, target, saved, hint, onEdit }) {
  const pct = target > 0 ? Math.min(100, (saved / target) * 100) : (saved > 0 ? 100 : 0);
  const gap = target - saved;
  const card = el('div', { class: 'card' });
  card.append(
    el('div', { class: 'row row--between' }, [
      el('div', { class: 'row', style: 'gap:10px' }, [
        el('div', { class: 'item__icon', style: `background:var(--${tone}-tint);color:var(--${tone})`, html: icon(ic) }),
        el('div', {}, [el('div', { style: 'font-weight:800', text: title }), el('div', { class: 'tiny faint', text: hint })]),
      ]),
      el('button', { class: 'btn btn--sm btn--sub', type: 'button', text: 'Update', onclick: onEdit }),
    ]),
    el('div', { class: 'row row--between', style: 'margin:12px 0 6px' }, [
      el('span', { class: 'tiny muted', html: `Saved <b style="color:var(--text)">${fmtGBP(saved)}</b>` }),
      el('span', { class: 'tiny muted', html: `Target <b style="color:var(--text)">${fmtGBP(target)}</b>` }),
    ]),
    (() => { const b = el('div', { class: 'bar' }); b.append(el('div', { class: `bar__fill bar__fill--${tone === 'warn' ? 'warn' : tone === 'gold' ? 'gold' : ''}`, style: `width:${pct}%` })); return b; })(),
    el('div', { class: 'tiny', style: `margin-top:8px;color:${gap > 0 ? 'var(--neg)' : 'var(--pos)'}`, text: gap > 0 ? `${fmtGBP(gap)} short` : `On track (${fmtGBP(-gap)} buffer)` }),
  );
  return card;
}

function splitBar(parts) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  const bar = el('div', { style: 'display:flex;height:16px;border-radius:999px;overflow:hidden;margin:14px 0 10px;border:1px solid var(--border)' });
  parts.forEach(p => { if (p.value > 0) bar.append(el('div', { style: `width:${(p.value / total * 100).toFixed(1)}%;background:${p.color}` })); });
  const legend = el('div', { class: 'chart-legend' });
  parts.forEach(p => legend.insertAdjacentHTML('beforeend', `<span class="k"><span class="dot" style="background:${p.color}"></span>${p.label} · ${fmtGBP(p.value)}</span>`));
  const wrap = el('div'); wrap.append(bar, legend); return wrap;
}

function editSaved(key, title, current) {
  const inp = moneyInput({ value: current || '' });
  const body = el('div');
  body.append(field(`Amount saved in ${title.toLowerCase()}`, inp, 'Enter the total you currently have set aside.'));
  const save = el('button', { class: 'btn btn--primary btn--block', type: 'button', text: 'Save' });
  save.onclick = () => {
    const v = parseFloat(String(inp.input.value).replace(/[^0-9.\-]/g, '')) || 0;
    saveSettings({ [key]: v }); closeSheet(); toast('Updated', 'ok'); bus.refresh();
  };
  body.append(save);
  openSheet({ title: `Update ${title.toLowerCase()}`, node: body });
}
