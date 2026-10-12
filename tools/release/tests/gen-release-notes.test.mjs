import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseReleaseSource,
  releaseAnchor,
  releaseNoteOutputPaths,
  renderReleaseComponent,
  renderReleaseHistory,
  renderReleaseMetadata,
  renderReleaseHueModule,
  RELEASE_HUES,
  validateBundledReleaseText,
  validateEmDashSpacing,
  validateStoreText,
} from '../gen-release-notes.mjs';

it('generates every release datetime from its validated source date', () => {
  const metadata = JSON.parse(
    readFileSync(new URL('../../../web/src/lib/releases.json', import.meta.url), 'utf8')
  );
  expect(metadata.length).toBeGreaterThan(0);
  for (const release of metadata) {
    const filename = `${release.version}.md`;
    const source = readFileSync(new URL(`../../../releases/${filename}`, import.meta.url), 'utf8');
    const parsed = parseReleaseSource(filename, source);
    expect(release.datetime).toBe(parsed.meta.date);
    expect(release.dateLabel).toBe(parsed.dateLabel);
  }
});

describe('parseReleaseSource', () => {
  it('formats a validated release date for the generated app data', () => {
    expect(
      parseReleaseSource(
        '2.0.0.md',
        '---\nversion: 2.0.0\ndate: 2026-07-28\n---\n\n## New\n\nFaster drawing.'
      ).dateLabel
    ).toBe('July 28, 2026');
  });

  it.each(['07/28/2026', '2026-07-28  # ship day', '', '2026-13-01'])(
    'rejects invalid release date frontmatter %j',
    (date) => {
      expect(() =>
        parseReleaseSource(
          '2.0.0.md',
          `---\nversion: 2.0.0\ndate: ${date}\n---\n\n## New\n\nFaster drawing.`
        )
      ).toThrow(/2\.0\.0\.md: date must/);
    }
  );

  it('rejects impossible calendar dates', () => {
    expect(() =>
      parseReleaseSource(
        '2.0.0.md',
        '---\nversion: 2.0.0\ndate: 2026-02-29\n---\n\n## New\n\nFaster drawing.'
      )
    ).toThrow('2.0.0.md: date must be a real calendar date');
  });

  // The releases sort by this version, so a 1.7.0.md still saying 1.6.0 tied with
  // the real 1.6.0: duplicate anchors, a second "Version 1.6.0", and either file's
  // notes as the current What's New depending on directory order.
  it('rejects a frontmatter version that does not match the filename', () => {
    const release = (version) =>
      `---\nversion: ${version}\ndate: 2026-10-01\n---\n\n## New\n\n* A thing`;

    expect(() => parseReleaseSource('1.7.0.md', release('1.6.0'))).toThrow(
      new Error('1.7.0.md: frontmatter version 1.6.0 does not match the filename version 1.7.0')
    );
    expect(() => parseReleaseSource('1.7.0.md', release('1.7'))).toThrow(
      new Error('1.7.0.md: frontmatter version must look like 1.2.0, got "1.7"')
    );
    expect(parseReleaseSource('1.7.0.md', release('1.7.0')).meta.version).toBe('1.7.0');
  });
});

describe('releaseNoteOutputPaths', () => {
  it('lists the app outputs, a Play changelog per pinned release, and the App Store notes', () => {
    const release = (version, androidVersionCode) => ({
      filename: `${version}.md`,
      meta: { version, date: '2026-10-01', androidVersionCode },
      body: '## New\n\n* A thing',
    });

    expect(
      releaseNoteOutputPaths([release('1.7.0', '9'), release('1.6.0', '8'), release('0.9.0')])
    ).toEqual([
      'web/src/lib/releaseHues.ts',
      'web/src/lib/releases.json',
      'web/src/lib/components/settings/CurrentReleaseNotes.svelte',
      'web/src/lib/components/page/ReleaseHistory.svelte',
      'fastlane/metadata/android/en-US/changelogs/9.txt',
      'fastlane/metadata/android/en-US/changelogs/8.txt',
      'fastlane/metadata/en-US/release_notes.txt',
    ]);
  });
});

