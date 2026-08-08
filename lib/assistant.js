/* ============================================================
   Demo assistant engine — offline, deterministic-ish, no network.
   Every answer is produced locally from the app's own demo data and a
   set of intent rules. There is no model behind it; the streaming and
   the "worked on it" trace exist so the UX reads like the real thing.

   Usage:
     import { Assistant } from './lib/assistant.js';
     const bot = new Assistant({
       name: 'Ops Copilot',
       initials: 'OC',
       greeting: 'Ask me about ...',
       suggestions: ['Where is spend going?', 'Who has admin access?'],
       intents: [
         { id:'spend', match:[/spend|cost|bill/i], trace:'scanned 1,204 line items',
           answer: (q, ctx) => ({ text:'...', table:{head:[],rows:[[]]}, meta:'' }) },
       ],
       fallbacks: ['I can look that up — try asking about X.'],
       context: () => ({ ...live app state... }),
     });
     bot.mount(document.body);            // floating launcher + panel
     bot.mountInto(el, { docked:true });  // inline panel (full-page agent view)
   ============================================================ */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rid = () => Math.random().toString(36).slice(2, 9);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Markdown-lite: **bold**, `code`, - bullets, blank-line paragraphs. */
function render(text) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  return String(text).trim().split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

function tableHTML(t) {
  if (!t || !t.rows || !t.rows.length) return '';
  const head = t.head ? `<tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : '';
  const body = t.rows.map((r) => `<tr>${r.map((c) => `<td>${String(c).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</td>`).join('')}</tr>`).join('');
  return `<table class="msg__table">${head}${body}</table>`;
}

const ICON = {
  /* launcher glyph: a minimal robot head — rounded face, two eyes, an antenna.
     Four shapes, nothing more, so it stays legible at 23px. */
  bubble: '<svg viewBox="0 0 20 20"><rect x="3.6" y="6.6" width="12.8" height="9.4" rx="3"/><path d="M10 3.2v3.4"/><circle cx="10" cy="2.6" r="1.1"/><path d="M7.7 10.6v1.6M12.3 10.6v1.6"/></svg>',
  spark: '<svg viewBox="0 0 20 20"><path d="M10 2.5l1.7 4.3 4.3 1.7-4.3 1.7L10 14.5 8.3 10.2 4 8.5l4.3-1.7z"/><path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>',
  send: '<svg viewBox="0 0 20 20"><path d="M3 10l14-6-6 14-2-6z"/></svg>',
  close: '<svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15"/></svg>',
  reset: '<svg viewBox="0 0 20 20"><path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16 3v3.5h-3.5"/></svg>',
};

export class Assistant {
  constructor(cfg) {
    this.cfg = Object.assign({
      name: 'Assistant',
      initials: 'AI',
      tag: 'Demo agent',
      greeting: 'Ask me anything about this workspace.',
      suggestions: [],
      intents: [],
      fallbacks: ['I can dig that out of the workspace data — try one of the suggestions below.'],
      note: 'Demo agent — answers are generated locally from the sample data in this app.',
      context: () => ({}),
    }, cfg);
    this.log = [];
    this.open = false;
    this.busy = false;
  }

  /* ---------- mounting ---------- */

  mount(root = document.body) {
    const fab = document.createElement('button');
    fab.className = 'assist-fab';
    fab.type = 'button';
    fab.title = `${this.cfg.name} — ask about this workspace`;
    fab.setAttribute('aria-label', `Open ${this.cfg.name}`);
    fab.innerHTML = `${ICON.bubble}<span>${esc(this.cfg.name)}</span>`;
    fab.addEventListener('click', () => this.toggle());
    root.appendChild(fab);
    this.fab = fab;

    const host = document.createElement('div');
    host.hidden = true;
    root.appendChild(host);
    this.host = host;
    this._build(host, false);

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.toggle(); }
      if (e.key === 'Escape' && this.open) this.toggle(false);
    });
    return this;
  }

  mountInto(el, { docked = true } = {}) {
    this.host = el;
    this.open = true;
    this._build(el, docked);
    return this;
  }

  toggle(force) {
    this.open = force === undefined ? !this.open : force;
    this.host.hidden = !this.open;
    if (this.fab) this.fab.hidden = this.open;
    if (this.open) setTimeout(() => this.input && this.input.focus(), 30);
  }

  _build(host, docked) {
    host.innerHTML = `
      <section class="assist${docked ? ' assist--docked' : ''}" role="dialog" aria-label="${esc(this.cfg.name)}">
        <header class="assist__head">
          <span class="msg__av" style="background:var(--amber-fill);color:var(--on-amber)">${esc(this.cfg.initials)}</span>
          <div style="flex:1;min-width:0">
            <h3>${esc(this.cfg.name)}</h3>
            <div class="label" style="letter-spacing:.08em">${esc(this.cfg.tag)}</div>
          </div>
          <button class="btn btn--ghost btn--icon" data-act="reset" title="Clear conversation">${ICON.reset}</button>
          ${docked ? '' : `<button class="btn btn--ghost btn--icon" data-act="close" title="Close">${ICON.close}</button>`}
        </header>
        <div class="assist__log" data-log></div>
        <div class="assist__suggest" data-suggest></div>
        <form class="assist__form" data-form>
          <input class="input" placeholder="Ask something…" autocomplete="off" data-input>
          <button class="btn btn--primary btn--icon" type="submit" title="Send">${ICON.send}</button>
        </form>
        <div class="assist__note">${esc(this.cfg.note)}</div>
      </section>`;

    this.logEl = host.querySelector('[data-log]');
    this.suggestEl = host.querySelector('[data-suggest]');
    this.input = host.querySelector('[data-input]');
    host.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = this.input.value.trim();
      if (v) { this.input.value = ''; this.ask(v); }
    });
    host.querySelector('[data-act="reset"]').addEventListener('click', () => this.reset());
    const close = host.querySelector('[data-act="close"]');
    if (close) close.addEventListener('click', () => this.toggle(false));

    this.reset();
  }

  /* ---------- conversation ---------- */

  reset() {
    this.log = [];
    this.logEl.innerHTML = '';
    this._push('bot', render(this.cfg.greeting), '');
    this._suggest(this.cfg.suggestions);
  }

  _suggest(list) {
    this.suggestEl.innerHTML = (list || []).slice(0, 4)
      .map((s) => `<button class="chip" type="button">${esc(s)}</button>`).join('');
    [...this.suggestEl.querySelectorAll('.chip')].forEach((c) => {
      c.addEventListener('click', () => this.ask(c.textContent));
    });
  }

  _push(who, html, meta) {
    const el = document.createElement('div');
    el.className = `msg msg--${who === 'me' ? 'me' : 'bot'}`;
    el.innerHTML = `<span class="msg__av">${who === 'me' ? 'You' : esc(this.cfg.initials)}</span>
      <div class="msg__body">${html}${meta ? `<div class="msg__meta">${esc(meta)}</div>` : ''}</div>`;
    this.logEl.appendChild(el);
    this.logEl.scrollTop = this.logEl.scrollHeight;
    return el.querySelector('.msg__body');
  }

  async ask(q) {
    if (this.busy) return;
    this.busy = true;
    this.suggestEl.innerHTML = '';
    this._push('me', `<p>${esc(q)}</p>`, '');

    const thinking = this._push('bot', '<span class="thinking"><i></i><i></i><i></i></span>', '');
    const hit = this._route(q);
    const ctx = this.cfg.context() || {};
    let out;
    try { out = typeof hit.answer === 'function' ? hit.answer(q, ctx) : hit.answer; }
    catch (err) { out = { text: 'That query hit an edge of the demo data set. Try one of the suggestions.' }; }
    if (typeof out === 'string') out = { text: out };
    out = out || { text: pick(this.cfg.fallbacks) };

    await wait(320 + Math.random() * 480);
    thinking.innerHTML = '';

    /* stream the text out word by word */
    const html = render(out.text || '');
    const words = html.split(/(\s+)/);
    let acc = '';
    for (let i = 0; i < words.length; i++) {
      acc += words[i];
      thinking.innerHTML = acc;
      this.logEl.scrollTop = this.logEl.scrollHeight;
      if (i % 3 === 0) await wait(12 + Math.random() * 26);
    }
    if (out.table) thinking.innerHTML += tableHTML(out.table);
    const trace = out.meta || hit.trace;
    if (trace) thinking.innerHTML += `<div class="msg__meta">${esc(trace)} · ${(0.3 + Math.random() * 1.4).toFixed(2)}s</div>`;

    /* An answer may carry actions: things the agent can actually do to the
       workspace. They are never applied silently — the reader presses the
       button, the change lands, and the result is reported back in the log. */
    if (out.actions && out.actions.length) this._renderActions(thinking, out.actions);

    this.logEl.scrollTop = this.logEl.scrollHeight;
    this._suggest(out.suggestions || hit.suggestions || this.cfg.suggestions);
    this.busy = false;
    if (out.then) try { out.then(); } catch (_) {}
  }

  _renderActions(body, actions) {
    const row = document.createElement('div');
    row.className = 'msg__actions';
    actions.forEach((a, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn--sm${i === 0 ? ' btn--primary' : ''}`;
      btn.textContent = a.label;
      btn.addEventListener('click', async () => {
        [...row.querySelectorAll('button')].forEach((b) => { b.disabled = true; });
        btn.textContent = a.doingLabel || 'Working…';
        let result;
        try { result = await a.run(); } catch (err) { result = { text: 'That could not be applied — the record may have changed since I read it.' }; }
        if (typeof result === 'string') result = { text: result };
        row.remove();
        const done = this._push('bot', '', '');
        done.innerHTML = render(result.text || 'Done.');
        if (result.table) done.innerHTML += tableHTML(result.table);
        done.innerHTML += `<div class="msg__meta">${esc(result.meta || 'change applied to this browser')}</div>`;
        if (result.actions && result.actions.length) this._renderActions(done, result.actions);
        if (result.suggestions) this._suggest(result.suggestions);
        if (result.then) try { result.then(); } catch (_) {}
        this.logEl.scrollTop = this.logEl.scrollHeight;
      });
      row.appendChild(btn);
    });
    body.appendChild(row);
  }

  _route(q) {
    const text = q.toLowerCase();
    let best = null; let bestScore = 0;
    for (const it of this.cfg.intents) {
      let score = 0;
      for (const m of [].concat(it.match || [])) {
        if (m instanceof RegExp) { if (m.test(q)) score += 2; }
        else if (typeof m === 'string' && text.includes(m.toLowerCase())) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = it; }
    }
    if (best) return best;
    return { answer: () => ({ text: pick(this.cfg.fallbacks), suggestions: this.cfg.suggestions }), trace: 'searched the workspace index' };
  }
}

export { pick, esc, render as renderMarkdownLite };
