// Kerb icon generator — zero external dependencies (uses Node's built-in zlib).
// Renders a supersampled RGBA canvas, draws the brand mark, downscales for
// anti-aliasing, then encodes valid PNG files for the PWA manifest / favicons.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'icons');
mkdirSync(OUT, { recursive: true });

// ---- brand palette -------------------------------------------------------
const TEAL_TOP = [15, 138, 116];    // #0f8a74
const TEAL_BOT = [8, 92, 78];       // #085c4e
const GOLD = [245, 176, 66];        // #f5b042
const WHITE = [255, 255, 255];

// ---- tiny RGBA canvas ----------------------------------------------------
function makeCanvas(w, h) {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}
function setPx(c, x, y, [r, g, b], a = 255) {
  x = Math.floor(x); y = Math.floor(y); // typed arrays ignore fractional indices
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const ia = a / 255, ib = 1 - ia;
  c.data[i] = r * ia + c.data[i] * ib;
  c.data[i + 1] = g * ia + c.data[i + 1] * ib;
  c.data[i + 2] = b * ia + c.data[i + 2] * ib;
  c.data[i + 3] = Math.max(c.data[i + 3], a);
}
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function fillRoundRect(c, x0, y0, w, h, r, colorFn) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      // rounded-corner test
      let inside = true;
      const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
      const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r) inside = false;
      if (inside) setPx(c, x, y, colorFn(x, y));
    }
  }
}
function fillCircle(c, cx, cy, rad, color, a = 255) {
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) setPx(c, x, y, color, a);
    }
  }
}
function thickLine(c, x1, y1, x2, y2, width, color) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) * 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    fillCircle(c, x, y, width / 2, color);
  }
}

// Draw the Kerb mark: gold coin with a bold white "£", on a teal panel.
function drawMark(c, size, pad) {
  const inner = size - pad * 2;
  // vertical gradient background panel
  const radius = inner * 0.24;
  fillRoundRect(c, pad, pad, inner, inner, radius, (x, y) => {
    const t = (y - pad) / inner;
    return lerp(TEAL_TOP, TEAL_BOT, t);
  });

  // gold coin
  const coinR = inner * 0.30;
  const coinX = pad + inner * 0.5;
  const coinY = pad + inner * 0.44;
  fillCircle(c, coinX, coinY, coinR, [0, 0, 0], 55);           // soft shadow
  fillCircle(c, coinX, coinY + inner * 0.008, coinR, GOLD);    // coin face
  fillCircle(c, coinX, coinY, coinR * 0.86, lerp(GOLD, WHITE, 0.12)); // rim highlight

  // bold "£" made of strokes
  const w = inner * 0.055;
  const gx = coinX, gy = coinY;
  const h = coinR * 0.95;
  // vertical/curved stem
  thickLine(c, gx + h * 0.28, gy - h * 0.55, gx - h * 0.18, gy - h * 0.30, w, WHITE); // top curve
  thickLine(c, gx - h * 0.18, gy - h * 0.30, gx - h * 0.18, gy + h * 0.35, w, WHITE); // stem
  thickLine(c, gx - h * 0.45, gy + h * 0.55, gx + h * 0.45, gy + h * 0.55, w, WHITE); // base
  thickLine(c, gx - h * 0.42, gy + h * 0.02, gx + h * 0.20, gy + h * 0.02, w * 0.9, WHITE); // cross bar

  // little "road / kerb" dashes under the coin
  const roadY = pad + inner * 0.86;
  for (let i = 0; i < 3; i++) {
    const dashW = inner * 0.14;
    const gap = inner * 0.07;
    const totalW = dashW * 3 + gap * 2;
    const startX = pad + inner * 0.5 - totalW / 2;
    fillRoundRect(c, startX + i * (dashW + gap), roadY, dashW, inner * 0.045, inner * 0.02, () => WHITE);
  }
}

function downscale(src, factor) {
  const w = src.w / factor, h = src.h / factor;
  const out = makeCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = ((y * factor + sy) * src.w + (x * factor + sx)) * 4;
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; a += src.data[i + 3];
        }
      }
      const n = factor * factor, o = (y * w + x) * 4;
      out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n; out.data[o + 3] = a / n;
    }
  }
  return out;
}

// ---- PNG encoder ---------------------------------------------------------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(c) {
  const { w, h, data } = c;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = data[y * w * 4 + x];
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function render(size, { maskable = false } = {}) {
  const S = 4;
  const c = makeCanvas(size * S, size * S);
  // maskable icons need full-bleed background (no transparent corners) + safe zone
  const pad = maskable ? 0 : size * S * 0.06;
  if (maskable) {
    // full background
    fillRoundRect(c, 0, 0, size * S, size * S, 0, (x, y) => lerp(TEAL_TOP, TEAL_BOT, y / (size * S)));
    // draw mark inside inner safe area
    const inset = size * S * 0.14;
    drawMarkOnly(c, size * S, inset);
  } else {
    drawMark(c, size * S, pad);
  }
  return downscale(c, S);
}

// For maskable: background already drawn, just the coin+mark centered/scaled.
function drawMarkOnly(c, full, inset) {
  const inner = full - inset * 2;
  const coinR = inner * 0.34;
  const coinX = inset + inner * 0.5;
  const coinY = inset + inner * 0.46;
  fillCircle(c, coinX, coinY, coinR, [0, 0, 0], 55);
  fillCircle(c, coinX, coinY, coinR, GOLD);
  fillCircle(c, coinX, coinY, coinR * 0.86, lerp(GOLD, WHITE, 0.12));
  const w = inner * 0.06, gx = coinX, gy = coinY, h = coinR * 0.95;
  thickLine(c, gx + h * 0.28, gy - h * 0.55, gx - h * 0.18, gy - h * 0.30, w, WHITE);
  thickLine(c, gx - h * 0.18, gy - h * 0.30, gx - h * 0.18, gy + h * 0.35, w, WHITE);
  thickLine(c, gx - h * 0.45, gy + h * 0.55, gx + h * 0.45, gy + h * 0.55, w, WHITE);
  thickLine(c, gx - h * 0.42, gy + h * 0.02, gx + h * 0.20, gy + h * 0.02, w * 0.9, WHITE);
}

const targets = [
  ['icon-192.png', render(192)],
  ['icon-512.png', render(512)],
  ['icon-maskable-512.png', render(512, { maskable: true })],
  ['apple-touch-icon.png', render(180)],
  ['favicon-32.png', render(32)],
];
for (const [name, canvas] of targets) {
  writeFileSync(join(OUT, name), encodePNG(canvas));
  console.log('wrote', name, canvas.w + 'x' + canvas.h);
}
console.log('Icons generated in', OUT);
