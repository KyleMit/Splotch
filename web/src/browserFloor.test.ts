// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BROWSER_TARGETS } from '../browserTargets';

// The native app serves the web bundle to every device that can install it, and
// WKWebView's engine version is locked to the device's OS version — so the
// oldest engine that will ever execute the bundle is WebKit at exactly
// IPHONEOS_DEPLOYMENT_TARGET. A web safari/ios floor NEWER than that target
// ships syntax an installable device's WebView can't parse (white-screen), so
// the floor must stay <= the deployment target (docs/COMPATIBILITY.md).

const pbxproj = readFileSync(
  new URL('../../ios/App/App.xcodeproj/project.pbxproj', import.meta.url),
  'utf8'
);
const deploymentTargets = [
  ...new Set(
    [...pbxproj.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = (\d+(?:\.\d+)*);/g)].map((m) => m[1])
  ),
];

const webkitFloors = BROWSER_TARGETS.flatMap((target) => {
  const match = target.match(/^(safari|ios)(\d+(?:\.\d+)*)$/);
  return match ? [{ engine: match[1], version: match[2] }] : [];
});

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

describe('browser floor', () => {
  // Fail closed: a malformed entry would silently drop out of the webkitFloors
  // parse above instead of being compared against the deployment target.
  it('every target is a recognized engine + version', () => {
    for (const target of BROWSER_TARGETS) {
      expect(target).toMatch(/^(chrome|edge|firefox|safari|ios)\d+(\.\d+)*$/);
    }
  });

  // Deleting the ios entry would leave a safari-only floor that no longer
  // constrains what the WKWebView bundle is allowed to contain.
  it('declares exactly one safari and one ios entry', () => {
    expect(webkitFloors.map((floor) => floor.engine).sort()).toEqual(['ios', 'safari']);
  });

  it('parses at least one IPHONEOS_DEPLOYMENT_TARGET from the Xcode project', () => {
    expect(deploymentTargets.length).toBeGreaterThan(0);
  });

  for (const { engine, version } of webkitFloors) {
    for (const native of deploymentTargets) {
      it(`${engine}${version} stays <= IPHONEOS_DEPLOYMENT_TARGET ${native}`, () => {
        // The web floor must never be newer than the oldest installable WebView.
        expect(compareVersions(version, native)).toBeLessThanOrEqual(0);
      });
    }
  }
});
