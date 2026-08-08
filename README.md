# stackview

One picture of what a business runs and what it pays for — cloud and on-prem inventory, cost and
waste, access, alerts and uptime, in a single screen set an engineer can hand to the finance team.

stackview is a self-contained demo application. No dependencies, no build step, no framework, no
backend. Open `index.html` from any static file server and the whole product is there.

**Author:** Muhammed Nasvih V — [nasvih.in](https://www.nasvih.in) · [github.com/nasvih](https://github.com/nasvih)

**Source:** https://github.com/nasvih/stackview-cloud-infrastructure-dashboard

Published so it can be read, run and evaluated. It is not open source — see [LICENSE](LICENSE)
before reusing any part of it.

---

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

The same four blocks are in the app behind the **Demo** pill in the topbar and the **About this
demo** item in the sidebar footer.

---

## The estate in the demo

Northline Group, an invented holding company with three units — Northline Traders, Kerala Coast
Foods and Jeddah Facilities Co. **55 resources** across AWS (`ap-south-1`, `me-central-1`), Azure
(`centralindia`, `uaenorth`) and two data centres (`koc-dc1` in Kochi, `jed-dc1` in Jeddah),
**14 alerts** from six monitoring sources, **15 accounts** across AWS IAM, Entra ID and an on-prem
directory, **8 tracked services** with 30 days of daily availability, and **7 months** of cost
history. Cloud spend is shown in `$`, with a `SAR` line wherever the Jeddah entity is involved.

Every name, figure and person is invented. Nothing here is a real client, a real account or a real
bill.

## Screens

| Screen | What is on it |
|---|---|
| **Overview** | Spend this month and the projected month end, resource count, open alerts, 30 day uptime; seven month spend bars; environment breakdown; provider split; top waste findings; latest alerts; access hygiene; activity feed |
| **Alerts** | Severity queue across CloudWatch, Azure Monitor, Alertmanager, Zabbix, Nagios, Veeam and more. Acknowledge, mute for 24 hours, resolve, bulk acknowledge, and a per-alert timeline you can add notes to |
| **Uptime** | One 30 day status strip per service built from solid colour blocks, error budget against the SLO, and the option to reclassify a bad day as planned maintenance so it stops eating the budget |
| **Resources** | The full inventory: type, size, environment, region, state, monthly cost, owner, tags. Search, four filters, sortable columns, CSV export, and a detail drawer with utilisation meters, tags, waste finding, runbook note, owner reassignment, stop/start and delete |
| **Cost** | By service with month-on-month change, by environment, by team, and the idle and waste finder — every finding carries a plain "why" line, a suggested action and a monthly saving, with a running total and an exportable cleanup plan |
| **Access** | Users and service accounts with role, directory, MFA state, last login and key age. Stale accounts flagged, MFA enforcement, role change, key rotation and a seven step offboarding checklist that persists |
| **Reports** | The monthly infrastructure review assembled from live state, six targeted CSV downloads, and generated reviews that freeze the current numbers and survive a reload |

## Stackview Insight

The in-app assistant reads the live store, so its answers change when you change the data. It
handles seventeen question shapes:

- what is idle right now
- what is safe to switch off
- biggest cost jump this month, and why
- which admins have no MFA
- what broke last night
- what will we spend by month end
- how many alerts are open
- what is our uptime, what is below target
- how much does prod cost, spend by environment
- which team spends the most
- which accounts are stale
- open the access review — every check in one answer
- who owns the most resources, and what has no owner
- how many resources do we have, and where
- which resources are untagged
- what is in the cleanup plan
- what are the most expensive resources

There is one way in and only one: the round launcher at the bottom right, or <kbd>⌘K</kbd> /
<kbd>Ctrl K</kbd> from anywhere. The launcher is icon only — the agent mark, a four-point spark with
a smaller trailing spark, 52px, with its name on the tooltip and on the accessible label.

Every suggestion chip the assistant can ever show — the opening four, the three it offers after
each answer, and the ones named in its fallback lines — was asked back to it in a browser and
answered from real data. None of them dead-ends on "no match".

## Run it

```bash
cd stackview
python3 -m http.server 4106
# open http://localhost:4106
```

Any static server works — `npx serve`, `php -S`, nginx. It must be served over HTTP rather than
opened as a `file://` path, because the app is built from ES modules.

## Install it

stackview is a progressive web app. Served over HTTPS (or from `localhost`), the browser offers to
install it and an **Install app** control appears in the sidebar footer; on iPhone and iPad the
control explains the Share → Add to Home Screen route instead, because Safari has no install
prompt. Installed, it opens in its own window with no browser chrome.

A service worker (`sw.js`) caches the whole shell — the page, both stylesheets, every module, the
manifest and the icons — on first visit, so a reload works with no connection at all. There is
still no network call in the application code; the demo data is generated locally either way.
`manifest.webmanifest` carries the name, the `#EAC81C` theme colour and the three icons under
`assets/icons/`. Bump `CACHE_VERSION` in `sw.js` when the file list changes.

## Deploy to GitHub Pages

1. Push this folder as the repository root.
2. Settings → Pages → Build and deployment → **Deploy from a branch**, branch `main`, folder `/`.
3. The `.nojekyll` file at the root is already there so that `/lib` and `/assets` are served.

There is nothing to build and nothing to configure. The one external request the page makes is the
Google Fonts stylesheet for Inter and JetBrains Mono.

## Structure

```
stackview/
  index.html              single page, hash routed
  manifest.webmanifest    installable app metadata
  sw.js                   service worker, caches the shell for offline use
  assets/app.css          shared product UI kit
  assets/stackview.css    app specific components
  assets/icons/           192, 512 and maskable 512 app icons
  lib/ui.js               DOM helpers, router, store, toast, modal, charts, icons
  lib/assistant.js        offline assistant engine
  lib/pwa.js              service worker registration and the install control
  src/main.js             boot: shell, nav, router, drawer, shortcuts, assistant
  src/data.js             seeded demo estate and derived helpers
  src/agent.js            Stackview Insight intents over live state
  src/views/*.js          one module per screen
  README.md  DOCS.md  LICENSE  .gitignore  .nojekyll
```

## The sidebar

**The brand yellow is the default.** A first visit renders the navigation as a solid `#EAC81C`
panel with ink text; plain white is the alternative, one click away. Everything inside it is
checked against the yellow rather than against white — the tenant line, the group headings and the
open-alert count sit at 8:1, the nav labels at 10.8:1, and the focus ring turns ink so it does not
disappear into the fill. White text on yellow never appears.

The footer controls, one click from every screen:

- **Collapse / Expand** — drops the sidebar to a 64px icon rail. Labels, group headings and the
  alert count go; every nav icon keeps its name on a tooltip and an `aria-label`. Under 900px the
  sidebar is already a drawer, so the rail control hides itself and stays out of the way.
- **White / Yellow** — switches the sidebar between the brand yellow and plain white.
- **Install app** — appears only when the browser can actually install the app.
- **Reset demo data**, **About this demo**, a link out to **nasvih.in** — the one dark control in
  the sidebar, so it reads as a deliberate way out on either tone — and **Source on GitHub**, an
  ordinary outline control beside it.

Both toggles report `aria-pressed`, and both are remembered under `stackview.prefs.v1` — a display
choice, so **Reset demo data** deliberately leaves them alone.

## Demo notes

- The dataset is generated from a fixed seed, so the numbers are the same on every fresh load.
- State lives under the `stackview.state.v1` key in local storage.
- **Reset demo data** in the sidebar footer rebuilds the estate and clears everything you changed.
- Dates are relative to the day you open it, so "last night" really is last night.

## Licence

All rights reserved. This repository is source-available: you may read it, run it locally and evaluate it, but copying, modifying, redistributing or using it in your own work needs written permission — see [LICENSE](LICENSE).
