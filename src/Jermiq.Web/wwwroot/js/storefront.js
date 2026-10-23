/* Progressive enhancements; catalog filtering and model selection work without JavaScript. */
(() => {
  'use strict';
  document.documentElement.classList.add('store-ready');
  document.querySelectorAll('[data-store-autosubmit]').forEach(input => input.addEventListener('change', () => input.form?.requestSubmit()));
  const menu = document.querySelector('.store-mega');
  if (menu) {
    document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary')?.focus(); } });
  }
  const filters = document.querySelector('.store-mobile-filters');
  if (filters && !location.search.includes('spec=')) filters.open = matchMedia('(min-width: 861px)').matches;
})();
