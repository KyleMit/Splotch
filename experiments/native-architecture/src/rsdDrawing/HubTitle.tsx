import type { ComponentProps } from 'react';
import { html } from 'react-strict-dom';

export type HubTitleProps = {
  children: string;
  onWordWidth: (width: number) => void;
  style: ComponentProps<typeof html.span>['style'];
};

export function HubTitle({ children, style }: HubTitleProps) {
  return <html.span style={style}>{children}</html.span>;
}
