// Real protected API + admin information editing in an isolated jsdom browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
async function until(predicate) {
  for (let n = 0; n < 300; n++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Information editor workflow timed out');
}
async function raw(route, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('Cookie', input.cookie);
  return fetch(new URL(route, input.baseUrl), { ...options, headers });
}
async function json(route, options = {}) {
  const response = await raw(route, options);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

const original = await json('/api/admin/store-catalog');
const response = await raw('/admin/store?lang=hy&section=information');
assert.equal(response.status, 200);
const dom = new JSDOM(await response.text(), {
  url: input.baseUrl + '/admin/store?lang=hy&section=information',
  runScripts: 'outside-only', pretendToBeVisual: true
});
const w = dom.window, d = w.document;
w.structuredClone = structuredClone;
w.confirm = () => true;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.fetch = raw;
for (const script of ['site.js', 'store-admin.js']) {
  w.eval(fs.readFileSync(path.join(root, 'src/Jermiq.Web/wwwroot/js', script), 'utf8'));
}
const ready = () => d.querySelector('#store-admin-app').getAttribute('aria-busy') !== 'true';
const click = selector => { const button = d.querySelector(selector); assert.ok(button, selector); button.click(); };
const change = (element, value) => {
  assert.ok(element, 'Editor field exists');
  if (element.type === 'checkbox') element.checked = value;
  else element.value = value;
  element.dispatchEvent(new w.Event('input', { bubbles: true }));
  element.dispatchEvent(new w.Event('change', { bubbles: true }));
};
const form = d.querySelector('#store-information-form');
const submit = () => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
const field = (row, name) => row.querySelector(`[data-information-field="${name}"]`);
const pageSelect = d.querySelector('#store-information-page');
const sectionRows = () => [...d.querySelectorAll('[data-information-section]')];
const faqRows = () => [...d.querySelectorAll('[data-information-faq]')];
const rateRows = () => [...d.querySelectorAll('[data-information-rate]')];
const token = d.querySelector('meta[name="csrf-token"]').content;
const put = value => json('/api/admin/store-catalog', {
  method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
  body: JSON.stringify(value)
});

try {
  await until(() => ready() && sectionRows().length > 0 && pageSelect.options.length === 8);
  check('Information editor opens with all eight managed pages',
    !d.querySelector('#store-panel-information').hidden && pageSelect.options.length === 8);
  change(pageSelect, 'returns');
  const editedTitle = 'QA editor section <img src=x onerror=alert(1)>';
  const editedBody = 'QA editor body paragraph one\n\nQA editor paragraph two';
  change(d.querySelector('[data-information-intro]'), 'QA returns introduction');
  change(field(sectionRows()[0], 'title'), editedTitle);
  change(field(sectionRows()[0], 'body'), editedBody);
  change(field(faqRows()[0], 'question'), 'QA edited returns question');
  change(field(faqRows()[0], 'answer'), 'QA edited returns answer');
  change(field(rateRows()[0], 'price'), '');
  change(field(rateRows()[0], 'freeFrom'), '');
  change(pageSelect, 'payment');
  change(d.querySelector('[data-information-intro]'), 'QA payment introduction in the same draft');
  change(pageSelect, 'returns');
  check('Changing managed pages retains all unsaved sections, FAQ copy and rates',
    d.querySelector('[data-information-intro]').value === 'QA returns introduction' &&
    field(sectionRows()[0], 'title').value === editedTitle &&
    field(sectionRows()[0], 'body').value === editedBody &&
    field(faqRows()[0], 'answer').value === 'QA edited returns answer' &&
    field(rateRows()[0], 'price').value === '');
  check('Editor treats saved or draft markup as literal copy',
    !d.querySelector('#store-information-page-editor img, #store-information-page-editor script'));

  const priorSectionCount = sectionRows().length;
  click('[data-information-action="add-section"]');
  let added = sectionRows().at(-1);
  change(field(added, 'title'), 'QA temporary added section');
  change(field(added, 'body'), 'QA temporary section body');
  added.querySelector('[data-information-action="move-section"][data-direction="-1"]').click();
  check('Section ordering moves the complete edited section',
    sectionRows().length === priorSectionCount + 1 &&
    field(sectionRows().at(-2), 'title').value === 'QA temporary added section' &&
    field(sectionRows().at(-2), 'body').value === 'QA temporary section body');
  sectionRows().at(-2).querySelector('[data-information-action="remove-section"]').click();
  check('Removing one section preserves all remaining draft content',
    sectionRows().length === priorSectionCount && field(sectionRows()[0], 'title').value === editedTitle);

  click('[data-information-action="add-faq"]');
  change(field(faqRows().at(-1), 'question'), 'QA added FAQ question');
  change(field(faqRows().at(-1), 'answer'), 'QA added FAQ answer');
  click('[data-information-action="add-rate"]');
  const addedRate = rateRows().at(-1);
  change(field(addedRate, 'title'), 'QA editor extra delivery');
  change(field(addedRate, 'price'), '2500.5');
  change(field(addedRate, 'priceIsFrom'), true);
  change(field(addedRate, 'freeFrom'), '70000');
  change(field(addedRate, 'priceNote'), 'QA published rate condition');
  change(field(addedRate, 'timeframe'), 'QA delivery window');
  change(field(addedRate, 'details'), 'QA address instructions');
  const addedId = field(addedRate, 'id').value;
  assert.ok(addedId, 'New delivery option receives an editable stable id');
  submit();
  await until(() => ready() && !d.querySelector('#store-notice').hidden);
  const saved = await json('/api/admin/store-catalog');
  const savedReturns = saved.information.pages.find(p => p.id === 'returns');
  const savedRate = saved.information.deliveryOptions.find(rate => rate.id === addedId);
  check('Save persists edited introduction, paragraphs and FAQ answers',
    savedReturns.intro === 'QA returns introduction' &&
    savedReturns.sections[0].title === editedTitle && savedReturns.sections[0].body === editedBody &&
    savedReturns.faqs[0].answer === 'QA edited returns answer' &&
    savedReturns.faqs.some(faq => faq.question === 'QA added FAQ question' && faq.answer === 'QA added FAQ answer'));
  check('One save preserves drafts edited on more than one information page',
    saved.information.pages.find(p => p.id === 'payment').intro === 'QA payment introduction in the same draft');
  check('Blank delivery amounts remain unspecified instead of becoming zero',
    saved.information.deliveryOptions[0].price === null && saved.information.deliveryOptions[0].freeFrom === null);
  check('Rate editor persists decimal price, from status, threshold and instructions',
    savedRate.price === 2500.5 && savedRate.priceIsFrom && savedRate.freeFrom === 70000 &&
    savedRate.priceNote === 'QA published rate condition' && savedRate.timeframe === 'QA delivery window' &&
    savedRate.details === 'QA address instructions');

  click('#store-refresh');
  await until(() => ready() && d.querySelector('#store-error').hidden);
  change(pageSelect, 'returns');
  check('Refresh restores the persisted editor content without executing markup',
    field(sectionRows()[0], 'title').value === editedTitle &&
    field(sectionRows()[0], 'body').value === editedBody &&
    !d.querySelector('#store-information-page-editor img'));

  const badRate = rateRows().find(row => field(row, 'id').value === addedId);
  change(field(badRate, 'price'), '-1');
  submit();
  await until(() => ready());
  const rejected = await json('/api/admin/store-catalog');
  check('Negative price cannot overwrite published rates or their revision',
    rejected.revision === saved.revision &&
    rejected.information.deliveryOptions.find(rate => rate.id === addedId).price === 2500.5);
  check('Invalid rate keeps the entered draft available for correction',
    field(rateRows().find(row => field(row, 'id').value === addedId), 'price').value === '-1');
} finally {
  const current = await json('/api/admin/store-catalog');
  original.revision = current.revision;
  await put(original);
  w.dispatchEvent(new w.Event('pagehide'));
  w.close();
}
console.log(JSON.stringify({ informationEditorChecks: checks.length, checks }));
