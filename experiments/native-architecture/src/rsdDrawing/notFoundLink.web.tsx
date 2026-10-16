import type { MouseEvent } from 'react';
import { css } from 'react-strict-dom';
import { APP_PAGE_PATHS } from '../information/appPages';
import { openAppPage } from '../platform/appPath';
import { buttonSkin } from './RsdButton';
import type { NotFoundLinkProps } from './notFoundLink';

// Button.svelte anchors inherit PageShell's leading; rsd-native-web-app-pages.test.mjs pins it.
const PAGE_LINE_HEIGHT = 1.62;

export function RsdNotFoundLink({ page, variant, children }: NotFoundLinkProps) {
  const styles = buttonSkin();
  const chrome = css.props(styles.button, styles.lg, styles[variant]);
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    openAppPage(page);
  };
  return (
    <a
      {...chrome}
      href={APP_PAGE_PATHS[page]}
      onClick={open}
      style={{
        ...chrome.style,
        display: 'inline-flex',
        boxSizing: 'border-box',
        lineHeight: PAGE_LINE_HEIGHT,
        textDecoration: 'none',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </a>
  );
}
