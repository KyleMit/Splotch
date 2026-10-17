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
  const { fontScale } = useWindowDimensions();
  return (
    <compat.native<ResolvedTextProps> as="span" style={style}>
      {(resolved) => (
        <MeasuredTitle
          key={fontKey(children, resolved, fontScale)}
          text={children}
          resolved={resolved}
        />
      )}
    </compat.native>
  );
}

function MeasuredTitle({ text, resolved }: { text: string; resolved: ResolvedTextProps }) {
  const words = [...new Set(text.split(' ').filter(Boolean))];
  const [widths, setWidths] = useState<ReadonlyMap<string, number>>(() => new Map());
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
  const minWidth = Math.max(0, ...words.map((word) => widths.get(word) ?? 0));
  return (
    <>
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.measurement}
      >
        {words.map((word) => (
          <Text
            {...resolved}
            key={word}
            ref={undefined}
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
      <Text {...resolved} style={[resolved.style, { minWidth }]}>
        {text}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  // Yoga leaves an auto-sized absolute child of a row unconstrained in width.
  measurement: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    flexDirection: 'row',
  },
  word: { position: 'absolute' },
});
