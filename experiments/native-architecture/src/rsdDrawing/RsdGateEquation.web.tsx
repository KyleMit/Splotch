import type { ComponentProps } from 'react';
import { html } from 'react-strict-dom';

export function RsdGateEquation({ children, style, ...props }: ComponentProps<typeof html.div>) {
  return (
    <html.div {...props} style={style}>
      {children}
    </html.div>
  );
}
