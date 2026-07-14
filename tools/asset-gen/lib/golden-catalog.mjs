import { scoreCompositeEyes } from './composite-eye.mjs';
import { judgeNightEyes, scoreEyeFill } from './eye-fill.mjs';

export async function scoreGoldenNightEyes(composite, lightRaw, pen, lightEyes, { chalked }) {
  const eyes = judgeNightEyes(await scoreEyeFill(composite, pen), lightEyes, { chalked });
  const orb = chalked ? await scoreCompositeEyes(composite, lightRaw, pen) : null;
  return {
    eyesFailed: eyes.failed,
    orbFailed: orb?.failed ?? null,
    orbMinCoreDark: orb?.pupils.length
      ? Math.min(...orb.pupils.map((pupil) => pupil.coreDarkFrac))
      : null,
    eyesOk: eyes.passes,
    orbOk: orb?.passes ?? null,
  };
}

export const GOLDEN_METRICS = {
  'outline.darkPx': { noise: 0, worse: null },
  'outline.interiorPx': { noise: 15, worse: 'up' },
  'outline.solidPx': { noise: 30, worse: null },
  'outline.biggestBlob': { noise: 15, worse: 'up' },
  'outline.strokeWidth': { noise: 0, worse: null },
  'outline.ringDepth': { noise: 0, worse: 'up' },
  'light.keep': { noise: 0.005, worse: 'down' },
  'light.localKeep': { noise: 0.005, worse: 'down' },
  'light.eyeCores': { noise: 0, worse: null },
  'light.eyeLively': { noise: 0, worse: 'down' },
  'night.drift': { noise: 0.001, worse: 'up' },
  'night.bgLuma': { noise: 3, worse: 'up' },
  'night.lineWhite': { noise: 3, worse: 'down' },
  'night.eyesFailed': { noise: 0, worse: 'up' },
  'night.orbFailed': { noise: 0, worse: 'up' },
  'night.orbMinCoreDark': { noise: 0, worse: 'down' },
};

export const GOLDEN_VERDICTS = [
  'outline.solidOk',
  'outline.ringsOk',
  'light.driftOk',
  'light.eyesOk',
  'night.driftOk',
  'night.moodOk',
  'night.lineOk',
  'night.eyesOk',
  'night.orbOk',
];

const get = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);

export function diffGoldenPage(rel, golden, current, out) {
  for (const path of GOLDEN_VERDICTS) {
    const was = get(golden, path);
    const now = get(current, path);
    if (was === now || was === undefined || now === undefined) continue;
    if (was === null || now === null) {
      out.info.push(`${rel}  ${path} ${was} -> ${now} (scoreability changed)`);
    } else if (was && !now) {
      out.regressions.push(`${rel}  ${path} ok -> FAIL`);
    } else {
      out.improvements.push(`${rel}  ${path} FAIL -> ok`);
    }
  }
  for (const [path, spec] of Object.entries(GOLDEN_METRICS)) {
    const was = get(golden, path);
    const now = get(current, path);
    if (was == null || now == null || was === now) continue;
    const delta = now - was;
    if (Math.abs(delta) <= spec.noise) continue;
    const line = `${rel}  ${path} ${was} -> ${now}`;
    const worse = spec.worse === 'up' ? delta > 0 : spec.worse === 'down' ? delta < 0 : false;
    (worse ? out.regressions : out.info).push(line + (worse ? '' : ' (moved)'));
  }
}
