/* ============================================================
   Notifications — the bell in the topbar.

   Nothing is stored as a "notification record": the list is derived from
   the live estate every time it is drawn, so acknowledging an alert or
   enforcing MFA makes the matching notification disappear. Only the read
   marks are persisted, under their own key, so resetting the demo data
   does not throw them away.
   ============================================================ */

import { h, icon, ago, num, pct } from '../lib/ui.js';
import { money2, openAlerts, wasteItems, adminsNoMfa, projection } from './data.js';

const READ_KEY = 'stackview.notifs.v1';

function readSet() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); }
  catch (_) { return new Set(); }
}
function saveRead(set) {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...set].slice(-400))); } catch (_) {}
}

/* ---------- what is worth telling someone about ---------- */
export function buildNotifications(s) {
  const out = [];

  /* new critical alerts */
  for (const a of openAlerts(s).filter((x) => x.sev === 'critical')) {
    out.push({
      id: `alert:${a.id}`, kind: 'Critical alert', tone: 'bad', at: a.opened,
      title: a.title, body: `${a.source} · ${a.resource}`, to: 'alerts',
    });
  }

  /* budget drift against last month */
  const cur = s.months[s.months.length - 1];
  const prev = s.months[s.months.length - 2];
  const p = projection(s);
  const drift = p.projected - prev.total;
  if (prev.total && Math.abs(drift / prev.total) >= 0.02) {
    out.push({
      id: `budget:${cur.key}`, kind: 'Budget drift', tone: 'warn', at: null,
      title: `Month end is tracking ${money2(Math.abs(drift))} ${drift >= 0 ? 'above' : 'below'} ${prev.label}`,
      body: `${money2(p.projected)} projected against ${money2(prev.total)} last month, ${pct(Math.abs((drift / prev.total) * 100), 1)} ${drift >= 0 ? 'up' : 'down'}.`,
      to: 'cost',
    });
  }

  /* accounts without a second factor */
  for (const u of adminsNoMfa(s)) {
    out.push({
      id: `mfa:${u.id}`, kind: 'No MFA', tone: 'bad', at: null,
      title: `${u.name} holds ${u.role} with no second factor`,
      body: `${u.directory} · ${u.team} · last signed in ${ago(u.lastLogin)}`, to: 'access',
    });
  }

  /* access keys past a year */
  for (const u of s.users.filter((x) => x.keyAgeDays > 365)) {
    out.push({
      id: `key:${u.id}`, kind: 'Old key', tone: 'warn', at: null,
      title: `${u.name} has an access key ${num(u.keyAgeDays)} days old`,
      body: 'The policy is 90 days. Rotate it from the account drawer.', to: 'access',
    });
  }

  /* resources idle for weeks */
  for (const r of wasteItems(s).filter((x) => x.util.cpu < 10 || ['unattached', 'unassociated'].includes(x.state)).slice(0, 4)) {
    out.push({
      id: `idle:${r.id}`, kind: 'Idle for weeks', tone: 'warn', at: null,
      title: `${r.name} is idle at ${money2(r.waste.saving)} a month`,
      body: r.waste.why, to: 'cost?tab=waste',
    });
  }

  return out;
}

/* ---------- the control: bell button + panel ---------- */
export function notificationsControl({ store, navigate, onNavigate }) {
  let read = readSet();
  let open = false;

  const count = h('span', { class: 'sv-bell__n mono', hidden: true });
  const btn = h('button', {
    class: 'btn btn--ghost btn--icon sv-bell',
    type: 'button',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    html: icon('bell'),
  });
  btn.appendChild(count);

  const panel = h('div', { class: 'sv-notif', hidden: true, role: 'dialog', 'aria-label': 'Notifications' });
  const wrap = h('div', { class: 'sv-notifwrap' }, btn, panel);

  function list() { return buildNotifications(store.state); }
  function unread() { return list().filter((n) => !read.has(n.id)); }

  function paintBell() {
    const n = unread().length;
    count.textContent = n > 99 ? '99+' : String(n);
    count.hidden = n === 0;
    const label = n ? `Notifications, ${n} unread` : 'Notifications, nothing unread';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }

  function markRead(id) { read.add(id); saveRead(read); paint(); }
  function markAll() {
    for (const n of list()) read.add(n.id);
    saveRead(read);
    paint();
  }

  function paint() {
    paintBell();
    if (!open) return;
    const rows = list();
    const n = rows.filter((x) => !read.has(x.id)).length;
    panel.innerHTML = '';
    panel.appendChild(h('div', { class: 'sv-notif__head' },
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'sv-notif__ttl' }, 'Notifications'),
        h('div', { class: 'small faint mono' }, rows.length ? `${n} unread of ${rows.length}` : 'nothing open')),
      n ? h('button', { class: 'btn btn--sm', type: 'button', onclick: () => markAll() }, 'Mark all read') : null,
      h('button', {
        class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': 'Close notifications',
        title: 'Close notifications', html: icon('x'), onclick: () => toggle(false),
      })));

    if (!rows.length) {
      panel.appendChild(h('div', { class: 'sv-notif__empty' },
        h('h4', {}, 'Nothing needs you'),
        h('p', { class: 'small muted' }, 'No critical alert is open, the month is tracking close to last month, every elevated account has a second factor and no key is past a year. This list is built from the estate, so it fills up again as things change.')));
      return;
    }

    panel.appendChild(h('ul', { class: 'sv-notif__list' }, rows.map((item) => {
      const isRead = read.has(item.id);
      return h('li', { class: `sv-notif__i${isRead ? ' is-read' : ''}` },
        h('button', {
          class: 'sv-notif__go', type: 'button',
          onclick: () => { markRead(item.id); toggle(false); navigate(item.to); if (onNavigate) onNavigate(); },
        },
        h('div', { class: 'row' },
          h('span', { class: `pill ${item.tone === 'bad' ? 'pill--bad' : 'pill--warn'}` }, item.kind),
          isRead ? null : h('span', { class: 'sv-notif__dot', 'aria-hidden': 'true' }),
          item.at ? h('span', { class: 'small faint mono' }, ago(item.at)) : null),
        h('div', { class: 'sv-notif__t' }, item.title),
        h('div', { class: 'small muted' }, item.body)),
        isRead ? null : h('button', {
          class: 'btn btn--ghost btn--icon sv-notif__read', type: 'button',
          'aria-label': `Mark "${item.title}" as read`, title: 'Mark as read',
          html: icon('check'), onclick: () => markRead(item.id),
        }));
    })));
  }

  function toggle(force) {
    open = force === undefined ? !open : force;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) paint();
  }

  btn.addEventListener('click', () => toggle());
  /* Outside click closes it. The path is read from the event rather than from
     the live DOM because marking something read redraws the panel, which
     detaches the button that was clicked before this listener ever runs. */
  document.addEventListener('click', (e) => {
    if (!open) return;
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    if (path.includes(wrap) || wrap.contains(e.target)) return;
    toggle(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) toggle(false); });
  store.subscribe(() => paint());

  paintBell();
  return { el: wrap, refresh: paint, close: () => toggle(false) };
}
