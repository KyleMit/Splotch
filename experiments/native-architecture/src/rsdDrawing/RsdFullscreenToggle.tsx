import { StyleSheet, View } from 'react-native';
import type { useFullscreen } from '../platform/useFullscreen';
import { RsdIconButton } from './RsdIconButton';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';
import { EDGE_INSET_PX } from './edgeLayout';

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
  return (
    <>
      {fullscreen.supported ? (
        <View testID="rsd-fullscreen-dock" style={dock.corner}>
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
