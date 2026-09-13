import { describe, expect, it } from 'vitest';
import { autoSaveFooter } from './autoSaveCopy';

describe('autoSaveFooter', () => {
  it('offers the Download button when auto-save is off', () => {
    expect(autoSaveFooter(false, null, null)).toEqual({ kind: 'download' });
  });

  it('claims nothing while the save is still running', () => {
    expect(autoSaveFooter(true, null, null)).toBeNull();
    expect(autoSaveFooter(true, 'saving', null)).toBeNull();
  });

  it('falls back to the Download button when the save failed', () => {
    expect(autoSaveFooter(true, 'failed', 'Drawings')).toEqual({ kind: 'download' });
  });

  it('names where the picture actually went', () => {
    expect(autoSaveFooter(true, 'photos', null)).toEqual({
      kind: 'saved',
      caption: 'Saved to your photos',
    });
    expect(autoSaveFooter(true, 'folder', 'Drawings')).toEqual({
      kind: 'saved',
      caption: 'Saved to Drawings',
    });
    expect(autoSaveFooter(true, 'folder', null)).toEqual({
      kind: 'saved',
      caption: 'Saved to your folder',
    });
    expect(autoSaveFooter(true, 'download', null)).toEqual({
      kind: 'saved',
      caption: 'Downloaded',
    });
  });
});
