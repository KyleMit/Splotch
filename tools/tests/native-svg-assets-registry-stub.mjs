// react-native-svg's web asset resolver reads Metro's asset registry, which React Native no longer
// ships. Node tests hand its elements string hrefs only, so no packager asset ID is ever registered.
export function getAssetByID() {
  return null;
}
