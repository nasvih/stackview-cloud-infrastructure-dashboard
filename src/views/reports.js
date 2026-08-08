/* Reports — the monthly review an engineer has to hand to the business,
   assembled from live state and exportable as CSV. */

import { h, icon, fmtDate, fmtTime, num, pct, ago, toast, confirmDialog, downloadCSV, barChart } from '../../lib/ui.js';
import {
  money0, money2, sar, monthlyTotal, openAlerts, wasteItems, totalWaste, staleUsers,
  adminsNoMfa, fleetUptime, groupSum, projection, PROVIDERS,
} from '../data.js';

export function render(ctx) {
  const s = ctx.state;
  const months = s.months;
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];
  const proj = projection(s);
  const wrap = h('div', { class: 'stack' });

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Reports'),
      h('p', {}, `The monthly infrastructure review for ${cur.label} ${cur.year}. Generating a review freezes the current numbers so you can compare against it later; the CSV is the file you attach to the meeting invite.`)),
    h('div', { class: 'btnrow' },
      h('button', {
        class: 'btn btn--primary', type: 'button', html: `${icon('file')}<span>Generate monthly review</span>`,
        onclick: () => generate(),
      }))));

  /* ---------- headline ---------- */
  wrap.appendChild(h('div', { class: 'grid g4' },
    tile('Run rate', money0(monthlyTotal(s)), sar(monthlyTotal(s))),
    tile('vs ' + prev.label, `${cur.total - prev.total >= 0 ? '+' : ''}${money0(cur.total - prev.total)}`, pct(((cur.total - prev.total) / prev.total) * 100, 1)),
    tile('Uptime', pct(fleetUptime(s), 3), `${s.services.length} services`),
    tile('Saving available', money0(totalWaste(s)), `${wasteItems(s).length} findings`)));

  const summary = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, `Review notes — ${cur.label} ${cur.year}`)),
    h('div', { class: 'sv-notes' },
      note('Spend', `Run rate is ${money2(monthlyTotal(s))} a month, ${money2(Math.abs(cur.total - prev.total))} ${cur.total >= prev.total ? 'above' : 'below'} ${prev.label}. Month to date is ${money2(proj.mtd)} on day ${proj.day} of ${proj.daysInMonth}. The Jeddah entity share converts to ${sar(groupSum(s.resources.filter((r) => r.team === 'Facilities IT'), 'team')[0]?.value || 0)}.`),
      note('Estate', `${num(s.resources.length)} resources: ${groupSum(s.resources, 'provider').map((p) => `${p.label === 'onprem' ? 'on-prem' : PROVIDERS[p.label]} ${s.resources.filter((r) => r.provider === p.label).length}`).join(', ')}. ${s.resources.filter((r) => !r.tagged).length} are missing the required tags and land in unallocated spend.`),
      note('Waste', `${wasteItems(s).length} findings worth ${money2(totalWaste(s))} a month. ${Object.values(s.cleanup).filter((v) => v === 'planned').length} are in the cleanup plan.`),
      note('Reliability', `Fleet uptime ${pct(fleetUptime(s), 3)} over 30 days. ${s.services.filter((x) => x.uptime30 < x.slo).length} service(s) below target.`),
      note('Alerts', `${openAlerts(s).length} open, ${s.alerts.filter((a) => a.status === 'acked').length} acknowledged, ${s.alerts.filter((a) => a.status === 'resolved').length} resolved this cycle.`),
      note('Access', `${adminsNoMfa(s).length} elevated account(s) without MFA, ${staleUsers(s).length} stale account(s), ${s.users.filter((u) => u.keyAgeDays > 365).length} access key(s) past a year old.`)));

  const chart = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, 'Spend, last seven months')),
    barChart(months.map((m) => ({ label: m.label, value: m.total })), { format: money0, muted: (x) => x.label !== cur.label }),
    h('div', { class: 'hr' }),
    h('div', { class: 'card__head' }, h('h3', {}, 'Downloads')),
    h('div', { class: 'sv-dl' },
      dl('Full monthly review', 'One row per section with the headline figures', () => downloadCSV(`stackview-review-${cur.key}.csv`, reviewRows())),
      dl('Resource inventory', `${num(s.resources.length)} rows`, () => {
        const rows = [['Name', 'Provider', 'Type', 'Size', 'Environment', 'Region', 'State', 'Monthly USD', 'Owner', 'Team', 'Tagged']];
        for (const r of ctx.store.state.resources) rows.push([r.name, PROVIDERS[r.provider], r.kind, r.size, r.env, r.region, r.state, r.cost.toFixed(2), r.owner, r.team, r.tagged ? 'yes' : 'no']);
        downloadCSV('stackview-inventory.csv', rows);
      }),
      dl('Cost by service and month', `${months.length} months`, () => {
        const rows = [['Month', 'Service', 'USD']];
        for (const m of months) for (const [k, v] of Object.entries(m.byService)) rows.push([`${m.label} ${m.year}`, k, v.toFixed(2)]);
        downloadCSV('stackview-cost.csv', rows);
      }),
      dl('Idle and waste', `${wasteItems(ctx.store.state).length} findings`, () => {
        const rows = [['Resource', 'Environment', 'Owner', 'Monthly saving USD', 'Why', 'Action', 'In plan']];
        for (const r of wasteItems(ctx.store.state)) rows.push([r.name, r.env, r.owner, r.waste.saving.toFixed(2), r.waste.why, r.waste.action, ctx.store.state.cleanup[r.id] === 'planned' ? 'yes' : 'no']);
        downloadCSV('stackview-waste.csv', rows);
      }),
      dl('Access review', `${num(s.users.length)} accounts`, () => {
        const rows = [['Name', 'Email', 'Team', 'Role', 'Directory', 'MFA', 'Days since login', 'Key age days', 'Status']];
        for (const u of ctx.store.state.users) rows.push([u.name, u.email, u.team, u.role, u.directory, u.mfa ? 'yes' : 'no', u.lastLoginDays, u.keyAgeDays || '', u.status]);
        downloadCSV('stackview-access.csv', rows);
      }),
      dl('Uptime, 30 days', `${s.services.length} services`, () => {
        const rows = [['Service', 'Tier', 'Target', 'Uptime 30d', 'Minutes lost', 'Bad days']];
        for (const x of ctx.store.state.services) rows.push([x.name, x.tier, x.slo, x.uptime30, x.days.reduce((a, d) => a + d.mins, 0), x.days.filter((d) => d.status !== 'up').length]);
        downloadCSV('stackview-uptime.csv', rows);
      })));

  wrap.appendChild(h('div', { class: 'grid g-side' }, summary, chart));

  /* ---------- generated reviews ---------- */
  const listHost = h('div', {});
  wrap.appendChild(listHost);

  function reviewRows() {
    const st = ctx.store.state;
    return [
      ['Section', 'Metric', 'Value'],
      ['Spend', 'Run rate USD', monthlyTotal(st).toFixed(2)],
      ['Spend', 'Month to date USD', projection(st).mtd.toFixed(2)],
      ['Spend', `Change vs ${prev.label} USD`, (cur.total - prev.total).toFixed(2)],
      ['Spend', 'Run rate SAR', Math.round(monthlyTotal(st) * 3.75)],
      ...groupSum(st.resources, 'env').map((e) => ['Spend by environment', e.label, e.value.toFixed(2)]),
      ...groupSum(st.resources, 'team').map((e) => ['Spend by team', e.label, e.value.toFixed(2)]),
      ['Estate', 'Resources', st.resources.length],
      ['Estate', 'Untagged resources', st.resources.filter((r) => !r.tagged).length],
      ['Waste', 'Findings', wasteItems(st).length],
      ['Waste', 'Monthly saving available USD', totalWaste(st).toFixed(2)],
      ['Waste', 'In cleanup plan', Object.values(st.cleanup).filter((v) => v === 'planned').length],
      ['Reliability', 'Fleet uptime 30d %', fleetUptime(st)],
      ['Reliability', 'Services below target', st.services.filter((x) => x.uptime30 < x.slo).length],
      ['Alerts', 'Open', openAlerts(st).length],
      ['Alerts', 'Acknowledged', st.alerts.filter((a) => a.status === 'acked').length],
      ['Alerts', 'Resolved', st.alerts.filter((a) => a.status === 'resolved').length],
      ['Access', 'Accounts', st.users.length],
      ['Access', 'Elevated without MFA', adminsNoMfa(st).length],
      ['Access', 'Stale accounts', staleUsers(st).length],
    ];
  }

  function generate() {
    const st = ctx.store.state;
    const rec = {
      id: `RV-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      created: new Date().toISOString(),
      month: `${cur.label} ${cur.year}`,
      author: 'Aravind Menon',
      spend: Number(monthlyTotal(st).toFixed(2)),
      change: Number((cur.total - prev.total).toFixed(2)),
      resources: st.resources.length,
      waste: Number(totalWaste(st).toFixed(2)),
      planned: Object.values(st.cleanup).filter((v) => v === 'planned').length,
      uptime: fleetUptime(st),
      openAlerts: openAlerts(st).length,
      noMfa: adminsNoMfa(st).length,
      stale: staleUsers(st).length,
    };
    ctx.store.update((state) => {
      state.reports.unshift(rec);
      state.activity.unshift({ t: rec.created, text: `Monthly review ${rec.id} generated for ${rec.month}` });
    });
    toast(`Review ${rec.id} generated`, 'ok');
    paintList();
  }

  function paintList() {
    const st = ctx.store.state;
    listHost.innerHTML = '';
    const card = h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Generated reviews'),
        h('span', { class: 'pill' }, `${st.reports.length}`)));
    if (!st.reports.length) {
      card.appendChild(h('div', { class: 'empty' },
        h('h3', {}, 'No reviews yet'),
        h('p', {}, 'Generate one to freeze this month’s numbers. Saved reviews survive a reload.')));
    } else {
      card.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Review'), h('th', {}, 'Month'), h('th', { class: 'right' }, 'Spend'),
            h('th', { class: 'right' }, 'Waste'), h('th', { class: 'right' }, 'Uptime'),
            h('th', { class: 'right' }, 'Open alerts'), h('th', {}, 'Created'), h('th', {}, ''))),
          h('tbody', {}, st.reports.map((r) => h('tr', {},
            h('td', {}, h('span', { class: 'mono' }, r.id), h('div', { class: 'small faint' }, r.author)),
            h('td', {}, r.month),
            h('td', { class: 'right mono' }, money2(r.spend)),
            h('td', { class: 'right mono' }, money2(r.waste)),
            h('td', { class: 'right mono' }, pct(r.uptime, 3)),
            h('td', { class: 'right mono' }, String(r.openAlerts)),
            h('td', { class: 'small faint mono' }, `${fmtDate(r.created, { day: '2-digit', month: 'short' })} ${fmtTime(r.created)} · ${ago(r.created)}`),
            h('td', { class: 'right' }, h('div', { class: 'btnrow', style: 'justify-content:flex-end' },
              h('button', {
                class: 'btn btn--sm', type: 'button', 'aria-label': `Download ${r.id}`,
                onclick: () => {
                  downloadCSV(`${r.id}-${r.month.replace(' ', '-').toLowerCase()}.csv`, [
                    ['Review', r.id], ['Month', r.month], ['Author', r.author], ['Created', r.created],
                    [], ['Metric', 'Value'],
                    ['Run rate USD', r.spend.toFixed(2)], ['Change vs previous month USD', r.change.toFixed(2)],
                    ['Resources', r.resources], ['Waste available USD', r.waste.toFixed(2)],
                    ['Findings in cleanup plan', r.planned], ['Fleet uptime %', r.uptime],
                    ['Open alerts', r.openAlerts], ['Elevated without MFA', r.noMfa], ['Stale accounts', r.stale],
                  ]);
                  toast('Review downloaded');
                },
              }, 'CSV'),
              h('button', {
                class: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': `Delete ${r.id}`,
                onclick: async () => {
                  const ok = await confirmDialog(`Delete review ${r.id}?`, { title: 'Delete review', danger: true, okLabel: 'Delete' });
                  if (!ok) return;
                  ctx.store.update((state) => { state.reports = state.reports.filter((x) => x.id !== r.id); });
                  toast('Review deleted'); paintList();
                },
              }, 'Delete')))))))));
    }
    listHost.appendChild(card);
  }

  paintList();
  return wrap;
}

function tile(label, value, delta) {
  return h('div', { class: 'stat' },
    h('div', { class: 'stat__label' }, label),
    h('div', { class: 'stat__value sv-stat--fit' }, value),
    h('div', { class: 'stat__delta' }, delta));
}
function note(label, text) {
  return h('div', { class: 'sv-note' },
    h('div', { class: 'label' }, label),
    h('p', { class: 'small' }, text));
}
function dl(title, sub, fn) {
  return h('button', { class: 'sv-dlitem', type: 'button', onclick: fn },
    h('span', { class: 'sv-dlitem__i', html: icon('download') }),
    h('span', { style: 'flex:1;min-width:0' },
      h('span', { class: 'sv-dlitem__t' }, title),
      h('span', { class: 'small faint' }, sub)));
}

export default { render };
