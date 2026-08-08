# stackview — technical notes

How the application is put together, what the data looks like, and where to add things.

## What this is

Stackview is one picture of what a business runs and what it pays for. It puts every resource —
across cloud providers and the on-prem racks — in a single inventory, then reads cost by service,
by environment and by team on top of it. Access and MFA status, open alerts and 30-day uptime sit
on the same estate, so the answer to "what do we run, what does it cost, who can get into it" is
one screen rather than three consoles.

## Where it helps a business

- **One inventory** — nobody opens three provider consoles to answer "what do we run". Cloud and
  on-prem are in the same table, with the same filters.
- **Waste is found before the bill** — idle and forgotten resources are listed with a reason and a
  monthly figure, instead of being noticed at billing time.
- **Every resource has an owner** — ownership is attached to the resource, so there is a named
  person to ask before anything is switched off.
- **Access review is already written** — stale accounts, admin without MFA and old keys are listed
  continuously, so the review stops being an annual scramble.
- **Alerts leave a trail** — acknowledgements and mutes are recorded against the alert, so an
  incident can be reconstructed after the fact.

## How it would work for real

The same interface, reading from the provider APIs and the identity directory instead of sample
data, with the inventory, the cost lines and the access findings refreshed on a schedule. What you
are looking at here is the interface and the workflow — no account is connected and nothing is
being polled.

## How this demo works

**You can actually use it.** Acknowledge and mute alerts, stop resources and reassign owners, work
the idle and waste list, run the access review and the offboarding checklist, generate a monthly
review. Nothing on these screens is read only.

**Your data stays on your machine.** Everything you change is saved in this browser's local
storage. Nothing is sent to a server. There is no account, no backend, and no cloud provider is
connected. Clear your browser data or use **Reset demo data** and it is all gone. It does not sync
between browsers or devices.

**The assistant is simulated.** Stackview Insight answers by matching your question against this
app's own demo data. It is a demonstration of the interaction, not a connected model, and no
request leaves your browser.

The four blocks above are the `ABOUT` array in `src/main.js`, rendered by `aboutModal()`, followed
by a fifth block linking to the repository and stating the licence terms (`SOURCE_URL` and
`SOURCE_NOTE`). The modal closes the mobile sidebar before it opens, because under 900px the
sidebar drawer (`z-index:65`) sits above the modal scrim (`z-index:60`).

The source is published to be read and evaluated; it is **not** open source. Copying, modifying,
redistributing, deploying it or using it as training data needs written permission — see `LICENSE`.

## Architecture

Plain ES modules loaded straight by the browser. There is no bundler, no transpiler, no package
manager and no network call in the application code — `fetch` is never used.

```
index.html
  └─ src/main.js                 builds the shell, owns the router and the drawer
       ├─ src/data.js            seed + store + derived selectors
       ├─ src/agent.js           assistant configuration
       ├─ lib/pwa.js             service worker registration + install control
       └─ src/views/<name>.js    render(ctx) -> Node, one per screen
sw.js                            registered by lib/pwa.js, caches the shell
manifest.webmanifest             linked from index.html
```

**Rendering.** Everything is built with the `h(tag, attrs, ...children)` helper from `lib/ui.js`,
which returns real DOM nodes. There is no virtual DOM and no template language. Each view returns
one root node; `main.js` empties `#view` and appends it.

**Updating.** Views keep their own local paint function (`draw()` / `paint()`), which is called
after a store write. Nothing re-renders the whole page except a route change. Drawers rebuild
themselves by calling `detail(id)` again after a write, so the panel always shows current state.

**Routing.** `router(routes, cb)` in `lib/ui.js` listens to `hashchange` and hands back the route
name, the remaining path segments and a `URLSearchParams`. Routes are `#/overview`, `#/alerts`,
`#/uptime`, `#/resources`, `#/cost`, `#/access`, `#/reports`. An unknown hash falls back to the
first route.

