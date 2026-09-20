// ============================================================
// charts.js — dependency-free SVG charts that theme with CSS vars.
// Each function returns an SVG markup string.
// ============================================================
import { fmtGBP } from './util.js';

// A calm, colour-blind-aware categorical palette.
export const PALETTE = ['#0f8a74', '#f5b042', '#2b6cb0', '#d24b4b', '#7c6cf0', '#12a5a0', '#e07a3a', '#8a97a4'];

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Vertical bar chart. data: [{label, value, color?}]
export function barChart(data, { height = 150, valueFmt = (v) => fmtGBP(v, { round: true }), showValues = true } = {}) {
  if (!data.length) return '';
  const W = Math.max(280, data.length * 46);
  const padB = 26, padT = showValues ? 20 : 8, padX = 6;
  const max = Math.max(1, ...data.map(d => d.value));
  const bw = (W - padX * 2) / data.length;
  const barW = Math.min(34, bw * 0.62);
  let bars = '';
  data.forEach((d, i) => {
    const h = Math.max(2, (d.value / max) * (height - padB - padT));
    const x = padX + i * bw + (bw - barW) / 2;
    const y = height - padB - h;
    const color = d.color || 'var(--brand)';
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="6" style="fill:${color}"/>`;
    if (showValues && d.value > 0) bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" style="fill:var(--muted)">${esc(valueFmt(d.value))}</text>`;
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 9}" text-anchor="middle" font-size="10.5" style="fill:var(--faint)">${esc(d.label)}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="xMidYMid meet" role="img">${bars}</svg></div>`;
}

// Grouped 3-series monthly chart (income / deductions / tax).
export function groupedBars(labels, series, { height = 170 } = {}) {
  if (!labels.length) return '';
  const W = Math.max(300, labels.length * 58);
  const padB = 26, padT = 10, padX = 8;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const groupW = (W - padX * 2) / labels.length;
  const n = series.length;
  const barW = Math.min(13, (groupW * 0.7) / n);
  let out = '';
  labels.forEach((lab, i) => {
    const gx = padX + i * groupW + (groupW - barW * n) / 2;
    series.forEach((s, j) => {
      const v = s.values[i] || 0;
      const h = Math.max(1, (v / max) * (height - padB - padT));
      const x = gx + j * barW;
      out += `<rect x="${x.toFixed(1)}" y="${(height - padB - h).toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" style="fill:${s.color}"/>`;
    });
    out += `<text x="${(gx + barW * n / 2).toFixed(1)}" y="${height - 9}" text-anchor="middle" font-size="10.5" style="fill:var(--faint)">${esc(lab)}</text>`;
  });
  const legend = `<div class="chart-legend">${series.map(s => `<span class="k"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}</div>`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="xMidYMid meet" role="img">${out}</svg></div>${legend}`;
}

// Donut chart. data: [{label, value, color}]
export function donut(data, { size = 150, thickness = 22, centerTop = '', centerSub = '' } = {}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0, segs = '';
  if (total > 0) {
    data.forEach((d) => {
      const frac = d.value / total;
      const len = frac * circ;
      segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="${thickness}" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += len;
    });
  } else {
    segs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${thickness}"/>`;
  }
  const center = `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="16" font-weight="800" style="fill:var(--text)">${esc(centerTop)}</text>
    <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="10" style="fill:var(--faint)">${esc(centerSub)}</text>`;
  return `<div class="chart" style="max-width:${size}px;margin:0 auto"><svg viewBox="0 0 ${size} ${size}" role="img">${segs}${center}</svg></div>`;
}

// Progress ring (single value).
export function progressRing(pct, { size = 92, thickness = 10, color = 'var(--brand)', label = '', sub = '' } = {}) {
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct / 100));
  return `<div class="chart" style="width:${size}px"><svg viewBox="0 0 ${size} ${size}" role="img">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${thickness}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round"
      stroke-dasharray="${(p * circ).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="17" font-weight="800" style="fill:var(--text)">${esc(label)}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="9" style="fill:var(--faint)">${esc(sub)}</text>
  </svg></div>`;
}

// Line/area chart. points: array of numbers.
export function lineChart(points, { height = 130, color = 'var(--brand)', labels = [] } = {}) {
  if (points.length < 2) return '';
  const W = 320, padB = 20, padT = 10, padX = 8;
  const max = Math.max(1, ...points), min = Math.min(0, ...points);
  const range = max - min || 1;
  const stepX = (W - padX * 2) / (points.length - 1);
  const xy = points.map((p, i) => [padX + i * stepX, height - padB - ((p - min) / range) * (height - padB - padT)]);
  const path = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = path + ` L${xy.at(-1)[0].toFixed(1)} ${height - padB} L${xy[0][0].toFixed(1)} ${height - padB} Z`;
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  let labelTxt = '';
  if (labels.length) labels.forEach((l, i) => { if (i % Math.ceil(labels.length / 6) === 0) labelTxt += `<text x="${xy[i][0].toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9.5" style="fill:var(--faint)">${esc(l)}</text>`; });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" role="img">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${labelTxt}
  </svg></div>`;
}
