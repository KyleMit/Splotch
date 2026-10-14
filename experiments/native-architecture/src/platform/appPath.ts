// The native apps always open on the drawing screen; only a browser arrives at another path.
export function isDrawingPath() {
  return true;
}

export function setDocumentTitle(_title: string) {}
