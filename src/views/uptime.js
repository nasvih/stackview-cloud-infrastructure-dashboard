/* Uptime — 30 day status strips built from solid colour blocks, an error
   budget per service, and the option to reclassify a bad day as planned
   maintenance so it stops eating the budget. */

import { h, icon, fmtDate, pct, num, toast } from '../../lib/ui.js';
import { fleetUptime } from '../data.js';
import { t, label } from '../main.js';

/* the four day states, looked up wherever they are shown */
const word = (k) => t(`uptime.word.${k}`);

const dayStatus = (d) => (d.maintenance ? 'maint' : d.status);
const effUptime = (svc) => {
  const days = svc.days.filter((d) => !d.maintenance);
  if (!days.length) return 100;
  return Number((days.reduce((a, d) => a + d.pct, 0) / days.length).toFixed(3));
};

export function render(ctx) {
  let tier = 'all';
  const wrap = h('div', { class: 'stack' });

  /* the tier keys stay raw — they are what the filter matches on */
  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('routes.uptime.title')),
      h('p', {}, t('uptime.lead'))),
    h('div', { class: 'btnrow' },
      ...['all', 'Tier 1', 'Tier 2', 'Tier 3'].map((k) =>
        h('button', { class: 'chip', type: 'button', dataset: { tier: k }, onclick: () => { tier = k; paint(); } },
          k === 'all' ? t('uptime.allTiers') : label.tier(k))))));

  const statsHost = h('div', { class: 'grid g4' });
  wrap.appendChild(statsHost);

  const legend = h('div', { class: 'card card--flat sv-legend' },
    h('span', { class: 'label' }, t('uptime.legend')),
    ...['up', 'deg', 'down', 'maint'].map((k) => h('span', { class: 'sv-legend__i' },
      h('span', { class: `sv-day sv-day--${k}` }), h('span', { class: 'small' }, word(k)))));
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
      [t('uptime.statFleet'), pct(fleetUptime(st), 3), t('uptime.statFleetSub', { n: st.services.length }), true],
      [t('uptime.statDown'), t('uptime.statDownVal', { n: num(totalDown) }), t('uptime.statDownSub')],
      [t('uptime.statBelow'), num(breached.length),
        breached.length ? breached.map((s) => label.service(s.name)).join(', ') : t('uptime.statBelowClear')],
      [t('uptime.statWorst'), worstDay(st), t('uptime.statWorstSub')],
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
            h('h3', {}, label.service(svc.name)),
            h('div', { class: 'small faint mono' },
              t('uptime.svcSub', { tier: label.tier(svc.tier), slo: svc.slo, resource: svc.resource }))),
          h('div', { class: 'sv-svc__nums' },
            h('span', { class: `pill ${up >= svc.slo ? 'pill--ok' : 'pill--bad'}` },
              up >= svc.slo ? t('uptime.insideTarget') : t('uptime.belowTarget')),
            h('span', { class: 'num sv-svc__up' }, pct(up, 3)))),
        h('div', { class: 'sv-strip', role: 'group', 'aria-label': t('uptime.stripLabel', { name: label.service(svc.name) }) },
          svc.days.map((d) => {
            const stt = dayStatus(d);
            return h('button', {
              class: `sv-day sv-day--${stt} sv-day--btn`,
              type: 'button',
              title: t('uptime.dayTitle', { date: fmtDate(d.day), word: word(stt), mins: d.mins }),
              'aria-label': t('uptime.dayLabel', { date: fmtDate(d.day), word: word(stt) }),
              onclick: () => dayDetail(svc.id, d.day),
            });
          })),
        h('div', { class: 'sv-svc__foot' },
          h('span', { class: 'small faint mono' },
            t('uptime.range', { from: fmtDate(svc.days[0].day, { day: '2-digit', month: 'short' }) })),
          h('span', { class: 'small muted' }, incidents
            ? t('uptime.badDays', { n: incidents, mins: usedMins })
            : t('uptime.noIncidents')),
          h('span', { class: 'small muted' },
            t('uptime.budget', { used: pct(Math.min(100, (usedMins / (budgetMins || 1)) * 100), 0), total: budgetMins })))));
    }

    if (!services.length) host.appendChild(h('div', { class: 'empty' }, h('h3', {}, t('uptime.emptyTier'))));
  }

  function dayDetail(svcId, day) {
    const st = ctx.store.state;
    const svc = st.services.find((s) => s.id === svcId);
    const d = svc.days.find((x) => x.day === day);
    const stt = dayStatus(d);
    const body = h('div', { class: 'stack' });
    body.appendChild(h('div', { class: 'sv-detailhead' },
      h('span', { class: `pill ${stt === 'up' ? 'pill--ok' : stt === 'deg' ? 'pill--warn' : stt === 'maint' ? 'pill--info' : 'pill--bad'}` }, word(stt)),
      h('span', { class: 'pill' }, label.tier(svc.tier))));
    body.appendChild(h('div', { class: 'sv-kv sv-kv--2' },
      kv(t('uptime.kvService'), label.service(svc.name)), kv(t('uptime.kvDate'), fmtDate(d.day)),
      kv(t('uptime.kvAvailability'), pct(d.pct, 3)), kv(t('uptime.kvMins'), String(d.mins)),
      kv(t('uptime.kvBacking'), svc.resource), kv(t('uptime.kvTarget'), `${svc.slo}%`)));
    body.appendChild(h('p', { class: 'muted small' }, d.mins
      ? t('uptime.probeNote', { mins: d.mins, date: fmtDate(d.day) })
      : t('uptime.probeClear')));

    if (d.status !== 'up') {
      body.appendChild(h('div', { class: 'card card--flat' },
        h('div', { class: 'card__head' }, h('h3', {}, t('uptime.classification'))),
        h('p', { class: 'small muted' }, t('uptime.classificationNote')),
        h('button', {
          class: `btn btn--sm ${d.maintenance ? 'btn--primary' : ''}`, type: 'button', style: 'margin-top:12px',
          onclick: () => {
            ctx.store.update((state) => {
              const x = state.services.find((s) => s.id === svcId).days.find((y) => y.day === day);
              x.maintenance = !x.maintenance;
              /* the feed keeps the service and the day as keys so it reads
                 back in whichever language the reader is in now */
              state.activity.unshift({
                t: new Date().toISOString(),
                k: x.maintenance ? 'maintOn' : 'maintOff',
                p: { skey: svc.name, dkey: day },
              });
            });
            /* keep the derived 30 day figure in step with the classification */
            ctx.store.update((state) => {
              const s2 = state.services.find((s) => s.id === svcId);
              s2.uptime30 = effUptime(s2);
            });
            toast(d.maintenance ? t('uptime.toastUnplanned') : t('uptime.toastMaint'), 'ok');
            dayDetail(svcId, day); paint();
          },
        }, d.maintenance ? t('uptime.markedMaint') : t('uptime.markMaint'))));
    }

    body.appendChild(h('div', { class: 'banner' },
      h('span', { html: icon('bell') }),
      h('div', {}, t('uptime.alertBanner'))));

    ctx.drawer(t('uptime.drawerTitle', { name: label.service(svc.name), date: fmtDate(d.day) }), body,
      { sub: `${word(stt)} · ${pct(d.pct, 3)}` });
  }

  function worstDay(st) {
    let worst = { mins: 0, name: '', day: '' };
    for (const s of st.services) for (const d of s.days) {
      if (!d.maintenance && d.mins > worst.mins) worst = { mins: d.mins, name: s.name, day: d.day };
    }
    /* the same minutes-lost shape as the downtime tile above it */
    return t('uptime.statDownVal', { n: worst.mins || 0 });
  }

  paint();
  return wrap;
}

function kv(name, value) {
  return h('div', {}, h('span', { class: 'label' }, name), h('div', { class: 'sv-kv__v' }, value));
}

export default { render };
