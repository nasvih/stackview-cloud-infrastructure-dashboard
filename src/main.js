/* ============================================================
   stackview — boot: store, shell, nav, router, assistant.
   ============================================================ */

import { h, qs, icon, ICONS, router, toast, confirmDialog, modal, fmtDate, setAgoStrings, setUiStrings } from '../lib/ui.js';
import { initPWA } from '../lib/pwa.js';
import { createI18n } from '../lib/i18n.js';
import { STRINGS } from './strings.js';
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

/* ---------- language ----------
   One instance for the whole app. `t` is exported so every view reads the
   same dictionary; switching writes the choice and reloads, because these
   screens are built imperatively and a reload is the honest way to repaint
   every string, aria-label and chart axis. */
const i18n = createI18n({ key: 'stackview', dict: STRINGS });
export const t = i18n.t;

/* A dictionary lookup that falls back to the value already on the record.
   The English dictionary deliberately carries no `data.*` branch — in
   English the app reads the seeded sample text straight off the estate. */
export function tr(path, raw) {
  const v = t(path);
  return v === path ? raw : v;
}

/* The vocabulary of the estate, looked up wherever it is shown. Nothing
   here is written into the store, so a resource that was stopped in
   English still reads as stopped in Arabic. */
export const label = {
  env: (v) => tr(`envs.${v}`, v),
  state: (v) => tr(`states.${v}`, v),
  sev: (v) => tr(`sev.${v}`, v),
  alertStatus: (v) => tr(`alertStatus.${v}`, v),
  role: (v) => tr(`roles.${v}`, v),
  provider: (v) => tr(`providers.${v}`, v),
  directory: (v) => tr(`directories.${v}`, v),
  team: (v) => tr(`teams.${v}`, v),
  serviceGroup: (v) => tr(`serviceGroups.${v}`, v),
  source: (v) => tr(`sources.${v}`, v),
  month: (v) => tr(`months.${v}`, v),
  tier: (v) => tr(`tiers.${v}`, v),
  service: (v) => tr(`uptimeServices.${v}`, v),
  userStatus: (v) => tr(`access.status${String(v).charAt(0).toUpperCase()}${String(v).slice(1)}`, v),
};

/* The sample estate's own prose. */
export const wasteWhy = (r) => tr(`data.waste.${r.id}.why`, r.waste.why);
export const wasteAction = (r) => tr(`data.waste.${r.id}.action`, r.waste.action);
export const alertTitle = (a) => tr(`data.alerts.${a.id}.title`, a.title);
export const alertDetail = (a) => tr(`data.alerts.${a.id}.detail`, a.detail);
export const alertRunbook = (a) => tr(`data.alerts.${a.id}.runbook`, a.runbook);

/* The activity feed and the alert timelines are stored as a key and its
   numbers rather than as a finished sentence, so they come back in the
   language the reader is in now — not the one they were in when they
   pressed the button. Entries written by an older build keep their text. */
export const feedText = (e) => {
  if (!e || !e.k) return (e && e.text) || '';
  const p = Object.assign({}, e.p);
  /* a few parameters are stored as the key of a thing rather than as its
     name, so a month, a date or a role also comes back translated */
  if (p.mkey) p.month = `${label.month(p.mkey)}${p.year ? ` ${p.year}` : ''}`;
  if (p.dkey) p.date = fmtDate(p.dkey, { day: '2-digit', month: 'short' });
  if (p.skey) p.name = label.service(p.skey);
  if (p.rFrom) p.from = label.role(p.rFrom);
  if (p.rTo) p.to = label.role(p.rTo);
  return t(`activity.${e.k}`, p);
};
export const lineText = (e) => (e && e.k ? t(`timeline.${e.k}`, e.p || {}) : (e && e.text) || '');
/* The offboarding checklist, in the reader's language. */
export const offboardSteps = () => i18n.list('offboard');

setAgoStrings({
  now: t('time.now'),
  mins: (n) => t('time.mins', { n }),
  hours: (n) => t('time.hours', { n }),
  days: (n) => t('time.days', { n }),
});
setUiStrings({ cancel: t('ui.cancel'), confirm: t('ui.confirmOk'), close: t('ui.close') });

const ROUTES = {
  overview: { icon: 'home', group: 'Monitor', view: overview },
  alerts: { icon: 'bell', group: 'Monitor', view: alerts },
  uptime: { icon: 'chart', group: 'Monitor', view: uptime },
  resources: { icon: 'server', group: 'Estate', view: resources },
  cost: { icon: 'cloud', group: 'Estate', view: cost },
  access: { icon: 'shield', group: 'Governance', view: access },
  reports: { icon: 'file', group: 'Governance', view: reports },
};
const routeTitle = (k) => t(`routes.${k}.title`);
const routeSub = (k) => t(`routes.${k}.sub`);

/* ---------- shell ---------- */
const app = qs('#app');

/* Sidebar preferences — rail collapse and brand colour. Kept out of the demo
   store so that "Reset demo data" does not throw away a display choice.
   The brand azure is the default navigation; plain white is the alternative,
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

/* The colour control never names a colour: the glyph carries it and
   aria-pressed reports whether the accent tone is on. */
