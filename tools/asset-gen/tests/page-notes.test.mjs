import { describe, expect, it } from 'vitest';
import { withPageNotes } from '../lib/page-notes.mjs';

describe('withPageNotes', () => {
  it('leaves the shared prompt unchanged without page notes', () => {
    expect(withPageNotes('Shared prompt')).toBe('Shared prompt');
  });

  it('appends page notes through the shared boundary header', () => {
    expect(withPageNotes('Shared prompt', 'Keep the pupil small.')).toBe(
      'Shared prompt\n\nPAGE-SPECIFIC NOTES:\nKeep the pupil small.'
    );
  });
});
