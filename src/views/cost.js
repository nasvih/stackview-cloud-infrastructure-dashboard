/* Cost — where the money goes by service, environment and team, plus the
   idle and waste finder that lists what can be switched off and why. */

import { h, icon, barChart, meter, pct, num, toast, downloadCSV } from '../../lib/ui.js';
import {
  money0, money2, sar, monthlyTotal, wasteItems, totalWaste, groupSum, projection, PROVIDERS,
} from '../data.js';
import { t, label, wasteWhy, wasteAction } from '../main.js';

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
      h('h1', {}, t('routes.cost.title')),
      h('p', {}, t('cost.lead'))),
    h('div', { class: 'btnrow' },
      h('button', {
        class: 'btn', type: 'button', html: `${icon('download')}<span>${t('cost.exportBreakdown')}</span>`,
        onclick: () => {
          /* the CSV is a schema handed to a spreadsheet, so its header and its
             cells stay in English whatever the screen is reading in */
          const rows = [['Month', 'Service', 'USD']];
          for (const m of months) for (const [k, v] of Object.entries(m.byService)) rows.push([`${m.label} ${m.year}`, k, v.toFixed(2)]);
          downloadCSV('stackview-cost-by-service.csv', rows);
          toast(t('cost.exportedBreakdown'));
        },
      }))));

  wrap.appendChild(h('div', { class: 'grid g4' },
    tile(t('cost.tileRunRate'), money0(monthlyTotal(s)), t('cost.tileRunRateSub', { sar: sar(monthlyTotal(s)) }), true),
    tile(t('cost.tileMtd'), money0(proj.mtd), t('cost.tileMtdSub', { day: proj.day, days: proj.daysInMonth })),
    tile(t('cost.tileMover'), label.serviceGroup(top.label),
      t('cost.tileMoverSub', { sign: top.delta >= 0 ? '+' : '', money: money0(top.delta), month: label.month(prev.label) })),
    tile(t('cost.tileWaste'), money0(totalWaste(s)), t('cost.tileWasteSub', { n: wasteItems(s).length }))));

  wrap.appendChild(h('div', { class: 'banner' },
    h('span', { html: icon('eye') }),
    h('div', {}, t('cost.banner'))));

  /* the tab keys stay raw — they are what the query string and paint() match on */
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    ...[['service', t('cost.tabService')], ['environment', t('cost.tabEnv')], ['team', t('cost.tabTeam')], ['waste', t('cost.tabWaste')]]
      .map(([k, text]) => h('button', {
        class: `tab${tab === k ? ' is-active' : ''}`, type: 'button', role: 'tab',
        'aria-selected': tab === k ? 'true' : 'false',
        onclick: () => { tab = k; paint(); },
      }, text)));
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
    else if (tab === 'environment') panel.appendChild(byGroup('env'));
    else if (tab === 'team') panel.appendChild(byGroup('team'));
    else panel.appendChild(waste());
  }

  /* ---------- by service ---------- */
  function byService() {
    const box = h('div', { class: 'stack' });
    /* the month is carried raw alongside its translated label so the
       "current month" highlight keeps comparing the real month key */
    const series = months.map((m) => ({ label: label.month(m.label), value: m.total, month: m.label }));
    box.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('cost.trend')),
        h('span', { class: 'pill' }, t('cost.trendRange', { from: label.month(months[0].label), to: label.month(cur.label) }))),
      barChart(series, { format: money0, muted: (x) => x.month !== cur.label })));

    box.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {},
          h('th', {}, t('cost.thGroup')), h('th', {}, t('cost.thShare')),
          h('th', { class: 'right' }, label.month(prev.label)), h('th', { class: 'right' }, label.month(cur.label)),
          h('th', { class: 'right' }, t('cost.thChange')))),
        h('tbody', {}, movers.map((m) => h('tr', {},
          h('td', {}, h('strong', {}, label.serviceGroup(m.label))),
          h('td', { style: 'width:180px' }, meter(m.now, cur.total, m.label === top.label ? 'bad' : '')),
          h('td', { class: 'right mono muted' }, money2(m.before)),
          h('td', { class: 'right mono' }, money2(m.now)),
          h('td', { class: 'right' }, h('span', { class: `pill ${m.delta > 1 ? 'pill--warn' : m.delta < -1 ? 'pill--ok' : ''}` },
            `${m.delta >= 0 ? '+' : ''}${pct(m.before ? (m.delta / m.before) * 100 : 0, 1)}`)))),
        h('tr', {}, h('td', {}, h('strong', {}, t('cost.thTotal'))), h('td', {}),
          h('td', { class: 'right mono' }, money2(prev.total)),
          h('td', { class: 'right mono' }, h('strong', {}, money2(cur.total))),
          h('td', { class: 'right mono' }, `${cur.total - prev.total >= 0 ? '+' : ''}${money2(cur.total - prev.total)}`))))));

    box.appendChild(h('div', { class: 'banner' },
      h('span', { html: icon('chart') }),
      h('div', {}, h('strong', {}, t('cost.jumpLead', { label: label.serviceGroup(top.label), money: money2(top.delta) })),
        /* the comparison is against the raw group name, not the shown one */
        top.label === 'Kubernetes' ? t('cost.jumpK8s') : t('cost.jumpOther'))));
    return box;
  }

  /* ---------- by environment / team ----------
     `key` is the raw field on the resource; the column header and the
     lower-case word in the card title are looked up from it. */
  function byGroup(key) {
    const head = key === 'env' ? t('cost.groupEnv') : t('cost.groupTeam');
    const lower = key === 'env' ? t('cost.groupEnvLower') : t('cost.groupTeamLower');
    const rowLabel = key === 'env' ? label.env : label.team;
    const rows = groupSum(ctx.store.state.resources, key);
    const total = rows.reduce((a, r) => a + r.value, 0);
    const box = h('div', { class: 'stack' });
    box.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('cost.runRateBy', { label: lower }))),
      barChart(rows.map((r) => ({ label: rowLabel(r.label), value: r.value })), { format: money0 })));

    box.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {},
          h('th', {}, head), h('th', { class: 'right' }, t('cost.thResources')),
          h('th', { class: 'right' }, t('cost.thMonthly')), h('th', { class: 'right' }, t('cost.thShare')),
          h('th', { class: 'right' }, t('cost.thWaste')), h('th', {}, t('cost.thProviders')))),
        h('tbody', {}, rows.map((r) => {
          const set = ctx.store.state.resources.filter((x) => x[key] === r.label);
          const w = set.filter((x) => x.waste && ctx.store.state.cleanup[x.id] !== 'dismissed').reduce((a, x) => a + x.waste.saving, 0);
          return h('tr', {},
            h('td', {}, h('strong', {}, rowLabel(r.label))),
            h('td', { class: 'right mono' }, num(set.length)),
            h('td', { class: 'right mono' }, money2(r.value)),
            h('td', { class: 'right mono' }, pct((r.value / total) * 100, 1)),
            h('td', { class: 'right mono' }, w ? h('span', { class: 'sv-neg' }, money2(w)) : '—'),
            h('td', { class: 'small muted' }, [...new Set(set.map((x) => label.provider(x.provider)))].join(', ')));
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
          h('div', { class: 'label' }, t('cost.savingTotal')),
          h('div', { class: 'sv-savings__v mono' }, money2(totalWaste(st))),
          h('div', { class: 'small muted' }, t('cost.savingSub', {
            n: items.length,
            pct: pct((totalWaste(st) / monthlyTotal(st)) * 100, 1),
            sar: sar(totalWaste(st)),
          }))),
        h('div', { class: 'sv-savings__plan' },
          h('div', { class: 'label' }, t('cost.inPlan')),
          h('div', { class: 'num sv-savings__pv' }, money2(plannedSum)),
          h('div', { class: 'small muted' }, t('cost.inPlanSub', { n: planned.length, total: items.length })))),
      h('div', { style: 'margin-top:14px' }, meter(plannedSum, totalWaste(st) || 1, 'ok'))));

    if (!items.length) {
      box.appendChild(h('div', { class: 'empty' }, h('h3', {}, t('cost.nothingFlagged')),
        h('p', {}, t('cost.nothingFlaggedBody'))));
    }

    box.appendChild(h('div', { class: 'sv-wastelist' }, items.map((r) => {
      const isPlanned = st.cleanup[r.id] === 'planned';
      return h('article', { class: `card sv-wastecard${isPlanned ? ' is-planned' : ''}` },
        h('div', { class: 'between' },
          h('div', { style: 'min-width:0' },
            h('div', { class: 'row' },
              h('span', { class: `sv-badge sv-badge--${r.provider}` }, label.provider(r.provider)),
              h('span', { class: 'mono sv-wastecard__n' }, r.name),
              h('span', { class: `sv-env sv-env--${r.env}` }, label.env(r.env))),
            h('div', { class: 'small faint mono', style: 'margin-top:4px' }, `${r.kind} · ${r.size} · ${r.region} · ${r.owner}`)),
          h('div', { class: 'sv-wastecard__save mono' }, t('cost.perMonth', { money: money2(r.waste.saving) }))),
        h('p', { class: 'sv-why' }, wasteWhy(r)),
        h('p', { class: 'small muted' }, h('strong', {}, t('cost.doThis')), wasteAction(r)),
        h('div', { class: 'btnrow', style: 'margin-top:12px' },
          h('button', {
            class: `btn btn--sm ${isPlanned ? 'btn--primary' : ''}`, type: 'button',
            onclick: () => {
              ctx.store.update((state) => {
                if (state.cleanup[r.id] === 'planned') delete state.cleanup[r.id];
                else state.cleanup[r.id] = 'planned';
                /* the feed is stored as a key and its numbers, never as a
                   finished sentence — it is read back in whichever language
                   the reader is in now */
                state.activity.unshift({
                  t: new Date().toISOString(),
                  k: state.cleanup[r.id] ? 'planAdded' : 'planRemoved',
                  p: { name: r.name },
                });
              });
              toast(isPlanned ? t('cost.removedFromPlan') : t('cost.addedToPlan'), isPlanned ? '' : 'ok');
              paint();
            },
          }, isPlanned ? t('cost.inPlanBtn') : t('cost.addToPlan')),
          h('button', {
            class: 'btn btn--sm btn--ghost', type: 'button',
            onclick: () => {
              ctx.store.update((state) => { state.cleanup[r.id] = 'dismissed'; });
              toast(t('cost.dismissed')); paint();
            },
          }, t('cost.dismiss')),
          h('a', { class: 'btn btn--sm btn--ghost', href: '#/resources' }, t('cost.openInInventory'))));
    })));

    if (dismissed.length) {
      box.appendChild(h('div', { class: 'card card--flat' },
        h('div', { class: 'between' },
          h('div', { class: 'small muted' }, t('cost.dismissedNote', {
            n: dismissed.length, names: dismissed.map((r) => r.name).join(', '),
          })),
          h('button', {
            class: 'btn btn--sm', type: 'button',
            onclick: () => {
              ctx.store.update((state) => { for (const r of dismissed) delete state.cleanup[r.id]; });
              toast(t('cost.restored')); paint();
            },
          }, t('cost.restore')))));
    }

    if (planned.length) {
      box.appendChild(h('div', { class: 'card' },
        h('div', { class: 'card__head' }, h('h3', {}, t('cost.planTitle')),
          h('button', {
            class: 'btn btn--sm', type: 'button', html: `${icon('download')}<span>${t('cost.exportPlan')}</span>`,
            onclick: () => {
              /* English column names — the file is read by a spreadsheet, not
                 by the screen. The prose comes from the dictionary. */
              const rows = [['Resource', 'Provider', 'Environment', 'Owner', 'Monthly saving USD', 'Reason', 'Action']];
              for (const r of planned) rows.push([r.name, PROVIDERS[r.provider], r.env, r.owner, r.waste.saving.toFixed(2), wasteWhy(r), wasteAction(r)]);
              rows.push(['Total', '', '', '', plannedSum.toFixed(2), '', '']);
              downloadCSV('stackview-cleanup-plan.csv', rows);
              toast(t('cost.exportedPlan'));
            },
          })),
        h('p', { class: 'small muted' }, t('cost.planNote', {
          month: money2(plannedSum), year: money2(plannedSum * 12),
        }))));
    }
    return box;
  }

  paint();
  return wrap;
}

function tile(name, value, delta, accent) {
  return h('div', { class: `stat${accent ? ' stat--accent' : ''}` },
    h('div', { class: 'stat__label' }, name),
    h('div', { class: 'stat__value sv-stat--fit' }, value),
    h('div', { class: 'stat__delta' }, delta));
}

export default { render };
