import { useEffect, useRef } from 'react';
import { css, html } from 'react-strict-dom';
import { Animated, Easing } from '../platform/animated';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { DRAWING_BRAND, DRAWING_SCALE } from '../drawing/theme';
import { greyedColor } from './greyed';
import { RsdIcon } from './RsdIcon';
import { RsdPressable } from './RsdPressable';
import type { NativeIconName } from './icons.generated';
import { useBareToolbar } from './toolbarSkin';
import { brandColors, colors, dimensions, fonts, motion, shadows } from './tokens.css';

// The app.css chrome values that no design token carries. They stay in this module because the
// StyleX web compile resolves only local constants and token files inside css.create;
// tools/tests/native-button-chrome.test.mjs reads app.css and fails on divergence.
export const CORNER_BUTTON_SIZE_PX = 48;
// Whole-button opacity over a full-ink glyph; idle is the floor that keeps the glyph above 3:1.
export const CORNER_IDLE_OPACITY = 0.5;
export const CORNER_HOVER_OPACITY = 0.7;
export const CORNER_PRESSED_OPACITY = 1;
export const ACTION_TILE_BORDER_PX = 2;
export const ACTION_TILE_RADIUS_RATIO = 0.3;
// The icon keeps a sixth of the face as padding on each side.
export const ACTION_TILE_PADDING_SHARE = 6;
export const ACTION_TILE_PRESS_SCALE = 0.95;
// Deeper than the shared disabled opacity: a parked canvas control must not read as live.
export const ACTION_TILE_DISABLED_OPACITY = 0.3;
// While a Brush or Stroke Width menu is open, the panel's other tiles grey out and its chevron
// fades further, so the open menu and the button it grew from read as the one live thing.
export const FLYOUT_OPEN_TILE_OPACITY = 0.35;
export const FLYOUT_OPEN_TILE_FILTER = 'grayscale(1)';
export const FLYOUT_OPEN_CORNER_OPACITY = 0.2;
// Shipping mixes --brand into transparent; React Native has no color-mix(), so the mixes are
// resolved against the unthemed brand hue.
export const ACTION_TILE_HOVER_SHADOW = '0 4px 12px rgba(171, 113, 225, 0.3)';
export const BRAND_SELECTION_RING = '0 0 0 2px rgba(171, 113, 225, 0.35)';
// An option's base never drops below this; its padding is the second value times Button Size.
export const FLYOUT_OPTION_MIN_BASE_PX = 60;
export const FLYOUT_OPTION_PADDING_PX = 7;
export const FLYOUT_OPTION_PRESS_SCALE = 0.92;
// Black reads against every pen color and both papers.
export const WHITE_INK_KEYLINE = '#000';
// The flat (bare) Button style: ink printed on the paper with no face of its own. The icon keeps a
// tenth of the button as padding; a press sinks it, an open menu's button and a hovered one lift,
// and a parked one washes out instead of fading. A flat menu's selected option is outlined in the
// strong text ink, one drop shadow this far out on each side.
export const BARE_TILE_PADDING_SHARE = 10;
export const BARE_TILE_PRESS_SCALE = 0.9;
export const BARE_TILE_LIFT_SCALE = 1.08;
export const BARE_TILE_DISABLED_FILTER = 'grayscale(1) contrast(0.55) brightness(1.2)';
export const BARE_OPTION_OUTLINE_PX = 2;
export const BARE_BADGE_RING_PX = 2;

