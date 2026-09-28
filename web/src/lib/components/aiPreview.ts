// A preview that never arrives would leave every style button disabled with nothing to say why, so a
// failed export hands off to `fail`, the way generateAiImage closes its own modal on the same failure.
export function createAiPreviewLoader(
  exportDrawing: () => Promise<Blob | null>,
  commit: (blob: Blob) => void,
  fail: () => void
) {
  let activeLoadId = 0;

  return {
    async load() {
      const loadId = ++activeLoadId;
      const blob = await exportDrawing().catch((err: unknown) => {
        console.error('AI preview export failed:', err);
        return null;
      });
      if (loadId !== activeLoadId) return;
      if (blob) commit(blob);
      else fail();
    },
    invalidate() {
      activeLoadId++;
    },
  };
}
