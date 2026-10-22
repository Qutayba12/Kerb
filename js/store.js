// ============================================================
// store.js — settings (localStorage) + UK tax rate tables.
// All rates live here and are editable in Settings, so the app
// stays correct when HMRC changes figures in future years.
// Figures verified for 2026/27: England/Wales/NI, Scotland (six
// bands) and student-loan thresholds, all editable in Settings.
// ============================================================
import { currentTaxYear } from './util.js';

const LS_KEY = 'kerb.settings.v1';

// Income-tax bands are expressed as cumulative TAXABLE income thresholds
// (income after the Personal Allowance is removed). NOTE: the top limit is
// £125,140 of TAXABLE income — it is already a taxable figure, so the
// allowance must NOT be subtracted from it again. Doing so starts the
// additional/top rate £12,570 early for anyone whose allowance has tapered.
const RUK_BANDS = [
  { upTo: 37700, rate: 0.20 },      // Basic:  £12,571–£50,270
  { upTo: 125140, rate: 0.40 },     // Higher: £50,271–£125,140
  { upTo: Infinity, rate: 0.45 },   // Additional: over £125,140
];
// Scotland — six bands, set by the Scottish Parliament. Thresholds below are
// CUMULATIVE TAXABLE income (gross salary minus the UK-wide £12,570 allowance).
// 2025/26: Starter to £15,397, Basic to £27,491, Intermediate to £43,662.
const SCOT_BANDS_2025 = [
  { upTo: 2827, rate: 0.19 },       // Starter:      £12,571–£15,397
  { upTo: 14921, rate: 0.20 },      // Basic:        £15,398–£27,491
  { upTo: 31092, rate: 0.21 },      // Intermediate: £27,492–£43,662
  { upTo: 62430, rate: 0.42 },      // Higher:       £43,663–£75,000
  { upTo: 125140, rate: 0.45 },     // Advanced:     £75,001–£125,140
  { upTo: Infinity, rate: 0.48 },   // Top:          over £125,140
];
// 2026/27: Starter & Basic thresholds up 7.4%; Higher/Advanced/Top frozen.
const SCOT_BANDS_2026 = [
  { upTo: 3967, rate: 0.19 },       // Starter:      £12,571–£16,537
  { upTo: 16956, rate: 0.20 },      // Basic:        £16,538–£29,526
  { upTo: 31092, rate: 0.21 },      // Intermediate: £29,527–£43,662
  { upTo: 62430, rate: 0.42 },      // Higher:       £43,663–£75,000
  { upTo: 125140, rate: 0.45 },     // Advanced:     £75,001–£125,140
  { upTo: Infinity, rate: 0.48 },   // Top:          over £125,140
];

// Student loan repayment thresholds are set per tax year.
const STUDENT_LOANS_2025 = {
  none: { label: 'None', threshold: Infinity, rate: 0 },
  plan1: { label: 'Plan 1', threshold: 26065, rate: 0.09 },
  plan2: { label: 'Plan 2', threshold: 28470, rate: 0.09 },
  plan4: { label: 'Plan 4 (Scotland)', threshold: 32745, rate: 0.09 },
  plan5: { label: 'Plan 5', threshold: 25000, rate: 0.09 },
  postgrad: { label: 'Postgraduate', threshold: 21000, rate: 0.06 },
};
const STUDENT_LOANS_2026 = {
  none: { label: 'None', threshold: Infinity, rate: 0 },
  plan1: { label: 'Plan 1', threshold: 26900, rate: 0.09 },
  plan2: { label: 'Plan 2', threshold: 29385, rate: 0.09 },
  plan4: { label: 'Plan 4 (Scotland)', threshold: 33795, rate: 0.09 },
  plan5: { label: 'Plan 5', threshold: 25000, rate: 0.09 },
  postgrad: { label: 'Postgraduate', threshold: 21000, rate: 0.06 },
};

