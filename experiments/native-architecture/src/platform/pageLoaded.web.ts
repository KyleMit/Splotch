// Resolves once the document's load event has fired: every script, stylesheet and image the first
// paint started, including the lazy chunks requested before it, has arrived.
export function pageLoaded(): Promise<void> {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('load', () => resolve(), { once: true }));
}
