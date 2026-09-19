/** Launches the real Electron main with an isolated disposable profile, including a separate LAN guest process. */
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
if (
  process.argv.length > 3 ||
  (process.argv[2] && process.argv[2] !== '--prepared')
) {
  throw new Error('Usage: node scripts/smoke-desktop.mjs [--prepared]');
}
if (process.argv[2] !== '--prepared') {
  const build = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/build-desktop.mjs'), 'prepare'],
    { cwd: root, stdio: 'inherit' },
  );
  if (build.error || build.status !== 0)
    throw build.error ?? new Error(`Prepare failed: ${build.status}`);
}
const appDir = path.join(root, 'outputs/desktop-app');
const pkg = JSON.parse(
  await readFile(path.join(appDir, 'package.json'), 'utf8'),
);
const temporary = await mkdtemp(
  path.join(os.tmpdir(), 'wellcum-native-smoke-'),
);
try {
  const profile = path.join(temporary, 'profile');
  await mkdir(profile);
  await writeFile(
    path.join(temporary, 'package.json'),
    JSON.stringify({
      name: 'wellcum-native-smoke',
      version: pkg.version,
      main: 'entry.cjs',
    }),
  );
  await writeFile(
    path.join(temporary, 'entry.cjs'),
    `require(${JSON.stringify(path.join(root, 'desktop/smoke.cjs'))});\n`,
  );
  for (const phase of ['write', 'read', 'moving', 'lan']) {
    const env = {
      ...process.env,
      WELLCUM_SMOKE_APP: appDir,
      WELLCUM_SMOKE_PROFILE: profile,
      WELLCUM_SMOKE_PHASE: phase,
      WELLCUM_SMOKE_NODE: process.execPath,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = spawnSync(require('electron'), [temporary], {
      cwd: root,
      env,
      stdio: 'inherit',
      timeout: 70000,
    });
    if (run.error || run.status !== 0)
      throw (
        run.error ??
        new Error(`Native smoke ${phase} failed: ${run.signal ?? run.status}`)
      );
  }
  console.log(
    `Native desktop smoke passed: ${pkg.version} on ${process.platform}/${process.arch}. Hardware gamepad operation still requires a physical check.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
