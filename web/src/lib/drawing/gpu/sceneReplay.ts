// Drives a reference scene through one renderer at a realistic frame cadence
// and records what each frame cost.
//
// The batching is the point. A renderer that is handed a whole stroke at once
// measures nothing useful — the engine gets a few pointer moves per presented
// frame (strokeRasterQueue: 1.9–4.2 on the iPad digitiser) and has to turn
// them into ink inside that frame. So the replay hands over POINTS_PER_FRAME
// at a time with a one-point overlap, which is exactly the shape the raster
// queue produces, and each step is one rAF.

import type { CrayonRenderer } from './renderer';
import type { ReferenceScene } from './referenceScene';

// The middle of the measured 1.9–4.2 moves-per-painted-frame band.
const POINTS_PER_FRAME = 3;

export interface FrameSample {
  intervalMs: number;
  cpuMs: number;
}

export interface ReplayStats {
  frames: number;
  drawCalls: number;
  primitives: number;
  primitiveNoun: string;
  cpuMs: Percentiles;
  intervalMs: Percentiles;
  gpuMs: Percentiles | null;
}

export interface Percentiles {
  p50: number;
  p95: number;
  max: number;
}

function percentiles(values: number[]): Percentiles {
  if (values.length === 0) return { p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

interface Batch {
  strokeIndex: number;
  points: Float32Array;
  pointCount: number;
  startsStroke: boolean;
  endsStroke: boolean;
}

// Flatten the scene into the per-frame batches the replay will step through,
// so the stepping loop does no allocation or arithmetic that would land in the
// measured frame.
function planBatches(scene: ReferenceScene): Batch[] {
  const batches: Batch[] = [];
  scene.strokes.forEach((stroke, strokeIndex) => {
    const total = stroke.points.length / 2;
    let cursor = 0;
    let startsStroke = true;
    while (cursor < total - 1) {
      const from = cursor;
      const to = Math.min(total, cursor + POINTS_PER_FRAME + 1);
      batches.push({
        strokeIndex,
        points: stroke.points.slice(from * 2, to * 2),
        pointCount: to - from,
        startsStroke,
        endsStroke: to >= total,
      });
      startsStroke = false;
      cursor = to - 1;
    }
  });
  return batches;
}

export interface TimerQuerySupport {
  ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
}

export class SceneReplay {
  private batches: Batch[];
  private index = 0;
  private cpuSamples: number[] = [];
  private intervalSamples: number[] = [];
  private gpuSamples: number[] = [];
  private lastFrameAt = 0;
  private drawCalls = 0;
  private primitives = 0;
  private pendingQueries: WebGLQuery[] = [];
  private timerExt: TimerQuerySupport['ext'] | null;

  constructor(
    private gl: WebGL2RenderingContext,
    private renderer: CrayonRenderer,
    private scene: ReferenceScene
  ) {
    this.batches = planBatches(scene);
    // Real GPU time when the driver exposes it; otherwise the frame interval
    // carries the signal and gpuMs is reported as unavailable rather than
    // guessed at.
    this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    renderer.clear();
  }

  get done() {
    return this.index >= this.batches.length;
  }

  get progress() {
    return this.batches.length === 0 ? 1 : this.index / this.batches.length;
  }

  step(now: number): void {
    if (this.done) return;
    const batch = this.batches[this.index++];
    const stroke = this.scene.strokes[batch.strokeIndex];

    if (this.lastFrameAt > 0) this.intervalSamples.push(now - this.lastFrameAt);
    this.lastFrameAt = now;

    const query = this.beginTimer();
    const startedAt = performance.now();

    if (batch.startsStroke) this.renderer.beginStroke();
    this.renderer.beginFrame();
    const stats = this.renderer.paint(batch.points, batch.pointCount, {
      color: stroke.color,
      widthPx: stroke.widthPx,
      seed: stroke.seed,
      phase: phaseForSeed(stroke.seed),
    });
    // A stroke's last batch closes its deposition pass inside the same frame
    // it painted, which is where the CPU pipeline's buffered glaze lands.
    if (batch.endsStroke) this.renderer.endStroke();
    this.renderer.endFrame();

    this.cpuSamples.push(performance.now() - startedAt);
    this.drawCalls += stats.drawCalls;
    this.primitives += stats.primitives;
    this.endTimer(query);
    this.collectTimers();
  }

  private beginTimer(): WebGLQuery | null {
    if (!this.timerExt) return null;
    const query = this.gl.createQuery();
    if (!query) return null;
    this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, query);
    return query;
  }

  private endTimer(query: WebGLQuery | null) {
    if (!this.timerExt || !query) return;
    this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
    this.pendingQueries.push(query);
  }

  // Results land some frames later; drain whatever is ready without ever
  // blocking on one, so reading the timer cannot itself become the stall the
  // timer is measuring.
  private collectTimers() {
    if (!this.timerExt) return;
    const { gl } = this;
    const stillPending: WebGLQuery[] = [];
    for (const query of this.pendingQueries) {
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        stillPending.push(query);
        continue;
      }
      if (!gl.getParameter(this.timerExt.GPU_DISJOINT_EXT)) {
        this.gpuSamples.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      }
      gl.deleteQuery(query);
    }
    this.pendingQueries = stillPending;
  }

  stats(): ReplayStats {
    return {
      frames: this.cpuSamples.length,
      drawCalls: this.drawCalls,
      primitives: this.primitives,
      primitiveNoun: this.renderer.primitiveNoun,
      cpuMs: percentiles(this.cpuSamples),
      intervalMs: percentiles(this.intervalSamples),
      gpuMs: this.gpuSamples.length > 0 ? percentiles(this.gpuSamples) : null,
    };
  }
}

// crayonBrush stores a per-op integer seed that only phase-shifts the tooth
// field. Two coprime-ish multipliers keep successive seeds from landing on the
// same lattice row, so a second pass genuinely lands its pits elsewhere.
export function phaseForSeed(seed: number): readonly [number, number] {
  return [(seed * 97) % 251, (seed * 53) % 239];
}
