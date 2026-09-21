// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runJobCommands } from '../lib/job-mirror.mjs';

describe('runJobCommands with the real runner', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints each command as a bold terminal banner and reports its exit status', () => {
    const banners = [];
    vi.spyOn(console, 'log').mockImplementation((line) => banners.push(line));

    expect(runJobCommands(['true', 'false'])).toEqual(['false']);
    expect(banners).toEqual(['\n\x1b[1m$ true\x1b[0m', '\n\x1b[1m$ false\x1b[0m']);
  });
});
