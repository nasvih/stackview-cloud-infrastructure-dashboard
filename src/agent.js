/* ============================================================
   Stackview Insight — the in-app assistant.
   It has no model behind it. Every reply is assembled here from the
   live store, so the numbers move when you change the demo data.
   ============================================================ */

import { Assistant } from '../lib/assistant.js';
import { ago, fmtDate, fmtTime, pct, num } from '../lib/ui.js';
import {
  money2, sar, monthlyTotal, openAlerts, wasteItems, totalWaste,
  staleUsers, adminsNoMfa, fleetUptime, groupSum, projection, PROVIDERS,
  ENVS, OFFBOARD_STEPS, costCentreFor,
} from './data.js';
import { t } from './main.js';

const SUGGESTIONS = [
  'What is idle right now?',
  'Acknowledge everything critical from last night',
  'Which admins have no MFA?',
  'What can you do?',
];

const hoursBetween = (iso, from, to) => {
  const d = new Date(iso);
  const h = d.getHours();
  return d >= from && d <= to && (h >= 20 || h <= 8);
};

function lastNightWindow() {
  const to = new Date(); to.setHours(9, 0, 0, 0);
  const from = new Date(to); from.setDate(from.getDate() - 1); from.setHours(19, 0, 0, 0);
  return [from, to];
}

/* ============================================================
   Doing, not just reporting.

   An answer may carry `actions`. Each one names exactly what it will
   touch; nothing is written until the reader presses the button. The
   `run()` then mutates the store, asks the shell to redraw so the change
   is visible on the screen behind the panel, and reports before → after.
   ============================================================ */

/* the engineer this demo signs changes as */
const ME = 'Aravind Menon';
const stamp = () => new Date().toISOString();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

/* quantifiers and counts in plain language */
const ALL_RE = /\b(all|every|everything|each|both|the lot|any)\b/i;
const NUMWORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function countIn(q) {
  const m = q.match(/\b(\d{1,2})\b/);
  if (m) return Number(m[1]);
  for (const [w, n] of Object.entries(NUMWORD)) if (new RegExp(`\\b${w}\\b`, 'i').test(q)) return n;
  return null;
}

/* words that must never be treated as the name of a thing */
const NOISE = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'them', 'they', 'about',
  'plan', 'cleanup', 'clean', 'stop', 'stopped', 'start', 'tag', 'tags', 'tagged', 'untagged', 'add', 'adds',
  'all', 'every', 'everything', 'each', 'please', 'resource', 'resources', 'owner', 'owners', 'ownership',
  'environment', 'account', 'accounts', 'alert', 'alerts', 'alerting', 'last', 'night', 'overnight',
  'critical', 'high', 'warning', 'info', 'make', 'set', 'can', 'you', 'what', 'which', 'who', 'idle',
  'waste', 'saving', 'savings', 'month', 'monthly', 'cost', 'spend', 'prod', 'production', 'staging',
  'dev', 'shared', 'reassign', 'assign', 'transfer', 'enforce', 'offboard', 'offboarding', 'mute',
  'acknowledge', 'severity', 'server', 'servers', 'instance', 'instances', 'thing', 'things', 'over']);

const tokensOf = (q, min) => q.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length >= min && !NOISE.has(w));

/* ---------- resolving what the reader meant ---------- */
function resourcesIn(q, s) {
  const t = q.toLowerCase();
  const exact = s.resources.filter((r) => t.includes(r.name.toLowerCase()));
  if (exact.length) return exact;
  const toks = tokensOf(q, 5);
  if (!toks.length) return [];
  return s.resources.filter((r) => toks.some((w) => r.name.toLowerCase().includes(w)));
}

function usersIn(q, s) {
  const t = q.toLowerCase();
  const full = s.users.filter((u) => t.includes(u.name.toLowerCase()) || t.includes(u.email.split('@')[0].toLowerCase()));
  if (full.length) return full;
  const toks = tokensOf(q, 4);
  const hits = s.users.filter((u) => u.name.toLowerCase().split(/\s+/).some((part) => toks.includes(part)));
  return hits;
}

function alertsIn(q, s) {
  const t = q.toLowerCase();
  const byId = s.alerts.filter((a) => t.includes(a.id.toLowerCase()));
  if (byId.length) return byId;
  const toks = tokensOf(q, 4);
  if (!toks.length) return [];
  const scored = s.alerts
    .map((a) => ({ a, n: toks.filter((w) => `${a.title} ${a.resource} ${a.service} ${a.source}`.toLowerCase().includes(w)).length }))
    .filter((x) => x.n > 0);
  if (!scored.length) return [];
  const max = Math.max(...scored.map((x) => x.n));
  return scored.filter((x) => x.n === max).map((x) => x.a);
}

/* a person named after "to" — "reassign X to Rohit Varma" */
function personAfterTo(q, s) {
  const m = q.match(/\bto\s+([a-z][a-z\s.'-]{2,40})$/i) || q.match(/\bto\s+([a-z][a-z\s.'-]{2,40}?)(?:\s+(?:for|please|and|so)\b|[.,?])/i);
  const names = [...new Set([...s.users.map((u) => u.name), ...s.resources.map((r) => r.owner)])];
  if (m) {
    const said = m[1].trim().toLowerCase();
    const hit = names.find((n) => n.toLowerCase() === said)
      || names.find((n) => said.includes(n.toLowerCase()) || n.toLowerCase().includes(said));
    if (hit) return hit;
  }
  const t = q.toLowerCase();
  const direct = names.filter((n) => t.includes(n.toLowerCase()));
  return direct.length === 1 ? direct[0] : null;
}

const refuse = (text, suggestions) => ({ text, meta: 'nothing was changed', suggestions });
const listOf = (rows) => rows.join('\n');

/* how much unallocated spend the untagged resources carry */
const unallocated = (s) => s.resources.filter((r) => !r.tagged).reduce((a, r) => a + r.cost, 0);
const mfaPct = (s) => (s.users.filter((u) => u.mfa).length / s.users.length) * 100;

/* ---------- the worked examples, shared with the About modal ---------- */
/* The six things the assistant can change. The `ask` line is the sentence a
   reader types at it, so it stays in Latin; the title, the description and
   the screen it lands on are read from the dictionary. It is a function
   rather than a constant because the language is only known at call time. */
export const ACTION_HELP = () => [
  { key: 'alerts', ask: 'Acknowledge everything critical from last night' },
  { key: 'plan', ask: 'Add the top three idle resources to the cleanup plan' },
  { key: 'stop', ask: 'Stop nl-dev-sandbox-01' },
  { key: 'reassign', ask: 'Reassign nl-analytics-pg to Rohit Varma' },
  { key: 'account', ask: 'Enforce MFA on Divya Pillai' },
  { key: 'tag', ask: 'Tag every untagged resource with its owner' },
].map((a) => ({
  ask: a.ask,
  title: t(`agent.actions.${a.key}.title`),
  does: t(`agent.actions.${a.key}.does`),
  screen: t(`agent.actions.${a.key}.screen`),
}));


