// ============================================================
// store.js — settings (localStorage) + UK tax rate tables.
// All rates live here and are editable in Settings, so the app
// stays correct when HMRC changes figures in future years.
// Figures verified for 2026/27 (England/Wales/NI). Scotland &
// student-loan thresholds are seeded and flagged "verify".
// ============================================================
import { currentTaxYear } from './util.js';

const LS_KEY = 'kerb.settings.v1';

// Income-tax bands are expressed as cumulative TAXABLE income
// thresholds (i.e. after the Personal Allowance is removed).
const RUK_BANDS = [
  { upTo: 37700, rate: 0.20 },      // Basic:  £12,571–£50,270
  { upTo: 112570, rate: 0.40 },     // Higher: £50,271–£125,140
  { upTo: Infinity, rate: 0.45 },   // Additional: over £125,140
];
// Scotland (seeded from 2025/26 published bands — verify per year in Settings)
const SCOT_BANDS = [
  { upTo: 2827, rate: 0.19 },       // Starter
  { upTo: 14921, rate: 0.20 },      // Basic
  { upTo: 31092, rate: 0.21 },      // Intermediate
  { upTo: 62430, rate: 0.42 },      // Higher
  { upTo: 112570, rate: 0.45 },     // Advanced
  { upTo: Infinity, rate: 0.48 },   // Top
];

const STUDENT_LOANS = {
  none: { label: 'None', threshold: Infinity, rate: 0 },
  plan1: { label: 'Plan 1', threshold: 26065, rate: 0.09 },
  plan2: { label: 'Plan 2', threshold: 28470, rate: 0.09 },
  plan4: { label: 'Plan 4 (Scotland)', threshold: 32745, rate: 0.09 },
  plan5: { label: 'Plan 5', threshold: 25000, rate: 0.09 },
  postgrad: { label: 'Postgraduate', threshold: 21000, rate: 0.06 },
};

export const TAX_YEARS = {
  '2025/26': {
    label: '2025/26', startYear: 2025,
    personalAllowance: 12570, paTaper: 100000,
    bands: { ruk: RUK_BANDS, scotland: SCOT_BANDS },
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
    studentLoans: STUDENT_LOANS,
  },
  '2026/27': {
    label: '2026/27', startYear: 2026,
    personalAllowance: 12570, paTaper: 100000,
    bands: { ruk: RUK_BANDS, scotland: SCOT_BANDS },
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
    studentLoans: STUDENT_LOANS,
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
  vehicle: 'car',
  expenseMethod: 'mileage',      // 'mileage' | 'actual'
  taxYear: currentTaxYear().label,
  payeSource: 'manual',          // 'manual' | 'payslips' (auto-derive from scanned payslips)
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
