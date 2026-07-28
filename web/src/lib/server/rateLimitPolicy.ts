type EndpointRateLimitPolicy = Record<
  | 'verifyAccessCode'
  | 'verifyKey'
  | 'adminLogin'
  | 'report'
  | 'cspReport'
  | 'generateToken'
  | 'generateByok',
  { limit: number; windowMs: number }
>;

const WINDOW_MS = 60_000;

export const rateLimitPolicy = {
  verifyAccessCode: { limit: 10, windowMs: WINDOW_MS },
  verifyKey: { limit: 10, windowMs: WINDOW_MS },
  adminLogin: { limit: 10, windowMs: WINDOW_MS },
  report: { limit: 5, windowMs: WINDOW_MS },
  cspReport: { limit: 10, windowMs: WINDOW_MS },
  generateToken: { limit: 15, windowMs: WINDOW_MS },
  generateByok: { limit: 30, windowMs: WINDOW_MS },
} satisfies EndpointRateLimitPolicy;
