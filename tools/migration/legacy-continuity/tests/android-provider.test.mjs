import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { androidProvider, verifyChromiumProvider } from '../android-runtime-inputs.mjs';
import { digest } from '../contract.mjs';

const POLICY = "export const BROWSER_TARGETS = ['chrome111', 'safari16.4'];\n";
const PROVIDER =
  'Current WebView package (name, version): (com.google.android.webview, 111.0.5563.116)\n';

describe('legacy Android observed browser floor', () => {
  it('rejects an old actual provider and restores source and runtime agreement', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'splotch-l0-provider-control-'));
    mkdirSync(join(fixtureRoot, 'web'));
    const path = join(fixtureRoot, 'web/browserTargets.ts');
    writeFileSync(path, POLICY);
    const context = { fixtureRoot, lease: { browserTargetsSha256: digest(POLICY) } };
    try {
      expect(() =>
        androidProvider(context, Buffer.from(PROVIDER.replace('111.0', '104.0')))
      ).toThrow(/BELOW_SOURCE_FLOOR/);
      const provider = androidProvider(context, Buffer.from(PROVIDER));
      expect(() => verifyChromiumProvider(provider, { product: 'Chrome/104.0.0.0' })).toThrow(
        /BELOW_SOURCE_FLOOR/
      );
      expect(() => verifyChromiumProvider(provider, { product: 'Chrome/112.0.0.0' })).toThrow(
        /PROVIDER_CHANGED/
      );
      expect(() =>
        verifyChromiumProvider(provider, { product: 'Chrome/111.0.5563.116' })
      ).not.toThrow();
      writeFileSync(path, POLICY.replace('chrome111', 'chrome112'));
      expect(() => androidProvider(context, Buffer.from(PROVIDER))).toThrow(/TARGETS_CHANGED/);
      writeFileSync(path, POLICY);
      expect(androidProvider(context, Buffer.from(PROVIDER)).minimumChromiumMajor).toBe(111);
    } finally {
      rmSync(fixtureRoot, { recursive: true });
    }
  });
});
