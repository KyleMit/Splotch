import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { spokenText, useAnnouncement } from './useAnnouncement';

// The shipping visually-hidden box: one pixel, clipped, out of flow, so a label beside a field or
// icon adds no gap. React Native lays a span nested inside other text inline and ignores its box,
// so on Android and iOS this belongs beside text, never inside a text run.
const styles = css.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
});

// Text a screen reader announces but the eye never sees. `live` makes it a polite status region
// whose changes are spoken, as the shipping `as="p" role="status"` variant is.
export function RsdVisuallyHidden({
  children,
  live = false,
}: {
  children: ReactNode;
  live?: boolean;
}) {
  return live ? (
    <LiveRegion>{children}</LiveRegion>
  ) : (
    <html.span style={styles.hidden}>{children}</html.span>
  );
}

function LiveRegion({ children }: { children: ReactNode }) {
  useAnnouncement(spokenText(children), 'polite');
  return (
    <html.p role="status" aria-live="polite" style={styles.hidden}>
      {children}
    </html.p>
  );
}
