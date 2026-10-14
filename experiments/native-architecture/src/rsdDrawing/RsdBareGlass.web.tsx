import type { CSSProperties } from 'react';
import { Asset } from 'expo-asset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { glassPanes, type GlassPaneLayout } from '../../../../web/src/lib/glassPaneGeometry';
import handmadePaper from '../../assets/paper/handmade-paper.webp';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { DRAWING_THEMES } from '../drawing/theme';
import { useReducedTransparency } from '../platform/reducedTransparency.web';
import { fullscreenSupported } from '../platform/useFullscreen.web';
import type { BareGlass } from './bareGlassLayout';
import {
  FULLSCREEN_GLASS_MASK,
  FULLSCREEN_GLASS_PX,
  MARGIN_RULE_FIBER,
  MARGIN_RULE_FIBER_PX,
  MARGIN_RULE_GAP_PX,
  MARGIN_RULE_INK_STOPS,
  MARGIN_RULE_SECOND_OFFSET_PX,
  MARGIN_RULE_WIDTH_PX,
  RAIL_GLASS_BLUR_PX,
  STRIP_GLASS_BLUR_PX,
} from './bareGlassStyle';
import { glassPaneLayout, type GlassSpace } from './bareGlassSpace';
import { BARE_GLASS_THEMES, GLASS_FROST } from './bareGlassTheme';
import type { LayoutAxis } from './edgeLayout';
import { PALETTE_FLOWS } from './paletteGeometry';

// Over the paper with the palette bar, as shipping's rules share the rail glass's layer.
const RULE_Z_INDEX = 1;

// The flat style's glass as raw elements: neither React Native's nor React Strict DOM's style types
// carry backdrop-filter, mask-image or mix-blend-mode. Shipping's BareToolbarPaper.svelte and
// GlassPanes.svelte, element for element.

const PAPER_TEXTURE = `url("${Asset.fromModule(handmadePaper).uri}")`;

