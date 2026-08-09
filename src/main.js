/* ============================================================
   stackview — boot: store, shell, nav, router, assistant.
   ============================================================ */

import { h, qs, icon, ICONS, router, toast, confirmDialog, modal } from '../lib/ui.js';
import { initPWA } from '../lib/pwa.js';
import { store, ORG, openAlerts } from './data.js';
import { buildAssistant, ACTION_HELP } from './agent.js';
import { notificationsControl } from './notify.js';

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

/* Sidebar preferences — rail collapse and brand colour. Kept out of the demo
   store so that "Reset demo data" does not throw away a display choice.
   The brand yellow is the default navigation; plain white is the alternative,
   so a first visit with nothing stored renders data-tone="amber". */
const PREFS_KEY = 'stackview.prefs.v1';
const RAIL_MIN = 900;   /* below this the sidebar is a drawer, so no rail */
/* theme null means "follow the operating system", which is what a first visit
   gets; picking light or dark pins it. */
const DEFAULTS = { rail: false, tone: 'amber', theme: null };
const prefs = (() => {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); }
  catch (_) { return Object.assign({}, DEFAULTS); }
})();
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {} };

/* The phone preview loads this same page inside an iframe. The framed copy
   drops the device control, so there is no frame inside the frame. */
const FRAMED = new URLSearchParams(location.search).get('frame') === 'phone';

/* Small glyphs the shared icon set does not carry. The two chrome controls on
   the brand row show a glyph and nothing else, so theirs have to say what they
   do on their own: a panel edge with a chevron pointing the way the sidebar
   will move, and a circle half filled for the colour. */
const GLYPH = {
  collapse: '<svg viewBox="0 0 20 20"><path d="M11.6 5.6L7.2 10l4.4 4.4"/><path d="M15.4 3.6v12.8"/></svg>',
  expand: '<svg viewBox="0 0 20 20"><path d="M8.4 5.6L12.8 10l-4.4 4.4"/><path d="M4.6 3.6v12.8"/></svg>',
  tone: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.6"/><path d="M10 3.4a6.6 6.6 0 0 1 0 13.2z" fill="currentColor" stroke="none"/></svg>',
  external: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11.2 4.2h4.6v4.6"/><path d="M15.8 4.2l-6.4 6.4"/><path d="M14.4 11.6v3.6a1.6 1.6 0 0 1-1.6 1.6H4.8a1.6 1.6 0 0 1-1.6-1.6V7.2a1.6 1.6 0 0 1 1.6-1.6h3.6"/></svg>',
  code: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.4 5.8L3.2 10l4.2 4.2"/><path d="M12.6 5.8L16.8 10l-4.2 4.2"/><path d="M11.1 4.1L8.9 15.9"/></svg>',
  /* topbar: a phone, a monitor, and the two theme glyphs */
  phone: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="2.6" width="8" height="14.8" rx="2"/><path d="M8.8 15.2h2.4"/></svg>',
  desktop: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.6" y="4" width="14.8" height="9.6" rx="2"/><path d="M7.4 17h5.2M10 13.6V17"/></svg>',
  moon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.2 12.4A6.8 6.8 0 0 1 7.6 3.8a6.8 6.8 0 1 0 8.6 8.6z"/></svg>',
  sun: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.4"/><path d="M10 2.4v1.8M10 15.8v1.8M17.6 10h-1.8M4.2 10H2.4M15.4 4.6l-1.3 1.3M5.9 14.1l-1.3 1.3M15.4 15.4l-1.3-1.3M5.9 5.9L4.6 4.6"/></svg>',
};

/* the repository this demo is published from */
const SOURCE_URL = 'https://github.com/nasvih/stackview-cloud-infrastructure-dashboard';
const SOURCE_NOTE = 'The source is published so it can be read, run and evaluated. It is not open source — copying, modifying, redistributing, deploying it or using it as training data needs written permission. See the LICENSE file in the repository.';

