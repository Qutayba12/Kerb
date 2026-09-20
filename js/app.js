// ============================================================
// app.js — boot, hash router, navigation, theme, add-menu, SW.
// ============================================================
import { $, $$, el } from './util.js';
import { getSettings } from './store.js';
import { setBus, bus } from './bus.js';
import { openSheet, closeSheet, icon, toast } from './ui/shared.js';
import { openEarningsForm, openExpenseForm, openBillForm } from './ui/forms.js';
import { maybeOnboard } from './ui/onboarding.js';
import { resumeIfActive } from './shift.js';
import { runChecks, registerPeriodicSync } from './notify.js';

import * as home from './ui/dashboard.js';
import * as income from './ui/income.js';
import * as expenses from './ui/expenses.js';
import * as tax from './ui/tax-view.js';
import * as pots from './ui/pots.js';
import * as insights from './ui/insights.js';
import * as settings from './ui/settings.js';
import * as shift from './ui/shift.js';
import * as report from './ui/report.js';
import * as goals from './ui/goals.js';

const VIEWS = { home, income, expenses, tax, pots, insights, settings, shift, report, goals };
const TABBAR_ROUTES = ['home', 'income', 'expenses', 'tax'];
let currentRoute = 'home';

// ---------- theme ----------
function applyTheme() {
  const t = getSettings().theme || 'system';
  const html = document.documentElement;
  if (t === 'system') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', t);
}

// ---------- rendering ----------
let cleanupFns = [];
function registerCleanup(fn) { if (typeof fn === 'function') cleanupFns.push(fn); }
function runCleanups() { const fns = cleanupFns; cleanupFns = []; fns.forEach((fn) => { try { fn(); } catch {} }); }

async function renderRoute(route) {
  const view = VIEWS[route] || VIEWS.home;
  const container = $('#view');
  runCleanups();
  container.setAttribute('aria-busy', 'true');
  let node;
  try {
    node = await view.render({ registerCleanup });
  } catch (err) {
    console.error('render error', err);
    node = el('div', { class: 'callout callout--warn', html: `${icon('warn')}<div>Something went wrong rendering this screen.<br><span class="tiny">${(err && err.message) || err}</span></div>` });
  }
  container.replaceChildren(node);
  container.removeAttribute('aria-busy');
  container.scrollTop = 0;
  window.scrollTo(0, 0);
  updateNav(route);
}

function updateNav(route) {
  $$('#tabbar .tab').forEach(t => t.classList.toggle('is-active', t.dataset.route === route));
  $('#nav-insights')?.classList.toggle('is-active', route === 'insights');
  $('#nav-pots')?.classList.toggle('is-active', route === 'pots');
  $('#nav-settings')?.classList.toggle('is-active', route === 'settings');
  const yearChip = $('#year-chip');
  if (yearChip) yearChip.textContent = getSettings().taxYear;
}

function navigate(route) {
  if (route === 'add') { openAddMenu(); return; }
  if (!VIEWS[route]) route = 'home';
  currentRoute = route;
  if (location.hash !== '#/' + route) location.hash = '#/' + route;
  else renderRoute(route);
}

function onHashChange() {
  const route = (location.hash.replace(/^#\/?/, '') || 'home');
  currentRoute = VIEWS[route] ? route : 'home';
  renderRoute(currentRoute);
}

// ---------- add menu ----------
function openAddMenu() {
  const mk = (ic, label, sub, onClick) => {
    const b = el('button', { class: 'item', type: 'button', style: 'width:100%;border-radius:12px;border:1px solid var(--border);margin-bottom:8px' });
    b.innerHTML = `<div class="item__icon" style="background:var(--brand-tint);color:var(--brand)">${icon(ic)}</div>
      <div class="item__main"><div class="item__title">${label}</div><div class="item__sub">${sub}</div></div>`;
    b.onclick = () => { closeSheet(); onClick(); };
    return b;
  };
  const body = el('div', {}, [
    mk('clock', 'Start live shift', 'Track time & miles live, see £/hour', () => navigate('shift')),
    mk('plus', 'Add earnings', 'Log a shift, block or day\'s takings', () => openEarningsForm()),
    mk('camera', 'Scan a receipt', 'Photograph a receipt — Claude reads it', () => openExpenseForm()),
    mk('note', 'Add expense manually', 'Type in an expense', () => openExpenseForm()),
    mk('route', 'Log mileage only', 'Record business miles with no earnings', () => openEarningsForm()),
    mk('clock', 'Add recurring bill', 'Track a repeating outgoing & its due date', () => openBillForm()),
  ]);
  openSheet({ title: 'Add', node: body });
}

// ---------- wiring ----------
function wire() {
  $$('#tabbar .tab').forEach(tab => tab.addEventListener('click', () => navigate(tab.dataset.route)));
  $('#nav-insights')?.addEventListener('click', () => navigate('insights'));
  $('#nav-pots')?.addEventListener('click', () => navigate('pots'));
  $('#nav-settings')?.addEventListener('click', () => navigate('settings'));
  $('#year-chip')?.addEventListener('click', () => navigate('tax'));
  window.addEventListener('hashchange', onHashChange);
}

// ---------- lock zoom (iOS pinch + double-tap) ----------
function lockZoom() {
  // iOS Safari ignores user-scalable=no; block its gesture events explicitly.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) =>
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  // Block double-tap-to-zoom.
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch <= 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  // Block ctrl/⌘ + wheel zoom on desktop.
  document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
}

// ---------- service worker ----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('SW registration failed', err));
  });
}

// ---------- boot ----------
function boot() {
  setBus({
    navigate,
    refresh: () => renderRoute(currentRoute),
    applyTheme,
  });
  applyTheme();
  wire();
  lockZoom();
  registerSW();
  resumeIfActive();   // resume GPS tracking if a shift was in progress

  $('#app').hidden = false;
  const splash = $('#splash');
  if (splash) { splash.style.opacity = '0'; splash.style.transition = 'opacity .3s'; setTimeout(() => splash.remove(), 320); }

  onHashChange();          // render initial route
  if (!location.hash) navigate('home');
  setTimeout(maybeOnboard, 400);

  // fire any due local reminders shortly after boot
  setTimeout(() => { runChecks(); registerPeriodicSync(); }, 1500);
}

boot();
