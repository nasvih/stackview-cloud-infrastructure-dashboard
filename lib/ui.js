/* ============================================================
   Tiny UI runtime shared by the demo apps. No dependencies.
   DOM helpers · hash router · localStorage store · toast · modal ·
   formatting · inline icon set.
   ============================================================ */

/* ---------- dom ---------- */
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const on = (el, evt, sel, fn) => el.addEventListener(evt, (e) => {
  const t = e.target.closest(sel);
  if (t && el.contains(t)) fn(e, t);
});

/* ---------- format ---------- */
export const money = (n, cur = '₹') => cur + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const money2 = (n, cur = '$') => cur + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n) => Number(n || 0).toLocaleString('en-US');
export const pct = (n, d = 0) => `${Number(n || 0).toFixed(d)}%`;
export const initials = (name) => String(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function fmtDate(d, opts) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('en-GB', opts || { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
export function ago(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}
export const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
export const isoDay = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

/* ---------- deterministic pseudo-random (stable demo data) ---------- */
export function seeded(seed = 42) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];
export const between = (a, b, rnd = Math.random) => Math.floor(a + rnd() * (b - a + 1));

/* ---------- store: seeded state persisted to localStorage ---------- */
export function createStore(key, seedFn) {
  let state;
  try {
    const raw = localStorage.getItem(key);
    state = raw ? JSON.parse(raw) : seedFn();
  } catch (_) { state = seedFn(); }
  const subs = new Set();
  const save = () => { try { localStorage.setItem(key, JSON.stringify(state)); } catch (_) {} };
  save();
  return {
    get state() { return state; },
    update(fn) { const r = fn(state); if (r) state = r; save(); subs.forEach((f) => f(state)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    reset() { state = seedFn(); save(); subs.forEach((f) => f(state)); },
  };
}

/* ---------- hash router ---------- */
export function router(routes, onChange) {
  const go = () => {
    const raw = location.hash.replace(/^#\/?/, '') || '';
    const [path, query] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const name = parts[0] || Object.keys(routes)[0];
    const route = routes[name] ? name : Object.keys(routes)[0];
    onChange(route, parts.slice(1), new URLSearchParams(query || ''));
  };
  window.addEventListener('hashchange', go);
  return { go, navigate: (p) => { location.hash = `#/${p}`; } };
}

/* ---------- toast ---------- */
let toastHost;
export function toast(msg, kind = '') {
  if (!toastHost) { toastHost = h('div', { class: 'toasts' }); document.body.appendChild(toastHost); }
  const el = h('div', { class: `toast${kind ? ` toast--${kind}` : ''}` }, msg);
  toastHost.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 2600);
}

/* ---------- modal ---------- */
export function modal({ title, body, actions = [], width }) {
  const scrim = h('div', { class: 'scrim' });
  const close = () => scrim.remove();
  const box = h('div', { class: 'modal', style: width ? `width:min(${width},100%)` : null });
  box.appendChild(h('div', { class: 'modal__head' },
    h('h3', {}, title || ''),
    h('button', { class: 'btn btn--ghost btn--icon', onclick: close, html: '<svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15"/></svg>' })));
  const bodyEl = h('div', { class: 'modal__body' });
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  box.appendChild(bodyEl);
  if (actions.length) {
    box.appendChild(h('div', { class: 'modal__foot' }, actions.map((a) =>
      h('button', { class: `btn ${a.class || ''}`, onclick: () => { const keep = a.onClick && a.onClick(bodyEl); if (!keep) close(); } }, a.label))));
  }
  scrim.appendChild(box);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', function esc2(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc2); } });
  document.body.appendChild(scrim);
  return { close, body: bodyEl };
}

export function confirmDialog(message, { title = 'Confirm', danger = false, okLabel = 'Confirm' } = {}) {
  return new Promise((resolve) => {
    modal({
      title,
      body: `<p class="muted">${esc(message)}</p>`,
      actions: [
        { label: 'Cancel', class: '', onClick: () => resolve(false) },
        { label: okLabel, class: danger ? 'btn--danger' : 'btn--primary', onClick: () => resolve(true) },
      ],
    });
  });
}

/* ---------- csv export ---------- */
export function downloadCSV(filename, rows) {
  const body = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- charts: solid-fill bars, no libraries ---------- */
export function barChart(series, { format = num, muted = () => false } = {}) {
  const max = Math.max(...series.map((s) => s.value), 1);
  return h('div', { class: 'bars' }, series.map((s) => h('div', { class: 'bars__col' },
    h('span', { class: 'bars__x mono', title: format(s.value) }, format(s.value)),
    h('div', {
      class: `bars__bar${muted(s) ? ' bars__bar--muted' : ''}`,
      style: `height:${Math.max(2, (s.value / max) * 100)}%`,
      title: `${s.label}: ${format(s.value)}`,
    }),
    h('span', { class: 'bars__x' }, s.label))));
}

export function meter(value, max, kind = '') {
  return h('div', { class: 'meter' }, h('div', {
    class: `meter__fill${kind ? ` meter__fill--${kind}` : ''}`,
    style: `width:${Math.min(100, (value / (max || 1)) * 100)}%`,
  }));
}

/* ---------- icons (inline stroke svg, currentColor) ---------- */
export const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 20 20">${ICONS[name] || ICONS.dot}</svg>`;
export const ICONS = {
  dot: '<circle cx="10" cy="10" r="3"/>',
  home: '<path d="M3 9l7-6 7 6"/><path d="M5 8.5V16h10V8.5"/>',
  grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/>',
  users: '<circle cx="7.5" cy="7" r="2.6"/><path d="M2.8 16c.4-2.6 2.3-4 4.7-4s4.3 1.4 4.7 4"/><path d="M13.6 5.2a2.6 2.6 0 0 1 0 4.6"/><path d="M14.6 12.4c1.6.5 2.5 1.8 2.7 3.6"/>',
  user: '<circle cx="10" cy="7" r="3"/><path d="M4.5 16.5c.6-2.9 2.8-4.5 5.5-4.5s4.9 1.6 5.5 4.5"/>',
  calendar: '<rect x="3" y="4.5" width="14" height="12" rx="2"/><path d="M3 8.5h14M7 3v3M13 3v3"/>',
  clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>',
  cart: '<path d="M2.5 3h2l2 9.5h8.5"/><path d="M6 6.5h11l-1.4 5.5"/><circle cx="7.5" cy="16" r="1.2"/><circle cx="14.5" cy="16" r="1.2"/>',
  box: '<path d="M10 2.8l6.5 3.4v7.6L10 17.2 3.5 13.8V6.2z"/><path d="M3.5 6.2L10 9.6l6.5-3.4M10 9.6v7.6"/>',
  chart: '<path d="M3 16.5h14"/><rect x="4.5" y="9" width="3" height="6" rx="1"/><rect x="9" y="5.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="11.5" width="3" height="3.5" rx="1"/>',
  table: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 8h14M8 8v8"/>',
  file: '<path d="M11 2.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V7z"/><path d="M11 2.5V7h4.5"/>',
  check: '<path d="M4 10.5l4 4 8-9"/>',
  x: '<path d="M5 5l10 10M15 5L5 15"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  search: '<circle cx="9" cy="9" r="5.2"/><path d="M13 13l4 4"/>',
  filter: '<path d="M3 5h14l-5.5 6v5l-3 1.5V11z"/>',
  download: '<path d="M10 3v9M6.5 8.5L10 12l3.5-3.5"/><path d="M3.5 15.5h13"/>',
  bell: '<path d="M6 8a4 4 0 0 1 8 0c0 4 1.5 5 1.5 5h-11S6 12 6 8z"/><path d="M8.5 16a1.6 1.6 0 0 0 3 0"/>',
  shield: '<path d="M10 2.8l6 2.2v5c0 3.4-2.4 6.2-6 7.2-3.6-1-6-3.8-6-7.2v-5z"/><path d="M7.4 10l1.9 1.9 3.4-3.6"/>',
  cloud: '<path d="M6 15.5a3.5 3.5 0 0 1-.4-7 4.6 4.6 0 0 1 8.8.9A3.1 3.1 0 0 1 14 15.5z"/>',
  server: '<rect x="3" y="4" width="14" height="5" rx="1.5"/><rect x="3" y="11" width="14" height="5" rx="1.5"/><path d="M6 6.5h.01M6 13.5h.01"/>',
  key: '<circle cx="7" cy="10" r="3.2"/><path d="M10.2 10H17l-1.5 2M14 10v2.5"/>',
  bolt: '<path d="M11 2.5L5 11h4l-1 6.5L15 9h-4z"/>',
  flow: '<rect x="3" y="3.5" width="5" height="4" rx="1"/><rect x="12" y="3.5" width="5" height="4" rx="1"/><rect x="7.5" y="12.5" width="5" height="4" rx="1"/><path d="M5.5 7.5v3h9v-3M10 10.5v2"/>',
  spark: '<path d="M10 2.5l1.7 4.3 4.3 1.7-4.3 1.7L10 14.5 8.3 10.2 4 8.5l4.3-1.7z"/>',
  cog: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.8v2M10 15.2v2M17.2 10h-2M4.8 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3L4.9 4.9"/>',
  menu: '<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/>',
  arrowRight: '<path d="M4 10h12M11.5 5.5L16 10l-4.5 4.5"/>',
  refresh: '<path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16 3v3.5h-3.5"/>',
  eye: '<path d="M2.5 10S5.5 5 10 5s7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/>',
  mail: '<rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="M3 6l7 5 7-5"/>',
  phone: '<path d="M5 3.5h3l1.2 3-1.7 1.4a9 9 0 0 0 4.6 4.6L13.5 11l3 1.2v3a1.3 1.3 0 0 1-1.5 1.3C9 15.8 4.2 11 3.7 5A1.3 1.3 0 0 1 5 3.5z"/>',
  tag: '<path d="M3.5 9.2V4a.5.5 0 0 1 .5-.5h5.2L17 11 11 17z"/><circle cx="6.6" cy="6.6" r="1"/>',
  alert: '<path d="M10 3.5l7 12.5H3z"/><path d="M10 8v3.5M10 13.6h.01"/>',
  logout: '<path d="M8 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h3"/><path d="M12 6.5L15.5 10 12 13.5M15.5 10H7.5"/>',
};
