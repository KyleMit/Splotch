import { describe, expect, it } from 'vitest';
import {
  EDGE_MARGIN_PT,
  clampToSafeArea,
  createSeededRandom,
  pointerChain,
  tapChain,
} from '../lib/pointer-chains.mjs';

const WIN = { width: 1000, height: 800 };
const clamp = (point) => clampToSafeArea(WIN, point);

describe('pointerChain leading pause', () => {
  // WDA rejects a chain whose first action is a pause; S4 and S6 open their second finger with one.
  it('opens a pause-first chain with a zero-length move to its first press point', () => {
    const chain = pointerChain(
      'clear',
      [{ pause: 400 }, { points: [{ x: 30.4, y: 20.6 }], raw: true }],
      clamp
    );

    expect(chain.actions[0]).toEqual({ type: 'pointerMove', duration: 0, x: 30, y: 21 });
    expect(chain.actions[1]).toEqual({ type: 'pause', duration: 400 });
    expect(chain.actions.filter((action) => action.type === 'pointerDown')).toHaveLength(1);
  });

  it('clamps the leading move like the press it precedes when that press is not raw', () => {
    const chain = pointerChain('draw', [{ pause: 300 }, { points: [{ x: 5, y: 5 }] }], clamp);

    expect(chain.actions[0]).toMatchObject({ x: EDGE_MARGIN_PT, y: EDGE_MARGIN_PT });
  });

  it('adds no move to a chain that opens with a press', () => {
    const chain = pointerChain('tap', [{ points: [{ x: 500, y: 400 }] }], clamp);

    expect(chain.actions.map((action) => action.type)).toEqual([
      'pointerMove',
      'pointerDown',
      'pointerUp',
    ]);
  });

  it('adds no move to a chain with nothing to press', () => {
    const chain = pointerChain('idle', [{ pause: 200 }], clamp);

    expect(chain.actions).toEqual([{ type: 'pause', duration: 200 }]);
  });
});

describe('pointerChain clamping', () => {
  it('keeps a raw press where it is and clamps every later point into the safe band', () => {
    const chain = pointerChain(
      'clear',
      [
        {
          points: [
            { x: 990, y: 10 },
            { x: 999, y: 799 },
          ],
          raw: true,
        },
      ],
      clamp
    );

    expect(chain.actions[0]).toMatchObject({ x: 990, y: 10 });
    expect(chain.actions[2]).toMatchObject({
      x: WIN.width - EDGE_MARGIN_PT,
      y: WIN.height - EDGE_MARGIN_PT,
    });
  });
});

describe('tapChain', () => {
  it('presses one point count times with the gap between presses only', () => {
    const chain = tapChain('f', { x: 10, y: 10 }, { count: 2, holdMs: 40, gapMs: 120 });

    expect(chain.actions.map((action) => action.type)).toEqual([
      'pointerMove',
      'pointerDown',
      'pause',
      'pointerUp',
      'pause',
      'pointerDown',
      'pause',
      'pointerUp',
    ]);
    expect(chain.actions[4].duration).toBe(120);
  });
});

describe('createSeededRandom', () => {
  it('replays the same sequence from the same seed and run, and a different one per run', () => {
    const draw = (seed, run) => {
      const random = createSeededRandom(seed, run);
      return Array.from({ length: 5 }, () => random());
    };

    expect(draw(3, 7)).toEqual(draw(3, 7));
    expect(draw(3, 8)).not.toEqual(draw(3, 7));
    expect(draw(3, 7).every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
