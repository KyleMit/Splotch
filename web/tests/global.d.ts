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
      setCrayonMode(active: boolean): void;
      setCrayonParams(params: {
        variant?: string;
        body?: number;
        toothFloor?: number;
        pit?: number;
        bodyThresh?: number;
        grain?: number;
        warp?: number;
      }): void;
      getCrayonParams(): {
        body: number;
        toothFloor: number;
        pit: number;
        bodyThresh: number;
        grain: number;
        warp: number;
      };
      setSafeAreaInsets(insets: { top: number; right: number; bottom: number; left: number }): void;
      undo(): void;
      clearCanvas(): void;
      isCanvasEmpty(): boolean;
      getUndoDebug(): {
        commands: number;
        keyframes: number;
        maxOps: number;
        maxSegments: number;
        totalSegments: number;
        rawPoints: number;
        keptPoints: number;
      };
      setSimplifyParams(params: {
        fraction?: number;
        min?: number;
        max?: number;
        keyframeThreshold?: number;
        cornerAngleDeg?: number;
        mode?: 'midpoint' | 'spline' | 'samples';
        enabled?: boolean;
        reduce?: boolean;
        split?: 'none' | 'corner';
      }): void;
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
