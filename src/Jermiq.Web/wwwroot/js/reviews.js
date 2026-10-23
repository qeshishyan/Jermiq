(() => {
  'use strict';
  const shared = window.Jermiq;
  if (!shared) return;
  const { $, $$, api, escape, t, link } = shared;
  const uuid = () => globalThis.crypto?.randomUUID?.() || '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16));
  const form = $('#product-review-form');
  if (form) {
    let requestId = uuid(), busy = false, lastPayload = null;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      const payload = { name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), rating: Number(form.elements.rating.value), message: form.elements.message.value.trim(), consent: form.elements.consent.checked };
      const fingerprint = JSON.stringify(payload);
      // A retry of unchanged data keeps its id. Editing after a failed response starts a new submission.
      if (lastPayload !== null && lastPayload !== fingerprint) requestId = uuid();
      lastPayload = fingerprint;
      busy = true; const button = $('button[type="submit"]', form); button.disabled = true; form.setAttribute('aria-busy', 'true');
      $('#review-form-error').hidden = true; $('#review-form-success').hidden = true;
      try {
        await api(`/api/products/${encodeURIComponent(form.dataset.productSlug)}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestId }) });
        form.reset(); requestId = uuid(); lastPayload = null;
        $('#review-form-success').textContent = t('Շնորհակալություն։ Կարծիքն ուղարկված է և կհրապարակվի ստուգումից հետո։');
        $('#review-form-success').hidden = false;
      } catch (error) { $('#review-form-error').textContent = error.message; $('#review-form-error').hidden = false; }
      finally { busy = false; button.disabled = false; form.removeAttribute('aria-busy'); }
    });
  }
  const root = $('#review-admin-app');
  if (!root) return;
  let page = 1, busy = false, reviews = [], pagination = { page: 1, pageSize: 30, total: 0 };
  const labels = { pending: 'Սպասում է ստուգման', approved: 'Հրապարակված է', rejected: 'Մերժված է' };
  const error = message => { $('#review-admin-error').textContent = message; $('#review-admin-error').hidden = !message; };
  function render(data) {
    reviews = data.reviews; page = data.page; pagination = data;
    $('#review-admin-count').textContent = `${data.total} ${t('կարծիք')} · ${t('Սպասում է ստուգման')}: ${data.counts.pending}`;
    $('#review-admin-list').innerHTML = reviews.map(review => `<article class="review-card review-admin-card"><header><div><a class="text-link" href="${escape(link('/products/' + review.productSlug + '/reviews'))}" target="_blank" rel="noopener">${escape(review.productTitle)}</a><p><strong>${escape(review.name)}</strong> ${review.email ? `<span class="review-private-email">${escape(review.email)}</span>` : ''}</p></div><span class="review-status review-status-${escape(review.status)}">${escape(t(labels[review.status] || review.status))}</span></header><p class="review-stars"><span aria-hidden="true">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span><span class="review-rating-label">${review.rating} / 5</span></p><p class="review-message">${escape(review.message)}</p><footer><time>${escape(new Date(review.createdAt).toLocaleString(document.documentElement.lang, { timeZone: 'Asia/Yerevan' }))}</time><div class="actions">${['approved', 'rejected', 'pending'].filter(status => status !== review.status).map(status => `<button type="button" class="btn ${status === 'approved' ? '' : 'btn-outline'}" data-review-id="${escape(review.id)}" data-review-status="${status}">${escape(t(status === 'approved' ? 'Հրապարակել' : status === 'rejected' ? 'Մերժել' : 'Վերադարձնել ստուգման'))}</button>`).join('')}</div></footer></article>`).join('') || `<div class="review-empty"><h2>${escape(t('Այս կարգավիճակով կարծիքներ չկան։'))}</h2></div>`;
    $('#review-admin-pagination').hidden = data.total <= data.pageSize;
    $('#review-admin-page').textContent = `${data.page} / ${Math.max(1, Math.ceil(data.total / data.pageSize))}`;
    $('#review-admin-prev').disabled = data.page <= 1;
    $('#review-admin-next').disabled = data.page * data.pageSize >= data.total;
  }
  async function load() {
    render(await api(`/api/admin/reviews?status=${encodeURIComponent($('#review-status-filter').value)}&page=${page}`));
  }
  async function run(fn) {
    if (busy) return;
    busy = true; root.setAttribute('aria-busy', 'true'); error('');
    const controls = $$('main button, main select', root); controls.forEach(control => { control.dataset.wasDisabled = String(control.disabled); control.disabled = true; });
    try { await fn(); }
    catch (err) { error(err.message); }
    finally {
      busy = false; root.removeAttribute('aria-busy');
      controls.filter(control => control.isConnected).forEach(control => { control.disabled = control.dataset.wasDisabled === 'true'; delete control.dataset.wasDisabled; });
      $('#review-admin-prev').disabled = pagination.page <= 1;
      $('#review-admin-next').disabled = pagination.page * pagination.pageSize >= pagination.total;
    }
  }
  $('#review-status-filter').addEventListener('change', () => run(async () => { page = 1; await load(); }));
  $('#review-admin-refresh').addEventListener('click', () => run(load));
  $('#review-admin-prev').addEventListener('click', () => run(async () => { page--; await load(); }));
  $('#review-admin-next').addEventListener('click', () => run(async () => { page++; await load(); }));
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-review-id]'); if (!button || busy) return;
    const review = reviews.find(item => item.id === button.dataset.reviewId); if (!review) return;
    run(async () => {
      await api('/api/admin/reviews/' + encodeURIComponent(review.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: review.revision, status: button.dataset.reviewStatus }) });
      $('#review-admin-notice').textContent = t('Կարծիքի կարգավիճակը պահպանված է։'); $('#review-admin-notice').hidden = false;
      await load();
    });
  });
  run(load);
})();
