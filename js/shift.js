// ============================================================
// shift.js — "Live Shift" state: start/stop a shift, track time
// and (optionally) GPS mileage, persist across reloads.
// The active shift lives in localStorage so it survives closing
// the app; GPS resumes on the next launch.
// ============================================================
import { uid, round2 } from './util.js';

const KEY = 'kerb.activeShift';
let watchId = null;
const listeners = new Set();

export function onShiftChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { const s = getActive(); for (const fn of listeners) { try { fn(s); } catch {} } }

export function getActive() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
export function isActive() { return !!getActive(); }
function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} emit(); }

export function startShift({ platform, gps }) {
  const s = {
    id: uid(), startedAt: Date.now(), platform, gps: !!gps,
    miles: 0, lastLat: null, lastLng: null,
    earnings: 0, tips: 0, deliveries: 0, gpsError: '',
  };
  write(s);
  if (gps) startGps();
  return s;
}
export function updateShift(patch) {
  const s = getActive(); if (!s) return null;
  const n = { ...s, ...patch }; write(n); return n;
}
export function stopShift() {
  const s = getActive(); stopGps();
  try { localStorage.removeItem(KEY); } catch {}
  emit(); return s;
}
export function elapsedMs(s) { s = s || getActive(); return s ? Math.max(0, Date.now() - s.startedAt) : 0; }
export function resumeIfActive() { const s = getActive(); if (s && s.gps) startGps(); }

// ---------- GPS ----------
function startGps() {
  if (watchId != null) return;
  if (!('geolocation' in navigator)) { updateShift({ gps: false, gpsError: 'No GPS on this device' }); return; }
  try {
    watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 });
  } catch { updateShift({ gpsError: 'Could not start GPS' }); }
}
function stopGps() { if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null; }
function onPos(pos) {
  const s = getActive(); if (!s) { stopGps(); return; }
  const { latitude, longitude, accuracy } = pos.coords;
  if (accuracy != null && accuracy > 60) return; // too imprecise — skip
  let miles = s.miles;
  if (s.lastLat != null) {
    const d = haversineMiles(s.lastLat, s.lastLng, latitude, longitude);
    if (d > 0.005 && d < 3) miles = round2(miles + d); // filter jitter & GPS jumps
  }
  write({ ...s, miles, lastLat: latitude, lastLng: longitude, gpsError: '' });
}
function onErr(err) {
  updateShift({ gpsError: err && err.code === 1 ? 'Location permission denied — enter miles manually' : 'GPS signal unavailable' });
}

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8, toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function fmtDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
export function elapsedHours(s) { return elapsedMs(s) / 3600000; }
