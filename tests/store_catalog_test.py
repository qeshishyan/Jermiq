#!/usr/bin/env python3
"""HTTP regression checks for store configuration, publication and category search.

Runs only against a temporary SQLite database and a randomly created administrator.
Build the Release configuration first; no production files or accounts are used.
"""
import argparse
import copy
import html
from html.parser import HTMLParser
import http.cookiejar
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]


class ProductCards(HTMLParser):
    def __init__(self):
        super().__init__()
        self.slugs = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article' and attrs.get('data-product'):
            self.slugs.append(json.loads(attrs['data-product'])['slug'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dotnet', default='dotnet')
    parser.add_argument('--configuration', default='Release')
    parser.add_argument('--frontend', action='store_true', help='Run jsdom saved-list and checkout workflows')
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    checks = []

    def check(name, condition):
        assert condition, name
        checks.append(name)

    with tempfile.TemporaryDirectory(prefix='jermiq-store-tests-') as directory:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        password = 'Catalog!7' + uuid.uuid4().hex
        email = 'store-test@example.invalid'
        env = dict(os.environ, ASPNETCORE_ENVIRONMENT='Production',
                   Persistence__DataDirectory=directory, Seo__BaseUrl=base,
                   Seo__IndexingEnabled='true', Security__RequireHttps='false',
                   JERMIQ_ADMIN_EMAIL=email, JERMIQ_ADMIN_PASSWORD=password)
        run = [args.dotnet, 'run', '--no-build', '--no-launch-profile',
               '--configuration', args.configuration, '--project', str(ROOT / 'src/Jermiq.Web')]
        setup = subprocess.run(run + ['--', '--create-admin'], env=env, cwd=ROOT,
                               capture_output=True, text=True)
        assert setup.returncode == 0, setup.stdout + setup.stderr
        del env['JERMIQ_ADMIN_EMAIL']
        del env['JERMIQ_ADMIN_PASSWORD']
        with open(Path(directory) / 'server.log', 'w+') as log:
            process = subprocess.Popen(run + ['--', '--urls', base], env=env, cwd=ROOT,
                                       stdout=log, stderr=subprocess.STDOUT)
            jar = http.cookiejar.CookieJar()
            client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
            anonymous = urllib.request.build_opener()

            def request(path, body=None, method=None, token=None, content_type=None, opener=client):
                headers = {}
                if content_type:
                    headers['Content-Type'] = content_type
                if token:
                    headers['X-CSRF-TOKEN'] = token
                req = urllib.request.Request(base + path, body, headers, method=method)
                try:
                    response = opener.open(req, timeout=15)
                except urllib.error.HTTPError as error:
                    response = error
                return response.status, response.headers, response.read()

            def json_request(path, value, method='PUT', token=None, opener=client):
                return request(path, json.dumps(value).encode(), method=method, token=token,
                               content_type='application/json', opener=opener)

            def data(path):
                status, _, body = request(path)
                assert status == 200, (path, status, body[:1000])
                return json.loads(body)

            def csrf(page):
                match = re.search(r'<meta name="csrf-token" content="([^"]+)"', page.decode())
                assert match, 'Missing CSRF meta tag'
                return html.unescape(match.group(1))

            def cards(path):
                status, _, body = request(path)
                assert status == 200, (path, status, body[:1000])
                parsed = ProductCards()
                parsed.feed(body.decode())
                return set(parsed.slugs), body.decode()

            try:
                for _ in range(100):
                    if process.poll() is not None:
                        raise AssertionError('Web process exited during startup')
                    try:
                        if request('/health')[0] == 200:
                            break
                    except (OSError, urllib.error.URLError):
                        time.sleep(.2)
                else:
                    raise AssertionError('Web process did not start')

                store = data('/api/store-catalog')
                category_ids = {x['id'] for x in store['categories']}
                check('Seed has equipment roots and part subcategories',
                      {'water-heaters', 'water-heater-parts', 'water-heater-elements',
                       'water-heater-anodes', 'electric-boiler-parts', 'gas-equipment-parts'} <= category_ids)
                check('Compatibility is not invented during seeding', store['equipmentModels'] == [])
                check('Anonymous configuration administration denied',
                      request('/api/admin/store-catalog', opener=anonymous)[0] == 401)

                status, _, page = request('/admin/login')
                login_token = html.unescape(re.search(
                    r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', page.decode()).group(1))
                login = urllib.parse.urlencode(dict(Email=email, Password=password,
                    ReturnUrl='/admin', __RequestVerificationToken=login_token)).encode()
                status, _, page = request('/admin/login', login, content_type='application/x-www-form-urlencoded')
                check('Isolated administrator can sign in', status == 200 and b'admin-app' in page)
                token = csrf(page)
                status, headers, page = request('/admin/store')
                check('Store administration renders and is private', status == 200 and
                      b'<form' in page and 'no-store' in headers.get('Cache-Control', ''))
                config = data('/api/admin/store-catalog')
                check('Configuration mutation requires CSRF',
                      json_request('/api/admin/store-catalog', config)[0] == 400)

                edited = copy.deepcopy(config)
                edited['home']['title'] = 'QA store homepage <tag>'
                edited['paymentText'] = 'QA payment terms'
                edited['equipmentModels'].append(dict(id='qa-heater-80', categoryId='water-heater-parts',
                    brand='QAbrand', series='QAseries', name='QA heater 80', published=True))
                status, _, response = json_request('/api/admin/store-catalog', edited, token=token)
                check('Configuration persists with new revision', status == 200 and
                      json.loads(response)['revision'] > config['revision'])
                config = data('/api/admin/store-catalog')
                check('Saved homepage and models reach public configuration',
                      data('/api/store-catalog')['home']['title'] == edited['home']['title'] and
                      data('/api/store-catalog')['equipmentModels'][0]['id'] == 'qa-heater-80')
                check('Stale configuration update rejected',
                      json_request('/api/admin/store-catalog', edited, token=token)[0] == 409)
                homepage = request('/')[2].decode()
                check('Homepage content is HTML escaped',
                      'QA store homepage &lt;tag&gt;' in homepage
                      and 'QA store homepage <tag>' not in homepage)

                invalid = copy.deepcopy(config)
                invalid['categories'].append(copy.deepcopy(invalid['categories'][0]))
                check('Duplicate category identifiers rejected',
                      json_request('/api/admin/store-catalog', invalid, token=token)[0] == 400)
                invalid = copy.deepcopy(config)
                root = next(x for x in invalid['categories'] if x['id'] == 'water-heater-parts')
                root['parentId'] = 'water-heater-elements'
                check('Category cycles rejected',
                      json_request('/api/admin/store-catalog', invalid, token=token)[0] == 400)
                invalid = copy.deepcopy(config)
                invalid['equipmentModels'][0]['categoryId'] = 'missing-category'
                check('Dangling model category rejected',
                      json_request('/api/admin/store-catalog', invalid, token=token)[0] == 400)
                invalid = copy.deepcopy(config)
                invalid['home']['heroImage'] = 'javascript:alert(1)'
                check('Unsafe storefront image URL rejected',
                      json_request('/api/admin/store-catalog', invalid, token=token)[0] == 400)

                original_products = data('/api/admin')['products']
                template = copy.deepcopy(next(x for x in original_products if x['category'] == 'part'))
                first = dict(template, slug='qa-catalog-copper', revision=0, title='QA copper heater part',
                    category='part', catalogCategoryId='water-heater-elements', sku='QA-2000-CU',
                    manufacturer='QA maker', brand='QAbrand', model='', price=1000, oldPrice=1500,
                    priceIsEstimate=False, stockQuantity=5, published=True, demo=False,
                    specs={'Material': 'Copper', 'Power': '2000 W'}, replacementCodes=['QA-REPLACE-1'],
                    compatibleModelIds=['qa-heater-80'], relatedProductSlugs=[],
                    alternativeProductSlugs=[], bundleProductSlugs=[], isFeatured=True, isNew=True)

                def save_product(product):
                    return json_request('/api/admin', dict(action='product', product=product), method='POST', token=token)

                status, _, result = save_product(first)
                check('Extended product can be saved', status == 200)
                first = next(x for x in data('/api/admin')['products'] if x['slug'] == first['slug'])
                second = dict(copy.deepcopy(first), slug='qa-catalog-steel', revision=0,
                    title='QA steel heater part', sku='QA-3000-SS', price=2000, oldPrice=None,
                    specs={'Material': 'Steel', 'Power': '3000 W'}, compatibleModelIds=[],
                    replacementCodes=[], relatedProductSlugs=[first['slug']])
                check('Explicit product relation can be saved', save_product(second)[0] == 200)
                second = next(x for x in data('/api/admin')['products'] if x['slug'] == second['slug'])
                invalid_product = dict(copy.deepcopy(first), compatibleModelIds=['unknown-model'])
                check('Unknown product compatibility model rejected', save_product(invalid_product)[0] == 400)
                invalid_product = dict(copy.deepcopy(first), relatedProductSlugs=['missing-product'])
                check('Unknown related product rejected', save_product(invalid_product)[0] == 400)
                invalid_product = dict(copy.deepcopy(first), catalogCategoryId='missing-category')
                check('Unknown product category rejected', save_product(invalid_product)[0] == 400)
                invalid_product = dict(copy.deepcopy(second), sku=first['sku'])
                check('Duplicate product SKU rejected', save_product(invalid_product)[0] == 400)
                invalid_product = dict(copy.deepcopy(first), relatedProductSlugs=[first['slug']])
                check('Self-referencing product relationship rejected', save_product(invalid_product)[0] == 400)
                invalid_product = dict(copy.deepcopy(first), oldPrice=500)
                check('Old price below sale price rejected', save_product(invalid_product)[0] == 400)
                referenced = copy.deepcopy(config)
                referenced['equipmentModels'] = []
                check('Model referenced by product cannot be deleted',
                      json_request('/api/admin/store-catalog', referenced, token=token)[0] == 400)
                referenced = copy.deepcopy(config)
                referenced['categories'] = [x for x in referenced['categories'] if x['id'] != 'water-heater-elements']
                check('Category referenced by product cannot be deleted',
                      json_request('/api/admin/store-catalog', referenced, token=token)[0] == 400)

                detail = html.unescape(request('/products/' + first['slug'])[2].decode())
                check('Product page exposes SKU, codes and confirmed compatibility',
                      all(x in detail for x in ['QA-2000-CU', 'QA-REPLACE-1', 'QA heater 80']))
                slugs, _ = cards('/catalog?category=water-heater-parts&q=QA')
                check('Parent category includes descendant products', {first['slug'], second['slug']} <= slugs)
                slugs, filtered_page = cards('/parts?category=water-heater-elements&q=QA&min=900&max=1500')
                check('Server price filter includes only matching products', first['slug'] in slugs and second['slug'] not in slugs)
                check('Faceted pages are excluded from indexing', 'noindex' in filtered_page)
                slugs, _ = cards('/parts?model=qa-heater-80&q=QA')
                check('Model filter uses confirmed product relationships', first['slug'] in slugs and second['slug'] not in slugs)
                slugs, _ = cards('/catalog?q=QA-REPLACE-1')
                check('Replacement code search finds product', first['slug'] in slugs)
                query = urllib.parse.urlencode([('category', 'water-heater-elements'), ('q', 'QA'),
                                               ('spec', 'Material:Copper'), ('spec', 'Power:2000 W')])
                slugs, _ = cards('/parts?' + query)
                check('Multiple technical filters intersect correctly', first['slug'] in slugs and second['slug'] not in slugs)

                for path in ['/selection', '/delivery', '/payment', '/about', '/favorites', '/compare', '/cart']:
                    status, _, page = request(path)
                    check('New public page ' + path, status == 200 and b'<h1' in page)

                check('Anonymous order administration denied', request('/api/admin/orders', opener=anonymous)[0] == 401)
                order_request = dict(requestId=str(uuid.uuid4()), name='Order QA', phone='+374 99 123456',
                                     email='', address='', deliveryMethod='pickup', paymentMethod='manager',
                                     message='', consent=True,
                                     items=[dict(slug=first['slug'], quantity=2, unitPrice=1, lineTotal=2)])
                check('Checkout mutation requires CSRF',
                      json_request('/api/orders', order_request, method='POST')[0] == 400)
                invalid_order = dict(copy.deepcopy(order_request), consent=False)
                check('Checkout requires personal-data consent',
                      json_request('/api/orders', invalid_order, method='POST', token=token)[0] == 400)
                invalid_order = dict(copy.deepcopy(order_request), deliveryMethod='delivery')
                check('Delivery checkout requires address',
                      json_request('/api/orders', invalid_order, method='POST', token=token)[0] == 400)
                invalid_order = copy.deepcopy(order_request)
                invalid_order['items'][0]['quantity'] = 6
                check('Checkout rejects quantity beyond confirmed stock',
                      json_request('/api/orders', invalid_order, method='POST', token=token)[0] == 409)
                status, _, response = json_request('/api/orders', order_request, method='POST', token=token)
                order = json.loads(response)['order']
                check('Checkout calculates prices from server data', status == 201 and
                      order['subtotal'] == 2000 and order['items'][0]['unitPrice'] == 1000 and
                      order['items'][0]['sku'] == first['sku'])
                check('Checkout retry is idempotent',
                      json_request('/api/orders', order_request, method='POST', token=token)[0] == 200)
                changed_order = dict(copy.deepcopy(order_request), message='Changed order data')
                check('Conflicting checkout retry is rejected',
                      json_request('/api/orders', changed_order, method='POST', token=token)[0] == 409)
                persisted_orders = data('/api/admin/orders')['orders']
                check('Order appears in protected management list',
                      sum(x['id'] == order['id'] for x in persisted_orders) == 1)
                check('Order reaches existing office lead system',
                      any(x['id'] == order['id'] and x['kind'] == 'order' for x in data('/api/admin')['leads']))
                edit = dict(revision=order['revision'], status='confirmed')
                status, _, response = json_request('/api/admin/orders/' + order['id'], edit, method='PATCH', token=token)
                check('Order status can be updated', status == 200 and json.loads(response)['order']['status'] == 'confirmed')
                check('Stale order status edit is rejected',
                      json_request('/api/admin/orders/' + order['id'], edit, method='PATCH', token=token)[0] == 409)

                if args.frontend:
                    frontend_input = dict(baseUrl=base, cookie='; '.join(f'{x.name}={x.value}' for x in jar),
                                          firstSlug=first['slug'], secondSlug=second['slug'])
                    frontend = subprocess.run([args.node, str(ROOT / 'tests/storefront_frontend_test.mjs')],
                                              input=json.dumps(frontend_input), capture_output=True, text=True,
                                              cwd=ROOT, env=env)
                    print(frontend.stdout)
                    assert frontend.returncode == 0, frontend.stderr
                    check('Saved products and checkout DOM workflows', True)
                    management = subprocess.run([args.node, str(ROOT / 'tests/store_admin_frontend_test.mjs')],
                                                input=json.dumps(frontend_input), capture_output=True, text=True,
                                                cwd=ROOT, env=env)
                    print(management.stdout)
                    assert management.returncode == 0, management.stderr
                    check('Store administration DOM workflows', True)

                hidden = dict(copy.deepcopy(first), published=False)
                check('Administrator can unpublish product', save_product(hidden)[0] == 200)
                check('Unpublished product removed from public API',
                      first['slug'] not in {x['slug'] for x in data('/api/catalog')['products']})
                check('Unpublished product detail is not public', request('/products/' + first['slug'])[0] == 404)
                check('Unpublished product retained for administrators',
                      first['slug'] in {x['slug'] for x in data('/api/admin')['products']})

                config = data('/api/admin/store-catalog')
                hidden_config = copy.deepcopy(config)
                next(x for x in hidden_config['categories'] if x['id'] == 'water-heater-parts')['published'] = False
                check('Category publication can be changed',
                      json_request('/api/admin/store-catalog', hidden_config, token=token)[0] == 200)
                public = data('/api/store-catalog')
                check('Hidden category also hides descendants and their models',
                      not {'water-heater-parts', 'water-heater-elements'} & {x['id'] for x in public['categories']}
                      and 'qa-heater-80' not in {x['id'] for x in public['equipmentModels']})
                check('Hidden category also hides assigned products',
                      second['slug'] not in {x['slug'] for x in data('/api/catalog')['products']}
                      and request('/products/' + second['slug'])[0] == 404)
                private = data('/api/admin/store-catalog')
                check('Unpublished configuration remains editable',
                      'water-heater-elements' in {x['id'] for x in private['categories']})
                print(f'PASS: {len(checks)} store catalog integration checks')
                for name in checks:
                    print('  ' + name)
            except Exception:
                log.flush()
                log.seek(0)
                print(log.read()[-8000:])
                raise
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == '__main__':
    main()
