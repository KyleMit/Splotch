import { useWindowDimensions } from 'react-native';
import { compat } from 'react-strict-dom';
import { FittedText, type ResolvedTextProps } from './fittedText.native';
import type { WholeWordTextProps } from './WholeWordText';

export function WholeWordText({ children, style, onWordSplit, fit = false }: WholeWordTextProps) {
  const { width, fontScale } = useWindowDimensions();
  return (
    <compat.native<ResolvedTextProps> as="span" style={style}>
      {(resolved) => (
        <FittedText
          key={JSON.stringify([children, width, fontScale, resolved.style.fontSize])}
          text={children}
          resolved={resolved}
          fit={fit}
          measurementWidth={width * fontScale}
          onWordSplit={onWordSplit}
        />
      )}
    </compat.native>
  );
}
