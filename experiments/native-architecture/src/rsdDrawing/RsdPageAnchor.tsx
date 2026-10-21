import type { ComponentProps, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { css, type html } from 'react-strict-dom';

// MouseEvent.button for the wheel button, whose click opens a link in a new tab.
const MIDDLE_BUTTON = 1;

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

// A web anchor for a page outside the app, behind the grown-up check. Every activation the page
// hears (a click with or without modifier keys, Enter, a middle click) asks `onOpen`, which holds it
// to the parent's setting and opens the address itself. The address itself is rendered only while
// no check is due: a browser can reach an href through routes no page event announces (Firefox's
// Shift-right-click menu, a screen reader's open-in-new-tab, iOS Safari's long-press preview), so
// while one is due the link carries none and stays a link by role and keyboard focus.
export function RsdGatedAnchor({
  href,
  checkDue,
  onOpen,
  style,
  children,
}: {
  href: string;
  checkDue: () => boolean;
  onOpen: () => void;
  style?: AnchorStyle;
  children: ReactNode;
}) {
  const open = (event: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    onOpen();
  };
  const address = checkDue()
    ? {
        role: 'link',
        tabIndex: 0,
        onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => {
          if (event.key === 'Enter') open(event);
        },
      }
    : { href, target: '_blank', rel: 'noopener noreferrer' };
  return (
    <>
      <a
        {...css.props(styles.anchor, style)}
        {...address}
        onClick={open}
        onAuxClick={(event) => {
          if (event.button === MIDDLE_BUTTON) open(event);
        }}
      >
        {children}
      </a>
      <noscript>{` (${plainAddress(href)})`}</noscript>
    </>
  );
}

// Without JavaScript nothing can hold a link to the grown-up check, so a prerendered page document
// leaves the link without its address and names the address beside it as plain text.
function plainAddress(href: string) {
  return href.replace(/^[a-z]+:(\/\/)?(www\.)?/i, '').replace(/\/$/, '');
}
