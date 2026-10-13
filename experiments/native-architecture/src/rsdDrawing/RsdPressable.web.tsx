import type { ComponentProps } from 'react';
import { html } from 'react-strict-dom';

// On the web the press styles are CSS :active, which the browser clears on its own. The style
// must be passed by name: React Strict DOM's Babel transform merges only a style it can see, so a
// style inside a spread reaches the DOM as an uncompiled array.
export function RsdPressable({ style, ...props }: ComponentProps<typeof html.button>) {
  return <html.button {...props} style={style} />;
}
