// ============================================================
// api/_validate.js — what the shared-key endpoint will accept.
//
// This is the real abuse control, not the rate limit. The proxy
// holds a key that pays for every call, so the endpoint must be
// useless for anything except the four jobs the app does. A
// request is accepted only if it has the exact shape the app
// sends: one document or image, one instruction, no system
// prompt, no tools, a capped reply. Someone who finds the URL
// gets a receipt reader, not a free model.
// ============================================================

export const ALLOWED_MODELS = new Set(['claude-haiku-5-5', 'claude-sonnet-5-5']);

export const LIMITS = {
  maxTokens: 8000,        // the largest any path in the app asks for
  maxBase64: 6_000_000,   // ~4.5 MB of image or PDF
  maxPromptChars: 8000,
  maxBodyBytes: 8_000_000,
};

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const fail = (reason) => ({ ok: false, reason });

export function validateScanRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('body must be an object');

  // Only the fields the app sends. Anything else (system, tools, tool_choice,
  // metadata, stream) is refused rather than ignored, so the endpoint cannot
  // be steered into general-purpose use.
  const allowedKeys = new Set(['model', 'max_tokens', 'messages']);
  for (const k of Object.keys(body)) if (!allowedKeys.has(k)) return fail(`unexpected field: ${k}`);

  if (!ALLOWED_MODELS.has(body.model)) return fail('unsupported model');

  if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > LIMITS.maxTokens) {
    return fail(`max_tokens must be 1..${LIMITS.maxTokens}`);
  }

  if (!Array.isArray(body.messages) || body.messages.length !== 1) return fail('expected exactly one message');
  const msg = body.messages[0];
  if (!msg || msg.role !== 'user' || !Array.isArray(msg.content)) return fail('message must be a user message with content blocks');
  if (msg.content.length !== 2) return fail('expected one document and one instruction');

  const [doc, text] = msg.content;

  if (!doc || typeof doc !== 'object') return fail('first block must be an image or document');
  if (doc.type === 'image') {
    const src = doc.source;
    if (!src || src.type !== 'base64' || !IMAGE_TYPES.has(src.media_type)) return fail('unsupported image source');
    if (typeof src.data !== 'string' || !src.data) return fail('missing image data');
    if (src.data.length > LIMITS.maxBase64) return fail('image too large');
  } else if (doc.type === 'document') {
    const src = doc.source;
    if (!src || src.type !== 'base64' || src.media_type !== 'application/pdf') return fail('unsupported document source');
    if (typeof src.data !== 'string' || !src.data) return fail('missing document data');
    if (src.data.length > LIMITS.maxBase64) return fail('document too large');
  } else {
    return fail('first block must be an image or document');
  }

  if (!text || text.type !== 'text' || typeof text.text !== 'string') return fail('second block must be text');
  if (!text.text.trim()) return fail('empty instruction');
  if (text.text.length > LIMITS.maxPromptChars) return fail('instruction too long');

  return { ok: true };
}

// A rough per-request cost ceiling, used to stop one caller consuming the
// whole daily budget with a handful of very large documents.
export function weighRequest(body) {
  const src = body?.messages?.[0]?.content?.[0]?.source;
  const bytes = typeof src?.data === 'string' ? src.data.length : 0;
  return Math.max(1, Math.ceil(bytes / 400_000));
}
