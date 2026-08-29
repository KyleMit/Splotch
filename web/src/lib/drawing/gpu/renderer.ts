// The contract every option in the harness implements, GPU or not.
//
// The CPU baseline is in here for the same reason the scene is fixed: "is the
// GPU crayon viable" is a question about the crayon Splotch already ships, so
// the shipping pipeline has to draw the same strokes through the same replay,
// on the same frame cadence, and be timed by the same clock. A renderer owns
// its own canvas and its own frame boundaries; the replay only decides what
// points arrive when.

export interface StrokeStyle {
  color: string;
  // Full stroke width in paper pixels, as the engine's lineWidth is.
  widthPx: number;
  // Phase-shifts the tooth field, exactly as crayonBrush's per-op integer seed
  // does. Equal seeds must produce equal pixels; different seeds must fill in
  // each other's tooth.
  phase: readonly [number, number];
  // The seed itself, for the CPU baseline — it records a seed on the op rather
  // than taking a phase, and derives the phase from it internally.
  seed: number;
}

export interface PaintStats {
  drawCalls: number;
  primitives: number;
}

export interface CrayonRenderer {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  // What one primitive is for this algorithm, for the harness HUD.
  readonly primitiveNoun: string;
  // The element this renderer draws into. The harness shows whichever belongs
  // to the active option and the capture script screenshots it.
  readonly canvas: HTMLCanvasElement;

  clear(): void;
  // A stroke arrives one frame's worth of points at a time, so an algorithm
  // that carries state between batches (the stamped option's leftover
  // arclength, the analytic option's retained tail) needs to know where a
  // stroke starts. The stateless options implement it as a no-op.
  beginStroke(): void;
  // A stroke ENDS too: the CPU pipeline closes its deposition pass here, which
  // is where a buffered glaze actually reaches the target.
  endStroke(): void;
  beginFrame(): void;
  paint(points: Float32Array, pointCount: number, style: StrokeStyle): PaintStats;
  endFrame(): void;
  dispose(): void;
}
