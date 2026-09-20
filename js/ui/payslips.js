// ============================================================
// ui/payslips.js — scan or upload PAYE payslips (photo or PDF),
// let Claude extract every field, store them, and (optionally)
// drive the tax engine's PAYE figures automatically.
// ============================================================
import { el, uid, todayISO, fmtGBP, fmtNum, fmtDate, parseMoney, fileToResizedDataURL, fileToBase64 } from '../util.js';
import { payslips } from '../db.js';
import { getSettings, saveSettings } from '../store.js';
import { extractPayslip, hasApiKey } from '../claude.js';
import { derivePaye, applyDerivedPaye } from '../payslips.js';
import { icon, field, moneyInput, selectInput, toast, openSheet, closeSheet, confirmDialog, emptyState } from './shared.js';
import { bus } from '../bus.js';

export async function render() {
  const s = getSettings();
  const all = await payslips.all();
  const root = el('div');
  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 12px', text: 'Payslips' }));
  root.append(el('div', { class: 'callout callout--brand', html: `${icon('spark')}<div>Scan a photo or upload the <b>PDF</b> of your monthly payslip — Claude reads the pay, tax, NI, hours, dates and your/employer details, and can keep your tax estimate accurate automatically.</div>` }));

  // use-for-tax toggle
  const useToggle = el('input', { type: 'checkbox' }); useToggle.checked = s.payeSource === 'payslips';
  const toggleRow = el('label', { class: 'switch-row' }, [
    el('div', {}, [el('div', { style: 'font-weight:700', text: 'Use payslips for my tax figures' }), el('div', { class: 'tiny faint', text: 'Auto-fills your PAYE salary & tax from these payslips instead of a manual number.' })]),
    el('span', { class: 'switch' }, [useToggle, el('span', { class: 'track' })]),
  ]);
  useToggle.addEventListener('change', async () => {
    saveSettings({ payeSource: useToggle.checked ? 'payslips' : 'manual' });
    if (useToggle.checked) applyDerivedPaye(await payslips.all());
    toast('Saved', 'ok'); bus.refresh();
  });
  root.append(el('div', { class: 'card' }, [toggleRow]));

  // derived summary (this tax year)
  if (s.payeSource === 'payslips') {
    const d = derivePaye(all, s.taxYear);
    root.append(el('div', { class: 'card' }, [
      el('div', { class: 'section-title', style: 'margin:0 0 8px', text: `From payslips · ${s.taxYear}` }),
      el('div', { class: 'grid-3' }, [
        tile('Payslips', String(d.count)),
        tile('Annual salary', fmtGBP(d.annualSalary, { round: true })),
        tile('Annual tax', fmtGBP(d.annualTax, { round: true })),
      ]),
      d.count ? el('div', { class: 'tiny muted', style: 'margin-top:8px', text: `Annualised from ${d.count} ${d.frequency} payslip(s). YTD gross so far ${fmtGBP(d.sumGross)}, tax ${fmtGBP(d.sumTax)}.` }) : el('div', { class: 'tiny muted', style: 'margin-top:8px', text: 'Add a payslip to populate your PAYE figures.' }),
    ]));
  }

  // scan / upload
  const photoInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
  const fileInput = el('input', { type: 'file', accept: 'application/pdf,image/*', style: 'display:none' });
  const status = el('div', { class: 'scan-status', hidden: true });
  const photoBtn = el('button', { class: 'btn btn--primary', type: 'button' }); photoBtn.innerHTML = icon('camera') + '<span>Scan photo</span>';
  const pdfBtn = el('button', { class: 'btn btn--sub', type: 'button' }); pdfBtn.innerHTML = icon('note') + '<span>Upload PDF / file</span>';
  photoBtn.onclick = () => photoInput.click();
  pdfBtn.onclick = () => fileInput.click();
  photoInput.addEventListener('change', () => handleFile(photoInput.files[0]));
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

  async function handleFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    status.hidden = false; status.style.color = 'var(--muted)';
    status.innerHTML = `<span class="splash__spin"></span> Claude is reading the payslip…`;
    photoBtn.disabled = pdfBtn.disabled = true;
    try {
      let source, image = '';
      if (isPdf) { const { base64 } = await fileToBase64(file); source = { kind: 'pdf', base64 }; }
      else { image = await fileToResizedDataURL(file, 1600, 0.85); source = { kind: 'image', dataUrl: image }; }
      if (!hasApiKey(getSettings())) { toast('Add your API key in Settings to auto-read', 'warn'); status.hidden = true; openPayslipForm({ image }, { asNew: true }); return; }
      const r = await extractPayslip(source, getSettings());
      status.hidden = true;
      openPayslipForm({ ...r, image, source: 'claude' }, { asNew: true });
    } catch (e) {
      status.innerHTML = `${icon('warn')} ${e.message}`; status.style.color = 'var(--neg)';
    } finally { photoBtn.disabled = pdfBtn.disabled = false; photoInput.value = ''; fileInput.value = ''; }
  }

  root.append(el('div', { class: 'section-title', text: 'Add a payslip' }));
  root.append(el('div', { class: 'card' }, [
    el('div', { class: 'btn-grid' }, [photoBtn, pdfBtn]),
    photoInput, fileInput, status,
    el('button', { class: 'link tiny', type: 'button', text: 'Enter manually', style: 'display:block;margin:10px auto 0', onclick: () => openPayslipForm(null) }),
    !hasApiKey(s) ? el('div', { class: 'hint', style: 'margin-top:6px', text: 'Tip: add your Anthropic API key in Settings to auto-read payslips.' }) : null,
  ]));

  // list
  if (!all.length) {
    root.append(emptyState('note', 'No payslips yet', 'Scan or upload your latest payslip to get started.'));
    return root;
  }
  root.append(el('div', { class: 'section-title', text: 'Your payslips' }));
  const list = el('div', { class: 'card card--flush' });
  all.forEach(p => {
    const item = el('div', { class: 'item' }, [
      el('div', { class: 'item__icon', style: 'background:var(--info-tint);color:var(--info)', html: icon('note') }),
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: `${p.employerName || 'Employer'}${p.frequency ? ' · ' + p.frequency : ''}` }),
        el('div', { class: 'item__sub', text: `${fmtDate(p.payDate, { withYear: true })}${p.payTime ? ' ' + p.payTime : ''} · tax ${fmtGBP(p.incomeTax)}${p.nationalInsurance ? ' · NI ' + fmtGBP(p.nationalInsurance) : ''}` }),
      ]),
      el('div', { class: 'item__amt', text: fmtGBP(p.gross) }),
    ]);
    item.onclick = () => openPayslipForm(p);
    list.append(item);
  });
  root.append(list);
  return root;
}

