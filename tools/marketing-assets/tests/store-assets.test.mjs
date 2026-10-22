import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateStoreAssets } from '../gen-store-assets.mjs';
import { openStaticDocument, settleStaticDocument } from '../lib/static-document.mjs';

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal()),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
}));
vi.mock('@playwright/test', () => ({ chromium: { launch: vi.fn() } }));
vi.mock('../../lib/playwright.mjs', () => ({ chromiumExecutablePath: () => undefined }));
vi.mock('../lib/static-document.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  openStaticDocument: vi.fn(),
  settleStaticDocument: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  existsSync.mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('store asset frames', () => {
  it('rejects an unmatched target before launching a browser or writing outputs', async () => {
    await expect(generateStoreAssets({ target: 'missing' })).rejects.toThrow(
      'No targets or pages match'
    );
    expect(chromium.launch).not.toHaveBeenCalled();
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('requires the selected committed captures before launching or writing outputs', async () => {
    existsSync.mockReturnValue(false);
    await expect(generateStoreAssets({ target: 'tablet10', page: '01-draw' })).rejects.toThrow(
      /Store frames need committed captures; missing:.*captures\/tablet10\/01-draw.png/s
    );
    expect(chromium.launch).not.toHaveBeenCalled();
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('renders the selected frame from the committed capture with no application server', async () => {
    const browser = { close: vi.fn() };
    const opened = { page: { screenshot: vi.fn() }, context: { close: vi.fn() } };
    chromium.launch.mockResolvedValue(browser);
    openStaticDocument.mockResolvedValue(opened);

    await generateStoreAssets({ target: 'tablet10', page: '01-draw' });

    expect(openStaticDocument).toHaveBeenCalledExactlyOnceWith(browser, {
      html: expect.stringContaining('src="/captures/tablet10/01-draw.png"'),
      files: expect.objectContaining({
        '/captures/tablet10/01-draw.png': expect.stringMatching(
          /store-assets\/captures\/tablet10\/01-draw.png$/
        ),
      }),
      viewport: { width: 1920, height: 1080 },
    });
    expect(settleStaticDocument).toHaveBeenCalledWith(opened, [500, 600, 700]);
    expect(opened.page.screenshot).toHaveBeenCalledWith({
      path: expect.stringMatching(/store-assets\/screenshots\/tablet10\/01-draw.png$/),
    });
    expect(opened.context.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
