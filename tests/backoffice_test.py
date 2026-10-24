#!/usr/bin/env python3
"""Integration checks for three-language CMS and restricted office accounts.
Uses a temporary database and random test credentials, never the working database.
"""
import base64
import html
import http.cookiejar
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
from datetime import datetime, timedelta, timezone
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    checks = []
    with tempfile.TemporaryDirectory(prefix='jermiq-office-tests-') as temp:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        password = 'Qa!9' + uuid.uuid4().hex
        env = dict(os.environ, ASPNETCORE_ENVIRONMENT='Production', Persistence__DataDirectory=temp,
                   Seo__BaseUrl=base, Seo__IndexingEnabled='true', Security__RequireHttps='false',
                   JERMIQ_ADMIN_EMAIL='admin@example.invalid', JERMIQ_ADMIN_PASSWORD=password)
        command = ['dotnet', 'run', '--no-build', '--no-launch-profile', '-c', 'Release', '--project', str(ROOT / 'src/Jermiq.Web')]
        subprocess.run(command + ['--', '--create-admin'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True)
        del env['JERMIQ_ADMIN_EMAIL'], env['JERMIQ_ADMIN_PASSWORD']
        with open(Path(temp) / 'server.log', 'w+') as log:
            process = subprocess.Popen(command + ['--', '--urls', base], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
            admin = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            office = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            def request(path, data=None, token=None, client=admin, encoded=False):
                headers = {}
                if data is not None:
                    headers['Content-Type'] = 'application/x-www-form-urlencoded' if encoded else 'application/json'
                    data = data.encode() if encoded else json.dumps(data).encode()
                if token:
                    headers['X-CSRF-TOKEN'] = token
                try:
                    res = client.open(urllib.request.Request(base + path, data, headers), timeout=15)
                except urllib.error.HTTPError as err:
                    res = err
                return res.status, res.headers, res.read()
            def get(path, client=admin):
                status, _, body = request(path, client=client)
                assert status == 200, (path, status, body.decode()[:200])
                return json.loads(body)
            def check(name, condition):
                assert condition, name
                checks.append(name)
            def csrf(body):
                return html.unescape(re.search(r'<meta name="csrf-token" content="([^"]+)"', body.decode()).group(1))
            def login(client, email):
                _, _, page = request('/admin/login?lang=hy', client=client)
                token = html.unescape(re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', page.decode()).group(1))
                data = urllib.parse.urlencode(dict(Email=email, Password=password, ReturnUrl='/admin', __RequestVerificationToken=token))
                status, _, page = request('/admin/login', data, client=client, encoded=True)
                check('Login ' + email, status == 200 and b'id="admin-app"' in page)
                return csrf(page), page
            try:
                for _ in range(100):
                    try:
                        if request('/health')[0] == 200:
                            break
                    except OSError:
                        if process.poll() is not None:
                            log.seek(0)
                            raise AssertionError(log.read())
                        time.sleep(.2)
                else:
                    raise AssertionError('Server did not start')
                for language, phrase in [('hy', 'Ջրատաքացուցիչներ'), ('en', 'Water heaters'), ('ru', 'Водонагреватели')]:
                    status, headers, body = request('/?lang=' + language)
                    page = html.unescape(body.decode())
                    check('Localized homepage ' + language, status == 200 and f'lang="{language}"' in page and phrase in page and headers.get('Content-Language') == language)
                    check('Localized links ' + language, 'href="/catalog?lang=' + language + '"' in page)
                    catalog = get('/api/catalog?lang=' + language)['products']
                    check('Catalog localization ' + language, catalog[0]['title'] != '' and (language == 'hy' or 'Էլեկտրական' not in catalog[0]['title']))
                    for path in ['/catalog', '/parts', '/services', '/warranty', '/guide', '/contact', '/privacy', '/guide/choose-water-heater', '/products/electric-30']:
                        status, _, body = request(path + '?lang=' + language)
                        text = body.decode()
                        check(language + ' SSR ' + path, status == 200 and '<h1' in text and f'lang="{language}"' in text)
                    check('Translated cart/chooser dictionary ' + language, 'site-translations' in page and (language == 'hy' or phrase in page))
                sitemap = request('/sitemap.xml')[2].decode()
                check('Multilingual sitemap', '?lang=en' in sitemap and '?lang=ru' in sitemap)
                token, admin_page = login(admin, 'admin@example.invalid')
                check('Administrator CMS navigation', b'id="tab-users"' in admin_page and b'id="tab-translations"' in admin_page)
                cms = get('/api/admin/cms')
                check('Complete seeded translations', len(cms['texts']) > 450 and all(v.get('en') and v.get('ru') for v in cms['texts'].values()))
                check('CMS mutation CSRF', request('/api/admin/cms', {'revision': cms['revision'], 'texts': {}})[0] == 400)
                key = get('/api/admin/store-catalog')['home']['eyebrow']
                patch = {'revision': cms['revision'], 'texts': {key: {'hy': 'CMS հայերեն', 'en': 'CMS English <script>bad()</script>', 'ru': 'CMS русский'}}}
                check('CMS translations saved', request('/api/admin/cms', patch, token)[0] == 200)
                check('Stale CMS edit rejected', request('/api/admin/cms', patch, token)[0] == 409)
                _, _, page = request('/?lang=en')
                check('CMS copy rendered safely', 'CMS English &lt;script&gt;bad()&lt;/script&gt;' in page.decode() and '<script>bad()</script>' not in page.decode())
                cms = get('/api/admin/cms')
                article = dict(slug='office-guide', title='Office guide source', intro='Intro source', sections=[['Section source', 'Body source']])
                texts = {s: {'hy': s, 'en': 'English ' + s, 'ru': 'Русский ' + s} for s in ['Office guide source', 'Intro source', 'Section source', 'Body source']}
                check('Article created with translations', request('/api/admin/cms', {'revision': cms['revision'], 'articles': cms['articles'] + [article], 'texts': texts}, token)[0] == 200)
                check('CMS article rendered', b'English Body source' in request('/guide/office-guide?lang=en')[2])
                check('New article in sitemap', b'/guide/office-guide?lang=ru' in request('/sitemap.xml')[2])
                uploaded = next(p for p in get('/api/admin')['products'] if p['slug'] == 'thermex-anode-900017')
                check('Uploaded part is editable with its illustration and preliminary code', uploaded['demo'] and uploaded['price'] is None and uploaded['specs']['Պահեստամասի կոդ'] == '900 017' and uploaded['image'].startswith('/api/product-image?id='))
                uploaded.update(description='Administrator reviewed description', model='ADMIN-MODEL-123')
                check('Administrator can edit uploaded part', request('/api/admin', {'action': 'product', 'product': uploaded}, token)[0] == 200)
                updated = next(p for p in get('/api/admin')['products'] if p['slug'] == uploaded['slug'])
                check('Uploaded part edits persist without changing code or image', updated['model'] == 'ADMIN-MODEL-123' and updated['description'] == uploaded['description'] and updated['specs'] == uploaded['specs'] and updated['image'] == uploaded['image'])
                product = get('/api/admin')['products'][0]
                product.update(brand='ARISTON', model='PRO1 R 80 V', specs={'Power': '1800 W', 'Code': 'ABC-123'})
                check('Technical product saved', request('/api/admin', {'action': 'product', 'product': product}, token)[0] == 200)
                for language in ['en', 'ru']:
                    localized = next(p for p in get('/api/catalog?lang=' + language)['products'] if p['slug'] == product['slug'])
                    check('Model and specifications preserved ' + language, localized['model'] == product['model'] and localized['brand'] == product['brand'] and localized['specs'] == product['specs'])
                user = {'email': 'office@example.invalid', 'password': password, 'role': 'Office', 'disabled': False}
                check('Office account created', request('/api/admin/users', user, token)[0] == 200)
                office_token, office_page = login(office, user['email'])
                check('Office navigation restricted', b'id="tab-users"' not in office_page and b'id="tab-products"' not in office_page)
                for path in ['/api/admin/cms', '/api/admin/users']:
                    check('Office cannot access ' + path, request(path, client=office)[0] == 403)
                check('Office cannot change products', request('/api/admin', {'action': 'product', 'product': product}, office_token, office)[0] == 403)
                staff = get('/api/admin/leads', office)['staff']
                assignee = next(x['id'] for x in staff if x['name'] == user['email'])
                edit = dict(id=str(uuid.uuid4()), revision=0, kind='custom-repair', name='Office customer', phone='+374 99 123456', email='client@example.invalid', message='Reported by phone', subject='Urgent repair', brand='ARISTON', model='PRO1 R 80 V', selection='Heating fault', address='Yerevan', note='Call customer tomorrow', source='phone', priority='urgent', status='in_progress', assignee=assignee, dueAt='2027-01-01T10:00:00Z')
                check('Office write requires CSRF', request('/api/admin/lead', edit, client=office)[0] == 400)
                arrival_baseline = get('/api/admin/arrivals', office)
                check('Arrival baseline skips historical requests', arrival_baseline['ids'] == [])
                check('Custom office request created', request('/api/admin/lead', edit, office_token, office)[0] == 201)
                arrivals = get('/api/admin/arrivals?after=' + str(arrival_baseline['cursor']), office)
                check('Office creation emits one durable arrival', arrivals['ids'] == [edit['id']] and arrivals['cursor'] > arrival_baseline['cursor'])
                saved = get('/api/admin/lead/' + edit['id'], office)
                check('Office fields and internal note persisted', saved['office']['priority'] == 'urgent' and saved['office']['assignee'] == assignee and saved['office']['notes'][0]['text'] == edit['note'] and len(saved['office']['history']) == 1)
                check('Duplicate/stale create rejected', request('/api/admin/lead', edit, office_token, office)[0] == 409)
                edit.update(revision=saved['office']['revision'], status='completed', note='Repair completed')
                check('Office request edited', request('/api/admin/lead', edit, office_token, office)[0] == 200)
                check('Edits do not emit new arrival alerts', get('/api/admin/arrivals?after=' + str(arrivals['cursor']), office)['ids'] == [])
                check('Stale office edit rejected', request('/api/admin/lead', edit, office_token, office)[0] == 409)
                saved = get('/api/admin/lead/' + edit['id'], office)
                check('Audit and note history retained', len(saved['office']['history']) == 2 and len(saved['office']['notes']) == 2)
                check('Audit records field changes', 'Status' in saved['office']['history'][-1]['changes'])
                png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR5kAAAAASUVORK5CYII=')
                boundary = 'office-' + uuid.uuid4().hex
                def upload(revision, photo='1'):
                    parts = []
                    for key, value in [('id', edit['id']), ('revision', str(revision)), ('photo', photo)]:
                        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
                    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + png + b'\r\n')
                    parts.append(f'--{boundary}--\r\n'.encode())
                    req = urllib.request.Request(base + '/api/admin/lead-attachment', b''.join(parts), {'Content-Type': 'multipart/form-data; boundary=' + boundary, 'X-CSRF-TOKEN': office_token})
                    try:
                        response = office.open(req)
                    except urllib.error.HTTPError as err:
                        response = err
                    return response.status
                check('Office attachment saved', upload(saved['office']['revision']) == 200)
                check('Stale office attachment rejected', upload(saved['office']['revision']) == 409)
                check('Office attachment downloads correctly', request('/api/attachments?id=' + edit['id'], client=office)[2] == png)
                saved = get('/api/admin/lead/' + edit['id'], office)

                preview = request('/api/attachments?id=' + edit['id'] + '&preview=true', client=office)
                check('Authorized image preview uses inline display and private no-store',
                      preview[0] == 200 and preview[2] == png and preview[1].get('Content-Disposition') == 'inline'
                      and 'no-store' in preview[1].get('Cache-Control', '') and preview[1]['Content-Type'] == 'image/png')
                check('Default attachment remains a download',
                      'attachment;' in request('/api/attachments?id=' + edit['id'], client=office)[1].get('Content-Disposition', ''))
                check('Invalid photo slot does not expose another image',
                      request('/api/attachments?id=' + edit['id'] + '&photo=3&preview=true', client=office)[0] == 404)
                # Existing unknown structured context must survive photo changes and office edits.
                with sqlite3.connect(Path(temp) / 'jermiq.db') as db:
                    details = json.loads(db.execute('SELECT Details FROM Leads WHERE Id = ?', (edit['id'],)).fetchone()[0])
                    details['finderContext'] = {'modelId': 'qa-preserved-model', 'source': 'photo'}
                    db.execute('UPDATE Leads SET Details = ? WHERE Id = ?', (json.dumps(details), edit['id']))
                check('Technical-label photo uploads independently', upload(saved['office']['revision'], '2') == 200)
                labeled = get('/api/admin/lead/' + edit['id'], office)
                check('Second image preserves the main image and structured context',
                      labeled['lead']['attachment'] == saved['lead']['attachment'] and
                      json.loads(labeled['lead']['details'])['finderContext']['modelId'] == 'qa-preserved-model' and
                      request('/api/attachments?id=' + edit['id'] + '&photo=2&preview=true', client=office)[2] == png)
                check('Invalid photo upload slot is rejected before mutation', upload(labeled['office']['revision'], '3') == 400)
                check('Stale second-photo replacement leaves existing photos intact',
                      upload(saved['office']['revision'], '2') == 409 and
                      get('/api/admin/lead/' + edit['id'], office)['office']['revision'] == labeled['office']['revision'])
                preserve_edit = {**edit, 'revision': labeled['office']['revision'], 'note': ''}
                check('Editing a request preserves both photos and unknown context',
                      request('/api/admin/lead', preserve_edit, office_token, office)[0] == 200 and
                      json.loads(get('/api/admin/lead/' + edit['id'], office)['lead']['details'])['finderContext'] == details['finderContext'] and
                      request('/api/attachments?id=' + edit['id'] + '&photo=2', client=office)[2] == png)
                saved = get('/api/admin/lead/' + edit['id'], office)

                filtered = get('/api/admin/leads?q=Office%20customer&status=completed&kind=custom-repair', office)
                check('Office search ignores ASCII case', get('/api/admin/leads?q=office%20CUSTOMER', office)['total'] == 1)
                check('Office search and filters', filtered['total'] == 1 and filtered['leads'][0]['lead']['id'] == edit['id'])
                invalid = {**edit, 'revision': saved['office']['revision'], 'kind': '<script>'}
                check('Unsafe custom request type rejected', request('/api/admin/lead', invalid, office_token, office)[0] == 400)
                invalid = {**edit, 'revision': saved['office']['revision'], 'assignee': 'missing-user'}
                check('Unknown assignee rejected', request('/api/admin/lead', invalid, office_token, office)[0] == 400)
                deadline = {**edit, 'id':str(uuid.uuid4()), 'revision':0, 'name':'ԱՐԱՄ ԹԵՍՏ', 'subject':'ՊԱՀԵՍՏԱՄԱՍԻ ՍՊԱՍԱՐԿՈՒՄ', 'message':'Deadline customer request', 'status':'in_progress', 'source':'office', 'dueAt':'2001-01-01T10:00:00Z', 'note':''}
                check('Deadline request created', request('/api/admin/lead', deadline, office_token, office)[0] == 201)
                summary = get('/api/admin/dashboard', office)
                check('Office overview has real counts and hides catalog administration', summary['urgent'] >= 1 and summary['overdue'] >= 1 and summary['active'] >= 1 and summary['catalog'] is None)
                check('Admin overview has catalog readiness', get('/api/admin/dashboard')['catalog']['total'] == 55)
                advanced = get('/api/admin/leads?q=Deadline&priority=urgent&source=office&assignee=' + assignee + '&due=overdue', office)
                unicode_search = get('/api/admin/leads?q=' + urllib.parse.quote('արամ'), office)
                check('Armenian name search is case insensitive', unicode_search['total'] == 1 and unicode_search['leads'][0]['lead']['id'] == deadline['id'])
                check('Armenian subject search decodes stored JSON', get('/api/admin/leads?q=' + urllib.parse.quote('պահեստամասի'), office)['total'] == 1)
                check('Advanced request filters combine', advanced['total'] == 1 and advanced['leads'][0]['lead']['id'] == deadline['id'])
                check('Advanced request filters exclude mismatches', get('/api/admin/leads?q=Deadline&priority=low', office)['total'] == 0)
                first = get('/api/admin/lead/' + edit['id'], office)
                second = get('/api/admin/lead/' + deadline['id'], office)
                batch = {'status':'waiting', 'revisions':{edit['id']:first['office']['revision'],deadline['id']:second['office']['revision']}}
                check('Bulk status requires CSRF', request('/api/admin/leads/bulk-status', batch, client=office)[0] == 400)
                stale = {**batch, 'revisions':{edit['id']:0,deadline['id']:second['office']['revision']}}
                check('Stale bulk status rejected atomically', request('/api/admin/leads/bulk-status', stale, office_token, office)[0] == 409 and get('/api/admin/lead/' + deadline['id'], office)['lead']['status'] == 'in_progress')
                check('Bulk status updates selected requests', request('/api/admin/leads/bulk-status', batch, office_token, office)[0] == 200 and get('/api/admin/lead/' + deadline['id'], office)['lead']['status'] == 'waiting')
                check('Bulk status is recorded in history', get('/api/admin/lead/' + deadline['id'], office)['office']['history'][-1]['action'] == 'Bulk status update')

                today = datetime.now(timezone(timedelta(hours=4))).date()
                fixture_ids = []
                for i, (priority, due, assigned) in enumerate([
                    ('urgent', str(today) + 'T10:00:00+04:00', assignee),
                    ('normal', '2001-01-01T12:00:00+04:00', ''),
                    ('high', str(today + timedelta(days=2)) + 'T15:00:00+04:00', '')]):
                    fixture = {**edit, 'id': str(uuid.uuid4()), 'revision': 0, 'name': f'Desk queue fixture {i}', 'note': '',
                               'priority': priority, 'dueAt': due, 'assignee': assigned, 'status': 'in_progress'}
                    check('Queue fixture created ' + str(i), request('/api/admin/lead', fixture, office_token, office)[0] == 201)
                    fixture_ids.append(fixture['id'])
                fixture_query = '/api/admin/leads?q=Desk%20queue%20fixture'
                check('Priority ordering happens before server pagination',
                      [x['lead']['id'] for x in get(fixture_query + '&sort=priority', office)['leads']] == [fixture_ids[i] for i in [0, 2, 1]])
                check('Deadline ordering uses real dates',
                      [x['lead']['id'] for x in get(fixture_query + '&sort=due', office)['leads']] == [fixture_ids[i] for i in [1, 0, 2]])
                mine = get(fixture_query + '&view=mine', office)
                check('My queue uses the authenticated employee identity', mine['viewerId'] == assignee and [x['lead']['id'] for x in mine['leads']] == fixture_ids[:1])
                check('Mine is not impersonated by assignee query input', get(fixture_query + '&view=mine')['total'] == 0)
                check('Unassigned queue includes only active unassigned requests',
                      {x['lead']['id'] for x in get(fixture_query + '&view=unassigned', office)['leads']} == set(fixture_ids[1:]))
                check('Due-today filter follows the Yerevan day',
                      [x['lead']['id'] for x in get(fixture_query + '&due=today', office)['leads']] == fixture_ids[:1])
                check('Upcoming deadlines exclude today and overdue requests',
                      [x['lead']['id'] for x in get(fixture_query + '&due=upcoming', office)['leads']] == fixture_ids[2:])
                check('Photo filter finds either protected image',
                      edit['id'] in {x['lead']['id'] for x in get('/api/admin/leads?photos=with', office)['leads']}
                      and edit['id'] not in {x['lead']['id'] for x in get('/api/admin/leads?photos=without', office)['leads']})
                check('Date range includes both bounds in local calendar days',
                      get(fixture_query + '&dateFrom=' + str(today) + '&dateTo=' + str(today), office)['total'] == 3)
                check('Future received-date filter excludes existing requests', get(fixture_query + '&dateFrom=2100-01-01', office)['total'] == 0)
                check('Extreme calendar bounds remain safe', get(fixture_query + '&dateFrom=0001-01-01&dateTo=9999-12-31', office)['total'] == 3)
                first = get('/api/admin/lead/' + fixture_ids[0], office)
                second = get('/api/admin/lead/' + fixture_ids[1], office)
                workflow = {'revisions': {fixture_ids[0]: first['office']['revision'], fixture_ids[1]: second['office']['revision']},
                            'priority': 'high', 'assignee': assignee, 'status': 'contacted'}
                check('Bulk workflow requires CSRF', request('/api/admin/leads/bulk-workflow', workflow, client=office)[0] == 400)
                stale = {**workflow, 'revisions': {fixture_ids[0]: 0, fixture_ids[1]: second['office']['revision']}}
                check('Bulk workflow conflict is atomic', request('/api/admin/leads/bulk-workflow', stale, office_token, office)[0] == 409 and
                      get('/api/admin/lead/' + fixture_ids[1], office)['office']['priority'] == 'normal')
                check('Unknown employee cannot be assigned in bulk', request('/api/admin/leads/bulk-workflow', {**workflow, 'assignee': 'unknown'}, office_token, office)[0] == 400)
                check('Empty bulk changes cannot be applied', request('/api/admin/leads/bulk-workflow', {'revisions': workflow['revisions']}, office_token, office)[0] == 400)
                check('Bulk workflow updates status, priority and employee together', request('/api/admin/leads/bulk-workflow', workflow, office_token, office)[0] == 200)
                updated = get('/api/admin/lead/' + fixture_ids[1], office)
                check('Bulk workflow preserves a descriptive audit trail', updated['lead']['status'] == 'contacted' and updated['office']['priority'] == 'high' and
                      updated['office']['assignee'] == assignee and updated['office']['history'][-1]['action'] == 'Bulk workflow update' and
                      set(updated['office']['history'][-1]['changes']) == {'Status', 'Priority', 'Assignee'})
                current_product = next(p for p in get('/api/admin')['products'] if p['slug'] == product['slug'])
                check('Stale product update rejected', request('/api/admin', {'action':'product','product':product}, token)[0] == 409 and current_product['revision'] > product['revision'])

                export = request('/api/admin/export?q=Office%20customer', client=office)
                check('Office CSV export', export[0] == 200 and 'text/csv' in export[1]['Content-Type'] and 'Office customer' in export[2].decode())
                # Exercise more than the old hard-coded 100-row limit using real requests.
                for i in range(102):
                    entry = {**edit, 'id': str(uuid.uuid4()), 'revision': 0, 'name': f'Paged customer {i}', 'note': '', 'assignee': '', 'dueAt': None}
                    assert request('/api/admin/lead', entry, office_token, office)[0] == 201
                page = get('/api/admin/leads?q=Paged%20customer&page=5', office)
                check('Pagination reaches records beyond 100', page['total'] == 102 and page['page'] == 5 and len(page['leads']) == 2)
                account = next(u for u in get('/api/admin/users')['users'] if u['email'] == user['email'])
                check('Office account disabled', request('/api/admin/users', {**account, 'password': '', 'disabled': True}, token)[0] == 200)
                check('Existing disabled session rejected immediately', request('/api/admin/leads', client=office)[0] == 401)
                check('Disabled session cannot preview request photos', request('/api/attachments?id=' + edit['id'] + '&preview=true', client=office)[0] == 401)
                own = next(u for u in get('/api/admin/users')['users'] if u['email'] == 'admin@example.invalid')
                check('Self administrator removal prevented', request('/api/admin/users', {**own, 'password': '', 'role': 'Office'}, token)[0] == 400)
                anon = urllib.request.build_opener()
                check('Anonymous office access blocked', request('/api/admin/leads', client=anon)[0] == 401)
                check('Anonymous dashboard blocked', request('/api/admin/dashboard', client=anon)[0] == 401)
                check('Anonymous bulk changes blocked', request('/api/admin/leads/bulk-status', {'status':'new','revisions':{}}, client=anon)[0] == 401)
                check('Anonymous arrival feed blocked', request('/api/admin/arrivals', client=anon)[0] == 401)
                check('Anonymous photo preview blocked', request('/api/attachments?id=' + edit['id'] + '&photo=2&preview=true', client=anon)[0] == 401)
                check('Anonymous workflow changes blocked', request('/api/admin/leads/bulk-workflow', workflow, client=anon)[0] == 401)
                check('Anonymous CMS access blocked', request('/api/admin/cms', client=anon)[0] == 401)
                if os.environ.get('JERMIQ_BROWSER_TESTS') == '1':
                    jar = next(h.cookiejar for h in admin.handlers if hasattr(h, 'cookiejar'))
                    cookie = '; '.join(f'{item.name}={item.value}' for item in jar)
                    subprocess.run(['node', str(ROOT / 'tests/backoffice_browser_test.cjs')], input=json.dumps({'baseUrl': base, 'cookie': cookie}), text=True, check=True)
                if os.environ.get('JERMIQ_FRONTEND_TESTS') == '1':
                    jar = next(h.cookiejar for h in admin.handlers if hasattr(h, 'cookiejar'))
                    cookie = '; '.join(f'{item.name}={item.value}' for item in jar)
                    subprocess.run(['node', str(ROOT / 'tests/backoffice_frontend_test.mjs')], input=json.dumps({'baseUrl': base, 'cookie': cookie}), text=True, check=True)
                print(json.dumps({'passed': len(checks), 'checks': checks}, ensure_ascii=False, indent=2))
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == '__main__':
    main()
