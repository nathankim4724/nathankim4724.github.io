/* Light / dark theme, shared by every page.
 *
 * Loaded synchronously in <head>, not deferred, so the saved choice lands on
 * <html> before the first paint -- a dark-mode visitor never sees a flash of
 * white. The page opens light unless the visitor has chosen dark here before;
 * the choice is kept in localStorage under `theme`.
 *
 * The button is hidden in the markup and only revealed once this runs, so
 * without JavaScript there is no button that does nothing (and the page simply
 * stays light, which is also what the <noscript> coral fallback is drawn for).
 */
(() => {
  'use strict';

  const STORE = 'theme';
  const root = document.documentElement;

  // localStorage can throw (blocked storage, some private modes); stay light.
  let dark = false;
  try { dark = localStorage.getItem(STORE) === 'dark'; } catch (e) {}

  const apply = () => { root.dataset.theme = dark ? 'dark' : 'light'; };
  apply();

  const wire = () => {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    const sync = () => {
      btn.setAttribute('aria-pressed', dark);
      btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    };
    sync();
    btn.hidden = false;
    btn.addEventListener('click', () => {
      dark = !dark;
      try { localStorage.setItem(STORE, dark ? 'dark' : 'light'); } catch (e) {}
      apply();
      sync();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
