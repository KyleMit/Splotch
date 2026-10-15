import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { host, mount, records } from './rsd-native-selection-host.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import {
  ERROR_COPY_MAX_WIDTH_PX,
  ERROR_DOTTIE_PX,
  ERROR_RESTART_MIN_WIDTH_PX,
  ERROR_SCREEN_COPY,
  RsdCrashScreen,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdErrorScreen.tsx';
import { displayFontSize } from '../../../experiments/native-architecture/src/rsdDrawing/displayType.ts';
const SHIPPING_ERROR_SCREEN = readFileSync(
  join(import.meta.dirname, '../../../web/src/lib/components/ErrorScreen.svelte'),
  'utf8'
);

const errorScreen = () =>
  [...host.querySelectorAll('[role="alert"]')].find((node) =>
    node.textContent.startsWith(ERROR_SCREEN_COPY.title)
  ) ?? null;
const startOver = () =>
  [...errorScreen().querySelectorAll('[role="button"]')].find(
    (node) => node.textContent === ERROR_SCREEN_COPY.restart
  );

function rendererFault(recovery) {
  const detail = 'The drawing paper stopped drawing.';
  return toolbarScreen({
    notice: detail,
    failure: { kind: 'error', detail },
    recovery: { failed: true, retryDisabled: false, retry: vi.fn(), ...recovery },
  });
}

describe("the drawing screen's Error Screen", () => {
  it('wears the shipping font when the failed drawing screen cannot provide it', async () => {
    await mount(createElement(RsdCrashScreen, { onRestart: vi.fn(async () => {}) }));
    const copy = records.props.findLast(
      (props) => props.children?.[0] === ERROR_SCREEN_COPY.lines[0]
    );
    expect(flat(copy?.style)?.fontFamily).toMatch(/Quicksand/);
  });

  it('keeps the copy and literals ErrorScreen.svelte writes', () => {
    const markup = SHIPPING_ERROR_SCREEN.replace(/\s+/g, ' ');
    expect(markup).toContain(`<title>${ERROR_SCREEN_COPY.documentTitle}</title>`);
    expect(markup).toContain(`<h1>${ERROR_SCREEN_COPY.title}</h1>`);
    expect(markup).toContain(`<p>${ERROR_SCREEN_COPY.lines.join('<br />')}</p>`);
    expect(markup).toMatch(new RegExp(`>${ERROR_SCREEN_COPY.restart}</button>`));
    expect(markup).toContain(`const DOTTIE_SIZE_PX = ${ERROR_DOTTIE_PX};`);
    expect(markup).toContain(`max-width: ${ERROR_COPY_MAX_WIDTH_PX}px;`);
    expect(markup).toContain('dottie-stumped.svg');
    expect(markup).toContain(`min-width: ${ERROR_RESTART_MIN_WIDTH_PX}px;`);
  });

  it('shows a renderer fault on the Error Screen, whose Start over brings the paper back', async () => {
    const screen = rendererFault();
    await mountToolbar(screen);
    expect(errorScreen()).not.toBeNull();
    expect(errorScreen().textContent).toContain(ERROR_SCREEN_COPY.title);
    expect(errorScreen().textContent).toContain(ERROR_SCREEN_COPY.lines.join('\n'));
    expect(host.textContent).not.toContain('Retry drawing');
    expect(host.querySelector('[data-testid="rsd-failure-banners"]')).toBeNull();
    const title = records.props.findLast(
      (props) => props.children === ERROR_SCREEN_COPY.title || props.children?.[0] === 'Oops!'
    );
    expect(flat(title?.style)?.fontSize).toBe(displayFontSize(records.dimensions.width));
    await act(async () => startOver().click());
    expect(screen.recovery.retry).toHaveBeenCalledOnce();
    expect(startOver().disabled).toBe(true);
  });

  it('stays away while the paper draws', async () => {
    await mountToolbar(toolbarScreen());
    expect(errorScreen()).toBeNull();
  });
});
