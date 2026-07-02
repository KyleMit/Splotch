// Pure stroke-simplification geometry factored out of engine.ts (ADR-0036) so
// the reconstruction math can be unit-tested without a canvas. engine.ts owns
// all mutable state (the tunables behind setSimplifyParams, the raw/kept
// counters) and passes what each function needs as arguments; everything here
// is a pure function of its inputs.
//
// The problem these functions solve: the live draw records one midpoint-smoothed
// quadratic per pointermove frame, so a stroke's stored ops hold hundreds of
// near-collinear samples that undo/resize would re-stroke one by one. At commit
// each continuous run of one finger's ops is reduced to far fewer segments that
// rebuild visually identical ink. Two reconstruction pipelines exist:
//
// - sampleReducedSpans (the shipping 'samples' mode): thin the recovered RAW
//   finger samples and re-apply the live midpoint construction over them — the
//   same curve family the live render drew, so turns, tips, and hold-still
//   corners rebuild exactly.
// - splineReducedSpans (the retired 'spline'/'midpoint' modes, kept for
//   comparison sweeps): fit a corner-aware centripetal Catmull-Rom through
//   derived on-curve points, splitting at sharp corners so round caps stand in
//   for the live per-frame discs.

export type Pt = { x: number; y: number };

// One rendered curve segment: quadratic (control cx/cy) unless c2x/c2y are
// present, then cubic. Matches the segs the engine stores in its path ops.
export interface PathSeg {
  cx: number;
  cy: number;
  x: number;
  y: number;
  c2x?: number;
  c2y?: number;
}

// The geometric slice of a recorded path op — what reconstruction reads and
// produces. The engine's full PathOp (with pid/color/lineWidth/erase) is
// structurally assignable to this.
export interface PathRunGeom {
  startX: number;
  startY: number;
  segs: PathSeg[];
}

// Iterative (stack-based, so a long monotonic stroke can't blow the call stack)
// Douglas–Peucker over point indices. Keeps both endpoints plus every point
// whose perpendicular distance to the current chord exceeds epsilon. `forcedIdx`
// pins extra indices as kept, so simplification recurses within the spans
// between them — used by the 'samples' rebuild to protect a sharp apex and its
// immediate neighbours (whose positions the live curve's bulge geometry depends
// on).
export function rdpKeepIndices(points: Pt[], epsilon: number, forcedIdx?: number[]): number[] {
  if (points.length <= 2) return points.map((_, i) => i);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  if (forcedIdx) for (const i of forcedIdx) keep[i] = 1;
  const stack: [number, number][] = [];
  let prevKept = 0;
  for (let i = 1; i < points.length; i++) {
    if (keep[i]) {
      if (i > prevKept + 1) stack.push([prevKept, i]);
      prevKept = i;
    }
  }
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const ax = points[a].x;
    const ay = points[a].y;
    const dx = points[b].x - ax;
    const dy = points[b].y - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = points[i].x - ax;
      const py = points[i].y - ay;
      const d = len2 === 0 ? Math.hypot(px, py) : Math.abs(px * dy - py * dx) / Math.sqrt(len2);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > epsilon && idx >= 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(i);
  return out;
}

export function rdpSimplify(points: Pt[], epsilon: number, forcedIdx?: number[]): Pt[] {
  return rdpKeepIndices(points, epsilon, forcedIdx).map((i) => points[i]);
}

// A point is a corner when the turn between its adjoining chords is sharper than
// the threshold (dot of unit chords below cornerCos). A zero-length chord (a
// duplicate sample) hides the angle entirely — callers that care about
// duplicates must collapse them first.
export function isCornerAt(prev: Pt, p: Pt, next: Pt, cornerCos: number): boolean {
  const ax = p.x - prev.x;
  const ay = p.y - prev.y;
  const bx = next.x - p.x;
  const by = next.y - p.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-6 || lb < 1e-6) return false;
  return (ax * bx + ay * by) / (la * lb) < cornerCos;
}

