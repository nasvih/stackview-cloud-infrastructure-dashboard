/* ============================================================
   stackview — boot: store, shell, nav, router, assistant.
   ============================================================ */

import { h, qs, icon, ICONS, router, toast, confirmDialog, modal } from '../lib/ui.js';
import { store, ORG, openAlerts } from './data.js';
import { buildAssistant } from './agent.js';

import overview from './views/overview.js';
import resources from './views/resources.js';
import cost from './views/cost.js';
import access from './views/access.js';
import alerts from './views/alerts.js';
import uptime from './views/uptime.js';
import reports from './views/reports.js';

const ROUTES = {
  overview: { title: 'Overview', sub: 'Estate at a glance', icon: 'home', group: 'Monitor', view: overview },
  alerts: { title: 'Alerts', sub: 'Open and acknowledged', icon: 'bell', group: 'Monitor', view: alerts },
  uptime: { title: 'Uptime', sub: 'Last 30 days', icon: 'chart', group: 'Monitor', view: uptime },
  resources: { title: 'Resources', sub: 'Inventory', icon: 'server', group: 'Estate', view: resources },
  cost: { title: 'Cost', sub: 'Spend and waste', icon: 'cloud', group: 'Estate', view: cost },
  access: { title: 'Access', sub: 'Users and roles', icon: 'shield', group: 'Governance', view: access },
  reports: { title: 'Reports', sub: 'Monthly review', icon: 'file', group: 'Governance', view: reports },
};

/* ---------- shell ---------- */
const app = qs('#app');

/* ---------- about this demo ---------- */
const ABOUT = [
  ['You can actually use it', 'Acknowledge and mute alerts, stop resources and reassign owners, work the idle and waste list, run the access review and the offboarding checklist, generate a monthly review. Nothing on these screens is read only.'],
  ['Your data stays on your machine', 'Everything you change is saved in this browser\'s local storage. Nothing is sent to a server. There is no account, no backend, and no cloud provider is connected. Clear your browser data or use "Reset demo data" and it is all gone. It does not sync between browsers or devices.'],
  ['The assistant is simulated', 'Stackview Insight answers by matching your question against this app\'s own demo data. It is a demonstration of the interaction, not a connected model, and no request leaves your browser.'],
];

export function aboutModal() {
  const body = h('div', { class: 'sv-about' },
    h('p', { class: 'muted small' }, 'stackview is a demo of an infrastructure visibility product. The estate it shows — Northline Group, its resources, people and bills — is invented sample data.'),
    ...ABOUT.map(([title, text]) => h('div', { class: 'sv-about__b' },
      h('h4', {}, title),
      h('p', { class: 'small muted' }, text))));
  modal({ title: 'About this demo', body, actions: [{ label: 'Got it', class: 'btn--primary' }] });
}

const side = h('aside', { class: 'side', id: 'sidebar' },
  h('div', { class: 'side__brand' },
    h('span', { class: 'mark' }, 'SV'),
    h('div', {},
      h('div', { class: 'side__name' }, 'stackview'),
      h('div', { class: 'side__tag' }, 'IT visibility'))),
  h('nav', { class: 'side__nav', id: 'nav', 'aria-label': 'Primary' }),
  h('div', { class: 'side__foot' },
    h('div', { class: 'sv-org' },
      h('span', { class: 'label' }, 'Tenant'),
      h('div', { class: 'sv-org__name' }, ORG.name),
      h('div', { class: 'small faint' }, ORG.units.join(' · '))),
    h('button', {
      class: 'btn btn--ghost btn--block sv-reset',
      type: 'button',
      onclick: () => aboutModal(),
      html: `${icon('eye')}<span>About this demo</span>`,
    }),
    h('button', {
      class: 'btn btn--ghost btn--block sv-reset',
      type: 'button',
      onclick: async () => {
        const ok = await confirmDialog(
          'This clears every change you made in this demo — acknowledged alerts, cleanup plans, offboarding progress and generated reports — and rebuilds the sample estate.',
          { title: 'Reset demo data', okLabel: 'Reset', danger: true });
        if (!ok) return;
        store.reset();
        toast('Demo data reset', 'ok');
        render();
      },
      html: `${icon('refresh')}<span>Reset demo data</span>`,
    })));

const scrim = h('div', { class: 'sv-navscrim', hidden: true, onclick: () => setSidebar(false) });

