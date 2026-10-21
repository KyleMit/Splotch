import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CRASH_TARGETS, CRASH_TARGET_NAMES } from '../lib/crash-targets.mjs';
import { parseClearDragFlags } from '../run-clear-drag-stress.mjs';

const argvFor = (target, fingers) => [
  '--session=no/such/session.json',
  `--target=${target}`,
  '--bundle=art.example.app',
  '--process-name=Splotch',
  '--out=no/such/out',
  `--fingers=${fingers}`,
];

let error;
let exit;

beforeEach(() => {
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
  exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process exited');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseClearDragFlags --fingers', () => {
  it.each(CRASH_TARGET_NAMES)('accepts %s’s own finger limit', (target) => {
    const { maxFingers } = CRASH_TARGETS[target];

    expect(parseClearDragFlags(argvFor(target, maxFingers)).fingers).toBe(maxFingers);
    expect(exit).not.toHaveBeenCalled();
  });

  it.each(CRASH_TARGET_NAMES)('refuses one finger past %s’s limit', (target) => {
    const { maxFingers } = CRASH_TARGETS[target];

    expect(() => parseClearDragFlags(argvFor(target, maxFingers + 1))).toThrow('process exited');
    expect(error).toHaveBeenCalledWith(
      `--fingers=${maxFingers + 1} exceeds the ${maxFingers} simultaneous fingers --target=${target} allows`
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
