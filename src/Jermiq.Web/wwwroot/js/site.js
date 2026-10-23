/* JERMIQ interactions; no JavaScript build tool or external CDN is required. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const translations = JSON.parse($('#site-translations')?.textContent || '{}');
  const t = text => translations[text] || text;
  const culture = document.documentElement.lang === 'ru' ? 'ru-RU' : document.documentElement.lang === 'en' ? 'en-US' : 'hy-AM';
  const link = path => { const url = new URL(path, location.origin); url.searchParams.set('lang', document.documentElement.lang); return url.pathname + url.search + url.hash; };
  const price = value => Number(value).toLocaleString(culture, { maximumFractionDigits: 2 }) + ' ֏';
  const settings = JSON.parse($('#site-settings')?.textContent || '{}');
  const paths = {
    'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
    'chevron-right': '<path d="m9 5 7 7-7 7"/>',
    sliders: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'search-check': '<circle cx="10" cy="10" r="7"/><path d="m21 21-6-6m-8-5 2 2 4-4"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18M16 10a4 4 0 0 1-8 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0L21.5 5a6 6 0 0 1-7.9 7.9L5 21.5a2.1 2.1 0 0 1-3-3l8.6-8.6A6 6 0 0 1 18.5 2Z"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    home: '<path d="m3 10 9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    droplets: '<path d="M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12Z"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/>',
    scale: '<path d="m16 16 3-8 3 8a5 5 0 0 1-6 0Zm-14 0 3-8 3 8a5 5 0 0 1-6 0ZM12 3v17M3 20h18M3 7l9-4 9 4"/>',
    trash: '<path d="M3 6h18M19 6l-1 14H6L5 6m4 0V3h6v3M10 10v7m4-7v7"/>',
    book: '<path d="M12 7v14M3 3h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z"/>',
    'file-check': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M9 15l2 2 4-4"/>',
    stamp: '<path d="M5 22h14M6 18v-3h12v3ZM9 15V9a3 3 0 1 1 6 0v6"/>',
    refresh: '<path d="M3 11a9 9 0 0 1 15-6l3 3M21 3v5h-5m5 5a9 9 0 0 1-15 6l-3-3M3 21v-5h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    package: '<path d="m12 3 9 5v10l-9 5-9-5V8ZM3 8l9 5 9-5m-9 5v10M7 5.8l9 5"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>'
  };
  function icons(root = document) {
    $$('[data-icon]', root).forEach(el => {
      el.classList.add('icon'); el.setAttribute('aria-hidden', 'true');
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[el.dataset.icon] || paths.check}</svg>`;
    });
  }
  const icon = name => `<i data-icon="${name}"></i>`;
  async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.method && options.method !== 'GET') headers.set('X-CSRF-TOKEN', $('meta[name="csrf-token"]').content);
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
    const text = await response.text();
    let data;
    try {
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error();
      data = JSON.parse(text);
    } catch {
      throw new Error(t("Սերվերից ստացվել է անսպասելի պատասխան։ Թարմացրեք էջը և փորձեք կրկին։"));
    }
    if (!response.ok) throw new Error(t(data.error) || t("Չհաջողվեց մշակել հարցումը։"));
    return data;
  }
  let toastTimer;
  function toast(message) {
    const el = $('#site-toast'); el.textContent = message; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }
  const dialog = $('#site-dialog');
  function openDialog(title, description, content, wide = false) {
    $('#dialog-title').textContent = title; $('#dialog-description').textContent = description;
    const target = $('#dialog-content'); target.replaceChildren();
    if (typeof content === 'string') target.innerHTML = content; else target.append(content);
    dialog.classList.toggle('wide', wide); icons(dialog);
    if (!dialog.open) { dialog.showModal(); document.body.classList.add('modal-open'); }
  }
  const closeDialog = () => dialog.close();
  dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } });
  window.Jermiq = Object.freeze({ $, $$, escape, icons, api, toast, openDialog, closeDialog, t, link });
  if ($('#admin-app') || document.body.classList.contains('office-body')) { icons(); return; }
  const titles = { service: t("Պատվիրել սպասարկում"), question: t("Գրեք ձեր հարցը"), part: t("Գտնենք ճիշտ պահեստամասը"), order: t("Ուղարկել պատվերի հայտ"), callback: t("Խնդրել հետադարձ զանգ") };
  function openRequest(spec) {
    if (!Object.hasOwn(titles, spec.kind)) return;
    const content = $('#request-form-template').content.cloneNode(true);
    const form = $('form', content); form.dataset.requestSpec = JSON.stringify(spec);
    form.elements.kind.value = spec.kind; form.elements.subject.value = spec.subject || '';
    form.elements.details.value = spec.details || ''; form.elements.requestId.value = uuid();
    $$('[data-for]', form).forEach(el => {
      el.hidden = !el.dataset.for.split(' ').includes(spec.kind);
      $$('input,select', el).forEach(field => { field.disabled = el.hidden; });
    });
    const subject = $('.request-subject', form); subject.textContent = spec.subject || '';
    subject.hidden = !spec.subject || spec.kind === 'service';
    const issue = form.elements.issue;
    if (spec.subject && spec.kind === 'service') {
      if (![...issue.options].some(x => x.value === spec.subject)) issue.add(new Option(spec.subject, spec.subject));
      issue.value = spec.subject;
    }
    $('.message-label', form).textContent = spec.kind === 'callback' ? t("Ե՞րբ է հարմար զանգել") : t("Հարցը կամ լրացուցիչ մանրամասները");
    form.elements.message.placeholder = spec.kind === 'service' ? t("Նկարագրեք խնդիրը, նշեք հասցեն կամ տարածքը։") : t("Գրեք, թե ինչով կարող ենք օգնել։");
    openDialog(titles[spec.kind], t("Թողեք ձեր տվյալները և հարցը։ Մենք կկարողանանք կապ հաստատել ձեզ հետ։"), content);
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  document.addEventListener('submit', async e => {
    const form = e.target; if (!form.matches('.request-form')) return; e.preventDefault();
    const error = $('.error-text', form), submit = $('button[type="submit"]', form);
    error.hidden = true; submit.disabled = true; submit.textContent = t("Պահպանվում է…");
    try {
      const data = new FormData(form);
      if (data.get('kind') === 'service') data.set('subject', data.get('issue') || data.get('subject') || '');
      for (const file of [data.get('attachment'), data.get('attachment2')]) {
      if (file instanceof File && file.size > 0 && (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) throw new Error(t("Կցեք JPEG, PNG կամ WebP լուսանկար՝ մինչև 5 ՄԲ։"));
      }
      const result = await api('/api/leads', { method: 'POST', body: data });
      form.innerHTML = `<div class="success" role="status">${icon('check')}<h3>${escape(t("Ձեր հայտը գրանցված է"))}</h3><p>${escape(t("Տվյալները պահպանվել են։ Հայտը կընդունվի թիմի կողմից՝ կապ հաստատելու համար։"))}</p><div class="reference">${escape(t("Հայտի համարը՝"))} ${escape(result.id)}</div>${settings.showDraftBanner ? `<p class="form-note">${escape(t("Այս տարբերակը նախնական փորձարկման համար է։"))}</p>` : ''}</div>`;
      icons(form);
    } catch (err) { error.textContent = err.message; error.hidden = false; }
    finally { submit.disabled = false; submit.textContent = t("Ուղարկել հայտը"); }
  });
  const products = new Map();
  $$('[data-product]').forEach(el => { const p = JSON.parse(el.dataset.product); products.set(p.slug, p); });
  const catalogData = $('#catalog-data'); if (catalogData) JSON.parse(catalogData.textContent).forEach(p => products.set(p.slug, p));
  function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  let cart = readLocal('jermiq.cart', []), compared = readLocal('jermiq.compare', []), favorites = readLocal('jermiq.favorites', []);
  cart = Array.isArray(cart) ? [...new Map(cart.filter(x => x && typeof x.slug === 'string').slice(0, 100).map(x => [x.slug, { slug: x.slug, quantity: Math.min(20, Math.max(1, Math.floor(Number(x.quantity)) || 1)) }])).values()] : [];
  compared = Array.isArray(compared) ? [...new Set(compared.filter(x => typeof x === 'string'))].slice(0, 3) : [];
  favorites = Array.isArray(favorites) ? [...new Set(favorites.filter(x => typeof x === 'string'))].slice(0, 200) : [];
  function persist() { try { localStorage.setItem('jermiq.cart', JSON.stringify(cart)); localStorage.setItem('jermiq.compare', JSON.stringify(compared)); localStorage.setItem('jermiq.favorites', JSON.stringify(favorites)); } catch { /* Private-mode navigation still works in this document. */ } updateCounts(); }
  let catalogLoaded = false, catalogLoading;
  async function ensureProducts() {
    if (catalogLoaded) return;
    if (catalogLoading) return catalogLoading;
    catalogLoading = (async () => {
      const data = await api('/api/catalog'); products.clear(); data.products.forEach(p => products.set(p.slug, p)); catalogLoaded = true;
      cart = cart.filter(x => products.has(x.slug)); compared = compared.filter(x => products.has(x)); favorites = favorites.filter(x => products.has(x)); persist();
    })();
    try { await catalogLoading; } finally { catalogLoading = null; }
  }
  // Bundles commit as one change: a failed line must not leave a partial selection in the cart.
  let cartOperation = Promise.resolve();
  function addCartItems(items) {
    const operation = cartOperation.then(async () => {
      if (!Array.isArray(items) || !items.length || items.length > 100 || items.some(item =>
        !item || typeof item.slug !== 'string' || !/^[a-z0-9-]{2,80}$/.test(item.slug) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)) {
        throw new Error(t('Ընտրեք ապրանքները և ստուգեք քանակները։'));
      }
      const { products: liveProducts } = await api('/api/catalog');
      const live = new Map(liveProducts.map(product => [product.slug, product]));
      const incoming = new Map();
      items.forEach(item => incoming.set(item.slug, (incoming.get(item.slug) || 0) + item.quantity));
      const candidate = new Map(cart.filter(item => live.has(item.slug)).map(item => [item.slug, { ...item }]));
      for (const [slug, quantity] of incoming) {
        const product = live.get(slug);
        if (!product || product.published === false) throw new Error(t('Ընտրված ապրանքներից մեկն այլևս հասանելի չէ։ Թարմացրեք էջը։'));
        const nextQuantity = (candidate.get(slug)?.quantity || 0) + quantity;
        if (nextQuantity > 20 || (product.stockQuantity != null && nextQuantity > product.stockQuantity)) {
          throw new Error(t('Ընտրված քանակը՝ զամբյուղում եղածի հետ միասին, գերազանցում է թույլատրելի առկայությունը։'));
        }
        candidate.set(slug, { slug, quantity: nextQuantity });
      }
      if (candidate.size > 100) throw new Error(t('Պատվերի ցանկը լիքն է'));
      products.clear(); live.forEach((product, slug) => products.set(slug, product));
      catalogLoaded = true; cart = [...candidate.values()]; persist();
      await renderSaved();
      document.dispatchEvent(new CustomEvent('jermiq:cart-updated', { detail: { slugs: [...incoming.keys()] } }));
      return { count: cart.reduce((sum, item) => sum + item.quantity, 0) };
    });
    cartOperation = operation.catch(() => {});
    return operation;
  }
  function updateCounts() {
    const count = cart.reduce((sum, x) => sum + x.quantity, 0);
    if ($('#cart-count')) { $('#cart-count').hidden = count === 0; $('#cart-count').textContent = count; }
    $('[data-action="cart"]')?.setAttribute('aria-label', `${t("Պատվերի ցանկ՝")} ${count} ${t("ապրանք")}`);
    if ($('#compare-tray')) $('#compare-tray').hidden = compared.length === 0;
    if ($('#compare-count')) $('#compare-count').textContent = `${compared.length} ${t("ապրանք")}`;
    if ($('#favorites-count')) { $('#favorites-count').hidden = !favorites.length; $('#favorites-count').textContent = favorites.length; }
    $$('[data-action="compare-toggle"]').forEach(el => {
      const selected = compared.includes(JSON.parse(el.closest('[data-product]').dataset.product).slug);
      el.setAttribute('aria-pressed', String(selected)); if ($('span', el)) $('span', el).textContent = selected ? t("Համեմատության մեջ է") : t("Համեմատել");
    });
    $$('[data-action="favorite-toggle"]').forEach(el => {
      const selected = favorites.includes(JSON.parse(el.closest('[data-product]').dataset.product).slug);
      el.setAttribute('aria-pressed', String(selected)); el.setAttribute('aria-label', t(selected ? 'Հեռացնել ընտրյալներից' : 'Ավելացնել ընտրյալներին'));
    });
  }
  function refreshProductActions(root = document) { icons(root); updateCounts(); }
  const savedRoot = $('[data-store-saved]');
  function emptySaved(message) { return `<div class="empty-state">${icon('package')}<h2>${escape(t(message))}</h2><a href="${link('/catalog')}" class="btn">${escape(t('Տեսնել ապրանքները'))}</a></div>`; }
  function cartContent() {
    if (!cart.length) return emptySaved('Ցանկը դեռ դատարկ է');
    const allPriced = cart.every(x => products.get(x.slug).price !== null && !products.get(x.slug).priceIsEstimate);
    const total = cart.reduce((sum, x) => sum + (products.get(x.slug).price || 0) * x.quantity, 0);
    return `<div class="store-cart-lines">${cart.map(x => { const p = products.get(x.slug); return `<div class="cart-row"><a class="store-cart-image" href="${link('/products/' + p.slug)}"><img src="${escape(p.image)}" alt="" width="80" height="80"></a><div><a href="${link('/products/' + p.slug)}"><strong>${escape(p.title)}</strong></a>${p.sku ? `<small>${escape(t('Արտիկուլ'))}: ${escape(p.sku)}</small>` : ''}<small>${p.price === null ? escape(t('Գինը՝ ճշտման ենթակա')) : price(p.price) + escape(t(' / հատ'))}${p.priceIsEstimate ? ` · ${escape(t('Կողմնորոշիչ գին'))}` : ''}</small>${p.stockQuantity === 0 ? `<small class="error-text">${escape(t('Առկայությունը պետք է ճշտել'))}</small>` : ''}</div><div class="quantity"><button type="button" data-action="cart-minus" data-slug="${escape(x.slug)}" aria-label="${escape(t('Պակասեցնել քանակը'))}">−</button><span>${x.quantity}</span><button type="button" data-action="cart-plus" data-slug="${escape(x.slug)}" aria-label="${escape(t('Ավելացնել քանակը'))}">+</button><button type="button" data-action="cart-remove" data-slug="${escape(x.slug)}" aria-label="${escape(t('Հեռացնել ապրանքը'))}">${icon('trash')}</button></div></div>`; }).join('')}</div><div class="store-cart-summary"><div><span>${escape(t(allPriced ? 'Ապրանքների արժեքը՝' : 'Հայտնի գների գումարը՝'))}</span><strong>${price(total)}</strong></div><p>${escape(t(allPriced ? 'Առաքումը համաձայնեցվում է առանձին։' : 'Ցանկում կան չհաստատված գներով ապրանքներ։ Ընդհանուր արժեքը կհամաձայնեցվի կապ հաստատելուց հետո։'))}</p><button type="button" class="btn" data-action="cart-submit">${escape(t('Ձևակերպել պատվերը'))}</button></div>`;
  }
  function compareContent() {
    const list = compared.map(slug => products.get(slug)).filter(Boolean);
    if (!list.length) return emptySaved('Ընտրեք ապրանքներ համեմատության համար։');
    const fields = [[t('Գին'), p => p.price === null ? t('Կճշտվի') : price(p.price) + (p.priceIsEstimate ? ' · ' + t('Կողմնորոշիչ գին') : '')], [t('Արտիկուլ'), p => p.sku || '—'], [t('Արտադրող'), p => p.manufacturer || p.brand || '—'], [t('Մոդել'), p => p.model || '—'], [t('Տարողություն'), p => p.volume ? `${p.volume} ${t('լ')}` : '—'], [t('Առկայություն'), p => p.availability || '—']];
    const keys = [...new Set(list.flatMap(p => Object.keys(p.specs || {})))];
    keys.forEach(key => fields.push([key, p => p.specs?.[key] || '—']));
    return `<div class="compare-table"><table><thead><tr><th>${escape(t('Տվյալ'))}</th>${list.map(p => `<th><a href="${link('/products/' + p.slug)}">${escape(p.title)}</a><button type="button" class="plain-button" data-action="compare-remove" data-slug="${escape(p.slug)}" aria-label="${escape(t('Հեռացնել ապրանքը'))}">×</button></th>`).join('')}</tr></thead><tbody>${fields.map(([label, getter]) => `<tr><th>${escape(label)}</th>${list.map(p => `<td>${escape(getter(p))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><button type="button" class="btn mt-5" data-action="compare-request">${escape(t('Խորհրդակցել մասնագետի հետ'))}</button>`;
  }
  async function renderSaved() {
    if (!savedRoot) return;
    try {
      await ensureProducts();
      savedRoot.innerHTML = savedRoot.dataset.storeSaved === 'cart' ? cartContent() : savedRoot.dataset.storeSaved === 'compare' ? compareContent() : favorites.length ? `<div class="catalog-grid">${favorites.map(slug => productCard(products.get(slug))).join('')}</div>` : emptySaved('Ընտրյալների ցանկը դատարկ է');
      icons(savedRoot); updateCounts();
    } catch (err) { savedRoot.innerHTML = `<p class="error-text" role="alert">${escape(err.message)}</p><button type="button" class="btn" data-action="saved-retry">${escape(t('Փորձել կրկին'))}</button>`; }
  }
  async function showCart() {
    await ensureProducts();
    if (savedRoot?.dataset.storeSaved === 'cart') { await renderSaved(); return; }
    openDialog(t('Ձեր պատվերի ցանկը'), t('Առաքումը համաձայնեցվում է առանձին։'), cartContent());
  }
  async function showCompare() {
    await ensureProducts();
    if (savedRoot?.dataset.storeSaved === 'compare') { await renderSaved(); return; }
    openDialog(t('Ապրանքների համեմատություն'), t('Համեմատեք տվյալները և ճշտեք ընտրությունը մասնագետի հետ։'), compareContent(), true);
  }
  function checkout() {
    if (!cart.length) return;
    const field = (label, name, attrs = '') => `<label class="field">${escape(t(label))}<input name="${name}" ${attrs}></label>`;
    const content = `<form class="store-checkout-form" data-request-id="${uuid()}"><div class="form-grid">${field('Անուն *', 'name', 'required minlength="2" maxlength="100" autocomplete="name"')}${field('Հեռախոս *', 'phone', 'type="tel" required maxlength="30" autocomplete="tel"')}${field('Էլ․ փոստ', 'email', 'type="email" maxlength="200" autocomplete="email"')}<label class="field">${escape(t('Ստացման եղանակ'))}<select name="deliveryMethod"><option value="pickup">${escape(t('Ինքնավերցում'))}</option><option value="delivery">${escape(t('Առաքում'))}</option></select></label><label class="field full" data-checkout-address hidden>${escape(t('Առաքման հասցե'))}<input name="address" maxlength="500" autocomplete="street-address"></label><label class="field full">${escape(t('Վճարման եղանակ'))}<select name="paymentMethod"><option value="manager">${escape(t('Համաձայնեցնել մենեջերի հետ'))}</option><option value="cash">${escape(t('Կանխիկ՝ ստացման պահին'))}</option></select></label><label class="field full">${escape(t('Լրացուցիչ տեղեկություններ'))}<textarea name="message" maxlength="3000"></textarea></label></div><label class="checkbox-line"><input name="consent" type="checkbox" required><span>${escape(t('Համաձայն եմ, որ իմ տվյալներն օգտագործվեն այս հայտի մշակման և ինձ հետ կապ հաստատելու համար։'))} <a class="text-link" href="${link('/privacy')}">${escape(t('Գաղտնիության պայմաններ'))}</a></span></label><p class="form-note">${escape(t('Առաքման արժեքն ու պատվերի վերջնական գումարը հաստատվում են մենեջերի հետ։ Այս քայլում վճարում չի գանձվում։'))}</p><nav class="store-checkout-information" aria-label="${escape(t('Պատվերի պայմաններ'))}"><a href="${link('/delivery')}">${escape(t('Առաքում'))}</a><a href="${link('/payment')}">${escape(t('Վճարում'))}</a><a href="${link('/returns')}">${escape(t('Վերադարձ և փոխանակում'))}</a><a href="${link('/terms')}">${escape(t('Օգտագործման պայմաններ'))}</a></nav><p class="error-text" role="alert" hidden></p><button class="btn w-full" type="submit">${escape(t('Գրանցել պատվերը'))}</button></form>`;
    openDialog(t('Ձևակերպել պատվերը'), t('Ստուգեք կոնտակտներն ու ստացման եղանակը։'), content);
    const form = $('.store-checkout-form');
    form.elements.deliveryMethod.addEventListener('change', () => {
      const delivery = form.elements.deliveryMethod.value === 'delivery'; $('[data-checkout-address]', form).hidden = !delivery; form.elements.address.required = delivery;
    });
  }
  document.addEventListener('submit', async event => {
    const form = event.target; if (!form.matches('.store-checkout-form')) return;
    event.preventDefault();
    if (form.dataset.submitting || !form.reportValidity()) return;
    form.dataset.submitting = 'true';
    const button = $('button[type="submit"]', form), error = $('.error-text', form);
    button.disabled = true; error.hidden = true;
    try {
      // Keep the same ID and payload on an ambiguous network retry. Editing means a new request.
      const payload = { name: form.elements.name.value.trim(), phone: form.elements.phone.value.trim(), email: form.elements.email.value.trim(), address: form.elements.deliveryMethod.value === 'delivery' ? form.elements.address.value.trim() : '', deliveryMethod: form.elements.deliveryMethod.value, paymentMethod: form.elements.paymentMethod.value, message: form.elements.message.value.trim(), consent: form.elements.consent.checked, items: cart.map(x => ({ slug: x.slug, quantity: x.quantity })) };
      const signature = JSON.stringify(payload);
      if (form.dataset.signature && form.dataset.signature !== signature) form.dataset.requestId = uuid();
      form.dataset.signature = signature;
      const result = await api('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: form.dataset.requestId, ...payload }) });
      cart = []; persist(); await renderSaved();
      form.innerHTML = `<div class="success" role="status">${icon('check')}<h3>${escape(t('Պատվերը գրանցված է'))}</h3><p>${escape(t('Մենեջերը կկապվի ձեզ հետ՝ վերջնական գինն ու առաքումը հաստատելու համար։'))}</p><div class="reference">${escape(t('Պատվերի համարը՝'))} ${escape(result.id)}</div>${result.order?.subtotal != null ? `<p>${escape(t('Ապրանքների արժեքը՝'))} ${price(result.order.subtotal)}</p>` : ''}</div>`;
      icons(form);
    } catch (err) { error.textContent = err.message; error.hidden = false; button.disabled = false; }
    finally { delete form.dataset.submitting; }
  });
  let choiceStep = 0, answers = ['', '', ''];
  const questions = [
    { title: t("Քանի՞ հոգու համար է սարքը"), options: [t("1–2 հոգի"), t("3–4 հոգի"), t("5 և ավելի")] },
    { title: t("Որտե՞ղ է տեղադրվելու"), options: [t("Լոգարանում"), t("Խոհանոցում"), t("Այլ տարածքում")] },
    { title: t("Ինչպե՞ս եք օգտագործելու տաք ջուրը"), options: [t("Միայն մեկ կետում"), t("Ցնցուղ և այլ կետեր"), t("Միաժամանակ մի քանի կետում")] }
  ];
  function showChooser() {
    const progress = `<div class="modal-progress">${[0, 1, 2].map(i => `<span class="${i <= choiceStep ? 'done' : ''}"></span>`).join('')}</div>`;
    const content = choiceStep < 3
      ? `${progress}<h3>${questions[choiceStep].title}</h3><div class="choices">${questions[choiceStep].options.map(value => `<button type="button" class="choice" data-action="choice-select" data-value="${escape(value)}" aria-pressed="${answers[choiceStep] === value}">${escape(value)}</button>`).join('')}</div><div class="actions">${choiceStep > 0 ? `<button type="button" class="btn btn-outline" data-action="choice-prev">${escape(t("Նախորդը"))}</button>` : ''}<button type="button" class="btn" data-action="choice-next" ${answers[choiceStep] ? '' : 'disabled'}>${choiceStep === 2 ? t("Տեսնել արդյունքը") : t("Շարունակել")}</button></div>`
      : `${progress}<div class="result-box"><h3>${escape(answers[0])} · ${escape(answers[1])}</h3><p>${escape(answers[2])}</p><p>${escape(t("Առաջարկում ենք համեմատել կուտակային էլեկտրական մոդելները՝ ըստ իրական տարողության, հզորության և տեղադրման չափերի։ Կոնկրետ մոդելը կընտրենք ձեր ջրի օգտագործումն ու տեղանքի պայմանները ճշտելուց հետո։"))}</p></div><div class="actions"><button type="button" class="btn" data-action="choice-request">${escape(t("Ստանալ անհատական առաջարկ"))}</button><a href="${link('/catalog')}" class="btn btn-outline">${escape(t("Տեսնել տեսականին"))}</a></div><button type="button" class="text-link plain-button mt-5" data-action="choice-restart">${escape(t("Փոխել պատասխանները"))}</button>`;
    openDialog(choiceStep < 3 ? t("Օգնենք ընտրել") : t("Ձեր ընտրության ուղղությունը"), t("Երեք կարճ հարց՝ ձեր կարիքներն ավելի լավ հասկանալու համար։"), content);
  }
  function productCard(p) {
    const discounted = p.oldPrice != null && p.price != null && p.oldPrice > p.price;
    return `<article class="product store-product" data-product="${escape(JSON.stringify(p))}"><div class="store-product-image"><a href="${link('/products/' + p.slug)}" class="product-img"><img src="${escape(p.image)}" alt="${escape(p.demo ? t('Տեսականու պատկերային օրինակ') : p.title)}" width="460" height="360" loading="lazy"></a><div class="store-product-badges">${p.isNew ? `<span class="store-badge-new">${escape(t('Նոր'))}</span>` : ''}${discounted ? `<span class="store-badge-sale">${escape(t('Զեղչ'))}</span>` : ''}${p.isFeatured ? `<span>${escape(t('Առաջարկվող'))}</span>` : ''}</div><button type="button" class="store-favorite" data-action="favorite-toggle" aria-pressed="false" aria-label="${escape(t('Ավելացնել ընտրյալներին'))}">${icon('heart')}</button></div><div class="product-copy"><div class="store-product-meta"><span>${escape(p.brand || t(p.category === 'heater' ? 'Ջրատաքացուցիչ' : 'Պահեստամաս'))}</span>${p.sku ? `<small>${escape(t('Կոդ'))}: ${escape(p.sku)}</small>` : ''}</div><a href="${link('/products/' + p.slug)}"><h3>${escape(p.title)}</h3></a><div class="store-product-prices"><div class="price">${p.price === null ? escape(t('Հարցնել գինը')) : price(p.price)}</div>${discounted ? `<del>${price(p.oldPrice)}</del>` : ''}</div>${p.priceIsEstimate && p.price !== null ? `<small class="price-estimate">${escape(t('Կողմնորոշիչ գին'))}</small>` : ''}<div class="stock">${escape(p.availability)}${p.stockQuantity != null ? ` · ${p.stockQuantity} ${escape(t('հատ'))}` : ''}</div><div class="store-product-actions"><button type="button" class="btn" data-action="add-cart">${icon('bag')}${escape(t(p.price === null ? 'Հարցնել գինը' : 'Ավելացնել պատվերին'))}</button><button type="button" class="compare-button" data-action="compare-toggle" aria-pressed="false" aria-label="${escape(t('Համեմատել'))}">${icon('scale')}</button></div></div></article>`;
  }
  const normalizeSearch = value => String(value ?? '').normalize('NFKC').toLowerCase().replaceAll('և', 'եւ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function updateFilterSummary() {
    if (!$('#catalog-active-filters')) return;
    const filters = [['catalog-query', t('Որոնում'), ''], ['catalog-volume', t('Տարողություն'), 'all'], ['catalog-brand', t('Արտադրող'), 'all'], ['catalog-sort', t('Դասավորել'), 'default']];
    const active = filters.flatMap(([id,label,empty]) => {
      const control = $('#' + id); if (!control) return [];
      const selected = control.value.trim() !== empty;
      control.closest('.filter-control')?.classList.toggle('is-active', selected);
      if (!selected) return [];
      const value = control.tagName === 'SELECT' ? control.selectedOptions[0].textContent : control.value.trim();
      return [`<button type="button" class="filter-chip" data-clear-filter="${id}" aria-label="${escape(t('Հեռացնել ֆիլտրը') + ': ' + label + ' — ' + value)}"><span>${escape(label)}: <strong>${escape(value)}</strong></span><span aria-hidden="true">×</span></button>`];
    });
    $('#catalog-active-filters').innerHTML = active.join('');
    $('#catalog-reset-top').hidden = !active.length;
  }
  $('#catalog-active-filters')?.addEventListener('click', event => {
    const button = event.target.closest('[data-clear-filter]'); if (!button) return;
    const control = $('#' + button.dataset.clearFilter);
    control.value = control.id === 'catalog-query' ? '' : control.id === 'catalog-sort' ? 'default' : 'all';
    filterCatalog(); control.focus();
  });
  updateFilterSummary();
  function filterCatalog() {
    if (!$('#catalog')) return;
    const query = normalizeSearch($('#catalog-query').value), category = query && location.pathname !== '/parts' ? '' : $('#catalog').dataset.category;
    const volume = $('#catalog-volume')?.value || 'all', brand = $('#catalog-brand')?.value || 'all', sort = $('#catalog-sort').value;
    const list = JSON.parse(catalogData.textContent).filter(p => (!category || p.category === category) && (volume === 'all' || p.volume === Number(volume)) && (brand === 'all' || p.brand === brand) && query.split(' ').filter(Boolean).every(word => normalizeSearch([p.title, p.description, p.brand, p.model, p.slug, p.keywords, p.volume, ...Object.keys(p.specs), ...Object.values(p.specs)].join(' ')).includes(word)));
    const searchUrl = new URL(location.href); query ? searchUrl.searchParams.set('q', $('#catalog-query').value.trim()) : searchUrl.searchParams.delete('q'); history.replaceState(null, '', searchUrl);
    if (sort === 'default' && query) list.sort((a,b) => Number(normalizeSearch(b.title).includes(query)) - Number(normalizeSearch(a.title).includes(query)));
    if (sort === 'price') list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, culture));
    $('#catalog-grid').innerHTML = list.map(productCard).join(''); $('#catalog-count').textContent = `${escape(t("Գտնվել է"))} ${list.length} ${escape(t("ապրանք"))}`; $('#catalog-empty').hidden = list.length > 0;
    icons($('#catalog-grid')); updateCounts(); updateFilterSummary();
  }
  $('#catalog-query')?.addEventListener('input', filterCatalog);
  ['#catalog-volume', '#catalog-brand', '#catalog-sort'].forEach(s => $(s)?.addEventListener('change', filterCatalog));
  const menuToggle = $('#menu-toggle'), mainNav = $('#main-nav');
  const compactNavigation = window.matchMedia?.('(max-width: 1180px)');
  function setMenuOpen(open, restoreFocus = false) {
    // Use the visible header edge so the panel fits even before the top bar scrolls away.
    document.documentElement.style.setProperty('--navigation-header-height', `${Math.max(0, $('.header-main').getBoundingClientRect().bottom)}px`);
    mainNav.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? menuToggle.dataset.closeLabel : menuToggle.dataset.openLabel);
    if (restoreFocus) menuToggle.focus();
  }
  document.documentElement.classList.add('nav-ready');
  menuToggle.addEventListener('click', () => setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true'));
  mainNav.addEventListener('click', event => {
    if (event.target.closest('a, button')) setMenuOpen(false, event.target.closest('button') !== null);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
      event.preventDefault(); setMenuOpen(false, true);
    }
  });
  const dismissMenu = event => {
    if (menuToggle.getAttribute('aria-expanded') === 'true' && !mainNav.contains(event.target) && !menuToggle.contains(event.target)) setMenuOpen(false);
  };
  document.addEventListener('click', dismissMenu);
  document.addEventListener('focusin', dismissMenu);
  compactNavigation?.addEventListener('change', () => {
    const focusInMenu = mainNav.contains(document.activeElement);
    setMenuOpen(false, compactNavigation.matches && focusInMenu);
  });
  document.addEventListener('click', async e => {
    const request = e.target.closest('[data-request]');
    if (request) return openRequest({ kind: request.dataset.request, subject: request.dataset.subject, details: request.dataset.details });
    const el = e.target.closest('[data-action]'); if (!el) return;
    try {
      switch (el.dataset.action) {
        case 'dialog-close': closeDialog(); break;
        case 'cart': await showCart(); break;
        case 'add-cart': {
          const p = JSON.parse(el.closest('[data-product]').dataset.product); products.set(p.slug, p);
          if (p.stockQuantity === 0) { openRequest({kind:'part', subject:p.title}); break; }
          const requested = Number(el.closest('[data-product]').querySelector('[data-product-quantity]')?.value) || 1;
          if (el.dataset.cartBusy) break;
          el.dataset.cartBusy = 'true'; el.disabled = true;
          try { await addCartItems([{ slug: p.slug, quantity: Math.max(1, Math.floor(requested)) }]); await showCart(); }
          finally { delete el.dataset.cartBusy; el.disabled = false; }
          break;
        }
        case 'cart-minus': case 'cart-plus': case 'cart-remove': {
          const item = cart.find(x => x.slug === el.dataset.slug); if (!item) break;
          if (el.dataset.action === 'cart-remove') item.quantity = 0; else item.quantity += el.dataset.action === 'cart-plus' ? 1 : -1;
          item.quantity = Math.min(20, products.get(item.slug)?.stockQuantity ?? 20, item.quantity); cart = cart.filter(x => x.quantity > 0); persist(); await showCart(); break;
        }
        case 'cart-submit': checkout(); break;
        case 'saved-retry': await renderSaved(); break;
        case 'favorite-toggle': {
          const p = JSON.parse(el.closest('[data-product]').dataset.product); products.set(p.slug, p);
          if (favorites.includes(p.slug)) favorites = favorites.filter(x => x !== p.slug);
          else if (favorites.length < 200) favorites.push(p.slug); else { toast(t('Ընտրյալների ցանկը լիքն է')); break; }
          persist(); if (savedRoot?.dataset.storeSaved === 'favorites') await renderSaved(); break;
        }
        case 'compare-toggle': {
          const p = JSON.parse(el.closest('[data-product]').dataset.product); products.set(p.slug, p);
          if (compared.includes(p.slug)) compared = compared.filter(x => x !== p.slug);
          else if (compared.length < 3) compared.push(p.slug); else toast(t("Կարող եք համեմատել մինչև 3 ապրանք։")); persist(); if (savedRoot?.dataset.storeSaved === 'compare') await renderSaved(); break;
        }
        case 'compare-remove': compared = compared.filter(x => x !== el.dataset.slug); persist(); await showCompare(); break;
        case 'compare-open': await showCompare(); break;
        case 'compare-clear': compared = []; persist(); await renderSaved(); break;
        case 'compare-request': openRequest({ kind: 'question', subject: t("Օգնություն համեմատվող ապրանքների ընտրության հարցում"), details: compared.map(slug => products.get(slug).title).join(', ') }); break;
        case 'chooser': choiceStep = 0; answers = ['', '', '']; showChooser(); break;
        case 'choice-select': answers[choiceStep] = el.dataset.value; showChooser(); break;
        case 'choice-next': if (answers[choiceStep]) { choiceStep++; showChooser(); } break;
        case 'choice-prev': choiceStep--; showChooser(); break;
        case 'choice-restart': choiceStep = 0; showChooser(); break;
        case 'choice-request': openRequest({ kind: 'question', subject: t("Օգնություն ջրատաքացուցիչի ընտրության հարցում"), details: `${escape(t("Ընտանիք՝"))} ${answers[0]}; ${escape(t("Տեղադրում՝"))} ${answers[1]}; ${escape(t("Օգտագործում՝"))} ${answers[2]}` }); break;
        case 'catalog-reset': $('#catalog-sort').value = 'default'; $('#catalog-query').value = ''; if ($('#catalog-volume')) $('#catalog-volume').value = 'all'; if ($('#catalog-brand')) $('#catalog-brand').value = 'all'; filterCatalog(); break;
      }
    } catch (err) { toast(err.message || t("Փորձեք կրկին։")); }
  });
  const gallery = $('[data-gallery]');
  if (gallery) {
    const thumbs = $$('[data-gallery-src]', gallery), viewer = $('.gallery-lightbox', gallery);
    let current = 0;
    const show = index => {
      current = (index + thumbs.length) % thumbs.length;
      const src = thumbs[current].dataset.gallerySrc;
      $('#gallery-main').src = src; $('.gallery-stage img', viewer).src = src;
      thumbs.forEach((button,i) => button.setAttribute('aria-pressed', String(i === current)));
      $('.gallery-counter', viewer).textContent = `${current+1} / ${thumbs.length}`;
      viewer.classList.remove('is-zoomed');
    };
    thumbs.forEach((button,i) => button.addEventListener('click', () => show(i)));
    $('.gallery-open', gallery).addEventListener('click', () => { show(current); viewer.showModal(); });
    $('[data-gallery-close]', viewer).addEventListener('click', () => viewer.close());
    $('[data-gallery-prev]', viewer).addEventListener('click', () => show(current-1));
    $('[data-gallery-next]', viewer).addEventListener('click', () => show(current+1));
    $('[data-gallery-zoom]', viewer).addEventListener('click', () => viewer.classList.toggle('is-zoomed'));
    viewer.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show(current + (e.key === 'ArrowLeft' ? -1 : 1)); } });
    viewer.addEventListener('click', e => { if (e.target === viewer) viewer.close(); });
    show(0);
  }
  if (document.modelContext?.registerTool) {
    try {
      document.modelContext.registerTool({ name: 'start_service_request', title: t("Բացել սպասարկման հայտը"), description: 'Opens the service form without submitting it.', inputSchema: { type: 'object', properties: { issue: { type: 'string', maxLength: 200 } }, additionalProperties: false }, annotations: { readOnlyHint: false }, execute(input) {
        if (!input || typeof input !== 'object' || (input.issue !== undefined && (typeof input.issue !== 'string' || input.issue.length > 200))) throw new Error('Invalid issue');
        openRequest({ kind: 'service', subject: input.issue }); return { opened: true, submitted: false };
      } });
    } catch { /* Optional WebMCP capability does not affect normal browsing. */ }
  }
  window.Jermiq = Object.freeze({ $, $$, escape, icons, api, toast, openDialog, closeDialog, t, link, openRequest, productCard, addCartItems, openCart: showCart, refreshProductActions });
  icons(); updateCounts(); renderSaved();
})();
