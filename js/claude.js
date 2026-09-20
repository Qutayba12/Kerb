// ============================================================
// claude.js — receipt reading via the Anthropic API.
// The API key lives only in this device's settings and is sent
// straight to api.anthropic.com (never to any Kerb server —
// there isn't one). Uses the browser-direct access header.
// ============================================================
import { EXPENSE_CATEGORIES } from './store.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

const CATEGORY_IDS = EXPENSE_CATEGORIES.map(c => c.id).join(', ');

function buildPrompt() {
  return `You are a receipt/invoice reader for a UK self-employed delivery driver's bookkeeping app.
Read EVERYTHING on the attached receipt/invoice and reply with ONLY a JSON object (no prose, no markdown fences):
{
  "amount": <grand total actually paid in GBP, incl. VAT, as a number>,
  "subtotal": <net/subtotal before VAT if shown, else 0>,
  "vat": <VAT amount in GBP if shown, else 0>,
  "vatRate": <VAT rate % if shown, e.g. 20, else 0>,
  "date": "<YYYY-MM-DD transaction date; empty string if truly not shown>",
  "time": "<HH:MM 24h if shown, else empty>",
  "vendor": "<merchant/shop name>",
  "address": "<full street address line(s) as printed, comma-separated; empty if none>",
  "area": "<town/city/area>",
  "postcode": "<UK postcode, uppercased, e.g. SW1A 1AA; empty if none>",
  "category": "<one of: ${CATEGORY_IDS}>",
  "paymentMethod": "<e.g. Visa ****1234, Cash, Contactless; empty if none>",
  "receiptNo": "<receipt/invoice/transaction number if shown, else empty>",
  "vatNumber": "<merchant VAT reg number if shown, else empty>",
  "items": "<short summary of items/qty, e.g. '38.2L diesel @ 149.9p'; under 80 chars>",
  "notes": "<anything else useful, under 60 chars>",
  "confidence": <0..1 how confident you are overall>
}
Rules:
- amount = the grand total paid (include VAT). Read numbers exactly; never invent values you cannot see — use empty/0 instead.
- Parse the date/time carefully (UK format is usually DD/MM/YYYY). Output date strictly as YYYY-MM-DD.
- Capture the FULL address and postcode exactly as printed.
- Pick the closest category: fuel/diesel/petrol -> "fuel"; phone/mobile/broadband -> "phone"; car insurance -> "insurance";
  repairs/MOT/tyres/service -> "repairs"; road tax -> "roadtax"; parking/toll/congestion -> "parking";
  delivery/thermal bag, phone mount -> "bags"; car wash -> "cleaning"; if unsure -> "other".
- Numbers (amount/subtotal/vat/vatRate/confidence) must be JSON numbers, not strings.`;
}

export function hasApiKey(settings) {
  return !!(settings && settings.apiKey && settings.apiKey.trim());
}

// dataUrl -> { media_type, base64 }
function splitDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new Error('Invalid image data');
  return { media_type: m[1], base64: m[2] };
}

export async function extractReceipt(dataUrl, settings) {
  if (!hasApiKey(settings)) throw new Error('No API key set. Add your Anthropic API key in Settings.');
  const { media_type, base64 } = splitDataUrl(dataUrl);
  const model = settings.claudeModel || 'claude-haiku-4-5';

  const body = {
    model,
    max_tokens: 700,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type, data: base64 } },
        { type: 'text', text: buildPrompt() },
      ],
    }],
  };

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('Network error reaching Anthropic. Check your connection and try again.');
  }

  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.error?.message || ''; } catch {}
    if (res.status === 401) throw new Error('Invalid API key (401). Check the key in Settings.');
    if (res.status === 429) throw new Error('Rate limited (429). Wait a moment and try again.');
    if (res.status === 400 && /credit|billing/i.test(detail)) throw new Error('Anthropic account needs credit. Add a little balance in the Anthropic console.');
    throw new Error(`Anthropic error ${res.status}${detail ? ': ' + detail : ''}`);
  }

  const data = await res.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  const parsed = parseJson(text);
  if (!parsed) throw new Error('Could not read the receipt. Try a clearer photo or enter it manually.');

  const str = (v, n = 120) => (v == null ? '' : String(v)).trim().slice(0, n);
  return {
    amount: toNum(parsed.amount),
    subtotal: toNum(parsed.subtotal),
    vat: toNum(parsed.vat),
    vatRate: toNum(parsed.vatRate),
    date: cleanDate(parsed.date),
    time: cleanTime(parsed.time),
    vendor: str(parsed.vendor, 80),
    address: str(parsed.address, 200),
    area: str(parsed.area, 80),
    postcode: str(parsed.postcode, 12).toUpperCase(),
    category: normaliseCategory(parsed.category),
    paymentMethod: str(parsed.paymentMethod, 40),
    receiptNo: str(parsed.receiptNo, 40),
    vatNumber: str(parsed.vatNumber, 30),
    items: str(parsed.items, 120),
    notes: str(parsed.notes, 120),
    confidence: toNum(parsed.confidence),
    usage: data.usage || null,
  };
}
function cleanTime(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = String(Math.min(23, parseInt(m[1], 10))).padStart(2, '0');
  return `${h}:${m[2]}`;
}

