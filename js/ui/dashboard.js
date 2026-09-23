// ============================================================
// ui/dashboard.js — the Home screen: take-home, tax reserve,
// this week, upcoming dues, income mix, recent activity.
// ============================================================
import { el, fmtGBP, fmtNum, fmtPct, todayISO, addDays, humanUntil, fmtDate, daysBetween, registrationDeadline } from '../util.js';
import { earnings, expenses, bills } from '../db.js';
import { getSettings } from '../store.js';
import { computeTaxYear, summariseRange, taxReserve } from '../tax.js';
import { donut } from '../charts.js';
import { icon } from './shared.js';
import { earningItem, expenseItem } from './items.js';
import { openEarningsForm, openExpenseForm } from './forms.js';
import { getActive, elapsedMs, fmtDuration } from '../shift.js';
import { computeGoal, PERIOD_LABELS } from '../goals.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const [allE, allX, allB] = await Promise.all([earnings.all(), expenses.all(), bills.all()]);
  const sum = computeTaxYear(allE, allX, s);
  const root = el('div');

  if (!allE.length && !allX.length && !getActive()) {
    root.append(welcomeCard());
  }

  // Active live-shift banner
  const active = getActive();
  if (active) {
    const banner = el('div', { class: 'card', style: 'cursor:pointer;border-color:var(--brand);background:var(--brand-tint)' }, [
      el('div', { class: 'row row--between' }, [
        el('div', { class: 'row', style: 'gap:10px' }, [
          el('span', { class: 'pill pill--neg live-pill', html: '<span class="live-dot"></span> LIVE' }),
          el('div', {}, [
            el('div', { style: 'font-weight:800', text: 'Shift in progress' }),
            el('div', { class: 'tiny muted', text: `${fmtDuration(elapsedMs(active))} · tap to open` }),
          ]),
        ]),
        el('span', { html: icon('clock'), style: 'color:var(--brand)' }),
      ]),
    ]);
    banner.onclick = () => bus.navigate('shift');
    root.append(banner);
  }

  // ---- Hero: take-home this tax year ----
  const hero = el('div', { class: 'hero' }, [
    el('div', { class: 'hero__label', text: `Self-employment take-home · ${sum.taxYear}` }),
    el('div', { class: 'hero__value', text: fmtGBP(Math.max(0, sum.netTakeHome)) }),
    el('div', { class: 'hero__sub', text: `Net profit ${fmtGBP(sum.netProfit)} after ${fmtGBP(sum.totalSETax)} tax & NIC` }),
    el('div', { class: 'hero__split' }, [
      heroCell('Gross income', fmtGBP(sum.grossIncome, { round: true })),
      heroCell('Deductions', fmtGBP(sum.effectiveDeduction, { round: true })),
      heroCell('Set aside', fmtGBP(sum.totalSETax, { round: true })),
    ]),
  ]);
  root.append(hero);

  // ---- Quick actions (the two you do most) ----
  const actions = el('div', { class: 'btn-grid' });
  const bEarn = el('button', { class: 'btn btn--sub', type: 'button' }); bEarn.innerHTML = icon('plus') + '<span>Add earnings</span>';
  bEarn.onclick = () => openEarningsForm();
  const bExp = el('button', { class: 'btn btn--sub', type: 'button' }); bExp.innerHTML = icon('camera') + '<span>Add expense</span>';
  bExp.onclick = () => openExpenseForm();
  actions.append(bEarn, bExp);
  root.append(actions);

  // ---- Quick links to the deeper tools (kept off the top bar to reduce clutter) ----
  const link = (ic, label, route) => {
    const b = el('button', { class: 'chip', type: 'button', style: 'gap:6px' });
    b.innerHTML = icon(ic) + `<span>${label}</span>`;
    b.onclick = () => bus.navigate(route);
    return b;
  };
  root.append(el('div', { class: 'chips', style: 'margin:2px 0 2px;flex-wrap:wrap' }, [
    link('chart', 'Insights', 'insights'),
    link('wallet', 'Pots', 'pots'),
    link('target', 'Goals', 'goals'),
    link('spark', 'Ask Kerb', 'assistant'),
  ]));

  // ---- Tax reserve card ----
  const reserve = taxReserve(sum, s);
  const rate = s.taxPotMode === 'manual' ? s.taxPotManualPct : sum.effectiveSERate;
  const marginPct = sum.marginal.combined * 100;
  root.append(sectionTitle('Money to keep'));
  const reserveCard = el('div', { class: 'card' }, [
    el('div', { class: 'row row--between' }, [
      el('div', {}, [
        el('div', { class: 'tile__k', html: icon('wallet') + '<span>Tax pot — set this aside</span>' }),
        el('div', { class: 'tile__v', style: 'color:var(--warn)', text: fmtGBP(reserve) }),
        el('div', { class: 'tile__s', text: `≈ ${fmtPct(rate)} of profit${s.taxPotMode === 'manual' ? ' (manual)' : ' (live estimate)'}` }),
      ]),
      el('div', {}, [
        el('div', { class: 'tile__k', html: '<span>Safe to spend</span>' }),
        el('div', { class: 'tile__v', style: 'color:var(--pos)', text: fmtGBP(Math.max(0, sum.netTakeHome)) }),
        el('div', { class: 'tile__s', text: 'profit after tax' }),
      ]),
    ]),
    el('div', { class: 'callout callout--brand', style: 'margin:12px 0 0', html: `${icon('info')}<div>For every <b>£100</b> profit from now, keep about <b>${fmtGBP(marginPct)}</b> for tax &amp; NIC — the rest is yours.</div>` }),
  ]);
  reserveCard.style.cursor = 'pointer';
  reserveCard.onclick = () => bus.navigate('pots');
  root.append(reserveCard);

  // ---- Employment (PAYE) — shown separately from self-employment ----
  if (sum.base > 0) {
    root.append(sectionTitle('Employment (PAYE) — separate'));
    const empCard = el('div', { class: 'card', style: 'cursor:pointer' }, [
      el('div', { class: 'row row--between' }, [
        el('div', {}, [
          el('div', { class: 'tile__k', html: icon('wallet') + '<span>Salary</span>' }),
          el('div', { class: 'tile__v', text: fmtGBP(sum.base, { round: true }) }),
          el('div', { class: 'tile__s', text: 'from your job' }),
        ]),
        el('div', {}, [
          el('div', { class: 'tile__k', html: '<span>Tax deducted</span>' }),
          el('div', { class: 'tile__v', text: fmtGBP(sum.incomeTaxBase, { round: true }) }),
          el('div', { class: 'tile__s', text: 'at source' }),
        ]),
      ]),
      el('div', { class: 'callout callout--brand', style: 'margin:12px 0 0', html: `${icon('check')}<div>Handled automatically by your employer — nothing to set aside. Kept separate from your delivery figures above.</div>` }),
    ]);
    empCard.onclick = () => bus.navigate('tax');
    root.append(empCard);
  }

  // ---- Goal ----
  if (s.goalEnabled && s.goalAmount > 0) {
    const g = computeGoal(allE, allX, s);
    root.append(sectionTitle(`${PERIOD_LABELS[g.period]} goal`));
    const gc = el('div', { class: 'card', style: 'cursor:pointer' });
    gc.append(
      el('div', { class: 'row row--between', style: 'margin-bottom:8px' }, [
        el('div', { style: 'font-weight:800', html: `${g.met ? '✅' : '🎯'} ${fmtGBP(g.current)} <span class="muted" style="font-weight:600">/ ${fmtGBP(g.amount)}</span>` }),
        el('span', { class: 'tiny', style: 'font-weight:700;color:var(--brand)', text: g.streak > 0 ? `🔥 ${g.streak}` : '' }),
      ]),
      (() => { const b = el('div', { class: 'bar' }); b.append(el('div', { class: 'bar__fill' + (g.met ? '' : ''), style: `width:${g.pct}%;background:${g.met ? 'var(--pos)' : 'var(--brand)'}` })); return b; })(),
      el('div', { class: 'tiny muted', style: 'margin-top:8px', text: g.met ? 'Goal met — great work!' : `${fmtGBP(g.remaining)} to go` }),
    );
    gc.onclick = () => bus.navigate('goals');
    root.append(gc);
  } else if (!getActive()) {
    const setg = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-bottom:4px' });
    setg.innerHTML = icon('target') + '<span>Set an earnings goal</span>';
    setg.onclick = () => bus.navigate('goals');
    root.append(setg);
  }

  // ---- This week ----
  const wStart = addDays(todayISO(), -6);
  const wk = summariseRange(allE, allX, wStart, todayISO(), s);
  root.append(sectionTitle('Last 7 days'));
  const week = el('div', { class: 'grid-2' }, [
    tile('Income', fmtGBP(wk.income), `${wk.count} shift${wk.count === 1 ? '' : 's'}`, 'pos'),
    tile('Expenses', fmtGBP(wk.expensesPaid), `${wk.expenseCount} item${wk.expenseCount === 1 ? '' : 's'}`, 'neg'),
    tile('£ / hour', wk.hours ? fmtGBP(wk.income / wk.hours) : '—', `${fmtNum(wk.hours, 1)}h worked`),
    tile('£ / mile', wk.miles ? fmtGBP(wk.income / wk.miles) : '—', `${fmtNum(wk.miles)} mi`),
  ]);
  root.append(week);

  // ---- Upcoming ----
  const upcoming = buildUpcoming(sum, allB);
  if (upcoming) root.append(sectionTitle('Coming up'), upcoming);

  // ---- Income mix ----
  if (sum.byPlatform.length) {
    root.append(sectionTitle('Income by platform'));
    const data = sum.byPlatform.map(p => ({ label: p.name, value: p.amount, color: p.color }));
    const card = el('div', { class: 'card' });
    card.innerHTML = donut(data, { centerTop: fmtGBP(sum.grossIncome, { round: true }), centerSub: sum.taxYear });
    const legend = el('div', { class: 'chart-legend', style: 'justify-content:center' });
    data.forEach(d => legend.insertAdjacentHTML('beforeend', `<span class="k"><span class="dot" style="background:${d.color}"></span>${d.label} · ${fmtGBP(d.value, { round: true })}</span>`));
    card.append(legend);
    root.append(card);
  }

  // ---- Recent activity ----
  const recent = [...allE.map(e => ({ ...e, _t: 'e' })), ...allX.map(x => ({ ...x, _t: 'x' }))]
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  if (recent.length) {
    root.append(rowTitle('Recent activity', 'View all', () => bus.navigate('income')));
    const list = el('div', { class: 'card card--flush' });
    recent.forEach(r => list.append(r._t === 'e' ? earningItem(r) : expenseItem(r)));
    root.append(list);
  }

  return root;
}

