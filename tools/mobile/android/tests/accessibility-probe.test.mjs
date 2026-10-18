import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ROOT } from '../../../lib/proc.mjs';
import { prepareAccessibilityProbeProject } from '../build-accessibility-probe.mjs';

const roots = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-accessibility-probe-'));
  roots.push(root);
  const nativeDir = join(root, 'native');
  mkdirSync(join(nativeDir, 'app'), { recursive: true });
  writeFileSync(join(nativeDir, 'settings.gradle'), 'rootProject.name = "fixture"');
  writeFileSync(join(nativeDir, 'app/build.gradle'), '');
  const signingInit = join(root, 'existing-signing.gradle');
  writeFileSync(signingInit, 'opaque-signing-init-fixture');
  return { root, nativeDir, signingInit, outputDir: join(root, 'private-output') };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('private accessibility probe preparation', () => {
  it('rejects an in-checkout output whose own name begins with two dots', () => {
    const f = fixture();
    const outputDir = join(ROOT, `..probe-${basename(f.root)}`);
    expect(existsSync(outputDir)).toBe(false);
    roots.push(outputDir);
    expect(() => prepareAccessibilityProbeProject({ ...f, outputDir })).toThrow(
      /outside the checkout/
    );
    expect(existsSync(outputDir)).toBe(false);
  });

  it('preserves an existing output and its failed-take canary', () => {
    const f = fixture();
    mkdirSync(f.outputDir);
    const canary = join(f.outputDir, 'failed-take.txt');
    writeFileSync(canary, 'retain this evidence');
    expect(() => prepareAccessibilityProbeProject(f)).toThrow(/already exists/);
    expect(readFileSync(canary, 'utf8')).toBe('retain this evidence');
  });

  it('rejects a signing-init symlink before creating output', () => {
    const f = fixture();
    const alias = join(f.root, 'signing-link.gradle');
    symlinkSync(f.signingInit, alias);
    expect(() => prepareAccessibilityProbeProject({ ...f, signingInit: alias })).toThrow(
      /regular file/
    );
    expect(existsSync(f.outputDir)).toBe(false);
    expect(readFileSync(f.signingInit, 'utf8')).toBe('opaque-signing-init-fixture');
  });

  it('prepares a private build without copying or evaluating the signing init', () => {
    const f = fixture();
    const plan = prepareAccessibilityProbeProject(f);
    expect(readFileSync(f.signingInit, 'utf8')).toBe('opaque-signing-init-fixture');
    expect(plan.signing).toBe(f.signingInit);
    expect(existsSync(join(plan.output, 'existing-signing.gradle'))).toBe(false);
    expect(plan.sourceManifest.map((row) => row.path)).toContain('AndroidManifest.xml');
    expect(readFileSync(join(plan.project, 'AndroidManifest.xml'), 'utf8')).toContain(
      'android:targetPackage="art.splotch.parity.driver"'
    );
  });
});
