// Ambient types for the dev-only engine harness globals that the Playwright
// specs read via page.evaluate(). They're defined in the harness page at
// src/routes/dev/engine/+page.svelte and only ever exist under /dev/engine.
export {};

declare global {
  interface Window {
    __engineReady?: boolean;
    __engineState: { canUndo: boolean; canvasEmpty: boolean };
    __engine: {
      setColor(color: string): void;
      setStrokeWidth(width: number): void;
      setEraserMode(active: boolean): void;
      undo(): void;
      clearCanvas(): void;
      isCanvasEmpty(): boolean;
      exportCanvasBlob(
        overlayImage?: HTMLImageElement | null,
        options?: { includePaperTexture?: boolean }
      ): Promise<Blob | null>;
      blobRedPixelCount(blob: Blob | null): Promise<number>;
      nonTransparentCount(): number;
      pixelAt(x: number, y: number): number[];
      resizeTo(w: number, h: number): void;
      strokeSync(points: { x: number; y: number }[], pointerType?: string): void;
      multiStrokeSync(
        strokes: { pointerId: number; points: { x: number; y: number }[] }[],
        pointerType?: string
      ): void;
    };
  }
}