export const TAX_YEARS = {
  '2025/26': {
    label: '2025/26', startYear: 2025,
    personalAllowance: 12570, paTaper: 100000,
    bands: { ruk: RUK_BANDS, scotland: SCOT_BANDS_2025 },
    class4: { lpl: 12570, upl: 50270, mainRate: 0.06, upperRate: 0.02 },
    class2: { spt: 6845, weekly: 3.50 },
    tradingAllowance: 1000,
    vatThreshold: 90000,
    mileage: {
      car: { firstLimit: 10000, firstRate: 0.45, thenRate: 0.25 },
      motorcycle: { firstLimit: Infinity, firstRate: 0.24, thenRate: 0.24 },
      bicycle: { firstLimit: Infinity, firstRate: 0.20, thenRate: 0.20 },
    },
    homeOffice: [ // simplified flat rate £/month by hours worked at home
      { minHours: 25, rate: 10 }, { minHours: 51, rate: 18 }, { minHours: 101, rate: 26 },
    ],
    studentLoans: STUDENT_LOANS_2025,
  },
  '2026/27': {
    label: '2026/27', startYear: 2026,
    personalAllowance: 12570, paTaper: 100000,
    bands: { ruk: RUK_BANDS, scotland: SCOT_BANDS_2026 },
    class4: { lpl: 12570, upl: 50270, mainRate: 0.06, upperRate: 0.02 },
    class2: { spt: 7105, weekly: 3.65 },
    tradingAllowance: 1000,
    vatThreshold: 90000,
    mileage: {
      car: { firstLimit: 10000, firstRate: 0.55, thenRate: 0.25 }, // 45p→55p from 6 Apr 2026
      motorcycle: { firstLimit: Infinity, firstRate: 0.24, thenRate: 0.24 },
      bicycle: { firstLimit: Infinity, firstRate: 0.20, thenRate: 0.20 },
    },
    homeOffice: [
      { minHours: 25, rate: 10 }, { minHours: 51, rate: 18 }, { minHours: 101, rate: 26 },
    ],
    studentLoans: STUDENT_LOANS_2026,
  },
};

export const VEHICLE_LABELS = { car: 'Car / Van', motorcycle: 'Motorcycle / Scooter', bicycle: 'Bicycle' };
export const REGION_LABELS = { ruk: 'England / Wales / N. Ireland', scotland: 'Scotland' };

export const DEFAULT_PLATFORMS = [
  { id: 'amazonflex', name: 'Amazon Flex', color: '#ff9900', kind: 'block' },
  { id: 'ubereats', name: 'Uber Eats', color: '#06c167', kind: 'perDelivery' },
  { id: 'deliveroo', name: 'Deliveroo', color: '#00ccbc', kind: 'perDelivery' },
  { id: 'justeat', name: 'Just Eat', color: '#ff8000', kind: 'perDelivery' },
];

export const EXPENSE_CATEGORIES = [
  // vehicle:true = a running cost covered by the mileage rate (NOT separately
  // deductible when using the simplified mileage method).
  { id: 'phone', label: 'Phone & Internet', icon: 'phone', vehicle: false, defaultBizPct: 50 },
  { id: 'bags', label: 'Bags & Equipment', icon: 'bag', vehicle: false, defaultBizPct: 100 },
  { id: 'parking', label: 'Parking & Tolls', icon: 'parking', vehicle: false, defaultBizPct: 100 },
  { id: 'fees', label: 'Platform / Service Fees', icon: 'percent', vehicle: false, defaultBizPct: 100 },
  { id: 'clothing', label: 'Protective Clothing', icon: 'shirt', vehicle: false, defaultBizPct: 100 },
  { id: 'accountancy', label: 'Accountancy & Software', icon: 'calc', vehicle: false, defaultBizPct: 100 },
  { id: 'stationery', label: 'Stationery & Postage', icon: 'note', vehicle: false, defaultBizPct: 100 },
  { id: 'fuel', label: 'Fuel', icon: 'fuel', vehicle: true, defaultBizPct: 100 },
  { id: 'insurance', label: 'Vehicle Insurance', icon: 'shield', vehicle: true, defaultBizPct: 100 },
  { id: 'repairs', label: 'Repairs & Servicing', icon: 'wrench', vehicle: true, defaultBizPct: 100 },
  { id: 'roadtax', label: 'Road Tax & MOT', icon: 'road', vehicle: true, defaultBizPct: 100 },
  { id: 'cleaning', label: 'Vehicle Cleaning', icon: 'spray', vehicle: true, defaultBizPct: 100 },
  { id: 'other', label: 'Other', icon: 'dots', vehicle: false, defaultBizPct: 100 },
];
export function categoryById(id) {
  return EXPENSE_CATEGORIES.find(c => c.id === id) || EXPENSE_CATEGORIES.at(-1);
}

