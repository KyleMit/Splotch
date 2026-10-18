import type { ComponentPropsWithRef } from 'react';
import { Text } from 'react-native';
import { compat } from 'react-strict-dom';
import type { DialogTitleProps } from './DialogTitle';
import { styles as controlStyles } from './controls';

type ResolvedTextProps = ComponentPropsWithRef<typeof Text>;

export function DialogTitle({ children, onWordWrap, style, ...props }: DialogTitleProps) {
  const words = children.split(/\s+/).filter(Boolean);
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
          onTextLayout={({ nativeEvent }) => {
            if (
              nativeEvent.lines.length > 0 &&
              words.some((word) => !nativeEvent.lines.some((line) => line.text.includes(word)))
            )
              onWordWrap();
          }}
        >
          {children}
        </Text>
      )}
    </compat.native>
  );
}
