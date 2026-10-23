// Interactive sales workflows against an isolated server and real administrator API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = [];
let local = {};

function check(name, condition) { assert.ok(condition, name); checks.push(name); }
async function until(predicate) {
  for (let i = 0; i < 250; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for an interactive sales workflow');
}
async function raw(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Cookie', input.cookie);
  return fetch(new URL(url, input.baseUrl), { ...options, headers });
}
async function page(route) {
  const localized = new URL(route, input.baseUrl);
  if (!localized.searchParams.has('lang')) localized.searchParams.set('lang', 'hy');
  route = localized.pathname + localized.search;
  const response = await raw(route);
  assert.equal(response.status, 200, route);
  const dom = new JSDOM(await response.text(), {
    url: input.baseUrl + route, runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.matchMedia = query => ({ matches: !query.includes('max-width') && !query.includes('reduced-motion'),
    media: query, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  for (const [key, value] of Object.entries(local)) w.localStorage.setItem(key, value);
  w.fetch = raw;
  for (const script of ['site.js', 'storefront.js', 'part-finder.js', 'bundle-builder.js']) {
    const filename = path.join(root, 'src/Jermiq.Web/wwwroot/js', script);
    if (fs.existsSync(filename)) w.eval(fs.readFileSync(filename, 'utf8'));
  }
  return dom;
}
function retain(dom) {
  local = Object.fromEntries(Object.keys(dom.window.localStorage)
    .map(key => [key, dom.window.localStorage.getItem(key)]));
  dom.window.close();
}
function change(w, element, value) {
  element.value = value;
  element.dispatchEvent(new w.Event('input', { bubbles: true }));
  element.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function submit(w, form) { form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }
function resultSlugs(document) {
  return [...document.querySelectorAll('#finder-results article[data-product]')]
    .map(element => JSON.parse(element.dataset.product).slug);
}
const cart = w => JSON.parse(w.localStorage.getItem('jermiq.cart') || '[]');
const cartSnapshot = w => JSON.stringify(cart(w).sort((a, b) => a.slug.localeCompare(b.slug)));
const total = d => Number(d.querySelector('[data-bundle-total]').textContent.replace(/[^0-9]/g, ''));

let dom = await page('/find-part?mode=code');
let w = dom.window, d = w.document;
const query = d.querySelector('#finder-query');
assert.ok(query && d.querySelector('#finder-code-form'), 'Code search form renders');
query.value = 'RET-BASE-1701';
query.dispatchEvent(new w.Event('input', { bubbles: true }));
submit(w, d.querySelector('#finder-code-form'));
await until(() => resultSlugs(d).length === 1 && resultSlugs(d)[0] === input.baseSlug);
check('Code assistant finds an exact replacement code interactively', resultSlugs(d)[0] === input.baseSlug);
check('Code assistant keeps shareable query state', new URL(w.location.href).searchParams.get('q') === 'RET-BASE-1701');
check('Results report changes for assistive technology',
  !!d.querySelector('#finder-result-count[aria-live], [data-finder-results][aria-live]'));
query.value = 'definitely-no-sales-part';
submit(w, d.querySelector('#finder-code-form'));
await until(() => resultSlugs(d).length === 0);
check('No-match result retains a useful photo-help path',
  !!d.querySelector('[data-finder-mode="photo"], [data-finder-photo-start]'));

d.querySelector('[data-finder-mode="model"]').click();
await until(() => !d.querySelector('[data-finder-panel="model"]').hidden);
change(w, d.querySelector('#finder-category'), 'water-heater-parts');
change(w, d.querySelector('#finder-brand'), 'QA Sales');
await until(() => [...d.querySelector('#finder-model').options].some(option => option.value === input.modelId));
change(w, d.querySelector('#finder-model'), input.modelId);
submit(w, d.querySelector('#finder-model-form'));
await until(() => resultSlugs(d).includes(input.baseSlug) && resultSlugs(d).includes(input.pricedSlug));
check('Model assistant returns exactly the confirmed relationships',
  resultSlugs(d).length === 2 && resultSlugs(d).every(slug => [input.baseSlug, input.pricedSlug].includes(slug)));
check('Selected model remains in shareable URL state', new URL(w.location.href).searchParams.get('model') === input.modelId);
d.querySelector('[data-finder-mode="photo"]').click();
await until(() => !d.querySelector('[data-finder-panel="photo"]').hidden);
d.querySelector('[data-finder-photo-start]').click();
await until(() => d.querySelector('#site-dialog').open && d.querySelector('#site-dialog .request-form'));
const requestForm = d.querySelector('#site-dialog .request-form');
check('Photo helper opens the existing protected two-photo request flow',
  requestForm.elements.kind.value === 'part' && !requestForm.elements.attachment.disabled &&
  !requestForm.elements.attachment2.disabled && requestForm.elements.subject.value.length > 0);
check('Photo request retains useful selection context',
  requestForm.elements.details.value.includes('QA Sales') || requestForm.elements.details.value.includes('Sales model 80'));
retain(dom);

dom = await page('/products/' + input.baseSlug); w = dom.window; d = w.document;
const builder = d.querySelector('[data-bundle-builder]');
assert.ok(builder, 'Configured bundle renders');
const toggle = slug => builder.querySelector(`input[data-bundle-toggle][value="${slug}"]`);
const setToggle = (slug, checked) => {
  toggle(slug).checked = checked;
  toggle(slug).dispatchEvent(new w.Event('change', { bubbles: true }));
};
check('Base stays included and unavailable add-on cannot be selected',
  !!builder.querySelector('.bundle-item-base') && !builder.querySelector('.bundle-item-base [data-bundle-toggle]') &&
  toggle(input.outstockSlug).disabled && !toggle(input.outstockSlug).checked);
check('Initial known subtotal excludes unknown price without NaN',
  total(d) === 1400 && !builder.textContent.includes('NaN') &&
  d.querySelector('[data-bundle-total-label]').textContent.includes('Հայտնի'));
setToggle(input.unknownSlug, false);
check('Estimated prices are labelled rather than shown as final',
  total(d) === 1400 && d.querySelector('[data-bundle-total-label]').textContent.includes('Կողմնորոշիչ'));
setToggle(input.estimateSlug, false);
check('Choosing only fixed-price parts updates the total',
  total(d) === 1250 && !d.querySelector('[data-bundle-total-label]').textContent.includes('Կողմնորոշիչ'));
change(w, builder.querySelector('[data-bundle-quantity]'), '2');
check('Bundle quantity scales the base and selected add-ons together', total(d) === 2500);
builder.querySelector('[data-bundle-add]').click();
await until(() => cart(w).some(item => item.slug === input.baseSlug && item.quantity === 2));
check('One bundle action adds the base and only selected add-ons',
  cart(w).length === 2 && cart(w).some(item => item.slug === input.pricedSlug && item.quantity === 2));
check('Bundle purchase opens the usable cart', d.querySelector('#site-dialog').open);

let before = cartSnapshot(w);
await assert.rejects(w.Jermiq.addCartItems([{ slug: input.baseSlug, quantity: 1 }, { slug: input.outstockSlug, quantity: 1 }]));
check('Unavailable add-on rejects the entire batch without partial additions', cartSnapshot(w) === before);
await assert.rejects(w.Jermiq.addCartItems([{ slug: input.baseSlug, quantity: 20 }, { slug: input.pricedSlug, quantity: 1 }]));
check('Existing-cart quantity limits reject the complete bundle atomically', cartSnapshot(w) === before);
await assert.rejects(w.Jermiq.addCartItems([{ slug: input.baseSlug, quantity: 1.5 }, { slug: input.pricedSlug, quantity: 1 }]));
check('Fractional quantities cannot partially change the cart', cartSnapshot(w) === before);
await assert.rejects(w.Jermiq.addCartItems([{ slug: input.baseSlug, quantity: 1 }, { slug: input.hiddenSlug, quantity: 1 }]));
check('Unpublished products cannot be added through the shared batch API', cartSnapshot(w) === before);

async function editStock(quantity) {
  const product = (await (await raw('/api/admin')).json()).products.find(product => product.slug === input.pricedSlug);
  const response = await raw('/api/admin', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-CSRF-TOKEN': input.adminToken
  }, body: JSON.stringify({ action: 'product', product: { ...product, stockQuantity: quantity } }) });
  assert.equal(response.status, 200);
}
try {
  await editStock(0);
  await assert.rejects(w.Jermiq.addCartItems([{ slug: input.baseSlug, quantity: 1 }, { slug: input.pricedSlug, quantity: 1 }]));
  check('Bundle addition checks fresh stock even after the page was loaded', cartSnapshot(w) === before);
} finally { await editStock(6); }
await w.Jermiq.addCartItems([{ slug: input.baseSlug, quantity: 1 }, { slug: input.pricedSlug, quantity: 1 }]);
check('Valid repeated selection merges with existing quantities exactly once',
  cart(w).length === 2 && cart(w).every(item => item.quantity === 3));
retain(dom);

console.log(JSON.stringify({ interactiveSalesFrontendPassed: checks.length, checks }, null, 2));
