#!/usr/bin/env python3
"""Customer information, pricing and editor checks in a disposable SQLite store.

Build Release first. --frontend also exercises the real admin editor with jsdom.
No production account, database or published terms are changed by these tests.
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
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
PAGE_IDS = {'delivery', 'payment', 'returns', 'warranty', 'terms', 'privacy', 'about', 'ordering'}


class MainContent(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.text = []
        self.elements = []
        self.headings = 0

    def handle_starttag(self, tag, attrs):
        if tag == 'main':
            self.active = True
        if self.active:
            self.elements.append((tag, dict(attrs)))
            if tag == 'h1':
                self.headings += 1

    def handle_endtag(self, tag):
        if tag == 'main':
            self.active = False

    def handle_data(self, text):
        if self.active:
            self.text.append(text)

    @property
    def copy(self):
        return ' '.join(self.text)


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

    with tempfile.TemporaryDirectory(prefix='jermiq-information-tests-') as directory:
        with socket.socket() as endpoint:
            endpoint.bind(('127.0.0.1', 0))
            base = 'http://127.0.0.1:' + str(endpoint.getsockname()[1])
        email = 'information-test@example.invalid'
        password = 'Information!8' + uuid.uuid4().hex
        env = dict(os.environ, ASPNETCORE_ENVIRONMENT='Production',
                   Persistence__DataDirectory=directory, Seo__BaseUrl=base,
                   Seo__IndexingEnabled='true', Security__RequireHttps='false',
                   JERMIQ_ADMIN_EMAIL=email, JERMIQ_ADMIN_PASSWORD=password)
        command = [args.dotnet, 'run', '--no-build', '--no-launch-profile', '-c', args.configuration,
                   '--project', str(ROOT / 'src/Jermiq.Web')]
        setup = subprocess.run(command + ['--', '--create-admin'], cwd=ROOT, env=env,
                               capture_output=True, text=True)
        assert setup.returncode == 0, setup.stdout + setup.stderr
        del env['JERMIQ_ADMIN_EMAIL'], env['JERMIQ_ADMIN_PASSWORD']

        # Simulate an existing store whose saved JSON predates Information. Its
        # custom homepage/payment copy must survive application startup and GETs.
        database = Path(directory) / 'jermiq.db'
        with sqlite3.connect(database) as db:
            legacy = json.loads(db.execute('SELECT Value FROM Settings WHERE Key = ?',
                                          ('store-catalog',)).fetchone()[0])
            legacy.pop('information', None)
            legacy['home']['title'] = 'QA existing store title'
            legacy['paymentText'] = 'QA existing payment agreement'
            legacy['home']['eyebrow'] = 'Jermiq · QA existing choice'
            legacy['aboutText'] = 'Ջերմիք՝ QA existing store description'
            db.execute('UPDATE Settings SET Value = ? WHERE Key = ?',
                       (json.dumps(legacy, ensure_ascii=False), 'store-catalog'))
            cms = dict(texts={'Ջերմիքի մասին': {
                'hy': 'QA Ջերմիքի մասին', 'en': 'QA About Jermiq', 'ru': 'QA О Jermiq'}},
                services=json.loads((ROOT / 'src/Jermiq.Web/SeedData/services.json').read_text()),
                articles=json.loads((ROOT / 'src/Jermiq.Web/SeedData/articles.json').read_text()), revision=7)
            db.execute('INSERT OR REPLACE INTO Settings (Key, Value) VALUES (?, ?)',
                       ('cms', json.dumps(cms, ensure_ascii=False)))

        with open(Path(directory) / 'server.log', 'w+') as log:
            process = subprocess.Popen(command + ['--', '--urls', base], cwd=ROOT, env=env,
                                       stdout=log, stderr=subprocess.STDOUT)
            jar = http.cookiejar.CookieJar()
            client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
            anonymous = urllib.request.build_opener()

            def request(route, value=None, token=None, method=None, opener=client):
                headers = {}
                if token:
                    headers['X-CSRF-TOKEN'] = token
                if value is not None:
                    headers['Content-Type'] = 'application/json'
                    value = json.dumps(value).encode()
                req = urllib.request.Request(base + route, value, headers, method=method)
                try:
                    response = opener.open(req, timeout=15)
                except urllib.error.HTTPError as error:
                    response = error
                return response.status, response.headers, response.read()

            def data(route):
                status, _, body = request(route)
                assert status == 200, (route, status, body[:1000])
                return json.loads(body)

            def page(route):
                status, _, body = request(route)
                assert status == 200, (route, status, body[:1000])
                text = body.decode()
                parsed = MainContent()
                parsed.feed(text)
                return text, parsed

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
                    raise AssertionError('Information test server did not start')

                public = data('/api/store-catalog?lang=hy')
                check('Old saved configuration receives all eight information defaults',
                      {p['id'] for p in public['information']['pages']} == PAGE_IDS)
                check('Old saved homepage and payment copy are preserved',
                      public['home']['title'] == legacy['home']['title'] and
                      public['paymentText'] == legacy['paymentText'])
                check('Existing store copy adopts the new brand without dropping custom wording',
                      public['home']['eyebrow'] == 'TERMOMASTER · QA existing choice' and
                      public['aboutText'] == 'TERMOMASTER՝ QA existing store description')
                with sqlite3.connect(database) as db:
                    stored = json.loads(db.execute('SELECT Value FROM Settings WHERE Key = ?',
                                                   ('store-catalog',)).fetchone()[0])
                check('Reading default information does not overwrite old saved JSON',
                      'information' not in stored and stored['home']['title'] == legacy['home']['title'])
                check('Rebranding preserves the persisted legacy snapshot until its owner saves',
                      stored['home']['eyebrow'] == legacy['home']['eyebrow'] and
                      stored['aboutText'] == legacy['aboutText'])
                rates = public['information']['deliveryOptions']
                homepage, _ = page('/?lang=hy')
                check('Public metadata and accessible brand use TERMOMASTER',
                      'content="TERMOMASTER"' in homepage and
                      'termomaster-mark.png' in homepage and 'termomaster-social.png' in homepage and
                      'TERMO</span><span class="brand-master">MASTER' in homepage)
                client_texts = json.loads(re.search(
                    r'<script type="application/json" id="site-translations">(.*?)</script>',
                    homepage, re.S).group(1))
                check('Long information prose is not downloaded again in every page UI dictionary',
                      all(p['intro'] not in client_texts and
                          all(s['body'] not in client_texts for s in p['sections']) and
                          all(f['answer'] not in client_texts for f in p['faqs'])
                          for p in public['information']['pages']) and
                      'Բեռնվում է…' in client_texts)
                check('Editable orientation rates include free pickup and delivery from 1500 and 3000 AMD',
                      any(x['price'] == 0 for x in rates) and
                      {1500, 3000} <= {x['price'] for x in rates if x['priceIsFrom']})

                for page_id in sorted(PAGE_IDS):
                    text, parsed = page('/' + page_id + '?lang=hy')
                    intro = next(p for p in public['information']['pages'] if p['id'] == page_id)['intro']
                    check('Substantial server-rendered customer information /' + page_id,
                          parsed.headings == 1 and intro in parsed.copy and len(parsed.copy) > 800)

                for language in ['en', 'ru']:
                    localized = data('/api/store-catalog?lang=' + language)['information']['pages']
                    for page_id in sorted(PAGE_IDS):
                        intro = next(p for p in localized if p['id'] == page_id)['intro']
                        original = next(p for p in public['information']['pages'] if p['id'] == page_id)['intro']
                        text, parsed = page('/' + page_id + '?lang=' + language)
                        check('Information copy and document language /' + page_id + ' ' + language,
                              intro != original and intro in parsed.copy and f'lang="{language}"' in text)

                login_page = request('/admin/login?lang=hy')[2].decode()
                login_token = html.unescape(re.search(
                    r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', login_page).group(1))
                login = urllib.parse.urlencode(dict(Email=email, Password=password,
                    ReturnUrl='/admin', __RequestVerificationToken=login_token)).encode()
                response = client.open(urllib.request.Request(base + '/admin/login', login,
                    {'Content-Type': 'application/x-www-form-urlencoded'}), timeout=15)
                login_result = response.read().decode()
                check('Isolated information administrator signs in', response.status == 200 and 'id="admin-app"' in login_result)
                token = html.unescape(re.search(r'<meta name="csrf-token" content="([^"]+)"', login_result).group(1))
                saved_cms = data('/api/admin/cms')
                check('Legacy CMS translation keys and customized values adopt current branding',
                      'Ջերմիքի մասին' not in saved_cms['texts'] and
                      saved_cms['texts']['TERMOMASTER-ի մասին']['en'] == 'QA About TERMOMASTER' and
                      saved_cms['texts']['TERMOMASTER-ի մասին']['hy'] == 'QA TERMOMASTER-ի մասին' and
                      saved_cms['revision'] == 7)
                check('Anonymous information mutation remains denied',
                      request('/api/admin/store-catalog', public, token, 'PUT', opener=anonymous)[0] in (400, 401))
                config = data('/api/admin/store-catalog')
                check('Authenticated editor receives fallback pages without losing legacy data',
                      {p['id'] for p in config['information']['pages']} == PAGE_IDS and
                      config['home']['title'] == legacy['home']['title'])

                edited = copy.deepcopy(config)
                delivery = next(p for p in edited['information']['pages'] if p['id'] == 'delivery')
                delivery['sections'].append(dict(title='QA custom section <script>',
                    body='QA body <img src=x onerror=alert(1)>\n\nQA second paragraph'))
                delivery['faqs'].append(dict(question='QA question <img src=x onerror=alert(1)>',
                    answer='QA answer <script>alert(1)</script>'))
                edited['information']['deliveryOptions'].extend([
                    dict(id='qa-delivery-visible', title='QA visible delivery', price=1555.5,
                         priceIsFrom=True, freeFrom=50000, priceNote='QA fee condition',
                         timeframe='QA agreed timeframe', details='QA visible instructions', published=True),
                    dict(id='qa-delivery-hidden', title='QA private delivery option', price=None,
                         priceIsFrom=False, freeFrom=None, priceNote='', timeframe='',
                         details='QA private delivery details', published=False)
                ])
                status, _, response = request('/api/admin/store-catalog', edited, token, 'PUT')
                saved = json.loads(response)
                check('Structured information and decimal fees save with a new revision',
                      status == 200 and saved['revision'] > config['revision'])
                check('Concurrent stale information save is rejected',
                      request('/api/admin/store-catalog', edited, token, 'PUT')[0] == 409)
                config = data('/api/admin/store-catalog')
                public = data('/api/store-catalog?lang=hy')
                public_rates = public['information']['deliveryOptions']
                check('Private delivery options stay in admin and never reach public API',
                      any(r['id'] == 'qa-delivery-hidden' for r in config['information']['deliveryOptions']) and
                      not any(r['id'] == 'qa-delivery-hidden' for r in public_rates))
                text, parsed = page('/delivery?lang=hy')
                check('Saved sections and FAQs render as text without executable markup',
                      'QA body <img src=x onerror=alert(1)>' in parsed.copy and
                      'QA answer <script>alert(1)</script>' in parsed.copy and
                      not any(tag == 'script' or attrs.get('onerror') for tag, attrs in parsed.elements))
                check('Public delivery page reflects saved fees, conditions and publication',
                      all(s in parsed.copy for s in ['QA visible delivery', 'QA fee condition', 'QA visible instructions']) and
                      'QA private delivery option' not in text)

                old_client = copy.deepcopy(config)
                expected_information = old_client.pop('information')
                old_client['aboutText'] = 'QA changed by older compatible admin client'
                check('Older clients can save other content while omitting new information',
                      request('/api/admin/store-catalog', old_client, token, 'PUT')[0] == 200)
                config = data('/api/admin/store-catalog')
                check('Older client save preserves every customized information field',
                      config['information'] == expected_information and
                      config['aboutText'] == old_client['aboutText'])

                invalid_cases = [
                    ('Missing required information page', lambda i: i['pages'].pop()),
                    ('Duplicate information page identifiers', lambda i: i['pages'].__setitem__(0, copy.deepcopy(i['pages'][1]))),
                    ('Null page collection', lambda i: i.__setitem__('pages', None)),
                    ('Null section entry', lambda i: i['pages'][0]['sections'].append(None)),
                    ('Oversized section copy', lambda i: i['pages'][0]['sections'][0].__setitem__('body', 'x' * 6001)),
                    ('Missing FAQ answer', lambda i: i['pages'][0]['faqs'].append(dict(question='Question', answer=''))),
                    ('Negative delivery fee', lambda i: i['deliveryOptions'][0].__setitem__('price', -1)),
                    ('Negative free delivery threshold', lambda i: i['deliveryOptions'][0].__setitem__('freeFrom', -1)),
                    ('Unsafe delivery option identifier', lambda i: i['deliveryOptions'][0].__setitem__('id', '../outside')),
                    ('Duplicate delivery option identifiers', lambda i: i['deliveryOptions'].append(copy.deepcopy(i['deliveryOptions'][0]))),
                    ('Null delivery option entry', lambda i: i['deliveryOptions'].append(None))
                ]
                for name, mutate in invalid_cases:
                    invalid = copy.deepcopy(config)
                    mutate(invalid['information'])
                    check(name + ' rejected without modifying saved copy',
                          request('/api/admin/store-catalog', invalid, token, 'PUT')[0] == 400)
                check('Rejected changes leave saved information revision and content intact',
                      data('/api/admin/store-catalog') == config)

                if args.frontend:
                    frontend = subprocess.run([args.node, str(ROOT / 'tests/store_information_frontend_test.mjs')],
                        input=json.dumps(dict(baseUrl=base, cookie='; '.join(f'{c.name}={c.value}' for c in jar))),
                        text=True, capture_output=True, cwd=ROOT)
                    assert frontend.returncode == 0, frontend.stdout + frontend.stderr
                    print(frontend.stdout.strip())
                    check('Information admin workflows run against the real protected API', True)
                print(f'PASS: {len(checks)} customer information HTTP checks')
                for name in checks:
                    print(' - ' + name)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == '__main__':
    main()