**Persistence.** `createStore('stackview.state.v1', seedState)` reads local storage on boot, or
seeds if there is nothing there. `store.update(fn)` mutates the state, writes it back and notifies
subscribers. `store.reset()` re-seeds. That is the whole state layer.

**Sidebar chrome.** The rail collapse and the sidebar colour are display preferences, not demo
data, so they live in their own `stackview.prefs.v1` key and survive **Reset demo data**. The
defaults are `{ rail: false, tone: 'amber' }` — **the brand yellow is the default sidebar**, so a
visitor with nothing stored gets `data-tone="amber"`; `'default'` is the plain white alternative.
Both controls live in `.side__brandbtns`, on the brand row beside the app name, and are icon-only —
the kit clips their `<span>` and sizes them to 30×30, so the glyph and the accessible name do all
the work. The rail control names the action it performs, *Collapse sidebar* / *Expand sidebar*, and
swaps its glyph with the state. The colour control never names a colour at all: its `title` and
`aria-label` stay *Sidebar colour*, its glyph is a circle half filled, and the tone is reported only
through `aria-pressed`.

`applyChrome()` in `src/main.js` is the single place that writes them to the DOM: it toggles
`is-rail` on `.shell`, sets `data-tone` on `.side`, rewrites both buttons' glyph, label,
`title` and `aria-pressed`, then re-runs `renderNav()` so the nav links pick up or drop their
`title` / `aria-label` (in rail mode the visible text is hidden, so the name has to come from
there). The rail class is only applied above 900px — below that the sidebar is a fixed drawer and
a 64px grid column would break the layout — and a `resize` listener re-applies it across that
boundary. The rail button hides itself under 900px in `assets/stackview.css`. In the rail
`.shell.is-rail .side__brandbtns` stacks the pair into a column under the mark, so both stay
reachable inside 64px.

**Sidebar footer.** Below the tenant block: **About this demo** across the full width, then a
`.side__pair` holding the dark `.sv-site` link to nasvih.in beside `.sv-src` for the repository,
then a second `.side__pair` holding **Reset demo data**. A pair is a flex row whose children share
the width and truncate their labels rather than overflow; the kit stacks it back into a column in
the rail.

**One assistant entry point.** `Assistant.mount()` installs the round launcher and the
⌘K / Ctrl+K binding. Nothing else in the app opens the panel; there is no topbar or sidebar
shortcut to it, by design. The launcher glyph is the agent mark from `lib/assistant.js` — a minimal
robot head in four stroke shapes, drawn at 23px inside the 52px disc.

**Installable.** `initPWA({ mount, appName, onNote })` from `lib/pwa.js` is called once at the end
of `src/main.js`. It registers `sw.js` on `load`, then appends an **Install app** button into
`.sv-install`, the last `.side__pair` row in the sidebar footer — the one holding **Reset demo
data**. `initPWA` appends, so `main.js` moves the control to the head of that row; while it is
hidden `[hidden]{display:none!important}` takes it out of the flex row entirely and reset spans the
row on its own. The button starts hidden and is revealed by
`beforeinstallprompt`; on iOS, where that event never fires, it is visible from the start and
explains the Share → Add to Home Screen route through `onNote`, which is wired to the app's
`toast()`. It removes itself on `appinstalled` and never mounts at all when the app is already
running in standalone display mode.

`sw.js` holds an explicit `SHELL` array — the page, both stylesheets, every module under `lib/` and
`src/`, the manifest and the three icons. Install pre-caches them, activate deletes any cache whose
key does not match the current `CACHE_VERSION`, and fetch is cache-first for same-origin requests
with a navigation fallback to `./index.html`, so a reload with no connection still renders. The
Google Fonts stylesheet and its woff2 files are cross-origin, so they are network-first and fall
back to whatever was cached on the last online visit. **Bump `CACHE_VERSION` whenever the file list
or any cached asset changes**, otherwise returning visitors keep the old shell.

