// Runs against an isolated test server with an authenticated Admin cookie on stdin.
// Example input: {"baseUrl":"http://127.0.0.1:5080","cookie":"Jermiq.Admin=..."}.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const wait = async predicate => { for (let n = 0; n < 400; n++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error('Store editor timed out'); };
async function raw(route, options = {}) { const headers = new Headers(options.headers); headers.set('Cookie', input.cookie); return fetch(new URL(route, input.baseUrl), { ...options, headers }); }
async function json(route, options = {}) { const response = await raw(route, options); assert.equal(response.status, 200, await response.clone().text()); return response.json(); }
async function open(route, scripts) {
  const response = await raw(route); assert.equal(response.status, 200);
  const dom = new JSDOM(await response.text(), { url: input.baseUrl + route, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.structuredClone = structuredClone; w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.fetch = (route, options = {}) => raw(route, options);
  for (const script of scripts) w.eval(fs.readFileSync(path.join(root, 'src/Jermiq.Web/wwwroot/js', script), 'utf8'));
  return dom;
}
const initial = await json('/api/admin/store-catalog');
const dom = await open('/admin/store?lang=hy', ['site.js', 'store-admin.js']);
const w = dom.window, d = w.document;
const submit = form => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
const click = selector => { assert.ok(d.querySelector(selector), selector); d.querySelector(selector).click(); };
const ready = () => d.querySelector('#store-admin-app').getAttribute('aria-busy') !== 'true';
await wait(() => ready() && d.querySelectorAll('[data-category-edit]').length > 0);
const token = d.querySelector('meta[name="csrf-token"]').content;
const put = body => json('/api/admin/store-catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token }, body: JSON.stringify(body) });
const categoryId = 'qa-category-' + Date.now(), modelId = 'qa-model-' + Date.now();
let productOriginal = null, productDom = null;
try {
  click('#store-category-new');
  const category = d.querySelector('#store-category-form');
  category.elements.id.value = categoryId; category.elements.title.value = '<img src=x onerror=alert(1)> QA category';
  submit(category);
  await wait(() => ready() && d.querySelector(`[data-category-edit="${categoryId}"]`));
  check('Categories save through the real API and escape HTML', d.querySelector(`[data-category-edit="${categoryId}"]`).textContent.includes('<img') && !d.querySelector(`#store-categories-list img`));
  click('[data-store-tab="models"]'); click('#store-model-new');
  const model = d.querySelector('#store-model-form');
  model.elements.id.value = modelId; model.elements.name.value = 'QA model'; model.elements.brand.value = 'QA brand'; model.elements.series.value = 'QA series'; model.elements.categoryId.value = categoryId;
  submit(model); await wait(() => ready() && d.querySelector(`[data-model-edit="${modelId}"]`));
  check('Models save with a stable category reference', (await json('/api/admin/store-catalog')).equipmentModels.find(m => m.id === modelId)?.categoryId === categoryId);
  click('[data-store-tab="home"]');
  const home = d.querySelector('#store-home-form'); home.elements.title.value = 'Unsaved store title'; home.elements.title.dispatchEvent(new w.Event('input', { bubbles: true }));
  w.confirm = () => false; click('[data-store-tab="information"]');
  check('Changing tabs preserves a declined unsaved draft', !d.querySelector('#store-panel-home').hidden && home.elements.title.value === 'Unsaved store title');
  w.confirm = () => true; submit(home); await wait(() => ready() && !d.querySelector('#store-notice').hidden);
  check('Homepage content persists', (await json('/api/admin/store-catalog')).home.title === 'Unsaved store title');
  home.elements.title.value = 'Stale draft stays here'; home.elements.title.dispatchEvent(new w.Event('input', { bubbles: true }));
  const external = await json('/api/admin/store-catalog'); external.aboutText = 'Concurrent update'; await put(external);
  submit(home); await wait(() => ready() && !d.querySelector('#store-error').hidden);
  check('Conflicting revision displays an error and keeps the draft', home.elements.title.value === 'Stale draft stays here');
  click('#store-refresh'); await wait(() => ready() && d.querySelector('#store-error').hidden);

  productDom = await open('/admin?lang=hy&section=products', ['site.js', 'store-admin.js', 'admin.js']);
  const pw = productDom.window, pd = pw.document;
  const productReady = () => !pd.querySelector('#admin-refresh').disabled;
  await wait(() => productReady() && pd.querySelector('[data-edit-product]'));
  pd.querySelector('[data-edit-product]').click();
  const f = pd.querySelector('#product-form');
  const admin = await json('/api/admin'); productOriginal = structuredClone(admin.products.find(p => p.slug === f.elements.slug.value));
  f.elements.catalogCategoryId.value = categoryId; f.elements.sku.value = 'QA-SKU-' + Date.now();
  f.elements.manufacturer.value = 'QA manufacturer'; f.elements.replacementCodes.value = 'QA-001\nQA-002';
  f.elements.compatibleModelIds.value = modelId; f.elements.price.value = '100'; f.elements.oldPrice.value = '200'; f.elements.stockQuantity.value = '7'; f.elements.isFeatured.checked = true; f.elements.isNew.checked = true;
  f.dispatchEvent(new pw.Event('submit', { bubbles: true, cancelable: true }));
  await wait(() => productReady() && !pd.querySelector('#admin-notice').hidden);
  const saved = (await json('/api/admin')).products.find(p => p.slug === productOriginal.slug);
  check('Product editor persists catalog identity and compatibility', saved.catalogCategoryId === categoryId && saved.compatibleModelIds.includes(modelId) && saved.replacementCodes.join(',') === 'QA-001,QA-002');
  check('Product editor persists price, stock and publication flags', saved.oldPrice === 200 && saved.stockQuantity === 7 && saved.isFeatured && saved.isNew && saved.published === (productOriginal.published !== false));
  check('Product editor preserves source metadata and photos', saved.sourceUrl === productOriginal.sourceUrl && saved.image === productOriginal.image && JSON.stringify(saved.images) === JSON.stringify(productOriginal.images));

  const inUse = await json('/api/admin/store-catalog'); inUse.equipmentModels = inUse.equipmentModels.filter(m => m.id !== modelId);
  const blocked = await raw('/api/admin/store-catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token }, body: JSON.stringify(inUse) });
  check('Models referenced by products cannot be deleted', blocked.status === 400 || blocked.status === 409);
} finally {
  if (productOriginal) {
    const current = (await json('/api/admin')).products.find(p => p.slug === productOriginal.slug);
    productOriginal.revision = current.revision;
    await json('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token }, body: JSON.stringify({ action: 'product', product: productOriginal }) });
  }
  const latest = await json('/api/admin/store-catalog'); initial.revision = latest.revision; await put(initial);
  productDom?.window.dispatchEvent(new productDom.window.Event('pagehide')); productDom?.window.close();
  w.dispatchEvent(new w.Event('pagehide')); w.close();
}
console.log(JSON.stringify({ storeAdminChecks: checks.length, checks }));
