export function assertInitialPrerenderBoundary(element: Element): void {
  const first = element.firstChild;
  const last = element.lastChild;
  if (
    first === null ||
    last === null ||
    first === last ||
    first.nodeType !== Node.COMMENT_NODE ||
    last.nodeType !== Node.COMMENT_NODE ||
    first.nodeValue !== '' ||
    last.nodeValue !== ''
  )
    throw new Error('Initial Svelte HTML boundary requires two exact empty Comment children');
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_COMMENT);
  let comment = walker.nextNode();
  while (comment !== null) {
    if (comment !== first && comment !== last && comment.nodeValue === '')
      throw new Error('Initial Svelte HTML boundary has an interior empty Comment');
    comment = walker.nextNode();
  }
}
