#!/usr/bin/env python3
"""Verify a signed, extracted FRIENDSLOP app; emit one JSON report to stdout.

No signing or launch occurs. Input files are never changed. The default negative
check changes one resource only inside a fresh disposable ditto copy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import stat
import subprocess
import sys
import tempfile

MACHO_MAGIC = {bytes.fromhex(value) for value in (
    'feedface', 'cefaedfe', 'feedfacf', 'cffaedfe',
    'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca',
)}
LOCALE = re.compile(r'^[A-Za-z0-9_-]+\.lproj$')
BUNDLE_SUFFIXES = {'.app', '.framework', '.xpc', '.appex', '.bundle', '.plugin'}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def inside(child: Path, parent: Path) -> bool:
    return child == parent or parent in child.parents


def command(args: list[str], *, expect_success: bool = True,
            timeout: int = 60) -> subprocess.CompletedProcess:
    result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    if expect_success:
        require(result.returncode == 0,
                f'{args[0]} failed ({result.returncode}): {result.stderr or result.stdout}')
    return result


def plist(path: Path) -> dict:
    with path.open('rb') as source:
        value = plistlib.load(source)
    require(isinstance(value, dict), f'Expected plist dictionary: {path}')
    return value


def inventory(app: Path) -> tuple[list[Path], list[Path]]:
    """Canonical traversal follows in-bundle aliases once; rejects external links."""
    files: set[Path] = set()
    directories: set[Path] = set()
    pending = [app]
    while pending:
        lexical = pending.pop()
        canonical = lexical.resolve(strict=True)
        require(inside(canonical, app), f'Symlink escapes application: {lexical}')
        mode = canonical.stat().st_mode
        if stat.S_ISDIR(mode):
            if canonical in directories:
                continue
            directories.add(canonical)
            pending.extend(canonical.iterdir())
        elif stat.S_ISREG(mode):
            files.add(canonical)
        else:
            raise RuntimeError(f'Unexpected special file in bundle: {canonical}')
    return sorted(files), sorted(directories)


def is_macho(path: Path) -> bool:
    with path.open('rb') as source:
        return source.read(4) in MACHO_MAGIC


def locale_seal(app: Path, files: list[Path], expected_count: int) -> dict:
    framework = app / 'Contents/Frameworks/Electron Framework.framework'
    require(framework.is_dir(), f'Electron Framework missing: {framework}')
    framework = framework.resolve(strict=True)
    version = (framework / 'Versions/Current').resolve(strict=True)
    require(inside(version, framework), 'Framework Current link escapes framework')
    resources = (version / 'Resources').resolve(strict=True)
    require(inside(resources, version), 'Framework Resources link escapes current version')
    seal_file = version / '_CodeSignature/CodeResources'
    seal = plist(seal_file)
    entries = seal.get('files2')
    require(isinstance(entries, dict), 'Missing version-2 framework resource envelope')
    locales = [file for file in files if file.name == 'locale.pak'
               and file.parent.parent == resources and LOCALE.fullmatch(file.parent.name)]
    require(len(locales) == expected_count,
            f'Expected {expected_count} canonical locale DataPacks, found {len(locales)}')
    checked = []
    for file in locales:
        require(not file.is_symlink(), f'Canonical locale is a symlink: {file}')
        mode = stat.S_IMODE(file.stat().st_mode)
        require(mode == 0o644, f'Locale must have mode 0644: {file} ({mode:o})')
        data = file.read_bytes()
        require(len(data) >= 12, f'Truncated locale DataPack: {file}')
        require(data[:4] not in MACHO_MAGIC and data[:4] != b'\x7fELF'
                and data[:2] not in (b'MZ', b'#!'), f'Locale contains executable code: {file}')
        require(int.from_bytes(data[:4], 'little') == 5, f'Expected DataPack v5: {file}')
        key = file.relative_to(version).as_posix()
        entry = entries.get(key)
        require(isinstance(entry, dict), f'Locale absent from framework files2 seal: {key}')
        require(isinstance(entry.get('hash2'), bytes), f'Locale lacks a SHA-256 resource seal: {key}')
        digest = hashlib.sha256(data).digest()
        require(entry['hash2'] == digest, f'Locale resource hash mismatch: {key}')
        require('cdhash' not in entry, f'Locale must be sealed as data, not nested code: {key}')
        checked.append({'path': file.relative_to(app).as_posix(),
                        'resource_key': key, 'bytes': len(data),
                        'sha256': digest.hex(), 'mode': '0644', 'datapack_version': 5})
    require(checked, 'No locale resources verified')
    return {'framework': framework.relative_to(app).as_posix(),
            'version_directory': version.relative_to(app).as_posix(),
            'code_resources': seal_file.relative_to(app).as_posix(),
            'count': len(checked), 'files': checked}


def bundle_executable(bundle: Path, app: Path) -> Path | None:
    if bundle.suffix == '.framework':
        info = bundle / 'Resources/Info.plist'
        locations = [bundle]
    else:
        info = bundle / 'Contents/Info.plist'
        locations = [bundle / 'Contents/MacOS', bundle]
    if not info.is_file():
        require(bundle.suffix not in {'.app', '.framework'}, f'Missing bundle Info.plist: {bundle}')
        return None
    name = plist(info).get('CFBundleExecutable')
    if not name:
        require(bundle.suffix not in {'.app', '.framework'}, f'Missing CFBundleExecutable: {bundle}')
        return None
    require(isinstance(name, str) and Path(name).name == name,
            f'Invalid CFBundleExecutable in {bundle}')
    for parent in locations:
        executable = parent / name
        if executable.is_file():
            canonical = executable.resolve(strict=True)
            require(inside(canonical, app), f'Bundle executable escapes app: {executable}')
            return canonical
    raise RuntimeError(f'Bundle executable missing: {bundle} / {name}')


def signing_objects(app: Path, files: list[Path], directories: list[Path]) -> tuple[list[Path], list[Path]]:
    macho = {file for file in files if is_macho(file)}
    require(macho, 'No Mach-O files found')
    covered: set[Path] = set()
    objects: set[Path] = set()
    for directory in directories:
        if directory.suffix not in BUNDLE_SUFFIXES:
            continue
        executable = bundle_executable(directory, app)
        if executable is not None and executable in macho:
            # A bundle signature is also its main executable's signature. Verify
            # that code object once, not again through Framework/Versions aliases.
            objects.add(directory)
            covered.add(executable)
    objects.update(macho - covered)
    require(app in objects, 'Application executable was not recognized as Mach-O')
    helper = (app / 'Contents/Resources/tunnel/cloudflared').resolve(strict=True)
    require(helper in macho and helper in objects, 'Bundled cloudflared must be an independently verified Mach-O')
    return sorted(objects, key=lambda value: (-len(value.parts), str(value))), sorted(macho)


def signature(path: Path, app: Path, expected_team: str) -> dict:
    if path != app:  # The top-level recursive verification was already performed.
        command(['/usr/bin/codesign', '--verify', '--strict', '--verbose=2', str(path)])
    result = command(['/usr/bin/codesign', '--display', '--verbose=4',
                      '--entitlements', ':-', str(path)])
    details = result.stdout + '\n' + result.stderr
    authority = re.search(r'^Authority=(Developer ID Application:.+)$', details, re.MULTILINE)
    team = re.search(r'^TeamIdentifier=(.+)$', details, re.MULTILINE)
    timestamp = re.search(r'^Timestamp=(.+)$', details, re.MULTILINE)
    require(authority is not None, f'Developer ID Application authority missing: {path}')
    require(team is not None and team[1] == expected_team, f'Wrong Developer ID team: {path}')
    require(timestamp is not None and timestamp[1].strip() not in ('', 'none'), f'Timestamp missing: {path}')
    require(re.search(r'^CodeDirectory .*flags=.*\bruntime\b', details, re.MULTILINE) is not None,
            f'Hardened runtime flag missing: {path}')
    require('com.apple.security.get-task-allow' not in details, f'Debug entitlement found: {path}')
    return {'path': path.relative_to(app).as_posix(), 'authority': authority[1],
            'team': team[1], 'timestamp': timestamp[1], 'hardened_runtime': True}


def negative_tamper(app: Path, seal: dict) -> dict:
    preferred = next((item for item in seal['files'] if '/en.lproj/' in item['path']), seal['files'][0])
    with tempfile.TemporaryDirectory(prefix='friendslop-seal-negative-') as temporary:
        copy = Path(temporary) / app.name
        command(['/usr/bin/ditto', '--rsrc', '--extattr', '--acl', str(app), str(copy)], timeout=120)
        command(['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=2', str(copy)], timeout=120)
        copied_file = (copy / preferred['path']).resolve(strict=True)
        require(inside(copied_file, copy.resolve()), 'Tamper target escapes disposable copy')
        require(not os.path.samefile(copied_file, app / preferred['path']), 'Disposable copy shares the original inode')
        require(hashlib.sha256(copied_file.read_bytes()).hexdigest() == preferred['sha256'],
                'Disposable resource differs before the negative check')
        with copied_file.open('r+b') as output:
            output.seek(12)
            byte = output.read(1)
            require(bool(byte), 'Locale has no payload byte for tamper check')
            output.seek(12)
            output.write(bytes([byte[0] ^ 1]))
        framework = copy / seal['framework']
        failure = {}
        for label, path, deep in [('framework', framework, []), ('application', copy, ['--deep'])]:
            result = command(['/usr/bin/codesign', '--verify', *deep, '--strict', '--verbose=4', str(path)],
                             expect_success=False, timeout=120)
            require(result.returncode > 0, f'Tampered {label} unexpectedly verified or was interrupted')
            details = (result.stdout + '\n' + result.stderr).strip()
            require('resource' in details.lower(), f'{label} failed for an unexpected reason: {details}')
            failure[label] = {'exit_code': result.returncode, 'diagnostic': details[-8000:]}
        # Verify the source bytes again before cleanup: the supplied app is intact.
        require(hashlib.sha256((app / preferred['path']).read_bytes()).hexdigest() == preferred['sha256'],
                'Original locale unexpectedly changed')
    return {'performed': True, 'locale': preferred['path'],
            'pristine_copy_verified': True, 'framework_rejected': True,
            'application_rejected': True, 'temporary_copy_removed': True, 'failures': failure}


def verify(app_path: str, *, version: str = '0.14.0', team: str = 'K9RX3779MP',
           expected_locales: int = 220, tamper: bool = True) -> dict:
    require(sys.platform == 'darwin', 'This verifier requires macOS codesign and ditto')
    app = Path(app_path).expanduser().resolve(strict=True)
    require(app.is_dir() and app.suffix == '.app', 'Input must be an extracted .app bundle')
    for installed in (Path('/Applications'), Path.home() / 'Applications'):
        require(not inside(app, installed), 'Use an extracted artifact, not an installed application')
    require(expected_locales > 0, 'Expected locale count must be positive')
    metadata = plist(app / 'Contents/Info.plist')
    require(metadata.get('CFBundleShortVersionString') == version,
            f'Wrong app version: {metadata.get("CFBundleShortVersionString")}')
    files, directories = inventory(app)
    seals = locale_seal(app, files, expected_locales)
    objects, macho = signing_objects(app, files, directories)
    command(['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=2', str(app)], timeout=120)
    signatures = [signature(path, app, team) for path in objects]
    negative = negative_tamper(app, seals) if tamper else {'performed': False, 'reason': 'explicit --skip-tamper'}
    return {'verified': True, 'app': str(app), 'version': version,
            'bundle_id': metadata.get('CFBundleIdentifier'), 'expected_team': team,
            'canonical_file_count': len(files), 'canonical_macho_count': len(macho),
            'signature_object_count': len(signatures),
            'canonical_macho_paths': [path.relative_to(app).as_posix() for path in macho],
            'signatures': signatures, 'locale_seal': seals, 'negative_tamper': negative,
            'input_modified': False, 'notarization_checked': False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', help='Extracted signed .app path (never an installed app)')
    parser.add_argument('--version', default='0.14.0')
    parser.add_argument('--team', default='K9RX3779MP')
    parser.add_argument('--expected-locales', type=int, default=220)
    parser.add_argument('--skip-tamper', action='store_true',
                        help='Only for additional matching containers after one negative check per architecture')
    args = parser.parse_args()
    try:
        report = verify(args.app, version=args.version, team=args.team,
                        expected_locales=args.expected_locales, tamper=not args.skip_tamper)
    except Exception as error:
        print(json.dumps({'verified': False, 'error': str(error)}, ensure_ascii=False), flush=True)
        return 1
    print(json.dumps(report, indent=2, ensure_ascii=False), flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
