/* Protected administration UI; every mutation is authenticated and CSRF checked. */
(() => {
  'use strict';
  const { $, $$, escape, icons, api, openDialog, closeDialog } = window.Jermiq;
  const root = $('#admin-app'); if (!root) return;
  const labels = { service: 'Սպասարկում', question: 'Հարց', part: 'Պահեստամաս', order: 'Պատվեր', callback: 'Հետադարձ զանգ' };
  const statuses = { new: 'Նոր', contacted: 'Կապ հաստատված', completed: 'Ավարտված' };
  let products = [], leads = [], settings = {}, selected = null, busy = false;
  function error(message) { $('#admin-error').textContent = message; $('#admin-error').hidden = !message; }
  function notice(message) { $('#admin-notice').textContent = message; $('#admin-notice').hidden = !message; }
  function setBusy(value) { busy = value; $$('button,input[type=file],select.lead-status', root).forEach(el => { el.disabled = value; }); }
  async function load() {
    error(''); setBusy(true);
    try {
      const data = await api('/api/admin', { cache: 'no-store' });
      products = data.products; leads = data.leads; settings = data.settings;
      selected = products.find(p => p.slug === selected?.slug) || products[0] || null;
      renderLeads(); renderProducts(); fillSettings(); if (selected) fillProduct(selected);
    } catch (err) { error(err.message); }
    finally { setBusy(false); }
  }
  async function mutate(body) {
    setBusy(true); error(''); notice('');
    try { await api('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); notice('Պահպանված է'); await load(); return true; }
    catch (err) { error(err.message); return false; }
    finally { setBusy(false); }
  }
  function renderLeads() {
    $('#lead-total').textContent = `(${leads.length})`;
    const filter = $('#lead-filter').value, list = leads.filter(l => filter === 'all' || l.status === filter);
    $('#leads-list').innerHTML = list.length ? list.map(lead => {
      let details = {}; try { details = JSON.parse(lead.details); } catch { /* Show the rest of an older imported lead. */ }
      const date = new Date(lead.created_at).toLocaleString('hy-AM', { timeZone: 'Asia/Yerevan' });
      const detailLabels = { subject: 'Թեմա', brand: 'Արտադրող', model: 'Մոդել', selection: 'Ընտրություն' };
      return `<article class="lead-card"><div class="lead-heading"><div><div class="eyebrow">${escape(labels[lead.kind] || lead.kind)} · ${escape(date)}</div><h3>${escape(lead.name)}</h3><div class="actions text-sm mb-4"><a class="text-link" href="tel:${escape(lead.phone.replace(/[^+\d]/g, ''))}">${escape(lead.phone)}</a>${lead.email ? `<a class="text-link" href="mailto:${escape(lead.email)}">${escape(lead.email)}</a>` : ''}</div></div><select class="lead-status" data-lead-id="${escape(lead.id)}" aria-label="Հայտի կարգավիճակ">${Object.entries(statuses).map(([value, title]) => `<option value="${value}" ${lead.status === value ? 'selected' : ''}>${title}</option>`).join('')}</select></div>${Object.entries(details).filter(([, value]) => value).map(([key, value]) => `<p><strong>${escape(detailLabels[key] || key)}՝ </strong>${escape(value)}</p>`).join('')}${lead.message ? `<p class="mt-3">${escape(lead.message)}</p>` : ''}<div class="actions mt-4">${lead.attachment ? `<a class="btn btn-outline" href="/api/attachments?id=${escape(lead.id)}">Ներբեռնել լուսանկարը</a>` : ''}<button type="button" class="btn btn-outline" data-delete-lead="${escape(lead.id)}"><i data-icon="trash"></i>Հեռացնել հայտը</button></div><p class="text-xs mt-4">Հայտ՝ ${escape(lead.id)}</p></article>`;
    }).join('') : '<div class="empty-state"><h3>Այս բաժնում հայտեր չկան</h3><p>Կայքից ուղարկված հայտերը կհայտնվեն այստեղ։</p></div>';
    icons($('#leads-list'));
  }
  function renderProducts() {
    $('#product-list').innerHTML = products.map(p => `<button type="button" data-edit-product="${escape(p.slug)}" class="${p.slug === selected?.slug ? 'selected' : ''}">${escape(p.title)}<small>${p.demo ? 'Ցուցադրական' : 'Իրական ապրանք'}</small></button>`).join('');
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
  $('#admin-refresh').addEventListener('click', load);
  $('#lead-filter').addEventListener('change', renderLeads);
  const tabs = $$('[data-tab]', root);
  function selectTab(tab) {
    tabs.forEach(el => { const selected = el === tab; el.classList.toggle('selected', selected); el.setAttribute('aria-selected', String(selected)); el.tabIndex = selected ? 0 : -1; $('#panel-' + el.dataset.tab).hidden = !selected; });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[next]); tabs[next].focus();
    });
  });
  selectTab(tabs[0]);
  root.addEventListener('change', event => {
    if (event.target.matches('.lead-status')) void mutate({ action: 'status', id: event.target.dataset.leadId, status: event.target.value });
  });
  root.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-product]');
    if (edit) { fillProduct(products.find(p => p.slug === edit.dataset.editProduct)); notice(''); }
    const remove = event.target.closest('[data-delete-lead]');
    if (remove) openDialog('Հեռացնե՞լ հայտը', 'Հայտն ու դրա կցված լուսանկարը կհեռացվեն։ Այս գործողությունը հնարավոր չէ հետարկել։', `<div class="actions"><button type="button" class="btn btn-outline" data-action="dialog-close">Չեղարկել</button><button type="button" class="btn" data-confirm-delete="${escape(remove.dataset.deleteLead)}">Հեռացնել</button></div>`);
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-confirm-delete]'); if (!button || busy) return;
    button.disabled = true;
    if (await mutate({ action: 'delete', id: button.dataset.confirmDelete })) closeDialog(); else button.disabled = false;
  });
  $('#product-new').addEventListener('click', () => fillProduct({ slug: `new-${Date.now()}`, title: 'Նոր ապրանք', category: 'heater', volume: null, brand: '', model: '', description: '', price: null, availability: 'Առկայությունը ճշտվում է', specs: {}, image: '/images/hero.webp', demo: false }));
  $('#product-image-upload').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file || !selected) return;
    setBusy(true); error('');
    try {
      const data = new FormData(); data.set('image', file);
      const result = await api('/api/product-image', { method: 'POST', body: data });
      selected.image = result.image; $('#product-preview').src = result.image;
      notice('Պատկերը բեռնված է։ Պահպանեք ապրանքը։');
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
    selected = p; void mutate({ action: 'product', product: p });
  });
  $('#settings-form').addEventListener('submit', event => {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.target), next = { ...settings, servicePrices: {} };
    ['phone', 'email', 'address', 'hours', 'warranty', 'delivery'].forEach(key => { next[key] = String(data.get(key)).trim(); });
    $$('[name^="service-"]', event.target).forEach(el => { next.servicePrices[el.name.slice(8)] = el.value.trim(); });
    next.showDraftBanner = data.get('showDraftBanner') === 'on'; void mutate({ action: 'settings', settings: next });
  });
  void load();
})();
