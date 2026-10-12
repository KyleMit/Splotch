import { describe, expect, it } from 'vitest';
import { autoSaveFooter } from './autoSaveCopy';

describe('autoSaveFooter', () => {
  it('offers the Download button when no auto-save ran for the picture', () => {
    expect(autoSaveFooter(null)).toEqual({ kind: 'downloadButton' });
  });

  it('claims nothing while the save is still running', () => {
    expect(autoSaveFooter({ status: 'saving' })).toBeNull();
  });

  it('falls back to the Download button when the save failed', () => {
    expect(autoSaveFooter({ status: 'failed' })).toEqual({ kind: 'downloadButton' });
    expect(autoSaveFooter({ status: 'denied' })).toEqual({ kind: 'downloadButton' });
  });

  it('names where the picture actually went', () => {
    expect(autoSaveFooter({ status: 'photos' })).toEqual({
      kind: 'saved',
      caption: 'Saved to your photos',
    });
    expect(autoSaveFooter({ status: 'chosenFolder', folderName: 'Drawings' })).toEqual({
      kind: 'saved',
      caption: 'Saved to Drawings',
    });
    expect(autoSaveFooter({ status: 'chosenFolder', folderName: '' })).toEqual({
      kind: 'saved',
      caption: 'Saved to your folder',
    });
    expect(autoSaveFooter({ status: 'downloads' })).toEqual({
      kind: 'saved',
      caption: 'Downloaded',
    });
  });
});
