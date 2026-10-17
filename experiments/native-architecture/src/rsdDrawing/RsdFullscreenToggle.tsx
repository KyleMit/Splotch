import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { useFullscreen } from '../platform/useFullscreen';
import { RsdIconButton } from './RsdIconButton';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';
import { EDGE_INSET_PX } from './edgeLayout';
import { PALETTE_FLOWS } from './paletteGeometry';
import { useBareToolbar } from './toolbarSkin';

// The shipping Fullscreen Toggle: a muted corner button in the paper area's top-left corner, under
// the rest of the chrome, shown only where useFullscreen offers immersive fullscreen. Its owner holds
// the fullscreen state, so the flat style's glass reads the same eligibility the toggle shows.
const dock = StyleSheet.create({
  corner: { position: 'absolute', top: EDGE_INSET_PX, left: EDGE_INSET_PX },
});

export function RsdFullscreenToggle({
  fullscreen,
}: {
  fullscreen: ReturnType<typeof useFullscreen>;
}) {
  const window = useWindowDimensions();
  const bare = useBareToolbar();
  const paletteTop = bare && window.height >= window.width ? PALETTE_FLOWS.row.extentPx : 0;
  return (
    <>
      {fullscreen.supported ? (
        <View
          testID="rsd-fullscreen-dock"
          style={[dock.corner, { top: EDGE_INSET_PX + paletteTop }]}
        >
          <RsdIconButton
            skin="corner"
            icon={fullscreen.active ? 'fullscreen-exit' : 'fullscreen'}
            label={fullscreen.label}
            onPress={() => {
              fullscreen.toggle();
            }}
          />
        </View>
      ) : null}
      {fullscreen.message ? <RsdVisuallyHidden live>{fullscreen.message}</RsdVisuallyHidden> : null}
    </>
  );
}