/* The colour control never names a colour: the glyph carries it and
   aria-pressed reports whether the yellow tone is on. */
const TONE_LABEL = 'Sidebar colour';
const railLabel = (railed) => (railed ? 'Expand sidebar' : 'Collapse sidebar');

const railBtn = h('button', {
  class: 'btn btn--sm sv-railbtn',
  type: 'button',
  dataset: { chrome: 'rail' },
  'aria-controls': 'sidebar',
  onclick: () => { prefs.rail = !prefs.rail; savePrefs(); applyChrome(); },
});
const toneBtn = h('button', {
  class: 'btn btn--sm',
  type: 'button',
  dataset: { chrome: 'tone' },
  'aria-controls': 'sidebar',
  title: TONE_LABEL,
  'aria-label': TONE_LABEL,
  onclick: () => { prefs.tone = prefs.tone === 'amber' ? 'default' : 'amber'; savePrefs(); applyChrome(); },
});

/* ---------- about this demo ----------
   Four blocks: what the product is, where it helps, what a real deployment
   would look like, and how this particular demo behaves. */
const ABOUT = [
  {
    title: 'What this is',
    text: 'Stackview is one picture of what a business runs and what it pays for. It puts every resource — across cloud providers and the on-prem racks — in a single inventory, then reads cost by service, by environment and by team on top of it. Access and MFA status, open alerts and 30-day uptime sit on the same estate, so the answer to "what do we run, what does it cost, who can get into it" is one screen rather than three consoles.',
  },
  {
    title: 'Where it helps a business',
    list: [
      ['One inventory', 'nobody opens three provider consoles to answer "what do we run". Cloud and on-prem are in the same table, with the same filters.'],
      ['Waste is found before the bill', 'idle and forgotten resources are listed with a reason and a monthly figure, instead of being noticed at billing time.'],
      ['Every resource has an owner', 'ownership is attached to the resource, so there is a named person to ask before anything is switched off.'],
      ['Access review is already written', 'stale accounts, admin without MFA and old keys are listed continuously, so the review stops being an annual scramble.'],
      ['Alerts leave a trail', 'acknowledgements and mutes are recorded against the alert, so an incident can be reconstructed after the fact.'],
    ],
  },
  {
    title: 'How it would work for real',
    text: 'The same interface, reading from the provider APIs and the identity directory instead of sample data, with the inventory, the cost lines and the access findings refreshed on a schedule. What you are looking at here is the interface and the workflow — no account is connected and nothing is being polled.',
  },
  {
    title: 'How this demo works',
    list: [
      ['You can actually use it', 'acknowledge and mute alerts, stop resources and reassign owners, work the idle and waste list, run the access review and the offboarding checklist, generate a monthly review. Nothing on these screens is read only.'],
      ['Your data stays on your machine', 'everything you change is saved in this browser\'s local storage. There is no account and no backend. "Reset demo data" clears it, and it does not sync between browsers or devices.'],
      ['The assistant is simulated', 'Stackview Insight answers by matching your question against this app\'s own demo data. It is a demonstration of the interaction, not a connected model, and no request leaves your browser.'],
    ],
  },
];

