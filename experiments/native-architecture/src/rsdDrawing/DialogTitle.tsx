import type { ComponentProps } from 'react';
import { html } from 'react-strict-dom';
import { styles as controlStyles } from './controls';

export type DialogTitleProps = Omit<ComponentProps<typeof html.h2>, 'children'> & {
  children: string;
  onWordWrap: () => void;
};

export function DialogTitle({ onWordWrap: _onWordWrap, style, ...props }: DialogTitleProps) {
  return <html.h2 {...props} style={[controlStyles.semiboldText, style]} />;
}
