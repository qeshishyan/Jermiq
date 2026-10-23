// Navigation feedback behavior, without a server or real-time timeout waits.
// Run: node tests/page_loading_frontend_test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/Jermiq.Web/wwwroot/js/page-loading.js'), 'utf8');
// Read the actual shared view to verify its no-JavaScript markup, then reuse its
// feedback elements in a minimal page. Razor translations need no server here.
const layout = fs.readFileSync(path.join(root, 'src/Jermiq.Web/Pages/Shared/_Layout.cshtml'), 'utf8')
  .replace(/@L\["([^"\n]+)"\]/g, '$1');
const baseline = new JSDOM(layout, { url: 'https://jermiq.test/catalog', runScripts: 'outside-only' });
const indicatorMarkup = baseline.window.document.querySelector('[data-page-loading]');
const statusMarkup = baseline.window.document.querySelector('[data-page-loading-status]');
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); }
check('Without JavaScript, navigation feedback is hidden and decorative',
  indicatorMarkup?.hidden && indicatorMarkup.getAttribute('aria-hidden') === 'true');
check('Loading announcements start empty in a polite live region',
  statusMarkup?.getAttribute('role') === 'status' && statusMarkup.getAttribute('aria-live') === 'polite' && !statusMarkup.textContent.trim());
check('Without JavaScript, links and search still use native navigation',
  baseline.window.document.querySelector('a[href="/delivery"]') &&
  baseline.window.document.querySelector('form.search-box[action="/catalog"][method="get"]'));
const markup = indicatorMarkup.outerHTML + statusMarkup.outerHTML;
baseline.window.close();

