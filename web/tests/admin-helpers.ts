// The admin key the Playwright web server's env declares (playwright.shared.ts imports it), never a
// real secret. Keep this module free of imports: anything reachable from it is also parsed while
// loading the Playwright config.
export const ADMIN_ACCESS_TOKEN = 'test-admin-secret';
