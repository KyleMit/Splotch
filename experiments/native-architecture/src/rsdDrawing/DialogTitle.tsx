import type { ComponentProps } from 'react';
import { html } from 'react-strict-dom';
import { styles as controlStyles } from './controls';

export type DialogTitleProps = Omit<ComponentProps<typeof html.h2>, 'children'> & {
  children: string;
  onWordWrap: () => void;
  // The title holds a row of its own: a word wider than that row shrinks to fit it.
  fitWords: boolean;
};

export function DialogTitle({
  onWordWrap: _onWordWrap,
  fitWords: _fitWords,
  style,
  ...props
}: DialogTitleProps) {
  return <html.h2 {...props} style={[controlStyles.semiboldText, style]} />;
}
