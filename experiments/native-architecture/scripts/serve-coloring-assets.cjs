const { constants } = require('node:fs');
const { lstat, open, realpath } = require('node:fs/promises');
const { resolve, relative, isAbsolute, sep } = require('node:path');

const COLORING_PATH = /^\/coloring\/(?:max-1152px\/)?[a-z]+\/[a-z0-9.-]+\.(?:webp|svg)$/;

async function readColoringAsset(root, pathname) {
  const segments = pathname.slice('/coloring/'.length).split('/');
  let current = root;
  let assetStat;
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Symlink root.');
  for (const segment of segments) {
    current = resolve(current, segment);
    assetStat = await lstat(current);
    if (assetStat.isSymbolicLink()) throw new Error('Symlink asset.');
  }
  const canonicalRoot = await realpath(root);
  const canonicalFile = await realpath(current);
  const withinRoot = relative(canonicalRoot, canonicalFile);
  if (!withinRoot || withinRoot.startsWith(`..${sep}`) || isAbsolute(withinRoot))
    throw new Error('Asset outside coloring root.');
  const file = await open(canonicalFile, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const openedStat = await file.stat();
    if (
      !openedStat.isFile() ||
      openedStat.dev !== assetStat.dev ||
      openedStat.ino !== assetStat.ino
    )
      throw new Error('Asset changed at the file boundary.');
    return await file.readFile();
  } finally {
    await file.close();
  }
}

function createColoringAssetsMiddleware(coloringRoot) {
  const root = resolve(coloringRoot);
  return async function serveColoringAssets(request, response, next) {
    const pathname = (request.url ?? '').split('?')[0];
    if (pathname !== '/coloring' && !pathname.startsWith('/coloring/')) return next();
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      response.end();
      return;
    }
    if (pathname.includes('..') || !COLORING_PATH.test(pathname)) {
      response.statusCode = 404;
      response.end();
      return;
    }
    try {
      const bytes = await readColoringAsset(root, pathname);
      response.statusCode = 200;
      response.setHeader(
        'Content-Type',
        pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/webp'
      );
      response.setHeader('Content-Length', bytes.length);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.statusCode = 404;
      response.end();
    }
  };
}

module.exports = { createColoringAssetsMiddleware };
