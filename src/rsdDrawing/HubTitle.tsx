import type { ComponentProps } from 'react';
import { html } from 'react-strict-dom';

export type HubTitleProps = {
  children: string;
  onWordWidth: (width: number) => void;
  // The widest the title can ever be laid out, its row's full inner width; null until measured.
  room: number | null;
  style: ComponentProps<typeof html.span>['style'];
};

export function HubTitle({ children, style }: HubTitleProps) {
  return <html.span style={style}>{children}</html.span>;
}
