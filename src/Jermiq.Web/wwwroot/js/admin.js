/* Authenticated CMS and office desk. Text is escaped before insertion; all writes use CSRF. */
(() => {
  'use strict';
  const { $, $$, escape, icons, api, openDialog, closeDialog, t } = window.Jermiq;
  const root = $('#admin-app'); if (!root) return;
  const isAdmin = root.dataset.isAdmin === 'true';
  const labels = { service: t(t("Սպասարկում")), question: t('Question'), part: t(t("Պահեստամաս")), order: t('Order'), callback: t('Callback') };
  const statuses = { new: t(t("Նոր")), contacted: t(t("Կապ հաստատված")), in_progress: t('In progress'), waiting: t('Waiting'), completed: t(t("Ավարտված")), cancelled: t('Cancelled') };
  const priorities = { low: t('Low'), normal: t('Normal'), high: t('High'), urgent: t('Urgent') };
  const dirty = new Set(), selectedLeads = new Map();
  let productPage = 1, productPages = 1, productBaseline = null, dashboard = null;
  let products = [], settings = {}, selected = null, busy = false, officeData = null, currentLead = null, leadPage = 1;
  let storeCatalog = { categories: [], equipmentModels: [] };
  let loadCms, loadUsers;
  let cms = null, translationPage = 1, translationPages = 1, translationDraft = {}, currentContent = null, users = [], currentUser = null;
  const date = value => new Date(value).toLocaleString(document.documentElement.lang, { timeZone: 'Asia/Yerevan' });
  function error(message) { $('#admin-error').textContent = message; $('#admin-error').hidden = !message; }
  function notice(message) { $('#admin-notice').textContent = message; $('#admin-notice').hidden = !message; }
  function syncDrafts() { $$('[data-dirty-for]').forEach(el => { el.textContent = t(dirty.has(el.dataset.dirtyFor) ? 'Unsaved changes' : 'Saved version'); el.classList.toggle('has-changes', dirty.has(el.dataset.dirtyFor)); }); }
  function setBusy(value) {
    busy = value; root.setAttribute('aria-busy', String(value));
    $$('#lead-form,#product-form,#settings-form,#content-form,#user-form,#lead-search-form,.advanced-filters', root).forEach(form => { form.inert = value; });
    $$('button,input[type=file],input[data-select-lead],#lead-select-page,#lead-bulk-status,#product-search,#product-category-filter,#product-state-filter,#product-sort', root).forEach(el => { el.disabled = value; });
    if (!value && officeData) { $('#lead-prev').disabled = leadPage <= 1; $('#lead-next').disabled = leadPage * officeData.pageSize >= officeData.total; }
    if (!value && isAdmin) { $('#product-prev').disabled = productPage <= 1; $('#product-next').disabled = productPage >= productPages; }
    syncDrafts();
    if (!value && isAdmin && cms) { $('#translation-prev').disabled = translationPage <= 1; $('#translation-next').disabled = translationPage >= translationPages; }
  }
  async function run(fn) {
    if (busy) return;
    error(''); notice(''); setBusy(true);
    try { await fn(); }
    catch (err) { error(err.message); }
    finally { setBusy(false); }
  }
  root.addEventListener('click', event => { if (busy) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  function discard(form) { if (!dirty.has(form)) return true; if (!confirm(t('Discard unsaved changes?'))) return false; dirty.delete(form); return true; }
  root.addEventListener('input', event => { const form = event.target.closest('form'); if (form && form.id !== 'lead-search-form') { dirty.add(form.id); syncDrafts(); } });
  root.addEventListener('change', event => { const form = event.target.closest('form'); if (form && form.id !== 'lead-search-form') { dirty.add(form.id); syncDrafts(); } });
  window.addEventListener('beforeunload', event => { if (dirty.size || Object.keys(translationDraft).length) { event.preventDefault(); event.returnValue = ''; } });
  async function refreshArrivals() {
    if (busy) return false;
    setBusy(true);
    try { await loadOffice(); return true; }
    finally { setBusy(false); }
  }
  async function openArrivals() {
    if (busy) return false;
    resetLeadFilters();
    selectTab(tabs.find(tab => tab.dataset.tab === 'leads'));
    try { return await refreshArrivals(); }
    catch (err) { error(err.message); return false; }
  }
  async function load() {
    await window.JermiqArrivals?.start({ refresh: refreshArrivals, open: openArrivals });
    const data = await api('/api/admin', { cache: 'no-store' });
    products = data.products; settings = data.settings;
    if (isAdmin) {
      storeCatalog = await api('/api/admin/store-catalog', { cache: 'no-store' });
      setupStoreProductEditor();
    }
    await loadOffice();
    if (isAdmin) {
      selected = products.find(p => p.slug === selected?.slug) || products[0] || null;
      renderProducts(); fillSettings(); if (selected) fillProduct(selected, false);
      const activeTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
      if (['translations','content'].includes(activeTab?.dataset.tab) && !cms) await loadCms();
      if (activeTab?.dataset.tab === 'users') await loadUsers();
    }
  }
  async function mutate(body) {
    await post('/api/admin', body); notice(t('Saved'));
    const data = await api('/api/admin', { cache: 'no-store' }); products = data.products; settings = data.settings;
    await loadDashboard();
    if (body.action === 'product') {
      selected = products.find(p => p.slug === body.product.slug); if (selected) fillProduct(selected, false);
    }
    if (body.action === 'settings') fillSettings();
    renderProducts();
  }
  function resetLeadFilters() {
    $('#lead-search').value = '';
    ['lead-filter','lead-kind-filter','lead-priority-filter','lead-assignee-filter','lead-source-filter','lead-due-filter'].forEach(id => { $('#' + id).value = 'all'; });
    $('#lead-sort').value = 'newest'; leadPage = 1;
  }
  function leadQuery() { return new URLSearchParams({ q: $('#lead-search').value, status: $('#lead-filter').value, kind: $('#lead-kind-filter').value, priority: $('#lead-priority-filter').value, assignee: $('#lead-assignee-filter').value, source: $('#lead-source-filter').value, due: $('#lead-due-filter').value, sort: $('#lead-sort').value, page: leadPage }); }
  async function loadDashboard() {
    dashboard = await api('/api/admin/dashboard', { cache: 'no-store' });
    const metrics = [[t('Today'), dashboard.today, 'message'], [t('Active requests'), dashboard.active, 'wrench'], [t('Urgent'), dashboard.urgent, 'shield'], [t('Overdue'), dashboard.overdue, 'refresh']];
    $('#dashboard-metrics').innerHTML = metrics.map(([title,count,icon]) => `<article class="overview-metric"><div><span>${escape(title)}</span><strong>${count}</strong></div><i data-icon="${icon}"></i></article>`).join('');
    $('#dashboard-recent').innerHTML = dashboard.latest.length ? dashboard.latest.map(l => `<button type="button" class="recent-row" data-dashboard-lead="${escape(l.id)}"><span class="initial-avatar">${escape(l.name.slice(0,1))}</span><span class="recent-person"><strong>${escape(l.name)}</strong><small>${escape(labels[l.kind] || l.kind)} · ${escape(date(l.createdAt))}</small></span><span class="office-badge ${escape(l.status)}">${escape(statuses[l.status] || l.status)}</span><span>↗</span></button>`).join('') : `<p class="empty-caption">${escape(t('No requests yet'))}</p>`;
    $('#dashboard-attention').innerHTML = [[t('Overdue'),dashboard.overdue,'overdue'],[t('Urgent'),dashboard.urgent,'urgent'],[t('Unassigned'),dashboard.unassigned,'unassigned']].map(([title,count,filter]) => `<button type="button" class="attention-row" data-attention="${filter}"><span>${escape(title)}</span><strong>${count}</strong><span>→</span></button>`).join('');
    if (isAdmin && dashboard.catalog) {
      const c = dashboard.catalog;
      $('#dashboard-catalog').innerHTML = [[t('All products'),c.total,'all'],[t('Missing price'),c.withoutPrice,'no-price'],[t('Demonstration examples'),c.demo,'demo'],[t('Missing description'),c.withoutDescription,'no-description']].map(([label,count,filter]) => `<button class="catalog-health-item" type="button" data-catalog-filter="${filter}"><strong>${count}</strong><span>${escape(label)}</span><span>→</span></button>`).join('');
    }
    $('#last-synced').textContent = `${t('Updated')} ${new Date().toLocaleTimeString(document.documentElement.lang, { hour:'2-digit',minute:'2-digit',timeZone:'Asia/Yerevan' })}`;
    icons($('#panel-dashboard'));
  }
  function renderSelection() {
    $('#lead-bulk').hidden = selectedLeads.size === 0;
    $('#lead-selected-count').textContent = `${selectedLeads.size} ${t('Selected')}`;
    const entries = officeData?.leads || [];
    $('#lead-select-page').checked = entries.length > 0 && entries.every(x => selectedLeads.has(x.lead.id));
    $('#lead-select-page').indeterminate = entries.some(x => selectedLeads.has(x.lead.id)) && !$('#lead-select-page').checked;
  }
  async function loadOffice() {
    officeData = await api('/api/admin/leads?' + leadQuery(), { cache: 'no-store' }); leadPage = officeData.page;
    const kindSelect = $('#lead-kind-filter'), previous = kindSelect.value;
    kindSelect.innerHTML = `<option value="all">${escape(t('All types'))}</option>` + [...new Set([...Object.keys(labels), ...officeData.kinds])].map(k => `<option value="${escape(k)}">${escape(labels[k] || k)}</option>`).join('');
    kindSelect.value = [...kindSelect.options].some(o => o.value === previous) ? previous : 'all';
    const assigneeFilter = $('#lead-assignee-filter'), assigned = assigneeFilter.value;
    assigneeFilter.innerHTML = `<option value="all">${escape(t('All employees'))}</option><option value="__unassigned">${escape(t('Unassigned'))}</option>` + officeData.staff.map(u => `<option value="${escape(u.id)}">${escape(u.name)}</option>`).join(''); assigneeFilter.value = assigned;
    const totals = Object.fromEntries(officeData.stats.map(x => [x.status, x.count]));
    const all = Object.values(totals).reduce((a, b) => a + b, 0);
    $('#lead-total').textContent = all;
    $('#office-stats').innerHTML = [[t('All requests'), all, 'all'], [t(t("Նոր")), totals.new || 0, 'new'], [t('In progress'), (totals.in_progress || 0), 'in_progress'], [t(t("Ավարտված")), totals.completed || 0, 'completed']].map(([title, count, filter]) => `<button class="office-stat" type="button" data-stat="${filter}"><small>${escape(title)}</small><strong>${count}</strong></button>`).join('');
    $('#leads-list').innerHTML = officeData.leads.length ? officeData.leads.map(({ lead: l, office: o }) => {
      const overdue = o.dueAt && new Date(o.dueAt) < new Date() && !['completed', 'cancelled'].includes(l.status);
      const assignee = officeData.staff.find(u => u.id === o.assignee)?.name;
      return `<article class="office-request ${currentLead?.lead.id === l.id ? 'active' : ''}"><div class="office-request-head"><label class="request-check"><input type="checkbox" data-select-lead="${escape(l.id)}" ${selectedLeads.has(l.id) ? 'checked' : ''} aria-label="${escape(t('Select request') + ' ' + l.name)}" /></label><div><div class="eyebrow">${escape(labels[l.kind] || l.kind)} · ${escape(date(l.created_at))}</div><h3>${escape(l.name)}</h3></div><span class="office-badge ${escape(l.status)}">${escape(statuses[l.status] || l.status)}</span></div><div class="actions text-sm mt-3">${l.phone ? `<a class="text-link" href="tel:${escape(l.phone.replace(/[^+\d]/g, ''))}">${escape(l.phone)}</a>` : ''}${l.email ? `<a class="text-link" href="mailto:${escape(l.email)}">${escape(l.email)}</a>` : ''}</div>${o.subject ? `<p class="mt-3">${escape(o.subject)}</p>` : ''}<div class="office-request-foot"><span class="office-badge ${escape(o.priority)}">${escape(priorities[o.priority])}</span>${assignee ? `<span>${escape(assignee)}</span>` : ''}${o.dueAt ? `<span class="${overdue ? 'office-overdue' : ''}">${escape(date(o.dueAt))}</span>` : ''}<button type="button" class="text-link plain-button" data-edit-lead="${escape(l.id)}">${escape(t('Open request'))} →</button></div></article>`;
    }).join('') : `<div class="empty-state"><h3>${escape(t('No requests match your filters'))}</h3></div>`;
    $('#lead-page').textContent = `${t('Page')} ${leadPage} / ${Math.max(1, Math.ceil(officeData.total / officeData.pageSize))} · ${officeData.total} ${t('Requests')}`;
    const exportQuery = leadQuery(); exportQuery.delete('page'); $('#lead-export').href = '/api/admin/export?' + exportQuery;
    $('#lead-prev').disabled = leadPage <= 1; $('#lead-next').disabled = leadPage * officeData.pageSize >= officeData.total;
    $('#lead-results-count').textContent = `${officeData.total} ${t('Matching requests')}`;
    renderSelection(); icons($('#leads-list')); await loadDashboard();
  }
  function fillLead(entry) {
    currentLead = structuredClone(entry); dirty.delete('lead-form');
    $('#lead-status-label').textContent = statuses[entry.lead.status] || entry.lead.status;
    $('#lead-status-label').className = 'office-badge ' + entry.lead.status; syncDrafts();
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
    $('#lead-label-link').hidden = !JSON.parse(l.details || '{}').labelAttachment; $('#lead-label-link').href = '/api/attachments?id=' + l.id + '&photo=2';
    $('#lead-attachment-link').hidden = !l.attachment; $('#lead-attachment-link').href = '/api/attachments?id=' + l.id;
    $('#lead-notes').innerHTML = (o.notes || []).slice().reverse().map(n => `<article>${escape(n.text)}<small>${escape(n.actor)} · ${escape(date(n.at))}</small></article>`).join('') || `<p class="text-sm">${escape(t('No notes yet'))}</p>`;
    $('#lead-history').innerHTML = (o.history || []).slice().reverse().map(n => `<article>${escape(t(n.action))}${Object.entries(n.changes || {}).map(([key, value]) => `<p>${escape(t(key))}: ${escape(value)}</p>`).join('')}<small>${escape(n.actor)} · ${escape(date(n.at))}</small></article>`).join('') || `<p class="text-sm">${escape(t('Website request'))}</p>`;
  }
  function newLead() {
    selectTab(tabs.find(tab => tab.dataset.tab === 'leads'));
    if (!discard('lead-form')) return;
    fillLead({ lead: { id: crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16)), kind: 'service', name: '', phone: '', email: '', message: '', status: 'new', created_at: null }, office: { revision: 0, source: 'phone', priority: 'normal', assignee: '', history: [], notes: [] } });
    $('#lead-form').elements.name.focus();
  }
  $('#lead-filter').innerHTML += Object.entries(statuses).map(([value, title]) => `<option value="${value}">${escape(title)}</option>`).join('');
  $('#lead-new').addEventListener('click', newLead);
  $('#lead-close').addEventListener('click', () => { if (!discard('lead-form')) return; currentLead = null; $('#lead-editor').hidden = true; });
  $('#lead-search-form').addEventListener('submit', e => { e.preventDefault(); leadPage = 1; void run(loadOffice); });
  ['lead-filter', 'lead-kind-filter', 'lead-priority-filter', 'lead-assignee-filter', 'lead-source-filter', 'lead-due-filter', 'lead-sort'].forEach(id => $('#' + id).addEventListener('change', () => { leadPage = 1; void run(loadOffice); }));
  $('#lead-filters-reset').addEventListener('click', () => { resetLeadFilters(); void run(loadOffice); });
  $('#lead-bulk-status').innerHTML = Object.entries(statuses).map(([value,label]) => `<option value="${value}">${escape(label)}</option>`).join('');
  $('#lead-select-page').addEventListener('change', e => {
    for (const entry of officeData.leads) if (e.target.checked) selectedLeads.set(entry.lead.id, entry.office.revision); else selectedLeads.delete(entry.lead.id);
    $$('[data-select-lead]').forEach(el => { el.checked = selectedLeads.has(el.dataset.selectLead); }); renderSelection();
  });
  $('#lead-selection-clear').addEventListener('click', () => { selectedLeads.clear(); $$('[data-select-lead]').forEach(el => { el.checked = false; }); renderSelection(); });
  root.addEventListener('change', e => {
    if (!e.target.matches('[data-select-lead]')) return;
    const id = e.target.dataset.selectLead, entry = officeData.leads.find(x => x.lead.id === id);
    if (e.target.checked) selectedLeads.set(id, entry.office.revision); else selectedLeads.delete(id); renderSelection();
  });
  $('#lead-bulk-apply').addEventListener('click', () => {
    if (dirty.has('lead-form') || selectedLeads.size > 100) { error(t(selectedLeads.size > 100 ? 'Select no more than 100 requests.' : 'Save or close the request editor before a bulk update.')); return; }
    if (!confirm(`${t('Apply this status to selected requests?')} (${selectedLeads.size})`)) return;
    void run(async () => {
      await post('/api/admin/leads/bulk-status', { revisions:Object.fromEntries(selectedLeads), status:$('#lead-bulk-status').value });
      selectedLeads.clear(); await loadOffice(); if (currentLead?.lead.created_at) fillLead(await api('/api/admin/lead/' + currentLead.lead.id)); notice(t('Selected requests updated'));
    });
  });
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
    $('#workspace-title').textContent = t(({dashboard:'Overview',leads:'Request desk',products:'Product catalog',settings:'Contacts and terms',content:'Articles and services',translations:'Languages and site copy',users:'Team and access'})[tab.dataset.tab]);
    $('#workspace-subtitle').textContent = t(tab.dataset.tab === 'dashboard' ? 'Your work at a glance' : tab.dataset.tab === 'leads' ? 'Website and office requests in one workspace.' : 'Website management');
    const url = new URL(location.href); url.searchParams.set('section', tab.dataset.tab); history.replaceState(null,'',url);
    if (officeData && ['translations', 'content'].includes(tab.dataset.tab) && !cms) void run(loadCms);
    if (officeData && tab.dataset.tab === 'users') void run(loadUsers);
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
    dirty.clear(); selectedLeads.clear(); translationDraft = {}; cms = null; currentLead = null; $('#lead-editor').hidden = true;
    void run(load);
  });
  document.addEventListener('click', e => { if (e.target.closest('[data-action="dialog-close"]')) closeDialog(); });
  function renderProducts() {
    if (!isAdmin) return;
    const query = $('#product-search').value.trim().toLocaleLowerCase(), category = $('#product-category-filter').value, state = $('#product-state-filter').value;
    const categoryIds = new Set(category.startsWith('catalog:') ? [category.slice(8)] : []);
    for (let changed = true; changed;) { changed = false; for (const c of storeCatalog.categories) if (categoryIds.has(c.parentId) && !categoryIds.has(c.id)) { categoryIds.add(c.id); changed = true; } }
    const list = products.filter(p => [p.title,p.slug,p.model,p.brand,p.sku,p.manufacturer,...(p.replacementCodes || [])].join(' ').toLocaleLowerCase().includes(query) && (category === 'all' || category === p.category || categoryIds.has(p.catalogCategoryId)) && (state === 'all' || state === 'real' && !p.demo || state === 'demo' && p.demo || state === 'no-price' && p.price === null || state === 'no-description' && !p.description.trim()));
    list.sort($('#product-sort').value === 'price' ? (a,b) => (a.price ?? Infinity) - (b.price ?? Infinity) : (a,b) => a.title.localeCompare(b.title, document.documentElement.lang));
    productPages = Math.max(1,Math.ceil(list.length/12)); productPage = Math.max(1,Math.min(productPage,productPages));
    $('#product-metrics').innerHTML = [[t('All products'),products.length],[t('Real products'),products.filter(p => !p.demo).length],[t('Missing price'),products.filter(p => p.price === null).length]].map(([label,count]) => `<div class="catalog-metric"><span>${escape(label)}</span><strong>${count}</strong></div>`).join('');
    $('#product-count').textContent = `${list.length} / ${products.length} ${t('Products')}`;
    $('#product-page').textContent = `${productPage} / ${productPages}`;
    $('#product-page').setAttribute('role', 'status');
    $('#product-page').setAttribute('aria-live', 'polite');
    let pageLinks = $('#product-page-links');
    if (!pageLinks) {
      pageLinks = document.createElement('nav');
      pageLinks.id = 'product-page-links';
      pageLinks.className = 'office-product-pages';
      pageLinks.setAttribute('aria-label', t('Էջավորում'));
      $('#product-page').parentElement.classList.add('office-product-pagination');
      $('#product-page').before(pageLinks);
    }
    const firstPage = Math.max(1, Math.min(productPage - 1, productPages - 2));
    pageLinks.innerHTML = Array.from({ length: Math.min(3, productPages) }, (_, index) => firstPage + index)
      .map(page => `<button type="button" data-product-page="${page}"${page === productPage ? ' class="is-current" aria-current="page"' : ''}${busy ? ' disabled' : ''}>${page}</button>`).join('');
    $('#product-prev').setAttribute('aria-label', t('Նախորդ էջ'));
    $('#product-next').setAttribute('aria-label', t('Հաջորդ էջ'));
    $('#product-prev').disabled = productPage <= 1; $('#product-next').disabled = productPage >= productPages;
    $('#product-list').innerHTML = list.length ? list.slice((productPage-1)*12, productPage*12).map(p => `<button type="button" data-edit-product="${escape(p.slug)}" class="managed-product ${!$('#product-form').hidden && p.slug === selected?.slug ? 'selected' : ''}"><img src="${escape(p.image)}" alt="" width="72" height="72" loading="lazy" /><span class="managed-product-copy"><strong>${escape(p.title)}</strong><small>${escape(p.model || p.slug)}</small><span class="office-badge">${escape(p.category === 'heater' ? t('Ջրատաքացուցիչ') : t('Պահեստամաս'))}</span></span><span class="managed-product-price"><strong>${p.price === null ? escape(t('Price to be confirmed')) : escape(p.price.toLocaleString(document.documentElement.lang) + ' AMD')}</strong><small>${escape(p.demo ? t('Demonstration') : t('Real products'))}</small><span>↗</span></span></button>`).join('') : `<div class="empty-state"><h3>${escape(t('No products match these filters'))}</h3><p>${escape(t('Change the search or filters to see more products.'))}</p></div>`;
  }
  function setupStoreProductEditor() {
    const form = $('#product-form');
    if (!form) return;
    const filter = $('#product-category-filter'), previousFilter = filter.value;
    filter.querySelector('[data-store-categories]')?.remove();
    const group = document.createElement('optgroup'); group.label = t('Կատալոգի կատեգորիաներ'); group.dataset.storeCategories = 'true';
    for (const c of [...storeCatalog.categories].sort((a,b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))) group.append(new Option((c.parentId ? '— ' : '') + c.title, 'catalog:' + c.id));
    filter.append(group); filter.value = previousFilter;
    if ($('#store-product-fields')) return;
    const section = document.createElement('section'); section.className = 'store-product-extension'; section.id = 'store-product-fields';
    section.innerHTML = `<h3>${escape(t('Կատալոգ, կոդեր և համատեղելիություն'))}</h3><p class="store-product-note">${escape(t('Կատեգորիաներն ու սարքերի մոդելները կառավարվում են առանձին բաժնում։'))} <a href="/admin/store">${escape(t('Կատալոգի կառուցվածք'))} ↗</a></p><div class="form-grid"><label class="field full">${escape(t('Կատալոգի կատեգորիա'))}<select name="catalogCategoryId"></select></label><label class="field">${escape(t('Արտիկուլ / SKU'))}<input name="sku" maxlength="100" /></label><label class="field">${escape(t('Պահեստամասի արտադրող'))}<input name="manufacturer" maxlength="200" /></label><label class="field full">${escape(t('Փոխարինման կոդեր'))}<textarea name="replacementCodes" rows="3" maxlength="5000"></textarea><small>${escape(t('Յուրաքանչյուր կոդը՝ առանձին տողով կամ ստորակետով։'))}</small></label><label class="field">${escape(t('Հին գին՝ AMD'))}<input name="oldPrice" type="number" min="0" max="1000000000" step="0.01" /></label><label class="field">${escape(t('Պահեստային քանակ'))}<input name="stockQuantity" type="number" min="0" max="1000000" step="1" /><small>${escape(t('Դատարկ թողեք, եթե քանակը չի հաշվառվում։'))}</small></label><label class="checkbox-line"><input type="checkbox" name="published" />${escape(t('Հրապարակված է'))}</label><label class="checkbox-line"><input type="checkbox" name="isFeatured" />${escape(t('Առաջարկվող'))}</label><label class="checkbox-line"><input type="checkbox" name="isNew" />${escape(t('Նորույթ'))}</label><label class="field full">${escape(t('Համատեղելի սարքերի մոդելներ'))}<select name="compatibleModelIds" multiple size="5"></select><small>${escape(t('Ընտրեք միայն հաստատված համատեղելի մոդելները։ Մի քանի ընտրության համար պահեք Ctrl կամ Command։'))}</small></label><label class="field full">${escape(t('Փոխարինող ապրանքներ'))}<select name="alternativeProductSlugs" multiple size="4"></select></label><label class="field full">${escape(t('Հարակից պահեստամասեր'))}<select name="relatedProductSlugs" multiple size="4"></select></label><label class="field full">${escape(t('Համատեղելի հավաքածուի մասեր'))}<select name="bundleProductSlugs" multiple size="4"></select><small>${escape(t('Ընտրեք միայն այս ապրանքի հետ համատեղելի մասերը։ Գնորդը կկարողանա ընտրել դրանք և ամբողջ հավաքածուն ավելացնել զամբյուղին։ Յուրաքանչյուր մասի գինը պահպանվում է առանձին։'))}</small></label></div>`;
    form.insertBefore(section, $('.editor-footer', form));
  }
  function fillStoreProductFields(p, form) {
    if (!form.elements.catalogCategoryId) return;
    const categories = [...storeCatalog.categories].sort((a,b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    form.elements.catalogCategoryId.innerHTML = `<option value="">${escape(t('Ընտրեք կատեգորիան'))}</option>` + categories.map(c => `<option value="${escape(c.id)}">${escape((c.parentId ? (storeCatalog.categories.find(x => x.id === c.parentId)?.title || c.parentId) + ' / ' : '') + c.title + (c.published ? '' : ' · ' + t('Թաքցված')))}</option>`).join('');
    if (p.catalogCategoryId && !categories.some(c => c.id === p.catalogCategoryId)) form.elements.catalogCategoryId.add(new Option(p.catalogCategoryId, p.catalogCategoryId));
    for (const field of ['catalogCategoryId', 'sku', 'manufacturer', 'oldPrice', 'stockQuantity']) form.elements[field].value = p[field] ?? '';
    form.elements.replacementCodes.value = (p.replacementCodes || []).join('\n');
    for (const field of ['isFeatured', 'isNew']) form.elements[field].checked = !!p[field];
    form.elements.published.checked = p.published !== false;
    const models = storeCatalog.equipmentModels.map(m => ({ value:m.id, label:[m.brand,m.series,m.name].filter(Boolean).join(' · ') + (m.published ? '' : ' · ' + t('Թաքցված')) }));
    const relations = products.filter(item => item.slug !== p.slug).map(item => ({ value:item.slug, label:item.title + (item.sku ? ' · ' + item.sku : '') }));
    for (const field of ['compatibleModelIds', 'alternativeProductSlugs', 'relatedProductSlugs', 'bundleProductSlugs']) {
      const options = [...(field === 'compatibleModelIds' ? models : relations)], values = p[field] || [];
      for (const value of values) if (!options.some(option => option.value === value)) options.push({ value, label:value });
      form.elements[field].innerHTML = options.map(option => `<option value="${escape(option.value)}" ${values.includes(option.value) ? 'selected' : ''}>${escape(option.label)}</option>`).join('');
    }
  }
  function fillProduct(p, reveal = true) {
    selected = structuredClone(p); productBaseline = structuredClone(p); dirty.delete('product-form'); const form = $('#product-form');
    if (reveal) form.hidden = false;
    ['slug', 'title', 'category', 'brand', 'model', 'availability', 'description', 'price', 'volume', 'keywords'].forEach(name => { form.elements[name].value = p[name] ?? ''; });
    form.elements.slug.readOnly = products.some(item => item.slug === p.slug);
    form.elements.specs.value = Object.entries(p.specs).map(([key, value]) => `${key}: ${value}`).join('\n');
    form.elements.demo.checked = p.demo; form.elements.priceIsEstimate.checked = !!p.priceIsEstimate;
    fillStoreProductFields(p, form);
    $('#product-editor-title').textContent = p.title; $('#product-status-label').textContent = t(p.demo ? 'Demonstration examples' : 'Real products');
    $('#product-public-link').href = window.Jermiq.link('/products/' + p.slug); $('#product-public-link').hidden = !products.some(item => item.slug === p.slug);
    selected.images = [...(p.images || [])]; renderGalleryEditor(); $('#product-preview').src = p.image; $('#product-image-upload').value = '';
    renderProducts(); syncDrafts(); if (reveal && innerWidth <= 1100) form.scrollIntoView?.({behavior:'smooth',block:'start'});
  }
  function renderGalleryEditor() {
    const images = [selected.image, ...(selected.images || [])];
    $('#product-gallery-editor').innerHTML = images.map((src,i) => `<div><img src="${escape(src)}" alt="${i+1}" width="72" height="72"><button type="button" data-gallery-main="${i}">${escape(t(i === 0 ? 'Գլխավոր' : 'Դարձնել գլխավոր'))}</button>${images.length > 1 ? `<button type="button" data-gallery-remove="${i}">${escape(t('Հեռացնել'))}</button>` : ''}</div>`).join('');
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-gallery-main], [data-gallery-remove]'); if (!button || !selected || busy) return;
    const images = [selected.image, ...(selected.images || [])];
    if (button.dataset.galleryRemove !== undefined) images.splice(Number(button.dataset.galleryRemove),1);
    else images.unshift(...images.splice(Number(button.dataset.galleryMain),1));
    selected.image = images.shift(); selected.images = images; dirty.add('product-form');
    $('#product-preview').src = selected.image; renderGalleryEditor(); syncDrafts();
  });
  function fillSettings() {
    const form = $('#settings-form');
    ['phone', 'email', 'address', 'hours', 'warranty', 'delivery'].forEach(name => { form.elements[name].value = settings[name] || ''; });
    $$('[name^="service-"]', form).forEach(el => { el.value = settings.servicePrices[el.name.slice(8)] || ''; });
    form.elements.showDraftBanner.checked = settings.showDraftBanner;
  }
  if (isAdmin) {
  root.addEventListener('click', event => { const edit = event.target.closest('[data-edit-product]'); if (edit && discard('product-form')) { fillProduct(products.find(p => p.slug === edit.dataset.editProduct)); notice(''); } });
  ['product-search','product-category-filter','product-state-filter','product-sort'].forEach(id => $('#' + id).addEventListener(id === 'product-search' ? 'input' : 'change', () => { productPage = 1; renderProducts(); }));
  function changeProductPage(page, focusCurrent = false) {
    if (busy || !Number.isInteger(page) || page < 1 || page > productPages || page === productPage) return;
    productPage = page; renderProducts();
    if (focusCurrent) $('#product-page-links [aria-current="page"]')?.focus({ preventScroll: true });
  }
  root.addEventListener('click', event => {
    const page = event.target.closest('[data-product-page]');
    if (page) changeProductPage(Number(page.dataset.productPage), true);
  });
  $('#product-prev').addEventListener('click', () => changeProductPage(productPage - 1));
  $('#product-next').addEventListener('click', () => changeProductPage(productPage + 1));
  $('#product-close').addEventListener('click', () => { if (discard('product-form')) { $('#product-form').hidden = true; syncDrafts(); } });
  $('#product-reset').addEventListener('click', () => { if (discard('product-form')) fillProduct(productBaseline); });
  $('#product-new').addEventListener('click', () => { if (!discard('product-form')) return; fillProduct({ slug: `new-${Date.now()}`, title: t("Նոր ապրանք"), category: 'heater', volume: null, brand: '', model: '', description: '', price: null, availability: t("Առկայությունը ճշտվում է"), specs: {}, image: '/images/hero.webp', demo: false }); });
  $('#product-image-upload').addEventListener('change', async event => {
    const files = [...(event.target.files || [])]; if (!files.length || !selected) return; if (files.length + (selected.images || []).length + (selected.demo || ['/images/hero.webp','/images/parts.webp'].includes(selected.image) ? 0 : 1) > 12) { error(t('Առավելագույնը՝ 12 նկար։')); return; }
    setBusy(true); error('');
    try {
      for (const file of files) {
        const data = new FormData(); data.set('image', file);
        const result = await api('/api/product-image', { method: 'POST', body: data });
        if (selected.demo || selected.image === '/images/hero.webp' || selected.image === '/images/parts.webp') { selected.image = result.image; selected.demo = false; $('#product-form').elements.demo.checked = false; }
        else (selected.images ||= []).push(result.image);
        dirty.add('product-form'); $('#product-preview').src = selected.image; renderGalleryEditor(); syncDrafts();
      } $('#product-preview').src = selected.image;
      notice(t("Պատկերը բեռնված է։ Պահպանեք ապրանքը։"));
    } catch (err) { error(err.message); }
    finally { setBusy(false); }
  });
  $('#product-form').addEventListener('submit', event => {
    event.preventDefault(); if (busy || !selected) return;
    const data = new FormData(event.target), p = { ...selected };
    ['slug', 'title', 'category', 'brand', 'model', 'description', 'availability', 'keywords'].forEach(key => { p[key] = String(data.get(key)).trim(); });
    ['price', 'volume'].forEach(key => { p[key] = data.get(key) === '' ? null : Number(data.get(key)); });
    p.demo = data.get('demo') === 'on'; p.priceIsEstimate = data.get('priceIsEstimate') === 'on';
    if (event.target.elements.catalogCategoryId) {
      for (const key of ['catalogCategoryId', 'sku', 'manufacturer']) p[key] = String(data.get(key) || '').trim();
      for (const key of ['oldPrice', 'stockQuantity']) p[key] = data.get(key) === '' ? null : Number(data.get(key));
      p.replacementCodes = [...new Set(String(data.get('replacementCodes') || '').split(/[\n,]+/).map(value => value.trim()).filter(Boolean))];
      for (const key of ['compatibleModelIds', 'alternativeProductSlugs', 'relatedProductSlugs', 'bundleProductSlugs']) p[key] = data.getAll(key);
      for (const key of ['published', 'isFeatured', 'isNew']) p[key] = data.get(key) === 'on';
    }
    const lines = String(data.get('specs')).split('\n').filter(line => line.trim());
    const names = lines.map(line => line.slice(0,line.indexOf(':')).trim());
    if (lines.some(line => !line.includes(':') || !line.slice(0,line.indexOf(':')).trim()) || new Set(names).size !== names.length) { error(t('Use one unique specification name: value per line.')); return; }
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
    const query = $('#content-search').value.toLocaleLowerCase();
    $('#content-list').innerHTML = cms[type].map((item,index) => ({item,index})).filter(({item}) => [item.title,item.slug || item.id].join(' ').toLocaleLowerCase().includes(query)).map(({item,index}) => `<button type="button" data-content-index="${index}">${escape(item.title)}<small>${escape(item.slug || item.id)}</small></button>`).join('');
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
  $('#content-search').addEventListener('input', renderContent);
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
    renderUsers();
    if (!dirty.has('user-form')) fillUser(users.find(x => x.id === currentUser?.id) || null);
  }
  function renderUsers() {
    const query = $('#user-search').value.toLocaleLowerCase(), filter = $('#user-filter').value;
    const list = users.map((u,i) => ({u,i})).filter(({u}) => u.email.toLocaleLowerCase().includes(query) && (filter === 'all' || filter === 'disabled' && u.disabled || filter === u.role));
    $('#user-count').textContent = `${list.length} / ${users.length}`;
    $('#user-list').innerHTML = list.map(({u,i}) => `<button type="button" data-user-index="${i}">${escape(u.email)}<small>${escape(u.role === 'Admin' ? t('Administrator') : t('Office employee'))} · ${escape(u.disabled ? t('Disabled') : t('Active'))}</small></button>`).join('');
  }
  ['user-search','user-filter'].forEach(id => $('#' + id).addEventListener(id === 'user-search' ? 'input' : 'change',renderUsers));
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
  root.addEventListener('click', e => {
    const quick = e.target.closest('[data-quick]');
    if (quick) { selectTab(tabs.find(tab => tab.dataset.tab === (quick.dataset.quick === 'new-lead' ? 'leads' : quick.dataset.quick))); if (quick.dataset.quick === 'new-lead') newLead(); }
    const attention = e.target.closest('[data-attention]');
    if (attention) { resetLeadFilters(); const key = attention.dataset.attention; if (key === 'overdue') $('#lead-due-filter').value = 'overdue'; if (key === 'urgent') $('#lead-priority-filter').value = 'urgent'; if (key === 'unassigned') $('#lead-assignee-filter').value = '__unassigned'; selectTab(tabs.find(tab => tab.dataset.tab === 'leads')); void run(loadOffice); }
    const catalogFilter = e.target.closest('[data-catalog-filter]');
    if (catalogFilter && isAdmin) { $('#product-search').value = ''; $('#product-category-filter').value = 'all'; $('#product-state-filter').value = catalogFilter.dataset.catalogFilter; productPage = 1; selectTab(tabs.find(tab => tab.dataset.tab === 'products')); renderProducts(); }
    const recent = e.target.closest('[data-dashboard-lead]');
    if (recent && discard('lead-form')) { selectTab(tabs.find(tab => tab.dataset.tab === 'leads')); void run(async () => { fillLead(await api('/api/admin/lead/' + recent.dataset.dashboardLead)); }); }
  });
  const requested = new URLSearchParams(location.search).get('section');
  selectTab(tabs.find(tab => tab.dataset.tab === requested) || tabs.find(tab => tab.dataset.tab === 'dashboard')); void run(load);
})();
