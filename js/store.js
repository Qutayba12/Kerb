// ============================================================
// store.js — settings (localStorage) + UK tax rate tables.
// All rates live here and are editable in Settings, so the app
// stays correct when HMRC changes figures in future years.
// Figures verified for 2026/27: England/Wales/NI, Scotland (six
// bands) and student-loan thresholds, all editable in Settings.
// ============================================================
import { currentTaxYear, round2 } from './util.js';

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
  // Pickup points, each with its own distance. A delivery driver's stations
  // sit at very different distances, so a single "typical miles per block"
  // would overstate the near ones and understate the far ones.
  stations: [],                  // [{id,label,baseMiles,typicalMiles}]
  mileageBasis: '',              // how the distances were worked out — shown on the report
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
  claudeModel: 'claude-haiku-5-5',   // see DEFAULT_MODEL below
  captureGapDays: 7,             // days without a logged shift before the Wednesday nudge speaks
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

// ---------------------------------------------------------------
// Validate settings arriving from a backup file. A backup is a plain
// JSON file a driver may be handed, so nothing in it can be trusted:
// previously it was merged wholesale, which let a crafted file put
// markup into values that are printed into the UI. Unknown keys are
// dropped and every known key is coerced to its expected shape.
// ---------------------------------------------------------------
const SECRET_KEYS = ['apiKey', 'pinHash', 'pinSalt', 'lockEnabled'];
const ENUMS = {
  region: ['ruk', 'scotland'],
  vehicle: ['car', 'motorcycle', 'bicycle'],
  expenseMethod: ['mileage', 'actual'],
  payeSource: ['manual', 'payslips'],
  taxPotMode: ['auto', 'manual'],
  goalMetric: ['income', 'profit'],
  goalPeriod: ['day', 'week', 'month'],
  theme: ['system', 'light', 'dark'],
  lang: ['en', 'ar'],
  studentLoanPlan: ['none', 'plan1', 'plan2', 'plan4', 'plan5', 'postgrad'],
};
const sNum = (v, lo, hi, d = 0) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
// Values that end up on screen never need angle brackets.
const sText = (v, n = 120) => (typeof v === 'string' ? v : '').replace(/[<>]/g, '').slice(0, n);
const sDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const sColour = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : '#8a8a8a');
const sYear = (v) => (typeof v === 'string' && /^\d{4}\/\d{2}$/.test(v) ? v : DEFAULTS.taxYear);

export function sanitiseSettings(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const has = (k) => Object.prototype.hasOwnProperty.call(raw, k);
  const put = (k, v) => { if (has(k)) out[k] = v; };

  for (const [k, allowed] of Object.entries(ENUMS)) put(k, allowed.includes(raw[k]) ? raw[k] : DEFAULTS[k]);
  put('taxYear', sYear(raw.taxYear));
  for (const k of ['payeSalary', 'payeTaxPaid', 'otherIncome', 'vehiclePotPerWeek', 'savingsGoalPerWeek',
                   'potTaxSaved', 'potVehicleSaved', 'potSavingsSaved', 'goalAmount']) put(k, sNum(raw[k], 0, 1e9));
  put('taxPotManualPct', sNum(raw.taxPotManualPct, 0, 100, 30));
  put('homeOfficeHoursPerMonth', sNum(raw.homeOfficeHoursPerMonth, 0, 744));
  put('autoLockMins', sNum(raw.autoLockMins, 0, 1440, 2));
  for (const k of ['payeFinished', 'lossRelief', 'goalEnabled', 'notifyEnabled', 'setupDismissed', 'onboarded']) put(k, !!raw[k]);
  put('seStartDate', sDate(raw.seStartDate));
  put('lastBackupAt', sText(raw.lastBackupAt, 40));
  put('traderName', sText(raw.traderName, 80));
  put('utr', sText(raw.utr, 20));
  put('claudeModel', sText(raw.claudeModel, 60));
  put('captureGapDays', sNum(raw.captureGapDays, 1, 90, 7));

  if (Array.isArray(raw.customPlatforms)) {
    out.customPlatforms = raw.customPlatforms.slice(0, 50).filter(p => p && typeof p === 'object').map(p => ({
      id: sText(p.id, 40) || 'p' + Math.random().toString(36).slice(2, 8),
      name: sText(p.name, 40) || 'Platform',
      color: sColour(p.color),
      kind: sText(p.kind, 20) || 'other',
    }));
  }
  if (Array.isArray(raw.vehicles)) {
    out.vehicles = raw.vehicles.slice(0, 20).filter(v => v && typeof v === 'object').map(v => ({
      id: sText(v.id, 40) || 'v' + Math.random().toString(36).slice(2, 8),
      label: sText(v.label, 40) || 'Vehicle',
      type: ENUMS.vehicle.includes(v.type) ? v.type : 'car',
    }));
  }
  if (Array.isArray(raw.stations)) {
    out.stations = raw.stations.slice(0, 50).filter(v => v && typeof v === 'object').map(v => ({
      id: sText(v.id, 40) || 's' + Math.random().toString(36).slice(2, 8),
      label: sText(v.label, 60) || 'Station',
      baseMiles: sNum(v.baseMiles, 0, 2000),
      typicalMiles: sNum(v.typicalMiles, 0, 2000),
    }));
  }
  put('mileageBasis', sText(raw.mileageBasis, 400));
  if (Array.isArray(raw.hmrcPayments)) {
    out.hmrcPayments = raw.hmrcPayments.slice(0, 500).filter(p => p && typeof p === 'object').map(p => ({
      id: sText(p.id, 40) || 'h' + Math.random().toString(36).slice(2, 8),
      taxYear: sYear(p.taxYear), date: sDate(p.date) || DEFAULTS.taxYear.slice(0, 4) + '-04-06',
      amount: sNum(p.amount, 0, 1e9), note: sText(p.note, 120),
    }));
  }
  // Rate overrides only ever hold numbers; keep the numeric leaves, drop the rest.
  if (raw.rateOverrides && typeof raw.rateOverrides === 'object') {
    const ro = {};
    for (const [year, obj] of Object.entries(raw.rateOverrides).slice(0, 20)) {
      if (!/^\d{4}\/\d{2}$/.test(year) || !obj || typeof obj !== 'object') continue;
      ro[year] = numbersOnly(obj, 0);
    }
    out.rateOverrides = ro;
  }
  for (const k of SECRET_KEYS) delete out[k];
  return out;
}
function numbersOnly(obj, depth) {
  if (depth > 3) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj).slice(0, 40)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 20).map(x => (x && typeof x === 'object' ? numbersOnly(x, depth + 1) : (Number.isFinite(x) ? x : 0)));
    else if (v && typeof v === 'object') out[k] = numbersOnly(v, depth + 1);
  }
  return out;
}

