#!/usr/bin/env python3
"""Make a portable source archive, including original reference photographs."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
output = args.output.resolve()
output.parent.mkdir(parents=True, exist_ok=True)
listed = subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT
).decode().split('\0')
paths = {ROOT / name for name in listed if name}
paths.update((ROOT / 'references').rglob('*'))
files = sorted(
    path for path in paths
    if path.is_file() and path != output
    and not any(part in {'node_modules', '.git', 'dist', '.wrangler', 'outputs'} for part in path.relative_to(ROOT).parts)
    and (not path.name.startswith('.env') or path.name.endswith('.example'))
)
manifest = []
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in files:
        relative = path.relative_to(ROOT).as_posix()
        data = path.read_bytes()
        archive.writestr('friendslop/' + relative, data)
        manifest.append({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    archive.writestr('friendslop/SOURCE-MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2))
with zipfile.ZipFile(output) as archive:
    damaged = archive.testzip()
    if damaged:
        raise RuntimeError(f'Archive verification failed: {damaged}')
print(f'{output}\n{len(files)} files, {output.stat().st_size:,} bytes; ZIP integrity checked')
