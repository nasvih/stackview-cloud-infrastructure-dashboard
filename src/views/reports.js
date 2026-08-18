/* Reports — the monthly review an engineer has to hand to the business,
   assembled from live state and exportable as CSV. */

import { h, icon, fmtDate, fmtTime, num, pct, ago, toast, confirmDialog, downloadCSV, barChart } from '../../lib/ui.js';
import {
  money0, money2, sar, monthlyTotal, openAlerts, wasteItems, totalWaste, staleUsers,
  adminsNoMfa, fleetUptime, groupSum, projection, PROVIDERS,
} from '../data.js';
import { t, label } from '../main.js';

export function render(ctx) {
  const s = ctx.state;
  const months = s.months;
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];
  const proj = projection(s);
  const wrap = h('div', { class: 'stack' });

  /* a review that was frozen before the month key was stored keeps the
     English string it was written with */
  const reviewMonth = (r) => (r.mkey ? `${label.month(r.mkey)} ${r.myear}` : r.month);

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('routes.reports.title')),
      h('p', {}, t('reports.lead', { month: label.month(cur.label), year: cur.year }))),
    h('div', { class: 'btnrow' },
      h('button', {
        class: 'btn btn--primary', type: 'button', html: `${icon('file')}<span>${t('reports.generate')}</span>`,
        onclick: () => generate(),
      }))));

  /* ---------- headline ---------- */
  wrap.appendChild(h('div', { class: 'grid g4' },
    tile(t('reports.tileRunRate'), money0(monthlyTotal(s)), sar(monthlyTotal(s))),
    tile(t('reports.tileVs', { month: label.month(prev.label) }),
      `${cur.total - prev.total >= 0 ? '+' : ''}${money0(cur.total - prev.total)}`,
      pct(((cur.total - prev.total) / prev.total) * 100, 1)),
    tile(t('reports.tileUptime'), pct(fleetUptime(s), 3), t('reports.tileUptimeSub', { n: s.services.length })),
    tile(t('reports.tileSaving'), money0(totalWaste(s)), t('reports.tileSavingSub', { n: wasteItems(s).length }))));

  const summary = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, t('reports.notesTitle', { month: label.month(cur.label), year: cur.year }))),
    h('div', { class: 'sv-notes' },
      note(t('reports.noteSpend'), t('reports.noteSpendText', {
        run: money2(monthlyTotal(s)),
        diff: money2(Math.abs(cur.total - prev.total)),
        dir: cur.total >= prev.total ? t('reports.above') : t('reports.below'),
        prev: label.month(prev.label),
        mtd: money2(proj.mtd), day: proj.day, days: proj.daysInMonth,
        sar: sar(groupSum(s.resources.filter((r) => r.team === 'Facilities IT'), 'team')[0]?.value || 0),
      })),
      note(t('reports.noteEstate'), t('reports.noteEstateText', {
        n: num(s.resources.length),
        split: groupSum(s.resources, 'provider').map((p) => `${p.label === 'onprem' ? t('reports.onpremWord') : label.provider(p.label)} ${s.resources.filter((r) => r.provider === p.label).length}`).join(', '),
        untagged: s.resources.filter((r) => !r.tagged).length,
      })),
      note(t('reports.noteWaste'), t('reports.noteWasteText', {
        n: wasteItems(s).length, money: money2(totalWaste(s)),
        planned: Object.values(s.cleanup).filter((v) => v === 'planned').length,
      })),
      note(t('reports.noteReliability'), t('reports.noteReliabilityText', {
        pct: pct(fleetUptime(s), 3), below: s.services.filter((x) => x.uptime30 < x.slo).length,
      })),
      note(t('reports.noteAlerts'), t('reports.noteAlertsText', {
        open: openAlerts(s).length,
        acked: s.alerts.filter((a) => a.status === 'acked').length,
        resolved: s.alerts.filter((a) => a.status === 'resolved').length,
      })),
      note(t('reports.noteAccess'), t('reports.noteAccessText', {
        noMfa: adminsNoMfa(s).length, stale: staleUsers(s).length,
        keys: s.users.filter((u) => u.keyAgeDays > 365).length,
      }))));

  /* Every CSV below is a schema handed to a spreadsheet, so its headers and
     its cells stay in English whatever the screen is reading in. */
  const chart = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, t('reports.chartTitle'))),
    barChart(months.map((m) => ({ label: label.month(m.label), value: m.total, month: m.label })),
      { format: money0, muted: (x) => x.month !== cur.label }),
    h('div', { class: 'hr' }),
    h('div', { class: 'card__head' }, h('h3', {}, t('reports.downloads'))),
    h('div', { class: 'sv-dl' },
      dl(t('reports.dlReview'), t('reports.dlReviewSub'), () => downloadCSV(`stackview-review-${cur.key}.csv`, reviewRows())),
      dl(t('reports.dlInventory'), t('reports.dlRows', { n: num(s.resources.length) }), () => {
        const rows = [['Name', 'Provider', 'Type', 'Size', 'Environment', 'Region', 'State', 'Monthly USD', 'Owner', 'Team', 'Tagged']];
        for (const r of ctx.store.state.resources) rows.push([r.name, PROVIDERS[r.provider], r.kind, r.size, r.env, r.region, r.state, r.cost.toFixed(2), r.owner, r.team, r.tagged ? 'yes' : 'no']);
        downloadCSV('stackview-inventory.csv', rows);
      }),
      dl(t('reports.dlCost'), t('reports.dlMonths', { n: months.length }), () => {
        const rows = [['Month', 'Service', 'USD']];
        for (const m of months) for (const [k, v] of Object.entries(m.byService)) rows.push([`${m.label} ${m.year}`, k, v.toFixed(2)]);
        downloadCSV('stackview-cost.csv', rows);
      }),
      dl(t('reports.dlWaste'), t('reports.dlFindings', { n: wasteItems(ctx.store.state).length }), () => {
        const rows = [['Resource', 'Environment', 'Owner', 'Monthly saving USD', 'Why', 'Action', 'In plan']];
        for (const r of wasteItems(ctx.store.state)) rows.push([r.name, r.env, r.owner, r.waste.saving.toFixed(2), r.waste.why, r.waste.action, ctx.store.state.cleanup[r.id] === 'planned' ? 'yes' : 'no']);
        downloadCSV('stackview-waste.csv', rows);
      }),
      dl(t('reports.dlAccess'), t('reports.dlAccounts', { n: num(s.users.length) }), () => {
        const rows = [['Name', 'Email', 'Team', 'Role', 'Directory', 'MFA', 'Days since login', 'Key age days', 'Status']];
        for (const u of ctx.store.state.users) rows.push([u.name, u.email, u.team, u.role, u.directory, u.mfa ? 'yes' : 'no', u.lastLoginDays, u.keyAgeDays || '', u.status]);
        downloadCSV('stackview-access.csv', rows);
      }),
      dl(t('reports.dlUptime'), t('reports.dlServices', { n: s.services.length }), () => {
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
      /* the English month rides along for the CSV and the file name; the
         key and the year are what the screen reads back */
      month: `${cur.label} ${cur.year}`,
      mkey: cur.label,
      myear: cur.year,
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
      state.activity.unshift({ t: rec.created, k: 'reviewGenerated', p: { id: rec.id, mkey: cur.label, year: cur.year } });
    });
    toast(t('reports.generated', { id: rec.id }), 'ok');
    paintList();
  }

  function paintList() {
    const st = ctx.store.state;
    listHost.innerHTML = '';
    const card = h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, t('reports.listTitle')),
        h('span', { class: 'pill' }, `${st.reports.length}`)));
    if (!st.reports.length) {
      card.appendChild(h('div', { class: 'empty' },
        h('h3', {}, t('reports.emptyTitle')),
        h('p', {}, t('reports.emptyBody'))));
    } else {
      card.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {},
            h('th', {}, t('reports.thReview')), h('th', {}, t('reports.thMonth')), h('th', { class: 'right' }, t('reports.thSpend')),
            h('th', { class: 'right' }, t('reports.thWaste')), h('th', { class: 'right' }, t('reports.thUptime')),
            h('th', { class: 'right' }, t('reports.thOpen')), h('th', {}, t('reports.thCreated')), h('th', {}, ''))),
          h('tbody', {}, st.reports.map((r) => h('tr', {},
            h('td', {}, h('span', { class: 'mono' }, r.id), h('div', { class: 'small faint' }, r.author)),
            h('td', {}, reviewMonth(r)),
            h('td', { class: 'right mono' }, money2(r.spend)),
            h('td', { class: 'right mono' }, money2(r.waste)),
            h('td', { class: 'right mono' }, pct(r.uptime, 3)),
            h('td', { class: 'right mono' }, String(r.openAlerts)),
            h('td', { class: 'small faint mono' }, `${fmtDate(r.created, { day: '2-digit', month: 'short' })} ${fmtTime(r.created)} · ${ago(r.created)}`),
            h('td', { class: 'right' }, h('div', { class: 'btnrow', style: 'justify-content:flex-end' },
              h('button', {
                class: 'btn btn--sm', type: 'button', 'aria-label': t('reports.downloadLabel', { id: r.id }),
                onclick: () => {
                  downloadCSV(`${r.id}-${r.month.replace(' ', '-').toLowerCase()}.csv`, [
                    ['Review', r.id], ['Month', r.month], ['Author', r.author], ['Created', r.created],
                    [], ['Metric', 'Value'],
                    ['Run rate USD', r.spend.toFixed(2)], ['Change vs previous month USD', r.change.toFixed(2)],
                    ['Resources', r.resources], ['Waste available USD', r.waste.toFixed(2)],
                    ['Findings in cleanup plan', r.planned], ['Fleet uptime %', r.uptime],
                    ['Open alerts', r.openAlerts], ['Elevated without MFA', r.noMfa], ['Stale accounts', r.stale],
                  ]);
                  toast(t('reports.downloaded'));
                },
              }, 'CSV'),
              h('button', {
                class: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': t('reports.deleteLabel', { id: r.id }),
                onclick: async () => {
                  const ok = await confirmDialog(t('reports.deleteBody', { id: r.id }),
                    { title: t('reports.deleteTitle'), danger: true, okLabel: t('reports.deleteOk') });
                  if (!ok) return;
                  ctx.store.update((state) => { state.reports = state.reports.filter((x) => x.id !== r.id); });
                  toast(t('reports.deleted')); paintList();
                },
              }, t('reports.deleteOk'))))))))));
    }
    listHost.appendChild(card);
  }

  paintList();
  return wrap;
}

function tile(name, value, delta) {
  return h('div', { class: 'stat' },
    h('div', { class: 'stat__label' }, name),
    h('div', { class: 'stat__value sv-stat--fit' }, value),
    h('div', { class: 'stat__delta' }, delta));
}
function note(name, text) {
  return h('div', { class: 'sv-note' },
    h('div', { class: 'label' }, name),
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
