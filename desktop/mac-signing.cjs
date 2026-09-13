/* oxlint-disable typescript/no-require-imports -- Shared Electron build configuration. */
const path = require('node:path');

function signingOptions(mode = 'adhoc', env = process.env) {
  if (!['adhoc', 'developer-id', 'notarized'].includes(mode))
    throw new Error('Unknown macOS signing mode: ' + mode);
  const signed = mode !== 'adhoc';
  const notarized = mode === 'notarized';
  if (notarized && !env.APPLE_KEYCHAIN_PROFILE?.trim())
    throw new Error(
      'Set APPLE_KEYCHAIN_PROFILE to a validated notarytool Keychain profile before a notarized build.',
    );
  if (signed && env.CSC_NAME === '-')
    throw new Error('A Developer ID build cannot use an ad-hoc identity.');
  return {
    signed,
    notarized,
    mac: {
      identity: signed ? env.CSC_NAME || undefined : '-',
      hardenedRuntime: signed,
      notarize: notarized,
      strictVerify: true,
      preAutoEntitlements: false,
      ...(signed
        ? {
            entitlements: path.join(__dirname, 'entitlements.mac.plist'),
            entitlementsInherit: path.join(__dirname, 'entitlements.mac.plist'),
            binaries: ['Contents/Resources/tunnel/cloudflared'],
          }
        : {}),
    },
  };
}
module.exports = { signingOptions };
