import { useRef, useState, type ReactElement } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { DRAWING_ON_BRAND } from '../drawing/theme';
import type { NativeIconName } from './icons.generated';
import { optionFades, pressedState } from './pickerPlatform';
import { RsdIcon } from './RsdIcon';
import { arrowDelta, nextEnabledIndex, rovingTabIndex } from './rovingRadio';
import { brandColors, colors, dimensions, fonts } from './tokens.css';
import { SegmentThumb } from './segmentThumb';
import { EASE_GLIDE, THUMB_TRAVEL_MS, type Cell } from './segmentThumbFace';

export { thumbOrigin } from './segmentThumbFace';
// lib/breakpoints.ts PHONE_MAX_WIDTH_PX: at or below it the underline cells split the row evenly.
const PHONE_MAX_WIDTH_PX = 540;
const SEGMENT_OPTION_GAP_PX = 6;
const COLUMN_OPTION_GAP_PX = 2;
const COLUMN_OPTION_PADDING_INLINE_PX = 2;
const SEGMENT_LINE_HEIGHT = 1.2;
const SEGMENT_ICON_PX = 16;
// A hugging track's options carry their own horizontal room instead of flexing.
const HUG_OPTION_PADDING_INLINE_PX = 14;
const CHIP_GAP_PX = 10;
const CHIP_PADDING_BLOCK_PX = 11;
const CHIP_PADDING_INLINE_PX = 12;
const CHIP_ICON_PX = 26;
// The check keeps its width while empty so labels do not shift when a chip toggles.
const CHECK_PX = 14;
const UNDERLINE_GAP_PX = 28;
const UNDERLINE_OPTION_GAP_PX = 8;
const UNDERLINE_PADDING_TOP_PX = 9;
const UNDERLINE_PADDING_INLINE_PX = 2;
const UNDERLINE_PADDING_BOTTOM_PX = 11;
// Thicker than the rule it replaces, so the live segment reads from across the row.
const UNDERLINE_SEGMENT_PX = 3;
// Negates --border-width, so the live segment sits on the rule instead of under it.
const UNDERLINE_RULE_OVERLAP_PX = -1;
const UNDERLINE_LINE_HEIGHT = 1.25;
const UNDERLINE_ICON_PX = 18;
const CHIPS_PER_ROW = 2;
// Parent Center's matrix (ParentCenterSection.svelte) names each mode once in a column heading, so
// its options show a radio mark instead of their words: a ring, filled with a surface-ringed dot
// when chosen.
const MARK_PX = 22;
const MARK_EDGE_PX = 3;
const MARK_INSET_PX = 4;
const MARK_DOT_PX = MARK_PX - 2 * (MARK_EDGE_PX + MARK_INSET_PX);
export const PICKER_MARK_METRICS = { MARK_PX, MARK_EDGE_PX, MARK_INSET_PX } as const;

// The SegmentedPicker.svelte literals no token carries, exported for the drift guard in
// tools/migration/tests/rsd-native-segmented-picker.test.mjs.
export const PICKER_METRICS = {
  THUMB_TRAVEL_MS,
  EASE_GLIDE,
  PHONE_MAX_WIDTH_PX,
  SEGMENT_OPTION_GAP_PX,
  COLUMN_OPTION_GAP_PX,
  COLUMN_OPTION_PADDING_INLINE_PX,
  SEGMENT_LINE_HEIGHT,
  SEGMENT_ICON_PX,
  HUG_OPTION_PADDING_INLINE_PX,
  CHIP_GAP_PX,
  CHIP_PADDING_BLOCK_PX,
  CHIP_PADDING_INLINE_PX,
  CHIP_ICON_PX,
  CHECK_PX,
  UNDERLINE_GAP_PX,
  UNDERLINE_OPTION_GAP_PX,
  UNDERLINE_PADDING_TOP_PX,
  UNDERLINE_PADDING_INLINE_PX,
  UNDERLINE_PADDING_BOTTOM_PX,
  UNDERLINE_SEGMENT_PX,
  UNDERLINE_RULE_OVERLAP_PX,
  UNDERLINE_LINE_HEIGHT,
  UNDERLINE_ICON_PX,
} as const;

export type SegmentedPickerOption<T extends string> = {
  value: T;
  label: string;
  icon?: NativeIconName;
  disabled?: boolean;
};

