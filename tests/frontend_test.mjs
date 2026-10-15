// Optional DOM workflow checks. Not a visual browser test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(process.env.JERMIQ_QA_MODULE_ROOT
  ? path.join(process.env.JERMIQ_QA_MODULE_ROOT, 'package.json') : import.meta.url);
const { JSDOM } = req('jsdom');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = [];
let savedLocal = {};
async function rawFetch(url, options = {}) {
  const headers = new Headers(options.headers || {}); headers.set('Cookie', input.cookie);
  return fetch(new URL(url, input.baseUrl), { ...options, headers });
}
async function page(route, admin = false) {
  const html = await (await rawFetch(route)).text();
  const dom = new JSDOM(html, { url: input.baseUrl + route, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.structuredClone = structuredClone;
  for (const [key, value] of Object.entries(savedLocal)) w.localStorage.setItem(key, value);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.fetch = async (url, options = {}) => {
    if (options.body instanceof w.FormData) {
      const body = new FormData();
      for (const [key, value] of options.body.entries()) {
        if (typeof value === 'string') body.append(key, value);
        else if (value.size) throw new Error('Binary upload belongs to the HTTP smoke suite.');
      }
      options = { ...options, body };
    }
    return rawFetch(url, options);
  };
  w.eval(fs.readFileSync(path.join(root, 'src/Jermiq.Web/wwwroot/js/site.js'), 'utf8'));
  if (admin) w.eval(fs.readFileSync(path.join(root, 'src/Jermiq.Web/wwwroot/js/admin.js'), 'utf8'));
  return dom;
}
const waitUntil = async predicate => {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('Timed out waiting for a frontend operation.');
};
function check(name, test) { assert.ok(test, name); checks.push(name); }

let dom = await page('/catalog'), w = dom.window, d = w.document;
const click = selector => { const element = d.querySelector(selector); assert.ok(element, selector); element.click(); };
click('[data-action="add-cart"]');
await waitUntil(() => d.querySelector('#site-dialog').open);
check('Add to cart opens the cart dialog', d.querySelector('#dialog-title').textContent.includes('պատվերի'));
check('Cart count is one', d.querySelector('#cart-count').textContent === '1');
click('[data-action="cart-plus"]');
await waitUntil(() => d.querySelector('#cart-count').textContent === '2');
check('Cart quantity increases', d.querySelector('.quantity span').textContent === '2');
click('[data-action="cart-submit"]');
check('Order form receives the selected quantity', d.querySelector('#site-dialog [name="details"]').value.includes('× 2'));
click('[data-action="dialog-close"]');
const compare = [...d.querySelectorAll('[data-action="compare-toggle"]')];
compare.slice(0, 4).forEach(el => el.click());
check('Comparison is capped at three products', d.querySelector('#compare-count').textContent === '3 ապրանք');
click('[data-action="compare-open"]');
await waitUntil(() => d.querySelector('.compare-table'));
check('Comparison includes all three product columns', d.querySelectorAll('.compare-table thead th').length === 4);
click('[data-action="compare-request"]');
check('Comparison consultation passes product details', d.querySelector('#site-dialog [name="details"]').value.length > 0);
click('[data-action="dialog-close"]');
click('[data-action="chooser"]');
for (let i = 0; i < 3; i++) { click('[data-action="choice-select"]'); click('[data-action="choice-next"]'); }
check('Chooser reaches its result', d.querySelector('#dialog-title').textContent === 'Ձեր ընտրության ուղղությունը');
click('[data-action="choice-request"]');
check('Chooser result is passed into the request', d.querySelector('#site-dialog [name="details"]').value.includes('Ընտանիք՝'));
click('[data-action="dialog-close"]');
const search = d.querySelector('#catalog-query'); search.value = 'no-such-product'; search.dispatchEvent(new w.Event('input'));
check('Search displays the empty state', !d.querySelector('#catalog-empty').hidden && d.querySelectorAll('#catalog-grid .product').length === 0);
click('[data-action="catalog-reset"]');
search.value = 'silent 2000 aquatherm'; search.dispatchEvent(new w.Event('input'));
check('Client keyword search agrees with server across fields', d.querySelectorAll('#catalog-grid .product').length === 1 && d.querySelector('#catalog-grid').textContent.includes('QA Product'));
click('[data-action="catalog-reset"]');
check('Reset restores all ten heaters', d.querySelectorAll('#catalog-grid .product').length === 10);
const volumeFilter = d.querySelector('#catalog-volume'); volumeFilter.value = '80'; volumeFilter.dispatchEvent(new w.Event('change'));
check('Selected volume is reflected in results and removable chip', d.querySelectorAll('#catalog-grid .product').length === 2 && !!d.querySelector('[data-clear-filter="catalog-volume"]') && !d.querySelector('#catalog-reset-top').hidden);
click('[data-clear-filter="catalog-volume"]');
check('Removing a filter chip restores the catalog and focus', volumeFilter.value === 'all' && d.querySelectorAll('#catalog-grid .product').length === 10 && d.activeElement === volumeFilter);
d.querySelector('#catalog-sort').value = 'price'; d.querySelector('#catalog-sort').dispatchEvent(new w.Event('change'));
click('#catalog-reset-top');
check('Clear filters restores default sorting and removes all chips', d.querySelector('#catalog-sort').value === 'default' && !d.querySelector('#catalog-active-filters').children.length && d.querySelector('#catalog-reset-top').hidden);

click('[data-request="service"]');
check('Service form supports a second technical-label photo', !d.querySelector('#site-dialog [name="attachment2"]').disabled && d.querySelector('#site-dialog .photo-guide').textContent.includes('3–5'));
check('Service fields are enabled in the service form', !d.querySelector('#site-dialog [name="issue"]').disabled);
click('[data-action="dialog-close"]');
click('[data-request="callback"]');
check('Service fields are disabled in callback form', d.querySelector('#site-dialog [name="issue"]').disabled);
const form = d.querySelector('#site-dialog form');
form.elements.name.value = 'Frontend QA'; form.elements.phone.value = '+374 99 123456'; form.elements.consent.checked = true;
form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await waitUntil(() => form.querySelector('.success'));
check('The frontend submits a real callback request', form.textContent.includes('Ձեր հայտը գրանցված է'));
click('[data-action="dialog-close"]');
savedLocal = Object.fromEntries(Object.keys(w.localStorage).map(key => [key, w.localStorage.getItem(key)]));
w.close();

dom = await page('/contact'); w = dom.window; d = w.document;
check('Cart is preserved across full page navigation', d.querySelector('#cart-count').textContent === '2');
click('[data-request="question"]');
const brokenForm = d.querySelector('#site-dialog form');
brokenForm.elements.name.value = 'Frontend QA'; brokenForm.elements.phone.value = '+374 99 123456'; brokenForm.elements.consent.checked = true;
w.fetch = async () => new Response('<!DOCTYPE html><html>Error</html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
brokenForm.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await waitUntil(() => !brokenForm.querySelector('.error-text').hidden);
check('HTML error responses show a readable error', brokenForm.querySelector('.error-text').textContent.includes('անսպասելի պատասխան'));
check('Failed request retains form values', brokenForm.elements.name.value === 'Frontend QA');
w.close();

dom = await page('/admin', true); w = dom.window; d = w.document;
const expectedProducts = (await (await w.fetch('/api/admin')).json()).products.length;
await waitUntil(() => d.querySelector('#product-count').textContent.includes(`${expectedProducts} / ${expectedProducts}`));
check('Administrator UI loads the paginated catalog', d.querySelectorAll('[data-edit-product]').length === Math.min(12, expectedProducts));
click('[data-tab="products"]');
check('Products tab is visible', !d.querySelector('#panel-products').hidden && d.querySelector('#panel-leads').hidden);
click('#product-new');
check('New product form initializes a new slug', d.querySelector('#product-form').elements.slug.value.startsWith('new-'));
const productForm = d.querySelector('#product-form'); productForm.elements.title.value = 'Frontend Added Product';
productForm.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await waitUntil(() => !d.querySelector('#admin-refresh').disabled && d.querySelector('#admin-notice').textContent === 'Պահպանված է');
const productSearch = d.querySelector('#product-search'); productSearch.value = 'Frontend Added Product';
productSearch.dispatchEvent(new w.Event('input', { bubbles: true }));
check('Administrator UI saves a new product to the real API', d.querySelectorAll('[data-edit-product]').length === 1 && d.querySelector('#product-list').textContent.includes('Frontend Added Product') && (await (await w.fetch('/api/admin')).json()).products.length === expectedProducts + 1);
click('[data-tab="settings"]');
check('Settings tab is visible', !d.querySelector('#panel-settings').hidden);
const settingsForm = d.querySelector('#settings-form'); settingsForm.elements.hours.value = 'Frontend QA hours';
settingsForm.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await waitUntil(() => !d.querySelector('#admin-refresh').disabled && d.querySelector('#admin-notice').textContent === 'Պահպանված է');
check('Administrator UI saves settings to the real API', settingsForm.elements.hours.value === 'Frontend QA hours');
w.close();
const galleryDom = await page('/products/electric-30'), gd = galleryDom.window.document;
const thumbs = gd.querySelectorAll('[data-gallery-src]');
thumbs[1].click();
check('Gallery thumbnail changes main image', gd.querySelector('#gallery-main').getAttribute('src') === '/images/parts.webp');
gd.querySelector('.gallery-open').click();
check('Gallery opens enlarged viewer', gd.querySelector('.gallery-lightbox').open);
gd.querySelector('[data-gallery-next]').click();
check('Gallery next wraps to first image', gd.querySelector('.gallery-counter').textContent === '1 / 2');
gd.querySelector('[data-gallery-zoom]').click();
check('Viewer supports zoom', gd.querySelector('.gallery-lightbox').classList.contains('is-zoomed'));
gd.querySelector('[data-gallery-close]').click();
check('Enlarged viewer closes', !gd.querySelector('.gallery-lightbox').open);
galleryDom.window.close();
console.log(JSON.stringify({ frontendPassed: checks.length, checks }, null, 2));