// The shipping icon-button skins: .corner-button, the Actions Panel's .action-button tile and
// .flyout-option. Hover is web-only, under (hover: hover), which React Native never matches. Every
// press is an RSD :active transition, driven natively by RsdPressable. The native renderer
// animates only the listed properties named by their camelCase style key, so the kebab-case
// color and shadow names reach the web's CSS transition alone and transform and opacity run on
// the native driver: one render as the press starts and one as it ends, none per frame.
const styles = css.create({
  base: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'solid',
    cursor: 'pointer',
    transitionTimingFunction: 'ease',
  },
  corner: {
    width: CORNER_BUTTON_SIZE_PX,
    height: CORNER_BUTTON_SIZE_PX,
    padding: dimensions.space2,
    borderWidth: 0,
    backgroundColor: 'transparent',
    opacity: {
      default: CORNER_IDLE_OPACITY,
      ':active': CORNER_PRESSED_OPACITY,
      '@media (hover: hover)': {
        default: CORNER_IDLE_OPACITY,
        ':hover': CORNER_HOVER_OPACITY,
        ':active': CORNER_PRESSED_OPACITY,
      },
    },
    transitionProperty: 'opacity',
    transitionDuration: motion.durationBase,
  },
  tile: {
    position: 'relative',
    borderWidth: ACTION_TILE_BORDER_PX,
    backgroundColor: {
      default: colors.floatSurface,
      ':active': colors.brandWash,
      '@media (hover: hover)': {
        default: colors.floatSurface,
        ':hover': colors.floatSurfaceHover,
        ':active': colors.brandWash,
      },
    },
    borderColor: {
      default: colors.floatBorder,
      '@media (hover: hover)': { default: colors.floatBorder, ':hover': brandColors.brand },
    },
    boxShadow: {
      default: colors.floatShadow,
      '@media (hover: hover)': { default: colors.floatShadow, ':hover': ACTION_TILE_HOVER_SHADOW },
    },
    opacity: 1,
    transform: { default: 'scale(1)', ':active': `scale(${ACTION_TILE_PRESS_SCALE})` },
    transitionProperty: 'transform, opacity, background-color, border-color, box-shadow',
    transitionDuration: motion.durationBase,
  },
  // Hovering a selected tile still shows the hover treatment, as shipping's more specific
  // hover rule wins over its .active rule.
  tileSelected: {
    backgroundColor: {
      default: colors.brandWash,
      '@media (hover: hover)': {
        default: colors.brandWash,
        ':hover': colors.floatSurfaceHover,
        ':active': colors.brandWash,
      },
    },
    borderColor: brandColors.brand,
    boxShadow: {
      default: BRAND_SELECTION_RING,
      '@media (hover: hover)': {
        default: BRAND_SELECTION_RING,
        ':hover': ACTION_TILE_HOVER_SHADOW,
      },
    },
  },
  tileDimmed: { opacity: FLYOUT_OPEN_TILE_OPACITY, filter: FLYOUT_OPEN_TILE_FILTER },
  // Both fades at once: shipping's filter opacity multiplies the disabled opacity.
  tileDimmedDisabled: { opacity: ACTION_TILE_DISABLED_OPACITY * FLYOUT_OPEN_TILE_OPACITY },
  cornerDimmed: { opacity: FLYOUT_OPEN_CORNER_OPACITY },
  tileDisabled: {
    backgroundColor: colors.floatSurfaceHover,
    borderColor: colors.floatBorder,
    boxShadow: colors.floatShadow,
    opacity: ACTION_TILE_DISABLED_OPACITY,
    transform: 'scale(1)',
    cursor: 'auto',
  },
  flyout: {
    borderWidth: ACTION_TILE_BORDER_PX,
    backgroundColor: {
      default: colors.floatSurface,
      '@media (hover: hover)': { default: colors.floatSurface, ':hover': colors.brandWash },
    },
    borderColor: {
      default: colors.floatBorder,
      '@media (hover: hover)': { default: colors.floatBorder, ':hover': brandColors.brand },
    },
    transform: { default: 'scale(1)', ':active': `scale(${FLYOUT_OPTION_PRESS_SCALE})` },
    transitionProperty: 'transform, background-color, border-color, box-shadow',
    transitionDuration: motion.durationFast,
  },
  flyoutSelected: {
    backgroundColor: colors.brandWash,
    borderColor: brandColors.brand,
    boxShadow: BRAND_SELECTION_RING,
  },
  face: (size: number, padding: number) => ({
    width: size,
    height: size,
    padding,
    borderRadius: size * ACTION_TILE_RADIUS_RATIO,
  }),
  turn: (degrees: number) => ({ transform: `rotate(${degrees}deg)` }),
  bare: { borderWidth: 0, backgroundColor: 'transparent', boxShadow: 'none' },
  bareTile: {
    opacity: 1,
    transform: {
      default: 'scale(1)',
      ':active': `scale(${BARE_TILE_PRESS_SCALE})`,
      '@media (hover: hover)': {
        default: 'scale(1)',
        ':hover': `scale(${BARE_TILE_LIFT_SCALE})`,
        ':active': `scale(${BARE_TILE_PRESS_SCALE})`,
      },
    },
    transitionProperty: 'transform, filter',
    transitionTimingFunction: motion.easeGlide,
  },
  bareTileExpanded: {
    transform: {
      default: `scale(${BARE_TILE_LIFT_SCALE})`,
      ':active': `scale(${BARE_TILE_PRESS_SCALE})`,
    },
  },
  bareTileDisabled: { filter: BARE_TILE_DISABLED_FILTER, transform: 'scale(1)', cursor: 'auto' },
  outlined: (size: number, filter: string) => ({ width: size, height: size, filter }),
  // app.css's .free-count on the AI Image Button's corner.
  badge: (offset: number, size: number, padding: number) => ({
    boxSizing: 'border-box',
    position: 'absolute',
    top: offset,
    right: offset,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: size,
    height: size,
    paddingLeft: padding,
    paddingRight: padding,
    borderRadius: dimensions.radiusPill,
    backgroundColor: colors.brandSolid,
    color: brandColors.onBrand,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    lineHeight: 1,
    boxShadow: shadows.shadowControl,
  }),
  // A flat badge sits on the paper, ringed in paper to lift it off the ink beneath.
  bareBadge: (paper: string) => ({ boxShadow: `0 0 0 ${BARE_BADGE_RING_PX}px ${paper}` }),
  // The open menu's greyed tile greys its badge too, where the renderer has no grayscale filter.
  greyBadge: (backgroundColor: string) => ({ backgroundColor }),
});

