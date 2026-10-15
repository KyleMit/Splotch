// The native apps always open on the drawing screen; only a browser arrives at another path.
export function isDrawingPath() {
  return true;
}

// Answers the title it replaced, so a screen can hand it back.
export function setDocumentTitle(_title: string) {
  return '';
}