export function aboutModal() {
  /* under 900px the sidebar is a drawer that sits above the modal scrim, so a
     modal opened from the footer has to close it first */
  setSidebar(false);
  const body = h('div', { class: 'sv-about' },
    h('p', { class: 'muted small' }, 'The estate on these screens — Northline Group, its resources, people and bills — is invented sample data.'),
    ...ABOUT.map((b) => h('div', { class: 'sv-about__b' },
      h('h4', {}, b.title),
      b.text ? h('p', { class: 'small muted' }, b.text) : null,
      b.list
        ? h('ul', { class: 'sv-about__list' },
            ...b.list.map(([lead, rest]) => h('li', {}, h('strong', {}, lead), ` — ${rest}`)))
        : null)),
    /* the same worked examples the assistant gives for "what can you do?" */
    h('div', { class: 'sv-about__b' },
      h('h4', {}, 'What you can ask the assistant to do'),
      h('p', { class: 'small muted' }, 'Stackview Insight does not only report. Type one of these and it names exactly what it is about to touch, then applies it when you press the button — never before.'),
      h('ul', { class: 'sv-about__ex' }, ...ACTION_HELP.map((a) => h('li', {},
        h('div', { class: 'sv-about__ask mono' }, a.ask),
        h('div', { class: 'sv-about__does small muted' }, `It ${a.does}`),
        h('div', { class: 'label' }, `Lands on ${a.screen}`))))),
    h('div', { class: 'sv-about__b sv-about__src' },
      h('h4', {}, 'The source'),
      h('p', { class: 'small muted' }, SOURCE_NOTE),
      h('a', {
        class: 'btn btn--sm sv-src',
        href: SOURCE_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': 'Source on GitHub — opens in a new tab',
        html: `${GLYPH.code}<span>Source on GitHub</span>`,
      })));
  modal({ title: 'About Stackview', body, actions: [{ label: 'Got it', class: 'btn--primary' }] });
}

/* initPWA appends its control here, and only when the browser offers an
   install; the row is a flex pair, so while the control is hidden the reset
   button spans it on its own and nothing gaps. */
const installRow = h('div', { class: 'side__pair sv-install' },
  h('button', {
    class: 'btn btn--ghost btn--block btn--sm sv-reset',
    type: 'button',
    title: 'Reset demo data',
    'aria-label': 'Reset demo data',
    onclick: async () => {
      setSidebar(false);
      const ok = await confirmDialog(
        'This clears every change you made in this demo — acknowledged alerts, cleanup plans, offboarding progress and generated reports — and rebuilds the sample estate.',
        { title: 'Reset demo data', okLabel: 'Reset', danger: true });
      if (!ok) return;
      store.reset();
      toast('Demo data reset', 'ok');
      render();
    },
    html: `${icon('refresh')}<span>Reset demo data</span>`,
  }));

const side = h('aside', { class: 'side', id: 'sidebar' },
  h('div', { class: 'side__brand' },
    h('span', { class: 'mark' }, 'SV'),
    h('div', { style: 'min-width:0' },
      h('div', { class: 'side__name' }, 'stackview'),
      h('div', { class: 'side__tag' }, 'IT visibility')),
    /* rail and colour: icon-only, right of the name, stacked by the kit when
       the sidebar narrows to the 64px rail */
    h('div', { class: 'side__brandbtns' }, railBtn, toneBtn)),
  h('nav', { class: 'side__nav', id: 'nav', 'aria-label': 'Primary' }),
  h('div', { class: 'side__foot' },
    h('div', { class: 'sv-org side__sub' },
      h('span', { class: 'label' }, 'Tenant'),
      h('div', { class: 'sv-org__name' }, ORG.name),
      h('div', { class: 'small faint' }, ORG.units.join(' · '))),
    h('div', { class: 'side__pair' },
      h('a', {
        class: 'btn btn--block btn--sm sv-site',
        href: 'https://www.nasvih.in',
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': 'nasvih.in — opens in a new tab',
        title: 'nasvih.in — opens in a new tab',
        html: `${GLYPH.external}<span>nasvih.in</span>`,
      }),
      h('a', {
        class: 'btn btn--block btn--sm sv-src',
        href: SOURCE_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': 'GitHub — opens the source repository in a new tab',
        title: 'GitHub — opens the source repository in a new tab',
        html: `${GLYPH.code}<span>GitHub</span>`,
      })),
    installRow));

const scrim = h('div', { class: 'sv-navscrim', hidden: true, onclick: () => setSidebar(false) });

/* ---------- topbar controls ----------
   Three icon-only controls sit left of the About button: notifications,
   device preview and the theme switch. Each is a real button with a title
   and an aria-label, reachable by keyboard in source order. */

