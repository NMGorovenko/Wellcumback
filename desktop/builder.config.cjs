/* oxlint-disable typescript/no-require-imports -- Explicit CommonJS files for the Electron main process/build configuration. */
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { signingOptions } = require('./mac-signing.cjs');
const signing = signingOptions(process.env.WELLCUM_MAC_SIGNING);

module.exports = {
  appId: 'io.github.nmgorovenko.wellcumback',
  productName: 'FRIENDSLOP',
  electronVersion: '44.3.0',
  directories: {
    output:
      process.env.WELLCUM_DESKTOP_OUTPUT || path.join(root, 'outputs/desktop'),
  },
  files: [
    'main.cjs',
    'security.cjs',
    'preload.cjs',
    'network.cjs',
    'rooms.sql',
    'licenses/**',
    'renderer/index.html',
    'renderer/build.json',
    'package.json',
  ],
  asar: true,
  npmRebuild: false,
  forceCodeSigning: signing.signed,
  artifactName: 'FRIENDSLOP-${version}-${os}-${arch}.${ext}',
  mac: {
    extraResources: [
      {
        from: path.join(
          root,
          'outputs/dependencies/cloudflared/2026.9.1/darwin-${arch}/cloudflared',
        ),
        to: 'tunnel/cloudflared',
      },
    ],
    target: ['zip', 'dmg'],
    category: 'public.app-category.games',
    ...signing.mac,
  },
  dmg: { sign: signing.signed },
  win: {
    extraResources: [
      {
        from: path.join(
          root,
          'outputs/dependencies/cloudflared/2026.9.1/win32-${arch}/cloudflared.exe',
        ),
        to: 'tunnel/cloudflared.exe',
      },
    ],
    target: ['portable', 'nsis'],
    requestedExecutionLevel: 'asInvoker',
    signExecutable: false,
  },
  portable: {
    artifactName: 'FRIENDSLOP-${version}-windows-${arch}-portable.${ext}',
  },
  nsis: {
    artifactName: 'FRIENDSLOP-${version}-windows-${arch}-setup.${ext}',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
  },
};
