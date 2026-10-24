/* Private request photography. URLs always use the authorized attachment endpoint. */
(() => {
  'use strict';
  const shared = window.Jermiq, root = document.querySelector('#admin-app');
  if (!shared || !root) return;
  const { $, $$, escape, t, icons } = shared;
  const albums = new Map();
  const viewer = $('#lead-photo-viewer'), image = $('#lead-lightbox-image'), stage = $('#lead-lightbox-stage');
  let album = [], index = 0, zoom = 1, loaded = false;
  const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
  function date(value) {
    const instant = new Date(value); if (Number.isNaN(instant.getTime())) return '—';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Yerevan',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(instant).map(part => [part.type,part.value]));
    return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
  }
  function photos(entry) {
    if (!validId(entry?.lead?.id)) return [];
    let details = {};
    try { details = JSON.parse(entry.lead.details || '{}') || {}; } catch { }
    const values = [];
    for (const [number, present, label] of [[1, entry.lead.attachment, 'Հիմնական լուսանկար'], [2, details.labelAttachment, 'Տեխնիկական պիտակ']]) {
      if (!present) continue;
      const query = new URLSearchParams({ id: entry.lead.id, photo: String(number) });
      const url = '/api/attachments?' + query;
      query.set('preview', 'true'); query.set('v', String(entry.office?.revision || 0));
      values.push({ number, id: entry.lead.id, name: entry.lead.name || '', label: t(label), url, preview: '/api/attachments?' + query });
    }
    return values;
  }
  function setEntries(entries, current) {
    albums.clear();
    for (const entry of entries || []) albums.set(entry.lead.id, photos(entry));
    if (current) albums.set(current.lead.id, photos(current));
  }
  function tile(photo, large = false) {
    return `<button type="button" class="lead-photo-tile ${large ? 'lead-photo-large' : ''}" data-lead-photo="${escape(photo.id)}" data-photo-number="${photo.number}" aria-label="${escape(t('Մեծացնել լուսանկարը') + ' · ' + photo.label)}"><span class="lead-photo-surface"><img class="lead-photo-image" src="${escape(photo.preview)}" alt="${escape(photo.label)}" loading="lazy" decoding="async" fetchpriority="low"><span class="lead-photo-fallback" aria-hidden="true">▧</span><span class="lead-photo-expand" aria-hidden="true">↗</span></span><span class="lead-photo-caption">${escape(photo.label)}</span></button>`;
  }
  function cardPhotos(entry) {
    const list = photos(entry);
    if (!list.length) return '';
    return `<div class="lead-card-photos">${list.map(photo => tile(photo)).join('')}<span class="lead-photo-count">${list.length} ${escape(t('լուսանկար'))}</span></div>`;
  }
  function gallery(entry) {
    const target = $('#lead-photo-gallery'); if (!target) return;
    const list = photos(entry); albums.set(entry.lead.id, list);
    target.innerHTML = list.length ? list.map(photo => tile(photo, true)).join('') : `<div class="lead-photos-empty"><i data-icon="image"></i><strong>${escape(t('Լուսանկարներ դեռ չկան'))}</strong><span>${escape(t('Կցեք սարքի ընդհանուր տեսքը և տեխնիկական պիտակը։'))}</span></div>`;
    $('#lead-attachment-area').classList.add('has-gallery');
    $('#lead-photo-total').textContent = String(list.length);
    icons(target);
  }
  function summary(entry) {
    const target = $('#lead-editor-summary'); if (!target) return;
    const lead = entry.lead;
    const phone = (lead.phone || '').replace(/[^+\d]/g, '');
    target.innerHTML = `<span class="lead-customer-avatar" aria-hidden="true">${escape((lead.name || '…').slice(0, 1))}</span><div><strong>${escape(lead.name || t('New request'))}</strong><small>${lead.created_at ? escape(date(lead.created_at)) : escape(t('Նոր հայտի տվյալներ'))}</small><div class="lead-contact-actions">${phone ? `<a href="tel:${escape(phone)}"><i data-icon="phone"></i>${escape(t('Զանգել'))}</a>` : ''}${lead.email ? `<a href="mailto:${escape(lead.email)}"><i data-icon="message"></i>${escape(t('Գրել նամակ'))}</a>` : ''}</div></div>`;
    icons(target);
  }
  function fit() {
    if (!loaded || !image.naturalWidth || !viewer.open) return;
    const scale = Math.min((stage.clientWidth - 40) / image.naturalWidth, (stage.clientHeight - 40) / image.naturalHeight, 1);
    const width = Math.max(1, image.naturalWidth * scale * zoom), height = Math.max(1, image.naturalHeight * scale * zoom);
    image.style.width = width + 'px'; image.style.height = height + 'px';
    image.style.marginTop = Math.max(0, (stage.clientHeight - height) / 2 - 20) + 'px';
    $('#lead-photo-zoom-value').textContent = Math.round(zoom * 100) + '%';
  }
  function sync() {
    if (!viewer) return;
    $('#lead-photo-prev').disabled = album.length < 2;
    $('#lead-photo-next').disabled = album.length < 2;
    $('#lead-photo-zoom-out').disabled = !loaded || zoom <= 1;
    $('#lead-photo-zoom-in').disabled = !loaded || zoom >= 3;
    $('#lead-photo-fit').disabled = !loaded;
  }
  function showPhoto(next) {
    if (!album.length) return;
    index = (next + album.length) % album.length;
    const photo = album[index]; zoom = 1; loaded = false;
    image.hidden = true; $('#lead-photo-error').hidden = true;
    $('#lead-photo-loading').hidden = false;
    $('#lead-photo-caption').textContent = photo.name + ' · ' + photo.label;
    $('#lead-photo-counter').textContent = `${index + 1} / ${album.length}`;
    $('#lead-photo-download').href = photo.url;
    $('#lead-photo-original').href = photo.preview;
    image.alt = photo.name + ' · ' + photo.label;
    image.src = photo.preview;
    $('#lead-photo-thumbnails').innerHTML = album.map((item, i) => `<button type="button" data-photo-index="${i}" aria-label="${escape(item.label)}" aria-pressed="${i === index}"><img src="${escape(item.preview)}" alt="" decoding="async"><span>${escape(item.label)}</span></button>`).join('');
    stage.scrollTop = stage.scrollLeft = 0;
    $('#lead-photo-zoom-value').textContent = '100%'; sync();
  }
  function open(id, number) {
    album = albums.get(id) || [];
    if (!album.length || !viewer) return;
    if (!viewer.open) viewer.showModal();
    document.body.classList.add('lead-viewer-open');
    showPhoto(Math.max(0, album.findIndex(photo => photo.number === number)));
  }
  document.addEventListener('click', event => {
    const photo = event.target.closest('[data-lead-photo]');
    if (photo) { event.preventDefault(); open(photo.dataset.leadPhoto, Number(photo.dataset.photoNumber)); }
  });
  document.addEventListener('error', event => {
    if (event.target.matches?.('.lead-photo-image')) event.target.closest('.lead-photo-tile')?.classList.add('is-missing');
  }, true);
  if (viewer) {
    image.addEventListener('load', () => { loaded = true; image.hidden = false; $('#lead-photo-loading').hidden = true; $('#lead-photo-error').hidden = true; fit(); sync(); });
    image.addEventListener('error', () => { loaded = false; image.hidden = true; $('#lead-photo-loading').hidden = true; $('#lead-photo-error').hidden = false; sync(); });
    $('#lead-photo-close').addEventListener('click', () => viewer.close());
    $('#lead-photo-prev').addEventListener('click', () => showPhoto(index - 1));
    $('#lead-photo-next').addEventListener('click', () => showPhoto(index + 1));
    $('#lead-photo-retry').addEventListener('click', () => { const photo = album[index]; if (photo) { photo.preview += '&retry=' + Date.now(); showPhoto(index); } });
    $('#lead-photo-thumbnails').addEventListener('click', event => { const button = event.target.closest('[data-photo-index]'); if (button) showPhoto(Number(button.dataset.photoIndex)); });
    const zoomBy = change => { if (!loaded) return; zoom = Math.min(3, Math.max(1, zoom + change)); fit(); sync(); };
    $('#lead-photo-zoom-in').addEventListener('click', () => zoomBy(.5));
    $('#lead-photo-zoom-out').addEventListener('click', () => zoomBy(-.5));
    $('#lead-photo-fit').addEventListener('click', () => { zoom = 1; fit(); sync(); stage.scrollTop = stage.scrollLeft = 0; });
    viewer.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') { event.preventDefault(); showPhoto(index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); showPhoto(index - 1); }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(.5); }
      if (event.key === '-') { event.preventDefault(); zoomBy(-.5); }
    });
    viewer.addEventListener('close', () => { document.body.classList.remove('lead-viewer-open'); image.removeAttribute('src'); image.hidden = true; loaded = false; });
    viewer.addEventListener('click', event => { if (event.target === viewer) { const box = viewer.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) viewer.close(); } });
    window.addEventListener('resize', fit);
  }
  window.JermiqLeadDesk = Object.freeze({ photos, setEntries, cardPhotos, gallery, summary, sync, date });
})();
