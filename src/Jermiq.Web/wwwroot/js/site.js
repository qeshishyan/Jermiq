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
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    package: '<path d="m12 3 9 5v10l-9 5-9-5V8ZM3 8l9 5 9-5m-9 5v10M7 5.8l9 5"/>'
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
  if ($('#admin-app')) { icons(); return; }
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
      const file = data.get('attachment');
      if (file instanceof File && file.size > 0 && (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) throw new Error(t("Կցեք JPEG, PNG կամ WebP լուսանկար՝ մինչև 5 ՄԲ։"));
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
  let cart = readLocal('jermiq.cart', []), compared = readLocal('jermiq.compare', []);
  cart = Array.isArray(cart) ? cart.filter(x => x && typeof x.slug === 'string').slice(0, 100).map(x => ({ slug: x.slug, quantity: Math.min(20, Math.max(1, Number(x.quantity) || 1)) })) : [];
  compared = Array.isArray(compared) ? [...new Set(compared.filter(x => typeof x === 'string'))].slice(0, 3) : [];
  function persist() { try { localStorage.setItem('jermiq.cart', JSON.stringify(cart)); localStorage.setItem('jermiq.compare', JSON.stringify(compared)); } catch { /* Private-mode navigation still works in this document. */ } updateCounts(); }
  let catalogLoaded = false;
  async function ensureProducts() {
    if (catalogLoaded) return;
    const data = await api('/api/catalog'); data.products.forEach(p => products.set(p.slug, p)); catalogLoaded = true;
    cart = cart.filter(x => products.has(x.slug)); compared = compared.filter(x => products.has(x)); persist();
  }
  function updateCounts() {
    const count = cart.reduce((sum, x) => sum + x.quantity, 0);
    $('#cart-count').hidden = count === 0; $('#cart-count').textContent = count;
    $('[data-action="cart"]').setAttribute('aria-label', `${escape(t("Պատվերի ցանկ՝"))} ${count} ${escape(t("ապրանք"))}`);
    $('#compare-tray').hidden = compared.length === 0; $('#compare-count').textContent = `${compared.length} ${escape(t("ապրանք"))}`;
    $$('[data-action="compare-toggle"]').forEach(el => {
      const selected = compared.includes(JSON.parse(el.closest('[data-product]').dataset.product).slug);
      el.setAttribute('aria-pressed', String(selected)); $('span', el).textContent = selected ? t("Համեմատության մեջ է") : t("Համեմատել");
    });
  }
  async function showCart() {
    await ensureProducts();
    if (!cart.length) return openDialog(t("Ձեր պատվերի ցանկը"), t("Ուղարկեք ցանկը՝ գինն ու առկայությունը համաձայնեցնելու համար։"), `<div class="empty-state">${icon('bag')}<h3>${escape(t("Ցանկը դեռ դատարկ է"))}</h3><p>${escape(t("Ընտրեք ապրանքները կատալոգից։"))}</p><a href="${link('/catalog')}" class="btn">${escape(t("Տեսնել ապրանքները"))}</a></div>`);
    const allPriced = cart.every(x => products.get(x.slug).price !== null);
    const total = cart.reduce((sum, x) => sum + (products.get(x.slug).price || 0) * x.quantity, 0);
    const rows = cart.map(x => { const p = products.get(x.slug); return `<div class="cart-row"><div><strong>${escape(p.title)}</strong><small>${p.price === null ? t("Գինը՝ ճշտման ենթակա") : price(p.price) + t(" / հատ")}</small></div><div class="quantity"><button type="button" data-action="cart-minus" data-slug="${escape(x.slug)}" aria-label="${escape(t("Պակասեցնել քանակը"))}">−</button><span>${x.quantity}</span><button type="button" data-action="cart-plus" data-slug="${escape(x.slug)}" aria-label="${escape(t("Ավելացնել քանակը"))}">+</button><button type="button" data-action="cart-remove" data-slug="${escape(x.slug)}" aria-label="${escape(t("Հեռացնել ապրանքը"))}">${icon('trash')}</button></div></div>`; }).join('');
    openDialog(t("Ձեր պատվերի ցանկը"), t("Ուղարկեք ցանկը՝ գինն ու առկայությունը համաձայնեցնելու համար։"), `${rows}<div class="notice mt-4">${allPriced ? `${escape(t("Ապրանքների արժեքը՝"))} ${price(total)}։ ${escape(t("Առաքումը համաձայնեցվում է առանձին։"))}` : t("Ցանկում կան չհաստատված գներով ապրանքներ։ Ընդհանուր արժեքը կհամաձայնեցվի կապ հաստատելուց հետո։")}</div><button type="button" class="btn" data-action="cart-submit">${escape(t("Ուղարկել ցանկը"))}</button>`);
  }
  async function showCompare() {
    await ensureProducts();
    const list = compared.map(slug => products.get(slug));
    if (!list.length) return toast(t("Ընտրեք ապրանքներ համեմատության համար։"));
    const fields = [[t("Գին"), p => p.price === null ? t("Կճշտվի") : price(p.price)], [t("Տարողություն"), p => p.volume ? `${p.volume} ${escape(t("լ"))}` : '—'], [t("Արտադրող"), p => p.brand], [t("Մոդել"), p => p.model], [t("Առկայություն"), p => p.availability]];
    const table = `<div class="compare-table"><table><thead><tr><th>${escape(t("Տվյալ"))}</th>${list.map(p => `<th>${escape(p.title)}</th>`).join('')}</tr></thead><tbody>${fields.map(([label, getter]) => `<tr><th>${label}</th>${list.map(p => `<td>${escape(getter(p))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><button type="button" class="btn mt-5" data-action="compare-request">${escape(t("Խորհրդակցել մասնագետի հետ"))}</button>`;
    openDialog(t("Ապրանքների համեմատություն"), t("Համեմատեք տվյալները և ճշտեք ընտրությունը մասնագետի հետ։"), table, true);
  }
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
    return `<article class="product" data-product="${escape(JSON.stringify(p))}"><a href="${link('/products/' + escape(p.slug))}" class="product-img"><img src="${escape(p.image)}" alt="${escape(p.demo ? t("Տեսականու պատկերային օրինակ") : p.title)}" width="460" height="300" loading="lazy">${p.volume ? `<span class="product-volume">${p.volume} ${escape(t("լ"))}</span>` : ''}</a><div class="product-copy"><div class="meta">${escape(p.demo ? t("Ցուցադրական օրինակ") : p.brand)}</div><a href="${link('/products/' + escape(p.slug))}"><h3>${escape(p.title)}</h3></a><div class="price">${p.price === null ? t("Գինը՝ շուտով") : price(p.price)}</div><div class="stock">${escape(p.availability)}</div><button type="button" class="btn" data-action="add-cart">${icon('bag')}${p.price === null ? t("Հարցնել գինը") : t("Ավելացնել պատվերին")}</button><button type="button" class="compare-button" data-action="compare-toggle" aria-pressed="false">${icon('scale')}<span>${escape(t("Համեմատել"))}</span></button></div></article>`;
  }
  function filterCatalog() {
    if (!$('#catalog')) return;
    const query = $('#catalog-query').value.toLocaleLowerCase(culture), category = $('#catalog').dataset.category;
    const volume = $('#catalog-volume')?.value || 'all', brand = $('#catalog-brand')?.value || 'all', sort = $('#catalog-sort').value;
    const list = JSON.parse(catalogData.textContent).filter(p => (!category || p.category === category) && (volume === 'all' || p.volume === Number(volume)) && (brand === 'all' || p.brand === brand) && [p.title, p.description, p.brand, p.model, p.slug, ...Object.values(p.specs)].join(' ').toLocaleLowerCase(culture).includes(query));
    if (sort === 'price') list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, culture));
    $('#catalog-grid').innerHTML = list.map(productCard).join(''); $('#catalog-count').textContent = `${escape(t("Գտնվել է"))} ${list.length} ${escape(t("ապրանք"))}`; $('#catalog-empty').hidden = list.length > 0;
    icons($('#catalog-grid')); updateCounts();
  }
  $('#catalog-query')?.addEventListener('input', filterCatalog);
  ['#catalog-volume', '#catalog-brand', '#catalog-sort'].forEach(s => $(s)?.addEventListener('change', filterCatalog));
  $('#menu-toggle').addEventListener('click', () => { const open = $('#main-nav').classList.toggle('is-open'); $('#menu-toggle').setAttribute('aria-expanded', String(open)); });
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
          const existing = cart.find(x => x.slug === p.slug); if (existing) existing.quantity = Math.min(20, existing.quantity + 1); else cart.push({ slug: p.slug, quantity: 1 }); persist(); await showCart(); break;
        }
        case 'cart-minus': case 'cart-plus': case 'cart-remove': {
          const item = cart.find(x => x.slug === el.dataset.slug); if (!item) break;
          if (el.dataset.action === 'cart-remove') item.quantity = 0; else item.quantity += el.dataset.action === 'cart-plus' ? 1 : -1;
          item.quantity = Math.min(20, item.quantity); cart = cart.filter(x => x.quantity > 0); persist(); await showCart(); break;
        }
        case 'cart-submit': openRequest({ kind: 'order', subject: t("Ապրանքների պատվերի հայտ"), details: cart.map(x => `${products.get(x.slug).title} × ${x.quantity}`).join('\n') }); break;
        case 'compare-toggle': {
          const p = JSON.parse(el.closest('[data-product]').dataset.product); products.set(p.slug, p);
          if (compared.includes(p.slug)) compared = compared.filter(x => x !== p.slug);
          else if (compared.length < 3) compared.push(p.slug); else toast(t("Կարող եք համեմատել մինչև 3 ապրանք։")); persist(); break;
        }
        case 'compare-open': await showCompare(); break;
        case 'compare-clear': compared = []; persist(); break;
        case 'compare-request': openRequest({ kind: 'question', subject: t("Օգնություն համեմատվող ապրանքների ընտրության հարցում"), details: compared.map(slug => products.get(slug).title).join(', ') }); break;
        case 'chooser': choiceStep = 0; answers = ['', '', '']; showChooser(); break;
        case 'choice-select': answers[choiceStep] = el.dataset.value; showChooser(); break;
        case 'choice-next': if (answers[choiceStep]) { choiceStep++; showChooser(); } break;
        case 'choice-prev': choiceStep--; showChooser(); break;
        case 'choice-restart': choiceStep = 0; showChooser(); break;
        case 'choice-request': openRequest({ kind: 'question', subject: t("Օգնություն ջրատաքացուցիչի ընտրության հարցում"), details: `${escape(t("Ընտանիք՝"))} ${answers[0]}; ${escape(t("Տեղադրում՝"))} ${answers[1]}; ${escape(t("Օգտագործում՝"))} ${answers[2]}` }); break;
        case 'catalog-reset': $('#catalog-query').value = ''; if ($('#catalog-volume')) $('#catalog-volume').value = 'all'; if ($('#catalog-brand')) $('#catalog-brand').value = 'all'; filterCatalog(); break;
      }
    } catch (err) { toast(err.message || t("Փորձեք կրկին։")); }
  });
  if (document.modelContext?.registerTool) {
    try {
      document.modelContext.registerTool({ name: 'start_service_request', title: t("Բացել սպասարկման հայտը"), description: 'Opens the service form without submitting it.', inputSchema: { type: 'object', properties: { issue: { type: 'string', maxLength: 200 } }, additionalProperties: false }, annotations: { readOnlyHint: false }, execute(input) {
        if (!input || typeof input !== 'object' || (input.issue !== undefined && (typeof input.issue !== 'string' || input.issue.length > 200))) throw new Error('Invalid issue');
        openRequest({ kind: 'service', subject: input.issue }); return { opened: true, submitted: false };
      } });
    } catch { /* Optional WebMCP capability does not affect normal browsing. */ }
  }
  window.Jermiq = Object.freeze({ $, $$, escape, icons, api, toast, openDialog, closeDialog, t, link });
  icons(); updateCounts();
})();
