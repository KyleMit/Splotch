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

export const UNDO_SCENARIO_PATHS = Object.freeze({
  [UNDO_SCENARIO_KEYS.longSquiggles]: Object.freeze(['commit', 'undo', 'depth-cap']),
  [UNDO_SCENARIO_KEYS.shortMarks]: Object.freeze(['commit', 'undo', 'depth-cap']),
  [UNDO_SCENARIO_KEYS.mixed]: Object.freeze(['commit', 'undo', 'depth-cap']),
  [UNDO_SCENARIO_KEYS.multiFinger]: Object.freeze([
    'commit',
    'undo',
    'depth-cap',
    'multi-pointer',
    'cold-encode',
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