const DEFAULTS = {
  region: 'ruk',
  vehicle: 'car',                // the default/only vehicle's type
  vehicles: [],                  // [{id,label,type}] — empty = one vehicle of type `vehicle`
  expenseMethod: 'mileage',      // 'mileage' | 'actual'
  lossRelief: true,              // carry a trading loss forward against later profits
  hmrcPayments: [],              // [{id,taxYear,date,amount,note}] money actually sent to HMRC
  taxYear: currentTaxYear().label,
  payeSource: 'manual',          // 'manual' | 'payslips' (auto-derive from scanned payslips)
  payeFinished: false,           // PAYE job has ended → use actual year total, don't project to 12 months
  payeSalary: 0,                 // annual gross from an employed (PAYE) job
  payeTaxPaid: 0,                // income tax already deducted via PAYE (optional)
  otherIncome: 0,                // other taxable income (rent, etc.)
  studentLoanPlan: 'none',
  homeOfficeHoursPerMonth: 0,    // simplified home-working use of home
  taxPotMode: 'auto',            // 'auto' = live effective rate | 'manual'
  taxPotManualPct: 30,
  vehiclePotPerWeek: 0,
  savingsGoalPerWeek: 0,
  potTaxSaved: 0,                // money actually put aside so far (manual counters)
  potVehicleSaved: 0,
  potSavingsSaved: 0,
  goalEnabled: false,            // earnings goal
  goalMetric: 'income',          // 'income' | 'profit'
  goalPeriod: 'week',            // 'day' | 'week' | 'month'
  goalAmount: 0,
  notifyEnabled: false,          // local reminders (deadlines, goal)
  seStartDate: '',
  lastBackupAt: '',              // ISO datetime of the last exported backup (data-safety nudge)
  setupDismissed: false,         // hide the "getting set up" checklist card on Home
  traderName: '',                // optional, shown on the Self Assessment report
  utr: '',                       // optional Unique Taxpayer Reference
  apiKey: '',
  claudeModel: 'claude-haiku-4-5',
  lockEnabled: false,            // require a PIN to open the app
  pinHash: '',                   // SHA-256(salt + PIN) — never the PIN itself
  pinSalt: '',
  autoLockMins: 2,               // re-lock after this many minutes in the background
  theme: 'system',
  lang: 'en',                    // 'en' | 'ar' (Arabic, RTL)
  customPlatforms: [],
  onboarded: false,
  rateOverrides: {},             // { '2026/27': { personalAllowance: 12570, ... } }
};

let _settings = null;

export function loadSettings() {
  if (_settings) return _settings;
  try {
    const raw = localStorage.getItem(LS_KEY);
    _settings = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { _settings = { ...DEFAULTS }; }
  return _settings;
}
export function getSettings() { return loadSettings(); }
export function saveSettings(patch = {}) {
  _settings = { ...loadSettings(), ...patch };
  try { localStorage.setItem(LS_KEY, JSON.stringify(_settings)); } catch (e) { console.warn('settings save failed', e); }
  return _settings;
}
export function resetSettings() {
  _settings = { ...DEFAULTS };
  try { localStorage.setItem(LS_KEY, JSON.stringify(_settings)); } catch {}
  return _settings;
}

export function allPlatforms() {
  const s = loadSettings();
  return [...DEFAULT_PLATFORMS, ...(s.customPlatforms || [])];
}
// The driver's vehicles. Older installs have just the single `vehicle` type,
// which is returned here as one default vehicle so everything keeps working.
// HMRC applies the simplified-mileage bands PER VEHICLE, so each needs an id.
export function allVehicles() {
  const s = loadSettings();
  const list = Array.isArray(s.vehicles) ? s.vehicles.filter(v => v && v.id) : [];
  if (list.length) return list.map(v => ({ id: v.id, label: v.label || VEHICLE_LABELS[v.type] || 'Vehicle', type: v.type || 'car' }));
  return [{ id: 'default', label: VEHICLE_LABELS[s.vehicle] || 'Vehicle', type: s.vehicle || 'car' }];
}
export function vehicleById(id) {
  const list = allVehicles();
  return list.find(v => v.id === id) || list[0];
}

export function platformById(id) {
  return allPlatforms().find(p => p.id === id) || { id, name: id, color: '#888', kind: 'other' };
}

// Return the resolved tax config for a year label, applying any user overrides.
// Falls back to the latest known year for future/unknown labels.
export function getConfig(yearLabel) {
  const s = loadSettings();
  let base = TAX_YEARS[yearLabel];
  if (!base) {
    // clone latest known year for unknown/future labels
    const latest = Object.values(TAX_YEARS).sort((a, b) => b.startYear - a.startYear)[0];
    const startYear = parseInt(String(yearLabel).split('/')[0], 10) || latest.startYear;
    base = { ...structuredClone(latest), label: yearLabel, startYear };
  }
  const override = (s.rateOverrides || {})[yearLabel];
  if (override) base = deepMerge(structuredClone(base), override);
  return base;
}

function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) target[k] = deepMerge(target[k] || {}, v);
    else target[k] = v;
  }
  return target;
}

export function availableYears() {
  const labels = new Set(Object.keys(TAX_YEARS));
  labels.add(currentTaxYear().label);
  return Array.from(labels).sort();
}