describe('validateStoreText', () => {
  it('accepts ordinary plain text', () => {
    expect(() => validateStoreText('Faster drawing where 2 < 3 and 5 > 4.')).not.toThrow();
  });

  it('rejects tag-shaped markup', () => {
    expect(() =>
      validateStoreText('App updates no longer leave stale content.\n</content>')
    ).toThrow('Store text contains HTML/XML-like markup');
  });
});

describe('validateBundledReleaseText', () => {
  it('allows qualified features from the complete cross-platform history', () => {
    expect(() =>
      validateBundledReleaseText(
        'Save your drawings straight to a folder on your computer (web).\nNative Apple Pencil support.'
      )
    ).not.toThrow();
  });

  it.each(['Google Play', 'Play Store', 'App Store'])(
    'rejects marketplace-specific copy containing %s',
    (phrase) => {
      expect(() => validateBundledReleaseText(`Now available on ${phrase}.`, '2.0.0.md')).toThrow(
        `2.0.0.md: release notes are bundled on web, Android, and iOS and must not name ${phrase}`
      );
    }
  );
});

describe('validateEmDashSpacing', () => {
  it('allows the open em dash the app copy uses', () => {
    expect(() =>
      validateEmDashSpacing(
        'Dark mode — Light, Dark, or follow the system.\nSplotch — a quiet app.'
      )
    ).not.toThrow();
  });

  it.each([
    ['closed on both sides', 'Pick sounds for the app—plus a clear sound.', 'p—p'],
    ['closed on the left', 'Pick sounds for the app— plus a clear sound.', 'p—'],
    ['closed on the right', 'Pick sounds for the app —plus a clear sound.', '—p'],
  ])('rejects an em dash %s and names the offending run', (_shape, text, run) => {
    expect(() => validateEmDashSpacing(text, '2.0.0.md')).toThrow(
      `2.0.0.md: em dashes are set open in this app's copy — put a space on both sides of "${run}"`
    );
  });
});

describe('renderReleaseComponent', () => {
  it('emits compile-time markup and escapes Svelte expression braces', () => {
    expect(renderReleaseComponent('## New\n\n* Draw `{fast}`.', '2.0.0.md')).toBe(
      '<script module lang="ts">\n  export const RELEASE_NOTE_SECTION_COUNT = 1;\n</script>\n\n' +
        '<script lang="ts">\n  import ReleaseSectionHeading from \'$lib/components/ReleaseSectionHeading.svelte\';\n\n' +
        '  let {\n    headingLevel,\n    visibleSections = RELEASE_NOTE_SECTION_COUNT,\n  }: { headingLevel: 4 | 5; visibleSections?: number } = $props();\n</script>\n\n' +
        '<!-- Generated by tools/release/gen-release-notes.mjs from releases/2.0.0.md. -->\n' +
        '{#if visibleSections >= 1}\n' +
        '  <ReleaseSectionHeading title="New" level={headingLevel} />\n  <ul>\n    <li>Draw <code>&#123;fast&#125;</code>.</li>\n  </ul>\n' +
        '{/if}\n'
    );
  });

  it('splits level-two release sections into separate presentation chunks', () => {
    const component = renderReleaseComponent('## New\n\nFirst.\n\n## Fixed\n\nSecond.', '2.0.0.md');

    expect(component).toContain('export const RELEASE_NOTE_SECTION_COUNT = 2;');
    expect(component).toContain(
      '{#if visibleSections >= 1}\n  <ReleaseSectionHeading title="New" level={headingLevel} />'
    );
    expect(component).toContain(
      '{#if visibleSections >= 2}\n  <ReleaseSectionHeading title="Fixed" level={headingLevel} />'
    );
  });

  it('nests every heading under the release date and compiles only the section headings', () => {
    const component = renderReleaseComponent(
      '# Top\n\n## Improved\n\nNew\n\n### Fixed\n\n## Notes\n\n##### Deep\n\n`<h2>New</h2>`',
      '2.0.0.md'
    );

    expect(component).toContain('<ReleaseSectionHeading title="Improved" level={headingLevel} />');
    expect(component).toContain('<p>New</p>');
    expect(component).toContain(
      '<svelte:element this={`h${headingLevel - 1}`}>Top</svelte:element>'
    );
    expect(component).toContain(
      '<svelte:element this={`h${Math.min(headingLevel + 1, 6)}`}>Fixed</svelte:element>'
    );
    expect(component).toContain('<svelte:element this={`h${headingLevel}`}>Notes</svelte:element>');
    expect(component).toContain(
      '<svelte:element this={`h${Math.min(headingLevel + 3, 6)}`}>Deep</svelte:element>'
    );
    expect(component).toContain('&lt;h2&gt;New&lt;/h2&gt;');
    expect(component).not.toMatch(/<h[1-6]>/);
    expect(component.match(/<ReleaseSectionHeading /g)).toHaveLength(1);
  });

  it('leaves a heading outside the section vocabulary as an escaped plain heading', () => {
    const component = renderReleaseComponent('## A "{draft}" & notes', '2.0.0.md');

    expect(component).toContain(
      '<svelte:element this={`h${headingLevel}`}>A &quot;&#123;draft&#125;&quot; &amp; notes</svelte:element>'
    );
    expect(component).not.toContain('<ReleaseSectionHeading');
  });
});

