/* Resources — one inventory across AWS, Azure and the two data centres.
   Filters, sortable table, detail drawer with utilisation meters and the
   actions an engineer would actually take on a resource. */

import { h, icon, meter, num, pct, confirmDialog, toast, downloadCSV } from '../../lib/ui.js';
import { money2, money0, PROVIDERS, ENVS } from '../data.js';

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
      h('h1', {}, 'Resources'),
      h('p', {}, 'Everything the group runs, in one list. Costs are the current month run rate for that resource, including on-prem hardware amortised over its refresh cycle.')),
    h('div', { class: 'btnrow' },
      h('button', {
        class: 'btn', type: 'button', html: `${icon('download')}<span>Export CSV</span>`,
        onclick: () => {
          const rows = [['Name', 'Provider', 'Type', 'Size', 'Environment', 'Region', 'State', 'Monthly USD', 'Owner', 'Team', 'Tagged']];
          for (const r of filtered()) rows.push([r.name, PROVIDERS[r.provider], r.kind, r.size, r.env, r.region, r.state, r.cost.toFixed(2), r.owner, r.team, r.tagged ? 'yes' : 'no']);
          downloadCSV('stackview-resources.csv', rows);
          toast('Inventory exported');
        },
      }))));

  wrap.appendChild(h('div', { class: 'banner' },
    h('span', { html: icon('eye') }),
    h('div', {}, 'This estate is invented sample data. No cloud account or data centre is connected, and any change you make here is saved in this browser only.')));

  /* ---------- filter bar ---------- */
  const search = h('div', { class: 'search' },
    h('span', { html: icon('search') }),
    h('input', {
      class: 'input', type: 'search', placeholder: 'Search name, type, region, owner, tag', 'aria-label': 'Search resources',
      oninput: (e) => { f.q = e.target.value.trim().toLowerCase(); draw(); },
    }));

  const sel = (label, key, options) => h('label', { class: 'sv-inline' },
    h('span', { class: 'label' }, label),
    h('select', {
      class: 'select select--sm', 'aria-label': label,
      onchange: (e) => { f[key] = e.target.value; draw(); },
    }, [h('option', { value: 'all' }, 'All'), ...options.map((o) => h('option', { value: o }, o))]));

  const countEl = h('div', { class: 'sv-count mono small' }, '');
  const bar = h('div', { class: 'card card--flat sv-filters' },
    search,
    sel('Provider', 'provider', Object.keys(PROVIDERS)),
    sel('Environment', 'env', ENVS),
    sel('State', 'state', [...new Set(s.resources.map((r) => r.state))].sort()),
    sel('Team', 'team', [...new Set(s.resources.map((r) => r.team))].sort()),
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

  function th(label, key, right) {
    if (!key) return h('th', { class: right ? 'right' : '' }, label);
    return h('th', { class: `sv-th ${right ? 'right' : ''}` },
      h('button', {
        class: 'sv-sort', type: 'button',
        'aria-label': `Sort by ${label}`,
        onclick: () => { if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key === 'cost' ? -1 : 1; } draw(); },
      }, label, h('span', { class: 'sv-sort__i' }, sortKey === key ? (sortDir === 1 ? '▲' : '▼') : '')));
  }

  function draw() {
    const rows = filtered();
    const total = rows.reduce((a, r) => a + r.cost, 0);
    host.innerHTML = '';
    countEl.textContent = `${num(rows.length)} of ${num(ctx.store.state.resources.length)} · ${money0(total)}/mo`;

    if (!rows.length) {
      host.appendChild(h('div', { class: 'empty' },
        h('h3', {}, 'No resources match'),
        h('p', {}, 'Clear a filter or search for something else.')));
      return;
    }

    host.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {},
          th('Resource', 'name'), th('Type', 'kind'), th('Environment', 'env'),
          th('Region', 'region'), th('State', 'state'), th('Monthly', 'cost', true),
          th('Owner', 'owner'), th('Tags'))),
        h('tbody', {}, rows.map((r) => h('tr', { class: 'sv-row', tabindex: '0', role: 'button', 'aria-label': `Open ${r.name}`,
          onclick: () => detail(r.id),
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); detail(r.id); } } },
        h('td', {},
          h('div', { class: 'sv-res' },
            h('span', { class: `sv-badge sv-badge--${r.provider}` }, PROVIDERS[r.provider]),
            h('div', { style: 'min-width:0' },
              h('div', { class: 'mono sv-res__n truncate' }, r.name),
              h('div', { class: 'small faint truncate' }, r.size)))),
        h('td', { class: 'small' }, r.kind),
        h('td', {}, h('span', { class: `sv-env sv-env--${r.env}` }, r.env)),
        h('td', { class: 'mono small' }, r.region),
        h('td', {}, h('span', { class: `pill ${STATE_PILL[r.state] || ''}` }, r.state)),
        h('td', { class: 'right mono' }, money2(r.cost)),
        h('td', { class: 'small' }, r.owner),
        h('td', {}, r.tagged
          ? h('span', { class: 'pill' }, `${Object.keys(r.tags).length} tags`)
          : h('span', { class: 'pill pill--warn' }, 'untagged'))))))));
  }

  /* ---------- detail drawer ---------- */
  function detail(id) {
    const r = ctx.store.state.resources.find((x) => x.id === id);
    if (!r) return;
    const body = h('div', { class: 'stack' });

    body.appendChild(h('div', { class: 'sv-detailhead' },
      h('span', { class: `sv-badge sv-badge--${r.provider}` }, PROVIDERS[r.provider]),
      h('span', { class: `pill ${STATE_PILL[r.state] || ''}` }, r.state),
      h('span', { class: `sv-env sv-env--${r.env}` }, r.env)));

    body.appendChild(h('div', { class: 'sv-kv sv-kv--2' },
      kv('Type', `${r.kind} · ${r.size}`),
      kv('Region', r.region),
      kv('Monthly cost', money2(r.cost)),
      kv('Service group', r.service),
      kv('Owner', r.owner),
      kv('Team', r.team),
      kv('Age', `${num(r.ageDays)} days`),
      kv('Last metric', `${r.lastSeenHrs}h ago`)));

    const u = r.util;
    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Utilisation, 30 day average')),
      util('CPU', u.cpu, u.cpu < 10 ? 'bad' : u.cpu > 85 ? 'bad' : 'ok'),
      util('Memory', u.mem, u.mem > 85 ? 'bad' : 'ok'),
      util('Disk', u.disk, u.disk > 85 ? 'bad' : 'ok'),
      h('div', { class: 'sv-util' },
        h('div', { class: 'between' }, h('span', { class: 'label' }, 'Network out'), h('span', { class: 'mono small' }, `${num(u.net)} GB`)),
        meter(Math.min(u.net, 300), 300, 'info'))));

    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Tags')),
      Object.keys(r.tags).length
        ? h('div', { class: 'sv-tags' }, Object.entries(r.tags).map(([k, v]) => h('span', { class: 'sv-tag mono' }, `${k}=${v}`)))
        : h('p', { class: 'muted small' }, 'No tags. This resource will not show up in any cost allocation report.'),
      !r.tagged ? h('div', { class: 'banner', style: 'margin-top:12px' },
        h('span', { html: icon('tag') }),
        h('div', {}, 'Missing Owner, CostCentre and ManagedBy. The tag policy marks this as unallocated spend.')) : null));

    if (r.waste) {
      body.appendChild(h('div', { class: 'card card--flat sv-waste' },
        h('div', { class: 'card__head' }, h('h3', {}, 'Waste finding'), h('span', { class: 'pill pill--amber' }, `${money2(r.waste.saving)}/mo`)),
        h('p', { class: 'small' }, r.waste.why),
        h('p', { class: 'small muted', style: 'margin-top:8px' }, h('strong', {}, 'Suggested action: '), r.waste.action),
        h('div', { class: 'btnrow', style: 'margin-top:12px' },
          h('button', {
            class: `btn btn--sm ${ctx.store.state.cleanup[r.id] === 'planned' ? 'btn--primary' : ''}`, type: 'button',
            onclick: () => {
              ctx.store.update((st) => {
                st.cleanup[r.id] = st.cleanup[r.id] === 'planned' ? undefined : 'planned';
                if (st.cleanup[r.id] === undefined) delete st.cleanup[r.id];
                st.activity.unshift({ t: new Date().toISOString(), text: `${r.name} ${st.cleanup[r.id] ? 'added to' : 'removed from'} the cleanup plan` });
              });
              toast(ctx.store.state.cleanup[r.id] ? 'Added to cleanup plan' : 'Removed from cleanup plan');
              detail(id); draw();
            },
          }, ctx.store.state.cleanup[r.id] === 'planned' ? 'In cleanup plan' : 'Add to cleanup plan'),
          h('button', {
            class: 'btn btn--sm btn--ghost', type: 'button',
            onclick: () => {
              ctx.store.update((st) => { st.cleanup[r.id] = 'dismissed'; });
              toast('Finding dismissed');
              detail(id); draw();
            },
          }, 'Dismiss finding'))));
    }

    /* notes */
    const note = h('textarea', { class: 'textarea', placeholder: 'Why this resource exists, who asked for it, when it can go…' }, r.note || '');
    note.value = r.note || '';
    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Runbook note')),
      note,
      h('div', { class: 'btnrow', style: 'margin-top:10px' },
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => {
            ctx.store.update((st) => { const t = st.resources.find((x) => x.id === id); t.note = note.value.trim(); });
            toast('Note saved', 'ok');
          },
        }, 'Save note'))));

    /* actions */
    const owners = [...new Set(ctx.store.state.resources.map((x) => x.owner))].sort();
    const ownerSel = h('select', { class: 'select', 'aria-label': 'Reassign owner' },
      owners.map((o) => h('option', { value: o, selected: o === r.owner ? true : null }, o)));
    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Actions')),
      h('div', { class: 'field' },
        h('span', { class: 'field__label' }, 'Owner'),
        h('div', { class: 'row' }, ownerSel,
          h('button', {
            class: 'btn btn--sm', type: 'button',
            onclick: () => {
              const v = ownerSel.value;
              ctx.store.update((st) => {
                const t = st.resources.find((x) => x.id === id);
                t.owner = v; if (t.tags.Owner) t.tags.Owner = v;
                st.activity.unshift({ t: new Date().toISOString(), text: `${t.name} reassigned to ${v}` });
              });
              toast('Owner updated', 'ok'); detail(id); draw();
            },
          }, 'Reassign'))),
      h('div', { class: 'btnrow', style: 'margin-top:14px' },
        stoppable(r) ? h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: async () => {
            const stopping = r.state !== 'stopped';
            if (stopping && r.env === 'prod') {
              const ok = await confirmDialog(`${r.name} is a production resource. Stopping it in this demo will show it as stopped everywhere, including uptime and cost.`, { title: 'Stop production resource', danger: true, okLabel: 'Stop it' });
              if (!ok) return;
            }
            ctx.store.update((st) => {
              const t = st.resources.find((x) => x.id === id);
              t.state = stopping ? 'stopped' : 'running';
              st.activity.unshift({ t: new Date().toISOString(), text: `${t.name} ${stopping ? 'stopped' : 'started'}` });
            });
            toast(`${r.name} ${stopping ? 'stopped' : 'started'}`); detail(id); draw();
          },
        }, r.state === 'stopped' ? 'Start resource' : 'Stop resource') : null,
        deletable(r) ? h('button', {
          class: 'btn btn--sm btn--danger', type: 'button',
          onclick: async () => {
            const ok = await confirmDialog(`Remove ${r.name} from the inventory and stop the ${money2(r.cost)} monthly charge.`, { title: 'Delete resource', danger: true, okLabel: 'Delete' });
            if (!ok) return;
            ctx.store.update((st) => {
              st.resources = st.resources.filter((x) => x.id !== id);
              delete st.cleanup[id];
              st.activity.unshift({ t: new Date().toISOString(), text: `${r.name} deleted — ${money2(r.cost)}/mo released` });
            });
            toast(`${r.name} deleted`, 'ok'); ctx.closeDrawer(); draw();
          },
        }, 'Delete resource') : null)));

    ctx.drawer(r.name, body, { sub: `${PROVIDERS[r.provider]} · ${r.kind} · ${r.region}` });
  }

  draw();
  return wrap;
}

function kv(label, value) {
  return h('div', {}, h('span', { class: 'label' }, label), h('div', { class: 'sv-kv__v' }, value));
}
function util(label, value, kind) {
  return h('div', { class: 'sv-util' },
    h('div', { class: 'between' }, h('span', { class: 'label' }, label), h('span', { class: 'mono small' }, pct(value))),
    meter(value, 100, kind));
}

export default { render };