function outlineFilter(ink: string) {
  return [
    `${BARE_OPTION_OUTLINE_PX}px 0`,
    `-${BARE_OPTION_OUTLINE_PX}px 0`,
    `0 ${BARE_OPTION_OUTLINE_PX}px`,
    `0 -${BARE_OPTION_OUTLINE_PX}px`,
  ]
    .map((offset) => `drop-shadow(${offset} 0 ${ink})`)
    .join(' ');
}

// The AI Image Button's .free-count badge and its .loading spin; native-ai-flow-geometry.test.mjs
// reads each back from AiImageButton.svelte and app.css.
export const BADGE_OFFSET_PX = -4;
export const BADGE_SIZE_PX = 20;
export const BADGE_PADDING_PX = 5;
export const BUSY_TURN_MS = 1000;
// The spin slows rather than stopping under Reduce Motion: it is the button's only sign that a
// picture is still being made.
export const CALM_BUSY_TURN_MS = 2400;

function SpinningIcon({ size, muted }: { size: number; muted: boolean }) {
  const reduced = useReduceMotion();
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: reduced ? CALM_BUSY_TURN_MS : BUSY_TURN_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      turn.setValue(0);
    };
  }, [reduced, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <RsdIcon name="loading" size={size} ink={undefined} muted={muted} />
    </Animated.View>
  );
}

const CORNER_ICON_PX = CORNER_BUTTON_SIZE_PX - 2 * DRAWING_SCALE.space2;

// A flyout option squares with the tile that opened its menu: the viewport's size-class base,
// floored, times the Button Size multiplier (1 at 100%). Its padding follows the multiplier
// alone, so a large-screen base grows the option without growing its padding.
export type FlyoutScale = { base: number; scale: number };

export function flyoutOptionSize({ base, scale }: FlyoutScale) {
  return Math.max(base, FLYOUT_OPTION_MIN_BASE_PX) * scale;
}

// A flat face has no border, so its icon takes the border's room too.
function faceBorderPx(bare: boolean) {
  return bare ? 0 : ACTION_TILE_BORDER_PX;
}

function faceGeometry(
  props:
    | { skin: 'tile'; size: number; padding?: number; iconPx?: number }
    | ({ skin: 'flyout'; pinnedIconPx?: number } & FlyoutScale),
  bare: boolean
) {
  if (props.skin === 'tile') {
    const { size, iconPx } = props;
    if (iconPx !== undefined)
      return { size, padding: Math.max(0, (size - 2 * faceBorderPx(bare) - iconPx) / 2) };
    if (bare) return { size, padding: size / BARE_TILE_PADDING_SHARE };
    return { size, padding: props.padding ?? size / ACTION_TILE_PADDING_SHARE };
  }
  const size = flyoutOptionSize(props);
  if (props.pinnedIconPx === undefined)
    return { size, padding: FLYOUT_OPTION_PADDING_PX * props.scale };
  return { size, padding: 0 };
}

// The icon fills the face inside its padding and border; a pinned preview keeps its true size
// while the option has room for it and is contained once Button Size shrinks the option.
function iconSize(
  props: { skin: 'tile' } | { skin: 'flyout'; pinnedIconPx?: number },
  { size, padding }: { size: number; padding: number },
  bare: boolean
) {
  const room = size - 2 * (padding + faceBorderPx(bare));
  return props.skin === 'flyout' && props.pinnedIconPx !== undefined
    ? Math.min(props.pinnedIconPx, room)
    : room;
}

// .white-stroke rings white ink in black; .dark-stroke rings near-black ink in the themed
// keyline, which is transparent (no keyline) on light paper.
export type InkKeyline = 'white' | 'dark';

type Selection =
  { selection?: never; selected?: never } | { selection: 'radio' | 'switch'; selected: boolean };

type Common = {
  icon: NativeIconName;
  label: string;
  onPress: () => void;
};

type FaceInk = {
  // Resolves the icon's currentColor: a brush face's ink parts take the active paint.
  ink?: string;
  keyline?: InkKeyline;
};

