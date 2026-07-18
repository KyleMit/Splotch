<script lang="ts">
  import { onMount } from 'svelte';
  import { renderOp, clearAllOf, type StrokeOp } from '$lib/drawing/strokeOps';
  import { beginCrayonGroup } from '$lib/drawing/crayonGroup';
  import {
    setCrayonParams,
    getCrayonParams,
    DEFAULT_CRAYON_PARAMS,
    type CrayonParams,
  } from '$lib/drawing/crayonTexture';
  import { PAPER_COLORS } from '$lib/theme';

  // The crayon's canonical reference scenes, rendered through the real renderer
  // over the real paper. Kept deterministic (fixed geometry, fixed seed tooth)
  // so the reference/vision-judge loop screenshots the same pixels every run.

  const SIZE = 512;
  let color = $state('#2f6fd0');
  let params = $state<CrayonParams>({ ...DEFAULT_CRAYON_PARAMS });

  type Pt = { x: number; y: number };

  // Emit one path op per point (finest engine granularity, ADR-0004) so that a
  // stroke passing back over itself — or a later stroke over an earlier one —
  // composites as separate source-over layers and builds up, exactly as the live
  // engine does. A single fat path op would union its self-overlap and hide it.
  function stroke(points: Pt[], lineWidth: number, pid = 1): StrokeOp[] {
    if (points.length === 0) return [];
    const ops: StrokeOp[] = [
      {
        kind: 'dot',
        x: points[0].x,
        y: points[0].y,
        radius: lineWidth / 2,
        color,
        erase: false,
        crayon: true,
      },
    ];
    // Batch several points into each path op, the way the engine emits ONE op
    // per pointermove carrying that frame's coalesced samples — so the harness
    // shows the same op-boundary density (and crayon layer seams) the app does,
    // not the finest-possible one-op-per-point granularity.
    const BATCH = 4;
    let px = points[0].x;
    let py = points[0].y;
    let mx = px;
    let my = py;
    for (let i = 1; i < points.length; i += BATCH) {
      const segs = [];
      for (let j = i; j < Math.min(i + BATCH, points.length); j++) {
        const p = points[j];
        const nmx = (px + p.x) / 2;
        const nmy = (py + p.y) / 2;
        segs.push({ cx: px, cy: py, x: nmx, y: nmy });
        px = p.x;
        py = p.y;
      }
      ops.push({
        kind: 'path',
        pid,
        startX: mx,
        startY: my,
        segs,
        color,
        lineWidth,
        erase: false,
        crayon: true,
      });
      mx = segs[segs.length - 1].x;
      my = segs[segs.length - 1].y;
    }
    return ops;
  }

  function sCurve(y: number, amp: number): Pt[] {
    const pts: Pt[] = [];
    for (let x = 56; x <= SIZE - 56; x += 6) {
      pts.push({ x, y: y + Math.sin((x / (SIZE - 112)) * Math.PI * 2) * amp });
    }
    return pts;
  }

  function vertical(x: number): Pt[] {
    const pts: Pt[] = [];
    for (let y = 90; y <= SIZE - 90; y += 6) pts.push({ x, y });
    return pts;
  }

  // A toddler back-and-forth scribble filling a patch — the hardest containment +
  // buildup case (lots of self-overlap at constant hue).
  function scribble(): Pt[] {
    const pts: Pt[] = [];
    const top = 110;
    const bottom = SIZE - 110;
    let down = true;
    for (let x = 120; x <= SIZE - 120; x += 26) {
      if (down) for (let y = top; y <= bottom; y += 8) pts.push({ x: x + (y - top) * 0.05, y });
      else for (let y = bottom; y >= top; y -= 8) pts.push({ x: x + (y - top) * 0.05, y });
      down = !down;
    }
    return pts;
  }

  interface Scene {
    id: string;
    label: string;
    groups: StrokeOp[][];
  }

  function buildScenes(): Scene[] {
    const fat = 44;
    return [
      { id: 'single', label: 'Single stroke', groups: [stroke(sCurve(256, 70), fat)] },
      {
        id: 'buildup',
        label: '1× · 2× · 3× passes (same colour)',
        groups: [
          stroke(vertical(140), fat),
          ...Array.from({ length: 2 }, () => stroke(vertical(256), fat)),
          ...Array.from({ length: 3 }, () => stroke(vertical(372), fat)),
        ],
      },
      { id: 'scribble', label: 'Scribble fill', groups: [stroke(scribble(), 30)] },
    ];
  }

  let paperTexture: HTMLImageElement | null = null;

  function loadPaper(): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        paperTexture = img;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = '/icons/handmade-paper.webp';
    });
  }

  const canvases: Record<string, HTMLCanvasElement> = {};

  function paintPaper(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAPER_COLORS.light;
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (paperTexture) {
      const pattern = ctx.createPattern(paperTexture, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, SIZE, SIZE);
      }
    }
    ctx.restore();
  }

  function renderScene(scene: Scene) {
    const canvas = canvases[scene.id];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Paint the paper into the same canvas so the screenshot is the on-screen
    // composite: crayon source-over paper, valleys revealing the paper grain.
    clearAllOf(ctx);
    paintPaper(ctx);
    // Each group is one stroke (= one tooth layer); bracket it so overlapping
    // groups build up the way the engine composites them (ADR-0065).
    for (const group of scene.groups) {
      beginCrayonGroup(ctx);
      for (const op of group) renderOp(ctx, op);
    }
  }

  let scenes = $state<Scene[]>([]);

  function renderAll() {
    setCrayonParams(params);
    for (const scene of scenes) renderScene(scene);
  }

  function reset() {
    params = { ...DEFAULT_CRAYON_PARAMS };
    renderAll();
  }

  onMount(async () => {
    await loadPaper();
    scenes = buildScenes();
    // Wait a tick so the {#each} canvases are bound before the first paint.
    requestAnimationFrame(() => {
      renderAll();
      (window as unknown as { __crayonHarness: unknown }).__crayonHarness = {
        setParams(p: Partial<CrayonParams>) {
          params = { ...params, ...p };
          renderAll();
        },
        setColor(c: string) {
          color = c;
          renderAll();
        },
        getParams: () => getCrayonParams(),
        sceneIds: () => scenes.map((s) => s.id),
        renderAll,
        ready: true,
      };
    });
  });

  const NUM_FIELDS: { key: keyof CrayonParams; min: number; max: number; step: number }[] = [
    { key: 'floor', min: 0, max: 0.5, step: 0.01 },
    { key: 'peak', min: 0.3, max: 1, step: 0.01 },
    { key: 'edge0', min: 0, max: 1, step: 0.01 },
    { key: 'edge1', min: 0, max: 1, step: 0.01 },
    { key: 'gamma', min: 0.3, max: 2.5, step: 0.05 },
    { key: 'grainPx', min: 1, max: 5, step: 0.5 },
    { key: 'varAmp', min: 0, max: 0.7, step: 0.02 },
    { key: 'varFreq', min: 1, max: 5, step: 1 },
  ];
