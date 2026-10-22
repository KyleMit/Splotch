const PRODUCTION_API_ORIGIN = 'https://splotch.art';
const TEST_API_ORIGINS = ['https://test.splotch.art', 'https://test--splotchy.netlify.app'];

function readApiOrigin(env, storeBuild = false) {
  const value = env.EXPO_PUBLIC_SPLOTCH_API_ORIGIN ?? PRODUCTION_API_ORIGIN;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_SPLOTCH_API_ORIGIN must be an HTTPS origin');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('EXPO_PUBLIC_SPLOTCH_API_ORIGIN must be an HTTPS origin');
  if (storeBuild && url.origin !== PRODUCTION_API_ORIGIN)
    throw new Error('Store builds must use the production API origin');
  return url.origin;
}

module.exports = { readApiOrigin, PRODUCTION_API_ORIGIN, TEST_API_ORIGINS };
