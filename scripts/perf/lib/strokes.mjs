// Synthetic stroke battery for the simplification sweep (scripts/perf/simplify-sweep.mjs).
// Each stroke is one continuous gesture (one undo command) laid out in its own
// non-overlapping grid cell, so a single forced rebuild exposes every stroke's
// shift at once and each cell can be diffed independently (no overlap ambiguity).
// Points are in CSS canvas px, spaced ~4px apart to mimic a ~120Hz finger so
// there's realistic redundancy to simplify.

// Sample a parametric curve fn(t)->{x,y} (t in [0,1]) at ~`spacing` px steps.
function sample(fn, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(fn(i / steps));
  return pts;
}

// Each generator draws into a local box [0,size]² centered later into a cell.
function makeStrokes(size) {
  const S = size;
  const c = S / 2;
  return [
    {
      name: 'zigzag-tight',
      desc: 'back-and-forth scribble (the reported case)',
      brush: 5,
      points: (() => {
        const pts = [];
        const passes = 9;
        const stepsPer = 26;
        for (let p = 0; p < passes; p++) {
          const left = p % 2 === 0;
          for (let i = 0; i <= stepsPer; i++) {
            const tx = i / stepsPer;
            pts.push({
              x: (left ? tx : 1 - tx) * S,
              y: (p / passes) * S + (tx * S) / passes,
            });
          }
        }
        return pts;
      })(),
    },
    {
      name: 'zigzag-sparse',
      desc: 'fast wide zigzag, few samples per pass (sharp corners)',
      brush: 4,
      points: (() => {
        const pts = [];
        const passes = 6;
        const stepsPer = 6;
        for (let p = 0; p < passes; p++) {
          const left = p % 2 === 0;
          for (let i = 0; i <= stepsPer; i++) {
            const tx = i / stepsPer;
            pts.push({ x: (left ? tx : 1 - tx) * S, y: (p / passes) * S + (tx * S) / passes });
          }
        }
        return pts;
      })(),
    },
    {
      name: 'smooth-arc',
      desc: 'gentle S-curve',
      brush: 3,
      points: sample((t) => ({ x: t * S, y: c + Math.sin(t * Math.PI * 2) * (S * 0.35) }), 80),
    },
    {
      name: 'circle',
      desc: 'closed loop',
      brush: 3,
      points: sample(
        (t) => ({
          x: c + Math.cos(t * Math.PI * 2) * (S * 0.4),
          y: c + Math.sin(t * Math.PI * 2) * (S * 0.4),
        }),
        90
      ),
    },
    {
      name: 'spiral',
      desc: 'tightening spiral (curvature varies)',
      brush: 2,
      points: sample((t) => {
        const r = (1 - t) * S * 0.45;
        const a = t * Math.PI * 6;
        return { x: c + Math.cos(a) * r, y: c + Math.sin(a) * r };
      }, 140),
    },
    {
      name: 'wobble',
      desc: 'dense small-amplitude wiggle on a diagonal (lots of redundant points)',
      brush: 4,
      points: sample(
        (t) => ({ x: t * S, y: t * S + Math.sin(t * Math.PI * 16) * (S * 0.06) }),
        160
      ),
    },
    {
      name: 'straight',
      desc: 'near-straight diagonal (should collapse to ~1 segment)',
      brush: 5,
      points: sample((t) => ({ x: t * S, y: t * S }), 70),
    },
    {
      name: 'hook',
      desc: 'long stroke with one sharp hook at the end (tip fidelity)',
      brush: 4,
      points: (() => {
        const a = sample((t) => ({ x: t * S, y: S * 0.5 }), 60);
        const b = sample((t) => ({ x: S - t * (S * 0.15), y: S * 0.5 - t * (S * 0.45) }), 18);
        return a.concat(b);
      })(),
    },
  ];
}

// Lay the strokes out in a square grid of `cell` px cells (CSS), with `pad`
// inset, returning {name, brush, cell:{col,row,x0,y0,size}, points:[abs CSS]}.
export function buildBattery({ cell = 320, pad = 30, cols = 3 } = {}) {
  const size = cell - pad * 2;
  const protos = makeStrokes(size);
  return protos.map((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = col * cell + pad;
    const y0 = row * cell + pad;
    return {
      name: s.name,
      desc: s.desc,
      brush: s.brush,
      cell: { col, row, x0, y0, size },
      points: s.points.map((p) => ({ x: x0 + p.x, y: y0 + p.y })),
    };
  });
}

export function batteryExtent({ cell = 320, cols = 3 } = {}) {
  const n = makeStrokes(10).length;
  const rows = Math.ceil(n / cols);
  return { width: cols * cell, height: rows * cell, count: n };
}
