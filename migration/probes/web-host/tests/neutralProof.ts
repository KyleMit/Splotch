import { expect, type Page } from '@playwright/test';
import { LIVE_TILE_COUNT } from '../../../../web/src/lib/drawing/liveTiles';
import { PROBE_MOUNT_STATE_ATTRIBUTE, PROBE_MOUNT_STATES } from '../src/probeProps';
import { draw, firstOpaquePixel, readDrawingHistory } from '../../../../web/tests/helpers';

const PAPER_SELECTOR =
  '#drawingCanvas, canvas[data-live-tile], canvas[data-live-crayon-bottom], canvas[data-live-crayon-top]';
export const NEUTRAL_ISLAND_SELECTOR = '.splotch-probe-island';
const NEUTRAL_READY_TIMEOUT_MS = 10_000;

export async function readNeutralProof(page: Page) {
  return page.evaluate(
    ({ selector, attribute, adopted }) => {
      const island = document.querySelector(selector);
      const snapshot = window.__splotchWebHostDiagnostics?.snapshot();
      return {
        adopted: island?.isConnected === true && island.getAttribute(attribute) === adopted,
        snapshot: snapshot ?? null,
        status: island?.querySelector('[role="status"]')?.textContent ?? null,
      };
    },
    {
      selector: NEUTRAL_ISLAND_SELECTOR,
      attribute: PROBE_MOUNT_STATE_ATTRIBUTE,
      adopted: PROBE_MOUNT_STATES.adopted,
    }
  );
}

export async function requireNeutralProof(page: Page, recovery: boolean) {
  const proof = await readNeutralProof(page);
  if (
    !proof.adopted ||
    !proof.snapshot ||
    proof.snapshot.activeRoots !== 1 ||
    proof.snapshot.adoptions !== 1
  )
    throw new Error('The actual React client has not adopted its current root');
  if (proof.snapshot.recoveries !== (recovery ? 1 : 0))
    throw new Error('The expected React hydration recovery did not occur');
  if (!proof.status?.includes('committed strokes') || proof.status.includes('pending'))
    throw new Error('Recovered React chrome did not consume the live drawing state');
  return proof;
}

export async function holdNeutralBoot(page: Page) {
  let heldLayout = 0;
  let heldClient = 0;
  let releaseLayout!: () => void;
  let releaseClient!: () => void;
  const layout = new Promise<void>((resolve) => {
    releaseLayout = resolve;
  });
  const client = new Promise<void>((resolve) => {
    releaseClient = resolve;
  });
  await page.route('**/_app/immutable/nodes/0.*.js', async (route) => {
    heldLayout += 1;
    await layout;
    await route.continue();
  });
  await page.route('**/_app/immutable/chunks/ProbeClient*.js', async (route) => {
    heldClient += 1;
    await client;
    await route.continue();
  });
  return {
    releaseLayout,
    releaseClient,
    async layoutWasHeld() {
      await expect.poll(() => heldLayout).toBeGreaterThan(0);
    },
    async clientWasHeld() {
      await expect.poll(() => heldClient).toBeGreaterThan(0);
    },
  };
}

async function paperPixels(page: Page) {
  return page.locator(PAPER_SELECTOR).evaluateAll((elements) =>
    elements.map((element) => {
      if (!(element instanceof HTMLCanvasElement))
        throw new Error('Paper topology contains a non-canvas');
      return { width: element.width, height: element.height, pixels: element.toDataURL() };
    })
  );
}

export async function captureAcceptedPaper(page: Page) {
  await expect(page.locator('#drawingCanvas')).toHaveCount(1);
  for (const attribute of ['data-live-tile', 'data-live-crayon-bottom', 'data-live-crayon-top'])
    await expect(page.locator(`canvas[${attribute}]`)).toHaveCount(LIVE_TILE_COUNT);
  const handles = await page.locator(PAPER_SELECTOR).elementHandles();
  await draw(page, [
    { x: 90, y: 120 },
    { x: 260, y: 190 },
  ]);
  await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
  const pixels = await paperPixels(page);
  return {
    pixels,
    async requireSame() {
      const current = await page.locator(PAPER_SELECTOR).elementHandles();
      try {
        expect(current).toHaveLength(handles.length);
        for (let index = 0; index < handles.length; index += 1)
          expect(
            await handles[index].evaluate((element, other) => element === other, current[index])
          ).toBe(true);
        expect(await paperPixels(page)).toEqual(pixels);
      } finally {
        for (const handle of current) await handle.dispose();
      }
    },
    async dispose() {
      for (const handle of handles) await handle.dispose();
    },
  };
}

export async function waitForNeutralAdoption(page: Page) {
  await expect(page.locator(NEUTRAL_ISLAND_SELECTOR)).toHaveAttribute(
    PROBE_MOUNT_STATE_ATTRIBUTE,
    PROBE_MOUNT_STATES.adopted,
    { timeout: NEUTRAL_READY_TIMEOUT_MS }
  );
  await expect.poll(() => page.evaluate(() => Boolean(window.__drawingDebug))).toBe(true);
  await expect
    .poll(async () => (await readNeutralProof(page)).status?.includes('committed strokes'))
    .toBe(true);
  await expect.poll(async () => (await readDrawingHistory(page))?.pendingCommands).toBe(0);
}