## Data model

`src/data.js` builds the estate from a fixed blueprint plus a seeded pseudo-random generator
(`seeded(20260806)`), so the figures are stable between reloads.

```js
state = {
  version, seededAt, org,
  resources: [{
    id, name, provider:'aws'|'azure'|'onprem', kind, size,
    env:'prod'|'staging'|'dev'|'shared', region, team, owner,
    state:'running'|'available'|'stopped'|'degraded'|'unattached'|'unassociated',
    service, cost,                       // USD per month
    util: { cpu, mem, disk, net },       // 30 day averages, net in GB
    tags: { Environment, Service, Team, Owner?, CostCentre?, ManagedBy? },
    tagged, ageDays, lastSeenHrs, note,
    waste: null | { why, saving, action }
  }],
  months: [{ key:'2026-08', label:'Aug', year, total, byService:{...}, current }],   // 7 entries
  alerts: [{ id, sev:'critical'|'high'|'warning'|'info', title, detail, runbook,
             resource, service, source, opened,
             status:'open'|'acked'|'muted'|'resolved', ackBy, ackAt,
             timeline:[{ t, who, text }] }],
  users: [{ id, name, email, team, role, directory, mfa, lastLogin, lastLoginDays,
            keyAgeDays, status:'active'|'stale'|'service'|'disabled',
            offboarding: null | { started, done:[bool x7] } }],
  services: [{ id, name, tier, slo, resource, uptime30, downMins,
               days:[{ day, status:'up'|'deg'|'down', mins, pct, maintenance? }] }], // 30 days
  cleanup: { [resourceId]: 'planned' | 'dismissed' },
  reports: [{ id, created, month, author, spend, change, resources, waste, planned,
              uptime, openAlerts, noMfa, stale }],
  activity: [{ t, text }]
}
```

### Derived selectors

Exported from `src/data.js` and used by every view and by the assistant, so a number is only
defined once:

| Selector | Returns |
|---|---|
| `monthlyTotal(s)` | sum of every resource cost — the run rate |
| `projection(s)` | `{ day, daysInMonth, mtd, projected }` |
| `openAlerts(s)` | alerts with `status === 'open'` |
| `wasteItems(s)` | findings that are not dismissed, sorted by saving |
| `totalWaste(s)` | monthly saving available |
| `staleUsers(s)` / `adminsNoMfa(s)` | access review inputs |
| `fleetUptime(s)` | mean 30 day availability across services |
| `groupSum(rows, key)` | `[{label, value}]` sorted descending — used for env, team, provider, region |
| `money2 / money0 / sar` | `$1,234.56`, `$1,235`, `SAR 4,631` |

### Cost history

Monthly totals are not stored per resource. `makeMonths()` takes the current cost per service group
and applies a factor per month — a shared baseline plus a per-service drift table, which is what
produces the Kubernetes step change this month and the steady on-prem line. The month-on-month
"biggest mover" in Cost and in the assistant is computed from `byService`.

## Module map