const backdropBlurs =
  typeof CSS !== 'undefined' &&
  (CSS.supports('backdrop-filter', 'blur(1px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));

type Frost = keyof typeof GLASS_FROST;

// Paper and its grain; where the browser blurs what lies behind, a tint of the paper over that
// blur instead, unless the reader asked for solid surfaces.
function useGlass(frost: Frost, blurPx: number): CSSProperties {
  const appearance = useDrawingAppearance();
  const plain = useReducedTransparency();
  const frosted = backdropBlurs && !plain;
  const blur = frosted ? `blur(${blurPx}px)` : 'none';
  const tint = BARE_GLASS_THEMES[appearance].glassTintRgb;
  return {
    backgroundColor: frosted
      ? `rgb(${tint} / ${GLASS_FROST[frost]})`
      : DRAWING_THEMES[appearance].paper,
    backgroundImage: PAPER_TEXTURE,
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
  };
}

function masked(image: string, size: string, position = '0 0'): CSSProperties {
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskSize: size,
    WebkitMaskSize: size,
    maskPosition: position,
    WebkitMaskPosition: position,
  };
}

type Insets = ReturnType<typeof useSafeAreaInsets>;

// Shipping's rail and rules run to the screen's edges, through the insets the frame pads.
function railBox(axis: LayoutAxis, insets: Insets): CSSProperties {
  return {
    top: -insets.top,
    left: -insets.left,
    right: axis === 'row' ? -insets.right : 0,
    bottom: 0,
  };
}

function marginRule(
  axis: LayoutAxis,
  second: boolean,
  ruleInk: string,
  insets: Insets
): CSSProperties {
  const edge = PALETTE_FLOWS[axis].extentPx;
  const [from, to] = MARGIN_RULE_INK_STOPS;
  const across = axis === 'column' ? '90deg' : '180deg';
  const offset = second ? MARGIN_RULE_GAP_PX : 0;
  const shift = second ? MARGIN_RULE_SECOND_OFFSET_PX : 0;
  const fiber = MARGIN_RULE_FIBER[axis === 'column' ? 'landscape' : 'portrait'];
  return {
    position: 'absolute',
    zIndex: RULE_Z_INDEX,
    pointerEvents: 'none',
    background: `linear-gradient(${across}, transparent, ${ruleInk} ${from}%, ${ruleInk} ${to}%, transparent)`,
    ...(axis === 'column'
      ? {
          top: -insets.top,
          bottom: 0,
          left: edge + offset,
          width: MARGIN_RULE_WIDTH_PX,
          ...masked(fiber, `100% ${MARGIN_RULE_FIBER_PX}px`, `0 ${shift}px`),
        }
      : {
          left: -insets.left,
          right: -insets.right,
          top: edge + offset,
          height: MARGIN_RULE_WIDTH_PX,
          ...masked(fiber, `${MARGIN_RULE_FIBER_PX}px 100%`, `${shift}px 0`),
        }),
  };
}

// The rail glass fills the palette bar, under its swatches, and stands in for the raised plate:
// over the clear wash, as that plate is.
export function RsdRailGlass({ axis }: { axis: LayoutAxis }) {
  const glass = useGlass('glassRail', RAIL_GLASS_BLUR_PX);
  const insets = useSafeAreaInsets();
  return (
    <div
      aria-hidden
      data-testid="rsd-rail-glass"
      style={{ position: 'absolute', pointerEvents: 'none', ...railBox(axis, insets), ...glass }}
    />
  );
}

// The two margin rules print the rail's paper-side edge. They sit in the layout's own stacking
// context, beside the paper rather than inside the bar's, so their blend reaches the ink below.
export function RsdMarginRules({ axis }: { axis: LayoutAxis }) {
  const theme = BARE_GLASS_THEMES[useDrawingAppearance()];
  const insets = useSafeAreaInsets();
  const rule = (second: boolean): CSSProperties => ({
    ...marginRule(axis, second, theme.ruleInk, insets),
    mixBlendMode: theme.ruleBlend,
    opacity: second ? theme.ruleSecondaryOpacity : theme.ruleOpacity,
  });
  return (
    <>
      <div aria-hidden data-testid="rsd-margin-rule" style={rule(false)} />
      <div aria-hidden data-testid="rsd-margin-rule" style={rule(true)} />
    </>
  );
}

// The feathered panes behind the drawer, its open menu and the Settings corner, laid over the paper
// and under every control, and the corner of glass behind the Fullscreen Toggle beside the rail.
export function RsdGlassPanes({ space, glass }: { space: GlassSpace; glass: BareGlass }) {
  const strip = useGlass('glassStrip', STRIP_GLASS_BLUR_PX);
  const fullscreen = fullscreenSupported();
  const layout: GlassPaneLayout | null = glass.panel
    ? glassPaneLayout(space, glass.panel, fullscreen)
    : null;
  const panes = layout ? glassPanes(layout, glass.open, glass.expanded) : [];
  return (
    <>
      {panes.map((pane, index) => (
        <div
          key={index}
          aria-hidden
          data-testid="rsd-glass-pane"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            left: pane.x,
            top: pane.y,
            width: pane.width,
            height: pane.height,
            ...strip,
            backgroundPosition: `${-pane.x}px ${-pane.y}px`,
            ...masked(pane.mask, '100% 100%'),
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
          }}
        />
      ))}
      {fullscreen && layout && !layout.compact ? (
        <div
          aria-hidden
          data-testid="rsd-fullscreen-glass"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            left: layout.orientation === 'portrait' ? 0 : layout.railWidth,
            top: layout.orientation === 'portrait' ? layout.railHeight : 0,
            width: FULLSCREEN_GLASS_PX,
            height: FULLSCREEN_GLASS_PX,
            ...strip,
            ...masked(FULLSCREEN_GLASS_MASK, 'auto'),
          }}
        />
      ) : null}
    </>
  );
}
