/**
 * What an /api endpoint receives: the slice of SvelteKit's RequestEvent the
 * endpoints read, which apiFunction builds from a Netlify Function's request
 * and context the way adapter-netlify did.
 */
export interface ApiEvent {
  request: Request;
  url: URL;
  getClientAddress: () => string;
  /** The Netlify context; `waitUntil` keeps the function alive for a write the response does not wait on. */
  platform?: { context?: { waitUntil?: (promise: Promise<unknown>) => void } };
}

export type ApiHandler = (event: ApiEvent) => Promise<Response>;
