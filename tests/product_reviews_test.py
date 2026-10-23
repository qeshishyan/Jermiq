#!/usr/bin/env python3
"""Moderation, privacy, CSRF and idempotency checks against an isolated review database."""
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

    def check(name, condition):
        assert condition, name
        checks.append(name)

    with tempfile.TemporaryDirectory(prefix='jermiq-reviews-test-') as directory:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        email = 'review-admin@example.invalid'
        password = 'Reviews!6' + uuid.uuid4().hex
        env = dict(os.environ, ASPNETCORE_ENVIRONMENT='Production', Persistence__DataDirectory=directory,
                   Security__RequireHttps='false', Seo__BaseUrl=base, Seo__IndexingEnabled='false',
                   JERMIQ_ADMIN_EMAIL=email, JERMIQ_ADMIN_PASSWORD=password)
        run = [args.dotnet, 'run', '--no-build', '--no-launch-profile', '--configuration', args.configuration,
               '--project', str(ROOT / 'src/Jermiq.Web')]
        setup = subprocess.run(run + ['--', '--create-admin'], cwd=ROOT, env=env, capture_output=True, text=True)
        assert setup.returncode == 0, setup.stdout + setup.stderr
        env.pop('JERMIQ_ADMIN_EMAIL'); env.pop('JERMIQ_ADMIN_PASSWORD')
        with open(Path(directory) / 'server.log', 'w+') as log:
            process = subprocess.Popen(run + ['--', '--urls', base], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
            client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            anonymous = urllib.request.build_opener()

            def request(path, value=None, method=None, token=None, opener=client, form=False):
                headers = {}
                body = None
                if value is not None:
                    headers['Content-Type'] = 'application/x-www-form-urlencoded' if form else 'application/json'
                    body = urllib.parse.urlencode(value).encode() if form else json.dumps(value).encode()
                if token:
                    headers['X-CSRF-TOKEN'] = token
                req = urllib.request.Request(base + path, body, headers, method=method)
                try:
                    response = opener.open(req, timeout=15)
                except urllib.error.HTTPError as error:
                    response = error
                return response.status, response.read()

            def data(path):
                status, body = request(path)
                assert status == 200, (path, status, body[:500])
                return json.loads(body)

            def csrf(page):
                return html.unescape(re.search(r'<meta name="csrf-token" content="([^"]+)"', page.decode()).group(1))

            slug = 'ariston-blu1-r-50-v'
            api = '/api/products/' + slug + '/reviews'
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
                status, page = request('/products/' + slug + '/reviews')
                check('Public review form renders', status == 200 and b'product-review-form' in page)
                token = csrf(page)
                check('No fabricated reviews seeded', data(api)['total'] == 0 and data(api)['averageRating'] is None)
                check('Anonymous moderation API denied', request('/api/admin/reviews', opener=anonymous)[0] == 401)
                payload = dict(requestId=str(uuid.uuid4()), name='<script>Reviewer', email='private-review@example.invalid',
                               rating=5, message='<b>Useful product review</b>', consent=True)
                check('Review submission requires CSRF', request(api, payload, 'POST')[0] == 400)
                invalid = dict(payload, rating=6)
                check('Rating outside range rejected', request(api, invalid, 'POST', token)[0] == 400)
                invalid = dict(payload, consent=False)
                check('Consent required', request(api, invalid, 'POST', token)[0] == 400)
                status, body = request(api, payload, 'POST', token)
                created = json.loads(body)
                check('Review is pending on creation', status == 201 and created['status'] == 'pending')
                check('Identical retry is idempotent', request(api, payload, 'POST', token)[0] == 200)
                check('Changed retry conflicts', request(api, dict(payload, message='Different review message'), 'POST', token)[0] == 409)
                check('Pending review is not public', data(api)['total'] == 0)
                check('Unknown product cannot receive reviews', request('/api/products/missing-product/reviews', dict(payload, requestId=str(uuid.uuid4())), 'POST', token)[0] == 404)

                _, login_page = request('/admin/login')
                login_token = html.unescape(re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', login_page.decode()).group(1))
                status, page = request('/admin/login', dict(Email=email, Password=password, ReturnUrl='/admin', __RequestVerificationToken=login_token), form=True)
                check('Isolated admin signs in', status == 200 and b'admin-app' in page)
                token = csrf(page)
                status, page = request('/admin/reviews')
                check('Moderation page renders', status == 200 and b'review-admin-app' in page)
                pending = data('/api/admin/reviews')['reviews']
                check('Admin sees pending review including private email', len(pending) == 1 and pending[0]['email'] == payload['email'])
                review = pending[0]
                path = '/api/admin/reviews/' + review['id']
                patch = dict(revision=review['revision'], status='approved')
                check('Moderation mutation requires CSRF', request(path, patch, 'PATCH')[0] == 400)
                check('Invalid moderation status rejected', request(path, dict(patch, status='invalid'), 'PATCH', token)[0] == 400)
                status, body = request(path, patch, 'PATCH', token)
                approved = json.loads(body)['review']
                check('Admin approves review', status == 200 and approved['status'] == 'approved' and approved['revision'] > review['revision'])
                check('Stale moderation update rejected', request(path, patch, 'PATCH', token)[0] == 409)
                public = data(api)
                check('Only approved reviews contribute to statistics', public['total'] == 1 and public['averageRating'] == 5)
                check('Public JSON does not disclose email or payload hash', 'email' not in public['reviews'][0] and 'payloadHash' not in public['reviews'][0] and payload['email'] not in json.dumps(public))
                _, page = request('/products/' + slug + '/reviews')
                text = page.decode()
                check('Review text is escaped in server HTML', '&lt;script&gt;Reviewer' in text and '&lt;b&gt;Useful product review&lt;/b&gt;' in text and '<script>Reviewer' not in text)
                check('Private email absent from public HTML', payload['email'] not in text)
                status, body = request(path, dict(revision=approved['revision'], status='rejected'), 'PATCH', token)
                check('Rejecting review removes it from public feed and stats', status == 200 and data(api)['total'] == 0 and data(api)['averageRating'] is None)
                check('Rejected status filter works', data('/api/admin/reviews?status=rejected')['total'] == 1 and data('/api/admin/reviews')['total'] == 0)
                product = next(x for x in data('/api/admin')['products'] if x['slug'] == slug)
                product['published'] = False
                check('Admin can unpublish reviewed product', request('/api/admin', dict(action='product', product=product), 'POST', token)[0] == 200)
                check('Hidden product reviews are not publicly accessible', request(api)[0] == 404 and request('/products/' + slug + '/reviews')[0] == 404)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill(); process.wait()
    print(f'{len(checks)} product review checks passed')
    for name in checks:
        print('  PASS ' + name)


if __name__ == '__main__':
    main()
