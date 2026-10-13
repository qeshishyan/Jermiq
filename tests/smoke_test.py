#!/usr/bin/env python3
"""Run real HTTP/SQLite checks against an isolated database. Uses Python stdlib only.
The production database and the hosted Sites project are never used.
"""
import argparse
import base64
import concurrent.futures
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
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dotnet', default='dotnet')
    parser.add_argument('--configuration', default='Release')
    parser.add_argument('--frontend', action='store_true', help='Also run the optional jsdom interaction checks')
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    checks = []
    with tempfile.TemporaryDirectory(prefix='jermiq-tests-') as temp:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        email = 'test-admin@example.invalid'
        password = 'Qa!9' + uuid.uuid4().hex
        env = dict(os.environ, ASPNETCORE_ENVIRONMENT='Production',
                   Persistence__DataDirectory=temp, Seo__BaseUrl=base, Seo__IndexingEnabled='true',
                   Security__RequireHttps='false', JERMIQ_ADMIN_EMAIL=email, JERMIQ_ADMIN_PASSWORD=password)
        run = [args.dotnet, 'run', '--no-build', '--no-launch-profile', '--configuration', args.configuration,
               '--project', str(ROOT / 'src/Jermiq.Web')]
        subprocess.run(run + ['--', '--create-admin'], env=env, cwd=ROOT,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True)
        # The web process has no administrator password in its environment.
        del env['JERMIQ_ADMIN_EMAIL']
        del env['JERMIQ_ADMIN_PASSWORD']
        with open(Path(temp) / 'server.log', 'w+') as log:
            process = subprocess.Popen(run + ['--', '--urls', base], env=env, cwd=ROOT,
                                       stdout=log, stderr=subprocess.STDOUT)
            jar = http.cookiejar.CookieJar()
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

            def request(path, body=None, content_type=None, token=None, client=opener):
                headers = {}
                if content_type:
                    headers['Content-Type'] = content_type
                if token:
                    headers['X-CSRF-TOKEN'] = token
                req = urllib.request.Request(base + path, body, headers)
                try:
                    response = client.open(req, timeout=15)
                except urllib.error.HTTPError as error:
                    response = error
                return response.status, response.headers, response.read()

            def csrf(page):
                return html.unescape(re.search(r'<meta name="csrf-token" content="([^"]+)"', page.decode()).group(1))

            def multipart(fields, file=None):
                boundary = 'jermiq-' + uuid.uuid4().hex
                parts = []
                for key, value in fields.items():
                    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
                if file:
                    field, mime, value = file
                    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="test.png"\r\nContent-Type: {mime}\r\n\r\n'.encode() + value + b'\r\n')
                parts.append(f'--{boundary}--\r\n'.encode())
                return b''.join(parts), 'multipart/form-data; boundary=' + boundary

            def check(name, condition):
                assert condition, name
                checks.append(name)

            try:
                for _ in range(100):
                    if process.poll() is not None:
                        log.seek(0)
                        raise AssertionError('Server failed to start: ' + log.read())
                    try:
                        if request('/health')[0] == 200:
                            break
                    except (OSError, urllib.error.URLError):
                        time.sleep(0.2)
                else:
                    raise AssertionError('Server did not become ready')
                for path in ['', '/catalog', '/parts', '/services', '/warranty', '/guide', '/contact', '/privacy']:
                    status, headers, body = request(path or '/')
                    check('SSR page ' + (path or '/'), status == 200 and b'<h1' in body and 'text/html' in headers.get('Content-Type', ''))
                    text = html.unescape(body.decode())
                    check('SEO metadata ' + (path or '/'), '<link rel="canonical"' in text and 'og:title' in text and 'lang="hy"' in text)
                status, _, body = request('/api/catalog')
                products = json.loads(body)['products']
                check('Migrated 10 catalog products', status == 200 and len(products) == 10)
                for product in products:
                    status, _, body = request('/products/' + product['slug'])
                    check('SSR product ' + product['slug'], status == 200 and product['title'] in html.unescape(body.decode()))
                    check('Product indexing policy ' + product['slug'], ('noindex, nofollow' in body.decode()) == product['demo'])
                for slug in ['choose-water-heater', 'find-spare-part', 'service-warranty']:
                    status, _, body = request('/guide/' + slug)
                    check('SSR guide ' + slug, status == 200 and 'Article' in body.decode())
                status, _, body = request('/sitemap.xml')
                xml = ET.fromstring(body)
                locs = [el.text for el in xml.findall('.//{*}loc')]
                check('Sitemap includes real products only', status == 200 and all((base + '/products/' + p['slug'] in locs) != p['demo'] for p in products))
                status, _, body = request('/robots.txt')
                check('Production robots policy', status == 200 and b'Disallow: /admin' in body and b'Allow: /' in body)
                check('Unknown page returns 404', request('/missing/page')[0] == 404)
                status, headers, body = request('/api/missing')
                check('Unknown API returns JSON 404', status == 404 and 'application/json' in headers.get('Content-Type', '') and 'error' in json.loads(body))
                check('Anonymous admin API blocked', request('/api/admin')[0] == 401)
                check('Anonymous attachments blocked', request('/api/attachments?id=' + str(uuid.uuid4()))[0] == 401)
                token = csrf(request('/contact')[2])
                fields = dict(requestId=str(uuid.uuid4()), kind='service', name='QA User', phone='+374 99 123456', email='', message='Test request', subject='Ախտորոշում', details='Test selection', consent='true', website='')
                body, mime = multipart(fields)
                check('CSRF enforced', request('/api/leads', body, mime)[0] == 400)
                png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR5kAAAAASUVORK5CYII=')
                body, mime = multipart(fields, ('attachment', 'image/png', png))
                status, _, response = request('/api/leads', body, mime, token)
                lead_id = json.loads(response)['id']
                check('Lead saved with attachment', status == 201 and lead_id == fields['requestId'])
                check('Idempotent replay', request('/api/leads', body, mime, token)[0] == 200)
                changed, changed_mime = multipart(dict(fields, message='Changed request'))
                check('Conflicting replay rejected', request('/api/leads', changed, changed_mime, token)[0] == 409)
                invalid, invalid_mime = multipart(dict(fields, requestId=str(uuid.uuid4())), ('attachment', 'image/png', b'<html>not an image</html>'))
                check('Invalid image bytes rejected', request('/api/leads', invalid, invalid_mime, token)[0] == 400)
                invalid, invalid_mime = multipart(dict(fields, requestId=str(uuid.uuid4()), phone='abc'))
                check('Invalid phone rejected', request('/api/leads', invalid, invalid_mime, token)[0] == 400)
                invalid, invalid_mime = multipart(dict(fields, requestId=str(uuid.uuid4()), consent='false'))
                check('Consent required', request('/api/leads', invalid, invalid_mime, token)[0] == 400)
                for kind in ['question', 'part', 'order', 'callback']:
                    body2, mime2 = multipart(dict(fields, requestId=str(uuid.uuid4()), kind=kind))
                    check('Request kind ' + kind, request('/api/leads', body2, mime2, token)[0] == 201)
                status, _, page = request('/admin/login')
                login_token = html.unescape(re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', page.decode()).group(1))
                login_body = urllib.parse.urlencode(dict(Email=email, Password=password, ReturnUrl='/admin', __RequestVerificationToken=login_token)).encode()
                status, _, page = request('/admin/login', login_body, 'application/x-www-form-urlencoded')
                check('Identity administrator login', status == 200 and b'id="admin-app"' in page)
                admin_token = csrf(page)
                data = json.loads(request('/api/admin')[2])
                check('Administrator can see saved leads', len(data['leads']) == 5 and any(x['id'] == lead_id for x in data['leads']))
                status, headers, body = request('/api/attachments?id=' + lead_id)
                check('Protected attachment download', status == 200 and body == png and headers.get('Cache-Control') == 'private, no-store')
                def mutate(value, csrf_token=admin_token):
                    return request('/api/admin', json.dumps(value).encode(), 'application/json', csrf_token)
                check('Administrator mutation requires CSRF', mutate(dict(action='status', id=lead_id, status='contacted'), None)[0] == 400)
                check('Lead status update', mutate(dict(action='status', id=lead_id, status='contacted'))[0] == 200)
                check('Invalid status rejected', mutate(dict(action='status', id=lead_id, status='other'))[0] == 400)
                upload, upload_mime = multipart({}, ('image', 'image/png', png))
                status, _, response = request('/api/product-image', upload, upload_mime, admin_token)
                image_url = json.loads(response)['image']
                check('Administrator product image upload', status == 200 and request(image_url)[2] == png)
                p = dict(products[0], title='QA Product', price=12345, demo=False, image=image_url, specs={'Power': '2000 W'})
                check('Product save', mutate(dict(action='product', product=p))[0] == 200)
                text = html.unescape(request('/products/' + p['slug'])[2].decode())
                check('Product updates SSR and JSON-LD', 'QA Product' in text and '12345' in text and 'Product' in text)
                setting = dict(data['settings'], phone='+374 99 123456', email='test@example.invalid', showDraftBanner=False, servicePrices={'diagnosis': 'QA price'})
                check('Settings save', mutate(dict(action='settings', settings=setting))[0] == 200)
                check('Settings visible in SSR', 'QA price' in html.unescape(request('/services')[2].decode()))
                check('Lead delete', mutate(dict(action='delete', id=lead_id))[0] == 200)
                check('Deleted attachment unavailable', request('/api/attachments?id=' + lead_id)[0] == 404)
                check('No duplicate lead after replay', len(json.loads(request('/api/admin')[2])['leads']) == 4)
                if args.frontend:
                    cookie = '; '.join(f'{item.name}={item.value}' for item in jar)
                    subprocess.run([args.node, str(ROOT / 'tests/frontend_test.mjs')],
                                   input=json.dumps({'baseUrl': base, 'cookie': cookie}), text=True, check=True)
                print(json.dumps({'passed': len(checks), 'checks': checks}, indent=2, ensure_ascii=False))
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == '__main__':
    main()
