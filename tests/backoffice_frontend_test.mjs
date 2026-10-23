// Real API + jsdom tests for the office desk, CMS editor and public language flows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = JSON.parse(fs.readFileSync(0, 'utf8')), checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
const wait = async predicate => { for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 20)); } throw new Error('Timed out waiting for office UI'); };
async function raw(url, options = {}) { const headers = new Headers(options.headers); headers.set('Cookie', input.cookie); return fetch(new URL(url, input.baseUrl), { ...options, headers }); }
async function page(route, admin = false) {
  const response = await raw(route); assert.equal(response.status, 200);
  const dom = new JSDOM(await response.text(), { url: input.baseUrl + route, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.structuredClone = structuredClone; w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.fetch = async (url, options = {}) => {
    if (options.body instanceof w.FormData) {
      const body = new FormData(); for (const [key, value] of options.body) if (typeof value === 'string') body.append(key, value);
      options = { ...options, body };
    }
    // Browser requests carry the selected locale through its cookie. Supply it explicitly in jsdom.
    const u = new URL(url, input.baseUrl); if (!u.searchParams.has('lang')) u.searchParams.set('lang', new URL(route, input.baseUrl).searchParams.get('lang') || 'hy');
    return raw(u, options);
  };
  w.eval(fs.readFileSync(path.join(root, 'src/Jermiq.Web/wwwroot/js/site.js'), 'utf8'));
  if (admin) {
    w.eval(fs.readFileSync(path.join(root, 'src/Jermiq.Web/wwwroot/js/arrivals.js'), 'utf8'));
    w.eval(fs.readFileSync(path.join(root, 'src/Jermiq.Web/wwwroot/js/admin.js'), 'utf8'));
  }
  return dom;
}
for (const [language, cartTitle, success] of [['en', 'Your order list', 'Your request has been registered'], ['ru', 'Ваш список заказа', 'Ваша заявка зарегистрирована']]) {
  const dom = await page('/?lang=' + language), w = dom.window, d = w.document;
  d.querySelector('[data-action="add-cart"]').click(); await wait(() => d.querySelector('#site-dialog').open);
  check(language + ' translated cart', d.querySelector('#dialog-title').textContent === cartTitle);
  check(language + ' cart links retain language', d.querySelector('a[href*="lang=' + language + '"]'));
  d.querySelector('[data-action="dialog-close"]').click(); d.querySelector('[data-action="chooser"]').click();
  check(language + ' translated chooser', !/[\u0531-\u0587]/.test(d.querySelector('#dialog-title').textContent));
  for (let i = 0; i < 3; i++) { d.querySelector('[data-action="choice-select"]').click(); d.querySelector('[data-action="choice-next"]').click(); }
  check(language + ' translated chooser result', !/[\u0531-\u0587]/.test(d.querySelector('#dialog-content').textContent));
  d.querySelector('[data-action="dialog-close"]').click(); d.querySelector('[data-request="callback"]').click();
  const form = d.querySelector('#site-dialog form'); form.elements.name.value = 'Localized UI QA'; form.elements.phone.value = '+374 99 123456'; form.elements.consent.checked = true;
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(() => form.querySelector('.success'));
  check(language + ' translated success message', form.textContent.includes(success)); w.dispatchEvent(new w.Event('pagehide')); w.close();
}
const dom = await page('/admin?lang=en', true), w = dom.window, d = w.document;
const click = selector => { const el = d.querySelector(selector); assert.ok(el, selector); el.click(); };
await wait(() => d.querySelectorAll('.office-stat').length === 4 && !d.querySelector('#lead-new').disabled);
check('Office dashboard loaded', d.querySelector('#workspace-title').textContent === 'Overview' && d.querySelectorAll('.overview-metric').length === 4);
click('[data-tab="leads"]');
await wait(() => d.querySelector('#arrival-connection').textContent === 'Live updates connected');
check('Existing requests do not trigger alerts on opening', d.querySelector('#arrival-banner').hidden && !d.title.includes('New requests'));
let tones = 0;
w.AudioContext = class {
  state = 'running'; currentTime = 0; destination = {};
  async resume() {} async close() {}
  createOscillator() { return { frequency: {}, connect() {}, start() { tones++; }, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
};
click('#arrival-sound'); await wait(() => d.querySelector('#arrival-sound').getAttribute('aria-pressed') === 'true');
const beforeAlertTones = tones;
click('#lead-new'); const draft = d.querySelector('#lead-form'); draft.elements.name.value = 'Unsaved office draft'; draft.elements.name.dispatchEvent(new w.Event('input', { bubbles: true }));
d.querySelector('#lead-filter').value = 'completed'; d.querySelector('#lead-filter').dispatchEvent(new w.Event('change')); await wait(() => !d.querySelector('#lead-new').disabled);
async function publicOrder(name) {
  const body = new FormData();
  for (const [key, value] of Object.entries({requestId: crypto.randomUUID(), kind: 'order', name, phone: '+374 99 123456', consent: 'true', message: 'Live alert QA'})) body.set(key, value);
  const options = {method:'POST', headers:{'X-CSRF-TOKEN':d.querySelector('meta[name="csrf-token"]').content},body};
  const response = await raw('/api/leads', options); assert.equal(response.status, 201);
  return options;
}
const order = await publicOrder('Live new order');
await wait(() => d.title.startsWith('(1) New requests') && tones === beforeAlertTones + 2);
check('New public order changes the tab title and plays a chime', !d.querySelector('#arrival-banner').hidden && tones === beforeAlertTones + 2);
check('Live updates preserve unsaved editor fields and filters', draft.elements.name.value === 'Unsaved office draft' && d.querySelector('#lead-filter').value === 'completed');
const replay = await raw('/api/leads', order); assert.equal(replay.status, 200);
await new Promise(r => setTimeout(r, 3200));
check('Idempotent replay does not notify twice', d.title.startsWith('(1) New requests') && tones === beforeAlertTones + 2);
click('#arrival-open'); await wait(() => d.querySelector('#arrival-banner').hidden && !d.querySelector('#lead-new').disabled);
check('Opening arrivals clears alerts and shows the new order', !d.title.includes('New requests') && d.querySelector('#leads-list').textContent.includes('Live new order') && draft.elements.name.value === 'Unsaved office draft');
click('#arrival-sound');
const browserFetch = w.fetch; let offline = true;
w.fetch = (url, options) => offline && String(url).includes('/api/admin/arrivals') ? Promise.reject(new Error('Test outage')) : browserFetch(url, options);
await wait(() => d.querySelector('#arrival-connection').textContent.includes('Connection interrupted'));
await publicOrder('Order during outage'); offline = false;
await wait(() => d.querySelector('#arrival-connection').textContent === 'Live updates connected' && d.title.startsWith('(1) New requests'));
check('Reconnect catches requests received during an outage', d.querySelector('#leads-list').textContent.includes('Order during outage'));
check('Muting suppresses the chime but keeps tab alerts', tones === beforeAlertTones + 2);
click('#arrival-open'); await wait(() => d.querySelector('#arrival-banner').hidden && !d.querySelector('#lead-new').disabled);

click('#lead-new');
const form = d.querySelector('#lead-form'); form.elements.kind.value = 'ui-custom'; form.elements.name.value = 'Office UI customer'; form.elements.phone.value = '+374 99 123456'; form.elements.note.value = 'UI note'; form.elements.priority.value = 'high';
form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await wait(() => d.querySelector('#lead-reference').textContent.length === 36 && !d.querySelector('#lead-new').disabled);
check('Office UI creates a custom request', form.elements.kind.value === 'ui-custom' && d.querySelector('#lead-notes').textContent.includes('UI note'));
form.elements.status.value = 'completed'; form.elements.note.value = 'UI completed'; form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await wait(() => d.querySelector('#lead-notes').textContent.includes('UI completed') && !d.querySelector('#lead-new').disabled);
check('Office UI updates status and preserves notes', form.elements.status.value === 'completed' && d.querySelectorAll('#lead-notes article').length === 2);
d.querySelector('#lead-search').value = 'Office UI customer'; d.querySelector('#lead-search-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await wait(() => d.querySelectorAll('.office-request').length === 1 && !d.querySelector('#lead-new').disabled);
check('Office UI searches real requests', d.querySelector('.office-request h3').textContent === 'Office UI customer');
click('#lead-close');
d.querySelector('#lead-select-page').checked = true; d.querySelector('#lead-select-page').dispatchEvent(new w.Event('change', {bubbles:true}));
d.querySelector('#lead-bulk-status').value = 'waiting'; click('#lead-bulk-apply');
await wait(() => d.querySelector('#lead-bulk').hidden && !d.querySelector('#lead-new').disabled);
check('Bulk status changes selected requests through the UI', d.querySelector('.office-request .office-badge.waiting'));
click('[data-tab="products"]');
d.querySelector('#product-search').value = 'PRO1 R 80 V'; d.querySelector('#product-search').dispatchEvent(new w.Event('input'));
check('Product search finds model codes', d.querySelectorAll('[data-edit-product]').length === 1);
click('[data-edit-product]');
const productForm = d.querySelector('#product-form');
check('Existing product slug is protected in the editor', productForm.elements.slug.readOnly && !productForm.hidden);
productForm.elements.title.value = 'Unsaved product title'; productForm.elements.title.dispatchEvent(new w.Event('input', {bubbles:true}));
click('[data-tab="settings"]'); const settingsForm = d.querySelector('#settings-form'); settingsForm.elements.phone.value = '+374 99 444444'; settingsForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
await wait(() => !d.querySelector('#admin-refresh').disabled && d.querySelector('#admin-notice').textContent === 'Saved');
click('[data-tab="products"]');
check('Saving settings preserves an unsaved product draft', productForm.elements.title.value === 'Unsaved product title' && d.querySelector('[data-dirty-for="product-form"]').textContent === 'Unsaved changes');
click('#product-reset');
check('Product reset restores the last saved version', productForm.elements.title.value !== 'Unsaved product title');
d.querySelector('#product-category-filter').value = 'part'; d.querySelector('#product-category-filter').dispatchEvent(new w.Event('change'));
check('Product category and model filters combine', d.querySelectorAll('[data-edit-product]').length === 0 && d.querySelector('#product-list').textContent.includes('No products'));
d.querySelector('#product-search').value = ''; d.querySelector('#product-search').dispatchEvent(new w.Event('input'));
d.querySelector('#product-category-filter').value = 'all'; d.querySelector('#product-category-filter').dispatchEvent(new w.Event('change'));

click('[data-tab="translations"]'); await wait(() => d.querySelectorAll('.translation-row').length > 0 && !d.querySelector('#translations-save').disabled);
check('CMS has editable fields in all languages', d.querySelectorAll('.translation-row')[0].querySelectorAll('textarea').length === 3);
const homepageConfig = await (await raw('/api/admin/store-catalog')).json();
const search = d.querySelector('#translation-search'); search.value = homepageConfig.home.eyebrow; search.dispatchEvent(new w.Event('input'));
const translation = d.querySelector('.translation-row textarea[lang="en"]'); translation.value = 'Office UI translated hero'; translation.dispatchEvent(new w.Event('input', { bubbles: true }));
click('#translations-save'); await wait(() => !d.querySelector('#translations-save').disabled && d.querySelector('#admin-notice').textContent.includes('Translations saved'));
check('CMS translation saves through the UI', (await (await raw('/?lang=en')).text()).includes('Office UI translated hero'));
click('[data-tab="content"]'); click('#content-new');
const content = d.querySelector('#content-form'); content.elements.key.value = 'ui-guide'; content.elements.title.value = 'UI guide'; content.elements.intro.value = 'UI intro'; click('#section-add'); d.querySelector('.section-title').value = 'UI section'; d.querySelector('.section-body').value = 'UI body';
content.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(() => d.querySelector('#content-list').textContent.includes('UI guide') && !d.querySelector('#content-new').disabled);
check('CMS creates an article through structured fields', (await raw('/guide/ui-guide?lang=en')).status === 200);
click('[data-tab="users"]'); await wait(() => d.querySelectorAll('[data-user-index]').length >= 2 && !d.querySelector('#user-new').disabled);
check('Team management loads real accounts', d.querySelector('#user-list').textContent.includes('office@example.invalid'));
w.dispatchEvent(new w.Event('pagehide')); w.close();
const deep = await page('/admin?lang=en&section=products', true);
await wait(() => deep.window.document.querySelectorAll('[data-edit-product]').length > 0 && !deep.window.document.querySelector('#admin-refresh').disabled);
check('Direct links initialize the requested management page', !deep.window.document.querySelector('#panel-products').hidden && deep.window.document.querySelector('#workspace-title').textContent === 'Product catalog');
deep.window.dispatchEvent(new deep.window.Event('pagehide')); deep.window.close();
console.log(JSON.stringify({ backofficeFrontendPassed: checks.length, checks }, null, 2));
