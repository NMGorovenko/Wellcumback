/* oxlint-disable typescript/no-require-imports -- Explicit CommonJS files for the Electron main process/build configuration. */
const path = require('node:path');
const root = path.resolve(__dirname, '..');

module.exports = {
  appId: 'io.github.nmgorovenko.wellcumback',
  productName: 'Wellcum back',
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
  forceCodeSigning: false,
  artifactName: 'Wellcum-back-${version}-${os}-${arch}.${ext}',
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
    // Ad-hoc signature requires no credentials; this is not Developer ID/notarization.
    identity: '-',
    hardenedRuntime: false,
    notarize: false,
  },
  dmg: { sign: false },
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
    artifactName: 'Wellcum-back-${version}-windows-${arch}-portable.${ext}',
  },
  nsis: {
    artifactName: 'Wellcum-back-${version}-windows-${arch}-setup.${ext}',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
  },
};