// ---- helpers ----
function heroCell(k, v) { return el('div', { class: 'hero__cell' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })]); }
function sectionTitle(t) { return el('div', { class: 'section-title', text: t }); }
function rowTitle(t, action, onAction) {
  return el('div', { class: 'row row--between', style: 'margin:18px 4px 8px' }, [
    el('div', { class: 'section-title', style: 'margin:0', text: t }),
    el('button', { class: 'link tiny', type: 'button', text: action, onclick: onAction }),
  ]);
}
function tile(k, v, s, tone) {
  return el('div', { class: 'tile' }, [
    el('div', { class: 'tile__k', text: k }),
    el('div', { class: 'tile__v', style: tone === 'pos' ? 'color:var(--pos)' : tone === 'neg' ? 'color:var(--neg)' : '', text: v }),
    el('div', { class: 'tile__s', text: s }),
  ]);
}
function buildUpcoming(sum, allB) {
  const items = [];
  const d = sum.deadlines;
  const today = todayISO();
  const regBy = registrationDeadline(getSettings().seStartDate) || d.registerBy;
  const deadlineList = [
    { label: 'Register with HMRC as self-employed', date: regBy },
    { label: 'File & pay Self Assessment (online)', date: d.onlineFileAndPay },
    { label: '2nd payment on account', date: d.secondPOA, only: sum.poa.applies },
  ].filter(x => x.date >= today && x.only !== false).sort((a, b) => a.date < b.date ? -1 : 1);
  const nextDeadline = deadlineList[0];

  const wrap = el('div', { class: 'card card--flush' });
  let any = false;
  if (nextDeadline) {
    any = true;
    const near = daysBetween(today, nextDeadline.date) < 45;
    wrap.append(el('div', { class: 'item' }, [
      el('div', { class: 'item__icon', style: `background:var(--warn-tint);color:var(--warn)`, html: icon('calendar') }),
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: nextDeadline.label }),
        el('div', { class: 'item__sub', text: `${fmtDate(nextDeadline.date, { withYear: true })} · ${humanUntil(nextDeadline.date)}` }),
      ]),
      el('div', { html: `<span class="pill pill--${near ? 'warn' : 'info'}">${humanUntil(nextDeadline.date)}</span>` }),
    ]));
  }
  // next bill due
  const bill = (allB || []).slice().sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1))[0];
  if (bill) {
    any = true;
    wrap.append(el('div', { class: 'item' }, [
      el('div', { class: 'item__icon', style: `background:var(--info-tint);color:var(--info)`, html: icon('clock') }),
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: bill.name }),
        el('div', { class: 'item__sub', text: `${fmtDate(bill.nextDue, { withYear: true })} · ${humanUntil(bill.nextDue)}` }),
      ]),
      el('div', { class: 'item__amt', text: fmtGBP(bill.amount) }),
    ]));
  }
  return any ? wrap : null;
}
function welcomeCard() {
  return el('div', { class: 'callout callout--brand', html: `${icon('spark')}<div><b>Welcome to Kerb.</b> Log a shift or scan a receipt to get started — your income, expenses and tax update instantly, and everything stays private on this device.</div>` });
}
