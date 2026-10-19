// ============================================================
// ui/guide.js — "Get set up": a checklist for a newly-registered
// self-employed driver that auto-ticks from the app's own state,
// plus the key HMRC dates and facts, personalised to their year.
// ============================================================
import { el, fmtGBP, fmtDate, todayISO, daysBetween, humanUntil, registrationDeadline } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, saveSettings } from '../store.js';
import { computeTaxYear } from '../tax.js';
import { icon, downloadBackup, toast } from './shared.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const [allE, allX] = await Promise.all([earnings.all(), expenses.all()]);
  const sum = computeTaxYear(allE, allX, s);
  const d = sum.deadlines;
  const root = el('div');

  root.append(el('div', { class: 'row row--between', style: 'margin:4px 2px 12px' }, [
    el('h2', { style: 'font-size:22px', text: 'Get set up' }),
  ]));
  root.append(el('div', { class: 'callout callout--brand', html: `${icon('check')}<div><b>You're registered as self-employed 🎉</b> Here's everything to stay on top of it — Kerb ticks each step as you go.</div>` }));

  // ---- checklist ----
  const items = [
    {
      done: !!s.seStartDate,
      title: 'Set your start date',
      sub: s.seStartDate ? `Started ${fmtDate(s.seStartDate, { withYear: true })}` : 'The day you began delivering — sets your HMRC dates',
      go: () => bus.navigate('settings'),
    },
    {
      done: !!(s.utr && String(s.utr).trim()),
      title: 'Add your UTR (tax reference)',
      sub: s.utr ? `UTR ${s.utr}` : 'HMRC sends it ~10 days after registering — add it when it arrives',
      go: () => bus.navigate('settings'),
    },
    {
      done: allE.length > 0,
      title: 'Log your first earnings',
      sub: allE.length ? `${allE.length} shift${allE.length === 1 ? '' : 's'} logged` : 'Add a shift, or scan a statement',
      go: () => bus.navigate('income'),
    },
    {
      done: (s.potTaxSaved || 0) > 0,
      title: 'Start setting money aside',
      sub: (s.potTaxSaved || 0) > 0 ? `${fmtGBP(s.potTaxSaved)} in your tax pot` : 'Keep back your tax now so Jan 2028 is easy',
      go: () => bus.navigate('pots'),
    },
    {
      done: !!s.lastBackupAt,
      title: 'Take a backup',
      sub: s.lastBackupAt ? `Last backup ${fmtDate(s.lastBackupAt.slice(0, 10), { withYear: true })}` : 'Your records live only on this device — save a copy',
      go: () => downloadBackup().then(() => bus.refresh()),
    },
  ];
  if (!s.apiKey) items.push({
    done: false, title: 'Turn on scanning (optional)',
    sub: 'Add your Anthropic key to read receipts, statements & payslips',
    go: () => bus.navigate('settings'),
  });

  const doneN = items.filter(i => i.done).length;
  root.append(el('div', { class: 'row row--between', style: 'margin:16px 4px 8px' }, [
    el('div', { class: 'section-title', style: 'margin:0', text: 'Your checklist' }),
    el('div', { class: 'tiny', style: 'font-weight:800;color:var(--brand)', text: `${doneN} / ${items.length} done` }),
  ]));
  const list = el('div', { class: 'card card--flush' });
  items.forEach(it => {
    const dot = el('div', { class: 'item__icon', style: it.done ? 'background:var(--brand);color:#fff' : 'background:transparent;border:2px solid var(--border-strong);color:transparent', html: it.done ? icon('check') : '' });
    const row = el('button', { class: 'item', type: 'button', style: 'width:100%;text-align:inherit;background:none;border:none;border-bottom:1px solid var(--border)' }, [
      dot,
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', style: it.done ? 'text-decoration:line-through;color:var(--muted)' : '', text: it.title }),
        el('div', { class: 'item__sub', text: it.sub }),
      ]),
      el('span', { style: 'color:var(--faint)', html: it.done ? '' : icon('route') }),
    ]);
    row.onclick = it.go;
    list.append(row);
  });
  root.append(list);

  // ---- key dates ----
  root.append(el('div', { class: 'section-title', text: `Key dates · ${sum.taxYear}` }));
  const dates = el('div', { class: 'card card--flush' });
  const dateRow = (label, date, note) => {
    const days = daysBetween(todayISO(), date);
    const past = days < 0, near = !past && days < 60;
    dates.append(el('div', { class: 'item' }, [
      el('div', { class: 'item__icon', style: `background:${past ? 'var(--surface-2)' : near ? 'var(--warn-tint)' : 'var(--info-tint)'};color:${past ? 'var(--faint)' : near ? 'var(--warn)' : 'var(--info)'}`, html: icon('calendar') }),
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: label }),
        el('div', { class: 'item__sub', text: `${fmtDate(date, { withYear: true })}${note ? ' · ' + note : ''}` }),
      ]),
      el('div', { html: `<span class="pill pill--${past ? 'info' : near ? 'warn' : 'info'}">${humanUntil(date)}</span>` }),
    ]));
  };
  dateRow('Register with HMRC', registrationDeadline(s.seStartDate) || d.registerBy, 'you\'ve done this ✓');
  dateRow('File online & pay your tax', d.onlineFileAndPay, 'first Self Assessment');
  if (sum.poa.applies) dateRow('2nd payment on account', d.secondPOA);
  root.append(dates);

  // ---- good to know ----
  root.append(el('div', { class: 'section-title', text: 'Good to know' }));
  const facts = [
    ['Nothing to pay yet', `You pay after the tax year ends — by <b>${fmtDate(d.onlineFileAndPay, { withYear: true })}</b>. Set money aside as you go so it's easy.`],
    ['First £1,000 is tax-free', 'The £1,000 trading allowance means your first £1,000 of delivery income each year isn\'t taxed. Kerb applies it automatically.'],
    ['Mileage covers car costs', '55p/mile (first 10,000 miles) covers fuel, servicing, insurance & repairs — so you don\'t claim those separately. Log parking, tolls, phone & kit on top.'],
    ['NI is handled for you', 'Class 2 & Class 4 National Insurance are worked out and paid through the same Self Assessment — Kerb calculates them.'],
    ['Keep records 5+ years', 'HMRC can ask to see your records. Export a backup now and then and keep it somewhere safe.'],
  ];
  const factCard = el('div', {});
  facts.forEach(([t, body]) => factCard.append(el('div', { class: 'callout callout--info', html: `${icon('info')}<div><b>${t}.</b> ${body}</div>` })));
  root.append(factCard);

  // ---- report + hide ----
  const reportBtn = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-top:4px' });
  reportBtn.innerHTML = icon('note') + '<span>Open your Self Assessment report</span>';
  reportBtn.onclick = () => bus.navigate('report');
  root.append(reportBtn);

  if (!s.setupDismissed) {
    const hide = el('button', { class: 'link tiny', type: 'button', text: 'Hide the setup card from Home', style: 'display:block;margin:14px auto 0' });
    hide.onclick = () => { saveSettings({ setupDismissed: true }); toast('Hidden — find this guide in Settings'); bus.refresh(); };
    root.append(hide);
  }

  root.append(el('div', { class: 'tiny faint center', style: 'margin-top:14px', text: 'Guidance to help you prepare — not tax advice. Confirm with HMRC or an accountant.' }));
  return root;
}
