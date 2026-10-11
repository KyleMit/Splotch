import { createDrawingStyles, useDrawingStyles } from './DrawingAppearance';
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  paintHex,
  paintLabel,
  type PaletteLabel,
  type PaintColor,
  type CustomColor,
} from './palette';
import { CONTROL_GAP, CONTROL_RADIUS, DRAWING_SCALE, TOUCH_TARGET } from './theme';
import type { PaintSelectionTarget } from './usePaintSelectionFocus';
const COLORS: readonly PaletteLabel[] = [
  'Purple',
  'Blue',
  'Green',
  'Yellow',
  'Orange',
  'Red',
  'Black',
];

export function PaintColors({
  color,
  customColors,
  disabled,
  openerRef,
  onChange,
  onExplore,
}: {
  color: PaintColor;
  customColors: readonly CustomColor[];
  disabled: boolean;
  openerRef: RefObject<View | null>;
  onChange: (color: PaintColor, target: PaintSelectionTarget | null) => void;
  onExplore: () => void;
}) {
  const styles = useDrawingStyles(themedStyles);
  const rail = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const reveal = useCallback(
    (x: number) => rail.current?.scrollTo({ x, y: 0, animated: false }),
    []
  );
  return (
    <View style={styles.colors}>
      <ScrollView
        ref={rail}
        horizontal
        accessibilityLabel="Paint colors"
        accessibilityHint="Swipe or use the keyboard to choose a color."
        showsHorizontalScrollIndicator={false}
        style={styles.rail}
      >
        <View ref={content} collapsable={false} style={styles.palette}>
          {COLORS.map((entry) => (
            <PaintSwatch
              key={entry}
              color={entry}
              selected={color}
              disabled={disabled}
              onChange={onChange}
              onReveal={reveal}
              contentRef={content}
              layoutVersion={customColors}
            />
          ))}
          {customColors.map((entry) => (
            <PaintSwatch
              key={entry}
              color={entry}
              selected={color}
              disabled={disabled}
              onChange={onChange}
              onReveal={reveal}
              contentRef={content}
              layoutVersion={customColors}
            />
          ))}
        </View>
      </ScrollView>
      <Pressable
        ref={openerRef}
        accessibilityRole="button"
        accessibilityLabel="More colors"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onExplore}
        style={styles.explore}
      >
        <Text accessible={false} allowFontScaling={false} style={styles.label}>
          +
        </Text>
      </Pressable>
    </View>
  );
}

function PaintSwatch({
  color,
  selected,
  disabled,
  onChange,
  onReveal,
  contentRef,
  layoutVersion,
}: {
  color: PaintColor;
  selected: PaintColor;
  disabled: boolean;
  onChange: (color: PaintColor, target: PaintSelectionTarget | null) => void;
  onReveal: (x: number) => void;
  contentRef: RefObject<View | null>;
  layoutVersion: readonly CustomColor[];
}) {
  const styles = useDrawingStyles(themedStyles);
  const chosen = selected === color;
  const target = useRef<View>(null);
  const layout = useRef<number | null>(null);
  const focused = useRef(false);
  const pointerReturnX = useRef<number | null>(null);
  const pointerFocus = useRef(false);
  const keyboardFocus = useRef(false);
  const endPointer = () => {
    pointerFocus.current = false;
  };
  const measurement = useRef(0);
  const returnCurrent = useRef<(() => boolean) | null>(null);
  const disabledNow = useRef(disabled);
  disabledNow.current = disabled;
  const measurePosition = useCallback(
    (reveal: boolean, isCurrent: () => boolean = returnCurrent.current ?? (() => true)) => {
      const version = ++measurement.current;
      const node = target.current;
      const relative = contentRef.current;
      if (!node || !relative) return;
      node.measureLayout(relative, (x) => {
        if (version !== measurement.current || !isCurrent()) return;
        layout.current = x;
        if (!focused.current || disabledNow.current || AppState.currentState !== 'active') return;
        if (reveal || (pointerReturnX.current !== null && pointerReturnX.current !== x)) {
          pointerReturnX.current = null;
          onReveal(x);
        }
      });
    },
    [contentRef, onReveal]
  );
  useLayoutEffect(() => {
    measurePosition(keyboardFocus.current);
    return () => {
      measurement.current++;
    };
  }, [layoutVersion, disabled, measurePosition]);
  const beginPointer = () => {
    returnCurrent.current = null;
    measurement.current++;
    pointerReturnX.current = null;
    pointerFocus.current = true;
    keyboardFocus.current = false;
  };
  return (
    <Pressable
      ref={target}
      accessibilityRole="button"
      accessibilityLabel={paintLabel(color)}
      accessibilityState={{ selected: chosen, disabled }}
      aria-pressed={chosen}
      disabled={disabled}
      onLayout={({ nativeEvent }) => {
        layout.current = nativeEvent.layout.x;
        if (focused.current) measurePosition(keyboardFocus.current);
      }}
      onPointerDown={beginPointer}
      onTouchStart={beginPointer}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onTouchEnd={endPointer}
      onTouchCancel={endPointer}
      onBlur={() => {
        returnCurrent.current = null;
        measurement.current++;
        pointerReturnX.current = null;
        focused.current = false;
        endPointer();
        keyboardFocus.current = false;
      }}
      onFocus={() => {
        focused.current = true;
        keyboardFocus.current = !pointerFocus.current;
        measurePosition(keyboardFocus.current);
        pointerFocus.current = false;
      }}
      onPress={() => {
        const revealOnReturn = keyboardFocus.current;
        const activationX = layout.current;
        onChange(
          color,
          focused.current
            ? {
                focus(isCurrent) {
                  returnCurrent.current = isCurrent;
                  pointerReturnX.current = revealOnReturn ? null : activationX;
                  pointerFocus.current = !revealOnReturn;
                  target.current?.focus();
                  pointerFocus.current = false;
                  measurePosition(revealOnReturn, isCurrent);
                },
              }
            : null
        );
      }}
      style={[styles.swatch, { backgroundColor: paintHex(color) }, chosen && styles.selectedSwatch]}
    >
      {chosen ? (
        <Text accessible={false} allowFontScaling={false} style={styles.swatchMark}>
          ✓
        </Text>
      ) : null}
    </Pressable>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    colors: { width: '100%', flexDirection: 'row', gap: CONTROL_GAP, alignItems: 'center' },
    rail: { flex: 1, height: TOUCH_TARGET },
    palette: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: CONTROL_GAP,
    },
    swatch: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      borderRadius: TOUCH_TARGET / 2,
      borderWidth: 3,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectedSwatch: { borderColor: palette.textStrong },
    swatchMark: {
      fontSize: 28,
      fontWeight: '800',
      color: palette.surface,
      textShadowColor: palette.textStrong,
      textShadowRadius: 2,
    },
    explore: {
      minWidth: TOUCH_TARGET,
      minHeight: TOUCH_TARGET,
      paddingHorizontal: DRAWING_SCALE.space4,
      borderRadius: CONTROL_RADIUS,
      borderWidth: 1,
      borderColor: palette.borderWarm,
      backgroundColor: palette.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { fontSize: DRAWING_SCALE.fontSizeXl, color: palette.textStrong },
  })
);
