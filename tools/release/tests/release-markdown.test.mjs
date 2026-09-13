import { describe, expect, it } from 'vitest';
import { renderReleaseMarkdown } from '../lib/release-markdown.mjs';

describe('renderReleaseMarkdown blocks', () => {
  it('renders a heading at the level its hashes name', () => {
    expect(renderReleaseMarkdown('## New')).toBe('<h2>New</h2>\n');
    expect(renderReleaseMarkdown('###### Deep')).toBe('<h6>Deep</h6>\n');
  });

  it('gathers consecutive bullets into one list, for either bullet marker', () => {
    expect(renderReleaseMarkdown('* One\n- Two')).toBe('<ul>\n<li>One</li>\n<li>Two</li>\n</ul>\n');
  });

  it('continues a list item onto its wrapped line without the indent', () => {
    expect(renderReleaseMarkdown('* A bullet that\n  continues here.')).toBe(
      '<ul>\n<li>A bullet that\ncontinues here.</li>\n</ul>\n'
    );
  });

  it('keeps a paragraph that follows a list out of it', () => {
    expect(renderReleaseMarkdown('* One\n\nAfterwards.')).toBe(
      '<ul>\n<li>One</li>\n</ul>\n<p>Afterwards.</p>\n'
    );
  });

  it('separates paragraphs on the blank line between them', () => {
    expect(renderReleaseMarkdown('One line.\nSame paragraph.\n\nNext.')).toBe(
      '<p>One line.\nSame paragraph.</p>\n<p>Next.</p>\n'
    );
  });
});

describe('renderReleaseMarkdown inline', () => {
  it.each([
    ['**bold**', '<p><strong>bold</strong></p>\n'],
    ['*ital*', '<p><em>ital</em></p>\n'],
    ['_ital_', '<p><em>ital</em></p>\n'],
    ['`code`', '<p><code>code</code></p>\n'],
    ['[text](https://x.test/a)', '<p><a href="https://x.test/a">text</a></p>\n'],
  ])('renders %s', (markdown, expected) => {
    expect(renderReleaseMarkdown(markdown)).toBe(expected);
  });

  it('leaves an underscore inside a word alone', () => {
    expect(renderReleaseMarkdown('The perf_marks_flag stays literal.')).toBe(
      '<p>The perf_marks_flag stays literal.</p>\n'
    );
  });

  // A delimiter with whitespace just inside it is not emphasis in CommonMark,
  // so marked renders these literally and so must this.
  it.each(['Multiply 5 * 3 * 2 today.', 'A lone * asterisk.'])(
    'leaves a spaced asterisk in prose alone: %j',
    (markdown) => {
      expect(renderReleaseMarkdown(markdown)).toBe(`<p>${markdown}</p>\n`);
    }
  );

  it('still emphasises a multi-word span', () => {
    expect(renderReleaseMarkdown('An *emphasised phrase* here.')).toBe(
      '<p>An <em>emphasised phrase</em> here.</p>\n'
    );
  });

  it('treats emphasis markers inside a code span as content', () => {
    expect(renderReleaseMarkdown('`a *b* c`')).toBe('<p><code>a *b* c</code></p>\n');
  });

  it('treats an underscore inside a link target as content', () => {
    expect(renderReleaseMarkdown('[docs](https://x.test/a_b_c)')).toBe(
      '<p><a href="https://x.test/a_b_c">docs</a></p>\n'
    );
  });

  it('escapes markup characters everywhere text reaches the output', () => {
    expect(renderReleaseMarkdown('## 2 < 3 & "q"')).toBe('<h2>2 &lt; 3 &amp; &quot;q&quot;</h2>\n');
    expect(renderReleaseMarkdown('`<h2>x</h2>`')).toBe(
      '<p><code>&lt;h2&gt;x&lt;/h2&gt;</code></p>\n'
    );
    expect(renderReleaseMarkdown('[a & b](https://x.test/?c=1&d=2)')).toBe(
      '<p><a href="https://x.test/?c=1&amp;d=2">a &amp; b</a></p>\n'
    );
  });

  it('leaves a character reference the author already wrote intact', () => {
    expect(renderReleaseMarkdown('a&amp;b &#39; &nbsp;')).toBe('<p>a&amp;b &#39; &nbsp;</p>\n');
  });
});

describe('renderReleaseMarkdown refusals', () => {
  // A construct this renderer does not implement must fail the release build.
  // Rendering it as literal prose is the failure mode worth paying for: the
  // artifacts are generated once per cut and read by every user.
  it.each([
    ['```\ncode\n```', 'a fenced code block'],
    ['> quoted', 'a blockquote'],
    ['1. first', 'an ordered list'],
    ['| a | b |', 'a table'],
    ['* Top\n  * Nested', 'a nested list'],
    ['* Top\n    - Deep', 'a nested list'],
    ['![alt](x.png)', 'an image'],
    ['<div>raw</div>', 'raw HTML'],
    ['---', 'a horizontal rule'],
  ])('refuses %j', (markdown, construct) => {
    expect(() => renderReleaseMarkdown(markdown)).toThrow(construct);
  });

  it('refuses an unsupported construct reached from inside a list item', () => {
    expect(() => renderReleaseMarkdown('* An item\n  | a | b |')).toThrow('a table');
  });

  it('refuses an unsupported construct reached from inside a paragraph', () => {
    expect(() => renderReleaseMarkdown('A line.\n> quoted')).toThrow('a blockquote');
  });
});
