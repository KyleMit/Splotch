import { useLayoutEffect, useRef, useState, type ComponentPropsWithRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import { compat } from 'react-strict-dom';
import type { HubTitleProps } from './HubTitle';
import { FIT_SAFETY_FRACTION, scaledType } from './fittedText.native';

type ResolvedTextProps = Omit<ComponentPropsWithRef<typeof Text>, 'style'> & { style: TextStyle };

function fontKey(text: string, props: ResolvedTextProps, fontScale: number) {
  return JSON.stringify([
    text,
    fontScale,
    props.allowFontScaling,
    props.maxFontSizeMultiplier,
    props.style.fontFamily,
    props.style.fontSize,
    props.style.fontWeight,
    props.style.fontStyle,
    props.style.fontVariant,
    props.style.letterSpacing,
    props.style.lineHeight,
    props.style.textTransform,
  ]);
}

export function HubTitle({ children, style, onWordWidth, room }: HubTitleProps) {
  const { fontScale, width } = useWindowDimensions();
  return (
    <compat.native<ResolvedTextProps> as="span" style={style}>
      {(resolved) => (
        <MeasuredTitle
          key={fontKey(children, resolved, fontScale)}
          text={children}
          resolved={resolved}
          measurementWidth={width * fontScale}
          room={room}
          onWordWidth={onWordWidth}
        />
      )}
    </compat.native>
  );
}

function MeasuredTitle({
  text,
  resolved,
  measurementWidth,
  room,
  onWordWidth,
}: {
  text: string;
  resolved: ResolvedTextProps;
  measurementWidth: number;
  room: number | null;
  onWordWidth: (width: number) => void;
}) {
  const words = [...new Set(text.split(' ').filter(Boolean))];
  const [widths, setWidths] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [columnWidth, setColumnWidth] = useState(0);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const measure = (word: string, width: number) => {
    if (!mounted.current) return;
    if (!Number.isFinite(width) || width < 0) throw new Error('Invalid native title word width.');
    setWidths((current) =>
      current.get(word) === width ? current : new Map(current).set(word, width)
    );
  };
  const widestWord = Math.max(0, ...words.map((word) => widths.get(word) ?? 0));
  // A word wider than the whole row (a large OS font) shrinks just enough to fit it rather than
  // pushing the row past its card.
  const fit =
    room !== null && room > 0 && widestWord > room ? (room * FIT_SAFETY_FRACTION) / widestWord : 1;
  const reserved = widestWord * fit;
  useLayoutEffect(() => onWordWidth(reserved), [onWordWidth, reserved]);
  const titleWidth = Math.max(columnWidth, reserved);
  return (
    <View onLayout={({ nativeEvent }) => setColumnWidth(nativeEvent.layout.width)}>
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.measurement, { width: measurementWidth }]}
      >
        {words.map((word) => (
          <Text
            {...resolved}
            key={word}
            ref={undefined}
            numberOfLines={1}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[resolved.style, styles.word]}
            onLayout={({ nativeEvent }) => measure(word, nativeEvent.layout.width)}
          >
            {word}
          </Text>
        ))}
      </View>
      <Text
        {...resolved}
        style={[
          resolved.style,
          fit < 1 ? scaledType(resolved.style, fit) : null,
          titleWidth > 0 ? { width: titleWidth } : null,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // A collapsed zoom column cannot supply the intrinsic width of its words.
  measurement: {
    position: 'absolute',
    height: 0,
    opacity: 0,
    flexDirection: 'row',
  },
  word: { position: 'absolute' },
});