type Variant = 'segment' | 'chip' | 'underline';
type Labels = 'shown' | 'hidden' | 'marks';

type SharedProps<T extends string> = {
  // The option group's accessible name.
  label: string;
  describedBy?: string;
  options: readonly SegmentedPickerOption<T>[];
  onSelect: (value: T) => void;
  variant?: Variant;
  // false: the segment track hugs its options instead of stretching.
  fill?: boolean;
  // hidden: the caller has no room for the words; each option keeps its label as its name.
  // marks: a column heading names each option, which shows a radio mark in place of its words.
  labels?: Labels;
  // column: each segment option puts its icon above its label, for a track too narrow for both
  // side by side.
  optionDirection?: 'row' | 'column';
};

// Choose one: a radiogroup of checked options with a roving tab stop. null selects nothing.
type RadioProps<T extends string> = SharedProps<T> & { mode?: 'radio'; selected: T | null };
// Independent pressable options; the caller decides what a press does to the set.
type ToggleProps<T extends string> = SharedProps<T> & { mode: 'toggle'; selected: readonly T[] };

// React Native's View types omit the key events react-native-web forwards from the focused option.
type KeyHandlers = {
  onKeyDown: (event: NativeSyntheticEvent<{ key: string }>) => void;
};

function useCells() {
  const [cells, setCells] = useState<readonly (Cell | undefined)[]>([]);
  const measure =
    (index: number) =>
    ({ nativeEvent }: LayoutChangeEvent) => {
      const { x, width } = nativeEvent.layout;
      setCells((previous) => {
        const known = previous[index];
        if (known?.x === x && known.width === width) return previous;
        const next = [...previous];
        next[index] = { x, width };
        return next;
      });
    };
  return { cells, measure };
}

export function RsdSegmentedPicker<T extends string>(props: RadioProps<T> | ToggleProps<T>) {
  const {
    label,
    describedBy,
    options,
    onSelect,
    variant = 'segment',
    fill = true,
    optionDirection = 'row',
  } = props;
  const radio = props.mode !== 'toggle';
  const isSelected = (value: T) =>
    props.mode === 'toggle' ? props.selected.includes(value) : props.selected === value;
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { cells, measure } = useCells();
  const phone = useWindowDimensions().width <= PHONE_MAX_WIDTH_PX;
  const marks = props.labels === 'marks';
  const thumbIndex =
    variant === 'segment' && props.mode !== 'toggle' && props.selected !== null && !marks
      ? options.findIndex((option) => option.value === props.selected)
      : -1;
  const thumbCell = thumbIndex === -1 ? undefined : cells[thumbIndex];
  const rovingIndex = rovingTabIndex(options, isSelected);

  const keyHandlers = (from: number): KeyHandlers | null =>
    radio
      ? {
          onKeyDown: (event) => {
            const delta = arrowDelta(event.nativeEvent.key);
            if (delta === 0) return;
            event.preventDefault();
            const next = nextEnabledIndex(options, from, delta);
            onSelect(options[next].value);
            optionRefs.current[next]?.focus();
          },
        }
      : null;

  const renderOption = (option: SegmentedPickerOption<T>, index: number) => {
    const active = isSelected(option.value);
    return (
      <View
        key={option.value}
        style={cellLayout(variant, fill, phone)}
        onLayout={measure(index)}
        {...keyHandlers(index)}
      >
        <html.button
          ref={(element: HTMLButtonElement | null) => {
            optionRefs.current[index] = element;
          }}
          type="button"
          aria-label={option.label}
          disabled={option.disabled === true}
          aria-disabled={option.disabled === true}
          role={radio ? 'radio' : undefined}
          aria-checked={radio ? active : undefined}
          {...(radio ? null : pressedState(active))}
          tabIndex={radio ? (index === rovingIndex ? 0 : -1) : undefined}
          onClick={() => onSelect(option.value)}
          style={[
            styles.option,
            VARIANT_OPTION[variant],
            optionFades[variant],
            variant === 'segment' && !fill && styles.hugOption,
            variant === 'segment' && optionDirection === 'column' && styles.columnOption,
            active && (marks ? styles.markActive : ACTIVE_OPTION[variant]),
            option.disabled && styles.disabled,
          ]}
        >
          <OptionBody option={option} variant={variant} active={active} labels={props.labels} />
        </html.button>
      </View>
    );
  };

  const rendered = options.map(renderOption);
  return (
    <html.div
      role={radio ? 'radiogroup' : 'group'}
      aria-label={label}
      aria-describedby={describedBy}
      style={[
        TRACK[variant],
        variant === 'segment' && !fill && styles.hug,
        variant === 'underline' && phone && styles.underlinePhone,
      ]}
    >
      {thumbCell ? <SegmentThumb cell={thumbCell} index={thumbIndex} /> : null}
      {variant === 'chip' ? chipRows(rendered) : rendered}
    </html.div>
  );
}

