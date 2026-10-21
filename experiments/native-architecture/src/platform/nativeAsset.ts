import { Image } from 'react-native';

type BundledAsset = number | string | Readonly<{ uri: string }>;

// A bundled file's URI on the device: an Android resource name or an iOS file URL in a Release
// build, the Metro server's URL in development. Skia's Data.fromURI, React Native's Image and
// react-native-svg's Image each load all three, offline when the file ships in the app.
export function nativeAssetUri(source: BundledAsset): string {
  // Vite, which runs the repository's Node tests, imports a file as its path.
  if (typeof source === 'string') return source;
  const resolved = Image.resolveAssetSource(source);
  if (!resolved) throw new Error(`Bundled asset ${JSON.stringify(source)} did not resolve.`);
  return resolved.uri;
}
