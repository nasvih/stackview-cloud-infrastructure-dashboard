/* ============================================================
   Language, shared by the demo apps. No dependencies.

   Each app ships one dictionary file with an `en` and an `ar` half of
   identical shape (src/strings.js). This module holds the chosen language,
   resolves a key against the dictionary, paints `lang`/`dir` onto <html>, and
   renders the globe button that switches between the two.

   The apps build their DOM imperatively at start-up, so switching language
   reloads the page rather than trying to re-render in place. Everything these
   apps hold is already in localStorage, so a reload costs nothing but a frame
   — and it guarantees that every string, every aria-label and every chart axis
   comes back in the new language rather than only the parts somebody
   remembered to re-render.

   The choice is stored per app (`<app>.lang`), next to the theme key, so it
   survives "Reset demo data" the same way the theme does.
   ============================================================ */

const RTL = new Set(['ar']);

/**
 * @param {{key: string, dict: {en: object, ar: object}, fallback?: string}} options
 *   key      storage key prefix — the app name, e.g. 'slotly'
 *   dict     the two dictionaries, same shape
 *   fallback the language a missing key falls back to
 */
export function createI18n({ key, dict, fallback = 'en' }) {
  const STORAGE = `${key}.lang`;
  const EVENT = `${key}:lang`;

  const supported = Object.keys(dict);

  function read() {
    let stored = null;
    try { stored = localStorage.getItem(STORAGE); } catch (_) { stored = null; }
    return supported.includes(stored) ? stored : fallback;
  }

  let locale = read();

  /** `t('nav.today')` · `t('queue.waiting', { n: 3 })` */
  function t(path, vars) {
    const walk = (root) => String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), root);
    let value = walk(dict[locale]);
    if (value === undefined) value = walk(dict[fallback]);
    if (value === undefined) return path;
    if (typeof value === 'function') return value(vars || {});
    if (vars) return String(value).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
    return value;
  }

  /** The whole branch under a key — a list of labels, a set of options. */
  const list = (path) => {
    const walk = (root) => String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), root);
    return walk(dict[locale]) ?? walk(dict[fallback]) ?? [];
  };

  const dir = () => (RTL.has(locale) ? 'rtl' : 'ltr');

  /** Written onto <html> before the first paint, and again on every switch. */
  function apply() {
    const root = document.documentElement;
    root.setAttribute('lang', locale);
    root.setAttribute('dir', dir());
    root.classList.toggle('ar-root', RTL.has(locale));
  }

  function set(next) {
    if (!supported.includes(next) || next === locale) return;
    locale = next;
    try { localStorage.setItem(STORAGE, next); } catch (_) { /* preference is lost, the app is not */ }
    apply();
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
    /* Rebuild everything in the new language. The state lives in storage. */
    location.reload();
  }

  const GLOBE = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.2"/><path d="M2.8 10h14.4M10 2.8c1.9 2 2.9 4.5 2.9 7.2s-1 5.2-2.9 7.2c-1.9-2-2.9-4.5-2.9-7.2S8.1 4.8 10 2.8z"/></svg>';

  /**
   * The switch: one press, always showing the language you would move to —
   * "العربية" while you are reading English, "English" while you are reading
   * Arabic. Nothing is guessed from the browser or from an IP address.
   */
  function toggle() {
    const other = locale === 'ar' ? 'en' : 'ar';
    const label = other === 'ar' ? 'العربية' : 'English';
    const btn = document.createElement('button');
    btn.className = 'btn btn--ghost btn--sm langbtn';
    btn.type = 'button';
    btn.setAttribute('aria-label', other === 'ar' ? 'اقرأ هذا التطبيق بالعربية' : 'Read this app in English');
    btn.title = label;
    btn.innerHTML = `${GLOBE}<span dir="${other === 'ar' ? 'rtl' : 'ltr'}" lang="${other}">${label}</span>`;
    btn.addEventListener('click', () => set(other));
    return btn;
  }

  apply();

  return {
    t,
    list,
    toggle,
    apply,
    set,
    get locale() { return locale; },
    get dir() { return dir(); },
    get isRtl() { return RTL.has(locale); },
    /** For `toLocaleDateString` — Arabic month names, Latin digits. */
    get dateLocale() { return locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB'; },
    EVENT,
  };
}
