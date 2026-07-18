import { describe, expect, it } from 'vitest';
import { nextDepositLevel, paperTooth } from './crayon';

describe('crayon paper tooth', () => {
  it('is deterministic and rises through distinct coverage levels', () => {
    expect(paperTooth(17, 29)).toBe(paperTooth(17, 29));
    expect(nextDepositLevel(0)).toBeLessThan(nextDepositLevel(1));
    expect(nextDepositLevel(1)).toBeLessThan(nextDepositLevel(2));
    expect(nextDepositLevel(20)).toBe(0.98);
  });
});
