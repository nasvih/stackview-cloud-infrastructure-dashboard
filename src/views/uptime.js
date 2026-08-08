/* Uptime — 30 day status strips built from solid colour blocks, an error
   budget per service, and the option to reclassify a bad day as planned
   maintenance so it stops eating the budget. */

import { h, icon, fmtDate, pct, num, toast } from '../../lib/ui.js';
import { fleetUptime } from '../data.js';

const WORD = { up: 'operational', deg: 'degraded', down: 'outage', maint: 'planned maintenance' };

const dayStatus = (d) => (d.maintenance ? 'maint' : d.status);
const effUptime = (svc) => {
  const days = svc.days.filter((d) => !d.maintenance);
  if (!days.length) return 100;
  return Number((days.reduce((a, d) => a + d.pct, 0) / days.length).toFixed(3));
};

export function render(ctx) {
  let tier = 'all';
  const wrap = h('div', { class: 'stack' });

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Uptime'),
      h('p', {}, 'Thirty days of daily availability per service. Each block is one day; hover or focus a block for the numbers. Days marked as planned maintenance are left out of the error budget.')),
    h('div', { class: 'btnrow' },
      ...[['all', 'All tiers'], ['Tier 1', 'Tier 1'], ['Tier 2', 'Tier 2'], ['Tier 3', 'Tier 3']].map(([k, label]) =>
        h('button', { class: 'chip', type: 'button', dataset: { tier: k }, onclick: () => { tier = k; paint(); } }, label)))));

  const statsHost = h('div', { class: 'grid g4' });
  wrap.appendChild(statsHost);

  const legend = h('div', { class: 'card card--flat sv-legend' },
    h('span', { class: 'label' }, 'Legend'),
    ...['up', 'deg', 'down', 'maint'].map((k) => h('span', { class: 'sv-legend__i' },
      h('span', { class: `sv-day sv-day--${k}` }), h('span', { class: 'small' }, WORD[k]))));
  wrap.appendChild(legend);

  const host = h('div', { class: 'stack' });
  wrap.appendChild(host);

  function paint() {
    const st = ctx.store.state;
    const services = st.services.filter((s) => tier === 'all' || s.tier === tier);

    statsHost.innerHTML = '';
    const breached = st.services.filter((s) => effUptime(s) < s.slo);
    const totalDown = st.services.reduce((a, s) => a + s.days.filter((d) => !d.maintenance).reduce((x, d) => x + d.mins, 0), 0);
    [
      ['Fleet uptime', pct(fleetUptime(st), 3), `${st.services.length} services tracked`, true],
      ['Downtime 30d', `${num(totalDown)}m`, 'excluding planned maintenance'],
      ['Below SLO', num(breached.length), breached.length ? breached.map((s) => s.name).join(', ') : 'every service inside target'],
      ['Worst day', worstDay(st), 'largest single day loss'],
    ].forEach(([l, v, d, accent]) => statsHost.appendChild(h('div', { class: `stat${accent ? ' stat--accent' : ''}` },
      h('div', { class: 'stat__label' }, l),
      h('div', { class: 'stat__value sv-stat--fit' }, v),
      h('div', { class: 'stat__delta truncate' }, d))));

    [...wrap.querySelectorAll('[data-tier]')].forEach((c) => {
      c.classList.toggle('is-on', c.dataset.tier === tier);
      c.setAttribute('aria-pressed', c.dataset.tier === tier ? 'true' : 'false');
    });

    host.innerHTML = '';
    for (const svc of services) {
      const up = effUptime(svc);
      const budgetMins = Math.round(((100 - svc.slo) / 100) * 30 * 1440);
      const usedMins = svc.days.filter((d) => !d.maintenance).reduce((a, d) => a + d.mins, 0);
      const incidents = svc.days.filter((d) => !d.maintenance && d.status !== 'up').length;

      host.appendChild(h('article', { class: 'card sv-svc' },
        h('div', { class: 'sv-svc__head' },
          h('div', { style: 'min-width:0' },
            h('h3', {}, svc.name),
            h('div', { class: 'small faint mono' }, `${svc.tier} · target ${svc.slo}% · ${svc.resource}`)),
          h('div', { class: 'sv-svc__nums' },
            h('span', { class: `pill ${up >= svc.slo ? 'pill--ok' : 'pill--bad'}` }, up >= svc.slo ? 'inside target' : 'below target'),
            h('span', { class: 'num sv-svc__up' }, pct(up, 3)))),
        h('div', { class: 'sv-strip', role: 'group', 'aria-label': `${svc.name} daily status, last 30 days` },
          svc.days.map((d) => {
            const stt = dayStatus(d);
            return h('button', {
              class: `sv-day sv-day--${stt} sv-day--btn`,
              type: 'button',
              title: `${fmtDate(d.day)} — ${WORD[stt]}${d.mins ? `, ${d.mins} min lost` : ''}`,
              'aria-label': `${fmtDate(d.day)} ${WORD[stt]}`,
              onclick: () => dayDetail(svc.id, d.day),
            });
          })),
        h('div', { class: 'sv-svc__foot' },
          h('span', { class: 'small faint mono' }, `${fmtDate(svc.days[0].day, { day: '2-digit', month: 'short' })} → today`),
          h('span', { class: 'small muted' }, incidents ? `${incidents} bad day${incidents > 1 ? 's' : ''}, ${usedMins} min lost` : 'no incidents'),
          h('span', { class: 'small muted' }, `error budget ${pct(Math.min(100, (usedMins / (budgetMins || 1)) * 100), 0)} used of ${budgetMins}m`))));
    }

    if (!services.length) host.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'No services in this tier')));
  }

  function dayDetail(svcId, day) {
    const st = ctx.store.state;
    const svc = st.services.find((s) => s.id === svcId);
    const d = svc.days.find((x) => x.day === day);
    const stt = dayStatus(d);
    const body = h('div', { class: 'stack' });
    body.appendChild(h('div', { class: 'sv-detailhead' },
      h('span', { class: `pill ${stt === 'up' ? 'pill--ok' : stt === 'deg' ? 'pill--warn' : stt === 'maint' ? 'pill--info' : 'pill--bad'}` }, WORD[stt]),
      h('span', { class: 'pill' }, svc.tier)));
    body.appendChild(h('div', { class: 'sv-kv sv-kv--2' },
      kv('Service', svc.name), kv('Date', fmtDate(d.day)),
      kv('Availability', pct(d.pct, 3)), kv('Minutes lost', String(d.mins)),
      kv('Backing resource', svc.resource), kv('Target', `${svc.slo}%`)));
    body.appendChild(h('p', { class: 'muted small' }, d.mins
      ? `The probe recorded ${d.mins} minutes outside target on ${fmtDate(d.day)}. Correlate with the alert queue for that window before you write the review note.`
      : 'No probe failures recorded on this day.'));

    if (d.status !== 'up') {
      body.appendChild(h('div', { class: 'card card--flat' },
        h('div', { class: 'card__head' }, h('h3', {}, 'Classification')),
        h('p', { class: 'small muted' }, 'Planned maintenance is excluded from the error budget and from the fleet number on the overview.'),
        h('button', {
          class: `btn btn--sm ${d.maintenance ? 'btn--primary' : ''}`, type: 'button', style: 'margin-top:12px',
          onclick: () => {
            ctx.store.update((state) => {
              const t = state.services.find((s) => s.id === svcId).days.find((x) => x.day === day);
              t.maintenance = !t.maintenance;
              state.activity.unshift({ t: new Date().toISOString(), text: `${svc.name} ${fmtDate(day, { day: '2-digit', month: 'short' })} ${t.maintenance ? 'reclassified as planned maintenance' : 'returned to unplanned'}` });
            });
            /* keep the derived 30 day figure in step with the classification */
            ctx.store.update((state) => {
              const s2 = state.services.find((s) => s.id === svcId);
              s2.uptime30 = effUptime(s2);
            });
            toast(d.maintenance ? 'Back to unplanned' : 'Marked as planned maintenance', 'ok');
            dayDetail(svcId, day); paint();
          },
        }, d.maintenance ? 'Marked as planned maintenance' : 'Mark as planned maintenance')));
    }

    body.appendChild(h('div', { class: 'banner' },
      h('span', { html: icon('bell') }),
      h('div', {}, 'Alerts raised on this service are in the alert queue. Filter by "Any" status to see resolved ones.')));

    ctx.drawer(`${svc.name} — ${fmtDate(d.day)}`, body, { sub: `${WORD[stt]} · ${pct(d.pct, 3)}` });
  }

  function worstDay(st) {
    let worst = { mins: 0, name: '', day: '' };
    for (const s of st.services) for (const d of s.days) {
      if (!d.maintenance && d.mins > worst.mins) worst = { mins: d.mins, name: s.name, day: d.day };
    }
    return worst.mins ? `${worst.mins}m` : '0m';
  }

  paint();
  return wrap;
}

function kv(label, value) {
  return h('div', {}, h('span', { class: 'label' }, label), h('div', { class: 'sv-kv__v' }, value));
}

export default { render };
