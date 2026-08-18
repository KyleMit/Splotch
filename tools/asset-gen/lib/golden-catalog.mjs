import { scoreCompositeEyes } from './composite-eye.mjs';
import { judgeLightEyes, judgeNightEyes, scoreEyeFill, scoreEyeRings } from './eye-fill.mjs';
import { compositeNight } from './night-composite.mjs';
import {
  DRIFT_THRESHOLD_DEFAULT,
  LINE_WHITE_MIN_DEFAULT,
  NIGHT_BG_LUMA_MAX_DEFAULT,
  scoreNightFillGates,
} from './night-scores.mjs';
import { prepareOutlineAnalysis } from './outline-analysis.mjs';
import { scoreOutlineFrame } from './outline-frame.mjs';
import { KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD, outlineMatch } from './outline-match.mjs';
import { scoreSolidity } from './solid-regions.mjs';
import {
  CHALK_INK_BASELINE_GROWTH_FRACTION,
  CHALK_INK_BASELINE_NOISE_PX,
  prepareChalkInkDiff,
  scoreChalkInkDiff,
} from './chalk-ink-diff.mjs';

const round = (v, digits) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

// Score one page's line art plus its committed raw fills (when present) into
// the shape frozen in golden/golden-scores.json — the shape GOLDEN_METRICS
// and GOLDEN_VERDICTS below address by path. `chalk` is the dark-mode line
// art buffer when the page has forked (see docs/pen-chalk-fork.md), else
// null; check-golden-scores.mjs resolves it from the real catalog layout.
export async function scoreGoldenPage({ page, pen, lightRaw, nightRaw, chalk }) {
  const analysis = await prepareOutlineAnalysis(pen);
  const [solidity, rings, frame] = await Promise.all([
    scoreSolidity(analysis),
    scoreEyeRings(analysis),
    scoreOutlineFrame(analysis),
  ]);
  const entry = {
    outline: {
      darkPx: solidity.darkPx,
      interiorPx: solidity.interiorPx,
      solidPx: solidity.solidPx,
      biggestBlob: solidity.biggestBlob,
      strokeWidth: solidity.strokeWidth,
      ringDepth: rings.maxDepth,
      frameCoverage: round(frame.sideCoverage, 4),
      ghostCoverage: round(frame.ghostCoverage, 4),
      solidOk: solidity.passes,
      ringsOk: rings.passes,
      frameOk: frame.passes,
    },
  };

  if (chalk) {
    const ink = await scoreChalkInkDiff(chalk, await prepareChalkInkDiff(analysis));
    entry.chalk = {
      addedInkPx: ink.addedInkPx,
      solidInkPx: ink.solidInkPx,
      regionsFlagged: ink.absoluteFlaggedRegions.length,
    };
  }

  let lightEyes = null;
  if (lightRaw) {
    const { keep, localKeep, worstTile } = await outlineMatch(pen, lightRaw);
    lightEyes = await scoreEyeFill(lightRaw, pen);
    const lightVerdict = judgeLightEyes(lightEyes, { page });
    entry.light = {
      keep: round(keep, 4),
      localKeep: round(localKeep, 4),
      worstTile: worstTile ? `${worstTile.x},${worstTile.y}` : null,
      eyeCores: lightEyes.cores.length,
      eyeLively: lightEyes.cores.filter((c) => c.lively).length,
      driftOk: keep >= KEEP_THRESHOLD && localKeep >= LOCAL_KEEP_THRESHOLD,
      eyesOk: lightVerdict.gated ? lightVerdict.passes : null,
    };
  }

  if (nightRaw) {
    const source = chalk ?? pen;
    const { drift, night, line } = await scoreNightFillGates(nightRaw, source);
    let eyes = null;
    if (lightEyes) {
      const judged = chalk ? await compositeNight(nightRaw, chalk) : nightRaw;
      eyes = await scoreGoldenNightEyes(judged, lightRaw, pen, lightEyes, {
        chalked: !!chalk,
      });
    }
    entry.night = {
      drift: round(drift.ratio, 5),
      bgLuma: round(night.bgLuma, 1),
      lineWhite: round(line.lineWhite, 1),
      eyesFailed: eyes?.eyesFailed ?? null,
      orbFailed: eyes?.orbFailed ?? null,
      orbMinCoreDark: eyes?.orbMinCoreDark ?? null,
      driftOk: drift.ratio <= DRIFT_THRESHOLD_DEFAULT,
      moodOk: night.bgLuma <= NIGHT_BG_LUMA_MAX_DEFAULT,
      lineOk: line.lineWhite >= LINE_WHITE_MIN_DEFAULT,
      eyesOk: eyes?.eyesOk ?? null,
      orbOk: eyes?.orbOk ?? null,
    };
  }

  return entry;
}

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
  'outline.frameCoverage': { noise: 0.005, worse: 'up' },
  'outline.ghostCoverage': { noise: 0.005, worse: 'up' },
  'chalk.addedInkPx': {
    noise: CHALK_INK_BASELINE_NOISE_PX,
    noiseFraction: CHALK_INK_BASELINE_GROWTH_FRACTION,
    worse: 'up',
  },
  'chalk.solidInkPx': {
    noise: CHALK_INK_BASELINE_NOISE_PX,
    noiseFraction: CHALK_INK_BASELINE_GROWTH_FRACTION,
    worse: 'up',
  },
  'chalk.regionsFlagged': { noise: 0, worse: 'up' },
  'light.keep': { noise: 0.005, worse: 'down' },
  'light.localKeep': { noise: 0.005, worse: 'down' },
  'light.eyeCores': { noise: 0, worse: null },
  'light.eyeLively': { noise: 0, worse: 'down' },
  'night.drift': { noise: 0.001, worse: 'up' },
  'night.bgLuma': { noise: 3, worse: 'up' },
  'night.lineWhite': { noise: 3, worse: 'down' },
  'night.eyesFailed': { noise: 0, worse: 'up' },
  'night.orbFailed': { noise: 0, worse: 'up' },
  // Supporting diagnostic, not a gate. A real blank orb is already caught by the
  // night.orbOk verdict and the night.orbFailed counter; this is the min core-dark
  // fraction across pupils (0.14–0.76 in the catalog, blank threshold 0.07). A
  // legitimate asset change can lower it well clear of the threshold, so gating on
  // any decrease (worse:'down', noise:0) fired false regressions while orbOk stayed
  // true. Report movement as info; let the verdict + counter gate the real failure.
  'night.orbMinCoreDark': { noise: 0.02, worse: null },
};

