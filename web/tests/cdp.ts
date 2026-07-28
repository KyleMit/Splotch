import type { Page } from '@playwright/test';

export async function rotateViewportViaCdp(
  page: Page,
  { width, height, angle }: { width: number; height: number; angle: number }
): Promise<void> {
  // engine-rotation.spec.ts uses rotateTo/setScreenAngleOverride as a separate non-CDP harness path.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle },
  });
}
