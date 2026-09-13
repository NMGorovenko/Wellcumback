import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import {
  mkdir,
  copyFile,
  writeFile,
  readFile,
  cp,
  readdir,
} from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../outputs/server/', import.meta.url);
await mkdir(output, { recursive: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: [fileURLToPath(new URL('../server/cli.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('server.mjs', output)),
  bundle: true,
  metafile: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  external: ['bufferutil', 'utf-8-validate'],
});
await copyFile(
  new URL('../drizzle/0000_rooms.sql', import.meta.url),
  new URL('rooms.sql', output),
);
await cp(
  new URL('../desktop/licenses/', import.meta.url),
  new URL('licenses/', output),
  { recursive: true },
);
await cp(
  new URL('../server/deploy/', import.meta.url),
  new URL('deploy/', output),
  { recursive: true },
);
await copyFile(
  new URL('../docs/server.md', import.meta.url),
  new URL('README.md', output),
);
const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
await writeFile(
  new URL('package.json', output),
  JSON.stringify(
    {
      name: 'wellcum-back-server',
      version: pkg.version,
      private: true,
      engines: { node: '>=22.13.0' },
      scripts: { start: 'node server.mjs' },
    },
    null,
    2,
  ) + '\n',
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const deploymentFiles = (
  await readdir(new URL('../server/deploy/', import.meta.url))
).map((file) => `server/deploy/${file}`);
const sources = Object.fromEntries(
  await Promise.all(
    [
      ...Object.keys(result.metafile.inputs),
      'drizzle/0000_rooms.sql',
      'package-lock.json',
      'docs/server.md',
      ...deploymentFiles,
    ].map(async (file) => [
      file,
      hash(await readFile(new URL(`../${file}`, import.meta.url))),
    ]),
  ),
);
const files = Object.fromEntries(
  await Promise.all(
    [
      'server.mjs',
      'rooms.sql',
      'README.md',
      'package.json',
      ...deploymentFiles.map((file) => file.replace('server/', '')),
    ].map(async (file) => [file, hash(await readFile(new URL(file, output)))]),
  ),
);
await writeFile(
  new URL('build.json', output),
  JSON.stringify({ version: pkg.version, sources, files }, null, 2) + '\n',
);
console.log(`Standalone relay ${pkg.version}: outputs/server`);