export const GOLDEN_VERDICTS = [
  'outline.solidOk',
  'outline.ringsOk',
  'outline.frameOk',
  'light.driftOk',
  'light.eyesOk',
  'night.driftOk',
  'night.moodOk',
  'night.lineOk',
  'night.eyesOk',
  'night.orbOk',
];

const get = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);

// undefined means the path itself doesn't resolve (a renamed/dropped leaf in
// the score shape, or a typo in GOLDEN_METRICS/GOLDEN_VERDICTS); null means
// the path resolves to an explicit "not scoreable" value (e.g. orbFailed on
// a non-chalked page). Only fires once the leaf's section (e.g. "night")
// resolves on both sides — a page gaining or losing an entire section (a
// fresh raw fill, or one removed) is ordinary content drift, not shape
// drift, and is reported once per section by sectionPresent below instead.
function missingKeyLine(rel, path, was, now) {
  if (was !== undefined && now !== undefined) return null;
  if (was === undefined && now === undefined) return null;
  return `${rel}  ${path} MISSING from score shape (${was === undefined ? 'golden' : 'current'} side)`;
}

export function diffGoldenPage(rel, golden, current, out) {
  const sectionState = new Map();
  const sectionPresent = (path) => {
    const section = path.split('.')[0];
    if (sectionState.has(section)) return sectionState.get(section);
    const was = golden?.[section];
    const now = current?.[section];
    const present = was !== undefined && now !== undefined;
    if (!present && (was !== undefined || now !== undefined)) {
      out.info.push(
        `${rel}  ${section} section ${was === undefined ? 'added' : 'removed'} (re-freeze to adopt)`
      );
    }
    sectionState.set(section, present);
    return present;
  };

  for (const path of GOLDEN_VERDICTS) {
    if (!sectionPresent(path)) continue;
    const was = get(golden, path);
    const now = get(current, path);
    const missing = missingKeyLine(rel, path, was, now);
    if (missing) {
      out.regressions.push(missing);
      continue;
    }
    if (was === now) continue;
    if (was === null || now === null) {
      out.info.push(`${rel}  ${path} ${was} -> ${now} (scoreability changed)`);
    } else if (was && !now) {
      out.regressions.push(`${rel}  ${path} ok -> FAIL`);
    } else {
      out.improvements.push(`${rel}  ${path} FAIL -> ok`);
    }
  }
  for (const [path, spec] of Object.entries(GOLDEN_METRICS)) {
    if (!sectionPresent(path)) continue;
    const was = get(golden, path);
    const now = get(current, path);
    const missing = missingKeyLine(rel, path, was, now);
    if (missing) {
      out.regressions.push(missing);
      continue;
    }
    if (was == null || now == null || was === now) continue;
    const delta = now - was;
    const noise = Math.max(spec.noise, Math.ceil(Math.abs(was) * (spec.noiseFraction ?? 0)));
    if (Math.abs(delta) <= noise) continue;
    const line = `${rel}  ${path} ${was} -> ${now}`;
    const worse = spec.worse === 'up' ? delta > 0 : spec.worse === 'down' ? delta < 0 : false;
    (worse ? out.regressions : out.info).push(line + (worse ? '' : ' (moved)'));
  }
}
