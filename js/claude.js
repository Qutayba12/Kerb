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
Extract the expense from the attached image and reply with ONLY a JSON object (no prose, no markdown fences):
{
  "amount": <total paid in GBP as a number, e.g. 42.50>,
  "date": "<YYYY-MM-DD, the transaction date; if unknown use empty string>",
  "vendor": "<shop/merchant name>",
  "category": "<one of: ${CATEGORY_IDS}>",
  "vat": <VAT amount in GBP as a number if shown, else 0>,
  "notes": "<short note, e.g. '30L unleaded' — keep under 60 chars>",
  "confidence": <0..1 how confident you are>
}
Rules:
- amount is the grand total actually paid (include VAT).
- Pick the closest category. Fuel/diesel/petrol -> "fuel". Phone/mobile/broadband -> "phone".
  Car insurance -> "insurance". Repairs/MOT/tyres/service -> "repairs" or "roadtax". Parking/toll/congestion -> "parking".
  Delivery bag/thermal bag/phone mount -> "bags". If unsure -> "other".
- Use numbers, not strings, for amount/vat/confidence. Never invent a total you cannot see.`;
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
    max_tokens: 400,
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

  return {
    amount: toNum(parsed.amount),
    date: cleanDate(parsed.date),
    vendor: (parsed.vendor || '').toString().slice(0, 80),
    category: normaliseCategory(parsed.category),
    vat: toNum(parsed.vat),
    notes: (parsed.notes || '').toString().slice(0, 120),
    confidence: toNum(parsed.confidence),
    usage: data.usage || null,
  };
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
