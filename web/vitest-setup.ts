import { vi } from 'vitest';

// The storage + state layers gate browser-only work behind `browser` from
// `$app/environment`. Under vitest (jsdom) we always want the browser code
// path, so pin it true for every test. Individual tests still control
// localStorage contents and the native/web split (via the platform mock).
vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test',
}));