// The parameter-midpoint of the live quadratic at sample p (anchors are the
// midpoints to its neighbours, control is p itself): the deepest point the live
// curve actually reaches toward p.
export function liveVertexAt(prev: Pt, p: Pt, next: Pt): Pt {
  return { x: p.x + (prev.x + next.x - 2 * p.x) / 8, y: p.y + (prev.y + next.y - 2 * p.y) / 8 };
}

// Distance from a point to the quadratic through anchors a1→a2 with control c:
// coarse t-sampling to bracket the nearest region, then ternary refinement
// inside the bracket. Plain coarse sampling is NOT enough — on a long span the
// samples sit tens of px apart, so a point lying exactly on the curve can read
// as far away and a keep/drop test built on it cascades into keeping everything.
export function distToQuad(v: Pt, a1: Pt, c: Pt, a2: Pt): number {
  const bx = (t: number) => {
    const u = 1 - t;
    return u * u * a1.x + 2 * u * t * c.x + t * t * a2.x;
  };
  const by = (t: number) => {
    const u = 1 - t;
    return u * u * a1.y + 2 * u * t * c.y + t * t * a2.y;
  };
  const d = (t: number) => Math.hypot(bx(t) - v.x, by(t) - v.y);
  let bestT = 0;
  let best = Infinity;
  for (let s = 0; s <= 16; s++) {
    const t = s / 16;
    const e = d(t);
    if (e < best) {
      best = e;
      bestT = t;
    }
  }
  let lo = Math.max(0, bestT - 1 / 16);
  let hi = Math.min(1, bestT + 1 / 16);
  for (let it = 0; it < 24; it++) {
    const t1 = lo + (hi - lo) / 3;
    const t2 = hi - (hi - lo) / 3;
    if (d(t1) < d(t2)) hi = t2;
    else lo = t1;
  }
  return Math.min(best, d((lo + hi) / 2));
}

// Midpoint quadratics, identical to the live strokeSmoothSegments construction.
export function midpointToSegs(pts: Pt[]): PathSeg[] {
  const segs: PathSeg[] = [];
  let px = pts[0].x;
  let py = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    const { x, y } = pts[i];
    segs.push({ cx: px, cy: py, x: (px + x) / 2, y: (py + y) / 2 });
    px = x;
    py = y;
  }
  return segs;
}

// Recover the ORIGINAL pointer samples a run of path ops was built from. Each
// live segment's control (`s.cx`,`s.cy`) IS a raw finger sample
// (strokeSmoothSegments always uses the previous sample as the control), and the
// final sample — which the live curve never reaches, stopping at its midpoint —
// is the last control reflected through the last anchor.
export function rawSamplesOf(run: PathRunGeom[]): Pt[] {
  const samples: Pt[] = [];
  let lastX = run[0].startX;
  let lastY = run[0].startY;
  for (const op of run)
    for (const s of op.segs) {
      samples.push({ x: s.cx, y: s.cy });
      lastX = s.x;
      lastY = s.y;
    }
  const lastControl = samples[samples.length - 1];
  samples.push({ x: 2 * lastX - lastControl.x, y: 2 * lastY - lastControl.y });
  return samples;
}

