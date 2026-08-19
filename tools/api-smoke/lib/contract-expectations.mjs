export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers':
    'Content-Type, Authorization, X-Access-Token, X-Api-Key, X-Async-Generation, X-Installation-Id, X-Report-Token',
  // generate-image returns X-Report-Token and report-image consumes it.
  'access-control-expose-headers': 'X-Free-Generations-Remaining, X-Report-Token',
  'access-control-max-age': '86400',
};
