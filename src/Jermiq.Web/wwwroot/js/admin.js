/* Authenticated CMS and office desk. Text is escaped before insertion; all writes use CSRF. */
(() => {
  'use strict';
  const { $, $$, escape, icons, api, openDialog, closeDialog, t } = window.Jermiq;
  const root = $('#admin-app'); if (!root) return;
  const isAdmin = root.dataset.isAdmin === 'true';
  const labels = { service: t(t("Սպասարկում")), question: t('Question'), part: t(t("Պահեստամաս")), order: t('Order'), callback: t('Callback') };
  const statuses = { new: t(t("Նոր")), contacted: t(t("Կապ հաստատված")), in_progress: t('In progress'), waiting: t('Waiting'), completed: t(t("Ավարտված")), cancelled: t('Cancelled') };
  const priorities = { low: t('Low'), normal: t('Normal'), high: t('High'), urgent: t('Urgent') };
  const dirty = new Set();
  let products = [], settings = {}, selected = null, busy = false, officeData = null, currentLead = null, leadPage = 1;
  let loadCms, loadUsers;
  let cms = null, translationPage = 1, translationPages = 1, translationDraft = {}, currentContent = null, users = [], currentUser = null;
  const date = value => new Date(value).toLocaleString(document.documentElement.lang, { timeZone: 'Asia/Yerevan' });
  function error(message) { $('#admin-error').textContent = message; $('#admin-error').hidden = !message; }
  function notice(message) { $('#admin-notice').textContent = message; $('#admin-notice').hidden = !message; }
  function setBusy(value) {
    busy = value; root.setAttribute('aria-busy', String(value));
    $$('#lead-form,#product-form,#settings-form,#content-form,#user-form', root).forEach(form => { form.inert = value; });
    $$('button,input[type=file]', root).forEach(el => { el.disabled = value; });
    if (!value && officeData) { $('#lead-prev').disabled = leadPage <= 1; $('#lead-next').disabled = leadPage * officeData.pageSize >= officeData.total; }
    if (!value && isAdmin && cms) { $('#translation-prev').disabled = translationPage <= 1; $('#translation-next').disabled = translationPage >= translationPages; }
  }
  async function run(fn) {
    if (busy) return;
    error(''); notice(''); setBusy(true);
    try { await fn(); }
    catch (err) { error(err.message); }
    finally { setBusy(false); }
  }
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  function discard(form) { if (!dirty.has(form)) return true; if (!confirm(t('Discard unsaved changes?'))) return false; dirty.delete(form); return true; }
  root.addEventListener('input', event => { const form = event.target.closest('form'); if (form && form.id !== 'lead-search-form') dirty.add(form.id); });
  root.addEventListener('change', event => { const form = event.target.closest('form'); if (form && form.id !== 'lead-search-form') dirty.add(form.id); });
  window.addEventListener('beforeunload', event => { if (dirty.size || Object.keys(translationDraft).length) { event.preventDefault(); event.returnValue = ''; } });
  async function refreshArrivals() {
    if (busy) return false;
    setBusy(true);
    try { await loadOffice(); return true; }
    finally { setBusy(false); }
  }
  async function openArrivals() {
    if (busy) return false;
    $('#lead-search').value = ''; $('#lead-filter').value = 'all'; $('#lead-kind-filter').value = 'all'; leadPage = 1;
    selectTab(tabs[0]);
    try { return await refreshArrivals(); }
    catch (err) { error(err.message); return false; }
  }
  async function load() {
    await window.JermiqArrivals?.start({ refresh: refreshArrivals, open: openArrivals });
    const data = await api('/api/admin', { cache: 'no-store' });
    products = data.products; settings = data.settings;
    await loadOffice();
    if (isAdmin) {
      selected = products.find(p => p.slug === selected?.slug) || products[0] || null;
      renderProducts(); fillSettings(); if (selected) fillProduct(selected);
    }
  }
  async function mutate(body) {
    await post('/api/admin', body); notice(t('Saved'));
    const data = await api('/api/admin', { cache: 'no-store' }); products = data.products; settings = data.settings;
    if (isAdmin) { selected = products.find(p => p.slug === selected?.slug) || products[0]; renderProducts(); fillSettings(); if (selected) fillProduct(selected); }
  }
  function leadQuery() { return new URLSearchParams({ q: $('#lead-search').value, status: $('#lead-filter').value, kind: $('#lead-kind-filter').value, page: leadPage }); }
  async function loadOffice() {
    officeData = await api('/api/admin/leads?' + leadQuery(), { cache: 'no-store' }); leadPage = officeData.page;
    const kindSelect = $('#lead-kind-filter'), previous = kindSelect.value;
    kindSelect.innerHTML = `<option value="all">${escape(t('All types'))}</option>` + [...new Set([...Object.keys(labels), ...officeData.kinds])].map(k => `<option value="${escape(k)}">${escape(labels[k] || k)}</option>`).join('');
    kindSelect.value = [...kindSelect.options].some(o => o.value === previous) ? previous : 'all';
    const totals = Object.fromEntries(officeData.stats.map(x => [x.status, x.count]));
    const all = Object.values(totals).reduce((a, b) => a + b, 0);
    $('#lead-total').textContent = all;
    $('#office-stats').innerHTML = [[t('All requests'), all, 'all'], [t(t("Նոր")), totals.new || 0, 'new'], [t('In progress'), (totals.in_progress || 0), 'in_progress'], [t(t("Ավարտված")), totals.completed || 0, 'completed']].map(([title, count, filter]) => `<button class="office-stat" type="button" data-stat="${filter}"><small>${escape(title)}</small><strong>${count}</strong></button>`).join('');
    $('#leads-list').innerHTML = officeData.leads.length ? officeData.leads.map(({ lead: l, office: o }) => {
      const overdue = o.dueAt && new Date(o.dueAt) < new Date() && !['completed', 'cancelled'].includes(l.status);
      const assignee = officeData.staff.find(u => u.id === o.assignee)?.name;
      return `<article class="office-request ${currentLead?.lead.id === l.id ? 'active' : ''}"><div class="office-request-head"><div><div class="eyebrow">${escape(labels[l.kind] || l.kind)} · ${escape(date(l.created_at))}</div><h3>${escape(l.name)}</h3></div><span class="office-badge ${escape(l.status)}">${escape(statuses[l.status] || l.status)}</span></div><div class="actions text-sm mt-3">${l.phone ? `<a class="text-link" href="tel:${escape(l.phone.replace(/[^+\d]/g, ''))}">${escape(l.phone)}</a>` : ''}${l.email ? `<a class="text-link" href="mailto:${escape(l.email)}">${escape(l.email)}</a>` : ''}</div>${o.subject ? `<p class="mt-3">${escape(o.subject)}</p>` : ''}<div class="office-request-foot"><span class="office-badge ${escape(o.priority)}">${escape(priorities[o.priority])}</span>${assignee ? `<span>${escape(assignee)}</span>` : ''}${o.dueAt ? `<span class="${overdue ? 'office-overdue' : ''}">${escape(date(o.dueAt))}</span>` : ''}<button type="button" class="text-link plain-button" data-edit-lead="${escape(l.id)}">${escape(t('Open request'))} →</button></div></article>`;
    }).join('') : `<div class="empty-state"><h3>${escape(t('No requests match your filters'))}</h3></div>`;
    $('#lead-page').textContent = `${t('Page')} ${leadPage} / ${Math.max(1, Math.ceil(officeData.total / officeData.pageSize))} · ${officeData.total} ${t('Requests')}`;
    const exportQuery = leadQuery(); exportQuery.delete('page'); $('#lead-export').href = '/api/admin/export?' + exportQuery;
    $('#lead-prev').disabled = leadPage <= 1; $('#lead-next').disabled = leadPage * officeData.pageSize >= officeData.total;
    icons($('#leads-list'));
  }
  function fillLead(entry) {
    currentLead = structuredClone(entry); dirty.delete('lead-form');
    const f = $('#lead-form'), l = entry.lead, o = entry.office;
    const values = { ...l, ...o, note: '' };
    f.elements.status.innerHTML = Object.entries(statuses).map(([v, title]) => `<option value="${v}">${escape(title)}</option>`).join('');
    f.elements.assignee.innerHTML = `<option value="">${escape(t('Unassigned'))}</option>` + officeData.staff.map(u => `<option value="${escape(u.id)}">${escape(u.name)}</option>`).join('');
    for (const name of ['kind', 'name', 'phone', 'email', 'message', 'subject', 'brand', 'model', 'selection', 'address', 'source', 'priority', 'status', 'assignee', 'note']) f.elements[name].value = values[name] || '';
    if (o.assignee && !officeData.staff.some(u => u.id === o.assignee)) {
      f.elements.assignee.add(new Option(t('Inactive employee'), o.assignee)); f.elements.assignee.value = o.assignee;
    }
    const due = o.dueAt ? new Date(o.dueAt) : null;
    f.elements.dueAt.value = due ? new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    $('#lead-editor').hidden = false;
    if (innerWidth <= 1100) $('#lead-editor').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    $('#lead-editor-title').textContent = l.created_at ? t('Edit request') : t('New request');
    $('#lead-reference').textContent = l.created_at ? l.id : '';
    $('#lead-attachment-area').hidden = !l.created_at;
    $('#lead-attachment').value = '';
    $('#lead-attachment-link').hidden = !l.attachment; $('#lead-attachment-link').href = '/api/attachments?id=' + l.id;
    $('#lead-notes').innerHTML = (o.notes || []).slice().reverse().map(n => `<article>${escape(n.text)}<small>${escape(n.actor)} · ${escape(date(n.at))}</small></article>`).join('') || `<p class="text-sm">${escape(t('No notes yet'))}</p>`;
    $('#lead-history').innerHTML = (o.history || []).slice().reverse().map(n => `<article>${escape(t(n.action))}${Object.entries(n.changes || {}).map(([key, value]) => `<p>${escape(t(key))}: ${escape(value)}</p>`).join('')}<small>${escape(n.actor)} · ${escape(date(n.at))}</small></article>`).join('') || `<p class="text-sm">${escape(t('Website request'))}</p>`;
  }
  function newLead() {
    if (!discard('lead-form')) return;
    fillLead({ lead: { id: crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16)), kind: 'service', name: '', phone: '', email: '', message: '', status: 'new', created_at: null }, office: { revision: 0, source: 'phone', priority: 'normal', assignee: '', history: [], notes: [] } });
    $('#lead-form').elements.name.focus();
  }
  $('#lead-filter').innerHTML += Object.entries(statuses).map(([value, title]) => `<option value="${value}">${escape(title)}</option>`).join('');
  $('#lead-new').addEventListener('click', newLead);
  $('#lead-close').addEventListener('click', () => { if (!discard('lead-form')) return; currentLead = null; $('#lead-editor').hidden = true; });
  $('#lead-search-form').addEventListener('submit', e => { e.preventDefault(); leadPage = 1; void run(loadOffice); });
  ['lead-filter', 'lead-kind-filter'].forEach(id => $('#' + id).addEventListener('change', () => { leadPage = 1; void run(loadOffice); }));
  $('#lead-prev').addEventListener('click', () => { leadPage--; void run(loadOffice); });
  $('#lead-next').addEventListener('click', () => { leadPage++; void run(loadOffice); });
  root.addEventListener('click', e => {
    const edit = e.target.closest('[data-edit-lead]');
    if (edit && discard('lead-form')) { fillLead(officeData.leads.find(x => x.lead.id === edit.dataset.editLead)); }
    const stat = e.target.closest('[data-stat]');
    if (stat) { $('#lead-filter').value = stat.dataset.stat; leadPage = 1; void run(loadOffice); }
  });
  $('#lead-form').addEventListener('submit', e => {
    e.preventDefault(); if (!currentLead) return;
    void run(async () => {
      const data = Object.fromEntries(new FormData(e.target));
      data.id = currentLead.lead.id; data.revision = currentLead.office.revision;
      data.dueAt = data.dueAt ? new Date(data.dueAt).toISOString() : null;
      await post('/api/admin/lead', data); dirty.delete('lead-form');
      await loadOffice();
      fillLead(await api('/api/admin/lead/' + data.id)); notice(t('Saved'));
    });
  });
  $('#lead-attachment').addEventListener('change', e => {
    const file = e.target.files?.[0]; if (!file || !currentLead?.lead.created_at) return;
    void run(async () => {
      const data = new FormData(); data.set('id', currentLead.lead.id); data.set('revision', currentLead.office.revision); data.set('attachment', file);
      const result = await api('/api/admin/lead-attachment', { method: 'POST', body: data }); currentLead.office.revision = result.revision;
      currentLead.lead.attachment = true; $('#lead-attachment-link').hidden = false; notice(t('Attachment saved'));
    });
  });
  const tabs = $$('[data-tab]', root);
  function selectTab(tab) {
    tabs.forEach(el => { const active = el === tab; el.classList.toggle('selected', active); el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; $('#panel-' + el.dataset.tab).hidden = !active; });
    $('#workspace-title').textContent = tab.textContent.trim();
    if (['translations', 'content'].includes(tab.dataset.tab) && !cms) void run(loadCms);
    if (tab.dataset.tab === 'users') void run(loadUsers);
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', e => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[next]); tabs[next].focus();
    });
  });
  $('#admin-refresh').addEventListener('click', () => {
    if ((dirty.size || Object.keys(translationDraft).length) && !confirm(t('Discard unsaved changes?'))) return;
    dirty.clear(); translationDraft = {}; cms = null; currentLead = null; $('#lead-editor').hidden = true;
    void run(async () => { await load(); const tab = tabs.find(x => x.getAttribute('aria-selected') === 'true'); if (['translations', 'content'].includes(tab?.dataset.tab)) await loadCms(); if (tab?.dataset.tab === 'users') await loadUsers(); });
  });
  document.addEventListener('click', e => { if (e.target.closest('[data-action="dialog-close"]')) closeDialog(); });
  function renderProducts() {
    $('#product-list').innerHTML = products.map(p => `<button type="button" data-edit-product="${escape(p.slug)}" class="${p.slug === selected?.slug ? 'selected' : ''}">${escape(p.title)}<small>${p.demo ? t("Ցուցադրական") : t("Իրական ապրանք")}</small></button>`).join('');
  }
  function fillProduct(p) {
    selected = structuredClone(p); const form = $('#product-form');
    ['slug', 'title', 'category', 'brand', 'model', 'availability', 'description'].forEach(name => { form.elements[name].value = p[name] ?? ''; });
    ['price', 'volume'].forEach(name => { form.elements[name].value = p[name] ?? ''; });
    form.elements.specs.value = Object.entries(p.specs).map(([key, value]) => `${key}: ${value}`).join('\n');
    form.elements.demo.checked = p.demo;
    $('#product-preview').src = p.image; $('#product-image-upload').value = '';
    renderProducts();
  }
  function fillSettings() {
    const form = $('#settings-form');
    ['phone', 'email', 'address', 'hours', 'warranty', 'delivery'].forEach(name => { form.elements[name].value = settings[name] || ''; });
    $$('[name^="service-"]', form).forEach(el => { el.value = settings.servicePrices[el.name.slice(8)] || ''; });
    form.elements.showDraftBanner.checked = settings.showDraftBanner;
  }
  if (isAdmin) {
  root.addEventListener('click', event => { const edit = event.target.closest('[data-edit-product]'); if (edit && discard('product-form')) { fillProduct(products.find(p => p.slug === edit.dataset.editProduct)); notice(''); } });
  $('#product-new').addEventListener('click', () => { if (!discard('product-form')) return; fillProduct({ slug: `new-${Date.now()}`, title: t("Նոր ապրանք"), category: 'heater', volume: null, brand: '', model: '', description: '', price: null, availability: t("Առկայությունը ճշտվում է"), specs: {}, image: '/images/hero.webp', demo: false }); });
  $('#product-image-upload').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file || !selected) return;
    setBusy(true); error('');
    try {
      const data = new FormData(); data.set('image', file);
      const result = await api('/api/product-image', { method: 'POST', body: data });
      selected.image = result.image; $('#product-preview').src = result.image;
      notice(t("Պատկերը բեռնված է։ Պահպանեք ապրանքը։"));
    } catch (err) { error(err.message); }
    finally { setBusy(false); }
  });
  $('#product-form').addEventListener('submit', event => {
    event.preventDefault(); if (busy || !selected) return;
    const data = new FormData(event.target), p = { ...selected };
    ['slug', 'title', 'category', 'brand', 'model', 'description', 'availability'].forEach(key => { p[key] = String(data.get(key)).trim(); });
    ['price', 'volume'].forEach(key => { p[key] = data.get(key) === '' ? null : Number(data.get(key)); });
    p.demo = data.get('demo') === 'on';
    p.specs = Object.fromEntries(String(data.get('specs')).split('\n').filter(line => line.includes(':')).map(line => { const at = line.indexOf(':'); return [line.slice(0, at).trim(), line.slice(at + 1).trim()]; }));
    selected = p; void run(async () => { await mutate({ action: 'product', product: p }); dirty.delete('product-form'); cms = null; });
  });
  $('#settings-form').addEventListener('submit', event => {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.target), next = { ...settings, servicePrices: {} };
    ['phone', 'email', 'address', 'hours', 'warranty', 'delivery'].forEach(key => { next[key] = String(data.get(key)).trim(); });
    $$('[name^="service-"]', event.target).forEach(el => { next.servicePrices[el.name.slice(8)] = el.value.trim(); });
    next.showDraftBanner = data.get('showDraftBanner') === 'on'; void run(async () => { await mutate({ action: 'settings', settings: next }); dirty.delete('settings-form'); cms = null; });
  });
  loadCms = async function () { cms = await api('/api/admin/cms', { cache: 'no-store' }); renderTranslations(); renderContent(); }
  function renderTranslations() {
    if (!cms) return;
    const query = $('#translation-search').value.toLocaleLowerCase();
    const all = Object.entries(cms.texts).map(([key, value]) => [key, translationDraft[key] || value]);
    const missing = all.filter(([, value]) => !value.en?.trim() || !value.ru?.trim());
    const list = all.filter(([key, value]) => [key, ...Object.values(value)].join(' ').toLocaleLowerCase().includes(query) && ($('#translation-filter').value !== 'missing' || !value.en?.trim() || !value.ru?.trim()));
    const pages = Math.max(1, Math.ceil(list.length / 15)); translationPages = pages; translationPage = Math.min(translationPage, pages);
    $('#translation-summary').textContent = `${all.length} ${t('text entries')} · ${missing.length} ${t('Missing translations')}`;
    $('#translation-dirty').textContent = Object.keys(translationDraft).length ? `(${Object.keys(translationDraft).length})` : '';
    $('#translation-page').textContent = `${translationPage} / ${pages}`;
    $('#translation-prev').disabled = translationPage <= 1; $('#translation-next').disabled = translationPage >= pages;
    $('#translation-list').replaceChildren();
    for (const [key, value] of list.slice((translationPage - 1) * 15, translationPage * 15)) {
      const row = document.createElement('article'); row.className = 'translation-row' + (translationDraft[key] ? ' dirty' : '');
      const source = document.createElement('p'); source.className = 'translation-source'; source.textContent = key; row.append(source);
      const fields = document.createElement('div'); fields.className = 'translation-fields';
      for (const [language, name] of [['hy', t("Հայերեն")], ['en', 'English'], ['ru', 'Русский']]) {
        const label = document.createElement('label'); label.className = 'field'; label.textContent = name;
        const input = document.createElement('textarea'); input.value = value[language] || ''; input.lang = language; input.maxLength = 10000;
        input.addEventListener('input', () => {
          translationDraft[key] ||= { ...value }; translationDraft[key][language] = input.value; row.classList.add('dirty');
          $('#translation-dirty').textContent = `(${Object.keys(translationDraft).length})`;
        });
        label.append(input); fields.append(label);
      }
      row.append(fields); $('#translation-list').append(row);
    }
  }
  ['translation-search', 'translation-filter'].forEach(id => $('#' + id).addEventListener(id.endsWith('search') ? 'input' : 'change', () => { translationPage = 1; renderTranslations(); }));
  $('#translation-prev').addEventListener('click', () => { translationPage--; renderTranslations(); });
  $('#translation-next').addEventListener('click', () => { translationPage++; renderTranslations(); });
  $('#translations-save').addEventListener('click', () => void run(async () => {
    if (!Object.keys(translationDraft).length) return;
    const result = await post('/api/admin/cms', { revision: cms.revision, texts: translationDraft });
    Object.assign(cms.texts, translationDraft); cms.revision = result.revision; translationDraft = {}; renderTranslations(); notice(t('Translations saved. Reload the website to see changes.'));
  }));
  const contentType = () => $('#content-type').value;
  function renderContent() {
    if (!cms) return;
    const type = contentType();
    $('#content-list').innerHTML = cms[type].map((item, index) => `<button type="button" data-content-index="${index}">${escape(item.title)}<small>${escape(item.slug || item.id)}</small></button>`).join('');
    if (!currentContent || currentContent.type !== type) fillContent(cms[type][0] || null);
  }
  function fillContent(item) {
    currentContent = { type: contentType(), key: item?.slug || item?.id || '', value: item ? structuredClone(item) : null };
    const f = $('#content-form'); f.elements.key.value = currentContent.key; f.elements.key.readOnly = !!item;
    f.elements.title.value = item?.title || ''; f.elements.intro.value = item?.intro || item?.desc || '';
    $('#content-sections').replaceChildren(); (item?.sections || []).forEach(addSection);
    $('#section-add').hidden = contentType() !== 'articles'; $('#content-delete').hidden = !item;
    dirty.delete('content-form');
  }
  function addSection(value = ['', '']) {
    const div = document.createElement('div'); div.className = 'content-section';
    div.innerHTML = `<label class="field">${escape(t('Section heading'))}<input class="section-title" maxlength="10000" /></label><label class="field">${escape(t('Section body'))}<textarea class="section-body" maxlength="10000"></textarea></label><button type="button" class="text-link plain-button">${escape(t('Remove section'))}</button>`;
    $('.section-title', div).value = value[0]; $('.section-body', div).value = value[1];
    $('button', div).addEventListener('click', () => { div.remove(); dirty.add('content-form'); }); $('#content-sections').append(div);
  }
  $('#section-add').addEventListener('click', () => { addSection(); dirty.add('content-form'); });
  $('#content-list').addEventListener('click', e => { const button = e.target.closest('[data-content-index]'); if (button && discard('content-form')) fillContent(cms[contentType()][Number(button.dataset.contentIndex)]); });
  $('#content-type').addEventListener('change', () => { if (!discard('content-form')) { $('#content-type').value = currentContent.type; return; } currentContent = null; renderContent(); });
  $('#content-new').addEventListener('click', () => { if (discard('content-form')) { fillContent(null); $('#content-form').elements.key.focus(); } });
  $('#content-form').addEventListener('submit', e => { e.preventDefault(); void run(async () => {
    const f = e.target, type = contentType();
    const item = type === 'articles' ? { slug: f.elements.key.value.trim(), title: f.elements.title.value.trim(), intro: f.elements.intro.value.trim(), sections: $$('.content-section').map(el => [$('.section-title', el).value, $('.section-body', el).value]) } : { id: f.elements.key.value.trim(), title: f.elements.title.value.trim(), desc: f.elements.intro.value.trim() };
    const key = item.slug || item.id;
    if (!currentContent.key && cms[type].some(x => (x.slug || x.id) === key)) throw new Error(t('This identifier already exists'));
    const next = cms[type].filter(x => (x.slug || x.id) !== currentContent.key); next.push(item);
    await post('/api/admin/cms', { revision: cms.revision, [type]: next }); dirty.delete('content-form'); currentContent = null; await loadCms(); fillContent(item); notice(t('Content saved. Add translations for new text.'));
  }); });
  $('#content-delete').addEventListener('click', () => { if (!currentContent.key || !confirm(t('Remove this content from the website?'))) return; void run(async () => {
    const type = contentType(), next = cms[type].filter(x => (x.slug || x.id) !== currentContent.key);
    await post('/api/admin/cms', { revision: cms.revision, [type]: next }); dirty.delete('content-form'); currentContent = null; await loadCms(); notice(t('Saved'));
  }); });
  loadUsers = async function () {
    users = (await api('/api/admin/users', { cache: 'no-store' })).users;
    $('#user-list').innerHTML = users.map((u, i) => `<button type="button" data-user-index="${i}">${escape(u.email)}<small>${escape(u.role === 'Admin' ? t('Administrator') : t('Office employee'))} · ${escape(u.disabled ? t('Disabled') : t('Active'))}</small></button>`).join('');
    if (!dirty.has('user-form')) fillUser(users.find(x => x.id === currentUser?.id) || null);
  }
  function fillUser(user) {
    currentUser = user; const f = $('#user-form'); f.reset(); f.elements.email.value = user?.email || ''; f.elements.email.readOnly = !!user;
    f.elements.role.value = user?.role || 'Office'; f.elements.disabled.checked = user?.disabled || false; f.elements.password.required = !user; dirty.delete('user-form');
  }
  $('#user-list').addEventListener('click', e => { const b = e.target.closest('[data-user-index]'); if (b && discard('user-form')) fillUser(users[Number(b.dataset.userIndex)]); });
  $('#user-new').addEventListener('click', () => { if (discard('user-form')) fillUser(null); });
  $('#user-form').addEventListener('submit', e => { e.preventDefault(); void run(async () => {
    const data = Object.fromEntries(new FormData(e.target)); data.id = currentUser?.id || null; data.disabled = e.target.elements.disabled.checked;
    await post('/api/admin/users', data); e.target.elements.password.value = ''; dirty.delete('user-form'); await loadUsers(); notice(t('Saved'));
  }); });
  }
  selectTab(tabs[0]); void run(load);
})();