const topbar = h('header', { class: 'topbar' },
  h('button', {
    class: 'btn btn--ghost btn--icon sidebtn',
    type: 'button',
    'aria-label': 'Open navigation',
    onclick: () => setSidebar(!side.classList.contains('is-open')),
    html: icon('menu'),
  }),
  h('div', { class: 'sv-topttl' },
    h('div', { class: 'topbar__title', id: 'ttl' }, 'Overview'),
    h('div', { class: 'topbar__sub', id: 'sub' }, 'Estate at a glance')),
  h('div', { class: 'spacer' }),
  h('button', {
    class: 'pill pill--amber sv-demopill',
    type: 'button',
    'aria-label': 'About this demo',
    title: 'Every figure, resource, account and alert here is invented sample data and nothing leaves your browser. Open for the detail.',
    onclick: () => aboutModal(),
  }, 'Demo'),
  h('button', {
    class: 'btn btn--sm sv-hidesm',
    type: 'button',
    onclick: () => window.stackviewAssistant && window.stackviewAssistant.toggle(true),
    html: `${icon('spark')}<span>Ask Insight</span>`,
  }));

const viewEl = h('main', { class: 'view view--pad', id: 'view', tabindex: '-1' });

app.appendChild(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, topbar, viewEl)));
app.appendChild(scrim);

function setSidebar(open) {
  side.classList.toggle('is-open', open);
  scrim.hidden = !open;
}

/* ---------- nav ---------- */
function renderNav(active) {
  const nav = qs('#nav');
  nav.innerHTML = '';
  const groups = [...new Set(Object.values(ROUTES).map((r) => r.group))];
  const openCount = openAlerts(store.state).length;
  for (const g of groups) {
    const box = h('div', { class: 'navgroup' }, h('div', { class: 'navgroup__label' }, g));
    for (const [key, r] of Object.entries(ROUTES)) {
      if (r.group !== g) continue;
      const link = h('a', {
        class: `navlink${key === active ? ' is-active' : ''}`,
        href: `#/${key}`,
        'aria-current': key === active ? 'page' : null,
        onclick: () => setSidebar(false),
        html: `${icon(r.icon)}<span>${r.title}</span>`,
      });
      if (key === 'alerts' && openCount) link.appendChild(h('span', { class: 'navlink__count' }, String(openCount)));
      box.appendChild(link);
    }
    nav.appendChild(box);
  }
}

/* ---------- drawer ---------- */
let openDrawer = null;
export function drawer(title, bodyNode, { sub = '' } = {}) {
  closeDrawer();
  const box = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': title },
    h('div', { class: 'drawer__head' },
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'sv-drawer__ttl truncate' }, title),
        sub ? h('div', { class: 'topbar__sub truncate' }, sub) : null),
      h('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'Close panel', onclick: () => closeDrawer(), html: icon('x') })),
    h('div', { class: 'drawer__body' }, bodyNode));
  const back = h('div', { class: 'sv-navscrim sv-navscrim--drawer', onclick: () => closeDrawer() });
  document.body.appendChild(back);
  document.body.appendChild(box);
  openDrawer = () => { box.remove(); back.remove(); openDrawer = null; };
  return { close: closeDrawer };
}
export function closeDrawer() { if (openDrawer) openDrawer(); }

/* ---------- routing ---------- */
let current = 'overview';
const nav = router(ROUTES, (name, parts, query) => {
  current = name;
  render(parts, query);
});

export function navigate(path) { location.hash = `#/${path}`; }

function render(parts = [], query = new URLSearchParams()) {
  const route = ROUTES[current];
  qs('#ttl').textContent = route.title;
  qs('#sub').textContent = route.sub;
  document.title = `${route.title} · stackview`;
  renderNav(current);
  closeDrawer();
  viewEl.innerHTML = '';
  const ctx = {
    store,
    state: store.state,
    parts,
    query,
    navigate,
    drawer,
    closeDrawer,
    refresh: () => render(parts, query),
    toast,
  };
  try {
    viewEl.appendChild(route.view.render(ctx));
  } catch (err) {
    viewEl.appendChild(h('div', { class: 'empty' },
      h('h3', {}, 'This screen could not be drawn'),
      h('p', {}, 'Reset the demo data from the sidebar to rebuild the sample estate.')));
    /* keep the message visible in the console for anyone poking at the demo */
    console.warn('[stackview] view error:', err);
  }
  viewEl.scrollTop = 0;
}

store.subscribe(() => renderNav(current));

/* ---------- keyboard ---------- */
const ORDER = Object.keys(ROUTES);
document.addEventListener('keydown', (e) => {
  if (e.altKey && !e.metaKey && !e.ctrlKey && /^[1-7]$/.test(e.key)) {
    const target = ORDER[Number(e.key) - 1];
    if (target) { e.preventDefault(); navigate(target); }
  }
  if (e.key === 'Escape') { closeDrawer(); setSidebar(false); }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if (e.key === '/' && !typing) {
    const box = qs('#view .search .input');
    if (box) { e.preventDefault(); box.focus(); }
  }
});

/* ---------- assistant ---------- */
window.stackviewAssistant = buildAssistant(store).mount(document.body);

/* ---------- go ---------- */
nav.go();
export { ICONS };