const toneLabel = () => t('chrome.tone');
const railLabel = (railed) => (railed ? t('chrome.railExpand') : t('chrome.railCollapse'));

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
  title: toneLabel(),
  'aria-label': toneLabel(),
  onclick: () => { prefs.tone = prefs.tone === 'amber' ? 'default' : 'amber'; savePrefs(); applyChrome(); },
});

/* ---------- about this demo ----------
   Four blocks: what the product is, where it helps, what a real deployment
   would look like, and how this particular demo behaves. */
const about = () => [
  { title: t('about.whatTitle'), text: t('about.whatText') },
  { title: t('about.helpTitle'), list: i18n.list('about.help') },
  { title: t('about.realTitle'), text: t('about.realText') },
  { title: t('about.demoTitle'), list: i18n.list('about.demo') },
];

export function aboutModal() {
  /* under 900px the sidebar is a drawer that sits above the modal scrim, so a
     modal opened from the footer has to close it first */
  setSidebar(false);
  const body = h('div', { class: 'sv-about' },
    h('p', { class: 'muted small' }, t('about.lead')),
    ...about().map((b) => h('div', { class: 'sv-about__b' },
      h('h4', {}, b.title),
      b.text ? h('p', { class: 'small muted' }, b.text) : null,
      b.list
        ? h('ul', { class: 'sv-about__list' },
            ...b.list.map(([lead, rest]) => h('li', {}, h('strong', {}, lead), ` — ${rest}`)))
        : null)),
    /* the same worked examples the assistant gives for "what can you do?" */
    h('div', { class: 'sv-about__b' },
      h('h4', {}, t('about.askTitle')),
      h('p', { class: 'small muted' }, t('about.askLead')),
      h('ul', { class: 'sv-about__ex' }, ...ACTION_HELP().map((a) => h('li', {},
        h('div', { class: 'sv-about__ask mono' }, a.ask),
        h('div', { class: 'sv-about__does small muted' }, t('about.itDoes', { does: a.does })),
        h('div', { class: 'label' }, t('about.landsOn', { screen: a.screen })))))),
    h('div', { class: 'sv-about__b sv-about__src' },
      h('h4', {}, t('about.sourceTitle')),
      h('p', { class: 'small muted' }, t('about.sourceNote')),
      h('a', {
        class: 'btn btn--sm sv-src',
        href: SOURCE_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': t('chrome.sourceOnGithubLabel'),
        html: `${GLYPH.code}<span>${t('chrome.sourceOnGithub')}</span>`,
      })));
  modal({ title: t('about.title'), body, actions: [{ label: t('about.ok'), class: 'btn--primary' }] });
}

/* initPWA appends its control here, and only when the browser offers an
   install; the row is a flex pair, so while the control is hidden the reset
   button spans it on its own and nothing gaps. */
const installRow = h('div', { class: 'side__pair sv-install' },
  h('button', {
    class: 'btn btn--ghost btn--block btn--sm sv-reset',
    type: 'button',
    title: t('chrome.reset'),
    'aria-label': t('chrome.reset'),
    onclick: async () => {
      setSidebar(false);
      const ok = await confirmDialog(t('chrome.resetBody'),
        { title: t('chrome.reset'), okLabel: t('chrome.resetOk'), danger: true });
      if (!ok) return;
      store.reset();
      toast(t('chrome.resetDone'), 'ok');
      render();
    },
    html: `${icon('refresh')}<span>${t('chrome.reset')}</span>`,
  }));

