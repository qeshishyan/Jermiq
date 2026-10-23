#!/usr/bin/env python3
"""Real HTTP and optional DOM checks for the part finder and compatible bundles.

Uses only a temporary SQLite database and a generated administrator. Build Release
first, then run this script with --frontend for the interactive browser workflows.
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


class PageElements(HTMLParser):
    def __init__(self):
        super().__init__()
        self.products = []
        self.elements = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        self.elements.append((tag, attributes))
        if tag == 'article' and attributes.get('data-product'):
            self.products.append(json.loads(attributes['data-product']))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dotnet', default='dotnet')
    parser.add_argument('--configuration', default='Release')
    parser.add_argument('--frontend', action='store_true')
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    checks = []

    def check(name, condition):
        assert condition, name
        checks.append(name)

    with tempfile.TemporaryDirectory(prefix='jermiq-interactive-sales-') as directory:
        with socket.socket() as endpoint:
            endpoint.bind(('127.0.0.1', 0))
            base = 'http://127.0.0.1:' + str(endpoint.getsockname()[1])
        email = 'sales-test@example.invalid'
        password = 'Sales!8' + uuid.uuid4().hex
        env = dict(os.environ, ASPNETCORE_ENVIRONMENT='Production', Persistence__DataDirectory=directory,
                   Seo__BaseUrl=base, Seo__IndexingEnabled='true', Security__RequireHttps='false',
                   JERMIQ_ADMIN_EMAIL=email, JERMIQ_ADMIN_PASSWORD=password)
        command = [args.dotnet, 'run', '--no-build', '--no-launch-profile', '-c', args.configuration,
                   '--project', str(ROOT / 'src/Jermiq.Web')]
        setup = subprocess.run(command + ['--', '--create-admin'], cwd=ROOT, env=env, capture_output=True, text=True)
        assert setup.returncode == 0, setup.stdout + setup.stderr
        del env['JERMIQ_ADMIN_EMAIL'], env['JERMIQ_ADMIN_PASSWORD']
        with open(Path(directory) / 'server.log', 'w+') as log:
            process = subprocess.Popen(command + ['--', '--urls', base], cwd=ROOT, env=env,
                                       stdout=log, stderr=subprocess.STDOUT)
            jar = http.cookiejar.CookieJar()
            client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

            def request(path, value=None, token=None, method=None):
                headers = {}
                if token:
                    headers['X-CSRF-TOKEN'] = token
                if value is not None:
                    headers['Content-Type'] = 'application/json'
                    value = json.dumps(value).encode()
                req = urllib.request.Request(base + path, value, headers, method=method)
                try:
                    response = client.open(req, timeout=15)
                except urllib.error.HTTPError as error:
                    response = error
                return response.status, response.headers, response.read()

            def data(path):
                status, _, body = request(path)
                assert status == 200, (path, status, body[:500])
                return json.loads(body)

            def page(path):
                status, headers, body = request(path)
                assert status == 200, (path, status, body[:500])
                parsed = PageElements()
                parsed.feed(body.decode())
                return parsed, body.decode(), headers

            def csrf(body):
                return html.unescape(re.search(r'<meta name="csrf-token" content="([^"]+)"', body.decode()).group(1))

            try:
                for _ in range(100):
                    if process.poll() is not None:
                        log.seek(0)
                        raise AssertionError(log.read())
                    try:
                        if request('/health')[0] == 200:
                            break
                    except (OSError, urllib.error.URLError):
                        time.sleep(.2)
                else:
                    raise AssertionError('Server did not start')

                parsed, text, _ = page('/find-part')
                check('Finder is available before model data is configured',
                      any('data-part-finder' in attrs for _, attrs in parsed.elements))
                parsed, text, _ = page('/find-part?mode=model')
                check('Empty model data offers photo help without invented choices',
                      any('data-finder-photo-start' in attrs for _, attrs in parsed.elements)
                      and data('/api/store-catalog')['equipmentModels'] == [])

                login_page = request('/admin/login')[2].decode()
                token = html.unescape(re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', login_page).group(1))
                login = urllib.parse.urlencode(dict(Email=email, Password=password,
                    ReturnUrl='/admin', __RequestVerificationToken=token)).encode()
                response = client.open(urllib.request.Request(base + '/admin/login', login,
                    {'Content-Type': 'application/x-www-form-urlencoded'}), timeout=15)
                login_result = response.read()
                check('Isolated administrator signs in', response.status == 200 and b'id="admin-app"' in login_result)
                admin_token = csrf(login_result)
                config = data('/api/admin/store-catalog')
                config['equipmentModels'].extend([
                    dict(id='qa-sales-model', categoryId='water-heater-parts', brand='QA Sales', series='Family', name='Sales model 80', published=True),
                    dict(id='qa-sales-hidden-model', categoryId='water-heater-parts', brand='QA Hidden', series='', name='Hidden model 80', published=False)
                ])
                check('Confirmed and private equipment fixtures can be configured',
                      request('/api/admin/store-catalog', config, admin_token, 'PUT')[0] == 200)
                source = next(x for x in data('/api/admin')['products'] if x['category'] == 'part')
                fixtures = [
                    ('qa-sales-base', 'QA sales heating element <sample>', 'SALES-BASE-1701', 1000, False, 30, True, ['qa-sales-model']),
                    ('qa-sales-priced', 'QA sales matching gasket', 'SALES-ADDON-250', 250, False, 6, True, ['qa-sales-model']),
                    ('qa-sales-estimate', 'QA sales estimated anode', 'SALES-EST-150', 150, True, 10, True, []),
                    ('qa-sales-unknown', 'QA sales unpriced thermostat', 'SALES-UNKNOWN', None, False, 10, True, []),
                    ('qa-sales-outstock', 'QA sales unavailable part', 'SALES-OUTSTOCK', 400, False, 0, True, []),
                    ('qa-sales-hidden', 'QA sales private part', 'SALES-PRIVATE', 500, False, 10, False, ['qa-sales-hidden-model']),
                    ('qa-sales-unrelated', 'QA sales unrelated part', 'SALES-OTHER', 300, False, 10, True, [])
                ]
                for slug, title, sku, price, estimate, stock, published, models in fixtures:
                    product = dict(copy.deepcopy(source), slug=slug, title=title, revision=0, category='part',
                        catalogCategoryId='water-heater-elements', sku=sku, manufacturer='QA maker',
                        brand='QA Sales', model='', price=price, oldPrice=None, priceIsEstimate=estimate,
                        stockQuantity=stock, published=published, demo=False, image='/images/parts.webp', images=[],
                        specs={'Power': '1700 W'}, compatibleModelIds=models, replacementCodes=[],
                        relatedProductSlugs=[], alternativeProductSlugs=[], bundleProductSlugs=[])
                    if slug == 'qa-sales-base':
                        product['replacementCodes'] = ['RET-BASE-1701']
                    check('Fixture product saved ' + slug,
                          request('/api/admin', dict(action='product', product=product), admin_token, 'POST')[0] == 200)
                products = data('/api/admin')['products']
                base_product = next(x for x in products if x['slug'] == 'qa-sales-base')
                base_product['bundleProductSlugs'] = [x[0] for x in fixtures[1:6]]
                check('Administrator chooses bundle relationships explicitly',
                      request('/api/admin', dict(action='product', product=base_product), admin_token, 'POST')[0] == 200)

                parsed, text, _ = page('/find-part?mode=code&q=SALES-BASE-1701')
                check('Exact SKU finds the matching public part without JavaScript',
                      [p['slug'] for p in parsed.products] == ['qa-sales-base'])
                parsed, _, _ = page('/find-part?mode=code&q=RET-BASE-1701')
                check('Replacement code finds the correct part', [p['slug'] for p in parsed.products] == ['qa-sales-base'])
                parsed, _, _ = page('/find-part?mode=code&q=SALES-PRIVATE')
                check('Finder cannot disclose unpublished products', parsed.products == [])
                parsed, _, _ = page('/find-part?mode=code&q=not-a-real-sales-code')
                check('Unknown code produces no fabricated match', parsed.products == [])
                route = '/find-part?' + urllib.parse.urlencode(dict(mode='model', category='water-heater-parts', brand='QA Sales', model='qa-sales-model'))
                parsed, text, _ = page(route)
                check('Model selection returns only confirmed compatible parts',
                      {p['slug'] for p in parsed.products} == {'qa-sales-base', 'qa-sales-priced'})
                check('Hidden equipment model is absent from public finder data', 'qa-sales-hidden-model' not in text)
                parsed, text, _ = page('/find-part?mode=code&q=' + urllib.parse.quote('<script>window.bad=1</script>'))
                check('Finder query is safely escaped', '<script>window.bad=1</script>' not in text and '&lt;script&gt;' in text)
                _, text, _ = page('/find-part?lang=en')
                check('Finder participates in existing language flow', 'lang="en"' in text and 'hreflang="ru"' in text)
                parsed, text, _ = page('/products/qa-sales-base')
                check('Configured product renders an interactive bundle', any('data-bundle-builder' in attrs for _, attrs in parsed.elements))
                check('Private bundle relationship is not leaked to shoppers', 'qa-sales-hidden' not in text)
                check('Unavailable bundle item remains disabled',
                      any('data-bundle-toggle' in attrs and attrs.get('value') == 'qa-sales-outstock' and 'disabled' in attrs for _, attrs in parsed.elements))

                if args.frontend:
                    cookie = '; '.join(f'{c.name}={c.value}' for c in jar)
                    subprocess.run([args.node, str(ROOT / 'tests/interactive_sales_frontend_test.mjs')],
                        input=json.dumps(dict(baseUrl=base, cookie=cookie, adminToken=admin_token,
                            baseSlug='qa-sales-base', pricedSlug='qa-sales-priced', estimateSlug='qa-sales-estimate',
                            unknownSlug='qa-sales-unknown', outstockSlug='qa-sales-outstock', hiddenSlug='qa-sales-hidden', modelId='qa-sales-model')),
                        text=True, check=True, cwd=ROOT)
                    check('Interactive finder and bundle DOM workflows', True)
                print(f'PASS: {len(checks)} interactive sales HTTP checks')
                for name in checks:
                    print('  ' + name)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == '__main__':
    main()
