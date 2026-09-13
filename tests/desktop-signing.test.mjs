import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { signingOptions } from '../desktop/mac-signing.cjs';

await test('notarized builds refuse to silently skip Apple authentication', () => {
  assert.throws(
    () => signingOptions('notarized', {}),
    /APPLE_KEYCHAIN_PROFILE/,
  );
  assert.throws(
    () => signingOptions('notarized', { APPLE_KEYCHAIN_PROFILE: '  ' }),
    /APPLE_KEYCHAIN_PROFILE/,
  );
  assert.throws(
    () => signingOptions('developer-id', { CSC_NAME: '-' }),
    /ad-hoc/,
  );
  assert.throws(() => signingOptions('typo', {}), /Unknown/);
  assert.equal(
    signingOptions('notarized', { APPLE_KEYCHAIN_PROFILE: 'local-profile' }).mac
      .notarize,
    true,
  );
});

await test('Developer ID mode hardens app and its bundled tunnel without needing a password in config', () => {
  const options = signingOptions('developer-id', {
    CSC_NAME: 'Developer ID owner',
  });
  assert.equal(options.mac.identity, 'Developer ID owner');
  assert.equal(options.mac.hardenedRuntime, true);
  assert.equal(options.mac.notarize, false);
  assert.deepEqual(options.mac.binaries, [
    'Contents/Resources/tunnel/cloudflared',
  ]);
  const local = signingOptions('adhoc', {});
  assert.equal(local.signed, false);
  assert.equal(local.mac.identity, '-');
});

await test('shipping entitlements allow JIT without debugger or broad runtime exceptions', async () => {
  const xml = await readFile(
    signingOptions('developer-id', {}).mac.entitlements,
    'utf8',
  );
  assert.deepEqual(
    [...xml.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]),
    ['com.apple.security.cs.allow-jit'],
  );
});
