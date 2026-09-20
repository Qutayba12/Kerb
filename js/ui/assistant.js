// ============================================================
// ui/assistant.js — "Ask Kerb": Claude-powered quick-add by text,
// questions about your own data, and a weekly summary. Uses the
// user's own Anthropic key; a compact data summary is sent with
// each question (never raw personal notes beyond what you ask).
// ============================================================
import { el, fmtGBP, fmtNum, todayISO, addDays, parseISO, taxYearFromLabel, round2 } from '../util.js';
import { earnings, expenses, payslips } from '../db.js';
import { getSettings, categoryById, platformById, allPlatforms, EXPENSE_CATEGORIES } from '../store.js';
import { computeTaxYear, summariseRange } from '../tax.js';
import { computeGoal } from '../goals.js';
import { derivePaye } from '../payslips.js';
import { claudeText, parseEntry, hasApiKey } from '../claude.js';
import { icon, toast } from './shared.js';
import { openEarningsForm, openExpenseForm } from './forms.js';
import { bus } from '../bus.js';

let history = []; // {role:'user'|'assistant', text} — kept for the session

export async function render() {
  const s = getSettings();
  const root = el('div');
  root.append(el('div', { class: 'row row--between', style: 'margin:4px 2px 14px' }, [
    el('h2', { style: 'font-size:22px', html: 'Ask Kerb <span style="color:var(--gold)">✨</span>' }),
    el('button', { class: 'link tiny', type: 'button', text: history.length ? 'Clear' : '', onclick: () => { history = []; bus.refresh(); } }),
  ]));

  if (!hasApiKey(s)) {
    root.append(el('div', { class: 'callout callout--warn', html: `${icon('info')}<div>Add your Anthropic API key in Settings to use the assistant (quick-add by text, questions about your data, and summaries).</div>` }));
    const b = el('button', { class: 'btn btn--primary btn--block', type: 'button', text: 'Open Settings' });
    b.onclick = () => bus.navigate('settings');
    root.append(b);
    return root;
  }

  const [allE, allX, allPS] = await Promise.all([earnings.all(), expenses.all(), payslips.all()]);

  // ---- quick add ----
  root.append(el('div', { class: 'section-title', text: 'Quick add by text' }));
  const addInput = el('input', { class: 'input', type: 'text', placeholder: 'e.g. Amazon Flex £52, 4 hours, 40 miles', autocomplete: 'off' });
  const addBtn = el('button', { class: 'btn btn--primary', type: 'button' }); addBtn.innerHTML = icon('spark') + '<span>Add</span>';
  const addStatus = el('div', { class: 'tiny', style: 'margin-top:6px;min-height:1em' });
  const doAdd = async () => {
    const text = addInput.value.trim(); if (!text) return;
    addBtn.disabled = true; addStatus.style.color = 'var(--muted)'; addStatus.textContent = 'Reading…';
    try {
      const context = { today: todayISO(), platforms: getPlatforms(), categories: categoryList() };
      const r = await parseEntry(text, context, s);
      if (r.kind === 'expense') {
        addStatus.textContent = ''; addInput.value = '';
        openExpenseForm({ date: r.date, category: r.category, amount: r.amount, vendor: r.vendor, vat: r.vat, notes: r.notes, source: 'claude' }, { asNew: true });
      } else if (r.kind === 'earning') {
        addStatus.textContent = ''; addInput.value = '';
        openEarningsForm({ date: r.date, platform: r.platform, amount: r.amount, tips: r.tips, hours: r.hours, deliveries: r.deliveries, miles: r.miles, notes: r.notes }, { asNew: true });
      } else {
        addStatus.style.color = 'var(--neg)'; addStatus.textContent = 'Not sure what to add — try including an amount, e.g. "£52".';
      }
    } catch (e) { addStatus.style.color = 'var(--neg)'; addStatus.textContent = e.message; }
    finally { addBtn.disabled = false; }
  };
  addBtn.onclick = doAdd;
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  root.append(el('div', { class: 'card' }, [el('div', { class: 'row', style: 'gap:8px' }, [addInput, addBtn]), addStatus]));

  // ---- ask ----
  root.append(el('div', { class: 'section-title', text: 'Ask about your money' }));
  const ar = (s.lang === 'ar');
  const chips = el('div', { class: 'chips', style: 'margin-bottom:10px' });
  [
    ['Summarise this week', 'Give me a short summary of this week vs last week.', 'لخّص لي هذا الأسبوع مقارنةً بالأسبوع الماضي باختصار.'],
    ['How am I doing this month?', 'How am I doing this month compared to my goal and recent months?', 'كيف أدائي هذا الشهر مقارنةً بهدفي والأشهر الأخيرة؟'],
    ['Best day & platform', 'Which weekday and which platform earn me the most per hour?', 'أي يوم في الأسبوع وأي منصّة تكسبني أكثر في الساعة؟'],
    ['How much tax so far?', 'How much should I set aside for tax and NIC so far this tax year, and why?', 'كم يجب أن أجنّب للضريبة والتأمين الوطني حتى الآن هذه السنة الضريبية، ولماذا؟'],
  ].forEach(([label, qEn, qAr]) => {
    const c = el('button', { class: 'chip', type: 'button', text: label });
    c.onclick = () => ask(ar ? qAr : qEn);
    chips.append(c);
  });
  root.append(chips);

  const thread = el('div', { id: 'assist-thread' });
  history.forEach(m => thread.append(bubble(m.role, m.text)));
  root.append(thread);

  const q = el('input', { class: 'input', type: 'text', placeholder: 'Ask anything about your earnings…', autocomplete: 'off' });
  const send = el('button', { class: 'btn btn--primary', type: 'button' }); send.innerHTML = icon('spark') + '<span>Ask</span>';
  const askRow = el('div', { class: 'card', style: 'position:sticky;bottom:calc(var(--tabbar-h) + var(--safe-bottom) + 8px)' }, [el('div', { class: 'row', style: 'gap:8px' }, [q, send])]);
  root.append(askRow);

  async function ask(question) {
    if (!question) return;
    history.push({ role: 'user', text: question });
    const th = document.getElementById('assist-thread');
    th.append(bubble('user', question));
    const loading = bubble('assistant', '…'); loading.classList.add('is-loading'); th.append(loading);
    loading.scrollIntoView({ behavior: 'smooth', block: 'end' });
    try {
      const summary = buildSummary(allE, allX, allPS, s);
      const system = `You are Kerb, a friendly assistant for a UK driver who is self-employed (delivery) and may ALSO have a PAYE employed job.
Answer using ONLY the JSON data. Be concise (1–4 sentences), use £ and plain language, never invent figures. Reply in the same language the user used.
Important:
- "Money to set aside" for tax/NIC applies to SELF-EMPLOYMENT (Self Assessment) only. PAYE tax and NI are already deducted at source by the employer, so the driver does not set those aside.
- The data has two parts: "selfEmployment" (delivery) and "employmentPAYE" (job/payslips). If self-employment profit is £0 but there is PAYE income, say the SE set-aside is £0 AND acknowledge the PAYE income/tax that is handled automatically — do not say total income is £0.`;
      const text = await claudeText({ system, user: `${question}\n\nDATA (JSON):\n${JSON.stringify(summary)}`, settings: s, maxTokens: 500 });
      history.push({ role: 'assistant', text });
      loading.replaceWith(bubble('assistant', text));
    } catch (e) {
      history.push({ role: 'assistant', text: '⚠ ' + e.message });
      loading.replaceWith(bubble('assistant', '⚠ ' + e.message));
    }
    const last = document.querySelector('#assist-thread .bubble:last-child');
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
  const doAsk = () => { const v = q.value.trim(); if (!v) return; q.value = ''; ask(v); };
  send.onclick = doAsk;
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAsk(); });

  return root;
}