// Recover the ON-CURVE polyline a continuous run of one finger's path ops
// actually rendered. The live midpoint smoothing draws each quadratic FROM the
// current on-curve point TO the next anchor (`s.x`,`s.y`), with the raw sample
// (`s.cx`,`s.cy`) as an OFF-curve control the curve only bulges toward. So the
// points the rendered stroke truly passes through are the run's start point and
// each segment's anchor — not the control points. Simplifying must operate on
// these on-curve points and then re-interpolate THROUGH them; feeding the control
// points back through midpoint smoothing double-applies the halving and renders
// the stroke at half length (the classic shrink-on-undo bug). Where a control
// forms a sharp apex between its bracketing anchors (a fast reversal), the apex
// is spliced back in so the rebuilt curve passes through the same tip the user
// saw. Used by the 'spline'/'midpoint' pipelines only.
export function rawPointsOf(run: PathRunGeom[], cornerCos: number): Pt[] {
  const first = run[0];
  const anchors: Pt[] = [{ x: first.startX, y: first.startY }];
  const controls: Pt[] = [];
  for (const op of run)
    for (const s of op.segs) {
      anchors.push({ x: s.x, y: s.y });
      controls.push({ x: s.cx, y: s.cy });
    }
  const pts: Pt[] = [anchors[0]];
  for (let k = 0; k < controls.length; k++) {
    if (isCornerAt(anchors[k], controls[k], anchors[k + 1], cornerCos)) pts.push(controls[k]);
    pts.push(anchors[k + 1]);
  }
  return pts;
}

export interface SampleReduceOptions {
  epsilon: number;
  cornerCos: number;
  reduce: boolean;
}

export interface ReducedRun {
  spans: PathRunGeom[];
  rawCount: number;
  keptCount: number;
}

// Rebuild a run in the SAME curve family the live draw used — midpoint-smoothed
// quadratics over the raw finger samples — rather than re-interpolating a
// different spline through derived on-curve points. Thinning happens in the
// sample domain, with three fidelity anchors that make the rebuilt curve track
// the live one instead of approximating it:
//
// - A sample that forms a sharp turn is pinned along with its two immediate
//   neighbours: the live curve's reach at a turn (the quadratic's bulge toward
//   the apex) is a function of exactly those three sample positions, so keeping
//   them rebuilds the live tip exactly. The final sample's predecessor is pinned
//   too, so the stroke ends at the exact live end anchor.
// - CONSECUTIVE DUPLICATE samples (a finger holding still) collapse to one
//   point, but that point is where the live curve breaks tangent continuity and
//   passes THROUGH the sample — a true corner rendered with full round-cap
//   discs by the per-frame draw. The rebuilt run splits into separate spans
//   there (each landing exactly on the point via a doubled tail sample), so two
//   round caps reproduce the live disc where a merged path would round-join.
// - BULGE REFINEMENT: with sparser neighbours the midpoint construction
//   under-bulges at a kept sample — the quadratic's reach toward it scales with
//   neighbour distance, so a moderate turn (below the corner threshold) on an
//   otherwise straight path can visibly flatten. Wherever the live bulge point
//   (liveVertexAt) would sit more than the RDP epsilon away from the rebuilt
//   quadratic, the sample's original neighbours are re-inserted — which makes
//   the local geometry exact, the same guarantee corner pinning gives — and the
//   check repeats until every kept sample's bulge is within tolerance.
//
// Midpoint smoothing is tangent-continuous for any control sequence, so away
// from duplicate-sample corners the merged span needs no other splitting: there
// is no join anywhere that a live round-cap disc isn't already covered by the
// stroke body.
export function sampleReducedSpans(run: PathRunGeom[], opts: SampleReduceOptions): ReducedRun {
  const samples = rawSamplesOf(run);

  const pts: Pt[] = [];
  const dupCorner = new Set<number>();
  for (const s of samples) {
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(s.x - prev.x) < 1e-3 && Math.abs(s.y - prev.y) < 1e-3)
      dupCorner.add(pts.length - 1);
    else pts.push({ x: s.x, y: s.y });
  }

  const n = pts.length;
  let keptIdx: number[];
  if (!opts.reduce || n <= 3) {
    keptIdx = pts.map((_, i) => i);
  } else {
    const epsilon = opts.epsilon;
    const forced: number[] = [n - 2];
    for (const j of dupCorner) forced.push(Math.max(0, j - 1), j, Math.min(n - 1, j + 1));
    for (let i = 1; i < n - 1; i++)
      if (isCornerAt(pts[i - 1], pts[i], pts[i + 1], opts.cornerCos)) forced.push(i - 1, i, i + 1);
    keptIdx = rdpKeepIndices(pts, epsilon, forced);

    const bulgeTol = epsilon;
    const keep = new Set(keptIdx);
    let changed = true;
    while (changed) {
      changed = false;
      keptIdx = [...keep].sort((a, b) => a - b);
      for (let k = 1; k < keptIdx.length - 1; k++) {
        const i = keptIdx[k];
        if (dupCorner.has(i)) continue;
        const c = pts[i];
        const p = pts[keptIdx[k - 1]];
        const q = pts[keptIdx[k + 1]];
        const v = liveVertexAt(pts[i - 1], c, pts[i + 1]);
        const a1 = { x: (p.x + c.x) / 2, y: (p.y + c.y) / 2 };
        const a2 = { x: (c.x + q.x) / 2, y: (c.y + q.y) / 2 };
        if (distToQuad(v, a1, c, a2) > bulgeTol) {
          if (!keep.has(i - 1)) {
            keep.add(i - 1);
            changed = true;
          }
          if (!keep.has(i + 1)) {
            keep.add(i + 1);
            changed = true;
          }
        }
      }
    }
  }

  const kept = keptIdx.map((i) => pts[i]);

  const spans: PathRunGeom[] = [];
  const emit = (a: number, b: number, endsOnCorner: boolean) => {
    const span = kept.slice(a, b + 1);
    if (endsOnCorner || span.length === 1) span.push(span[span.length - 1]);
    spans.push({
      startX: a === 0 ? run[0].startX : kept[a].x,
      startY: a === 0 ? run[0].startY : kept[a].y,
      segs: midpointToSegs(span),
    });
  };
  let spanStart = 0;
  for (let k = 1; k < keptIdx.length - 1; k++) {
    if (dupCorner.has(keptIdx[k])) {
      emit(spanStart, k, true);
      spanStart = k;
    }
  }
  emit(spanStart, keptIdx.length - 1, false);
  return { spans, rawCount: samples.length, keptCount: keptIdx.length };
}

