import { useLayoutEffect, useRef, useState, type ComponentPropsWithRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import { compat } from 'react-strict-dom';
import type { HubTitleProps } from './HubTitle';

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

export function HubTitle({ children, style }: HubTitleProps) {
  const { fontScale, width } = useWindowDimensions();
  return (
    <compat.native<ResolvedTextProps> as="span" style={style}>
      {(resolved) => (
        <MeasuredTitle
          key={fontKey(children, resolved, fontScale)}
          text={children}
          resolved={resolved}
          measurementWidth={width * fontScale}
        />
      )}
    </compat.native>
  );
}

function MeasuredTitle({
  text,
  resolved,
  measurementWidth,
}: {
  text: string;
  resolved: ResolvedTextProps;
  measurementWidth: number;
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
  const titleWidth = Math.max(columnWidth, ...words.map((word) => widths.get(word) ?? 0));
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
      <Text {...resolved} style={[resolved.style, titleWidth > 0 ? { width: titleWidth } : null]}>
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
