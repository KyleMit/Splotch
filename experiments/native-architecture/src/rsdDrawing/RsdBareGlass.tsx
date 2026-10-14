import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { PaperTexture } from '../drawing/PaperTexture';
import type { BareGlass } from './bareGlassLayout';
import type { GlassSpace } from './bareGlassSpace';
import { MARGIN_RULE_GAP_PX, MARGIN_RULE_INK_STOPS, MARGIN_RULE_WIDTH_PX } from './bareGlassStyle';
import { MARGIN_RULE_INKS } from './marginRuleInk';
import type { LayoutAxis } from './edgeLayout';
import { PALETTE_FLOWS } from './paletteGeometry';

const styles = StyleSheet.create({
  fill: { position: 'absolute', bottom: 0 },
  column: { bottom: 0, left: PALETTE_FLOWS.column.extentPx, width: MARGIN_RULE_WIDTH_PX },
  row: { top: PALETTE_FLOWS.row.extentPx, height: MARGIN_RULE_WIDTH_PX },
  // Over the paper with the palette bar, as shipping's rules share the rail glass's layer.
  rule: { position: 'absolute', zIndex: 1 },
});

// The native renderers have no backdrop blur, so the rail takes shipping's own fallback for a
// browser without one: the paper and its grain, opaque, hiding ink under the swatches as the
// raised plate does. It runs to the screen's edges, through the insets the frame pads.
export function RsdRailGlass({ axis }: { axis: LayoutAxis }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="rsd-rail-glass"
      pointerEvents="none"
      style={[
        styles.fill,
        { top: -insets.top, left: -insets.left, right: axis === 'row' ? -insets.right : 0 },
      ]}
    >
      <PaperTexture />
    </View>
  );
}

// The rail's printed edge, over the paper beside the bar. The rules print without the fiber mask,
// which needs CSS masking, and in their blend's pre-mixed ink (marginRuleInk.ts).
export function RsdMarginRules({ axis }: { axis: LayoutAxis }) {
  const inks = MARGIN_RULE_INKS[useDrawingAppearance()];
  const [from, to] = MARGIN_RULE_INK_STOPS;
  const across = axis === 'column' ? '90deg' : '180deg';
  const insets = useSafeAreaInsets();
  const rule = (second: boolean): ViewStyle => {
    const { rgb, alpha } = second ? inks.second : inks.first;
    const [clear, ink] = [`rgb(${rgb} / 0)`, `rgb(${rgb} / ${alpha})`];
    return {
      experimental_backgroundImage: `linear-gradient(${across}, ${clear}, ${ink} ${from}%, ${ink} ${to}%, ${clear})`,
      ...(second &&
        (axis === 'column'
          ? { marginLeft: MARGIN_RULE_GAP_PX }
          : { marginTop: MARGIN_RULE_GAP_PX })),
    };
  };
  const reach =
    axis === 'column' ? { top: -insets.top } : { left: -insets.left, right: -insets.right };
  return (
    <>
      <View pointerEvents="none" style={[styles.rule, styles[axis], reach, rule(false)]} />
      <View pointerEvents="none" style={[styles.rule, styles[axis], reach, rule(true)]} />
    </>
  );
}

// The feathered panes need a blurred mask the native renderers cannot draw, so the native flat
// style leaves the paper under its drawer, menus and Settings corner unfrosted.
export function RsdGlassPanes(_props: { space: GlassSpace; glass: BareGlass }) {
  return null;
}
