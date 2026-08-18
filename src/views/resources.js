/* Resources — one inventory across AWS, Azure and the two data centres.
   Filters, sortable table, detail drawer with utilisation meters and the
   actions an engineer would actually take on a resource. */

import { h, icon, meter, num, pct, confirmDialog, toast, downloadCSV } from '../../lib/ui.js';
import { money2, money0, PROVIDERS, ENVS } from '../data.js';
import { t, label, wasteWhy, wasteAction } from '../main.js';

const STATE_PILL = {
  running: 'pill--ok', available: 'pill--ok', degraded: 'pill--warn',
  stopped: 'pill--warn', unattached: 'pill--bad', unassociated: 'pill--bad',
};
const stoppable = (r) => ['EC2', 'VM', 'ESXi host', 'AKS', 'EKS'].includes(r.kind);
const deletable = (r) => ['unattached', 'unassociated'].includes(r.state);

export function render(ctx) {
  const s = ctx.state;
  const f = { q: '', provider: 'all', env: 'all', state: 'all', team: 'all' };
  let sortKey = 'cost';
  let sortDir = -1;

  const wrap = h('div', { class: 'stack' });

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('routes.resources.title')),
      h('p', {}, t('resources.lead'))),
    h('div', { class: 'btnrow' },
      h('button', {
        class: 'btn', type: 'button', html: `${icon('download')}<span>${t('resources.exportCsv')}</span>`,
        onclick: () => {
          /* the CSV is a schema handed to a spreadsheet, so its header and its
             cells stay in English whatever the screen is reading in */
          const rows = [['Name', 'Provider', 'Type', 'Size', 'Environment', 'Region', 'State', 'Monthly USD', 'Owner', 'Team', 'Tagged']];
          for (const r of filtered()) rows.push([r.name, PROVIDERS[r.provider], r.kind, r.size, r.env, r.region, r.state, r.cost.toFixed(2), r.owner, r.team, r.tagged ? 'yes' : 'no']);
          downloadCSV('stackview-resources.csv', rows);
          toast(t('resources.exported'));
        },
      }))));

  wrap.appendChild(h('div', { class: 'banner' },
    h('span', { html: icon('eye') }),
    h('div', {}, t('resources.banner'))));

  /* ---------- filter bar ----------
     Every option carries the raw field value and shows the looked up word,
     so the filter keeps matching the estate whatever it is being read in. */
  const search = h('div', { class: 'search' },
    h('span', { html: icon('search') }),
    h('input', {
      class: 'input', type: 'search', placeholder: t('resources.searchPlaceholder'), 'aria-label': t('resources.searchLabel'),
      oninput: (e) => { f.q = e.target.value.trim().toLowerCase(); draw(); },
    }));

  const sel = (name, key, options, show) => h('label', { class: 'sv-inline' },
    h('span', { class: 'label' }, name),
    h('select', {
      class: 'select select--sm', 'aria-label': name,
      onchange: (e) => { f[key] = e.target.value; draw(); },
    }, [h('option', { value: 'all' }, t('resources.all')),
      ...options.map((o) => h('option', { value: o }, show ? show(o) : o))]));

  const countEl = h('div', { class: 'sv-count mono small' }, '');
  const bar = h('div', { class: 'card card--flat sv-filters' },
    search,
    /* the provider option has always shown the raw key, and AWS, Azure and
       onprem read the same in both languages, so it is left alone */
    sel(t('resources.filterProvider'), 'provider', Object.keys(PROVIDERS)),
    sel(t('resources.filterEnv'), 'env', ENVS, label.env),
    sel(t('resources.filterState'), 'state', [...new Set(s.resources.map((r) => r.state))].sort(), label.state),
    sel(t('resources.filterTeam'), 'team', [...new Set(s.resources.map((r) => r.team))].sort(), label.team),
    h('div', { class: 'spacer' }),
    countEl);
  wrap.appendChild(bar);

  const host = h('div', {});
  wrap.appendChild(host);

  function filtered() {
    return ctx.store.state.resources.filter((r) => {
      if (f.provider !== 'all' && r.provider !== f.provider) return false;
      if (f.env !== 'all' && r.env !== f.env) return false;
      if (f.state !== 'all' && r.state !== f.state) return false;
      if (f.team !== 'all' && r.team !== f.team) return false;
      if (!f.q) return true;
      const hay = [r.name, r.kind, r.size, r.region, r.owner, r.team, r.env, r.state, ...Object.values(r.tags)].join(' ').toLowerCase();
      return hay.includes(f.q);
    }).sort((a, b) => {
      const va = a[sortKey]; const vb = b[sortKey];
      if (typeof va === 'number') return (va - vb) * sortDir;
      return String(va).localeCompare(String(vb)) * sortDir;
    });
  }

  function th(name, key, right) {
    if (!key) return h('th', { class: right ? 'right' : '' }, name);
    return h('th', { class: `sv-th ${right ? 'right' : ''}` },
      h('button', {
        class: 'sv-sort', type: 'button',
        'aria-label': t('resources.sortBy', { label: name }),
        onclick: () => { if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key === 'cost' ? -1 : 1; } draw(); },
      }, name, h('span', { class: 'sv-sort__i' }, sortKey === key ? (sortDir === 1 ? '▲' : '▼') : '')));
  }

  function draw() {
    const rows = filtered();
    const total = rows.reduce((a, r) => a + r.cost, 0);
    host.innerHTML = '';
    countEl.textContent = t('resources.count', {
      n: num(rows.length), total: num(ctx.store.state.resources.length), money: money0(total),
    });

    if (!rows.length) {
      host.appendChild(h('div', { class: 'empty' },
        h('h3', {}, t('resources.emptyTitle')),
        h('p', {}, t('resources.emptyBody'))));
      return;
    }

    host.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {},
          th(t('resources.thResource'), 'name'), th(t('resources.thType'), 'kind'), th(t('resources.thEnv'), 'env'),
          th(t('resources.thRegion'), 'region'), th(t('resources.thState'), 'state'), th(t('resources.thMonthly'), 'cost', true),
          th(t('resources.thOwner'), 'owner'), th(t('resources.thTags')))),
        h('tbody', {}, rows.map((r) => h('tr', { class: 'sv-row', tabindex: '0', role: 'button', 'aria-label': t('resources.openRow', { name: r.name }),
          onclick: () => detail(r.id),
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); detail(r.id); } } },
        h('td', {},
          h('div', { class: 'sv-res' },
            h('span', { class: `sv-badge sv-badge--${r.provider}` }, label.provider(r.provider)),
            h('div', { style: 'min-width:0' },
              h('div', { class: 'mono sv-res__n truncate' }, r.name),
              h('div', { class: 'small faint truncate' }, r.size)))),
        h('td', { class: 'small' }, r.kind),
        h('td', {}, h('span', { class: `sv-env sv-env--${r.env}` }, label.env(r.env))),
        h('td', { class: 'mono small' }, r.region),
        h('td', {}, h('span', { class: `pill ${STATE_PILL[r.state] || ''}` }, label.state(r.state))),
        h('td', { class: 'right mono' }, money2(r.cost)),
        h('td', { class: 'small' }, r.owner),
        h('td', {}, r.tagged
          ? h('span', { class: 'pill' }, t('resources.tagCount', { n: Object.keys(r.tags).length }))
          : h('span', { class: 'pill pill--warn' }, t('resources.untagged')))))))));
  }

  /* ---------- detail drawer ---------- */
  function detail(id) {
    const r = ctx.store.state.resources.find((x) => x.id === id);
    if (!r) return;
    const body = h('div', { class: 'stack' });

    body.appendChild(h('div', { class: 'sv-detailhead' },
      h('span', { class: `sv-badge sv-badge--${r.provider}` }, label.provider(r.provider)),
      h('span', { class: `pill ${STATE_PILL[r.state] || ''}` }, label.state(r.state)),
      h('span', { class: `sv-env sv-env--${r.env}` }, label.env(r.env))));

    body.appendChild(h('div', { class: 'sv-kv sv-kv--2' },
      kv(t('resources.kvType'), `${r.kind} · ${r.size}`),
      kv(t('resources.kvRegion'), r.region),
      kv(t('resources.kvCost'), money2(r.cost)),
      kv(t('resources.kvGroup'), label.serviceGroup(r.service)),
      kv(t('resources.kvOwner'), r.owner),
      kv(t('resources.kvTeam'), label.team(r.team)),
      kv(t('resources.kvAge'), t('resources.kvAgeVal', { n: num(r.ageDays) })),
      kv(t('resources.kvLastMetric'), t('resources.kvLastMetricVal', { n: r.lastSeenHrs }))));

    const u = r.util;
    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, t('resources.utilTitle'))),
      util(t('resources.cpu'), u.cpu, u.cpu < 10 ? 'bad' : u.cpu > 85 ? 'bad' : 'ok'),
      util(t('resources.memory'), u.mem, u.mem > 85 ? 'bad' : 'ok'),
      util(t('resources.disk'), u.disk, u.disk > 85 ? 'bad' : 'ok'),
      h('div', { class: 'sv-util' },
        h('div', { class: 'between' }, h('span', { class: 'label' }, t('resources.netOut')),
          h('span', { class: 'mono small' }, `${num(u.net)} GB`)),
        meter(Math.min(u.net, 300), 300, 'info'))));

    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, t('resources.tags'))),
      Object.keys(r.tags).length
        ? h('div', { class: 'sv-tags' }, Object.entries(r.tags).map(([k, v]) => h('span', { class: 'sv-tag mono' }, `${k}=${v}`)))
        : h('p', { class: 'muted small' }, t('resources.noTags')),
      !r.tagged ? h('div', { class: 'banner', style: 'margin-top:12px' },
        h('span', { html: icon('tag') }),
        h('div', {}, t('resources.tagBanner'))) : null));

    if (r.waste) {
      body.appendChild(h('div', { class: 'card card--flat sv-waste' },
        h('div', { class: 'card__head' }, h('h3', {}, t('resources.wasteFinding')),
          h('span', { class: 'pill pill--amber' }, t('cost.perMonth', { money: money2(r.waste.saving) }))),
        h('p', { class: 'small' }, wasteWhy(r)),
        h('p', { class: 'small muted', style: 'margin-top:8px' }, h('strong', {}, t('resources.suggestedAction')), wasteAction(r)),
        h('div', { class: 'btnrow', style: 'margin-top:12px' },
          h('button', {
            class: `btn btn--sm ${ctx.store.state.cleanup[r.id] === 'planned' ? 'btn--primary' : ''}`, type: 'button',
            onclick: () => {
              ctx.store.update((st) => {
                st.cleanup[r.id] = st.cleanup[r.id] === 'planned' ? undefined : 'planned';
                if (st.cleanup[r.id] === undefined) delete st.cleanup[r.id];
                /* the feed is stored as a key and its numbers, never as a
                   finished sentence */
                st.activity.unshift({
                  t: new Date().toISOString(),
                  k: st.cleanup[r.id] ? 'planAdded' : 'planRemoved',
                  p: { name: r.name },
                });
              });
              toast(ctx.store.state.cleanup[r.id] ? t('resources.addedToPlan') : t('resources.removedFromPlan'));
              detail(id); draw();
            },
          }, ctx.store.state.cleanup[r.id] === 'planned' ? t('resources.inPlan') : t('resources.addToPlan')),
          h('button', {
            class: 'btn btn--sm btn--ghost', type: 'button',
            onclick: () => {
              ctx.store.update((st) => { st.cleanup[r.id] = 'dismissed'; });
              toast(t('resources.dismissed'));
              detail(id); draw();
            },
          }, t('resources.dismissFinding')))));
    }

    /* notes — the reader's own words, stored and shown verbatim */
    const note = h('textarea', { class: 'textarea', placeholder: t('resources.notePlaceholder') }, r.note || '');
    note.value = r.note || '';
    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, t('resources.noteTitle'))),
      note,
      h('div', { class: 'btnrow', style: 'margin-top:10px' },
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => {
            ctx.store.update((st) => { const x = st.resources.find((y) => y.id === id); x.note = note.value.trim(); });
            toast(t('resources.noteSaved'), 'ok');
          },
        }, t('resources.saveNote')))));

    /* actions */
    const owners = [...new Set(ctx.store.state.resources.map((x) => x.owner))].sort();
    const ownerSel = h('select', { class: 'select', 'aria-label': t('resources.reassignLabel') },
      owners.map((o) => h('option', { value: o, selected: o === r.owner ? true : null }, o)));
    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, t('resources.actions'))),
      h('div', { class: 'field' },
        h('span', { class: 'field__label' }, t('resources.ownerField')),
        h('div', { class: 'row' }, ownerSel,
          h('button', {
            class: 'btn btn--sm', type: 'button',
            onclick: () => {
              const v = ownerSel.value;
              ctx.store.update((st) => {
                const x = st.resources.find((y) => y.id === id);
                x.owner = v; if (x.tags.Owner) x.tags.Owner = v;
                st.activity.unshift({ t: new Date().toISOString(), k: 'reassigned', p: { name: x.name, to: v } });
              });
              toast(t('resources.ownerUpdated'), 'ok'); detail(id); draw();
            },
          }, t('resources.reassign')))),
      h('div', { class: 'btnrow', style: 'margin-top:14px' },
        stoppable(r) ? h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: async () => {
            const stopping = r.state !== 'stopped';
            if (stopping && r.env === 'prod') {
              const ok = await confirmDialog(t('resources.stopProdBody', { name: r.name }),
                { title: t('resources.stopProdTitle'), danger: true, okLabel: t('resources.stopProdOk') });
              if (!ok) return;
            }
            ctx.store.update((st) => {
              const x = st.resources.find((y) => y.id === id);
              x.state = stopping ? 'stopped' : 'running';
              st.activity.unshift({ t: new Date().toISOString(), k: stopping ? 'stopped' : 'started', p: { name: x.name } });
            });
            toast(stopping ? t('resources.toastStopped', { name: r.name }) : t('resources.toastStarted', { name: r.name }));
            detail(id); draw();
          },
        }, r.state === 'stopped' ? t('resources.startResource') : t('resources.stopResource')) : null,
        deletable(r) ? h('button', {
          class: 'btn btn--sm btn--danger', type: 'button',
          onclick: async () => {
            const ok = await confirmDialog(t('resources.deleteBody', { name: r.name, money: money2(r.cost) }),
              { title: t('resources.deleteTitle'), danger: true, okLabel: t('resources.deleteOk') });
            if (!ok) return;
            ctx.store.update((st) => {
              st.resources = st.resources.filter((x) => x.id !== id);
              delete st.cleanup[id];
              st.activity.unshift({ t: new Date().toISOString(), k: 'deleted', p: { name: r.name, money: money2(r.cost) } });
            });
            toast(t('resources.toastDeleted', { name: r.name }), 'ok'); ctx.closeDrawer(); draw();
          },
        }, t('resources.deleteResource')) : null)));

    ctx.drawer(r.name, body, { sub: `${label.provider(r.provider)} · ${r.kind} · ${r.region}` });
  }

  draw();
  return wrap;
}

function kv(name, value) {
  return h('div', {}, h('span', { class: 'label' }, name), h('div', { class: 'sv-kv__v' }, value));
}
function util(name, value, kind) {
  return h('div', { class: 'sv-util' },
    h('div', { class: 'between' }, h('span', { class: 'label' }, name), h('span', { class: 'mono small' }, pct(value))),
    meter(value, 100, kind));
}

export default { render };
