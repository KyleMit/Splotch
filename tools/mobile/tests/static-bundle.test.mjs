import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FEEDBACK_URL } from '../../../web/src/lib/siteUrl.ts';
import { supportEmail } from '../../../web/src/lib/supportEmail.ts';
import {
  adminConsoleSentinels,
  FORBIDDEN_NATIVE_HOSTS,
  nativeBundleProblems,
  nativePrivacyFeedbackProblems,
  REQUIRED_NATIVE_PAGES,
  requiredNativePageProblems,
  WEB_ONLY_MODULE_MARKERS,
  webOnlyMarkerSourceProblems,
} from '../check-static-bundle.mjs';

// The guard's failure mode is silence: if its sentinels stop matching anything
// the console actually ships, `build:cap` stays green while the console returns
// to the bundle. These lock the derivation rather than the strings.

describe('admin console sentinels', () => {
  it('derives the shipped placeholders from the component source', () => {
    const sentinels = adminConsoleSentinels();
    expect(sentinels.length).toBeGreaterThan(0);
    expect(sentinels).toContain('Admin access key');
  });

  it('deduplicates repeated placeholders', () => {
    expect(adminConsoleSentinels('placeholder="Same" placeholder="Same"')).toEqual(['Same']);
  });

  it('skips interpolated placeholders, which do not survive minification verbatim', () => {
    expect(adminConsoleSentinels('placeholder="Literal" placeholder="{dynamic}"')).toEqual([
      'Literal',
    ]);
  });

  it('throws rather than passing vacuously when the component has no placeholders', () => {
    expect(() => adminConsoleSentinels('<p>no inputs here</p>')).toThrow(/vacuously/);
  });
});

describe('native bundle scan', () => {
  it('reports a missing build directory instead of reporting success', () => {
    expect(nativeBundleProblems('/nonexistent/build', ['x'])[0]).toMatch(/does not exist/);
  });

  it('scans for store-enrollment hosts by host, not by fully composed URL', () => {
    // The bundler keeps the route's URL constants as template literals with the
    // app id interpolated, so a whole-URL match would miss the real regression.
    expect(FORBIDDEN_NATIVE_HOSTS).toContain('play.google.com');
    expect(FORBIDDEN_NATIVE_HOSTS).toContain('testflight.apple.com');
    expect(FORBIDDEN_NATIVE_HOSTS).toContain('apps.apple.com');
    for (const host of FORBIDDEN_NATIVE_HOSTS) expect(host).not.toContain('/');
  });

  it('rejects a second bundled coloring book directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-bundle-'));
    try {
      mkdirSync(join(root, 'coloring', 'farm'), { recursive: true });
      mkdirSync(join(root, 'coloring', 'dinosaur'), { recursive: true });
      expect(nativeBundleProblems(root, [], 'farm')).toEqual([
        'Downloadable coloring books remain in the native bundle: dinosaur',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects the conditional web-only support email', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-bundle-'));
    try {
      writeFileSync(join(root, 'feedback.js'), `mailto:${supportEmail()}`);
      expect(nativeBundleProblems(root, [])).toContainEqual(
        expect.stringContaining(`web-only support email "${supportEmail()}" remains`)
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['js', 'html', 'json', 'webmanifest'])(
    'rejects every web-only boot marker from emitted .%s files',
    (extension) => {
      const root = mkdtempSync(join(tmpdir(), 'splotch-native-bundle-'));
      try {
        writeFileSync(
          join(root, `app.${extension}`),
          WEB_ONLY_MODULE_MARKERS.map(({ marker }) => JSON.stringify(marker)).join(';')
        );
        const problems = nativeBundleProblems(root, []);
        for (const { feature, marker } of WEB_ONLY_MODULE_MARKERS) {
          expect(problems).toContainEqual(
            expect.stringContaining(`web-only ${feature} "${marker}" remains`)
          );
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );
});

describe('required native pages', () => {
  it('requires the privacy policy and changelog in the static export', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-pages-'));
    try {
      for (const page of REQUIRED_NATIVE_PAGES) writeFileSync(join(root, page), page);
      expect(requiredNativePageProblems(root)).toEqual([]);

      rmSync(join(root, REQUIRED_NATIVE_PAGES[0]));
      expect(requiredNativePageProblems(root)).toEqual([
        `Required native page is missing: ${REQUIRED_NATIVE_PAGES[0]}`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('native privacy feedback link', () => {
  it('requires the hosted feedback URL', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-privacy-'));
    try {
      writeFileSync(join(root, 'privacy.html'), '<a href="/privacy">Privacy</a>');
      expect(nativePrivacyFeedbackProblems(root)).toContainEqual(
        expect.stringContaining(FEEDBACK_URL)
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a relative feedback link even when the hosted link is present', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-privacy-'));
    try {
      writeFileSync(
        join(root, 'privacy.html'),
        `<a href="${FEEDBACK_URL}">Hosted</a><a href="/feedback">Relative</a>`
      );
      expect(nativePrivacyFeedbackProblems(root)).toEqual([
        'Native privacy page retains a relative /feedback link',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('web-only boot markers', () => {
  it('still identifies executable literals in the owning modules', () => {
    expect(webOnlyMarkerSourceProblems()).toEqual([]);
  });

  it('fails loudly when an owning module loses a source needle', () => {
    const [target] = WEB_ONLY_MODULE_MARKERS;
    const problems = webOnlyMarkerSourceProblems((sourcePath) => {
      const source = readFileSync(new URL(`../../../${sourcePath}`, import.meta.url), 'utf8');
      return sourcePath === target.sourcePath ? source.replace(target.sourceNeedle, '') : source;
    });

    expect(problems).toEqual([
      expect.stringContaining(
        `${target.sourcePath} no longer contains the ${target.feature} marker source`
      ),
    ]);
  });

  it('is documented beside the web-only service boundary', () => {
    // Read by path, not `new URL(..., import.meta.url)`: knip reads that form as
    // a module reference and skips export analysis on the target, which would
    // erase webOnlyServices.ts's exports from `lint:dead`.
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'web/src/lib/boot/webOnlyServices.ts'),
      'utf8'
    );
    for (const { marker, sourcePath } of WEB_ONLY_MODULE_MARKERS) {
      expect(source).toContain(`${sourcePath}: ${marker}`);
    }
  });
});