const side = h('aside', { class: 'side', id: 'sidebar' },
  h('div', { class: 'side__brand' },
    h('span', { class: 'mark' }, 'SV'),
    h('div', { style: 'min-width:0' },
      h('div', { class: 'side__name' }, t('app.name')),
      h('div', { class: 'side__tag' }, t('app.tag'))),
    /* rail and colour: icon-only, right of the name, stacked by the kit when
       the sidebar narrows to the 64px rail */
    h('div', { class: 'side__brandbtns' }, railBtn, toneBtn)),
  h('nav', { class: 'side__nav', id: 'nav', 'aria-label': t('chrome.primaryNav') }),
  h('div', { class: 'side__foot' },
    h('div', { class: 'sv-org side__sub' },
      h('span', { class: 'label' }, t('app.tenant')),
      h('div', { class: 'sv-org__name' }, ORG.name),
      h('div', { class: 'small faint' }, ORG.units.join(' · '))),
    h('div', { class: 'side__pair' },
      h('a', {
        class: 'btn btn--block btn--sm sv-site',
        href: 'https://www.nasvih.in',
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': t('chrome.siteLabel'),
        title: t('chrome.siteLabel'),
        html: `${GLYPH.external}<span>${t('chrome.site')}</span>`,
      }),
      h('a', {
        class: 'btn btn--block btn--sm sv-src',
        href: SOURCE_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': t('chrome.githubLabel'),
        title: t('chrome.githubLabel'),
        html: `${GLYPH.code}<span>${t('chrome.github')}</span>`,
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
const phoneBtn = deviceBtn('phone', t('chrome.phonePreview'), GLYPH.phone);
const desktopBtn = deviceBtn('desktop', t('chrome.desktopPreview'), GLYPH.desktop);
const deviceGroup = h('div', { class: 'sv-seg', role: 'group', 'aria-label': t('chrome.devicePreview') }, desktopBtn, phoneBtn);

/* The language switch sits first in the control row — language, then theme,
   then the device preview — so the reader meets it before anything else. */
const langBtn = i18n.toggle();

const themeBtn = h('button', {
  class: 'btn btn--ghost btn--icon',
  type: 'button',
  onclick: () => { prefs.theme = isDark() ? 'light' : 'dark'; savePrefs(); applyTheme(); },
});

const topbar = h('header', { class: 'topbar' },
  h('button', {
    class: 'btn btn--ghost btn--icon sidebtn',
    type: 'button',
    'aria-label': t('chrome.openNav'),
    onclick: () => setSidebar(!side.classList.contains('is-open')),
    html: icon('menu'),
  }),
  h('div', { class: 'sv-topttl' },
    h('div', { class: 'topbar__title', id: 'ttl' }, routeTitle('overview')),
    h('div', { class: 'topbar__sub', id: 'sub' }, routeSub('overview'))),
  h('div', { class: 'spacer' }),
  h('div', { class: 'sv-topbtns' },
    notifs.el,
    langBtn,
    themeBtn,
    FRAMED ? null : deviceGroup),
  h('button', {
    class: 'pill pill--amber sv-demopill',
    type: 'button',
    'aria-label': t('chrome.aboutDemo'),
    title: t('chrome.aboutPillTitle'),
    onclick: () => aboutModal(),
    /* the first two words are dropped on a narrow phone, where this pill would
       otherwise take a third of the bar and leave the view title at two
       characters. The aria-label above carries the full name either way. */
  }, h('span', { class: 'sv-demopill__long' }, t('chrome.aboutPillLong')), t('chrome.aboutPillShort')));

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
  toneBtn.innerHTML = `${GLYPH.tone}<span>${toneLabel()}</span>`;

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
  if (meta) meta.setAttribute('content', dark ? '#141517' : '#0B70C8');
  const label = dark ? t('chrome.themeToLight') : t('chrome.themeToDark');
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
    title: t('chrome.phoneFrameTitle'),
    src: `./index.html?frame=phone${location.hash || '#/overview'}`,
  });
  const back = h('button', {
    class: 'btn btn--sm', type: 'button', onclick: () => closePhone(),
    html: `${GLYPH.desktop}<span>${t('chrome.backToDesktop')}</span>`,
  });
  phoneWrap = h('div', { class: 'sv-phone' },
    h('div', { class: 'sv-phone__bar' },
      h('div', { style: 'min-width:0' },
        h('div', { class: 'sv-phone__name' }, t('app.name')),
        h('div', { class: 'sv-phone__size mono' }, t('chrome.phoneSize'))),
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
    const box = h('div', { class: 'navgroup' }, h('div', { class: 'navgroup__label' }, t(`navgroups.${g}`)));
    for (const [key, r] of Object.entries(ROUTES)) {
      if (r.group !== g) continue;
      const railed = shell.classList.contains('is-rail');
      const title = routeTitle(key);
      const label = key === 'alerts' && openCount ? `${title} ${t('chrome.navOpenSuffix', { n: openCount })}` : title;
      const link = h('a', {
        class: `navlink${key === active ? ' is-active' : ''}`,
        href: `#/${key}`,
        'aria-current': key === active ? 'page' : null,
        /* in rail mode the text is hidden, so the name has to come from here */
        'aria-label': railed ? label : null,
        title: railed ? label : null,
        onclick: () => setSidebar(false),
        html: `${icon(r.icon)}<span>${title}</span>`,
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
      h('button', { class: 'btn btn--ghost btn--icon', 'aria-label': t('chrome.closePanel'), title: t('chrome.closePanel'), onclick: () => closeDrawer(), html: icon('x') })),
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
  qs('#ttl').textContent = routeTitle(current);
  qs('#sub').textContent = routeSub(current);
  document.title = t('app.docTitle', { title: routeTitle(current) });
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
      h('h3', {}, t('chrome.viewErrorTitle')),
      h('p', {}, t('chrome.viewErrorBody'))));
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
  strings: {
    install: t('ui.install'),
    title: (app) => t('ui.installTitle', { app }),
    installed: (app) => t('ui.installed', { app }),
    dismissed: t('ui.installDismissed'),
    ios: t('ui.installIOS'),
    other: t('ui.installOther'),
  },
});
if (installBtn) installRow.insertBefore(installBtn, installRow.firstChild);

/* ---------- go ---------- */
nav.go();
applyChrome();
applyTheme();
closePhone();   /* sets the device control to its resting state */
export { ICONS };
