import { nativeAssetUri } from './nativeAsset';

const DEV_SERVER_URL = /^https?:/;

// A text file that ships in the app, read in place without the network: expo-file-system's legacy
// reader opens an Android raw resource by its bare name and an iOS file URL inside the app. Only a
// development build resolves the asset to the Metro server's URL. expo-asset's downloadAsync is no
// substitute: it reports an SVG's Android resource name as already local because Metro records SVG
// dimensions, and the new File API rejects that name.
export async function readBundledText(asset: number | string): Promise<string> {
  const uri = nativeAssetUri(asset);
  if (DEV_SERVER_URL.test(uri)) return (await fetch(uri)).text();
  const { readAsStringAsync } = await import('expo-file-system/legacy');
  return readAsStringAsync(uri);
}
