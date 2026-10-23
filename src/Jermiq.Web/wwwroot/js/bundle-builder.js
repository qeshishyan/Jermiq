/* Optional configured complements. Prices and stock are rechecked before cart mutation. */
(() => {
  'use strict';
  const shared = window.Jermiq;
  if (!shared) return;
  const { $, $$, t, icons } = shared;
  const culture = document.documentElement.lang === 'ru' ? 'ru-RU' : document.documentElement.lang === 'en' ? 'en-US' : 'hy-AM';
  const money = value => Number(value).toLocaleString(culture, { maximumFractionDigits: 2 }) + ' ֏';
  $$('[data-bundle-builder]').forEach(root => {
    let data;
    try { data = JSON.parse($('[data-bundle-data]', root).textContent); } catch { return; }
    const base = data.baseProduct;
    if (!base || !Array.isArray(data.products)) return;
    const items = new Map(data.products.filter(p => p && p.slug !== base.slug).map(p => [p.slug, p]));
    const toggles = $$('[data-bundle-toggle]', root);
    const quantity = $('[data-bundle-quantity]', root), button = $('[data-bundle-add]', root);
    const error = $('[data-bundle-error]', root), status = $('[data-bundle-status]', root);
    const mainQuantity = document.querySelector('[data-product-quantity]');
    let busy = false;
    const chosen = () => [base, ...toggles.filter(input => input.checked && items.get(input.value)?.stockQuantity !== 0).map(input => items.get(input.value))];
    function amount() {
      const number = Number(quantity.value);
      return Number.isInteger(number) && number >= 1 && number <= 20 ? number : null;
    }
    function validation() {
      const number = amount();
      if (number === null) return t('Ընտրեք ամբողջ թիվ՝ 1-ից 20։');
      if (base.stockQuantity === 0) return t('Հիմնական մասի առկայությունը պետք է ճշտել։ Թողեք հարցում՝ համապատասխան տարբերակ գտնելու համար։');
      if (chosen().some(product => product.stockQuantity != null && product.stockQuantity < number)) return t('Ընտրված քանակը գերազանցում է ապրանքի առկայությունը։');
      return '';
    }
    function update(announceValidation = false) {
      const selected = chosen(), number = amount(), shownQuantity = number ?? 1;
      const unknown = selected.some(p => p.price == null), estimate = selected.some(p => p.priceIsEstimate);
      const total = selected.reduce((sum, p) => sum + (p.price == null ? 0 : Number(p.price)) * shownQuantity, 0);
      $('[data-bundle-count]', root).textContent = `${selected.length} ${t('ապրանք')} · ${shownQuantity} ${t('հավաքածու')}`;
      $('[data-bundle-total-label]', root).textContent = t(unknown ? 'Հայտնի գների գումարը՝' : estimate ? 'Կողմնորոշիչ գումար' : 'Ընդհանուր արժեքը');
      $('[data-bundle-total]', root).textContent = money(total);
      $('[data-bundle-note]', root).textContent = t(unknown || estimate ? 'Վերջնական գինը կհամաձայնեցվի մենեջերի հետ։ Առաքման արժեքը հաշվարկվում է առանձին։' : 'Գումարը ներառում է ընտրված ապրանքները։ Առաքման արժեքը հաշվարկվում է առանձին։');
      for (const input of toggles) {
        const card = input.closest('[data-bundle-card]'), product = items.get(input.value);
        card.classList.toggle('is-selected', input.checked);
        const label = $('[data-bundle-choice-label]', card);
        if (label) label.textContent = t(input.checked ? 'Ներառված է' : 'Ըստ ցանկության');
        input.disabled = busy || !product || product.stockQuantity === 0;
      }
      const invalid = validation();
      quantity.setAttribute('aria-invalid', String(number === null));
      button.disabled = busy || !!invalid;
      quantity.disabled = busy;
      root.setAttribute('aria-busy', String(busy));
      if (announceValidation) { error.textContent = invalid; error.hidden = !invalid; }
      if (number !== null && mainQuantity && !busy) mainQuantity.value = number;
    }
    toggles.forEach(input => input.addEventListener('change', () => { status.hidden = true; update(true); }));
    quantity.addEventListener('input', () => { status.hidden = true; update(true); });
    mainQuantity?.addEventListener('change', () => { quantity.value = mainQuantity.value; status.hidden = true; update(true); });
    button.addEventListener('click', async () => {
      if (busy) return;
      const invalid = validation();
      if (invalid) { error.textContent = invalid; error.hidden = false; quantity.focus(); return; }
      const selected = chosen(), number = amount();
      error.hidden = true; status.hidden = true; busy = true; update();
      const text = $('span', button), original = text.textContent;
      text.textContent = t('Ավելացվում է…');
      try {
        if (typeof shared.addCartItems !== 'function') throw new Error(t('Չհաջողվեց ավելացնել հավաքածուն։ Թարմացրեք էջը և փորձեք կրկին։'));
        await shared.addCartItems(selected.map(p => ({ slug: p.slug, quantity: number })));
        status.textContent = t('Ընտրված հավաքածուն ավելացված է զամբյուղին։'); status.hidden = false;
        root.classList.remove('bundle-just-added');
        void root.offsetWidth;
        root.classList.add('bundle-just-added');
        if (typeof shared.openCart === 'function') await shared.openCart();
      } catch (err) { error.textContent = err.message || t('Չհաջողվեց ավելացնել հավաքածուն։ Թարմացրեք էջը և փորձեք կրկին։'); error.hidden = false; }
      finally { busy = false; text.textContent = original; update(); }
    });
    if (mainQuantity && Number(mainQuantity.value) >= 1) quantity.value = mainQuantity.value;
    icons(root); update();
  });
})();
