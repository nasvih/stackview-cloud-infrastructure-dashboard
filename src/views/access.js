/* Access — who can get into what, which accounts are stale, and a working
   offboarding checklist that persists. */

import { h, icon, ago, num, pct, initials, meter, confirmDialog, toast, downloadCSV } from '../../lib/ui.js';
import { OFFBOARD_STEPS, staleUsers, adminsNoMfa } from '../data.js';
import { t, label, offboardSteps } from '../main.js';

/* Both of these are keyed on the raw role name that lives on the record, so
   they stay in English however the page reads. */
const ROLE_PILL = { Admin: 'pill--bad', 'Power user': 'pill--warn', Developer: 'pill--info', 'Read only': '', Billing: '' };
const ROLES = ['Admin', 'Power user', 'Developer', 'Read only', 'Billing'];

/* The filter chips: raw key first, dictionary path second. */
const CHIPS = [
  ['all', 'access.fEveryone'],
  ['admin', 'access.fElevated'],
  ['nomfa', 'access.fNoMfa'],
  ['stale', 'access.fStale'],
  ['service', 'access.fService'],
  ['offboarding', 'access.fOffboarding'],
];

export function render(ctx) {
  let filter = 'all';
  let q = '';

  const wrap = h('div', { class: 'stack' });
  const s = ctx.state;

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, t('routes.access.title')),
      h('p', {}, t('access.lead'))),
    h('div', { class: 'btnrow' },
      h('button', {
        class: 'btn', type: 'button', html: `${icon('download')}<span>${t('access.exportReview')}</span>`,
        onclick: () => {
          /* the CSV is a schema handed to a spreadsheet, so it stays English */
          const rows = [['Name', 'Email', 'Team', 'Role', 'Directory', 'MFA', 'Last login', 'Days since login', 'Key age days', 'Status']];
          for (const u of ctx.store.state.users) rows.push([u.name, u.email, u.team, u.role, u.directory, u.mfa ? 'yes' : 'no', u.lastLogin.slice(0, 10), u.lastLoginDays, u.keyAgeDays || '', u.status]);
          downloadCSV('stackview-access-review.csv', rows);
          toast(t('access.exported'));
        },
      }))));

  const statsHost = h('div', { class: 'grid g4' });
  wrap.appendChild(statsHost);

  const chips = h('div', { class: 'card card--flat sv-filters' },
    h('div', { class: 'search' },
      h('span', { html: icon('search') }),
      h('input', { class: 'input', type: 'search', placeholder: t('access.searchPlaceholder'), 'aria-label': t('access.searchLabel'), oninput: (e) => { q = e.target.value.trim().toLowerCase(); paint(); } })),
    ...CHIPS.map(([k, path]) => h('button', {
      class: `chip${filter === k ? ' is-on' : ''}`, type: 'button', 'aria-pressed': filter === k ? 'true' : 'false',
      onclick: () => { filter = k; paint(); },
    }, t(path))));
  wrap.appendChild(chips);

  const host = h('div', {});
  wrap.appendChild(host);

  function list() {
    return ctx.store.state.users.filter((u) => {
      if (q && ![u.name, u.email, u.team, u.role, u.directory].join(' ').toLowerCase().includes(q)) return false;
      if (filter === 'admin') return u.role === 'Admin' || u.role === 'Power user';
      if (filter === 'nomfa') return !u.mfa;
      if (filter === 'stale') return u.status === 'stale';
      if (filter === 'service') return u.status === 'service';
      if (filter === 'offboarding') return !!u.offboarding;
      return true;
    });
  }

  function paint() {
    const st = ctx.store.state;
    statsHost.innerHTML = '';
    const mfaOn = st.users.filter((u) => u.mfa).length;
    [
      [t('access.statAccounts'), num(st.users.length), t('access.statAccountsSub', { n: st.users.filter((u) => u.status === 'service').length })],
      [t('access.statMfa'), pct((mfaOn / st.users.length) * 100), t('access.statMfaSub', { n: st.users.length - mfaOn })],
      [t('access.statNoMfa'), num(adminsNoMfa(st).length), adminsNoMfa(st).length ? adminsNoMfa(st).map((u) => u.name).join(', ') : t('access.statClear')],
      [t('access.statStale'), num(staleUsers(st).length), t('access.statStaleSub')],
    ].forEach(([l, v, d], i) => statsHost.appendChild(h('div', { class: `stat${i === 2 && adminsNoMfa(st).length ? ' stat--accent' : ''}` },
      h('div', { class: 'stat__label' }, l),
      h('div', { class: 'stat__value sv-stat--fit' }, v),
      h('div', { class: 'stat__delta truncate' }, d))));

    [...chips.querySelectorAll('.chip')].forEach((c, i) => {
      const k = CHIPS[i][0];
      c.classList.toggle('is-on', k === filter);
      c.setAttribute('aria-pressed', k === filter ? 'true' : 'false');
    });

    const rows = list();
    host.innerHTML = '';
    if (!rows.length) {
      host.appendChild(h('div', { class: 'empty' }, h('h3', {}, t('access.emptyTitle')), h('p', {}, t('access.emptyBody'))));
      return;
    }
    host.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {},
          h('th', {}, t('access.thAccount')), h('th', {}, t('access.thRole')), h('th', {}, t('access.thDirectory')),
          h('th', {}, t('access.thMfa')), h('th', {}, t('access.thLastLogin')), h('th', {}, t('access.thKey')), h('th', {}, t('access.thStatus')))),
        h('tbody', {}, rows.map((u) => h('tr', {
          class: 'sv-row', tabindex: '0', role: 'button', 'aria-label': t('access.openRow', { name: u.name }),
          onclick: () => detail(u.id),
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); detail(u.id); } },
        },
        h('td', {}, h('div', { class: 'sv-user' },
          h('span', { class: `avatar${u.status === 'service' ? '' : ' avatar--amber'}` }, u.status === 'service' ? t('access.svc') : initials(u.name)),
          h('div', { style: 'min-width:0' },
            h('div', { class: 'sv-user__n truncate' }, u.name),
            h('div', { class: 'small faint truncate mono' }, u.email)))),
        h('td', {}, h('span', { class: `pill ${ROLE_PILL[u.role] || ''}` }, label.role(u.role))),
        h('td', { class: 'small' }, label.directory(u.directory)),
        h('td', {}, u.mfa ? h('span', { class: 'pill pill--ok' }, t('access.on')) : h('span', { class: 'pill pill--bad' }, t('access.off'))),
        h('td', { class: 'small mono' }, u.lastLoginDays < 1 ? t('time.today') : ago(u.lastLogin)),
        h('td', { class: 'small mono' }, u.keyAgeDays
          ? h('span', { class: u.keyAgeDays > 365 ? 'sv-neg' : '' }, `${num(u.keyAgeDays)}d`)
          : '—'),
        h('td', {}, u.offboarding
          ? h('span', { class: 'pill pill--warn' }, t('access.statusOffboarding'))
          : h('span', { class: `pill ${u.status === 'stale' ? 'pill--warn' : u.status === 'disabled' ? 'pill--bad' : ''}` }, label.userStatus(u.status)))))))));
  }

  /* ---------- detail drawer ---------- */
  function detail(id) {
    const u = ctx.store.state.users.find((x) => x.id === id);
    if (!u) return;
    const owned = ctx.store.state.resources.filter((r) => r.owner === u.name);
    const body = h('div', { class: 'stack' });

    body.appendChild(h('div', { class: 'sv-detailhead' },
      h('span', { class: `pill ${ROLE_PILL[u.role] || ''}` }, label.role(u.role)),
      h('span', { class: `pill ${u.mfa ? 'pill--ok' : 'pill--bad'}` }, u.mfa ? t('access.mfaOn') : t('access.mfaOff')),
      h('span', { class: 'pill' }, label.directory(u.directory))));

    body.appendChild(h('div', { class: 'sv-kv sv-kv--2' },
      kv(t('access.kvEmail'), u.email), kv(t('access.kvTeam'), label.team(u.team)),
      kv(t('access.kvLastLogin'), u.lastLoginDays < 1 ? t('time.today') : ago(u.lastLogin)),
      kv(t('access.kvKeyAge'), u.keyAgeDays ? t('access.kvKeyAgeVal', { n: num(u.keyAgeDays) }) : t('access.noKey')),
      kv(t('access.kvOwned'), String(owned.length)),
      kv(t('access.kvStatus'), u.offboarding ? t('access.statusOffboarding') : label.userStatus(u.status))));

    if (!u.mfa) {
      body.appendChild(h('div', { class: 'banner' },
        h('span', { html: icon('shield') }),
        h('div', {}, t('access.noMfaBanner'),
          (u.role === 'Admin' || u.role === 'Power user') ? t('access.noMfaElevated') : t('access.noMfaOther'))));
    }
    if (u.keyAgeDays > 365) {
      body.appendChild(h('div', { class: 'banner' },
        h('span', { html: icon('key') }),
        h('div', {}, t('access.keyBanner', { n: num(u.keyAgeDays) }))));
    }

    if (owned.length) {
      body.appendChild(h('div', { class: 'card card--flat' },
        h('div', { class: 'card__head' }, h('h3', {}, t('access.owns')), h('span', { class: 'pill' }, `${owned.length}`)),
        h('ul', { class: 'sv-ownlist' }, owned.slice(0, 8).map((r) => h('li', {},
          h('span', { class: 'mono small' }, r.name),
          h('span', { class: 'small faint' }, `${r.kind} · ${label.env(r.env)}`))))));
    }

    /* offboarding checklist */
    const ob = u.offboarding;
    const obCard = h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, t('access.offboarding')),
        ob ? h('span', { class: 'pill pill--warn' }, `${ob.done.filter(Boolean).length}/${OFFBOARD_STEPS.length}`) : null));
    if (!ob) {
      obCard.appendChild(h('p', { class: 'small muted' }, t('access.offboardLead')));
      obCard.appendChild(h('button', {
        class: 'btn btn--sm', type: 'button', style: 'margin-top:12px',
        onclick: () => {
          ctx.store.update((st) => {
            const usr = st.users.find((x) => x.id === id);
            usr.offboarding = { started: new Date().toISOString(), done: OFFBOARD_STEPS.map(() => false) };
            st.activity.unshift({ t: new Date().toISOString(), k: 'offboardStarted', p: { name: usr.name } });
          });
          toast(t('access.offboardStarted')); detail(id); paint();
        },
      }, t('access.startOffboard')));
    } else {
      obCard.appendChild(meter(ob.done.filter(Boolean).length, OFFBOARD_STEPS.length, 'ok'));
      /* the checklist is indexed against OFFBOARD_STEPS and the stored done[]
         array; only the wording of a step comes from the dictionary */
      const steps = offboardSteps();
      obCard.appendChild(h('ul', { class: 'sv-check', style: 'margin-top:14px' }, OFFBOARD_STEPS.map((step, i) => {
        const cb = h('input', {
          type: 'checkbox', checked: ob.done[i] ? true : null,
          onchange: () => {
            ctx.store.update((st) => {
              const usr = st.users.find((x) => x.id === id);
              usr.offboarding.done[i] = !usr.offboarding.done[i];
            });
            detail(id); paint();
          },
        });
        return h('li', {}, h('label', { class: 'sv-check__row' }, cb, h('span', { class: ob.done[i] ? 'sv-check__done' : '' }, steps[i] || step)));
      })));
      obCard.appendChild(h('div', { class: 'btnrow', style: 'margin-top:14px' },
        h('button', {
          class: 'btn btn--sm btn--primary', type: 'button',
          disabled: ob.done.every(Boolean) ? null : true,
          onclick: async () => {
            const ok = await confirmDialog(t('access.completeBody', { name: u.name, n: owned.length }), { title: t('access.completeTitle'), okLabel: t('access.completeOk') });
            if (!ok) return;
            ctx.store.update((st) => {
              const usr = st.users.find((x) => x.id === id);
              usr.status = 'disabled'; usr.mfa = false; usr.offboarding = null;
              st.activity.unshift({ t: new Date().toISOString(), k: 'offboarded', p: { name: usr.name } });
            });
            toast(t('access.offboardComplete'), 'ok'); ctx.closeDrawer(); paint();
          },
        }, t('access.completeOffboard')),
        h('button', {
          class: 'btn btn--sm btn--ghost', type: 'button',
          onclick: () => {
            ctx.store.update((st) => { st.users.find((x) => x.id === id).offboarding = null; });
            toast(t('access.offboardCancelled')); detail(id); paint();
          },
        }, t('access.cancel'))));
    }
    body.appendChild(obCard);

    /* actions — the option value stays the raw role, only its text is read */
    const roleSel = h('select', { class: 'select', 'aria-label': t('access.changeRole') },
      ROLES.map((rl) => h('option', { value: rl, selected: rl === u.role ? true : null }, label.role(rl))));
    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, t('access.actions'))),
      h('div', { class: 'field' },
        h('span', { class: 'field__label' }, t('access.roleField')),
        h('div', { class: 'row' }, roleSel, h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => {
            const v = roleSel.value;
            ctx.store.update((st) => {
              const usr = st.users.find((x) => x.id === id);
              st.activity.unshift({ t: new Date().toISOString(), k: 'roleChanged', p: { name: usr.name, rFrom: usr.role, rTo: v } });
              usr.role = v;
            });
            toast(t('access.roleUpdated'), 'ok'); detail(id); paint();
          },
        }, t('access.apply')))),
      h('div', { class: 'btnrow', style: 'margin-top:14px' },
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => {
            ctx.store.update((st) => {
              const usr = st.users.find((x) => x.id === id);
              usr.mfa = !usr.mfa;
              st.activity.unshift({ t: new Date().toISOString(), k: usr.mfa ? 'mfaOn' : 'mfaOff', p: { name: usr.name } });
            });
            toast(u.mfa ? t('access.mfaRemoved') : t('access.mfaEnforced'), u.mfa ? '' : 'ok');
            detail(id); paint();
          },
        }, u.mfa ? t('access.removeMfa') : t('access.enforceMfa')),
        u.keyAgeDays ? h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => {
            ctx.store.update((st) => {
              const usr = st.users.find((x) => x.id === id);
              usr.keyAgeDays = 0;
              st.activity.unshift({ t: new Date().toISOString(), k: 'keyRotated', p: { name: usr.name } });
            });
            toast(t('access.keyRotated'), 'ok'); detail(id); paint();
          },
        }, t('access.rotateKey')) : null)));

    ctx.drawer(u.name, body, { sub: `${label.team(u.team)} · ${label.directory(u.directory)}` });
  }

  paint();
  return wrap;
}

function kv(k, value) {
  return h('div', {}, h('span', { class: 'label' }, k), h('div', { class: 'sv-kv__v' }, value));
}

export default { render };
