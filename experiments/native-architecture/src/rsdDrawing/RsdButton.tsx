import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing } from '../platform/animated';
import { css, html } from 'react-strict-dom';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { RsdPressable } from './RsdPressable';
import { brandColors, colors, dimensions, fonts, motion } from './tokens.css';

// Button.svelte's values that no design token carries. They stay in this module because the
// StyleX web compile resolves only local constants and token files inside css.create;
// tools/tests/native-button-chrome.test.mjs reads Button.svelte and fails on divergence.
export const BUTTON_PRESS_SCALE = 0.96;
// The large label's vertical padding, which keeps it centered in the 48px target.
export const BUTTON_LG_PADDING_BLOCK_PX = 14;
export const BUTTON_HERO_MIN_HEIGHT_PX = 56;
export const BUTTON_HERO_GAP_PX = 10;
// The outline variant's padding is its size's padding less its border, so every variant of one
// size has the same outer box. React Native has no calc(), so the differences are kept here.
export const BUTTON_OUTLINE_PADDING_PX = {
  sm: { block: 7, inline: 15 },
  md: { block: 11, inline: 19 },
  lg: { block: 13, inline: 15 },
  hero: { block: 0, inline: 23 },
} as const;
export const BUSY_RING_SIZE_PX = 14;
export const BUSY_RING_BORDER_PX = 2;
export const BUSY_RING_OPACITY = 0.9;
export const BUSY_RING_TURN_MS = 800;
// Shipping mixes --brand into transparent; React Native has no color-mix(), so the mix is
// resolved against the unthemed brand hue.
export const BRAND_HERO_SHADOW = '0 4px 12px rgba(171, 113, 225, 0.4)';

// tools/migration/tests/rsd-native-button-chrome.test.mjs holds this list and each variant's
// tokens to Button.svelte.
export const BUTTON_VARIANTS = ['brand', 'wash', 'outline', 'danger'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = 'sm' | 'md' | 'lg' | 'hero';

// The shipping design Button (web/src/lib/components/design/Button.svelte). Hover is web-only:
// it sits under (hover: hover), which React Native never matches, as a touch WebView never does.
// The press scale is an RSD :active transition, driven natively by RsdPressable. The native
// renderer animates only the listed properties named by their camelCase style key, so the
// kebab-case color names reach the web's CSS transition alone and transform runs on the native
// driver: one render as the press starts and one as it ends, none per frame.
const styles = css.create({
  button: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dimensions.space2,
    borderStyle: 'solid',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: dimensions.radiusMd,
    minWidth: dimensions.touchTargetMin,
    minHeight: dimensions.touchTargetMin,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    cursor: 'pointer',
    transform: { default: 'scale(1)', ':active': `scale(${BUTTON_PRESS_SCALE})` },
    transitionProperty: 'transform, background-color, border-color',
    transitionDuration: motion.durationFast,
    transitionTimingFunction: 'ease',
  },
  sm: {
    paddingTop: dimensions.space2,
    paddingBottom: dimensions.space2,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space4,
    fontSize: dimensions.fontSizeSm,
  },
  md: {
    paddingTop: dimensions.space3,
    paddingBottom: dimensions.space3,
    paddingLeft: dimensions.space5,
    paddingRight: dimensions.space5,
    fontSize: dimensions.fontSizeSm,
  },
  lg: {
    paddingTop: BUTTON_LG_PADDING_BLOCK_PX,
    paddingBottom: BUTTON_LG_PADDING_BLOCK_PX,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space4,
    fontSize: dimensions.fontSizeMd,
  },
  hero: {
    minHeight: BUTTON_HERO_MIN_HEIGHT_PX,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: dimensions.space6,
    paddingRight: dimensions.space6,
    borderRadius: dimensions.radiusPill,
    fontSize: dimensions.fontSizeLg,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    gap: BUTTON_HERO_GAP_PX,
  },
  brand: {
    backgroundColor: {
      default: colors.brandSolid,
      '@media (hover: hover)': { default: colors.brandSolid, ':hover': colors.brandSolidHover },
    },
    color: brandColors.onBrand,
  },
  wash: {
    backgroundColor: {
      default: colors.brandWash,
      '@media (hover: hover)': { default: colors.brandWash, ':hover': colors.brandWashHover },
    },
    color: colors.brandText,
  },
  danger: {
    backgroundColor: {
      default: colors.dangerWash,
      '@media (hover: hover)': { default: colors.dangerWash, ':hover': colors.dangerWashHover },
    },
    color: colors.dangerText,
  },
  outline: {
    backgroundColor: {
      default: 'transparent',
      '@media (hover: hover)': { default: 'transparent', ':hover': colors.brandWash },
    },
    color: colors.brandText,
    borderWidth: dimensions.borderWidth,
    borderColor: colors.brandText,
  },
  outlineInset: (block: number, inline: number) => ({
    paddingTop: block,
    paddingBottom: block,
    paddingLeft: inline,
    paddingRight: inline,
  }),
  brandHero: { boxShadow: BRAND_HERO_SHADOW },
  // Busy implies disabled, so it takes no press, but it keeps the variant's fill.
  busy: { cursor: 'progress', transform: 'scale(1)' },
  // Disabled drops every variant to one neutral treatment; its label keeps --text because the
  // disabled opacity already dims the whole control.
  disabled: {
    backgroundColor: colors.controlTrack,
    color: colors.text,
    opacity: dimensions.disabledOpacity,
    boxShadow: 'none',
    cursor: 'auto',
    transform: 'scale(1)',
  },
  outlineDisabled: { backgroundColor: 'transparent', borderColor: colors.border },
  ring: {
    boxSizing: 'border-box',
    width: BUSY_RING_SIZE_PX,
    height: BUSY_RING_SIZE_PX,
    borderRadius: dimensions.radiusPill,
    borderStyle: 'solid',
    borderWidth: BUSY_RING_BORDER_PX,
    borderRightColor: 'transparent',
    opacity: BUSY_RING_OPACITY,
    flexShrink: 0,
  },
});

