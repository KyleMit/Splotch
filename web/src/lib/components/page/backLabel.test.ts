import { describe, expect, it } from 'vitest';
import {
  DRAWING_VISITED_FLAG,
  DRAWING_VISITED_SESSION_KEY,
  readDrawingVisitedFlag,
  resolveBackLabel,
} from './backLabel';

const ORIGIN = 'https://splotch.art';
const COLD = { fromPath: null, sessionFlag: null, referrer: '', origin: ORIGIN };

describe('resolveBackLabel', () => {
  it('offers the way back after a client navigation from the canvas', () => {
    expect(resolveBackLabel({ ...COLD, fromPath: '/' })).toBe('Back to drawing');
  });

  it('offers the way back once the canvas has run in this tab', () => {
    expect(resolveBackLabel({ ...COLD, fromPath: '/privacy', sessionFlag: '1' })).toBe(
      'Back to drawing'
    );
  });

  it('offers the way back for a full load referred by the canvas', () => {
    expect(resolveBackLabel({ ...COLD, referrer: `${ORIGIN}/` })).toBe('Back to drawing');
  });

  it('invites a first drawing when another page on the site referred the visit', () => {
    expect(resolveBackLabel({ ...COLD, referrer: `${ORIGIN}/changelog` })).toBe('Start drawing');
  });

  it('invites a first drawing when another site referred the visit', () => {
    expect(resolveBackLabel({ ...COLD, referrer: 'https://play.google.com/' })).toBe(
      'Start drawing'
    );
  });

  it('invites a first drawing when nothing referred the visit', () => {
    expect(resolveBackLabel(COLD)).toBe('Start drawing');
  });

  it('invites a first drawing after a client navigation from another page', () => {
    expect(resolveBackLabel({ ...COLD, fromPath: '/changelog' })).toBe('Start drawing');
  });

  it('treats an unparseable referrer as a cold visit', () => {
    expect(resolveBackLabel({ ...COLD, referrer: 'not a url' })).toBe('Start drawing');
  });
});

describe('readDrawingVisitedFlag', () => {
  it('reads the flag the drawing route writes', () => {
    sessionStorage.setItem(DRAWING_VISITED_SESSION_KEY, DRAWING_VISITED_FLAG);
    try {
      expect(readDrawingVisitedFlag(() => sessionStorage)).toBe(DRAWING_VISITED_FLAG);
    } finally {
      sessionStorage.removeItem(DRAWING_VISITED_SESSION_KEY);
    }
  });

  it('reads a blocked sessionStorage as no visit', () => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    expect(readDrawingVisitedFlag(blocked)).toBeNull();
    expect(resolveBackLabel({ ...COLD, sessionFlag: readDrawingVisitedFlag(blocked) })).toBe(
      'Start drawing'
    );
  });
});
