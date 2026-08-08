/* Installable app plumbing.

   Registers the service worker, captures the install prompt, and drives an
   "Install app" control that only appears when installing is actually
   possible. On iOS there is no prompt event, so the control explains the
   Share → Add to Home Screen route instead.

   Usage in main.js:
     import { initPWA } from '../lib/pwa.js';
     initPWA({ mount: document.querySelector('.side__foot'), appName: 'Opsboard' });
*/

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9M6.5 8.5L10 12l3.5-3.5"/><path d="M3.5 15.5h13"/></svg>';

export function initPWA({ mount, appName = 'this app', swPath = './sw.js', onNote } = {}) {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(swPath).catch(() => {/* offline support is optional */});
    });
  }
  if (!mount || isStandalone()) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--block btn--sm pwa-install';
  btn.innerHTML = `${ICON}<span>Install app</span>`;
  btn.hidden = !isIOS();               // shown at once on iOS, on prompt elsewhere
  btn.title = `Install ${appName} on this device`;
  mount.appendChild(btn);

  let deferred = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    btn.hidden = true;
    if (onNote) onNote(`${appName} installed. It opens in its own window from now on.`);
  });

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome !== 'accepted' && onNote) onNote('Install dismissed — the button stays here if you change your mind.');
      deferred = null;
      return;
    }
    if (onNote) {
      onNote(isIOS()
        ? 'On iPhone and iPad: tap Share, then "Add to Home Screen".'
        : 'Use your browser menu and choose "Install app" or "Add to Home screen".');
    }
  });

  return btn;
}
