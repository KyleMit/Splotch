type EndpointRateLimitPolicy = Record<
  | 'verifyAccessCode'
  | 'verifyKey'
  | 'adminLogin'
  | 'report'
  | 'reportImageToken'
  | 'reportImageByok'
  | 'reportImageFree'
  | 'cspReport'
  | 'generateToken'
  | 'generateByok'
  | 'generateFree'
  | 'freeGrantStatus'
  | 'generationResult',
  { limit: number; windowMs: number }
>;

const WINDOW_MS = 60_000;

export const rateLimitPolicy = {
  verifyAccessCode: { limit: 10, windowMs: WINDOW_MS },
  verifyKey: { limit: 10, windowMs: WINDOW_MS },
  adminLogin: { limit: 10, windowMs: WINDOW_MS },
  report: { limit: 5, windowMs: WINDOW_MS },
  reportImageToken: { limit: 3, windowMs: 60 * WINDOW_MS },
  reportImageByok: { limit: 3, windowMs: 60 * WINDOW_MS },
  reportImageFree: { limit: 3, windowMs: 60 * WINDOW_MS },
  cspReport: { limit: 10, windowMs: WINDOW_MS },
  generateToken: { limit: 15, windowMs: WINDOW_MS },
  generateByok: { limit: 30, windowMs: WINDOW_MS },
  generateFree: { limit: 15, windowMs: WINDOW_MS },
  freeGrantStatus: { limit: 30, windowMs: WINDOW_MS },
  // One generation is polled for a couple of minutes at a few seconds apart, and
  // a household can have more than one child drawing at once.
  generationResult: { limit: 120, windowMs: WINDOW_MS },
} satisfies EndpointRateLimitPolicy;