let _settings = null;

// Models that have a current-generation replacement at the same or lower
// price. A saved claude-haiku-4-5 costs ten times as much per scan as
// claude-haiku-5-5 for the same job, so an old install is quietly paying
// more for a worse model until it is moved across.
export const DEFAULT_MODEL = 'claude-haiku-5-5';

const MODEL_UPGRADES = {
  'claude-haiku-4-5': 'claude-haiku-5-5',
  'claude-sonnet-5': 'claude-sonnet-5-5',
};

export function loadSettings() {
  if (_settings) return _settings;
  try {
    const raw = localStorage.getItem(LS_KEY);
    _settings = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { _settings = { ...DEFAULTS }; }
  const better = MODEL_UPGRADES[_settings.claudeModel];
  if (better) {
    _settings.claudeModel = better;
    try { localStorage.setItem(LS_KEY, JSON.stringify(_settings)); } catch {}
  }
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
// The stations this driver collects from.
//
// A block is not a there-and-back trip. It runs home -> station -> drops ->
// home from wherever the last drop happened to be, and that last leg varies
// from ten minutes to an hour. So a station holds two separate things:
//
//   baseMiles     one way, home to the station. The only leg whose
//                 deductibility is in question, and the only one that is
//                 the same every time.
//   typicalMiles  what a whole block from here usually comes to, measured.
//                 Used to fill a figure in; never a substitute for a reading.
export function allStations() {
  const s = loadSettings();
  const list = Array.isArray(s.stations) ? s.stations.filter(v => v && v.id) : [];
  return list.map(v => ({
    id: v.id,
    label: v.label || 'Station',
    baseMiles: Number(v.baseMiles) || 0,
    typicalMiles: Number(v.typicalMiles) || 0,
  }));
}
export function stationById(id) { return allStations().find(v => v.id === id) || null; }

// What a block from this station usually comes to, taken from shifts that
// were actually measured there. The whole block is used, not a derived part
// of it: the way home starts at the last drop, not at the station, so there
// is no fixed distance to subtract and nothing to reconstruct.
//
// Only readings count — odometer or GPS. Deriving a figure from a mileage
// typed in afterwards would hand the driver their own guess back as evidence.
export function suggestBlockMiles(stationId, allEarnings = []) {
  const st = stationById(stationId);
  if (!st) return null;
  const totals = allEarnings
    .filter(e => e && e.stationId === stationId
      && (e.milesSource === 'odometer' || e.milesSource === 'gps')
      && Number(e.miles) > 0)
    .map(e => round2(Number(e.miles)))
    // A block cannot be shorter than getting to the station in the first place.
    .filter(v => v >= st.baseMiles);
  if (!totals.length) return null;
  const avg = round2(totals.reduce((t, v) => t + v, 0) / totals.length);
  return { n: totals.length, average: avg, lowest: Math.min(...totals), highest: Math.max(...totals) };
}

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
    // No published figures for this year yet, so carry the latest known ones
    // forward. They are a placeholder, not the real rates: `carriedFrom`
    // records that, so the screens can say so instead of presenting last
    // year's allowances under this year's name.
    const latest = Object.values(TAX_YEARS).sort((a, b) => b.startYear - a.startYear)[0];
    const startYear = parseInt(String(yearLabel).split('/')[0], 10) || latest.startYear;
    base = { ...structuredClone(latest), label: yearLabel, startYear, carriedFrom: latest.label };
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
