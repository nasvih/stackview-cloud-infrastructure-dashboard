/* Cost — where the money goes by service, environment and team, plus the
   idle and waste finder that lists what can be switched off and why. */

import { h, icon, barChart, meter, pct, num, toast, downloadCSV } from '../../lib/ui.js';
import {
  money0, money2, sar, monthlyTotal, wasteItems, totalWaste, groupSum, projection, PROVIDERS,
} from '../data.js';

export function render(ctx) {
  const s = ctx.state;
  let tab = (ctx.query && ctx.query.get('tab')) || 'service';

  const months = s.months;
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];
  const proj = projection(s);

  /* biggest month over month mover by service */
  const movers = Object.keys(cur.byService).map((k) => ({
    label: k, now: cur.byService[k], before: prev.byService[k] || 0,
    delta: cur.byService[k] - (prev.byService[k] || 0),
  })).sort((a, b) => b.delta - a.delta);
  const top = movers[0];

  const wrap = h('div', { class: 'stack' });

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Cost'),
      h('p', {}, 'Run rate for the current month, split three ways. On-prem hardware is amortised so a data centre host can be compared with an instance.')),
    h('div', { class: 'btnrow' },
      h('button', {
        class: 'btn', type: 'button', html: `${icon('download')}<span>Export breakdown</span>`,
        onclick: () => {
          const rows = [['Month', 'Service', 'USD']];
          for (const m of months) for (const [k, v] of Object.entries(m.byService)) rows.push([`${m.label} ${m.year}`, k, v.toFixed(2)]);
          downloadCSV('stackview-cost-by-service.csv', rows);
          toast('Breakdown exported');
        },
      }))));

  wrap.appendChild(h('div', { class: 'grid g4' },
    tile('Run rate', money0(monthlyTotal(s)), `${sar(monthlyTotal(s))} at 3.75`, true),
    tile('Month to date', money0(proj.mtd), `day ${proj.day} of ${proj.daysInMonth}`),
    tile('Biggest mover', top.label, `${top.delta >= 0 ? '+' : ''}${money0(top.delta)} vs ${prev.label}`),
    tile('Idle and waste', money0(totalWaste(s)), `${wasteItems(s).length} findings open`)));

  wrap.appendChild(h('div', { class: 'banner' },
    h('span', { html: icon('eye') }),
    h('div', {}, 'These figures are invented sample data, not a real bill. Nothing is read from a cloud billing account and your cleanup plan is saved in this browser only.')));

  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    ...[['service', 'By service'], ['environment', 'By environment'], ['team', 'By team'], ['waste', 'Idle and waste']]
      .map(([k, label]) => h('button', {
        class: `tab${tab === k ? ' is-active' : ''}`, type: 'button', role: 'tab',
        'aria-selected': tab === k ? 'true' : 'false',
        onclick: () => { tab = k; paint(); },
      }, label)));
  wrap.appendChild(tabs);

  const panel = h('div', {});
  wrap.appendChild(panel);

  function paint() {
    [...tabs.children].forEach((b, i) => {
      const k = ['service', 'environment', 'team', 'waste'][i];
      b.classList.toggle('is-active', k === tab);
      b.setAttribute('aria-selected', k === tab ? 'true' : 'false');
    });
    panel.innerHTML = '';
    if (tab === 'service') panel.appendChild(byService());
    else if (tab === 'environment') panel.appendChild(byGroup('env', 'Environment'));
    else if (tab === 'team') panel.appendChild(byGroup('team', 'Team'));
    else panel.appendChild(waste());
  }

  /* ---------- by service ---------- */
  function byService() {
    const box = h('div', { class: 'stack' });
    box.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Seven month trend'),
        h('span', { class: 'pill' }, `${months[0].label} to ${cur.label}`)),
      barChart(months.map((m) => ({ label: m.label, value: m.total })), { format: money0, muted: (x) => x.label !== cur.label })));

    box.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Service group'), h('th', {}, 'Share'),
          h('th', { class: 'right' }, prev.label), h('th', { class: 'right' }, cur.label),
          h('th', { class: 'right' }, 'Change'))),
        h('tbody', {}, movers.map((m) => h('tr', {},
          h('td', {}, h('strong', {}, m.label)),
          h('td', { style: 'width:180px' }, meter(m.now, cur.total, m.label === top.label ? 'bad' : '')),
          h('td', { class: 'right mono muted' }, money2(m.before)),
          h('td', { class: 'right mono' }, money2(m.now)),
          h('td', { class: 'right' }, h('span', { class: `pill ${m.delta > 1 ? 'pill--warn' : m.delta < -1 ? 'pill--ok' : ''}` },
            `${m.delta >= 0 ? '+' : ''}${pct(m.before ? (m.delta / m.before) * 100 : 0, 1)}`)))),
        h('tr', {}, h('td', {}, h('strong', {}, 'Total')), h('td', {}),
          h('td', { class: 'right mono' }, money2(prev.total)),
          h('td', { class: 'right mono' }, h('strong', {}, money2(cur.total))),
          h('td', { class: 'right mono' }, `${cur.total - prev.total >= 0 ? '+' : ''}${money2(cur.total - prev.total)}`))))));

    box.appendChild(h('div', { class: 'banner' },
      h('span', { html: icon('chart') }),
      h('div', {}, h('strong', {}, `${top.label} is the biggest jump this month, up ${money2(top.delta)}. `),
        top.label === 'Kubernetes'
          ? 'eks-prod-ng-general went from three to four m6i.2xlarge nodes on the 6th and the extra node has stayed up since.'
          : 'Check the resources in this group for a size change or a new deployment.')));
    return box;
  }

  /* ---------- by environment / team ---------- */
  function byGroup(key, label) {
    const rows = groupSum(ctx.store.state.resources, key);
    const total = rows.reduce((a, r) => a + r.value, 0);
    const box = h('div', { class: 'stack' });
    box.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, `Run rate by ${label.toLowerCase()}`)),
      barChart(rows.map((r) => ({ label: r.label, value: r.value })), { format: money0 })));

    box.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {},
          h('th', {}, label), h('th', { class: 'right' }, 'Resources'),
          h('th', { class: 'right' }, 'Monthly'), h('th', { class: 'right' }, 'Share'),
          h('th', { class: 'right' }, 'Waste'), h('th', {}, 'Providers'))),
        h('tbody', {}, rows.map((r) => {
          const set = ctx.store.state.resources.filter((x) => x[key] === r.label);
          const w = set.filter((x) => x.waste && ctx.store.state.cleanup[x.id] !== 'dismissed').reduce((a, x) => a + x.waste.saving, 0);
          return h('tr', {},
            h('td', {}, h('strong', {}, r.label)),
            h('td', { class: 'right mono' }, num(set.length)),
            h('td', { class: 'right mono' }, money2(r.value)),
            h('td', { class: 'right mono' }, pct((r.value / total) * 100, 1)),
            h('td', { class: 'right mono' }, w ? h('span', { class: 'sv-neg' }, money2(w)) : '—'),
            h('td', { class: 'small muted' }, [...new Set(set.map((x) => PROVIDERS[x.provider]))].join(', ')));
        })))));
    return box;
  }

  /* ---------- waste finder ---------- */
  function waste() {
    const st = ctx.store.state;
    const items = wasteItems(st);
    const planned = items.filter((r) => st.cleanup[r.id] === 'planned');
    const plannedSum = planned.reduce((a, r) => a + r.waste.saving, 0);
    const dismissed = st.resources.filter((r) => r.waste && st.cleanup[r.id] === 'dismissed');
    const box = h('div', { class: 'stack' });

    box.appendChild(h('div', { class: 'card sv-savings' },
      h('div', { class: 'between' },
        h('div', {},
          h('div', { class: 'label' }, 'Total potential saving'),
          h('div', { class: 'sv-savings__v mono' }, money2(totalWaste(st))),
          h('div', { class: 'small muted' }, `${items.length} findings · ${pct((totalWaste(st) / monthlyTotal(st)) * 100, 1)} of the run rate · ${sar(totalWaste(st))} a month`)),
        h('div', { class: 'sv-savings__plan' },
          h('div', { class: 'label' }, 'In the cleanup plan'),
          h('div', { class: 'num sv-savings__pv' }, money2(plannedSum)),
          h('div', { class: 'small muted' }, `${planned.length} of ${items.length} picked up`))),
      h('div', { style: 'margin-top:14px' }, meter(plannedSum, totalWaste(st) || 1, 'ok'))));

    if (!items.length) {
      box.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'Nothing flagged'),
        h('p', {}, 'Every finding has been dismissed or the resource has gone. Reset the demo data to bring them back.')));
    }

    box.appendChild(h('div', { class: 'sv-wastelist' }, items.map((r) => {
      const isPlanned = st.cleanup[r.id] === 'planned';
      return h('article', { class: `card sv-wastecard${isPlanned ? ' is-planned' : ''}` },
        h('div', { class: 'between' },
          h('div', { style: 'min-width:0' },
            h('div', { class: 'row' },
              h('span', { class: `sv-badge sv-badge--${r.provider}` }, PROVIDERS[r.provider]),
              h('span', { class: 'mono sv-wastecard__n' }, r.name),
              h('span', { class: `sv-env sv-env--${r.env}` }, r.env)),
            h('div', { class: 'small faint mono', style: 'margin-top:4px' }, `${r.kind} · ${r.size} · ${r.region} · ${r.owner}`)),
          h('div', { class: 'sv-wastecard__save mono' }, `${money2(r.waste.saving)}/mo`)),
        h('p', { class: 'sv-why' }, r.waste.why),
        h('p', { class: 'small muted' }, h('strong', {}, 'Do this: '), r.waste.action),
        h('div', { class: 'btnrow', style: 'margin-top:12px' },
          h('button', {
            class: `btn btn--sm ${isPlanned ? 'btn--primary' : ''}`, type: 'button',
            onclick: () => {
              ctx.store.update((state) => {
                if (state.cleanup[r.id] === 'planned') delete state.cleanup[r.id];
                else state.cleanup[r.id] = 'planned';
                state.activity.unshift({ t: new Date().toISOString(), text: `${r.name} ${state.cleanup[r.id] ? 'added to' : 'removed from'} the cleanup plan` });
              });
              toast(isPlanned ? 'Removed from plan' : 'Added to cleanup plan', isPlanned ? '' : 'ok');
              paint();
            },
          }, isPlanned ? 'In cleanup plan' : 'Add to cleanup plan'),
          h('button', {
            class: 'btn btn--sm btn--ghost', type: 'button',
            onclick: () => {
              ctx.store.update((state) => { state.cleanup[r.id] = 'dismissed'; });
              toast('Finding dismissed'); paint();
            },
          }, 'Dismiss'),
          h('a', { class: 'btn btn--sm btn--ghost', href: '#/resources' }, 'Open in inventory')));
    })));

    if (dismissed.length) {
      box.appendChild(h('div', { class: 'card card--flat' },
        h('div', { class: 'between' },
          h('div', { class: 'small muted' }, `${dismissed.length} finding${dismissed.length > 1 ? 's' : ''} dismissed: ${dismissed.map((r) => r.name).join(', ')}`),
          h('button', {
            class: 'btn btn--sm', type: 'button',
            onclick: () => {
              ctx.store.update((state) => { for (const r of dismissed) delete state.cleanup[r.id]; });
              toast('Dismissed findings restored'); paint();
            },
          }, 'Restore'))));
    }

    if (planned.length) {
      box.appendChild(h('div', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, 'Cleanup plan'),
          h('button', {
            class: 'btn btn--sm', type: 'button', html: `${icon('download')}<span>Export plan</span>`,
            onclick: () => {
              const rows = [['Resource', 'Provider', 'Environment', 'Owner', 'Monthly saving USD', 'Reason', 'Action']];
              for (const r of planned) rows.push([r.name, PROVIDERS[r.provider], r.env, r.owner, r.waste.saving.toFixed(2), r.waste.why, r.waste.action]);
              rows.push(['Total', '', '', '', plannedSum.toFixed(2), '', '']);
              downloadCSV('stackview-cleanup-plan.csv', rows);
              toast('Cleanup plan exported');
            },
          })),
        h('p', { class: 'small muted' }, `Hand this list to the owners. Done in full it takes ${money2(plannedSum)} a month off the bill, ${money2(plannedSum * 12)} over a year.`)));
    }
    return box;
  }

  paint();
  return wrap;
}

function tile(label, value, delta, accent) {
  return h('div', { class: `stat${accent ? ' stat--accent' : ''}` },
    h('div', { class: 'stat__label' }, label),
    h('div', { class: 'stat__value sv-stat--fit' }, value),
    h('div', { class: 'stat__delta' }, delta));
}

export default { render };
