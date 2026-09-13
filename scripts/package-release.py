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
parser.add_argument('--desktop', action='store_true', help='Include verified macOS and Windows desktop builds')
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
if args.desktop:
    suffixes = ['mac-arm64.zip', 'mac-arm64.dmg', 'mac-x64.zip', 'mac-x64.dmg',
                'windows-x64-portable.exe', 'windows-x64-setup.exe']
    for suffix in suffixes:
        binary = ROOT / 'outputs' / 'desktop' / (prefix + '-' + suffix)
        record = json.loads(Path(str(binary) + '.build.json').read_text())
        data = binary.read_bytes()
        if (record['version'] != version or record['source_html_sha256'] != build['html_sha256']
                or record['bytes'] != len(data) or record['artifact_sha256'] != hashlib.sha256(data).hexdigest()):
            raise SystemExit(f'Rebuild stale desktop artifact: {binary.name}')
        for filename in ('main.cjs', 'security.cjs', 'preload.cjs'):
            if record['runtime'][filename] != hashlib.sha256((ROOT / 'desktop' / filename).read_bytes()).hexdigest():
                raise SystemExit(f'Rebuild desktop artifact after runtime changes: {binary.name}')
        for filename, source in [('rooms.sql', ROOT / 'drizzle/0000_rooms.sql'),
                                 ('network.cjs', ROOT / 'outputs/desktop-app/network.cjs')]:
            if record['runtime'][filename] != hashlib.sha256(source.read_bytes()).hexdigest():
                raise SystemExit(f'Rebuild desktop relay: {binary.name}')
        for filename, digest in record['runtime_sources'].items():
            source = (ROOT / filename).resolve()
            if not source.is_relative_to(ROOT) or hashlib.sha256(source.read_bytes()).hexdigest() != digest:
                raise SystemExit(f'Rebuild desktop after relay source changes: {filename}')
        if record.get('signing'):
            signing = record['signing']
            if (not signing['authority'].startswith('Developer ID Application:')
                    or signing['team'] != signing['tunnel']['team']
                    or not re.fullmatch(r'[0-9a-f]{64}', signing['tunnel']['binary_sha256'])
                    or not record.get('signing_sources')):
                raise SystemExit(f'Invalid Developer ID build record: {binary.name}')
            for filename, digest in record['signing_sources'].items():
                source = (ROOT / filename).resolve()
                if not source.is_relative_to(ROOT) or hashlib.sha256(source.read_bytes()).hexdigest() != digest:
                    raise SystemExit(f'Rebuild desktop after signing configuration changed: {filename}')
            if signing['mode'] == 'notarized' and (not signing['appStapled']
                    or (binary.suffix == '.dmg' and not signing.get('container', {}).get('stapled'))):
                raise SystemExit(f'Notarization ticket missing: {binary.name}')
        tunnel = record['tunnel']
        pins = json.loads((ROOT / 'desktop/tunnel-binaries.json').read_text())
        pinned = pins['assets'].get(tunnel['target'])
        binary_name = 'cloudflared.exe' if tunnel['target'].startswith('win32') else 'cloudflared'
        cached = ROOT / 'outputs/dependencies/cloudflared' / pins['version'] / tunnel['target'] / binary_name
        if (tunnel['version'] != pins['version'] or not pinned
                or tunnel['archive_sha256'] != pinned['sha256']
                or tunnel['binary_sha256'] != hashlib.sha256(cached.read_bytes()).hexdigest()):
            raise SystemExit(f'Rebuild desktop tunnel: {binary.name}')
        destination = output / binary.name
        shutil.copyfile(binary, destination)
        artifacts.append(destination)
    server = ROOT / 'outputs/server'
    server_info = json.loads((server / 'package.json').read_text())
    if server_info['version'] != version:
        raise SystemExit('Rebuild standalone relay for this version')
    server_manifest = json.loads((server / 'build.json').read_text())
    for filename, digest in server_manifest['sources'].items():
        source = (ROOT / filename).resolve()
        if not source.is_relative_to(ROOT) or hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise SystemExit(f'Rebuild standalone relay after source changes: {filename}')
    for filename, digest in server_manifest['files'].items():
        if hashlib.sha256((server / filename).read_bytes()).hexdigest() != digest:
            raise SystemExit(f'Standalone relay file changed: {filename}')
    server_zip = output / (prefix + '-server.zip')
    with zipfile.ZipFile(server_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file in sorted(server.rglob('*')):
            if file.is_file(): archive.write(file, file.relative_to(server))
    artifacts.append(server_zip)
checksums = '\n'.join(f'{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}' for file in artifacts) + '\n'
(output / 'SHA256SUMS.txt').write_text(checksums)
print(f'Release {args.tag} at {commit}: {len(artifacts)} artifacts, {len(references)} original references verified')
print(output)
