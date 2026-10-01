import { type Page } from '@playwright/test';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { type InstallPromptStage } from '../src/lib/state/install.svelte';

export async function seedInstallStage(page: Page, stage: InstallPromptStage) {
  await page.addInitScript(
    ({ stage, keys }) => {
      if (stage === 'initial') return;
      localStorage.setItem(keys.installDismissed, 'true');
      localStorage.setItem(keys.installRepromptSessionCount, stage === 'returning' ? '4' : '10');
      localStorage.setItem(keys.installRepromptsUsed, stage === 'returning' ? '0' : '1');
    },
    { stage, keys: STORAGE_KEYS }
  );
}

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