describe('renderReleaseHistory', () => {
  const releases = [
    {
      meta: { version: '2.0.0', date: '2026-08-08' },
      dateLabel: 'August 8, 2026',
      body: '## New\n\n* Draw `{fast}`.',
    },
    {
      meta: { version: '1.9.0', date: '2026-07-01' },
      dateLabel: 'July 1, 2026',
      body: '## Fixed\n\n* Smoother lines.',
    },
  ];

  it('renders every release with matching anchors, dates, and nested note headings', () => {
    const component = renderReleaseHistory(releases);

    expect(releaseAnchor('2.0.0')).toBe('release-2-0-0');
    expect(component).toContain(
      "import ReleaseSectionHeading from '$lib/components/ReleaseSectionHeading.svelte';"
    );
    expect(component).toContain('<article class="release" id="release-2-0-0" data-hue="Purple">');
    expect(component).toContain('<article class="release" id="release-1-9-0" data-hue="Blue">');
    expect(component).toContain('<time datetime="2026-08-08">August 8, 2026</time>');
    expect(component).toContain('<ReleaseSectionHeading title="New" level={3} />');
    expect(component).toContain('<code>&#123;fast&#125;</code>');
    expect(component).not.toMatch(/[ \t]+$/m);
  });
});

it('generates hue metadata, one latest label, empty relative dates and accessible lists', () => {
  const releases = Array.from({ length: 8 }, (_, index) => ({
    meta: { version: `1.${index}.0`, date: '2026-09-30' },
    dateLabel: 'September 30, 2026',
    body: '## New\n\n* An inline [link](https://splotch.art) stays in prose.',
  }));
  const component = renderReleaseHistory(releases);
  expect(renderReleaseMetadata(releases).map((release) => release.hue)).toEqual([
    ...RELEASE_HUES,
    'Purple',
    'Blue',
  ]);
  expect(component.match(/class="release-latest"/g)).toHaveLength(1);
  expect(
    component.match(/class="release-ago" data-ago-for="2026-09-30" aria-hidden="true"><\/span>/g)
  ).toHaveLength(8);
  expect(component.match(/<ul role="list">/g)).toHaveLength(8);
  expect(component).toContain('<a href="https://splotch.art">link</a> stays in prose.');
  expect(component).toContain('<details class="release-older" data-older-count="5">');
  const split = component.indexOf('<details');
  expect(component.slice(0, split).match(/<article /g)).toHaveLength(3);
  expect(component.slice(split).match(/<article /g)).toHaveLength(5);
  expect(component).toContain('Show 5 older releases');
  expect(renderReleaseHistory(releases.slice(0, 4))).toContain('Show 1 older release</summary>');
  expect(renderReleaseHistory(releases.slice(0, 3))).not.toContain('<details');
});

it('keeps the generated runtime hue vocabulary owned by the generator', () => {
  const module = readFileSync(
    new URL('../../../web/src/lib/releaseHues.ts', import.meta.url),
    'utf8'
  );
  expect(module).toBe(renderReleaseHueModule());
});
