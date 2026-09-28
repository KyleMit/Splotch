export function createAiPreviewLoader(
  exportDrawing: () => Promise<Blob | null>,
  commit: (blob: Blob) => void
) {
  let activeLoadId = 0;

  return {
    async load() {
      const loadId = ++activeLoadId;
      const blob = await exportDrawing().catch((err: unknown) => {
        console.error('AI preview export failed:', err);
        return null;
      });
      if (!blob) return;
      if (loadId !== activeLoadId) return;
      commit(blob);
    },
    invalidate() {
      activeLoadId++;
    },
  };
}
