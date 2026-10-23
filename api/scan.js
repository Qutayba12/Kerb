// ============================================================
// api/scan.js — the shared-key scanning endpoint.
//
// Lets someone use scanning without creating an Anthropic
// account. The key lives here, in an environment variable, and
// never reaches the browser. Everything the app does with its
// OWN key still goes straight to Anthropic and never touches
// this endpoint.
//
// Required environment variable:
//   ANTHROPIC_API_KEY     the key this endpoint spends
// Optional:
//   KV_REST_API_URL / KV_REST_API_TOKEN   shared counters (see _store.js)
//   FREE_SCANS_PER_MONTH  default 50
//   DAILY_REQUEST_CAP     default 5000  — bounds the worst case absolutely
// ============================================================
import { validateScanRequest, weighRequest, LIMITS } from './_validate.js';
import { bump, peek, isShared } from './_store.js';

const FREE_PER_MONTH = Number(process.env.FREE_SCANS_PER_MONTH || 50);
const DAILY_CAP = Number(process.env.DAILY_REQUEST_CAP || 5000);
const PER_MINUTE = 8;          // per device
const PER_HOUR_IP = 60;

const DAY = 86400, MONTH = 2678400, MINUTE = 60, HOUR = 3600;

const monthKey = () => new Date().toISOString().slice(0, 7);
const dayKey = () => new Date().toISOString().slice(0, 10);

const send = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(obj));
};

// A device id is a random value the app keeps on the device. It is not an
// identity and not a login: it exists only to spread the free allowance over
// devices rather than over the whole internet. Someone who clears it gets a
// new allowance, which costs a fraction of a penny — the daily cap, not this,
// is what bounds the damage.
const deviceOf = (req) => {
  const raw = String(req.headers['x-kerb-device'] || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : '';
};

const ipOf = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: { message: 'POST only' } });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return send(res, 503, { error: { code: 'not_configured', message: 'Shared scanning is not set up on this deployment. Add your own Anthropic API key in Settings.' } });
  }

  const body = req.body;
  if (typeof body === 'string' && body.length > LIMITS.maxBodyBytes) {
    return send(res, 413, { error: { message: 'Request too large' } });
  }
  const parsed = typeof body === 'string' ? safeParse(body) : body;
  const check = validateScanRequest(parsed);
  if (!check.ok) return send(res, 400, { error: { code: 'rejected', message: check.reason } });

  const device = deviceOf(req);
  if (!device) return send(res, 400, { error: { code: 'rejected', message: 'Missing device header' } });
  const ip = ipOf(req);
  const weight = weighRequest(parsed);

  try {
    // The absolute bound on what this endpoint can cost in a day. Checked
    // first so a flood cannot be spent through the other allowances.
    const today = await bump(`d:${dayKey()}`, weight, DAY);
    if (today > DAILY_CAP) {
      return send(res, 429, { error: { code: 'daily_cap', message: 'Shared scanning has reached its daily limit. Try again tomorrow, or add your own Anthropic API key in Settings for unlimited scanning.' } });
    }

    const perMin = await bump(`m:${device}:${Math.floor(Date.now() / 60000)}`, 1, MINUTE);
    if (perMin > PER_MINUTE) {
      return send(res, 429, { error: { code: 'too_fast', message: 'That is a lot of scans at once — wait a minute and try again.' } });
    }

    const perHour = await bump(`h:${ip}:${Math.floor(Date.now() / 3600000)}`, 1, HOUR);
    if (perHour > PER_HOUR_IP) {
      return send(res, 429, { error: { code: 'too_fast', message: 'Too many scans from this connection. Wait an hour, or add your own Anthropic API key in Settings.' } });
    }

    const used = await bump(`q:${monthKey()}:${device}`, 1, MONTH);
    if (used > FREE_PER_MONTH) {
      return send(res, 402, {
        error: {
          code: 'quota_exhausted',
          message: `You have used your ${FREE_PER_MONTH} free scans this month. Add your own Anthropic API key in Settings to keep scanning — it costs a fraction of a penny per scan.`,
        },
      });
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(parsed),
    });

    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    // What is left of the free allowance, so the app can warn before it runs out.
    res.setHeader('x-kerb-scans-left', String(Math.max(0, FREE_PER_MONTH - used)));
    res.setHeader('x-kerb-quota-shared', isShared() ? '1' : '0');
    return res.end(text);
  } catch (err) {
    return send(res, 502, { error: { code: 'upstream', message: 'Could not reach Anthropic. Try again shortly.' } });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