export function buildAssistant(store, opts = {}) {
  const refresh = typeof opts.refresh === 'function' ? opts.refresh : () => {};
  /* every write goes through here: mutate, persist, redraw the screen behind */
  const apply = (fn) => { store.update(fn); refresh(); };

  const intents = [

    /* ============================================================
       ACTION INTENTS — these do things. Nothing is written until the
       reader presses the button the answer offers.
       ============================================================ */

    /* A1 — acknowledge, mute or unmute alerts */
    {
      id: 'act-alert',
      match: [/\b(acknowledge|ack|mute|silence|snooze|unmute)\b/i, 'acknowledge everything', 'last night', 'critical'],
      trace: 'matched your wording against the open alert queue',
      answer: (q, s) => {
        const unmute = /\bunmute\b/i.test(q);
        const mute = !unmute && /\b(mute|silence|snooze)\b/i.test(q) && !/\backnowledge\b/i.test(q);
        const verb = unmute ? 'unmute' : mute ? 'mute' : 'acknowledge';
        const pool = s.alerts.filter((a) => (unmute ? a.status === 'muted' : mute ? a.status === 'open' || a.status === 'acked' : a.status === 'open'));

        const wantAll = ALL_RE.test(q);
        const critOnly = /\bcritical\b/i.test(q);
        const nightOnly = /\b(last night|overnight|tonight|this morning|since last night)\b/i.test(q);
        const [from, to] = lastNightWindow();

        let picked = alertsIn(q, s).filter((a) => pool.includes(a));
        let named = picked.length > 0;
        if (!named) {
          if (critOnly || nightOnly || wantAll) {
            picked = pool.slice();
            if (critOnly) picked = picked.filter((a) => a.sev === 'critical');
            if (nightOnly) picked = picked.filter((a) => hoursBetween(a.opened, from, to));
          } else picked = [];
        }

        if (named && picked.length > 1 && !wantAll) {
          return refuse(`I can ${verb} one of these, but your wording matches ${picked.length} alerts and I will not guess:\n\n${listOf(picked.map((a) => `- \`${a.id}\` — ${a.title}`))}\n\nName the id, or say "${verb} all of them".`,
            picked.slice(0, 3).map((a) => `${verb === 'acknowledge' ? 'Acknowledge' : verb === 'mute' ? 'Mute' : 'Unmute'} ${a.id}`));
        }
        if (!picked.length) {
          const open = openAlerts(s);
          return refuse(`I could not tell which alert you meant, so nothing has been touched. ${open.length ? `${plural(open.length, 'alert')} are open, ${open.filter((a) => a.sev === 'critical').length} of them critical.` : 'The queue is clear — nothing is open.'}\n\nTry an id like \`${(open[0] || s.alerts[0]).id}\`, a few words from the title, or "acknowledge everything critical from last night".`,
            ['Acknowledge everything critical from last night', 'How many alerts are open?', 'What broke last night?']);
        }

        const ids = picked.map((a) => a.id);
        const scope = named ? 'you named' : critOnly && nightOnly ? 'critical, opened overnight' : critOnly ? 'critical and open' : nightOnly ? 'opened overnight' : 'open';
        const doIt = (mode) => () => {
          const before = openAlerts(store.state).length;
          const beforeCrit = openAlerts(store.state).filter((a) => a.sev === 'critical').length;
          const touched = [];
          apply((st) => {
            const t = stamp();
            for (const a of st.alerts) {
              if (!ids.includes(a.id)) continue;
              if (mode === 'acknowledge' && a.status !== 'open') continue;
              if (mode === 'mute' && (a.status === 'muted' || a.status === 'resolved')) continue;
              if (mode === 'unmute' && a.status !== 'muted') continue;
              const was = a.status;
              if (mode === 'acknowledge') { a.status = 'acked'; a.ackBy = ME; a.ackAt = t; }
              if (mode === 'mute') a.status = 'muted';
              if (mode === 'unmute') a.status = 'open';
              a.timeline.unshift({ t, who: ME, text: `${mode === 'acknowledge' ? 'Acknowledged' : mode === 'mute' ? 'Muted for 24 hours' : 'Unmuted'} from Stackview Insight` });
              touched.push([a.id, a.sev, was, a.status]);
            }
            st.activity.unshift({ t, text: `${touched.length} alert${touched.length === 1 ? '' : 's'} ${mode === 'acknowledge' ? 'acknowledged' : mode === 'mute' ? 'muted' : 'unmuted'} from the assistant` });
          });
          const after = openAlerts(store.state).length;
          const afterCrit = openAlerts(store.state).filter((a) => a.sev === 'critical').length;
          return {
            text: `Done. ${plural(touched.length, 'alert')} ${mode === 'acknowledge' ? `acknowledged as **${ME}**` : mode === 'mute' ? 'muted for 24 hours' : 'put back in the queue'}, each with a timeline entry.\n\nOpen queue **${before} → ${after}**, critical **${beforeCrit} → ${afterCrit}**. They are on the Alerts screen now with that status.`,
            table: { head: ['Alert', 'Severity', 'Was', 'Now'], rows: touched.map((r) => [`\`${r[0]}\``, r[1], r[2], r[3]]) },
            meta: 'written to the alert queue in this browser',
            suggestions: ['How many alerts are open?', 'What is idle right now?', 'What can you do?'],
          };
        };

        return {
          text: `${picked.length === 1 ? 'One alert matches' : `${plural(picked.length, 'alert')} match`} — ${scope}:\n\n${listOf(picked.map((a) => `- \`${a.id}\` **${a.sev}** — ${a.title} (${a.source}, opened ${fmtTime(a.opened)}, ${ago(a.opened)})`))}\n\nThat is **${plural(picked.length, 'alert')}**. ${verb === 'acknowledge' ? `Acknowledging records ${ME} against each one and leaves them in the queue until they are resolved.` : verb === 'mute' ? 'Muting hides them from the open queue for 24 hours and keeps the history.' : 'Unmuting puts them back in the open queue.'} Nothing has changed yet.`,
          meta: `${picked.length} of ${s.alerts.length} alerts selected · no change made yet`,
          /* no chips while a decision is on the table: they push the buttons out of view */
          suggestions: [],
          actions: verb === 'acknowledge'
            ? [{ label: `Acknowledge ${plural(picked.length, 'alert')}`, doingLabel: 'Acknowledging…', run: doIt('acknowledge') },
              { label: 'Mute for 24 hours instead', doingLabel: 'Muting…', run: doIt('mute') }]
            : [{ label: `${verb === 'mute' ? 'Mute' : 'Unmute'} ${plural(picked.length, 'alert')}`, doingLabel: 'Working…', run: doIt(verb) }],
        };
      },
    },

    /* A2 — add idle resources to the cleanup plan */
    {
      id: 'act-plan',
      match: [
        /\b(add|put|push|include|pick up)\b[^?]*\b(clean.?up|plan)\b/i,
        /\b(clean.?up|savings)\s+plan\b[^?]*\b(add|top|everything|all)\b/i,
        'add to the cleanup plan',
      ],
      trace: 'read the idle and waste findings and your cleanup plan',
      answer: (q, s) => {
        const open = wasteItems(s).filter((r) => s.cleanup[r.id] !== 'planned');
        if (!open.length) {
          return refuse(`Everything the finder has flagged is already in the cleanup plan — ${money2(wasteItems(s).reduce((a, r) => a + r.waste.saving, 0))} a month across ${plural(wasteItems(s).length, 'finding')}. There is nothing left to add.`,
            ['What is in the cleanup plan?', 'What is idle right now?']);
        }
        const named = resourcesIn(q, s).filter((r) => open.includes(r));
        const wantAll = ALL_RE.test(q);
        const n = countIn(q);
        let picked;
        if (named.length) picked = named;
        else if (wantAll) picked = open;
        else if (n) picked = open.slice(0, n);
        else picked = open.slice(0, 3);

        const bad = resourcesIn(q, s).filter((r) => !r.waste);
        if (named.length === 0 && bad.length === 1) {
          return refuse(`\`${bad[0].name}\` has no idle or waste finding against it, so there is nothing to add to the cleanup plan. It runs at ${money2(bad[0].cost)} a month with CPU at ${pct(bad[0].util.cpu)}.\n\nThe plan only takes findings from the waste finder.`,
            ['What is idle right now?', 'Add the top three idle resources to the cleanup plan']);
        }

        const sum = picked.reduce((a, r) => a + r.waste.saving, 0);
        const ids = picked.map((r) => r.id);
        const run = (list) => () => {
          const beforeItems = store.state.resources.filter((r) => store.state.cleanup[r.id] === 'planned');
          const before = beforeItems.reduce((a, r) => a + r.waste.saving, 0);
          apply((st) => {
            const t = stamp();
            for (const id of list) st.cleanup[id] = 'planned';
            st.activity.unshift({ t, text: `${list.length} finding${list.length === 1 ? '' : 's'} added to the cleanup plan from the assistant` });
          });
          const afterItems = store.state.resources.filter((r) => store.state.cleanup[r.id] === 'planned');
          const after = afterItems.reduce((a, r) => a + r.waste.saving, 0);
          const rows = store.state.resources.filter((r) => list.includes(r.id));
          return {
            text: `Added. The cleanup plan goes from ${beforeItems.length} to **${afterItems.length}** items and from ${money2(before)} to **${money2(after)}** a month — ${money2(after * 12)} over a year, ${sar(after)} a month.\n\nIt is on Cost → Idle and waste now, and the plan exports as CSV from there.`,
            table: { head: ['Resource', 'Action', 'Saving'], rows: rows.map((r) => [`\`${r.name}\``, r.waste.action, money2(r.waste.saving)]) },
            meta: 'written to the cleanup plan in this browser',
            suggestions: ['What is in the cleanup plan?', 'What will we spend by month end?', 'What can you do?'],
          };
        };

        return {
          text: `${picked.length === 1 ? 'One finding' : `${plural(picked.length, 'finding')}`} to pick up, worth **${money2(sum)} a month** together:\n\n${listOf(picked.map((r) => `- \`${r.name}\` — ${money2(r.waste.saving)}/mo, ${r.env}, owner ${r.owner}. ${r.waste.action}.`))}\n\nAdding them changes the plan, not the estate — nothing is switched off. ${open.length > picked.length ? `${plural(open.length - picked.length, 'other finding')} would stay in the finder.` : ''}`,
          meta: `${picked.length} of ${open.length} open findings selected · no change made yet`,
          /* no chips while a decision is on the table: they push the buttons out of view */
          suggestions: [],
          actions: [
            { label: `Add ${plural(picked.length, 'resource')} — ${money2(sum)}/mo`, doingLabel: 'Adding…', run: run(ids) },
            open.length > picked.length
              ? { label: `Add all ${open.length} findings — ${money2(open.reduce((a, r) => a + r.waste.saving, 0))}/mo`, doingLabel: 'Adding…', run: run(open.map((r) => r.id)) }
              : null,
          ].filter(Boolean),
        };
      },
    },

    /* A3 — stop (or start) a named resource */
    {
      id: 'act-stop',
      match: [
        /\b(stop|shut ?down|shutdown|power (?:off|down)|switch off|turn off|deallocate|start|restart)\s+(?:the\s+)?[a-z][a-z0-9-]{3,}/i,
        'stop it', 'switch it off',
      ],
      trace: 'looked the resource up in the inventory and checked what it backs',
      answer: (q, s) => {
        const hits = resourcesIn(q, s);
        const starting = /\b(start|restart|bring .*back|power on|switch on|turn on)\b/i.test(q) && !/\b(stop|shut|power off|power down|switch off|turn off|deallocate)\b/i.test(q);
        if (!hits.length) {
          const cands = s.resources.filter((r) => r.env !== 'prod' && r.state === 'running' && r.util.cpu < 12).sort((a, b) => b.cost - a.cost).slice(0, 4);
          return refuse(`I will not stop something I had to guess at, so nothing has been touched. Name the resource and I will do it.\n\nThe non-production resources sitting nearly idle right now:\n\n${listOf(cands.map((r) => `- \`${r.name}\` — ${r.env}, CPU ${pct(r.util.cpu)}, ${money2(r.cost)}/mo, owner ${r.owner}`))}`,
            cands.slice(0, 3).map((r) => `Stop ${r.name}`));
        }
        if (hits.length > 1) {
          return refuse(`That matches ${plural(hits.length, 'resource')} and stopping the wrong one is not a small mistake, so I have left them alone:\n\n${listOf(hits.slice(0, 6).map((r) => `- \`${r.name}\` — ${r.kind}, ${r.env}, ${money2(r.cost)}/mo`))}\n\nGive me the full name.`,
            hits.slice(0, 3).map((r) => `Stop ${r.name}`));
        }

        const r = hits[0];
        const id = r.id;
        const isProd = r.env === 'prod';
        const backs = s.services.filter((x) => x.resource === r.name);
        if (starting || r.state === 'stopped') {
          if (r.state !== 'stopped') {
            return refuse(`\`${r.name}\` is already ${r.state}, so there is nothing to start. It runs at ${money2(r.cost)} a month in ${r.env}.`,
              ['What is idle right now?', 'What is safe to switch off?']);
          }
          return {
            text: `\`${r.name}\` is **stopped** — ${r.kind} ${r.size} in ${r.env}, owner ${r.owner}, ${money2(r.cost)} a month.\n\nStarting it puts it back to running and it starts drawing again.`,
            meta: 'one resource selected · no change made yet',
            /* no chips while a decision is on the table: they push the buttons out of view */
            suggestions: [],
            actions: [{
              label: `Start ${r.name}`,
              doingLabel: 'Starting…',
              run: () => {
                apply((st) => {
                  const t = st.resources.find((x) => x.id === id);
                  t.state = t.kind === 'RDS' || t.kind === 'Azure SQL' ? 'available' : 'running';
                  st.activity.unshift({ t: stamp(), text: `${t.name} started from the assistant` });
                });
                const now = store.state.resources.find((x) => x.id === id);
                return {
                  text: `\`${now.name}\` is **stopped → ${now.state}**. It is drawing ${money2(now.cost)} a month again. The Resources screen shows the new state.`,
                  meta: 'written to the inventory in this browser',
                };
              },
            }],
          };
        }

        return {
          text: `\`${r.name}\` — ${r.kind} ${r.size}, **${r.env}**, ${r.region}, owner ${r.owner}, **${money2(r.cost)} a month**. CPU has averaged ${pct(r.util.cpu)} over 30 days.\n\n${isProd
            ? `This is **production**. ${backs.length ? `It backs ${backs.map((b) => `**${b.name}**`).join(' and ')}, so stopping it will show as downtime on Uptime.` : 'Stopping it changes the state everywhere in this demo, including uptime and the alert queue.'} Stop it only inside a change window.`
            : `It is non-production${backs.length ? `, though it backs ${backs.map((b) => b.name).join(' and ')} on the uptime board` : ' and nothing tracked on the uptime board depends on it'}.`}\n\nStopping keeps the resource in the inventory; the ${money2(r.cost)} stops accruing while it is stopped and only leaves the run rate when it is deleted.`,
          meta: 'one resource selected · no change made yet',
          /* no chips while a decision is on the table: they push the buttons out of view */
          suggestions: [],
          actions: [{
            label: isProd ? `Stop ${r.name} — this is PRODUCTION` : `Stop ${r.name}`,
            doingLabel: 'Stopping…',
            run: () => {
              const before = store.state.resources.find((x) => x.id === id).state;
              apply((st) => {
                const t = st.resources.find((x) => x.id === id);
                t.state = 'stopped';
                st.activity.unshift({ t: stamp(), text: `${t.name} stopped from the assistant${t.env === 'prod' ? ' (production)' : ''}` });
              });
              const now = store.state.resources.find((x) => x.id === id);
              return {
                text: `\`${now.name}\` is **${before} → stopped**${isProd ? ', and it is a production resource — the change is on the record in Recent activity' : ''}.\n\n${money2(now.cost)} a month stops accruing while it stays stopped. Run rate on the Cost screen still lists it at ${money2(monthlyTotal(store.state))} total until it is deleted.`,
                table: { head: ['Resource', 'Environment', 'Was', 'Now', 'Monthly'], rows: [[`\`${now.name}\``, now.env, before, now.state, money2(now.cost)]] },
                meta: 'written to the inventory in this browser',
                actions: now.waste && store.state.cleanup[id] !== 'planned' ? [{
                  label: `Add it to the cleanup plan too — ${money2(now.waste.saving)}/mo`,
                  doingLabel: 'Adding…',
                  run: () => {
                    apply((st) => { st.cleanup[id] = 'planned'; st.activity.unshift({ t: stamp(), text: `${now.name} added to the cleanup plan from the assistant` }); });
                    const planned = store.state.resources.filter((x) => store.state.cleanup[x.id] === 'planned');
                    return { text: `In the plan. It now holds ${plural(planned.length, 'resource')} worth **${money2(planned.reduce((a, x) => a + x.waste.saving, 0))} a month**.`, meta: 'written to the cleanup plan' };
                  },
                }] : null,
                suggestions: ['What is idle right now?', 'What is in the cleanup plan?'],
              };
            },
          }],
        };
      },
    },

    /* A4 — reassign the owner of a resource */
    {
      id: 'act-owner',
      match: [
        /\b(reassign|re-assign|hand over|hand it to|transfer)\b/i,
        /\b(change|set|update|move)\b[^?]*\bowner\b/i,
        /\bowner\b[^?]*\bto\b/i,
      ],
      trace: 'read the inventory owners and the account directory',
      answer: (q, s) => {
        const hits = resourcesIn(q, s);
        const to = personAfterTo(q, s);
        if (!hits.length) {
          return refuse(`I need the resource by name before I move its owner — nothing has been touched. Say something like "reassign nl-analytics-pg to Rohit Varma".${to ? ` I did read **${to}** as the new owner.` : ''}`,
            ['Who owns the most resources?', 'Which resources are untagged?']);
        }
        if (hits.length > 1) {
          return refuse(`That matches ${plural(hits.length, 'resource')}, so I have not moved anything:\n\n${listOf(hits.slice(0, 6).map((r) => `- \`${r.name}\` — owner ${r.owner}, ${money2(r.cost)}/mo`))}\n\nName one of them.`,
            hits.slice(0, 2).map((r) => `Reassign ${r.name} to ${to || 'Rohit Varma'}`));
        }
        const r = hits[0];
        if (!to) {
          const owners = [...new Set(s.resources.map((x) => x.owner))].sort();
          return refuse(`\`${r.name}\` is owned by **${r.owner}** today. I did not catch who it should go to, so nothing has changed.\n\nThe people who own resources in this estate: ${owners.join(', ')}.`,
            owners.filter((o) => o !== r.owner).slice(0, 3).map((o) => `Reassign ${r.name} to ${o}`));
        }
        if (to === r.owner) {
          return refuse(`\`${r.name}\` is already owned by **${to}**, so there is nothing to change.`, ['Who owns the most resources?']);
        }
        const id = r.id;
        const user = s.users.find((u) => u.name === to);
        return {
          text: `\`${r.name}\` — ${r.kind} in ${r.env}, ${money2(r.cost)} a month — is owned by **${r.owner}** and would move to **${to}**${user ? ` (${user.role}, ${user.team}${user.status === 'stale' ? ', account is stale' : ''})` : ''}.\n\nThat moves ${money2(r.cost)} a month of ownership between them, and rewrites the Owner tag${r.tags.Owner ? '' : ' — this resource has no Owner tag today, so one will be added'}. Nothing has changed yet.`,
          meta: 'one resource selected · no change made yet',
          /* no chips while a decision is on the table: they push the buttons out of view */
          suggestions: [],
          actions: [{
            label: `Reassign ${r.name} to ${to}`,
            doingLabel: 'Reassigning…',
            run: () => {
              const st0 = store.state;
              const cur = st0.resources.find((x) => x.id === id);
              const wasOwner = cur.owner;
              const beforeFrom = st0.resources.filter((x) => x.owner === wasOwner).reduce((a, x) => a + x.cost, 0);
              const beforeTo = st0.resources.filter((x) => x.owner === to).reduce((a, x) => a + x.cost, 0);
              apply((st) => {
                const t = st.resources.find((x) => x.id === id);
                t.owner = to;
                t.tags.Owner = to;
                st.activity.unshift({ t: stamp(), text: `${t.name} reassigned from ${wasOwner} to ${to} by the assistant` });
              });
              const st1 = store.state;
              const afterFrom = st1.resources.filter((x) => x.owner === wasOwner).reduce((a, x) => a + x.cost, 0);
              const afterTo = st1.resources.filter((x) => x.owner === to).reduce((a, x) => a + x.cost, 0);
              return {
                text: `Owner **${wasOwner} → ${to}** on \`${cur.name}\`, and the Owner tag with it.\n\n${money2(cur.cost)} a month moved across. It shows on the Resources row and in Cost → By team straight away.`,
                table: {
                  head: ['Owner', 'Monthly before', 'Monthly after'],
                  rows: [[wasOwner, money2(beforeFrom), money2(afterFrom)], [to, money2(beforeTo), money2(afterTo)]],
                },
                meta: 'written to the inventory in this browser',
                suggestions: ['Who owns the most resources?', 'Which resources are untagged?'],
              };
            },
          }],
        };
      },
    },

    /* A5 — enforce MFA, or open an offboarding checklist */
    {
      id: 'act-access',
      match: [
        /\b(enforce|require|turn on|switch on|enable|add)\b[^?]*\bmfa\b/i,
        /\bmfa\b[^?]*\b(on|for)\b\s+[a-z]/i,
        /\b(start|begin|open|kick off)\b[^?]*\boffboard/i,
        /\boffboard(ing)?\b\s+[a-z]/i,
      ],
      trace: 'read every account across the three directories',
      answer: (q, s) => {
        const offboard = /\boffboard/i.test(q);
        const named = usersIn(q, s);
        const wantAll = ALL_RE.test(q);

        if (offboard) {
          if (!named.length) {
            const stale = staleUsers(s);
            return refuse(`Offboarding is per person and I will not start one on a guess. Name the account.\n\n${stale.length ? `The stale accounts, which are the usual candidates:\n\n${listOf(stale.map((u) => `- **${u.name}** — ${u.role}, last signed in ${ago(u.lastLogin)}`))}` : 'No account is stale right now.'}`,
              stale.slice(0, 3).map((u) => `Start offboarding for ${u.name}`));
          }
          if (named.length > 1) {
            return refuse(`That matches ${plural(named.length, 'account')} — ${named.map((u) => u.name).join(', ')}. Name one and I will open the checklist.`,
              named.slice(0, 3).map((u) => `Start offboarding for ${u.name}`));
          }
          const u = named[0];
          if (u.offboarding) {
            return refuse(`**${u.name}** is already being offboarded — ${u.offboarding.done.filter(Boolean).length} of ${OFFBOARD_STEPS.length} steps done. Open Access to tick the rest.`,
              ['Which accounts are stale?', 'Which admins have no MFA?']);
          }
          const owned = s.resources.filter((r) => r.owner === u.name);
          const id = u.id;
          return {
            text: `**${u.name}** — ${u.role} in ${u.directory}, ${u.team}, last signed in ${ago(u.lastLogin)}${u.mfa ? '' : ', no second factor'}. ${owned.length ? `They own ${plural(owned.length, 'resource')} worth ${money2(owned.reduce((a, r) => a + r.cost, 0))} a month, which will need reassigning as part of the checklist.` : 'They own no resources.'}\n\nStarting offboarding opens the ${OFFBOARD_STEPS.length} step checklist against the account. Nothing is deleted and no access is cut in this demo.`,
            meta: 'one account selected · no change made yet',
            /* no chips while a decision is on the table: they push the buttons out of view */
            suggestions: [],
            actions: [{
              label: `Start offboarding for ${u.name}`,
              doingLabel: 'Opening the checklist…',
              run: () => {
                apply((st) => {
                  const t = st.users.find((x) => x.id === id);
                  t.offboarding = { started: stamp(), done: OFFBOARD_STEPS.map(() => false) };
                  st.activity.unshift({ t: stamp(), text: `Offboarding started for ${t.name} from the assistant` });
                });
                const open = store.state.users.filter((x) => x.offboarding);
                return {
                  text: `Checklist open for **${u.name}** — **0 of ${OFFBOARD_STEPS.length}** steps done. It is on the Access screen under the Offboarding filter, and ${plural(open.length, 'checklist')} ${open.length === 1 ? 'is' : 'are'} now in progress.\n\nFirst step: ${OFFBOARD_STEPS[0].toLowerCase()}.`,
                  table: { head: ['Step', 'State'], rows: OFFBOARD_STEPS.map((stp) => [stp, 'to do']) },
                  meta: 'written to the account in this browser',
                  suggestions: ['Which accounts are stale?', 'Who owns the most resources?'],
                };
              },
            }],
          };
        }

        /* MFA */
        let picked = named.filter((u) => !u.mfa);
        const noMfa = s.users.filter((u) => !u.mfa);
        if (!named.length && wantAll) picked = /\badmin|elevated|power\b/i.test(q) ? adminsNoMfa(s) : noMfa;
        if (named.length && !picked.length) {
          return refuse(`**${named.map((u) => u.name).join(', ')}** already ${named.length === 1 ? 'has' : 'have'} a second factor on. MFA coverage across the ${s.users.length} accounts is ${pct(mfaPct(s))}.`,
            ['Which admins have no MFA?', 'Which accounts are stale?']);
        }
        if (named.length > 1 && !wantAll) {
          return refuse(`That matches ${plural(named.length, 'account')} — ${named.map((u) => u.name).join(', ')}. Name one, or say "enforce MFA on everyone without it".`,
            named.slice(0, 3).map((u) => `Enforce MFA on ${u.name}`));
        }
        if (!picked.length) {
          if (!noMfa.length) return refuse(`Every account already has a second factor — coverage is ${pct(mfaPct(s))}. Nothing to do.`, ['Open the access review']);
          return refuse(`I could not tell whose account you meant, so nothing has changed. ${plural(noMfa.length, 'account')} have no second factor: ${noMfa.map((u) => u.name).join(', ')}.\n\nName one, or say "enforce MFA on every account without it".`,
            [...noMfa.slice(0, 2).map((u) => `Enforce MFA on ${u.name}`), 'Enforce MFA on every account without it']);
        }

        const ids = picked.map((u) => u.id);
        const elevated = picked.filter((u) => u.role === 'Admin' || u.role === 'Power user');
        return {
          text: `${picked.length === 1 ? 'One account' : plural(picked.length, 'account')} to fix:\n\n${listOf(picked.map((u) => `- **${u.name}** — ${u.role} in ${u.directory}, last signed in ${ago(u.lastLogin)}${u.keyAgeDays > 365 ? `, access key ${num(u.keyAgeDays)} days old` : ''}`))}\n\n${elevated.length ? `${picked.length === 1 ? 'That is an elevated role' : `${plural(elevated.length, 'of them holds', 'of them hold')} an elevated role`}, which is the first line of the access review. ` : ''}Coverage across the ${s.users.length} accounts is ${pct(mfaPct(s))} today. Nothing has changed yet.`,
          meta: `${picked.length} of ${s.users.length} accounts selected · no change made yet`,
          /* no chips while a decision is on the table: they push the buttons out of view */
          suggestions: [],
          actions: [{
            label: `Enforce MFA on ${picked.length === 1 ? picked[0].name : plural(picked.length, 'account')}`,
            doingLabel: 'Enforcing…',
            run: () => {
              const before = mfaPct(store.state);
              const beforeBad = adminsNoMfa(store.state).length;
              const touched = [];
              apply((st) => {
                for (const u of st.users) {
                  if (!ids.includes(u.id) || u.mfa) continue;
                  u.mfa = true;
                  touched.push([u.name, u.role, 'off', 'on']);
                }
                st.activity.unshift({ t: stamp(), text: `MFA enforced on ${touched.length} account${touched.length === 1 ? '' : 's'} from the assistant` });
              });
              const after = mfaPct(store.state);
              const afterBad = adminsNoMfa(store.state).length;
              return {
                text: `MFA is on for ${plural(touched.length, 'account')}. Coverage **${pct(before)} → ${pct(after)}**, elevated accounts without a second factor **${beforeBad} → ${afterBad}**.\n\nThe Access screen and the overview hygiene card show it now.`,
                table: { head: ['Account', 'Role', 'MFA was', 'MFA now'], rows: touched },
                meta: 'written to the account directory in this browser',
                suggestions: ['Open the access review', 'Which accounts are stale?'],
              };
            },
          }],
        };
      },
    },

    /* A6 — put tags on the resources that carry none */
    {
      id: 'act-tag',
      match: [
        /\b(tag|label)\s+(every|all|each|the|it|them|untagged|[a-z][a-z0-9-]{3,})/i,
        /\b(apply|add|set|put)\b[^?]*\b(owner|cost ?cent(re|er)|environment)\s+tags?\b/i,
        /\btags?\b[^?]*\b(untagged|unallocated)\b/i,
      ],
      trace: 'checked every resource against the tag policy',
      answer: (q, s) => {
        const untagged = s.resources.filter((r) => !r.tagged);
        const named = resourcesIn(q, s);
        const wantAll = ALL_RE.test(q) || /\buntagged\b/i.test(q);
        const envMode = /\benvironment\b/i.test(q) && !/\bowner\b/i.test(q);

        let picked = named.length ? named : wantAll ? untagged : [];
        if (!picked.length) {
          if (!untagged.length) return refuse('Every resource already carries Owner, CostCentre and ManagedBy. Nothing is landing in unallocated spend.', ['Which team spends the most?']);
          return refuse(`I did not catch which resources to tag, so nothing has changed. ${plural(untagged.length, 'resource')} carry no Owner, CostCentre or ManagedBy, worth **${money2(unallocated(s))} a month** of unallocated spend:\n\n${listOf(untagged.map((r) => `- \`${r.name}\` — ${r.kind} in ${r.env}, ${money2(r.cost)}/mo`))}\n\nSay "tag every untagged resource with its owner", or name one.`,
            ['Tag every untagged resource with its owner', 'Which resources are untagged?']);
        }

        /* explicit values: "with owner Rohit Varma", "with environment dev" */
        const person = personAfterTo(q, s) || (q.match(/\bowner\s+([a-z][a-z\s.'-]{2,40}?)(?:$|[.,?])/i)
          ? [...new Set(s.users.map((u) => u.name))].find((n) => q.toLowerCase().includes(n.toLowerCase())) : null);
        const envSaid = (q.match(/\benvironment\s+(?:to\s+|as\s+)?([a-z]+)/i) || [])[1];
        const env = envSaid && ENVS.includes(envSaid.toLowerCase()) ? envSaid.toLowerCase() : null;
        if (envMode && envSaid && !env) {
          return refuse(`\`${envSaid}\` is not one of the environments in this estate — they are ${ENVS.join(', ')}. Nothing has been tagged.`,
            ['Which resources are untagged?', 'How much do we spend on dev?']);
        }

        const ids = picked.map((r) => r.id);
        const what = envMode
          ? `the Environment tag${env ? ` set to \`${env}\`` : ' set from the environment each one is already in'}`
          : `Owner${person ? ` set to **${person}**` : ' taken from the resource owner'}, CostCentre and ManagedBy`;
        const sum = picked.reduce((a, r) => a + r.cost, 0);
        const willAllocate = !envMode ? picked.filter((r) => !r.tagged) : [];

        return {
          text: `${picked.length === 1 ? 'One resource' : plural(picked.length, 'resource')} to tag with ${what}:\n\n${listOf(picked.slice(0, 8).map((r) => `- \`${r.name}\` — ${r.kind} in ${r.env}, ${money2(r.cost)}/mo, owner ${r.owner}${r.tagged ? '' : ', **untagged**'}`))}${picked.length > 8 ? `\n- …and ${picked.length - 8} more` : ''}\n\n${willAllocate.length
            ? `That takes **${money2(willAllocate.reduce((a, r) => a + r.cost, 0))} a month** out of unallocated spend, which sits at ${money2(unallocated(s))} today.`
            : 'These already carry the required trio, so this only rewrites the tag values.'} Nothing has changed yet.`,
          meta: `${picked.length} of ${s.resources.length} resources selected · no change made yet`,
          /* no chips while a decision is on the table: they push the buttons out of view */
          suggestions: [],
          actions: [{
            label: envMode
              ? `Tag ${plural(picked.length, 'resource')} with ${env || 'their environment'}`
              : `Tag ${plural(picked.length, 'resource')}${willAllocate.length ? ` — ${money2(willAllocate.reduce((a, r) => a + r.cost, 0))}/mo allocated` : ''}`,
            doingLabel: 'Tagging…',
            run: () => {
              const beforeUntagged = store.state.resources.filter((r) => !r.tagged).length;
              const beforeUnalloc = unallocated(store.state);
              const touched = [];
              apply((st) => {
                for (const r of st.resources) {
                  if (!ids.includes(r.id)) continue;
                  if (envMode) {
                    const value = env || r.env;
                    const was = r.tags.Environment || '—';
                    r.tags.Environment = value;
                    if (env) r.env = env;
                    touched.push([`\`${r.name}\``, 'Environment', was, value]);
                  } else {
                    const owner = person || r.owner;
                    const was = r.tags.Owner || 'none';
                    r.owner = owner;
                    r.tags.Owner = owner;
                    r.tags.CostCentre = r.tags.CostCentre || costCentreFor(r.team);
                    r.tags.ManagedBy = r.tags.ManagedBy || (r.provider === 'onprem' ? 'manual' : 'terraform');
                    r.tagged = true;
                    touched.push([`\`${r.name}\``, 'Owner', was, owner]);
                  }
                }
                st.activity.unshift({ t: stamp(), text: `${touched.length} resource${touched.length === 1 ? '' : 's'} tagged from the assistant` });
              });
              const afterUntagged = store.state.resources.filter((r) => !r.tagged).length;
              const afterUnalloc = unallocated(store.state);
              return {
                text: `Tagged ${plural(touched.length, 'resource')}.\n\nUntagged resources **${beforeUntagged} → ${afterUntagged}**, unallocated spend **${money2(beforeUnalloc)} → ${money2(afterUnalloc)}** a month. The Resources table shows the tag count on each row, and Cost → By team stops carrying them as unallocated.`,
                table: { head: ['Resource', 'Tag', 'Was', 'Now'], rows: touched.slice(0, 10) },
                meta: 'written to the inventory in this browser',
                suggestions: ['Which resources are untagged?', 'Which team spends the most?', 'What can you do?'],
              };
            },
          }],
        };
      },
    },

    /* A7 — what can you do */
    {
      id: 'capabilities',
      match: [/what can you do|what are you able|what can i ask|capabilit|\bhelp\b|what do you do|can you actually/i, 'what can you do'],
      trace: 'listed the intents and the actions wired to this workspace',
      answer: (q, s) => ({
        text: `I read this estate — ${num(s.resources.length)} resources, ${s.alerts.length} alerts, ${s.users.length} accounts — and I can **change it**, not only describe it. Every change is shown to you first and only lands when you press the button.\n\n${listOf(ACTION_HELP().map((a) => `- **${a.title}** — ask "${a.ask}". It ${a.does.split('. ')[0]}. Lands on ${a.screen}.`))}\n\nFor reading, ask me about spend by environment or team, the projected month end, the biggest cost jump, uptime against SLO, what broke last night, the access review, ownership, tagging, or the most expensive resources.`,
        table: { head: ['Ask me', 'What happens'], rows: ACTION_HELP().map((a) => [a.ask, `${a.title} · ${a.screen}`]) },
        meta: `${ACTION_HELP().length} actions available · nothing runs without a press`,
        suggestions: ['Acknowledge everything critical from last night', 'Add the top three idle resources to the cleanup plan', 'Stop nl-dev-sandbox-01', 'Tag every untagged resource with its owner'],
      }),
    },


    /* 1 — idle and waste */
    {
      id: 'idle',
      match: [/idle|waste|wasting|unused|orphan|detached|unattached|burning money/i, 'what is idle'],
      trace: 'scanned 30 days of utilisation on every resource',
      answer: (q, s) => {
        const items = wasteItems(s);
        if (!items.length) return { text: 'Nothing is flagged as idle. Every finding has been dismissed or the resource has gone. Reset the demo data from the sidebar to bring the findings back.' };
        const top = items.slice(0, 6);
        return {
          text: `**${money2(totalWaste(s))} a month** is sitting in ${items.length} idle, detached or oversized resources — ${pct((totalWaste(s) / monthlyTotal(s)) * 100, 1)} of the run rate, ${sar(totalWaste(s))}.\n\nThe six worth doing first:\n\n${top.map((r) => `- \`${r.name}\` (${r.env}, ${r.owner}) — ${money2(r.waste.saving)}/mo. ${r.waste.why}`).join('\n')}`,
          table: { head: ['Resource', 'Action', 'Saving'], rows: top.map((r) => [`\`${r.name}\``, r.waste.action, money2(r.waste.saving)]) },
          suggestions: ['What is safe to switch off?', 'What is in the cleanup plan?', 'Biggest cost jump this month'],
        };
      },
    },

    /* 2 — safe to switch off */
    {
      id: 'safe-off',
      match: [/safe|switch off|turn off|shut ?down|power down|stop|decommission|switch it off/i],
      trace: 'checked environment, tags and 30 day utilisation',
      answer: (q, s) => {
        const safe = s.resources.filter((r) => r.env !== 'prod' && r.util.cpu < 12 && r.state !== 'stopped' && r.cost > 5);
        const detached = s.resources.filter((r) => ['unattached', 'unassociated'].includes(r.state));
        const sum = [...safe, ...detached].reduce((a, r) => a + r.cost, 0);
        return {
          text: `Nothing in production can go without a change window, so this list is non-production and detached only. Together it is **${money2(sum)} a month**.\n\nSafe with a schedule, not a delete — they are still someone's environment:\n\n${safe.map((r) => `- \`${r.name}\` — ${r.env}, CPU ${pct(r.util.cpu)}, ${money2(r.cost)}/mo, owner ${r.owner}`).join('\n')}\n\nSafe to delete after a snapshot — nothing is attached to them:\n\n${detached.map((r) => `- \`${r.name}\` — ${r.state} ${r.kind}, ${money2(r.cost)}/mo`).join('\n')}`,
          meta: `checked ${s.resources.length} resources, ${safe.length + detached.length} candidates`,
          suggestions: ['What is idle right now?', 'How much do we spend on dev?', 'What is in the cleanup plan?'],
        };
      },
    },

    /* 3 — biggest cost jump */
    {
      id: 'cost-jump',
      match: [/jump|spike|increase|increased|went up|why.*(up|higher)|biggest mover|month on month|month over month|rose/i, 'cost', 'bill'],
      trace: 'compared this month against last month by service group',
      answer: (q, s) => {
        const cur = s.months[s.months.length - 1];
        const prev = s.months[s.months.length - 2];
        const movers = Object.keys(cur.byService).map((k) => ({ k, delta: cur.byService[k] - (prev.byService[k] || 0), now: cur.byService[k], before: prev.byService[k] || 0 }))
          .sort((a, b) => b.delta - a.delta);
        const top = movers[0];
        return {
          text: `The bill moved from **${money2(prev.total)}** in ${prev.label} to **${money2(cur.total)}** now, ${money2(Math.abs(cur.total - prev.total))} ${cur.total >= prev.total ? 'up' : 'down'}.\n\nThe jump is **${top.k}**, up ${money2(top.delta)} (${pct(top.before ? (top.delta / top.before) * 100 : 0, 1)}). ${top.k === 'Kubernetes' ? 'eks-prod-ng-general went from three to four m6i.2xlarge nodes on the 6th and the extra node has not come back out.' : 'Look at the resources in that group for a size change or a new deployment.'}`,
          table: { head: ['Service', prev.label, cur.label, 'Change'], rows: movers.slice(0, 5).map((m) => [m.k, money2(m.before), money2(m.now), `${m.delta >= 0 ? '+' : ''}${money2(m.delta)}`]) },
          suggestions: ['What will we spend by month end?', 'How much do we spend on dev?', 'What is idle right now?'],
        };
      },
    },

    /* 4 — admins without MFA */
    {
      id: 'mfa',
      match: [/mfa|2fa|two factor|second factor|multi.?factor|admin.*(without|no)|without mfa/i],
      trace: 'read every account in AWS IAM, Entra ID and the on-prem directory',
      answer: (q, s) => {
        const bad = adminsNoMfa(s);
        const anyNoMfa = s.users.filter((u) => !u.mfa);
        if (!bad.length) return { text: `Every Admin and Power user has a second factor. ${anyNoMfa.length} lower privileged account(s) still do not: ${anyNoMfa.map((u) => u.name).join(', ') || 'none'}.` };
        return {
          text: `**${bad.length} elevated account${bad.length > 1 ? 's have' : ' has'} no second factor.** That is the first line of the access review.\n\n${bad.map((u) => `- **${u.name}** — ${u.role} in ${u.directory}, last signed in ${u.lastLoginDays < 1 ? 'today' : ago(u.lastLogin)}${u.keyAgeDays > 365 ? `, access key ${num(u.keyAgeDays)} days old` : ''}`).join('\n')}\n\nAcross all ${s.users.length} accounts, MFA coverage is ${pct((s.users.filter((u) => u.mfa).length / s.users.length) * 100)}.`,
          table: { head: ['Account', 'Role', 'Directory', 'Last login'], rows: bad.map((u) => [u.name, u.role, u.directory, u.lastLoginDays < 1 ? 'today' : `${Math.round(u.lastLoginDays)}d ago`]) },
          suggestions: ['Which accounts are stale?', 'Who owns the most resources?', 'Open the access review'],
        };
      },
    },

    /* 5 — what broke last night */
    {
      id: 'last-night',
      match: [/last night|overnight|broke|went down|outage|incident|what happened|page|paged/i],
      trace: 'read the alert queue and the uptime probes for the overnight window',
      answer: (q, s) => {
        const [from, to] = lastNightWindow();
        const night = s.alerts.filter((a) => hoursBetween(a.opened, from, to)).sort((a, b) => a.opened.localeCompare(b.opened));
        const dips = [];
        for (const svc of s.services) {
          for (const d of svc.days.slice(-2)) if (d.status !== 'up') dips.push(`${svc.name} lost ${d.mins} minutes on ${fmtDate(d.day, { day: '2-digit', month: 'short' })}`);
        }
        if (!night.length) return { text: `Nothing opened between ${fmtTime(from)} and ${fmtTime(to)}. The oldest thing still open is ${s.alerts.filter((a) => a.status === 'open').length ? `\`${openAlerts(s)[0].id}\` — ${openAlerts(s)[0].title}` : 'nothing, the queue is clear'}.` };
        return {
          text: `${night.length} alerts opened overnight, ${night.filter((a) => a.sev === 'critical').length} of them critical.\n\n${night.map((a) => `- **${fmtTime(a.opened)}** ${a.sev} — ${a.title}. ${a.detail}`).join('\n')}\n\nOn the uptime side: ${dips.length ? dips.join('; ') + '.' : 'no probe failures in the last two days.'}`,
          table: { head: ['Time', 'Severity', 'Alert', 'Status'], rows: night.map((a) => [fmtTime(a.opened), a.sev, a.title.slice(0, 44), a.status]) },
          suggestions: ['How many alerts are open?', 'What is our uptime?', 'Which service is below target?'],
        };
      },
    },

    /* 6 — projection */
    {
      id: 'projection',
      match: [/project|forecast|month end|end of month|run rate|how much will|expect to spend|budget/i],
      trace: 'took the current run rate against the days left in the month',
      answer: (q, s) => {
        const p = projection(s);
        const prev = s.months[s.months.length - 2];
        const diff = p.projected - prev.total;
        return {
          text: `Day ${p.day} of ${p.daysInMonth}. Spend so far is **${money2(p.mtd)}** and at the current run rate the month lands at **${money2(p.projected)}** (${sar(p.projected)}).\n\nThat is ${money2(Math.abs(diff))} ${diff >= 0 ? 'above' : 'below'} ${prev.label}. If the ${wasteItems(s).length} open waste findings were cleared today the projection would drop to ${money2(p.projected - totalWaste(s))}.`,
          table: {
            head: ['Line', 'Amount'],
            rows: [
              ['Month to date', money2(p.mtd)],
              ['Projected month end', money2(p.projected)],
              [`Last month (${prev.label})`, money2(prev.total)],
              ['Waste still on the bill', money2(totalWaste(s))],
            ],
          },
          suggestions: ['Biggest cost jump this month', 'What is idle right now?', 'How much does prod cost?'],
        };
      },
    },

    /* 7 — alert queue */
    {
      id: 'alerts',
      match: [/alert|firing|queue|critical|severity|acknowledg|unack/i],
      trace: 'read the alert queue across all six monitoring sources',
      answer: (q, s) => {
        const open = openAlerts(s);
        const bySev = ['critical', 'high', 'warning', 'info'].map((k) => [k, open.filter((a) => a.sev === k).length]);
        if (!open.length) return { text: `The queue is clear — every one of the ${s.alerts.length} alerts is acknowledged, muted or resolved.` };
        return {
          text: `**${open.length} alerts open** out of ${s.alerts.length} in the queue. ${bySev.map(([k, n]) => `${n} ${k}`).join(', ')}.\n\nOldest open item is \`${open.map((a) => a).sort((a, b) => a.opened.localeCompare(b.opened))[0].id}\`, ${ago(open.map((a) => a.opened).sort()[0])}.\n\n${open.filter((a) => a.sev === 'critical').map((a) => `- **${a.title}** (${a.source}, ${ago(a.opened)})`).join('\n') || '- No critical alerts open.'}`,
          table: { head: ['Severity', 'Open'], rows: bySev.map(([k, n]) => [k, String(n)]) },
          suggestions: ['What broke last night?', 'What is our uptime?', 'Which service is below target?'],
        };
      },
    },

    /* 8 — uptime and SLO */
    {
      id: 'uptime',
      match: [/uptime|availability|slo|sla|error budget|below target|reliab/i],
      trace: 'rolled up 30 days of daily probes for every tracked service',
      answer: (q, s) => {
        const worst = [...s.services].sort((a, b) => a.uptime30 - b.uptime30);
        const breached = s.services.filter((x) => x.uptime30 < x.slo);
        return {
          text: `Fleet uptime over 30 days is **${pct(fleetUptime(s), 3)}** across ${s.services.length} services.\n\n${breached.length ? `${breached.length} service(s) below target: ${breached.map((x) => `**${x.name}** at ${pct(x.uptime30, 3)} against a ${x.slo}% target`).join(', ')}.` : 'Every service is inside its target.'}\n\nWorst three by availability:\n\n${worst.slice(0, 3).map((x) => `- ${x.name} — ${pct(x.uptime30, 3)}, ${x.days.reduce((a, d) => a + d.mins, 0)} minutes lost, backed by \`${x.resource}\``).join('\n')}`,
          table: { head: ['Service', 'Tier', 'Target', '30 day'], rows: worst.slice(0, 5).map((x) => [x.name, x.tier, `${x.slo}%`, pct(x.uptime30, 3)]) },
          suggestions: ['What broke last night?', 'How many alerts are open?', 'What is idle right now?'],
        };
      },
    },

    /* 9 — spend by environment */
    {
      id: 'by-env',
      match: [/environment|prod|production|staging|dev|non.?prod|sandbox/i],
      trace: 'grouped the run rate by the Environment tag',
      answer: (q, s) => {
        const rows = groupSum(s.resources, 'env');
        const total = rows.reduce((a, r) => a + r.value, 0);
        const nonprod = rows.filter((r) => r.label !== 'prod').reduce((a, r) => a + r.value, 0);
        return {
          text: `Run rate splits like this. Production is ${pct(((total - nonprod) / total) * 100, 1)} of the bill; everything else is **${money2(nonprod)} a month**, ${pct((nonprod / total) * 100, 1)}.\n\nThe non-production line is where the schedules belong — ${s.resources.filter((r) => r.env !== 'prod' && r.util.cpu < 12 && r.state === 'running').length} of those resources run around the clock at under 12% CPU.`,
          table: { head: ['Environment', 'Monthly', 'Share', 'Resources'], rows: rows.map((r) => [r.label, money2(r.value), pct((r.value / total) * 100, 1), String(s.resources.filter((x) => x.env === r.label).length)]) },
          suggestions: ['What is safe to switch off?', 'Which team spends the most?', 'What will we spend by month end?'],
        };
      },
    },

    /* 10 — spend by team */
    {
      id: 'by-team',
      match: [/team|department|who spends|cost cent|chargeback|allocat|owner/i],
      trace: 'grouped the run rate by the Team tag and owner',
      answer: (q, s) => {
        const rows = groupSum(s.resources, 'team');
        const total = rows.reduce((a, r) => a + r.value, 0);
        const untagged = s.resources.filter((r) => !r.tagged);
        const owners = groupSum(s.resources, 'owner');
        return {
          text: `**${rows[0].label}** carries the biggest share at ${money2(rows[0].value)} a month, ${pct((rows[0].value / total) * 100, 1)} of the bill.\n\nBy named owner the top three are ${owners.slice(0, 3).map((o) => `${o.label} (${money2(o.value)})`).join(', ')}.\n\n${untagged.length ? `${untagged.length} resources worth ${money2(untagged.reduce((a, r) => a + r.cost, 0))} carry no Owner or CostCentre tag, so they land in unallocated spend: ${untagged.map((r) => `\`${r.name}\``).join(', ')}.` : 'Every resource is tagged, so nothing lands in unallocated spend.'}`,
          table: { head: ['Team', 'Monthly', 'Share', 'Resources'], rows: rows.map((r) => [r.label, money2(r.value), pct((r.value / total) * 100, 1), String(s.resources.filter((x) => x.team === r.label).length)]) },
          suggestions: ['Which resources are untagged?', 'How much does prod cost?', 'What is idle right now?'],
        };
      },
    },

    /* 11 — stale accounts and leavers */
    {
      id: 'stale',
      match: [/stale|dormant|not logged|last login|leaver|offboard|inactive|joiner/i],
      trace: 'checked last sign in and key age for every account',
      answer: (q, s) => {
        const stale = staleUsers(s);
        const offb = s.users.filter((u) => u.offboarding);
        const oldKeys = s.users.filter((u) => u.keyAgeDays > 365);
        return {
          text: `${stale.length} account${stale.length === 1 ? '' : 's'} have not signed in for 60 days or more.\n\n${stale.map((u) => `- **${u.name}** — ${u.role}, ${u.directory}, last seen ${ago(u.lastLogin)}${u.mfa ? '' : ', no MFA'}`).join('\n') || '- None.'}\n\n${oldKeys.length ? `${oldKeys.length} access key(s) are past a year old: ${oldKeys.map((u) => `${u.name} (${num(u.keyAgeDays)}d)`).join(', ')}. Policy is 90 days.` : 'No access key is older than a year.'}${offb.length ? `\n\n${offb.length} offboarding checklist(s) are in progress: ${offb.map((u) => `${u.name} at ${u.offboarding.done.filter(Boolean).length} of 7 steps`).join(', ')}.` : ''}`,
          table: { head: ['Account', 'Role', 'Last login', 'MFA'], rows: stale.map((u) => [u.name, u.role, `${Math.round(u.lastLoginDays)}d ago`, u.mfa ? 'on' : 'off']) },
          suggestions: ['Which admins have no MFA?', 'Who owns the most resources?', 'What is in the cleanup plan?'],
        };
      },
    },

    /* 12 — inventory shape */
    {
      id: 'inventory',
      match: [/how many|inventory|estate|count|resources|region|aws|azure|on.?prem|data ?cent/i],
      trace: 'counted the inventory across both clouds and the two data centres',
      answer: (q, s) => {
        const byProv = groupSum(s.resources, 'provider');
        const regions = groupSum(s.resources, 'region');
        const states = {};
        for (const r of s.resources) states[r.state] = (states[r.state] || 0) + 1;
        return {
          text: `**${s.resources.length} resources** at **${money2(monthlyTotal(s))} a month**.\n\n${byProv.map((p) => `- ${PROVIDERS[p.label] || p.label}: ${s.resources.filter((r) => r.provider === p.label).length} resources, ${money2(p.value)}/mo`).join('\n')}\n\nSpread over ${regions.length} regions and sites, biggest being ${regions.slice(0, 3).map((r) => `\`${r.label}\` (${money2(r.value)})`).join(', ')}. States: ${Object.entries(states).map(([k, v]) => `${v} ${k}`).join(', ')}.`,
          table: { head: ['Provider', 'Resources', 'Monthly'], rows: byProv.map((p) => [PROVIDERS[p.label] || p.label, String(s.resources.filter((r) => r.provider === p.label).length), money2(p.value)]) },
          suggestions: ['Which resources are untagged?', 'How much does prod cost?', 'Which team spends the most?'],
        };
      },
    },

    /* 13 — tagging hygiene */
    {
      id: 'tags',
      match: [/untag|tagging|tag policy|unallocated|cost centre|cost center|missing tag/i, 'untagged', 'tag policy', 'tags'],
      trace: 'checked every resource against the tag policy',
      answer: (q, s) => {
        const bad = s.resources.filter((r) => !r.tagged);
        if (!bad.length) return { text: 'Every resource carries Owner, CostCentre and ManagedBy. Nothing is landing in unallocated spend.' };
        const sum = bad.reduce((a, r) => a + r.cost, 0);
        return {
          text: `${bad.length} resources are missing the required tags — Owner, CostCentre and ManagedBy — which puts **${money2(sum)} a month** into unallocated spend.\n\n${bad.map((r) => `- \`${r.name}\` — ${r.kind} in ${r.env}, ${money2(r.cost)}/mo${r.waste ? ', already flagged as waste' : ''}`).join('\n')}\n\nMost of them are the orphans: detached volumes and addresses nobody claimed when the parent was terminated.`,
          table: { head: ['Resource', 'Type', 'Environment', 'Monthly'], rows: bad.map((r) => [`\`${r.name}\``, r.kind, r.env, money2(r.cost)]) },
          suggestions: ['What is idle right now?', 'Which team spends the most?', 'What is in the cleanup plan?'],
        };
      },
    },

    /* 14 — the cleanup plan the user has built */
    {
      id: 'plan',
      match: [/cleanup plan|savings plan|what did i mark|in the plan|planned/i],
      trace: 'read the cleanup plan you have built in this session',
      answer: (q, s) => {
        const planned = s.resources.filter((r) => s.cleanup[r.id] === 'planned');
        const dismissed = s.resources.filter((r) => s.cleanup[r.id] === 'dismissed');
        if (!planned.length) {
          return {
            text: `The cleanup plan is empty. There are ${wasteItems(s).length} open findings worth ${money2(totalWaste(s))} a month — open Cost, go to the idle and waste tab and add the ones you want. ${dismissed.length ? `${dismissed.length} finding(s) are dismissed.` : ''}`,
            suggestions: ['What is idle right now?', 'What is safe to switch off?', 'Which resources are untagged?'],
          };
        }
        const sum = planned.reduce((a, r) => a + r.waste.saving, 0);
        return {
          text: `${planned.length} resource${planned.length > 1 ? 's are' : ' is'} in the cleanup plan, worth **${money2(sum)} a month** — ${money2(sum * 12)} over a year, ${sar(sum)} a month for the Jeddah books.\n\n${planned.map((r) => `- \`${r.name}\` — ${r.waste.action}. Owner ${r.owner}.`).join('\n')}${dismissed.length ? `\n\n${dismissed.length} other finding(s) were dismissed.` : ''}`,
          table: { head: ['Resource', 'Owner', 'Saving'], rows: planned.map((r) => [`\`${r.name}\``, r.owner, money2(r.waste.saving)]) },
          suggestions: ['What is idle right now?', 'What will we spend by month end?', 'What is safe to switch off?'],
        };
      },
    },

    /* 15 — the access review as a whole */
    {
      id: 'access-review',
      match: [/access review|review the access|who has access|permission|entitlement|joiner|mover|privileg|elevated/i, 'access review', 'who has access', 'access'],
      trace: 'rolled up the access review across all three directories',
      answer: (q, s) => {
        const elevated = s.users.filter((u) => u.role === 'Admin' || u.role === 'Power user');
        const noMfa = adminsNoMfa(s);
        const stale = staleUsers(s);
        const oldKeys = s.users.filter((u) => u.keyAgeDays > 365);
        const offb = s.users.filter((u) => u.offboarding);
        const dirs = groupSum(s.users.map((u) => ({ directory: u.directory, cost: 1 })), 'directory');
        const findings = noMfa.length + stale.length + oldKeys.length;
        return {
          text: `${s.users.length} accounts across ${dirs.length} directories — ${dirs.map((d) => `${d.label} ${d.value}`).join(', ')}. ${elevated.length} hold an elevated role.\n\n**${findings} thing${findings === 1 ? '' : 's'} to clear before this review closes:**\n\n- ${noMfa.length} elevated account(s) with no second factor${noMfa.length ? `: ${noMfa.map((u) => u.name).join(', ')}` : ''}\n- ${stale.length} account(s) with no sign in for 60 days or more${stale.length ? `: ${stale.map((u) => u.name).join(', ')}` : ''}\n- ${oldKeys.length} access key(s) past a year old${oldKeys.length ? `: ${oldKeys.map((u) => `${u.name} at ${num(u.keyAgeDays)} days`).join(', ')}` : ''}\n\nMFA coverage is ${pct((s.users.filter((u) => u.mfa).length / s.users.length) * 100)}. ${offb.length ? `${offb.length} offboarding checklist(s) are open: ${offb.map((u) => `${u.name} at ${u.offboarding.done.filter(Boolean).length} of 7`).join(', ')}.` : 'No offboarding is in progress.'}`,
          table: {
            head: ['Check', 'Count', 'State'],
            rows: [
              ['Elevated without MFA', String(noMfa.length), noMfa.length ? 'needs action' : 'clear'],
              ['Stale accounts', String(stale.length), stale.length ? 'needs action' : 'clear'],
              ['Keys past a year', String(oldKeys.length), oldKeys.length ? 'needs action' : 'clear'],
              ['Offboarding open', String(offb.length), offb.length ? 'in progress' : 'clear'],
            ],
          },
          suggestions: ['Which admins have no MFA?', 'Which accounts are stale?', 'Who owns the most resources?'],
        };
      },
    },

    /* 16 — ownership */
    {
      id: 'owners',
      match: [/who owns|owns the most|ownership|owner of|unowned|no owner|owns what/i, 'who owns', 'owns the most', 'ownership'],
      trace: 'grouped the inventory by owner and checked the Owner tag',
      answer: (q, s) => {
        const owners = groupSum(s.resources, 'owner');
        const counts = owners.map((o) => ({ ...o, n: s.resources.filter((r) => r.owner === o.label).length }));
        const byCount = [...counts].sort((a, b) => b.n - a.n);
        const noTag = s.resources.filter((r) => !r.tags.Owner);
        const gone = s.users.filter((u) => (u.status === 'stale' || u.status === 'disabled') && s.resources.some((r) => r.owner === u.name));
        return {
          text: `**${byCount[0].label}** owns the most — ${byCount[0].n} resources worth ${money2(byCount[0].value)} a month. By spend the biggest owner is **${owners[0].label}** at ${money2(owners[0].value)}.\n\n${noTag.length ? `${noTag.length} resources carry no Owner tag at all, worth ${money2(noTag.reduce((a, r) => a + r.cost, 0))} a month: ${noTag.map((r) => `\`${r.name}\``).join(', ')}.` : 'Every resource carries an Owner tag.'}${gone.length ? `\n\nWatch these: ${gone.map((u) => `${u.name} is ${u.status} but still owns ${s.resources.filter((r) => r.owner === u.name).length} resources`).join('; ')}.` : ''}`,
          table: { head: ['Owner', 'Resources', 'Monthly'], rows: byCount.map((o) => [o.label, String(o.n), money2(o.value)]) },
          suggestions: ['Which resources are untagged?', 'Which accounts are stale?', 'Which team spends the most?'],
        };
      },
    },

    /* 17 — most expensive things */
    {
      id: 'top-cost',
      match: [/most expensive|top.*(cost|spend|resource)|biggest resource|what costs the most|priciest/i, 'most expensive', 'costs the most', 'priciest', 'biggest line'],
      trace: 'sorted the inventory by monthly cost',
      answer: (q, s) => {
        const top = [...s.resources].sort((a, b) => b.cost - a.cost).slice(0, 8);
        const share = top.reduce((a, r) => a + r.cost, 0) / monthlyTotal(s);
        return {
          text: `The eight most expensive resources are **${pct(share * 100, 1)}** of the whole bill.\n\n${top.slice(0, 4).map((r) => `- \`${r.name}\` — ${r.kind} ${r.size}, ${r.env}, ${money2(r.cost)}/mo, owner ${r.owner}`).join('\n')}`,
          table: { head: ['Resource', 'Type', 'Env', 'Monthly'], rows: top.map((r) => [`\`${r.name}\``, r.kind, r.env, money2(r.cost)]) },
          suggestions: ['Biggest cost jump this month', 'What is idle right now?', 'How much does prod cost?'],
        };
      },
    },
  ];

  return new Assistant({
    name: 'Stackview Insight',
    initials: 'SI',
    tag: t('agent.tag'),
    greeting: t('agent.greeting', {
      resources: store.state.resources.length,
      alerts: store.state.alerts.length,
      users: store.state.users.length,
    }),
    /* the chips are the sentences the router matches, so they stay in Latin */
    suggestions: SUGGESTIONS,
    intents,
    fallbacks: t('agent.fallbacks'),
    note: t('agent.note'),
    /* the words the panel says on its own, handed over translated */
    ui: {
      openLabel: (name) => t('agent.ui.openLabel', { name }),
      fabTitle: (name) => t('agent.ui.fabTitle', { name }),
      clear: t('agent.ui.clear'),
      close: t('agent.ui.close'),
      placeholder: t('agent.ui.placeholder'),
      send: t('agent.ui.send'),
      you: t('agent.ui.you'),
      working: t('agent.ui.working'),
      done: t('agent.ui.done'),
      answerError: t('agent.ui.answerError'),
      actionError: t('agent.ui.actionError'),
      applied: t('agent.ui.applied'),
      searched: t('agent.ui.searched'),
      seconds: (sec) => t('agent.ui.seconds', { s: sec }),
    },
    context: () => store.state,
  });
}

export { SUGGESTIONS };
