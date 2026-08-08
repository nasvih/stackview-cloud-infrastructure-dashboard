/* Overview — spend, resource count, open alerts, uptime, spend bars,
   environment breakdown, waste callout and the last things that happened. */

import { h, icon, barChart, meter, ago, pct, num } from '../../lib/ui.js';
import {
  money0, money2, sar, monthlyTotal, openAlerts, wasteItems, totalWaste,
  fleetUptime, projection, groupSum, PROVIDERS, adminsNoMfa, staleUsers,
} from '../data.js';

const SEV_PILL = { critical: 'pill--bad', high: 'pill--bad', warning: 'pill--warn', info: 'pill--info' };

function stat(label, value, delta, accent) {
  return h('div', { class: `stat${accent ? ' stat--accent' : ''}` },
    h('div', { class: 'stat__label' }, label),
    h('div', { class: 'stat__value' }, value),
    h('div', { class: 'stat__delta' }, delta));
}

export function render(ctx) {
  const s = ctx.state;
  const months = s.months;
  const thisMonth = months[months.length - 1];
  const prev = months[months.length - 2];
  const proj = projection(s);
  const delta = thisMonth.total - prev.total;
  const deltaPct = (delta / prev.total) * 100;
  const open = openAlerts(s);
  const crit = open.filter((a) => a.sev === 'critical').length;
  const waste = wasteItems(s);
  const savings = totalWaste(s);

  const wrap = h('div', { class: 'stack' });

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Northline Group estate'),
      h('p', {}, `${num(s.resources.length)} resources across AWS, Azure and two data centres. Costs are shown at the current month run rate, converted to SAR for the Jeddah entity where it matters.`)),
    h('div', { class: 'btnrow' },
      h('a', { class: 'btn', href: '#/cost' , html: `${icon('cloud')}<span>Open cost</span>` }),
      h('a', { class: 'btn btn--primary', href: '#/alerts', html: `${icon('bell')}<span>${open.length} open alerts</span>` }))));

  wrap.appendChild(h('div', { class: 'grid g4' },
    stat('Spend this month', money0(proj.mtd), `${money0(proj.projected)} projected at month end · ${sar(proj.projected)}`, true),
    stat('Resources', num(s.resources.length), `${s.resources.filter((r) => r.state === 'running').length} running · ${s.resources.filter((r) => ['unattached', 'unassociated', 'stopped'].includes(r.state)).length} idle or detached`),
    stat('Open alerts', num(open.length), crit ? `${crit} critical, oldest ${ago(open.map((a) => a.opened).sort()[0])}` : 'No critical alerts open'),
    stat('Uptime 30 days', pct(fleetUptime(s), 3), `${s.services.length} tracked services`)));

  /* spend history + environment split */
  const spendCard = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('h3', {}, 'Monthly spend'),
      h('span', { class: `pill ${delta >= 0 ? 'pill--warn' : 'pill--ok'}` }, `${delta >= 0 ? '+' : ''}${deltaPct.toFixed(1)}% vs ${prev.label}`)),
    barChart(months.map((m) => ({ label: m.label, value: m.total })), { format: money0, muted: (x) => x.label !== thisMonth.label }),
    h('p', { class: 'small muted', style: 'margin-top:12px' },
      `${prev.label} closed at ${money2(prev.total)}. ${thisMonth.label} is tracking ${money2(Math.abs(delta))} ${delta >= 0 ? 'higher' : 'lower'}.`));

  const envRows = groupSum(s.resources, 'env');
  const envTotal = envRows.reduce((a, r) => a + r.value, 0);
  const envCard = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, 'By environment')),
    h('div', { class: 'stack' }, envRows.map((r) => h('div', {},
      h('div', { class: 'between', style: 'margin-bottom:6px' },
        h('span', { class: 'sv-envname' }, r.label),
        h('span', { class: 'mono small' }, `${money0(r.value)} · ${pct((r.value / envTotal) * 100)}`)),
      meter(r.value, envTotal, r.label === 'prod' ? 'ok' : r.label === 'dev' ? 'bad' : '')))),
    h('p', { class: 'small muted', style: 'margin-top:14px' },
      `Non-production is ${pct((envRows.filter((r) => r.label !== 'prod').reduce((a, r) => a + r.value, 0) / envTotal) * 100)} of the bill.`));

  wrap.appendChild(h('div', { class: 'grid g-side' }, spendCard, envCard));

  /* provider split */
  const provRows = groupSum(s.resources, 'provider');
  wrap.appendChild(h('div', { class: 'grid g3' }, provRows.map((p) => {
    const rows = s.resources.filter((r) => r.provider === p.label);
    return h('div', { class: 'card card--flat sv-prov' },
      h('div', { class: 'between' },
        h('div', {},
          h('div', { class: 'label' }, PROVIDERS[p.label] || p.label),
          h('div', { class: 'num sv-prov__v' }, money0(p.value))),
        h('span', { class: 'sv-prov__ico', html: icon(p.label === 'onprem' ? 'server' : 'cloud') })),
      h('div', { class: 'small muted', style: 'margin-top:8px' },
        `${rows.length} resources · ${[...new Set(rows.map((r) => r.region))].length} regions`));
  })));

  /* waste + alerts + access hygiene */
  const wasteCard = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('h3', {}, 'Idle and waste'),
      h('a', { class: 'btn btn--sm', href: '#/cost' }, 'Open finder')),
    h('div', { class: 'banner' },
      h('span', { html: icon('bolt') }),
      h('div', {}, h('strong', {}, `${money2(savings)} a month`), ' is sitting in ', String(waste.length),
        ' resources that are idle, detached or oversized. That is ', pct((savings / monthlyTotal(s)) * 100, 1), ' of the run rate.')),
    h('div', { class: 'tablewrap tablewrap--scroll', style: 'margin-top:14px' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Resource'), h('th', {}, 'Why'), h('th', { class: 'right' }, 'Saving'))),
        h('tbody', {}, waste.slice(0, 5).map((r) => h('tr', {},
          h('td', {}, h('span', { class: 'mono' }, r.name)),
          h('td', { class: 'muted small' }, r.waste.why.split(' — ')[0]),
          h('td', { class: 'right mono' }, money2(r.waste.saving))))))));

  const alertCard = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('h3', {}, 'Latest alerts'),
      h('a', { class: 'btn btn--sm', href: '#/alerts' }, 'All alerts')),
    open.length
      ? h('ul', { class: 'sv-alertlist' }, open.slice(0, 5).map((a) => h('li', {},
        h('span', { class: `pill ${SEV_PILL[a.sev]}` }, a.sev),
        h('div', { style: 'flex:1;min-width:0' },
          h('div', { class: 'sv-alertlist__t' }, a.title),
          h('div', { class: 'small faint mono' }, `${a.source} · ${ago(a.opened)}`)))))
      : h('div', { class: 'empty' }, h('h3', {}, 'Nothing open'), h('p', {}, 'Every alert has been acknowledged or muted.')));

  wrap.appendChild(h('div', { class: 'grid g2' }, wasteCard, alertCard));

  /* hygiene + activity */
  const noMfa = adminsNoMfa(s);
  const stale = staleUsers(s);
  const hygiene = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Access hygiene'), h('a', { class: 'btn btn--sm', href: '#/access' }, 'Review')),
    h('div', { class: 'sv-kv' },
      h('div', {}, h('span', { class: 'label' }, 'Admins without MFA'), h('div', { class: 'num' }, String(noMfa.length))),
      h('div', {}, h('span', { class: 'label' }, 'Stale accounts'), h('div', { class: 'num' }, String(stale.length))),
      h('div', {}, h('span', { class: 'label' }, 'Keys older than a year'), h('div', { class: 'num' }, String(s.users.filter((u) => u.keyAgeDays > 365).length))),
      h('div', {}, h('span', { class: 'label' }, 'Untagged resources'), h('div', { class: 'num' }, String(s.resources.filter((r) => !r.tagged).length)))),
    noMfa.length ? h('p', { class: 'small muted', style: 'margin-top:12px' },
      `${noMfa.map((u) => u.name).join(', ')} hold elevated roles with no second factor.`) : null);

  const activity = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Recent activity')),
    h('div', { class: 'timeline' }, s.activity.slice(0, 8).map((a) => h('div', { class: 'timeline__item' },
      h('div', {}, a.text),
      h('div', { class: 'small faint mono' }, ago(a.t))))));

  wrap.appendChild(h('div', { class: 'grid g2' }, hygiene, activity));
  return wrap;
}

export default { render };
