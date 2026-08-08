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
} from './data.js';

const SUGGESTIONS = [
  'What is idle right now?',
  'What broke last night?',
  'Which admins have no MFA?',
  'What will we spend by month end?',
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

export function buildAssistant(store) {
  const intents = [

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
          suggestions: ['What is idle right now?', 'How much do we spend on dev?', 'Add to the cleanup plan'],
        };
      },
    },

    /* 3 — biggest cost jump */
    {
      id: 'cost-jump',
      match: [/jump|spike|increase|increased|went up|why.*(up|higher)|biggest mover|month on month|month over month|rose/i],
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
        if (!planned.length) return { text: `The cleanup plan is empty. There are ${wasteItems(s).length} open findings worth ${money2(totalWaste(s))} a month — open Cost, go to the idle and waste tab and add the ones you want. ${dismissed.length ? `${dismissed.length} finding(s) are dismissed.` : ''}` };
        const sum = planned.reduce((a, r) => a + r.waste.saving, 0);
        return {
          text: `${planned.length} resource${planned.length > 1 ? 's are' : ' is'} in the cleanup plan, worth **${money2(sum)} a month** — ${money2(sum * 12)} over a year, ${sar(sum)} a month for the Jeddah books.\n\n${planned.map((r) => `- \`${r.name}\` — ${r.waste.action}. Owner ${r.owner}.`).join('\n')}${dismissed.length ? `\n\n${dismissed.length} other finding(s) were dismissed.` : ''}`,
          table: { head: ['Resource', 'Owner', 'Saving'], rows: planned.map((r) => [`\`${r.name}\``, r.owner, money2(r.waste.saving)]) },
          suggestions: ['What is idle right now?', 'What will we spend by month end?', 'What is safe to switch off?'],
        };
      },
    },

    /* 15 — most expensive things */
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
    tag: 'Demo agent · reads this workspace only',
    greeting: `I read the estate in front of you — ${store.state.resources.length} resources, ${store.state.alerts.length} alerts, ${store.state.users.length} accounts — and answer with the numbers that are on screen right now.\n\nTry one of these, or ask in your own words.`,
    suggestions: SUGGESTIONS,
    intents,
    fallbacks: [
      'I only answer from this workspace. Ask me what is idle, where the biggest cost jump came from, which admins have no MFA, or what broke last night.',
      'That one is outside the demo data. I can pull spend by environment or team, the projected month end, the alert queue, uptime against SLO, or the access review.',
      'I could not match that to anything in the estate. Try "what is safe to switch off", "which resources are untagged", or "which accounts are stale".',
      'No match in the current data. I am good for cost, waste, alerts, uptime, access and inventory questions — ask one of those and I will read the live numbers.',
    ],
    note: 'Demo agent — every answer is assembled locally from the sample estate in this app. No network calls, no model.',
    context: () => store.state,
  });
}

export { SUGGESTIONS };
