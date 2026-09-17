import { describe, expect, it } from 'vitest';
import { saveFailureCopy } from './saveFailureCopy';

describe('saveFailureCopy', () => {
  it('names the Photos permission on iOS', () => {
    expect(saveFailureCopy('denied', 1, 'ios')).toEqual({
      heading: "Your picture wasn't saved",
      detail:
        'Splotch needs permission to add pictures to Photos. Turn it on in Settings, then try again.',
    });
  });

  it('names the storage permission on Android', () => {
    expect(saveFailureCopy('denied', 1, 'android').detail).toContain('storage permission');
  });

  it('counts several held pictures', () => {
    expect(saveFailureCopy('failed', 3, 'android').heading).toBe("3 pictures weren't saved");
  });

  it('offers a retry only when a picture is held', () => {
    expect(saveFailureCopy('failed', 1, 'web').detail).toContain('Try again');
    expect(saveFailureCopy('failed', 0, 'web').detail).not.toContain('Try again');
  });

  it('never points the web at a permission it cannot have', () => {
    expect(saveFailureCopy('denied', 1, 'web').detail).not.toContain('Settings');
  });
});