// The ring is drawn in the label's ink, the shipping currentColor.
const ringInk = css.create({
  brand: {
    borderTopColor: brandColors.onBrand,
    borderBottomColor: brandColors.onBrand,
    borderLeftColor: brandColors.onBrand,
  },
  wash: {
    borderTopColor: colors.brandText,
    borderBottomColor: colors.brandText,
    borderLeftColor: colors.brandText,
  },
  outline: {
    borderTopColor: colors.brandText,
    borderBottomColor: colors.brandText,
    borderLeftColor: colors.brandText,
  },
  danger: {
    borderTopColor: colors.dangerText,
    borderBottomColor: colors.dangerText,
    borderLeftColor: colors.dangerText,
  },
});

// The busy ring turns on the native driver; Reduce Motion stops it, as shipping does, since the
// label beside it already says the button is working.
function BusyRing({ variant }: { variant: ButtonVariant }) {
  const reduced = useReduceMotion();
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: BUSY_RING_TURN_MS,
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
    <Animated.View aria-hidden style={{ transform: [{ rotate }] }}>
      <html.div style={[styles.ring, ringInk[variant]]} />
    </Animated.View>
  );
}

export function RsdButton({
  variant = 'wash',
  size = 'md',
  busy = false,
  disabled = false,
  onPress,
  icon,
  children,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
  // A glyph before the label, in the label's ink, which the caller resolves for its variant.
  icon?: ReactNode;
  children: string;
}) {
  const parked = disabled && !busy;
  const outline = BUTTON_OUTLINE_PADDING_PX[size];
  return (
    <RsdPressable
      type="button"
      role="button"
      disabled={disabled || busy}
      aria-disabled={disabled || busy}
      aria-busy={busy}
      style={[
        styles.button,
        styles[size],
        styles[variant],
        variant === 'outline' && styles.outlineInset(outline.block, outline.inline),
        variant === 'brand' && size === 'hero' && styles.brandHero,
        busy && styles.busy,
        parked && styles.disabled,
        parked && variant === 'outline' && styles.outlineDisabled,
      ]}
      onClick={onPress}
    >
      {busy ? <BusyRing variant={variant} /> : null}
      {icon}
      <html.span>{children}</html.span>
    </RsdPressable>
  );
}
