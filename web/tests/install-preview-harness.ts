import { type Page } from '@playwright/test';

export async function captureMockInstallPrompt(page: Page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: {
        value: async () => {
          document.documentElement.dataset.installPrompted = 'true';
        },
      },
      userChoice: { value: Promise.resolve({ outcome: 'accepted', platform: 'web' }) },
    });
    window.dispatchEvent(event);
  });
}
