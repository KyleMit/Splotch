import type { Page } from '@playwright/test';

export async function rotateViewportViaCdp(
  page: Page,
  { width, height, angle }: { width: number; height: number; angle: number }
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle },
  });
}
