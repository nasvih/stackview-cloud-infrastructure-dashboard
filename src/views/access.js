/* Access — who can get into what, which accounts are stale, and a working
   offboarding checklist that persists. */

import { h, icon, ago, num, pct, initials, meter, confirmDialog, toast, downloadCSV } from '../../lib/ui.js';
import { OFFBOARD_STEPS, staleUsers, adminsNoMfa } from '../data.js';

const ROLE_PILL = { Admin: 'pill--bad', 'Power user': 'pill--warn', Developer: 'pill--info', 'Read only': '', Billing: '' };
const ROLES = ['Admin', 'Power user', 'Developer', 'Read only', 'Billing'];

export function render(ctx) {
  let filter = 'all';
  let q = '';

  const wrap = h('div', { class: 'stack' });
  const s = ctx.state;

  wrap.appendChild(h('div', { class: 'page-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', {}, 'Access'),
      h('p', {}, 'Human and service accounts across AWS IAM, Entra ID and the on-prem directory. An account counts as stale after 60 days without a sign in.')),
    h('div', { class: 'btnrow' },
      h('button', {
        class: 'btn', type: 'button', html: `${icon('download')}<span>Export review</span>`,
        onclick: () => {
          const rows = [['Name', 'Email', 'Team', 'Role', 'Directory', 'MFA', 'Last login', 'Days since login', 'Key age days', 'Status']];
          for (const u of ctx.store.state.users) rows.push([u.name, u.email, u.team, u.role, u.directory, u.mfa ? 'yes' : 'no', u.lastLogin.slice(0, 10), u.lastLoginDays, u.keyAgeDays || '', u.status]);
          downloadCSV('stackview-access-review.csv', rows);
          toast('Access review exported');
        },
      }))));

  const statsHost = h('div', { class: 'grid g4' });
  wrap.appendChild(statsHost);

  const chips = h('div', { class: 'card card--flat sv-filters' },
    h('div', { class: 'search' },
      h('span', { html: icon('search') }),
      h('input', { class: 'input', type: 'search', placeholder: 'Search name, email, team', 'aria-label': 'Search accounts', oninput: (e) => { q = e.target.value.trim().toLowerCase(); paint(); } })),
    ...[['all', 'Everyone'], ['admin', 'Elevated'], ['nomfa', 'No MFA'], ['stale', 'Stale'], ['service', 'Service accounts'], ['offboarding', 'Offboarding']]
      .map(([k, label]) => h('button', {
        class: `chip${filter === k ? ' is-on' : ''}`, type: 'button', 'aria-pressed': filter === k ? 'true' : 'false',
        onclick: () => { filter = k; paint(); },
      }, label)));
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
      ['Accounts', num(st.users.length), `${st.users.filter((u) => u.status === 'service').length} service accounts`],
      ['MFA coverage', pct((mfaOn / st.users.length) * 100), `${st.users.length - mfaOn} without a second factor`],
      ['Admins without MFA', num(adminsNoMfa(st).length), adminsNoMfa(st).length ? adminsNoMfa(st).map((u) => u.name).join(', ') : 'Clear'],
      ['Stale accounts', num(staleUsers(st).length), 'No sign in for 60 days or more'],
    ].forEach(([l, v, d], i) => statsHost.appendChild(h('div', { class: `stat${i === 2 && adminsNoMfa(st).length ? ' stat--accent' : ''}` },
      h('div', { class: 'stat__label' }, l),
      h('div', { class: 'stat__value sv-stat--fit' }, v),
      h('div', { class: 'stat__delta truncate' }, d))));

    [...chips.querySelectorAll('.chip')].forEach((c, i) => {
      const k = ['all', 'admin', 'nomfa', 'stale', 'service', 'offboarding'][i];
      c.classList.toggle('is-on', k === filter);
      c.setAttribute('aria-pressed', k === filter ? 'true' : 'false');
    });

    const rows = list();
    host.innerHTML = '';
    if (!rows.length) {
      host.appendChild(h('div', { class: 'empty' }, h('h3', {}, 'No accounts match'), h('p', {}, 'Try another filter.')));
      return;
    }
    host.appendChild(h('div', { class: 'tablewrap tablewrap--scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Account'), h('th', {}, 'Role'), h('th', {}, 'Directory'),
          h('th', {}, 'MFA'), h('th', {}, 'Last login'), h('th', {}, 'Access key'), h('th', {}, 'Status'))),
        h('tbody', {}, rows.map((u) => h('tr', {
          class: 'sv-row', tabindex: '0', role: 'button', 'aria-label': `Open ${u.name}`,
          onclick: () => detail(u.id),
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); detail(u.id); } },
        },
        h('td', {}, h('div', { class: 'sv-user' },
          h('span', { class: `avatar${u.status === 'service' ? '' : ' avatar--amber'}` }, u.status === 'service' ? 'SVC' : initials(u.name)),
          h('div', { style: 'min-width:0' },
            h('div', { class: 'sv-user__n truncate' }, u.name),
            h('div', { class: 'small faint truncate mono' }, u.email)))),
        h('td', {}, h('span', { class: `pill ${ROLE_PILL[u.role] || ''}` }, u.role)),
        h('td', { class: 'small' }, u.directory),
        h('td', {}, u.mfa ? h('span', { class: 'pill pill--ok' }, 'on') : h('span', { class: 'pill pill--bad' }, 'off')),
        h('td', { class: 'small mono' }, u.lastLoginDays < 1 ? 'today' : ago(u.lastLogin)),
        h('td', { class: 'small mono' }, u.keyAgeDays
          ? h('span', { class: u.keyAgeDays > 365 ? 'sv-neg' : '' }, `${num(u.keyAgeDays)}d`)
          : '—'),
        h('td', {}, u.offboarding
          ? h('span', { class: 'pill pill--warn' }, 'offboarding')
          : h('span', { class: `pill ${u.status === 'stale' ? 'pill--warn' : u.status === 'disabled' ? 'pill--bad' : ''}` }, u.status))))))));
  }

  /* ---------- detail drawer ---------- */
  function detail(id) {
    const u = ctx.store.state.users.find((x) => x.id === id);
    if (!u) return;
    const owned = ctx.store.state.resources.filter((r) => r.owner === u.name);
    const body = h('div', { class: 'stack' });

    body.appendChild(h('div', { class: 'sv-detailhead' },
      h('span', { class: `pill ${ROLE_PILL[u.role] || ''}` }, u.role),
      h('span', { class: `pill ${u.mfa ? 'pill--ok' : 'pill--bad'}` }, u.mfa ? 'MFA on' : 'MFA off'),
      h('span', { class: 'pill' }, u.directory)));

    body.appendChild(h('div', { class: 'sv-kv sv-kv--2' },
      kv('Email', u.email), kv('Team', u.team),
      kv('Last login', u.lastLoginDays < 1 ? 'today' : ago(u.lastLogin)),
      kv('Access key age', u.keyAgeDays ? `${num(u.keyAgeDays)} days` : 'no key'),
      kv('Owned resources', String(owned.length)),
      kv('Status', u.offboarding ? 'offboarding' : u.status)));

    if (!u.mfa) {
      body.appendChild(h('div', { class: 'banner' },
        h('span', { html: icon('shield') }),
        h('div', {}, 'No second factor on this account. ',
          (u.role === 'Admin' || u.role === 'Power user') ? 'It holds an elevated role, so this is the first thing to fix in the review.' : 'Enforce it before the next access review closes.')));
    }
    if (u.keyAgeDays > 365) {
      body.appendChild(h('div', { class: 'banner' },
        h('span', { html: icon('key') }),
        h('div', {}, `Access key is ${num(u.keyAgeDays)} days old. The policy is 90 days.`)));
    }

    if (owned.length) {
      body.appendChild(h('div', { class: 'card card--flat' },
        h('div', { class: 'card__head' }, h('h3', {}, 'Owns'), h('span', { class: 'pill' }, `${owned.length}`)),
        h('ul', { class: 'sv-ownlist' }, owned.slice(0, 8).map((r) => h('li', {},
          h('span', { class: 'mono small' }, r.name),
          h('span', { class: 'small faint' }, `${r.kind} · ${r.env}`))))));
    }

    /* offboarding checklist */
    const ob = u.offboarding;
    const obCard = h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Offboarding'),
        ob ? h('span', { class: 'pill pill--warn' }, `${ob.done.filter(Boolean).length}/${OFFBOARD_STEPS.length}`) : null));
    if (!ob) {
      obCard.appendChild(h('p', { class: 'small muted' }, 'Starting offboarding opens the seven step checklist and marks the account for review. Nothing is deleted in this demo.'));
      obCard.appendChild(h('button', {
        class: 'btn btn--sm', type: 'button', style: 'margin-top:12px',
        onclick: () => {
          ctx.store.update((st) => {
            const t = st.users.find((x) => x.id === id);
            t.offboarding = { started: new Date().toISOString(), done: OFFBOARD_STEPS.map(() => false) };
            st.activity.unshift({ t: new Date().toISOString(), text: `Offboarding started for ${t.name}` });
          });
          toast('Offboarding started'); detail(id); paint();
        },
      }, 'Start offboarding'));
    } else {
      obCard.appendChild(meter(ob.done.filter(Boolean).length, OFFBOARD_STEPS.length, 'ok'));
      obCard.appendChild(h('ul', { class: 'sv-check', style: 'margin-top:14px' }, OFFBOARD_STEPS.map((step, i) => {
        const cb = h('input', {
          type: 'checkbox', checked: ob.done[i] ? true : null,
          onchange: () => {
            ctx.store.update((st) => {
              const t = st.users.find((x) => x.id === id);
              t.offboarding.done[i] = !t.offboarding.done[i];
            });
            detail(id); paint();
          },
        });
        return h('li', {}, h('label', { class: 'sv-check__row' }, cb, h('span', { class: ob.done[i] ? 'sv-check__done' : '' }, step)));
      })));
      obCard.appendChild(h('div', { class: 'btnrow', style: 'margin-top:14px' },
        h('button', {
          class: 'btn btn--sm btn--primary', type: 'button',
          disabled: ob.done.every(Boolean) ? null : true,
          onclick: async () => {
            const ok = await confirmDialog(`Close the offboarding for ${u.name}. The account will show as disabled and its ${owned.length} resources stay flagged until they are reassigned.`, { title: 'Complete offboarding', okLabel: 'Complete' });
            if (!ok) return;
            ctx.store.update((st) => {
              const t = st.users.find((x) => x.id === id);
              t.status = 'disabled'; t.mfa = false; t.offboarding = null;
              st.activity.unshift({ t: new Date().toISOString(), text: `${t.name} offboarded and disabled` });
            });
            toast('Offboarding complete', 'ok'); ctx.closeDrawer(); paint();
          },
        }, 'Complete offboarding'),
        h('button', {
          class: 'btn btn--sm btn--ghost', type: 'button',
          onclick: () => {
            ctx.store.update((st) => { st.users.find((x) => x.id === id).offboarding = null; });
            toast('Offboarding cancelled'); detail(id); paint();
          },
        }, 'Cancel')));
    }
    body.appendChild(obCard);

    /* actions */
    const roleSel = h('select', { class: 'select', 'aria-label': 'Change role' },
      ROLES.map((rl) => h('option', { value: rl, selected: rl === u.role ? true : null }, rl)));
    body.appendChild(h('div', { class: 'card card--flat' },
      h('div', { class: 'card__head' }, h('h3', {}, 'Actions')),
      h('div', { class: 'field' },
        h('span', { class: 'field__label' }, 'Role'),
        h('div', { class: 'row' }, roleSel, h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => {
            const v = roleSel.value;
            ctx.store.update((st) => {
              const t = st.users.find((x) => x.id === id);
              st.activity.unshift({ t: new Date().toISOString(), text: `${t.name} role changed from ${t.role} to ${v}` });
              t.role = v;
            });
            toast('Role updated', 'ok'); detail(id); paint();
          },
        }, 'Apply'))),
      h('div', { class: 'btnrow', style: 'margin-top:14px' },
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => {
            ctx.store.update((st) => {
              const t = st.users.find((x) => x.id === id);
              t.mfa = !t.mfa;
              st.activity.unshift({ t: new Date().toISOString(), text: `MFA ${t.mfa ? 'enforced on' : 'removed from'} ${t.name}` });
            });
            toast(u.mfa ? 'MFA requirement removed' : 'MFA enforced', u.mfa ? '' : 'ok');
            detail(id); paint();
          },
        }, u.mfa ? 'Remove MFA requirement' : 'Enforce MFA'),
        u.keyAgeDays ? h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => {
            ctx.store.update((st) => {
              const t = st.users.find((x) => x.id === id);
              t.keyAgeDays = 0;
              st.activity.unshift({ t: new Date().toISOString(), text: `Access key rotated for ${t.name}` });
            });
            toast('Access key rotated', 'ok'); detail(id); paint();
          },
        }, 'Rotate access key') : null)));

    ctx.drawer(u.name, body, { sub: `${u.team} · ${u.directory}` });
  }

  paint();
  return wrap;
}

function kv(label, value) {
  return h('div', {}, h('span', { class: 'label' }, label), h('div', { class: 'sv-kv__v' }, value));
}

export default { render };
