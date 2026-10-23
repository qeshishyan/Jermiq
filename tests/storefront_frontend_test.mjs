// DOM workflows against the isolated HTTP app. This is not a visual browser test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = [];
let savedLocal = {};

function check(name, condition) { assert.ok(condition, name); checks.push(name); }
async function until(predicate) {
  for (let i = 0; i < 250; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for a store operation');
}
async function rawFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Cookie', input.cookie);
  return fetch(new URL(url, input.baseUrl), { ...options, headers });
}
async function page(route) {
  const response = await rawFetch(route);
  assert.equal(response.status, 200, route);
  const dom = new JSDOM(await response.text(), {
    url: input.baseUrl + route, runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.matchMedia = query => ({ matches: !query.includes('max-width'), media: query, addEventListener() {}, removeEventListener() {} });
  for (const [key, value] of Object.entries(savedLocal)) w.localStorage.setItem(key, value);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event('close'));
  };
  w.fetch = rawFetch;
  w.eval(fs.readFileSync(path.join(root, 'src/Jermiq.Web/wwwroot/js/site.js'), 'utf8'));
  const storefront = path.join(root, 'src/Jermiq.Web/wwwroot/js/storefront.js');
  if (fs.existsSync(storefront)) w.eval(fs.readFileSync(storefront, 'utf8'));
  return dom;
}
function retain(dom) {
  savedLocal = Object.fromEntries(Object.keys(dom.window.localStorage)
    .map(key => [key, dom.window.localStorage.getItem(key)]));
  dom.window.close();
}
function card(document, slug) {
  return [...document.querySelectorAll('article[data-product]')]
    .find(element => JSON.parse(element.dataset.product).slug === slug);
}

let dom = await page('/parts?category=water-heater-elements&q=QA');
let d = dom.window.document;
const first = card(d, input.firstSlug), second = card(d, input.secondSlug);
assert.ok(first && second, 'QA products rendered in catalog');
first.querySelector('[data-action="favorite-toggle"]').click();
check('Favorite button reflects selection accessibly',
  first.querySelector('[data-action="favorite-toggle"]').getAttribute('aria-pressed') === 'true');
check('Favorites header counter updates', d.querySelector('#favorites-count').textContent === '1');
retain(dom);

// A retired product in browser storage must be removed without breaking remaining favorites.
savedLocal['jermiq.favorites'] = JSON.stringify([input.firstSlug, 'retired-product']);
dom = await page('/favorites'); d = dom.window.document;
await until(() => card(d, input.firstSlug));
check('Favorites survive full-page navigation and discard retired products',
  d.querySelectorAll('[data-store-saved] article[data-product]').length === 1 &&
  JSON.parse(dom.window.localStorage.getItem('jermiq.favorites')).length === 1);
card(d, input.firstSlug).querySelector('[data-action="favorite-toggle"]').click();
await until(() => d.querySelector('[data-store-saved] .empty-state'));
check('Removing final favorite renders useful empty state', d.querySelector('#favorites-count').hidden);
retain(dom);

dom = await page('/parts?category=water-heater-elements&q=QA'); d = dom.window.document;
card(d, input.firstSlug).querySelector('[data-action="compare-toggle"]').click();
card(d, input.secondSlug).querySelector('[data-action="compare-toggle"]').click();
check('Comparison selection is preserved in browser state',
  JSON.parse(dom.window.localStorage.getItem('jermiq.compare')).length === 2);
retain(dom);
dom = await page('/compare'); d = dom.window.document;
await until(() => d.querySelector('.compare-table'));
check('Dedicated comparison includes union of technical specifications',
  d.querySelectorAll('.compare-table thead th').length === 3 &&
  d.querySelector('.compare-table').textContent.includes('Material') &&
  d.querySelector('.compare-table').textContent.includes('Copper') &&
  d.querySelector('.compare-table').textContent.includes('Steel'));
d.querySelector('[data-action="compare-remove"]').click();
await until(() => d.querySelectorAll('.compare-table thead th').length === 2);
check('Comparison item can be removed on its page',
  JSON.parse(dom.window.localStorage.getItem('jermiq.compare')).length === 1);
retain(dom);

dom = await page('/parts?category=water-heater-elements&q=QA'); d = dom.window.document;
card(d, input.firstSlug).querySelector('[data-action="add-cart"]').click();
await until(() => d.querySelector('#site-dialog').open);
d.querySelector('[data-action="cart-plus"]').click();
await until(() => d.querySelector('#cart-count').textContent === '2');
check('Quantity changes update persistent cart',
  JSON.parse(dom.window.localStorage.getItem('jermiq.cart'))[0].quantity === 2);
retain(dom);

dom = await page('/cart'); d = dom.window.document;
await until(() => d.querySelector('[data-store-saved] [data-action="cart-submit"]'));
check('Dedicated cart restores selected quantities', d.querySelector('#cart-count').textContent === '2');
d.querySelector('[data-action="cart-submit"]').click();
const form = d.querySelector('.store-checkout-form');
assert.ok(form, 'Structured checkout form opens');
form.elements.name.value = 'Store frontend QA';
form.elements.phone.value = '+374 99 123456';
form.elements.deliveryMethod.value = 'delivery';
form.elements.deliveryMethod.dispatchEvent(new dom.window.Event('change'));
check('Delivery requires and reveals address',
  form.elements.address.required && !form.querySelector('[data-checkout-address]').hidden);
form.elements.address.value = 'QA test address';
form.elements.consent.checked = true;
const requests = [];
let loseFirstResponse = true;
dom.window.fetch = async (url, options = {}) => {
  if (String(url) !== '/api/orders') return rawFetch(url, options);
  const payload = JSON.parse(options.body);
  const response = await rawFetch(url, options);
  requests.push({ payload, status: response.status });
  if (loseFirstResponse) {
    loseFirstResponse = false;
    throw new Error('Simulated connection loss after the server saved the order');
  }
  return response;
};
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await until(() => !form.querySelector('.error-text').hidden);
check('Ambiguous submission failure retains fields and cart',
  form.elements.name.value === 'Store frontend QA' &&
  JSON.parse(dom.window.localStorage.getItem('jermiq.cart')).length === 1);
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await until(() => form.querySelector('.success'));
check('Retry uses the same request ID and does not create a second order',
  requests.length === 2 && requests[0].status === 201 && requests[1].status === 200 &&
  requests[0].payload.requestId === requests[1].payload.requestId);
check('Successful checkout clears the cart and shows order reference',
  JSON.parse(dom.window.localStorage.getItem('jermiq.cart')).length === 0 &&
  form.querySelector('.reference').textContent.includes(requests[1].payload.requestId));
check('Checkout sends quantities and identities without client prices',
  Object.keys(requests[0].payload.items[0]).sort().join(',') === 'quantity,slug');
retain(dom);

savedLocal['jermiq.favorites'] = '{invalid json';
dom = await page('/favorites'); d = dom.window.document;
await until(() => d.querySelector('[data-store-saved] .empty-state'));
check('Corrupt local favorites safely recover to empty list',
  JSON.parse(dom.window.localStorage.getItem('jermiq.favorites')).length === 0);
dom.window.close();

console.log(JSON.stringify({ storefrontFrontendPassed: checks.length, checks }, null, 2));
