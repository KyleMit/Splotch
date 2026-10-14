import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { css, html } from 'react-strict-dom';
import { focusRingHostView, focusRingPart } from './focusRing';
import type { NativeIconName } from './icons.generated';
import { RsdIcon } from './RsdIcon';
import {
  clampToRange,
  draggedValue,
  keyedValue,
  rangePercent,
  type SliderRange,
} from './sliderModel';
import { brandColors, colors, dimensions, fonts } from './tokens.css';

// The 36px disc makes the handle obvious against the 28px pill it rides.
const THUMB_PX = 36;
const TRACK_PX = 28;
const THUMB_RING_PX = 2;
// White on both papers, like the toggle switch's thumb: --surface on the dark --control-track sat
// at about 1.4:1 and the thumb vanished at night.
const THUMB_FILL = '#fff';
const THUMB_SHADOW = '0 2px 4px rgba(0, 0, 0, 0.2)';
const TRACK_SHADOW = 'inset 0 1px 2px rgba(0, 0, 0, 0.12)';
const NOTCH_INSET_PX = 6;
const NOTCH_WIDTH_PX = 2;
const NOTCH_RADIUS_PX = 1;
const HELP_LINE_HEIGHT = 1.4;
// app.css --setting-icon-size: RsdIcon draws at a number, which a style token cannot give it.
const SETTING_ICON_PX = 20;

// The Slider.svelte and SliderRow.svelte literals no token carries, exported for the drift guard
// in tools/migration/tests/rsd-native-slider.test.mjs.
export const SLIDER_METRICS = {
  THUMB_PX,
  TRACK_PX,
  THUMB_RING_PX,
  THUMB_FILL,
  THUMB_SHADOW,
  TRACK_SHADOW,
  NOTCH_INSET_PX,
  NOTCH_WIDTH_PX,
  NOTCH_RADIUS_PX,
  HELP_LINE_HEIGHT,
  SETTING_ICON_PX,
} as const;

// VoiceOver's swipe and TalkBack's volume keys adjust a slider through these actions.
const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];
const ADJUST_KEYS: Readonly<Record<string, string>> = {
  increment: 'ArrowUp',
  decrement: 'ArrowDown',
};

// touchAction reaches react-native-web's CSS so a touch drag never pans the page; React Native
// ignores it, where the responder already owns the drag.
const HOST_POINTER = { cursor: 'pointer', touchAction: 'none' } as const;

// React Native's View types omit the keyboard and description props react-native-web forwards.
type WebHostProps = {
  'aria-describedby': string | undefined;
  onKeyDown: (event: NativeSyntheticEvent<{ key: string }>) => void;
  onKeyUp: () => void;
};

type SliderProps = {
  value: number;
  min?: number;
  max?: number;
  // The accessible name where a platform cannot follow labelId.
  label: string;
  labelId: string;
  describedBy?: string;
  valueText: string;
  // A magnetic detent: while dragging, values within a small band of it stick to it.
  snap?: number;
  onInput: (value: number) => void;
  // Fired when a drag or key adjustment begins and ends, so the caller can run side effects for
  // its duration.
  onActiveChange?: (active: boolean) => void;
};

type Drag = { touch: string; startX: number; startValue: number };

function touchPageX(event: GestureResponderEvent, touch: string) {
  const { nativeEvent } = event;
  for (const point of [...(nativeEvent.changedTouches ?? []), ...(nativeEvent.touches ?? [])])
    if (String(point.identifier) === touch) return point.pageX;
  return null;
}

function useActive(onActiveChange: SliderProps['onActiveChange']) {
  const active = useRef(false);
  const latest = useRef(onActiveChange);
  useEffect(() => {
    latest.current = onActiveChange;
  }, [onActiveChange]);
  const setActive = (next: boolean) => {
    if (active.current === next) return;
    active.current = next;
    latest.current?.(next);
  };
  // Unmount can interrupt a drag before release; release its shared preview state too.
  useEffect(
    () => () => {
      if (!active.current) return;
      active.current = false;
      latest.current?.(false);
    },
    []
  );
  return setActive;
}

