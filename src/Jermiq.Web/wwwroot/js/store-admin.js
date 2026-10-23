/* Store structure editor. Writes use the shared CSRF client and optimistic revisions. */
(() => {
  'use strict';
  const shared = window.Jermiq;
  if (!shared) return;
  const { $, $$, api, escape, icons, t } = shared;
  const navTemplate = $('#store-admin-nav-template');
  if (navTemplate) {
    const sidebar = $('.office-sidebar');
    sidebar?.insertBefore(navTemplate.content.cloneNode(true), $('.office-sidebar-bottom', sidebar));
    if (sidebar) icons(sidebar);
  }
  const root = $('#store-admin-app');
  if (!root) return;
  let config = null, products = [], busy = false, categoryId = null, modelId = null;
  const drafts = new Set();
  const categoryForm = $('#store-category-form'), modelForm = $('#store-model-form');
  const homeForm = $('#store-home-form'), informationForm = $('#store-information-form');
  const homeFields = ['eyebrow', 'title', 'intro', 'heroImage', 'photoHelpTitle', 'photoHelpText', 'featuredTitle', 'wholesaleTitle', 'wholesaleText'];
  const error = message => { $('#store-error').textContent = message; $('#store-error').hidden = !message; };
  const notice = message => { $('#store-notice').textContent = message; $('#store-notice').hidden = !message; };
  const clone = value => structuredClone(value);
  function syncDrafts() {
    $$('[data-store-draft]', root).forEach(el => {
      const dirty = drafts.has(el.dataset.storeDraft);
      el.textContent = t(dirty ? 'Չպահպանված փոփոխություններ' : 'Պահպանված տարբերակ');
      el.classList.toggle('has-changes', dirty);
    });
  }
  function discard() {
    if (!drafts.size) return true;
    if (!confirm(t('Հրաժարվե՞լ չպահպանված փոփոխություններից։'))) return false;
    const changed = new Set(drafts); drafts.clear();
    if (config) {
      if (changed.has(categoryForm.id)) fillCategory(config.categories.find(c => c.id === categoryId) || null);
      if (changed.has(modelForm.id)) fillModel(config.equipmentModels.find(m => m.id === modelId) || null);
      if (changed.has(homeForm.id) || changed.has(informationForm.id)) fillContent();
    }
    syncDrafts();
    return true;
  }
  function setBusy(value) {
    busy = value; root.setAttribute('aria-busy', String(value));
    $$('form', root).forEach(form => { form.inert = value; });
    $$('button', root).forEach(button => { button.disabled = value; });
  }
  async function run(fn) {
    if (busy) return;
    setBusy(true); error(''); notice('');
    try { await fn(); }
    catch (err) { error(err.message); }
    finally { setBusy(false); }
  }
  root.addEventListener('input', event => {
    const form = event.target.closest('form');
    if (form?.id) { drafts.add(form.id); syncDrafts(); }
  });
  root.addEventListener('change', event => {
    const form = event.target.closest('form');
    if (form?.id) { drafts.add(form.id); syncDrafts(); }
  });
  root.addEventListener('click', event => { if (busy) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  window.addEventListener('beforeunload', event => { if (drafts.size) { event.preventDefault(); event.returnValue = ''; } });
  const sortCategories = entries => [...entries].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'hy'));
  function categoryTree() {
    const result = [], seen = new Set();
    const append = (parentId, depth) => {
      for (const category of sortCategories(config.categories.filter(x => (x.parentId || '') === parentId))) {
        if (seen.has(category.id)) continue;
        seen.add(category.id); result.push({ category, depth }); append(category.id, depth + 1);
      }
    };
    append('', 0);
    for (const category of config.categories) if (!seen.has(category.id)) result.push({ category, depth: 0 });
    return result;
  }
  const categoryName = id => config.categories.find(x => x.id === id)?.title || id;
  function categoryOptions(value, exclude = '') {
    const forbidden = new Set(exclude ? [exclude] : []);
    for (let changed = true; changed;) {
      changed = false;
      for (const c of config.categories) if (forbidden.has(c.parentId) && !forbidden.has(c.id)) { forbidden.add(c.id); changed = true; }
    }
    return `<option value="">${escape(t('Գլխավոր մակարդակ'))}</option>` + categoryTree().filter(({ category }) => !forbidden.has(category.id)).map(({ category: c, depth }) => `<option value="${escape(c.id)}" ${c.id === value ? 'selected' : ''}>${escape('— '.repeat(depth) + c.title + (c.published ? '' : ' · ' + t('Թաքցված')))}</option>`).join('');
  }
  function renderCategories() {
    const query = $('#store-category-search').value.trim().toLocaleLowerCase();
    const entries = categoryTree().filter(({ category: c }) => [c.title, c.id].join(' ').toLocaleLowerCase().includes(query));
    $('#store-category-count').textContent = config.categories.length;
    $('#store-categories-list').innerHTML = entries.map(({ category: c, depth }) => `<div class="store-category-row ${c.id === categoryId ? 'active' : ''}" style="--depth:${Math.min(depth, 8)}"><button type="button" class="store-row-select" data-category-edit="${escape(c.id)}"><strong>${escape(c.title)} <span class="store-visibility ${c.published ? '' : 'hidden-state'}">${escape(t(c.published ? 'Հրապարակված' : 'Թաքցված'))}</span></strong><small>${escape(c.id)} · ${products.filter(p => p.catalogCategoryId === c.id).length} ${escape(t('ապրանք'))}</small></button><div class="store-row-order"><button type="button" data-category-move="${escape(c.id)}" data-direction="-1" aria-label="${escape(t('Տեղափոխել վերև') + ': ' + c.title)}">↑</button><button type="button" data-category-move="${escape(c.id)}" data-direction="1" aria-label="${escape(t('Տեղափոխել ներքև') + ': ' + c.title)}">↓</button></div></div>`).join('') || `<p class="store-empty">${escape(t('Կատեգորիա չի գտնվել։'))}</p>`;
  }
  function fillCategory(category) {
    categoryId = category?.id || null;
    const c = category || { id: '', title: '', parentId: '', description: '', image: '/images/parts.webp', sortOrder: config.categories.length * 10, published: true };
    categoryForm.hidden = false;
    for (const field of ['id', 'title', 'description', 'image', 'sortOrder']) categoryForm.elements[field].value = c[field] ?? '';
    categoryForm.elements.id.readOnly = !!category;
    categoryForm.elements.parentId.innerHTML = categoryOptions(c.parentId || '', c.id);
    categoryForm.elements.published.checked = c.published !== false;
    $('#store-category-editor-title').textContent = c.title || t('Նոր կատեգորիա');
    $('#store-category-delete').hidden = !category;
    const usage = products.filter(p => p.catalogCategoryId === c.id).length;
    $('#store-category-usage').textContent = category ? `${usage} ${t('ապրանք այս կատեգորիայում։ Ապրանքներին կապված կատեգորիան հեռացնելուց առաջ փոխեք նրանց կատեգորիան։')}` : t('Կոդը գրեք լատինատառ փոքր տառերով, թվերով և գծիկներով։');
    const preview = $('#store-category-image'); preview.hidden = !c.image; if (c.image) preview.src = c.image;
    $('input[type=file]', categoryForm).value = '';
    drafts.delete(categoryForm.id); syncDrafts(); renderCategories();
  }
  function renderModels() {
    const query = $('#store-model-search').value.trim().toLocaleLowerCase();
    const entries = [...config.equipmentModels].sort((a, b) => [a.brand, a.series, a.name].join(' ').localeCompare([b.brand, b.series, b.name].join(' '))).filter(m => [m.id, m.name, m.brand, m.series].join(' ').toLocaleLowerCase().includes(query));
    $('#store-model-count').textContent = config.equipmentModels.length;
    $('#store-models-list').innerHTML = entries.map(m => `<div class="store-category-row ${m.id === modelId ? 'active' : ''}"><button type="button" class="store-row-select" data-model-edit="${escape(m.id)}"><strong>${escape(m.brand + ' · ' + m.name)} <span class="store-visibility ${m.published ? '' : 'hidden-state'}">${escape(t(m.published ? 'Հրապարակված' : 'Թաքցված'))}</span></strong><small>${escape([m.series, categoryName(m.categoryId)].filter(Boolean).join(' · '))}</small></button></div>`).join('') || `<p class="store-empty">${escape(t('Մոդելներ չկան։ Ավելացրեք հաստատված մոդելը և կապեք համապատասխան պահեստամասերը ապրանքի խմբագրիչից։'))}</p>`;
  }
  function fillModel(model) {
    modelId = model?.id || null;
    const m = model || { id: '', categoryId: '', brand: '', series: '', name: '', published: true };
    modelForm.hidden = false;
    for (const field of ['id', 'brand', 'series', 'name']) modelForm.elements[field].value = m[field] || '';
    modelForm.elements.id.readOnly = !!model;
    modelForm.elements.categoryId.innerHTML = categoryOptions(m.categoryId).replace(escape(t('Գլխավոր մակարդակ')), escape(t('Ընտրեք կատեգորիան')));
    modelForm.elements.published.checked = m.published !== false;
    $('#store-model-editor-title').textContent = m.name || t('Նոր մոդել');
    $('#store-model-delete').hidden = !model;
    $('#store-model-usage').textContent = model ? `${products.filter(p => p.compatibleModelIds?.includes(m.id)).length} ${t('համատեղելի ապրանք։ Կապերը խմբագրվում են ապրանքի էջից։')}` : t('Համատեղելիությունը լրացրեք միայն հաստատված տվյալների հիման վրա։');
    drafts.delete(modelForm.id); syncDrafts(); renderModels();
  }
  function fillContent() {
    for (const field of homeFields) homeForm.elements[field].value = config.home[field] || '';
    for (const field of ['paymentText', 'aboutText']) informationForm.elements[field].value = config[field] || '';
    $('input[type=file]', homeForm).value = '';
    drafts.delete(homeForm.id); drafts.delete(informationForm.id); syncDrafts();
  }
  async function load() {
    const [saved, admin] = await Promise.all([api('/api/admin/store-catalog', { cache: 'no-store' }), api('/api/admin', { cache: 'no-store' })]);
    config = saved; products = admin.products;
    renderCategories(); renderModels(); fillContent();
    if (categoryId && config.categories.some(c => c.id === categoryId)) fillCategory(config.categories.find(c => c.id === categoryId));
    else if (config.categories.length) fillCategory(sortCategories(config.categories)[0]);
    else fillCategory(null);
    if (modelId && config.equipmentModels.some(m => m.id === modelId)) fillModel(config.equipmentModels.find(m => m.id === modelId));
    else if (config.equipmentModels.length) fillModel(config.equipmentModels[0]);
    else modelForm.hidden = true;
  }
  async function save(next, formId) {
    const saved = await api('/api/admin/store-catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    config = saved; drafts.delete(formId); syncDrafts(); renderCategories(); renderModels(); notice(t('Փոփոխությունները պահպանված են։'));
  }
  $('#store-refresh').addEventListener('click', () => { if (discard()) void run(load); });
  $('#store-category-search').addEventListener('input', () => { if (config) renderCategories(); });
  $('#store-model-search').addEventListener('input', () => { if (config) renderModels(); });
  $('#store-category-new').addEventListener('click', () => { if (config && discard()) { fillCategory(null); categoryForm.elements.title.focus(); } });
  $('#store-model-new').addEventListener('click', () => { if (config && discard()) { fillModel(null); modelForm.elements.name.focus(); } });
  $('#store-categories-list').addEventListener('click', event => {
    const edit = event.target.closest('[data-category-edit]');
    if (edit && discard()) fillCategory(config.categories.find(c => c.id === edit.dataset.categoryEdit));
    const move = event.target.closest('[data-category-move]');
    if (!move || !discard()) return;
    void run(async () => {
      const next = clone(config), current = next.categories.find(c => c.id === move.dataset.categoryMove);
      const siblings = sortCategories(next.categories.filter(c => (c.parentId || '') === (current.parentId || '')));
      const position = siblings.findIndex(c => c.id === current.id), destination = position + Number(move.dataset.direction);
      if (destination < 0 || destination >= siblings.length) return;
      [siblings[position], siblings[destination]] = [siblings[destination], siblings[position]];
      siblings.forEach((c, i) => { c.sortOrder = i * 10; });
      await save(next, categoryForm.id); if (categoryId) fillCategory(config.categories.find(c => c.id === categoryId));
    });
  });
  $('#store-models-list').addEventListener('click', event => { const edit = event.target.closest('[data-model-edit]'); if (edit && discard()) fillModel(config.equipmentModels.find(m => m.id === edit.dataset.modelEdit)); });
  categoryForm.addEventListener('submit', event => {
    event.preventDefault(); if (!config) return;
    void run(async () => {
      const f = categoryForm.elements, next = clone(config), id = f.id.value.trim();
      if (!categoryId && next.categories.some(c => c.id === id)) throw new Error(t('Այս կոդով կատեգորիա արդեն կա։'));
      const c = { ...(next.categories.find(c => c.id === categoryId) || {}), id, title: f.title.value.trim(), parentId: f.parentId.value, description: f.description.value.trim(), image: f.image.value.trim(), sortOrder: Number(f.sortOrder.value), published: f.published.checked };
      next.categories = next.categories.filter(c => c.id !== categoryId); next.categories.push(c);
      await save(next, categoryForm.id); fillCategory(config.categories.find(c => c.id === id));
    });
  });
  $('#store-category-delete').addEventListener('click', () => {
    if (!categoryId || !confirm(t('Հեռացնե՞լ այս կատեգորիան։ Կապված ապրանքները և ենթակատեգորիաները նախ պետք է տեղափոխված լինեն։'))) return;
    void run(async () => { const next = clone(config); next.categories = next.categories.filter(c => c.id !== categoryId); await save(next, categoryForm.id); fillCategory(config.categories[0] || null); });
  });
  modelForm.addEventListener('submit', event => {
    event.preventDefault(); if (!config) return;
    void run(async () => {
      const f = modelForm.elements, next = clone(config), id = f.id.value.trim();
      if (!modelId && next.equipmentModels.some(m => m.id === id)) throw new Error(t('Այս կոդով մոդել արդեն կա։'));
      const m = { ...(next.equipmentModels.find(m => m.id === modelId) || {}), id, name: f.name.value.trim(), categoryId: f.categoryId.value, brand: f.brand.value.trim(), series: f.series.value.trim(), published: f.published.checked };
      next.equipmentModels = next.equipmentModels.filter(m => m.id !== modelId); next.equipmentModels.push(m);
      await save(next, modelForm.id); fillModel(config.equipmentModels.find(m => m.id === id));
    });
  });
  $('#store-model-delete').addEventListener('click', () => {
    if (!modelId || !confirm(t('Հեռացնե՞լ այս մոդելը։ Նախ հեռացրեք ապրանքների համատեղելիության կապերը։'))) return;
    void run(async () => { const next = clone(config); next.equipmentModels = next.equipmentModels.filter(m => m.id !== modelId); await save(next, modelForm.id); if (config.equipmentModels.length) fillModel(config.equipmentModels[0]); else { modelId = null; modelForm.hidden = true; } });
  });
  homeForm.addEventListener('submit', event => { event.preventDefault(); if (!config) return; void run(async () => { const next = clone(config); for (const field of homeFields) next.home[field] = homeForm.elements[field].value.trim(); await save(next, homeForm.id); }); });
  informationForm.addEventListener('submit', event => { event.preventDefault(); if (!config) return; void run(async () => { const next = clone(config); for (const field of ['paymentText', 'aboutText']) next[field] = informationForm.elements[field].value.trim(); await save(next, informationForm.id); }); });
  root.addEventListener('change', event => {
    const upload = event.target.closest('[data-store-upload]'), file = upload?.files?.[0]; if (!file) return;
    void run(async () => {
      const data = new FormData(); data.set('image', file);
      const result = await api('/api/product-image', { method: 'POST', body: data });
      const form = upload.closest('form'); form.elements[upload.dataset.storeUpload].value = result.image;
      drafts.add(form.id); syncDrafts();
      if (form === categoryForm) { $('#store-category-image').src = result.image; $('#store-category-image').hidden = false; }
      notice(t('Նկարը բեռնված է։ Պահպանեք փոփոխությունները։'));
    });
  });
  const tabs = $$('[data-store-tab]', root);
  function activateTab(button) {
    if (!config || !discard()) return;
    fillContent();
    if (categoryId) fillCategory(config.categories.find(c => c.id === categoryId));
    if (modelId) fillModel(config.equipmentModels.find(m => m.id === modelId));
    for (const tab of tabs) { const active = tab === button; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; $('#' + tab.getAttribute('aria-controls')).hidden = !active; }
    const url = new URL(location.href); url.searchParams.set('section', button.dataset.storeTab); history.replaceState(null, '', url);
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      activateTab(tabs[next]); if (!drafts.size) tabs[next].focus();
    });
  });
  void run(async () => { await load(); const section = new URL(location.href).searchParams.get('section'); const tab = tabs.find(tab => tab.dataset.storeTab === section); if (tab) activateTab(tab); });
})();
