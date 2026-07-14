export function createAiPreviewLoader(
  exportDrawing: () => Promise<Blob | null>,
  commit: (blob: Blob, url: string) => void
) {
  let activeLoadId = 0;

  return {
    async load() {
      const loadId = ++activeLoadId;
      const blob = await exportDrawing();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      if (loadId !== activeLoadId) {
        URL.revokeObjectURL(url);
        return;
      }
      commit(blob, url);
    },
    invalidate() {
      activeLoadId++;
    },
  };
}
