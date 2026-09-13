/** Verify the packaged signed bundle, keeping upstream and signed helper hashes separate. */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export function checked(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0)
    throw (
      result.error ??
      new Error(`${command} failed: ${result.stderr || result.stdout}`)
    );
  return result.stdout + result.stderr;
}

export function signatureInfo(file) {
  checked('codesign', ['--verify', '--deep', '--strict', file]);
  const details = checked('codesign', ['--display', '--verbose=4', file]);
  const team = details.match(/^TeamIdentifier=(.+)$/m)?.[1];
  const authority = details.match(
    /^Authority=(Developer ID Application:.+)$/m,
  )?.[1];
  const timestamp = details.match(/^Timestamp=(.+)$/m)?.[1];
  if (
    !authority ||
    !team ||
    team === 'not set' ||
    !timestamp ||
    !details.includes('(runtime)')
  )
    throw new Error(
      'Developer ID, hardened runtime and timestamp required: ' + file,
    );
  const entitlements = checked('codesign', [
    '--display',
    '--entitlements',
    ':-',
    file,
  ]);
  if (entitlements.includes('com.apple.security.get-task-allow'))
    throw new Error('Debug entitlement must not ship: ' + file);
  return { authority, team, timestamp };
}

export async function verifyMacBundle(app, notarized = false) {
  const identity = signatureInfo(app);
  const helper = path.join(app, 'Contents/Resources/tunnel/cloudflared');
  const tunnelIdentity = signatureInfo(helper);
  if (tunnelIdentity.team !== identity.team)
    throw new Error(
      'Application and tunnel must belong to the same Developer ID team.',
    );
  if (notarized) {
    checked('xcrun', ['stapler', 'validate', app]);
    checked('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
  }
  return {
    mode: notarized ? 'notarized' : 'developer-id',
    ...identity,
    appStapled: notarized,
    tunnel: {
      ...tunnelIdentity,
      binary_sha256: createHash('sha256')
        .update(await readFile(helper))
        .digest('hex'),
    },
  };
}

export function notarizeDmg(dmg, env = process.env) {
  const args = ['--keychain-profile', env.APPLE_KEYCHAIN_PROFILE];
  if (env.APPLE_KEYCHAIN) args.push('--keychain', env.APPLE_KEYCHAIN);
  const result = JSON.parse(
    checked('xcrun', [
      'notarytool',
      'submit',
      dmg,
      ...args,
      '--wait',
      '--output-format',
      'json',
    ]),
  );
  if (result.status !== 'Accepted')
    throw new Error(
      `Apple did not accept DMG submission ${result.id}: ${result.status}`,
    );
  const log = JSON.parse(
    checked('xcrun', ['notarytool', 'log', result.id, ...args]),
  );
  if (log.status !== 'Accepted')
    throw new Error('Unexpected Apple submission log status.');
  checked('xcrun', ['stapler', 'staple', dmg]);
  checked('xcrun', ['stapler', 'validate', dmg]);
  checked('codesign', ['--verify', '--verbose=2', dmg]);
  checked('spctl', [
    '--assess',
    '--type',
    'open',
    '--context',
    'context:primary-signature',
    '--verbose=2',
    dmg,
  ]);
  return {
    submission: result.id,
    status: result.status,
    stapled: true,
    issues: log.issues ?? [],
  };
}
