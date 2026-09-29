// The bare `<site>.netlify.app` hostname serves production; only the `--` form is a deploy or
// branch preview. Unknown remote hosts stay read-only because every deploy shares one Blobs store.
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

export function shouldWriteBlobsProbe(targetUrl) {
  const { hostname, protocol } = new URL(targetUrl);
  return (
    (protocol === 'https:' && NETLIFY_PREVIEW_HOSTNAME.test(hostname)) ||
    isLoopbackHostname(hostname)
  );
}
