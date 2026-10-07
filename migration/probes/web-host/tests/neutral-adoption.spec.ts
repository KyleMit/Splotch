import { expect, test } from '@playwright/test';
import { WEB_HOST_ENV } from '../host/contract';
import {
  PROBE_PENDING_LABEL,
  PROBE_MISMATCH_LABEL,
  PROBE_MOUNT_STATE_ATTRIBUTE,
  PROBE_MOUNT_STATES,
} from '../src/probeProps';
import {
  readDrawingHistory,
  spaNavigate,
  firstOpaquePixel,
  enforceProductionCsp,
} from '../../../../web/tests/helpers';
import {
  captureAcceptedPaper,
  holdNeutralBoot,
  NEUTRAL_ISLAND_SELECTOR,
  readNeutralProof,
  requireNeutralProof,
  waitForNeutralAdoption,
} from './neutralProof';

const neutral = process.env[WEB_HOST_ENV.variant] === 'neutral-embedded';
const mechanism = process.env[WEB_HOST_ENV.artifact] === 'mechanism';
const mismatch = process.env[WEB_HOST_ENV.fixture] === 'text-mismatch';

test.beforeEach(async ({ page }) => {
  await enforceProductionCsp(page);
});
test.skip(!neutral, 'the retained control has no React root');

test('actual React hydration preserves every accepted paper plane and history', async ({
  page,
}) => {
  test.skip(!mechanism, 'private recovery witnesses belong only to the mechanism artifact');
  const hold = await holdNeutralBoot(page);
  let paper: Awaited<ReturnType<typeof captureAcceptedPaper>> | undefined;
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await hold.layoutWasHeld();
    await expect(page.locator(`${NEUTRAL_ISLAND_SELECTOR} [role="status"]`)).toHaveText(
      PROBE_PENDING_LABEL
    );
    expect(await page.evaluate(() => Boolean(window.__drawingDebug))).toBe(false);
    paper = await captureAcceptedPaper(page);
    hold.releaseLayout();
    await expect.poll(() => page.evaluate(() => Boolean(window.__drawingDebug))).toBe(true);
    await hold.clientWasHeld();
    await paper.requireSame();
    await expect.poll(async () => (await readDrawingHistory(page))?.pendingCommands).toBe(0);
    const history = await readDrawingHistory(page);
    expect(history?.historyLength).toBeGreaterThan(0);
    expect(history?.pendingCommands).toBe(0);
    const serverChrome = await page.locator('.splotch-probe-chrome').elementHandle();
    expect(serverChrome).not.toBeNull();
    hold.releaseClient();
    await waitForNeutralAdoption(page);
    await requireNeutralProof(page, mismatch);
    expect(await serverChrome!.evaluate((element) => element.isConnected)).toBe(!mismatch);
    await serverChrome!.dispose();
    await paper.requireSame();
    expect(await readDrawingHistory(page)).toEqual(history);
    await page.screenshot({
      path: test
        .info()
        .outputPath(mismatch ? 'actual-react-recovery.png' : 'actual-react-adoption.png'),
    });
  } finally {
    hold.releaseLayout();
    hold.releaseClient();
    await paper?.dispose();
  }
});

test('missing React client is rejected while retained paper still works', async ({ page }) => {
  test.skip(!mechanism, 'private adoption witness belongs only to the mechanism artifact');
  let aborted = 0;
  await page.route('**/_app/immutable/chunks/ProbeClient*.js', async (route) => {
    aborted += 1;
    await route.abort('failed');
  });
  await page.goto('/');
  await expect.poll(() => aborted).toBeGreaterThan(0);
  await expect(page.locator(NEUTRAL_ISLAND_SELECTOR)).toHaveAttribute(
    PROBE_MOUNT_STATE_ATTRIBUTE,
    PROBE_MOUNT_STATES.failed
  );
  const paper = await captureAcceptedPaper(page);
  try {
    await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
    await expect(requireNeutralProof(page, mismatch)).rejects.toThrow('has not adopted');
  } finally {
    await paper.dispose();
  }
});

test('disposed React client cannot qualify its departed route', async ({ page }) => {
  test.skip(!mechanism, 'private disposal witness belongs only to the mechanism artifact');
  await page.goto('/');
  await waitForNeutralAdoption(page);
  await requireNeutralProof(page, mismatch);
  await spaNavigate(page, '/privacy');
  await expect(page.locator(NEUTRAL_ISLAND_SELECTOR)).toHaveCount(0);
  await expect.poll(async () => (await readNeutralProof(page)).snapshot?.activeRoots).toBe(0);
  await expect(requireNeutralProof(page, mismatch)).rejects.toThrow('has not adopted');
  await spaNavigate(page, '/');
  await waitForNeutralAdoption(page);
  const proof = await readNeutralProof(page);
  expect(proof.snapshot?.activeRoots).toBe(1);
  expect(proof.snapshot?.mounts).toBe(2);
  expect(proof.snapshot?.disposals).toBe(1);
});

test('skipping the intentional React recovery is rejected', async ({ page }) => {
  test.skip(!mechanism || !mismatch, 'requires the actual text-mismatch mechanism artifact');
  const hold = await holdNeutralBoot(page);
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await hold.layoutWasHeld();
    const status = page.locator(`${NEUTRAL_ISLAND_SELECTOR} [role="status"]`);
    await expect(status).toHaveText(PROBE_PENDING_LABEL);
    hold.releaseLayout();
    await hold.clientWasHeld();
    await status.evaluate((element, label) => {
      element.textContent = label;
    }, PROBE_MISMATCH_LABEL);
    hold.releaseClient();
    await waitForNeutralAdoption(page);
    await expect(requireNeutralProof(page, true)).rejects.toThrow('recovery did not occur');
    expect((await readNeutralProof(page)).snapshot?.recoveries).toBe(0);
  } finally {
    hold.releaseLayout();
    hold.releaseClient();
  }
});

test('release React chrome adopts and consumes retained state without private diagnostics', async ({
  page,
}) => {
  test.skip(mechanism, 'release-only client stripping and adoption');
  await page.goto('/');
  await expect(page.locator(NEUTRAL_ISLAND_SELECTOR)).toHaveAttribute(
    PROBE_MOUNT_STATE_ATTRIBUTE,
    PROBE_MOUNT_STATES.adopted
  );
  await expect(page.locator(`${NEUTRAL_ISLAND_SELECTOR} [role="status"]`)).toContainText(
    'committed strokes'
  );
  expect(await page.evaluate(() => window.__splotchWebHostDiagnostics)).toBeUndefined();
  const status = page.locator(`${NEUTRAL_ISLAND_SELECTOR} [role="status"]`);
  const night = (await status.textContent())?.startsWith('Night paper');
  await page
    .locator(NEUTRAL_ISLAND_SELECTOR)
    .getByRole('button', { name: 'Change theme', exact: true })
    .click();
  await expect(status).toContainText(night ? 'Light paper' : 'Night paper');
});
