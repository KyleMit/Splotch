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
      setSafeAreaInsets(insets: { top: number; right: number; bottom: number; left: number }): void;
      // Resolves when the queued restore has settled (a deep entry decodes
      // from its blob asynchronously) — page.evaluate awaits it.
      undo(): Promise<void>;
      clearCanvas(): void;
      isCanvasEmpty(): boolean;
      getUndoDebug(): {
        snapshots: number;
        liveRasters: number;
        blobBytes: number;
        pendingCommands: number;
      };
      setCrayonMode(active: boolean): void;
      setCrayonParams(params: {
        tile?: number;
        octaves?: { cell: number; weight: number }[];
        edge?: number;
        bodyVariation?: number;
        bodyVariationCell?: number;
        shadeVariation?: number;
        colorMix?: number;
        passes?: { widthScale: number; coverage: number }[];
      }): void;
      getCrayonParams(): unknown;
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
        paperOrientation: 'portrait' | 'landscape';
      };
      inkBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null;
      exportCanvasBlob(
        overlayImage?: HTMLImageElement | null,
        options?: { includePaperTexture?: boolean }
      ): Promise<Blob | null>;
      blobRedPixelCount(blob: Blob | null): Promise<number>;
      nonTransparentCount(): number;
      pixelAt(x: number, y: number): number[];
      resizeTo(w: number, h: number): Promise<void>;
      resumeTo(w: number, h: number): void;
      strokeSync(points: { x: number; y: number }[], pointerType?: string): void;
      multiStrokeSync(
        strokes: { pointerId: number; points: { x: number; y: number }[] }[],
        pointerType?: string
      ): void;
    };
  }
}
