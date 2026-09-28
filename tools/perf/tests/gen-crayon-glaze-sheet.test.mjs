import { describe, expect, it } from 'vitest';
import { parsePort } from '../gen-crayon-glaze-sheet.mjs';

describe('parsePort', () => {
  it('accepts a whole TCP port', () => {
    expect(parsePort('4198')).toBe(4198);
  });

  // parseInt turned the first into NaN and the second into 41, and both reached
  // lsof and vite as the port to clear and serve on.
  it.each(['abc', '41x', '4198.5', '', '0', '65536'])('rejects %j', (value) => {
    expect(() => parsePort(value)).toThrow(`--port: "${value}" is not a TCP port`);
  });
});
