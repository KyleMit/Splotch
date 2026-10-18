import type { ComponentPropsWithRef } from 'react';
import { Text, useWindowDimensions, type TextStyle } from 'react-native';
import { compat } from 'react-strict-dom';
import type { DialogTitleProps } from './DialogTitle';
import { styles as controlStyles } from './controls';

type ResolvedTextProps = Omit<ComponentPropsWithRef<typeof Text>, 'style'> & { style: TextStyle };

function hasSplitWord(text: string, lines: readonly { text: string }[]) {
  if (lines.length === 0) return false;
  const words = (value: string) => value.split(/\s+/).filter(Boolean);
  const expected = words(text);
  const actual = lines.flatMap((line) => words(line.text));
  return (
    actual.length !== expected.length || actual.some((word, index) => word !== expected[index])
  );
}

export function DialogTitle({ children, onWordWrap, style, ...props }: DialogTitleProps) {
  const { width, fontScale } = useWindowDimensions();
  return (
    <compat.native<ResolvedTextProps>
      as="span"
      role="heading"
      {...props}
      style={[controlStyles.semiboldText, style]}
    >
      {(resolved) => (
        <Text
          {...resolved}
          key={JSON.stringify([children, width, fontScale, resolved.style.fontSize])}
          onTextLayout={({ nativeEvent }) => {
            if (hasSplitWord(children, nativeEvent.lines)) onWordWrap();
          }}
        >
          {children}
        </Text>
      )}
    </compat.native>
  );
}
