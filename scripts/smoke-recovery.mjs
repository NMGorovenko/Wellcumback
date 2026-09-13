/** Exercise recovery UI against the prepared app, using disposable profiles and loopback transport. */
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshCity } from '../lib/game/city/engine.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const appDir = path.join(root, 'outputs/desktop-app');
const require = createRequire(import.meta.url);
const pkg = JSON.parse(
  await readFile(path.join(appDir, 'package.json'), 'utf8'),
);
const runtime = Object.fromEntries(
  await Promise.all(
    [
      'main.cjs',
      'preload.cjs',
      'network.cjs',
      'security.cjs',
      'renderer/index.html',
    ].map(async (file) => [
      file,
      createHash('sha256')
        .update(await readFile(path.join(appDir, file)))
        .digest('hex'),
    ]),
  ),
);
const evidence = path.join(root, 'outputs/recovery-ui.json');
await rm(evidence, { force: true });
const temporary = await mkdtemp(
  path.join(os.tmpdir(), 'wellcum-recovery-smoke-'),
);
try {
  await writeFile(
    path.join(temporary, 'package.json'),
    JSON.stringify({
      name: 'wellcum-recovery-smoke',
      version: pkg.version,
      main: 'entry.cjs',
    }),
  );
  await writeFile(
    path.join(temporary, 'entry.cjs'),
    `require(${JSON.stringify(path.join(root, 'desktop/smoke-recovery.cjs'))});\n`,
  );
  await writeFile(
    path.join(temporary, 'world.json'),
    JSON.stringify({
      scene: 'city',
      epoch: 30,
      attempt: 17,
      roles: [0, 1, 2],
      driver: 0,
      brief: false,
      state: { ...freshCity(), paused: true, elapsed: 143, x: 42 },
    }),
  );
  for (const phase of ['host', 'guest']) {
    const profile = path.join(temporary, phase);
    await mkdir(profile);
    const env = {
      ...process.env,
      WELLCUM_SMOKE_APP: appDir,
      WELLCUM_SMOKE_PROFILE: profile,
      WELLCUM_RECOVERY_PHASE: phase,
      WELLCUM_RECOVERY_WORLD: path.join(temporary, 'world.json'),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = spawnSync(require('electron'), [temporary], {
      cwd: root,
      env,
      stdio: 'inherit',
      timeout: 45000,
    });
    if (run.error || run.status !== 0)
      throw (
        run.error ??
        new Error(`Recovery ${phase} failed: ${run.signal ?? run.status}`)
      );
  }
  console.log(
    `Recovery UI passed for prepared ${pkg.version} on ${process.platform}/${process.arch}; provider is simulated, transport is real loopback.`,
  );
  await writeFile(
    evidence,
    JSON.stringify(
      {
        version: pkg.version,
        checkedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        phases: ['host', 'guest'],
        provider: 'simulated',
        transport: 'real loopback WebSocket',
        sha256: runtime,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
