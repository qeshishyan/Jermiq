#!/usr/bin/env python3
"""Real order API checks in an isolated SQLite database; no production data used."""
import argparse
import html
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dotnet', default='dotnet')
    parser.add_argument('--configuration', default='Release')
    args = parser.parse_args()
    checks = []

    def check(label, condition):
        assert condition, label
        checks.append(label)

    with tempfile.TemporaryDirectory(prefix='jermiq-orders-') as temp:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        email = 'order-admin@example.invalid'
        password = 'Qa!9' + uuid.uuid4().hex
        env = dict(os.environ, ASPNETCORE_ENVIRONMENT='Production', Persistence__DataDirectory=temp,
                   Seo__BaseUrl=base, Seo__IndexingEnabled='true', Security__RequireHttps='false',
                   JERMIQ_ADMIN_EMAIL=email, JERMIQ_ADMIN_PASSWORD=password)
        run = [args.dotnet, 'run', '--no-build', '--no-launch-profile', '--configuration', args.configuration,
               '--project', str(ROOT / 'src/Jermiq.Web')]
        result = subprocess.run(run + ['--', '--create-admin'], env=env, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if result.returncode:
            raise AssertionError('Could not initialize isolated app: ' + result.stdout.decode())
        del env['JERMIQ_ADMIN_EMAIL']
        del env['JERMIQ_ADMIN_PASSWORD']
        admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        anon = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

        def request(path, body=None, token=None, method=None, client=admin, content_type='application/json'):
            headers = {'Content-Type': content_type} if body is not None else {}
            if token:
                headers['X-CSRF-TOKEN'] = token
            if isinstance(body, dict):
                body = json.dumps(body).encode()
            req = urllib.request.Request(base + path, body, headers, method=method)
            try:
                response = client.open(req, timeout=20)
            except urllib.error.HTTPError as error:
                response = error
            value = response.read()
            return response.status, json.loads(value) if 'application/json' in response.headers.get('Content-Type', '') else value

        def csrf(value):
            return html.unescape(re.search(r'<meta name="csrf-token" content="([^"]+)"', value.decode()).group(1))

        with open(Path(temp) / 'server.log', 'w+') as log:
            process = subprocess.Popen(run + ['--', '--urls', base], env=env, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
            try:
                for _ in range(150):
                    if process.poll() is not None:
                        log.seek(0)
                        raise AssertionError('Server exited: ' + log.read())
                    try:
                        if request('/health')[0] == 200:
                            break
                    except (OSError, urllib.error.URLError):
                        time.sleep(.2)
                else:
                    raise AssertionError('Server not ready')
                check('Anonymous cannot list orders', request('/api/admin/orders', client=anon)[0] == 401)
                check('Anonymous cannot patch orders', request('/api/admin/orders/' + str(uuid.uuid4()), {}, method='PATCH', client=anon)[0] == 401)
                check('Anonymous orders page goes to login', b'orders-admin-app' not in request('/admin/orders', client=anon)[1])
                status, page = request('/admin/login')
                login_token = html.unescape(re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', page.decode()).group(1))
                body = urllib.parse.urlencode(dict(Email=email, Password=password, ReturnUrl='/admin', __RequestVerificationToken=login_token)).encode()
                status, page = request('/admin/login', body, content_type='application/x-www-form-urlencoded')
                check('Admin login works', status == 200 and b'admin-app' in page)
                admin_token = csrf(page)
                check('Orders admin page is available', request('/admin/orders')[0] == 200)
                data = request('/api/admin')[1]
                template = dict(data['products'][0])
                template.update(revision=0, slug='qa-order-priced', title='Order test product', sku='QA-ORDER-1',
                                category='part', catalogCategoryId='', price=3500, priceIsEstimate=False,
                                stockQuantity=10, published=True, demo=False, oldPrice=None,
                                replacementCodes=[], compatibleModelIds=[], relatedProductSlugs=[],
                                alternativeProductSlugs=[], bundleProductSlugs=[])

                def save_product(product):
                    return request('/api/admin', dict(action='product', product=product), admin_token)

                def current_product(slug):
                    return next(p for p in request('/api/admin')[1]['products'] if p['slug'] == slug)

                check('Priced test product created', save_product(template)[0] == 200)
                unknown = dict(template, slug='qa-order-unknown', sku='QA-ORDER-2', price=None)
                estimate = dict(template, slug='qa-order-estimate', sku='QA-ORDER-3', price=1500, priceIsEstimate=True)
                check('Unknown price product created', save_product(unknown)[0] == 200)
                check('Estimated price product created', save_product(estimate)[0] == 200)
                anon_token = csrf(request('/', client=anon)[1])

                def payload(slug='qa-order-priced', quantity=2, **values):
                    return dict(requestId=str(uuid.uuid4()), name='Order QA', phone='+374 99 123456', email='', address='',
                                deliveryMethod='pickup', paymentMethod='manager', message='isolated test', consent=True,
                                items=[dict(slug=slug, quantity=quantity)], **values)

                def order(value, token=anon_token):
                    return request('/api/orders', value, token, client=anon)

                value = payload()
                value['items'][0]['unitPrice'] = 1
                value['subtotal'] = 1
                check('Order CSRF enforced', order(value, None)[0] == 400)
                status, response = order(value)
                placed = response.get('order', {})
                order_id = response.get('id')
                check('Server order created', status == 201 and order_id == value['requestId'])
                check('Client price tampering ignored', placed.get('subtotal') == 7000 and placed['items'][0]['unitPrice'] == 3500)
                check('Order money and pickup fields explicit', placed['currency'] == 'AMD' and placed['deliveryPrice'] == 0 and not placed['requiresConfirmation'])
                check('Order idempotent retry', order(value)[0] == 200)
                changed = dict(value, message='changed')
                check('Changed payload conflicts with used ID', order(changed)[0] == 409)
                check('Insufficient stock rejected', order(payload(quantity=11))[0] == 409)
                check('Zero quantity rejected', order(payload(quantity=0))[0] == 400)
                check('Excessive quantity rejected', order(payload(quantity=21))[0] == 400)
                duplicate = payload()
                duplicate['items'] *= 2
                check('Duplicate product rows rejected', order(duplicate)[0] == 400)
                invalid = payload()
                invalid['consent'] = False
                check('Consent required', order(invalid)[0] == 400)
                delivery = payload()
                delivery['deliveryMethod'] = 'delivery'
                check('Delivery requires address', order(delivery)[0] == 400)
                delivery['address'] = 'Yerevan, Test street 12'
                status, result = order(delivery)
                check('Delivery charges await confirmation', status == 201 and result['order']['deliveryPrice'] is None and result['order']['requiresConfirmation'])
                status, result = order(payload('qa-order-unknown', 1))
                check('Unknown price never becomes zero payable total', status == 201 and result['order']['subtotal'] is None and result['order']['requiresConfirmation'] and result['order']['items'][0]['unitPrice'] is None)
                status, result = order(payload('qa-order-estimate', 1))
                check('Estimated price needs confirmation', status == 201 and result['order']['subtotal'] is None and result['order']['knownSubtotal'] == 1500 and result['order']['requiresConfirmation'])
                p = current_product(template['slug'])
                p['published'] = False
                check('Product can be unpublished', save_product(p)[0] == 200)
                check('Unpublished product cannot be ordered', order(payload())[0] == 409)
                p = current_product(template['slug'])
                p.update(published=True, price=9000)
                check('Product repriced', save_product(p)[0] == 200)
                p = current_product(template['slug'])
                p['stockQuantity'] = 0
                check('Zero stock product saved', save_product(p)[0] == 200)
                check('Zero stock is unavailable for ordering', order(payload())[0] == 409)
                p = current_product(template['slug'])
                p['stockQuantity'] = 10
                check('Product stock restored', save_product(p)[0] == 200)
                config = request('/api/admin/store-catalog')[1]
                category = next(c for c in config['categories'] if c['id'] == 'water-heater-parts')
                p = current_product(template['slug'])
                p['catalogCategoryId'] = category['id']
                check('Product assigned to category', save_product(p)[0] == 200)
                category['published'] = False
                check('Category unpublished', request('/api/admin/store-catalog', config, admin_token, method='PUT')[0] == 200)
                check('Hidden category product cannot be ordered', order(payload())[0] == 409)
                config = request('/api/admin/store-catalog')[1]
                next(c for c in config['categories'] if c['id'] == 'water-heater-parts')['published'] = True
                check('Category restored', request('/api/admin/store-catalog', config, admin_token, method='PUT')[0] == 200)
                snapshots = request('/api/admin/orders')[1]['orders']
                saved = next(x for x in snapshots if x['id'] == order_id)
                check('Historical order price remains immutable', saved['subtotal'] == 7000 and saved['items'][0]['unitPrice'] == 3500)
                check('Order appears in existing lead desk', request('/api/admin/lead/' + order_id)[1]['lead']['kind'] == 'order')
                status_path = '/api/admin/orders/' + order_id
                edit = dict(revision=saved['revision'], status='confirmed')
                check('Order status CSRF enforced', request(status_path, edit, method='PATCH')[0] == 400)
                status, result = request(status_path, edit, admin_token, method='PATCH')
                check('Status saved with new revision', status == 200 and result['order']['status'] == 'confirmed' and result['order']['revision'] > saved['revision'])
                check('Lead status follows order status', request('/api/admin/lead/' + order_id)[1]['lead']['status'] == 'contacted')
                check('Stale status update rejected', request(status_path, edit, admin_token, method='PATCH')[0] == 409)
                check('No public PII order lookup', request('/api/orders/' + order_id, client=anon)[0] == 404)
                filtered = request('/api/admin/orders?status=confirmed&q=' + order_id)[1]
                check('Admin order filtering works', filtered['total'] == 1 and filtered['orders'][0]['id'] == order_id)
                staff_email = 'order-office@example.invalid'
                staff_password = 'Office!9' + uuid.uuid4().hex
                check('Office account created', request('/api/admin/users', dict(email=staff_email, password=staff_password, role='Office', disabled=False), admin_token)[0] == 200)
                staff = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
                page = request('/admin/login', client=staff)[1]
                login_token = html.unescape(re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', page.decode()).group(1))
                login_body = urllib.parse.urlencode(dict(Email=staff_email, Password=staff_password, ReturnUrl='/admin/orders', __RequestVerificationToken=login_token)).encode()
                status, page = request('/admin/login', login_body, client=staff, content_type='application/x-www-form-urlencoded')
                check('Office can open orders page', status == 200 and b'orders-admin-app' in page)
                staff_token = csrf(page)
                check('Office can list orders', request('/api/admin/orders', client=staff)[0] == 200)
                check('Office cannot manage catalog configuration', request('/api/admin/store-catalog', client=staff)[0] == 403)
                order_latest = next(x for x in request('/api/admin/orders', client=staff)[1]['orders'] if x['id'] == order_id)
                status, result = request(status_path, dict(revision=order_latest['revision'], status='preparing'), staff_token, method='PATCH', client=staff)
                check('Office can update order workflow', status == 200 and result['order']['status'] == 'preparing')
                check('Office order workflow syncs lead desk', request('/api/admin/lead/' + order_id, client=staff)[1]['lead']['status'] == 'in_progress')
                print(f'PASS: {len(checks)} isolated order checks')
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()


if __name__ == '__main__':
    main()
