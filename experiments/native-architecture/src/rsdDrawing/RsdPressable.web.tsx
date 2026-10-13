import type { ComponentProps } from 'react';
import { html } from 'react-strict-dom';

// On the web the press styles are CSS :active, which the browser clears on its own.
export function RsdPressable(props: ComponentProps<typeof html.button>) {
  return <html.button {...props} />;
}