// Centripetal Catmull-Rom (Barry–Goldman) tangents at p1 and p2 for segment p1→p2.
const CR_ALPHA = 0.5;
function crTangents(p0: Pt, p1: Pt, p2: Pt, p3: Pt) {
  const knot = (a: Pt, b: Pt) => Math.pow(Math.hypot(b.x - a.x, b.y - a.y), CR_ALPHA) || 1e-6;
  const t01 = knot(p0, p1);
  const t12 = knot(p1, p2);
  const t23 = knot(p2, p3);
  return {
    m1x: p2.x - p1.x + t12 * ((p1.x - p0.x) / t01 - (p2.x - p0.x) / (t01 + t12)),
    m1y: p2.y - p1.y + t12 * ((p1.y - p0.y) / t01 - (p2.y - p0.y) / (t01 + t12)),
    m2x: p2.x - p1.x + t12 * ((p3.x - p2.x) / t23 - (p3.x - p1.x) / (t12 + t23)),
    m2y: p2.y - p1.y + t12 * ((p3.y - p2.y) / t23 - (p3.y - p1.y) / (t12 + t23)),
  };
}

// Render the kept points as a curve that passes THROUGH each of them. The live
// draw path uses midpoint-smoothed quadratics with the raw point as a *control*
// (the curve only bulges toward it), which is invisible when points are dense
// but, on RDP-sparse points, falls ~25% short of every turning point — so a
// back-and-forth scribble visibly shrinks at its tips on replay. An interpolating
// spline instead hits every kept point, so tips land exactly.
//
// Smooth spans use a centripetal Catmull-Rom tangent (alpha = 0.5) — RDP leaves
// uneven spacing and uniform CR overshoots there, centripetal never loops. But a
// *sharp* turn (a hook, a zigzag tip) must stay sharp and in place: a smooth
// spline rounds it into a displaced bend (the live render keeps it crisp via its
// dense samples). So at a detected corner the tangent is forced along the
// adjoining chord, giving a sharp, correctly-located corner. `midpoint` mode is
// the legacy/diagnostic construction that re-applies midpoint smoothing — wrong
// for on-curve points (it halves them) but kept for the profiling seam.
export function smoothToSegs(pts: Pt[], cornerCos: number, midpoint: boolean): PathSeg[] {
  if (pts.length < 2) return [];
  if (midpoint) return midpointToSegs(pts);
  // On-curve interpolation must reach the actual endpoint, not the midpoint. Two
  // points = a straight chord (control on the line); midpointToSegs would draw
  // only to the halfway point and shrink the span.
  if (pts.length === 2)
    return [
      { cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2, x: pts[1].x, y: pts[1].y },
    ];
  const n = pts.length;
  // Reflect the endpoints so the first/last segments have a neighbour to take a
  // tangent from (a natural end tangent), keeping all knot intervals non-zero.
  const at = (i: number): Pt =>
    i < 0
      ? { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y }
      : i >= n
        ? { x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y }
        : pts[i];
  const corner: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n - 1; i++) corner[i] = isCornerAt(pts[i - 1], pts[i], pts[i + 1], cornerCos);

  const segs: PathSeg[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const t = crTangents(at(i - 1), p1, p2, at(i + 2));
    // Control leaving p1 / entering p2: chord-aligned at a corner (sharp), else
    // the smooth centripetal tangent. A corner on either end keeps that end crisp.
    const c1x = corner[i] ? p1.x + dx / 3 : p1.x + t.m1x / 3;
    const c1y = corner[i] ? p1.y + dy / 3 : p1.y + t.m1y / 3;
    const c2x = corner[i + 1] ? p2.x - dx / 3 : p2.x - t.m2x / 3;
    const c2y = corner[i + 1] ? p2.y - dy / 3 : p2.y - t.m2y / 3;
    segs.push({ cx: c1x, cy: c1y, c2x, c2y, x: p2.x, y: p2.y });
  }
  return segs;
}

