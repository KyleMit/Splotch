import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  symlinkSync,
  statSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, dirname } from 'node:path';
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
  return { root, nativeDir, outputDir: join(root, 'private-output') };
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

  it('rejects an existing case alias of the checkout before creating private output', () => {
    const f = fixture();
    const alias = join(dirname(ROOT), basename(ROOT).toUpperCase());
    if (!existsSync(alias) || realpathSync.native(alias) !== realpathSync.native(ROOT)) return;
    const outputDir = join(alias, `case-probe-${basename(f.root)}`);
    roots.push(outputDir);
    expect(() => prepareAccessibilityProbeProject({ ...f, outputDir })).toThrow(
      /inside the checkout|outside the checkout/
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

  it('rejects a symlinked app build file before creating output', () => {
    const f = fixture();
    const target = join(f.root, 'elsewhere.gradle');
    writeFileSync(target, '');
    rmSync(join(f.nativeDir, 'app/build.gradle'));
    symlinkSync(target, join(f.nativeDir, 'app/build.gradle'));
    expect(() => prepareAccessibilityProbeProject(f)).toThrow(/regular file/);
    expect(existsSync(f.outputDir)).toBe(false);
  });

  it('escapes Gradle paths and restricts injection to the canonical main project', () => {
    const f = fixture();
    const nativeDir = join(f.root, "native'quoted\\path");
    mkdirSync(join(nativeDir, 'app'), { recursive: true });
    writeFileSync(join(nativeDir, 'settings.gradle'), '');
    writeFileSync(join(nativeDir, 'app/build.gradle'), '');
    const outputDir = join(f.root, "output'quoted\\path");
    const plan = prepareAccessibilityProbeProject({ ...f, nativeDir, outputDir });
    const script = readFileSync(plan.include, 'utf8');
    const escapedNative = nativeDir.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
    const escapedProject = plan.project.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
    expect(script).toContain(
      `if (settings.settingsDir.canonicalFile == new File('${escapedNative}').canonicalFile) {`
    );
    expect(script).toContain("settings.include ':parityAccessibilityProbe'");
    expect(script).toContain(
      `settings.project(':parityAccessibilityProbe').projectDir = new File('${escapedProject}')`
    );
    expect(statSync(plan.include).mode & 0o777).toBe(0o600);
    expect(statSync(plan.output).mode & 0o777).toBe(0o700);
  });

  it('prepares a private copy of the probe sources', () => {
    const f = fixture();
    const plan = prepareAccessibilityProbeProject(f);
    expect(plan.sourceManifest.map((row) => row.path)).toContain('AndroidManifest.xml');
    expect(readFileSync(join(plan.project, 'AndroidManifest.xml'), 'utf8')).toContain(
      'android:targetPackage="art.splotch.parity.driver"'
    );
  });
});