function bubble(role, text) {
  return el('div', { class: `bubble bubble--${role}` }, [el('div', { class: 'bubble__body', text })]);
}

function getPlatforms() { return allPlatforms().map(p => ({ id: p.id, name: p.name })); }
function categoryList() { return EXPENSE_CATEGORIES.map(c => ({ id: c.id, label: c.label })); }

// Compact, privacy-minded aggregate summary for the model.
function buildSummary(allE, allX, allPS, s) {
  const sum = computeTaxYear(allE, allX, s);
  const ty = taxYearFromLabel(s.taxYear);
  const paye = derivePaye(allPS || [], s.taxYear);
  const thisWeek = summariseRange(allE, allX, addDays(todayISO(), -6), todayISO(), s);
  const lastWeek = summariseRange(allE, allX, addDays(todayISO(), -13), addDays(todayISO(), -7), s);
  const last30 = summariseRange(allE, allX, addDays(todayISO(), -29), todayISO(), s);
  // income by month (within tax year)
  const MON = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const byMonth = {};
  allE.filter(e => e.date >= ty.start && e.date <= ty.end).forEach(e => {
    const idx = (parseISO(e.date).getMonth() + 12 - 3) % 12;
    byMonth[MON[idx]] = round2((byMonth[MON[idx]] || 0) + (e.amount || 0) + (e.tips || 0));
  });
  // top expense categories
  const cat = {};
  allX.filter(x => x.date >= ty.start && x.date <= ty.end).forEach(x => { cat[x.category] = round2((cat[x.category] || 0) + (x.amount || 0)); });
  const topExpenses = Object.entries(cat).map(([id, v]) => ({ category: categoryById(id).label, amount: v })).sort((a, b) => b.amount - a.amount).slice(0, 6);
  // per-weekday income/hours
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dow = {};
  allE.filter(e => e.date >= ty.start && e.date <= ty.end).forEach(e => {
    const k = DOW[parseISO(e.date).getDay()];
    dow[k] = dow[k] || { income: 0, hours: 0 };
    dow[k].income = round2(dow[k].income + (e.amount || 0) + (e.tips || 0));
    dow[k].hours = round2(dow[k].hours + (e.hours || 0));
  });
  const g = s.goalEnabled ? computeGoal(allE, allX, s) : null;
  return {
    taxYear: sum.taxYear,
    context: { region: s.region, vehicle: s.vehicle, expenseMethod: s.expenseMethod },
    selfEmployment: {
      incomeToDate: sum.grossIncome, netProfitToDate: sum.netProfit,
      taxToSetAside: sum.totalSETax, incomeTax: sum.incomeTaxSE, class4NIC: sum.class4, netTakeHome: sum.netTakeHome,
      effectiveRatePct: round2(sum.effectiveSERate), businessMiles: sum.businessMiles, mileageDeduction: sum.mileageDed,
      hours: sum.totalHours, deliveries: sum.totalDeliveries,
      poundsPerHour: sum.totalHours ? round2(sum.grossIncome / sum.totalHours) : null,
      poundsPerMile: sum.businessMiles ? round2(sum.grossIncome / sum.businessMiles) : null,
    },
    employmentPAYE: {
      note: 'PAYE tax & NI are deducted at source by the employer — not set aside by the driver.',
      source: s.payeSource,
      annualSalary: s.payeSalary || 0,
      annualTaxDeducted: s.payeTaxPaid || 0,
      payslipsThisYear: paye.count,
      ytdGrossFromPayslips: paye.sumGross,
      ytdTaxFromPayslips: paye.sumTax,
      ytdNIFromPayslips: paye.sumNI,
    },
    byPlatform: sum.byPlatform.map(p => ({ name: p.name, amount: p.amount })),
    incomeByMonth: byMonth,
    byWeekday: dow,
    topExpenses,
    thisWeek: pick(thisWeek), lastWeek: pick(lastWeek), last30days: pick(last30),
    goal: g ? { period: g.period, metric: s.goalMetric, target: g.amount, current: g.current, met: g.met, streak: g.streak } : null,
    keyDates: sum.deadlines,
    paymentsOnAccount: sum.poa.applies ? { each: sum.poa.each } : null,
  };
}
function pick(r) { return { income: r.income, hours: r.hours, miles: r.miles, deliveries: r.deliveries, expenses: r.expensesPaid }; }