export type IconButtonProps = Common &
  (
    | { skin: 'corner'; expanded?: boolean; turn?: number; dimmed?: boolean }
    | ({
        skin: 'tile';
        size: number;
        // The face's padding when it is not a sixth of the face: shipping pads by a sixth of the
        // size-class step, which the panel caps the face below, and a landscape phone by 6px.
        // A flat face pads by a tenth of itself instead.
        padding?: number;
        // An icon held at this size, centred, in place of a padding share: the Color Button's.
        iconPx?: number;
        disabled?: boolean;
        expanded?: boolean;
        dimmed?: boolean;
        // Turns the icon into the spinning loading glyph while the tile's work runs.
        busy?: boolean;
        // A count pinned to the tile's corner (the AI Image Button's free pictures left).
        badge?: number | null;
      } & FaceInk &
        Selection)
    | ({
        skin: 'flyout';
        // An eraser size preview drawn at the eraser's true pixel size, with no padding.
        pinnedIconPx?: number;
      } & FlyoutScale &
        FaceInk &
        Selection)
  );

function useKeylineColor(keyline: InkKeyline | undefined) {
  const { darkInkKeyline } = useDrawingTheme();
  if (keyline === 'white') return WHITE_INK_KEYLINE;
  if (keyline === 'dark' && darkInkKeyline !== 'transparent') return darkInkKeyline;
  return undefined;
}

export function RsdIconButton(props: IconButtonProps) {
  const keylineSource = props.skin === 'corner' ? undefined : props.keyline;
  const keyline = useKeylineColor(keylineSource);
  const bare = useBareToolbar();
  const { textStrong, paper, brandSolid } = useDrawingTheme();
  const { icon, label, onPress } = props;
  if (props.skin === 'corner') {
    return (
      <RsdPressable
        type="button"
        role="button"
        aria-label={label}
        aria-expanded={props.expanded}
        style={[styles.base, styles.corner, props.dimmed && styles.cornerDimmed]}
        onClick={onPress}
      >
        {props.turn === undefined ? (
          <RsdIcon name={icon} size={CORNER_ICON_PX} ink={undefined} muted={false} />
        ) : (
          <html.div style={styles.turn(props.turn)}>
            <RsdIcon name={icon} size={CORNER_ICON_PX} ink={undefined} muted={false} />
          </html.div>
        )}
      </RsdPressable>
    );
  }
  const { skin, ink, selection, selected = false } = props;
  const face = faceGeometry(props, bare);
  const { size, padding } = face;
  const disabled = skin === 'tile' && props.disabled === true;
  const expanded = skin === 'tile' ? props.expanded : undefined;
  const dimmed = skin === 'tile' && props.dimmed === true;
  const busy = skin === 'tile' && props.busy === true;
  const badge = skin === 'tile' ? (props.badge ?? null) : null;
  const brandInk = skin === 'flyout' && selected && !bare ? DRAWING_BRAND : undefined;
  const glyphPx = iconSize(props, face, bare);
  const glyph = (
    <RsdIcon
      name={icon}
      size={glyphPx}
      ink={ink ?? brandInk}
      muted={disabled && !bare}
      keyline={keyline}
      grey={dimmed}
    />
  );
  return (
    <RsdPressable
      type="button"
      role={selection ?? 'button'}
      aria-label={label}
      aria-checked={selection ? selected : undefined}
      aria-expanded={expanded}
      aria-disabled={disabled}
      aria-busy={busy || undefined}
      disabled={disabled}
      style={
        bare
          ? [
              styles.base,
              styles[skin],
              styles.face(size, padding),
              styles.bare,
              skin === 'tile' && styles.bareTile,
              expanded && styles.bareTileExpanded,
              disabled && styles.bareTileDisabled,
              dimmed && styles.tileDimmed,
            ]
          : [
              styles.base,
              styles[skin],
              styles.face(size, padding),
              skin === 'tile' && selected && styles.tileSelected,
              skin === 'flyout' && selected && styles.flyoutSelected,
              disabled && styles.tileDisabled,
              dimmed && styles.tileDimmed,
              dimmed && disabled && styles.tileDimmedDisabled,
            ]
      }
      onClick={onPress}
    >
      {bare && skin === 'flyout' && selected ? (
        <html.div style={styles.outlined(glyphPx, outlineFilter(textStrong))}>{glyph}</html.div>
      ) : busy ? (
        <SpinningIcon size={glyphPx} muted={disabled && !bare} />
      ) : (
        glyph
      )}
      {badge !== null ? (
        <html.span
          aria-hidden
          data-testid="free-count"
          style={[
            styles.badge(BADGE_OFFSET_PX, BADGE_SIZE_PX, BADGE_PADDING_PX),
            bare && styles.bareBadge(paper),
            dimmed && styles.greyBadge(greyedColor(brandSolid)),
          ]}
        >
          {badge}
        </html.span>
      ) : null}
    </RsdPressable>
  );
}
