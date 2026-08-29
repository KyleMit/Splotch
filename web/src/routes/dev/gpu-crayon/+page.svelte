<script lang="ts">
  import { onMount } from 'svelte';
  import { InkTarget } from '$lib/drawing/gpu/inkTarget';
  import { DETAIL_CROP, REFERENCE_SCENE } from '$lib/drawing/gpu/referenceScene';
  import type { CrayonRenderer } from '$lib/drawing/gpu/renderer';
  import { createCialloRenderer } from '$lib/drawing/gpu/renderers/cialloRenderer';
  import { createCpuRenderer } from '$lib/drawing/gpu/renderers/cpuRenderer';
  import { createSdfRenderer } from '$lib/drawing/gpu/renderers/sdfRenderer';
  import { createStampRenderer } from '$lib/drawing/gpu/renderers/stampRenderer';
  import { SceneReplay, phaseForSeed, type ReplayStats } from '$lib/drawing/gpu/sceneReplay';
  import { createToothTexture } from '$lib/drawing/gpu/toothTexture';

  const scene = REFERENCE_SCENE;
  const paperCss = `rgb(${scene.paper.map((c) => Math.round(c * 255)).join(' ')})`;

  let glCanvasEl: HTMLCanvasElement;
  let cpuCanvasEl: HTMLCanvasElement;
  let error = $state<string | null>(null);
  let activeId = $state('cpu');
  let statsById = $state<Record<string, ReplayStats | null>>({});
  let running = $state(false);
  let renderers: CrayonRenderer[] = $state([]);

  const activeRenderer = $derived(renderers.find((r) => r.id === activeId) ?? null);
  const activeStats = $derived(statsById[activeId] ?? null);

  const FREE_DRAW_COLOR = '#AB71E1';
  const FREE_DRAW_WIDTH_PX = 46;

  onMount(() => {
    const gl = glCanvasEl.getContext('webgl2', {
      alpha: false,
      antialias: false,
      // The ink texture is the source of truth across frames, so the drawing
      // buffer itself never needs preserving — present redraws it every frame.
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      error = 'WebGL2 is unavailable in this browser.';
      return;
    }

    let built: CrayonRenderer[];
    let ink: InkTarget;
    try {
      const tooth = createToothTexture(gl);
      const resolution = [scene.width, scene.height] as const;
      ink = new InkTarget(gl, scene.width, scene.height, scene.paper);
      built = [
        createCpuRenderer(cpuCanvasEl),
        createStampRenderer(gl, tooth, resolution, ink),
        createCialloRenderer(gl, tooth, resolution, ink),
        createSdfRenderer(gl, tooth, resolution, ink),
      ];
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      return;
    }
    renderers = built;
    const rendererFor = (id: string) => built.find((r) => r.id === id) ?? null;

    function run(id: string): Promise<ReplayStats> {
      const renderer = rendererFor(id);
      if (!renderer) return Promise.reject(new Error(`no renderer ${id}`));
      activeId = id;
      running = true;
      const replay = new SceneReplay(gl!, renderer, scene);
      return new Promise((resolve) => {
        function frame(now: number) {
          replay.step(now);
          if (replay.done) {
            running = false;
            const stats = replay.stats();
            statsById = { ...statsById, [id]: stats };
            resolve(stats);
            return;
          }
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    }

    // Free drawing, so the harness answers "how does it feel" and not only
    // "what does the replay measure". Points are queued and flushed once per
    // frame, the same shape strokeRasterQueue gives the production engine.
    let pending: number[] = [];
    let drawing = false;
    let flushQueued = false;

    function flush() {
      flushQueued = false;
      const renderer = rendererFor(activeId);
      if (!renderer || pending.length < 4) return;
      renderer.beginFrame();
      renderer.paint(new Float32Array(pending), pending.length / 2, {
        color: FREE_DRAW_COLOR,
        widthPx: FREE_DRAW_WIDTH_PX,
        seed: 1,
        phase: phaseForSeed(1),
      });
      renderer.endFrame();
      pending = pending.slice(-2);
    }

    function queueFlush() {
      if (flushQueued) return;
      flushQueued = true;
      requestAnimationFrame(flush);
    }

    function toPaper(event: PointerEvent, target: HTMLCanvasElement): [number, number] {
      const rect = target.getBoundingClientRect();
      return [
        ((event.clientX - rect.left) / rect.width) * scene.width,
        ((event.clientY - rect.top) / rect.height) * scene.height,
      ];
    }

    function onPointerDown(event: PointerEvent) {
      if (running) return;
      const target = event.currentTarget as HTMLCanvasElement;
      drawing = true;
      target.setPointerCapture(event.pointerId);
      rendererFor(activeId)?.beginStroke();
      pending = toPaper(event, target);
    }
    function onPointerMove(event: PointerEvent) {
      if (!drawing) return;
      const target = event.currentTarget as HTMLCanvasElement;
      for (const coalesced of event.getCoalescedEvents?.() ?? [event]) {
        pending.push(...toPaper(coalesced, target));
      }
      queueFlush();
    }
    function onPointerUp(event: PointerEvent) {
      if (!drawing) return;
      const target = event.currentTarget as HTMLCanvasElement;
      drawing = false;
      flush();
      rendererFor(activeId)?.endStroke();
      pending = [];
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    }

    const surfaces = [glCanvasEl, cpuCanvasEl];
    for (const surface of surfaces) {
      surface.addEventListener('pointerdown', onPointerDown);
      surface.addEventListener('pointermove', onPointerMove);
      surface.addEventListener('pointerup', onPointerUp);
      surface.addEventListener('pointercancel', onPointerUp);
    }

    // The capture script drives these; nothing in the harness UI depends on them.
    window.__gpuCrayon = {
      renderers: built.map((r) => ({ id: r.id, label: r.label, blurb: r.blurb })),
      run,
      clear: () => rendererFor(activeId)?.clear(),
      scene: { width: scene.width, height: scene.height },
      detailCrop: DETAIL_CROP,
    };

    void run(activeId);

    return () => {
      for (const surface of surfaces) {
        surface.removeEventListener('pointerdown', onPointerDown);
        surface.removeEventListener('pointermove', onPointerMove);
        surface.removeEventListener('pointerup', onPointerUp);
        surface.removeEventListener('pointercancel', onPointerUp);
      }
      for (const renderer of built) renderer.dispose();
      ink.dispose();
      delete window.__gpuCrayon;
    };
  });

  function format(value: number) {
    return value >= 10 ? value.toFixed(1) : value.toFixed(2);
  }
</script>

<svelte:head><title>GPU crayon spike</title></svelte:head>

<main>
  <header>
    <h1>GPU crayon</h1>
    <p>
      Three GPU geometry strategies against the shipping CPU crayon. All three share one wax model —
      the paper-tooth field, threshold and shade shift ported verbatim from
      <code>crayonBrush.ts</code>, composited with <code>gl.MIN</code> — so they differ only in how a
      fragment's coverage is decided. Draw on the canvas to feel it; the numbers are the scripted replay.
    </p>
  </header>

  {#if error}
    <p class="error" data-testid="gpu-crayon-error">{error}</p>
  {/if}

  <div class="options" role="radiogroup" aria-label="Renderer">
    {#each renderers as renderer (renderer.id)}
      <button
        type="button"
        role="radio"
        aria-checked={renderer.id === activeId}
        class:selected={renderer.id === activeId}
        disabled={running}
        onclick={() => (activeId = renderer.id)}
      >
        <strong>{renderer.label}</strong>
        <span>{renderer.blurb}</span>
      </button>
    {/each}
  </div>

  <div class="stage" style:width="{scene.width}px" style:height="{scene.height}px">
    <!-- The GPU options paint the paper into their own texture; the CPU one is
         transparent over a paper background, which is production's stack. -->
    <canvas
      bind:this={glCanvasEl}
      width={scene.width}
      height={scene.height}
      hidden={activeId === 'cpu'}
      data-active-canvas={activeId === 'cpu' ? undefined : ''}
    ></canvas>
    <canvas
      bind:this={cpuCanvasEl}
      width={scene.width}
      height={scene.height}
      style:background={paperCss}
      hidden={activeId !== 'cpu'}
      data-active-canvas={activeId === 'cpu' ? '' : undefined}
    ></canvas>
    {#each scene.labels as label (label.text)}
      <span class="band-label" style:left="{label.x}px" style:top="{label.y}px">{label.text}</span>
    {/each}
  </div>

  <div class="controls">
    <button type="button" disabled={running} onclick={() => window.__gpuCrayon?.run(activeId)}>
      Replay scene
    </button>
    <button type="button" disabled={running} onclick={() => window.__gpuCrayon?.clear()}>
      Clear
    </button>
    {#if running}<span class="running">running…</span>{/if}
  </div>

  {#if activeStats}
    <table data-testid="gpu-crayon-stats">
      <caption>{activeRenderer?.label} — {activeStats.frames} frames</caption>
      <thead>
        <tr><th>metric</th><th>p50</th><th>p95</th><th>max</th></tr>
      </thead>
      <tbody>
        <tr>
          <th>JS per frame (ms)</th>
          <td>{format(activeStats.cpuMs.p50)}</td>
          <td>{format(activeStats.cpuMs.p95)}</td>
          <td>{format(activeStats.cpuMs.max)}</td>
        </tr>
        {#if activeStats.gpuMs}
          <tr>
            <th>GPU per frame (ms)</th>
            <td>{format(activeStats.gpuMs.p50)}</td>
            <td>{format(activeStats.gpuMs.p95)}</td>
            <td>{format(activeStats.gpuMs.max)}</td>
          </tr>
        {/if}
        <tr>
          <th>frame interval (ms)</th>
          <td>{format(activeStats.intervalMs.p50)}</td>
          <td>{format(activeStats.intervalMs.p95)}</td>
          <td>{format(activeStats.intervalMs.max)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4">
            {activeStats.drawCalls} draw calls · {activeStats.primitives}
            {activeStats.primitiveNoun}
            {#if !activeStats.gpuMs}· GPU timer queries unavailable on this driver{/if}
          </td>
        </tr>
      </tfoot>
    </table>
  {/if}
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    color: #1c1b22;
    background: #f4f2ee;
    min-height: 100vh;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }
  header p {
    margin: 0;
    max-width: 78ch;
    line-height: 1.5;
    color: #4a4753;
  }
  code {
    background: #e6e3dd;
    padding: 1px 4px;
    border-radius: 3px;
  }
  .error {
    color: #a3231e;
    font-weight: 600;
  }
  .options {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .options button {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
    text-align: left;
    width: 268px;
    padding: 10px 12px;
    border: 2px solid #d8d4cc;
    border-radius: 10px;
    background: #fcfbf8;
    cursor: pointer;
    font: inherit;
  }
  .options button.selected {
    border-color: #6b5ce7;
    box-shadow: 0 0 0 3px rgba(107, 92, 231, 0.15);
  }
  .options button span {
    font-size: 12px;
    line-height: 1.4;
    color: #5c5867;
  }
  .stage {
    position: relative;
  }
  canvas {
    position: absolute;
    inset: 0;
    display: block;
    border-radius: 10px;
    box-shadow: 0 2px 14px rgba(93, 84, 68, 0.18);
    touch-action: none;
    cursor: crosshair;
  }
  canvas[hidden] {
    display: none;
  }
  .band-label {
    position: absolute;
    font-size: 12px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #8d8798;
    pointer-events: none;
  }
  .controls {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .controls button {
    font: inherit;
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid #cbc6bd;
    background: #fcfbf8;
    cursor: pointer;
  }
  .running {
    color: #6b5ce7;
    font-size: 13px;
  }
  table {
    border-collapse: collapse;
    font-size: 13px;
    background: #fcfbf8;
    border: 1px solid #ddd9d1;
    border-radius: 8px;
    overflow: hidden;
  }
  caption {
    text-align: left;
    padding: 8px 12px;
    font-weight: 600;
  }
  th,
  td {
    padding: 5px 14px;
    text-align: right;
    border-top: 1px solid #eae7e0;
  }
  thead th,
  tbody th {
    text-align: left;
    font-weight: 500;
    color: #5c5867;
  }
  tfoot td {
    text-align: left;
    color: #77727f;
    font-size: 12px;
  }
</style>