// A relative-drag slider: grabbing anywhere on the bar and sliding moves the value by the distance
// travelled, rather than jumping to the finger. The responder keeps the drag once the finger
// leaves the bar.
function RsdSlider({
  value,
  min = 0,
  max = 100,
  label,
  labelId,
  describedBy,
  valueText,
  snap,
  onInput,
  onActiveChange,
}: SliderProps) {
  const range: SliderRange = { min, max };
  const [width, setWidth] = useState(0);
  const drag = useRef<Drag | null>(null);
  const setActive = useActive(onActiveChange);
  const percent = rangePercent(value, range);
  const snapPercent = snap === undefined ? null : rangePercent(snap, range);

  const apply = (next: number) => {
    const clamped = clampToRange(next, range);
    if (clamped !== value) onInput(clamped);
  };
  const release = () => {
    drag.current = null;
    setActive(false);
  };
  const webProps: WebHostProps = {
    'aria-describedby': describedBy,
    onKeyDown: (event) => {
      const next = keyedValue(event.nativeEvent.key, value, range);
      if (next === null) return;
      event.preventDefault();
      setActive(true);
      apply(next);
    },
    onKeyUp: () => setActive(false),
  };

  return (
    <View
      style={[layout.host, HOST_POINTER]}
      accessible
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-labelledby={labelId}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      accessibilityActions={ADJUST_ACTIONS}
      onAccessibilityAction={({ nativeEvent }: AccessibilityActionEvent) => {
        const key = ADJUST_KEYS[nativeEvent.actionName];
        const next = key ? keyedValue(key, value, range) : null;
        if (next === null) return;
        setActive(true);
        apply(next);
        setActive(false);
      }}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderGrant={({ nativeEvent }) => {
        drag.current = {
          touch: String(nativeEvent.identifier),
          startX: nativeEvent.pageX,
          startValue: value,
        };
        setActive(true);
        // Literal true blocks the native responder, so an enclosing ScrollView cannot take the drag.
        return true;
      }}
      onResponderMove={(event) => {
        const current = drag.current;
        const pageX = current ? touchPageX(event, current.touch) : null;
        if (!current || pageX === null) return;
        apply(draggedValue(current.startValue, pageX - current.startX, width, range, snap));
      }}
      onResponderRelease={release}
      onResponderTerminate={release}
      onResponderTerminationRequest={() => false}
      onBlur={() => setActive(false)}
      {...webProps}
      {...focusRingHostView('part')}
    >
      <html.div {...focusRingPart('ring')} style={styles.track}>
        <html.div style={[styles.fill, styles.fillWidth(percent)]} />
        {snapPercent === null ? null : (
          <html.div style={[styles.notch, styles.notchAt(snapPercent)]} />
        )}
      </html.div>
      <html.div style={[styles.thumb, styles.thumbAt(percent)]} />
    </View>
  );
}

// A labelled slider setting: a name/value row above the slider. `id` names the slider through the
// label row, so the two cannot drift apart. An icon leads the name; without one the row sits
// indented under the toggle above it. `help` is the calm sentence under the track.
export function RsdSliderRow({
  id,
  label,
  value,
  min,
  max,
  snap,
  icon,
  help,
  onInput,
  onActiveChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  snap?: number;
  icon?: NativeIconName;
  help?: string;
  onInput: (value: number) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const valueText = `${value}%`;
  const helpId = `${id}-help`;
  return (
    <html.div style={[styles.row, icon === undefined && styles.indented]}>
      <html.div id={id} style={styles.label}>
        <html.div style={styles.labelName}>
          {icon ? (
            <RsdIcon name={icon} size={SETTING_ICON_PX} ink={undefined} muted={false} />
          ) : null}
          <html.span>{label}</html.span>
        </html.div>
        <html.span>{valueText}</html.span>
      </html.div>
      <RsdSlider
        value={value}
        min={min}
        max={max}
        snap={snap}
        label={label}
        labelId={id}
        valueText={valueText}
        describedBy={help ? helpId : undefined}
        onInput={onInput}
        onActiveChange={onActiveChange}
      />
      {help ? (
        <html.p id={helpId} style={styles.help}>
          {help}
        </html.p>
      ) : null}
    </html.div>
  );
}

const layout = StyleSheet.create({
  host: { position: 'relative', alignSelf: 'stretch' },
});

const styles = css.create({
  track: {
    position: 'relative',
    alignSelf: 'stretch',
    height: TRACK_PX,
    borderRadius: dimensions.radiusPill,
    backgroundColor: colors.controlTrack,
    boxShadow: TRACK_SHADOW,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: dimensions.radiusPill,
    backgroundColor: brandColors.brand,
  },
  fillWidth: (percent: number) => ({ width: `${percent}%` }),
  // Marks the snap detent so the sticky default reads as intentional. A soft line stays legible
  // over both the fill and the bare track.
  notch: {
    position: 'absolute',
    top: NOTCH_INSET_PX,
    bottom: NOTCH_INSET_PX,
    width: NOTCH_WIDTH_PX,
    marginLeft: -NOTCH_WIDTH_PX / 2,
    borderRadius: NOTCH_RADIUS_PX,
    backgroundColor: colors.sliderNotch,
    pointerEvents: 'none',
  },
  notchAt: (percent: number) => ({ left: `${percent}%` }),
  thumb: {
    boxSizing: 'border-box',
    position: 'absolute',
    top: (TRACK_PX - THUMB_PX) / 2,
    width: THUMB_PX,
    height: THUMB_PX,
    borderRadius: THUMB_PX / 2,
    backgroundColor: THUMB_FILL,
    borderWidth: THUMB_RING_PX,
    borderStyle: 'solid',
    borderColor: colors.borderWarm,
    boxShadow: THUMB_SHADOW,
    pointerEvents: 'none',
  },
  // The disc's left edge travels from the track's start to its end less one disc.
  thumbAt: (percent: number) => ({
    left: `${percent}%`,
    marginLeft: (-percent / 100) * THUMB_PX,
  }),
  row: { display: 'flex', flexDirection: 'column' },
  indented: { marginLeft: dimensions.settingIndent },
  label: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: dimensions.space3,
    marginBottom: dimensions.space2,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    color: colors.textSoft,
  },
  labelName: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.settingIconGap,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
    color: colors.text,
  },
  help: {
    marginTop: dimensions.space2,
    marginBottom: 0,
    fontSize: dimensions.fontSizeSm,
    color: colors.textSoft,
    lineHeight: HELP_LINE_HEIGHT,
  },
});