function parseJson(text) {
  if (!text) return null;
  // strip code fences if present
  let t = text.replace(/```json/gi, '```').replace(/```/g, '').trim();
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
function toNum(v) { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function cleanDate(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function normaliseCategory(v) {
  const s = String(v || '').toLowerCase().trim();
  const ids = EXPENSE_CATEGORIES.map(c => c.id);
  if (ids.includes(s)) return s;
  return 'other';
}

// Generic text call to Claude. Returns the reply text.
export async function claudeText({ system, user, settings, maxTokens = 600 }) {
  if (!hasApiKey(settings)) throw new Error('No API key set. Add your Anthropic API key in Settings.');
  const body = {
    model: settings.claudeModel || 'claude-haiku-4-5',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: user }],
  };
  if (system) body.system = system;
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('Network error reaching Anthropic. Check your connection.'); }
  if (!res.ok) {
    let detail = ''; try { const j = await res.json(); detail = j.error?.message || ''; } catch {}
    if (res.status === 401) throw new Error('Invalid API key (401). Check it in Settings.');
    if (res.status === 429) throw new Error('Rate limited — try again in a moment.');
    if (res.status === 400 && /credit|billing/i.test(detail)) throw new Error('Your Anthropic account needs credit.');
    throw new Error(`Anthropic error ${res.status}${detail ? ': ' + detail : ''}`);
  }
  const data = await res.json();
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
}

// Parse a free-text line into a structured earning/expense.
export async function parseEntry(text, context, settings) {
  const system = `You convert a UK delivery driver's short note into ONE bookkeeping entry.
Reply with ONLY a JSON object, no prose. Shape:
{"kind":"earning"|"expense"|"unknown",
 "platform":"<one of the platform ids>","amount":<number>,"tips":<number>,"hours":<number>,"deliveries":<int>,"miles":<number>,
 "category":"<one of the expense category ids>","vendor":"<string>","date":"YYYY-MM-DD","notes":"<short>"}
Rules:
- "earning" for money earned delivering; "expense" for money spent; "unknown" if unclear.
- Use only ids from the provided lists. Money as plain numbers (GBP). Omit/zero fields that don't apply.
- Default date to today (${context.today}) unless the note clearly says otherwise.
Platforms: ${JSON.stringify(context.platforms)}
Expense categories: ${JSON.stringify(context.categories)}`;
  const out = await claudeText({ system, user: text, settings, maxTokens: 300 });
  const parsed = parseJson(out);
  if (!parsed) throw new Error('Could not understand that — try e.g. "Amazon Flex £52, 4 hours, 40 miles".');
  return parsed;
}

// ---------- payslip extraction (image or PDF) ----------
function payslipPrompt() {
  return `You are reading a UK employee PAYE payslip. Extract EVERYTHING and reply with ONLY a JSON object (no prose, no fences):
{
  "payDate":"<YYYY-MM-DD payment date>","payTime":"<HH:MM if shown else empty>",
  "frequency":"<monthly|weekly|4-weekly|other>",
  "periodStart":"<YYYY-MM-DD or empty>","periodEnd":"<YYYY-MM-DD or empty>",
  "taxPeriod":"<tax month/week number if shown, e.g. 'Month 6' else empty>",
  "taxCode":"<e.g. 1257L>","niLetter":"<NI category letter if shown>","niNumber":"<National Insurance number if shown>",
  "gross": <this period's gross pay, number>,
  "net": <this period's net/take-home pay, number>,
  "incomeTax": <PAYE income tax deducted this period, number>,
  "nationalInsurance": <employee NI this period, number>,
  "pension": <employee pension this period, number, else 0>,
  "studentLoan": <student loan deducted this period, number, else 0>,
  "otherDeductions": <sum of any other deductions this period, number, else 0>,
  "ytdGross": <year-to-date gross if shown, number, else 0>,
  "ytdTax": <year-to-date tax if shown, number, else 0>,
  "ytdNI": <year-to-date NI if shown, number, else 0>,
  "ytdPension": <year-to-date pension if shown, number, else 0>,
  "hours": <hours worked this period if shown, number, else 0>,
  "hourlyRate": <hourly rate if shown, number, else 0>,
  "annualSalary": <stated annual salary if shown, number, else 0>,
  "employeeName":"<full name>","employeeAddress":"<full address incl. postcode, comma-separated>",
  "employerName":"<employer name>","employerAddress":"<employer full address incl. postcode>",
  "payeReference":"<employer PAYE reference if shown>","payrollNumber":"<employee/payroll number if shown>",
  "paymentMethod":"<e.g. BACS, bank transfer>","notes":"<anything else useful, <60 chars>",
  "confidence": <0..1>
}
Rules:
- All money fields are plain GBP numbers (no symbols). Use 0 when not shown; never invent values.
- Read amounts exactly. Parse dates carefully (UK is DD/MM/YYYY) and output YYYY-MM-DD.
- Capture full employee and employer names and addresses (with postcodes) exactly as printed.
- "gross"/"incomeTax"/"nationalInsurance" are THIS payslip's period values; the "ytd*" fields are the year-to-date totals.`;
}

// source: { kind:'image', dataUrl } OR { kind:'pdf', base64, mediaType }
export async function extractPayslip(source, settings) {
  if (!hasApiKey(settings)) throw new Error('No API key set. Add your Anthropic API key in Settings.');
  let contentBlock;
  if (source.kind === 'pdf') {
    contentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: source.base64 } };
  } else {
    const { media_type, base64 } = splitDataUrl(source.dataUrl);
    contentBlock = { type: 'image', source: { type: 'base64', media_type, data: base64 } };
  }
  const body = {
    model: settings.claudeModel || 'claude-haiku-4-5',
    max_tokens: 900,
    messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: payslipPrompt() }] }],
  };
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('Network error reaching Anthropic. Check your connection.'); }
  if (!res.ok) {
    let detail = ''; try { const j = await res.json(); detail = j.error?.message || ''; } catch {}
    if (res.status === 401) throw new Error('Invalid API key (401). Check it in Settings.');
    if (res.status === 400 && /credit|billing/i.test(detail)) throw new Error('Your Anthropic account needs credit.');
    throw new Error(`Anthropic error ${res.status}${detail ? ': ' + detail : ''}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  const parsed = parseJson(text);
  if (!parsed) throw new Error('Could not read the payslip. Try a clearer photo/PDF or enter it manually.');
  const num = (v) => toNum(v);
  const str = (v, n = 200) => (v == null ? '' : String(v)).trim().slice(0, n);
  return {
    payDate: cleanDate(parsed.payDate), payTime: cleanTime(parsed.payTime),
    frequency: normFreq(parsed.frequency), periodStart: cleanDate(parsed.periodStart), periodEnd: cleanDate(parsed.periodEnd),
    taxPeriod: str(parsed.taxPeriod, 20), taxCode: str(parsed.taxCode, 12), niLetter: str(parsed.niLetter, 2), niNumber: str(parsed.niNumber, 13),
    gross: num(parsed.gross), net: num(parsed.net), incomeTax: num(parsed.incomeTax), nationalInsurance: num(parsed.nationalInsurance),
    pension: num(parsed.pension), studentLoan: num(parsed.studentLoan), otherDeductions: num(parsed.otherDeductions),
    ytdGross: num(parsed.ytdGross), ytdTax: num(parsed.ytdTax), ytdNI: num(parsed.ytdNI), ytdPension: num(parsed.ytdPension),
    hours: num(parsed.hours), hourlyRate: num(parsed.hourlyRate), annualSalary: num(parsed.annualSalary),
    employeeName: str(parsed.employeeName, 80), employeeAddress: str(parsed.employeeAddress, 200),
    employerName: str(parsed.employerName, 80), employerAddress: str(parsed.employerAddress, 200),
    payeReference: str(parsed.payeReference, 30), payrollNumber: str(parsed.payrollNumber, 30),
    paymentMethod: str(parsed.paymentMethod, 30), notes: str(parsed.notes, 120), confidence: num(parsed.confidence),
  };
}
function normFreq(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('week') && s.includes('4')) return '4-weekly';
  if (s.includes('week')) return 'weekly';
  if (s.includes('month')) return 'monthly';
  return 'monthly';
}

// Validate an API key with a tiny, cheap request.
export async function testKey(settings) {
  if (!hasApiKey(settings)) throw new Error('Enter your API key first.');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: settings.claudeModel || 'claude-haiku-4-5', max_tokens: 4, messages: [{ role: 'user', content: 'ping' }] }),
  });
  if (res.ok) return true;
  let detail = '';
  try { const j = await res.json(); detail = j.error?.message || ''; } catch {}
  if (res.status === 401) throw new Error('Invalid API key (401).');
  if (res.status === 400 && /credit|billing/i.test(detail)) throw new Error('Key works, but the account needs credit.');
  throw new Error(`Error ${res.status}${detail ? ': ' + detail : ''}`);
}

// Estimate the cost of one receipt scan (very rough, for user reassurance).
export function estimateScanCost() {
  // A resized receipt image + short JSON reply on a Haiku-class model is well
  // under 1p per scan. We show a friendly fixed message rather than a figure.
  return 'about a fraction of a penny per scan';
}
