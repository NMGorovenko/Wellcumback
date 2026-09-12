#!/usr/bin/env python3
"""Validate and package a versioned offline game and its exact source checkout."""
import argparse
import base64
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tag', required=True, help='Release tag, for example v0.2.0')
args = parser.parse_args()
version = json.loads((ROOT / 'package.json').read_text())['version']
if not re.fullmatch(r'\d+\.\d+\.\d+', version) or args.tag != 'v' + version:
    raise SystemExit('Release tag must match the exact package.json version')
commit = subprocess.check_output(['git', 'rev-parse', '--verify', 'HEAD'], cwd=ROOT, text=True).strip()
if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip():
    raise SystemExit('Commit the source before packaging a release')

portable = ROOT / 'outputs' / 'portable'
html_bytes = (portable / 'Wellcum-back.html').read_bytes()
html = html_bytes.decode('utf-8')
build = json.loads((portable / 'build.json').read_text())
if build['version'] != version or hashlib.sha256(html_bytes).hexdigest() != build['html_sha256']:
    raise SystemExit('Rebuild the portable game: its version or checksum is stale')


class OfflineDocument(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_script = False
        self.scripts = []
        self.parts = []
        self.resources = []
        self.csp = ''
        self.version = ''

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script':
            if 'src' in attrs:
                raise ValueError('External script in the offline game')
            self.in_script = True
            self.parts = []
        if tag in {'link', 'img', 'iframe', 'source'}:
            self.resources.append(attrs.get('href', attrs.get('src', '')))
        if tag == 'meta':
            if attrs.get('http-equiv', '').lower() == 'content-security-policy':
                self.csp = attrs['content']
            if attrs.get('name') == 'game-version':
                self.version = attrs['content']

    def handle_data(self, data):
        if self.in_script:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False
            self.scripts.append(''.join(self.parts))


document = OfflineDocument()
document.feed(html)
if len(document.scripts) != 1 or document.version != version:
    raise SystemExit('Invalid single-file game document')
if not all(url.startswith('data:') for url in document.resources) or "connect-src 'none'" not in document.csp:
    raise SystemExit('Offline game may request external resources')
subprocess.run(['node', '--check', '--input-type=commonjs'], input=document.scripts[0], text=True, check=True)
for asset in build['embedded_assets']:
    path = (ROOT / 'public' / asset['url'].lstrip('/')).resolve()
    if not path.is_relative_to(ROOT / 'public'):
        raise SystemExit('Invalid embedded asset path')
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != asset['sha256'] or base64.b64encode(data).decode() not in html:
        raise SystemExit(f"Missing or stale embedded image: {asset['url']}")
references = json.loads((ROOT / 'references' / 'manifest.json').read_text())['files']
for original in references:
    data = (ROOT / original['path']).read_bytes()
    if len(data) != original['bytes'] or hashlib.sha256(data).hexdigest() != original['sha256']:
        raise SystemExit(f"Original photo changed: {original['path']}")

output = ROOT / 'outputs' / 'release' / args.tag
output.mkdir(parents=True, exist_ok=True)
prefix = 'Wellcum-back-' + version
info = {'version': version, 'tag': args.tag, 'commit': commit, **build}
game_zip = output / (prefix + '-play.zip')
with zipfile.ZipFile(game_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.writestr('Wellcum-back.html', html_bytes)
    archive.write(portable / 'README.txt', 'README.txt')
    archive.writestr('BUILD-INFO.json', json.dumps(info, ensure_ascii=False, indent=2) + '\n')
standalone = output / (prefix + '.html')
shutil.copyfile(portable / 'Wellcum-back.html', standalone)
source_zip = output / (prefix + '-source.zip')
subprocess.run([sys.executable, str(ROOT / 'scripts' / 'archive-source.py'), str(source_zip)], cwd=ROOT, check=True)
with zipfile.ZipFile(game_zip) as archive:
    if archive.testzip() or archive.read('Wellcum-back.html') != html_bytes:
        raise SystemExit('Playable ZIP failed integrity verification')
artifacts = [game_zip, standalone, source_zip]
checksums = '\n'.join(f'{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}' for file in artifacts) + '\n'
(output / 'SHA256SUMS.txt').write_text(checksums)
print(f'Release {args.tag} at {commit}: {len(artifacts)} artifacts, {len(references)} original references verified')
print(output)
