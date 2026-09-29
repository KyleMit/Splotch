import type { BrowserType } from '@playwright/test';

export function chromiumExecutablePath(
  chromium: Pick<BrowserType, 'executablePath'>
): string | undefined;
