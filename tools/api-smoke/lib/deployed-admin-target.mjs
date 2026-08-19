// The bare `<site>.netlify.app` hostname serves production; only the `--` form is a deploy or
// branch preview. Unknown remote hosts stay read-only because every deploy shares one Blobs store.
const NETLIFY_PREVIEW_HOSTNAME = /--[\w-]+\.netlify\.app$/;
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function shouldWriteBlobsProbe(targetUrl) {
  const { hostname, protocol } = new URL(targetUrl);
  return (
    (protocol === 'https:' && NETLIFY_PREVIEW_HOSTNAME.test(hostname)) ||
    LOOPBACK_HOSTNAMES.has(hostname)
  );
}