// The shipping chips sit in a two-column grid; React Native has no grid, so each pair is a row
// whose chips stretch to the taller, and a lone last chip keeps its column's width.
function chipRows(chips: readonly ReactElement[]) {
  const rows: ReactElement[] = [];
  for (let start = 0; start < chips.length; start += CHIPS_PER_ROW) {
    const row = chips.slice(start, start + CHIPS_PER_ROW);
    rows.push(
      <html.div key={start} style={styles.chipRow}>
        {row}
        {row.length < CHIPS_PER_ROW ? <html.div style={styles.chipSpacer} /> : null}
      </html.div>
    );
  }
  return rows;
}

function OptionBody<T extends string>({
  option,
  variant,
  active,
  labels = 'shown',
}: {
  option: SegmentedPickerOption<T>;
  variant: Variant;
  active: boolean;
  labels: Labels | undefined;
}) {
  const theme = useDrawingTheme();
  if (labels === 'marks')
    return (
      <html.span aria-hidden style={[styles.mark, active && styles.markChosen]}>
        {active ? <html.span style={styles.markDot} /> : null}
      </html.span>
    );
  const ink =
    variant === 'underline'
      ? active
        ? theme.brandText
        : theme.textSoft
      : active
        ? DRAWING_ON_BRAND
        : undefined;
  return (
    <>
      {option.icon ? (
        <html.span style={styles.iconSlot}>
          <RsdIcon name={option.icon} size={ICON_PX[variant]} ink={ink} muted={false} />
        </html.span>
      ) : null}
      {labels === 'shown' ? (
        <html.span style={variant === 'chip' && styles.chipLabel}>{option.label}</html.span>
      ) : null}
      {variant === 'chip' ? (
        <html.span aria-hidden style={styles.check}>
          {active ? (
            <RsdIcon name="check" size={CHECK_PX} ink={DRAWING_ON_BRAND} muted={false} />
          ) : null}
        </html.span>
      ) : null}
    </>
  );
}

const ICON_PX: Record<Variant, number> = {
  segment: SEGMENT_ICON_PX,
  chip: CHIP_ICON_PX,
  underline: UNDERLINE_ICON_PX,
};

// Each option cell is a React Native view so it reports its frame to the thumb on every renderer.
const cellLayouts = StyleSheet.create({
  flex: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  hug: {},
});

function cellLayout(variant: Variant, fill: boolean, phone: boolean) {
  if (variant === 'segment') return fill ? cellLayouts.flex : cellLayouts.hug;
  if (variant === 'chip') return cellLayouts.flex;
  return phone ? cellLayouts.flex : cellLayouts.hug;
}