export interface SplineReduceOptions extends SampleReduceOptions {
  midpoint: boolean;
  split: 'none' | 'corner';
}

// The retired 'spline'/'midpoint' reconstruction, kept for comparison sweeps.
// Reduces one continuous, same-style run to one or more spans. With
// split='corner' the kept polyline is cut at each sharp corner into separate
// spans, so every corner is a stroke boundary that renders a round CAP (full
// disc) — matching the live per-frame draw, which also caps at each frame and so
// discs every sharp turn. A single merged span instead round-JOINs the corner,
// shifting it by up to half the brush width. Spans are emitted overlapping
// (shared corner point in both neighbours) so the two caps coincide on the
// corner exactly as the live overlap does.
export function splineReducedSpans(run: PathRunGeom[], opts: SplineReduceOptions): ReducedRun {
  const raw = rawPointsOf(run, opts.cornerCos);
  const kept = opts.reduce ? rdpSimplify(raw, opts.epsilon) : raw.slice();

  const spanFrom = (pts: Pt[]): PathRunGeom => ({
    startX: pts[0].x,
    startY: pts[0].y,
    segs: smoothToSegs(pts, opts.cornerCos, opts.midpoint),
  });

  const result = (spans: PathRunGeom[]): ReducedRun => ({
    spans,
    rawCount: raw.length,
    keptCount: kept.length,
  });

  if (opts.split === 'none' || kept.length < 3) return result([spanFrom(kept)]);

  // Cut at interior corner points; each span shares the corner with its neighbour.
  const spans: PathRunGeom[] = [];
  let start = 0;
  for (let i = 1; i < kept.length - 1; i++) {
    if (isCornerAt(kept[i - 1], kept[i], kept[i + 1], opts.cornerCos)) {
      spans.push(spanFrom(kept.slice(start, i + 1)));
      start = i;
    }
  }
  spans.push(spanFrom(kept.slice(start)));
  return result(spans);
}
