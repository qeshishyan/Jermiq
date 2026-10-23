/* Progressive motion for guided shopping. No animation is required to use the page. */
(() => {
  'use strict';
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  document.addEventListener('jermiq:cart-updated', () => {
    const cart = document.querySelector('.header-actions a[href^="/cart"] .store-action-icon');
    if (!cart || preference?.matches || typeof cart.animate !== 'function') return;
    cart.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: .45 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.2,.75,.3,1)' });
  });
  if (!document.querySelector('.store-home')) return;
  const hover = window.matchMedia?.('(hover: hover) and (pointer: fine)');
  let observer, frame = 0, pointerCleanup;
  const root = document.documentElement;
  const candidates = [...document.querySelectorAll('[data-marketing-reveal], .store-home .store-section>.section-heading, .store-home .store-category-card, .store-home .store-product, .store-home .article-card')];
  const show = element => { element.classList.add('is-visible'); observer?.unobserve(element); };
  const revealFocused = event => { const target = event.target.closest?.('[data-marketing-reveal]'); if (target) show(target); };
  candidates.forEach((element, index) => {
    element.setAttribute('data-marketing-reveal', '');
    element.style.setProperty('--marketing-delay', `${(index % 3) * 45}ms`);
  });
  function stop() {
    observer?.disconnect(); observer = undefined;
    root.classList.remove('has-motion');
    pointerCleanup?.(); pointerCleanup = undefined;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function start() {
    stop();
    if (preference?.matches) return;
    if ('IntersectionObserver' in window) {
      try {
        observer = new IntersectionObserver(entries => {
          entries.forEach(entry => { if (entry.isIntersecting) show(entry.target); });
        }, { threshold: 0.06, rootMargin: '0px 0px 60px 0px' });
        candidates.forEach(element => observer.observe(element));
        root.classList.add('has-motion');
      } catch { observer?.disconnect(); observer = undefined; }
    }
    const hero = document.querySelector('[data-marketing-hero]');
    if (!hero || !hover?.matches) return;
    let point = null;
    const reset = () => {
      point = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      hero.style.removeProperty('--hero-shift-x'); hero.style.removeProperty('--hero-shift-y');
    };
    const move = event => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      point = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!point) return;
        const rect = hero.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = Math.max(-1, Math.min(1, (point.x - rect.left) / rect.width * 2 - 1));
        const y = Math.max(-1, Math.min(1, (point.y - rect.top) / rect.height * 2 - 1));
        hero.style.setProperty('--hero-shift-x', `${(x * 4).toFixed(2)}px`);
        hero.style.setProperty('--hero-shift-y', `${(y * 3).toFixed(2)}px`);
      });
    };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    pointerCleanup = () => { hero.removeEventListener('pointermove', move); hero.removeEventListener('pointerleave', reset); window.removeEventListener('blur', reset); reset(); };
  }
  document.addEventListener('focusin', revealFocused);
  preference?.addEventListener('change', start);
  hover?.addEventListener('change', start);
  window.addEventListener('pagehide', stop, { once: true });
  start();
})();