</script>

<div class="wrap">
  <header>
    <h1>Crayon brush — A/B harness</h1>
    <p>ADR-0065 · tooth-masked source-over crayon over real paper</p>
  </header>

  <div class="controls">
    <label class="color">
      Colour
      <input type="color" bind:value={color} oninput={renderAll} />
    </label>
    {#each NUM_FIELDS as f (f.key)}
      <label>
        <span>{f.key} = {params[f.key]}</span>
        <input
          type="range"
          min={f.min}
          max={f.max}
          step={f.step}
          bind:value={params[f.key]}
          oninput={renderAll}
        />
      </label>
    {/each}
    <button onclick={reset}>Reset to shipped default</button>
  </div>

  <div class="scenes">
    {#each scenes as scene (scene.id)}
      <figure>
        <canvas bind:this={canvases[scene.id]} width={SIZE} height={SIZE} data-scene={scene.id}
        ></canvas>
        <figcaption>{scene.label}</figcaption>
      </figure>
    {/each}
  </div>
</div>

<style>
  .wrap {
    font-family: system-ui, sans-serif;
    padding: 1.5rem;
    color: #222;
    background: #e9e7e2;
    min-height: 100vh;
  }
  header h1 {
    margin: 0;
    font-size: 1.3rem;
  }
  header p {
    margin: 0.2rem 0 1rem;
    color: #666;
    font-size: 0.85rem;
  }
  .controls {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.6rem 1.2rem;
    align-items: center;
    max-width: 1100px;
    margin-bottom: 1.5rem;
  }
  .controls label {
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
    gap: 0.2rem;
  }
  .controls label.color {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
  .controls button {
    padding: 0.5rem 0.8rem;
    border-radius: 0.4rem;
    border: 1px solid #bbb;
    background: #fff;
    cursor: pointer;
  }
  .scenes {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
  }
  figure {
    margin: 0;
  }
  canvas {
    width: 512px;
    height: 512px;
    max-width: 90vw;
    border-radius: 6px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    display: block;
  }
  figcaption {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: #444;
  }
</style>
