import {
  mkdir,
  readFile,
  writeFile,
  chmod,
  mkdtemp,
  copyFile,
  rm,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root = fileURLToPath(new URL('../', import.meta.url));
const pins = JSON.parse(
  await readFile(path.join(root, 'desktop/tunnel-binaries.json'), 'utf8'),
);
const hash = (data) => createHash('sha256').update(data).digest('hex');

export async function fetchTunnel(platform, arch) {
  const target = `${platform}-${arch}`,
    asset = pins.assets[target];
  if (!asset) throw new Error(`No pinned tunnel binary for ${target}.`);
  const destination = path.join(
    root,
    'outputs/dependencies/cloudflared',
    pins.version,
    target,
  );
  await mkdir(destination, { recursive: true });
  const archive = path.join(destination, asset.file);
  let bytes = await readFile(archive).catch(() => null);
  if (!bytes || hash(bytes) !== asset.sha256) {
    const response = await fetch(
      `${pins.repository}/releases/download/${pins.version}/${asset.file}`,
      { signal: AbortSignal.timeout(180000) },
    );
    if (!response.ok)
      throw new Error(`Tunnel download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== asset.sha256)
      throw new Error(
        `Tunnel checksum mismatch: ${asset.file}. Build stopped.`,
      );
    await writeFile(archive, bytes);
  }
  const binary = path.join(
    destination,
    platform === 'win32' ? 'cloudflared.exe' : 'cloudflared',
  );
  if (platform === 'win32') await copyFile(archive, binary);
  else {
    const staging = await mkdtemp(
      path.join(os.tmpdir(), 'wellcum-tunnel-download-'),
    );
    try {
      const result = spawnSync(
        'tar',
        ['-xzf', archive, '-C', staging, 'cloudflared'],
        { encoding: 'utf8' },
      );
      if (result.status !== 0)
        throw new Error(
          `Cannot extract verified tunnel archive: ${result.stderr}`,
        );
      await copyFile(path.join(staging, 'cloudflared'), binary);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  await chmod(binary, 0o755);
  const record = {
    version: pins.version,
    target,
    archive_sha256: asset.sha256,
    binary_sha256: hash(await readFile(binary)),
  };
  await writeFile(
    path.join(destination, 'build.json'),
    JSON.stringify(record, null, 2) + '\n',
  );
  return { binary, record };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const target of process.argv.slice(2).length
    ? process.argv.slice(2)
    : Object.keys(pins.assets)) {
    const [platform, arch] = target.split('-');
    const result = await fetchTunnel(platform, arch);
    console.log(`${target}: verified ${result.record.binary_sha256}`);
  }
}
