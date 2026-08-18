/* Alerts — severity list with acknowledge, mute and resolve, and a per-alert
   timeline that grows as you work it. */

import { h, icon, ago, fmtDate, fmtTime, num, toast, confirmDialog, downloadCSV } from '../../lib/ui.js';
import { t, label, alertTitle, alertDetail, alertRunbook, lineText } from '../main.js';

const SEV = ['critical', 'high', 'warning', 'info'];
const SEV_PILL = { critical: 'pill--bad', high: 'pill--bad', warning: 'pill--warn', info: 'pill--info' };
const STATUS_PILL = { open: 'pill--bad', acked: 'pill--warn', muted: '', resolved: 'pill--ok' };
const ME = 'Aravind Menon';

/* the feed and timeline keys written by each action, resolved when read */
const ACT_FEED = { ack: 'alertAcked', mute: 'alertMuted', unmute: 'alertUnmuted', resolve: 'alertResolved' };
const ACT_LINE = { ack: 'acked', mute: 'muted', unmute: 'unmuted', resolve: 'resolved' };
const ACT_TOAST = { ack: 'toastAcked', mute: 'toastMuted', unmute: 'toastUnmuted', resolve: 'toastResolved' };

export function render(ctx) {
  let sevFilter = 'all';
  let statusFilter = 'open';

  const wrap = h('div', { class: 'stack' });

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('routes.alerts.title')),
      h('p', {}, t('alerts.lead'))),
    h('div', { class: 'btnrow' },
      h('button', {
        class: 'btn', type: 'button', html: `${icon('download')}<span>${t('alerts.export')}</span>`,
        onclick: () => {
          /* the CSV is a schema handed to a spreadsheet, so its header and its
             cells stay in English whatever the screen is reading in */
          const rows = [['Id', 'Severity', 'Title', 'Resource', 'Service', 'Source', 'Opened', 'Status', 'Acknowledged by']];
          for (const a of list()) rows.push([a.id, a.sev, a.title, a.resource, a.service, a.source, a.opened, a.status, a.ackBy || '']);
          downloadCSV('stackview-alerts.csv', rows);
          toast(t('alerts.exported'));
        },
      }),
      h('button', {
        class: 'btn btn--primary', type: 'button', html: `${icon('check')}<span>${t('alerts.ackAll')}</span>`,
        onclick: async () => {
          const open = ctx.store.state.alerts.filter((a) => a.status === 'open');
          if (!open.length) { toast(t('alerts.nothingLeftOpen')); return; }
          const ok = await confirmDialog(t('alerts.ackAllBody', { n: open.length, me: ME }),
            { title: t('alerts.ackAllTitle'), okLabel: t('alerts.ackAllOk') });
          if (!ok) return;
          ctx.store.update((st) => {
            for (const a of st.alerts) {
              if (a.status !== 'open') continue;
              a.status = 'acked'; a.ackBy = ME; a.ackAt = new Date().toISOString();
              a.timeline.unshift({ t: a.ackAt, who: ME, k: 'ackedBulk' });
            }
            st.activity.unshift({ t: new Date().toISOString(), k: 'alertsAcked', p: { n: open.length } });
          });
          toast(t('alerts.ackedToast', { n: open.length }), 'ok'); paint();
        },
      }))));

  const statsHost = h('div', { class: 'grid g4' });
  wrap.appendChild(statsHost);

  /* the chip keys stay raw — they are what the filter matches on */
  const filters = h('div', { class: 'card card--flat sv-filters' },
    h('span', { class: 'label' }, t('alerts.filterSeverity')),
    ...['all', ...SEV].map((k) => h('button', {
      class: 'chip', type: 'button', dataset: { sev: k },
      onclick: () => { sevFilter = k; paint(); },
    }, k === 'all' ? t('alerts.all') : label.sev(k))),
    h('span', { class: 'label', style: 'margin-left:8px' }, t('alerts.filterStatus')),
    ...['open', 'acked', 'muted', 'resolved', 'any'].map((k) => h('button', {
      class: 'chip', type: 'button', dataset: { st: k },
      onclick: () => { statusFilter = k; paint(); },
    }, k === 'any' ? t('alerts.any') : k === 'acked' ? t('alerts.chipAcked') : label.alertStatus(k))));
  wrap.appendChild(filters);

  const host = h('div', {});
  wrap.appendChild(host);

  function list() {
    return ctx.store.state.alerts.filter((a) => {
      if (sevFilter !== 'all' && a.sev !== sevFilter) return false;
      if (statusFilter !== 'any' && a.status !== statusFilter) return false;
      return true;
    }).sort((a, b) => (SEV.indexOf(a.sev) - SEV.indexOf(b.sev)) || (b.opened.localeCompare(a.opened)));
  }

  function paint() {
    const st = ctx.store.state;
    statsHost.innerHTML = '';
    const open = st.alerts.filter((a) => a.status === 'open');
    const oldest = open.map((a) => a.opened).sort()[0];
    [
      [t('alerts.statOpen'), num(open.length),
        open.length ? t('alerts.statOpenOldest', { ago: ago(oldest) }) : t('alerts.statOpenClear'), open.length > 0],
      [t('alerts.statCritical'), num(open.filter((a) => a.sev === 'critical').length), t('alerts.statCriticalSub')],
      [t('alerts.statAcked'), num(st.alerts.filter((a) => a.status === 'acked').length), t('alerts.statAckedSub')],
      [t('alerts.statMuted'), num(st.alerts.filter((a) => a.status === 'muted').length), t('alerts.statMutedSub')],
    ].forEach(([l, v, d, accent]) => statsHost.appendChild(h('div', { class: `stat${accent ? ' stat--accent' : ''}` },
      h('div', { class: 'stat__label' }, l),
      h('div', { class: 'stat__value' }, v),
      h('div', { class: 'stat__delta' }, d))));

    [...filters.querySelectorAll('.chip')].forEach((c) => {
      const on = (c.dataset.sev && c.dataset.sev === sevFilter) || (c.dataset.st && c.dataset.st === statusFilter);
      c.classList.toggle('is-on', !!on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    const rows = list();
    host.innerHTML = '';
    if (!rows.length) {
      host.appendChild(h('div', { class: 'empty' },
        h('h3', {}, t('alerts.emptyTitle')),
        h('p', {}, t('alerts.emptyBody'))));
      return;
    }
    host.appendChild(h('ul', { class: 'sv-alerts' }, rows.map((a) => h('li', { class: `sv-alert sv-alert--${a.sev}` },
      h('div', { class: 'sv-alert__main' },
        h('div', { class: 'row' },
          h('span', { class: `pill ${SEV_PILL[a.sev]}` }, label.sev(a.sev)),
          h('span', { class: `pill ${STATUS_PILL[a.status]}` }, label.alertStatus(a.status)),
          h('span', { class: 'mono small faint' }, a.id)),
        h('button', {
          class: 'sv-alert__title', type: 'button', onclick: () => detail(a.id),
        }, alertTitle(a)),
        h('div', { class: 'small muted' }, alertDetail(a)),
        h('div', { class: 'small faint mono sv-alert__meta' },
          t('alerts.meta', {
            source: label.source(a.source), resource: a.resource,
            date: fmtDate(a.opened, { day: '2-digit', month: 'short' }),
            time: fmtTime(a.opened), ago: ago(a.opened),
          }),
          a.ackBy ? t('alerts.ackedBy', { who: a.ackBy }) : '')),
      h('div', { class: 'sv-alert__acts btnrow' },
        a.status === 'open' ? h('button', { class: 'btn btn--sm', type: 'button', onclick: () => act(a.id, 'ack') }, t('alerts.ack')) : null,
        a.status !== 'muted' && a.status !== 'resolved' ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => act(a.id, 'mute') }, t('alerts.mute24')) : null,
        a.status === 'muted' ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => act(a.id, 'unmute') }, t('alerts.unmute')) : null,
        a.status !== 'resolved' ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => act(a.id, 'resolve') }, t('alerts.resolve')) : null,
        h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => detail(a.id) }, t('alerts.timeline')))))));
  }

  function act(id, what) {
    ctx.store.update((st) => {
      const a = st.alerts.find((x) => x.id === id);
      const now = new Date().toISOString();
      if (what === 'ack') { a.status = 'acked'; a.ackBy = ME; a.ackAt = now; }
      if (what === 'mute') a.status = 'muted';
      if (what === 'unmute') a.status = 'open';
      if (what === 'resolve') a.status = 'resolved';
      /* the timeline and the feed are stored as a key, never as a finished
         sentence — they read back in whichever language you are in now */
      a.timeline.unshift({ t: now, who: ME, k: ACT_LINE[what] });
      st.activity.unshift({ t: now, k: ACT_FEED[what], p: { id: a.id } });
    });
    toast(t(`alerts.${ACT_TOAST[what]}`), what === 'resolve' ? 'ok' : '');
    paint();
  }

  function detail(id) {
    const a = ctx.store.state.alerts.find((x) => x.id === id);
    if (!a) return;
    const body = h('div', { class: 'stack' });
    body.appendChild(h('div', { class: 'sv-detailhead' },
      h('span', { class: `pill ${SEV_PILL[a.sev]}` }, label.sev(a.sev)),
      h('span', { class: `pill ${STATUS_PILL[a.status]}` }, label.alertStatus(a.status)),
      h('span', { class: 'pill' }, label.source(a.source))));
    body.appendChild(h('p', {}, alertDetail(a)));
    body.appendChild(h('div', { class: 'sv-kv sv-kv--2' },
      kv(t('alerts.kvId'), a.id), kv(t('alerts.kvService'), a.service),
      kv(t('alerts.kvResource'), a.resource), kv(t('alerts.kvOpened'), `${fmtDate(a.opened)} ${fmtTime(a.opened)}`),
      kv(t('alerts.kvAge'), ago(a.opened)), kv(t('alerts.kvAckedBy'), a.ackBy || t('alerts.nobodyYet'))));
    body.appendChild(h('div', { class: 'banner' },
      h('span', { html: icon('file') }),
      h('div', {}, alertRunbook(a))));

    const noteInput = h('input', { class: 'input', placeholder: t('alerts.notePlaceholder'), 'aria-label': t('alerts.noteLabel') });
    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, t('alerts.timeline'))),
      h('div', { class: 'row', style: 'margin-bottom:14px' }, noteInput,
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => {
            const v = noteInput.value.trim();
            if (!v) { toast(t('alerts.noteEmpty')); return; }
            /* a note the reader typed is their own words — stored and shown
               verbatim, never looked up */
            ctx.store.update((st) => {
              st.alerts.find((x) => x.id === id).timeline.unshift({ t: new Date().toISOString(), who: ME, text: v });
            });
            toast(t('alerts.noteAdded'), 'ok'); detail(id); paint();
          },
        }, t('alerts.add'))),
      h('div', { class: 'timeline' }, a.timeline.map((e) => h('div', { class: 'timeline__item' },
        h('div', {}, lineText(e)),
        h('div', { class: 'small faint mono' }, `${e.who} · ${fmtDate(e.t, { day: '2-digit', month: 'short' })} ${fmtTime(e.t)}`))))));

    body.appendChild(h('div', { class: 'btnrow' },
      a.status === 'open' ? h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => { act(id, 'ack'); detail(id); } }, t('alerts.ack')) : null,
      a.status !== 'muted' && a.status !== 'resolved' ? h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { act(id, 'mute'); detail(id); } }, t('alerts.mute24')) : null,
      a.status !== 'resolved' ? h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { act(id, 'resolve'); detail(id); } }, t('alerts.resolve')) : null));

    ctx.drawer(alertTitle(a), body, { sub: `${a.id} · ${a.resource}` });
  }

  paint();
  return wrap;
}

function kv(name, value) {
  return h('div', {}, h('span', { class: 'label' }, name), h('div', { class: 'sv-kv__v' }, value));
}

export default { render };
