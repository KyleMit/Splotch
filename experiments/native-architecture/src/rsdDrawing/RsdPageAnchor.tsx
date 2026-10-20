import type { ComponentProps, ReactNode } from 'react';
import { css, type html } from 'react-strict-dom';

type AnchorStyle = ComponentProps<typeof html.a>['style'];
type Activation = Readonly<{
  defaultPrevented: boolean;
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}>;

// A primary click with no modifier key is the one activation the app answers in place. A middle
// click, or one with Ctrl, Command, Shift or Alt, stays with the browser, which opens the address
// in a new tab or window as it does for shipping's anchors.
export function isPlainActivation(event: Activation) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  );
}

const styles = css.create({
  // A browser's anchor ink and underline give way to the caller's, as RSD's own elements reset them.
  anchor: { color: 'inherit', textDecorationLine: 'none' },
});

// A web anchor for an in-app destination, so the browser can show, copy and open its address as
// it can for shipping's; a plain click follows it in place, keeping the drawing session. Rendered
// on the web only: React Native has no anchor navigation. A DOM anchor rather than html.a, as
// notFoundLink.web.tsx renders, so the page tier's tests mount it as the browser does.
// The attributes a caller's control carried before it became an anchor: its name, its place in the
// page's contents, its keyboard focus-ring mark (focusRing.ts) and its test handle.
type AnchorAttributes = {
  'aria-label'?: string;
  'aria-current'?: 'location';
  'data-focus-ring'?: string;
  'data-testid'?: string;
};

export function RsdPageAnchor({
  href,
  onFollow,
  style,
  children,
  ...attributes
}: AnchorAttributes & {
  href: string;
  onFollow: () => void;
  style?: AnchorStyle;
  children: ReactNode;
}) {
  return (
    <a
      {...attributes}
      {...css.props(styles.anchor, style)}
      href={href}
      onClick={(event) => {
        if (!isPlainActivation(event)) return;
        event.preventDefault();
        onFollow();
      }}
    >
      {children}
    </a>
  );
}