async function page() {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    // Native navigation is deliberately allowed; jsdom cannot load a new document.
    if (error.type === 'not-implemented' && /navigation/i.test(error.message)) return;
    errors.push(error);
  });
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${markup}<main id="main">Catalog</main></body></html>`, {
    url: 'https://jermiq.test/catalog', runScripts: 'outside-only', virtualConsole
  });
  const w = dom.window, d = w.document;
  // Let jsdom's initial load finish before advancing the navigation clock. A load
  // event is also tested explicitly below as one of the recovery mechanisms.
  if (d.readyState !== 'complete') await new Promise(resolve => w.addEventListener('load', resolve, { once: true }));
  let now = 0, nextId = 0;
  const timers = new Map();
  w.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    timers.set(id, { at: now + Number(delay), callback });
    return id;
  };
  w.clearTimeout = id => timers.delete(id);
  function advance(milliseconds) {
    const target = now + milliseconds;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      timers.delete(next[0]); now = next[1].at; next[1].callback();
    }
    now = target;
  }
  w.eval(source);
  function click(href = '/delivery', attributes = {}, options = {}) {
    const anchor = d.createElement('a');
    anchor.href = href;
    for (const [key, value] of Object.entries(attributes)) anchor.setAttribute(key, value);
    anchor.innerHTML = '<span>Open page</span>';
    d.body.append(anchor);
    const event = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...options });
    anchor.firstElementChild.dispatchEvent(event);
    advance(0);
    return event;
  }
  function submit(html, submitterSelector) {
    d.body.insertAdjacentHTML('beforeend', html);
    const form = [...d.forms].at(-1);
    const event = new w.SubmitEvent('submit', {
      bubbles: true, cancelable: true, submitter: submitterSelector ? form.querySelector(submitterSelector) : null
    });
    form.dispatchEvent(event); advance(0);
    return event;
  }
  const visible = () => !d.querySelector('[data-page-loading]').hidden;
  function close() {
    assert.deepEqual(errors, [], 'No application errors during navigation feedback');
    dom.window.close();
  }
  return { w, d, advance, click, submit, visible, close };
}

{
  const p = await page();
  const event = p.click('/delivery');
  check('Navigation feedback leaves the original link action uncanceled', !event.defaultPrevented);
  p.advance(100);
  check('Fast page requests do not flash an indicator', !p.visible());
  p.advance(400);
  check('A slow same-origin request shows navigation feedback', p.visible());
  check('Slow requests expose an accessible busy state and announcement',
    p.d.querySelector('#main').getAttribute('aria-busy') === 'true' &&
    p.d.querySelector('[data-page-loading-status]').textContent.trim());
  p.w.dispatchEvent(new p.w.PageTransitionEvent('pageshow', { persisted: true }));
  check('Back/forward cache restoration clears feedback and its busy state',
    !p.visible() && !p.d.querySelector('#main').hasAttribute('aria-busy') &&
    !p.d.querySelector('[data-page-loading-status]').textContent);
  p.close();
}

for (const [name, href, attributes, options] of [
  ['external destinations', 'https://other.test/delivery', {}, {}],
  ['hash links', '#details', {}, {}],
  ['same-page absolute hash links', '/catalog#details', {}, {}],
  ['phone links', 'tel:+37412345678', {}, {}],
  ['email links', 'mailto:shop@example.com', {}, {}],
  ['downloads', '/receipt', { download: '' }, {}],
  ['new tabs', '/delivery', { target: '_blank' }, {}],
  ['Ctrl-click', '/delivery', {}, { ctrlKey: true }],
  ['Command-click', '/delivery', {}, { metaKey: true }],
  ['Shift-click', '/delivery', {}, { shiftKey: true }],
  ['Alt-click', '/delivery', {}, { altKey: true }],
  ['middle-click', '/delivery', {}, { button: 1 }],
  ['attachment endpoints', '/api/files/receipt', {}, {}],
  ['PDF documents', '/documents/terms.pdf', {}, {}],
  ['explicitly excluded links', '/delivery', { 'data-no-page-loading': '' }, {}]
]) {
  const p = await page();
  p.click(href, attributes, options); p.advance(500);
  check(`Feedback ignores ${name}`, !p.visible());
  p.close();
}

{
  const p = await page();
  // Registered after the loader, as a later delegated AJAX handler may be.
  p.w.addEventListener('click', event => event.preventDefault());
  p.click('/delivery'); p.advance(500);
  check('An action canceled by a later handler never starts feedback', !p.visible());
  p.close();
}

for (const [name, html, expected, submitter] of [
  ['valid native GET', '<form action="/parts" method="get"><input name="q" value="seal"></form>', true],
  ['default GET', '<form action="/parts"></form>', true],
  ['POST', '<form action="/parts" method="post"></form>', false],
  ['invalid GET', '<form action="/parts"><input required></form>', false],
  ['new-tab GET', '<form action="/parts" target="_blank"></form>', false],
  ['external GET', '<form action="https://other.test/search"></form>', false],
  ['dialog form', '<dialog open><form action="/parts"></form></dialog>', false],
  ['AJAX form', '<form action="/parts" data-ajax></form>', false],
  ['checkout form', '<form class="store-checkout-form"></form>', false],
  ['request form', '<form class="request-form"></form>', false],
  ['submitter POST override', '<form action="/parts"><button formmethod="post">Submit</button></form>', false, 'button'],
  ['submitter new-tab override', '<form action="/parts"><button formtarget="_blank">Submit</button></form>', false, 'button'],
  ['submitter external action override', '<form action="/parts"><button formaction="https://other.test/search">Submit</button></form>', false, 'button']
]) {
  const p = await page();
  const event = p.submit(html, submitter); p.advance(500);
  check(`Feedback eligibility for ${name}`, p.visible() === expected);
  check(`Feedback preserves native ${name} behavior`, !event.defaultPrevented);
  p.close();
}

{
  const p = await page();
  p.w.addEventListener('submit', event => event.preventDefault());
  p.submit('<form action="/parts"></form>'); p.advance(500);
  check('A canceled AJAX submission does not start feedback', !p.visible());
  p.close();
}
{
  const p = await page();
  p.d.head.insertAdjacentHTML('beforeend', '<base target="_blank">');
  p.click('/delivery'); p.advance(500);
  check('An inherited new-tab target does not start feedback', !p.visible());
  p.click('/delivery', { target: '_self' }); p.advance(500);
  check('An explicit same-tab target overrides an inherited new-tab target', p.visible());
  p.close();
}
for (const type of ['pagehide', 'pageshow', 'popstate', 'hashchange', 'load']) {
  const p = await page();
  p.d.querySelector('#main').setAttribute('aria-busy', 'false');
  p.click(); p.advance(500);
  assert.ok(p.visible(), 'Recovery scenario began with visible navigation feedback');
  p.w.dispatchEvent(new p.w.Event(type));
  check(`${type} clears navigation feedback and restores a prior busy attribute`,
    !p.visible() && p.d.querySelector('#main').getAttribute('aria-busy') === 'false');
  p.close();
}
{
  const p = await page();
  p.click(); p.advance(50);
  p.w.dispatchEvent(new p.w.Event('pageshow')); p.advance(500);
  check('A completed request cancels its pending reveal timer', !p.visible());
  p.click(); p.advance(500);
  p.w.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape' }));
  check('Escape clears feedback when navigation is stopped', !p.visible());
  p.click(); p.advance(500); p.advance(15000);
  check('An abandoned navigation eventually recovers without user input', !p.visible());
  p.close();
}
{
  const p = await page();
  p.click(); p.advance(1000);
  p.click('/payment'); p.advance(11000);
  check('A second navigation cancels the first recovery timer', p.visible());
  p.advance(2000);
  check('The current navigation retains its own recovery timeout', !p.visible());
  p.close();
}
console.log(JSON.stringify({ passed: checks.length, checks }));
