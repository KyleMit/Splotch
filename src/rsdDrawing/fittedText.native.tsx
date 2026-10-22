import { useLayoutEffect, useRef, useState, type ComponentPropsWithRef } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { hasSplitWord } from './splitWord';

// The props React Strict DOM resolves for a native span, as compat.native hands them over.
export type ResolvedTextProps = Omit<ComponentPropsWithRef<typeof Text>, 'style'> & {
  style: TextStyle;
};

// Room left under the measured fit, because glyph advances do not scale exactly with the size.
export const FIT_SAFETY_FRACTION = 0.98;
// A word that still breaks after a fit shrinks by at least this much more on each further report.
const FIT_RETRY_FRACTION = 0.95;

// Line height and tracking follow the size, so shrunk text keeps its proportions.
export function scaledType(style: TextStyle, scale: number): TextStyle {
  const scaled = (value: number | string | undefined) =>
    typeof value === 'number' ? value * scale : undefined;
  return {
    fontSize: scaled(style.fontSize),
    lineHeight: scaled(style.lineHeight),
    letterSpacing: scaled(style.letterSpacing),
  };
}

// Each distinct word of the text on one unconstrained line, in the text's resolved face and size,
// hidden from layout, touch and assistive technology. Reports the widest once every word measured.
function WordWidths({
  text,
  resolved,
  measurementWidth,
  onWidest,
}: {
  text: string;
  resolved: ResolvedTextProps;
  measurementWidth: number;
  onWidest: (width: number) => void;
}) {
  const words = [...new Set(text.split(/\s+/).filter(Boolean))];
  const [widths, setWidths] = useState<ReadonlyMap<string, number>>(() => new Map());
  const widest = words.every((word) => widths.has(word))
    ? Math.max(...words.map((word) => widths.get(word) ?? 0))
    : null;
  useLayoutEffect(() => {
    if (widest !== null) onWidest(widest);
  }, [onWidest, widest]);
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.measurement, { width: measurementWidth }]}
    >
      {words.map((word) => (
        <Text
          key={word}
          numberOfLines={1}
          allowFontScaling={resolved.allowFontScaling}
          maxFontSizeMultiplier={resolved.maxFontSizeMultiplier}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[resolved.style, styles.word]}
          onLayout={({ nativeEvent }) => {
            const { width } = nativeEvent.layout;
            if (!Number.isFinite(width) || width < 0) throw new Error('Invalid native word width.');
            setWidths((current) =>
              current.get(word) === width ? current : new Map(current).set(word, width)
            );
          }}
        >
          {word}
        </Text>
      ))}
    </View>
  );
}

type Split = Readonly<{ room: number }>;

// A native text that keeps its words whole. It reports a word the layout broke across lines, and
// with `fit` it then shrinks just enough for its widest word to fit the width it had when the word
// broke. Text whose words fit keeps its size and the OS font scale, and renders exactly as the
// plain span: words are measured only after one breaks. The owner remounts it (by key) when the
// window width, OS font scale or resolved size changes, or a Settings zoom pinch finishes, which
// starts any fit over: that is how a fitted text grows back when its room widens.
export function FittedText({
  text,
  resolved,
  fit,
  measurementWidth,
  onWordSplit,
}: {
  text: string;
  resolved: ResolvedTextProps;
  fit: boolean;
  // Wide enough that no measured word wraps: the window's width at the OS font scale.
  measurementWidth: number;
  onWordSplit?: () => void;
}) {
  const room = useRef(0);
  const [split, setSplit] = useState<Split | null>(null);
  const [widest, setWidest] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (split === null || widest === null || !(split.room > 0) || !(widest > split.room)) return;
    const target = (split.room * FIT_SAFETY_FRACTION) / widest;
    setScale((current) =>
      current === 1 ? target : Math.min(current * FIT_RETRY_FRACTION, target)
    );
  }, [split, widest]);
  const { onLayout, onTextLayout } = resolved;
  return (
    <>
      <Text
        {...resolved}
        style={scale === 1 ? resolved.style : [resolved.style, scaledType(resolved.style, scale)]}
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          room.current = width;
          // A break reported before this layout's width arrived, even in the same batch, took the
          // previous, wider room. Only before any shrink: a fitted text's own width then follows
          // its smaller words.
          if (scale === 1 && width > 0)
            setSplit((pending) =>
              pending !== null && width < pending.room ? { room: width } : pending
            );
          onLayout?.(event);
        }}
        onTextLayout={(event) => {
          onTextLayout?.(event);
          if (!hasSplitWord(text, event.nativeEvent.lines)) return;
          onWordSplit?.();
          if (!fit) return;
          // onLayout may not have reported this layout's width yet; its widest line bounds it.
          const widestLine = Math.max(...event.nativeEvent.lines.map((line) => line.width));
          setSplit({ room: room.current >= widestLine ? room.current : widestLine });
        }}
      >
        {text}
      </Text>
      {fit && split !== null ? (
        <WordWidths
          text={text}
          resolved={resolved}
          measurementWidth={measurementWidth}
          onWidest={setWidest}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // A collapsed or squeezed column cannot supply the intrinsic width of its words.
  measurement: { position: 'absolute', height: 0, opacity: 0, flexDirection: 'row' },
  word: { position: 'absolute' },
});
