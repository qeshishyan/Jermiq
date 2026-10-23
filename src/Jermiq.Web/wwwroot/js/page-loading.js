// A small navigation cue for full-page requests. Native navigation always remains in charge.
(() => {
  'use strict';
  const indicator = document.querySelector('[data-page-loading]');
  const announcement = document.querySelector('[data-page-loading-status]');
  const main = document.querySelector('#main');
  if (!indicator || !announcement) return;

  let revealTimer, recoveryTimer, previousBusy, ownsBusy = false;
  const reset = () => {
    clearTimeout(revealTimer);
    clearTimeout(recoveryTimer);
    indicator.hidden = true;
    announcement.textContent = '';
    if (ownsBusy && main) {
      if (previousBusy === null) main.removeAttribute('aria-busy');
      else main.setAttribute('aria-busy', previousBusy);
    }
    ownsBusy = false;
  };
  const start = () => {
    reset();
    // Quick requests need no flash, and slow requests never wait for an animation.
    revealTimer = setTimeout(() => {
      indicator.hidden = false;
      announcement.textContent = announcement.dataset.message || '';
      if (main) {
        previousBusy = main.getAttribute('aria-busy');
        main.setAttribute('aria-busy', 'true');
        ownsBusy = true;
      }
    }, 180);
    // Browser stop buttons and canceled beforeunload prompts have no reliable event.
    recoveryTimer = setTimeout(reset, 12000);
  };
  const targetIsCurrent = target => !target || target.toLowerCase() === '_self';
  const baseTarget = () => document.querySelector('base[target]')?.getAttribute('target') || '';
  const isPageDestination = (raw, isLink) => {
    if (typeof raw !== 'string' || (isLink && (!raw.trim() || raw.trim().startsWith('#')))) return false;
    let url;
    try { url = new URL(raw || location.href, document.baseURI); }
    catch { return false; }
    if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) return false;
    if (isLink && url.pathname === location.pathname && url.search === location.search && url.hash) return false;
    // Attachment endpoints and file links are handled by the browser download/viewer UI.
    if (url.pathname.startsWith('/api/') || /\.(?:pdf|zip|rar|7z|csv|xlsx?|docx?|png|jpe?g|gif|webp|svg|avif|mp4|mp3)$/i.test(url.pathname)) return false;
    return true;
  };
  const schedule = event => {
    // Other listeners (including delegated AJAX handlers) may still cancel this action.
    setTimeout(() => { if (!event.defaultPrevented) start(); }, 0);
  };

  window.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || anchor.hasAttribute('download') || anchor.relList?.contains('external') || anchor.closest('[data-no-page-loading]')) return;
    if (!targetIsCurrent(anchor.getAttribute('target') ?? baseTarget())) return;
    if (isPageDestination(anchor.getAttribute('href'), true)) schedule(event);
  });
  window.addEventListener('submit', event => {
    if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
    const form = event.target, submitter = event.submitter;
    if (form.closest('dialog, [data-no-page-loading]') || form.matches('[data-ajax], .request-form, .store-checkout-form')) return;
    const method = submitter?.getAttribute('formmethod') || form.getAttribute('method') || 'get';
    const target = submitter?.getAttribute('formtarget') ?? form.getAttribute('target') ?? baseTarget();
    const action = submitter?.getAttribute('formaction') ?? form.getAttribute('action') ?? location.href;
    if (method.toLowerCase() !== 'get' || !targetIsCurrent(target) || !form.checkValidity()) return;
    if (isPageDestination(action, false)) schedule(event);
  });
  window.addEventListener('pageshow', reset);
  window.addEventListener('pagehide', reset);
  window.addEventListener('popstate', reset);
  window.addEventListener('hashchange', reset);
  window.addEventListener('load', reset);
  window.addEventListener('keydown', event => { if (event.key === 'Escape') reset(); });
})();
