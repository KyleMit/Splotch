import type { MouseEvent } from 'react';
import { css } from 'react-strict-dom';
import { APP_PAGE_PATHS } from '../information/appPages';
import { buttonSkin } from './RsdButton';
import { isPlainActivation } from './RsdPageAnchor';
import type { NotFoundLinkProps } from './notFoundLink';
import { PAGE_LINE_HEIGHT } from './pageTypography.web';

export function RsdNotFoundLink({ page, variant, onOpen, children }: NotFoundLinkProps) {
  const styles = buttonSkin();
  const chrome = css.props(styles.button, styles.lg, styles[variant]);
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainActivation(event)) return;
    event.preventDefault();
    onOpen(page);
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
        // Button.svelte anchors inherit PageShell's leading, which the button skin's own replaces.
        lineHeight: PAGE_LINE_HEIGHT,
        textDecoration: 'none',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </a>
  );
}
