import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { native, resetHost } from './rsd-native-control-host.mjs';
import { html } from 'react-strict-dom';
import { scale, themes } from '../../../web/src/lib/design/tokens.ts';
import {
  SHIPPING_HUB_ROW_KEEPS_UA_FACE,
  SHIPPING_HUB_TITLE_WEIGHT,
} from './rsd-settings-rows-shipping.mjs';
import { darkTheme } from '../../../experiments/native-architecture/src/rsdDrawing/tokens.css.ts';
import { RsdHubRow } from '../../../experiments/native-architecture/src/rsdDrawing/RsdHubRow.tsx';
import { RsdSidebarRow } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSidebarRow.tsx';

// The Settings rows' type and ink as Android and iOS draw them, through the released native
// renderer with each row's native face and fade in place of the web ones.
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/hubRowFace.ts',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/hubRowFace.native.ts')
);
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/sidebarRowFade.ts',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/sidebarRowFade.native.ts')
);

let root, container;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  resetHost();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

// Re-renders in place, as a section change does, rather than mounting afresh.
async function render(element, theme = 'light') {
  await act(async () =>
    root.render(h(html.div, { style: theme === 'dark' ? darkTheme : null }, element))
  );
}

const byTestId = (id) => container.querySelector(`[data-testid="${id}"]`);
const styleOf = (node) => native(node).style;

describe('RsdSidebarRow', () => {
  const row = (active) =>
    h(RsdSidebarRow, { icon: 'sound', label: 'Sound', unseen: false, active, onSelect() {} });
  const labelInk = () => styleOf(byTestId('sidebar-row').querySelector(':scope > span')).color;

  it.each(['light', 'dark'])(
    'paints the %s label ink of a row whose reading position moves in place',
    async (theme) => {
      await render(row(false), theme);
      await render(row(true), theme);
      expect(labelInk()).toBe(themes[theme].brandText);
      await render(row(false), theme);
      expect(labelInk()).toBe(themes[theme].textSoft);
    }
  );
});

describe('RsdHubRow', () => {
  // The face shipping's unreset <button> takes in a WebView: San Francisco on iOS, Roboto on Android.
  it('sets the title and subtitle in the system face, the title at the shipping weight', async () => {
    expect(SHIPPING_HUB_ROW_KEEPS_UA_FACE).toBe(true);
    await render(
      h(RsdHubRow, {
        icon: 'sound',
        title: 'Sound',
        subtitle: 'Volume 50%',
        unseen: false,
        onOpen() {},
      })
    );
    const subtitle = byTestId('hub-subtitle');
    const title = subtitle.previousElementSibling;
    expect(title.textContent).toBe('Sound');
    expect(styleOf(title)).toMatchObject({
      fontFamily: 'system-ui',
      fontWeight: scale[SHIPPING_HUB_TITLE_WEIGHT],
    });
    expect(styleOf(subtitle).fontFamily).toBe('system-ui');
    expect(styleOf(subtitle).fontWeight).toBeUndefined();
  });
});
