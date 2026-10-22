import { act, createElement } from 'react';
import { saveFailureCopy } from '../../../src/export/pictureSave.ts';
import { describe, expect, it, vi } from 'vitest';
import { caller, records, host, mount } from './rsd-native-selection-host.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { RsdDrawingScreen } from '../../../src/rsdDrawing/RsdDrawingScreen.tsx';
import {
  BANNER_CLEAR_RESERVE_PX,
  BANNER_MAX_WIDTH_PX,
} from '../../../src/rsdDrawing/RsdFailureBanner.tsx';
import { useDrawingMessages } from '../../../src/drawingMessages.ts';
import { PALETTE_FLOWS } from '../../../src/rsdDrawing/paletteGeometry.ts';
import { DRAWING_SCALE } from '../../../src/drawing/theme.ts';
import { BUTTON_SCALE_MAX, DEFAULT_BUTTON_SCALE } from '../../../src/settings/buttonSize.ts';

// The photo library's answer to a save, and the PNGs it was handed.
const library = vi.hoisted(() => ({ outcome: 'photos', saves: [] }));
vi.mock('../../../src/platform/photoLibrary.ts', () => ({
  photoLibrary: {
    save: async (png) => {
      library.saves.push(png);
      return library.outcome;
    },
  },
}));
const PICK_A_COLOR = 'Pick a color and draw.';

// Each banner is one card in the dock the banner stack pins over the paper.
function bannerNodes() {
  return [...(host.querySelector('[data-testid="rsd-failure-banners"]')?.children ?? [])];
}

function banners() {
  return bannerNodes().map((node) => node.textContent);
}

function spoken(words) {
  const regions = [...host.querySelectorAll('[role="status"], [aria-live]')].filter((node) =>
    node.textContent.includes(words)
  );
  const innermost = regions.filter(
    (node) => !regions.some((other) => node.contains(other) && node !== other)
  );
  return {
    announced: records.announcements.filter((text) => text.includes(words)).length,
    regions: innermost.length,
  };
}

describe('the Save Failure Banner on the drawing screen', () => {
  it('speaks routine notices from a hidden live region instead of a visible strip', async () => {
    await mountToolbar(toolbarScreen({ notice: PICK_A_COLOR, routineNotice: PICK_A_COLOR }));
    expect(records.viewports.some((props) => props.testID === 'rsd-drawing-status-viewport')).toBe(
      false
    );
    const holders = [...host.querySelectorAll('*')].filter(
      (node) => node.textContent === PICK_A_COLOR && node.children.length === 0
    );
    expect(holders).toHaveLength(1);
    expect(holders[0].closest('[role="status"]')).not.toBeNull();
    expect(flat(records.props.findLast((props) => props.role === 'status')?.style)).toMatchObject({
      position: 'absolute',
      width: 1,
      height: 1,
      overflow: 'hidden',
    });
    expect(records.announcements).toContain(PICK_A_COLOR);
    expect(banners()).toEqual([]);
  });

  it('gives each notice a failure wrote to the banner alone, and later notices back to routine', async () => {
    let messages;
    function Probe() {
      messages = useDrawingMessages();
      return null;
    }
    await mount(createElement(Probe));
    const step = (action) => act(async () => action(messages));
    await step((owner) => owner.report(new Error('The paper is busy.')));
    expect(messages).toMatchObject({
      notice: 'The paper is busy.',
      routineNotice: '',
      failure: { kind: 'error', detail: 'The paper is busy.' },
    });
    await step((owner) => owner.setNotice('Picture opened.'));
    expect(messages).toMatchObject({ routineNotice: 'Picture opened.', failure: null });
  });

  it.each([
    ['Raised portrait', 'buttons', 402, 874, DEFAULT_BUTTON_SCALE, 0],
    ['Flat portrait', 'bare', 402, 874, DEFAULT_BUTTON_SCALE, PALETTE_FLOWS.row.extentPx],
    ['Flat square window', 'bare', 768, 768, DEFAULT_BUTTON_SCALE, PALETTE_FLOWS.row.extentPx],
    [
      'Flat portrait with enlarged buttons',
      'bare',
      402,
      874,
      BUTTON_SCALE_MAX,
      PALETTE_FLOWS.row.extentPx,
    ],
    ['Raised tablet landscape', 'buttons', 1024, 768, DEFAULT_BUTTON_SCALE, 0],
    ['Flat tablet landscape', 'bare', 1024, 768, BUTTON_SCALE_MAX, 0],
    ['Flat phone landscape', 'bare', 874, 402, DEFAULT_BUTTON_SCALE, 0],
  ])(
    'shows a denied photo save clear of the %s palette until dismissed',
    async (_, toolbarStyle, width, height, buttonScale, paletteTop) => {
      library.outcome = 'denied';
      library.saves = [];
      records.dimensions = { ...records.dimensions, width, height };
      records.insets = { top: 62, right: 0, bottom: 34, left: 0 };
      caller.realScreen = true;
      caller.settingsStorage = {
        read: vi.fn(async () => '{"version":1,"soundEnabled":false}'),
        write: vi.fn(async () => {}),
      };
      await mount(createElement(RsdDrawingScreen));
      await act(async () => caller.product.sound.owner.settings.setToolbarStyle(toolbarStyle));
      await act(async () => caller.product.sound.owner.settings.setButtonScale(buttonScale));
      await act(async () => host.querySelector('[aria-label="Draw RSD fixture stroke"]').click());
      await act(async () => host.querySelector('[aria-label="Expand controls"]').click());
      await act(async () => host.querySelector('[aria-label="Save screenshot"]').click());
      await vi.waitFor(() => expect(banners()).toHaveLength(1));
      const refused = saveFailureCopy('denied', 1, 'ios');
      expect(banners()).toEqual([`${refused.heading}${refused.detail}Open SettingsTry again`]);
      expect(library.saves).toEqual(['cmVhbC1wbmc=']);
      const banner = flat(
        records.props.findLast((props) => props.testID === 'rsd-failure-banner')?.style
      );
      expect(banner).toMatchObject({ maxWidth: BANNER_MAX_WIDTH_PX, borderStyle: 'solid' });
      const dock = flat(
        records.props.findLast((props) => props.testID === 'rsd-failure-banners')?.style
      );
      expect(dock).toMatchObject({
        position: 'absolute',
        top: DRAWING_SCALE.space4 + paletteTop,
        left: DRAWING_SCALE.space4,
        right: BANNER_CLEAR_RESERVE_PX,
      });
      expect(
        host
          .querySelector('[data-testid="rsd-failure-banners"]')
          .closest('[data-testid="rsd-controls-inset"]')
      ).not.toBeNull();
      expect(
        records.props.findLast((props) => props.testID === 'rsd-safe-area-frame')?.edges
      ).toContain('top');
      expect(records.announcements).toContain(`${refused.heading}. ${refused.detail}`);
      expect(spoken(refused.detail)).toEqual({ announced: 1, regions: 1 });
      await act(async () => host.querySelector('[aria-label="Dismiss"]').click());
      await vi.waitFor(() => expect(banners()).toEqual([]));
    }
  );
});
