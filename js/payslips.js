// ============================================================
// payslips.js — derive annual PAYE figures from scanned payslips
// and (when enabled) feed them into the tax engine via settings.
// ============================================================
import { round2, taxYearFromLabel, inRange } from './util.js';
import { getSettings, saveSettings } from './store.js';

const PERIODS_PER_YEAR = { monthly: 12, '4-weekly': 13, weekly: 52, other: 12 };

// Summarise payslips within a tax year into annualised salary + tax.
export function derivePaye(allPayslips, yearLabel) {
  const ty = taxYearFromLabel(yearLabel);
  const list = (allPayslips || []).filter(p => p.payDate && inRange(p.payDate, ty.start, ty.end));
  if (!list.length) return { count: 0, annualSalary: 0, annualTax: 0, sumGross: 0, sumTax: 0, sumNI: 0, sumPension: 0, sumHours: 0, frequency: 'monthly', ppy: 12 };

  // most common frequency
  const freqCount = {};
  list.forEach(p => { const f = p.frequency || 'monthly'; freqCount[f] = (freqCount[f] || 0) + 1; });
  const frequency = Object.entries(freqCount).sort((a, b) => b[1] - a[1])[0][0];
  const ppy = PERIODS_PER_YEAR[frequency] || 12;

  const sum = (k) => round2(list.reduce((t, p) => t + (p[k] || 0), 0));
  const sumGross = sum('gross'), sumTax = sum('incomeTax'), sumNI = sum('nationalInsurance'), sumPension = sum('pension'), sumHours = sum('hours');
  const count = list.length;

  // Prefer the latest payslip's YTD figures (most authoritative); else annualise the average.
  const latest = list.slice().sort((a, b) => (a.payDate < b.payDate ? 1 : -1))[0];
  const statedAnnual = latest && latest.annualSalary > 0 ? latest.annualSalary : 0;

  const annualSalary = statedAnnual || (count ? round2((sumGross / count) * ppy) : 0);
  const annualTax = count ? round2((sumTax / count) * ppy) : 0;

  return { count, annualSalary, annualTax, sumGross, sumTax, sumNI, sumPension, sumHours, frequency, ppy,
    ytdGross: latest?.ytdGross || 0, ytdTax: latest?.ytdTax || 0 };
}

// When PAYE source is "payslips", push derived annual figures into settings
// so the existing tax engine (which reads payeSalary/payeTaxPaid) stays correct.
export function applyDerivedPaye(allPayslips) {
  const s = getSettings();
  if (s.payeSource !== 'payslips') return null;
  const d = derivePaye(allPayslips, s.taxYear);
  saveSettings({ payeSalary: d.annualSalary, payeTaxPaid: d.annualTax });
  return d;
}
