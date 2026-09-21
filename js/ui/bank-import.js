// ============================================================
// ui/bank-import.js — scan a photo or upload a PDF of a bank /
// card statement; Claude extracts every transaction and pre-
// classifies each one. You confirm income vs expense vs skip,
// then bulk-add them to your books.
// ============================================================
import { el, uid, todayISO, fmtGBP, fmtDate, fileToResizedDataURL, fileToBase64 } from '../util.js';
import { earnings, expenses } from '../db.js';
import { getSettings, allPlatforms, EXPENSE_CATEGORIES, categoryById } from '../store.js';
import { extractBankTransactions, hasApiKey } from '../claude.js';
import { icon, toast, selectInput } from './shared.js';
import { makeDupChecker } from '../dedupe.js';
import { bus } from '../bus.js';

let extracted = null; // array of transactions pending confirmation

export async function render() {
  const s = getSettings();
  extracted = null; // fresh each visit
  const root = el('div');
  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 12px', text: 'Import bank statement' }));
  root.append(el('div', { class: 'callout callout--brand', html: `${icon('spark')}<div>Scan a photo or upload the <b>PDF</b> of your bank / card statement — Claude reads every transaction and suggests which are delivery <b>income</b> and which are business <b>expenses</b>. You confirm each one before it's added.</div>` }));

  if (!hasApiKey(s)) {
    root.append(el('div', { class: 'callout callout--warn', html: `${icon('info')}<div>Add your Anthropic API key in Settings to read statements. Your statement is sent only to Anthropic to read it — never stored anywhere else.</div>` }));
    const b = el('button', { class: 'btn btn--primary btn--block', type: 'button', text: 'Open Settings' }); b.onclick = () => bus.navigate('settings');
    root.append(b);
    return root;
  }

  // Records already saved — used to flag likely duplicates so the same money
  // isn't counted twice (e.g. a payout that's in both a statement and the bank).
  const [existingE, existingX] = await Promise.all([earnings.all(), expenses.all()]);
  const dupChecker = makeDupChecker(existingE, existingX);

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
      const context = {
        today: todayISO(),
        platforms: allPlatforms().map(p => ({ id: p.id, name: p.name })),
        categories: EXPENSE_CATEGORIES.map(c => c.id),
      };
      const { transactions, truncated } = await extractBankTransactions(source, context, getSettings());
      status.hidden = true;
      if (!transactions.length) { toast('No transactions found in that statement', 'warn'); return; }
      extracted = transactions.map(t => ({ ...t, id: uid() }));
      renderPreview();
      if (truncated) toast(`Long statement — showing the first ${transactions.length}. Import the rest a page at a time.`, 'warn');
    } catch (e) { status.innerHTML = `${icon('warn')} ${e.message}`; status.style.color = 'var(--neg)'; }
    finally { photoBtn.disabled = pdfBtn.disabled = false; photoInput.value = ''; fileInput.value = ''; }
  }
  photoInput.addEventListener('change', () => handle(photoInput.files[0]));
  fileInput.addEventListener('change', () => handle(fileInput.files[0]));

  function counts() {
    const inc = extracted.filter(t => t.suggestion === 'income');
    const exp = extracted.filter(t => t.suggestion === 'expense');
    const sal = extracted.filter(t => t.suggestion === 'salary');
    return {
      incN: inc.length, expN: exp.length, salN: sal.length,
      incSum: inc.reduce((a, t) => a + t.amount, 0),
      expSum: exp.reduce((a, t) => a + t.amount, 0),
    };
  }

  function renderPreview() {
    preview.replaceChildren();
    if (!extracted || !extracted.length) return;

    const summary = el('div', { class: 'card', style: 'margin-bottom:12px' });
    const summaryRow = el('div', { class: 'row row--between' });
    summary.append(summaryRow);
    preview.append(summary);

    const listEl = el('div', {});

    const refreshSummary = () => {
      const c = counts();
      summaryRow.replaceChildren(
        el('div', {}, [
          el('div', { class: 'section-title', style: 'margin:0', text: `${extracted.length} transaction${extracted.length === 1 ? '' : 's'} found` }),
          el('div', { class: 'tiny', text: `${c.incN} income · ${c.expN} expense${c.salN ? ` · ${c.salN} salary` : ''} · ${extracted.length - c.incN - c.expN - c.salN} skipped` }),
        ]),
        el('div', { style: 'text-align:right' }, [
          el('div', { class: 'amt-pos', style: 'font-weight:800', text: '+' + fmtGBP(c.incSum) }),
          el('div', { class: 'amt-neg', style: 'font-weight:800', text: '−' + fmtGBP(c.expSum) }),
        ]),
      );
    };

    extracted.forEach(t => {
      const card = el('div', { class: 'card', style: 'margin-bottom:8px;padding:12px' });
      const isOut = t.direction === 'out';
      // Resolve the effective platform/category so duplicate matching is stable.
      if (!isOut && !t.platform) t.platform = allPlatforms()[0].id;
      if (isOut && !t.category) t.category = 'fuel';
      // Does this line match something already saved on the device?
      const rowDup = () => isOut
        ? dupChecker.isDup('expense', { date: t.date, amount: t.amount })
        : dupChecker.isDup('earning', { date: t.date, platform: t.platform, amount: t.amount, tips: 0 });
      // A likely duplicate income/expense defaults to "skip" so it isn't counted twice.
      if ((t.suggestion === 'income' || t.suggestion === 'expense') && rowDup()) { t.suggestion = 'ignore'; t._autoSkipped = true; }

      // ---- header: date · description + amount ----
      const dupPill = el('span', { class: 'pill pill--warn', style: 'display:none;margin-top:5px', text: 'Already logged' });
      const head = el('div', { class: 'row row--between', style: 'gap:10px' }, [
        el('div', { style: 'min-width:0' }, [
          el('div', { class: 'item__title', style: 'white-space:normal', text: t.description || 'Transaction' }),
          el('div', { class: 'item__sub', text: fmtDate(t.date, { weekday: true }) }),
          dupPill,
        ]),
        el('div', { class: isOut ? 'amt-neg' : 'amt-pos', style: 'font-weight:800;white-space:nowrap', text: (isOut ? '−' : '+') + fmtGBP(t.amount) }),
      ]);
      card.append(head);
      const updatePill = () => { dupPill.style.display = rowDup() ? 'inline-block' : 'none'; };

      // ---- classification controls ----
      const controls = el('div', { class: 'grid-2', style: 'margin-top:10px' });
      // valid options depend on direction. Money-in can be self-employed income,
      // employment salary (PAYE — kept separate, not added), or skipped.
      const typeOpts = isOut
        ? [{ value: 'expense', label: 'Expense' }, { value: 'ignore', label: 'Skip' }]
        : [{ value: 'income', label: 'Income (self-employed)' }, { value: 'salary', label: 'Salary (PAYE)' }, { value: 'ignore', label: 'Skip' }];
      const validIn = new Set(['income', 'salary', 'ignore']);
      const defaultType = isOut
        ? (t.suggestion === 'expense' ? 'expense' : 'ignore')
        : (validIn.has(t.suggestion) ? t.suggestion : 'ignore');
      const typeSel = selectInput(typeOpts, defaultType);

      // detail select (platform for income, category for expense, note for salary)
      const detailWrap = el('div', {});
      const buildDetail = () => {
        detailWrap.replaceChildren();
        if (t.suggestion === 'income') {
          const sel = selectInput(allPlatforms().map(p => ({ value: p.id, label: p.name })), t.platform || allPlatforms()[0].id);
          sel.onchange = () => { t.platform = sel.value; updatePill(); };
          t.platform = sel.value;
          detailWrap.append(sel);
        } else if (t.suggestion === 'expense') {
          const sel = selectInput(EXPENSE_CATEGORIES.map(c => ({ value: c.id, label: c.label })), t.category || 'fuel');
          sel.onchange = () => { t.category = sel.value; };
          t.category = sel.value;
          detailWrap.append(sel);
        } else if (t.suggestion === 'salary') {
          detailWrap.append(el('div', { class: 'hint', style: 'margin:0;padding-top:9px', text: 'PAYE — kept separate. Add a payslip for full detail.' }));
        } else {
          detailWrap.append(el('div', { class: 'hint', style: 'margin:0;padding-top:9px', text: 'Won\'t be added' }));
        }
      };
      typeSel.onchange = () => { t.suggestion = typeSel.value; buildDetail(); updatePill(); refreshSummary(); card.classList.toggle('is-skipped', t.suggestion === 'ignore'); };
      buildDetail();
      updatePill();
      card.classList.toggle('is-skipped', t.suggestion === 'ignore');

      controls.append(typeSel, detailWrap);
      card.append(controls);
      listEl.append(card);
    });

    // Notice: how many rows were auto-skipped as likely duplicates.
    // Appended before listEl is added to preview, so it sits above the list.
    const dupCount = extracted.filter(t => t._autoSkipped).length;
    if (dupCount) {
      preview.append(el('div', { class: 'callout callout--warn', html: `${icon('info')}<div><b>${dupCount}</b> transaction${dupCount === 1 ? '' : 's'} look like ${dupCount === 1 ? 'one' : 'ones'} you've already logged, so ${dupCount === 1 ? "it's" : "they're"} set to <b>Skip</b>. Switch a row back to Income/Expense if you do want to add it.</div>` }));
    }

    preview.append(listEl);
    refreshSummary();

    const add = el('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:12px' });
    const updateAddLabel = () => {
      const c = counts();
      const n = c.incN + c.expN;
      add.innerHTML = icon('check') + `<span>Add ${n} item${n === 1 ? '' : 's'} (${c.incN} income · ${c.expN} expense)</span>`;
      add.disabled = n === 0;
    };
    updateAddLabel();
    // Any type change bubbles up here, so keep the Add button count in sync.
    listEl.addEventListener('change', updateAddLabel);

    add.onclick = async () => {
      add.disabled = true;
      let saved = 0;
      for (const t of extracted) {
        if (t.suggestion === 'income') {
          await earnings.save({
            id: t.id, date: t.date, platform: t.platform || allPlatforms()[0].id,
            amount: t.amount, tips: 0, hours: 0, deliveries: 0, miles: 0,
            notes: `Bank import — ${t.description}`.slice(0, 120), source: 'bank',
          });
          saved++;
        } else if (t.suggestion === 'expense') {
          const cat = categoryById(t.category || 'fuel');
          await expenses.save({
            id: t.id, date: t.date, category: cat.id, amount: t.amount,
            vendor: t.description || '', bizPct: cat.defaultBizPct, vat: 0,
            notes: 'Bank import', source: 'bank', image: '', lineItems: [],
          });
          saved++;
        }
      }
      extracted = null;
      toast(`Added ${saved} item${saved === 1 ? '' : 's'}`, 'ok');
      bus.navigate('home');
    };
    preview.append(add);
    preview.append(el('div', { class: 'hint', style: 'margin-top:8px', text: 'Claude suggested a type for each line — change any that are wrong, or set to Skip to leave a line out. You can edit each entry afterwards in Income or Expenses.' }));
  }

  root.append(el('div', { class: 'card' }, [el('div', { class: 'btn-grid' }, [photoBtn, pdfBtn]), photoInput, fileInput, status]));
  root.append(preview);
  return root;
}
