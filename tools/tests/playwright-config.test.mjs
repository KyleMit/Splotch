import { afterEach, describe, expect, it, vi } from 'vitest';

const originalPort = process.env.SPLOTCH_E2E_PORT;
const originalGenericPort = process.env.PORT;
const originalPrebuilt = process.env.SPLOTCH_E2E_PREBUILT;

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
async function loadConfig(port) {
  if (port === undefined) delete process.env.SPLOTCH_E2E_PORT;
  else process.env.SPLOTCH_E2E_PORT = port;
  vi.resetModules();
  return (await import('../../e2e/playwright.config.ts')).default;
}
afterEach(() => {
  restore('SPLOTCH_E2E_PORT', originalPort);
  restore('PORT', originalGenericPort);
  restore('SPLOTCH_E2E_PREBUILT', originalPrebuilt);
  vi.resetModules();
});
describe('RN Playwright port isolation', () => {
  it('defaults to 4180 and ignores the generic PORT variable', async () => {
    process.env.PORT = '49999';
    const config = await loadConfig(undefined);
    expect(config.use.baseURL).toBe('http://127.0.0.1:4180');
    expect(config.webServer.url).toBe(config.use.baseURL);
  });
  it('derives the base URL and export host command from a valid override', async () => {
    delete process.env.SPLOTCH_E2E_PREBUILT;
    const config = await loadConfig('43127');
    expect(config.use.baseURL).toBe('http://127.0.0.1:43127');
    expect(config.webServer.url).toBe(config.use.baseURL);
    expect(config.webServer.command).toBe(
      'npm run build:site && node --experimental-strip-types --disable-warning=ExperimentalWarning e2e/server/serve.ts --port 43127'
    );
    expect(config.webServer.reuseExistingServer).toBe(false);
    process.env.SPLOTCH_E2E_PREBUILT = '1';
    const prebuilt = await loadConfig('43127');
    expect(prebuilt.webServer.command).toBe(
      'node --experimental-strip-types --disable-warning=ExperimentalWarning e2e/server/serve.ts --port 43127'
    );
    expect(prebuilt.webServer.reuseExistingServer).toBe(false);
  });
  it.each(['', 'abc', '1.5', '0', '-1', '65536', '080'])(
    'rejects invalid override %j clearly',
    async (value) => {
      await expect(loadConfig(value)).rejects.toThrow(
        `SPLOTCH_E2E_PORT must be an integer from 1 through 65535; received ${JSON.stringify(value)}`
      );
    }
  );
  it('accepts the highest TCP port', async () => {
    const config = await loadConfig('65535');
    expect(config.use.baseURL).toBe('http://127.0.0.1:65535');
  });
});
