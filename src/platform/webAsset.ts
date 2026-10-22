type BundledAsset = number | string | Readonly<{ uri: string }>;

// The URL of a bundled file on the web export. Expo's web asset transform
// (@expo/metro-config's asset-transformer.js) exports an image as { uri, width, height } and any
// other file as its URL, the two shapes expo-asset's Asset.fromModule(...).uri reads on web, so
// web modules read the URL here and expo-asset stays out of the web bundle and its startup path.
// native-web-expo-runtime.test.mjs pins both shapes to the transform.
export function webAssetUri(source: BundledAsset): string {
  if (typeof source === 'string') return source;
  if (typeof source === 'object') return source.uri;
  throw new Error(`Asset ${source} is a native asset id, which the web export never bundles.`);
}
