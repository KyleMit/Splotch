import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  parseReleaseSource,
  renderReleaseHueModule,
  renderNativeReleaseNotes,
  renderNativeReleaseSections,
  nativeSectionsFromRenderedHtml,
  validateBundledReleaseText,
  validateEmDashSpacing,
  validateStoreText,
} from '../gen-release-notes.mjs';
import { renderReleaseMarkdown } from '../lib/release-markdown.mjs';

it('loads release generation and direct release owners without TypeScript stripping', () => {
  const generation = new URL('../gen-release-notes.mjs', import.meta.url).href;
  const release = new URL('../cut-release.mjs', import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      '--no-experimental-strip-types',
      '--input-type=module',
      '-e',
      `await import(${JSON.stringify(generation)}); await import(${JSON.stringify(release)});`,
    ],
    { encoding: 'utf8' }
  );
  expect(result.status, result.stderr).toBe(0);
});

it('generates every release datetime from its validated source date', () => {
  const metadata = JSON.parse(
    readFileSync(new URL('../../../src/lib/releases.json', import.meta.url), 'utf8')
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

it('keeps the generated runtime hue vocabulary owned by the generator', () => {
  const module = readFileSync(new URL('../../../src/lib/releaseHues.ts', import.meta.url), 'utf8');
  expect(module).toBe(renderReleaseHueModule());
});

describe('renderNativeReleaseSections', () => {
  // Every construct releases/README.md permits, including the spellings that span lines.
  const PERMITTED = {
    'wrapped bullets':
      '## New\n\n* A bullet that wraps\n  onto a second line.\n* Another\ncontinues unindented.',
    'multi-line paragraphs':
      '## Improved\n\nA paragraph that runs\nacross two lines.\n\nA second paragraph.',
    'dash and star items': '## Fixed\n\n- A dash item.\n* A star item.',
    'level-three headings':
      '## New\n\n### Drawing\n\n* Smoother lines.\n\n### Sound\n\nQuieter clicks.',
    'inline spans':
      '## New\n\n* **Bold**, *italic*, _underscored_, `code` and [a link](https://splotch.art).',
    'escaped text': '## New\n\n* Fish & chips < 5 "quoted" it\'s &amp; kept.',
    'text before any heading': 'A lead paragraph.\n\n* A lead item.\n\n## New\n\n* An item.',
    'a heading with no notes': '## New\n\n## Fixed\n\n* One fix.',
    'a heading outside the vocabulary': '## Thanks\n\n* To everyone who tested.',
  };

  function shippingTexts(body) {
    const html = renderReleaseMarkdown(body);
    return [...html.matchAll(/<(h[1-6]|li|p)>([\s\S]*?)<\/\1>/g)].map(([, tag, inner]) => ({
      heading: tag.startsWith('h'),
      text: nativeSectionsFromRenderedHtml(`<p>${inner}</p>`)[0].blocks[0].text,
    }));
  }

  function nativeTexts(sections) {
    return sections.flatMap(({ title, blocks }, index) => [
      ...(index > 0 || title ? [{ heading: true, text: title }] : []),
      ...blocks.map(({ text }) => ({ heading: false, text })),
    ]);
  }

  it.each(Object.entries(PERMITTED))(
    'carries %s exactly as the shipping renderer reads them',
    (_name, body) => {
      const native = renderNativeReleaseSections(body);
      expect(nativeTexts(native)).toEqual(shippingTexts(body));
      for (const { blocks } of native)
        for (const { text } of blocks) expect(text).not.toMatch(/<\/?[a-z]|&(?:#\d+|\w+);|\n/);
    }
  );

  it('keeps list items, paragraphs, wrapped lines and entities as plain text', () => {
    expect(renderNativeReleaseSections(PERMITTED['wrapped bullets'])).toEqual([
      {
        title: 'New',
        blocks: [
          { kind: 'item', text: 'A bullet that wraps onto a second line.' },
          { kind: 'item', text: 'Another continues unindented.' },
        ],
      },
    ]);
    expect(renderNativeReleaseSections(PERMITTED['multi-line paragraphs'])).toEqual([
      {
        title: 'Improved',
        blocks: [
          {
            kind: 'paragraph',
            text: 'A paragraph that runs across two lines.',
          },
          { kind: 'paragraph', text: 'A second paragraph.' },
        ],
      },
    ]);
    expect(renderNativeReleaseSections(PERMITTED['escaped text'])[0].blocks[0].text).toBe(
      'Fish & chips < 5 "quoted" it\'s & kept.'
    );
    expect(renderNativeReleaseSections(PERMITTED['text before any heading'])[0]).toEqual({
      title: '',
      blocks: [
        { kind: 'paragraph', text: 'A lead paragraph.' },
        { kind: 'item', text: 'A lead item.' },
      ],
    });
  });

  it('generates native notes for every release the shipping renderer accepts', () => {
    const releases = Object.values(PERMITTED).map((body, index) =>
      parseReleaseSource(
        `9.${index}.0.md`,
        `---\nversion: 9.${index}.0\ndate: 2026-10-01\n---\n\n${body}\n`
      )
    );
    const notes = JSON.parse(renderNativeReleaseNotes(releases));
    expect(Object.keys(notes)).toEqual(releases.map(({ meta }) => meta.version));
  });

  it.each([
    ['a fenced code block', '## New\n\n```\ncode\n```'],
    ['an ordered list', '## New\n\n1. First'],
    ['raw HTML', '## New\n\n<b>bold</b>'],
  ])('refuses %s only where the shipping renderer refuses it, with its error', (_name, body) => {
    let shipping;
    try {
      renderReleaseMarkdown(body);
    } catch (error) {
      shipping = error.message;
    }
    expect(shipping).toBeDefined();
    expect(() => renderNativeReleaseSections(body)).toThrow(shipping);
  });
});
