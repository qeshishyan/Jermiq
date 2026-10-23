/* The finder uses the same public catalog and confirmed model links as the store. */
(() => {
  'use strict';
  const root = document.querySelector('[data-part-finder]');
  const shared = window.Jermiq;
  if (!root || !shared) return;
  let data;
  try { data = JSON.parse(document.querySelector('#finder-data').textContent); }
  catch { return; } // Server-rendered forms remain usable if enhancement cannot start.
  const { $, $$, escape, t, link } = shared;
  const products = Array.isArray(data.products) ? data.products : [];
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const models = Array.isArray(data.models) ? data.models : [];
  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replaceAll('և', 'եւ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const compact = value => normalize(value).replaceAll(' ', '');
  const codeForm = $('#finder-code-form', root), modelForm = $('#finder-model-form', root);
  const queryInput = $('#finder-query', root), categoryInput = $('#finder-category', root);
  const brandInput = $('#finder-brand', root), modelInput = $('#finder-model', root);
  const results = $('#finder-results', root), resultsSection = $('[data-finder-results]', root);
  let state = fromUrl(), debounce;

  function fromUrl() {
    const query = new URL(location.href).searchParams;
    return { mode: ['code', 'model', 'photo'].includes(query.get('mode')) ? query.get('mode') : '', q: (query.get('q') || '').slice(0, 200), category: (query.get('category') || '').slice(0, 80), brand: (query.get('brand') || '').slice(0, 160), model: (query.get('model') || '').slice(0, 80) };
  }
  function urlState(push = false) {
    const url = new URL(location.href);
    for (const key of ['mode', 'q', 'category', 'brand', 'model']) state[key] ? url.searchParams.set(key, state[key]) : url.searchParams.delete(key);
    if (url.href !== location.href) history[push ? 'pushState' : 'replaceState']({}, '', url.pathname + url.search + url.hash);
  }
  function descendants(id) {
    const ids = new Set([id]);
    for (let added = true; added;) {
      added = false;
      for (const c of categories) if (ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); added = true; }
    }
    return ids;
  }
  function categoryModels() {
    const ids = state.category ? descendants(state.category) : null;
    return models.filter(model => !ids || ids.has(model.categoryId));
  }
  function codes(product) {
    return [product.sku, ...(product.replacementCodes || []), ...Object.entries(product.specs || {}).filter(([key]) => ['կոդ', 'code', 'код', 'артикул'].some(word => normalize(key).includes(word))).map(([, value]) => value)].filter(Boolean);
  }
  function exactCode(product, value) { return codes(product).some(code => compact(code) === compact(value)); }
  function matches(product, value) {
    const text = normalize([product.title, product.description, product.brand, product.model, product.slug, product.keywords, product.sku, product.manufacturer, product.volume, ...(product.replacementCodes || []), ...Object.keys(product.specs || {}), ...Object.values(product.specs || {})].join(' '));
    return normalize(value).split(' ').filter(Boolean).every(word => text.includes(word)) || compact(value).length >= 2 && codes(product).some(code => compact(code).includes(compact(value)));
  }
  function options(entries, selected, empty, label) {
    return `<option value="">${escape(t(empty))}</option>` + entries.map(item => `<option value="${escape(item.id)}" ${item.id === selected ? 'selected' : ''}>${escape(label(item))}</option>`).join('');
  }
  function updateModels() {
    const available = categoryModels();
    const brands = [...new Set(available.map(model => model.brand))].sort((a, b) => a.localeCompare(b));
    if (state.brand && !brands.includes(state.brand)) { state.brand = ''; state.model = ''; }
    brandInput.innerHTML = options(brands.map(brand => ({ id: brand })), state.brand, 'Ընտրեք բրենդը', item => item.id);
    const filtered = available.filter(model => !state.brand || model.brand === state.brand).sort((a, b) => [a.series, a.name].join(' ').localeCompare([b.series, b.name].join(' ')));
    if (state.model && !filtered.some(model => model.id === state.model)) state.model = '';
    modelInput.innerHTML = options(filtered, state.model, 'Ընտրեք մոդելը', item => [state.brand ? '' : item.brand, item.series, item.name].filter(Boolean).join(' '));
    brandInput.disabled = brands.length === 0;
    modelInput.disabled = filtered.length === 0;
    $('[data-finder-model-help]', root).hidden = available.length > 0;
  }
  function refreshActions() {
    if (shared.refreshProductActions) shared.refreshProductActions(results);
    else shared.icons(results);
  }
  function render() {
    root.dataset.finderActive = state.mode;
    queryInput.value = state.q;
    categoryInput.value = state.category;
    updateModels();
    $$('[data-finder-panel]', root).forEach(panel => { panel.hidden = panel.dataset.finderPanel !== state.mode; });
    $$('[data-finder-mode]', root).forEach(anchor => {
      const selected = anchor.dataset.finderMode === state.mode;
      anchor.classList.toggle('is-selected', selected);
      selected ? anchor.setAttribute('aria-current', 'step') : anchor.removeAttribute('aria-current');
    });
    $('[data-finder-reset]', root).hidden = !state.mode;
    const selectedModel = models.find(model => model.id === state.model);
    const searched = state.mode === 'code' ? normalize(state.q).length >= 2 : state.mode === 'model' && !!selectedModel;
    const list = !searched ? [] : state.mode === 'model'
      ? products.filter(product => (product.compatibleModelIds || []).includes(state.model))
      : products.filter(product => matches(product, state.q)).sort((a, b) => Number(exactCode(b, state.q)) - Number(exactCode(a, state.q)) || Number(normalize(b.title).includes(normalize(state.q))) - Number(normalize(a.title).includes(normalize(state.q))));
    resultsSection.hidden = !searched || state.mode === 'photo';
    results.innerHTML = list.slice(0, 12).map(product => shared.productCard(product)).join('');
    $('#finder-result-count', root).textContent = `${list.length} ${t('ապրանք')}`;
    $('[data-finder-empty]', root).hidden = list.length > 0;
    $('[data-finder-match-note]', root).textContent = t(state.mode === 'model' ? 'Ապրանքները կապված են ընտրված մոդելի հետ։ Համեմատեք նաև չափերն ու ամրացումը։' : 'Սրանք որոնման արդյունքներն են։ Գնելուց առաջ համեմատեք մոդելը, չափերն ու ամրացումը։');
    const more = $('[data-finder-more]', root);
    more.hidden = list.length <= 12;
    more.href = link(state.mode === 'model' ? '/parts?model=' + encodeURIComponent(state.model) : '/parts?q=' + encodeURIComponent(state.q));
    $('[data-finder-status]', root).textContent = state.mode === 'code' && state.q.length > 0 && !searched ? t('Գրեք առնվազն երկու նիշ՝ որոնումը սկսելու համար։') : '';
    const current = !state.mode ? 0 : searched ? 2 : 1;
    $$('[data-finder-step]', root).forEach((step, index) => { step.classList.toggle('is-current', index === current); step.classList.toggle('is-complete', index < current); if (index === current) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current'); });
    refreshActions();
  }
  function focusPanel() {
    const panel = $$('[data-finder-panel]', root).find(item => !item.hidden);
    const target = panel?.querySelector('[data-finder-focus]') || $('#finder-path-title', root);
    target?.focus({ preventScroll: true });
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    panel?.scrollIntoView?.({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest' });
  }
  root.addEventListener('click', event => {
    const modeLink = event.target.closest('[data-finder-mode]');
    if (modeLink && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
      event.preventDefault(); clearTimeout(debounce); state.mode = modeLink.dataset.finderMode; render(); urlState(true); focusPanel();
    }
    if (event.target.closest('[data-finder-reset]')) {
      event.preventDefault(); clearTimeout(debounce); state = { mode: '', q: '', category: '', brand: '', model: '' }; render(); urlState(true); $('#finder-path-title', root).setAttribute('tabindex', '-1'); $('#finder-path-title', root).focus();
    }
    if (event.target.closest('[data-finder-photo-start]') && shared.openRequest) {
      const model = models.find(item => item.id === state.model), category = categories.find(item => item.id === state.category);
      const context = [t('Գտնենք ճիշտ մասը'), state.q ? t('Որոնում') + ': ' + state.q : '', category?.title, model ? [model.brand, model.series, model.name].filter(Boolean).join(' ') : state.brand].filter(Boolean).join('\n');
      shared.openRequest({ kind: 'part', subject: t('Լուսանկարով պահեստամասի ընտրություն'), details: context });
      const form = document.querySelector('#site-dialog .request-form');
      if (form?.elements.brand) form.elements.brand.value = (model?.brand || state.brand).slice(0, 100);
      if (form?.elements.model) form.elements.model.value = (model ? [model.series, model.name].filter(Boolean).join(' ') : state.q).slice(0, 100);
    }
  });
  codeForm.addEventListener('submit', event => {
    event.preventDefault(); clearTimeout(debounce); state.q = queryInput.value.trim(); state.mode = 'code'; render(); urlState(true);
    if (!resultsSection.hidden) $('#finder-results-title', root).focus(); else queryInput.focus();
  });
  queryInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = queryInput.value.trim(); render(); urlState(); }, 220);
  });
  categoryInput.addEventListener('change', () => { state.category = categoryInput.value; state.brand = ''; state.model = ''; render(); urlState(true); });
  brandInput.addEventListener('change', () => { state.brand = brandInput.value; state.model = ''; render(); urlState(true); });
  modelInput.addEventListener('change', () => { state.model = modelInput.value; render(); urlState(true); });
  modelForm.addEventListener('submit', event => {
    event.preventDefault(); state.mode = 'model'; state.category = categoryInput.value; state.brand = brandInput.value; state.model = modelInput.value; render(); urlState(true);
    if (!resultsSection.hidden) $('#finder-results-title', root).focus(); else modelInput.focus();
  });
  window.addEventListener('popstate', () => { clearTimeout(debounce); state = fromUrl(); render(); });
  if (shared.openRequest) { $('[data-finder-photo-start]', root).hidden = false; $('[data-finder-photo-fallback]', root).hidden = true; }
  root.classList.add('finder-enhanced');
  render();
})();
