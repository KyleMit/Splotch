import { describe, expect, it } from 'vitest';
import { validateStoreText } from '../generate-releases.mjs';

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
