import { join } from 'node:path';
import { ROOT } from '../lib/utils.mjs';

const profileStamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export const profilePath = (...suffixParts) =>
  join(ROOT, 'perf-profiles', [profileStamp(), ...suffixParts].join('-'));

export const throttleTag = (throttle) => (throttle > 1 ? `${throttle}x` : 'raw');
