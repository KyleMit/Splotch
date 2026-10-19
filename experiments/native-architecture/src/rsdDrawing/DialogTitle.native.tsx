import { useWindowDimensions } from 'react-native';
import { compat } from 'react-strict-dom';
import type { DialogTitleProps } from './DialogTitle';
import { styles as controlStyles } from './controls';
import { FittedText, type ResolvedTextProps } from './fittedText.native';

export function DialogTitle({ children, onWordWrap, fitWords, style, ...props }: DialogTitleProps) {
  const { width, fontScale } = useWindowDimensions();
  return (
    <compat.native<ResolvedTextProps>
      as="span"
      role="heading"
      {...props}
      style={[controlStyles.semiboldText, style]}
    >
      {(resolved) => (
        <FittedText
          key={JSON.stringify([children, width, fontScale, resolved.style.fontSize])}
          text={children}
          resolved={resolved}
          fit={fitWords}
          measurementWidth={width * fontScale}
          onWordSplit={onWordWrap}
        />
      )}
    </compat.native>
  );
}
