import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { caller, records, host, mount } from './rsd-native-selection-host.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { FAILURE_HEADING } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingStatus.tsx';
import {
  BANNER_CLEAR_RESERVE_PX,
  BANNER_DISMISS_OVERHANG_PX,
  BANNER_LINE_HEIGHT,
  BANNER_MASCOT_PX,
  BANNER_MAX_WIDTH_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdFailureBanner.tsx';
import { useDrawingMessages } from '../../../experiments/native-architecture/src/drawingMessages.ts';
import { saveFailureCopy } from '../../../web/src/lib/drawing/saveFailureCopy.ts';

// The photo library's answer to a save, and the PNGs it was handed.
const library = vi.hoisted(() => ({ outcome: 'photos', saves: [] }));
vi.mock('../../../experiments/native-architecture/src/platform/photoLibrary.ts', () => ({
  photoLibrary: {
    save: async (png) => {
      library.saves.push(png);
      return library.outcome;
    },
  },
}));

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8');
const PICK_A_COLOR = 'Pick a color and draw.';

function declaration(css, property) {
  const values = [...css.matchAll(new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`, 'g'))];
  return values.map(([, value]) => value.replace(/\s+/g, ' ').trim());
}

// Each banner is one card in the dock the banner stack pins over the paper.
function bannerNodes() {
  return [...(host.querySelector('[data-testid="rsd-failure-banners"]')?.children ?? [])];
}

function banners() {
  return bannerNodes().map((node) => node.textContent);
}

// Every place a screen reader hears these words: the iOS announcements and the live regions that
// web and Android speak from. A failure owns exactly one of each.
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
  it('keeps the Save Failure Banner literals SaveFailureBanner.svelte writes', () => {
    const banner = /<style>([\s\S]*)<\/style>/
      .exec(read('web/src/lib/components/SaveFailureBanner.svelte'))[1]
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declaration(banner, 'max-width')).toEqual([`${BANNER_MAX_WIDTH_PX}px`]);
    expect(declaration(banner, 'width')).toContain(`${BANNER_MASCOT_PX}px`);
    expect(declaration(banner, 'line-height')).toEqual([`${BANNER_LINE_HEIGHT}`]);
    expect(declaration(banner, '--save-failure-clear-button-reserve')).toEqual([
      `${BANNER_CLEAR_RESERVE_PX}px`,
    ]);
    expect(read('web/src/app.css')).toMatch(
      new RegExp(
        `\\.banner-dismiss \\{[^}]*margin: ${BANNER_DISMISS_OVERHANG_PX}px ${BANNER_DISMISS_OVERHANG_PX}px 0 0;`
      )
    );
  });

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

  it('shows a renderer fault in the banner with the Retry that clears it', async () => {
    const retry = vi.fn();
    const detail = 'The drawing paper stopped drawing.';
    await mountToolbar(
      toolbarScreen({
        notice: detail,
        failure: { kind: 'error', detail },
        recovery: { failed: true, retryDisabled: false, retry },
      })
    );
    expect(banners()).toEqual([`${FAILURE_HEADING}${detail}Retry drawing`]);
    const [banner] = bannerNodes();
    expect(banner.closest('[data-testid="rsd-canvas-area"]')).not.toBeNull();
    expect(banner.querySelector('[aria-label="Dismiss"]')).toBeNull();
    const retryButton = [...banner.querySelectorAll('*')].find(
      (node) => node.textContent === 'Retry drawing' && node.getAttribute('role') === 'button'
    );
    await act(async () => retryButton.click());
    expect(retry).toHaveBeenCalledOnce();
    expect(records.announcements).toContain(`${FAILURE_HEADING}. ${detail}`);
    expect(spoken(detail)).toEqual({ announced: 1, regions: 1 });
  });

  it('speaks a failed draft once, from the banner, with its Retry', async () => {
    const message = 'Your current picture could not be saved.';
    await mountToolbar(
      toolbarScreen({ draftState: { status: 'failed', message }, retryDraft: vi.fn() })
    );
    expect(banners()).toEqual([`${FAILURE_HEADING}${message}Retry draft recovery`]);
    expect(spoken(message)).toEqual({ announced: 1, regions: 1 });
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

  it('shows a denied photo save in the visible banner, with its explanation, until dismissed', async () => {
    library.outcome = 'denied';
    caller.realScreen = true;
    caller.settingsStorage = {
      read: vi.fn(async () => '{"version":1,"soundEnabled":false}'),
      write: vi.fn(async () => {}),
    };
    await mount(createElement(RsdDrawingScreen));
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
    expect(records.announcements).toContain(`${refused.heading}. ${refused.detail}`);
    // The refusal is the banner's to say; the save's own notice may not say it again.
    expect(spoken(refused.detail)).toEqual({ announced: 1, regions: 1 });
    await act(async () => host.querySelector('[aria-label="Dismiss"]').click());
    await vi.waitFor(() => expect(banners()).toEqual([]));
  });
});
