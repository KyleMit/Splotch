import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FEEDBACK_URL } from '../../../web/src/lib/siteUrl.ts';
import { supportEmail } from '../../../web/src/lib/supportEmail.ts';
import {
  adminConsoleSentinels,
  FORBIDDEN_NATIVE_HOSTS,
  NATIVE_ONLY_MODULE_MARKERS,
  nativeOnlyMarkerBundleProblems,
  nativeOnlyMarkerSourceProblems,
  nativeBundleProblems,
  nativeColoringPresentationProblems,
  nativeContentSecurityPolicyProblems,
  nativePrivacyFeedbackProblems,
  REQUIRED_NATIVE_PAGES,
  requiredNativePageLinkProblems,
  requiredNativePageProblems,
  WEB_ONLY_MODULE_MARKERS,
  webOnlyMarkerSourceProblems,
} from '../check-static-bundle.mjs';
import { nativeMetaCspDirectives, serializeCspDirectives } from '../../../web/securityPolicy.ts';

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

describe('native coloring presentation inventory', () => {
  const book = {
    id: 'fixture',
    pages: [
      {
        images: {
          portrait: '/coloring/fixture/page-tall.overlay.svg',
          landscape: '/coloring/fixture/page-wide.overlay.svg',
        },
        darkImages: {
          portrait: '/coloring/fixture/page-tall.dark.overlay.svg',
          landscape: '/coloring/fixture/page-wide.dark.overlay.svg',
        },
      },
    ],
  };

  it('requires canonical page SVGs and rejects retired presentation rasters', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-coloring-'));
    try {
      const coloringDir = join(root, 'coloring', book.id);
      mkdirSync(coloringDir, { recursive: true });
      for (const path of [
        book.pages[0].images.portrait,
        book.pages[0].images.landscape,
        book.pages[0].darkImages.portrait,
        book.pages[0].darkImages.landscape,
      ]) {
        writeFileSync(join(root, path.replace(/^\//, '')), 'svg');
      }
      expect(nativeColoringPresentationProblems(root, book.id, [book])).toEqual([]);

      rmSync(join(coloringDir, 'page-wide.dark.overlay.svg'));
      writeFileSync(join(coloringDir, 'page-tall.presentation.webp'), 'webp');
      expect(nativeColoringPresentationProblems(root, book.id, [book])).toEqual([
        'Native canonical coloring page is missing: /coloring/fixture/page-wide.dark.overlay.svg',
        'Retired coloring presentation remains: /coloring/fixture/page-tall.presentation.webp',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('native-only bundle boundaries', () => {
  it('keeps the source assertion non-vacuous', () => {
    expect(nativeOnlyMarkerSourceProblems()).toEqual([]);
    expect(nativeOnlyMarkerSourceProblems(() => 'missing')).toEqual([
      expect.stringContaining('no longer contains the Capacitor resume lifecycle boundary'),
    ]);
  });

  it('requires the resume lifecycle in native output and excludes it from web output', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-platform-boundary-'));
    try {
      writeFileSync(join(root, 'app.js'), "register(document,'resume',resync)");
      expect(nativeOnlyMarkerBundleProblems(root, true)).toEqual([]);
      expect(nativeOnlyMarkerBundleProblems(root, false)).toEqual([
        'Web bundle retains the native-only Capacitor resume lifecycle',
      ]);

      writeFileSync(join(root, 'app.js'), 'register(document,"visibilitychange",resync)');
      expect(nativeOnlyMarkerBundleProblems(root, false)).toEqual([]);
      expect(nativeOnlyMarkerBundleProblems(root, true)).toEqual([
        'Native bundle is missing the native-only Capacitor resume lifecycle',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('defines one source-backed marker for every checked native-only feature', () => {
    expect(NATIVE_ONLY_MODULE_MARKERS).toHaveLength(1);
    expect(NATIVE_ONLY_MODULE_MARKERS.every(({ sourceNeedle }) => sourceNeedle.length > 0)).toBe(
      true
    );
  });
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

  // A shipped page nothing links to is unreachable, which for the privacy
  // policy is the store requirement itself rather than a nicety. The route
  // manifest names every route whether or not anything links there, so the
  // distinguishing detail is the `href="…"` prefix — the case below that keeps
  // only the bare path is the vacuous pass this guard has to reject.
  it('requires each shipped page to be linked from the bundle', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-links-'));
    const routes = REQUIRED_NATIVE_PAGES.map((page) => page.replace(/\.html$/, ''));
    try {
      for (const page of REQUIRED_NATIVE_PAGES) writeFileSync(join(root, page), page);
      writeFileSync(join(root, 'app.js'), routes.map((route) => `<a href="/${route}">`).join(''));
      expect(requiredNativePageLinkProblems(root)).toEqual([]);

      writeFileSync(join(root, 'app.js'), routes.map((route) => `"/${route}"`).join(','));
      expect(requiredNativePageLinkProblems(root)).toEqual(
        REQUIRED_NATIVE_PAGES.map(
          (page, index) =>
            `Native bundle ships ${page} but nothing in it links to the page (href="/${routes[index]}")`
        )
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The link has to come from the client bundle. A prerendered page carrying
  // its own path would otherwise satisfy the guard on its own behalf.
  it('does not accept a page linking to itself in HTML', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-selflink-'));
    try {
      for (const page of REQUIRED_NATIVE_PAGES) {
        writeFileSync(join(root, page), `<a href="/${page.replace(/\.html$/, '')}">`);
      }
      expect(requiredNativePageLinkProblems(root)).toHaveLength(REQUIRED_NATIVE_PAGES.length);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('native content security policy', () => {
  const expected = serializeCspDirectives(nativeMetaCspDirectives());
  const meta = `<meta http-equiv="content-security-policy" content="${expected}">`;

  it('requires exactly the emitted native policy in every HTML document', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-csp-'));
    try {
      writeFileSync(join(root, 'index.html'), `<head>${meta}</head>`);
      writeFileSync(join(root, 'privacy.html'), `<head>${meta}</head>`);
      expect(nativeContentSecurityPolicyProblems(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires the policy to authorize every generated inline script hash', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-csp-script-'));
    try {
      const script = 'globalThis.__sveltekit_boot = true;';
      const hash = `sha256-${createHash('sha256').update(script).digest('base64')}`;
      const native = nativeMetaCspDirectives();
      const policy = serializeCspDirectives({
        ...native,
        'script-src': [...native['script-src'], hash],
      });
      writeFileSync(
        join(root, 'index.html'),
        `<head><meta http-equiv="content-security-policy" content="${policy}"></head><script>${script}</script>`
      );
      expect(nativeContentSecurityPolicyProblems(root)).toEqual([]);

      writeFileSync(join(root, 'index.html'), `<head>${meta}</head><script>${script}</script>`);
      expect(nativeContentSecurityPolicyProblems(root)).toEqual([
        expect.stringContaining('has the wrong CSP meta policy'),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not require hashes for inline JSON data blocks', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-csp-data-'));
    try {
      writeFileSync(
        join(root, 'index.html'),
        `<head>${meta}</head>` +
          '<script type="application/json" data-sveltekit-fetched>{"data":true}</script>' +
          '<script type="application/ld+json">{"@type":"Thing"}</script>'
      );
      expect(nativeContentSecurityPolicyProblems(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a missing or duplicated policy', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-csp-count-'));
    try {
      writeFileSync(join(root, 'index.html'), '<head></head>');
      writeFileSync(join(root, 'privacy.html'), `<head>${meta}${meta}</head>`);
      expect(nativeContentSecurityPolicyProblems(root)).toEqual([
        expect.stringContaining('index.html has 0 CSP meta tags; expected exactly 1'),
        expect.stringContaining('privacy.html has 2 CSP meta tags; expected exactly 1'),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an extra connect origin or a meta-unsupported directive', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-native-csp-policy-'));
    try {
      const widened = expected.replace(
        "connect-src 'self'",
        "connect-src 'self' https://unexpected.example"
      );
      writeFileSync(
        join(root, 'index.html'),
        `<head><meta http-equiv="content-security-policy" content="${widened}; frame-ancestors 'none'">`
      );
      expect(nativeContentSecurityPolicyProblems(root)).toEqual([
        expect.stringContaining('has the wrong CSP meta policy'),
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
