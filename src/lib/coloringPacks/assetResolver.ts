const localBookRoots = new Map<string, string>();

function coloringBookId(path: string): string | null {
  const match = /^\/coloring\/([^/]+)\//.exec(path);
  return match?.[1] ?? null;
}

export function setLocalColoringBookRoot(bookId: string, rootUrl: string) {
  localBookRoots.set(bookId, rootUrl.replace(/\/$/, ''));
}

export function clearLocalColoringBookRoots() {
  localBookRoots.clear();
}

export function resolveColoringAssetUrl(path: string): string {
  const bookId = coloringBookId(path);
  if (!bookId) return path;
  const root = localBookRoots.get(bookId);
  if (!root) return path;
  return `${root}/${path.slice(`/coloring/${bookId}/`.length)}`;
}