const notifs = notificationsControl({
  store,
  navigate: (to) => { location.hash = `#/${to}`; },
});

const deviceBtn = (mode, label, glyph) => h('button', {
  class: 'btn btn--ghost btn--icon sv-devbtn',
  type: 'button',
  dataset: { device: mode },
  'aria-label': label,
  title: label,
  onclick: () => setDevice(mode),
  html: glyph,
});
const phoneBtn = deviceBtn('phone', 'Preview at phone size', GLYPH.phone);
const desktopBtn = deviceBtn('desktop', 'Back to desktop size', GLYPH.desktop);
const deviceGroup = h('div', { class: 'sv-seg', role: 'group', 'aria-label': 'Device preview' }, desktopBtn, phoneBtn);

const themeBtn = h('button', {
  class: 'btn btn--ghost btn--icon',
  type: 'button',
  onclick: () => { prefs.theme = isDark() ? 'light' : 'dark'; savePrefs(); applyTheme(); },
});

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
  h('div', { class: 'sv-topbtns' },
    notifs.el,
    FRAMED ? null : deviceGroup,
    themeBtn),
  h('button', {
    class: 'pill pill--amber sv-demopill',
    type: 'button',
    'aria-label': 'About this demo',
    title: 'Every figure, resource, account and alert here is invented sample data and nothing leaves your browser. Open for the detail.',
    onclick: () => aboutModal(),
    /* the first two words are dropped on a narrow phone, where this pill would
       otherwise take a third of the bar and leave the view title at two
       characters. The aria-label above carries the full name either way. */
  }, h('span', { class: 'sv-demopill__long' }, 'About this '), 'demo'));

const viewEl = h('main', { class: 'view view--pad', id: 'view', tabindex: '-1' });

const shell = h('div', { class: 'shell' }, side, h('div', { class: 'main' }, topbar, viewEl));
app.appendChild(shell);
app.appendChild(scrim);

function setSidebar(open) {
  side.classList.toggle('is-open', open);
  scrim.hidden = !open;
}

/* ---------- sidebar chrome: rail + colour ---------- */
const railable = () => window.innerWidth > RAIL_MIN;

function applyChrome() {
  /* the rail only exists on wide screens; under 900px the sidebar is a drawer
     and must keep its full width and its labels */
  const railed = prefs.rail && railable();
  shell.classList.toggle('is-rail', railed);
  side.setAttribute('data-tone', prefs.tone);

  const label = railLabel(prefs.rail);
  railBtn.setAttribute('aria-pressed', prefs.rail ? 'true' : 'false');
  railBtn.setAttribute('aria-label', label);
  railBtn.title = label;
  railBtn.innerHTML = `${prefs.rail ? GLYPH.expand : GLYPH.collapse}<span>${label}</span>`;

  const amber = prefs.tone === 'amber';
  toneBtn.setAttribute('aria-pressed', amber ? 'true' : 'false');
  toneBtn.innerHTML = `${GLYPH.tone}<span>${TONE_LABEL}</span>`;

  renderNav(current);
}

window.addEventListener('resize', () => {
  const railed = prefs.rail && railable();
  if (railed !== shell.classList.contains('is-rail')) applyChrome();
});

/* ---------- theme ----------
   data-theme on <html>. With nothing stored the operating system decides and
   keeps deciding; the moment the reader presses the control it is pinned and
   persisted. index.html sets the attribute before first paint so a dark
   browser never flashes white. */
const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const isDark = () => prefs.theme === 'dark';

function applyTheme() {
  const dark = isDark();
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = qs('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#141517' : '#EAC81C');
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  themeBtn.setAttribute('aria-label', label);
  themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  themeBtn.title = label;
  themeBtn.innerHTML = dark ? GLYPH.sun : GLYPH.moon;
}
if (systemDark && systemDark.addEventListener) {
  systemDark.addEventListener('change', () => { if (!prefs.theme) applyTheme(); });
}

