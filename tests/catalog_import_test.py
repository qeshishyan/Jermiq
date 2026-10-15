#!/usr/bin/env python3
"""Exercise the uploaded catalog import with a disposable database and real HTTP."""
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
KEY = 'catalog-import:uploaded-spare-parts-35:v1'
bundle = json.loads((ROOT / 'src/Jermiq.Web/SeedData/Imports/uploaded-spare-parts-35/products.json').read_text())
checks = 0


def check(condition, name):
    global checks
    assert condition, name
    checks += 1


with tempfile.TemporaryDirectory(prefix='jermiq-catalog-import-') as temp:
    env = dict(os.environ, Persistence__DataDirectory=temp, ASPNETCORE_ENVIRONMENT='Development')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        base = f'http://127.0.0.1:{sock.getsockname()[1]}'
    command = ['dotnet', 'run', '--no-build', '--no-launch-profile', '-c', 'Release',
               '--project', str(ROOT / 'src/Jermiq.Web'), '--', '--urls', base]

    def start():
        log = open(Path(temp) / 'server.log', 'w+')
        process = subprocess.Popen(command, env=env, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        for _ in range(100):
            if process.poll() is not None:
                log.seek(0)
                raise AssertionError(log.read())
            try:
                if urllib.request.urlopen(base + '/health', timeout=2).status == 200:
                    return process, log
            except OSError:
                time.sleep(.1)
        process.terminate()
        process.wait(timeout=10)
        raise AssertionError('Server did not start')

    def stop(process, log):
        process.terminate()
        process.wait(timeout=10)
        log.close()

    def catalog(lang='hy'):
        return json.load(urllib.request.urlopen(base + '/api/catalog?lang=' + lang))['products']

    process, log = start()
    try:
        products = catalog()
        imported = [p for p in products if p['slug'] in {p['slug'] for p in bundle}]
        check(len(products) == 55 and len(imported) == 35, 'Fresh database has original 10, uploaded 35 and real 10')
        check({p['brand'] for p in imported} == {'Thermex', 'Ariston', 'Electrolux', 'Shivaki', 'Ballu'}, 'All five uploaded brands')
        check(all(p['demo'] and p['price'] is None for p in imported), 'Unverified entries stay illustrative and unpriced')
        for product in imported:
            response = urllib.request.urlopen(base + product['image'])
            check(response.headers['Content-Type'] == 'image/png' and response.read().startswith(b'\x89PNG\r\n\x1a\n'), 'Matched local illustration: ' + product['slug'])
        for lang, phrase in [('en', 'Preliminary catalog entry'), ('ru', 'Предварительная запись каталога')]:
            localized = [p for p in catalog(lang) if p['slug'] in {p['slug'] for p in bundle}]
            check(all(phrase in p['description'] for p in localized), 'All descriptions translated: ' + lang)
            check(next(p for p in localized if p['slug'] == 'thermex-anode-900017')['specs']['Պահեստամասի կոդ'] == '900 017', 'Code preserved: ' + lang)
        page = urllib.request.urlopen(base + '/parts').read().decode()
        check(all(f'<option value="{brand}">' in page for brand in ['Ariston', 'Thermex', 'Electrolux', 'Shivaki', 'Ballu']), 'All five brands filterable')
    finally:
        stop(process, log)

    # Simulate an existing office database with prior product edits and a coded
    # product under an administrator-selected slug, before this import ran.
    database = Path(temp) / 'jermiq.db'
    with sqlite3.connect(database) as db:
        db.execute('DELETE FROM Settings WHERE Key = ?', (KEY,))
        for p in bundle:
            db.execute('DELETE FROM Products WHERE Slug = ?', (p['slug'],))
        alias = dict(bundle[0], slug='existing-thermex-anode', title='Existing administrator title')
        preserved = dict(bundle[5], title='Existing edited product', price=23456)
        for p in [alias, preserved]:
            db.execute('INSERT INTO Products (Slug, Data, UpdatedAt) VALUES (?, ?, ?)', (p['slug'], json.dumps(p, ensure_ascii=False), 123456))
        original = db.execute('SELECT Data FROM Products WHERE Slug = ?', ('electric-30',)).fetchone()[0]
        db.execute('INSERT INTO Settings (Key, Value) VALUES (?, ?)', ('import-test-private', '{"preserve":true}'))

    process, log = start()
    try:
        products = catalog()
        check(len(products) == 55, 'Existing catalog imported without duplicates')
        check(not any(p['slug'] == bundle[0]['slug'] for p in products), 'Existing brand/SKU alias matched')
        check(next(p for p in products if p['slug'] == preserved['slug'])['price'] == 23456, 'Existing product price preserved')
        with sqlite3.connect(database) as db:
            marker = json.loads(db.execute('SELECT Value FROM Settings WHERE Key = ?', (KEY,)).fetchone()[0])
            check(marker['imported'] == 33 and marker['skipped'] == 2, 'Import audit counts')
            check(db.execute('SELECT Data FROM Products WHERE Slug = ?', ('electric-30',)).fetchone()[0] == original, 'Original product unchanged')
            check(db.execute('SELECT Value FROM Settings WHERE Key = ?', ('import-test-private',)).fetchone()[0] == '{"preserve":true}', 'Other settings preserved')
    finally:
        stop(process, log)

    with sqlite3.connect(database) as db:
        db.execute('DELETE FROM Products WHERE Slug = ?', (bundle[1]['slug'],))
        real_edit = json.loads(db.execute('SELECT Data FROM Products WHERE Slug = ?', ('ariston-blu1-r-50-v',)).fetchone()[0])
        real_edit['price'] = 99999
        real_edit['priceIsEstimate'] = False
        db.execute('UPDATE Products SET Data = ? WHERE Slug = ?', (json.dumps(real_edit), real_edit['slug']))
        db.execute('DELETE FROM Products WHERE Slug = ?', ('thermex-part-904669',))
        changed = dict(bundle[2], title='Administrator revision after import', price=34567)
        db.execute('UPDATE Products SET Data = ?, UpdatedAt = ? WHERE Slug = ?', (json.dumps(changed), 234567, changed['slug']))
    # Copying just the database to another server must restore bundled images.
    image = next((Path(temp) / 'files/products').glob('*.png'))
    image.unlink()
    process, log = start()
    try:
        products = catalog()
        check(len(products) == 53 and not any(p['slug'] == bundle[1]['slug'] for p in products), 'Restart never resurrects a deleted entry')
        check(next(p for p in products if p['slug'] == changed['slug'])['price'] == 34567, 'Restart preserves administrator edits')
        check(image.exists(), 'Missing bundled image restored')
        check(not any(p['slug'] == 'thermex-part-904669' for p in products), 'Real import does not resurrect deleted products')
        edited_real = next(p for p in products if p['slug'] == real_edit['slug'])
        check(edited_real['price'] == 99999 and not edited_real['priceIsEstimate'], 'Real import preserves finalized administrator prices')
    finally:
        stop(process, log)

print(json.dumps({'passed': checks, 'suite': 'uploaded catalog import'}))
