// A text file that ships in the app, read without the network: expo-asset hands back the iOS
// bundle's own file, or on Android a cache copy of the raw resource made on first read.
export async function readBundledText(asset: number | string): Promise<string> {
  const [{ Asset }, { File }] = await Promise.all([
    import('expo-asset'),
    import('expo-file-system'),
  ]);
  const { localUri } = await Asset.fromModule(asset).downloadAsync();
  if (!localUri) throw new Error('A bundled text file is unavailable.');
  return new File(localUri).text();
}
