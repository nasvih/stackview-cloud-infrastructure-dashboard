/* Overview — spend, resource count, open alerts, uptime, spend bars,
   environment breakdown, waste callout and the last things that happened. */

import { h, icon, barChart, meter, ago, pct, num } from '../../lib/ui.js';
import {
  money0, money2, sar, monthlyTotal, openAlerts, wasteItems, totalWaste,
  fleetUptime, projection, groupSum, adminsNoMfa, staleUsers, ORG,
} from '../data.js';
import { t, label, wasteWhy, alertTitle, feedText } from '../main.js';

const SEV_PILL = { critical: 'pill--bad', high: 'pill--bad', warning: 'pill--warn', info: 'pill--info' };

function stat(name, value, delta, accent) {
  return h('div', { class: `stat${accent ? ' stat--accent' : ''}` },
    h('div', { class: 'stat__label' }, name),
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
      h('h1', {}, t('overview.title', { org: s.org || ORG.name })),
      h('p', {}, t('overview.lead', { n: num(s.resources.length) }))),
    h('div', { class: 'btnrow' },
      h('a', { class: 'btn', href: '#/cost', html: `${icon('cloud')}<span>${t('overview.openCost')}</span>` }),
      h('a', { class: 'btn btn--primary', href: '#/alerts', html: `${icon('bell')}<span>${t('overview.openAlerts', { n: open.length })}</span>` }))));

  wrap.appendChild(h('div', { class: 'grid g4' },
    stat(t('overview.statSpend'), money0(proj.mtd),
      t('overview.statSpendDelta', { projected: money0(proj.projected), sar: sar(proj.projected) }), true),
    stat(t('overview.statResources'), num(s.resources.length), t('overview.statResourcesDelta', {
      running: s.resources.filter((r) => r.state === 'running').length,
      idle: s.resources.filter((r) => ['unattached', 'unassociated', 'stopped'].includes(r.state)).length,
    })),
    stat(t('overview.statAlerts'), num(open.length), crit
      ? t('overview.statAlertsDelta', { crit, ago: ago(open.map((a) => a.opened).sort()[0]) })
      : t('overview.statAlertsClear')),
    stat(t('overview.statUptime'), pct(fleetUptime(s), 3), t('overview.statUptimeDelta', { n: s.services.length }))));

  /* spend history + environment split. The month key is carried raw next to
     its translated label so the "current month" highlight keeps matching. */
  const spendCard = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('h3', {}, t('overview.monthlySpend')),
      h('span', { class: `pill ${delta >= 0 ? 'pill--warn' : 'pill--ok'}` },
        t('overview.vsPrev', { sign: delta >= 0 ? '+' : '', pct: deltaPct.toFixed(1), month: label.month(prev.label) }))),
    barChart(months.map((m) => ({ label: label.month(m.label), value: m.total, month: m.label })),
      { format: money0, muted: (x) => x.month !== thisMonth.label }),
    h('p', { class: 'small muted', style: 'margin-top:12px' },
      t('overview.spendNote', {
        prev: label.month(prev.label), prevTotal: money2(prev.total),
        cur: label.month(thisMonth.label), diff: money2(Math.abs(delta)),
        dir: delta >= 0 ? t('overview.higher') : t('overview.lower'),
      })));

  const envRows = groupSum(s.resources, 'env');
  const envTotal = envRows.reduce((a, r) => a + r.value, 0);
  const envCard = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, t('overview.byEnv'))),
    h('div', { class: 'stack' }, envRows.map((r) => h('div', {},
      h('div', { class: 'between', style: 'margin-bottom:6px' },
        h('span', { class: 'sv-envname' }, label.env(r.label)),
        h('span', { class: 'mono small' }, `${money0(r.value)} · ${pct((r.value / envTotal) * 100)}`)),
      meter(r.value, envTotal, r.label === 'prod' ? 'ok' : r.label === 'dev' ? 'bad' : '')))),
    h('p', { class: 'small muted', style: 'margin-top:14px' },
      t('overview.nonProd', {
        pct: pct((envRows.filter((r) => r.label !== 'prod').reduce((a, r) => a + r.value, 0) / envTotal) * 100),
      })));

  wrap.appendChild(h('div', { class: 'grid g-side' }, spendCard, envCard));

  /* provider split */
  const provRows = groupSum(s.resources, 'provider');
  wrap.appendChild(h('div', { class: 'grid g3' }, provRows.map((p) => {
    const rows = s.resources.filter((r) => r.provider === p.label);
    return h('div', { class: 'card card--flat sv-prov' },
      h('div', { class: 'between' },
        h('div', {},
          h('div', { class: 'label' }, label.provider(p.label)),
          h('div', { class: 'num sv-prov__v' }, money0(p.value))),
        h('span', { class: 'sv-prov__ico', html: icon(p.label === 'onprem' ? 'server' : 'cloud') })),
      h('div', { class: 'small muted', style: 'margin-top:8px' },
        t('overview.provSub', { n: rows.length, regions: [...new Set(rows.map((r) => r.region))].length })));
  })));

  /* waste + alerts + access hygiene */
  const wasteCard = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('h3', {}, t('overview.wasteTitle')),
      h('a', { class: 'btn btn--sm', href: '#/cost' }, t('overview.openFinder'))),
    h('div', { class: 'banner' },
      h('span', { html: icon('bolt') }),
      h('div', {}, h('strong', {}, t('overview.wasteBannerLead', { money: money2(savings) })),
        t('overview.wasteBannerMid'), String(waste.length),
        t('overview.wasteBannerTail', { n: waste.length, pct: pct((savings / monthlyTotal(s)) * 100, 1) }))),
    h('div', { class: 'tablewrap tablewrap--scroll', style: 'margin-top:14px' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, t('overview.thResource')), h('th', {}, t('overview.thWhy')),
          h('th', { class: 'right' }, t('overview.thSaving')))),
        h('tbody', {}, waste.slice(0, 5).map((r) => h('tr', {},
          h('td', {}, h('span', { class: 'mono' }, r.name)),
          h('td', { class: 'muted small' }, wasteWhy(r).split(' — ')[0]),
          h('td', { class: 'right mono' }, money2(r.waste.saving))))))));

  const alertCard = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('h3', {}, t('overview.latestAlerts')),
      h('a', { class: 'btn btn--sm', href: '#/alerts' }, t('overview.allAlerts'))),
    open.length
      ? h('ul', { class: 'sv-alertlist' }, open.slice(0, 5).map((a) => h('li', {},
        h('span', { class: `pill ${SEV_PILL[a.sev]}` }, label.sev(a.sev)),
        h('div', { style: 'flex:1;min-width:0' },
          h('div', { class: 'sv-alertlist__t' }, alertTitle(a)),
          h('div', { class: 'small faint mono' }, `${label.source(a.source)} · ${ago(a.opened)}`)))))
      : h('div', { class: 'empty' }, h('h3', {}, t('overview.nothingOpen')), h('p', {}, t('overview.nothingOpenBody'))));

  wrap.appendChild(h('div', { class: 'grid g2' }, wasteCard, alertCard));

  /* hygiene + activity */
  const noMfa = adminsNoMfa(s);
  const stale = staleUsers(s);
  const hygiene = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, t('overview.hygiene')),
      h('a', { class: 'btn btn--sm', href: '#/access' }, t('overview.review'))),
    h('div', { class: 'sv-kv' },
      h('div', {}, h('span', { class: 'label' }, t('overview.hygieneNoMfa')), h('div', { class: 'num' }, String(noMfa.length))),
      h('div', {}, h('span', { class: 'label' }, t('overview.hygieneStale')), h('div', { class: 'num' }, String(stale.length))),
      h('div', {}, h('span', { class: 'label' }, t('overview.hygieneKeys')), h('div', { class: 'num' }, String(s.users.filter((u) => u.keyAgeDays > 365).length))),
      h('div', {}, h('span', { class: 'label' }, t('overview.hygieneUntagged')), h('div', { class: 'num' }, String(s.resources.filter((r) => !r.tagged).length)))),
    noMfa.length ? h('p', { class: 'small muted', style: 'margin-top:12px' },
      t('overview.hygieneNote', { names: noMfa.map((u) => u.name).join(', ') })) : null);

  const activity = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, t('overview.recentActivity'))),
    h('div', { class: 'timeline' }, s.activity.slice(0, 8).map((a) => h('div', { class: 'timeline__item' },
      h('div', {}, feedText(a)),
      h('div', { class: 'small faint mono' }, ago(a.t))))));

  wrap.appendChild(h('div', { class: 'grid g2' }, hygiene, activity));
  return wrap;
}

export default { render };
