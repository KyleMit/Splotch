import { css, html } from 'react-strict-dom';
import { brandColors, colors, dimensions, motion } from './tokens.css';
import { focusRingPart } from './focusRing';
import { RsdIcon } from './RsdIcon';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import type { NativeIconName } from './icons.generated';

// The shipping ToggleSwitch.svelte geometry. rsd-native-settings-rows.test.mjs reads each of
// these from that source and fails when they drift.
const SWITCH_WIDTH_PX = 52;
// --touch-target-min: the switch's whole height is its hit area.
const SWITCH_HEIGHT_PX = 48;
const SWITCH_TRACK_HEIGHT_PX = 32;
const SWITCH_THUMB_PX = 26;
const SWITCH_THUMB_INSET_PX = 3;
export const SWITCH_SLIDE_PX = 20;
const SWITCH_GLYPH_PX = 16;
// The thumb is white on both papers, so its face and drop shadow are unthemed.
const THUMB_FACE = 'white';
const THUMB_SHADOW = '0 2px 4px rgba(0, 0, 0, 0.2)';

export type ToggleSwitchProps = {
  id: string;
  /** Accessible name; the visible label, where the caller renders one. */
  label: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  /** The help line the caller renders: its id on web, its text as the native hint. */
  description?: { id: string; text: string };
  disabled?: boolean;
  /** Rides in the thumb where the switch has no label of its own beside it. */
  thumbIcon?: NativeIconName;
};

export const switchStyles = css.create({
  hitArea: {
    boxSizing: 'border-box',
    position: 'relative',
    flexShrink: 0,
    width: SWITCH_WIDTH_PX,
    height: SWITCH_HEIGHT_PX,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  inert: { cursor: 'default' },
  thumbSlot: {
    position: 'absolute',
    top: (SWITCH_HEIGHT_PX - SWITCH_THUMB_PX) / 2,
    left: SWITCH_THUMB_INSET_PX,
  },
  // The labelled half of a ToggleRow: icon and label, which toggle the switch beside them.
  label: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: dimensions.settingIconGap,
    cursor: 'pointer',
  },
  labelInert: { cursor: 'default' },
});

const faceStyles = css.create({
  // The OFF track is two shades from its card; the muted rim gives its boundary the 3:1 a state
  // read by position needs. A border inside the track's own box draws the shipping inset ring.
  track: {
    boxSizing: 'border-box',
    position: 'absolute',
    top: (SWITCH_HEIGHT_PX - SWITCH_TRACK_HEIGHT_PX) / 2,
    bottom: (SWITCH_HEIGHT_PX - SWITCH_TRACK_HEIGHT_PX) / 2,
    left: 0,
    right: 0,
    pointerEvents: 'none',
    borderRadius: dimensions.radiusPill,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.iconMuted,
    backgroundColor: colors.controlTrack,
    transitionProperty: 'backgroundColor, borderColor',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: 'ease',
  },
  trackHover: { backgroundColor: colors.controlTrackHover },
  trackOn: { backgroundColor: brandColors.brand, borderColor: brandColors.brand },
  // The textless brand fill darkens through the themed ramp the labeled fills rest on.
  trackOnHover: { backgroundColor: colors.brandSolid, borderColor: colors.brandSolid },
  thumb: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: SWITCH_THUMB_PX,
    height: SWITCH_THUMB_PX,
    borderRadius: SWITCH_THUMB_PX / 2,
    backgroundColor: THUMB_FACE,
    boxShadow: THUMB_SHADOW,
  },
});

export function SwitchTrack({ checked, hovered }: { checked: boolean; hovered: boolean }) {
  return (
    <html.div
      {...focusRingPart('ring')}
      aria-hidden
      data-testid="toggle-switch-track"
      style={[
        faceStyles.track,
        hovered && faceStyles.trackHover,
        checked && faceStyles.trackOn,
        checked && hovered && faceStyles.trackOnHover,
      ]}
    />
  );
}

// The glyph cannot take the themed icon ink, which is near-white at night on a white thumb;
// --brand-solid is the near-constant purple that reads on white in both themes.
export function SwitchThumbFace({ thumbIcon }: { thumbIcon: NativeIconName | undefined }) {
  const theme = useDrawingTheme();
  return (
    <html.div aria-hidden data-testid="toggle-switch-thumb" style={faceStyles.thumb}>
      {thumbIcon ? (
        <RsdIcon name={thumbIcon} size={SWITCH_GLYPH_PX} ink={theme.brandSolid} muted={false} />
      ) : null}
    </html.div>
  );
}
