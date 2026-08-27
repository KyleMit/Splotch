// Ambient types for the dev-only engine harness globals that the Playwright
// specs read via page.evaluate(). They're defined in the harness page at
// src/routes/dev/engine/+page.svelte and only ever exist under /dev/engine.
import type { Orientation } from '../src/lib/platform';

export {};

declare global {
  interface Window {
    __engineReady?: boolean;
    // drawStops/strokeEnds count the engine's onDrawStop and onStrokeEnd
    // callbacks, so a spec can assert an event completed a stroke group —
    // or, for an untracked pointer, that it completed nothing.
    __engineState: {
      canUndo: boolean;
      canvasEmpty: boolean;
      drawStops: number;
      strokeEnds: number;
    };
    __engine: {
      setColor(color: string): void;
      setStrokeWidth(width: number): void;
      setEraserMode(active: boolean): void;
      setMagicMode(active: boolean): void;
      setSafeAreaInsets(insets: { top: number; right: number; bottom: number; left: number }): void;
      undo(): Promise<void>;
      clearCanvas(): void;
      isCanvasEmpty(): boolean;
      getUndoDebug(): import('../src/lib/drawing/undoHistory').HistoryDebug;
      setCrayonMode(active: boolean): void;
      setCrayonParams(params: {
        tile?: number;
        octaves?: { cell: number; weight: number }[];
        edge?: number;
        bodyVariation?: number;
        bodyVariationCell?: number;
        shadeVariation?: number;
        colorMix?: number;
        perOpGlazeReturn?: number;
        passes?: { widthScale: number; coverage: number }[];
      }): void;
      // Selects the deposition pipeline for an APPEARANCE sweep. Colour
      // reproduces off-device; frame cost does not (ADR-0148).
      setCrayonDeposition(mode: 'restamp' | 'planes' | 'glaze-direct'): void;
      setScreenAngleOverride(angle: number | null): void;
      remount(): void;
      getViewState(): {
        active: boolean;
        scale: number;
        rotate: 0 | 90 | 180 | 270;
        tx: number;
        ty: number;
        paperCssWidth: number;
        paperCssHeight: number;
        paperOrientation: Orientation;
      };
      inkBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null;
      prepareCanvasExport(
        capturePreview?: boolean
      ): import('../src/lib/drawing/engine').CanvasExportPreparation | null;
      exportCanvasBlob(
        options?: import('../src/lib/drawing/exportDrawing').ExportOptions
      ): Promise<Blob | null>;
      blobRedPixelCount(blob: Blob | null): Promise<number>;
      nonTransparentCount(): number;
      pixelAt(x: number, y: number): number[];
      pixelsIn(x: number, y: number, width: number, height: number): number[];
      resizeTo(w: number, h: number): Promise<void>;
      resumeTo(w: number, h: number): void;
      layoutTo(w: number, h: number): void;
      strokeSync(points: { x: number; y: number }[], pointerType?: string): void;
      multiStrokeSync(
        strokes: { pointerId: number; points: { x: number; y: number }[] }[],
        pointerType?: string
      ): void;
      pointerEventsSync(
        events: {
          type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'pointerout';
          pointerId: number;
          x: number;
          y: number;
          buttons?: number;
        }[],
        pointerType?: string
      ): void;
    };
  }
}