| File | Responsibility |
|---|---|
| `src/main.js` | Shell markup, sidebar nav with the open-alert count, the brand-row rail and colour controls, the paired footer rows, site and source links, topbar, route table, drawer helper, keyboard shortcuts, "About Stackview" modal, reset action, assistant and PWA mount |
| `src/data.js` | Resource blueprint, alerts, users, uptime strips, cost history, seed, store, selectors |
| `src/agent.js` | 17 intents and 4 fallbacks for Stackview Insight, all reading `store.state` |
| `src/views/overview.js` | Stat row, spend bars, environment meters, provider tiles, waste table, alert list, access hygiene, activity timeline |
| `src/views/resources.js` | Filter bar, sortable inventory table, CSV export, detail drawer with utilisation meters and the resource actions |
| `src/views/cost.js` | Four tabs — service, environment, team, idle and waste — plus the cleanup plan and its export |
| `src/views/access.js` | Account table, filter chips, detail drawer, MFA and role actions, offboarding checklist |
| `src/views/alerts.js` | Severity and status filters, queue, inline actions, bulk acknowledge, timeline drawer |
| `src/views/uptime.js` | Status strips, error budget, day drawer, planned maintenance reclassification |
| `src/views/reports.js` | Review notes from live state, six CSV downloads, generated review records |
| `lib/ui.js` | `h/qs/qsa/on/esc`, formatting, `seeded/pick/between`, `createStore`, `router`, `toast`, `modal`, `confirmDialog`, `downloadCSV`, `barChart`, `meter`, `icon/ICONS` |
| `lib/assistant.js` | Intent routing, word-by-word streaming, launcher panel, docked panel |
| `lib/pwa.js` | Service worker registration, install prompt capture, the install control |
| `sw.js` | Versioned cache of the shell file list, cache-first fetch, navigation fallback |

`lib/ui.js`, `lib/assistant.js`, `lib/pwa.js` and `assets/app.css` are copies of the shared product
kit and are kept unmodified so the app can be dropped into its own repository unchanged. `sw.js` is
the kit worker with this app's own `SHELL` list filled in — the one line each app must edit.

## The assistant

`src/agent.js` exports `buildAssistant(store)`. Each intent is:

```js
{
  id: 'cost-jump',
  match: [/jump|spike|increase/i, 'biggest mover'],   // regex scores 2, string scores 1
  trace: 'compared this month against last month by service group',
  answer: (q, s) => ({ text, table, meta, suggestions })   // s is store.state
}
```

The highest scoring intent wins; with no match the assistant picks one of four fallbacks that say
what it *can* answer. `text` supports `**bold**`, `` `code` `` and `- bullets`. `table` is
`{ head:[], rows:[[]] }`. Because `context: () => store.state`, every answer reflects edits made a
moment earlier — acknowledge an alert and the queue count in the reply drops.

### Adding an intent

1. Add an object to the `intents` array in `src/agent.js`.
2. Read the numbers through the selectors in `src/data.js` rather than recomputing them.
3. Add a phrasing to `SUGGESTIONS` if it deserves a chip.

**Every chip must be answerable.** Scoring is `regex = 2, string = 1`, and ties go to the intent
declared first, so a new broad regex can quietly steal a question from a narrower intent. After
any change to `match` lists or to a `suggestions` array, ask each chip back to the assistant and
check the reply is not a fallback — the full chip set is reachable from the running app:

```js
const agent = await import('/src/agent.js');
const data  = await import('/src/data.js');
const bot   = agent.buildAssistant(data.store);
const chips = new Set(bot.cfg.suggestions);
for (const it of bot.cfg.intents) (it.answer('probe', data.store.state).suggestions || []).forEach(c => chips.add(c));
[...chips];   // ask each one, assert the reply is not one of bot.cfg.fallbacks
```

The same rule applies to the fallback strings: if a fallback tells the user to ask about X, then
X has to route to a real intent.

## Extending

**A new screen.** Create `src/views/thing.js` exporting `render(ctx)` and a default export of
`{ render }`, import it in `src/main.js` and add an entry to `ROUTES` with a `title`, `sub`, `icon`
(a key from `ICONS`) and `group` (`Monitor`, `Estate` or `Governance`). The sidebar and the router
pick it up automatically.

**A new field on a resource.** Add it to the tuple in `RES`, expand it in `makeResources()`, then
bump the store key in `STORE_KEY` (`stackview.state.v2`) so existing visitors get the new shape
instead of a half-seeded object.

**A new interactive flow.** Write through `ctx.store.update(state => { ... })`, push a line onto
`state.activity` so the overview shows it, then call the view's local `paint()` / `draw()`.

