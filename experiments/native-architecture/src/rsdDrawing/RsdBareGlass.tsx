import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { glassPaneShapes } from '../../../../web/src/lib/glassPaneGeometry';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { PaperTexture } from '../drawing/PaperTexture';
import type { BareGlass } from './bareGlassLayout';
import { glassPaneLayout, type GlassSpace } from './bareGlassSpace';
import { GLASS_PANE_INKS } from './glassPaneInk';
import { glassPaneImage } from './glassPaneImage';
import { glassPanePng } from './glassPanePng';
import { glassPaneRaster, paneImagePlace } from './glassPaneRaster';
import { MARGIN_RULE_GAP_PX, MARGIN_RULE_INK_STOPS, MARGIN_RULE_WIDTH_PX } from './bareGlassStyle';
import { MARGIN_RULE_INKS } from './marginRuleInk';
import type { LayoutAxis } from './edgeLayout';
import { PALETTE_FLOWS } from './paletteGeometry';
import { RsdPaneImages } from './RsdPaneImages';

const styles = StyleSheet.create({
  fill: { position: 'absolute', bottom: 0 },
  column: { bottom: 0, left: PALETTE_FLOWS.column.extentPx, width: MARGIN_RULE_WIDTH_PX },
  row: { top: PALETTE_FLOWS.row.extentPx, height: MARGIN_RULE_WIDTH_PX },
  // Over the paper with the palette bar, as shipping's rules share the rail glass's layer.
  rule: { position: 'absolute', zIndex: 1 },
  panes: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
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

// The feathered panes behind the drawer, its open menu and the Settings corner, fading the ink
// under them as shipping's do: each pane one image of shipping's mask and textured frost, never
// blended, blurred live or made translucent as a group, so Android draws nothing offscreen on the
// frames of a stroke. Shipping's geometry is the layout's, so each pane shifts back into the paper
// area that holds it.
export function RsdGlassPanes({ space, glass }: { space: GlassSpace; glass: BareGlass }) {
  const theme = useDrawingAppearance();
  // Keep the mean coat if the bundled tile fails.
  const ink = GLASS_PANE_INKS[theme];
  const { left: frameLeft, top: frameTop } = useSafeAreaInsets();
  const { width, height, insetBottom, paperTop, paperLeft } = space;
  const { panel, open, expanded, fullscreen } = glass;
  const panes = useMemo(() => {
    if (!panel) return [];
    const layout = glassPaneLayout(
      { width, height, insetBottom, paperTop, paperLeft },
      panel,
      fullscreen
    );
    return glassPaneShapes(layout, open, expanded).flatMap((shape) => {
      const raster = glassPaneRaster(shape, ink.alpha);
      const mask = glassPaneRaster(shape, 1);
      if (!raster || !mask) return [];
      const { x, y, width: across, height: down } = raster.box;
      return [
        {
          uri: glassPanePng(raster, ink.rgb),
          raster: mask,
          origin: { x: frameLeft + x, y: frameTop + y },
          box: { left: x - paperLeft, top: y - paperTop, width: across, height: down },
          image: paneImagePlace(raster),
        },
      ];
    });
  }, [
    width,
    height,
    insetBottom,
    paperTop,
    paperLeft,
    panel,
    open,
    expanded,
    fullscreen,
    ink,
    frameLeft,
    frameTop,
  ]);
  const [textured, setTextured] = useState<{
    panes: typeof panes;
    images: readonly (string | null)[];
  }>();
  useEffect(() => {
    let active = true;
    void Promise.all(
      panes.map(({ raster, origin }) => glassPaneImage(raster, theme, origin).catch(() => null))
    ).then((images) => {
      if (active) setTextured({ panes, images });
    });
    return () => {
      active = false;
    };
  }, [panes, theme]);
  // Offer the mean coat while composition runs so new controls attenuate ink without waiting.
  const images = useMemo(
    () =>
      panes.map(({ uri, box, image }, index) => {
        const texture = textured?.panes === panes ? textured.images[index] : null;
        return {
          uri: texture ?? uri,
          box,
          image: texture ? { left: 0, top: 0, width: box.width, height: box.height } : image,
        };
      }),
    [panes, textured]
  );
  return (
    <View pointerEvents="none" style={styles.panes}>
      <RsdPaneImages panes={images} />
    </View>
  );
}
