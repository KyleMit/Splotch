export const UNDO_SCENARIO_KEYS = Object.freeze({
  longSquiggles: 'long-squiggles',
  shortMarks: 'short-marks',
  mixed: 'mixed',
  multiFinger: 'multi-finger',
  scribbles: 'scribbles',
  crayonSquiggles: 'crayon-squiggles',
  crayonScribbles: 'crayon-scribbles',
});

export const ALL_UNDO_SCENARIO_KEYS = Object.freeze(Object.values(UNDO_SCENARIO_KEYS));

// The declared path a scenario exercises when its patches exhaust the resident
// byte budget and demote to blobs (ADR-0082) — the path #635 regressed.
export const COLD_ENCODE_PATH = 'cold-encode';

export const UNDO_SCENARIO_PATHS = Object.freeze({
  [UNDO_SCENARIO_KEYS.longSquiggles]: Object.freeze(['commit', 'undo', 'depth-cap']),
  [UNDO_SCENARIO_KEYS.shortMarks]: Object.freeze(['commit', 'undo', 'depth-cap']),
  [UNDO_SCENARIO_KEYS.mixed]: Object.freeze(['commit', 'undo', 'depth-cap']),
  [UNDO_SCENARIO_KEYS.multiFinger]: Object.freeze([
    'commit',
    'undo',
    'depth-cap',
    'multi-pointer',
    COLD_ENCODE_PATH,
  ]),
  [UNDO_SCENARIO_KEYS.scribbles]: Object.freeze(['commit', 'undo', 'depth-cap']),
  [UNDO_SCENARIO_KEYS.crayonSquiggles]: Object.freeze([
    'commit',
    'undo',
    'depth-cap',
    'crayon-fold',
  ]),
  [UNDO_SCENARIO_KEYS.crayonScribbles]: Object.freeze([
    'commit',
    'undo',
    'depth-cap',
    'crayon-fold',
    'crayon-pass-split',
  ]),
});

export const FAST_UNDO_SCENARIO_KEYS = Object.freeze([
  UNDO_SCENARIO_KEYS.multiFinger,
  UNDO_SCENARIO_KEYS.crayonScribbles,
]);

// The pre-merge structural guard's set (ADR-0100): every scenario declaring the
// cold-encode path, so the run that asserts "no encode on the commit path"
// covers each scenario that can reach it. Derived from the declarations rather
// than listed, so it cannot drift out of step with them the way a second
// hand-kept constant would.
export const ENCODE_PATH_UNDO_SCENARIO_KEYS = Object.freeze(
  ALL_UNDO_SCENARIO_KEYS.filter((key) => UNDO_SCENARIO_PATHS[key].includes(COLD_ENCODE_PATH))
);
