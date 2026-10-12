// The bare `<site>.netlify.app` hostname serves production; only the `--` form is a deploy or
// branch preview, and a loopback test server stands in for one. A preview pairs one ref with one
// deploy, so it takes the Blobs probe write and must serve the checked-out version exactly. Every
// other target, unknown remote hosts included, stays read-only because every deploy shares one Blobs
// store, and may trail the docs-only commits that ADR-0070's build filter skips.
const NETLIFY_PREVIEW_HOSTNAME = /--[\w-]+\.netlify\.app$/;
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

// Both deployed entries post the admin secret in the login body, so a target must be https before
// any request is made. The test-only escape hatch admits plain http on a loopback fixture server.
export function parseAdminSecretTarget(base) {
  let target;
  try {
    target = new URL(base);
  } catch {
    return null;
  }
  if (target.protocol === 'https:') return target;
  const allowHttpForTests = process.env.DEPLOY_SMOKE_ALLOW_HTTP_FOR_TESTS === '1';
  return allowHttpForTests && target.protocol === 'http:' && isLoopbackHostname(target.hostname)
    ? target
    : null;
}

export function isPreviewTarget(targetUrl) {
  const { hostname, protocol } = new URL(targetUrl);
  return (
    (protocol === 'https:' && NETLIFY_PREVIEW_HOSTNAME.test(hostname)) ||
    isLoopbackHostname(hostname)
  );
}

// An explicit `true` or `false` override wins over the target; any other non-empty value is a
// config error (null) rather than a silent fallback to either rule.
export function requiresCurrentVersion(targetUrl, override) {
  if (override === undefined || override === '') return isPreviewTarget(targetUrl);
  if (override === 'true' || override === 'false') return override === 'true';
  return null;
}
