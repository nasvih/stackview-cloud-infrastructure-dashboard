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
import { t, label, alertTitle, wasteWhy } from './main.js';

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
      id: `alert:${a.id}`, kind: t('notif.kindCritical'), tone: 'bad', at: a.opened,
      title: alertTitle(a), body: `${label.source(a.source)} · ${a.resource}`, to: 'alerts',
    });
  }

  /* budget drift against last month */
  const cur = s.months[s.months.length - 1];
  const prev = s.months[s.months.length - 2];
  const p = projection(s);
  const drift = p.projected - prev.total;
  if (prev.total && Math.abs(drift / prev.total) >= 0.02) {
    out.push({
      id: `budget:${cur.key}`, kind: t('notif.kindBudget'), tone: 'warn', at: null,
      title: t('notif.budgetTitle', {
        money: money2(Math.abs(drift)),
        dir: drift >= 0 ? t('notif.budgetAbove') : t('notif.budgetBelow'),
        month: label.month(prev.label),
      }),
      body: t('notif.budgetBody', {
        projected: money2(p.projected), prev: money2(prev.total),
        pct: pct(Math.abs((drift / prev.total) * 100), 1),
        dir: drift >= 0 ? t('notif.budgetUp') : t('notif.budgetDown'),
      }),
      to: 'cost',
    });
  }

  /* accounts without a second factor */
  for (const u of adminsNoMfa(s)) {
    out.push({
      id: `mfa:${u.id}`, kind: t('notif.kindMfa'), tone: 'bad', at: null,
      title: t('notif.mfaTitle', { name: u.name, role: label.role(u.role) }),
      body: t('notif.mfaBody', {
        directory: label.directory(u.directory), team: label.team(u.team), ago: ago(u.lastLogin),
      }), to: 'access',
    });
  }

  /* access keys past a year */
  for (const u of s.users.filter((x) => x.keyAgeDays > 365)) {
    out.push({
      id: `key:${u.id}`, kind: t('notif.kindKey'), tone: 'warn', at: null,
      title: t('notif.keyTitle', { name: u.name, days: num(u.keyAgeDays) }),
      body: t('notif.keyBody'), to: 'access',
    });
  }

  /* resources idle for weeks */
  for (const r of wasteItems(s).filter((x) => x.util.cpu < 10 || ['unattached', 'unassociated'].includes(x.state)).slice(0, 4)) {
    out.push({
      id: `idle:${r.id}`, kind: t('notif.kindIdle'), tone: 'warn', at: null,
      title: t('notif.idleTitle', { name: r.name, money: money2(r.waste.saving) }),
      body: wasteWhy(r), to: 'cost?tab=waste',
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

  const panel = h('div', { class: 'sv-notif', hidden: true, role: 'dialog', 'aria-label': t('notif.panelLabel') });
  const wrap = h('div', { class: 'sv-notifwrap' }, btn, panel);

  function list() { return buildNotifications(store.state); }
  function unread() { return list().filter((n) => !read.has(n.id)); }

  function paintBell() {
    const n = unread().length;
    count.textContent = n > 99 ? '99+' : String(n);
    count.hidden = n === 0;
    const text = n ? t('notif.bellUnread', { n }) : t('notif.bellClear');
    btn.setAttribute('aria-label', text);
    btn.title = text;
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
        h('div', { class: 'sv-notif__ttl' }, t('notif.title')),
        h('div', { class: 'small faint mono' }, rows.length
          ? t('notif.unreadCount', { n, total: rows.length })
          : t('notif.nothingOpen'))),
      n ? h('button', { class: 'btn btn--sm', type: 'button', onclick: () => markAll() }, t('notif.markAll')) : null,
      h('button', {
        class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': t('notif.closeLabel'),
        title: t('notif.closeLabel'), html: icon('x'), onclick: () => toggle(false),
      })));

    if (!rows.length) {
      panel.appendChild(h('div', { class: 'sv-notif__empty' },
        h('h4', {}, t('notif.emptyTitle')),
        h('p', { class: 'small muted' }, t('notif.emptyBody'))));
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
          'aria-label': t('notif.markReadOne', { title: item.title }), title: t('notif.markRead'),
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
