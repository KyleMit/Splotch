import type { ComponentProps } from 'react';
import { html } from 'react-strict-dom';

export type WholeWordTextProps = {
  children: string;
  style?: ComponentProps<typeof html.span>['style'];
  // Called when native layout breaks one of its words across lines.
  onWordSplit?: () => void;
  // A broken word shrinks the text just enough for its widest word to fit.
  fit?: boolean;
};

// A span whose words stay whole at any OS font size. The web never breaks a word across lines, so
// it is a plain span here; WholeWordText.native.tsx watches the native layout.
export function WholeWordText({ children, style }: WholeWordTextProps) {
  return <html.span style={style}>{children}</html.span>;
}
