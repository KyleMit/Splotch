import { afterEach, describe, expect, it, vi } from 'vitest';

const originalPort = process.env.SPLOTCH_E2E_PORT;
const originalGenericPort = process.env.PORT;
const originalDevServer = process.env.DEV_SERVER;

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function loadShared(port) {
  if (port === undefined) delete process.env.SPLOTCH_E2E_PORT;
  else process.env.SPLOTCH_E2E_PORT = port;
  vi.resetModules();
  return import('../../web/playwright.shared.ts');
}

afterEach(() => {
  restore('SPLOTCH_E2E_PORT', originalPort);
  restore('PORT', originalGenericPort);
  restore('DEV_SERVER', originalDevServer);
  vi.resetModules();
});

describe('Playwright port isolation', () => {
  it('defaults to 4173 and ignores the generic PORT variable', async () => {
    process.env.PORT = '49999';
    const shared = await loadShared(undefined);

    expect(shared.playwrightPort).toBe(4173);
    expect(shared.playwrightBaseURL).toBe('http://localhost:4173');
    expect(shared.commonWebServer.url).toBe(shared.playwrightBaseURL);
  });

  it('derives the base URL and every Vite server command from a valid override', async () => {
    const shared = await loadShared('43127');

    expect(shared.playwrightPort).toBe(43127);
    expect(shared.playwrightBaseURL).toBe('http://localhost:43127');
    expect(shared.commonWebServer.url).toBe(shared.playwrightBaseURL);
    expect(shared.developmentServerCommand).toBe('npx vite dev --port 43127 --strictPort');
    expect(shared.productionPreviewCommand).toBe(
      'npx vite build && npx vite preview --port 43127 --strictPort'
    );
  });

  it.each(['', 'abc', '1.5', '0', '-1', '65536'])(
    'rejects invalid override %j clearly',
    async (value) => {
      await expect(loadShared(value)).rejects.toThrow(
        `SPLOTCH_E2E_PORT must be an integer from 1 through 65535; received ${JSON.stringify(value)}`
      );
    }
  );

  it('keeps both production configs strict and isolated', async () => {
    process.env.SPLOTCH_E2E_PORT = '43127';
    delete process.env.DEV_SERVER;
    vi.resetModules();
    const shared = await import('../../web/playwright.shared.ts');
    const normal = (await import('../../web/playwright.config.ts')).default;
    const scratch = (await import('../../web/playwright.webkit-scratch.config.ts')).default;

    expect(normal.webServer).toMatchObject({
      command: shared.productionPreviewCommand,
      reuseExistingServer: false,
    });
    expect(scratch.webServer).toMatchObject({
      command: shared.productionPreviewCommand,
      reuseExistingServer: false,
    });

    process.env.DEV_SERVER = '1';
    vi.resetModules();
    const devShared = await import('../../web/playwright.shared.ts');
    const dev = (await import('../../web/playwright.config.ts')).default;
    expect(dev.webServer).toMatchObject({
      command: devShared.developmentServerCommand,
      reuseExistingServer: false,
    });
  });
});