function tile(k, v) { return el('div', { class: 'tile', style: 'padding:10px 11px' }, [el('div', { class: 'tile__k', style: 'font-size:11px', text: k }), el('div', { class: 'tile__v', style: 'font-size:17px', text: v })]); }

// ---------------- payslip form ----------------
export function openPayslipForm(existing = null, opts = {}) {
  const isEdit = !!existing && !opts.asNew;
  const b = existing || {};
  const p = {
    id: isEdit ? b.id : uid(), payDate: b.payDate || todayISO(), payTime: b.payTime || '',
    frequency: b.frequency || 'monthly', periodStart: b.periodStart || '', periodEnd: b.periodEnd || '', taxPeriod: b.taxPeriod || '',
    taxCode: b.taxCode || '', niLetter: b.niLetter || '', niNumber: b.niNumber || '',
    gross: b.gross ?? '', net: b.net ?? '', incomeTax: b.incomeTax ?? '', nationalInsurance: b.nationalInsurance ?? '',
    pension: b.pension ?? '', studentLoan: b.studentLoan ?? '', otherDeductions: b.otherDeductions ?? '',
    ytdGross: b.ytdGross ?? '', ytdTax: b.ytdTax ?? '', ytdNI: b.ytdNI ?? '', ytdPension: b.ytdPension ?? '',
    hours: b.hours ?? '', hourlyRate: b.hourlyRate ?? '', annualSalary: b.annualSalary ?? '',
    employeeName: b.employeeName || '', employeeAddress: b.employeeAddress || '', payrollNumber: b.payrollNumber || '',
    employerName: b.employerName || '', employerAddress: b.employerAddress || '', payeReference: b.payeReference || '',
    paymentMethod: b.paymentMethod || '', notes: b.notes || '', image: b.image || '', source: b.source || 'manual',
  };
  const form = el('form', { class: 'kform', autocomplete: 'off' });
  const txt = (v, ph) => el('input', { class: 'input', type: 'text', value: v, placeholder: ph || '' });
  const dt = (v) => el('input', { class: 'input', type: 'date', value: v });
  const money = (v) => moneyInput({ value: v, placeholder: '0.00' });
  const numI = (v, ph) => el('input', { class: 'input', type: 'number', step: 'any', inputMode: 'decimal', value: v, placeholder: ph || '' });

  const F = {
    payDate: dt(p.payDate), payTime: el('input', { class: 'input', type: 'time', value: p.payTime }),
    frequency: selectInput([{ value: 'monthly', label: 'Monthly' }, { value: '4-weekly', label: 'Every 4 weeks' }, { value: 'weekly', label: 'Weekly' }, { value: 'other', label: 'Other' }], p.frequency),
    periodStart: dt(p.periodStart), periodEnd: dt(p.periodEnd), taxPeriod: txt(p.taxPeriod, 'e.g. Month 6'),
    gross: money(p.gross), net: money(p.net), incomeTax: money(p.incomeTax), nationalInsurance: money(p.nationalInsurance),
    pension: money(p.pension), studentLoan: money(p.studentLoan), otherDeductions: money(p.otherDeductions),
    ytdGross: money(p.ytdGross), ytdTax: money(p.ytdTax), ytdNI: money(p.ytdNI), ytdPension: money(p.ytdPension),
    hours: numI(p.hours, 'hours'), hourlyRate: money(p.hourlyRate), annualSalary: money(p.annualSalary),
    employeeName: txt(p.employeeName), employeeAddress: txt(p.employeeAddress), payrollNumber: txt(p.payrollNumber),
    niNumber: txt(p.niNumber, 'AB123456C'), taxCode: txt(p.taxCode, '1257L'), niLetter: txt(p.niLetter, 'A'),
    employerName: txt(p.employerName), employerAddress: txt(p.employerAddress), payeReference: txt(p.payeReference),
    paymentMethod: txt(p.paymentMethod, 'e.g. BACS'), notes: txt(p.notes),
  };

  form.append(
    el('div', { class: 'grid-2' }, [field('Pay date', F.payDate), field('Pay time', F.payTime)]),
    el('div', { class: 'grid-2' }, [field('Frequency', F.frequency), field('Tax period', F.taxPeriod)]),
    el('div', { class: 'grid-2' }, [field('Gross (this pay)', F.gross), field('Take-home (net)', F.net)]),
    el('div', { class: 'grid-2' }, [field('Income tax', F.incomeTax), field('National Insurance', F.nationalInsurance)]),
    section('Deductions', [el('div', { class: 'grid-2' }, [field('Pension', F.pension), field('Student loan', F.studentLoan)]), field('Other deductions', F.otherDeductions)]),
    section('Year to date', [el('div', { class: 'grid-2' }, [field('YTD gross', F.ytdGross), field('YTD tax', F.ytdTax)]), el('div', { class: 'grid-2' }, [field('YTD NI', F.ytdNI), field('YTD pension', F.ytdPension)])]),
    section('Work & rate', [el('div', { class: 'grid-2' }, [field('Hours', F.hours), field('Hourly rate', F.hourlyRate)]), field('Stated annual salary', F.annualSalary), el('div', { class: 'grid-2' }, [field('Period start', F.periodStart), field('Period end', F.periodEnd)])]),
    section('You', [field('Your name', F.employeeName), field('Your address', F.employeeAddress), el('div', { class: 'grid-2' }, [field('NI number', F.niNumber), field('Tax code', F.taxCode)]), el('div', { class: 'grid-2' }, [field('NI letter', F.niLetter), field('Payroll no.', F.payrollNumber)])]),
    section('Employer', [field('Employer name', F.employerName), field('Employer address', F.employerAddress), el('div', { class: 'grid-2' }, [field('PAYE reference', F.payeReference), field('Payment method', F.paymentMethod)])]),
    field('Note', F.notes),
  );
  if (p.image) { const img = el('img', { class: 'scan-preview', src: p.image, alt: 'payslip' }); form.append(img); }

  const val = (k) => F[k].input ? parseMoney(F[k].input.value) : (F[k].value || '');
  const save = async () => {
    const rec = {
      id: p.id, payDate: F.payDate.value || todayISO(), payTime: F.payTime.value, frequency: F.frequency.value,
      periodStart: F.periodStart.value, periodEnd: F.periodEnd.value, taxPeriod: F.taxPeriod.value.trim(),
      taxCode: F.taxCode.value.trim(), niLetter: F.niLetter.value.trim(), niNumber: F.niNumber.value.trim(),
      gross: val('gross'), net: val('net'), incomeTax: val('incomeTax'), nationalInsurance: val('nationalInsurance'),
      pension: val('pension'), studentLoan: val('studentLoan'), otherDeductions: val('otherDeductions'),
      ytdGross: val('ytdGross'), ytdTax: val('ytdTax'), ytdNI: val('ytdNI'), ytdPension: val('ytdPension'),
      hours: parseFloat(F.hours.value) || 0, hourlyRate: val('hourlyRate'), annualSalary: val('annualSalary'),
      employeeName: F.employeeName.value.trim(), employeeAddress: F.employeeAddress.value.trim(), payrollNumber: F.payrollNumber.value.trim(),
      employerName: F.employerName.value.trim(), employerAddress: F.employerAddress.value.trim(), payeReference: F.payeReference.value.trim(),
      paymentMethod: F.paymentMethod.value.trim(), notes: F.notes.value.trim(), image: p.image || '', source: p.source || 'manual',
    };
    if (!rec.gross && !rec.incomeTax) { toast('Enter at least the gross pay', 'err'); return; }
    await payslips.save(rec);
    applyDerivedPaye(await payslips.all());
    closeSheet(); toast(isEdit ? 'Payslip updated' : 'Payslip added', 'ok'); bus.refresh();
  };

  const wrap = el('div', { style: 'margin-top:16px' });
  wrap.append(el('button', { class: 'btn btn--primary btn--block', type: 'submit', text: 'Save' }));
  if (isEdit) {
    const del = el('button', { class: 'btn btn--danger btn--block', type: 'button', style: 'margin-top:8px' });
    del.innerHTML = icon('trash') + '<span>Delete</span>';
    del.onclick = async () => {
      const ok = await confirmDialog({ title: 'Delete payslip?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true });
      if (!ok) return;
      await payslips.remove(p.id); applyDerivedPaye(await payslips.all());
      closeSheet(); toast('Payslip deleted', 'ok'); bus.refresh();
    };
    wrap.append(del);
  }
  form.append(wrap);
  form.addEventListener('submit', (ev) => { ev.preventDefault(); save(); });
  openSheet({ title: isEdit ? 'Edit payslip' : 'Add payslip', node: form });
}

function section(title, children) {
  const d = el('details', { class: 'kdetails', open: true }, [el('summary', { text: title }), ...children]);
  return d;
}
