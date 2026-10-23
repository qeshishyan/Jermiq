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
  let informationDraft = null, informationPageId = 'delivery', rateSequence = 0;
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
    if (!value) syncInformationControls();
  }
  async function run(fn) {
    if (busy) return;
    setBusy(true); error(''); notice('');
    try { await fn(); }
    catch (err) { error(err.message); }
    finally { setBusy(false); }
  }
  root.addEventListener('input', event => {
    if (event.target.id === 'store-information-page') return;
    const form = event.target.closest('form');
    if (form?.id) { drafts.add(form.id); syncDrafts(); }
  });
  root.addEventListener('change', event => {
    if (event.target.id === 'store-information-page') return;
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
  const informationPageNames = {
    delivery: 'Առաքում և ինքնավերցում', payment: 'Վճարման պայմաններ', returns: 'Վերադարձ և փոխանակում',
    warranty: 'Երաշխիք', terms: 'Օգտագործման պայմաններ', privacy: 'Գաղտնիություն',
    about: 'Ջերմիքի մասին', ordering: 'Ինչպես պատվիրել'
  };
  const fieldValue = (row, key) => $('[data-information-field="' + key + '"]', row);
  const infoTextField = (key, label, value, maximum, multiline = false, required = false) => `<label class="field${multiline ? ' full' : ''}"><span>${escape(t(label))}${required ? ' *' : ''}</span>${multiline ? `<textarea data-information-field="${key}" rows="4" maxlength="${maximum}"${required ? ' required' : ''}>${escape(value || '')}</textarea>` : `<input data-information-field="${key}" maxlength="${maximum}" value="${escape(value || '')}"${required ? ' required' : ''} />`}</label>`;
  function itemActions(kind, index, length) {
    return `<div class="store-information-item-actions"><button type="button" data-information-action="move-${kind}" data-index="${index}" data-direction="-1" aria-label="${escape(t('Տեղափոխել վերև') + ': ' + (index + 1))}"${index === 0 ? ' disabled' : ''}>↑</button><button type="button" data-information-action="move-${kind}" data-index="${index}" data-direction="1" aria-label="${escape(t('Տեղափոխել ներքև') + ': ' + (index + 1))}"${index === length - 1 ? ' disabled' : ''}>↓</button><button type="button" class="store-information-remove" aria-label="${escape(t('Հեռացնել') + ': ' + (index + 1))}" data-information-action="remove-${kind}" data-index="${index}"${kind === 'rate' && length === 1 ? ' disabled' : ''}>${escape(t('Հեռացնել'))}</button></div>`;
  }
  function resetInformation() {
    informationDraft = clone(config.information || { pages: [], deliveryOptions: [] });
    if (!informationDraft.pages.some(page => page.id === informationPageId)) informationPageId = informationDraft.pages[0]?.id || 'delivery';
    const select = $('#store-information-page');
    select.innerHTML = informationDraft.pages.map(page => `<option value="${escape(page.id)}"${page.id === informationPageId ? ' selected' : ''}>${escape(t(informationPageNames[page.id] || page.id))}</option>`).join('');
    renderInformationPage(); renderDeliveryOptions();
  }
  function renderInformationPage() {
    const page = informationDraft?.pages.find(page => page.id === informationPageId);
    const editor = $('#store-information-page-editor');
    if (!page) { editor.innerHTML = ''; return; }
    $('#store-information-preview').href = '/' + page.id;
    editor.innerHTML = `<section class="store-information-page-fields"><h3>${escape(t(informationPageNames[page.id] || page.id))}</h3><label class="field"><span>${escape(t('Էջի ներածություն'))}</span><textarea data-information-intro rows="4" maxlength="2000">${escape(page.intro || '')}</textarea></label><div class="store-information-section-heading"><div><h4>${escape(t('Մանրամասն բաժիններ'))}</h4><p>${escape(t('Տեքստի նոր պարբերությունը սկսեք մեկ դատարկ տողով։'))}</p></div><button type="button" class="btn btn-outline" data-information-action="add-section">＋ ${escape(t('Ավելացնել բաժին'))}</button></div><div class="store-information-sections">${page.sections.map((section, index) => `<article class="store-information-item" data-information-section="${index}"><div class="store-information-item-heading"><span class="store-information-number">${String(index + 1).padStart(2, '0')}</span>${itemActions('section', index, page.sections.length)}</div>${infoTextField('title', 'Բաժնի վերնագիր', section.title, 200, false, true)}${infoTextField('body', 'Բաժնի տեքստ', section.body, 6000, true, true)}</article>`).join('') || `<p class="store-section-help">${escape(t('Ավելացրեք առաջին բաժինը՝ էջը մանրամասն ներկայացնելու համար։'))}</p>`}</div><div class="store-information-section-heading"><div><h4>${escape(t('Հաճախ տրվող հարցեր'))}</h4><p>${escape(t('Կարճ հարցը և հստակ պատասխանը օգնում են արագ կողմնորոշվել։'))}</p></div><button type="button" class="btn btn-outline" data-information-action="add-faq">＋ ${escape(t('Ավելացնել հարց'))}</button></div><div class="store-information-faqs">${page.faqs.map((faq, index) => `<article class="store-information-item" data-information-faq="${index}"><div class="store-information-item-heading"><span class="store-information-number">${String(index + 1).padStart(2, '0')}</span>${itemActions('faq', index, page.faqs.length)}</div>${infoTextField('question', 'Հարց', faq.question, 300, false, true)}${infoTextField('answer', 'Պատասխան', faq.answer, 4000, true, true)}</article>`).join('') || `<p class="store-section-help">${escape(t('Այս էջում դեռ հարցեր չկան։'))}</p>`}</div></section>`;
    syncInformationControls();
  }
  function renderDeliveryOptions() {
    $('#store-delivery-options').innerHTML = (informationDraft?.deliveryOptions || []).map((rate, index, all) => `<article class="store-information-item store-delivery-option" data-information-rate="${index}" data-index="${index}"><div class="store-information-item-heading"><span class="store-information-number">${String(index + 1).padStart(2, '0')}</span>${itemActions('rate', index, all.length)}</div><div class="form-grid">${infoTextField('title', 'Տարածք կամ առաքման տարբերակ', rate.title, 200, false, true)}<label class="field"><span>${escape(t('Կայուն կոդ'))} *</span><input data-information-field="id" value="${escape(rate.id)}" required pattern="[a-z0-9][a-z0-9-]{1,79}" maxlength="80" /></label><label class="field"><span>${escape(t('Առաքման գին, ֏'))}</span><input data-information-field="price" type="number" min="0" max="1000000000" step="0.01" inputmode="decimal" value="${rate.price == null ? '' : escape(String(rate.price))}" /><small>${escape(t('Դատարկ՝ անհատական հաշվարկ, 0՝ անվճար։'))}</small></label><label class="field"><span>${escape(t('Անվճար առաքում՝ սկսած, ֏'))}</span><input data-information-field="freeFrom" type="number" min="0" max="1000000000" step="0.01" inputmode="decimal" value="${rate.freeFrom == null ? '' : escape(String(rate.freeFrom))}" /></label><label class="checkbox-line"><input data-information-field="priceIsFrom" type="checkbox"${rate.priceIsFrom ? ' checked' : ''} />${escape(t('Գինը ցուցադրել «սկսած» նշումով'))}</label><label class="checkbox-line"><input data-information-field="published" type="checkbox"${rate.published !== false ? ' checked' : ''} />${escape(t('Հրապարակված է'))}</label>${infoTextField('priceNote', 'Գնի պարզաբանում', rate.priceNote, 600, true)}${infoTextField('timeframe', 'Առաքման ժամկետ', rate.timeframe, 500)}${infoTextField('details', 'Տարբերակի պայմաններ', rate.details, 2000, true)}</div></article>`).join('');
    syncInformationControls();
  }
  function syncInformationControls() {
    if (!informationDraft || !informationForm) return;
    const page = informationDraft.pages.find(page => page.id === informationPageId);
    for (const [kind, list, limit] of [['section', page?.sections || [], 24], ['faq', page?.faqs || [], 20], ['rate', informationDraft.deliveryOptions, 20]]) {
      const add = $('[data-information-action="add-' + kind + '"]', informationForm);
      if (add) add.disabled = busy || list.length >= limit;
      $$('[data-information-action="move-' + kind + '"]', informationForm).forEach(button => {
        const destination = Number(button.dataset.index) + Number(button.dataset.direction);
        button.disabled = busy || destination < 0 || destination >= list.length;
      });
      $$('[data-information-action="remove-' + kind + '"]', informationForm).forEach(button => { button.disabled = busy || (kind === 'rate' && list.length <= 1); });
    }
  }
  function amountFrom(input) {
    if (input.validity.badInput) throw new Error(t('Գինը պետք է լինի 0-ից մինչև 1 000 000 000 թիվ։'));
    const raw = input.value.trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1000000000) throw new Error(t('Գինը պետք է լինի 0-ից մինչև 1 000 000 000 թիվ։'));
    return value;
  }
  function captureInformation() {
    if (!informationDraft) return;
    const page = informationDraft.pages.find(page => page.id === informationPageId);
    const nextPage = page && { ...page, intro: $('[data-information-intro]', informationForm).value.trim(),
      sections: $$('[data-information-section]', informationForm).map(row => ({ title: fieldValue(row, 'title').value.trim(), body: fieldValue(row, 'body').value.trim() })),
      faqs: $$('[data-information-faq]', informationForm).map(row => ({ question: fieldValue(row, 'question').value.trim(), answer: fieldValue(row, 'answer').value.trim() })) };
    const nextRates = $$('[data-information-rate]', informationForm).map(row => ({
      id: fieldValue(row, 'id').value.trim(), title: fieldValue(row, 'title').value.trim(),
      price: amountFrom(fieldValue(row, 'price')), priceIsFrom: fieldValue(row, 'priceIsFrom').checked,
      freeFrom: amountFrom(fieldValue(row, 'freeFrom')), priceNote: fieldValue(row, 'priceNote').value.trim(),
      timeframe: fieldValue(row, 'timeframe').value.trim(), details: fieldValue(row, 'details').value.trim(),
      published: fieldValue(row, 'published').checked
    }));
    if (nextPage) informationDraft.pages[informationDraft.pages.indexOf(page)] = nextPage;
    informationDraft.deliveryOptions = nextRates;
  }
  function validateInformation() {
    const pages = informationDraft.pages, rates = informationDraft.deliveryOptions;
    const invalidSection = pages.find(page => page.intro.length > 2000 || page.sections.length > 24 || page.sections.some(section => !section.title || !section.body || section.title.length > 200 || section.body.length > 6000));
    if (invalidSection) throw new Error(t('Ամբողջացրեք բաժնի վերնագիրն ու տեքստը։') + ' (' + t(informationPageNames[invalidSection.id] || invalidSection.id) + ')');
    const invalidFaq = pages.find(page => page.faqs.length > 20 || page.faqs.some(faq => !faq.question || !faq.answer || faq.question.length > 300 || faq.answer.length > 4000));
    if (invalidFaq) throw new Error(t('Ամբողջացրեք հարցն ու պատասխանը բոլոր էջերում։') + ' (' + t(informationPageNames[invalidFaq.id] || invalidFaq.id) + ')');
    if (rates.length < 1 || rates.length > 20 || new Set(rates.map(rate => rate.id)).size !== rates.length || rates.some(rate => !/^[a-z0-9][a-z0-9-]{1,79}$/.test(rate.id) || !rate.title || rate.title.length > 200 || rate.priceNote.length > 600 || rate.timeframe.length > 500 || rate.details.length > 2000)) throw new Error(t('Ստուգեք առաքման տարբերակների անվանումներն ու եզակի կոդերը։'));
  }
  $('#store-information-page').addEventListener('change', event => {
    if (busy || !informationDraft) return;
    try { captureInformation(); informationPageId = event.target.value; renderInformationPage(); error(''); }
    catch (err) { event.target.value = informationPageId; error(err.message); }
  });
  informationForm.addEventListener('click', event => {
    const action = event.target.closest('[data-information-action]');
    if (!action || busy || !informationDraft) return;
    event.preventDefault();
    try {
      captureInformation();
      const [operation, kind] = action.dataset.informationAction.split('-');
      const page = informationDraft.pages.find(page => page.id === informationPageId);
      const list = kind === 'rate' ? informationDraft.deliveryOptions : kind === 'section' ? page?.sections : page?.faqs;
      if (!list) return;
      const index = Number(action.dataset.index), limit = kind === 'section' ? 24 : 20;
      let focusIndex = index;
      if (operation === 'add') {
        if (list.length >= limit) return;
        list.push(kind === 'section' ? { title: '', body: '' } : kind === 'faq' ? { question: '', answer: '' } : { id: 'delivery-' + Date.now().toString(36) + '-' + (++rateSequence), title: '', price: null, priceIsFrom: false, freeFrom: null, priceNote: '', timeframe: '', details: '', published: true });
        focusIndex = list.length - 1;
      } else if (operation === 'remove') {
        if (index < 0 || index >= list.length || (kind === 'rate' && list.length <= 1)) return;
        list.splice(index, 1); focusIndex = Math.min(index, list.length - 1);
      } else if (operation === 'move') {
        const destination = index + Number(action.dataset.direction);
        if (index < 0 || index >= list.length || destination < 0 || destination >= list.length) return;
        [list[index], list[destination]] = [list[destination], list[index]]; focusIndex = destination;
      } else return;
      drafts.add(informationForm.id); syncDrafts(); error('');
      if (kind === 'rate') renderDeliveryOptions(); else renderInformationPage();
      const selector = kind === 'rate' ? '[data-information-rate="' : kind === 'section' ? '[data-information-section="' : '[data-information-faq="';
      const row = $(selector + focusIndex + '"]', informationForm);
      $('input,textarea', row || informationForm)?.focus();
    } catch (err) { error(err.message); }
  });
  function fillContent() {
    for (const field of homeFields) homeForm.elements[field].value = config.home[field] || '';
    for (const field of ['paymentText', 'aboutText']) informationForm.elements[field].value = config[field] || '';
    resetInformation();
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
  informationForm.addEventListener('submit', event => {
    event.preventDefault(); if (!config || !informationForm.reportValidity()) return;
    void run(async () => {
      captureInformation(); validateInformation();
      const next = clone(config); next.information = clone(informationDraft);
      for (const field of ['paymentText', 'aboutText']) next[field] = informationForm.elements[field].value.trim();
      await save(next, informationForm.id); resetInformation();
    });
  });
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
