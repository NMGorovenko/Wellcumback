/** Build the existing game as one offline HTML file. No server or account needed. */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'outputs', 'portable');
const assets = new Map();
const mime = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};
const publicImage =
  /(['"])(\/(?:characters|materials)\/[^'"\n]+\.(png|jpe?g|svg|webp))\1/g;

const result = await build({
  configFile: false,
  root,
  publicDir: false,
  resolve: { alias: { '@': root } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [
    {
      name: 'embed-portable-images',
      async transform(source, id) {
        if (id.includes('node_modules') || !/\.[tj]sx?$/.test(id)) return;
        const matches = [...source.matchAll(publicImage)];
        if (!matches.length) return;
        for (const [, , url, extension] of matches) {
          if (assets.has(url)) continue;
          const file = path.resolve(root, 'public', '.' + url);
          if (!file.startsWith(path.join(root, 'public') + path.sep))
            throw new Error(`Invalid image path: ${url}`);
          const bytes = await readFile(file);
          assets.set(url, {
            uri: `data:${mime[extension]};base64,${bytes.toString('base64')}`,
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          });
        }
        return {
          code: source.replace(publicImage, (_, _quote, url) =>
            JSON.stringify(assets.get(url).uri),
          ),
          map: null,
        };
      },
    },
    react(),
  ],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    write: false,
    sourcemap: false,
    minify: true,
    lib: {
      entry: path.join(root, 'portable', 'entry.tsx'),
      name: 'WellcumBack',
      formats: ['iife'],
    },
  },
});

const bundles = Array.isArray(result) ? result : [result];
const files = bundles.flatMap((bundle) => bundle.output);
const chunks = files.filter((file) => file.type === 'chunk');
if (
  chunks.length !== 1 ||
  chunks[0].imports.length ||
  chunks[0].dynamicImports.length
) {
  throw new Error(
    'Portable game must contain exactly one script with no external imports',
  );
}
const styles = files.filter(
  (file) => file.type === 'asset' && file.fileName.endsWith('.css'),
);
if (!styles.length)
  throw new Error('Portable game is missing its compiled styles');
const unexpected = files.filter(
  (file) => file.type === 'asset' && !file.fileName.endsWith('.css'),
);
if (unexpected.length)
  throw new Error(
    `Unembedded assets: ${unexpected.map((file) => file.fileName).join(', ')}`,
  );
const css = styles.map((file) => String(file.source)).join('\n');
if (/@import\s|url\(\s*['"]?(?!data:|#)/i.test(css))
  throw new Error('Styles request an external resource');

const version = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
).version;
const icon = (
  await readFile(path.join(root, 'public', 'favicon.svg'))
).toString('base64');
const script = chunks[0].code.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; worker-src blob:">
<meta name="game-version" content="${version}">
<title>Ну, с возвращением! — Вечер историй</title>
<link rel="icon" href="data:image/svg+xml;base64,${icon}">
<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
</head><body><div id="game"></div><noscript>Для игры нужно включить JavaScript в браузере.</noscript>
<script>${script}</script></body></html>`;

await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'Wellcum-back.html'), html);
await writeFile(
  path.join(output, 'README.txt'),
  `НУ, С ВОЗВРАЩЕНИЕМ! — ${version}\n\nРаспакуй архив и открой Wellcum-back.html в обычном браузере на компьютере.\nНичего устанавливать не нужно. Интернет и аккаунт ChatGPT не нужны.\nЕсли файл открылся текстом, выбери «Открыть с помощью» и свой браузер.\nЗапускай скачанный файл, а не предпросмотр внутри мессенджера.\n\nНа карте подъедь к истории или открой «Все истории». Выбери 1, 2 или 3 игроков за одним экраном.\nИгрок 1: WASD + E, игрок 2: стрелки + Enter, игрок 3: IJKL + O.\nQ — отвёртка / сдержаться. Esc — пауза. F — полный экран. Клавиши меняются в настройках игры.\nГеймпад: стик, A/×, RB/R1, B/○ или Start.\nПервый щелчок по игре включает звук.\n\nРезультаты сохраняются в браузере, если он разрешает хранение для локальных файлов.\nМини-игры локальные: друзья играют за одним компьютером. Для сетевых города, экрана, казармы и переезда скачайте настольное приложение или откройте веб-версию. Самостоятельный HTML работает офлайн. Связь через разные физические сети пока не подтверждена.\n`,
);
await writeFile(
  path.join(output, 'build.json'),
  JSON.stringify(
    {
      version,
      html_bytes: Buffer.byteLength(html),
      html_sha256: createHash('sha256').update(html).digest('hex'),
      embedded_assets: [...assets].map(([url, value]) => ({
        url,
        bytes: value.bytes,
        sha256: value.sha256,
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Portable game: ${path.join(output, 'Wellcum-back.html')} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MiB)`,
);
