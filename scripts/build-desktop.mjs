/** Package the same offline renderer for desktop. There is no development server in the app. */
import {
  mkdir,
  mkdtemp,
  rm,
  readFile,
  writeFile,
  copyFile,
  cp,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import security from '../desktop/security.cjs';
import { build } from 'esbuild';
import { fetchTunnel } from './fetch-tunnel.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

export async function prepareDesktopApp(projectRoot) {
  const pkg = JSON.parse(
    await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  const portable = path.join(projectRoot, 'outputs/portable');
  const [html, manifestJSON] = await Promise.all([
    readFile(path.join(portable, 'Wellcum-back.html'), 'utf8'),
    readFile(path.join(portable, 'build.json'), 'utf8'),
  ]);
  const renderer = security.prepareRenderer(
    html,
    JSON.parse(manifestJSON),
    pkg.version,
  );
  const appDir = path.join(projectRoot, 'outputs/desktop-app');
  await mkdir(path.join(appDir, 'renderer'), { recursive: true });
  const networkBuild = await build({
    absWorkingDir: projectRoot,
    entryPoints: [path.join(projectRoot, 'desktop/network.ts')],
    outfile: path.join(appDir, 'network.cjs'),
    bundle: true,
    metafile: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['bufferutil', 'utf-8-validate'],
  });
  const runtimeSources = Object.fromEntries(
    await Promise.all(
      [
        ...Object.keys(networkBuild.metafile.inputs),
        'package-lock.json',
        'desktop/tunnel-binaries.json',
      ].map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(path.resolve(projectRoot, file)))
          .digest('hex'),
      ]),
    ),
  );
  await writeFile(
    path.join(appDir, 'network-source.json'),
    JSON.stringify(runtimeSources, null, 2) + '\n',
  );
  const localTunnel = await fetchTunnel(process.platform, process.arch);
  await mkdir(path.join(appDir, 'tunnel'), { recursive: true });
  await copyFile(
    localTunnel.binary,
    path.join(appDir, 'tunnel', path.basename(localTunnel.binary)),
  );
  await writeFile(
    path.join(appDir, 'tunnel/build.json'),
    JSON.stringify(localTunnel.record, null, 2),
  );
  await Promise.all([
    writeFile(path.join(appDir, 'renderer/index.html'), renderer.html),
    writeFile(
      path.join(appDir, 'renderer/build.json'),
      JSON.stringify(renderer.manifest, null, 2) + '\n',
    ),
    writeFile(
      path.join(appDir, 'package.json'),
      JSON.stringify(
        {
          name: 'wellcum-back-desktop',
          version: pkg.version,
          private: true,
          description:
            'Ну, с возвращением! — игра для 1–3 игроков, локально и по сети',
          main: 'main.cjs',
        },
        null,
        2,
      ) + '\n',
    ),
    copyFile(
      path.join(projectRoot, 'desktop/main.cjs'),
      path.join(appDir, 'main.cjs'),
    ),
    copyFile(
      path.join(projectRoot, 'desktop/security.cjs'),
      path.join(appDir, 'security.cjs'),
    ),
    copyFile(
      path.join(projectRoot, 'desktop/preload.cjs'),
      path.join(appDir, 'preload.cjs'),
    ),
    copyFile(
      path.join(projectRoot, 'drizzle/0000_rooms.sql'),
      path.join(appDir, 'rooms.sql'),
    ),
    cp(
      path.join(projectRoot, 'desktop/licenses'),
      path.join(appDir, 'licenses'),
      { recursive: true },
    ),
  ]);
  return appDir;
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Desktop command failed (${result.signal ?? result.status}): ${command}`,
    );
}

async function main() {
  const mode = process.argv[2] ?? 'prepare';
  const targets = {
    mac: ['--mac', '--arm64', '--x64'],
    'mac-arm64': ['--mac', '--arm64'],
    win: ['--win', '--x64'],
    'win-zip': ['--win', 'zip', '--x64'],
    dir: ['--dir', `--${process.arch}`],
  };
  if (
    process.argv.length > 3 ||
    !(mode in targets || mode === 'prepare' || mode === 'run')
  ) {
    throw new Error(
      'Usage: node scripts/build-desktop.mjs prepare|run|dir|mac|mac-arm64|win|win-zip',
    );
  }
  // Every public command rebuilds first; an old HTML never silently becomes a new desktop release.
  run(process.execPath, [path.join(root, 'scripts/build-portable.mjs')]);
  const appDir = await prepareDesktopApp(root);
  console.log(`Prepared desktop app: ${appDir}`);
  if (mode === 'prepare') return;
  if (mode === 'run') {
    run(require('electron'), [appDir]);
    return;
  }
  // Signing inside an iCloud/FileProvider Documents checkout can reattach FinderInfo
  // even after cleanup. Build outside that provider; copy only the finished archives.
  const staging = await mkdtemp(path.join(os.tmpdir(), 'wellcum-package-'));
  try {
    const tunnelTargets =
      mode === 'mac'
        ? [
            ['darwin', 'arm64'],
            ['darwin', 'x64'],
          ]
        : mode === 'mac-arm64'
          ? [['darwin', 'arm64']]
          : mode.startsWith('win')
            ? [['win32', 'x64']]
            : [[process.platform, process.arch]];
    for (const [platform, arch] of tunnelTargets)
      await fetchTunnel(platform, arch);
    run(
      process.execPath,
      [
        require.resolve('electron-builder/cli.js'),
        '--projectDir',
        appDir,
        '--config',
        path.join(root, 'desktop/builder.config.cjs'),
        '--publish',
        'never',
        ...targets[mode],
      ],
      { ...process.env, WELLCUM_DESKTOP_OUTPUT: staging },
    );
    if (mode === 'dir') {
      console.log(`Unpacked application (temporary directory): ${staging}`);
      return;
    }
    await mkdir(path.join(root, 'outputs/desktop'), { recursive: true });
    const packaged = {
      mac: ['mac-arm64.zip', 'mac-arm64.dmg', 'mac-x64.zip', 'mac-x64.dmg'],
      'mac-arm64': ['mac-arm64.zip', 'mac-arm64.dmg'],
      win: ['windows-x64-portable.exe', 'windows-x64-setup.exe'],
      'win-zip': ['win-x64.zip'],
      dir: [],
    };
    const manifest = JSON.parse(
      await readFile(path.join(appDir, 'renderer/build.json'), 'utf8'),
    );
    const hash = (data) => createHash('sha256').update(data).digest('hex');
    const runtime = Object.fromEntries(
      await Promise.all(
        [
          'main.cjs',
          'security.cjs',
          'preload.cjs',
          'network.cjs',
          'rooms.sql',
        ].map(async (file) => [
          file,
          hash(await readFile(path.join(appDir, file))),
        ]),
      ),
    );
    for (const suffix of packaged[mode]) {
      const artifact = path.join(
        root,
        'outputs/desktop',
        `Wellcum-back-${manifest.version}-${suffix}`,
      );
      const bytes = await readFile(path.join(staging, path.basename(artifact)));
      await writeFile(artifact, bytes);
      await writeFile(
        artifact + '.build.json',
        JSON.stringify(
          {
            ...manifest,
            runtime,
            runtime_sources: JSON.parse(
              await readFile(path.join(appDir, 'network-source.json'), 'utf8'),
            ),
            tunnel: (
              await fetchTunnel(
                suffix.startsWith('mac') ? 'darwin' : 'win32',
                suffix.includes('arm64') ? 'arm64' : 'x64',
              )
            ).record,
            bytes: bytes.length,
            artifact_sha256: hash(bytes),
          },
          null,
          2,
        ) + '\n',
      );
    }
  } finally {
    if (mode !== 'dir') await rm(staging, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
