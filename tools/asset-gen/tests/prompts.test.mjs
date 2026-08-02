import { describe, expect, it } from 'vitest';
import { FRESH_STYLE_PROMPT } from '../lib/prompts.mjs';

describe('fresh outline prompt contracts', () => {
  it.each(['borders', 'frames', 'page outlines', 'decorative boxes', 'decorative panels'])(
    'explicitly forbids %s',
    (forbiddenEnclosure) => {
      expect(FRESH_STYLE_PROMPT.toLowerCase()).toContain(forbiddenEnclosure);
    }
  );

  it('forbids an enclosing rectangle or line around every page-level target', () => {
    expect(FRESH_STYLE_PROMPT).toContain(
      'Do not surround or box in the page, composition, subject, or background'
    );
  });
});