**`ctx`** passed to every view is `{ store, state, parts, query, navigate, drawer, closeDrawer,
refresh, toast }`.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> | Open or close Stackview Insight — the only entry point besides the round launcher |
| <kbd>Alt</kbd> <kbd>1</kbd>…<kbd>7</kbd> | Jump to Overview, Alerts, Uptime, Resources, Cost, Access, Reports |
| <kbd>/</kbd> | Focus the search box on the current screen |
| <kbd>Esc</kbd> | Close the drawer, the modal, the mobile sidebar or the assistant |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Open the focused table row |

Table rows are real focus targets, every icon-only button carries an `aria-label`, filter chips and
the two sidebar chrome controls report `aria-pressed`, tabs report `aria-selected`, and the focus ring is
never removed.

## Design tokens

All from `assets/app.css`. `assets/stackview.css` only composes them — it defines no new colours.

| Token | Value | Used for |
|---|---|---|
| `--bg` / `--surface` | `#FFFFFF` | page and card ground |
| `--surface-2` | `#FAFAF8` | table headers, meter tracks, assistant log |
| `--hover` | `#FEFBEA` | row and control hover |
| `--ink` / `--ink-2` / `--muted` / `--faint` | `#17181A` `#2E3033` `#5A5F66` `#686E75` | text ramp |
| `--line` / `--line-2` | `#E7E7E4` `#D8D8D3` | hairlines and control borders |
| `--amber` / `--amber-fill` | `#EAC81C` | the one brand colour, always a **fill** with ink text |
| `--amber-deep` | `#8A6D00` | the only amber allowed as text on white |
| `--amber-soft` / `--amber-line` | `#FEF9DA` `#F0DE8C` | active nav, banners, planned cards |
| `--ok` / `--warn` / `--bad` / `--info` | `#1E7A4B` `#9A6400` `#B3261E` `#1F5C9E` | status, each always paired with a word |
| `--r-lg` / `--r` / `--r-sm` / `--r-xs` | 12 / 8 / 6 / 4 px | radii |
| `--sans` / `--mono` | Inter / JetBrains Mono | UI text / labels, numbers, identifiers |

### The yellow sidebar is the default

`.side[data-tone="amber"]` is `--amber-fill` with `--ink` text — 10.8:1 — and it is what a first
visit renders. That makes the yellow the resting state rather than an opt-in, so everything sitting
on it is measured against `#EAC81C`, never against white:

| Element | Colour | On `#EAC81C` |
|---|---|---|
| Brand name, nav labels, tenant name, footer button text | `--ink` `#17181A` | 10.8:1 |
| Brand tag, group headings, the open-alert count, tenant label and units | `--ink-2` `#2E3033` | 8.0:1 |
| Nav icons | `--amber-darker` `#6B5400` | 4.4:1 — graphics, so the 3:1 bar applies |
| Active nav link | `--ink` on `--bg` | 15.9:1 |
| nasvih.in link | `#FFFFFF` on `--ink` | 15.4:1 |

`--amber-darker` lands at 4.4:1 on the fill — fine for the icon shapes it was drawn for, short of
4.5:1 for the 10–11px mono labels that are now on screen by default, so `app.css` holds the quiet
sidebar text at `--ink-2` and `assets/stackview.css` does the same for stackview's own footer
lines. The shared focus ring is `--amber`, invisible on the amber fill, so `app.css` turns it
`--ink` inside the yellow sidebar; `assets/stackview.css` inverts `::selection` there for the same
reason. White text on yellow never appears anywhere.

Rules the stylesheet keeps: solid fills only — no gradients, no blur, no glow shadows, no emoji as
icons. Icons are inline stroke SVG using `currentColor`. Status is never signalled by colour alone;
the uptime strip carries a legend and every block has a title and an `aria-label` in words.

Layout: sidebar collapses behind a menu button under 900px, grids drop to one column under 640px,
and the page has no horizontal scroll at 390px.
