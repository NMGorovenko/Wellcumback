/* oxlint-disable typescript/no-require-imports -- Explicit CommonJS files for the Electron main process/build configuration. */
const { createHash } = require('node:crypto');

const GAME_URL = 'wellcum://game/index.html';
const GAME_ORIGIN = 'wellcum://game';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

// Compare the complete authority; URL.origin is "null" for custom schemes in Node.
function isGameURL(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'wellcum:' &&
      url.hostname === 'game' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === '/index.html' &&
      !url.search
    );
  } catch {
    return false;
  }
}

function isGameOrigin(value) {
  return value === GAME_ORIGIN || isGameURL(value);
}

function prepareRenderer(html, manifest, version) {
  if (
    manifest.version !== version ||
    manifest.html_bytes !== Buffer.byteLength(html) ||
    manifest.html_sha256 !== sha256(html)
  ) {
    throw new Error(
      'Portable HTML does not match its build manifest/version. Rebuild it.',
    );
  }
  const scripts = [
    ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi),
  ];
  if (scripts.length !== 1 || scripts[0][1].trim()) {
    throw new Error('Desktop renderer must contain exactly one inline script.');
  }
  const policyTags = [
    ...html.matchAll(
      /<meta http-equiv="Content-Security-Policy" content="[^"]*">/g,
    ),
  ];
  if (policyTags.length !== 1)
    throw new Error('Expected the portable CSP meta tag.');
  const hash = createHash('sha256').update(scripts[0][2]).digest('base64');
  const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; worker-src blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const document = html.replace(
    policyTags[0][0],
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );
  return {
    html: document,
    manifest: {
      version,
      source_html_sha256: manifest.html_sha256,
      html_sha256: sha256(document),
      csp,
    },
  };
}

function verifyRenderer(html, manifest, version) {
  if (
    manifest.version !== version ||
    manifest.html_sha256 !== sha256(html) ||
    typeof manifest.csp !== 'string' ||
    !html.includes(
      `<meta http-equiv="Content-Security-Policy" content="${manifest.csp}">`,
    )
  ) {
    throw new Error(
      'The packaged game is incomplete or damaged. Please reinstall it.',
    );
  }
}

function rendererResponse(request, html, csp) {
  if (!isGameURL(request.url))
    return new Response('Not found', { status: 404 });
  if (request.method !== 'GET')
    return new Response('Method not allowed', { status: 405 });
  // No request path is ever converted to a filesystem path.
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': csp,
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  });
}

module.exports = {
  GAME_URL,
  GAME_ORIGIN,
  isGameURL,
  isGameOrigin,
  prepareRenderer,
  verifyRenderer,
  rendererResponse,
};
