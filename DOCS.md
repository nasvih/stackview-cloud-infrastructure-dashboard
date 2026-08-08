# stackview — technical notes

How the application is put together, what the data looks like, and where to add things.

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

## Architecture

Plain ES modules loaded straight by the browser. There is no bundler, no transpiler, no package
manager and no network call in the application code — `fetch` is never used.

```
index.html
  └─ src/main.js                 builds the shell, owns the router and the drawer
       ├─ src/data.js            seed + store + derived selectors
       ├─ src/agent.js           assistant configuration
       └─ src/views/<name>.js    render(ctx) -> Node, one per screen
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
| `src/main.js` | Shell markup, sidebar nav with the open-alert count, topbar, route table, drawer helper, keyboard shortcuts, "About this demo" modal, reset action, assistant mount |
| `src/data.js` | Resource blueprint, alerts, users, uptime strips, cost history, seed, store, selectors |
| `src/agent.js` | 15 intents and 4 fallbacks for Stackview Insight, all reading `store.state` |
| `src/views/overview.js` | Stat row, spend bars, environment meters, provider tiles, waste table, alert list, access hygiene, activity timeline |
| `src/views/resources.js` | Filter bar, sortable inventory table, CSV export, detail drawer with utilisation meters and the resource actions |
| `src/views/cost.js` | Four tabs — service, environment, team, idle and waste — plus the cleanup plan and its export |
| `src/views/access.js` | Account table, filter chips, detail drawer, MFA and role actions, offboarding checklist |
| `src/views/alerts.js` | Severity and status filters, queue, inline actions, bulk acknowledge, timeline drawer |
| `src/views/uptime.js` | Status strips, error budget, day drawer, planned maintenance reclassification |
| `src/views/reports.js` | Review notes from live state, six CSV downloads, generated review records |
| `lib/ui.js` | `h/qs/qsa/on/esc`, formatting, `seeded/pick/between`, `createStore`, `router`, `toast`, `modal`, `confirmDialog`, `downloadCSV`, `barChart`, `meter`, `icon/ICONS` |
| `lib/assistant.js` | Intent routing, word-by-word streaming, launcher panel, docked panel |

`lib/ui.js`, `lib/assistant.js` and `assets/app.css` are copies of the shared product kit and are
kept unmodified so the app can be dropped into its own repository unchanged.

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
| <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> | Open or close Stackview Insight |
| <kbd>Alt</kbd> <kbd>1</kbd>…<kbd>7</kbd> | Jump to Overview, Alerts, Uptime, Resources, Cost, Access, Reports |
| <kbd>/</kbd> | Focus the search box on the current screen |
| <kbd>Esc</kbd> | Close the drawer, the modal, the mobile sidebar or the assistant |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Open the focused table row |

Table rows are real focus targets, every icon-only button carries an `aria-label`, filter chips
report `aria-pressed`, tabs report `aria-selected`, and the focus ring is never removed.

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

Rules the stylesheet keeps: solid fills only — no gradients, no blur, no glow shadows, no emoji as
icons. Icons are inline stroke SVG using `currentColor`. Status is never signalled by colour alone;
the uptime strip carries a legend and every block has a title and an `aria-label` in words.

Layout: sidebar collapses behind a menu button under 900px, grids drop to one column under 640px,
and the page has no horizontal scroll at 390px.