/* ---------- device preview ----------
   Phone mode loads the app again inside a 390x844 iframe, so the real
   breakpoints apply rather than a scaled screenshot of the desktop layout. */
let phoneWrap = null;

function setDevice(mode) {
  if (mode === 'phone') openPhone(); else closePhone();
}

function openPhone() {
  if (phoneWrap) return;
  notifs.close();
  const frame = h('iframe', {
    class: 'sv-phone__screen',
    title: 'Stackview running in a 390 by 844 phone viewport',
    src: `./index.html?frame=phone${location.hash || '#/overview'}`,
  });
  const back = h('button', {
    class: 'btn btn--sm', type: 'button', onclick: () => closePhone(),
    html: `${GLYPH.desktop}<span>Back to desktop</span>`,
  });
  phoneWrap = h('div', { class: 'sv-phone' },
    h('div', { class: 'sv-phone__bar' },
      h('div', { style: 'min-width:0' },
        h('div', { class: 'sv-phone__name' }, 'stackview'),
        h('div', { class: 'sv-phone__size mono' }, 'phone preview · 390 × 844')),
      back),
    h('div', { class: 'sv-phone__bezel' }, frame));
  document.body.appendChild(phoneWrap);
  document.body.classList.add('is-phoneview');
  phoneBtn.setAttribute('aria-pressed', 'true');
  desktopBtn.setAttribute('aria-pressed', 'false');
  back.focus();
}

function closePhone() {
  if (phoneWrap) { phoneWrap.remove(); phoneWrap = null; }
  document.body.classList.remove('is-phoneview');
  phoneBtn.setAttribute('aria-pressed', 'false');
  desktopBtn.setAttribute('aria-pressed', 'true');
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
      const railed = shell.classList.contains('is-rail');
      const label = key === 'alerts' && openCount ? `${r.title} (${openCount} open)` : r.title;
      const link = h('a', {
        class: `navlink${key === active ? ' is-active' : ''}`,
        href: `#/${key}`,
        'aria-current': key === active ? 'page' : null,
        /* in rail mode the text is hidden, so the name has to come from here */
        'aria-label': railed ? label : null,
        title: railed ? label : null,
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
let lastParts = [];
let lastQuery = new URLSearchParams();
const nav = router(ROUTES, (name, parts, query) => {
  current = name;
  render(parts, query);
});

export function navigate(path) { location.hash = `#/${path}`; }

/* redraw whatever screen is up — the assistant calls this after it changes
   something so the alert queue, cleanup plan or access list reflects it
   without the reader touching anything */
export function rerender() { render(lastParts, lastQuery); }

function render(parts = [], query = new URLSearchParams()) {
  lastParts = parts; lastQuery = query;
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
  if (e.key === 'Escape') { closeDrawer(); setSidebar(false); closePhone(); }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if (e.key === '/' && !typing) {
    const box = qs('#view .search .input');
    if (box) { e.preventDefault(); box.focus(); }
  }
});

/* ---------- assistant ----------
   It is handed a redraw so the changes it makes land on the screen behind
   the panel the moment they are applied. */
window.stackviewAssistant = buildAssistant(store, { refresh: rerender }).mount(document.body);

/* ---------- installable ----------
   initPWA appends, so the control is moved to the head of the row it shares
   with "Reset demo data". While it is hidden it leaves the flex row entirely
   and reset spans the row on its own, so nothing shifts on a browser that
   never offers an install. */
const installBtn = initPWA({
  mount: installRow,
  appName: 'Stackview',
  onNote: (msg) => toast(msg),
});
if (installBtn) installRow.insertBefore(installBtn, installRow.firstChild);

/* ---------- go ---------- */
nav.go();
applyChrome();
applyTheme();
closePhone();   /* sets the device control to its resting state */
export { ICONS };