const styles = css.create({
  segmentTrack: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: dimensions.space1,
    padding: dimensions.space1,
    backgroundColor: colors.controlTrack,
    borderRadius: dimensions.radiusMd,
  },
  hug: { alignSelf: 'flex-start' },
  chipTrack: { display: 'flex', flexDirection: 'column', gap: CHIP_GAP_PX },
  chipRow: { display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: CHIP_GAP_PX },
  chipSpacer: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: dimensions.touchTargetMin },
  underlineTrack: {
    display: 'flex',
    flexDirection: 'row',
    gap: UNDERLINE_GAP_PX,
    borderBottomWidth: dimensions.borderWidth,
    borderBottomStyle: 'solid',
    borderBottomColor: colors.border,
  },
  underlinePhone: { gap: 0 },
  option: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    flexGrow: 1,
    alignItems: 'center',
    minWidth: dimensions.touchTargetMin,
    minHeight: dimensions.touchTargetMin,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: colors.textSoft,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    cursor: 'pointer',
  },
  // OrientationPicker.svelte's narrow-track custom properties for the segment option.
  columnOption: {
    flexDirection: 'column',
    gap: COLUMN_OPTION_GAP_PX,
    paddingBlock: dimensions.space1,
    paddingInline: COLUMN_OPTION_PADDING_INLINE_PX,
  },
  // A web flex item shrinks by default, which squeezed a wide glyph beside a long label.
  iconSlot: { display: 'flex', flexShrink: 0 },
  segmentOption: {
    justifyContent: 'center',
    gap: SEGMENT_OPTION_GAP_PX,
    paddingBlock: dimensions.space2,
    paddingInline: dimensions.space1,
    borderRadius: dimensions.radiusSm,
    color: { default: colors.text, ':hover': colors.textStrong },
    fontSize: dimensions.fontSizeSm,
    lineHeight: SEGMENT_LINE_HEIGHT,
  },
  hugOption: { paddingInline: HUG_OPTION_PADDING_INLINE_PX },
  segmentActive: { color: { default: brandColors.onBrand, ':hover': brandColors.onBrand } },
  chipOption: {
    gap: CHIP_GAP_PX,
    paddingBlock: CHIP_PADDING_BLOCK_PX,
    paddingInline: CHIP_PADDING_INLINE_PX,
    borderRadius: dimensions.radiusMd,
    backgroundColor: { default: colors.controlTrack, ':hover': colors.controlTrackHover },
    color: { default: colors.textSoft, ':hover': colors.textStrong },
    fontSize: dimensions.fontSizeSm,
  },
  chipActive: {
    backgroundColor: { default: colors.brandSolid, ':hover': colors.brandSolidHover },
    color: { default: brandColors.onBrand, ':hover': brandColors.onBrand },
  },
  chipLabel: { flexGrow: 1, flexShrink: 1, minWidth: 0, textAlign: 'left' },
  check: {
    display: 'flex',
    flexShrink: 0,
    justifyContent: 'center',
    width: CHECK_PX,
  },
  underlineOption: {
    justifyContent: 'center',
    gap: UNDERLINE_OPTION_GAP_PX,
    paddingTop: UNDERLINE_PADDING_TOP_PX,
    paddingInline: UNDERLINE_PADDING_INLINE_PX,
    paddingBottom: UNDERLINE_PADDING_BOTTOM_PX,
    marginBottom: UNDERLINE_RULE_OVERLAP_PX,
    borderBottomWidth: UNDERLINE_SEGMENT_PX,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    color: { default: colors.textSoft, ':hover': colors.textStrong },
    fontSize: dimensions.fontSizeMd,
    lineHeight: UNDERLINE_LINE_HEIGHT,
  },
  underlineActive: {
    color: { default: colors.brandText, ':hover': colors.brandText },
    borderBottomColor: brandColors.brand,
  },
  disabled: { opacity: dimensions.disabledOpacity, cursor: 'not-allowed' },
  markActive: {
    backgroundColor: colors.surface,
    color: { default: colors.textStrong, ':hover': colors.textStrong },
  },
  mark: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: MARK_PX,
    height: MARK_PX,
    borderWidth: MARK_EDGE_PX,
    borderStyle: 'solid',
    borderColor: colors.iconMuted,
    borderRadius: dimensions.radiusPill,
  },
  // The chosen mark is the identity hue, a textless fill, with the surface showing between its
  // edge and its dot.
  markChosen: { borderColor: brandColors.brand, backgroundColor: colors.surface },
  markDot: {
    width: MARK_DOT_PX,
    height: MARK_DOT_PX,
    borderRadius: dimensions.radiusPill,
    backgroundColor: brandColors.brand,
  },
});

const TRACK = {
  segment: styles.segmentTrack,
  chip: styles.chipTrack,
  underline: styles.underlineTrack,
} as const satisfies Record<Variant, unknown>;

const VARIANT_OPTION = {
  segment: styles.segmentOption,
  chip: styles.chipOption,
  underline: styles.underlineOption,
} as const satisfies Record<Variant, unknown>;

const ACTIVE_OPTION = {
  segment: styles.segmentActive,
  chip: styles.chipActive,
  underline: styles.underlineActive,
} as const satisfies Record<Variant, unknown>;
